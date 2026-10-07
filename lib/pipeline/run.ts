import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { parse } from "@/parser/index";
import {
  downloadAndExtractRepo,
  fetchRepoCommitSha,
  parseRepoUrl,
} from "./github";
import { storeAnalysisData } from "./store";

export type PipelineStage = "fetch" | "select" | "parse" | "store" | "complete" | "failed";

export interface RunAnalysisOptions {
  supabase: SupabaseClient<Database>;
  orgId: string;
  repoUrl: string;
  forceRerun?: boolean;
}

export interface RunAnalysisResult {
  analysisId: string;
  isExisting: boolean;
}

/**
 * Executes the full repository analysis pipeline:
 * fetch -> select -> parse -> store.
 *
 * Includes top-level catch to ensure the database row never stays stuck in parsing.
 */
export async function runAnalysis({
  supabase,
  orgId,
  repoUrl,
  forceRerun = false,
}: RunAnalysisOptions): Promise<RunAnalysisResult> {
  const { owner, name, canonicalUrl } = parseRepoUrl(repoUrl);

  // 1. Get or create project (unique per org_id, repo_url)
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .upsert(
      {
        org_id: orgId,
        repo_url: canonicalUrl,
        owner,
        name,
      },
      { onConflict: "org_id,repo_url" },
    )
    .select("id")
    .single();

  if (projectError || !project) {
    throw new Error(`Failed to ensure project: ${projectError?.message ?? "unknown error"}`);
  }

  // 2. Check for existing analysis (one analysis per repository)
  const { data: existingAnalysis } = await supabase
    .from("analyses")
    .select("id, status, stage, commit_sha")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingAnalysis && !forceRerun && existingAnalysis.status !== "failed") {
    // Already analysed (or currently running)
    return {
      analysisId: existingAnalysis.id,
      isExisting: true,
    };
  }

  // 3. Prepare or reset analysis row
  let analysisId: string;

  if (existingAnalysis) {
    analysisId = existingAnalysis.id;
    const { error: resetError } = await supabase
      .from("analyses")
      .update({
        status: "parsing",
        stage: "fetch",
        stage_message: "Fetching repository archive...",
        error: null,
        failed_stage: null,
        finished_at: null,
      })
      .eq("id", analysisId);

    if (resetError) {
      throw new Error(`Failed to reset analysis: ${resetError.message}`);
    }
  } else {
    const { data: created, error: createError } = await supabase
      .from("analyses")
      .insert({
        org_id: orgId,
        project_id: project.id,
        status: "parsing",
        stage: "fetch",
        stage_message: "Fetching repository archive...",
      })
      .select("id")
      .single();

    if (createError || !created) {
      throw new Error(`Failed to create analysis: ${createError?.message ?? "unknown error"}`);
    }
    analysisId = created.id;
  }

  const updateStage = async (stage: PipelineStage, message: string) => {
    await supabase
      .from("analyses")
      .update({
        stage,
        stage_message: message,
      })
      .eq("id", analysisId);
  };

  // 4. Run pipeline with top-level error handling
  let currentStage: PipelineStage = "fetch";

  try {
    currentStage = "fetch";
    await updateStage("fetch", "Resolving commit SHA...");
    const commitSha = await fetchRepoCommitSha(owner, name);

    await updateStage("fetch", `Downloading repository archive at ${commitSha.slice(0, 7)}...`);
    const extracted = await downloadAndExtractRepo(owner, name, commitSha);

    try {
      currentStage = "select";
      await updateStage("select", "Walking repository files...");

      currentStage = "parse";
      await updateStage("parse", "Parsing source files and resolving imports...");
      const parseResult = parse(extracted.extractDir);

      currentStage = "store";
      await updateStage(
        "store",
        `Storing ${parseResult.files.length} files and ${parseResult.edges.length} edges...`,
      );
      await storeAnalysisData(supabase, orgId, analysisId, parseResult);

      // Complete
      await supabase
        .from("analyses")
        .update({
          status: "complete",
          stage: "complete",
          stage_message: `Analysis complete: ${parseResult.files.length} files, ${parseResult.edges.length} edges.`,
          commit_sha: commitSha,
          coverage: parseResult.coverage as unknown as Json,
          adapter: parseResult.adapter,
          finished_at: new Date().toISOString(),
          error: null,
          failed_stage: null,
        })
        .eq("id", analysisId);

      return {
        analysisId,
        isExisting: false,
      };
    } finally {
      await extracted.cleanup();
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await supabase
      .from("analyses")
      .update({
        status: "failed",
        stage: "failed",
        failed_stage: currentStage,
        stage_message: `Failed during stage "${currentStage}": ${errorMsg}`,
        error: errorMsg,
        finished_at: new Date().toISOString(),
      })
      .eq("id", analysisId);

    throw err;
  }
}
