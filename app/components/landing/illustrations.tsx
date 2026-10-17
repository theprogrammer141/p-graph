import React from "react";

/**
 * Shared SVG defs for directional graph markers and patterns.
 * Colors strictly follow the canvas tokens (--pg-accent, --pg-in, --pg-out, --pg-edge).
 */
function CommonDefs() {
  return (
    <defs>
      <pattern id="canvas-grid-pattern" width="16" height="16" patternUnits="userSpaceOnUse">
        <circle cx="1.5" cy="1.5" r="1" className="fill-zinc-300/40 dark:fill-zinc-700/40" />
      </pattern>
      <marker
        id="marker-arrow-in"
        viewBox="0 0 6 6"
        refX="5"
        refY="3"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 0.5 L 6 3 L 0 5.5 z" fill="var(--pg-in)" />
      </marker>
      <marker
        id="marker-arrow-out"
        viewBox="0 0 6 6"
        refX="5"
        refY="3"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 0.5 L 6 3 L 0 5.5 z" fill="var(--pg-out)" />
      </marker>
      <marker
        id="marker-arrow-edge"
        viewBox="0 0 6 6"
        refX="5"
        refY="3"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 0.5 L 6 3 L 0 5.5 z" fill="var(--pg-edge)" />
      </marker>
      <marker
        id="marker-arrow-accent"
        viewBox="0 0 6 6"
        refX="5"
        refY="3"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 0.5 L 6 3 L 0 5.5 z" fill="var(--pg-accent)" />
      </marker>
    </defs>
  );
}

/**
 * Hero Illustration:
 * An unlabelled, drawn schematic of folders containing nodes and directed edges.
 * One central node is active, showing incoming (green) and outgoing (amber) connections.
 */
