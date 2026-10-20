import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { FileDetail, FolderDetail } from "@/lib/graph/detail";
import type { SelectionTarget } from "../workspace-shell";
import type { FileNode } from "@/parser/types";
import { ExplanationRenderer } from "../explanation-renderer";
import {
  explainFileAction,
  explainFolderAction,
  classifyFileRoleAction,
  getTracingStatusAction,
} from "@/app/actions/ai";
import { reanalyseRepoAction } from "@/app/actions/analysis";
import { SpotlightCard } from "@/app/components/ui/spotlight-card";
import { ClickSpark } from "@/app/components/ui/click-spark";
import { BorderTrail } from "@/app/components/ui/border-trail";
import { toUserFacingMessage } from "@/lib/errors";

export interface CachedExplanation {
  readonly content: string;
  readonly isStale?: boolean;
  readonly stalenessReason?: string;
  readonly cached?: boolean;
  readonly model?: string;
}

export function ExplanationTab({
  analysisId,
  selection,
  fileDetail,
  folderDetail,
  allFiles,
  cachedExplanations,
  onSaveExplanation,
  onSelectFile,
  onRoleAssigned,
}: {
  analysisId?: string;
  selection: SelectionTarget;
  fileDetail: FileDetail | null;
  folderDetail: FolderDetail | null;
  allFiles: readonly FileNode[];
  cachedExplanations: ReadonlyMap<string, CachedExplanation>;
  onSaveExplanation: (key: string, data: CachedExplanation) => void;
  onSelectFile: (path: string) => void;
  onRoleAssigned?: (filePath: string, role: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tracingConfigured, setTracingConfigured] = useState<boolean | null>(null);
  const [reanalysing, setReanalysing] = useState(false);

  const targetKey =
    selection === null
      ? "repo"
      : selection.kind === "file"
      ? `file:${selection.path}`
      : `folder:${selection.dir}`;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
  }, [targetKey]);

  useEffect(() => {
    getTracingStatusAction()
      .then((res) => setTracingConfigured(res.configured))
      .catch(() => setTracingConfigured(false));
  }, []);

  const knownFilesSet = useMemo(
    () => new Set(allFiles.map((f) => f.path)),
    [allFiles],
  );

  const targetLabel =
    selection === null
      ? "Repository"
      : selection.kind === "file"
      ? selection.path
      : selection.dir === "."
      ? "(root)"
      : selection.dir;

  const cached = cachedExplanations.get(targetKey);

  const handleExplain = async () => {
    if (!analysisId || selection === null) return;
    setLoading(true);
    setError(null);

    try {
      if (selection.kind === "file") {
        const res = await explainFileAction({
          analysisId,
          filePath: selection.path,
        });

        if (!res.ok || !res.content) {
          setError(res.error ?? "Failed to explain file.");
        } else {
          onSaveExplanation(targetKey, {
            content: res.content,
            isStale: res.isStale,
            stalenessReason: res.stalenessReason,
            cached: res.cached,
            model: res.model,
          });

          // Classify role if currently unlabelled or generic
          if (
            fileDetail &&
            (!fileDetail.kind ||
              fileDetail.kind === "Generic" ||
              fileDetail.kind === "Unidentified")
          ) {
            classifyFileRoleAction({
              analysisId,
              filePath: selection.path,
            })
              .then((r) => {
                if (r.ok && r.role && onRoleAssigned) {
                  onRoleAssigned(selection.path, r.role);
                }
              })
              .catch(console.error);
          }
        }
      } else if (selection.kind === "folder") {
        const folderFiles = folderDetail?.files.map((f) => f.path) ?? [];
        const res = await explainFolderAction({
          analysisId,
          folderPath: selection.dir,
          folderFiles,
        });

        if (!res.ok || !res.content) {
          setError(res.error ?? "Failed to explain folder.");
        } else {
          onSaveExplanation(targetKey, {
            content: res.content,
            cached: res.cached,
            model: res.model,
          });
        }
      }
    } catch (err: unknown) {
      setError(toUserFacingMessage(err, "Failed to explain selection. Please try again.", "detailPane.handleExplain").message);
    } finally {
      setLoading(false);
    }
  };

  const router = useRouter();

  const handleReanalyse = async () => {
    if (!analysisId) return;
    setReanalysing(true);
    try {
      await reanalyseRepoAction(analysisId);
      router.refresh();
    } catch {
      router.refresh();
    }
  };

  return (
    <div className="p-3 flex flex-col gap-3 font-mono text-[11px]">
      {/* Target header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-2 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[10px] uppercase text-zinc-400 dark:text-zinc-500 font-medium shrink-0">
              Target:
            </span>
            <span className="text-zinc-900 dark:text-zinc-100 font-semibold truncate break-all">
              {targetLabel}
            </span>
          </div>

          {/* Tracing status badge */}
          {tracingConfigured !== null && (
            <span
              title={
                tracingConfigured
                  ? "LangSmith tracing is configured and active"
                  : "LangSmith tracing is unconfigured. Calls succeed without telemetry."
              }
              className={`shrink-0 px-1.5 py-0.5 rounded-xs text-[9.5px] font-medium border ${
                tracingConfigured
                  ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                  : "border-zinc-300 dark:border-zinc-700 text-zinc-500 bg-zinc-100 dark:bg-zinc-800"
              }`}
            >
              {tracingConfigured ? "Traced" : "Untraced"}
            </span>
          )}
        </div>

        {/* Badges row if cached */}
        {cached && (
          <div className="flex items-center justify-between gap-1 text-[10px] text-zinc-500 pt-1">
            <div className="flex items-center gap-1.5 truncate">
              {cached.model && (
                <span className="truncate text-zinc-400 dark:text-zinc-500" title={cached.model}>
                  {cached.model.split("/").pop()}
                </span>
              )}
              {cached.cached && (
                <span className="px-1 py-0.2 rounded-xs bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium">
                  0 tokens
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleExplain}
              disabled={loading}
              className="text-[10px] text-(--pg-accent) hover:underline cursor-pointer disabled:opacity-50"
            >
              {loading ? "Re-explaining..." : "Re-explain"}
            </button>
          </div>
        )}
      </div>

      {/* Staleness alert if file or repo changed */}
      {cached?.isStale && (
        <div className="p-2.5 rounded-xs border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 font-medium text-[10.5px]">
            <span className="text-amber-500">⚠</span>
            <span>Explanation is stale</span>
          </div>
          <p className="text-[10px] leading-normal text-amber-800 dark:text-amber-300">
            {cached.stalenessReason ?? "The repository has moved past the analysed commit."}
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleReanalyse}
              disabled={reanalysing}
              className="px-2 py-1 rounded-xs bg-amber-600 dark:bg-amber-500 text-white font-medium text-[10px] hover:opacity-90 cursor-pointer disabled:opacity-50"
            >
              {reanalysing ? "Restarting..." : "Re-analyse repository"}
            </button>
            <button
              type="button"
              onClick={handleExplain}
              disabled={loading}
              className="px-2 py-1 rounded-xs border border-amber-500/50 text-amber-900 dark:text-amber-200 font-medium text-[10px] hover:bg-amber-500/10 cursor-pointer disabled:opacity-50"
            >
              Re-explain
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="relative p-4 border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-900/50 flex flex-col items-center justify-center gap-2 text-center overflow-hidden">
          <BorderTrail size={25} duration={2.5} color="rgba(37, 99, 235, 0.8)" />
          <div className="w-4 h-4 border-2 border-(--pg-accent) border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-700 dark:text-zinc-300 font-medium text-xs">
            Generating explanation...
          </p>
          <p className="text-[10px] text-zinc-400">
            Reading neighbours and tracing with LangSmith
          </p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="p-2.5 rounded-xs border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300 flex flex-col gap-1.5">
          <span className="font-semibold text-[10px]">Failed to generate explanation</span>
          <p className="text-[10px] leading-normal">{error}</p>
          <button
            type="button"
            onClick={handleExplain}
            className="self-start mt-1 text-[10px] text-(--pg-accent) hover:underline font-medium cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty / Un-explained state */}
      {!cached && !loading && !error && (
        <div className="p-3 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xs bg-zinc-100/50 dark:bg-zinc-900/50 flex flex-col gap-2.5">
          {selection === null ? (
            <p className="text-zinc-600 dark:text-zinc-400 leading-normal">
              Select a file or folded folder on the map to explain its role in the architecture.
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-1 text-[10.5px] text-zinc-600 dark:text-zinc-400">
                {selection.kind === "file" ? (
                  <>
                    <p className="text-zinc-800 dark:text-zinc-200 font-medium">
                      Explain this file in context of its real neighbours.
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      Imports {fileDetail?.dependsOnCount ?? 0} files · Depended on by{" "}
                      {fileDetail?.dependedOnCount ?? 0} files
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-zinc-800 dark:text-zinc-200 font-medium">
                      Explain this folded folder box.
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      Contains {folderDetail?.fileCount ?? 0} files · in {folderDetail?.fanIn ?? 0}{" "}
                      · out {folderDetail?.fanOut ?? 0}
                    </p>
                  </>
                )}
              </div>

              <ClickSpark className="w-full" sparkColor="#3b82f6" sparkRadius={28} sparkCount={12}>
                <button
                  type="button"
                  onClick={handleExplain}
                  className="w-full py-1.5 px-3 rounded-xs bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium text-xs hover:opacity-90 active:scale-[0.98] transition-transform cursor-pointer shadow-xs"
                >
                  {selection.kind === "folder" ? "Explain Folder" : "Explain File"}
                </button>
              </ClickSpark>
            </>
          )}
        </div>
      )}

      {/* Rendered explanation prose */}
      {cached && !loading && (
        <div className="flex flex-col gap-3 animate-fade-in">
          <SpotlightCard className="p-3 bg-white dark:bg-zinc-900/40" spotlightSize={300}>
            <ExplanationRenderer
              content={cached.content}
              knownFiles={knownFilesSet}
              onSelectFile={onSelectFile}
            />
          </SpotlightCard>

          {/* Actual neighbours section for files */}
          {selection?.kind === "file" && fileDetail && (
            <div className="flex flex-col gap-2 pt-1 border-t border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-medium">
                Actual Neighbours
              </span>

              {/* Imports */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-zinc-500">
                  Imports ({fileDetail.dependencies.length}):
                </span>
                {fileDetail.dependencies.length === 0 ? (
                  <span className="text-[10px] text-zinc-400 italic pl-1">(none)</span>
                ) : (
                  <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto scrollbar-thin pl-1">
                    {fileDetail.dependencies.map((dep) => (
                      <button
                        key={dep.path}
                        type="button"
                        onClick={() => onSelectFile(dep.path)}
                        className="text-left font-mono text-[10.5px] text-(--pg-out) hover:underline truncate cursor-pointer"
                        title={dep.path}
                      >
                        → {dep.path}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Dependents */}
              <div className="flex flex-col gap-1 pt-1">
                <span className="text-[10px] text-zinc-500">
                  Imported By ({fileDetail.dependents.length}):
                </span>
                {fileDetail.dependents.length === 0 ? (
                  <span className="text-[10px] text-zinc-400 italic pl-1">(none)</span>
                ) : (
                  <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto scrollbar-thin pl-1">
                    {fileDetail.dependents.map((dep) => (
                      <button
                        key={dep.path}
                        type="button"
                        onClick={() => onSelectFile(dep.path)}
                        className="text-left font-mono text-[10.5px] text-(--pg-in) hover:underline truncate cursor-pointer"
                        title={dep.path}
                      >
                        ← {dep.path}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
