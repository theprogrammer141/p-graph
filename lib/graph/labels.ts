// Labels: the shortest trailing run of path segments that is still unique
// among everything it's shown alongside. Pure.

/**
 * For each path, the fewest trailing segments that no other path in the list
 * shares. A path that's a suffix of another can't grow past itself, so it
 * stops at its full length, which is still unique because the paths differ.
 */
export function shortestUnique(paths: readonly string[]): Map<string, string> {
  const segs = paths.map((p) => p.split("/"));
  const suffix = (s: string[], k: number) => s.slice(Math.max(0, s.length - k)).join("/");
  const result = new Map<string, string>();
  segs.forEach((s, i) => {
    let k = 1;
    while (
      k < s.length &&
      segs.some((other, j) => j !== i && suffix(other, k) === suffix(s, k))
    ) {
      k++;
    }
    result.set(paths[i], suffix(s, k));
  });
  return result;
}

/** A file's path relative to the directory a node stands for. */
export function relativeTo(dir: string, file: string): string {
  return dir === "." ? file : file.slice(dir.length + 1);
}
