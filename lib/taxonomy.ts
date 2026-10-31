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
  "React Native": [
    { id: "screen", label: "Screens", colorHex: "#7c3aed" },
    { id: "navigation", label: "Navigation", colorHex: "#e11d48" },
    { id: "component", label: "Components", colorHex: "#0891b2" },
    { id: "hook", label: "Hooks", colorHex: "#c026d3" },
    { id: "service", label: "Services", colorHex: "#ea580c" },
    { id: "state", label: "State", colorHex: "#0d9488" },
  ],
  "Flutter": [
    { id: "screen", label: "Screens", colorHex: "#7c3aed" },
    { id: "widget", label: "Widgets", colorHex: "#0891b2" },
    { id: "state", label: "State", colorHex: "#c026d3" },
    { id: "model", label: "Models", colorHex: "#ea580c" },
    { id: "service", label: "Services", colorHex: "#0d9488" },
  ],
  "Django": [
    { id: "view", label: "Views", colorHex: "#7c3aed" },
    { id: "url", label: "URLs", colorHex: "#0891b2" },
    { id: "serializer", label: "Serializers", colorHex: "#c026d3" },
    { id: "model", label: "Models", colorHex: "#ea580c" },
    { id: "form", label: "Forms", colorHex: "#0d9488" },
    { id: "admin", label: "Admin", colorHex: "#e11d48" },
    { id: "task", label: "Tasks", colorHex: "#6366f1" },
    { id: "middleware", label: "Middleware", colorHex: "#a855f7" },
    { id: "migration", label: "Migrations", colorHex: "#78716c" },
  ],
  "FastAPI": [
    { id: "router", label: "Routers", colorHex: "#7c3aed" },
    { id: "schema", label: "Schemas", colorHex: "#0891b2" },
    { id: "model", label: "Models", colorHex: "#ea580c" },
    { id: "service", label: "Services", colorHex: "#c026d3" },
    { id: "dependency", label: "Dependencies", colorHex: "#0d9488" },
    { id: "crud", label: "CRUD", colorHex: "#e11d48" },
    { id: "middleware", label: "Middleware", colorHex: "#6366f1" },
  ],
  "Flask": [
    { id: "blueprint", label: "Blueprints", colorHex: "#7c3aed" },
    { id: "model", label: "Models", colorHex: "#ea580c" },
    { id: "form", label: "Forms", colorHex: "#0891b2" },
    { id: "service", label: "Services", colorHex: "#c026d3" },
    { id: "extension", label: "Extensions", colorHex: "#0d9488" },
  ],
  "Python": [
    { id: "entry-point", label: "Entry points", colorHex: "#7c3aed" },
    { id: "handler", label: "Handlers", colorHex: "#0891b2" },
    { id: "service", label: "Services", colorHex: "#c026d3" },
    { id: "model", label: "Models", colorHex: "#ea580c" },
    { id: "util", label: "Utils", colorHex: "#0d9488" },
    { id: "config", label: "Config", colorHex: "#6366f1" },
  ],
  ".NET": [
    { id: "controller", label: "Controllers", colorHex: "#e11d48" },
    { id: "page", label: "Pages", colorHex: "#7c3aed" },
    { id: "service", label: "Services", colorHex: "#c026d3" },
    { id: "repository", label: "Repositories", colorHex: "#0891b2" },
    { id: "model", label: "Models", colorHex: "#ea580c" },
    { id: "middleware", label: "Middleware", colorHex: "#0d9488" },
  ],
  "Supabase": [
    { id: "edge-function", label: "Edge functions", colorHex: "#7c3aed" },
    { id: "client-auth", label: "Client & Auth", colorHex: "#0891b2" },
    { id: "data-access", label: "Data access", colorHex: "#c026d3" },
    { id: "database-types", label: "Database types", colorHex: "#ea580c" },
    { id: "component", label: "Components", colorHex: "#0d9488" },
    { id: "hook", label: "Hooks", colorHex: "#6366f1" },
  ],
  "Firebase": [
    { id: "cloud-function", label: "Cloud functions", colorHex: "#7c3aed" },
    { id: "firebase-config", label: "Firebase config", colorHex: "#ea580c" },
    { id: "service", label: "Services", colorHex: "#c026d3" },
    { id: "component", label: "Components", colorHex: "#0891b2" },
    { id: "hook", label: "Hooks", colorHex: "#0d9488" },
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