export function HeroIllustration({ className = "" }: { className?: string }) {
  return (
    <div className={`relative w-full border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-950 p-2 sm:p-3 overflow-hidden ${className}`}>
      <svg
        viewBox="0 0 520 340"
        className="w-full h-auto block"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <CommonDefs />
        {/* Canvas background pattern */}
        <rect width="520" height="340" fill="url(#canvas-grid-pattern)" />

        {/* Folder Container Left */}
        <rect
          x="28"
          y="28"
          width="216"
          height="284"
          rx="4"
          className="fill-zinc-50/70 dark:fill-zinc-900/40 stroke-zinc-200 dark:stroke-zinc-800"
          strokeWidth="1"
        />
        {/* Folder Tab Header */}
        <path
          d="M 28 44 L 28 32 Q 28 28 32 28 L 96 28 Q 100 28 104 34 L 112 44 Z"
          className="fill-zinc-100 dark:fill-zinc-800/80 stroke-zinc-200 dark:stroke-zinc-800"
          strokeWidth="1"
        />
        {/* Folder icon & status bar silhouette */}
        <rect x="42" y="34" width="20" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-650" />
        <rect x="68" y="34" width="34" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-650" />

        {/* Nodes inside Left Folder */}
        {/* Node L1 */}
        <g transform="translate(48, 68)">
          <rect
            width="176"
            height="34"
            rx="3"
            className="fill-white dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-700/80"
            strokeWidth="1"
          />
          <rect x="10" y="11" width="3" height="12" rx="1.5" className="fill-zinc-400 dark:fill-zinc-500" />
          <rect x="22" y="15" width="70" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
          <rect x="100" y="15" width="28" height="4" rx="2" className="fill-zinc-200 dark:fill-zinc-700" />
        </g>

        {/* Node L2 (Sources incoming edge) */}
        <g transform="translate(48, 132)">
          <rect
            width="176"
            height="34"
            rx="3"
            className="fill-white dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-700/80"
            strokeWidth="1"
          />
          <rect x="10" y="11" width="3" height="12" rx="1.5" fill="var(--pg-in)" />
          <rect x="22" y="15" width="84" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
          <rect x="114" y="15" width="36" height="4" rx="2" className="fill-zinc-200 dark:fill-zinc-700" />
          {/* Handle right */}
          <circle cx="176" cy="17" r="2.5" fill="var(--pg-in)" />
        </g>

        {/* Node L3 */}
        <g transform="translate(48, 196)">
          <rect
            width="176"
            height="34"
            rx="3"
            className="fill-white dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-700/80"
            strokeWidth="1"
          />
          <rect x="10" y="11" width="3" height="12" rx="1.5" className="fill-zinc-400 dark:fill-zinc-500" />
          <rect x="22" y="15" width="56" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
        </g>

        {/* Folder Container Right */}
        <rect
          x="276"
          y="28"
          width="216"
          height="284"
          rx="4"
          className="fill-zinc-50/70 dark:fill-zinc-900/40 stroke-zinc-200 dark:stroke-zinc-800"
          strokeWidth="1"
        />
        {/* Folder Tab Header */}
        <path
          d="M 276 44 L 276 32 Q 276 28 280 28 L 344 28 Q 348 28 352 34 L 360 44 Z"
          className="fill-zinc-100 dark:fill-zinc-800/80 stroke-zinc-200 dark:stroke-zinc-800"
          strokeWidth="1"
        />
        <rect x="290" y="34" width="20" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-650" />
        <rect x="316" y="34" width="34" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-650" />

        {/* Nodes inside Right Folder */}
        {/* Node R1 */}
        <g transform="translate(296, 68)">
          <rect
            width="176"
            height="34"
            rx="3"
            className="fill-white dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-700/80"
            strokeWidth="1"
          />
          <rect x="10" y="11" width="3" height="12" rx="1.5" className="fill-zinc-400 dark:fill-zinc-500" />
          <rect x="22" y="15" width="76" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
        </g>

        {/* Node R2 (ACTIVE SELECTED NODE) */}
        <g transform="translate(296, 132)">
          <rect
            width="176"
            height="34"
            rx="3"
            className="fill-white dark:fill-zinc-900"
            stroke="var(--pg-accent)"
            strokeWidth="1.75"
          />
          <rect x="10" y="11" width="3" height="12" rx="1.5" fill="var(--pg-accent)" />
          <rect x="22" y="15" width="92" height="4" rx="2" fill="var(--pg-accent)" opacity="0.8" />
          <rect x="122" y="15" width="30" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
          {/* Handles */}
          <circle cx="0" cy="17" r="2.5" fill="var(--pg-in)" />
          <circle cx="176" cy="17" r="2.5" fill="var(--pg-out)" />
        </g>

        {/* Node R3 (Receives outgoing edge) */}
        <g transform="translate(296, 216)">
          <rect
            width="176"
            height="34"
            rx="3"
            className="fill-white dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-700/80"
            strokeWidth="1"
          />
          <rect x="10" y="11" width="3" height="12" rx="1.5" fill="var(--pg-out)" />
          <rect x="22" y="15" width="64" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
          <rect x="94" y="15" width="40" height="4" rx="2" className="fill-zinc-200 dark:fill-zinc-700" />
          {/* Handle left */}
          <circle cx="0" cy="17" r="2.5" fill="var(--pg-out)" />
        </g>

        {/* Connection Edges */}
        {/* Neutral edge between L1 and R1 */}
        <path
          d="M 224 85 C 250 85, 270 85, 296 85"
          stroke="var(--pg-edge)"
          strokeWidth="1.25"
          strokeDasharray="none"
          markerEnd="url(#marker-arrow-edge)"
        />

        {/* Neutral edge between L2 and L3 */}
        <path
          d="M 136 166 C 136 178, 136 182, 136 196"
          stroke="var(--pg-edge)"
          strokeWidth="1.25"
          markerEnd="url(#marker-arrow-edge)"
        />

        {/* Incoming edge: L2 -> R2 (Green / in) */}
        <path
          d="M 224 149 C 252 149, 268 149, 296 149"
          stroke="var(--pg-in)"
          strokeWidth="1.75"
          markerEnd="url(#marker-arrow-in)"
        />

        {/* Outgoing edge: R2 -> R3 (Amber / out, curved back into R3) */}
        <path
          d="M 472 149 C 504 149, 504 233, 472 233 L 472 233"
          stroke="var(--pg-out)"
          strokeWidth="1.75"
          markerEnd="url(#marker-arrow-out)"
        />
      </svg>
    </div>
  );
}

/**
 * Section 1 Illustration:
 * What it does: Blast radius and fan-in / fan-out arithmetic.
 * Focus node, incoming callers in green, outgoing in amber, and 2nd-degree blast radius perimeter.
 */
