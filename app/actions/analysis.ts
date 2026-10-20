"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClerkSupabaseClient, createAdminSupabaseClient, ensureOrganization } from "@/lib/supabase";
import { parseRepoUrl } from "@/lib/pipeline/github";
import { runAnalysis } from "@/lib/pipeline/run";
import { toUserFacingMessage, UserFacingError, logServerError } from "@/lib/errors";
import { checkRateLimit, assertRateLimit } from "@/lib/rate-limit";

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
 * Finds an existing analysis or registers the project and creates an initial row,
 * scheduling the pipeline run in the background. Returns the analysis ID.
 */
async function createOrReuseAnalysis({
  canonicalUrl,
  owner,
  name,
  orgId,
}: {
  canonicalUrl: string;
  owner: string;
  name: string;
  orgId: string;
}): Promise<string> {
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
      return existing.id;
    }
  }

  // 2. Register project and create initial analysis row
  await ensureOrganization(orgId);

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
    throw new Error(`Failed to register project: ${projError?.message ?? "unknown error"}`);
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
    throw new Error(`Failed to create analysis: ${analysisError?.message ?? "unknown error"}`);
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

  return analysisId;
}

function extractValidatedRepo(
  formData: FormData,
  context: string,
): { success: true; owner: string; name: string; canonicalUrl: string } | { success: false; error: string } {
  const rawUrl = formData.get("repoUrl");
  if (!rawUrl || typeof rawUrl !== "string") {
    return { success: false, error: "Please enter a GitHub repository URL." };
  }

  try {
    const parsed = parseRepoUrl(rawUrl);
    return {
      success: true,
      owner: parsed.owner,
      name: parsed.name,
      canonicalUrl: parsed.canonicalUrl,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: toUserFacingMessage(err, "Please enter a valid GitHub repository URL.", context).message,
    };
  }
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

  const rateCheck = checkRateLimit(`analysis:${orgId}`, { limit: 5, windowMs: 60_000 });
  if (!rateCheck.success) {
    return { error: "Rate limit exceeded. You can only start up to 5 analysis runs per minute." };
  }

  const repo = extractValidatedRepo(formData, "actions.submitRepoAction.parse");
  if (!repo.success) {
    return { error: repo.error };
  }

  try {
    const analysisId = await createOrReuseAnalysis({
      canonicalUrl: repo.canonicalUrl,
      owner: repo.owner,
      name: repo.name,
      orgId,
    });
    redirect(`/analysis/${analysisId}`);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "digest" in err) {
      throw err;
    }
    return { error: toUserFacingMessage(err, "Unable to start repository analysis. Please try again.", "actions.submitRepoAction").message };
  }
}

/**
 * Handles hero form submissions from the landing page.
 * If signed out, redirects to sign-in with a return URL that triggers analysis creation.
 * If signed in, starts analysis immediately and redirects to /analysis/[id].
 */
export async function submitHeroAction(
  _prevState: ActionState | null,
  formData: FormData,
): Promise<ActionState | never> {
  const repo = extractValidatedRepo(formData, "actions.submitHeroAction.parse");
  if (!repo.success) {
    return { error: repo.error };
  }

  const { userId, orgId } = await auth();
  if (!userId) {
    const returnUrl = `/?repoUrl=${encodeURIComponent(repo.canonicalUrl)}`;
    redirect(`/sign-in?redirect_url=${encodeURIComponent(returnUrl)}`);
  }

  if (!orgId) {
    redirect(`/?repoUrl=${encodeURIComponent(repo.canonicalUrl)}`);
  }

  const rateCheck = checkRateLimit(`analysis:${orgId}`, { limit: 5, windowMs: 60_000 });
  if (!rateCheck.success) {
    return { error: "Rate limit exceeded. You can only start up to 5 analysis runs per minute." };
  }

  try {
    const analysisId = await createOrReuseAnalysis({
      canonicalUrl: repo.canonicalUrl,
      owner: repo.owner,
      name: repo.name,
      orgId,
    });
    redirect(`/analysis/${analysisId}`);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "digest" in err) {
      throw err;
    }
    return { error: toUserFacingMessage(err, "Unable to start repository analysis. Please try again.", "actions.submitHeroAction").message };
  }
}

/**
 * Resets an accessible analysis and schedules its repository for another run.
 * Throws when the organization or repository is unavailable; redirects on success.
 */
export async function rerunAnalysisAction(analysisId: string): Promise<void | never> {
  const { orgId } = await auth();
  if (!orgId) {
    throw new UserFacingError("Organization required. Please select an organization.");
  }

  assertRateLimit(`rerun:${orgId}`, { limit: 5, windowMs: 60_000 }, "Rate limit exceeded. Please wait a moment before re-running.");

  const supabase = await createClerkSupabaseClient();

  const { data: analysis, error } = await supabase
    .from("analyses")
    .select("id, org_id, status, created_at, stage, project:projects(repo_url)")
    .eq("id", analysisId)
    .single();

  if (error || !analysis) {
    throw new UserFacingError("Analysis not found or inaccessible within your organization.");
  }

  const project = analysis.project as { repo_url: string } | null;
  if (!project?.repo_url) {
    throw new UserFacingError("Repository URL not found for analysis.");
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

  if (resetError) {
    logServerError("actions.rerunAnalysisAction.reset", resetError);
    throw new UserFacingError("Failed to reset analysis. Please try again.");
  }
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
      logServerError("actions.rerunAnalysisAction.pipeline", err);
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
    throw new UserFacingError("Organization required. Please select an organization.");
  }

  assertRateLimit(`reanalyse:${orgId}`, { limit: 5, windowMs: 60_000 }, "Rate limit exceeded. Please wait a moment before re-analysing.");

  const supabase = await createClerkSupabaseClient();

  const { data: analysis, error } = await supabase
    .from("analyses")
    .select("id, org_id, status, created_at, stage, project:projects(repo_url)")
    .eq("id", analysisId)
    .single();

  if (error || !analysis) {
    throw new UserFacingError("Analysis not found or inaccessible within your organization.");
  }

  const project = analysis.project as { repo_url: string } | null;
  if (!project?.repo_url) {
    throw new UserFacingError("Repository URL not found for analysis.");
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
    .in("status", ["complete", "failed"])
    .select("id")
    .maybeSingle();

  if (resetError) {
    logServerError("actions.reanalyseRepoAction.reset", resetError);
    throw new UserFacingError("Failed to restart analysis. Please try again.");
  }
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
      logServerError("actions.reanalyseRepoAction.pipeline", err);
    }
  });

  redirect(`/analysis/${analysisId}`);
}

