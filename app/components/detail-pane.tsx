"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { FileDetail, FolderDetail, RepoSummary } from "@/lib/graph/detail";
import type { SelectionTarget } from "./workspace-shell";
import type { Edge, FileNode } from "@/parser/types";
import { colorOf, extensionOf } from "@/lib/file-categories";
import { transitiveWalk, type RepoInsights } from "@/lib/graph/maths";
import { ExplanationRenderer } from "./explanation-renderer";
import {
  explainFileAction,
  explainFolderAction,
  classifyFileRoleAction,
  getTracingStatusAction,
} from "@/app/actions/ai";
import { reanalyseRepoAction } from "@/app/actions/analysis";

export interface RouteItem {
  readonly id?: string;
  readonly filePath: string;
  readonly method: string;
  readonly path: string;
}

export interface CachedExplanation {
  readonly content: string;
  readonly isStale?: boolean;
  readonly stalenessReason?: string;
  readonly cached?: boolean;
  readonly model?: string;
}

interface DetailPaneProps {
  analysisId?: string;
  selection: SelectionTarget;
  repoSummary: RepoSummary;
  fileDetail: FileDetail | null;
  folderDetail: FolderDetail | null;
  insights: RepoInsights;
  edges: readonly Edge[];
  routes?: readonly RouteItem[];
  allFiles: readonly FileNode[];
  activeTab: "structure" | "explanation";
  hoveredTarget: string | null;
  cachedExplanations: ReadonlyMap<string, CachedExplanation>;
  groupOfFile?: (path: string) => string | undefined;
  onTabChange: (tab: "structure" | "explanation") => void;
  onSelectFile: (path: string) => void;
  onDeselect: () => void;
  onHover: (target: string | null) => void;
  onSaveExplanation: (key: string, data: CachedExplanation) => void;
  onRoleAssigned?: (filePath: string, role: string) => void;
}

