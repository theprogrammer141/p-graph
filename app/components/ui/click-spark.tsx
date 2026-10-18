"use client";

import React, { useRef, useEffect } from "react";

interface ClickSparkProps {
  sparkColor?: string;
  sparkSize?: number;
  sparkRadius?: number;
  sparkCount?: number;
  duration?: number;
  children: React.ReactNode;
  className?: string;
}

interface Spark {
  x: number;
  y: number;
  angle: number;
  speed: number;
  startTime: number;
}

/**
 * ClickSpark component inspired by reactbits.dev.
 * Triggers a crisp, momentary burst of sparks strictly when clicked.
 */
export function ClickSpark({
  sparkColor = "#2563eb",
  sparkSize = 3,
  sparkRadius = 30,
  sparkCount = 12,
  duration = 400,
  children,
  className = "",
}: ClickSparkProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sparksRef = useRef<Spark[]>([]);
  const animFrameIdRef = useRef<number | null>(null);

  const startLoop = () => {
    if (animFrameIdRef.current !== null) return;

    const render = (timestamp: number) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animFrameIdRef.current = null;
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        animFrameIdRef.current = null;
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      sparksRef.current = sparksRef.current.filter((spark) => {
        const elapsed = timestamp - spark.startTime;
        if (elapsed >= duration) return false;

        const progress = elapsed / duration;
        const currentDistance = spark.speed * (1 - Math.pow(1 - progress, 2)) * sparkRadius;
        const x = spark.x + Math.cos(spark.angle) * currentDistance;
        const y = spark.y + Math.sin(spark.angle) * currentDistance;
        const opacity = 1 - progress;

        ctx.save();
        ctx.fillStyle = sparkColor;
        ctx.globalAlpha = opacity;
        ctx.beginPath();
        ctx.arc(x, y, sparkSize * (1 - progress * 0.5), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        return true;
      });

      if (sparksRef.current.length > 0) {
        animFrameIdRef.current = requestAnimationFrame(render);
      } else {
        animFrameIdRef.current = null;
      }
    };

    animFrameIdRef.current = requestAnimationFrame(render);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }

    const x = (e.clientX - rect.left) * dpr;
    const y = (e.clientY - rect.top) * dpr;
    const now = performance.now();

    const newSparks: Spark[] = Array.from({ length: sparkCount }).map((_, i) => ({
      x,
      y,
      angle: (i * (2 * Math.PI)) / sparkCount + (Math.random() - 0.5) * 0.3,
      speed: (0.7 + Math.random() * 0.5) * dpr,
      startTime: now,
    }));

    sparksRef.current.push(...newSparks);
    startLoop();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    };

    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, []);

  return (
    <div className={`relative inline-block ${className}`} onClick={handleClick}>
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute -inset-8 z-50 h-[calc(100%+64px)] w-[calc(100%+64px)]"
      />
      {children}
    </div>
  );
}
