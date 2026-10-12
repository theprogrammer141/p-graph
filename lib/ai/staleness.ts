import crypto from "node:crypto";
import { fetchRepoCommitSha } from "@/lib/pipeline/github";

export interface StalenessCheckResult {
  readonly isStale: boolean;
  readonly reason?: string;
  readonly latestCommitSha?: string;
  readonly analysisCommitSha?: string;
}

/**
 * Checks whether an analysed file or repository has moved past the analysed commit.
 */
export async function checkFileStaleness(params: {
  readonly owner: string;
  readonly name: string;
  readonly filePath: string;
  readonly analysisCommitSha: string | null;
  readonly storedSha256: string;
}): Promise<StalenessCheckResult> {
  const { owner, name, filePath, analysisCommitSha, storedSha256 } = params;

  if (!analysisCommitSha) {
    return { isStale: false };
  }

  try {
    const latestCommitSha = await fetchRepoCommitSha(owner, name);

    // If HEAD is unchanged, the file cannot be stale
    if (latestCommitSha === analysisCommitSha) {
      return {
        isStale: false,
        latestCommitSha,
        analysisCommitSha,
      };
    }

    // HEAD has moved past analysed commit. Check if this specific file's content changed.
    const rawFileUrl = `https://raw.githubusercontent.com/${owner}/${name}/${latestCommitSha}/${filePath}`;
    const res = await fetch(rawFileUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "p-graph" },
      cache: "no-store",
    });

    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      const currentSha256 = crypto.createHash("sha256").update(buffer).digest("hex");

      if (currentSha256 !== storedSha256) {
        return {
          isStale: true,
          reason: `File content has changed since commit ${analysisCommitSha.slice(0, 7)}.`,
          latestCommitSha,
          analysisCommitSha,
        };
      }
    }

    // Even if this file didn't change, the repository moved past the analysed commit
    return {
      isStale: true,
      reason: `Repository has moved past analysed commit ${analysisCommitSha.slice(0, 7)} (HEAD is ${latestCommitSha.slice(0, 7)}).`,
      latestCommitSha,
      analysisCommitSha,
    };
  } catch (err: unknown) {
    console.error("Staleness check encountered error:", err);
    // When remote check fails, default to not stale to prevent false positives
    return { isStale: false };
  }
}
