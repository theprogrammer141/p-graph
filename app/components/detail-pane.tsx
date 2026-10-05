"use client";

import React from "react";
import type { FileDetail, FolderDetail, RepoSummary } from "@/lib/graph/detail";
import type { SelectionTarget } from "./workspace-shell";

interface DetailPaneProps {
  selection: SelectionTarget;
  repoSummary: RepoSummary;
  fileDetail: FileDetail | null;
  folderDetail: FolderDetail | null;
  activeTab: "structure" | "explanation";
  hoveredTarget: string | null;
  groupOfFile?: (path: string) => string | undefined;
  onTabChange: (tab: "structure" | "explanation") => void;
  onSelectFile: (path: string) => void;
  onDeselect: () => void;
  onHover: (target: string | null) => void;
}

export function DetailPane({
  selection,
  repoSummary,
  fileDetail,
  folderDetail,
  activeTab,
  hoveredTarget,
  groupOfFile,
  onTabChange,
  onSelectFile,
  onDeselect,
  onHover,
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
          <ExplanationTab selection={selection} />
        ) : (
          <StructureTab
            selection={selection}
            repoSummary={repoSummary}
            fileDetail={fileDetail}
            folderDetail={folderDetail}
            isFileHovered={isFileHovered}
            onSelectFile={onSelectFile}
            onHover={onHover}
          />
        )}
      </div>
    </aside>
  );
}

function ExplanationTab({ selection }: { selection: SelectionTarget }) {
  const targetLabel =
    selection === null
      ? "Repository"
      : selection.kind === "file"
      ? selection.path
      : selection.dir;

  return (
    <div className="p-4 flex flex-col gap-3 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
      <div className="flex items-center gap-1.5 text-zinc-800 dark:text-zinc-200 font-medium truncate">
        <span className="text-[10px] uppercase text-zinc-400 dark:text-zinc-500">
          Target:
        </span>
        <span className="truncate">{targetLabel}</span>
      </div>

      <div className="p-3 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xs bg-zinc-100/50 dark:bg-zinc-900/50">
        <p className="text-zinc-700 dark:text-zinc-300 font-medium">
          No explanation generated yet.
        </p>
        <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400 leading-normal">
          AI explanation is empty until configured with a model call in a later phase.
        </p>
      </div>
    </div>
  );
}

interface StructureTabProps {
  selection: SelectionTarget;
  repoSummary: RepoSummary;
  fileDetail: FileDetail | null;
  folderDetail: FolderDetail | null;
  isFileHovered: (path: string) => boolean;
  onSelectFile: (path: string) => void;
  onHover: (target: string | null) => void;
}

function StructureTab({
  selection,
  repoSummary,
  fileDetail,
  folderDetail,
  isFileHovered,
  onSelectFile,
  onHover,
}: StructureTabProps) {
  if (selection === null) {
    return (
      <RepoSummaryView
        summary={repoSummary}
        isFileHovered={isFileHovered}
        onSelectFile={onSelectFile}
        onHover={onHover}
      />
    );
  }

  if (selection.kind === "file" && fileDetail) {
    return (
      <FileDetailView
        detail={fileDetail}
        isFileHovered={isFileHovered}
        onSelectFile={onSelectFile}
        onHover={onHover}
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
      />
    );
  }

  return (
    <div className="p-3 font-mono text-[11px] text-zinc-400">
      Loading details...
    </div>
  );
}

function RepoSummaryView({
  summary,
  isFileHovered,
  onSelectFile,
  onHover,
}: {
  summary: RepoSummary;
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

function FileDetailView({
  detail,
  isFileHovered,
  onSelectFile,
  onHover,
}: {
  detail: FileDetail;
  isFileHovered: (path: string) => boolean;
  onSelectFile: (path: string) => void;
  onHover: (target: string | null) => void;
}) {
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
        </div>
      </div>

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
    </div>
  );
}

function FolderDetailView({
  detail,
  isFileHovered,
  onSelectFile,
  onHover,
}: {
  detail: FolderDetail;
  isFileHovered: (path: string) => boolean;
  onSelectFile: (path: string) => void;
  onHover: (target: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Folder header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-2.5">
        <div className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100 break-all select-text">
          {detail.dir === "." ? "(root)" : detail.dir}
        </div>
        <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-zinc-500">
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
