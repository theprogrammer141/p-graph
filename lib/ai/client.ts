import OpenAI from "openai";
import { wrapOpenAI } from "langsmith/wrappers";

/**
 * Pinned model identifier. Never use a moving alias.
 * Model name is part of the cache key: re-pinning invalidates only its own cache.
 */
export const PINNED_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";

/**
 * Checks whether LangSmith tracing is configured with valid environment variables.
 */
export function isTracingConfigured(): boolean {
  return Boolean(
    process.env.LANGSMITH_API_KEY &&
      (process.env.LANGSMITH_TRACING === "true" || process.env.LANGSMITH_TRACING === "1")
  );
}

let wrappedAIClient: OpenAI | null = null;

/**
 * The single place in the entire codebase that constructs the AI client,
 * wrapped so every call through it is traced with LangSmith.
 */
export function getAIClient(): OpenAI {
  if (wrappedAIClient) {
    return wrappedAIClient;
  }

  const apiKey =
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing AI API key. Please set OPENROUTER_API_KEY or OPENAI_API_KEY in .env.local."
    );
  }

  const baseURL =
    process.env.OPENAI_BASE_URL ||
    (process.env.OPENROUTER_API_KEY ? "https://openrouter.ai/api/v1" : undefined);

  const rawClient = new OpenAI({
    apiKey,
    baseURL,
    defaultHeaders: {
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "p-graph",
    },
  });

  // Wrapped with LangSmith. If LangSmith tracing is unconfigured, calls still succeed.
  wrappedAIClient = wrapOpenAI(rawClient);
  return wrappedAIClient;
}
