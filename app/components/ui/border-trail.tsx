"use client";

import React from "react";

interface BorderTrailProps {
  className?: string;
  size?: number;
  duration?: number;
  color?: string;
}

/**
 * BorderTrail component inspired by reactbits.dev.
 * Animates a glowing light beam traveling smoothly along the perimeter of its container.
 */
export function BorderTrail({
  className = "",
  size = 25,
  duration = 3,
  color = "var(--pg-accent, #2563eb)",
}: BorderTrailProps) {
  const trailLength = Math.max(5, Math.min(size, 80));
  const gapLength = 100 - trailLength;

  return (
    <div className={`pointer-events-none absolute -inset-px z-20 overflow-hidden rounded-[inherit] ${className}`}>
      <svg
        className="h-full w-full rounded-[inherit]"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
      >
        <rect
          x="1"
          y="1"
          width="calc(100% - 2px)"
          height="calc(100% - 2px)"
          rx="3"
          pathLength="100"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray={`${trailLength} ${gapLength}`}
          className="animate-border-trail"
          style={{
            animationDuration: `${duration}s`,
          }}
        />
      </svg>
    </div>
  );
}
