// Folding: which directories become nodes on the map. Pure over the parser's
// file and edge lists; nothing here knows about React, the canvas or the DB.

import type { Edge, FileNode } from "../../parser/types.ts";

/** Readable upper bound on visible nodes. The threshold rises until we're under it. */
export const TARGET_MAX_NODES = 24;
/** "Fewer than a couple of files" — the starting threshold. */
export const START_THRESHOLD = 2;

export interface FoldedGroup {
  /** The directory this node stands for, repo-relative. "." for the root. */
  dir: string;
  /** Every file this node holds, its own plus anything merged into it. Sorted. */
  files: string[];
}

export interface FoldResult {
  threshold: number;
  groups: FoldedGroup[];
  /** file path -> dir of the group holding it. Unplaced files are absent. */
  groupOf: Map<string, string>;
  /**
   * Files with no node. The root is the only directory with no parent to fold
   * into, so when it ends up holding a single file, that file is left off the
   * map. Listed so the interface says so rather than hiding it.
   */
  unplaced: string[];
}

function parentOf(dir: string): string | null {
  if (dir === ".") return null;
  const i = dir.lastIndexOf("/");
  return i < 0 ? "." : dir.slice(0, i);
}

function depthOf(dir: string): number {
  return dir === "." ? 0 : dir.split("/").length;
}

/**
 * One fold at a fixed threshold. Directories are processed deepest-first, and
 * every merge decision at a depth is made against counts as they stood before
 * any merge at that depth, so siblings never see each other's merges.
 */
export function foldAt(files: readonly FileNode[], threshold: number): FoldedGroup[] {
  const held = new Map<string, string[]>();
  const ensure = (dir: string) => {
    // Every ancestor exists as a directory, even one holding no files of its
    // own, so a merge always has somewhere real to land.
    for (let d: string | null = dir; d !== null && !held.has(d); d = parentOf(d)) {
      held.set(d, []);
    }
  };
  for (const f of files) {
    ensure(f.module);
    held.get(f.module)!.push(f.path);
  }

  const byDepth = new Map<number, string[]>();
  for (const dir of held.keys()) {
    const d = depthOf(dir);
    const list = byDepth.get(d) ?? [];
    list.push(dir);
    byDepth.set(d, list);
  }
  const depths = [...byDepth.keys()].sort((a, b) => b - a);

  for (const depth of depths) {
    if (depth === 0) break; // the root has nowhere to merge into
    const dirs = byDepth.get(depth)!;
    // Decide first, apply after: the snapshot is what makes the pass fresh.
    const merging = dirs.filter((dir) => held.get(dir)!.length < threshold);
    for (const dir of merging) {
      const parent = parentOf(dir)!;
      held.get(parent)!.push(...held.get(dir)!);
      held.delete(dir);
    }
  }

  return [...held.entries()]
    .filter(([, f]) => f.length > 0)
    .map(([dir, f]) => ({ dir, files: [...f].sort() }))
    .sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
}

/** The lowest threshold, from START_THRESHOLD up, that lands under the target. */
export function fold(files: readonly FileNode[]): FoldResult {
  let threshold = START_THRESHOLD;
  let groups = foldAt(files, threshold);
  // Bounded by the file count: at threshold > files.length everything folds to the root.
  while (groups.length > TARGET_MAX_NODES && threshold <= files.length) {
    threshold++;
    groups = foldAt(files, threshold);
  }
  // A node holds more than one file, always. Only the root can break that.
  const unplaced: string[] = [];
  const root = groups.find((g) => g.dir === ".");
  if (root && root.files.length < 2) {
    unplaced.push(...root.files);
    groups = groups.filter((g) => g !== root);
  }
  const groupOf = new Map<string, string>();
  for (const g of groups) for (const f of g.files) groupOf.set(f, g.dir);
  return { threshold, groups, groupOf, unplaced };
}

export interface NodeEdge {
  /** Endpoint ids: a group dir, or a file path when its group is open. */
  from: string;
  to: string;
  /** How many file-level edges this one stands for. */
  count: number;
}

export interface NodeStats {
  /** Distinct files outside this node that import something inside it. */
  fanIn: number;
  /** Distinct files outside this node that something inside it imports. */
  fanOut: number;
}

/**
 * Lifts file edges onto what's visible. A file in an open group is its own
 * endpoint; a file in a closed group is represented by the group. Edges inside
 * a single closed group disappear rather than drawing a self-loop.
 */
export function visibleEdges(
  edges: readonly Edge[],
  groupOf: ReadonlyMap<string, string>,
  open: ReadonlySet<string>,
): NodeEdge[] {
  const endpoint = (file: string): string | null => {
    const g = groupOf.get(file);
    if (g === undefined) return null;
    return open.has(g) ? file : g;
  };
  const counts = new Map<string, NodeEdge>();
  for (const e of edges) {
    const from = endpoint(e.from);
    const to = endpoint(e.to);
    if (from === null || to === null || from === to) continue;
    const key = `${from}\u0000${to}`;
    const existing = counts.get(key);
    if (existing) existing.count++;
    else counts.set(key, { from, to, count: 1 });
  }
  return [...counts.values()].sort((a, b) =>
    a.from === b.from ? (a.to < b.to ? -1 : 1) : a.from < b.from ? -1 : 1,
  );
}

export function groupStats(
  edges: readonly Edge[],
  groupOf: ReadonlyMap<string, string>,
): Map<string, NodeStats> {
  const ins = new Map<string, Set<string>>();
  const outs = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, k: string, v: string) => {
    const s = m.get(k) ?? new Set<string>();
    s.add(v);
    m.set(k, s);
  };
  for (const e of edges) {
    const gf = groupOf.get(e.from);
    const gt = groupOf.get(e.to);
    if (gf === undefined || gt === undefined || gf === gt) continue;
    add(ins, gt, e.from);
    add(outs, gf, e.to);
  }
  const result = new Map<string, NodeStats>();
  for (const g of new Set(groupOf.values())) {
    result.set(g, { fanIn: ins.get(g)?.size ?? 0, fanOut: outs.get(g)?.size ?? 0 });
  }
  return result;
}
