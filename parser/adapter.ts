// Framework knowledge lives behind this interface and nowhere else. The parser
// asks the chosen adapter questions; it never asks which framework it is.

export interface FrameworkAdapter {
  readonly name: string;
  /** Whether this adapter recognises the repository at `root`. */
  detect(root: string): boolean;
  /**
   * Called for every directory during the walk. Return the rule that excludes
   * it, or null to walk into it. `relPath` is repo-relative with forward slashes.
   */
  excludeDirectory(relPath: string, name: string): string | null;
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
};

export function chooseAdapter(
  root: string,
  adapters: readonly FrameworkAdapter[],
): FrameworkAdapter {
  return adapters.find((a) => a.detect(root)) ?? fallbackAdapter;
}
