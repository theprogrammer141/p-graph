// Pure graph calculations over a file list and an edge list.
// No React, no Next.js, no database client.

import type { Edge, FileNode } from "@/parser/types";
import { identifyConvention } from "../conventions";

export type WalkDirection = "blast-radius" | "dependency-chain";

export interface TransitiveWalkItem {
  path: string;
  depth: number;
}

/**
 * Single transitive walk over the edge list with a direction argument and depth limit.
 * - "blast-radius": everything that breaks if this file changes (incoming/reverse edges: to -> from)
 * - "dependency-chain": everything this file needs (outgoing/forward edges: from -> to)
 */
export function transitiveWalk(
  startPath: string,
  edges: readonly Edge[],
  direction: WalkDirection,
  maxDepth = 2
): TransitiveWalkItem[] {
  // Build adjacency list according to direction
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    const src = direction === "dependency-chain" ? e.from : e.to;
    const dst = direction === "dependency-chain" ? e.to : e.from;
    let set = adj.get(src);
    if (!set) {
      set = new Set();
      adj.set(src, set);
    }
    set.add(dst);
  }

  const visitedDepth = new Map<string, number>();
  visitedDepth.set(startPath, 0);

  const queue: { path: string; depth: number }[] = [{ path: startPath, depth: 0 }];

  while (queue.length > 0) {
    const curr = queue.shift();
    if (!curr) break;
    const { path, depth } = curr;

    if (depth >= maxDepth) continue;

    const neighbors = adj.get(path);
    if (!neighbors) continue;

    for (const next of neighbors) {
      if (!visitedDepth.has(next)) {
        visitedDepth.set(next, depth + 1);
        queue.push({ path: next, depth: depth + 1 });
      }
    }
  }

  // Remove the root file from returned entries
  visitedDepth.delete(startPath);

  return [...visitedDepth.entries()]
    .map(([path, depth]) => ({ path, depth }))
    .sort((a, b) => a.depth - b.depth || (a.path < b.path ? -1 : 1));
}

/**
 * Iterative elementary cycle detection.
 * Avoids recursion entirely to prevent blowing the call stack on large repositories.
 */
function detectCyclesIterative(
  edges: readonly Edge[],
  maxCycles = 50
): string[][] {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    let list = adj.get(e.from);
    if (!list) {
      list = [];
      adj.set(e.from, list);
    }
    list.push(e.to);
  }

  const foundCycles: string[][] = [];
  const seenCycleKeys = new Set<string>();
  const nodes = [...adj.keys()].sort();

  for (const startNode of nodes) {
    if (foundCycles.length >= maxCycles) break;

    // Iterative DFS stack
    const stack: { node: string; neighborIdx: number }[] = [
      { node: startNode, neighborIdx: 0 },
    ];
    const inPath = new Set<string>([startNode]);
    const path: string[] = [startNode];

    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const neighbors = adj.get(top.node) || [];

      if (top.neighborIdx < neighbors.length) {
        const next = neighbors[top.neighborIdx];
        top.neighborIdx++;

        if (next === startNode) {
          // Elementary cycle found!
          const cycle = [...path, startNode];
          const key = cycle.join("\0");
          if (!seenCycleKeys.has(key)) {
            seenCycleKeys.add(key);
            foundCycles.push(cycle);
            if (foundCycles.length >= maxCycles) break;
          }
        } else if (!inPath.has(next) && next > startNode && path.length < 10) {
          // Explore nodes lexicographically greater than startNode to avoid finding
          // rotated duplicate cycles, bounding path length to 10 for performance.
          inPath.add(next);
          path.push(next);
          stack.push({ node: next, neighborIdx: 0 });
        }
      } else {
        // Backtrack
        inPath.delete(top.node);
        path.pop();
        stack.pop();
      }
    }
  }

  return foundCycles;
}

/**
 * Checks whether a file is reached by the framework or runtime entry points.
 * Pages, routes, layouts, middleware and configs are reached by the framework
 * and must not be marked as unused or orphan.
 */
function isFrameworkReached(filePath: string, adapter?: string): boolean {
  const norm = filePath.replace(/\\/g, "/");

  // Middleware and Next 16 proxy convention
  if (/(^|\/)(middleware|proxy)\.[jt]sx?$/.test(norm)) return true;

  // Next.js App router special conventions
  if (
    /(^|\/)app\/(.+)?(page|route|layout|loading|error|template|not-found|default|global-error)\.[jt]sx?$/.test(
      norm
    )
  ) {
    return true;
  }

  // Django / Python / .NET / BaaS framework-invoked entry points
  if (
    /(^|\/)migrations\//.test(norm) ||
    /(^|\/)supabase\/functions\/[^/]+\/index\.[mc]?[jt]sx?$/.test(norm) ||
    /(^|\/)functions\/(?:src\/)?index\.[mc]?[jt]sx?$/.test(norm) ||
    /(^|\/)(admin|urls|wsgi|asgi|manage)\.py$/.test(norm) ||
    /Controller\.cs$/.test(norm)
  ) {
    return true;
  }

  // General convention roles
  const identified = identifyConvention(filePath);
  if (!identified) return false;

  const isAutoDiscoveredController =
    identified.role === "controller" &&
    (adapter === ".NET" || adapter === "NestJS" || norm.endsWith(".cs"));

  return (
    identified.role === "route" ||
    isAutoDiscoveredController ||
    identified.role === "config" ||
    identified.role === "entry" ||
    identified.role === "script"
  );
}