export function WhatItDoesIllustration({ className = "" }: { className?: string }) {
  return (
    <div className={`relative w-full border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-950 p-2 sm:p-3 overflow-hidden ${className}`}>
      <svg
        viewBox="0 0 480 320"
        className="w-full h-auto block"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <CommonDefs />
        <rect width="480" height="320" fill="url(#canvas-grid-pattern)" />

        {/* 2-Hop Blast Radius dashed perimeter */}
        <rect
          x="18"
          y="18"
          width="444"
          height="284"
          rx="6"
          stroke="var(--pg-accent)"
          strokeWidth="1"
          strokeDasharray="4 4"
          opacity="0.35"
        />
        {/* Blast radius badge silhouette */}
        <rect x="28" y="26" width="48" height="14" rx="2" className="fill-zinc-100 dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="1" />
        <circle cx="36" cy="33" r="2" fill="var(--pg-accent)" />
        <rect x="42" y="31" width="24" height="4" rx="2" fill="var(--pg-accent)" opacity="0.7" />

        {/* UPSTREAM CALLERS (LEFT - FAN-IN) */}
        {/* Node In 1 */}
        <g transform="translate(36, 76)">
          <rect width="112" height="32" rx="3" className="fill-white dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-700/80" strokeWidth="1" />
          <rect x="8" y="10" width="3" height="12" rx="1.5" fill="var(--pg-in)" />
          <rect x="18" y="14" width="54" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
        </g>

        {/* Node In 2 */}
        <g transform="translate(36, 144)">
          <rect width="112" height="32" rx="3" className="fill-white dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-700/80" strokeWidth="1" />
          <rect x="8" y="10" width="3" height="12" rx="1.5" fill="var(--pg-in)" />
          <rect x="18" y="14" width="68" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
        </g>

        {/* 2nd degree upstream caller */}
        <g transform="translate(36, 216)">
          <rect width="112" height="32" rx="3" className="fill-white dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-700/80" strokeWidth="1" strokeDasharray="2 2" />
          <rect x="8" y="10" width="3" height="12" rx="1.5" fill="var(--pg-in)" opacity="0.6" />
          <rect x="18" y="14" width="48" height="4" rx="2" className="fill-zinc-200 dark:fill-zinc-700" />
        </g>

        {/* 2nd degree edge to In 2 */}
        <path
          d="M 92 216 C 92 198, 92 190, 92 176"
          stroke="var(--pg-in)"
          strokeWidth="1.25"
          strokeDasharray="3 3"
          opacity="0.6"
          markerEnd="url(#marker-arrow-in)"
        />

        {/* CENTER TARGET NODE */}
        <g transform="translate(182, 110)">
          <rect
            width="128"
            height="44"
            rx="4"
            className="fill-white dark:fill-zinc-900"
            stroke="var(--pg-accent)"
            strokeWidth="2"
          />
          <rect x="10" y="14" width="4" height="16" rx="2" fill="var(--pg-accent)" />
          <rect x="22" y="16" width="72" height="5" rx="2" fill="var(--pg-accent)" opacity="0.9" />
          <rect x="22" y="25" width="44" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
          <circle cx="0" cy="22" r="3" fill="var(--pg-in)" />
          <circle cx="128" cy="22" r="3" fill="var(--pg-out)" />
        </g>

        {/* DOWNSTREAM DEPENDENCIES (RIGHT - FAN-OUT) */}
        {/* Node Out 1 */}
        <g transform="translate(344, 76)">
          <rect width="112" height="32" rx="3" className="fill-white dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-700/80" strokeWidth="1" />
          <rect x="8" y="10" width="3" height="12" rx="1.5" fill="var(--pg-out)" />
          <rect x="18" y="14" width="58" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
        </g>

        {/* Node Out 2 */}
        <g transform="translate(344, 154)">
          <rect width="112" height="32" rx="3" className="fill-white dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-700/80" strokeWidth="1" />
          <rect x="8" y="10" width="3" height="12" rx="1.5" fill="var(--pg-out)" />
          <rect x="18" y="14" width="74" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
        </g>

        {/* CONNECTING EDGES */}
        {/* In 1 -> Center */}
        <path
          d="M 148 92 C 164 92, 168 132, 182 132"
          stroke="var(--pg-in)"
          strokeWidth="1.75"
          markerEnd="url(#marker-arrow-in)"
        />
        {/* In 2 -> Center */}
        <path
          d="M 148 160 C 164 160, 168 132, 182 132"
          stroke="var(--pg-in)"
          strokeWidth="1.75"
          markerEnd="url(#marker-arrow-in)"
        />

        {/* Center -> Out 1 */}
        <path
          d="M 310 132 C 326 132, 330 92, 344 92"
          stroke="var(--pg-out)"
          strokeWidth="1.75"
          markerEnd="url(#marker-arrow-out)"
        />
        {/* Center -> Out 2 */}
        <path
          d="M 310 132 C 326 132, 330 170, 344 170"
          stroke="var(--pg-out)"
          strokeWidth="1.75"
          markerEnd="url(#marker-arrow-out)"
        />

        {/* Bottom Arithmetic Metrics Bar */}
        <g transform="translate(140, 260)">
          <rect width="210" height="26" rx="3" className="fill-zinc-100 dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="1" />
          {/* Fan-in indicator */}
          <circle cx="22" cy="13" r="3" fill="var(--pg-in)" />
          <rect x="30" y="11" width="28" height="4" rx="2" className="fill-zinc-400 dark:fill-zinc-500" />
          {/* Separator */}
          <line x1="72" y1="6" x2="72" y2="20" className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="1" />
          {/* Fan-out indicator */}
          <circle cx="92" cy="13" r="3" fill="var(--pg-out)" />
          <rect x="100" y="11" width="28" height="4" rx="2" className="fill-zinc-400 dark:fill-zinc-500" />
          {/* Separator */}
          <line x1="142" y1="6" x2="142" y2="20" className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="1" />
          {/* Blast radius indicator */}
          <circle cx="162" cy="13" r="3" fill="var(--pg-accent)" />
          <rect x="170" y="11" width="26" height="4" rx="2" className="fill-zinc-400 dark:fill-zinc-500" />
        </g>
      </svg>
    </div>
  );
}

