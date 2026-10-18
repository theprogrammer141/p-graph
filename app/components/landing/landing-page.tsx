"use client";

import React, { useEffect, useRef } from "react";
import { HeroForm } from "./hero-form";
import { Logo } from "../logo";
import { SpotlightCard } from "@/app/components/ui/spotlight-card";
import { DecryptedText } from "@/app/components/ui/decrypted-text";
import { animateEntrance } from "@/lib/animations/anime";
import {
  HeroIllustration,
  WhatItDoesIllustration,
  HowItWorksIllustration,
  FrameworksIllustration,
  WhatItDeliberatelyDoesntDoIllustration,
} from "./illustrations";

/**
 * The public marketing landing page rendered at root for signed-out visitors.
 * Follows dense developer-tool aesthetic: monospace accents, capped paragraph measures,
 * unlabelled inline SVG illustrations taking colors directly from the graph canvas tokens.
 * Enhanced with reactbits.dev interactive components (SpotlightCard, DecryptedText)
 * and anime.js staggered entry.
 */
export function LandingPage({ initialRepoUrl = "" }: { initialRepoUrl?: string }) {
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (heroRef.current) {
      const items = heroRef.current.querySelectorAll(".hero-reveal");
      if (items.length > 0) {
        animateEntrance(Array.from(items), {
          translateY: [12, 0],
          staggerMs: 60,
          duration: 500,
          ease: "outQuad",
        });
      }
    }
  }, []);

  return (
    <div className="w-full min-h-screen bg-background text-foreground flex flex-col">
      <main className="w-full max-w-285 mx-auto px-6 flex-1">
        {/* HERO SECTION */}
        <section
          ref={heroRef}
          className="min-h-[calc(100vh-2.75rem)] flex flex-col justify-center py-16 sm:py-24"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 items-center">
            <div className="lg:col-span-7">
              <div className="hero-reveal flex items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1">
                  <Logo className="w-4 h-4 text-zinc-900 dark:text-zinc-100" />
                  <span className="font-jetbrains text-xs font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                    -graph
                  </span>
                </span>
                <span className="text-zinc-300 dark:text-zinc-700 text-xs">/</span>
                <span className="font-mono text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
                  <DecryptedText text="codebase visualization" speed={30} />
                </span>
              </div>
              <h1 className="hero-reveal text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight leading-[1.1] text-zinc-900 dark:text-zinc-100 mb-5">
                See the shape of your codebase.
              </h1>
              <p className="hero-reveal text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed mb-8 max-w-[64ch]">
                Codebases routinely contain code nobody on the team has read. Paste a public GitHub
                repository to get a real dependency map: folders as boxes, imports as lines between
                them. Grounded in AST syntax parsing — no guessing, no approximate structure.
              </p>
              <div className="hero-reveal">
                <HeroForm initialRepoUrl={initialRepoUrl} />
              </div>
            </div>

            <div className="hero-reveal lg:col-span-5 w-full">
              <HeroIllustration className="max-w-120 mx-auto" />
            </div>
          </div>
        </section>

        {/* SECTION 1: WHAT THE THING DOES */}
        <section className="py-28 sm:py-32 border-t border-zinc-200 dark:border-zinc-800">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 items-center">
            <div className="lg:col-span-6">
              <div className="font-mono text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium mb-3">
                <DecryptedText text="Capabilities" speed={40} />
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight leading-[1.1] text-zinc-900 dark:text-zinc-100 mb-6">
                Folders as boxes. Imports as lines.
              </h2>
              <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4 max-w-[46ch]">
                Folders collapse into bounded boxes; files expand into nodes. Select any file to inspect
                its fan-in and fan-out immediately.
              </p>
              <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4 max-w-[46ch]">
                Blast radius and dependency chains calculate as pure arithmetic over the edge list.
                See exactly what breaks two levels out if a module changes — instantly, in your browser.
              </p>
              <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-[46ch]">
                Ask for an explanation and get a grounded summary written strictly from that file and
                its real neighbours. If an import was skipped or unresolved, coverage reports it loudly.
              </p>
            </div>

            <div className="lg:col-span-6 w-full">
              <WhatItDoesIllustration className="max-w-120 mx-auto" />
            </div>
          </div>
        </section>

        {/* SECTION 2: HOW IT WORKS */}
        <section className="py-28 sm:py-32 border-t border-zinc-200 dark:border-zinc-800">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 items-center">
            <div className="lg:col-span-6 order-2 lg:order-1 w-full">
              <HowItWorksIllustration className="max-w-120 mx-auto" />
            </div>

            <div className="lg:col-span-6 order-1 lg:order-2">
              <div className="font-mono text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium mb-3">
                <DecryptedText text="Architecture" speed={40} />
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight leading-[1.1] text-zinc-900 dark:text-zinc-100 mb-6">
                Every box and line comes from really parsing the code.
              </h2>
              <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4 max-w-[46ch]">
                The parser runs standalone via ts-morph. It parses every import, re-export, dynamic
                import, and require() call to real files on disk.
              </p>
              <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4 max-w-[46ch]">
                If an import cannot be resolved, it is reported with an exact reason — never guessed.
                Absent beats approximate.
              </p>
              <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-[46ch]">
                The AI explains what the parser discovered. It never decides whether two files are
                connected, and it never walks the graph when arithmetic can do it instead. Every AI
                response is cached in Postgres and traced with LangSmith.
              </p>
            </div>
          </div>
        </section>

        {/* SECTION 3: WHICH FRAMEWORKS IT UNDERSTANDS */}
        <section className="py-28 sm:py-32 border-t border-zinc-200 dark:border-zinc-800">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 items-center">
            <div className="lg:col-span-6">
              <div className="font-mono text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium mb-3">
                <DecryptedText text="Compatibility" speed={40} />
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight leading-[1.1] text-zinc-900 dark:text-zinc-100 mb-6">
                Framework knowledge lives in adapters, not in the parser.
              </h2>
              <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4 max-w-[46ch]">
                An if-statement checking for Next.js conventions inside parsing code means the
                abstraction has failed. Framework rules live in modular adapters that map conventions
                to standard dependency nodes.
              </p>
              <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4 max-w-[46ch]">
                Next.js: App Router and Pages Router conventions — server components, client
                components, layouts, route handlers, and server actions are recognized by structure.
              </p>
              <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-[46ch]">
                React &amp; Modern TypeScript: custom hooks, context providers, tsconfig path aliases
                (@/*), and barrel re-exports resolve cleanly to canonical targets.
              </p>
            </div>

            <div className="lg:col-span-6 w-full">
              <FrameworksIllustration className="max-w-120 mx-auto" />
            </div>
          </div>
        </section>

        {/* SECTION 4: WHAT IT DELIBERATELY DOESN'T DO */}
        <section className="py-28 sm:py-32 border-t border-zinc-200 dark:border-zinc-800">
          <div className="font-mono text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium mb-3">
            <DecryptedText text="Principles" speed={40} />
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight leading-[1.1] text-zinc-900 dark:text-zinc-100 mb-4">
            What we deliberately don&apos;t do.
          </h2>
          <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed mb-12 max-w-[64ch]">
            Every codebase tool drifts toward becoming a code reviewer or letting an LLM guess
            structure. We refuse both. A dependency graph that is ninety percent right is worse
            than no graph, because you cannot tell which ten percent is wrong.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 items-start">
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SpotlightCard className="p-4 bg-zinc-50/50 dark:bg-zinc-900/40">
                <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 mb-1.5">
                  No scores or badges
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  This product explains a codebase; it does not review one. Once there&apos;s a grade,
                  teams argue about the score instead of inspecting the map.
                </p>
              </SpotlightCard>

              <SpotlightCard className="p-4 bg-zinc-50/50 dark:bg-zinc-900/40">
                <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 mb-1.5">
                  No approximate routes
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  If a file or route cannot be recovered from syntax, we show nothing. Absent beats
                  approximate. No invented connections.
                </p>
              </SpotlightCard>

              <SpotlightCard className="p-4 bg-zinc-50/50 dark:bg-zinc-900/40">
                <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 mb-1.5">
                  No AI graph walks
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  The model never walks the repository when arithmetic can do it. Graph arithmetic
                  traces paths; AI explains the code.
                </p>
              </SpotlightCard>

              <SpotlightCard className="p-4 bg-zinc-50/50 dark:bg-zinc-900/40">
                <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 mb-1.5">
                  No stored tokens
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Sign-in provides identity and organization isolation only. We store no repository
                  tokens. Public repositories only.
                </p>
              </SpotlightCard>
            </div>

            <div className="lg:col-span-5 w-full">
              <WhatItDeliberatelyDoesntDoIllustration className="max-w-115 mx-auto" />
            </div>
          </div>
        </section>
      </main>

      {/* QUIET FOOTER */}
      <footer className="w-full border-t border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/50">
        <div className="max-w-285 mx-auto px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs font-mono text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1">
              <Logo className="w-3.5 h-3.5 text-zinc-900 dark:text-zinc-100" />
              <span className="font-jetbrains text-xs font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                -graph
              </span>
            </span>
            <span className="text-zinc-400 dark:text-zinc-600">/</span>
            <span>Deterministic codebase visualization</span>
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Next.js 16 · ts-morph · React Flow · Clerk · Supabase
          </div>
        </div>
      </footer>
    </div>
  );
}
