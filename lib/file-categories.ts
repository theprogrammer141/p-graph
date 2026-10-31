import type { FileNode } from "@/parser/types";

// A file's category is its extension and nothing else. It's the one kind of
// "kind" that's read straight off the parser's output rather than guessed.

export interface CategorySummary {
  extension: string;
  colorHex: string;
  count: number;
}

// One hue per extension the parser accepts. Blue, green and amber are kept out:
// they already mean selection, incoming and outgoing.
const EXTENSION_COLORS: Readonly<Record<string, string>> = {
  ".ts": "#7c3aed",
  ".tsx": "#c026d3",
  ".mts": "#6366f1",
  ".cts": "#a855f7",
  ".js": "#e11d48",
  ".jsx": "#0d9488",
  ".mjs": "#0891b2",
  ".cjs": "#78716c",
  ".py": "#ea580c",
  ".dart": "#0891b2",
  ".cs": "#7c3aed",
};

// Order the rail follows, so the list doesn't reshuffle between repositories.
const EXTENSION_ORDER = Object.keys(EXTENSION_COLORS);

export function extensionOf(filePath: string): string {
  const name = filePath.slice(filePath.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot);
}

/** Neutral grey for an extension outside the parser's list; it shouldn't occur. */
export function colorOf(extension: string): string {
  return EXTENSION_COLORS[extension] ?? "#a1a1aa";
}

export function countCategories(files: readonly FileNode[]): CategorySummary[] {
  const counts = new Map<string, number>();
  for (const f of files) {
    const ext = extensionOf(f.path);
    counts.set(ext, (counts.get(ext) ?? 0) + 1);
  }
  const rank = (ext: string) => {
    const i = EXTENSION_ORDER.indexOf(ext);
    return i < 0 ? EXTENSION_ORDER.length : i;
  };
  return [...counts.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || (a < b ? -1 : 1))
    .map(([extension, count]) => ({ extension, count, colorHex: colorOf(extension) }));
}
