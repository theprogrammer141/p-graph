"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClerkSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase";
import { parseRepoUrl } from "@/lib/pipeline/github";
import { runAnalysis } from "@/lib/pipeline/run";

// Match the dashboard’s stale-run threshold.
const ANALYSIS_TIMEOUT_MS = 5 * 60 * 1000;

async function failStaleAnalysis(
  supabase: Awaited<ReturnType<typeof createClerkSupabaseClient>>,
  analysis: { id: string; status: string; created_at: string; stage: string | null },
): Promise<boolean> {
  const cutoff = new Date(Date.now() - ANALYSIS_TIMEOUT_MS).toISOString();
  if (analysis.status !== "parsing" || Date.parse(analysis.created_at) >= Date.parse(cutoff)) {
    return false;
  }

  const { data, error } = await supabase
    .from("analyses")
    .update({
      status: "failed",
      stage: "failed",
      failed_stage: analysis.stage,
      stage_message: "Analysis timed out. Please retry.",
      error: "Analysis timed out. Please retry.",
      finished_at: new Date().toISOString(),
    })
    .eq("id", analysis.id)
    .eq("status", "parsing")
    .lt("created_at", cutoff)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`Failed to expire analysis: ${error.message}`);
  return data !== null;
}

export interface ActionState {
  error?: string;
}

/**
 * Validates a repository submission, reuses an existing analysis when possible,
 * or schedules a background run and redirects to its progress page.
 * Returns a form error when validation or registration fails.
 */
export async function submitRepoAction(
  _prevState: ActionState | null,
  formData: FormData,
): Promise<ActionState | never> {
  const { orgId } = await auth();
  if (!orgId) {
    return { error: "Organization required. Please select an organization." };
  }

  const rawUrl = formData.get("repoUrl");
  if (!rawUrl || typeof rawUrl !== "string") {
    return { error: "Please enter a GitHub repository URL." };
  }

  let owner: string;
  let name: string;
  let canonicalUrl: string;

  try {
    const parsed = parseRepoUrl(rawUrl);
    owner = parsed.owner;
    name = parsed.name;
    canonicalUrl = parsed.canonicalUrl;
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  const supabase = await createClerkSupabaseClient();

  // 1. One analysis per repository: check if repo was already analysed
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("repo_url", canonicalUrl)
    .maybeSingle();

  if (project) {
    const { data: existing } = await supabase
      .from("analyses")
      .select("id, status, created_at, stage")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing && existing.status !== "failed" && !(await failStaleAnalysis(supabase, existing))) {
      redirect(`/analysis/${existing.id}`);
    }
  }

  // 2. Register project and create initial analysis row
  const { data: proj, error: projError } = await supabase
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

  if (projError || !proj) {
    return { error: `Failed to register project: ${projError?.message ?? "unknown error"}` };
  }

  const { data: analysis, error: analysisError } = await supabase
    .from("analyses")
    .insert({
      org_id: orgId,
      project_id: proj.id,
      status: "parsing",
      stage: "fetch",
      stage_message: "Fetching repository archive...",
    })
    .select("id")
    .single();

  if (analysisError || !analysis) {
    return { error: `Failed to create analysis: ${analysisError?.message ?? "unknown error"}` };
  }

  const analysisId = analysis.id;

  // 3. Schedule the pipeline run in the background
  after(async () => {
    const admin = createAdminSupabaseClient();
    try {
      await runAnalysis({
        supabase: admin,
        orgId,
        analysisId,
        repoUrl: canonicalUrl,
        forceRerun: true,
      });
    } catch (err) {
      console.error("Pipeline run encountered error:", err);
    }
  });

  redirect(`/analysis/${analysisId}`);
}

/**
 * Resets an accessible analysis and schedules its repository for another run.
 * Throws when the organization or repository is unavailable; redirects on success.
 */
export async function rerunAnalysisAction(analysisId: string): Promise<void | never> {
  const { orgId } = await auth();
  if (!orgId) {
    throw new Error("Organization required.");
  }

  const supabase = await createClerkSupabaseClient();

  const { data: analysis, error } = await supabase
    .from("analyses")
    .select("id, org_id, status, created_at, stage, project:projects(repo_url)")
    .eq("id", analysisId)
    .single();

  if (error || !analysis) {
    throw new Error(`Analysis not found: ${error?.message}`);
  }

  const project = analysis.project as { repo_url: string } | null;
  if (!project?.repo_url) {
    throw new Error("Repository URL not found for analysis.");
  }

  await failStaleAnalysis(supabase, analysis);

  // Claim only a failed row so concurrent retries cannot both start a run.
  const { data: reset, error: resetError } = await supabase
    .from("analyses")
    .update({
      status: "parsing",
      stage: "fetch",
      stage_message: "Fetching repository archive...",
      error: null,
      failed_stage: null,
      finished_at: null,
      created_at: new Date().toISOString(),
    })
    .eq("id", analysisId)
    .eq("status", "failed")
    .select("id")
    .maybeSingle();

  if (resetError) throw new Error(`Failed to reset analysis: ${resetError.message}`);
  if (!reset) redirect(`/analysis/${analysisId}`);

  after(async () => {
    const admin = createAdminSupabaseClient();
    try {
      await runAnalysis({
        supabase: admin,
        orgId,
        analysisId,
        repoUrl: project.repo_url,
        forceRerun: true,
      });
    } catch (err) {
      console.error("Pipeline re-run encountered error:", err);
    }
  });

  redirect(`/analysis/${analysisId}`);
}

/**
 * Triggers a fresh re-analysis of a repository when it is stale or out of date.
 */
export async function reanalyseRepoAction(analysisId: string): Promise<void | never> {
  const { orgId } = await auth();
  if (!orgId) {
    throw new Error("Organization required.");
  }

  const supabase = await createClerkSupabaseClient();

  const { data: analysis, error } = await supabase
    .from("analyses")
    .select("id, org_id, status, created_at, stage, project:projects(repo_url)")
    .eq("id", analysisId)
    .single();

  if (error || !analysis) {
    throw new Error(`Analysis not found: ${error?.message}`);
  }

  const project = analysis.project as { repo_url: string } | null;
  if (!project?.repo_url) {
    throw new Error("Repository URL not found for analysis.");
  }

  const { data: reset, error: resetError } = await supabase
    .from("analyses")
    .update({
      status: "parsing",
      stage: "fetch",
      stage_message: "Fetching updated repository archive...",
      error: null,
      failed_stage: null,
      finished_at: null,
      created_at: new Date().toISOString(),
    })
    .eq("id", analysisId)
    .select("id")
    .maybeSingle();

  if (resetError) throw new Error(`Failed to restart analysis: ${resetError.message}`);
  if (!reset) redirect(`/analysis/${analysisId}`);

  after(async () => {
    const admin = createAdminSupabaseClient();
    try {
      await runAnalysis({
        supabase: admin,
        orgId,
        analysisId,
        repoUrl: project.repo_url,
        forceRerun: true,
      });
    } catch (err) {
      console.error("Pipeline re-analysis encountered error:", err);
    }
  });

  redirect(`/analysis/${analysisId}`);
}

