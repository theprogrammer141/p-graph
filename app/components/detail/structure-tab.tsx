import React from "react";
import type { FileDetail, FolderDetail, RepoSummary } from "@/lib/graph/detail";
import type { SelectionTarget } from "../workspace-shell";
import type { Edge } from "@/parser/types";
import { RepoSummaryView, type RouteItem } from "./repo-summary-view";
import { FileDetailView } from "./file-detail-view";
import { FolderDetailView } from "./folder-detail-view";

export interface StructureTabProps {
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
  onReanalyse?: () => void;
  isReanalysing?: boolean;
}

/** Selects the repository, file, or folder detail view for the current selection. */
export function StructureTab({
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
  onReanalyse,
  isReanalysing,
}: StructureTabProps) {
  if (selection === null) {
    return (
      <RepoSummaryView
        summary={repoSummary}
        routes={routes}
        isFileHovered={isFileHovered}
        onSelectFile={onSelectFile}
        onHover={onHover}
        onReanalyse={onReanalyse}
        isReanalysing={isReanalysing}
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
