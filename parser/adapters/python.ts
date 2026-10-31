import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import type { ExtractedRoute, FrameworkAdapter } from "../adapter.ts";

export const pythonAdapter: FrameworkAdapter = {
  name: "Python",

  /** Recognizes a Python repository from standard packaging manifests or root .py files. */
  detect(root: string): boolean {
    const manifests = [
      "pyproject.toml",
      "requirements.txt",
      "Pipfile",
      "setup.py",
      "setup.cfg",
    ];
    for (const name of manifests) {
      if (existsSync(path.join(/*turbopackIgnore: true*/ root, name))) return true;
    }

    try {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".py")) return true;
      }
    } catch {
      // ignore unreadable root
    }

    return false;
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
      name === "htmlcov" ||
      name === "eggs"
    ) {
      return `build output (${name})`;
    }
    return null;
  },

  /** Classifies Python entry points, models, services, handlers, utilities, and configuration. */
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

    if (/^(__main__|main|app|cli|wsgi|asgi)\.py$/.test(fileName)) {
      return "Entry points";
    }
    if (/(^|\/)models?\/.*\.py$/.test(norm) || /^models?\.py$/.test(fileName)) {
      return "Models";
    }
    if (/(^|\/)services?\/.*\.py$/.test(norm) || /^services?\.py$/.test(fileName)) {
      return "Services";
    }
    if (/(^|\/)handlers?\/.*\.py$/.test(norm) || /^handlers?\.py$/.test(fileName)) {
      return "Handlers";
    }
    if (
      /(^|\/)(utils?|helpers?)\/.*\.py$/.test(norm) ||
      /^(utils?|helpers?)\.py$/.test(fileName)
    ) {
      return "Utils";
    }
    if (
      /(^|\/)(config|settings)\/.*\.py$/.test(norm) ||
      /^(config|settings|constants)\.py$/.test(fileName)
    ) {
      return "Config";
    }

    return "Generic";
  },

  /** Generic Python repositories have no HTTP routing conventions. */
  extractRoutes(): ExtractedRoute[] {
    return [];
  },
};

