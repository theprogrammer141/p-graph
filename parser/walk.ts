import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { FrameworkAdapter } from "./adapter.ts";
import type { ExcludedDirectory, SkippedFile } from "./types.ts";

export const TS_JS_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
] as const;

export const SOURCE_EXTENSIONS = [
  ...TS_JS_EXTENSIONS,
  ".py",
  ".dart",
  ".cs",
] as const;

const DECLARATION_FILE = /\.d\.[mc]?ts$/;
const MINIFIED_NAME = /\.min\.[mc]?js$/;
const MAX_BYTES = 1024 * 1024;
// A hand-written line this long is vanishingly rare; bundles and minified
// output hit it immediately.
const MAX_LINE_LENGTH = 5000;

export interface CandidateFile {
  path: string;
  absPath: string;
  text: string;
  lines: number;
  sha256: string;
}

export interface PackageManifest {
  /** Repo-relative directory holding the package.json. "." for the root. */
  dir: string;
  name: string | null;
  /** Dependency name -> version range, across every dependency field. */
  dependencies: Map<string, string>;
}

export interface PythonManifest {
  /** Repo-relative directory holding the Python manifest. "." for the root. */
  dir: string;
  /** Declared package/import names (lowercased, normalized). */
  packages: Set<string>;
}

export interface DartManifest {
  /** Repo-relative directory holding pubspec.yaml. "." for the root. */
  dir: string;
  /** Package name declared in pubspec.yaml. */
  name: string | null;
  /** Declared dependency package names. */
  dependencies: Set<string>;
}

export interface CSharpManifest {
  /** Repo-relative directory holding the .csproj file. "." for the root. */
  dir: string;
  /** Repo-relative path to the .csproj file. */
  projectFile: string;
  /** RootNamespace or AssemblyName or project basename. */
  rootNamespace: string | null;
  /** Declared NuGet PackageReference names. */
  packages: Set<string>;
  /** Repo-relative paths to referenced .csproj files. */
  projectReferences: string[];
}

export interface WalkResult {
  candidates: CandidateFile[];
  skipped: SkippedFile[];
  excludedDirectories: ExcludedDirectory[];
  manifests: PackageManifest[];
  pythonManifests: PythonManifest[];
  dartManifests: DartManifest[];
  csharpManifests: CSharpManifest[];
  warnings: string[];
}

export function isSourceFile(name: string): boolean {
  return SOURCE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function isTsJsSourceFile(name: string): boolean {
  return TS_JS_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

/** The directory a file belongs to, which is what the map groups by. */
export function moduleOf(relPath: string): string {
  const dir = path.posix.dirname(relPath);
  return dir === "" ? "." : dir;
}

function countLines(text: string): number {
  if (text.length === 0) return 0;
  let n = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return text.endsWith("\n") ? n - 1 : n;
}

function longestLine(text: string): number {
  let max = 0;
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text.charCodeAt(i) === 10) {
      max = Math.max(max, i - start);
      start = i + 1;
    }
  }
  return max;
}

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

function readManifest(
  absPath: string,
  dir: string,
  warnings: string[],
): PackageManifest | null {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(absPath, "utf8"));
  } catch (err) {
    warnings.push(
      `${dir === "." ? "" : dir + "/"}package.json could not be read: ${String(err)}`,
    );
    return null;
  }
  if (typeof json !== "object" || json === null) return null;
  const record = json as Record<string, unknown>;
  const dependencies = new Map<string, string>();
  for (const field of DEPENDENCY_FIELDS) {
    const deps = record[field];
    if (typeof deps !== "object" || deps === null) continue;
    for (const [name, range] of Object.entries(deps)) {
      dependencies.set(name, typeof range === "string" ? range : "");
    }
  }
  return {
    dir,
    name: typeof record.name === "string" ? record.name : null,
    dependencies,
  };
}

const PYTHON_PACKAGE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  pillow: ["pil"],
  pyyaml: ["yaml"],
  beautifulsoup4: ["bs4"],
  scikit_learn: ["sklearn"],
  djangorestframework: ["rest_framework"],
  opencv_python: ["cv2"],
  opencv_python_headless: ["cv2"],
  python_dotenv: ["dotenv"],
  pyjwt: ["jwt"],
  psycopg2_binary: ["psycopg2"],
  attrs: ["attr", "attrs"],
  python_dateutil: ["dateutil"],
  pydantic_settings: ["pydantic_settings"],
  firebase_admin: ["firebase_admin"],
};

