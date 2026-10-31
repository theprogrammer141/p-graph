import { Node, SyntaxKind, type SourceFile } from "ts-morph";

import type { ImportKind } from "./types.ts";

export interface RawImport {
  kind: ImportKind;
  line: number;
  /** null when a dynamic import or require argument isn't a literal string. */
  specifier: string | null;
  typeOnly: boolean;
  /** Source text of a non-literal argument, for the report. */
  expressionText?: string;
  /** Optional symbol names imported in `from X import a, b`. */
  importedNames?: readonly string[];
}

/**
 * Reads the syntactic forms that can become edges: import, re-export, dynamic
 * import, and require(). Order follows the source so
 * output is stable.
 */
export function extractImports(sourceFile: SourceFile): RawImport[] {
  const found: RawImport[] = [];

  for (const decl of sourceFile.getImportDeclarations()) {
    found.push({
      kind: "import",
      line: decl.getStartLineNumber(),
      specifier: decl.getModuleSpecifierValue(),
      typeOnly: decl.isTypeOnly(),
    });
  }

  for (const decl of sourceFile.getExportDeclarations()) {
    // `export { a }` with no `from` isn't a re-export of another file.
    const specifier = decl.getModuleSpecifierValue();
    if (specifier === undefined) continue;
    found.push({
      kind: "re-export",
      line: decl.getStartLineNumber(),
      specifier,
      typeOnly: decl.isTypeOnly(),
    });
  }

  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    const expr = call.getExpression();

    if (expr.getKind() === SyntaxKind.ImportKeyword) {
      const arg = call.getArguments()[0];
      const literal =
        arg &&
        (Node.isStringLiteral(arg) || Node.isNoSubstitutionTemplateLiteral(arg))
          ? arg.getLiteralValue()
          : null;
      found.push({
        kind: "dynamic",
        line: call.getStartLineNumber(),
        specifier: literal,
        typeOnly: false,
        ...(literal === null
          ? { expressionText: arg ? arg.getText().slice(0, 120) : "(no argument)" }
          : {}),
      });
      continue;
    }

    if (Node.isIdentifier(expr) && expr.getText() === "require") {
      const arg = call.getArguments()[0];
      const literal =
        arg &&
        (Node.isStringLiteral(arg) || Node.isNoSubstitutionTemplateLiteral(arg))
          ? arg.getLiteralValue()
          : null;
      found.push({
        kind: "require",
        line: call.getStartLineNumber(),
        specifier: literal,
        typeOnly: false,
        ...(literal === null
          ? { expressionText: arg ? arg.getText().slice(0, 120) : "(no argument)" }
          : {}),
      });
    }
  }

  return found.sort((a, b) => a.line - b.line);
}

/**
 * Strips Python triple-quoted strings and `#` comments while keeping newlines intact
 * so line numbers remain exact.
 */
