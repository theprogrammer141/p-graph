import { Project } from "ts-morph";

import { chooseAdapter, type FrameworkAdapter } from "./adapter.ts";
import { extractImports } from "./imports.ts";
import { Resolver } from "./resolve.ts";
import {
  SCHEMA_VERSION,
  type Coverage,
  type Edge,
  type FileNode,
  type ImportOutcome,
  type ImportRecord,
  type ParseResult,
  type SkipReason,
} from "./types.ts";
import { moduleOf, walkRepository } from "./walk.ts";

export interface ParseOptions {
  adapters?: readonly FrameworkAdapter[];
  /** Called when starting the parse of a kept file. */
  onStartFile?: (relPath: string) => void;
}

export function parse(root: string, options?: ParseOptions): ParseResult {
  const adapter = chooseAdapter(root, options?.adapters ?? []);
  const walk = walkRepository(root, adapter);

  const warnings = [...walk.warnings];
  const nodes = new Map<string, FileNode>();
  for (const c of walk.candidates) {
    nodes.set(c.path, {
      path: c.path,
      module: moduleOf(c.path),
      lines: c.lines,
      sha256: c.sha256,
      fanIn: 0,
      fanOut: 0,
    });
  }

  const project = new Project({
    compilerOptions: { allowJs: true },
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  const skippedByReason: Record<string, number> = {
    "declaration-file": 0,
    minified: 0,
    "too-large": 0,
    "parse-error": 0,
    symlink: 0,
    unreadable: 0,
  };
  for (const skip of walk.skipped) {
    skippedByReason[skip.reason]++;
  }

  const resolver = new Resolver({
    root,
    nodes: new Set(nodes.keys()),
    skipped: new Map(walk.skipped.map((s) => [s.path, s])),
    excludedDirectories: walk.excludedDirectories,
    manifests: walk.manifests,
  });

  const imports: ImportRecord[] = [];
  let parsedCount = 0;

  for (const c of walk.candidates) {
    options?.onStartFile?.(c.path);
    let sourceFile;
    try {
      sourceFile = project.createSourceFile(c.path, c.text, { overwrite: true });
      const extracted = extractImports(sourceFile);
      for (const ex of extracted) {
        let outcome: ImportOutcome;
        if (ex.specifier === null) {
          outcome = {
            status: "unresolved",
            reason: "non-literal-dynamic",
            detail: `dynamic import argument is not a literal string: ${ex.expressionText}`,
          };
        } else {
          outcome = resolver.resolve(c.path, ex.specifier);
        }
        imports.push({
          from: c.path,
          line: ex.line,
          kind: ex.kind,
          specifier: ex.specifier,
          typeOnly: ex.typeOnly,
          outcome,
        });
      }
      parsedCount++;
    } catch (err) {
      walk.skipped.push({
        path: c.path,
        reason: "parse-error",
        detail: String(err),
      });
      skippedByReason["parse-error"]++;
      nodes.delete(c.path);
    } finally {
      if (sourceFile) project.removeSourceFile(sourceFile);
    }
  }

  warnings.push(...resolver.warnings);

  // Compute edges and fan in/out.
  const edges = new Map<string, Edge>();
  for (const imp of imports) {
    if (imp.outcome.status !== "resolved") continue;
    const to = imp.outcome.target;
    const from = imp.from;
    const key = `${from} -> ${to}`;
    let edge = edges.get(key);
    if (!edge) {
      edge = { from, to, kinds: [], typeOnly: true };
      edges.set(key, edge);
      const fromNode = nodes.get(from);
      const toNode = nodes.get(to);
      if (fromNode) fromNode.fanOut++;
      if (toNode) toNode.fanIn++;
    }
    if (!edge.kinds.includes(imp.kind)) {
      edge.kinds.push(imp.kind);
      // Kinds sort alphabetically, which is stable.
      edge.kinds.sort();
    }
    if (!imp.typeOnly) edge.typeOnly = false;
  }

  const coverage = buildCoverage(
    nodes.size,
    parsedCount,
    walk.skipped.length,
    skippedByReason,
    imports,
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    root,
    adapter: adapter.name,
    files: Array.from(nodes.values()),
    edges: Array.from(edges.values()),
    skipped: walk.skipped,
    excludedDirectories: walk.excludedDirectories,
    imports,
    coverage,
    warnings,
  };
}

function buildCoverage(
  nodesCount: number,
  parsed: number,
  skipped: number,
  skippedByReason: Record<SkipReason, number>,
  imports: ImportRecord[],
): Coverage {
  const c: Coverage = {
    files: {
      found: parsed + skipped,
      parsed,
      skipped,
      skippedByReason,
    },
    imports: {
      found: imports.length,
      resolved: 0,
      external: 0,
      excluded: 0,
      unresolved: 0,
      byKind: {
        import: { found: 0, resolved: 0, external: 0, excluded: 0, unresolved: 0 },
        "re-export": { found: 0, resolved: 0, external: 0, excluded: 0, unresolved: 0 },
        dynamic: { found: 0, resolved: 0, external: 0, excluded: 0, unresolved: 0 },
      },
      externalByReason: { package: 0, builtin: 0, "outside-root": 0 },
      excludedByReason: {
        asset: 0,
        "skipped-target": 0,
        "excluded-directory": 0,
        "declaration-target": 0,
      },
      unresolvedByReason: {
        "not-found": 0,
        "non-literal-dynamic": 0,
        "unknown-specifier": 0,
        "workspace-unlinked": 0,
        "outside-walk": 0,
      },
    },
  };

  for (const imp of imports) {
    const k = c.imports.byKind[imp.kind];
    k.found++;
    const status = imp.outcome.status;
    c.imports[status]++;
    k[status]++;

    if (imp.outcome.status === "external") {
      c.imports.externalByReason[imp.outcome.reason]++;
    } else if (imp.outcome.status === "excluded") {
      c.imports.excludedByReason[imp.outcome.reason]++;
    } else if (imp.outcome.status === "unresolved") {
      c.imports.unresolvedByReason[imp.outcome.reason]++;
    }
  }
  return c;
}
