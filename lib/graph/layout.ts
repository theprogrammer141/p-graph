// Turns the parser's files and edges plus "which folders are open" into
// positioned boxes and wired edges. Pure: same input, same picture. The canvas
// component only draws what this returns.

import dagre from "@dagrejs/dagre";

import type { Edge, FileNode } from "../../parser/types.ts";
import { fold, groupStats, visibleEdges, type FoldResult, type NodeStats } from "./fold.ts";
import { relativeTo, shortestUnique } from "./labels.ts";
import { extensionOf } from "../file-categories.ts";

// Pixel metrics. Character widths are for 11px/10px monospace; widths come
// from text so a long name never reads as a heavy node.
const CHAR_W = 6.7;
const META_CHAR_W = 6.1;
const PAD_X = 10;
const MIN_W = 80;
const MAX_PANEL_W = 420;
const FOLDED_BASE_H = 30;
/** Extra height per doubling of fan-in. Log, so one hub doesn't dwarf the map. */
const FAN_IN_SCALE = 8;
export const HEADER_H = 26;
export const ROW_H = 18;
/** Rows a panel shows before it says "N more" instead of growing. */
const MAX_ROWS = 14;
const ROW_EXTRAS_W = 46; // swatch, gap and the fan-in figure

export const ROOT_LABEL = "(root)";

export type Row =
  | { kind: "file"; id: string; path: string; label: string; fanIn: number }
  | { kind: "more"; id: string; count: number };

export interface CanvasNode {
  id: string;
  label: string;
  open: boolean;
  fileCount: number;
  stats: NodeStats;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Empty when folded. */
  rows: Row[];
  categoryCounts: Map<string, number>;
}

export interface CanvasEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  /** File-level edges this one stands for. */
  count: number;
}

export interface Prepared {
  fold: FoldResult;
  stats: Map<string, NodeStats>;
  fileFanIn: Map<string, number>;
  labels: Map<string, string>;
  /** File edges with an unplaced file at either end; they have nothing to attach to. */
  undrawnEdges: number;
}

/** The parts that don't depend on what's open. Compute once per dataset. */
export function prepare(files: readonly FileNode[], edges: readonly Edge[]): Prepared {
  const folded = fold(files);
  const dirs = folded.groups.map((g) => g.dir);
  const labels = shortestUnique(dirs);
  if (labels.has(".")) labels.set(".", ROOT_LABEL);
  const unplaced = new Set(folded.unplaced);
  return {
    fold: folded,
    stats: groupStats(edges, folded.groupOf),
    fileFanIn: new Map(files.map((f) => [f.path, f.fanIn])),
    labels,
    undrawnEdges: edges.filter((e) => unplaced.has(e.from) || unplaced.has(e.to)).length,
  };
}

/** Handle ids. A folded node has one of each; a panel has one per row. */
export const handleIn = (rowId?: string) => (rowId === undefined ? "in" : `in:${rowId}`);
export const handleOut = (rowId?: string) => (rowId === undefined ? "out" : `out:${rowId}`);
/** The row a handle belongs to, or null for a folded node's handle. */
export const rowOfHandle = (handle: string) => (handle.length > 3 ? handle.slice(handle.indexOf(":") + 1) : null);

export function foldedHeight(fanIn: number): number {
  return Math.round(FOLDED_BASE_H + FAN_IN_SCALE * Math.log2(1 + fanIn));
}

/** Panel header text. A folded node shows only the file count; its fan-in is its height. */
function panelMeta(fileCount: number, s: NodeStats): string {
  return `${fileCount} files  in ${s.fanIn}  out ${s.fanOut}`;
}

export function foldedMeta(fileCount: number): string {
  return `${fileCount} files`;
}

