import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import type { SourceFile } from "ts-morph";
import type { ExtractedRoute, FrameworkAdapter } from "../adapter.ts";

const DOTNET_HTTP_ATTRIBUTES: Readonly<Record<string, string>> = {
  HttpGet: "GET",
  HttpPost: "POST",
  HttpPut: "PUT",
  HttpDelete: "DELETE",
  HttpPatch: "PATCH",
  HttpOptions: "OPTIONS",
  HttpHead: "HEAD",
};

function hasDotnetProjectFile(dir: string): boolean {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (
        entry.isFile() &&
        (entry.name.endsWith(".sln") ||
          entry.name.endsWith(".slnx") ||
          entry.name.endsWith(".csproj") ||
          entry.name === "Directory.Build.props")
      ) {
        return true;
      }
    }
  } catch {
    // ignore unreadable directory
  }
  return false;
}

function resolveControllerToken(
  template: string,
  controllerShortName: string | null,
): string | null {
  // Reject unrecoverable tokens like [action] or [area]
  if (/\[(?!controller\])[^\]]+\]/i.test(template)) {
    return null;
  }
  if (/\[controller\]/i.test(template)) {
    if (!controllerShortName) return null;
    return template.replace(/\[controller\]/gi, controllerShortName.toLowerCase());
  }
  return template;
}

function joinDotnetPath(prefix: string, subpath: string): string {
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, "");
  const cleanSub = subpath.replace(/^\/+|\/+$/g, "");
  if (!cleanPrefix && !cleanSub) return "/";
  if (!cleanPrefix) return `/${cleanSub}`;
  if (!cleanSub) return `/${cleanPrefix}`;
  return `/${cleanPrefix}/${cleanSub}`;
}

