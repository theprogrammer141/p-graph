import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { SourceFile } from "ts-morph";
import type { ExtractedRoute, FrameworkAdapter } from "../adapter.ts";

const FASTAPI_METHODS: Readonly<Record<string, string>> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  delete: "DELETE",
  patch: "PATCH",
  options: "OPTIONS",
  head: "HEAD",
};

function hasFastApiDependency(root: string): boolean {
  const candidates = [
    "pyproject.toml",
    "requirements.txt",
    "Pipfile",
    "setup.py",
    "setup.cfg",
  ];
  const pattern = /(^|[\s"'\n\[,=])fastapi($|[\s"'\n=,<>!~\[\]])/i;

  for (const name of candidates) {
    const filePath = path.join(/*turbopackIgnore: true*/ root, name);
    if (existsSync(filePath)) {
      try {
        if (pattern.test(readFileSync(filePath, "utf8"))) return true;
      } catch {
        // ignore unreadable file
      }
    }
  }

  const reqDir = path.join(/*turbopackIgnore: true*/ root, "requirements");
  if (existsSync(reqDir)) {
    try {
      for (const entry of readdirSync(reqDir)) {
        if (entry.endsWith(".txt")) {
          const content = readFileSync(
            path.join(/*turbopackIgnore: true*/ reqDir, entry),
            "utf8",
          );
          if (pattern.test(content)) return true;
        }
      }
    } catch {
      // ignore unreadable directory
    }
  }

  return false;
}

function joinRoutePath(prefix: string, subpath: string): string {
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, "");
  const cleanSub = subpath.replace(/^\/+|\/+$/g, "");
  if (!cleanPrefix && !cleanSub) return "/";
  if (!cleanPrefix) return `/${cleanSub}`;
  if (!cleanSub) return `/${cleanPrefix}`;
  return `/${cleanPrefix}/${cleanSub}`;
}

export const fastapiAdapter: FrameworkAdapter = {
  name: "FastAPI",

  /** Recognizes FastAPI from Python dependency manifests. */
  detect(root: string): boolean {
    return hasFastApiDependency(root);
  },

  /** Excludes virtual environments, bytecode caches, hidden directories, and build outputs. */
  excludeDirectory(_relPath: string, name: string): string | null {
    if (name === "node_modules") return "dependencies (node_modules)";
    if (
      name === "venv" ||
      name === "env" ||
      name === "virtualenv" ||
      name === "site-packages"
    ) {
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
      name === "coverage" ||
      name === "htmlcov"
    ) {
      return `build output (${name})`;
    }
    return null;
  },

  /** Classifies FastAPI routers, schemas, models, services, dependencies, CRUD, and middleware. */
  assignRole(relPath: string): string | null {
    const norm = relPath.replace(/\\/g, "/");
    const fileName = norm.split("/").pop() ?? "";

    if (
      /^test_.*\.py$/.test(fileName) ||
      /.*_test\.py$/.test(fileName) ||
      fileName === "conftest.py" ||
      /(^|\/)(tests?|__tests__)\//.test(norm)
    ) {
      return "Generic";
    }

    if (
      /(^|\/)(routers?|endpoints?|routes?|api)\/.*\.py$/.test(norm) ||
      /^(routers?|endpoints?|routes?)\.py$/.test(fileName)
    ) {
      return "Routers";
    }
    if (/(^|\/)schemas?\/.*\.py$/.test(norm) || /^schemas?\.py$/.test(fileName)) {
      return "Schemas";
    }
    if (/(^|\/)models?\/.*\.py$/.test(norm) || /^models?\.py$/.test(fileName)) {
      return "Models";
    }
    if (/(^|\/)services?\/.*\.py$/.test(norm) || /^services?\.py$/.test(fileName)) {
      return "Services";
    }
    if (
      /(^|\/)(dependencies|deps)\/.*\.py$/.test(norm) ||
      /^(dependencies|deps)\.py$/.test(fileName)
    ) {
      return "Dependencies";
    }
    if (/(^|\/)crud\/.*\.py$/.test(norm) || fileName === "crud.py") {
      return "CRUD";
    }
    if (
      /(^|\/)middlewares?\/.*\.py$/.test(norm) ||
      /^middlewares?\.py$/.test(fileName)
    ) {
      return "Middleware";
    }

    return "Generic";
  },

  /**
   * Extracts FastAPI routes from `@<app_or_router>.<method>("/literal")` decorators
   * when both the instance prefix and decorator path are string literals in the same file.
   */
  extractRoutes(
    relPath: string,
    _sourceFile: SourceFile,
    fileText?: string,
  ): ExtractedRoute[] {
    if (!relPath.endsWith(".py") || !fileText) return [];
    const routes: ExtractedRoute[] = [];

    // Map variable name -> literal prefix string (or null when prefix is dynamic)
    const routerPrefixes = new Map<string, string | null>();
    for (const m of fileText.matchAll(
      /^\s*([A-Za-z_]\w*)\s*=\s*(?:fastapi\.)?(FastAPI|APIRouter)\s*\(([\s\S]*?)\)/gm,
    )) {
      const varName = m[1];
      const argsText = m[3] ?? "";
      const prefixProp = /\bprefix\s*=\s*([^\n,)]+)/.exec(argsText);
      if (!prefixProp) {
        routerPrefixes.set(varName, "");
      } else {
        const rawVal = prefixProp[1].trim();
        const litMatch = /^(?!f["']|F["'])(["'])([^"']*)\1$/.exec(rawVal);
        routerPrefixes.set(varName, litMatch ? litMatch[2] : null);
      }
    }

    for (const m of fileText.matchAll(
      /^\s*@([A-Za-z_]\w*)\.(get|post|put|delete|patch|options|head)\s*\(\s*(?:path\s*=\s*)?([fFrR]?["'][^"']*["'])/gm,
    )) {
      const varName = m[1];
      const methodKey = m[2].toLowerCase();
      const rawPathArg = m[3];
      const httpMethod = FASTAPI_METHODS[methodKey];
      if (!httpMethod) continue;

      const prefix = routerPrefixes.get(varName);
      if (prefix === undefined || prefix === null) continue;

      // Reject f-strings or non-plain string literals
      if (/^[fF]/.test(rawPathArg)) continue;
      const litMatch = /^r?(["'])([^"']*)\1$/i.exec(rawPathArg);
      if (!litMatch) continue;

      const fullPath = joinRoutePath(prefix, litMatch[2]);
      routes.push({
        filePath: relPath,
        method: httpMethod,
        path: fullPath,
      });
    }

    return routes;
  },
};