export function buildCanvas(
  prepared: Prepared,
  edges: readonly Edge[],
  open: ReadonlySet<string>,
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const { fold: folded, stats, fileFanIn, labels } = prepared;

  // Which row each file lands on, for open panels.
  const rowOfFile = new Map<string, string>();

  const sized = folded.groups.map((g) => {
    const label = labels.get(g.dir) ?? g.dir;
    const s = stats.get(g.dir) ?? { fanIn: 0, fanOut: 0 };
    const categoryCounts = new Map<string, number>();
    for (const f of g.files) {
      const ext = extensionOf(f);
      categoryCounts.set(ext, (categoryCounts.get(ext) ?? 0) + 1);
    }

    if (!open.has(g.dir)) {
      const textW = Math.max(label.length * CHAR_W, foldedMeta(g.files.length).length * META_CHAR_W);
      return {
        id: g.dir, label, open: false, fileCount: g.files.length, stats: s, rows: [] as Row[],
        categoryCounts,
        width: Math.max(MIN_W, Math.ceil(textW + PAD_X * 2)),
        height: foldedHeight(s.fanIn),
      };
    }
    const meta = panelMeta(g.files.length, s);

    // Most depended-on first, so the rows that fit are the ones that matter.
    const ordered = [...g.files].sort(
      (a, b) => (fileFanIn.get(b) ?? 0) - (fileFanIn.get(a) ?? 0) || (a < b ? -1 : 1),
    );
    const rel = shortestUnique(ordered.map((f) => relativeTo(g.dir, f)));
    const rows: Row[] = ordered.map((path) => ({
      kind: "file",
      id: path,
      path,
      label: rel.get(relativeTo(g.dir, path)) ?? path,
      fanIn: fileFanIn.get(path) ?? 0,
    }));
    for (const f of ordered) rowOfFile.set(f, f);

    const visibleRows = Math.min(MAX_ROWS, rows.length);
    const headerW = label.length * CHAR_W + meta.length * META_CHAR_W + 16;
    const rowsW = Math.max(...rows.map((r) => (r.kind === "file" ? r.label.length * CHAR_W : 12 * CHAR_W)));
    return {
      id: g.dir, label, open: true, fileCount: g.files.length, stats: s, rows,
      categoryCounts,
      width: Math.min(MAX_PANEL_W, Math.max(MIN_W, Math.ceil(Math.max(headerW, rowsW + ROW_EXTRAS_W) + PAD_X * 2))),
      height: HEADER_H + visibleRows * ROW_H + 4,
    };
  });

  // Layout runs on folder-level edges whatever is open, so ranks stay put and
  // only sizes change when a panel opens.
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 10, ranksep: 36, marginx: 8, marginy: 8 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of sized) g.setNode(n.id, { width: n.width, height: n.height });
  for (const e of visibleEdges(edges, folded.groupOf, new Set())) g.setEdge(e.from, e.to);
  dagre.layout(g);

  const nodes: CanvasNode[] = sized.map((n) => {
    const p = g.node(n.id);
    // dagre gives centres; the canvas wants top-left corners.
    return { ...n, x: (p.x ?? 0) - n.width / 2, y: (p.y ?? 0) - n.height / 2 };
  });

  // Endpoint of a visible edge: a folded node's single handle, or a row's.
  const attach = (id: string, side: "in" | "out") => {
    const group = folded.groupOf.get(id);
    if (group !== undefined && open.has(group) && id !== group) {
      const row = rowOfFile.get(id) ?? id;
      return { node: group, handle: side === "in" ? handleIn(row) : handleOut(row) };
    }
    return { node: id, handle: side === "in" ? handleIn() : handleOut() };
  };

  const merged = new Map<string, CanvasEdge>();
  for (const e of visibleEdges(edges, folded.groupOf, open)) {
    const s = attach(e.from, "out");
    const t = attach(e.to, "in");
    // Two files both behind the same "more" row: internal to it, like an edge
    // inside a folded node.
    if (s.node === t.node && rowOfHandle(s.handle) === rowOfHandle(t.handle)) continue;
    const id = `${s.node}|${s.handle}>${t.node}|${t.handle}`;
    const existing = merged.get(id);
    if (existing) existing.count += e.count;
    else merged.set(id, { id, source: s.node, sourceHandle: s.handle, target: t.node, targetHandle: t.handle, count: e.count });
  }

  return { nodes, edges: [...merged.values()] };
}
