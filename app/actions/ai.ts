"use server";

import { auth } from "@clerk/nextjs/server";
import { createClerkSupabaseClient } from "@/lib/supabase";
import {
  explainFileTraced,
  explainFolderTraced,
  classifyFileRoleTraced,
  type AllowedAIRole,
} from "@/lib/ai/explain";
import { isTracingConfigured } from "@/lib/ai/client";
import { checkFileStaleness } from "@/lib/ai/staleness";
import { toUserFacingMessage, logServerError } from "@/lib/errors";

export interface ExplainActionResult {
  readonly ok: boolean;
  readonly content?: string;
  readonly cached?: boolean;
  readonly isStale?: boolean;
  readonly stalenessReason?: string;
  readonly model?: string;
  readonly error?: string;
}

export interface ClassifyRoleActionResult {
  readonly ok: boolean;
  readonly role?: AllowedAIRole;
  readonly cached?: boolean;
  readonly error?: string;
}

/**
 * Returns whether LangSmith tracing is currently configured.
 */
export async function getTracingStatusAction(): Promise<{ configured: boolean }> {
  return { configured: isTracingConfigured() };
}

/**
 * Server action to explain a source file based on its real neighbours.
 */
export async function explainFileAction(params: {
  analysisId: string;
  filePath: string;
}): Promise<ExplainActionResult> {
  const { analysisId, filePath } = params;
  const { orgId } = await auth();

  if (!orgId) {
    return { ok: false, error: "Authentication required." };
  }

  const supabase = await createClerkSupabaseClient();

  // 1. Fetch analysis and project details for commit SHA and repo metadata
  const { data: analysis, error: analysisError } = await supabase
    .from("analyses")
    .select("id, commit_sha, project:projects(owner, name)")
    .eq("id", analysisId)
    .single();

  if (analysisError || !analysis) {
    return { ok: false, error: `Analysis not found: ${analysisError?.message}` };
  }

  const project = analysis.project as { owner: string; name: string } | null;

  // 2. Fetch target file
  const { data: targetFile, error: fileError } = await supabase
    .from("files")
    .select("id, path, lines, sha256")
    .eq("analysis_id", analysisId)
    .eq("path", filePath)
    .single();

  if (fileError || !targetFile) {
    return { ok: false, error: `File not found: ${fileError?.message}` };
  }

  // 3. Fetch existing role if any
  const { data: roleRow } = await supabase
    .from("file_roles")
    .select("role")
    .eq("analysis_id", analysisId)
    .eq("file_id", targetFile.id)
    .maybeSingle();

  // 4. Fetch neighbours (outgoing imports and incoming dependents)
  const [{ data: outgoingEdges }, { data: incomingEdges }] = await Promise.all([
    supabase
      .from("edges")
      .select("target_file:files!edges_target_file_id_org_id_fkey(path)")
      .eq("analysis_id", analysisId)
      .eq("source_file_id", targetFile.id),
    supabase
      .from("edges")
      .select("source_file:files!edges_source_file_id_org_id_fkey(path)")
      .eq("analysis_id", analysisId)
      .eq("target_file_id", targetFile.id),
  ]);

  const imports = Array.from(
    new Set(
      (outgoingEdges ?? [])
        .map((e) => (e.target_file as { path?: string } | null)?.path)
        .filter((p): p is string => Boolean(p)),
    ),
  );

  const importedBy = Array.from(
    new Set(
      (incomingEdges ?? [])
        .map((e) => (e.source_file as { path?: string } | null)?.path)
        .filter((p): p is string => Boolean(p)),
    ),
  );

  // 5. Run staleness check concurrently with explainFileTraced
  const stalenessPromise =
    project?.owner && project?.name
      ? checkFileStaleness({
          owner: project.owner,
          name: project.name,
          filePath: targetFile.path,
          analysisCommitSha: analysis.commit_sha,
          storedSha256: targetFile.sha256 ?? "",
        })
      : Promise.resolve({ isStale: false, reason: undefined });

  const explainPromise = explainFileTraced({
    supabase,
    analysisId,
    orgId,
    fileId: targetFile.id,
    filePath: targetFile.path,
    fileSha256: targetFile.sha256 ?? "",
    lines: targetFile.lines ?? 0,
    role: roleRow?.role,
    neighbours: { imports, importedBy },
  });

  try {
    const [staleness, result] = await Promise.all([stalenessPromise, explainPromise]);

    return {
      ok: true,
      content: result.content,
      cached: result.cached,
      isStale: staleness.isStale,
      stalenessReason: staleness.reason,
      model: result.model,
    };
  } catch (err: unknown) {
    const userFacing = toUserFacingMessage(err, "Failed to explain file. Please try again.", "ai.explainFileAction");
    return { ok: false, error: userFacing.message };
  }
}

/**
 * Server action to explain a folded folder.
 */
