"use client";

import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";

interface DecryptedTextProps {
  text: string;
  speed?: number;
  maxIterations?: number;
  sequential?: boolean;
  revealDirection?: "start" | "end" | "center";
  useOriginalCharsOnly?: boolean;
  characters?: string;
  className?: string;
  parentClassName?: string;
  animateOn?: "mount" | "hover";
}

const DEFAULT_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz_/#@$<>&~";

/**
 * DecryptedText component inspired by reactbits.dev.
 * Monospace cyber/terminal text deciphering effect that reveals characters sequentially.
 * Guaranteed to settle cleanly and never re-trigger in an infinite loop.
 */
export function DecryptedText({
  text,
  speed = 40,
  maxIterations = 10,
  sequential = true,
  revealDirection = "start",
  useOriginalCharsOnly = false,
  characters = DEFAULT_CHARS,
  className = "",
  parentClassName = "",
  animateOn = "hover",
}: DecryptedTextProps) {
  const [prevText, setPrevText] = useState(text);
  const [displayText, setDisplayText] = useState(text);
  const isRunningRef = useRef(false);
  const hasAnimatedOnMountRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  if (prevText !== text) {
    setPrevText(text);
    setDisplayText(text);
  }

  const availableChars = useMemo(() => {
    return useOriginalCharsOnly
      ? Array.from(new Set(text.split(""))).filter((c) => c !== " ")
      : characters.split("");
  }, [useOriginalCharsOnly, text, characters]);

  const startAnimation = useCallback(() => {
    if (isRunningRef.current) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    isRunningRef.current = true;

    let iteration = 0;
    const length = text.length;
    const revealedIndices = new Set<number>();

    intervalRef.current = setInterval(() => {
      iteration++;

      if (sequential) {
        if (revealDirection === "start") {
          const count = Math.floor((iteration / maxIterations) * length);
          for (let i = 0; i < count; i++) revealedIndices.add(i);
        } else if (revealDirection === "end") {
          const count = Math.floor((iteration / maxIterations) * length);
          for (let i = length - 1; i >= length - count; i--) revealedIndices.add(i);
        } else {
          const mid = Math.floor(length / 2);
          const offset = Math.floor(((iteration / maxIterations) * length) / 2);
          for (let i = mid - offset; i <= mid + offset; i++) {
            if (i >= 0 && i < length) revealedIndices.add(i);
          }
        }
      }

      setDisplayText(
        text
          .split("")
          .map((char, index) => {
            if (char === " ") return " ";
            if (revealedIndices.has(index)) return char;
            if (!sequential && iteration >= maxIterations) return char;
            return availableChars[Math.floor(Math.random() * availableChars.length)] || "_";
          })
          .join("")
      );

      if (iteration >= maxIterations + (sequential ? length : 0) || revealedIndices.size >= length) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setDisplayText(text);
        isRunningRef.current = false;
      }
    }, speed);
  }, [text, maxIterations, sequential, revealDirection, availableChars, speed]);

  useEffect(() => {
    if (animateOn === "mount" && !hasAnimatedOnMountRef.current) {
      hasAnimatedOnMountRef.current = true;
      startAnimation();
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      isRunningRef.current = false;
    };
  }, [animateOn, startAnimation]);

  const handleMouseEnter = () => {
    startAnimation();
  };

  return (
    <span
      className={`inline-block font-mono tracking-tight cursor-default ${parentClassName}`}
      onMouseEnter={handleMouseEnter}
    >
      <span className={className}>{displayText}</span>
    </span>
  );
}
