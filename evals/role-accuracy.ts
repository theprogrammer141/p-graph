import "./env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { identifyConvention } from "@/lib/conventions";
import { ALLOWED_AI_ROLES, type AllowedAIRole } from "@/lib/ai/explain";
import { getAIClient, PINNED_MODEL } from "@/lib/ai/client";

interface FileRecord {
  readonly id: string;
  readonly path: string;
  readonly analysis_id: string;
}

interface RoleTestCase {
  readonly fileId: string;
  readonly filePath: string;
  readonly analysisId: string;
  readonly groundTruthRole: AllowedAIRole;
  readonly neighbours: {
    readonly imports: readonly string[];
    readonly importedBy: readonly string[];
  };
}

interface EvaluationResultItem {
  readonly filePath: string;
  readonly groundTruth: AllowedAIRole;
  readonly predicted: AllowedAIRole;
  readonly correct: boolean;
}

const MAX_FILES_SCAN = 3000;
const DB_BATCH_SIZE = 1000;
const DEFAULT_TARGET_COUNT = 32;
const MIN_REQUIRED_FILES = 30;
const MAX_NEIGHBOURS_IN_PROMPT = 15;
const CONCURRENCY_LIMIT = 2;
const WORKER_PACING_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAllowedAIRole(role: string): role is AllowedAIRole {
  return (ALLOWED_AI_ROLES as readonly string[]).includes(role);
}

/**
 * Extracts a joined file path safely from a Supabase foreign-key relation payload.
 */
function extractJoinedPath(relation: unknown): string | null {
  if (!relation) return null;
  if (Array.isArray(relation)) {
    const first = relation[0] as { path?: unknown } | undefined;
    return typeof first?.path === "string" ? first.path : null;
  }
  const obj = relation as { path?: unknown };
  return typeof obj.path === "string" ? obj.path : null;
}

/**
 * Builds a balanced held-out dataset of at least 30 unique files whose conventional
 * role is one the AI classifier is permitted to return.
 */
async function buildHeldOutDataset(
  supabase: SupabaseClient<Database>,
  targetCount: number = DEFAULT_TARGET_COUNT,
): Promise<RoleTestCase[]> {
  const uniqueFilesByPath = new Map<string, FileRecord>();
  let from = 0;

  while (uniqueFilesByPath.size < MAX_FILES_SCAN) {
    const { data, error } = await supabase
      .from("files")
      .select("id, path, analysis_id")
      .order("id", { ascending: true })
      .range(from, from + DB_BATCH_SIZE - 1);

    if (error) {
      throw new Error(`Failed to fetch files from Supabase: ${error.message}`);
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (row.path && !uniqueFilesByPath.has(row.path)) {
        uniqueFilesByPath.set(row.path, {
          id: row.id,
          path: row.path,
          analysis_id: row.analysis_id,
        });
      }
    }

    if (data.length < DB_BATCH_SIZE) break;
    from += DB_BATCH_SIZE;
  }

  // Group unique files whose conventional role is in ALLOWED_AI_ROLES
  const candidateMap = new Map<AllowedAIRole, FileRecord[]>();
  for (const role of ALLOWED_AI_ROLES) {
    candidateMap.set(role, []);
  }

  for (const file of uniqueFilesByPath.values()) {
    const identified = identifyConvention(file.path);
    if (!identified || !isAllowedAIRole(identified.role)) continue;

    candidateMap.get(identified.role)?.push(file);
  }

  const rolesWithCandidates = ALLOWED_AI_ROLES.filter(
    (r) => (candidateMap.get(r)?.length ?? 0) > 0,
  );
  if (rolesWithCandidates.length === 0) {
    return [];
  }

  // Sample evenly across roles to build a balanced evaluation set
  const selectedFiles: Array<FileRecord & { readonly role: AllowedAIRole }> = [];
  const selectedIds = new Set<string>();
  const quotaPerRole = Math.ceil(targetCount / rolesWithCandidates.length);

  for (const role of rolesWithCandidates) {
    const pool = candidateMap.get(role) ?? [];
    const count = Math.min(pool.length, quotaPerRole);
    for (let i = 0; i < count; i++) {
      const candidate = pool[i];
      if (!selectedIds.has(candidate.id)) {
        selectedIds.add(candidate.id);
        selectedFiles.push({ ...candidate, role });
      }
    }
  }

  // Fill remaining slots up to targetCount if some roles had fewer candidates than quotaPerRole
  if (selectedFiles.length < targetCount) {
    for (const role of rolesWithCandidates) {
      const pool = candidateMap.get(role) ?? [];
      for (const candidate of pool) {
        if (!selectedIds.has(candidate.id)) {
          selectedIds.add(candidate.id);
          selectedFiles.push({ ...candidate, role });
          if (selectedFiles.length >= targetCount) break;
        }
      }
      if (selectedFiles.length >= targetCount) break;
    }
  }

  if (selectedFiles.length === 0) {
    return [];
  }

  // Batch-fetch outgoing and incoming edges in 2 parallel queries instead of 2*N sequential queries
  const fileIds = selectedFiles.map((f) => f.id);

  const [outgoingResult, incomingResult] = await Promise.all([
    supabase
      .from("edges")
      .select("source_file_id, analysis_id, target:files!edges_target_file_id_org_id_fkey(path)")
      .in("source_file_id", fileIds),
    supabase
      .from("edges")
      .select("target_file_id, analysis_id, source:files!edges_source_file_id_org_id_fkey(path)")
      .in("target_file_id", fileIds),
  ]);

  if (outgoingResult.error) {
    throw new Error(`Failed to fetch outgoing edges: ${outgoingResult.error.message}`);
  }
  if (incomingResult.error) {
    throw new Error(`Failed to fetch incoming edges: ${incomingResult.error.message}`);
  }

  const importsByFileId = new Map<string, string[]>();
  const importedByFileId = new Map<string, string[]>();
  const analysisByFileId = new Map<string, string>(
    selectedFiles.map((f) => [f.id, f.analysis_id]),
  );

  for (const edge of outgoingResult.data ?? []) {
    const sourceId = edge.source_file_id;
    if (!sourceId || edge.analysis_id !== analysisByFileId.get(sourceId)) continue;

    const targetPath = extractJoinedPath(edge.target);
    if (targetPath) {
      const list = importsByFileId.get(sourceId) ?? [];
      list.push(targetPath);
      importsByFileId.set(sourceId, list);
    }
  }

  for (const edge of incomingResult.data ?? []) {
    const targetId = edge.target_file_id;
    if (!targetId || edge.analysis_id !== analysisByFileId.get(targetId)) continue;

    const sourcePath = extractJoinedPath(edge.source);
    if (sourcePath) {
      const list = importedByFileId.get(targetId) ?? [];
      list.push(sourcePath);
      importedByFileId.set(targetId, list);
    }
  }

  return selectedFiles.map((file) => ({
    fileId: file.id,
    filePath: file.path,
    analysisId: file.analysis_id,
    groundTruthRole: file.role,
    neighbours: {
      imports: importsByFileId.get(file.id) ?? [],
      importedBy: importedByFileId.get(file.id) ?? [],
    },
  }));
}

