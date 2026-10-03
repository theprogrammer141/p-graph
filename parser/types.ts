// The output contract. Everything after the parser reads this shape, so a change
// here is a breaking change: bump SCHEMA_VERSION and update validate.ts with it.

export const SCHEMA_VERSION = 1;

/** The three syntactic forms that can produce an edge. */
export const IMPORT_KINDS = ["import", "re-export", "dynamic"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export const SKIP_REASONS = [
  "declaration-file",
  "minified",
  "too-large",
  "parse-error",
  "symlink",
  "unreadable",
] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export const EXTERNAL_REASONS = ["package", "builtin", "outside-root"] as const;
export type ExternalReason = (typeof EXTERNAL_REASONS)[number];

export const EXCLUDED_REASONS = [
  "asset",
  "skipped-target",
  "excluded-directory",
  "declaration-target",
] as const;
export type ExcludedReason = (typeof EXCLUDED_REASONS)[number];

export const UNRESOLVED_REASONS = [
  "not-found",
  "non-literal-dynamic",
  "unknown-specifier",
  "workspace-unlinked",
  "outside-walk",
] as const;
export type UnresolvedReason = (typeof UNRESOLVED_REASONS)[number];

/** A source file that was parsed and is a node in the graph. */
export interface FileNode {
  /** Repo-relative, forward slashes. The identity of the node. */
  path: string;
  /** The directory the file sits in, repo-relative. "." for the root. */
  module: string;
  lines: number;
  /** sha256 of the raw bytes, hex. */
  sha256: string;
  /** Distinct files that import this one. */
  fanIn: number;
  /** Distinct files this one imports. */
  fanOut: number;
}

/** One connection between two nodes, deduplicated by (from, to). */
export interface Edge {
  from: string;
  to: string;
  /** Every syntactic form seen for this pair, sorted. */
  kinds: ImportKind[];
  /** True only when every occurrence for this pair was type-only. */
  typeOnly: boolean;
}

export interface SkippedFile {
  path: string;
  reason: SkipReason;
  detail: string;
}

export interface ExcludedDirectory {
  path: string;
  rule: string;
}

export type ImportOutcome =
  | { status: "resolved"; target: string }
  | { status: "external"; reason: ExternalReason; detail: string }
  | {
      status: "excluded";
      reason: ExcludedReason;
      target: string;
      detail: string;
    }
  | { status: "unresolved"; reason: UnresolvedReason; detail: string };

export type ImportStatus = ImportOutcome["status"];

/** Every import statement the parser saw, whatever happened to it. */
export interface ImportRecord {
  from: string;
  line: number;
  kind: ImportKind;
  /** null only for a dynamic import whose argument isn't a literal string. */
  specifier: string | null;
  typeOnly: boolean;
  outcome: ImportOutcome;
}

export interface StatusCounts {
  found: number;
  resolved: number;
  external: number;
  excluded: number;
  unresolved: number;
}

export interface Coverage {
  files: {
    /** Source files seen outside excluded directories. found = parsed + skipped. */
    found: number;
    parsed: number;
    skipped: number;
    skippedByReason: Record<SkipReason, number>;
  };
  imports: StatusCounts & {
    byKind: Record<ImportKind, StatusCounts>;
    externalByReason: Record<ExternalReason, number>;
    excludedByReason: Record<ExcludedReason, number>;
    unresolvedByReason: Record<UnresolvedReason, number>;
  };
}

export interface ParseResult {
  schemaVersion: typeof SCHEMA_VERSION;
  /** Absolute, real path of the directory that was parsed. */
  root: string;
  adapter: string;
  files: FileNode[];
  edges: Edge[];
  skipped: SkippedFile[];
  excludedDirectories: ExcludedDirectory[];
  imports: ImportRecord[];
  coverage: Coverage;
  /** Things that affect accuracy but aren't tied to one import, e.g. a broken tsconfig. */
  warnings: string[];
}
