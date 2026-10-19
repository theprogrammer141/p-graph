import { auth } from "@clerk/nextjs/server";
import { createClerkSupabaseClient } from "@/lib/supabase";
import { AnalysisForm } from "@/app/components/analysis-form";
import { DashboardTable, type AnalysisItem } from "@/app/components/dashboard-table";
import { LandingPage } from "@/app/components/landing/landing-page";
import { parseRepoUrl } from "@/lib/pipeline/github";
import { toUserFacingMessage } from "@/lib/errors";

// The dashboard: analyses for the organization in the current session token.
//
// There is deliberately no org filter in the query below. Which rows come back
// is decided by the RLS policy reading the token's org claim, so switching
// organization changes the token, and the same query returns different rows.
// If another organization's row ever appears here, the policy is wrong.

/**
 * Loads up to 100 recent analyses visible through organization RLS for the dashboard.
 * Shows the marketing landing page when signed out, an organization prompt when
 * an org is required, or query error when the list cannot be displayed.
 */
export default async function Home(props: {
  searchParams: Promise<{ repoUrl?: string }>;
}) {
  const { userId, orgId } = await auth();
  const searchParams = await props.searchParams;

  let validatedRepoUrl: string | undefined;
  if (searchParams.repoUrl) {
    try {
      validatedRepoUrl = parseRepoUrl(searchParams.repoUrl).canonicalUrl;
    } catch {
      validatedRepoUrl = undefined;
    }
  }

  // Signed out: render public marketing landing page
  if (!userId) {
    return <LandingPage initialRepoUrl={validatedRepoUrl} />;
  }

  // A personal account has no org claim; every policy matches nothing for it.
  // Say so rather than showing an empty state that implies "no analyses yet".
  if (!orgId) {
    return (
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-950 p-5 max-w-xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500" />
            <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
              Organization required
            </span>
          </div>
          <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1.5">
            No organization selected
          </h1>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed mb-3">
            Analyses belong to an organization and are isolated via database security policies.
            Select or create an organization in the switcher above to open its workspace.
          </p>
          {validatedRepoUrl && (
            <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400 mb-3 bg-zinc-50 dark:bg-zinc-900 p-2 border border-zinc-200 dark:border-zinc-800 rounded-xs">
              Repository ready to analyse: {validatedRepoUrl}
            </p>
          )}
          <div className="font-mono text-[11px] text-zinc-500 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-2.5 py-1 rounded-xs inline-block">
            RLS: claim &apos;org_id&apos; absent
          </div>
        </div>
      </main>
    );
  }

  const supabase = await createClerkSupabaseClient();
  const { data, error } = await supabase
    .from("analyses")
    .select(
      "id, status, stage, stage_message, error, failed_stage, created_at, finished_at, project:projects(owner, name, repo_url)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 text-xs">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 font-mono">
            New Analysis
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-[11px] mt-0.5">
            Paste a public GitHub repository URL to build its dependency map.
          </p>
        </div>
        <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
          workspace
        </span>
      </div>

      <AnalysisForm initialRepoUrl={validatedRepoUrl} />

      <div className="flex items-center justify-between mb-3 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60">
        <div className="flex items-center gap-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 font-mono">
            Analyses
          </h2>
          {data && (
            <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-xs tabular-nums">
              {data.length}
            </span>
          )}
        </div>
      </div>

      {error ? (
        // Loud, not swallowed: a failed query must never look like an empty list.
        (() => {
          const userFacing = toUserFacingMessage(
            error,
            "Couldn't load analyses from database. Please refresh or try again in a few moments.",
            "dashboard.loadAnalyses",
          );
          return (
            <div className="border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 rounded-xs p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                <span className="font-mono text-[11px] uppercase tracking-wider text-rose-700 dark:text-rose-400 font-medium">
                  Query failed
                </span>
              </div>
              <p className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                Couldn&apos;t load analyses from database.
              </p>
              <p className="font-mono text-[11px] text-zinc-600 dark:text-zinc-400 bg-white/70 dark:bg-zinc-900/70 border border-rose-200/60 dark:border-rose-900/40 p-2 rounded-xs break-all">
                {userFacing.message}
              </p>
            </div>
          );
        })()
      ) : (
        <DashboardTable initialAnalyses={(data ?? []) as unknown as AnalysisItem[]} />
      )}
    </main>
  );
}
