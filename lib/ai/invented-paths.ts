/**
 * Deterministic invented-path evaluation.
 *
 * Constraints:
 * - Deterministic code, not a model grading a model.
 * - Exact set membership: any path-shaped token not in the exact set of paths
 *   the model was shown was invented.
 */

const KNOWN_FILE_EXTENSIONS = new Set([
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "json",
  "css",
  "scss",
  "html",
  "md",
  "sql",
  "yaml",
  "yml",
  "py",
  "go",
  "rs",
  "java",
]);

/**
 * Common standalone ".js" / ".ts" runtime and library names that appear in architectural prose
 * and should not be treated as repository file paths when they lack a directory separator.
 */
const STANDALONE_TECH_NAMES = new Set([
  "node.js",
  "express.js",
  "next.js",
  "react.js",
  "vue.js",
  "nuxt.js",
  "nest.js",
  "nestjs.js",
  "angular.js",
  "svelte.js",
  "solid.js",
  "preact.js",
  "remix.js",
  "gatsby.js",
  "astro.js",
  "vite.js",
  "webpack.js",
  "rollup.js",
  "parcel.js",
  "esbuild.js",
  "bun.js",
  "deno.js",
  "electron.js",
  "nw.js",
  "passport.js",
  "morgan.js",
  "winston.js",
  "pino.js",
  "prisma.js",
  "sequelize.js",
  "mongoose.js",
  "knex.js",
  "typeorm.js",
  "bull.js",
  "bullmq.js",
  "socket.io",
  "three.js",
  "chart.js",
  "d3.js",
  "moment.js",
  "day.js",
  "dayjs.js",
  "lodash.js",
  "axios.js",
  "jest.js",
  "mocha.js",
  "chai.js",
  "cypress.js",
  "playwright.js",
]);

const KNOWN_DIRECTORY_PREFIX_REGEX =
  /^(src|app|lib|pages|components|utils|controllers|models|services|routes|middlewares?|config|hooks|repositories|types|styles|assets|scripts|supabase|prisma|public|bin|tests?|__tests__)\//;

export interface InventedPathsResult {
  readonly valid: boolean;
  readonly score: number; // 1.0 if clean, 0.0 if any path was invented
  readonly pathAccuracy: number; // ratio of valid paths to total extracted paths (0.0 to 1.0)
  readonly extractedPaths: readonly string[];
  readonly shownPaths: readonly string[];
  readonly inventedPaths: readonly string[];
  readonly details: {
    readonly totalExtracted: number;
    readonly totalShown: number;
    readonly validCount: number;
    readonly inventedCount: number;
  };
}

/**
 * Strips surrounding quotes, brackets, Markdown emphasis (*, _, ~), and trailing prose punctuation.
 */
function stripTokenPunctuation(raw: string): string {
  return raw
    .trim()
    .replace(/^[("'{[`<*_~]+/g, "")
    .replace(/[),.:;!?'"}>\]`*_~]+$/g, "")
    .trim();
}

/**
 * Normalizes a path string: strips surrounding punctuation, converts backslashes,
 * collapses duplicate slashes, and removes leading ./ or / and trailing /.
 */
export function normalizePath(raw: string): string {
  const cleaned = stripTokenPunctuation(raw)
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^(\.\/)+/, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .trim();

  return cleaned === "." ? "" : cleaned;
}

/**
 * Checks whether a token is shaped like a file or directory path.
 */
export function isPathShaped(token: string): boolean {
  const clean = stripTokenPunctuation(token).replace(/\\/g, "/");

  if (!clean || clean.length < 3) return false;
  if (/^(https?|wss?|ftp):\/\/|^mailto:/i.test(clean)) return false;
  if (/^v?\d+\.\d+/i.test(clean)) return false; // version numbers (e.g. v1.2.0, 2.0)
  if (/[()<>|?*="\s]/.test(clean)) return false;
  if (clean.includes("...")) return false; // prose ellipses

  const slash = clean.indexOf("/");
  const dot = clean.lastIndexOf(".");

  // Ignore standalone framework/runtime names like "Node.js" or "Express.js" when no slash is present
  if (slash === -1 && STANDALONE_TECH_NAMES.has(clean.toLowerCase())) {
    return false;
  }

  // Case 1: has a recognized file extension
  if (dot > 0 && dot < clean.length - 1) {
    const stem = clean.slice(0, dot);
    const ext = clean.slice(dot + 1).toLowerCase();
    if (/[a-zA-Z0-9_-]/.test(stem) && KNOWN_FILE_EXTENSIONS.has(ext)) {
      return true;
    }
  }

  // Case 2: folder path or path with slash starting with ./ or / or having directory markers
  if (slash >= 0) {
    const normalizedForDirCheck = clean.replace(/^(\.\/)+/, "").replace(/^\/+/, "");
    if (!normalizedForDirCheck) return false;

    if (
      clean.startsWith("./") ||
      (clean.startsWith("/") && normalizedForDirCheck.includes("/")) ||
      (slash > 0 && clean.endsWith("/")) ||
      KNOWN_DIRECTORY_PREFIX_REGEX.test(normalizedForDirCheck)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Extracts all unique normalized path-shaped tokens from an explanation text.
 */
export function extractPathTokens(content: string): string[] {
  const paths = new Set<string>();

  const addIfValidPath = (candidate: string): void => {
    if (!isPathShaped(candidate)) return;
    const normalized = normalizePath(candidate);
    if (normalized) {
      paths.add(normalized);
    }
  };

  // 1. Check tokens enclosed in backticks
  const backtickRegex = /`([^`]+)`/g;
  let match: RegExpExecArray | null;
  while ((match = backtickRegex.exec(content)) !== null) {
    const rawSpan = match[1].trim();
    if (isPathShaped(rawSpan)) {
      addIfValidPath(rawSpan);
    } else {
      // Handle backtick spans that contain multiple whitespace-separated tokens
      for (const subToken of rawSpan.split(/\s+/)) {
        addIfValidPath(subToken);
      }
    }
  }

  // 2. Check whitespace-separated tokens in general text outside backticks
  const textWithoutBackticks = content.replace(/`[^`]+`/g, " ");
  const words = textWithoutBackticks.split(/\s+/);
  for (const word of words) {
    addIfValidPath(word);
  }

  return Array.from(paths);
}

/**
 * Deterministically verifies every path token against the exact set of paths shown to the model.
 */
export function checkInventedPaths(
  explanation: string,
  shownPaths: Iterable<string>,
): InventedPathsResult {
  const shownSet = new Set<string>();
  for (const rawPath of shownPaths) {
    const normalized = normalizePath(rawPath);
    if (normalized) {
      shownSet.add(normalized);
    }
  }

  const normalizedShown = Array.from(shownSet);
  const extracted = extractPathTokens(explanation);
  const invented: string[] = [];

  for (const pathToken of extracted) {
    if (!shownSet.has(pathToken)) {
      invented.push(pathToken);
    }
  }

  const validCount = extracted.length - invented.length;
  const pathAccuracy =
    extracted.length === 0 ? 1.0 : Math.round((validCount / extracted.length) * 100) / 100;
  const valid = invented.length === 0;
  const score = valid ? 1.0 : 0.0;

  return {
    valid,
    score,
    pathAccuracy,
    extractedPaths: extracted,
    shownPaths: normalizedShown,
    inventedPaths: invented,
    details: {
      totalExtracted: extracted.length,
      totalShown: normalizedShown.length,
      validCount,
      inventedCount: invented.length,
    },
  };
}