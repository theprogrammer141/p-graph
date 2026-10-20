import React, { useState } from "react";
import type { RepoInsights } from "@/lib/graph/maths";
import { colorOf, extensionOf } from "@/lib/file-categories";

export function InsightsPanel({
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
