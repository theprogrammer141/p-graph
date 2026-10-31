import type { FrameworkAdapter } from "../adapter.ts";
import { nextjsAdapter } from "./nextjs.ts";
import { nestjsAdapter } from "./nestjs.ts";
import { expressAdapter } from "./express.ts";
import { reactNativeAdapter } from "./react-native.ts";
import { flutterAdapter } from "./flutter.ts";
import { djangoAdapter } from "./django.ts";
import { fastapiAdapter } from "./fastapi.ts";
import { flaskAdapter } from "./flask.ts";
import { dotnetAdapter } from "./dotnet.ts";
import { supabaseAdapter } from "./supabase.ts";
import { firebaseAdapter } from "./firebase.ts";
import { reactAdapter } from "./react.ts";
import { pythonAdapter } from "./python.ts";

export { nextjsAdapter } from "./nextjs.ts";
export { nestjsAdapter } from "./nestjs.ts";
export { expressAdapter, identifyExpressRole } from "./express.ts";
export { reactNativeAdapter } from "./react-native.ts";
export { flutterAdapter } from "./flutter.ts";
export { djangoAdapter } from "./django.ts";
export { fastapiAdapter } from "./fastapi.ts";
export { flaskAdapter } from "./flask.ts";
export { dotnetAdapter } from "./dotnet.ts";
export { supabaseAdapter } from "./supabase.ts";
export { firebaseAdapter } from "./firebase.ts";
export { reactAdapter } from "./react.ts";
export { pythonAdapter } from "./python.ts";

/**
 * Detection order: first match wins.
 * Specific application frameworks run before BaaS platforms (Supabase, Firebase),
 * which in turn run before generic library/language adapters (React, Python).
 */
export const ALL_ADAPTERS: readonly FrameworkAdapter[] = [
  nextjsAdapter,
  nestjsAdapter,
  expressAdapter,
  reactNativeAdapter,
  flutterAdapter,
  djangoAdapter,
  fastapiAdapter,
  flaskAdapter,
  dotnetAdapter,
  supabaseAdapter,
  firebaseAdapter,
  reactAdapter,
  pythonAdapter,
];