/**
 * Section 2 Illustration:
 * How it works: AST parsing -> Pure graph arithmetic -> Grounded AI explanation.
 * Shows verified pipeline with deterministic data flow.
 */
export function HowItWorksIllustration({ className = "" }: { className?: string }) {
  return (
    <div className={`relative w-full border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-950 p-2 sm:p-3 overflow-hidden ${className}`}>
      <svg
        viewBox="0 0 480 320"
        className="w-full h-auto block"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <CommonDefs />
        <rect width="480" height="320" fill="url(#canvas-grid-pattern)" />

        {/* STAGE 1: Real AST Parser (Left) */}
        <g transform="translate(24, 40)">
          <rect width="124" height="236" rx="4" className="fill-zinc-50/80 dark:fill-zinc-900/40 stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="1" />
          {/* Card header */}
          <rect x="14" y="14" width="56" height="5" rx="2" className="fill-zinc-400 dark:fill-zinc-500" />
          <line x1="14" y1="28" x2="110" y2="28" className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="1" />

          {/* AST Branch structure */}
          {/* Root node */}
          <circle cx="62" cy="50" r="4" fill="var(--pg-accent)" />
          <line x1="62" y1="54" x2="40" y2="84" className="stroke-zinc-300 dark:stroke-zinc-700" strokeWidth="1.25" />
          <line x1="62" y1="54" x2="84" y2="84" className="stroke-zinc-300 dark:stroke-zinc-700" strokeWidth="1.25" />

          {/* Child 1 */}
          <circle cx="40" cy="84" r="3.5" className="fill-zinc-300 dark:fill-zinc-600" />
          <line x1="40" y1="88" x2="28" y2="120" className="stroke-zinc-300 dark:stroke-zinc-700" strokeWidth="1.25" />
          <line x1="40" y1="88" x2="52" y2="120" className="stroke-zinc-300 dark:stroke-zinc-700" strokeWidth="1.25" />

          {/* Child 2 */}
          <circle cx="84" cy="84" r="3.5" className="fill-zinc-300 dark:fill-zinc-600" />
          <line x1="84" y1="88" x2="84" y2="120" className="stroke-zinc-300 dark:stroke-zinc-700" strokeWidth="1.25" />

          {/* Leaves */}
          <circle cx="28" cy="120" r="2.5" fill="var(--pg-in)" />
          <circle cx="52" cy="120" r="2.5" fill="var(--pg-out)" />
          <circle cx="84" cy="120" r="2.5" fill="var(--pg-edge)" />

          {/* Resolved import tokens */}
          <rect x="14" y="148" width="96" height="22" rx="2" className="fill-white dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-700/80" strokeWidth="1" />
          <circle cx="24" cy="159" r="2" fill="var(--pg-in)" />
          <rect x="32" y="157" width="56" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />

          <rect x="14" y="178" width="96" height="22" rx="2" className="fill-white dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-700/80" strokeWidth="1" />
          <circle cx="24" cy="189" r="2" fill="var(--pg-out)" />
          <rect x="32" y="187" width="48" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />

          <rect x="14" y="208" width="96" height="14" rx="2" className="fill-zinc-100 dark:fill-zinc-800/80" />
          <rect x="22" y="213" width="40" height="4" rx="2" className="fill-zinc-400 dark:fill-zinc-500" />
        </g>

        {/* Pipeline Arrow 1 -> 2 */}
        <path
          d="M 148 158 L 176 158"
          stroke="var(--pg-edge)"
          strokeWidth="1.5"
          markerEnd="url(#marker-arrow-edge)"
        />

        {/* STAGE 2: Pure Graph Arithmetic (Middle) */}
        <g transform="translate(178, 40)">
          <rect width="124" height="236" rx="4" className="fill-zinc-50/80 dark:fill-zinc-900/40 stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="1" />
          <rect x="14" y="14" width="64" height="5" rx="2" className="fill-zinc-400 dark:fill-zinc-500" />
          <line x1="14" y1="28" x2="110" y2="28" className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="1" />

          {/* Adjacency matrix grid / graph arithmetic */}
          <rect x="18" y="48" width="88" height="88" rx="2" className="fill-white dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-700/80" strokeWidth="1" />
          <line x1="18" y1="70" x2="106" y2="70" className="stroke-zinc-100 dark:stroke-zinc-800" strokeWidth="1" />
          <line x1="18" y1="92" x2="106" y2="92" className="stroke-zinc-100 dark:stroke-zinc-800" strokeWidth="1" />
          <line x1="47" y1="48" x2="47" y2="136" className="stroke-zinc-100 dark:stroke-zinc-800" strokeWidth="1" />
          <line x1="76" y1="48" x2="76" y2="136" className="stroke-zinc-100 dark:stroke-zinc-800" strokeWidth="1" />

          {/* Matrix entries */}
          <circle cx="32" cy="59" r="2.5" fill="var(--pg-in)" />
          <circle cx="61" cy="81" r="2.5" fill="var(--pg-accent)" />
          <circle cx="91" cy="103" r="2.5" fill="var(--pg-out)" />
          <circle cx="91" cy="59" r="2" className="fill-zinc-300 dark:fill-zinc-650" />
          <circle cx="32" cy="103" r="2" className="fill-zinc-300 dark:fill-zinc-650" />

          {/* Deterministic calculation metrics */}
          <rect x="18" y="152" width="88" height="24" rx="2" className="fill-white dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-700/80" strokeWidth="1" />
          <rect x="28" y="162" width="30" height="4" rx="2" fill="var(--pg-accent)" opacity="0.8" />
          <rect x="68" y="162" width="26" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />

          <rect x="18" y="184" width="88" height="24" rx="2" className="fill-white dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-700/80" strokeWidth="1" />
          <rect x="28" y="194" width="40" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
          <rect x="76" y="194" width="18" height="4" rx="2" fill="var(--pg-in)" opacity="0.8" />
        </g>

        {/* Pipeline Arrow 2 -> 3 */}
        <path
          d="M 302 158 L 330 158"
          stroke="var(--pg-edge)"
          strokeWidth="1.5"
          markerEnd="url(#marker-arrow-edge)"
        />

        {/* STAGE 3: Grounded AI Explanation (Right) */}
        <g transform="translate(332, 40)">
          <rect width="124" height="236" rx="4" className="fill-zinc-50/80 dark:fill-zinc-900/40 stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="1" />
          <rect x="14" y="14" width="68" height="5" rx="2" className="fill-zinc-400 dark:fill-zinc-500" />
          <line x1="14" y1="28" x2="110" y2="28" className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="1" />

          {/* Explanation paragraph silhouette */}
          <rect x="16" y="46" width="92" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
          <rect x="16" y="56" width="86" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
          <rect x="16" y="66" width="78" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
          <rect x="16" y="76" width="60" height="4" rx="2" className="fill-zinc-200 dark:fill-zinc-700" />

          {/* Grounded reference badges */}
          <rect x="16" y="96" width="92" height="30" rx="2" className="fill-white dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-700/80" strokeWidth="1" />
          <circle cx="26" cy="111" r="2.5" fill="var(--pg-in)" />
          <rect x="34" y="109" width="46" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />

          <rect x="16" y="134" width="92" height="30" rx="2" className="fill-white dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-700/80" strokeWidth="1" />
          <circle cx="26" cy="149" r="2.5" fill="var(--pg-out)" />
          <rect x="34" y="147" width="40" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />

          {/* Cache hash verification stamp */}
          <rect x="16" y="186" width="92" height="36" rx="2" className="fill-white dark:fill-zinc-900" stroke="var(--pg-accent)" strokeWidth="1" strokeDasharray="2 2" />
          <circle cx="28" cy="199" r="3" fill="var(--pg-accent)" />
          <rect x="38" y="197" width="56" height="4" rx="2" fill="var(--pg-accent)" opacity="0.8" />
          <rect x="28" y="208" width="66" height="3" rx="1.5" className="fill-zinc-300 dark:fill-zinc-600" />
        </g>
      </svg>
    </div>
  );
}

