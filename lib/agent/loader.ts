import { createAdminSupabaseClient } from "@/lib/supabase";
import { moduleOf } from "@/parser/walk";
import type { Edge, FileNode, ImportKind } from "@/parser/types";
import type { RouteItem } from "@/app/components/detail-pane";

export interface AnalysisGraph {
  analysisId: string;
  orgId: string;
  repoName: string;
  adapter: string;
  files: FileNode[];
  edges: Edge[];
  routes: RouteItem[];
  filesByPath: Map<string, FileNode>;
}

const PAGE_SIZE = 1000;

async function fetchAllPages<T>(
  page: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null };
  }
}

// In-memory cache to avoid repeated Supabase trips across rapid tool calls in a single turn.
const cache = new Map<string, { data: AnalysisGraph; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

/**
 * Loads an analysis and its complete graph facts strictly scoped to the given analysisId and orgId.
 * Never guesses or infers missing data. Returns the reconstructed files, edges, and route table.
 */
export async function loadAnalysisGraph(
  analysisId: string,
  orgId: string
): Promise<AnalysisGraph> {
  const cacheKey = `${analysisId}:${orgId}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const supabase = createAdminSupabaseClient();

  const { data: analysis, error: analysisError } = await supabase
    .from("analyses")
    .select("id, org_id, status, adapter, commit_sha, project:projects(name)")
    .eq("id", analysisId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (analysisError) {
    throw new Error(`Database error looking up analysis: ${analysisError.message}`);
  }

  if (!analysis) {
    throw new Error("Analysis not found or does not belong to the authorized organization.");
  }

  if (analysis.status !== "complete") {
    throw new Error(
      `Analysis is currently '${analysis.status}', not 'complete'. Graph is not ready for queries.`
    );
  }

  const [
    { data: filesData, error: filesError },
    { data: edgesData, error: edgesError },
    { data: routesData, error: routesError },
    { data: rolesData, error: rolesError },
  ] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("files")
        .select("id, path, lines, sha256")
        .eq("analysis_id", analysisId)
        .eq("org_id", orgId)
        .order("id")
        .range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("edges")
        .select("id, source_file_id, target_file_id, kind, type_only")
        .eq("analysis_id", analysisId)
        .eq("org_id", orgId)
        .order("id")
        .range(from, to)
    ),
    supabase
      .from("routes")
      .select("id, file_id, method, path")
      .eq("analysis_id", analysisId)
      .eq("org_id", orgId),
    supabase
      .from("file_roles")
      .select("id, file_id, role, source")
      .eq("analysis_id", analysisId)
      .eq("org_id", orgId),
  ]);

  if (filesError || edgesError || routesError || rolesError) {
    throw new Error(
      `Failed to load analysis graph: ${
        filesError?.message ?? edgesError?.message ?? routesError?.message ?? rolesError?.message
      }`
    );
  }

  const fileIdToPath = new Map<string, string>();
  for (const f of filesData) {
    fileIdToPath.set(f.id, f.path);
  }

  const fileRolesMap = new Map<string, string>();
  for (const r of rolesData ?? []) {
    const filePath = fileIdToPath.get(r.file_id);
    if (filePath) {
      fileRolesMap.set(filePath, r.role);
    }
  }

  const routes: RouteItem[] = (routesData ?? []).map((r) => ({
    id: r.id,
    method: r.method,
    path: r.path,
    filePath: fileIdToPath.get(r.file_id) ?? "",
  }));

  const edgeMap = new Map<
    string,
    { from: string; to: string; kinds: ImportKind[]; typeOnly: boolean }
  >();

  for (const e of edgesData) {
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

  const edges: Edge[] = Array.from(edgeMap.values());
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();

  for (const e of edges) {
    fanOut.set(e.from, (fanOut.get(e.from) ?? 0) + 1);
    fanIn.set(e.to, (fanIn.get(e.to) ?? 0) + 1);
  }

  const filesByPath = new Map<string, FileNode>();
  const files: FileNode[] = filesData.map((f) => {
    const node: FileNode = {
      path: f.path,
      module: moduleOf(f.path),
      lines: f.lines ?? 0,
      sha256: f.sha256 ?? "",
      fanIn: fanIn.get(f.path) ?? 0,
      fanOut: fanOut.get(f.path) ?? 0,
      role: fileRolesMap.get(f.path),
    };
    filesByPath.set(f.path, node);
    return node;
  });

  const repoName =
    (analysis.project as { name?: string } | null)?.name ?? "repository";
  const adapter = analysis.adapter ?? "none";

  const result: AnalysisGraph = {
    analysisId,
    orgId,
    repoName,
    adapter,
    files,
    edges,
    routes,
    filesByPath,
  };

  cache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });

  return result;
}
