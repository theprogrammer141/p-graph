import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ExtractedRoute, FrameworkAdapter } from "../adapter.ts";

export const supabaseAdapter: FrameworkAdapter = {
  name: "Supabase",

  /** Recognizes Supabase from supabase/config.toml, supabase/functions, or declared SDK dependencies. */
  detect(root: string): boolean {
    if (
      existsSync(
        path.join(/*turbopackIgnore: true*/ root, "supabase", "config.toml"),
      ) ||
      existsSync(
        path.join(/*turbopackIgnore: true*/ root, "supabase", "functions"),
      )
    ) {
      return true;
    }

    const pkgPath = path.join(/*turbopackIgnore: true*/ root, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        const deps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
          ...pkg.peerDependencies,
        };
        if (
          "@supabase/supabase-js" in deps ||
          "@supabase/ssr" in deps ||
          "supabase" in deps
        ) {
          return true;
        }
      } catch {
        // malformed package.json
      }
    }

    for (const pyManifest of ["pyproject.toml", "requirements.txt", "Pipfile"]) {
      const p = path.join(/*turbopackIgnore: true*/ root, pyManifest);
      if (existsSync(p)) {
        try {
          if (/(^|[\s"'\n\[,=])supabase($|[\s"'\n=,<>!~\[\]])/i.test(readFileSync(p, "utf8"))) {
            return true;
          }
        } catch {
          // ignore
        }
      }
    }

    const pubspec = path.join(/*turbopackIgnore: true*/ root, "pubspec.yaml");
    if (existsSync(pubspec)) {
      try {
        if (/\bsupabase(_flutter)?\s*:/i.test(readFileSync(pubspec, "utf8"))) {
          return true;
        }
      } catch {
        // ignore
      }
    }

    return false;
  },

  /** Excludes dependencies, Supabase CLI temp state, virtual environments, and build outputs. */
  excludeDirectory(_relPath: string, name: string): string | null {
    if (name === "node_modules") return "dependencies (node_modules)";
    if (name === "venv" || name === "env" || name === "virtualenv") {
      return `virtual environment (${name})`;
    }
    if (name === "__pycache__") return "bytecode cache (__pycache__)";
    if (name.startsWith(".")) {
      if (name === ".venv") return "virtual environment (.venv)";
      return "hidden directory";
    }
    if (
      name === "dist" ||
      name === "build" ||
      name === "out" ||
      name === "coverage"
    ) {
      return `build output (${name})`;
    }
    return null;
  },

  /** Classifies Supabase edge functions, client/auth helpers, database types, data access, hooks, and components. */
  assignRole(relPath: string): string | null {
    const norm = relPath.replace(/\\/g, "/");
    const fileName = norm.split("/").pop() ?? "";

    if (
      /\.(spec|test)\.[jt]sx?$/.test(fileName) ||
      /^test_.*\.py$/.test(fileName) ||
      /(^|\/)(__tests__|test|tests)\//.test(norm)
    ) {
      return "Generic";
    }

    if (/(^|\/)supabase\/functions\/.*\.[jt]sx?$/.test(norm)) {
      return "Edge functions";
    }
    if (
      /database\.types\.[jt]s$/.test(fileName) ||
      /(^|\/)supabase\/(?:.*\/)?(schema|types)\/.*\.[jt]s$/.test(norm)
    ) {
      return "Database types";
    }
    if (
      /^(supabase|auth)[-\w]*\.[jt]sx?$/.test(fileName) ||
      /(^|\/)lib\/supabase\/.*\.[jt]sx?$/.test(norm) ||
      /(^|\/)supabase\/.*\.[jt]sx?$/.test(norm)
    ) {
      return "Client & Auth";
    }
    if (
      /(^|\/)(queries|mutations|repositories|services|actions|api)\/.*\.(ts|tsx|js|jsx|py)$/.test(
        norm,
      )
    ) {
      return "Data access";
    }
    if (/^use[A-Z].*\.[jt]sx?$/.test(fileName) || /(^|\/)hooks?\/.*\.[jt]sx?$/.test(norm)) {
      return "Hooks";
    }
    if (
      fileName.endsWith(".tsx") ||
      fileName.endsWith(".jsx") ||
      /(^|\/)components?\/.*\.[jt]sx?$/.test(norm)
    ) {
      return "Components";
    }

    return "Generic";
  },

  /** Supabase repositories do not expose static HTTP route patterns from syntax. */
  extractRoutes(): ExtractedRoute[] {
    return [];
  },
};