function addNormalizedPythonPkg(target: Set<string>, rawName: string): void {
  const cleaned = rawName
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .split(/[[\]=<>!~;@ \t]/)[0]
    ?.trim()
    .toLowerCase();
  if (!cleaned || cleaned.startsWith("-") || cleaned.startsWith("#")) return;
  const underscored = cleaned.replace(/[-.]+/g, "_");
  target.add(cleaned);
  target.add(underscored);
  const firstSegment = underscored.split("_")[0];
  if (cleaned.startsWith("google-cloud-") || cleaned.startsWith("google_cloud_")) {
    target.add("google");
  }
  const aliases = PYTHON_PACKAGE_ALIASES[underscored];
  if (aliases) {
    for (const a of aliases) target.add(a);
  }
  void firstSegment;
}

function readPythonManifestFile(absPath: string, fileName: string): Set<string> {
  const packages = new Set<string>();
  let text = "";
  try {
    text = readFileSync(absPath, "utf8");
  } catch {
    return packages;
  }

  if (fileName === "requirements.txt" || /^requirements[-_.\w]*\.txt$/i.test(fileName)) {
    for (const line of text.split(/\r?\n/)) {
      const stripped = line.replace(/#.*$/, "").trim();
      if (!stripped || stripped.startsWith("-")) continue;
      addNormalizedPythonPkg(packages, stripped);
    }
    return packages;
  }

  if (fileName === "pyproject.toml" || fileName === "Pipfile" || fileName === "setup.cfg") {
    // Match quoted dependency specifiers (PEP 621 dependencies array)
    for (const m of text.matchAll(/["']([a-zA-Z0-9][a-zA-Z0-9._-]*)(?:\[[^\]]*\])?\s*(?:[=<>!~;@][^"']*)?["']/g)) {
      addNormalizedPythonPkg(packages, m[1]);
    }
    // Match TOML/INI table keys under dependencies / packages sections
    let inDepsSection = false;
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.replace(/#.*$/, "").trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("[")) {
        inDepsSection = /dependencies|packages/i.test(trimmed);
        continue;
      }
      if (inDepsSection) {
        const keyMatch = /^([a-zA-Z0-9._-]+)\s*=/.exec(trimmed);
        if (keyMatch && keyMatch[1].toLowerCase() !== "python") {
          addNormalizedPythonPkg(packages, keyMatch[1]);
        }
      }
    }
    return packages;
  }

  if (fileName === "setup.py") {
    for (const m of text.matchAll(/["']([a-zA-Z0-9][a-zA-Z0-9._-]*)(?:\[[^\]]*\])?(?:[=<>!~][^"']*)?["']/g)) {
      addNormalizedPythonPkg(packages, m[1]);
    }
  }

  return packages;
}

