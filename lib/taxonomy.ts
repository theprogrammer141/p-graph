// Pure taxonomy of framework roles for the left rail and canvas coloring.
// This file has NO parser, NO ts-morph, and NO filesystem dependencies,
// so browser components can safely import it without inflating the bundle.

export interface TaxonomyCategory {
  readonly id: string;
  readonly label: string;
  readonly colorHex: string;
}

export interface RoleCategorySummary {
  readonly id: string;
  readonly label: string;
  readonly colorHex: string;
  readonly count: number;
}

export const FRAMEWORK_TAXONOMIES: Readonly<Record<string, readonly TaxonomyCategory[]>> = {
  "Next.js": [
    { id: "page-route", label: "Page routes", colorHex: "#7c3aed" },
    { id: "api-endpoint", label: "API endpoints", colorHex: "#0891b2" },
    { id: "server-action", label: "Server actions", colorHex: "#c026d3" },
  ],
  "NestJS": [
    { id: "controller", label: "Controllers", colorHex: "#e11d48" },
    { id: "service", label: "Services", colorHex: "#7c3aed" },
    { id: "module", label: "Modules", colorHex: "#0891b2" },
    { id: "entity", label: "Entities", colorHex: "#ea580c" },
  ],
  "React": [
    { id: "component", label: "Components", colorHex: "#0891b2" },
    { id: "hook", label: "Hooks", colorHex: "#7c3aed" },
  ],
  "none": [
    { id: "generic", label: "Generic", colorHex: "#71717a" },
  ],
};

const FALLBACK_TAXONOMY: readonly TaxonomyCategory[] = [
  { id: "generic", label: "Generic", colorHex: "#71717a" },
];

export function getTaxonomy(framework: string): readonly TaxonomyCategory[] {
  return FRAMEWORK_TAXONOMIES[framework] ?? FALLBACK_TAXONOMY;
}

export function colorOfRole(role: string, framework: string): string {
  const categories = getTaxonomy(framework);
  const matched = categories.find((c) => c.label === role);
  return matched?.colorHex ?? "#71717a";
}

export function countTaxonomyCategories(
  files: readonly { readonly role?: string }[],
  framework: string,
): RoleCategorySummary[] {
  const categories = getTaxonomy(framework);
  return categories.map((cat) => {
    let count = 0;
    for (const f of files) {
      if (
        f.role === cat.label ||
        (!f.role && cat.id === "generic") ||
        (f.role === "Generic" && cat.id === "generic")
      ) {
        count++;
      }
    }
    return {
      id: cat.id,
      label: cat.label,
      colorHex: cat.colorHex,
      count,
    };
  });
}