export async function explainFolderAction(params: {
  analysisId: string;
  folderPath: string;
  folderFiles: readonly string[];
}): Promise<ExplainActionResult> {
  const { analysisId, folderPath, folderFiles } = params;
  const { orgId } = await auth();

  if (!orgId) {
    return { ok: false, error: "Authentication required." };
  }

  const supabase = await createClerkSupabaseClient();

  // 1. Fetch file nodes in this folder
  const { data: filesData, error: filesError } = await supabase
    .from("files")
    .select("id, path, lines, sha256")
    .eq("analysis_id", analysisId)
    .in("path", folderFiles as string[]);

  if (filesError || !filesData || filesData.length === 0) {
    return { ok: false, error: `Folder files not found: ${filesError?.message}` };
  }

  const fileIdSet = new Set(filesData.map((f) => f.id));

  // 2. Query edges connecting into or out of this folder
  const [{ data: incomingEdges }, { data: outgoingEdges }] = await Promise.all([
    supabase
      .from("edges")
      .select("source_file:files!edges_source_file_id_org_id_fkey(path, id)")
      .eq("analysis_id", analysisId)
      .in(
        "target_file_id",
        filesData.map((f) => f.id),
      ),
    supabase
      .from("edges")
      .select("target_file:files!edges_target_file_id_org_id_fkey(path, id)")
      .eq("analysis_id", analysisId)
      .in(
        "source_file_id",
        filesData.map((f) => f.id),
      ),
  ]);

  const incomingFiles = Array.from(
    new Set(
      (incomingEdges ?? [])
        .map((e) => e.source_file as { path?: string; id?: string } | null)
        .filter((f): f is { path: string; id: string } => Boolean(f?.path && !fileIdSet.has(f.id!)))
        .map((f) => f.path),
    ),
  );

  const outgoingFiles = Array.from(
    new Set(
      (outgoingEdges ?? [])
        .map((e) => e.target_file as { path?: string; id?: string } | null)
        .filter((f): f is { path: string; id: string } => Boolean(f?.path && !fileIdSet.has(f.id!)))
        .map((f) => f.path),
    ),
  );

  try {
    const result = await explainFolderTraced({
      supabase,
      analysisId,
      orgId,
      folderPath,
      folderFiles: filesData.map((f) => ({
        path: f.path,
        sha256: f.sha256 ?? undefined,
        lines: f.lines ?? 0,
      })),
      neighbours: { incomingFiles, outgoingFiles },
    });

    return {
      ok: true,
      content: result.content,
      cached: result.cached,
      model: result.model,
    };
  } catch (err: unknown) {
    const userFacing = toUserFacingMessage(err, "Failed to explain folder. Please try again.", "ai.explainFolderAction");
    return { ok: false, error: userFacing.message };
  }
}

/**
 * Server action to classify an unlabelled file into a sensible non-structural role.
 */
export async function classifyFileRoleAction(params: {
  analysisId: string;
  filePath: string;
}): Promise<ClassifyRoleActionResult> {
  const { analysisId, filePath } = params;
  const { orgId } = await auth();

  if (!orgId) {
    return { ok: false, error: "Authentication required." };
  }

  const supabase = await createClerkSupabaseClient();

  const { data: targetFile, error: fileError } = await supabase
    .from("files")
    .select("id, path, lines, sha256")
    .eq("analysis_id", analysisId)
    .eq("path", filePath)
    .single();

  if (fileError || !targetFile) {
    logServerError("ai.classifyFileRoleAction.fileFetch", fileError);
    return { ok: false, error: "Target file not found in analysis." };
  }

  const [{ data: outgoingEdges }, { data: incomingEdges }] = await Promise.all([
    supabase
      .from("edges")
      .select("target_file:files!edges_target_file_id_org_id_fkey(path)")
      .eq("analysis_id", analysisId)
      .eq("source_file_id", targetFile.id),
    supabase
      .from("edges")
      .select("source_file:files!edges_source_file_id_org_id_fkey(path)")
      .eq("analysis_id", analysisId)
      .eq("target_file_id", targetFile.id),
  ]);

  const imports = Array.from(
    new Set(
      (outgoingEdges ?? [])
        .map((e) => (e.target_file as { path?: string } | null)?.path)
        .filter((p): p is string => Boolean(p)),
    ),
  );

  const importedBy = Array.from(
    new Set(
      (incomingEdges ?? [])
        .map((e) => (e.source_file as { path?: string } | null)?.path)
        .filter((p): p is string => Boolean(p)),
    ),
  );

  try {
    const result = await classifyFileRoleTraced({
      supabase,
      analysisId,
      orgId,
      fileId: targetFile.id,
      filePath: targetFile.path,
      fileSha256: targetFile.sha256 ?? "",
      neighbours: { imports, importedBy },
    });

    return { ok: true, role: result.role, cached: result.cached };
  } catch (err: unknown) {
    const userFacing = toUserFacingMessage(err, "Failed to classify file role. Please try again.", "ai.classifyFileRoleAction");
    return { ok: false, error: userFacing.message };
  }
}