/**
 * Section 3 Illustration:
 * Framework adapters feeding into a unified graph.
 * Adapters for Next.js, React, and TypeScript/Node converge cleanly on the core engine.
 */
export function FrameworksIllustration({ className = "" }: { className?: string }) {
  return (
    <div className={`relative w-full border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-950 p-2 sm:p-3 overflow-hidden ${className}`}>
      <svg
        viewBox="0 0 480 320"
        className="w-full h-auto block"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <CommonDefs />
        <rect width="480" height="320" fill="url(#canvas-grid-pattern)" />

        {/* ADAPTER 1: Next.js (App Router / Pages Router) */}
        <g transform="translate(32, 38)">
          <rect width="144" height="68" rx="4" className="fill-zinc-50 dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="1" />
          <rect x="12" y="12" width="60" height="5" rx="2" className="fill-zinc-400 dark:fill-zinc-500" />
          {/* Nested Route glyph */}
          <rect x="12" y="26" width="34" height="14" rx="2" className="fill-white dark:fill-zinc-850 stroke-zinc-300 dark:stroke-zinc-700" strokeWidth="1" />
          <rect x="18" y="32" width="16" height="3" rx="1.5" fill="var(--pg-accent)" />
          <line x1="46" y1="33" x2="56" y2="33" className="stroke-zinc-300 dark:stroke-zinc-600" strokeWidth="1" />
          <rect x="56" y="26" width="34" height="14" rx="2" className="fill-white dark:fill-zinc-850 stroke-zinc-300 dark:stroke-zinc-700" strokeWidth="1" />
          <rect x="62" y="32" width="16" height="3" rx="1.5" className="fill-zinc-400 dark:fill-zinc-500" />
          {/* Output connector */}
          <circle cx="144" cy="34" r="2.5" fill="var(--pg-accent)" />
        </g>

        {/* ADAPTER 2: React Component & Hook trees */}
        <g transform="translate(32, 126)">
          <rect width="144" height="68" rx="4" className="fill-zinc-50 dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="1" />
          <rect x="12" y="12" width="50" height="5" rx="2" className="fill-zinc-400 dark:fill-zinc-500" />
          {/* Component hook loop glyph */}
          <circle cx="28" cy="40" r="12" className="stroke-zinc-300 dark:stroke-zinc-700" strokeWidth="1.25" strokeDasharray="3 2" />
          <circle cx="28" cy="40" r="4" fill="var(--pg-in)" />
          <rect x="52" y="32" width="46" height="5" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
          <rect x="52" y="42" width="28" height="4" rx="2" className="fill-zinc-200 dark:fill-zinc-700" />
          {/* Output connector */}
          <circle cx="144" cy="34" r="2.5" fill="var(--pg-in)" />
        </g>

        {/* ADAPTER 3: TypeScript / Node / Path Aliases */}
        <g transform="translate(32, 214)">
          <rect width="144" height="68" rx="4" className="fill-zinc-50 dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="1" />
          <rect x="12" y="12" width="70" height="5" rx="2" className="fill-zinc-400 dark:fill-zinc-500" />
          {/* Path alias @/ resolution glyph */}
          <rect x="12" y="28" width="22" height="16" rx="2" className="fill-white dark:fill-zinc-850 stroke-zinc-300 dark:stroke-zinc-700" strokeWidth="1" />
          <circle cx="23" cy="36" r="3" fill="var(--pg-out)" />
          <line x1="34" y1="36" x2="48" y2="36" className="stroke-zinc-300 dark:stroke-zinc-600" strokeWidth="1" />
          <rect x="48" y="28" width="56" height="16" rx="2" className="fill-white dark:fill-zinc-850 stroke-zinc-300 dark:stroke-zinc-700" strokeWidth="1" />
          <rect x="56" y="34" width="38" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
          {/* Output connector */}
          <circle cx="144" cy="34" r="2.5" fill="var(--pg-out)" />
        </g>

        {/* Adapter Interface Boundary */}
        <line x1="210" y1="28" x2="210" y2="292" className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="1" strokeDasharray="3 3" />

        {/* Converging connector lines */}
        <path
          d="M 176 72 C 220 72, 240 140, 270 140"
          stroke="var(--pg-accent)"
          strokeWidth="1.5"
          markerEnd="url(#marker-arrow-accent)"
        />
        <path
          d="M 176 160 L 270 160"
          stroke="var(--pg-in)"
          strokeWidth="1.5"
          markerEnd="url(#marker-arrow-in)"
        />
        <path
          d="M 176 248 C 220 248, 240 180, 270 180"
          stroke="var(--pg-out)"
          strokeWidth="1.5"
          markerEnd="url(#marker-arrow-out)"
        />

        {/* CORE UNIFIED GRAPH OUTPUT (Right) */}
        <g transform="translate(272, 60)">
          <rect width="176" height="200" rx="4" className="fill-white dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="1" />
          {/* Header */}
          <rect x="16" y="14" width="76" height="5" rx="2" className="fill-zinc-400 dark:fill-zinc-500" />
          <line x1="16" y1="28" x2="160" y2="28" className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth="1" />

          {/* Unified Nodes */}
          <g transform="translate(18, 44)">
            <rect width="64" height="24" rx="2" className="fill-zinc-50 dark:fill-zinc-850 stroke-zinc-200 dark:stroke-zinc-700" strokeWidth="1" />
            <circle cx="10" cy="12" r="2.5" fill="var(--pg-accent)" />
            <rect x="18" y="10" width="34" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
          </g>

          <g transform="translate(94, 44)">
            <rect width="64" height="24" rx="2" className="fill-zinc-50 dark:fill-zinc-850 stroke-zinc-200 dark:stroke-zinc-700" strokeWidth="1" />
            <circle cx="10" cy="12" r="2.5" fill="var(--pg-in)" />
            <rect x="18" y="10" width="34" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
          </g>

          <g transform="translate(56, 100)">
            <rect width="64" height="24" rx="2" className="fill-zinc-50 dark:fill-zinc-850" stroke="var(--pg-accent)" strokeWidth="1.5" />
            <circle cx="10" cy="12" r="2.5" fill="var(--pg-out)" />
            <rect x="18" y="10" width="34" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
          </g>

          <g transform="translate(56, 154)">
            <rect width="64" height="24" rx="2" className="fill-zinc-50 dark:fill-zinc-850 stroke-zinc-200 dark:stroke-zinc-700" strokeWidth="1" />
            <circle cx="10" cy="12" r="2.5" className="fill-zinc-400 dark:fill-zinc-500" />
            <rect x="18" y="10" width="34" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
          </g>

          {/* Internal edges */}
          <path d="M 50 68 L 74 100" stroke="var(--pg-edge)" strokeWidth="1.25" markerEnd="url(#marker-arrow-edge)" />
          <path d="M 126 68 L 102 100" stroke="var(--pg-edge)" strokeWidth="1.25" markerEnd="url(#marker-arrow-edge)" />
          <path d="M 88 124 L 88 154" stroke="var(--pg-out)" strokeWidth="1.5" markerEnd="url(#marker-arrow-out)" />
        </g>
      </svg>
    </div>
  );
}

