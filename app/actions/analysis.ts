"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClerkSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase";
import { parseRepoUrl } from "@/lib/pipeline/github";
import { runAnalysis } from "@/lib/pipeline/run";

export interface ActionState {
  error?: string;
}

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
      .select("id, status")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing && existing.status !== "failed") {
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
        repoUrl: canonicalUrl,
        forceRerun: true,
      });
    } catch (err) {
      console.error("Pipeline run encountered error:", err);
    }
  });

  redirect(`/analysis/${analysisId}`);
}

export async function rerunAnalysisAction(analysisId: string): Promise<void | never> {
  const { orgId } = await auth();
  if (!orgId) {
    throw new Error("Organization required.");
  }

  const supabase = await createClerkSupabaseClient();

  const { data: analysis, error } = await supabase
    .from("analyses")
    .select("id, org_id, project:projects(repo_url)")
    .eq("id", analysisId)
    .single();

  if (error || !analysis) {
    throw new Error(`Analysis not found: ${error?.message}`);
  }

  const project = analysis.project as { repo_url: string } | null;
  if (!project?.repo_url) {
    throw new Error("Repository URL not found for analysis.");
  }

  // Reset analysis row
  await supabase
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

  after(async () => {
    const admin = createAdminSupabaseClient();
    try {
      await runAnalysis({
        supabase: admin,
        orgId,
        repoUrl: project.repo_url,
        forceRerun: true,
      });
    } catch (err) {
      console.error("Pipeline re-run encountered error:", err);
    }
  });

  redirect(`/analysis/${analysisId}`);
}
