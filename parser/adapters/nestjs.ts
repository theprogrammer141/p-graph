import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { type Decorator, type SourceFile, SyntaxKind } from "ts-morph";
import type { ExtractedRoute, FrameworkAdapter } from "../adapter.ts";

const NEST_HTTP_METHODS: Readonly<Record<string, string>> = {
  Get: "GET",
  Post: "POST",
  Put: "PUT",
  Delete: "DELETE",
  Patch: "PATCH",
  Options: "OPTIONS",
  Head: "HEAD",
  All: "ALL",
};

export const nestjsAdapter: FrameworkAdapter = {
  name: "NestJS",

  detect(root: string): boolean {
    if (existsSync(path.join(/*turbopackIgnore: true*/ root, "nest-cli.json"))) return true;

    const pkgPath = path.join(/*turbopackIgnore: true*/ root, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        const deps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
          ...pkg.peerDependencies,
        };
        if ("@nestjs/core" in deps || "@nestjs/common" in deps) return true;
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

    // Ignore test files
    if (/\.(spec|test)\.[jt]sx?$/.test(fileName)) {
      return "Generic";
    }

    if (/\.controller\.[jt]sx?$/.test(fileName)) return "Controllers";
    if (/\.service\.[jt]sx?$/.test(fileName)) return "Services";
    if (/\.module\.[jt]sx?$/.test(fileName)) return "Modules";
    if (/\.entity\.[jt]sx?$/.test(fileName)) return "Entities";

    return "Generic";
  },

  extractRoutes(relPath: string, sourceFile: SourceFile): ExtractedRoute[] {
    const routes: ExtractedRoute[] = [];
    const classes = sourceFile.getClasses();

    for (const cls of classes) {
      const controllerDec = cls.getDecorator("Controller");
      if (!controllerDec) continue;

      const prefix = extractControllerPrefix(controllerDec);
      if (prefix === null) {
        // Dynamic prefix: cannot recover with certainty without inference.
        // Omit rather than guess.
        continue;
      }

      for (const method of cls.getMethods()) {
        for (const dec of method.getDecorators()) {
          const decName = dec.getName();
          const httpMethod = NEST_HTTP_METHODS[decName];
          if (!httpMethod) continue;

          const subpath = extractMethodSubpath(dec);
          if (subpath === null) {
            // Dynamic subpath: omit rather than guess.
            continue;
          }

          const fullPath = assembleNestPath(prefix, subpath);
          routes.push({
            filePath: relPath,
            method: httpMethod,
            path: fullPath,
          });
        }
      }
    }

    return routes;
  },
};

function extractControllerPrefix(dec: Decorator): string | null {
  const args = dec.getArguments();
  if (args.length === 0) return "";
  const first = args[0];

  if (first.getKind() === SyntaxKind.StringLiteral) {
    return first.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
  }
  if (first.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
    return first
      .asKindOrThrow(SyntaxKind.NoSubstitutionTemplateLiteral)
      .getLiteralValue();
  }
  if (first.getKind() === SyntaxKind.ObjectLiteralExpression) {
    const obj = first.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    const pathProp = obj.getProperty("path");
    if (pathProp && pathProp.getKind() === SyntaxKind.PropertyAssignment) {
      const init = pathProp
        .asKindOrThrow(SyntaxKind.PropertyAssignment)
        .getInitializer();
      if (init && init.getKind() === SyntaxKind.StringLiteral) {
        return init.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
      }
      if (init && init.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
        return init
          .asKindOrThrow(SyntaxKind.NoSubstitutionTemplateLiteral)
          .getLiteralValue();
      }
    }
  }

  // Any other argument form is non-literal / dynamic
  return null;
}

function extractMethodSubpath(dec: Decorator): string | null {
  const args = dec.getArguments();
  if (args.length === 0) return "";
  const first = args[0];

  if (first.getKind() === SyntaxKind.StringLiteral) {
    return first.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
  }
  if (first.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
    return first
      .asKindOrThrow(SyntaxKind.NoSubstitutionTemplateLiteral)
      .getLiteralValue();
  }

  // Dynamic / non-literal
  return null;
}

function assembleNestPath(prefix: string, subpath: string): string {
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, "");
  const cleanSub = subpath.replace(/^\/+|\/+$/g, "");

  if (!cleanPrefix && !cleanSub) return "/";
  if (!cleanPrefix) return `/${cleanSub}`;
  if (!cleanSub) return `/${cleanPrefix}`;
  return `/${cleanPrefix}/${cleanSub}`;
}
