import crypto from "node:crypto";
import { getCurrentRunTree, traceable } from "langsmith/traceable";
import { Client } from "langsmith";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getAIClient, isTracingConfigured, PINNED_MODEL } from "./client";
import { checkInventedPaths } from "./invented-paths";

export const ALLOWED_AI_ROLES = [
  "service",
  "repository",
  "model",
  "util",
  "config",
  "component",
  "hook",
] as const;

export type AllowedAIRole = (typeof ALLOWED_AI_ROLES)[number];

export interface FileNeighbours {
  readonly imports: readonly string[];
  readonly importedBy: readonly string[];
}

export interface FolderNeighbours {
  readonly incomingFiles: readonly string[];
  readonly outgoingFiles: readonly string[];
}

export interface ExplainResult {
  readonly content: string;
  readonly cached: boolean;
  readonly model: string;
  readonly contentHash: string;
  readonly cacheKey: string;
}

const FALLBACK_EXPLANATION = "No explanation returned by model.";
const MAX_FOLDER_FILES_IN_PROMPT = 30;
const MAX_FOLDER_NEIGHBOURS_IN_PROMPT = 25;
const MAX_ROLE_NEIGHBOURS_IN_PROMPT = 15;

function isAllowedAIRole(value: string): value is AllowedAIRole {
  return (ALLOWED_AI_ROLES as readonly string[]).includes(value);
}

function formatBulletList(items: readonly string[], limit?: number): string {
  const sliced = typeof limit === "number" ? items.slice(0, limit) : items;
  return sliced.length > 0 ? sliced.map((item) => `- ${item}`).join("\n") : "(none)";
}

/**
 * Parses a raw LLM role classification response using exact and word-boundary matching
 * to prevent substring false positives (e.g., "webhook" matching "hook").
 */
