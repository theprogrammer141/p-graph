"use client";

import React, { useActionState, useState } from "react";
import { submitRepoAction, type ActionState } from "@/app/actions/analysis";
import { BorderTrail } from "@/app/components/ui/border-trail";
import { ClickSpark } from "@/app/components/ui/click-spark";

/** Submits a GitHub repository URL and displays pending state or server action errors. */
export function AnalysisForm({ initialRepoUrl = "" }: { initialRepoUrl?: string }) {
  const [state, formAction, isPending] = useActionState<ActionState | null, FormData>(
    submitRepoAction,
    null,
  );
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className="mb-6">
      <form action={formAction} className="flex flex-col sm:flex-row gap-2 max-w-xl">
        <div className="relative flex-1 min-w-0 rounded-xs">
          <label htmlFor="repoUrl" className="sr-only">
            GitHub repository URL
          </label>
          <input
            id="repoUrl"
            name="repoUrl"
            type="text"
            required
            disabled={isPending}
            defaultValue={initialRepoUrl}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="https://github.com/owner/repository"
            className="w-full px-3 py-1.5 font-mono text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 transition-colors"
          />
          {(isFocused || isPending) && (
            <BorderTrail size={25} duration={3} color="rgba(37, 99, 235, 0.85)" />
          )}
        </div>
        <ClickSpark sparkColor="#3b82f6" sparkRadius={24} sparkCount={12}>
          <button
            type="submit"
            disabled={isPending}
            className="w-full sm:w-auto px-3.5 py-1.5 font-mono text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 rounded-xs hover:bg-zinc-800 dark:hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-50 transition-all cursor-pointer shrink-0"
          >
            {isPending ? "Starting..." : "Analyse"}
          </button>
        </ClickSpark>
      </form>

      {state?.error && (
        <div className="mt-2 font-mono text-[11px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 px-2.5 py-1 rounded-xs max-w-xl">
          {state.error}
        </div>
      )}
    </div>
  );
}
