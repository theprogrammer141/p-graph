import type { FrameworkAdapter } from "../adapter.ts";
import { nextjsAdapter } from "./nextjs.ts";
import { nestjsAdapter } from "./nestjs.ts";
import { expressAdapter } from "./express.ts";
import { reactAdapter } from "./react.ts";

export { nextjsAdapter } from "./nextjs.ts";
export { nestjsAdapter } from "./nestjs.ts";
export { expressAdapter, identifyExpressRole } from "./express.ts";
export { reactAdapter } from "./react.ts";

/**
 * Detection order: first match wins.
 * Next.js comes before React so Next.js repositories aren't classified as plain React.
 */
export const ALL_ADAPTERS: readonly FrameworkAdapter[] = [
  nextjsAdapter,
  nestjsAdapter,
  expressAdapter,
  reactAdapter,
];
