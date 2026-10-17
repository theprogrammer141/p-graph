import crypto from "node:crypto";

export interface AgentCredentialPayload {
  analysisId: string;
  orgId: string;
  iat: number;
  exp: number;
}

function getSigningKey(): string {
  const secret =
    process.env.AGENT_SIGNING_SECRET ||
    process.env.CLERK_SECRET_KEY ||
    process.env.SUPABASE_SECRET_KEY;
  if (!secret) {
    throw new Error(
      "Missing server secret for signing agent credentials. Set AGENT_SIGNING_SECRET, CLERK_SECRET_KEY, or SUPABASE_SECRET_KEY."
    );
  }
  return secret;
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str).toString("base64url");
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, "base64url").toString("utf-8");
}

/**
 * Mints a short-lived signed credential naming exactly one analysis and the organization it belongs to.
 * Default lifetime: 600 seconds (10 minutes).
 */
export function mintAgentCredential({
  analysisId,
  orgId,
  expiresInSeconds = 600,
}: {
  analysisId: string;
  orgId: string;
  expiresInSeconds?: number;
}): string {
  if (!analysisId || !orgId) {
    throw new Error("Both analysisId and orgId are required to mint an agent credential.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload: AgentCredentialPayload = {
    analysisId,
    orgId,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const dataToSign = `${headerB64}.${payloadB64}`;

  const signature = crypto
    .createHmac("sha256", getSigningKey())
    .update(dataToSign)
    .digest("base64url");

  return `${dataToSign}.${signature}`;
}

/**
 * Verifies a signed agent credential and returns its scoped analysisId and orgId.
 * Throws an error if invalid, tampered with, or expired.
 */
export function verifyAgentCredential(token: string): { analysisId: string; orgId: string } {
  if (!token || typeof token !== "string") {
    throw new Error("Missing or invalid agent credential token.");
  }

  const parts = token.trim().split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed agent credential token.");
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const dataToSign = `${headerB64}.${payloadB64}`;

  const expectedSignature = crypto
    .createHmac("sha256", getSigningKey())
    .update(dataToSign)
    .digest("base64url");

  const sigBuffer = Buffer.from(signatureB64);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid agent credential signature.");
  }

  let payload: AgentCredentialPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch {
    throw new Error("Invalid agent credential payload.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || now > payload.exp) {
    throw new Error("Agent credential has expired.");
  }

  if (!payload.analysisId || !payload.orgId) {
    throw new Error("Agent credential missing required claims (analysisId, orgId).");
  }

  return {
    analysisId: payload.analysisId,
    orgId: payload.orgId,
  };
}

/**
 * Extracts and verifies the agent credential from HTTP Request headers.
 * Accepts Authorization: Bearer <token> or X-PGraph-Token: <token>.
 */
export function extractAgentCredential(req: Request): { analysisId: string; orgId: string } {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  const pgraphTokenHeader = req.headers.get("x-pgraph-token");

  let token: string | null = null;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (pgraphTokenHeader) {
    token = pgraphTokenHeader.trim();
  }

  if (!token) {
    throw new Error("Missing agent authorization credential in request headers.");
  }

  return verifyAgentCredential(token);
}