/**
 * Parses a raw LLM role classification response using exact and word-boundary matching
 * so substrings (e.g., "webhook" -> "hook") or multi-word explanations do not misfire.
 */
function parsePredictedRole(rawResponse: string): AllowedAIRole | null {
  const cleaned = rawResponse.trim().toLowerCase().replace(/^['"`]+|['"`.,!?;:]+\$/g, "");
  if (!cleaned) return null;

  if (isAllowedAIRole(cleaned)) {
    return cleaned;
  }

  const tokens = cleaned.split(/\s+/);
  for (const token of tokens) {
    const stripped = token.replace(/[^a-z]/g, "");
    if (isAllowedAIRole(stripped)) {
      return stripped;
    }
  }

  for (const role of ALLOWED_AI_ROLES) {
    const boundaryRegex = new RegExp(`\\b${role}\\b`, "i");
    if (boundaryRegex.test(cleaned)) {
      return role;
    }
  }

  return null;
}

/**
 * Classifies a single file using the AI model, hiding its true role.
 * Includes retries with linear backoff for rate limits.
 */
async function classifyFileWithRetry(
  testCase: RoleTestCase,
  client: ReturnType<typeof getAIClient>,
  maxRetries: number = 3,
): Promise<AllowedAIRole> {
  const systemPrompt = [
    "You classify source files into a software architecture role.",
    "You may ONLY respond with one of the following non-structural roles:",
    "- service",
    "- repository",
    "- model",
    "- util",
    "- config",
    "- component",
    "- hook",
    "",
    "You must NEVER answer with structural or routable roles like 'page', 'route', or 'controller'.",
    "Respond with strictly the single role word, nothing else.",
  ].join("\n");

  const formattedImports =
    testCase.neighbours.imports.length > 0
      ? testCase.neighbours.imports
          .slice(0, MAX_NEIGHBOURS_IN_PROMPT)
          .map((p) => `- ${p}`)
          .join("\n")
      : "(none)";

  const formattedImportedBy =
    testCase.neighbours.importedBy.length > 0
      ? testCase.neighbours.importedBy
          .slice(0, MAX_NEIGHBOURS_IN_PROMPT)
          .map((p) => `- ${p}`)
          .join("\n")
      : "(none)";

  const userPrompt = [
    `File: ${testCase.filePath}`,
    "Imports:",
    formattedImports,
    "",
    "Imported by:",
    formattedImportedBy,
    "",
    "What non-structural role fits this file? (service, repository, model, util, config, component, hook)",
  ].join("\n");

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model: PINNED_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 50,
      });

      const raw = completion?.choices?.[0]?.message?.content ?? "";
      const parsedRole = parsePredictedRole(raw);
      if (parsedRole) {
        return parsedRole;
      }

      console.warn(
        `Unrecognized role output "${raw.trim()}" for ${testCase.filePath}; falling back to "util".`,
      );
      return "util";
    } catch (err) {
      if (attempt === maxRetries) {
        console.warn(`Request failed after ${maxRetries} attempts for ${testCase.filePath}:`, err);
        return "util";
      }
      await sleep(1200 * attempt);
    }
  }

  return "util";
}

