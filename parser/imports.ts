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

/**
 * Reads the exported names of a CommonJS module from its AST.
 */
export function extractCommonJSExports(sourceFile: SourceFile): string[] {
  const names = new Set<string>();

  for (const bin of sourceFile.getDescendantsOfKind(
    SyntaxKind.BinaryExpression,
  )) {
    if (bin.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) continue;
    const left = bin.getLeft();
    const right = bin.getRight();

    // module.exports = { ... } or module.exports = something
    if (left.getText() === "module.exports" || left.getText() === "exports") {
      if (Node.isObjectLiteralExpression(right)) {
        for (const prop of right.getProperties()) {
          if (
            Node.isPropertyAssignment(prop) ||
            Node.isShorthandPropertyAssignment(prop) ||
            Node.isMethodDeclaration(prop)
          ) {
            const name = prop.getName();
            if (name) {
              names.add(name.replace(/^['"](.*)['"]$/, "$1"));
            }
          }
        }
      } else {
        names.add("default");
      }
      continue;
    }

    // module.exports.foo = ... or exports.foo = ...
    if (Node.isPropertyAccessExpression(left)) {
      const expr = left.getExpression();
      if (expr.getText() === "module.exports" || expr.getText() === "exports") {
        names.add(left.getName());
      }
    } else if (Node.isElementAccessExpression(left)) {
      const expr = left.getExpression();
      const arg = left.getArgumentExpression();
      if (
        (expr.getText() === "module.exports" || expr.getText() === "exports") &&
        arg
      ) {
        if (
          Node.isStringLiteral(arg) ||
          Node.isNoSubstitutionTemplateLiteral(arg)
        ) {
          names.add(arg.getLiteralValue());
        }
      }
    }
  }

  // Object.assign(module.exports / exports, { ... })
  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    const expr = call.getExpression();
    if (
      Node.isPropertyAccessExpression(expr) &&
      expr.getText() === "Object.assign"
    ) {
      const args = call.getArguments();
      if (
        args.length >= 2 &&
        (args[0].getText() === "module.exports" ||
          args[0].getText() === "exports")
      ) {
        for (let i = 1; i < args.length; i++) {
          const arg = args[i];
          if (Node.isObjectLiteralExpression(arg)) {
            for (const prop of arg.getProperties()) {
              if (
                Node.isPropertyAssignment(prop) ||
                Node.isShorthandPropertyAssignment(prop) ||
                Node.isMethodDeclaration(prop)
              ) {
                const name = prop.getName();
                if (name) {
                  names.add(name.replace(/^['"](.*)['"]$/, "$1"));
                }
              }
            }
          }
        }
      }
    }
  }

  return Array.from(names).sort();
}
