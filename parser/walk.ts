import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { FrameworkAdapter } from "./adapter.ts";
import type { ExcludedDirectory, SkippedFile } from "./types.ts";

export const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
] as const;

const DECLARATION_FILE = /\.d\.[mc]?ts$/;
const MINIFIED_NAME = /\.min\.[mc]?js$/;
const MAX_BYTES = 1024 * 1024;
// A hand-written line this long is vanishingly rare; bundles and minified
// output hit it immediately.
const MAX_LINE_LENGTH = 5000;

export interface CandidateFile {
  path: string;
  absPath: string;
  text: string;
  lines: number;
  sha256: string;
}

export interface PackageManifest {
  /** Repo-relative directory holding the package.json. "." for the root. */
  dir: string;
  name: string | null;
  /** Dependency name -> version range, across every dependency field. */
  dependencies: Map<string, string>;
}

export interface WalkResult {
  candidates: CandidateFile[];
  skipped: SkippedFile[];
  excludedDirectories: ExcludedDirectory[];
  manifests: PackageManifest[];
  warnings: string[];
}

export function isSourceFile(name: string): boolean {
  return SOURCE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

/** The directory a file belongs to, which is what the map groups by. */
export function moduleOf(relPath: string): string {
  const dir = path.posix.dirname(relPath);
  return dir === "" ? "." : dir;
}

function countLines(text: string): number {
  if (text.length === 0) return 0;
  let n = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return text.endsWith("\n") ? n - 1 : n;
}

function longestLine(text: string): number {
  let max = 0;
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text.charCodeAt(i) === 10) {
      max = Math.max(max, i - start);
      start = i + 1;
    }
  }
  return max;
}

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

function readManifest(
  absPath: string,
  dir: string,
  warnings: string[],
): PackageManifest | null {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(absPath, "utf8"));
  } catch (err) {
    warnings.push(
      `${dir === "." ? "" : dir + "/"}package.json could not be read: ${String(err)}`,
    );
    return null;
  }
  if (typeof json !== "object" || json === null) return null;
  const record = json as Record<string, unknown>;
  const dependencies = new Map<string, string>();
  for (const field of DEPENDENCY_FIELDS) {
    const deps = record[field];
    if (typeof deps !== "object" || deps === null) continue;
    for (const [name, range] of Object.entries(deps)) {
      dependencies.set(name, typeof range === "string" ? range : "");
    }
  }
  return {
    dir,
    name: typeof record.name === "string" ? record.name : null,
    dependencies,
  };
}

/**
 * Walks every directory the adapter doesn't exclude and keeps every source
 * file in it. Selection is by directory, never by size, so a kept file's
 * imports always have a chance to land on a kept file.
 */
export function walkRepository(
  root: string,
  adapter: FrameworkAdapter,
): WalkResult {
  const result: WalkResult = {
    candidates: [],
    skipped: [],
    excludedDirectories: [],
    manifests: [],
    warnings: [],
  };

  const visit = (absDir: string, relDir: string) => {
    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch (err) {
      result.warnings.push(
        `directory ${relDir || "."} could not be read: ${String(err)}`,
      );
      return;
    }
    // Sorted so output is stable across runs and machines.
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const entry of entries) {
      const absPath = path.join(absDir, entry.name);
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        const rule = adapter.excludeDirectory(relPath, entry.name);
        if (rule) result.excludedDirectories.push({ path: relPath, rule });
        else visit(absPath, relPath);
        continue;
      }

      if (entry.name === "package.json" && entry.isFile()) {
        const manifest = readManifest(absPath, relDir || ".", result.warnings);
        if (manifest) result.manifests.push(manifest);
        continue;
      }

      if (!isSourceFile(entry.name)) continue;

      // Symlinks aren't followed: they can loop, and they can point outside
      // the repository. Counting them as skipped keeps the totals honest.
      if (entry.isSymbolicLink()) {
        result.skipped.push({
          path: relPath,
          reason: "symlink",
          detail: "symbolic links are not followed",
        });
        continue;
      }
      if (!entry.isFile()) continue;

      if (DECLARATION_FILE.test(entry.name)) {
        result.skipped.push({
          path: relPath,
          reason: "declaration-file",
          detail: "type declarations only, no runtime code",
        });
        continue;
      }

      let bytes: Buffer;
      try {
        const size = lstatSync(absPath).size;
        if (size > MAX_BYTES) {
          result.skipped.push({
            path: relPath,
            reason: "too-large",
            detail: `${size} bytes, limit is ${MAX_BYTES}`,
          });
          continue;
        }
        bytes = readFileSync(absPath);
      } catch (err) {
        result.skipped.push({
          path: relPath,
          reason: "unreadable",
          detail: String(err),
        });
        continue;
      }

      const text = bytes.toString("utf8");
      if (MINIFIED_NAME.test(entry.name)) {
        result.skipped.push({
          path: relPath,
          reason: "minified",
          detail: "file name marks it as minified",
        });
        continue;
      }
      const longest = longestLine(text);
      if (longest > MAX_LINE_LENGTH) {
        result.skipped.push({
          path: relPath,
          reason: "minified",
          detail: `longest line is ${longest} characters, limit is ${MAX_LINE_LENGTH}`,
        });
        continue;
      }

      result.candidates.push({
        path: relPath,
        absPath,
        text,
        lines: countLines(text),
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  };

  visit(root, "");
  return result;
}

/** Repo-relative path if `absPath` is inside `root`, otherwise null. */
export function relativeInside(root: string, absPath: string): string | null {
  const rel = path.relative(root, absPath);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return toPosix(rel);
}
