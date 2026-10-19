import React from "react";
import Link from "next/link";

/**
 * Clean developer-styled 404 page for missing pages or inaccessible analyses.
 */
export default function NotFound() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center p-6 bg-zinc-50/50 dark:bg-zinc-950/50 text-xs">
      <div className="w-full max-w-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-xs shadow-2xs p-5">
        <div className="flex items-center gap-2 mb-2 pb-2.5 border-b border-zinc-100 dark:border-zinc-800">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500" />
          <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
            404 Not Found
          </span>
        </div>

        <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1.5">
          Analysis or page not found
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4 text-[11px]">
          The requested page does not exist, or this repository analysis is not accessible within your current organization.
        </p>

        <div className="flex items-center gap-2 font-mono text-[11px]">
          <Link
            href="/"
            className="px-3 py-1.5 bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 font-medium rounded-xs hover:bg-zinc-800 dark:hover:bg-zinc-200 active:scale-[0.98] transition-all"
          >
            Return to workspace
          </Link>
        </div>
      </div>
    </main>
  );
}
