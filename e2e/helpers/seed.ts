import "@/lib/load-env";
import { createAdminSupabaseClient, ensureOrganization } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

export interface SeedTestWorkspaceOptions {
  orgId?: string;
  repoOwner?: string;
  repoName?: string;
  status?: "complete" | "parsing" | "failed" | "queued";
  stage?: string;
  stageMessage?: string;
  error?: string | null;
  failedStage?: string | null;
  adapter?: string;
  withSkippedFiles?: boolean;
}

export interface SeededWorkspaceResult {
  orgId: string;
  projectId: string;
  analysisId: string;
  repoUrl: string;
  files: Array<{ id: string; path: string }>;
  cleanup: () => Promise<void>;
}

/**
 * Seeds a deterministic workspace in Supabase using the admin secret key.
 * Bypasses RLS to insert projects, analyses, files, edges, routes, and roles.
 */
export async function seedTestWorkspace(
  options: SeedTestWorkspaceOptions = {}
): Promise<SeededWorkspaceResult> {
  const admin = createAdminSupabaseClient();
  const runId = Math.random().toString(36).substring(2, 9);

  const orgId = options.orgId ?? `test_org_${runId}`;
  const repoOwner = options.repoOwner ?? "e2e-test";
  const repoName = options.repoName ?? `repo-${runId}`;
  const repoUrl = `https://github.com/${repoOwner}/${repoName}`;
  const status = options.status ?? "complete";
  const stage = options.stage ?? (status === "complete" ? "complete" : "fetch");
  const adapter = options.adapter ?? "next";

  await ensureOrganization(orgId);

  // 1. Insert Project
  const { data: project, error: projectError } = await admin
    .from("projects")
    .upsert(
      {
        org_id: orgId,
        repo_url: repoUrl,
        owner: repoOwner,
        name: repoName,
      },
      { onConflict: "org_id,repo_url" }
    )
    .select("id")
    .single();

  if (projectError || !project) {
    throw new Error(`Failed to seed project: ${projectError?.message}`);
  }

  const coverage = options.withSkippedFiles
    ? {
        files: { total: 4, analysed: 3, skipped: 1 },
        imports: { found: 5, resolved: 4, unresolved: 1, external: 1, excluded: 0 },
        skippedFiles: [{ path: "src/legacy.c", reason: "unsupported extension: .c" }],
      }
    : {
        files: { total: 4, analysed: 4, skipped: 0 },
        imports: { found: 4, resolved: 4, unresolved: 0, external: 0, excluded: 0 },
        skippedFiles: [],
      };

  // 2. Insert Analysis
  const { data: analysis, error: analysisError } = await admin
    .from("analyses")
    .insert({
      org_id: orgId,
      project_id: project.id,
      status,
      stage,
      stage_message: options.stageMessage ?? (status === "complete" ? "Analysis complete." : "Processing..."),
      error: options.error ?? (status === "failed" ? "Failed to parse repository AST." : null),
      failed_stage: options.failedStage ?? (status === "failed" ? "parse" : null),
      commit_sha: "abcdef1234567890",
      adapter,
      coverage: coverage as unknown as Database["public"]["Tables"]["analyses"]["Insert"]["coverage"],
      created_at: new Date().toISOString(),
      finished_at: status === "complete" || status === "failed" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (analysisError || !analysis) {
    throw new Error(`Failed to seed analysis: ${analysisError?.message}`);
  }

  const analysisId = analysis.id;
  const createdFiles: Array<{ id: string; path: string }> = [];

  if (status === "complete") {
    // 3. Insert Files across a couple folders
    const fileEntries = [
      { path: "src/index.ts", lines: 120, sha256: "sha_index" },
      { path: "src/components/button.tsx", lines: 85, sha256: "sha_button" },
      { path: "src/components/card.tsx", lines: 60, sha256: "sha_card" },
      { path: "src/utils/helpers.ts", lines: 45, sha256: "sha_helpers" },
    ];

    const fileInsertData = fileEntries.map((f) => ({
      org_id: orgId,
      analysis_id: analysisId,
      path: f.path,
      lines: f.lines,
      sha256: f.sha256,
    }));

    const { data: insertedFiles, error: filesError } = await admin
      .from("files")
      .insert(fileInsertData)
      .select("id, path");

    if (filesError || !insertedFiles) {
      throw new Error(`Failed to seed files: ${filesError?.message}`);
    }

    createdFiles.push(...insertedFiles);

    const fileMap = new Map<string, string>();
    for (const f of insertedFiles) {
      fileMap.set(f.path, f.id);
    }

    // 4. Insert Edges:
    // src/index.ts -> src/components/button.tsx
    // src/index.ts -> src/utils/helpers.ts
    // src/components/button.tsx -> src/utils/helpers.ts
    const edgesToInsert = [
      {
        org_id: orgId,
        analysis_id: analysisId,
        source_file_id: fileMap.get("src/index.ts")!,
        target_file_id: fileMap.get("src/components/button.tsx")!,
        kind: "static",
        type_only: false,
      },
      {
        org_id: orgId,
        analysis_id: analysisId,
        source_file_id: fileMap.get("src/index.ts")!,
        target_file_id: fileMap.get("src/utils/helpers.ts")!,
        kind: "static",
        type_only: false,
      },
      {
        org_id: orgId,
        analysis_id: analysisId,
        source_file_id: fileMap.get("src/components/button.tsx")!,
        target_file_id: fileMap.get("src/utils/helpers.ts")!,
        kind: "static",
        type_only: false,
      },
    ];

    await admin.from("edges").insert(edgesToInsert);

    // 5. Insert Routes
    await admin.from("routes").insert([
      {
        org_id: orgId,
        analysis_id: analysisId,
        file_id: fileMap.get("src/index.ts")!,
        method: "GET",
        path: "/",
      },
    ]);

    // 6. Insert Roles
    await admin.from("file_roles").insert([
      {
        org_id: orgId,
        analysis_id: analysisId,
        file_id: fileMap.get("src/index.ts")!,
        role: "entrypoint",
        source: "heuristics",
      },
      {
        org_id: orgId,
        analysis_id: analysisId,
        file_id: fileMap.get("src/components/button.tsx")!,
        role: "component",
        source: "heuristics",
      },
      {
        org_id: orgId,
        analysis_id: analysisId,
        file_id: fileMap.get("src/utils/helpers.ts")!,
        role: "util",
        source: "heuristics",
      },
    ]);
  }

  const cleanup = async () => {
    await cleanupAnalysis(analysisId);
  };

  return {
    orgId,
    projectId: project.id,
    analysisId,
    repoUrl,
    files: createdFiles,
    cleanup,
  };
}

/**
 * Removes all records associated with an analysis.
 */
export async function cleanupAnalysis(analysisId: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  await admin.from("file_roles").delete().eq("analysis_id", analysisId);
  await admin.from("routes").delete().eq("analysis_id", analysisId);
  await admin.from("edges").delete().eq("analysis_id", analysisId);
  await admin.from("files").delete().eq("analysis_id", analysisId);
  await admin.from("analyses").delete().eq("id", analysisId);
}
