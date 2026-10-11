import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as tar from "tar";

const execFileAsync = promisify(execFile);

export interface ParsedRepo {
  owner: string;
  name: string;
  canonicalUrl: string;
}

export interface ExtractedRepo {
  commitSha: string;
  extractDir: string;
  cleanup: () => Promise<void>;
}

/**
 * Normalises and validates a public GitHub repository URL or slug.
 */
export function parseRepoUrl(rawUrl: string): ParsedRepo {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error("Repository URL cannot be empty.");
  }

  // Remove trailing slashes and .git suffix
  const clean = trimmed.replace(/\.git$/, "").replace(/\/+$/, "");

  // Match:
  // - https://github.com/owner/name
  // - http://github.com/owner/name
  // - github.com/owner/name
  // - owner/name
  const fullMatch = clean.match(/^(?:https?:\/\/)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/i);
  if (fullMatch) {
    const owner = fullMatch[1];
    const name = fullMatch[2];
    return {
      owner,
      name,
      canonicalUrl: `https://github.com/${owner}/${name}`,
    };
  }

  const slugMatch = clean.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (slugMatch) {
    const owner = slugMatch[1];
    const name = slugMatch[2];
    return {
      owner,
      name,
      canonicalUrl: `https://github.com/${owner}/${name}`,
    };
  }

  throw new Error(`Invalid GitHub repository URL: "${rawUrl}". Expected format: https://github.com/owner/repo`);
}

/**
 * Resolves the HEAD commit SHA for a public GitHub repository.
 * Uses GitHub API with git ls-remote fallback if rate-limited.
 */
export async function fetchRepoCommitSha(owner: string, name: string): Promise<string> {
  const apiUrl = `https://api.github.com/repos/${owner}/${name}/commits/HEAD`;

  try {
    const res = await fetch(apiUrl, {
      headers: {
        "User-Agent": "p-graph",
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (res.status === 200) {
      const data = (await res.json()) as { sha?: string };
      if (data.sha) return data.sha;
    }

    if (res.status === 404) {
      throw new Error(`Repository ${owner}/${name} was not found or is private.`);
    }

    // If rate-limited or other error, fallback to git ls-remote
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("was not found")) {
      throw err;
    }
    // Proceed to fallback
  }

  // Fallback: git ls-remote requires no GitHub token and has no API rate limit
  try {
    const repoUrl = `https://github.com/${owner}/${name}`;
    const { stdout } = await execFileAsync("git", ["ls-remote", repoUrl, "HEAD"]);
    const sha = stdout.trim().split(/\s+/)[0];
    if (sha && sha.length >= 40) {
      return sha;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not access repository ${owner}/${name}: ${message}`);
  }

  throw new Error(`Could not determine commit SHA for repository ${owner}/${name}.`);
}

/**
 * Downloads a public repository archive at a given commit SHA and extracts it into a temporary directory.
 */
export async function downloadAndExtractRepo(
  owner: string,
  name: string,
  commitSha: string,
): Promise<ExtractedRepo> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pgraph-repo-"));
  const archivePath = path.join(tmpDir, "archive.tar.gz");
  const extractDir = path.join(tmpDir, "source");

  /** Removes the temporary archive and extracted files, ignoring cleanup errors. */
  const cleanup = async () => {
    try {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore errors on cleanup
    }
  };

  try {
    // Primary download URL via GitHub archive
    const downloadUrls = [
      `https://codeload.github.com/${owner}/${name}/legacy.tar.gz/${commitSha}`,
      `https://github.com/${owner}/${name}/archive/${commitSha}.tar.gz`,
      `https://api.github.com/repos/${owner}/${name}/tarball/${commitSha}`,
    ];

    let downloaded = false;
    let lastError = "";

    for (const url of downloadUrls) {
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": "p-graph",
          },
        });

        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          await fs.promises.writeFile(archivePath, Buffer.from(arrayBuffer));
          downloaded = true;
          break;
        } else {
          lastError = `HTTP ${res.status} from ${url}`;
        }
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    if (!downloaded) {
      throw new Error(`Failed to download repository archive for ${owner}/${name} (${lastError}).`);
    }

    await fs.promises.mkdir(extractDir, { recursive: true });

    await tar.x({
      file: archivePath,
      cwd: extractDir,
      strip: 1,
    });

    return {
      commitSha,
      extractDir,
      cleanup,
    };
  } catch (err) {
    await cleanup();
    throw err;
  }
}