/**
 * Runs tasks with a controlled concurrency limit and pacing.
 */
async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx], idx);
      // Small delay between calls to stay well within free tier rate limits
      if (currentIndex < items.length) {
        await sleep(WORKER_PACING_MS);
      }
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
  return results;
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.");
    process.exit(1);
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey);
  const client = getAIClient();

  console.log("================================================================================");
  console.log("Phase 11: Role Accuracy Evaluation over Held-Out Conventional Dataset");
  console.log("================================================================================\n");

  console.log(
    `Building held-out dataset of at least ${MIN_REQUIRED_FILES} files from convention ground truth...`,
  );
  const dataset = await buildHeldOutDataset(supabase, DEFAULT_TARGET_COUNT);

  if (dataset.length < MIN_REQUIRED_FILES) {
    console.error(
      `Insufficient files found in held-out set (${dataset.length} < ${MIN_REQUIRED_FILES}).`,
    );
    process.exit(1);
  }

  console.log(`Held-out dataset constructed with ${dataset.length} files.`);
  console.log(`Model: ${PINNED_MODEL}`);
  console.log(
    `Evaluating model accuracy with hidden roles (concurrency: ${CONCURRENCY_LIMIT})...\n`,
  );

  const results = await mapConcurrent(dataset, CONCURRENCY_LIMIT, async (testCase, index) => {
    const predicted = await classifyFileWithRetry(testCase, client);
    const correct = predicted === testCase.groundTruthRole;
    const item: EvaluationResultItem = {
      filePath: testCase.filePath,
      groundTruth: testCase.groundTruthRole,
      predicted,
      correct,
    };

    const status = correct ? "CORRECT" : "MISMATCH";
    console.log(
      `[${String(index + 1).padStart(2)}/${dataset.length}] [${status.padEnd(8)}] ${testCase.filePath}`.padEnd(
        72,
      ) + `Expected: ${testCase.groundTruthRole.padEnd(10)} | Predicted: ${predicted}`,
    );
    return item;
  });

  // Calculate overall accuracy and per-role breakdown
  const correctCount = results.filter((r) => r.correct).length;
  const totalCount = results.length;
  const accuracyPercentage = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;

  const roleStats = new Map<AllowedAIRole, { total: number; correct: number }>();
  for (const r of results) {
    const stat = roleStats.get(r.groundTruth) ?? { total: 0, correct: 0 };
    stat.total++;
    if (r.correct) stat.correct++;
    roleStats.set(r.groundTruth, stat);
  }

  console.log("\n--------------------------------------------------------------------------------");
  console.log("Role Accuracy Breakdown by Convention Role:");
  console.log("--------------------------------------------------------------------------------");
  for (const [role, stat] of roleStats.entries()) {
    const pct = stat.total > 0 ? ((stat.correct / stat.total) * 100).toFixed(1) : "0.0";
    console.log(`  - ${role.padEnd(12)}: ${stat.correct}/${stat.total} (${pct}%)`);
  }

  console.log("--------------------------------------------------------------------------------");
  console.log(
    `Overall Role Accuracy: ${accuracyPercentage.toFixed(1)}% (${correctCount}/${totalCount} files correct)`,
  );
  console.log("--------------------------------------------------------------------------------\n");

  console.log("================================================================================");
  console.log("Role accuracy evaluation completed successfully.");
  console.log("================================================================================");
}

main().catch((err: unknown) => {
  console.error("Role accuracy evaluation failed:", err);
  process.exit(1);
});