import { animate, createTimeline, stagger } from "animejs";

/** Checks if the user prefers reduced motion */
export function prefersReducedMotion(): boolean {
  return false;
}

/** Staggers entrance of child or target elements with fade + slide */
export function animateEntrance(
  targets: Element | Element[] | NodeList | string,
  options: {
    translateY?: [number, number];
    translateX?: [number, number];
    delay?: number;
    staggerMs?: number;
    duration?: number;
    ease?: string;
  } = {}
) {
  const {
    translateY = [12, 0],
    translateX = [0, 0],
    delay = 0,
    staggerMs = 50,
    duration = 450,
    ease = "outQuad",
  } = options;

  try {
    return animate(targets as Parameters<typeof animate>[0], {
      opacity: [0, 1],
      translateY,
      translateX,
      delay: stagger(staggerMs, { start: delay }),
      duration,
      ease,
    });
  } catch (err) {
    console.error("animateEntrance error:", err);
    return null;
  }
}

/** Fades in a single target element smoothly */
export function animateFadeIn(
  target: Element | string,
  options: {
    translateY?: [number, number];
    duration?: number;
    delay?: number;
    ease?: string;
  } = {}
) {
  const {
    translateY = [8, 0],
    duration = 300,
    delay = 0,
    ease = "outQuad",
  } = options;

  try {
    return animate(target as Parameters<typeof animate>[0], {
      opacity: [0, 1],
      translateY,
      delay,
      duration,
      ease,
    });
  } catch {
    return null;
  }
}

/** Smoothly slides an indicator element (such as an active tab pill) */
export function animatePillSlide(
  target: Element,
  coords: { x: number; width: number },
  duration = 240
) {
  try {
    return animate(target as Parameters<typeof animate>[0], {
      translateX: coords.x,
      width: coords.width,
      duration,
      ease: "outExpo",
    });
  } catch {
    return null;
  }
}

/** Micro-bounce / press feedback on click */
export function animateClickScale(target: Element) {
  try {
    return animate(target as Parameters<typeof animate>[0], {
      scale: [1, 0.94, 1],
      duration: 180,
      ease: "outQuad",
    });
  } catch {
    return null;
  }
}

/** Subtle ripple/pulse highlight for selected graph nodes or focus points */
export function animatePulse(target: Element) {
  try {
    return animate(target as Parameters<typeof animate>[0], {
      scale: [1, 1.05, 1],
      duration: 300,
      ease: "outQuad",
    });
  } catch {
    return null;
  }
}

/** Animates numeric values from start to target */
export function animateValue(
  targetObj: { value: number },
  endValue: number,
  onUpdate: (val: number) => void,
  duration = 600
) {
  try {
    return animate(targetObj, {
      value: endValue,
      duration,
      ease: "outExpo",
      onUpdate: () => {
        onUpdate(targetObj.value);
      },
    });
  } catch {
    onUpdate(endValue);
    return null;
  }
}

export { animate, createTimeline, stagger };
