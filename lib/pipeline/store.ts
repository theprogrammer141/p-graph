import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { ParseResult } from "@/parser/types";

const BATCH_SIZE = 1000;

/**
 * Stores parse results (files, edges, routes, and file roles) into Supabase for a given analysis.
 */
export async function storeAnalysisData(
  supabase: SupabaseClient<Database>,
  orgId: string,
  analysisId: string,
  result: ParseResult,
): Promise<{ fileCount: number; edgeCount: number; routeCount: number; roleCount: number }> {
  // If re-running an analysis, clean up previous data. A failed delete must stop
  // here: inserting on top of leftover rows would mix two runs into one graph.
  // Detach explanations first so on-delete cascade doesn't drop explanations for unchanged files.
  await supabase
    .from("explanations")
    .update({ file_id: null })
    .eq("analysis_id", analysisId);

  const { error: edgesDeleteError } = await supabase.from("edges").delete().eq("analysis_id", analysisId);
  if (edgesDeleteError) throw new Error(`Failed to clear previous edges: ${edgesDeleteError.message}`);
  const { error: routesDeleteError } = await supabase.from("routes").delete().eq("analysis_id", analysisId);
  if (routesDeleteError) throw new Error(`Failed to clear previous routes: ${routesDeleteError.message}`);
  const { error: rolesDeleteError } = await supabase.from("file_roles").delete().eq("analysis_id", analysisId);
  if (rolesDeleteError) throw new Error(`Failed to clear previous file roles: ${rolesDeleteError.message}`);
  const { error: filesDeleteError } = await supabase.from("files").delete().eq("analysis_id", analysisId);
  if (filesDeleteError) throw new Error(`Failed to clear previous files: ${filesDeleteError.message}`);

  // 1. Insert files in batches and map path -> database file ID
  const fileIdMap = new Map<string, string>();
  const fileRows = result.files.map((f) => ({
    analysis_id: analysisId,
    org_id: orgId,
    path: f.path,
    lines: f.lines,
    sha256: f.sha256,
  }));

  for (let i = 0; i < fileRows.length; i += BATCH_SIZE) {
    const batch = fileRows.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from("files")
      .insert(batch)
      .select("id, path");

    if (error) {
      throw new Error(`Failed to store files: ${error.message}`);
    }

    if (data) {
      for (const row of data) {
        fileIdMap.set(row.path, row.id);
      }
    }
  }

  // Relink explanations to new file rows for any explanations that actually exist for this analysis.
  // Avoid N+1 queries across the entire repository.
  const { data: existingExplanations } = await supabase
    .from("explanations")
    .select("id, target_path")
    .eq("analysis_id", analysisId);

  if (existingExplanations && existingExplanations.length > 0) {
    for (const exp of existingExplanations) {
      if (exp.target_path) {
        const newFileId = fileIdMap.get(exp.target_path);
        if (newFileId) {
          await supabase
            .from("explanations")
            .update({ file_id: newFileId })
            .eq("id", exp.id);
        }
      }
    }
  }

  // 2. Build and insert edges
  const edgeRows: Array<{
    analysis_id: string;
    org_id: string;
    source_file_id: string;
    target_file_id: string;
    kind: string;
    type_only: boolean;
  }> = [];

  for (const edge of result.edges) {
    const sourceId = fileIdMap.get(edge.from);
    const targetId = fileIdMap.get(edge.to);

    if (!sourceId || !targetId) {
      // Invariant: edges only connect resolved, stored nodes
      continue;
    }

    for (const kind of edge.kinds) {
      edgeRows.push({
        analysis_id: analysisId,
        org_id: orgId,
        source_file_id: sourceId,
        target_file_id: targetId,
        kind: kind === "dynamic" ? "dynamic-import" : kind,
        type_only: edge.typeOnly,
      });
    }
  }

  for (let i = 0; i < edgeRows.length; i += BATCH_SIZE) {
    const batch = edgeRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("edges").insert(batch);

    if (error) {
      throw new Error(`Failed to store edges: ${error.message}`);
    }
  }

  // 3. Build and insert routes
  const routeRows: Array<{
    analysis_id: string;
    org_id: string;
    file_id: string;
    method: string;
    path: string;
  }> = [];

  for (const r of result.routes ?? []) {
    const fileId = fileIdMap.get(r.filePath);
    if (!fileId) continue;

    routeRows.push({
      analysis_id: analysisId,
      org_id: orgId,
      file_id: fileId,
      method: r.method,
      path: r.path,
    });
  }

  for (let i = 0; i < routeRows.length; i += BATCH_SIZE) {
    const batch = routeRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("routes").insert(batch);

    if (error) {
      throw new Error(`Failed to store routes: ${error.message}`);
    }
  }

  // 4. Build and insert file roles
  const roleRows: Array<{
    analysis_id: string;
    org_id: string;
    file_id: string;
    role: string;
    source: "convention";
  }> = [];

  for (const fr of result.roles ?? []) {
    const fileId = fileIdMap.get(fr.filePath);
    if (!fileId) continue;

    roleRows.push({
      analysis_id: analysisId,
      org_id: orgId,
      file_id: fileId,
      role: fr.role,
      source: "convention",
    });
  }

  for (let i = 0; i < roleRows.length; i += BATCH_SIZE) {
    const batch = roleRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("file_roles").insert(batch);

    if (error) {
      throw new Error(`Failed to store file roles: ${error.message}`);
    }
  }

  return {
    fileCount: fileRows.length,
    edgeCount: edgeRows.length,
    routeCount: routeRows.length,
    roleCount: roleRows.length,
  };
}
