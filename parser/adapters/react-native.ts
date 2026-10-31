import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ExtractedRoute, FrameworkAdapter } from "../adapter.ts";

export const reactNativeAdapter: FrameworkAdapter = {
  name: "React Native",

  /** Recognizes React Native or Expo from package.json dependencies or Metro/RN configs. */
  detect(root: string): boolean {
    const configNames = [
      "metro.config.js",
      "metro.config.cjs",
      "metro.config.mjs",
      "react-native.config.js",
    ];
    for (const name of configNames) {
      if (existsSync(path.join(/*turbopackIgnore: true*/ root, name))) return true;
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
        if ("react-native" in deps || "expo" in deps) return true;
      } catch {
        // malformed package.json
      }
    }

    const appJsonPath = path.join(/*turbopackIgnore: true*/ root, "app.json");
    if (existsSync(appJsonPath)) {
      try {
        const appJson = JSON.parse(readFileSync(appJsonPath, "utf8"));
        if (appJson && typeof appJson === "object" && "expo" in appJson) {
          return true;
        }
      } catch {
        // malformed app.json
      }
    }

    return false;
  },

  /** Excludes node_modules, native ios/android folders, Expo caches, and build outputs. */
  excludeDirectory(_relPath: string, name: string): string | null {
    if (name === "node_modules") return "dependencies (node_modules)";
    if (name === "ios" || name === "android") {
      return `native platform project (${name})`;
    }
    if (name.startsWith(".")) {
      if (name === ".expo") return "build output (.expo)";
      return "hidden directory";
    }
    if (
      name === "dist" ||
      name === "build" ||
      name === "out" ||
      name === "coverage" ||
      name === "web-build"
    ) {
      return `build output (${name})`;
    }
    return null;
  },

  /** Classifies React Native screens, navigation, hooks, components, services, and state. */
  assignRole(relPath: string): string | null {
    const norm = relPath.replace(/\\/g, "/");
    const fileName = norm.split("/").pop() ?? "";

    if (
      /\.(spec|test)\.[jt]sx?$/.test(fileName) ||
      /(^|\/)(__tests__|test|tests)\//.test(norm)
    ) {
      return "Generic";
    }

    if (
      /(^|\/)navigation\/.*\.[jt]sx?$/.test(norm) ||
      /(Navigator|Navigation)\.[jt]sx?$/.test(fileName)
    ) {
      return "Navigation";
    }
    if (
      /(^|\/)(screens?|pages?|app)\/.*\.[jt]sx?$/.test(norm) ||
      /Screen\.[jt]sx?$/.test(fileName)
    ) {
      return "Screens";
    }
    if (/^use[A-Z].*\.[jt]sx?$/.test(fileName) || /(^|\/)hooks?\/.*\.[jt]sx?$/.test(norm)) {
      return "Hooks";
    }
    if (/(^|\/)(services?|api)\/.*\.[jt]sx?$/.test(norm)) {
      return "Services";
    }
    if (/(^|\/)(store|slices?|state|context|providers?)\/.*\.[jt]sx?$/.test(norm)) {
      return "State";
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

  /** React Native navigation trees are assembled at runtime and do not expose static HTTP routes. */
  extractRoutes(): ExtractedRoute[] {
    return [];
  },
};

