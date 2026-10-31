import type { SourceFile } from "ts-morph";
import type { ExtractedRoute, FrameworkAdapter } from "../adapter.ts";
import {
  extractBalancedParens,
  hasPythonDependency,
  joinRoutePath,
} from "./shared.ts";

const FASTAPI_METHODS: Readonly<Record<string, string>> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  delete: "DELETE",
  patch: "PATCH",
  options: "OPTIONS",
  head: "HEAD",
};

export const fastapiAdapter: FrameworkAdapter = {
  name: "FastAPI",

  /** Recognizes FastAPI from Python dependency manifests. */
  detect(root: string): boolean {
    return hasPythonDependency(root, "fastapi");
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

    // Map variable name -> literal prefix string (or null when prefix is dynamic/unparseable)
    const routerPrefixes = new Map<string, string | null>();
    for (const m of fileText.matchAll(
      /^\s*([A-Za-z_]\w*)\s*=\s*(?:fastapi\.)?(FastAPI|APIRouter)\s*\(/gm,
    )) {
      const varName = m[1];
      const openParenIndex = (m.index ?? 0) + m[0].length - 1;
      const balanced = extractBalancedParens(fileText, openParenIndex);
      if (!balanced) {
        routerPrefixes.set(varName, null);
        continue;
      }
      const argsText = balanced.content;
      const prefixProp = /\bprefix\s*=\s*([fFrR]?"(?:\\.|[^"\\])*"|[fFrR]?'(?:\\.|[^'\\])*'|[^\n,)]+)/.exec(
        argsText,
      );
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

