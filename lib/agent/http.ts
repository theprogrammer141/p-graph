import { extractAgentCredential } from "./credential";
import { loadAnalysisGraph, type AnalysisGraph } from "./loader";
import { toUserFacingMessage, isUserFacingError } from "@/lib/errors";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-PGraph-Token",
};

export function handleOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function agentJsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: CORS_HEADERS,
  });
}

export function agentErrorResponse(error: unknown, fallbackStatus = 500): Response {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const lower = rawMessage.toLowerCase();

  let status = fallbackStatus;
  if (
    lower.includes("unauthorized") ||
    lower.includes("authorization") ||
    lower.includes("credential") ||
    lower.includes("expired") ||
    lower.includes("signature")
  ) {
    status = 401;
  } else if (lower.includes("not found") || lower.includes("does not exist")) {
    status = 404;
  } else if (lower.includes("missing") || lower.includes("invalid") || isUserFacingError(error)) {
    status = 400;
  }

  if (status >= 500) {
    const userFacing = toUserFacingMessage(error, "Agent service encountered an error.", "agent.http");
    return Response.json({ error: userFacing.message }, { status, headers: CORS_HEADERS });
  }

  // Client-side 4xx errors: safe to return specific user message without internal leak
  const userFacing = toUserFacingMessage(error, "Invalid request.", "agent.http");
  return Response.json({ error: userFacing.message }, { status, headers: CORS_HEADERS });
}

export async function authenticateAndLoadGraph(req: Request): Promise<AnalysisGraph> {
  const { analysisId, orgId } = extractAgentCredential(req);
  return await loadAnalysisGraph(analysisId, orgId);
}
