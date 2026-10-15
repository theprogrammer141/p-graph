import fs from "node:fs";
import path from "node:path";

/**
 * Loads environment variables from .env.local and .env for scripts running outside Next.js.
 * Can be safely imported at the top of any standalone script or invoked explicitly.
 */
export function loadEnv(rootDir: string = process.cwd()): void {
  const envFiles = [".env.local", ".env"];
  for (const filename of envFiles) {
    const fullPath = path.resolve(rootDir, filename);
    if (!fs.existsSync(fullPath)) continue;

    // Use Node 20.6+ native loader if available
    if (typeof process.loadEnvFile === "function") {
      try {
        process.loadEnvFile(fullPath);
        continue;
      } catch {
        // Fall back to manual parsing if native loader fails on quotes or formatting
      }
    }

    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const equalsIndex = trimmed.indexOf("=");
        if (equalsIndex === -1) continue;

        const key = trimmed.slice(0, equalsIndex).trim();
        let value = trimmed.slice(equalsIndex + 1).trim();

        // Strip surrounding quotes if present
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        if (key && !(key in process.env)) {
          process.env[key] = value;
        }
      }
    } catch (err) {
      console.warn(`Failed reading ${fullPath}:`, err);
    }
  }
}

// Auto-run on import so importing this file instantly populates process.env
loadEnv();