function parseClassifiedRole(raw: string): AllowedAIRole {
  const cleaned = raw.trim().toLowerCase().replace(/^['"`]+|['"`.,!?;:]+$/g, "");
  if (!cleaned) return "util";

  if (isAllowedAIRole(cleaned)) {
    return cleaned;
  }

  for (const token of cleaned.split(/\s+/)) {
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

  return "util";
}

/**
 * Evaluates generated explanation text for invented paths and logs feedback to LangSmith when tracing is active.
 */
async function recordInventedPathFeedback(
  content: string,
  shownPaths: readonly string[],
): Promise<void> {
  const evalResult = checkInventedPaths(content, shownPaths);

  if (!isTracingConfigured()) {
    return;
  }

  try {
    const runTree = getCurrentRunTree();
    if (!runTree?.id) return;

    const langsmithClient = new Client({
      apiKey: process.env.LANGSMITH_API_KEY,
      apiUrl: process.env.LANGSMITH_ENDPOINT,
    });

    await langsmithClient.createFeedback(runTree.id, "invented_path", {
      score: evalResult.score,
      comment:
        evalResult.inventedPaths.length > 0
          ? `Invented paths: ${evalResult.inventedPaths.join(", ")}`
          : "All referenced paths were shown in input context",
    });
  } catch (err) {
    console.warn("Live evaluator feedback failed:", err);
  }
}

/**
 * Computes a deterministic cache key for a file explanation.
 * Changing the pinned model invalidates only its own cache.
 */
export function computeFileCacheKey(
  model: string,
  filePath: string,
  sha256: string,
): string {
  return crypto
    .createHash("sha256")
    .update(`v1:explain_file:${model}:${filePath}:${sha256}`)
    .digest("hex");
}

/**
 * Computes a deterministic content hash of a folder from its sorted constituent files.
 */
export function computeFolderContentHash(
  files: readonly { readonly path: string; readonly sha256?: string }[],
): string {
  const sorted = [...files].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
  const raw = sorted.map((f) => `${f.path}:${f.sha256 ?? ""}`).join("\n");
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Computes a deterministic cache key for a folded folder explanation.
 */
export function computeFolderCacheKey(
  model: string,
  folderPath: string,
  folderContentHash: string,
): string {
  return crypto
    .createHash("sha256")
    .update(`v1:explain_folder:${model}:${folderPath}:${folderContentHash}`)
    .digest("hex");
}

/**
 * Computes a deterministic cache key for AI role classification.
 */
export function computeRoleCacheKey(model: string, sha256: string): string {
  return crypto
    .createHash("sha256")
    .update(`v1:classify_role:${model}:${sha256}`)
    .digest("hex");
}

/**
 * Safely extracts assistant message content from an AI completion,
 * throwing descriptive errors on upstream/provider failures.
 */
function extractCompletionContent(completion: unknown): string {
  const res = completion as {
    error?: { message?: string; code?: number };
    choices?: Array<{
      message?: { content?: string | null };
    }>;
  };

  if (res?.error) {
    throw new Error(
      `AI provider error (${res.error.code ?? "unknown"}): ${res.error.message ?? "upstream error"}`,
    );
  }

  const choice = res?.choices?.[0];
  if (!choice) {
    throw new Error("AI provider returned no completion choices.");
  }

  return choice.message?.content?.trim() ?? "";
}

/**
 * Explains a single source file in the context of its real neighbours.
 * The cache read happens inside the traced call so cache hits appear in LangSmith with 0 model tokens.
 */
export const explainFileTraced = traceable(
  async (params: {
    supabase: SupabaseClient<Database>;
    analysisId: string;
    orgId: string;
    fileId: string;
    filePath: string;
    fileSha256: string;
    lines: number;
    role?: string;
    neighbours: FileNeighbours;
  }): Promise<ExplainResult> => {
    const {
      supabase,
      analysisId,
      orgId,
      fileId,
      filePath,
      fileSha256,
      lines,
      role,
      neighbours,
    } = params;

    const cacheKey = computeFileCacheKey(PINNED_MODEL, filePath, fileSha256);

    // 1. Cache read happens inside the traced call
    const { data: cached } = await supabase
      .from("explanations")
      .select("id, content, content_hash, model, cache_key")
      .eq("analysis_id", analysisId)
      .eq("cache_key", cacheKey)
      .limit(1)
      .maybeSingle();

    if (cached && cached.content) {
      return {
        content: cached.content,
        cached: true,
        model: cached.model ?? PINNED_MODEL,
        contentHash: cached.content_hash ?? fileSha256,
        cacheKey,
      };
    }

    // 2. Cache miss: invoke AI model through wrapped client
    const client = getAIClient();

    const systemPrompt = [
      "You are a concise codebase explainer. Explain what this file does specifically in the context of its actual neighbours in the dependency graph.",
      "",
      "Formatting rules:",
      "- Use EXACTLY three pieces of formatting: inline code (`code`), bold (**bold**), and bullets (- bullet).",
      "- NO headings of any kind (do NOT use #, ##, ###, etc.).",
      "- When referencing other files, mention their exact repository path so the developer can click them.",
      "- Keep the explanation dense, informative, and short (1-2 paragraphs).",
      "- Do NOT guess or invent connections. Every neighbour was extracted by parsing the code.",
    ].join("\n");

    const userPrompt = [
      `File: ${filePath}`,
      `Lines: ${lines}`,
      ...(role ? [`Current Role: ${role}`] : []),
      `Imports (${neighbours.imports.length} files):`,
      formatBulletList(neighbours.imports),
      "",
      `Imported By (${neighbours.importedBy.length} files):`,
      formatBulletList(neighbours.importedBy),
      "",
      "Explain what this file does in the architecture based on its actual neighbours.",
    ].join("\n");

    const completion = await client.chat.completions.create({
      model: PINNED_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 500,
    });

    const rawContent = extractCompletionContent(completion);
    const hasValidContent = rawContent.length > 0;
    const content = hasValidContent ? rawContent : FALLBACK_EXPLANATION;

    // 3. Live evaluation: check for invented paths against exact shown paths
    const shownPaths = [filePath, ...neighbours.imports, ...neighbours.importedBy];
    await recordInventedPathFeedback(content, shownPaths);

    // 4. Store in database cache only when a non-empty explanation was generated
    if (hasValidContent) {
      const { error: insertError } = await supabase.from("explanations").upsert(
        {
          org_id: orgId,
          analysis_id: analysisId,
          file_id: fileId,
          target_type: "file",
          target_path: filePath,
          content,
          model: PINNED_MODEL,
          content_hash: fileSha256,
          cache_key: cacheKey,
        },
        { onConflict: "analysis_id, cache_key", ignoreDuplicates: true },
      );

      if (insertError) {
        console.warn("Failed to cache file explanation:", insertError);
      }
    }

    return {
      content,
      cached: false,
      model: PINNED_MODEL,
      contentHash: fileSha256,
      cacheKey,
    };
  },
  { name: "explain_file", run_type: "chain" },
);

/**
 * Explains a folded folder: what is in here, and why does so much point at it.
 * The cache read happens inside the traced call.
 */
export const explainFolderTraced = traceable(
  async (params: {
    supabase: SupabaseClient<Database>;
    analysisId: string;
    orgId: string;
    folderPath: string;
    folderFiles: readonly {
      readonly path: string;
      readonly sha256?: string;
      readonly lines?: number;
    }[];
    neighbours: FolderNeighbours;
  }): Promise<ExplainResult> => {
    const { supabase, analysisId, orgId, folderPath, folderFiles, neighbours } = params;

    const folderContentHash = computeFolderContentHash(folderFiles);
    const cacheKey = computeFolderCacheKey(PINNED_MODEL, folderPath, folderContentHash);

    // 1. Cache read inside the traced call
    const { data: cached } = await supabase
      .from("explanations")
      .select("id, content, content_hash, model, cache_key")
      .eq("analysis_id", analysisId)
      .eq("cache_key", cacheKey)
      .limit(1)
      .maybeSingle();

    if (cached && cached.content) {
      return {
        content: cached.content,
        cached: true,
        model: cached.model ?? PINNED_MODEL,
        contentHash: cached.content_hash ?? folderContentHash,
        cacheKey,
      };
    }

    // 2. Cache miss: invoke AI model through wrapped client
    const client = getAIClient();

    const systemPrompt = [
      "You are a concise codebase explainer. Explain this directory as a folded unit in the architecture.",
      "",
      "Answer: What is in here, and why does external code point at it?",
      "Do NOT simply summarize one file. The answer must describe the cohesive purpose of the folder itself.",
      "",
      "Formatting rules:",
      "- Use EXACTLY three pieces of formatting: inline code (`code`), bold (**bold**), and bullets (- bullet).",
      "- NO headings of any kind (do NOT use #, ##, ###, etc.).",
      "- When referencing files, use exact repository paths.",
      "- Keep the explanation dense, informative, and short (1-2 paragraphs).",
    ].join("\n");

    const displayedFiles = folderFiles
      .slice(0, MAX_FOLDER_FILES_IN_PROMPT)
      .map((f) => `- ${f.path}`)
      .join("\n");
    const remainingFilesNote =
      folderFiles.length > MAX_FOLDER_FILES_IN_PROMPT
        ? `\n...and ${folderFiles.length - MAX_FOLDER_FILES_IN_PROMPT} more files`
        : "";

    const userPrompt = [
      `Folder: ${folderPath}`,
      `Contains (${folderFiles.length} files):`,
      `${displayedFiles}${remainingFilesNote}`,
      "",
      `External files importing into this folder (${neighbours.incomingFiles.length}):`,
      formatBulletList(neighbours.incomingFiles, MAX_FOLDER_NEIGHBOURS_IN_PROMPT),
      "",
      `External files this folder imports (${neighbours.outgoingFiles.length}):`,
      formatBulletList(neighbours.outgoingFiles, MAX_FOLDER_NEIGHBOURS_IN_PROMPT),
      "",
      "Explain what is in this folder and why so much points at it.",
    ].join("\n");

    const completion = await client.chat.completions.create({
      model: PINNED_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 500,
    });

    const rawContent = extractCompletionContent(completion);
    const hasValidContent = rawContent.length > 0;
    const content = hasValidContent ? rawContent : FALLBACK_EXPLANATION;

    // 3. Live evaluation: check for invented paths against exact shown paths
    const shownPaths = [
      folderPath,
      ...folderFiles.slice(0, MAX_FOLDER_FILES_IN_PROMPT).map((f) => f.path),
      ...neighbours.incomingFiles.slice(0, MAX_FOLDER_NEIGHBOURS_IN_PROMPT),
      ...neighbours.outgoingFiles.slice(0, MAX_FOLDER_NEIGHBOURS_IN_PROMPT),
    ];
    await recordInventedPathFeedback(content, shownPaths);

    // 4. Store in database cache only when a non-empty explanation was generated
    if (hasValidContent) {
      const { error: insertError } = await supabase.from("explanations").upsert(
        {
          org_id: orgId,
          analysis_id: analysisId,
          file_id: null,
          target_type: "folder",
          target_path: folderPath,
          content,
          model: PINNED_MODEL,
          content_hash: folderContentHash,
          cache_key: cacheKey,
        },
        { onConflict: "analysis_id, cache_key", ignoreDuplicates: true },
      );

      if (insertError) {
        console.warn("Failed to cache folder explanation:", insertError);
      }
    }

    return {
      content,
      cached: false,
      model: PINNED_MODEL,
      contentHash: folderContentHash,
      cacheKey,
    };
  },
  { name: "explain_folder", run_type: "chain" },
);

/**
 * Assigns a non-structural role to a file that no adapter could identify.
 * Allowed roles: service, repository, model, util, config, component, hook.
 * Never routable/structural roles (page, route, controller).
 */
export const classifyFileRoleTraced = traceable(
  async (params: {
    supabase: SupabaseClient<Database>;
    analysisId: string;
    orgId: string;
    fileId: string;
    filePath: string;
    fileSha256: string;
    neighbours: FileNeighbours;
  }): Promise<{ role: AllowedAIRole; cached: boolean }> => {
    const { supabase, analysisId, orgId, fileId, filePath, neighbours } = params;

    // 1. Check if role is already stored in database
    const { data: existingRole } = await supabase
      .from("file_roles")
      .select("role, source")
      .eq("analysis_id", analysisId)
      .eq("file_id", fileId)
      .maybeSingle();

    const normalizedExisting = existingRole?.role?.trim().toLowerCase() ?? "";
    if (isAllowedAIRole(normalizedExisting)) {
      return { role: normalizedExisting, cached: true };
    }

    // 2. Cache miss: classify using model
    const client = getAIClient();

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

    const userPrompt = [
      `File: ${filePath}`,
      "Imports:",
      formatBulletList(neighbours.imports, MAX_ROLE_NEIGHBOURS_IN_PROMPT),
      "",
      "Imported by:",
      formatBulletList(neighbours.importedBy, MAX_ROLE_NEIGHBOURS_IN_PROMPT),
      "",
      "What non-structural role fits this file? (service, repository, model, util, config, component, hook)",
    ].join("\n");

    const completion = await client.chat.completions.create({
      model: PINNED_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 200,
    });

    const raw = extractCompletionContent(completion);
    const matched = parseClassifiedRole(raw);

    // 3. Upsert into file_roles table with source = 'ai'
    if (existingRole) {
      const { data, error } = await supabase
        .from("file_roles")
        .update({ role: matched, source: "ai" })
        .eq("analysis_id", analysisId)
        .eq("file_id", fileId)
        .select("file_id");

      if (error) {
        throw new Error(`Failed to update file role: ${error.message}`);
      }
      if (!data || data.length === 0) {
        throw new Error("Failed to update file role: no row was updated");
      }
    } else {
      const { error } = await supabase.from("file_roles").insert({
        org_id: orgId,
        analysis_id: analysisId,
        file_id: fileId,
        role: matched,
        source: "ai",
      });

      if (error) {
        throw new Error(`Failed to insert file role: ${error.message}`);
      }
    }

    return { role: matched, cached: false };
  },
  { name: "classify_file_role", run_type: "chain" },
);