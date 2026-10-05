// Pure calculations for the detail pane.
// No React, no Next.js, no DB. Path and edge in, view models out.

import type { Edge, FileNode } from "@/parser/types";
import { countRoutes, countUnidentified, kindOfFile } from "../conventions";
import { colorOf, extensionOf } from "../file-categories";

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

export function buildRepoSummary(
  files: readonly FileNode[],
  edges: readonly Edge[],
  options?: { repoName?: string; adapter?: string }
): RepoSummary {
  const fileItems: FileItem[] = files.map((f) => {
    const ext = extensionOf(f.path);
    return {
      path: f.path,
      kind: kindOfFile(f.path),
      extension: ext,
      colorHex: colorOf(ext),
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

  const adapter = options?.adapter ?? "none";
  const framework =
    adapter === "none" || !adapter ? "None detected" : adapter;

  return {
    name: options?.repoName ?? "repository",
    framework,
    fileCount: files.length,
    importCount: edges.length,
    routeCount: countRoutes(files),
    unidentifiedCount: countUnidentified(files),
    mostDependedOn,
    startingPoints,
  };
}

export function buildFileDetail(
  filePath: string,
  filesByPath: ReadonlyMap<string, FileNode>,
  edges: readonly Edge[]
): FileDetail | null {
  const node = filesByPath.get(filePath);
  if (!node) return null;

  const ext = extensionOf(filePath);
  const kind = kindOfFile(filePath);

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

  const toItem = (p: string): FileItem => {
    const fn = filesByPath.get(p);
    const itemExt = extensionOf(p);
    return {
      path: p,
      kind: kindOfFile(p),
      extension: itemExt,
      colorHex: colorOf(itemExt),
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
    colorHex: colorOf(ext),
    lines: node.lines,
    dependsOnCount: dependencies.length,
    dependedOnCount: dependents.length,
    dependencies,
    dependents,
  };
}

export function buildFolderDetail(
  dir: string,
  filesInFolder: readonly FileNode[],
  stats?: { fanIn: number; fanOut: number }
): FolderDetail {
  const files: FileItem[] = filesInFolder.map((f) => {
    const ext = extensionOf(f.path);
    return {
      path: f.path,
      kind: kindOfFile(f.path),
      extension: ext,
      colorHex: colorOf(ext),
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