export interface InsightGroup {
  id: "zero-in" | "high-in" | "cycles" | "oversized";
  title: string;
  sentence: string;
  count: number;
  items: InsightItem[];
}

export type InsightItem =
  | { kind: "file"; path: string; lines: number; fanIn: number; fanOut: number; metric?: string }
  | { kind: "cycle"; path: string[]; label: string };

export interface RepoInsights {
  zeroIn: InsightGroup;
  unusualDependents: InsightGroup;
  cycles: InsightGroup;
  oversized: InsightGroup;
  all: InsightGroup[];
  totalFindings: number;
}

/**
 * Fixed sentences for the four kinds of insights.
 * No model is involved in describing them.
 */
export const INSIGHT_SENTENCES = {
  zeroIn: "Nothing in the repository imports these files directly.",
  unusualDependents: "An unusually high number of other modules depend on these files.",
  cycles: "Circular dependency chains where files directly or indirectly import each other.",
  oversized: "Files whose length significantly exceeds the rest of the repository.",
} as const;

/**
 * Computes the four kinds of insights from facts about the edge list.
 * Files-nothing-imports leads the list. Cycles and oversized go underneath.
 */
export function buildInsights(
  files: readonly FileNode[],
  edges: readonly Edge[],
  adapter?: string
): RepoInsights {
  // 1. Files nothing imports (excluding framework-reached files)
  const zeroInFiles = files
    .filter((f) => f.fanIn === 0 && !isFrameworkReached(f.path, adapter))
    .sort((a, b) => b.fanOut - a.fanOut || (a.path < b.path ? -1 : 1));

  const zeroInGroup: InsightGroup = {
    id: "zero-in",
    title: "Files nothing imports",
    sentence: INSIGHT_SENTENCES.zeroIn,
    count: zeroInFiles.length,
    items: zeroInFiles.map((f) => ({
      kind: "file",
      path: f.path,
      lines: f.lines,
      fanIn: f.fanIn,
      fanOut: f.fanOut,
      metric: `${f.lines}L · out ${f.fanOut}`,
    })),
  };

  // 2. Files an unusual number of things import (outliers in fan-in distribution)
  const fanInValues = files.map((f) => f.fanIn);
  const fanInMean = fanInValues.reduce((a, b) => a + b, 0) / (files.length || 1);
  const fanInVariance =
    fanInValues.reduce((a, b) => a + Math.pow(b - fanInMean, 2), 0) / (files.length || 1);
  const fanInStd = Math.sqrt(fanInVariance);
  const fanInThreshold = Math.max(10, Math.round(fanInMean + 1.5 * fanInStd));

  const unusualFiles = files
    .filter((f) => f.fanIn >= fanInThreshold)
    .sort((a, b) => b.fanIn - a.fanIn || (a.path < b.path ? -1 : 1));

  const unusualGroup: InsightGroup = {
    id: "high-in",
    title: "Unusual dependents",
    sentence: INSIGHT_SENTENCES.unusualDependents,
    count: unusualFiles.length,
    items: unusualFiles.map((f) => ({
      kind: "file",
      path: f.path,
      lines: f.lines,
      fanIn: f.fanIn,
      fanOut: f.fanOut,
      metric: `in ${f.fanIn}`,
    })),
  };

  // 3. Import cycles (iterative detection)
  const rawCycles = detectCyclesIterative(edges);
  const cyclesGroup: InsightGroup = {
    id: "cycles",
    title: "Import cycles",
    sentence: INSIGHT_SENTENCES.cycles,
    count: rawCycles.length,
    items: rawCycles.map((cycle) => ({
      kind: "cycle",
      path: cycle,
      label: cycle.join(" → "),
    })),
  };

  // 4. Files that are simply too long (outliers in lines distribution)
  const lineValues = files.map((f) => f.lines);
  const lineMean = lineValues.reduce((a, b) => a + b, 0) / (files.length || 1);
  const lineVariance =
    lineValues.reduce((a, b) => a + Math.pow(b - lineMean, 2), 0) / (files.length || 1);
  const lineStd = Math.sqrt(lineVariance);
  const lineThreshold = Math.max(500, Math.round(lineMean + 2 * lineStd));

  const oversizedFiles = files
    .filter((f) => f.lines >= lineThreshold)
    .sort((a, b) => b.lines - a.lines || (a.path < b.path ? -1 : 1));

  const oversizedGroup: InsightGroup = {
    id: "oversized",
    title: "Oversized files",
    sentence: INSIGHT_SENTENCES.oversized,
    count: oversizedFiles.length,
    items: oversizedFiles.map((f) => ({
      kind: "file",
      path: f.path,
      lines: f.lines,
      fanIn: f.fanIn,
      fanOut: f.fanOut,
      metric: `${f.lines} lines`,
    })),
  };

  // Order: Files nothing imports leads the list; cycles and oversized go underneath.
  const all = [zeroInGroup, unusualGroup, cyclesGroup, oversizedGroup];
  const totalFindings = all.reduce((sum, g) => sum + g.count, 0);

  return {
    zeroIn: zeroInGroup,
    unusualDependents: unusualGroup,
    cycles: cyclesGroup,
    oversized: oversizedGroup,
    all,
    totalFindings,
  };
}
