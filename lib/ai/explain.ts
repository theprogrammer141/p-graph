import crypto from "node:crypto";
import { traceable } from "langsmith/traceable";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getAIClient, PINNED_MODEL } from "./client";

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
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : 1));
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

    if (cached) {
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

    const systemPrompt = `You are a concise codebase explainer. Explain what this file does specifically in the context of its actual neighbours in the dependency graph.

Formatting rules:
- Use EXACTLY three pieces of formatting: inline code (\`code\`), bold (**bold**), and bullets (- bullet).
- NO headings of any kind (do NOT use #, ##, ###, etc.).
- When referencing other files, mention their exact repository path so the developer can click them.
- Keep the explanation dense, informative, and short (1-2 paragraphs).
- Do NOT guess or invent connections. Every neighbour was extracted by parsing the code.`;

    const userPrompt = `File: ${filePath}
Lines: ${lines}
${role ? `Current Role: ${role}\n` : ""}\
Imports (${neighbours.imports.length} files):
${neighbours.imports.length > 0 ? neighbours.imports.map((p) => `- ${p}`).join("\n") : "(none)"}

Imported By (${neighbours.importedBy.length} files):
${neighbours.importedBy.length > 0 ? neighbours.importedBy.map((p) => `- ${p}`).join("\n") : "(none)"}

Explain what this file does in the architecture based on its actual neighbours.`;

    const completion = await client.chat.completions.create({
      model: PINNED_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 500,
    });

    const content =
      completion.choices[0]?.message?.content?.trim() ?? "No explanation returned by model.";

    // 3. Store in database cache
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
    folderFiles: readonly { readonly path: string; readonly sha256?: string; readonly lines?: number }[];
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

    if (cached) {
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

    const systemPrompt = `You are a concise codebase explainer. Explain this directory as a folded unit in the architecture.

Answer: What is in here, and why does external code point at it?
Do NOT simply summarize one file. The answer must describe the cohesive purpose of the folder itself.

Formatting rules:
- Use EXACTLY three pieces of formatting: inline code (\`code\`), bold (**bold**), and bullets (- bullet).
- NO headings of any kind (do NOT use #, ##, ###, etc.).
- When referencing files, use exact repository paths.
- Keep the explanation dense, informative, and short (1-2 paragraphs).`;

    const userPrompt = `Folder: ${folderPath}
Contains (${folderFiles.length} files):
${folderFiles.slice(0, 30).map((f) => `- ${f.path}`).join("\n")}${
      folderFiles.length > 30 ? `\n...and ${folderFiles.length - 30} more files` : ""
    }

External files importing into this folder (${neighbours.incomingFiles.length}):
${neighbours.incomingFiles.length > 0 ? neighbours.incomingFiles.slice(0, 25).map((p) => `- ${p}`).join("\n") : "(none)"}

External files this folder imports (${neighbours.outgoingFiles.length}):
${neighbours.outgoingFiles.length > 0 ? neighbours.outgoingFiles.slice(0, 25).map((p) => `- ${p}`).join("\n") : "(none)"}

Explain what is in this folder and why so much points at it.`;

    const completion = await client.chat.completions.create({
      model: PINNED_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 500,
    });

    const content =
      completion.choices[0]?.message?.content?.trim() ?? "No explanation returned by model.";

    // 3. Store in database cache
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

    if (
      existingRole &&
      existingRole.role &&
      existingRole.role !== "Generic" &&
      existingRole.role !== "Unidentified"
    ) {
      const roleStr = existingRole.role.toLowerCase();
      const valid = ALLOWED_AI_ROLES.find((r) => r === roleStr);
      return { role: (valid ?? existingRole.role) as AllowedAIRole, cached: true };
    }

    // 2. Cache miss: classify using model
    const client = getAIClient();

    const systemPrompt = `You classify source files into a software architecture role.
You may ONLY respond with one of the following non-structural roles:
- service
- repository
- model
- util
- config
- component
- hook

You must NEVER answer with structural or routable roles like 'page', 'route', or 'controller'.
Respond with strictly the single role word, nothing else.`;

    const userPrompt = `File: ${filePath}
Imports:
${neighbours.imports.length > 0 ? neighbours.imports.slice(0, 15).map((p) => `- ${p}`).join("\n") : "(none)"}

Imported by:
${neighbours.importedBy.length > 0 ? neighbours.importedBy.slice(0, 15).map((p) => `- ${p}`).join("\n") : "(none)"}

What non-structural role fits this file? (service, repository, model, util, config, component, hook)`;

    const completion = await client.chat.completions.create({
      model: PINNED_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 30,
    });

    const raw = completion.choices[0]?.message?.content?.trim().toLowerCase() ?? "";
    const matched = ALLOWED_AI_ROLES.find((r) => raw.includes(r)) ?? "util";

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
