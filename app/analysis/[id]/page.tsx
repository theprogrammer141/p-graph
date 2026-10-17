import { notFound, redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { createClerkSupabaseClient } from "@/lib/supabase";
import { moduleOf } from "@/parser/walk";
import type { Coverage, Edge, FileNode, ImportKind } from "@/parser/types";
import type { PipelineStage } from "@/lib/pipeline/run";
import { countCategories } from "@/lib/file-categories";
import { WorkspaceShell } from "@/app/components/workspace-shell";
import { AnalysisProgress } from "@/app/components/analysis-progress";
import type { RouteItem } from "@/app/components/detail-pane";

interface AnalysisPageProps {
  params: Promise<{ id: string }>;
}

// PostgREST returns at most this many rows per request (Supabase's default
// max_rows). Without paging, a large repository silently loses nodes and edges.
const PAGE_SIZE = 1000;

async function fetchAllPages<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null };
  }
}

/**
 * Loads an accessible analysis and renders its progress or reconstructed graph.
 * Redirects when no organization is selected and returns not found for missing data.
 */
export default async function AnalysisPage({ params }: AnalysisPageProps) {
  const { id } = await params;
  const { orgId } = await auth();

  if (!orgId) {
    redirect("/");
  }

  const supabase = await createClerkSupabaseClient();

  const { data: analysis, error } = await supabase
    .from("analyses")
    .select("*, project:projects(owner, name, repo_url)")
    .eq("id", id)
    .maybeSingle();

  if (error || !analysis) {
    notFound();
  }

  const project = analysis.project as {
    owner: string;
    name: string;
    repo_url: string;
  } | null;

  if (!project) {
    notFound();
  }

  // If in progress or failed, render the progress tracker
  if (analysis.status !== "complete") {
    return (
      <main className="flex-1 flex flex-col h-[calc(100vh-2.75rem)] overflow-hidden">
        <AnalysisProgress
          // Remount when the server state changes, so a refresh after a missed
          // broadcast replaces stale client state instead of being ignored.
          key={`${analysis.status}:${analysis.stage}:${analysis.created_at}`}
          analysisId={analysis.id}
          repoOwner={project.owner}
          repoName={project.name}
          repoUrl={project.repo_url}
          initialStage={analysis.stage as PipelineStage}
          initialMessage={analysis.stage_message}
          initialStatus={analysis.status}
          initialError={analysis.error}
          initialFailedStage={analysis.failed_stage}
        />
      </main>
    );
  }

  // Status is complete: fetch real files, edges, routes, and roles from Supabase
  const [
    { data: files, error: filesError },
    { data: edges, error: edgesError },
    { data: routesData, error: routesError },
    { data: rolesData, error: rolesError },
  ] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("files")
        .select("id, path, lines, sha256")
        .eq("analysis_id", id)
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("edges")
        .select("id, source_file_id, target_file_id, kind, type_only")
        .eq("analysis_id", id)
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("routes")
        .select("id, file_id, method, path")
        .eq("analysis_id", id)
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("file_roles")
        .select("id, file_id, role, source")
        .eq("analysis_id", id)
        .order("id")
        .range(from, to),
    ),
  ]);

  if (filesError || edgesError || routesError || rolesError) {
    throw new Error(
      `Failed to load graph data: ${
        filesError?.message ?? edgesError?.message ?? routesError?.message ?? rolesError?.message
      }`
    );
  }

  const fileIdToPath = new Map<string, string>();
  for (const f of files ?? []) {
    fileIdToPath.set(f.id, f.path);
  }

  const fileRolesMap = new Map<string, string>();
  for (const r of rolesData ?? []) {
    const filePath = fileIdToPath.get(r.file_id);
    if (filePath) {
      fileRolesMap.set(filePath, r.role);
    }
  }

  const reconstructedRoutes: RouteItem[] = [];
  for (const r of routesData ?? []) {
    const filePath = fileIdToPath.get(r.file_id) ?? "";
    reconstructedRoutes.push({
      id: r.id,
      method: r.method,
      path: r.path,
      filePath,
    });
  }

  const edgeMap = new Map<
    string,
    { from: string; to: string; kinds: ImportKind[]; typeOnly: boolean }
  >();

  for (const e of edges ?? []) {
    const fromPath = fileIdToPath.get(e.source_file_id);
    const toPath = fileIdToPath.get(e.target_file_id);
    if (!fromPath || !toPath) continue;

    const key = `${fromPath} -> ${toPath}`;
    let edge = edgeMap.get(key);
    if (!edge) {
      edge = { from: fromPath, to: toPath, kinds: [], typeOnly: true };
      edgeMap.set(key, edge);
    }
    const kind = (e.kind === "dynamic-import" ? "dynamic" : e.kind) as ImportKind;
    if (!edge.kinds.includes(kind)) {
      edge.kinds.push(kind);
      edge.kinds.sort();
    }
    if (!e.type_only) {
      edge.typeOnly = false;
    }
  }

  const reconstructedEdges: Edge[] = Array.from(edgeMap.values());
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();

  for (const e of reconstructedEdges) {
    fanOut.set(e.from, (fanOut.get(e.from) ?? 0) + 1);
    fanIn.set(e.to, (fanIn.get(e.to) ?? 0) + 1);
  }

  const reconstructedFiles: FileNode[] = (files ?? []).map((f) => ({
    path: f.path,
    module: moduleOf(f.path),
    lines: f.lines ?? 0,
    sha256: f.sha256 ?? "",
    fanIn: fanIn.get(f.path) ?? 0,
    fanOut: fanOut.get(f.path) ?? 0,
    role: fileRolesMap.get(f.path),
  }));

  const categories = countCategories(reconstructedFiles);
  const coverage = (analysis.coverage as unknown as Coverage) ?? null;

  return (
    <main className="flex-1 flex flex-col h-[calc(100vh-2.75rem)] overflow-hidden">
      <WorkspaceShell
        analysisId={analysis.id}
        repoOwner={project.owner}
        repoName={project.name}
        commitSha={analysis.commit_sha ?? null}
        categories={categories}
        totalFiles={reconstructedFiles.length}
        files={reconstructedFiles}
        edges={reconstructedEdges}
        edgeCount={reconstructedEdges.length}
        adapter={analysis.adapter ?? "none"}
        coverage={coverage}
        routes={reconstructedRoutes}
      />
    </main>
  );
}