function readDartManifest(absPath: string, dir: string): DartManifest | null {
  let text = "";
  try {
    text = readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
  let name: string | null = null;
  const dependencies = new Set<string>();
  let currentSection: string | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "");
    if (!line.trim()) continue;
    const topMatch = /^([a-zA-Z0-9_]+)\s*:\s*(.*)$/.exec(line);
    if (topMatch) {
      const key = topMatch[1];
      const val = topMatch[2].trim().replace(/^['"]+|['"]+$/g, "");
      if (key === "name" && val) {
        name = val;
      }
      currentSection = key;
      continue;
    }
    if (
      currentSection === "dependencies" ||
      currentSection === "dev_dependencies" ||
      currentSection === "dependency_overrides"
    ) {
      const depMatch = /^\s{2}([a-zA-Z0-9_]+)\s*:/.exec(line);
      if (depMatch) {
        dependencies.add(depMatch[1]);
      }
    }
  }

  return { dir, name, dependencies };
}

function readCSharpManifest(
  absPath: string,
  dir: string,
  relPath: string,
  root: string,
): CSharpManifest | null {
  let text = "";
  try {
    text = readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
  const baseName = path.basename(relPath, ".csproj");
  const rootNsMatch = /<RootNamespace>\s*([^<\s]+)\s*<\/RootNamespace>/i.exec(text);
  const asmMatch = /<AssemblyName>\s*([^<\s]+)\s*<\/AssemblyName>/i.exec(text);
  const rootNamespace = rootNsMatch?.[1] ?? asmMatch?.[1] ?? baseName;

  const packages = new Set<string>();
  for (const m of text.matchAll(/<PackageReference\s+[^>]*Include\s*=\s*["']([^"']+)["']/gi)) {
    packages.add(m[1].trim());
  }

  const projectReferences: string[] = [];
  for (const m of text.matchAll(/<ProjectReference\s+[^>]*Include\s*=\s*["']([^"']+)["']/gi)) {
    const refSpec = m[1].replace(/\\/g, "/");
    const resolvedAbs = path.resolve(path.dirname(absPath), refSpec);
    const relRef = relativeInside(root, resolvedAbs);
    if (relRef) projectReferences.push(relRef);
  }

  return {
    dir,
    projectFile: relPath,
    rootNamespace,
    packages,
    projectReferences,
  };
}

/**
 * Walks every directory the adapter doesn't exclude and keeps every source
 * file in it. Selection is by directory, never by size, so a kept file's
 * imports always have a chance to land on a kept file.
 */
export function walkRepository(
  root: string,
  adapter: FrameworkAdapter,
): WalkResult {
  const result: WalkResult = {
    candidates: [],
    skipped: [],
    excludedDirectories: [],
    manifests: [],
    pythonManifests: [],
    dartManifests: [],
    csharpManifests: [],
    warnings: [],
  };
  const pythonManifestByDir = new Map<string, PythonManifest>();

  const visit = (absDir: string, relDir: string) => {
    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch (err) {
      result.warnings.push(
        `directory ${relDir || "."} could not be read: ${String(err)}`,
      );
      return;
    }
    // Sorted so output is stable across runs and machines.
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const entry of entries) {
      const absPath = path.join(absDir, entry.name);
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        const rule = adapter.excludeDirectory(relPath, entry.name);
        if (rule) result.excludedDirectories.push({ path: relPath, rule });
        else visit(absPath, relPath);
        continue;
      }

      if (entry.name === "package.json" && entry.isFile()) {
        const manifest = readManifest(absPath, relDir || ".", result.warnings);
        if (manifest) result.manifests.push(manifest);
        continue;
      }

      if (
        entry.isFile() &&
        (entry.name === "pyproject.toml" ||
          entry.name === "Pipfile" ||
          entry.name === "setup.cfg" ||
          entry.name === "setup.py" ||
          entry.name === "requirements.txt" ||
          /^requirements[-_.\w]*\.txt$/i.test(entry.name))
      ) {
        const dirKey = relDir || ".";
        const pkgs = readPythonManifestFile(absPath, entry.name);
        if (pkgs.size > 0) {
          let pyManifest = pythonManifestByDir.get(dirKey);
          if (!pyManifest) {
            pyManifest = { dir: dirKey, packages: new Set<string>() };
            pythonManifestByDir.set(dirKey, pyManifest);
            result.pythonManifests.push(pyManifest);
          }
          for (const p of pkgs) pyManifest.packages.add(p);
        }
        if (entry.name !== "setup.py") continue;
      }

      if (entry.name === "pubspec.yaml" && entry.isFile()) {
        const dartManifest = readDartManifest(absPath, relDir || ".");
        if (dartManifest) result.dartManifests.push(dartManifest);
        continue;
      }

      if (entry.name.endsWith(".csproj") && entry.isFile()) {
        const csManifest = readCSharpManifest(absPath, relDir || ".", relPath, root);
        if (csManifest) result.csharpManifests.push(csManifest);
        continue;
      }

      if (!isSourceFile(entry.name)) continue;

      // Symlinks aren't followed: they can loop, and they can point outside
      // the repository. Counting them as skipped keeps the totals honest.
      if (entry.isSymbolicLink()) {
        result.skipped.push({
          path: relPath,
          reason: "symlink",
          detail: "symbolic links are not followed",
        });
        continue;
      }
      if (!entry.isFile()) continue;

      if (DECLARATION_FILE.test(entry.name)) {
        result.skipped.push({
          path: relPath,
          reason: "declaration-file",
          detail: "type declarations only, no runtime code",
        });
        continue;
      }

      let bytes: Buffer;
      try {
        const size = lstatSync(absPath).size;
        if (size > MAX_BYTES) {
          result.skipped.push({
            path: relPath,
            reason: "too-large",
            detail: `${size} bytes, limit is ${MAX_BYTES}`,
          });
          continue;
        }
        bytes = readFileSync(absPath);
      } catch (err) {
        result.skipped.push({
          path: relPath,
          reason: "unreadable",
          detail: String(err),
        });
        continue;
      }

      const text = bytes.toString("utf8");
      if (MINIFIED_NAME.test(entry.name)) {
        result.skipped.push({
          path: relPath,
          reason: "minified",
          detail: "file name marks it as minified",
        });
        continue;
      }
      const longest = longestLine(text);
      if (longest > MAX_LINE_LENGTH) {
        result.skipped.push({
          path: relPath,
          reason: "minified",
          detail: `longest line is ${longest} characters, limit is ${MAX_LINE_LENGTH}`,
        });
        continue;
      }

      result.candidates.push({
        path: relPath,
        absPath,
        text,
        lines: countLines(text),
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  };

  visit(root, "");
  return result;
}

/** Repo-relative path if `absPath` is inside `root`, otherwise null. */
export function relativeInside(root: string, absPath: string): string | null {
  const rel = path.relative(root, absPath);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return toPosix(rel);
}
