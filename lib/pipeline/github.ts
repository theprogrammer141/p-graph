import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as tar from "tar";
import { UserFacingError } from "@/lib/errors";

const execFileAsync = promisify(execFile);
const REQUEST_TIMEOUT_MS = 30_000;
const ARCHIVE_TIMEOUT_MS = 60_000;
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 500 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 50_000;

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
    throw new UserFacingError("Repository URL cannot be empty.");
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

  throw new UserFacingError(`Invalid GitHub repository URL: "${rawUrl}". Expected format: https://github.com/owner/repo`);
}

/**
 * Resolves the HEAD commit SHA for a public GitHub repository.
 * Uses GitHub API with git ls-remote fallback if rate-limited.
 */
export async function fetchRepoCommitSha(owner: string, name: string): Promise<string> {
  const apiUrl = `https://api.github.com/repos/${owner}/${name}/commits/HEAD`;

  try {
    const res = await fetch(apiUrl, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
      throw new UserFacingError(`Repository ${owner}/${name} was not found or is private.`);
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
    const { stdout } = await execFileAsync("git", ["ls-remote", repoUrl, "HEAD"], {
      timeout: REQUEST_TIMEOUT_MS,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    const sha = stdout.trim().split(/\s+/)[0];
    if (sha && sha.length >= 40) {
      return sha;
    }
  } catch {
    throw new UserFacingError(`Could not access repository ${owner}/${name}. Ensure it is public and accessible.`);
  }

  throw new UserFacingError(`Could not determine commit SHA for repository ${owner}/${name}.`);
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

    for (const url of downloadUrls) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(ARCHIVE_TIMEOUT_MS),
          headers: {
            "User-Agent": "p-graph",
          },
        });

        if (res.ok) {
          if (Number(res.headers.get("content-length")) > MAX_ARCHIVE_BYTES) {
            await res.body?.cancel();
            throw new UserFacingError("Repository archive exceeds the 100 MiB download limit.");
          }
          if (!res.body) throw new UserFacingError("Repository archive response has no body.");

          let downloadedBytes = 0;
          const byteLimit = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
              downloadedBytes += chunk.length;
              if (downloadedBytes > MAX_ARCHIVE_BYTES) {
                callback(new UserFacingError("Repository archive exceeds the 100 MiB download limit."));
              } else {
                callback(null, chunk);
              }
            },
          });
          const reader = res.body.getReader();
          const chunks = async function* () {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) return;
                yield value;
              }
            } finally {
              await reader.cancel();
              reader.releaseLock();
            }
          };
          await pipeline(
            Readable.from(chunks()),
            byteLimit,
            fs.createWriteStream(archivePath),
          );
          downloaded = true;
          break;
        } else {
          await res.body?.cancel();
        }
      } catch (err: unknown) {
        if (err instanceof UserFacingError) throw err;
      }
    }

    if (!downloaded) {
      throw new UserFacingError(`Failed to download repository archive for ${owner}/${name}. Ensure the repository is public and accessible.`);
    }

    await fs.promises.mkdir(extractDir, { recursive: true });

    let extractedBytes = 0;
    let entryCount = 0;
    // Validate before writing files: aborting an unpack can leave pending writes
    // racing with cleanup of the temporary directory.
    const archiveCheck = tar.t({
      filter(_entryPath, entry) {
        extractedBytes += entry.size;
        entryCount += 1;
        if (extractedBytes > MAX_EXTRACTED_BYTES || entryCount > MAX_ARCHIVE_ENTRIES) {
          archiveCheck.abort(new UserFacingError("Repository archive exceeds extraction limits (500 MiB or 50,000 entries)."));
          return false;
        }
        return true;
      },
    });
    await pipeline(fs.createReadStream(archivePath), archiveCheck);
    await tar.x({ file: archivePath, cwd: extractDir, strip: 1 });

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
