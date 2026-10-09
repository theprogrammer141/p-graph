import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { SourceFile } from "ts-morph";
import type { ExtractedRoute, FrameworkAdapter } from "../adapter.ts";

export const nextjsAdapter: FrameworkAdapter = {
  name: "Next.js",

  detect(root: string): boolean {
    const configNames = [
      "next.config.js",
      "next.config.mjs",
      "next.config.ts",
      "next.config.cjs",
    ];
    for (const name of configNames) {
      if (existsSync(path.join(/*turbopackIgnore: true*/ root, name))) return true;
    }

    const pkgPath = path.join(/*turbopackIgnore: true*/ root, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        const deps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
          ...pkg.peerDependencies,
        };
        if ("next" in deps) return true;
      } catch {
        // malformed package.json
      }
    }

    return false;
  },

  excludeDirectory(_relPath: string, name: string): string | null {
    if (name === "node_modules") return "dependencies (node_modules)";
    if (name.startsWith(".")) {
      if (name === ".next") return "build output (.next)";
      return "hidden directory";
    }
    if (name === "out" || name === "dist" || name === "build" || name === "coverage") {
      return `build output (${name})`;
    }
    return null;
  },

  assignRole(relPath: string, fileText?: string): string | null {
    const norm = relPath.replace(/\\/g, "/");

    // 1. Page routes
    if (/(^|\/)app\/(.+)?page\.[jt]sx?$/.test(norm)) {
      return "Page routes";
    }
    if (/(^|\/)pages\/(.+)\.[jt]sx?$/.test(norm)) {
      if (!/(^|\/)pages\/api\//.test(norm)) {
        const base = norm.split("/").pop() ?? "";
        if (
          !base.startsWith("_") &&
          !/^404\.[jt]sx?$/.test(base) &&
          !/^500\.[jt]sx?$/.test(base)
        ) {
          return "Page routes";
        }
      }
    }

    // 2. API endpoints
    if (/(^|\/)app\/(.+)?route\.[jt]sx?$/.test(norm)) {
      return "API endpoints";
    }
    if (/(^|\/)pages\/api\//.test(norm)) {
      return "API endpoints";
    }

    // 3. Server actions
    if (fileText) {
      const trimmed = fileText.trimStart();
      if (
        trimmed.startsWith('"use server"') ||
        trimmed.startsWith("'use server'")
      ) {
        return "Server actions";
      }
    }
    if (/(^|\/)actions\/|(\.|\/)actions?\.[jt]sx?$/.test(norm)) {
      return "Server actions";
    }

    return "Generic";
  },

  extractRoutes(relPath: string, sourceFile: SourceFile): ExtractedRoute[] {
    const norm = relPath.replace(/\\/g, "/");
    const routes: ExtractedRoute[] = [];

    // App Router: page.[jt]sx?
    if (/(^|\/)app\/(.+)?page\.[jt]sx?$/.test(norm)) {
      const pattern = deriveAppRouterPattern(norm, "page");
      if (pattern !== null) {
        routes.push({ filePath: relPath, method: "GET", path: pattern });
      }
      return routes;
    }

    // App Router: route.[jt]sx?
    if (/(^|\/)app\/(.+)?route\.[jt]sx?$/.test(norm)) {
      const pattern = deriveAppRouterPattern(norm, "route");
      if (pattern !== null) {
        const HTTP_METHODS = [
          "GET",
          "POST",
          "PUT",
          "PATCH",
          "DELETE",
          "HEAD",
          "OPTIONS",
        ];
        const exported = sourceFile.getExportedDeclarations();
        for (const method of HTTP_METHODS) {
          if (exported.has(method)) {
            routes.push({ filePath: relPath, method, path: pattern });
          }
        }
      }
      return routes;
    }

    // Pages Router: pages/**
    if (/(^|\/)pages\/(.+)\.[jt]sx?$/.test(norm)) {
      if (!/(^|\/)pages\/api\//.test(norm)) {
        const base = norm.split("/").pop() ?? "";
        if (
          !base.startsWith("_") &&
          !/^404\.[jt]sx?$/.test(base) &&
          !/^500\.[jt]sx?$/.test(base)
        ) {
          const pattern = derivePagesRouterPattern(norm);
          if (pattern !== null) {
            routes.push({ filePath: relPath, method: "GET", path: pattern });
          }
        }
      }
      return routes;
    }

    return routes;
  },
};

function deriveAppRouterPattern(
  normPath: string,
  kind: "page" | "route",
): string | null {
  // Strip everything up to and including 'app/'
  const appIndex = normPath.lastIndexOf("app/");
  if (appIndex < 0) return null;
  let rest = normPath.slice(appIndex + 4);

  // Strip trailing '/page.[jt]sx?' or '/route.[jt]sx?'
  if (kind === "page") {
    rest = rest.replace(/\/?page\.[jt]sx?$/, "");
  } else {
    rest = rest.replace(/\/?route\.[jt]sx?$/, "");
  }

  if (!rest) return "/";

  // Filter out route groups e.g. '(auth)', '(marketing)'
  const segments = rest
    .split("/")
    .filter(Boolean)
    .filter((s) => !/^\(.*\)$/.test(s));

  if (segments.length === 0) return "/";
  return "/" + segments.join("/");
}

function derivePagesRouterPattern(normPath: string): string | null {
  const pagesIndex = normPath.lastIndexOf("pages/");
  if (pagesIndex < 0) return null;
  let rest = normPath.slice(pagesIndex + 6);

  // Strip extension
  rest = rest.replace(/\.[jt]sx?$/, "");

  if (rest === "index") return "/";
  if (rest.endsWith("/index")) {
    rest = rest.slice(0, -6);
  }

  if (!rest) return "/";
  return "/" + rest;
}
