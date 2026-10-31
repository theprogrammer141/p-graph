import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ExtractedRoute, FrameworkAdapter } from "../adapter.ts";

export const firebaseAdapter: FrameworkAdapter = {
  name: "Firebase",

  /** Recognizes Firebase from firebase.json, .firebaserc, or declared Firebase SDK dependencies. */
  detect(root: string): boolean {
    if (
      existsSync(path.join(/*turbopackIgnore: true*/ root, "firebase.json")) ||
      existsSync(path.join(/*turbopackIgnore: true*/ root, ".firebaserc"))
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
          "firebase" in deps ||
          "firebase-admin" in deps ||
          "firebase-functions" in deps ||
          "@angular/fire" in deps ||
          "react-firebase-hooks" in deps
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
          if (
            /(^|[\s"'\n\[,=])firebase[-_]admin($|[\s"'\n=,<>!~\[\]])/i.test(
              readFileSync(p, "utf8"),
            )
          ) {
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
        if (/\b(firebase_core|cloud_firestore|firebase_auth)\s*:/i.test(readFileSync(pubspec, "utf8"))) {
          return true;
        }
      } catch {
        // ignore
      }
    }

    return false;
  },

  /** Excludes dependencies, Firebase emulator/cache directories, compiled functions/lib output, and build directories. */
  excludeDirectory(relPath: string, name: string): string | null {
    if (name === "node_modules") return "dependencies (node_modules)";
    if (name === "venv" || name === "env" || name === "virtualenv") {
      return `virtual environment (${name})`;
    }
    if (name === "__pycache__") return "bytecode cache (__pycache__)";
    if (name.startsWith(".")) {
      if (name === ".firebase") return "build output (.firebase)";
      if (name === ".venv") return "virtual environment (.venv)";
      return "hidden directory";
    }
    if (relPath === "functions/lib") return "build output (functions/lib)";
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

  /** Classifies Firebase Cloud Functions, config/SDK setup, services/Firestore, hooks, and components. */
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

    if (
      /(^|\/)functions\/src\/.*\.[jt]sx?$/.test(norm) ||
      /(^|\/)functions\/index\.[jt]sx?$/.test(norm)
    ) {
      return "Cloud functions";
    }
    if (
      /^firebase[-\w]*\.[jt]sx?$/.test(fileName) ||
      /(^|\/)lib\/firebase\/.*\.[jt]sx?$/.test(norm)
    ) {
      return "Firebase config";
    }
    if (
      /(^|\/)(services?|firestore|repositories|api|auth)\/.*\.(ts|tsx|js|jsx|py)$/.test(
        norm,
      )
    ) {
      return "Services";
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

  /** Firebase Cloud Functions and client apps do not expose static HTTP route patterns from syntax. */
  extractRoutes(): ExtractedRoute[] {
    return [];
  },
};