/** Renders details and insights for the current repository, folder, or file selection. */
export function DetailPane({
  analysisId,
  selection,
  repoSummary,
  fileDetail,
  folderDetail,
  insights,
  edges,
  routes = [],
  allFiles,
  activeTab,
  hoveredTarget,
  cachedExplanations,
  groupOfFile,
  onTabChange,
  onSelectFile,
  onDeselect,
  onHover,
  onSaveExplanation,
  onRoleAssigned,
}: DetailPaneProps) {
  const isFileHovered = (path: string) => {
    if (!hoveredTarget) return false;
    if (hoveredTarget === path) return true;
    if (groupOfFile && groupOfFile(path) === hoveredTarget) return true;
    return false;
  };

  return (
    <aside className="w-80 shrink-0 border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950 flex flex-col overflow-hidden text-xs select-none">
      {/* Top bar with tabs & optional deselect button */}
      <div className="h-9 px-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-50/40 dark:bg-zinc-900/20">
        <div className="flex items-center gap-1 font-mono text-[10px]">
          <button
            type="button"
            onClick={() => onTabChange("structure")}
            className={`px-2 py-1 rounded-xs font-medium cursor-pointer transition-colors ${
              activeTab === "structure"
                ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs border border-zinc-200 dark:border-zinc-700"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            Structure
          </button>
          <button
            type="button"
            onClick={() => onTabChange("explanation")}
            className={`px-2 py-1 rounded-xs font-medium cursor-pointer transition-colors ${
              activeTab === "explanation"
                ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs border border-zinc-200 dark:border-zinc-700"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            Explanation
          </button>
        </div>

        {selection !== null && (
          <button
            type="button"
            onClick={onDeselect}
            title="Deselect (return to repository summary)"
            className="px-1.5 py-0.5 rounded-xs font-mono text-[10px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 cursor-pointer"
          >
            Overview ✕
          </button>
        )}
      </div>

      {/* Pane Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 scrollbar-thin flex flex-col">
        {activeTab === "explanation" ? (
          <ExplanationTab
            analysisId={analysisId}
            selection={selection}
            fileDetail={fileDetail}
            folderDetail={folderDetail}
            allFiles={allFiles}
            cachedExplanations={cachedExplanations}
            onSaveExplanation={onSaveExplanation}
            onSelectFile={onSelectFile}
            onRoleAssigned={onRoleAssigned}
          />
        ) : (
          <StructureTab
            analysisId={analysisId}
            selection={selection}
            repoSummary={repoSummary}
            fileDetail={fileDetail}
            folderDetail={folderDetail}
            edges={edges}
            routes={routes}
            isFileHovered={isFileHovered}
            onSelectFile={onSelectFile}
            onHover={onHover}
            onRoleAssigned={onRoleAssigned}
            onTabChange={onTabChange}
          />
        )}
      </div>

      {/* Insights Panel - starts collapsed, never as first thing you see */}
      <InsightsPanel
        insights={insights}
        isFileHovered={isFileHovered}
        onSelectFile={onSelectFile}
        onHover={onHover}
      />
    </aside>
  );
}

function ExplanationTab({
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

  const targetKey =
    selection === null
      ? "repo"
      : selection.kind === "file"
      ? `file:${selection.path}`
      : `folder:${selection.dir}`;

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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleReanalyse = async () => {
    if (!analysisId) return;
    setReanalysing(true);
    try {
      await reanalyseRepoAction(analysisId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to restart analysis.");
      setReanalysing(false);
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
        <div className="p-4 border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-900/50 flex flex-col items-center justify-center gap-2 text-center">
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

              <button
                type="button"
                onClick={handleExplain}
                className="w-full py-1.5 px-3 rounded-xs bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium text-xs hover:opacity-90 cursor-pointer shadow-xs"
              >
                {selection.kind === "folder" ? "Explain Folder" : "Explain File"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Rendered explanation prose */}
      {cached && !loading && (
        <div className="flex flex-col gap-3">
          <div className="p-3 rounded-xs border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40">
            <ExplanationRenderer
              content={cached.content}
              knownFiles={knownFilesSet}
              onSelectFile={onSelectFile}
            />
          </div>

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

interface StructureTabProps {
  analysisId?: string;
  selection: SelectionTarget;
  repoSummary: RepoSummary;
  fileDetail: FileDetail | null;
  folderDetail: FolderDetail | null;
  edges: readonly Edge[];
  routes: readonly RouteItem[];
  isFileHovered: (path: string) => boolean;
  onSelectFile: (path: string) => void;
  onHover: (target: string | null) => void;
  onRoleAssigned?: (filePath: string, role: string) => void;
  onTabChange?: (tab: "structure" | "explanation") => void;
}

/** Selects the repository, file, or folder detail view for the current selection. */
function StructureTab({
  analysisId,
  selection,
  repoSummary,
  fileDetail,
  folderDetail,
  edges,
  routes,
  isFileHovered,
  onSelectFile,
  onHover,
  onRoleAssigned,
  onTabChange,
}: StructureTabProps) {
  if (selection === null) {
    return (
      <RepoSummaryView
        summary={repoSummary}
        routes={routes}
        isFileHovered={isFileHovered}
        onSelectFile={onSelectFile}
        onHover={onHover}
      />
    );
  }

  if (selection.kind === "file" && fileDetail) {
    return (
      <FileDetailView
        analysisId={analysisId}
        detail={fileDetail}
        edges={edges}
        routes={routes}
        isFileHovered={isFileHovered}
        onSelectFile={onSelectFile}
        onHover={onHover}
        onRoleAssigned={onRoleAssigned}
        onTabChange={onTabChange}
      />
    );
  }

  if (selection.kind === "folder" && folderDetail) {
    return (
      <FolderDetailView
        detail={folderDetail}
        isFileHovered={isFileHovered}
        onSelectFile={onSelectFile}
        onHover={onHover}
        onTabChange={onTabChange}
      />
    );
  }

  return (
    <div className="p-3 font-mono text-[11px] text-zinc-400">
      Loading details...
    </div>
  );
}

/** Renders an uppercase HTTP method with its method-specific color or a neutral fallback. */
function MethodBadge({ method }: { method: string }) {
  const m = method.toUpperCase();
  let badgeStyle = "text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700";
  if (m === "GET") {
    badgeStyle = "text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/70 border-sky-200 dark:border-sky-800";
  } else if (m === "POST") {
    badgeStyle = "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 border-emerald-200 dark:border-emerald-800";
  } else if (m === "PUT") {
    badgeStyle = "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/70 border-amber-200 dark:border-amber-800";
  } else if (m === "DELETE") {
    badgeStyle = "text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/70 border-rose-200 dark:border-rose-800";
  } else if (m === "PATCH") {
    badgeStyle = "text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/70 border-purple-200 dark:border-purple-800";
  }
  return (
    <span
      className={`px-1 py-0.5 rounded-xs border text-[9px] font-bold tracking-tight shrink-0 ${badgeStyle}`}
    >
      {m}
    </span>
  );
}

/** Displays repository counts, extracted routes, starting points, and frequently imported files. */
function RepoSummaryView({
  summary,
  routes,
  isFileHovered,
  onSelectFile,
  onHover,
}: {
  summary: RepoSummary;
  routes: readonly RouteItem[];
  isFileHovered: (path: string) => boolean;
  onSelectFile: (path: string) => void;
  onHover: (target: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Repository identity & framework */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-2.5">
        <div className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
          {summary.name}
        </div>
        <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
          <span>Framework:</span>
          <span className="px-1.5 py-0.5 rounded-xs bg-zinc-200/70 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-medium">
            {summary.framework}
          </span>
        </div>
      </div>

      {/* Counts: files, imports, routes, unidentified */}
      <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
        <div className="p-2 rounded-xs border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60">
          <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase">
            Files
          </div>
          <div className="text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
            {summary.fileCount}
          </div>
        </div>

        <div className="p-2 rounded-xs border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60">
          <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase">
            Imports
          </div>
          <div className="text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
            {summary.importCount}
          </div>
        </div>

        <div className="p-2 rounded-xs border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60">
          <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase">
            Routes
          </div>
          <div className="text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
            {summary.routeCount}
          </div>
        </div>

        <div
          className="p-2 rounded-xs border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60"
          title="Files that could not be identified by framework or naming conventions"
        >
          <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase">
            No convention
          </div>
          <div className="text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
            {summary.unidentifiedCount}
          </div>
        </div>
      </div>

      {/* Extracted routes table */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
            Routes
          </span>
          <span className="font-mono text-[10px] text-zinc-400 tabular-nums">
            {routes.length}
          </span>
        </div>

        {routes.length === 0 ? (
          <div className="p-2.5 rounded-xs border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 text-center font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
            No routes extracted
          </div>
        ) : (
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-900/50 max-h-56 overflow-y-auto scrollbar-thin divide-y divide-zinc-100 dark:divide-zinc-800/60 font-mono text-[11px]">
            {routes.map((route, idx) => {
              const isHovered = isFileHovered(route.filePath);
              return (
                <button
                  type="button"
                  key={`${route.method}-${route.path}-${route.filePath}-${idx}`}
                  onClick={() => onSelectFile(route.filePath)}
                  onMouseEnter={() => onHover(route.filePath)}
                  onMouseLeave={() => onHover(null)}
                  title={`${route.method} ${route.path} · ${route.filePath}`}
                  className={`w-full text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--pg-accent) px-2 py-1.5 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                    isHovered
                      ? "bg-zinc-200/80 dark:bg-zinc-800/80 text-zinc-950 dark:text-zinc-50 ring-1 ring-(--pg-accent)/60"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  <span className="flex items-center gap-1.5 min-w-0 flex-1">
                    <MethodBadge method={route.method} />
                    <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                      {route.path}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] text-zinc-400 dark:text-zinc-500 truncate max-w-24">
                    {route.filePath.split("/").pop()}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Ranked list 1: what the rest of the repository leans on most */}
      <div className="mt-1 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
            Most depended on
          </span>
          <span className="font-mono text-[10px] text-zinc-400 tabular-nums">
            {summary.mostDependedOn.length} files
          </span>
        </div>
        <div className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-tight">
          Ordered by how many files import them
        </div>

        <div className="mt-1 border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-900/50 max-h-48 overflow-y-auto scrollbar-thin divide-y divide-zinc-100 dark:divide-zinc-800/60">
          {summary.mostDependedOn.map((file) => {
            const isHovered = isFileHovered(file.path);
            return (
              <div
                key={file.path}
                onClick={() => onSelectFile(file.path)}
                onMouseEnter={() => onHover(file.path)}
                onMouseLeave={() => onHover(null)}
                title={`${file.path} · imported by ${file.fanIn} files`}
                className={`px-2 py-1.5 flex items-center justify-between gap-2 font-mono text-[11px] cursor-pointer transition-colors ${
                  isHovered
                    ? "bg-zinc-200/80 dark:bg-zinc-800/80 text-zinc-950 dark:text-zinc-50 ring-1 ring-(--pg-accent)/60 inset-0"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span
                    className="w-1.5 h-1.5 rounded-xs shrink-0"
                    style={{ backgroundColor: file.colorHex }}
                  />
                  <span className="truncate">{file.path}</span>
                </div>
                <span
                  className="shrink-0 text-[10px] tabular-nums font-medium"
                  style={{ color: "var(--pg-in)" }}
                >
                  in {file.fanIn}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ranked list 2: files nothing imports at all (where reading starts) */}
      <div className="mt-2 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
            Starting points
          </span>
          <span className="font-mono text-[10px] text-zinc-400 tabular-nums">
            {summary.startingPoints.length} files
          </span>
        </div>
        <div className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-tight">
          Files nothing imports at all — where reading starts
        </div>

        <div className="mt-1 border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-900/50 max-h-48 overflow-y-auto scrollbar-thin divide-y divide-zinc-100 dark:divide-zinc-800/60">
          {summary.startingPoints.map((file) => {
            const isHovered = isFileHovered(file.path);
            return (
              <div
                key={file.path}
                onClick={() => onSelectFile(file.path)}
                onMouseEnter={() => onHover(file.path)}
                onMouseLeave={() => onHover(null)}
                title={`${file.path} · imports ${file.fanOut} files`}
                className={`px-2 py-1.5 flex items-center justify-between gap-2 font-mono text-[11px] cursor-pointer transition-colors ${
                  isHovered
                    ? "bg-zinc-200/80 dark:bg-zinc-800/80 text-zinc-950 dark:text-zinc-50 ring-1 ring-(--pg-accent)/60"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span
                    className="w-1.5 h-1.5 rounded-xs shrink-0"
                    style={{ backgroundColor: file.colorHex }}
                  />
                  <span className="truncate">{file.path}</span>
                </div>
                <span
                  className="shrink-0 text-[10px] tabular-nums"
                  style={{ color: "var(--pg-out)" }}
                >
                  out {file.fanOut}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Displays a selected file’s routes, direct dependencies, and transitive dependency chains. */
function FileDetailView({
  analysisId,
  detail,
  edges,
  routes = [],
  isFileHovered,
  onSelectFile,
  onHover,
  onRoleAssigned,
  onTabChange,
}: {
  analysisId?: string;
  detail: FileDetail;
  edges: readonly Edge[];
  routes?: readonly RouteItem[];
  isFileHovered: (path: string) => boolean;
  onSelectFile: (path: string) => void;
  onHover: (target: string | null) => void;
  onRoleAssigned?: (filePath: string, role: string) => void;
  onTabChange?: (tab: "structure" | "explanation") => void;
}) {
  const [classifyingRole, setClassifyingRole] = useState(false);
  const [transitiveMode, setTransitiveMode] = useState<
    "blast-radius" | "dependency-chain" | null
  >(null);

  const blastRadiusItems = useMemo(
    () => transitiveWalk(detail.path, edges, "blast-radius", 2),
    [detail.path, edges]
  );

  const depChainItems = useMemo(
    () => transitiveWalk(detail.path, edges, "dependency-chain", 2),
    [detail.path, edges]
  );

  const fileRoutes = useMemo(
    () => routes.filter((r) => r.filePath === detail.path),
    [routes, detail.path]
  );

  const handleAssignRole = async () => {
    if (!analysisId) return;
    setClassifyingRole(true);
    try {
      const res = await classifyFileRoleAction({
        analysisId,
        filePath: detail.path,
      });
      if (res.ok && res.role && onRoleAssigned) {
        onRoleAssigned(detail.path, res.role);
      }
    } catch (err) {
      console.error("Failed to assign role:", err);
    } finally {
      setClassifyingRole(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* File header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-2.5">
        <div className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100 break-all select-text">
          {detail.path}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
          <span className="px-1.5 py-0.5 rounded-xs bg-zinc-200/70 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-medium">
            {detail.kind}
          </span>
          {(!detail.kind ||
            detail.kind === "Generic" ||
            detail.kind === "Unidentified") &&
            onRoleAssigned && (
              <button
                type="button"
                onClick={handleAssignRole}
                disabled={classifyingRole}
                className="px-1.5 py-0.5 rounded-xs border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-(--pg-accent) hover:border-(--pg-accent) cursor-pointer"
              >
                {classifyingRole ? "Classifying..." : "Assign role (AI)"}
              </button>
            )}
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-xs bg-zinc-200/70 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-medium">
            <span
              className="w-1.5 h-1.5 rounded-xs"
              style={{ backgroundColor: detail.colorHex }}
            />
            {detail.extension}
          </span>
          <span className="text-zinc-500 tabular-nums">
            {detail.lines} lines
          </span>

          {onTabChange && (
            <button
              type="button"
              onClick={() => onTabChange("explanation")}
              className="ml-auto px-1.5 py-0.5 rounded-xs bg-(--pg-accent)/10 text-(--pg-accent) font-medium hover:bg-(--pg-accent)/20 cursor-pointer"
            >
              Explain →
            </button>
          )}
        </div>
      </div>

      {/* Declared routes if any */}
      {fileRoutes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
              Declared routes
            </span>
            <span className="font-mono text-[10px] text-zinc-400 tabular-nums">
              {fileRoutes.length}
            </span>
          </div>
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-900/50 divide-y divide-zinc-100 dark:divide-zinc-800/60 font-mono text-[11px]">
            {fileRoutes.map((r, i) => (
              <div key={i} className="px-2 py-1.5 flex items-center gap-2">
                <MethodBadge method={r.method} />
                <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                  {r.path}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fan metrics */}
      <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
        <div className="p-2 rounded-xs border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60">
          <div className="text-[10px] uppercase text-zinc-400 dark:text-zinc-500">
            Depends on
          </div>
          <div
            className="text-sm font-semibold tabular-nums"
            style={{ color: "var(--pg-out)" }}
          >
            {detail.dependsOnCount}
          </div>
        </div>

        <div className="p-2 rounded-xs border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60">
          <div className="text-[10px] uppercase text-zinc-400 dark:text-zinc-500">
            Depended on by
          </div>
          <div
            className="text-sm font-semibold tabular-nums"
            style={{ color: "var(--pg-in)" }}
          >
            {detail.dependedOnCount}
          </div>
        </div>
      </div>

      {/* Transitive walk buttons: Blast radius and Dependency chain */}
      <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
        <button
          type="button"
          onClick={() =>
            setTransitiveMode((prev) =>
              prev === "blast-radius" ? null : "blast-radius"
            )
          }
          title="Everything that breaks if this file changes (2 levels deep)"
          className={`px-2 py-1.5 rounded-xs border font-medium flex items-center justify-between cursor-pointer transition-colors ${
            transitiveMode === "blast-radius"
              ? "bg-(--pg-in)/15 border-(--pg-in) text-zinc-950 dark:text-zinc-50 ring-1 ring-(--pg-in)"
              : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
          }`}
        >
          <span>Blast radius</span>
          <span
            className="text-[10px] tabular-nums font-semibold"
            style={{ color: "var(--pg-in)" }}
          >
            {blastRadiusItems.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setTransitiveMode((prev) =>
              prev === "dependency-chain" ? null : "dependency-chain"
            )
          }
          title="Everything this file needs (2 levels deep)"
          className={`px-2 py-1.5 rounded-xs border font-medium flex items-center justify-between cursor-pointer transition-colors ${
            transitiveMode === "dependency-chain"
              ? "bg-(--pg-out)/15 border-(--pg-out) text-zinc-950 dark:text-zinc-50 ring-1 ring-(--pg-out)"
              : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
          }`}
        >
          <span>Dep chain</span>
          <span
            className="text-[10px] tabular-nums font-semibold"
            style={{ color: "var(--pg-out)" }}
          >
            {depChainItems.length}
          </span>
        </button>
      </div>

      {/* Conditional transitive view or direct dependencies view */}
      {transitiveMode === "blast-radius" ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between font-mono">
            <div className="flex items-center gap-1.5">
              <span
                className="text-[10px] uppercase tracking-wider font-semibold"
                style={{ color: "var(--pg-in)" }}
              >
                Blast radius
              </span>
              <span className="text-[10px] text-zinc-400 tabular-nums">
                (2 levels · {blastRadiusItems.length} files)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setTransitiveMode(null)}
              className="text-[10px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
            >
              ✕ Direct
            </button>
          </div>
          <div className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-tight">
            Everything that breaks if this file changes
          </div>

          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-900/50 max-h-72 overflow-y-auto scrollbar-thin divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {blastRadiusItems.length === 0 ? (
              <div className="px-2.5 py-2 font-mono text-[10px] text-zinc-400 italic">
                Nothing in the repository depends on this file
              </div>
            ) : (
              blastRadiusItems.map((item) => {
                const isHovered = isFileHovered(item.path);
                const ext = extensionOf(item.path);
                return (
                  <div
                    key={item.path}
                    onClick={() => onSelectFile(item.path)}
                    onMouseEnter={() => onHover(item.path)}
                    onMouseLeave={() => onHover(null)}
                    title={`${item.path} · ${item.depth === 1 ? "direct dependent" : "indirect dependent (2 hops)"}`}
                    className={`px-2 py-1.5 flex items-center justify-between gap-2 font-mono text-[11px] cursor-pointer transition-colors ${
                      isHovered
                        ? "bg-zinc-200/80 dark:bg-zinc-800/80 text-zinc-950 dark:text-zinc-50 ring-1 ring-(--pg-accent)/60"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span
                        className="w-1.5 h-1.5 rounded-xs shrink-0"
                        style={{ backgroundColor: colorOf(ext) }}
                      />
                      <span className="truncate">{item.path}</span>
                    </div>
                    <span
                      className="shrink-0 text-[10px] tabular-nums px-1 py-0.2 rounded-xs font-medium"
                      style={{
                        backgroundColor:
                          item.depth === 1
                            ? "rgba(16, 185, 129, 0.15)"
                            : "rgba(16, 185, 129, 0.08)",
                        color: "var(--pg-in)",
                      }}
                    >
                      {item.depth === 1 ? "1 hop" : "2 hops"}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : transitiveMode === "dependency-chain" ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between font-mono">
            <div className="flex items-center gap-1.5">
              <span
                className="text-[10px] uppercase tracking-wider font-semibold"
                style={{ color: "var(--pg-out)" }}
              >
                Dependency chain
              </span>
              <span className="text-[10px] text-zinc-400 tabular-nums">
                (2 levels · {depChainItems.length} files)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setTransitiveMode(null)}
              className="text-[10px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
            >
              ✕ Direct
            </button>
          </div>
          <div className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-tight">
            Everything this file needs
          </div>

          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-900/50 max-h-72 overflow-y-auto scrollbar-thin divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {depChainItems.length === 0 ? (
              <div className="px-2.5 py-2 font-mono text-[10px] text-zinc-400 italic">
                Imports no files inside the repository
              </div>
            ) : (
              depChainItems.map((item) => {
                const isHovered = isFileHovered(item.path);
                const ext = extensionOf(item.path);
                return (
                  <div
                    key={item.path}
                    onClick={() => onSelectFile(item.path)}
                    onMouseEnter={() => onHover(item.path)}
                    onMouseLeave={() => onHover(null)}
                    title={`${item.path} · ${item.depth === 1 ? "direct dependency" : "indirect dependency (2 hops)"}`}
                    className={`px-2 py-1.5 flex items-center justify-between gap-2 font-mono text-[11px] cursor-pointer transition-colors ${
                      isHovered
                        ? "bg-zinc-200/80 dark:bg-zinc-800/80 text-zinc-950 dark:text-zinc-50 ring-1 ring-(--pg-accent)/60"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span
                        className="w-1.5 h-1.5 rounded-xs shrink-0"
                        style={{ backgroundColor: colorOf(ext) }}
                      />
                      <span className="truncate">{item.path}</span>
                    </div>
                    <span
                      className="shrink-0 text-[10px] tabular-nums px-1 py-0.2 rounded-xs font-medium"
                      style={{
                        backgroundColor:
                          item.depth === 1
                            ? "rgba(245, 158, 11, 0.15)"
                            : "rgba(245, 158, 11, 0.08)",
                        color: "var(--pg-out)",
                      }}
                    >
                      {item.depth === 1 ? "1 hop" : "2 hops"}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Dependencies list: what this file imports */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between font-mono">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
                Depends on
              </span>
              <span
                className="text-[10px] tabular-nums font-medium"
                style={{ color: "var(--pg-out)" }}
              >
                {detail.dependsOnCount}
              </span>
            </div>

            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-900/50 max-h-44 overflow-y-auto scrollbar-thin divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {detail.dependencies.length === 0 ? (
                <div className="px-2.5 py-2 font-mono text-[10px] text-zinc-400 italic">
                  Imports no files inside the repository
                </div>
              ) : (
                detail.dependencies.map((dep) => {
                  const isHovered = isFileHovered(dep.path);
                  return (
                    <div
                      key={dep.path}
                      onClick={() => onSelectFile(dep.path)}
                      onMouseEnter={() => onHover(dep.path)}
                      onMouseLeave={() => onHover(null)}
                      title={`${dep.path} · ${dep.lines} lines · click to select`}
                      className={`px-2 py-1.5 flex items-center justify-between gap-2 font-mono text-[11px] cursor-pointer transition-colors ${
                        isHovered
                          ? "bg-zinc-200/80 dark:bg-zinc-800/80 text-zinc-950 dark:text-zinc-50 ring-1 ring-(--pg-accent)/60"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span
                          className="w-1.5 h-1.5 rounded-xs shrink-0"
                          style={{ backgroundColor: dep.colorHex }}
                        />
                        <span className="truncate">{dep.path}</span>
                      </div>
                      <span className="shrink-0 text-[10px] text-zinc-400 tabular-nums">
                        {dep.lines}L
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Dependents list: files that import this file */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between font-mono">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
                Depended on by
              </span>
              <span
                className="text-[10px] tabular-nums font-medium"
                style={{ color: "var(--pg-in)" }}
              >
                {detail.dependedOnCount}
              </span>
            </div>

            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-900/50 max-h-44 overflow-y-auto scrollbar-thin divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {detail.dependents.length === 0 ? (
                <div className="px-2.5 py-2 font-mono text-[10px] text-zinc-400 italic">
                  Imported by no other files
                </div>
              ) : (
                detail.dependents.map((dep) => {
                  const isHovered = isFileHovered(dep.path);
                  return (
                    <div
                      key={dep.path}
                      onClick={() => onSelectFile(dep.path)}
                      onMouseEnter={() => onHover(dep.path)}
                      onMouseLeave={() => onHover(null)}
                      title={`${dep.path} · ${dep.lines} lines · click to select`}
                      className={`px-2 py-1.5 flex items-center justify-between gap-2 font-mono text-[11px] cursor-pointer transition-colors ${
                        isHovered
                          ? "bg-zinc-200/80 dark:bg-zinc-800/80 text-zinc-950 dark:text-zinc-50 ring-1 ring-(--pg-accent)/60"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span
                          className="w-1.5 h-1.5 rounded-xs shrink-0"
                          style={{ backgroundColor: dep.colorHex }}
                        />
                        <span className="truncate">{dep.path}</span>
                      </div>
                      <span className="shrink-0 text-[10px] text-zinc-400 tabular-nums">
                        {dep.lines}L
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FolderDetailView({
  detail,
  isFileHovered,
  onSelectFile,
  onHover,
  onTabChange,
}: {
  detail: FolderDetail;
  isFileHovered: (path: string) => boolean;
  onSelectFile: (path: string) => void;
  onHover: (target: string | null) => void;
  onTabChange?: (tab: "structure" | "explanation") => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Folder header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-2.5">
        <div className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100 break-all select-text">
          {detail.dir === "." ? "(root)" : detail.dir}
        </div>
        <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-zinc-500">
          <div className="flex items-center gap-2">
            <span className="tabular-nums">{detail.fileCount} files</span>
            <span>·</span>
            <span style={{ color: "var(--pg-in)" }} className="tabular-nums">
              in {detail.fanIn}
            </span>
            <span>·</span>
            <span style={{ color: "var(--pg-out)" }} className="tabular-nums">
              out {detail.fanOut}
            </span>
          </div>

          {onTabChange && (
            <button
              type="button"
              onClick={() => onTabChange("explanation")}
              className="px-1.5 py-0.5 rounded-xs bg-(--pg-accent)/10 text-(--pg-accent) font-medium hover:bg-(--pg-accent)/20 cursor-pointer"
            >
              Explain Folder →
            </button>
          )}
        </div>
      </div>

      {/* Kinds of files inside this folder */}
      <div className="flex flex-col gap-1.5">
        <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
          File kinds inside
        </div>

        <div className="p-2 border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-900/50 flex flex-col gap-2">
          {/* Extension categories */}
          <div className="flex flex-wrap gap-1.5">
            {detail.categories.map((cat) => (
              <span
                key={cat.kind}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-xs bg-zinc-100 dark:bg-zinc-800/80 font-mono text-[11px] text-zinc-800 dark:text-zinc-200"
              >
                {cat.colorHex && (
                  <span
                    className="w-1.5 h-1.5 rounded-xs shrink-0"
                    style={{ backgroundColor: cat.colorHex }}
                  />
                )}
                <span>{cat.kind}</span>
                <span className="text-[10px] text-zinc-400 tabular-nums">
                  {cat.count}
                </span>
              </span>
            ))}
          </div>

          {/* Convention roles if any non-unidentified */}
          {detail.roles.length > 0 && (
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/60 flex flex-wrap gap-1 font-mono text-[10px]">
              {detail.roles.map((r) => (
                <span
                  key={r.kind}
                  className="px-1.5 py-0.5 rounded-xs bg-zinc-200/60 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                >
                  {r.kind}: <span className="tabular-nums font-medium">{r.count}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Files list inside this folder */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between font-mono">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
            Files in folder
          </span>
          <span className="text-[10px] text-zinc-400 tabular-nums">
            {detail.fileCount}
          </span>
        </div>

        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-900/50 max-h-56 overflow-y-auto scrollbar-thin divide-y divide-zinc-100 dark:divide-zinc-800/60">
          {detail.files.map((file) => {
            const isHovered = isFileHovered(file.path);
            return (
              <div
                key={file.path}
                onClick={() => onSelectFile(file.path)}
                onMouseEnter={() => onHover(file.path)}
                onMouseLeave={() => onHover(null)}
                title={`${file.path} · ${file.lines} lines · in ${file.fanIn} · out ${file.fanOut}`}
                className={`px-2 py-1.5 flex items-center justify-between gap-2 font-mono text-[11px] cursor-pointer transition-colors ${
                  isHovered
                    ? "bg-zinc-200/80 dark:bg-zinc-800/80 text-zinc-950 dark:text-zinc-50 ring-1 ring-(--pg-accent)/60"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span
                    className="w-1.5 h-1.5 rounded-xs shrink-0"
                    style={{ backgroundColor: file.colorHex }}
                  />
                  <span className="truncate">{file.path}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-[10px] tabular-nums">
                  <span style={{ color: "var(--pg-in)" }}>in {file.fanIn}</span>
                  <span className="text-zinc-400">{file.lines}L</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function InsightsPanel({
  insights,
  isFileHovered,
  onSelectFile,
  onHover,
}: {
  insights: RepoInsights;
  isFileHovered: (path: string) => boolean;
  onSelectFile: (path: string) => void;
  onHover: (target: string | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <div className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 shrink-0">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="w-full h-8 px-3 flex items-center justify-between text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer font-mono text-[11px]"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">
              Insights
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-xs bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 tabular-nums">
              {insights.totalFindings}
            </span>
          </div>
          <span className="text-[10px] text-zinc-400">Expand ▴</span>
        </button>
      </div>
    );
  }

  return (
    <div className="h-80 flex flex-col border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/90 dark:bg-zinc-950/90 shrink-0 font-mono text-xs">
      {/* Panel header */}
      <div className="h-8 px-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-100/60 dark:bg-zinc-900/40">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            Insights
          </span>
          <span className="text-[10px] text-zinc-500 tabular-nums">
            {insights.totalFindings} findings
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-[10px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer"
        >
          Collapse ▾
        </button>
      </div>

      {/* Panel scrollable content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-thin text-[11px]">
        {/* 1. Files nothing imports (leads the list) */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {insights.zeroIn.title}
            </span>
            <span className="text-[10px] text-zinc-400 tabular-nums">
              {insights.zeroIn.count} files
            </span>
          </div>
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight">
            {insights.zeroIn.sentence}
          </div>
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-900/50 max-h-36 overflow-y-auto scrollbar-thin divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {insights.zeroIn.items.map((item) => {
              if (item.kind !== "file") return null;
              const isHovered = isFileHovered(item.path);
              const ext = extensionOf(item.path);
              return (
                <div
                  key={item.path}
                  onClick={() => onSelectFile(item.path)}
                  onMouseEnter={() => onHover(item.path)}
                  onMouseLeave={() => onHover(null)}
                  title={`${item.path} · ${item.lines} lines · out ${item.fanOut}`}
                  className={`px-2 py-1.5 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                    isHovered
                      ? "bg-zinc-200/80 dark:bg-zinc-800/80 text-zinc-950 dark:text-zinc-50 ring-1 ring-(--pg-accent)/60"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span
                      className="w-1.5 h-1.5 rounded-xs shrink-0"
                      style={{ backgroundColor: colorOf(ext) }}
                    />
                    <span className="truncate">{item.path}</span>
                  </div>
                  <span className="shrink-0 text-[10px] text-zinc-400 tabular-nums">
                    {item.metric}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. Unusual dependents */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {insights.unusualDependents.title}
            </span>
            <span className="text-[10px] text-zinc-400 tabular-nums">
              {insights.unusualDependents.count} files
            </span>
          </div>
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight">
            {insights.unusualDependents.sentence}
          </div>
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-900/50 max-h-36 overflow-y-auto scrollbar-thin divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {insights.unusualDependents.items.map((item) => {
              if (item.kind !== "file") return null;
              const isHovered = isFileHovered(item.path);
              const ext = extensionOf(item.path);
              return (
                <div
                  key={item.path}
                  onClick={() => onSelectFile(item.path)}
                  onMouseEnter={() => onHover(item.path)}
                  onMouseLeave={() => onHover(null)}
                  title={`${item.path} · imported by ${item.fanIn} files`}
                  className={`px-2 py-1.5 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                    isHovered
                      ? "bg-zinc-200/80 dark:bg-zinc-800/80 text-zinc-950 dark:text-zinc-50 ring-1 ring-(--pg-accent)/60"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span
                      className="w-1.5 h-1.5 rounded-xs shrink-0"
                      style={{ backgroundColor: colorOf(ext) }}
                    />
                    <span className="truncate">{item.path}</span>
                  </div>
                  <span
                    className="shrink-0 text-[10px] tabular-nums font-medium"
                    style={{ color: "var(--pg-in)" }}
                  >
                    {item.metric}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. Import cycles */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {insights.cycles.title}
            </span>
            <span className="text-[10px] text-zinc-400 tabular-nums">
              {insights.cycles.count} cycles
            </span>
          </div>
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight">
            {insights.cycles.sentence}
          </div>
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-900/50 max-h-36 overflow-y-auto scrollbar-thin divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {insights.cycles.items.length === 0 ? (
              <div className="p-2 text-[10px] text-zinc-400 italic">
                No import cycles detected
              </div>
            ) : (
              insights.cycles.items.map((item, idx) => {
                if (item.kind !== "cycle") return null;
                return (
                  <div
                    key={`${idx}-${item.label}`}
                    className="p-2 flex flex-col gap-1 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                  >
                    <div className="text-[10px] text-zinc-500 font-medium">
                      Cycle {idx + 1} ({item.path.length - 1} hops):
                    </div>
                    <div className="flex flex-wrap items-center gap-1 text-[10px]">
                      {item.path.map((step, sIdx) => {
                        const isHovered = isFileHovered(step);
                        const isLast = sIdx === item.path.length - 1;
                        return (
                          <React.Fragment key={`${sIdx}-${step}`}>
                            <button
                              type="button"
                              onClick={() => onSelectFile(step)}
                              onMouseEnter={() => onHover(step)}
                              onMouseLeave={() => onHover(null)}
                              className={`px-1 py-0.5 rounded-xs underline decoration-zinc-300 dark:decoration-zinc-700 hover:decoration-(--pg-accent) cursor-pointer truncate max-w-50 ${
                                isHovered
                                  ? "bg-zinc-200 dark:bg-zinc-800 text-(--pg-accent)"
                                  : "text-zinc-700 dark:text-zinc-300"
                              }`}
                              title={step}
                            >
                              {step}
                            </button>
                            {!isLast && (
                              <span className="text-zinc-400 dark:text-zinc-600">
                                →
                              </span>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 4. Oversized files */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {insights.oversized.title}
            </span>
            <span className="text-[10px] text-zinc-400 tabular-nums">
              {insights.oversized.count} files
            </span>
          </div>
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight">
            {insights.oversized.sentence}
          </div>
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-900/50 max-h-36 overflow-y-auto scrollbar-thin divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {insights.oversized.items.map((item) => {
              if (item.kind !== "file") return null;
              const isHovered = isFileHovered(item.path);
              const ext = extensionOf(item.path);
              return (
                <div
                  key={item.path}
                  onClick={() => onSelectFile(item.path)}
                  onMouseEnter={() => onHover(item.path)}
                  onMouseLeave={() => onHover(null)}
                  title={`${item.path} · ${item.lines} lines`}
                  className={`px-2 py-1.5 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                    isHovered
                      ? "bg-zinc-200/80 dark:bg-zinc-800/80 text-zinc-950 dark:text-zinc-50 ring-1 ring-(--pg-accent)/60"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span
                      className="w-1.5 h-1.5 rounded-xs shrink-0"
                      style={{ backgroundColor: colorOf(ext) }}
                    />
                    <span className="truncate">{item.path}</span>
                  </div>
                  <span className="shrink-0 text-[10px] text-zinc-400 tabular-nums">
                    {item.metric}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
