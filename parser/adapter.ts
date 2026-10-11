// Framework knowledge lives behind this interface and nowhere else. The parser
// asks the chosen adapter questions; it never asks which framework it is.

import type { SourceFile } from "ts-morph";
import type { AssignedRole, ExtractedRoute } from "./types.ts";

export type { AssignedRole, ExtractedRoute };

export interface FrameworkAdapter {
  readonly name: string;
  /** Whether this adapter recognises the repository at `root`. */
  detect(root: string): boolean;
  /**
   * Called for every directory during the walk. Return the rule that excludes
   * it, or null to walk into it. `relPath` is repo-relative with forward slashes.
   */
  excludeDirectory(relPath: string, name: string): string | null;
  /**
   * Assign a role to a source file, or null to leave generic.
   * `relPath` is repo-relative with forward slashes.
   */
  assignRole?(relPath: string, fileText?: string): string | null;
  /**
   * Extract routes from a source file given its ts-morph SourceFile.
   * Exact routes only; if anything cannot be recovered from syntax, emit nothing.
   */
  extractRoutes?(relPath: string, sourceFile: SourceFile): ExtractedRoute[];
}

// Directories that hold dependencies or build output in essentially every JS
// project, regardless of framework. Anything excluded is listed in the output.
const BUILD_OUTPUT_DIRS = new Set(["dist", "build", "out", "coverage"]);

/** Assumes no framework at all. Always matches, so it goes last. */
export const fallbackAdapter: FrameworkAdapter = {
  name: "none",
  detect: () => true,
  excludeDirectory(_relPath, name) {
    if (name === "node_modules") return "dependencies (node_modules)";
    // Dot-directories are VCS metadata, caches and tool state, not source.
    if (name.startsWith(".")) return "hidden directory";
    if (BUILD_OUTPUT_DIRS.has(name)) return `build output (${name})`;
    return null;
  },
  /** Leaves every file generic when no framework adapter matches. */
  assignRole: () => "Generic",
  /** Returns no routes because the fallback adapter has no routing conventions. */
  extractRoutes: () => [],
};

export function chooseAdapter(
  root: string,
  adapters: readonly FrameworkAdapter[],
): FrameworkAdapter {
  return adapters.find((a) => a.detect(root)) ?? fallbackAdapter;
}
