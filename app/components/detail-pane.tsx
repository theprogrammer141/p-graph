"use client";

import React, { useState } from "react";
import type { FileDetail, FolderDetail, RepoSummary } from "@/lib/graph/detail";
import type { SelectionTarget } from "./workspace-shell";
import type { Edge, FileNode } from "@/parser/types";
import type { RepoInsights } from "@/lib/graph/maths";
import { AskPanel } from "./ask-panel";
import { StructureTab } from "./detail/structure-tab";
import { ExplanationTab, type CachedExplanation } from "./detail/explanation-tab";
import { InsightsPanel } from "./detail/insights-panel";
import type { RouteItem } from "./detail/repo-summary-view";

export type { RouteItem, CachedExplanation };

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
  onReanalyse?: () => void;
  isReanalysing?: boolean;
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
  onReanalyse,
  isReanalysing,
}: DetailPaneProps) {
  const [paneMode, setPaneMode] = useState<"overview" | "ask">("overview");

  const isFileHovered = (path: string) => {
    if (!hoveredTarget) return false;
    if (hoveredTarget === path) return true;
    if (groupOfFile && groupOfFile(path) === hoveredTarget) return true;
    return false;
  };

  return (
    <aside
      data-testid="detail-pane"
      className="w-80 shrink-0 border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950 flex flex-col overflow-hidden text-xs select-none"
    >
      {/* Top bar switching between Overview and Ask */}
      <div className="h-9 px-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-50/40 dark:bg-zinc-900/20">
        <div className="flex items-center gap-1 font-mono text-[10px]">
          <button
            type="button"
            onClick={() => setPaneMode("overview")}
            data-testid="detail-tab-overview"
            className={`px-2.5 py-1 rounded-xs font-medium cursor-pointer transition-colors ${
              paneMode === "overview"
                ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs border border-zinc-200 dark:border-zinc-700"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setPaneMode("ask")}
            data-testid="detail-tab-ask"
            className={`px-2.5 py-1 rounded-xs font-medium cursor-pointer transition-colors ${
              paneMode === "ask"
                ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs border border-zinc-200 dark:border-zinc-700"
                : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            Ask
          </button>
        </div>

        {paneMode === "overview" && selection !== null && (
          <button
            type="button"
            onClick={onDeselect}
            data-testid="detail-deselect-btn"
            title="Deselect (return to repository summary)"
            className="px-1.5 py-0.5 rounded-xs font-mono text-[10px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 cursor-pointer"
          >
            Deselect ✕
          </button>
        )}
      </div>

      {paneMode === "overview" ? (
        <>
          {/* Secondary bar: Structure vs Explanation tabs */}
          <div className="h-8 px-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-100/50 dark:bg-zinc-900/40 font-mono text-[10px]">
            <div className="relative flex items-center p-0.5 rounded-xs bg-zinc-200/50 dark:bg-zinc-800/50">
              <div
                className="absolute top-0.5 bottom-0.5 rounded-xs bg-white dark:bg-zinc-900 shadow-xs border border-zinc-200/80 dark:border-zinc-700/80 transition-all duration-200 ease-out"
                style={{
                  left: activeTab === "structure" ? "2px" : "calc(50% + 1px)",
                  width: "calc(50% - 3px)",
                }}
              />
              <button
                type="button"
                onClick={() => onTabChange("structure")}
                data-testid="detail-tab-structure"
                className={`relative z-10 px-2 py-0.5 font-medium cursor-pointer transition-colors ${
                  activeTab === "structure"
                    ? "text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                Structure
              </button>
              <button
                type="button"
                onClick={() => onTabChange("explanation")}
                data-testid="detail-tab-explanation"
                className={`relative z-10 px-2 py-0.5 font-medium cursor-pointer transition-colors ${
                  activeTab === "explanation"
                    ? "text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                Explanation
              </button>
            </div>
            {selection?.kind === "file" && (
              <span className="text-zinc-400 dark:text-zinc-500 truncate max-w-[130px]" title={selection.path}>
                {selection.path}
              </span>
            )}
          </div>

          {/* Pane Content */}
          <div key={activeTab} className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 scrollbar-thin flex flex-col animate-[fadeIn_0.15s_ease-out]">
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
                onReanalyse={onReanalyse}
                isReanalysing={isReanalysing}
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
        </>
      ) : (
        <AskPanel
          analysisId={analysisId}
          repoName={repoSummary.name}
          selection={selection}
          onSelectFile={onSelectFile}
        />
      )}
    </aside>
  );
}
