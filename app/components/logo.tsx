import type { SVGProps } from "react";

export function Logo({
  className = "w-4 h-4",
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      aria-label="p-graph logo"
      {...props}
    >
      {/* Inner circular counter / AST core */}
      <circle
        cx="54"
        cy="42"
        r="13"
        stroke="currentColor"
        strokeWidth="2.2"
      />

      {/* Dependency network edges */}
      <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* Outer stem */}
        <line x1="26" y1="26" x2="26" y2="76" />

        {/* Stem structural trusses */}
        <line x1="26" y1="26" x2="38" y2="66" />
        <line x1="26" y1="76" x2="38" y2="66" />
        <line x1="38" y1="66" x2="38" y2="26" />
        <line x1="26" y1="26" x2="38" y2="26" />

        {/* Loop outer boundary segments */}
        <line x1="38" y1="26" x2="54" y2="18" />
        <path d="M 54 18 A 24 24 0 0 1 78 42 A 24 24 0 0 1 54 66" fill="none" />
        <line x1="54" y1="66" x2="38" y2="66" />

        {/* Interconnecting dependency edges across loop */}
        <line x1="38" y1="26" x2="71" y2="26" strokeOpacity="0.5" />
        <line x1="54" y1="18" x2="71" y2="58" strokeOpacity="0.7" />
        <line x1="71" y1="26" x2="54" y2="66" strokeOpacity="0.7" />
        <line x1="78" y1="42" x2="41" y2="42" strokeOpacity="0.6" />
        <line x1="71" y1="58" x2="38" y2="66" strokeOpacity="0.8" />
      </g>

      {/* Vertices / AST Graph Nodes */}
      <g fill="currentColor">
        <circle cx="26" cy="26" r="3.5" />
        <circle cx="26" cy="76" r="3.5" />
        <circle cx="54" cy="18" r="3.5" />
        <circle cx="71" cy="26" r="3" />
        <circle cx="78" cy="42" r="3.5" />
        <circle cx="71" cy="58" r="3" />
        <circle cx="54" cy="66" r="3.5" />
      </g>
    </svg>
  );
}