/**
 * Section 4 Illustration:
 * What it deliberately doesn't do.
 * Contrasts the rejected speculative scoring/hallucinated edges with the verified deterministic graph.
 */
export function WhatItDeliberatelyDoesntDoIllustration({ className = "" }: { className?: string }) {
  return (
    <div className={`relative w-full border border-zinc-200 dark:border-zinc-800 rounded-xs bg-white dark:bg-zinc-950 p-2 sm:p-3 overflow-hidden ${className}`}>
      <svg
        viewBox="0 0 480 320"
        className="w-full h-auto block"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <CommonDefs />
        <rect width="480" height="320" fill="url(#canvas-grid-pattern)" />

        {/* TOP: REJECTED (Guesswork, Quality Scores, Hallucinated Structure) */}
        <g transform="translate(24, 24)">
          <rect
            width="432"
            height="124"
            rx="4"
            className="fill-zinc-50/50 dark:fill-zinc-900/30 stroke-zinc-200 dark:stroke-zinc-800"
            strokeWidth="1"
            strokeDasharray="4 3"
          />

          {/* REJECTED BADGE: Scores & Grades */}
          <g transform="translate(24, 22)">
            <rect width="112" height="40" rx="3" className="fill-white dark:fill-zinc-900 stroke-rose-300 dark:stroke-rose-900" strokeWidth="1" />
            <circle cx="22" cy="20" r="10" className="fill-rose-100 dark:fill-rose-950/60 stroke-rose-400 dark:stroke-rose-800" strokeWidth="1" />
            <line x1="16" y1="20" x2="28" y2="20" className="stroke-rose-500" strokeWidth="1.5" />
            <rect x="42" y="14" width="46" height="5" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
            <rect x="42" y="23" width="28" height="4" rx="2" className="fill-zinc-200 dark:fill-zinc-700" />
            {/* Strike-through line */}
            <line x1="8" y1="36" x2="104" y2="4" className="stroke-rose-500" strokeWidth="1.5" />
          </g>

          {/* GUESSWORK EDGES & FUZZY NODES (Struck through) */}
          <g transform="translate(170, 24)">
            {/* Speculative cloud node */}
            <rect width="84" height="28" rx="14" className="fill-white dark:fill-zinc-900 stroke-zinc-300 dark:stroke-zinc-700" strokeWidth="1" strokeDasharray="3 2" />
            <rect x="22" y="12" width="40" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />

            {/* Speculative connected node */}
            <rect x="136" y="28" width="84" height="28" rx="14" className="fill-white dark:fill-zinc-900 stroke-zinc-300 dark:stroke-zinc-700" strokeWidth="1" strokeDasharray="3 2" />
            <rect x="158" y="40" width="40" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />

            {/* Guesswork connecting edge with question mark silhouette */}
            <path d="M 84 14 C 110 14, 110 42, 136 42" stroke="var(--pg-edge)" strokeWidth="1.25" strokeDasharray="3 3" />
            <circle cx="110" cy="28" r="7" className="fill-zinc-100 dark:fill-zinc-800 stroke-zinc-300 dark:stroke-zinc-600" strokeWidth="1" />
            <rect x="108" y="24" width="4" height="5" rx="1" className="fill-zinc-400 dark:fill-zinc-500" />
            <circle cx="110" cy="32" r="1" className="fill-zinc-400 dark:fill-zinc-500" />

            {/* Red cancellation cross */}
            <line x1="72" y1="52" x2="148" y2="4" className="stroke-rose-500" strokeWidth="1.5" />
          </g>

          {/* Rejection indicator bar */}
          <rect x="24" y="86" width="384" height="20" rx="2" className="fill-rose-50/50 dark:fill-rose-950/20 stroke-rose-200/60 dark:stroke-rose-900/40" strokeWidth="1" />
          <circle cx="38" cy="96" r="2.5" className="fill-rose-500" />
          <rect x="48" y="94" width="130" height="4" rx="2" className="fill-rose-700/60 dark:fill-rose-400/60" />
          <rect x="188" y="94" width="160" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
        </g>

        {/* BOTTOM: THE P-GRAPH PROMISE (Deterministic, Real Syntax Parsing) */}
        <g transform="translate(24, 172)">
          <rect
            width="432"
            height="124"
            rx="4"
            className="fill-white dark:fill-zinc-900 stroke-zinc-300 dark:stroke-zinc-700"
            strokeWidth="1.25"
          />

          {/* Verification check chip */}
          <g transform="translate(24, 20)">
            <rect width="124" height="36" rx="3" className="fill-zinc-50 dark:fill-zinc-850 stroke-zinc-200 dark:stroke-zinc-750" strokeWidth="1" />
            <circle cx="22" cy="18" r="8" className="fill-emerald-50 dark:fill-emerald-950/40 stroke-emerald-500" strokeWidth="1" />
            {/* Checkmark */}
            <path d="M 18 18 L 21 21 L 26 15" stroke="var(--pg-in)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="36" y="12" width="56" height="5" rx="2" className="fill-zinc-400 dark:fill-zinc-400" />
            <rect x="36" y="21" width="40" height="4" rx="2" fill="var(--pg-in)" opacity="0.8" />
          </g>

          {/* Deterministic graph geometry */}
          <g transform="translate(178, 20)">
            <rect width="96" height="28" rx="3" className="fill-zinc-50 dark:fill-zinc-850 stroke-zinc-300 dark:stroke-zinc-650" strokeWidth="1" />
            <circle cx="12" cy="14" r="2.5" fill="var(--pg-in)" />
            <rect x="22" y="12" width="52" height="4" rx="2" className="fill-zinc-400 dark:fill-zinc-400" />

            <rect x="136" y="20" width="96" height="28" rx="3" className="fill-zinc-50 dark:fill-zinc-850" stroke="var(--pg-accent)" strokeWidth="1.5" />
            <circle cx="12" cy="14" r="2.5" fill="var(--pg-accent)" />
            <rect x="22" y="12" width="52" height="4" rx="2" fill="var(--pg-accent)" opacity="0.8" />

            {/* Verified deterministic edge */}
            <path d="M 96 14 C 116 14, 116 34, 136 34" stroke="var(--pg-in)" strokeWidth="1.75" markerEnd="url(#marker-arrow-in)" />
          </g>

          {/* Status bar: AST verified on disk */}
          <rect x="24" y="80" width="384" height="22" rx="2" className="fill-zinc-50 dark:fill-zinc-850 stroke-zinc-200 dark:stroke-zinc-750" strokeWidth="1" />
          <circle cx="38" cy="91" r="2.5" fill="var(--pg-in)" />
          <rect x="48" y="89" width="160" height="4" rx="2" className="fill-zinc-400 dark:fill-zinc-400" />
          <rect x="220" y="89" width="90" height="4" rx="2" className="fill-zinc-300 dark:fill-zinc-600" />
        </g>
      </svg>
    </div>
  );
}
