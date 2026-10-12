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
  "Express": [
    { id: "route", label: "Routes", colorHex: "#7c3aed" },
    { id: "controller", label: "Controllers", colorHex: "#e11d48" },
    { id: "middleware", label: "Middleware", colorHex: "#0891b2" },
    { id: "model", label: "Models", colorHex: "#ea580c" },
    { id: "service", label: "Services", colorHex: "#c026d3" },
    { id: "view", label: "Views", colorHex: "#0d9488" },
    { id: "handler", label: "Handlers", colorHex: "#6366f1" },
  ],
  "none": [
    { id: "generic", label: "Generic", colorHex: "#71717a" },
  ],
};

const FALLBACK_TAXONOMY: readonly TaxonomyCategory[] = [
  { id: "generic", label: "Generic", colorHex: "#71717a" },
];

/** Returns the framework’s role categories, falling back to the generic category. */
export function getTaxonomy(framework: string): readonly TaxonomyCategory[] {
  return FRAMEWORK_TAXONOMIES[framework] ?? FALLBACK_TAXONOMY;
}

/** Finds a role label’s framework color, falling back to neutral gray when unmatched. */
export function colorOfRole(role: string, framework: string): string {
  const categories = getTaxonomy(framework);
  const matched = categories.find((c) => c.label === role);
  return matched?.colorHex ?? "#71717a";
}

/**
 * Counts files in each framework role category, including zero-count categories.
 * Files without a role count toward a generic category when one exists.
 */
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
        f.role === cat.id ||
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
