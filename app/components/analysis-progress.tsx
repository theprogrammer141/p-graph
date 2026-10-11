"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import type { PipelineStage } from "@/lib/pipeline/run";
import { rerunAnalysisAction } from "@/app/actions/analysis";

const STAGES: Array<{ id: PipelineStage; label: string }> = [
  { id: "fetch", label: "fetch" },
  { id: "select", label: "select" },
  { id: "parse", label: "parse" },
  { id: "store", label: "store" },
];

interface AnalysisProgressProps {
  analysisId: string;
  repoOwner: string;
  repoName: string;
  repoUrl: string;
  initialStage: PipelineStage | null;
  initialMessage: string | null;
  initialStatus: string;
  initialError: string | null;
  initialFailedStage: string | null;
}

interface BroadcastPayload {
  analysis_id: string;
  stage: PipelineStage;
  message: string;
  status: string;
  error: string | null;
  failed_stage: string | null;
}

/** Tracks an analysis through private Realtime broadcasts and offers retries on failure. */
export function AnalysisProgress({
  analysisId,
  repoOwner,
  repoName,
  repoUrl,
  initialStage,
  initialMessage,
  initialStatus,
  initialError,
  initialFailedStage,
}: AnalysisProgressProps) {
  const router = useRouter();
  const { getToken } = useAuth();

  const [stage, setStage] = useState<PipelineStage>(initialStage ?? "fetch");
  const [message, setMessage] = useState<string>(initialMessage ?? "Starting analysis...");
  const [status, setStatus] = useState<string>(initialStatus);
  const [error, setError] = useState<string | null>(initialError);
  const [failedStage, setFailedStage] = useState<string | null>(initialFailedStage);
  const [isRerunning, setIsRerunning] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = createBrowserSupabaseClient(getToken);

    /**
     * Authenticates the analysis subscription and returns its channel cleanup callback.
     * Logs connection failures and refreshes the page when analysis completes.
     */
    async function subscribe() {
      try {
        const token = await getToken();
        if (token) {
          await supabase.realtime.setAuth(token);
        }

        const channel = supabase.channel(`analysis:${analysisId}`, {
          config: { private: true },
        });

        channel
          .on("broadcast", { event: "stage_change" }, (response) => {
            if (!active) return;
            const payload = response.payload as BroadcastPayload;

            if (payload.stage) setStage(payload.stage);
            if (payload.message !== undefined) setMessage(payload.message);
            if (payload.status) setStatus(payload.status);
            if (payload.error) setError(payload.error);
            if (payload.failed_stage) setFailedStage(payload.failed_stage);

            if (payload.status === "complete") {
              router.refresh();
            }
          })
          .subscribe((status) => {
            if (status === "SUBSCRIBED" && active) router.refresh();
          });

        return () => {
          supabase.removeChannel(channel);
        };
      } catch (err) {
        console.error("Failed to connect to Realtime channel:", err);
      }
    }

    const cleanupPromise = subscribe();

    return () => {
      active = false;
      cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, [analysisId, getToken, router]);

  /** Maps a pipeline stage to its progress position, or -1 for an unknown stage. */
  const stageIndex = (s: PipelineStage | null): number => {
    switch (s) {
      case "fetch":
        return 0;
      case "select":
        return 1;
      case "parse":
        return 2;
      case "store":
        return 3;
      case "complete":
        return 4;
      default:
        return -1;
    }
  };

  const currentIdx = stageIndex(stage);

  /** Starts a retry while disabling the button, restoring it if the action fails. */
  const handleRerun = async () => {
    setIsRerunning(true);
    try {
      await rerunAnalysisAction(analysisId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsRerunning(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-zinc-50/50 dark:bg-zinc-950/50 text-xs">
      <div className="w-full max-w-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-xs shadow-2xs p-5">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3 mb-4">
          <div className="font-mono text-[11px]">
            <a
              href={repoUrl}
              target="_blank"
              rel="noreferrer"
              className="text-zinc-900 dark:text-zinc-100 font-semibold hover:text-blue-600 dark:hover:text-blue-400 inline-flex items-center gap-1"
            >
              {repoOwner}/{repoName}
              <span className="text-zinc-400 text-[10px]">↗</span>
            </a>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {status}
          </span>
        </div>

        {status === "failed" ? (
          <div>
            <div className="mb-3 p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60 rounded-xs">
              <div className="flex items-center gap-1.5 font-mono text-[11px] text-rose-700 dark:text-rose-400 font-medium mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                failed in stage: {failedStage ?? "unknown"}
              </div>
              <p className="font-mono text-[11px] text-zinc-600 dark:text-zinc-400 wrap-break-word leading-relaxed">
                {error ?? message}
              </p>
            </div>
            <button
              onClick={handleRerun}
              disabled={isRerunning}
              className="w-full py-1.5 px-3 bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 font-mono text-[11px] font-medium rounded-xs hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 transition-colors"
            >
              {isRerunning ? "Re-running..." : "Re-run analysis"}
            </button>
          </div>
        ) : (
          <div>
            <div className="space-y-2 mb-4">
              {STAGES.map((s, idx) => {
                const isPast = currentIdx > idx;
                const isCurrent = currentIdx === idx;

                let marker = (
                  <span className="w-2 h-2 rounded-full border border-zinc-300 dark:border-zinc-700" />
                );
                let labelStyle = "text-zinc-400 dark:text-zinc-600";

                if (isPast) {
                  marker = <span className="w-2 h-2 rounded-full bg-emerald-500" />;
                  labelStyle = "text-zinc-700 dark:text-zinc-300";
                } else if (isCurrent) {
                  marker = <span className="w-2 h-2 rounded-full bg-blue-500" />;
                  labelStyle = "text-blue-600 dark:text-blue-400 font-medium";
                }

                return (
                  <div key={s.id} className="flex items-center justify-between font-mono text-[11px]">
                    <div className="flex items-center gap-2">
                      {marker}
                      <span className={labelStyle}>{s.label}</span>
                    </div>
                    {isCurrent && (
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 animate-pulse">
                        in progress
                      </span>
                    )}
                    {isPast && (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400">done</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="font-mono text-[11px] text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-2.5 rounded-xs leading-relaxed wrap-break-word">
              {message}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