function stripPythonCommentsAndDocstrings(text: string): string {
  // Replace triple-quoted strings with equivalent newlines, and strip # comments.
  const withoutTriple = text.replace(
    /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(#[^\n]*)/g,
    (match, quoted: string | undefined, comment: string | undefined) => {
      if (comment !== undefined) return "";
      if (quoted !== undefined && (quoted.startsWith('"""') || quoted.startsWith("'''"))) {
        return quoted.replace(/[^\n]/g, " ");
      }
      return match;
    },
  );
  return withoutTriple;
}

/**
 * Extracts Python `import`, `from ... import ...`, and `importlib.import_module` statements.
 * Uses `isSubmodule` when supplied so `from pkg import sub1, sub2` emits an edge per submodule.
 */
export function extractPythonImports(
  text: string,
  options?: {
    isInitFile?: boolean;
    isSubmodule?: (baseSpecifier: string, importedName: string) => boolean;
  },
): RawImport[] {
  const found: RawImport[] = [];
  const cleaned = stripPythonCommentsAndDocstrings(text);
  const lines = cleaned.split(/\r?\n/);
  const kind: ImportKind = options?.isInitFile ? "re-export" : "import";

  let i = 0;
  while (i < lines.length) {
    const startLine = i + 1;
    let statement = lines[i];

    // Join parenthesized or backslash-continued import lines
    if (/^\s*(?:from\s+[.\w]+\s+import|import)\b/.test(statement)) {
      let openParens =
        (statement.match(/\(/g)?.length ?? 0) - (statement.match(/\)/g)?.length ?? 0);
      while (
        (openParens > 0 || statement.trimEnd().endsWith("\\")) &&
        i + 1 < lines.length
      ) {
        statement = statement.replace(/\\\s*$/, " ") + " " + lines[i + 1];
        i++;
        openParens =
          (statement.match(/\(/g)?.length ?? 0) - (statement.match(/\)/g)?.length ?? 0);
      }
    }

    const trimmed = statement.trim();

    // 1. `from <module> import <targets>`
    const fromMatch = /^from\s+(\.*[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*|\.+)\s+import\s+(.+)$/.exec(
      trimmed,
    );
    if (fromMatch) {
      const baseSpec = fromMatch[1];
      const rawTargets = fromMatch[2].replace(/^\(|\)$/g, "").trim();
      if (baseSpec === "__future__") {
        i++;
        continue;
      }

      const names = rawTargets
        .split(",")
        .map((part) => part.trim().split(/\s+as\s+/)[0]?.trim() ?? "")
        .filter((n) => n.length > 0 && n !== "*");

      // Pure relative dots (`from . import a, b` or `from .. import a, b`):
      // each imported identifier is a sibling/relative module candidate or a package symbol.
      if (/^\.+$/.test(baseSpec)) {
        if (names.length === 0) {
          found.push({
            kind,
            line: startLine,
            specifier: baseSpec,
            typeOnly: false,
          });
        } else if (!options?.isSubmodule) {
          for (const name of names) {
            found.push({
              kind,
              line: startLine,
              specifier: `${baseSpec}${name}`,
              typeOnly: false,
              importedNames: [name],
            });
          }
        } else {
          const matchedSubmodules: string[] = [];
          const remainingSymbols: string[] = [];
          for (const name of names) {
            if (options.isSubmodule(baseSpec, name)) {
              matchedSubmodules.push(name);
            } else {
              remainingSymbols.push(name);
            }
          }

          for (const sub of matchedSubmodules) {
            found.push({
              kind,
              line: startLine,
              specifier: `${baseSpec}${sub}`,
              typeOnly: false,
              importedNames: [sub],
            });
          }

          if (remainingSymbols.length > 0) {
            found.push({
              kind,
              line: startLine,
              specifier: baseSpec,
              typeOnly: false,
              importedNames: remainingSymbols,
            });
          }
        }
        i++;
        continue;
      }

      // Named base specifier (`from pkg.mod import a, b`)
      const matchedSubmodules: string[] = [];
      const remainingSymbols: string[] = [];
      for (const name of names) {
        if (options?.isSubmodule?.(baseSpec, name)) {
          matchedSubmodules.push(name);
        } else {
          remainingSymbols.push(name);
        }
      }

      for (const sub of matchedSubmodules) {
        found.push({
          kind,
          line: startLine,
          specifier: `${baseSpec}.${sub}`,
          typeOnly: false,
        });
      }

      if (matchedSubmodules.length === 0 || remainingSymbols.length > 0) {
        found.push({
          kind,
          line: startLine,
          specifier: baseSpec,
          typeOnly: false,
          ...(remainingSymbols.length > 0 ? { importedNames: remainingSymbols } : {}),
        });
      }

      i++;
      continue;
    }

    // 2. `import <module1>, <module2>`
    const importMatch = /^import\s+(.+)$/.exec(trimmed);
    if (importMatch) {
      const modules = importMatch[1]
        .split(",")
        .map((part) => part.trim().split(/\s+as\s+/)[0]?.trim() ?? "")
        .filter((m) => /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(m));

      for (const mod of modules) {
        found.push({
          kind,
          line: startLine,
          specifier: mod,
          typeOnly: false,
        });
      }
      i++;
      continue;
    }

    // 3. `importlib.import_module(...)` or `__import__(...)`
    const dynMatch = /\b(?:importlib\.import_module|__import__)\s*\(\s*([^,)]*)/.exec(trimmed);
    if (dynMatch) {
      const arg = dynMatch[1].trim();
      const litMatch = /^["']([.\w]+)["']$/.exec(arg);
      found.push({
        kind: "dynamic",
        line: startLine,
        specifier: litMatch ? litMatch[1] : null,
        typeOnly: false,
        ...(litMatch ? {} : { expressionText: arg.slice(0, 120) || "(no argument)" }),
      });
    }

    i++;
  }

  return found.sort((a, b) => a.line - b.line);
}

/**
 * Strips C-style `//` and `/* ... *\/` comments while keeping newlines intact.
 */
function stripCStyleComments(text: string): string {
  return text.replace(
    /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g,
    (match, quoted: string | undefined, comment: string | undefined) => {
      if (quoted !== undefined) return match;
      if (comment !== undefined) return comment.replace(/[^\n]/g, " ");
      return match;
    },
  );
}

/**
 * Extracts Dart `import`, `export`, and URI-based `part` / `part of` directives.
 */
export function extractDartImports(text: string): RawImport[] {
  const found: RawImport[] = [];
  const cleaned = stripCStyleComments(text);
  const lines = cleaned.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    // `import 'uri' [deferred as id] ...;`
    const importMatch = /^import\s+["']([^"']+)["'](.*)$/.exec(trimmed);
    if (importMatch) {
      const specifier = importMatch[1];
      const rest = importMatch[2] ?? "";
      const isDeferred = /\bdeferred\s+as\b/.test(rest);
      found.push({
        kind: isDeferred ? "dynamic" : "import",
        line: lineNum,
        specifier,
        typeOnly: false,
      });
      continue;
    }

    // `export 'uri' ...;`
    const exportMatch = /^export\s+["']([^"']+)["']/.exec(trimmed);
    if (exportMatch) {
      found.push({
        kind: "re-export",
        line: lineNum,
        specifier: exportMatch[1],
        typeOnly: false,
      });
      continue;
    }

    // `part 'uri';` or `part of 'uri';`
    const partMatch = /^part\s+(?:of\s+)?["']([^"']+)["']/.exec(trimmed);
    if (partMatch) {
      found.push({
        kind: "import",
        line: lineNum,
        specifier: partMatch[1],
        typeOnly: false,
      });
    }
  }

  return found.sort((a, b) => a.line - b.line);
}

export interface CSharpFileDeclarations {
  readonly namespaces: readonly string[];
  readonly types: readonly string[];
  readonly identifiers: ReadonlySet<string>;
}

/**
 * Extracts declared namespaces, type names, and identifier tokens from a C# source file.
 */
export function extractCSharpDeclarations(text: string): CSharpFileDeclarations {
  const cleaned = stripCStyleComments(text);
  const namespaces = new Set<string>();
  const types = new Set<string>();

  for (const m of cleaned.matchAll(
    /^\s*namespace\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*(?:;|\{|$)/gm,
  )) {
    namespaces.add(m[1]);
  }

  for (const m of cleaned.matchAll(
    /\b(?:class|interface|struct|record|enum|delegate)\s+([A-Za-z_]\w*)/g,
  )) {
    types.add(m[1]);
  }

  // Strip string literals before collecting identifier tokens
  const withoutStrings = cleaned.replace(/"(?:\\.|[^"\\])*"/g, " ");
  const identifiers = new Set<string>();
  for (const m of withoutStrings.matchAll(/\b([A-Za-z_]\w*)\b/g)) {
    identifiers.add(m[1]);
  }

  return {
    namespaces: [...namespaces],
    types: [...types],
    identifiers,
  };
}

/**
 * Extracts C# `using` namespace/static/alias directives (excluding `using (...)` resource statements).
 */
export function extractCSharpImports(text: string): RawImport[] {
  const found: RawImport[] = [];
  const cleaned = stripCStyleComments(text);
  const lines = cleaned.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    // Exclude `using (...)` or `using var ...` resource management statements
    if (/^(?:await\s+)?using\s*\(/.test(trimmed) || /^(?:await\s+)?using\s+var\b/.test(trimmed)) {
      continue;
    }

    const usingMatch =
      /^(?:global\s+)?using\s+(?:static\s+)?(?:[A-Za-z_]\w*\s*=\s*)?([A-Za-z_]\w*(?:\s*\.\s*[A-Za-z_]\w*)*)\s*;/.exec(
        trimmed,
      );
    if (usingMatch) {
      const specifier = usingMatch[1].replace(/\s+/g, "");
      if (specifier === "var") continue;
      found.push({
        kind: "import",
        line: lineNum,
        specifier,
        typeOnly: false,
      });
    }
  }

  return found.sort((a, b) => a.line - b.line);
}
