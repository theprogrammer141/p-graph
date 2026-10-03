import { statSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";

import { ts } from "ts-morph";

import {
  isSourceFile,
  relativeInside,
  type PackageManifest,
} from "./walk.ts";
import type {
  ExcludedDirectory,
  ImportOutcome,
  SkippedFile,
} from "./types.ts";

interface LoadedConfig {
  /** Repo-relative path of the tsconfig/jsconfig, or null for defaults. */
  label: string;
  options: ts.CompilerOptions;
  cache: ts.ModuleResolutionCache;
  /** Directory `paths` entries are relative to. */
  pathsBase: string;
}

export interface ResolverInput {
  root: string;
  nodes: ReadonlySet<string>;
  skipped: ReadonlyMap<string, SkippedFile>;
  excludedDirectories: readonly ExcludedDirectory[];
  manifests: readonly PackageManifest[];
}

const CONFIG_NAMES = ["tsconfig.json", "jsconfig.json"] as const;
const BUILTINS = new Set(builtinModules);
const DECLARATION_SUFFIX = /\.d\.([mc]?)ts$/;
// The runtime file a declaration sits beside, per declaration flavour.
const RUNTIME_SIBLINGS: Record<string, readonly string[]> = {
  "": [".js", ".jsx"],
  m: [".mjs"],
  c: [".cjs"],
};

function isFile(abs: string): boolean {
  try {
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}

function isDirectory(abs: string): boolean {
  try {
    return statSync(abs).isDirectory();
  } catch {
    return false;
  }
}

function packageNameOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function isPathSpecifier(specifier: string): boolean {
  return (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier === "." ||
    specifier === ".." ||
    path.isAbsolute(specifier)
  );
}

function message(diag: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diag.messageText, " ");
}

/**
 * Resolves specifiers with TypeScript's own module resolver, using the nearest
 * tsconfig/jsconfig for each file, then classifies the outcome. It never
 * produces a target that isn't a real file on disk.
 */
export class Resolver {
  readonly warnings: string[] = [];
  private readonly input: ResolverInput;
  private readonly configByDir = new Map<string, LoadedConfig>();
  private readonly configByPath = new Map<string, LoadedConfig>();
  private readonly workspaceNames: Map<string, string>;

  constructor(input: ResolverInput) {
    this.input = input;
    this.workspaceNames = new Map(
      input.manifests.flatMap((m) =>
        m.name ? [[m.name, m.dir] as [string, string]] : [],
      ),
    );
  }

  resolve(fromRel: string, specifier: string): ImportOutcome {
    const fromAbs = path.join(this.input.root, fromRel);
    const config = this.configFor(path.dirname(fromAbs));
    const { resolvedModule } = ts.resolveModuleName(
      specifier,
      fromAbs,
      config.options,
      ts.sys,
      config.cache,
    );
    if (resolvedModule) {
      return this.classifyResolvedPath(
        path.resolve(resolvedModule.resolvedFileName),
        resolvedModule.isExternalLibraryImport === true,
      );
    }
    return this.classifyUnresolved(fromRel, fromAbs, specifier, config);
  }

  private display(abs: string): string {
    return relativeInside(this.input.root, abs) ?? abs;
  }

  private classifyResolvedPath(
    abs: string,
    externalLibrary: boolean,
  ): ImportOutcome {
    const rel = relativeInside(this.input.root, abs);
    const inNodeModules = abs.split(path.sep).includes("node_modules");
    if (rel === null || inNodeModules) {
      return externalLibrary || inNodeModules
        ? {
            status: "external",
            reason: "package",
            detail: `resolved to ${this.display(abs)}`,
          }
        : {
            status: "external",
            reason: "outside-root",
            detail: `resolved to ${abs}, outside the repository`,
          };
    }
    return this.classifyRepoFile(rel);
  }

  /** A real file inside the repository: is it a node, and if not, why not. */
  private classifyRepoFile(rel: string): ImportOutcome {
    const { nodes, skipped, excludedDirectories } = this.input;
    if (nodes.has(rel)) return { status: "resolved", target: rel };

    const decl = DECLARATION_SUFFIX.exec(rel);
    if (decl) {
      // TypeScript prefers a .d.ts over the .js beside it. At runtime the
      // import loads the .js, so that file is the real target if we have it.
      const base = rel.slice(0, decl.index);
      for (const ext of RUNTIME_SIBLINGS[decl[1]] ?? []) {
        if (nodes.has(base + ext)) {
          return { status: "resolved", target: base + ext };
        }
      }
      return {
        status: "excluded",
        reason: "declaration-target",
        target: rel,
        detail: "resolves to a type declaration with no parsed runtime file",
      };
    }

    const skip = skipped.get(rel);
    if (skip) {
      return {
        status: "excluded",
        reason: "skipped-target",
        target: rel,
        detail: `target was skipped (${skip.reason}: ${skip.detail})`,
      };
    }

    const dir = excludedDirectories.find((d) => rel.startsWith(d.path + "/"));
    if (dir) {
      return {
        status: "excluded",
        reason: "excluded-directory",
        target: rel,
        detail: `target is inside ${dir.path} (${dir.rule})`,
      };
    }

    if (!isSourceFile(rel)) {
      return {
        status: "excluded",
        reason: "asset",
        target: rel,
        detail: "not a TypeScript or JavaScript source file",
      };
    }

    return {
      status: "unresolved",
      reason: "outside-walk",
      detail: `resolved to ${rel}, which the walk did not record`,
    };
  }

  /** A path on disk that TypeScript's resolver didn't accept. */
  private classifyCandidate(abs: string): ImportOutcome | null {
    if (!isFile(abs)) return null;
    const rel = relativeInside(this.input.root, abs);
    if (rel === null) {
      return {
        status: "external",
        reason: "outside-root",
        detail: `points at ${abs}, outside the repository`,
      };
    }
    return this.classifyRepoFile(rel);
  }

  private notFound(abs: string, prefix: string): ImportOutcome {
    const shown = this.display(abs);
    return {
      status: "unresolved",
      reason: "not-found",
      detail: isDirectory(abs)
        ? `${prefix}${shown} is a directory with no index file`
        : `${prefix}no file at ${shown} (with or without a source extension or index file)`,
    };
  }

  private classifyUnresolved(
    fromRel: string,
    fromAbs: string,
    specifier: string,
    config: LoadedConfig,
  ): ImportOutcome {
    if (
      specifier.startsWith("node:") ||
      BUILTINS.has(specifier) ||
      BUILTINS.has(packageNameOf(specifier))
    ) {
      return { status: "external", reason: "builtin", detail: "Node.js built-in" };
    }

    if (isPathSpecifier(specifier)) {
      const abs = path.resolve(path.dirname(fromAbs), specifier);
      return this.classifyCandidate(abs) ?? this.notFound(abs, "");
    }

    const alias = this.matchAlias(config, specifier);
    if (alias) {
      for (const candidate of alias.candidates) {
        const outcome = this.classifyCandidate(candidate);
        if (outcome) return outcome;
      }
      const first = alias.candidates[0];
      return first
        ? this.notFound(first, `alias "${alias.pattern}" in ${config.label} matched; `)
        : {
            status: "unresolved",
            reason: "not-found",
            detail: `alias "${alias.pattern}" in ${config.label} has no targets`,
          };
    }

    if (config.options.baseUrl) {
      const outcome = this.classifyCandidate(
        path.resolve(config.options.baseUrl, specifier),
      );
      if (outcome) return outcome;
    }

    return this.classifyPackage(fromRel, specifier);
  }

  /**
   * A bare specifier nothing on disk satisfies. It only counts as an outside
   * package if a package.json says so; otherwise it might be an alias we
   * can't see, and calling it external would hide a lost edge.
   */
  private classifyPackage(fromRel: string, specifier: string): ImportOutcome {
    const name = packageNameOf(specifier);
    const workspaceDir = this.workspaceNames.get(name);
    if (workspaceDir !== undefined) {
      return {
        status: "unresolved",
        reason: "workspace-unlinked",
        detail: `"${name}" is the package at ${workspaceDir} in this repository but isn't linked into node_modules`,
      };
    }

    const owners = this.input.manifests.filter(
      (m) => m.dir === "." || fromRel.startsWith(m.dir + "/"),
    );
    for (const manifest of owners) {
      const range = manifest.dependencies.get(name);
      if (range === undefined) continue;
      const where =
        manifest.dir === "." ? "package.json" : `${manifest.dir}/package.json`;
      if (range.startsWith("workspace:")) {
        return {
          status: "unresolved",
          reason: "workspace-unlinked",
          detail: `"${name}" is a workspace dependency in ${where} but isn't linked into node_modules`,
        };
      }
      return {
        status: "external",
        reason: "package",
        detail: `declared in ${where}, not installed`,
      };
    }

    return {
      status: "unresolved",
      reason: "unknown-specifier",
      detail: `"${specifier}" is not a path, matches no tsconfig alias, and no package.json declares "${name}"`,
    };
  }

  private matchAlias(
    config: LoadedConfig,
    specifier: string,
  ): { pattern: string; candidates: string[] } | null {
    const paths = config.options.paths;
    if (!paths) return null;
    // TypeScript picks the matching pattern with the longest prefix.
    let best: { pattern: string; capture: string; prefixLength: number } | null =
      null;
    for (const pattern of Object.keys(paths)) {
      const star = pattern.indexOf("*");
      if (star === -1) {
        if (pattern === specifier) {
          best = { pattern, capture: "", prefixLength: Infinity };
        }
        continue;
      }
      const prefix = pattern.slice(0, star);
      const suffix = pattern.slice(star + 1);
      if (
        specifier.length >= prefix.length + suffix.length &&
        specifier.startsWith(prefix) &&
        specifier.endsWith(suffix) &&
        (!best || prefix.length > best.prefixLength)
      ) {
        best = {
          pattern,
          capture: specifier.slice(prefix.length, specifier.length - suffix.length),
          prefixLength: prefix.length,
        };
      }
    }
    if (!best) return null;
    const capture = best.capture;
    const candidates = (paths[best.pattern] ?? []).map((target) =>
      path.resolve(config.pathsBase, target.replace("*", capture)),
    );
    return { pattern: best.pattern, candidates };
  }

  private configFor(absDir: string): LoadedConfig {
    const cached = this.configByDir.get(absDir);
    if (cached) return cached;

    let config: LoadedConfig | null = null;
    for (const name of CONFIG_NAMES) {
      const candidate = path.join(absDir, name);
      if (isFile(candidate)) {
        config = this.loadConfig(candidate);
        break;
      }
    }
    if (!config) {
      const atRoot = relativeInside(this.input.root, absDir) === null;
      config = atRoot ? this.loadConfig(null) : this.configFor(path.dirname(absDir));
    }
    this.configByDir.set(absDir, config);
    return config;
  }

  private loadConfig(configPath: string | null): LoadedConfig {
    const key = configPath ?? "";
    const cached = this.configByPath.get(key);
    if (cached) return cached;

    const root = this.input.root;
    let options: ts.CompilerOptions = {};
    let label = "(no tsconfig)";
    let configDir = root;

    if (configPath) {
      label = relativeInside(root, configPath) ?? configPath;
      configDir = path.dirname(configPath);
      const read = ts.readConfigFile(configPath, ts.sys.readFile);
      if (read.error) {
        this.warnings.push(`${label}: ${message(read.error)}`);
      } else {
        const parsed = ts.parseJsonConfigFileContent(
          read.config,
          ts.sys,
          configDir,
          undefined,
          configPath,
        );
        options = parsed.options;
        for (const err of parsed.errors) {
          // "No inputs were found" is about compilation, not resolution.
          if (err.code === 18003) continue;
          this.warnings.push(`${label}: ${message(err)}`);
        }
      }
    }

    // JS files and JSON must resolve whatever the project's own settings are,
    // and Classic resolution ignores node_modules and index files entirely.
    options = { ...options, allowJs: true, resolveJsonModule: true };
    if (
      options.moduleResolution === undefined ||
      options.moduleResolution === ts.ModuleResolutionKind.Classic
    ) {
      options.moduleResolution = ts.ModuleResolutionKind.Bundler;
      options.module ??= ts.ModuleKind.ESNext;
    }

    const pathsBasePath = options.pathsBasePath;
    const loaded: LoadedConfig = {
      label,
      options,
      cache: ts.createModuleResolutionCache(configDir, (f) => f, options),
      pathsBase:
        options.baseUrl ??
        (typeof pathsBasePath === "string" ? pathsBasePath : configDir),
    };
    this.configByPath.set(key, loaded);
    return loaded;
  }
}
