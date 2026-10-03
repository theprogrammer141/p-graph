import { auth } from "@clerk/nextjs/server";
import { createClerkSupabaseClient } from "@/lib/supabase";

// The dashboard: analyses for the organization in the current session token.
//
// There is deliberately no org filter in the query below. Which rows come back
// is decided by the RLS policy reading the token's org claim, so switching
// organization changes the token, and the same query returns different rows.
// If another organization's row ever appears here, the policy is wrong.

function formatTimestamp(iso: string): string {
  // Fixed UTC format so server and client never disagree on the string.
  return iso.slice(0, 16).replace("T", " ") + " UTC";
}

function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return "—";
  const seconds = Math.round((Date.parse(endIso) - Date.parse(startIso)) / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function renderStatus(status: string) {
  switch (status) {
    case "complete":
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          complete
        </span>
      );
    case "parsing":
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-blue-700 dark:text-blue-400">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          parsing
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-rose-700 dark:text-rose-400">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          failed
        </span>
      );
    case "queued":
    default:
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-600" />
          {status}
        </span>
      );
  }
}

export default async function Home() {
  const { orgId } = await auth();

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
    .select("id, status, error, created_at, finished_at, project:projects(owner, name, repo_url)")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 text-xs">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 font-mono">
            Analyses
          </h1>
          {data && (
            <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-xs tabular-nums">
              {data.length}
            </span>
          )}
        </div>
        <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
          workspace
        </span>
      </div>

      {error ? (
        // Loud, not swallowed: a failed query must never look like an empty list.
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
            {error.code ? `${error.code}: ` : ""}
            {error.message}
          </p>
        </div>
      ) : data.length === 0 ? (
        <div className="border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xs px-4 py-12 text-center bg-white dark:bg-zinc-950">
          <div className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
            Empty Workspace
          </div>
          <p className="text-zinc-600 dark:text-zinc-400">
            This organization hasn&apos;t analysed a repository yet.
          </p>
        </div>
      ) : (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-950 overflow-hidden shadow-2xs">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left font-mono text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 bg-zinc-50/80 dark:bg-zinc-900/60 border-b border-zinc-200 dark:border-zinc-800 select-none">
                <th className="font-medium py-2 px-3">Repository</th>
                <th className="font-medium py-2 px-3">Status</th>
                <th className="font-medium py-2 px-3">Started</th>
                <th className="font-medium py-2 px-3 text-right">Duration</th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => {
                const project = a.project as { owner: string; name: string; repo_url: string | null } | null;
                return (
                  <tr
                    key={a.id}
                    className="border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 align-top hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40 transition-colors"
                  >
                    <td className="py-2.5 px-3 font-mono">
                      {project ? (
                        project.repo_url ? (
                          <a
                            href={project.repo_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-zinc-900 dark:text-zinc-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors inline-flex items-center gap-1 group"
                          >
                            <span>{project.owner}/{project.name}</span>
                            <span className="text-zinc-400 dark:text-zinc-600 group-hover:text-blue-600 dark:group-hover:text-blue-400 text-[10px]">↗</span>
                          </a>
                        ) : (
                          <span className="text-zinc-900 dark:text-zinc-100">
                            {project.owner}/{project.name}
                          </span>
                        )
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <div>{renderStatus(a.status)}</div>
                      {a.status === "failed" && a.error && (
                        <div className="mt-1 font-mono text-[11px] text-rose-600 dark:text-rose-400/90 bg-rose-500/5 border border-rose-500/20 px-1.5 py-0.5 rounded-xs leading-normal break-all">
                          {a.error}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-zinc-500 dark:text-zinc-400 tabular-nums whitespace-nowrap">
                      {formatTimestamp(a.created_at)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-zinc-500 dark:text-zinc-400 tabular-nums text-right whitespace-nowrap">
                      {formatDuration(a.created_at, a.finished_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-3 py-1.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">
            <span>
              {data.length} {data.length === 1 ? "run" : "runs"}
            </span>
            <span>RLS isolated</span>
          </div>
        </div>
      )}
    </main>
  );
}

