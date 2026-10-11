// Pure calculations for the detail pane.
// No React, no Next.js, no DB. Path and edge in, view models out.

import type { Edge, FileNode } from "@/parser/types";
import { countRoutes, kindOfFile } from "../conventions";
import { colorOf, extensionOf } from "../file-categories";
import { colorOfRole } from "../taxonomy";

export interface RepoSummary {
  name: string;
  framework: string;
  fileCount: number;
  importCount: number;
  routeCount: number;
  unidentifiedCount: number;
  mostDependedOn: FileItem[];
  startingPoints: FileItem[];
}

export interface FileItem {
  path: string;
  kind: string;
  extension: string;
  colorHex: string;
  lines: number;
  fanIn: number;
  fanOut: number;
}

export interface FileDetail {
  path: string;
  kind: string;
  extension: string;
  colorHex: string;
  lines: number;
  dependsOnCount: number;
  dependedOnCount: number;
  dependencies: FileItem[];
  dependents: FileItem[];
}

export interface KindCount {
  kind: string;
  count: number;
  colorHex?: string;
}

export interface FolderDetail {
  dir: string;
  fileCount: number;
  fanIn: number;
  fanOut: number;
  categories: KindCount[];
  roles: KindCount[];
  files: FileItem[];
}

/**
 * Builds repository counts and ranked file lists, preferring an explicit route count
 * over path conventions when one is supplied.
 */
export function buildRepoSummary(
  files: readonly FileNode[],
  edges: readonly Edge[],
  options?: { repoName?: string; adapter?: string; routeCount?: number }
): RepoSummary {
  const adapter = options?.adapter ?? "none";
  const framework =
    adapter === "none" || !adapter ? "None detected" : adapter;

  const fileItems: FileItem[] = files.map((f) => {
    const ext = extensionOf(f.path);
    const kind = f.role && f.role !== "Generic" ? f.role : kindOfFile(f.path);
    const colorHex = f.role && f.role !== "Generic" ? colorOfRole(f.role, adapter) : colorOf(ext);
    return {
      path: f.path,
      kind,
      extension: ext,
      colorHex,
      lines: f.lines,
      fanIn: f.fanIn,
      fanOut: f.fanOut,
    };
  });

  // What the rest of the repository leans on most, ordered by fan-in
  const mostDependedOn = [...fileItems]
    .filter((f) => f.fanIn > 0)
    .sort((a, b) => b.fanIn - a.fanIn || (a.path < b.path ? -1 : 1));

  // The files nothing imports at all, where reading starts
  const startingPoints = [...fileItems]
    .filter((f) => f.fanIn === 0)
    .sort((a, b) => b.fanOut - a.fanOut || (a.path < b.path ? -1 : 1));

  const routeCount =
    options?.routeCount !== undefined
      ? options.routeCount
      : countRoutes(files, adapter);
  const unidentifiedCount = files.filter(
    (f) => !f.role || f.role === "Generic" || f.role === "Unidentified"
  ).length;

  return {
    name: options?.repoName ?? "repository",
    framework: adapter === "express" ? "Express" : framework,
    fileCount: files.length,
    importCount: edges.length,
    routeCount,
    unidentifiedCount,
    mostDependedOn,
    startingPoints,
  };
}

/** Builds direct dependency and dependent lists for a file, or returns null if it is absent. */
export function buildFileDetail(
  filePath: string,
  filesByPath: ReadonlyMap<string, FileNode>,
  edges: readonly Edge[],
  adapter: string
): FileDetail | null {
  const node = filesByPath.get(filePath);
  if (!node) return null;

  const ext = extensionOf(filePath);
  const kind = node.role && node.role !== "Generic" ? node.role : kindOfFile(filePath);
  const colorHex = node.role && node.role !== "Generic" ? colorOfRole(node.role, adapter) : colorOf(ext);

  // Files this file imports (outgoing edges)
  const depPaths = new Set<string>();
  for (const e of edges) {
    if (e.from === filePath) depPaths.add(e.to);
  }

  // Files that import this file (incoming edges)
  const revPaths = new Set<string>();
  for (const e of edges) {
    if (e.to === filePath) revPaths.add(e.from);
  }

  /** Builds a related file item, using convention labels and zero counts for missing metadata. */
  const toItem = (p: string): FileItem => {
    const fn = filesByPath.get(p);
    const itemExt = extensionOf(p);
    const itemKind = fn?.role && fn.role !== "Generic" ? fn.role : kindOfFile(p);
    const itemColor = fn?.role && fn.role !== "Generic" ? colorOfRole(fn.role, adapter) : colorOf(itemExt);
    return {
      path: p,
      kind: itemKind,
      extension: itemExt,
      colorHex: itemColor,
      lines: fn?.lines ?? 0,
      fanIn: fn?.fanIn ?? 0,
      fanOut: fn?.fanOut ?? 0,
    };
  };

  const dependencies = [...depPaths].sort().map(toItem);
  const dependents = [...revPaths].sort().map(toItem);

  return {
    path: filePath,
    kind,
    extension: ext,
    colorHex,
    lines: node.lines,
    dependsOnCount: dependencies.length,
    dependedOnCount: dependents.length,
    dependencies,
    dependents,
  };
}

/** Summarizes the supplied folder files by extension and role, sorting files by fan-in. */
export function buildFolderDetail(
  dir: string,
  filesInFolder: readonly FileNode[],
  adapter: string,
  stats?: { fanIn: number; fanOut: number }
): FolderDetail {
  const files: FileItem[] = filesInFolder.map((f) => {
    const ext = extensionOf(f.path);
    const kind = f.role && f.role !== "Generic" ? f.role : kindOfFile(f.path);
    const colorHex = f.role && f.role !== "Generic" ? colorOfRole(f.role, adapter) : colorOf(ext);
    return {
      path: f.path,
      kind,
      extension: ext,
      colorHex,
      lines: f.lines,
      fanIn: f.fanIn,
      fanOut: f.fanOut,
    };
  });

  // What kind of files are inside it and how many of each
  // 1. By extension category
  const catMap = new Map<string, number>();
  for (const f of files) {
    catMap.set(f.extension, (catMap.get(f.extension) ?? 0) + 1);
  }
  const categories: KindCount[] = [...catMap.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([ext, count]) => ({
      kind: ext,
      count,
      colorHex: colorOf(ext),
    }));

  // 2. By convention role
  const roleMap = new Map<string, number>();
  for (const f of files) {
    roleMap.set(f.kind, (roleMap.get(f.kind) ?? 0) + 1);
  }
  const roles: KindCount[] = [...roleMap.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([kind, count]) => ({
      kind,
      count,
    }));

  return {
    dir,
    fileCount: files.length,
    fanIn: stats?.fanIn ?? 0,
    fanOut: stats?.fanOut ?? 0,
    categories,
    roles,
    files: files.sort((a, b) => b.fanIn - a.fanIn || (a.path < b.path ? -1 : 1)),
  };
}
