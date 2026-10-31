import type { FileNode } from "@/parser/types";

// Conventions that identify the role of a file from its path and name.
// Pure: no framework imports, no database access. Absent beats approximate.

export type ConventionRole =
  | "route"
  | "controller"
  | "middleware"
  | "model"
  | "service"
  | "view"
  | "handler"
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
  controller: "Controller",
  middleware: "Middleware",
  model: "Model",
  service: "Service",
  view: "View",
  handler: "Handler",
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

  // 1. Tests (must precede framework folders so test/controllers/x is a test)
  if (
    /\.(test|spec)\.[jt]sx?$/.test(fileName) ||
    /^test_.*\.py$/.test(fileName) ||
    /_test\.(py|dart)$/.test(fileName) ||
    /(Tests?|Specs?)\.cs$/.test(fileName) ||
    /(^|\/)(__tests__|test|tests|test-fixtures|integration_test)\//.test(norm)
  ) {
    return { role: "test", label: ROLE_LABELS.test };
  }

  // 2. Configurations
  if (
    /\.config\.[jt]s(on)?$/.test(fileName) ||
    /^\.[a-z]+rc(\.[a-z]+)?$/.test(fileName) ||
    fileName.startsWith("tsconfig") ||
    fileName === "package.json" ||
    fileName === "pyproject.toml" ||
    fileName === "pubspec.yaml" ||
    fileName.endsWith(".csproj") ||
    /^(settings|config|conftest)\.py$/.test(fileName)
  ) {
    return { role: "config", label: ROLE_LABELS.config };
  }

  // 3. Framework routes & routers (accepts singular and plural folder names)
  if (
    /(^|\/)app\/(.+)?(page|route|layout|loading|error)\.[jt]sx?$/.test(norm) ||
    (/(^|\/)pages\//.test(norm) && !fileName.startsWith("_")) ||
    /(^|\/)(routes?|routers?|urls|endpoints?|blueprints?)\//.test(norm) ||
    /\.(route|router)\.[jt]sx?$/.test(fileName) ||
    /^(urls|routes|router|endpoints|blueprint)\.py$/.test(fileName)
  ) {
    return { role: "route", label: ROLE_LABELS.route };
  }

  // 4. Controllers (singular & plural)
  if (
    /(^|\/)controllers?\//i.test(norm) ||
    /\.controller\.[jt]sx?$/.test(fileName) ||
    /Controller\.cs$/.test(fileName)
  ) {
    return { role: "controller", label: ROLE_LABELS.controller };
  }

  // 5. Middleware (singular & plural, or top-level middleware file)
  if (
    /(^|\/)middlewares?\//i.test(norm) ||
    /\.middleware\.[jt]sx?$/.test(fileName) ||
    /^(middleware|proxy)\.[jt]sx?$/.test(fileName) ||
    /^middlewares?\.py$/.test(fileName) ||
    /Middleware\.cs$/.test(fileName)
  ) {
    return { role: "middleware", label: ROLE_LABELS.middleware };
  }

  // 6. Models (singular & plural)
  if (
    /(^|\/)(models?|entities|schemas?)\//i.test(norm) ||
    /\.model\.[jt]sx?$/.test(fileName) ||
    /^(models?|schemas?|serializers?)\.py$/.test(fileName) ||
    /_(model|entity)\.dart$/.test(fileName) ||
    /(Model|Entity|Dto|DTO)\.cs$/.test(fileName)
  ) {
    return { role: "model", label: ROLE_LABELS.model };
  }

  // 7. Services (singular & plural)
  if (
    /(^|\/)(services?|repositories)\//i.test(norm) ||
    /\.service\.[jt]sx?$/.test(fileName) ||
    /^(services?|crud|tasks)\.py$/.test(fileName) ||
    /_(service|repository|repo)\.dart$/.test(fileName) ||
    /(Service|Repository)\.cs$/.test(fileName)
  ) {
    return { role: "service", label: ROLE_LABELS.service };
  }

  // 8. Views (singular & plural)
  if (
    /(^|\/)(views?|screens?)\//i.test(norm) ||
    /^(views|viewsets|forms|admin)\.py$/.test(fileName) ||
    /_(screen|page|view)\.dart$/.test(fileName) ||
    /Screen\.[jt]sx?$/.test(fileName)
  ) {
    return { role: "view", label: ROLE_LABELS.view };
  }

  // 9. Handlers (singular & plural)
  if (
    /(^|\/)handlers?\//i.test(norm) ||
    /\.handler\.[jt]sx?$/.test(fileName) ||
    /^handlers?\.py$/.test(fileName) ||
    /(^|\/)supabase\/functions\//.test(norm) ||
    /(^|\/)functions\/src\//.test(norm)
  ) {
    return { role: "handler", label: ROLE_LABELS.handler };
  }

  // 10. Type definitions
  if (
    fileName.endsWith(".d.ts") ||
    fileName === "types.ts" ||
    /\.types\.[jt]sx?$/.test(fileName) ||
    /(^|\/)types\//.test(norm)
  ) {
    return { role: "types", label: ROLE_LABELS.types };
  }

  // 11. Hooks
  if (
    /(^|\/)use[A-Z].*\.[jt]sx?$/.test(norm) ||
    /(^|\/)hooks\//.test(norm)
  ) {
    return { role: "hook", label: ROLE_LABELS.hook };
  }

  // 12. Components
  if (
    ext === ".tsx" ||
    ext === ".jsx" ||
    /(^|\/)(components|widgets)\//i.test(norm) ||
    /_widget\.dart$/.test(fileName)
  ) {
    return { role: "component", label: ROLE_LABELS.component };
  }

  // 13. Entry points
  if (
    /^(index|main|app|server)\.[jt]sx?$/.test(fileName) ||
    /^(__main__|main|app|wsgi|asgi|manage)\.py$/.test(fileName) ||
    fileName === "main.dart" ||
    /^(Program|Startup)\.cs$/.test(fileName)
  ) {
    return { role: "entry", label: ROLE_LABELS.entry };
  }

  // 14. Scripts / CLI
  if (
    /(^|\/)(scripts|bin)\//.test(norm) ||
    fileName === "cli.ts" ||
    fileName === "cli.js" ||
    fileName === "cli.py"
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

const NON_ROUTABLE_ADAPTERS = new Set([
  "express",
  "Express",
  "Django",
  "React Native",
  "Flutter",
  "Supabase",
  "Firebase",
  "Python",
]);

/** Counts files matching route naming conventions; returns zero for adapters without static route conventions. */
export function countRoutes(files: readonly FileNode[], adapter?: string): number {
  if (adapter && NON_ROUTABLE_ADAPTERS.has(adapter)) return 0;
  return files.filter((f) => identifyConvention(f.path)?.role === "route").length;
}