export const dotnetAdapter: FrameworkAdapter = {
  name: ".NET",

  /** Recognizes C# / .NET repositories from .sln, .slnx, .csproj, or root Program.cs / Startup.cs. */
  detect(root: string): boolean {
    if (hasDotnetProjectFile(root)) return true;
    if (
      existsSync(path.join(/*turbopackIgnore: true*/ root, "Program.cs")) ||
      existsSync(path.join(/*turbopackIgnore: true*/ root, "Startup.cs"))
    ) {
      return true;
    }

    try {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
        if (
          hasDotnetProjectFile(
            path.join(/*turbopackIgnore: true*/ root, entry.name),
          )
        ) {
          return true;
        }
      }
    } catch {
      // ignore unreadable root
    }

    return false;
  },

  /** Excludes bin, obj, NuGet packages, test results, and build output directories. */
  excludeDirectory(_relPath: string, name: string): string | null {
    if (name === "node_modules") return "dependencies (node_modules)";
    if (name === "packages") return "dependencies (packages)";
    if (name.startsWith(".")) return "hidden directory";
    if (
      name === "bin" ||
      name === "obj" ||
      name === "out" ||
      name === "dist" ||
      name === "build" ||
      name === "publish" ||
      name === "artifacts" ||
      name === "TestResults" ||
      name === "coverage"
    ) {
      return `build output (${name})`;
    }
    return null;
  },

  /** Classifies .NET controllers, services, models/entities, repositories/data, middleware, and pages. */
  assignRole(relPath: string): string | null {
    const norm = relPath.replace(/\\/g, "/");
    const fileName = norm.split("/").pop() ?? "";

    if (
      /(Tests?|Specs?)\.cs$/.test(fileName) ||
      /(^|\/)([A-Za-z0-9_.]*Tests?|specs?)\//i.test(norm)
    ) {
      return "Generic";
    }

    if (
      /(^|\/)Controllers\/.*\.cs$/i.test(norm) ||
      /(Controller|Endpoints?)\.cs$/.test(fileName)
    ) {
      return "Controllers";
    }
    if (/(^|\/)Services\/.*\.cs$/i.test(norm) || /Service\.cs$/.test(fileName)) {
      return "Services";
    }
    if (
      /(^|\/)(Models|Entities|Domain|Dtos|DTOs)\/.*\.cs$/i.test(norm) ||
      /(Model|Entity|Dto|DTO)\.cs$/.test(fileName)
    ) {
      return "Models";
    }
    if (
      /(^|\/)(Repositories|Data|Persistence|Infrastructure)\/.*\.cs$/i.test(norm) ||
      /(Repository|DbContext|Context)\.cs$/.test(fileName)
    ) {
      return "Repositories";
    }
    if (
      /(^|\/)Middlewares?\/.*\.cs$/i.test(norm) ||
      /Middleware\.cs$/.test(fileName)
    ) {
      return "Middleware";
    }
    if (/(^|\/)(Pages|Views)\/.*\.cs$/i.test(norm)) {
      return "Pages";
    }

    return "Generic";
  },

  /**
   * Extracts ASP.NET Core controller attribute routes when both the controller
   * route prefix and HTTP method attribute template are literal strings.
   */
  extractRoutes(
    relPath: string,
    _sourceFile: SourceFile,
    fileText?: string,
  ): ExtractedRoute[] {
    if (!relPath.endsWith(".cs") || !fileText) return [];
    const routes: ExtractedRoute[] = [];

    // Locate controller class header and attributes immediately preceding it.
    // Attribute bodies may contain quoted strings with bracket tokens like "[controller]".
    const classRegex =
      /((?:\s*\[(?:[^\]"]|"(?:\\.|[^"\\])*")+\]\s*)*)\bpublic\s+(?:sealed\s+|abstract\s+|partial\s+)*class\s+([A-Za-z_]\w*)/g;

    for (const classMatch of fileText.matchAll(classRegex)) {
      const classAttrs = classMatch[1] ?? "";
      const className = classMatch[2];
      const isController =
        className.endsWith("Controller") ||
        /\b(ApiController|Controller|Route)\b/.test(classAttrs);
      if (!isController) continue;

      const controllerShortName = className.endsWith("Controller")
        ? className.slice(0, -"Controller".length)
        : className;

      // Extract class-level [Route(...)]
      let classPrefix = "";
      const routeAttrMatch = /\[\s*Route(?:Attribute)?\s*\(([^)]*)\)\s*\]/.exec(
        classAttrs,
      );
      if (routeAttrMatch) {
        const arg = routeAttrMatch[1].trim();
        const litMatch = /^@?"([^"]*)"$/.exec(arg);
        if (!litMatch) continue; // dynamic class route prefix -> omit
        const resolvedPrefix = resolveControllerToken(
          litMatch[1],
          controllerShortName,
        );
        if (resolvedPrefix === null) continue;
        classPrefix = resolvedPrefix;
      }

      // Extract body of the class by balancing braces from the opening '{' after class declaration
      const afterClassIdx = (classMatch.index ?? 0) + classMatch[0].length;
      const openBraceIdx = fileText.indexOf("{", afterClassIdx);
      if (openBraceIdx < 0) continue;

      let depth = 1;
      let pos = openBraceIdx + 1;
      while (pos < fileText.length && depth > 0) {
        const ch = fileText[pos];
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
        pos++;
      }
      const classBody = fileText.slice(openBraceIdx + 1, pos - 1);

      // Find HTTP verb attributes on methods inside the controller body
      for (const verbMatch of classBody.matchAll(
        /\[\s*(HttpGet|HttpPost|HttpPut|HttpDelete|HttpPatch|HttpOptions|HttpHead)(?:Attribute)?\s*(?:\(\s*([^)]*?)\s*\))?\s*\]/g,
      )) {
        const attrName = verbMatch[1];
        const rawArg = verbMatch[2]?.trim();
        const httpMethod = DOTNET_HTTP_ATTRIBUTES[attrName];
        if (!httpMethod) continue;

        let subTemplate = "";
        if (rawArg && rawArg.length > 0) {
          const litMatch = /^@?"([^"]*)"$/.exec(rawArg);
          if (!litMatch) continue; // dynamic method route -> omit
          const resolvedSub = resolveControllerToken(
            litMatch[1],
            controllerShortName,
          );
          if (resolvedSub === null) continue;
          subTemplate = resolvedSub;
        }

        const fullPath = subTemplate.startsWith("/")
          ? joinDotnetPath("", subTemplate)
          : joinDotnetPath(classPrefix, subTemplate);

        routes.push({
          filePath: relPath,
          method: httpMethod,
          path: fullPath,
        });
      }
    }

    return routes;
  },
};
