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
