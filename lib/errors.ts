/**
 * An error whose message is safe to display directly to end-users.
 * Use this when validation fails or when a domain rule is violated.
 */
export class UserFacingError extends Error {
  readonly isUserFacing = true;
  readonly code?: string;

  constructor(message: string, options?: { code?: string; cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = "UserFacingError";
    this.code = options?.code;
  }
}

/**
 * Checks whether an error is marked safe for user presentation.
 */
export function isUserFacingError(error: unknown): error is UserFacingError {
  return (
    error instanceof UserFacingError ||
    (typeof error === "object" &&
      error !== null &&
      "isUserFacing" in error &&
      (error as { isUserFacing: boolean }).isUserFacing === true)
  );
}

/**
 * Generates a short, opaque correlation ID for tracking server-side errors without leaking details.
 * Universal across browser and Node.js environments.
 */
function generateErrorRef(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return globalThis.crypto.randomUUID().slice(0, 6);
    }
  } catch {
    // fallback below
  }
  return Math.random().toString(36).slice(2, 8);
}

const SAFE_STRUCTURED_ERROR_CODES: Readonly<Record<string, string>> = {
  "429": "Request limit exceeded. Please wait a moment and try again.",
};

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    if ("code" in error && typeof (error as { code?: unknown }).code === "string") {
      const code = (error as { code: string }).code.trim();
      if (code) {
        return SAFE_STRUCTURED_ERROR_CODES[code] ?? "";
      }
    }
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return "";
}

function formatErrorDiagnostic(error: unknown): string {
  if (error instanceof Error) {
    const cause =
      error.cause instanceof Error
        ? ` | cause: ${error.cause.message}`
        : typeof error.cause === "string"
        ? ` | cause: ${error.cause}`
        : "";
    const stack = error.stack ? `\n${error.stack}` : "";
    return `${error.name}: ${error.message}${cause}${stack}`;
  }
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const rec = error as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof rec.message === "string" && rec.message) parts.push(rec.message);
    if (typeof rec.code === "string" && rec.code) parts.push(`code=${rec.code}`);
    if (typeof rec.details === "string" && rec.details) {
      parts.push(rec.details.split("\n")[0]);
    }
    if (typeof rec.hint === "string" && rec.hint) parts.push(`hint=${rec.hint}`);
    if (parts.length > 0) return parts.join(" | ");
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

/**
 * Logs technical error diagnostics to the server output with a correlation reference.
 * Uses stderr on Node so handled RSC errors do not trigger the Next.js browser console.error overlay.
 */
export function logServerError(context: string, error: unknown, refId?: string): void {
  const prefix = refId ? `[p-graph][error][ref:${refId}]` : "[p-graph][error]";
  const diagnostic = formatErrorDiagnostic(error);
  if (typeof window === "undefined" && typeof process !== "undefined" && process.stderr?.write) {
    process.stderr.write(`${prefix} in ${context}: ${diagnostic}\n`);
    return;
  }
  console.warn(`${prefix} in ${context}: ${diagnostic}`);
}

const SENSITIVE_PATTERNS = [
  // Database / PostgREST internals
  /\b(relation|table|column|database|schema)\s+["'`]?\w+["'`]?/i,
  /\b(pg_|postgres|postgrest|supabase_admin|supabase_auth)\b/i,
  /\b(syntax error|violates foreign key|violates unique constraint|violates check constraint)\b/i,
  /\b(duplicate key value|null value in column)\b/i,
  /\b(PGRST\d{3}|42P\d{2}|23505|23503)\b/,
  // Network / Runtime internals
  /\b(typeerror|fetch failed|enotfound|econnrefused|etimedout|getaddrinfo)\b/i,
  // Auth / Keys / Environment
  /\b(jwt|bearer|signature|secret|token|apikey|api_key|password)\b/i,
  /\b(NEXT_PUBLIC_|SUPABASE_|CLERK_|OPENAI_|OPENROUTER_|GROQ_|LANGSMITH_)\w*/,
  // System / Filesystem paths
  /(?:\/[a-zA-Z0-9_.-]+){3,}/,
  // Trace / Stack signatures
  /\bat\s+.+\(.*:\d+:\d+\)/,
  /\bat\s+[a-zA-Z0-9_.-]+:\d+:\d+/,
];

/**
 * Tests whether an error string contains sensitive technical details that should not be shown.
 */
function containsSensitiveInfo(message: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(message));
}

export interface UserFacingResult {
  message: string;
  refId?: string;
  code?: string;
}

/**
 * Translates any error into a safe, human-readable user message.
 * Internal details are logged on the server and replaced by an opaque reference ID.
 */
export function toUserFacingMessage(
  error: unknown,
  fallbackMessage = "An unexpected error occurred. Please try again.",
  context = "system",
): UserFacingResult {
  if (isUserFacingError(error)) {
    return {
      message: error.message,
      code: error.code,
    };
  }

  const rawMessage = extractErrorMessage(error);

  // Common user-safe operational errors with friendly explanations
  if (rawMessage) {
    const lower = rawMessage.toLowerCase();

    if (lower.includes("not found or is private") || lower.includes("repository not found")) {
      return {
        message: "Repository not found or is private. Make sure the repository is public and accessible.",
      };
    }

    if (lower.includes("invalid github repository url") || lower.includes("expected format: https://github.com/")) {
      return {
        message: "Invalid GitHub repository URL. Expected format: https://github.com/owner/repository",
      };
    }

    if (lower.includes("exceeds the 100 mib download limit") || lower.includes("exceeds extraction limits")) {
      return {
        message: "The repository archive exceeds size limits (100 MiB download or 500 MiB extracted).",
      };
    }

    if (lower.includes("organization required")) {
      return {
        message: "Organization required. Please select an organization in the header switcher.",
      };
    }

    if (lower.includes("rate limit") || lower.includes("429")) {
      return {
        message: "Request limit exceeded. Please wait a moment and try again.",
      };
    }

    if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("aborterror")) {
      return {
        message: "The request timed out. Please try again in a few moments.",
      };
    }

    // Check if the message is already safe and simple (no sensitive patterns, single clean sentence)
    if (!containsSensitiveInfo(rawMessage) && rawMessage.length < 120 && !rawMessage.includes("\n")) {
      return { message: rawMessage };
    }
  }

  // Sensitive or unknown internal error: log server-side and produce reference ID
  const refId = generateErrorRef();
  logServerError(context, error, refId);

  return {
    message: `${fallbackMessage} (Error ref: ${refId})`,
    refId,
  };
}
