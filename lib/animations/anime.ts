import { animate, stagger } from "animejs";

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
