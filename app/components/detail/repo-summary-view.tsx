import React from "react";
import type { RepoSummary } from "@/lib/graph/detail";
import { SpotlightCard } from "@/app/components/ui/spotlight-card";
import { CountUp } from "@/app/components/ui/count-up";
import { MethodBadge } from "./method-badge";

export interface RouteItem {
  readonly id?: string;
  readonly filePath: string;
  readonly method: string;
  readonly path: string;
}

export function RepoSummaryView({
  summary,
  routes,
  isFileHovered,
  onSelectFile,
  onHover,
  onReanalyse,
  isReanalysing,
}: {
  summary: RepoSummary;
  routes: readonly RouteItem[];
  isFileHovered: (path: string) => boolean;
  onSelectFile: (path: string) => void;
  onHover: (target: string | null) => void;
  onReanalyse?: () => void;
  isReanalysing?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Repository identity & framework */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
            {summary.name}
          </div>
          {onReanalyse && (
            <button
              type="button"
              onClick={onReanalyse}
              disabled={isReanalysing}
              className="px-2 py-0.5 rounded-xs border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-mono text-[10px] cursor-pointer disabled:opacity-50 transition-colors shrink-0"
              title="Re-analyse this repository"
            >
              {isReanalysing ? "Re-analysing..." : "Re-analyse"}
            </button>
          )}
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
        <SpotlightCard className="p-2 bg-white dark:bg-zinc-900/60" spotlightSize={200}>
          <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase">
            Files
          </div>
          <div className="text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
            <CountUp to={summary.fileCount} duration={600} />
          </div>
        </SpotlightCard>

        <SpotlightCard className="p-2 bg-white dark:bg-zinc-900/60" spotlightSize={200}>
          <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase">
            Imports
          </div>
          <div className="text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
            <CountUp to={summary.importCount} duration={600} />
          </div>
        </SpotlightCard>

        <SpotlightCard className="p-2 bg-white dark:bg-zinc-900/60" spotlightSize={200}>
          <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase">
            Routes
          </div>
          <div className="text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
            <CountUp to={summary.routeCount} duration={600} />
          </div>
        </SpotlightCard>

        <SpotlightCard
          className="p-2 bg-white dark:bg-zinc-900/60"
          spotlightSize={200}
          title="Files that could not be identified by framework or naming conventions"
        >
          <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase">
            No convention
          </div>
          <div className="text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
            <CountUp to={summary.unidentifiedCount} duration={600} />
          </div>
        </SpotlightCard>
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
