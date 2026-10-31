import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Checks common Python dependency manifests at `root` (and `requirements/*.txt`)
 * for a literal declaration of `pkgName`.
 */
export function hasPythonDependency(root: string, pkgName: string): boolean {
  const candidates = [
    "pyproject.toml",
    "requirements.txt",
    "Pipfile",
    "setup.py",
    "setup.cfg",
  ];
  const escaped = escapeRegExp(pkgName);
  const pattern = new RegExp(
    `(^|[\\s"'\\n\\[,=])${escaped}($|[\\s"'\\n=,<>!~\\[\\]])`,
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

/**
 * Joins a route prefix and subpath into a normalized leading-slash route path.
 */
export function joinRoutePath(prefix: string, subpath: string): string {
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, "");
  const cleanSub = subpath.replace(/^\/+|\/+$/g, "");
  if (!cleanPrefix && !cleanSub) return "/";
  if (!cleanPrefix) return `/${cleanSub}`;
  if (!cleanSub) return `/${cleanPrefix}`;
  return `/${cleanPrefix}/${cleanSub}`;
}

/**
 * Scans balanced parentheses starting at `openParenIndex` (which must point to `(`),
 * respecting nested parentheses, single/double/triple-quoted strings, escapes, and `#` comments.
 * Returns the inner text and closing index, or `null` if unbalanced.
 */
export function extractBalancedParens(
  text: string,
  openParenIndex: number,
): { content: string; endIndex: number } | null {
  if (text[openParenIndex] !== "(") return null;

  let depth = 1;
  let i = openParenIndex + 1;

  while (i < text.length) {
    if (text[i] === "#") {
      const nl = text.indexOf("\n", i + 1);
      if (nl < 0) break;
      i = nl + 1;
      continue;
    }

    if (text.startsWith('"""', i) || text.startsWith("'''", i)) {
      const quote = text.slice(i, i + 3);
      i += 3;
      while (i < text.length && !text.startsWith(quote, i)) {
        i += text[i] === "\\" ? 2 : 1;
      }
      if (!text.startsWith(quote, i)) return null;
      i += 3;
      continue;
    }

    if (text[i] === '"' || text[i] === "'") {
      const quote = text[i];
      i++;
      while (i < text.length && text[i] !== quote) {
        if (text[i] === "\n") return null;
        i += text[i] === "\\" ? 2 : 1;
      }
      if (i >= text.length) return null;
      i++;
      continue;
    }

    if (text[i] === "(") {
      depth++;
      i++;
      continue;
    }

    if (text[i] === ")") {
      depth--;
      if (depth === 0) {
        return {
          content: text.slice(openParenIndex + 1, i),
          endIndex: i,
        };
      }
      i++;
      continue;
    }

    i++;
  }

  return null;
}

