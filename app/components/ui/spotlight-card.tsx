"use client";

import React, { useRef, useState, useCallback } from "react";

interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
  spotlightSize?: number;
}

/**
 * SpotlightCard component inspired by reactbits.dev.
 * Follows mouse movement to cast a subtle radial highlight across borders and surfaces.
 * Inert when idle — strictly interactive.
 */
export function SpotlightCard({
  children,
  className = "",
  spotlightColor,
  spotlightSize = 350,
  ...props
}: SpotlightCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setPosition({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      setOpacity(1);
    },
    []
  );

  const handleMouseEnter = useCallback(() => {
    setOpacity(1);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setOpacity(0);
  }, []);

  const hasPadding = /\bp-\d|\bpx-|\bpy-|\bp-0\b/.test(className);
  const paddingClass = hasPadding ? "" : "p-4";

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative overflow-hidden rounded-xs border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/60 ${paddingClass} transition-colors duration-200 ${className}`}
      {...props}
    >
      {/* Spotlight highlight layer */}
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-300"
        style={{
          opacity,
          background: `radial-gradient(${spotlightSize}px circle at ${position.x}px ${position.y}px, ${
            spotlightColor || "rgba(37, 99, 235, 0.22)"
          }, transparent 80%)`,
        }}
      />
      {/* Subtle border highlight */}
      <div
        className="pointer-events-none absolute -inset-px rounded-xs transition-opacity duration-300 ring-1 ring-inset"
        style={{
          opacity,
          maskImage: `radial-gradient(${spotlightSize * 0.75}px circle at ${position.x}px ${position.y}px, black, transparent 100%)`,
          WebkitMaskImage: `radial-gradient(${spotlightSize * 0.75}px circle at ${position.x}px ${position.y}px, black, transparent 100%)`,
          borderColor: "rgba(37, 99, 235, 0.75)",
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
