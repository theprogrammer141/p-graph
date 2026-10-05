import type { FileNode } from "@/parser/types";

// Conventions that identify the role of a file from its path and name.
// Pure: no framework imports, no database access. Absent beats approximate.

export type ConventionRole =
  | "route"
  | "component"
  | "test"
  | "config"
  | "types"
  | "hook"
  | "entry"
  | "script";

export interface IdentifiedRole {
  role: ConventionRole;
  label: string;
}

const ROLE_LABELS: Record<ConventionRole, string> = {
  route: "Route",
  component: "Component",
  test: "Test",
  config: "Config",
  types: "Type definition",
  hook: "Hook",
  entry: "Entry point",
  script: "Script / CLI",
};

/**
 * Identifies whether a file matches known framework or file naming conventions.
 * Returns null if no convention could identify the file.
 */
export function identifyConvention(filePath: string): IdentifiedRole | null {
  const norm = filePath.replace(/\\/g, "/");
  const slash = norm.lastIndexOf("/");
  const fileName = slash >= 0 ? norm.slice(slash + 1) : norm;
  const extDot = fileName.lastIndexOf(".");
  const ext = extDot >= 0 ? fileName.slice(extDot) : "";

  // 1. Framework routes: Next.js App / Pages router, generic routes folder or .route.ts
  if (
    /(^|\/)app\/(.+)?(page|route|layout|loading|error)\.[jt]sx?$/.test(norm) ||
    (/(^|\/)pages\//.test(norm) && !fileName.startsWith("_")) ||
    /(^|\/)routes\//.test(norm) ||
    /\.route\.[jt]sx?$/.test(fileName)
  ) {
    return { role: "route", label: ROLE_LABELS.route };
  }

  // 2. Tests
  if (
    /\.(test|spec)\.[jt]sx?$/.test(fileName) ||
    /(^|\/)(__tests__|test|tests|test-fixtures)\//.test(norm)
  ) {
    return { role: "test", label: ROLE_LABELS.test };
  }

  // 3. Configurations
  if (
    /\.config\.[jt]s(on)?$/.test(fileName) ||
    /^\.[a-z]+rc(\.[a-z]+)?$/.test(fileName) ||
    fileName.startsWith("tsconfig") ||
    fileName === "package.json"
  ) {
    return { role: "config", label: ROLE_LABELS.config };
  }

  // 4. Type definitions
  if (
    fileName.endsWith(".d.ts") ||
    fileName === "types.ts" ||
    /\.types\.[jt]sx?$/.test(fileName) ||
    /(^|\/)types\//.test(norm)
  ) {
    return { role: "types", label: ROLE_LABELS.types };
  }

  // 5. Hooks
  if (
    /(^|\/)use[A-Z].*\.[jt]sx?$/.test(norm) ||
    /(^|\/)hooks\//.test(norm)
  ) {
    return { role: "hook", label: ROLE_LABELS.hook };
  }

  // 6. Components
  if (
    ext === ".tsx" ||
    ext === ".jsx" ||
    /(^|\/)components\//.test(norm)
  ) {
    return { role: "component", label: ROLE_LABELS.component };
  }

  // 7. Entry points
  if (/^(index|main)\.[jt]sx?$/.test(fileName)) {
    return { role: "entry", label: ROLE_LABELS.entry };
  }

  // 8. Scripts / CLI
  if (
    /(^|\/)(scripts|bin)\//.test(norm) ||
    fileName === "cli.ts" ||
    fileName === "cli.js"
  ) {
    return { role: "script", label: ROLE_LABELS.script };
  }

  return null;
}

export function kindOfFile(filePath: string): string {
  const role = identifyConvention(filePath);
  if (role) return role.label;
  return "Unidentified";
}

export function countRoutes(files: readonly FileNode[]): number {
  return files.filter((f) => identifyConvention(f.path)?.role === "route").length;
}

export function countUnidentified(files: readonly FileNode[]): number {
  return files.filter((f) => identifyConvention(f.path) === null).length;
}
