import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ExtractedRoute, FrameworkAdapter } from "../adapter.ts";

/**
 * Identifies roles in an Express codebase from directory and naming conventions,
 * accepting both singular and plural folder names.
 */
export function identifyExpressRole(relPath: string): string | null {
  const norm = relPath.replace(/\\/g, "/");
  const fileName = norm.split("/").pop() ?? "";

  if (
    /\.(spec|test)\.[jt]sx?$/.test(fileName) ||
    /(^|\/)(__tests__|test|tests)\//.test(norm)
  ) {
    return "Generic";
  }

  // 1. Routes / Routers (singular & plural, or .route.js / .router.js)
  if (
    /(^|\/)(routes?|routers?)\//.test(norm) ||
    /\.(route|router)\.[jt]sx?$/.test(fileName)
  ) {
    return "Routes";
  }

  // 2. Controllers (singular & plural, or .controller.js)
  if (
    /(^|\/)controllers?\//.test(norm) ||
    /\.controller\.[jt]sx?$/.test(fileName)
  ) {
    return "Controllers";
  }

  // 3. Middleware (singular & plural, or .middleware.js)
  if (
    /(^|\/)middlewares?\//.test(norm) ||
    /\.middleware\.[jt]sx?$/.test(fileName) ||
    /^(middleware|proxy)\.[jt]sx?$/.test(fileName)
  ) {
    return "Middleware";
  }

  // 4. Models (singular & plural, or .model.js)
  if (
    /(^|\/)models?\//.test(norm) ||
    /\.model\.[jt]sx?$/.test(fileName)
  ) {
    return "Models";
  }

  // 5. Services (singular & plural, or .service.js)
  if (
    /(^|\/)services?\//.test(norm) ||
    /\.service\.[jt]sx?$/.test(fileName)
  ) {
    return "Services";
  }

  // 6. Views (singular & plural)
  if (/(^|\/)views?\//.test(norm)) {
    return "Views";
  }

  // 7. Handlers (singular & plural, or .handler.js)
  if (
    /(^|\/)handlers?\//.test(norm) ||
    /\.handler\.[jt]sx?$/.test(fileName)
  ) {
    return "Handlers";
  }

  return "Generic";
}

export const expressAdapter: FrameworkAdapter = {
  name: "Express",

  detect(root: string): boolean {
    const pkgPath = path.join(/*turbopackIgnore: true*/ root, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (pkg.name === "express") return true;
        const deps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
          ...pkg.peerDependencies,
        };
        if ("express" in deps) return true;
      } catch {
        // malformed package.json
      }
    }
    return false;
  },

  excludeDirectory(_relPath: string, name: string): string | null {
    if (name === "node_modules") return "dependencies (node_modules)";
    if (name.startsWith(".")) return "hidden directory";
    if (
      name === "dist" ||
      name === "build" ||
      name === "coverage" ||
      name === "out"
    ) {
      return `build output (${name})`;
    }
    return null;
  },

  assignRole(relPath: string): string | null {
    return identifyExpressRole(relPath);
  },

  extractRoutes(): ExtractedRoute[] {
    return [];
  },
};
