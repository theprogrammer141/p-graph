"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import type { PipelineStage } from "@/lib/pipeline/run";
import { DecryptedText } from "@/app/components/ui/decrypted-text";
import { SpotlightCard } from "@/app/components/ui/spotlight-card";
import { animateEntrance } from "@/lib/animations/anime";

export interface AnalysisItem {
  id: string;
  status: string;
  stage: string | null;
  stage_message: string | null;
  error: string | null;
  failed_stage: string | null;
  created_at: string;
  finished_at: string | null;
  project: {
    owner: string;
    name: string;
    repo_url: string | null;
  } | null;
}

interface DashboardTableProps {
  initialAnalyses: AnalysisItem[];
}

interface BroadcastPayload {
  analysis_id: string;
  stage: PipelineStage;
  message: string;
  status: string;
  error: string | null;
  failed_stage: string | null;
}

/** Formats an ISO timestamp supplied in UTC to minute precision for the dashboard. */
function formatTimestamp(iso: string): string {
  return iso.slice(0, 16).replace("T", " ") + " UTC";
}

/** Formats elapsed time in seconds or minutes, or an em dash for unfinished runs. */
function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return "—";
  const seconds = Math.round((Date.parse(endIso) - Date.parse(startIso)) / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** Returns whether the analysis was created more than five minutes ago. */
function isStale(createdIso: string): boolean {
  const diffMs = Date.now() - Date.parse(createdIso);
  return diffMs > 5 * 60 * 1000; // 5 minutes old
}

/** Renders the analysis status, marking parsing runs older than five minutes as stale. */
function renderStatus(item: AnalysisItem) {
  const { status, stage, created_at } = item;

  switch (status) {
    case "complete":
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          complete
        </span>
      );
    case "parsing":
      if (isStale(created_at)) {
        return (
          <span
            className="inline-flex items-center gap-1.5 font-mono text-[11px] text-amber-700 dark:text-amber-400 font-medium"
            title="Analysis has been running for over 5 minutes without completing"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            stale
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-blue-700 dark:text-blue-400 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          parsing {stage ? `(${stage})` : ""}
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-rose-700 dark:text-rose-400 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          failed
        </span>
      );
    case "queued":
    default:
      return (
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-600" />
          {status}
        </span>
      );
  }
}

/** Displays recent analyses and updates active rows through Realtime broadcasts. */
export function DashboardTable({ initialAnalyses }: DashboardTableProps) {
  const { getToken } = useAuth();
  const [analyses, setAnalyses] = useState<AnalysisItem[]>(initialAnalyses);

  const activeAnalysisIdsKey = analyses
    .filter((a) => a.status === "parsing" || a.status === "queued")
    .map((a) => a.id)
    .sort()
    .join(",");

  // Subscribe to realtime updates for active (parsing/queued) analyses
  useEffect(() => {
    if (!activeAnalysisIdsKey) return;
    const activeAnalysisIds = activeAnalysisIdsKey.split(",");

    let mounted = true;
    const supabase = createBrowserSupabaseClient(getToken);

    /** Authenticates subscriptions for active analyses and returns a callback to remove them. */
    async function subscribeChannels() {
      const token = await getToken();
      if (token) {
        await supabase.realtime.setAuth(token);
      }

      if (!mounted) return;

      const channels = activeAnalysisIds.map((id) => {
        const channel = supabase.channel(`analysis:${id}`, {
          config: { private: true },
        });

        channel.on("broadcast", { event: "stage_change" }, (res) => {
          if (!mounted) return;
          const payload = res.payload as BroadcastPayload;

          setAnalyses((prev) =>
            prev.map((row) => {
              if (row.id !== payload.analysis_id) return row;
              return {
                ...row,
                stage: payload.stage ?? row.stage,
                stage_message: payload.message ?? row.stage_message,
                status: payload.status ?? row.status,
                error: payload.error ?? row.error,
                failed_stage: payload.failed_stage ?? row.failed_stage,
                finished_at:
                  payload.status === "complete" || payload.status === "failed"
                    ? new Date().toISOString()
                    : row.finished_at,
              };
            }),
          );
        });

        channel.subscribe();
        return channel;
      });

      return () => {
        for (const ch of channels) {
          supabase.removeChannel(ch);
        }
      };
    }

    const cleanupPromise = subscribeChannels();

    return () => {
      mounted = false;
      cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, [activeAnalysisIdsKey, getToken]);

  const tbodyRef = React.useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    if (tbodyRef.current) {
      const rows = tbodyRef.current.querySelectorAll("tr");
      if (rows.length > 0) {
        animateEntrance(Array.from(rows), {
          translateY: [8, 0],
          staggerMs: 35,
          duration: 350,
          ease: "outQuad",
        });
      }
    }
  }, [analyses.length]);

  if (analyses.length === 0) {
    return (
      <SpotlightCard className="border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xs px-4 py-12 text-center bg-white dark:bg-zinc-950">
        <div className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
          <DecryptedText text="Empty Workspace" speed={40} />
        </div>
        <p className="text-zinc-600 dark:text-zinc-400">
          This organization hasn&apos;t analysed a repository yet.
        </p>
      </SpotlightCard>
    );
  }

  return (
    <SpotlightCard
      className="p-0 border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-950 overflow-hidden shadow-2xs"
      spotlightSize={400}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left font-mono text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 bg-zinc-50/80 dark:bg-zinc-900/60 border-b border-zinc-200 dark:border-zinc-800 select-none">
            <th className="font-medium py-2 px-3">Repository</th>
            <th className="font-medium py-2 px-3">Status</th>
            <th className="font-medium py-2 px-3">Started</th>
            <th className="font-medium py-2 px-3 text-right">Duration</th>
          </tr>
        </thead>
        <tbody ref={tbodyRef}>
          {analyses.map((a) => {
            const project = a.project;
            return (
              <tr
                key={a.id}
                className="border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 align-top hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40 transition-colors"
              >
                <td className="py-2.5 px-3 font-mono">
                  {project ? (
                    <Link
                      href={`/analysis/${a.id}`}
                      className="text-zinc-900 dark:text-zinc-100 font-medium hover:text-blue-600 dark:hover:text-blue-400 transition-colors inline-flex items-center gap-1 group"
                    >
                      <DecryptedText
                        text={`${project.owner}/${project.name}`}
                        animateOn="hover"
                        speed={30}
                      />
                      <span className="text-zinc-400 dark:text-zinc-600 group-hover:text-blue-600 dark:group-hover:text-blue-400 text-[10px]">
                        →
                      </span>
                    </Link>
                  ) : (
                    <span className="text-zinc-400 dark:text-zinc-600">—</span>
                  )}
                </td>
                <td className="py-2.5 px-3">
                  <div>{renderStatus(a)}</div>
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
          {analyses.length} {analyses.length === 1 ? "run" : "runs"}
        </span>
        <span>RLS isolated</span>
      </div>
    </SpotlightCard>
  );
}
