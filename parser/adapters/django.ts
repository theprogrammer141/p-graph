import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ExtractedRoute, FrameworkAdapter } from "../adapter.ts";

function hasPythonDependency(root: string, pkgName: string): boolean {
  const candidates = [
    "pyproject.toml",
    "requirements.txt",
    "Pipfile",
    "setup.py",
    "setup.cfg",
  ];
  const pattern = new RegExp(
    `(^|[\\s"'\\n\\[,=])${pkgName}($|[\\s"'\\n=,<>!~\\[\\]])`,
    "i",
  );

  for (const name of candidates) {
    const filePath = path.join(/*turbopackIgnore: true*/ root, name);
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, "utf8");
        if (pattern.test(content)) return true;
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
      // ignore unreadable requirements directory
    }
  }

  return false;
}

export const djangoAdapter: FrameworkAdapter = {
  name: "Django",

  /** Recognizes Django from manage.py or a declared django dependency. */
  detect(root: string): boolean {
    const rootManage = path.join(/*turbopackIgnore: true*/ root, "manage.py");
    if (existsSync(rootManage)) {
      try {
        const text = readFileSync(rootManage, "utf8");
        if (text.includes("django") || text.includes("DJANGO_SETTINGS_MODULE")) {
          return true;
        }
      } catch {
        // ignore unreadable manage.py
      }
    }

    // Check one directory level deep for manage.py (e.g., backend/manage.py)
    try {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
        const subManage = path.join(
          /*turbopackIgnore: true*/ root,
          entry.name,
          "manage.py",
        );
        if (existsSync(subManage)) {
          const text = readFileSync(subManage, "utf8");
          if (text.includes("django") || text.includes("DJANGO_SETTINGS_MODULE")) {
            return true;
          }
        }
      }
    } catch {
      // ignore unreadable root
    }

    return hasPythonDependency(root, "django");
  },

  /** Excludes virtual environments, bytecode caches, hidden directories, and static/media outputs. */
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
      name === "staticfiles" ||
      name === "media"
    ) {
      return `build output (${name})`;
    }
    return null;
  },

  /** Classifies Django modules by file and folder conventions. */
  assignRole(relPath: string): string | null {
    const norm = relPath.replace(/\\/g, "/");
    const fileName = norm.split("/").pop() ?? "";

    if (
      /^test_.*\.py$/.test(fileName) ||
      /.*_test\.py$/.test(fileName) ||
      fileName === "tests.py" ||
      fileName === "conftest.py" ||
      /(^|\/)(tests?|__tests__)\//.test(norm)
    ) {
      return "Generic";
    }

    if (/(^|\/)migrations\/.*\.py$/.test(norm)) return "Migrations";
    if (/^(views|viewsets)\.py$/.test(fileName) || /(^|\/)views\/.*\.py$/.test(norm)) {
      return "Views";
    }
    if (fileName === "models.py" || /(^|\/)models\/.*\.py$/.test(norm)) {
      return "Models";
    }
    if (fileName === "urls.py" || /(^|\/)urls\/.*\.py$/.test(norm)) {
      return "URLs";
    }
    if (fileName === "serializers.py" || /(^|\/)serializers\/.*\.py$/.test(norm)) {
      return "Serializers";
    }
    if (fileName === "forms.py" || /(^|\/)forms\/.*\.py$/.test(norm)) {
      return "Forms";
    }
    if (fileName === "admin.py" || /(^|\/)admin\/.*\.py$/.test(norm)) {
      return "Admin";
    }
    if (/^(tasks|celery)\.py$/.test(fileName) || /(^|\/)tasks\/.*\.py$/.test(norm)) {
      return "Tasks";
    }
    if (/^middlewares?\.py$/.test(fileName) || /(^|\/)middlewares?\/.*\.py$/.test(norm)) {
      return "Middleware";
    }

    return "Generic";
  },

  /** Django routes span cross-file include() chains and cannot be recovered from single-file syntax. */
  extractRoutes(): ExtractedRoute[] {
    return [];
  },
};

