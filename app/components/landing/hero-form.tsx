"use client";

import React, { useActionState, useState } from "react";
import { submitHeroAction, type ActionState } from "@/app/actions/analysis";

/**
 * Hero repository submission form for the landing page.
 * Submits straight into the analysis flow: redirects to sign-in if unauthenticated,
 * which then preserves the repository URL and creates the analysis upon return.
 */
export function HeroForm({ initialRepoUrl = "" }: { initialRepoUrl?: string }) {
  const [state, formAction, isPending] = useActionState<ActionState | null, FormData>(
    submitHeroAction,
    null,
  );
  const [value, setValue] = useState(initialRepoUrl);

  return (
    <div className="w-full max-w-xl">
      <form action={formAction} className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1 min-w-0">
          <label htmlFor="heroRepoUrl" className="sr-only">
            GitHub repository URL
          </label>
          <input
            id="heroRepoUrl"
            name="repoUrl"
            type="text"
            required
            disabled={isPending}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://github.com/owner/repository"
            className="w-full px-3.5 py-2.5 font-mono text-xs sm:text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 transition-colors shadow-xs"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="px-5 py-2.5 font-mono text-xs sm:text-sm font-semibold bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 rounded-xs hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 transition-colors cursor-pointer shrink-0"
        >
          {isPending ? "Starting..." : "Analyse"}
        </button>
      </form>

      {state?.error && (
        <div className="mt-2.5 font-mono text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 px-3 py-1.5 rounded-xs">
          {state.error}
        </div>
      )}

      <p className="mt-2 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
        Public TypeScript &amp; JavaScript repositories. AST parsing, zero guessing.
      </p>
    </div>
  );
}
