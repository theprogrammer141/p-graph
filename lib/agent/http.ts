import { extractAgentCredential } from "./credential";
import { loadAnalysisGraph, type AnalysisGraph } from "./loader";

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
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  let status = fallbackStatus;
  if (
    lower.includes("authorization") ||
    lower.includes("credential") ||
    lower.includes("expired") ||
    lower.includes("signature")
  ) {
    status = 401;
  } else if (lower.includes("not found") || lower.includes("does not exist")) {
    status = 404;
  } else if (lower.includes("missing") || lower.includes("invalid")) {
    status = 400;
  }

  return Response.json({ error: message }, { status, headers: CORS_HEADERS });
}

export async function authenticateAndLoadGraph(req: Request): Promise<AnalysisGraph> {
  const { analysisId, orgId } = extractAgentCredential(req);
  return await loadAnalysisGraph(analysisId, orgId);
}
