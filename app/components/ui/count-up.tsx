"use client";

import React, { useEffect, useState, useRef } from "react";

interface CountUpProps {
  to: number;
  from?: number;
  duration?: number;
  className?: string;
  formatter?: (val: number) => string;
}

/**
 * CountUp component inspired by reactbits.dev.
 * Smoothly interpolates numeric values on initial mount or updates with easing.
 */
export function CountUp({
  to,
  from = 0,
  duration = 700,
  className = "",
  formatter = (v) => Math.round(v).toLocaleString(),
}: CountUpProps) {
  const [current, setCurrent] = useState(from);
  const prevToRef = useRef(from);

  useEffect(() => {
    let animationFrameId: number;

    const startVal = prevToRef.current;
    const diff = to - startVal;
    if (diff === 0) return;

    let startTime: number | null = null;

    const easeOutExpo = (x: number): number => {
      return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
    };

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutExpo(progress);

      setCurrent(startVal + diff * easedProgress);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        prevToRef.current = to;
      }
    };

    animationFrameId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [to, duration]);

  return <span className={`tabular-nums ${className}`}>{formatter(current)}</span>;
}
