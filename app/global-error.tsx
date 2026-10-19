"use client";

import React, { useEffect } from "react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Root fallback boundary that handles critical failures in the root layout.
 * Renders its own HTML and body shell in the dense developer style.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("[p-graph][global-error]", error);
  }, [error]);

  return (
    <html lang="en" className="h-full">
      <body className="h-full flex flex-col items-center justify-center p-6 bg-zinc-50 dark:bg-zinc-950 font-mono text-xs text-zinc-900 dark:text-zinc-100">
        <div className="w-full max-w-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-xs p-5 shadow-2xs">
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-zinc-100 dark:border-zinc-800 text-[11px] uppercase tracking-wider text-rose-600 dark:text-rose-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Fatal Error
          </div>
          <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
            Application could not be initialized
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4 text-[11px]">
            A system error occurred at the layout level. Please refresh the page or try again.
          </p>
          {error.digest && (
            <div className="mb-4 text-[10px] text-zinc-500 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-2 rounded-xs select-all">
              Digest: {error.digest}
            </div>
          )}
          <button
            onClick={() => reset()}
            className="px-3 py-1.5 bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 text-[11px] font-medium rounded-xs hover:opacity-90 transition-opacity cursor-pointer"
          >
            Reload application
          </button>
        </div>
      </body>
    </html>
  );
}
