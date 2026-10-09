import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ExtractedRoute, FrameworkAdapter } from "../adapter.ts";

export const reactAdapter: FrameworkAdapter = {
  name: "React",

  detect(root: string): boolean {
    const pkgPath = path.join(/*turbopackIgnore: true*/ root, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        const deps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
          ...pkg.peerDependencies,
        };
        if ("react" in deps) return true;
      } catch {
        // malformed package.json
      }
    }
    return false;
  },

  excludeDirectory(_relPath: string, name: string): string | null {
    if (name === "node_modules") return "dependencies (node_modules)";
    if (name.startsWith(".")) return "hidden directory";
    if (name === "dist" || name === "build" || name === "coverage") {
      return `build output (${name})`;
    }
    return null;
  },

  assignRole(relPath: string): string | null {
    const norm = relPath.replace(/\\/g, "/");
    const fileName = norm.split("/").pop() ?? "";

    if (/\.(spec|test)\.[jt]sx?$/.test(fileName)) {
      return "Generic";
    }

    // 1. Hooks: use[A-Z] or inside hooks/ directory
    if (/^use[A-Z].*\.[jt]sx?$/.test(fileName) || /(^|\/)hooks\//.test(norm)) {
      return "Hooks";
    }

    // 2. Components: .tsx, .jsx, or inside components/ directory
    if (
      fileName.endsWith(".tsx") ||
      fileName.endsWith(".jsx") ||
      /(^|\/)components\//.test(norm)
    ) {
      return "Components";
    }

    return "Generic";
  },

  extractRoutes(): ExtractedRoute[] {
    return [];
  },
};
