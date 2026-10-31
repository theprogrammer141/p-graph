import type { SourceFile } from "ts-morph";
import type { ExtractedRoute, FrameworkAdapter } from "../adapter.ts";
import {
  extractBalancedParens,
  hasPythonDependency,
  joinRoutePath,
} from "./shared.ts";

const FLASK_SHORTHAND_METHODS: Readonly<Record<string, string>> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  delete: "DELETE",
  patch: "PATCH",
};

export const flaskAdapter: FrameworkAdapter = {
  name: "Flask",

  /** Recognizes Flask from Python dependency manifests. */
  detect(root: string): boolean {
    return hasPythonDependency(root, "flask");
  },

  /** Excludes virtual environments, bytecode caches, hidden directories, instance, and build outputs. */
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
      name === "htmlcov" ||
      name === "instance"
    ) {
      return `build output (${name})`;
    }
    return null;
  },

  /** Classifies Flask blueprints/views, models, forms, services, and extensions. */
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
      /(^|\/)(blueprints?|views?|routes?)\/.*\.py$/.test(norm) ||
      /^(blueprints?|views?|routes?)\.py$/.test(fileName)
    ) {
      return "Blueprints";
    }
    if (/(^|\/)models?\/.*\.py$/.test(norm) || /^models?\.py$/.test(fileName)) {
      return "Models";
    }
    if (/(^|\/)forms?\/.*\.py$/.test(norm) || /^forms?\.py$/.test(fileName)) {
      return "Forms";
    }
    if (/(^|\/)services?\/.*\.py$/.test(norm) || /^services?\.py$/.test(fileName)) {
      return "Services";
    }
    if (
      /(^|\/)extensions?\/.*\.py$/.test(norm) ||
      /^extensions?\.py$/.test(fileName)
    ) {
      return "Extensions";
    }

    return "Generic";
  },

  /**
   * Extracts Flask routes from `@<app_or_bp>.route("/literal", methods=[...])` and
   * `@<app_or_bp>.(get|post|put|delete|patch)("/literal")` when both prefix and path are literals.
   */
  extractRoutes(
    relPath: string,
    _sourceFile: SourceFile,
    fileText?: string,
  ): ExtractedRoute[] {
    if (!relPath.endsWith(".py") || !fileText) return [];
    const routes: ExtractedRoute[] = [];

    const prefixes = new Map<string, string | null>();
    for (const m of fileText.matchAll(
      /^\s*([A-Za-z_]\w*)\s*=\s*(?:flask\.)?(Flask|Blueprint)\s*\(/gm,
    )) {
      const varName = m[1];
      const kind = m[2];
      const openParenIndex = (m.index ?? 0) + m[0].length - 1;
      const balanced = extractBalancedParens(fileText, openParenIndex);
      if (!balanced) {
        prefixes.set(varName, null);
        continue;
      }
      if (kind === "Flask") {
        prefixes.set(varName, "");
        continue;
      }
      const argsText = balanced.content;
      const prefixProp = /\burl_prefix\s*=\s*([fFrR]?"(?:\\.|[^"\\])*"|[fFrR]?'(?:\\.|[^'\\])*'|[^\n,)]+)/.exec(
        argsText,
      );
      if (!prefixProp) {
        prefixes.set(varName, "");
      } else {
        const rawVal = prefixProp[1].trim();
        const litMatch = /^(?!f["']|F["'])(["'])([^"']*)\1$/.exec(rawVal);
        prefixes.set(varName, litMatch ? litMatch[2] : null);
      }
    }

    // 1. `@var.route("/literal", ...)`
    for (const m of fileText.matchAll(/^\s*@([A-Za-z_]\w*)\.route\s*\(/gm)) {
      const varName = m[1];
      const openParenIndex = (m.index ?? 0) + m[0].length - 1;
      const balanced = extractBalancedParens(fileText, openParenIndex);
      if (!balanced) continue;

      const pathArgMatch = /^\s*(?:rule\s*=\s*)?([fFrR]?["'][^"']*["'])([\s\S]*)$/.exec(
        balanced.content,
      );
      if (!pathArgMatch) continue;
      const rawPathArg = pathArgMatch[1];
      const restArgs = pathArgMatch[2] ?? "";

      const prefix = prefixes.get(varName);
      if (prefix === undefined || prefix === null) continue;
      if (/^[fF]/.test(rawPathArg)) continue;
      const litMatch = /^r?(["'])([^"']*)\1$/i.exec(rawPathArg);
      if (!litMatch) continue;

      const fullPath = joinRoutePath(prefix, litMatch[2]);
      const methodsMatch = /\bmethods\s*=\s*(\[[^\]]*\]|\([^)]*\))/.exec(restArgs);
      if (!methodsMatch) {
        routes.push({ filePath: relPath, method: "GET", path: fullPath });
        continue;
      }

      const listBody = methodsMatch[1].slice(1, -1).trim();
      if (!listBody) continue;
      const rawItems = listBody
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const parsedMethods: string[] = [];
      let allLiteral = true;
      for (const item of rawItems) {
        const itemMatch = /^(["'])([A-Za-z]+)\1$/.exec(item);
        if (!itemMatch) {
          allLiteral = false;
          break;
        }
        parsedMethods.push(itemMatch[2].toUpperCase());
      }
      if (!allLiteral) continue;
      for (const method of parsedMethods) {
        routes.push({ filePath: relPath, method, path: fullPath });
      }
    }

    // 2. `@var.(get|post|put|delete|patch)("/literal", ...)`
    for (const m of fileText.matchAll(
      /^\s*@([A-Za-z_]\w*)\.(get|post|put|delete|patch)\s*\(\s*([fFrR]?["'][^"']*["'])/gm,
    )) {
      const varName = m[1];
      const httpMethod = FLASK_SHORTHAND_METHODS[m[2].toLowerCase()];
      const rawPathArg = m[3];
      if (!httpMethod) continue;

      const prefix = prefixes.get(varName);
      if (prefix === undefined || prefix === null) continue;
      if (/^[fF]/.test(rawPathArg)) continue;
      const litMatch = /^r?(["'])([^"']*)\1$/i.exec(rawPathArg);
      if (!litMatch) continue;

      const fullPath = joinRoutePath(prefix, litMatch[2]);
      routes.push({ filePath: relPath, method: httpMethod, path: fullPath });
    }

    return routes;
  },
};

