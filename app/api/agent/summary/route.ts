import { buildRepoSummary } from "@/lib/graph/detail";
import {
  agentErrorResponse,
  agentJsonResponse,
  authenticateAndLoadGraph,
  handleOptions,
} from "@/lib/agent/http";

export async function OPTIONS() {
  return handleOptions();
}

export async function GET(req: Request) {
  try {
    const graph = await authenticateAndLoadGraph(req);
    const summary = buildRepoSummary(graph.files, graph.edges, {
      repoName: graph.repoName,
      adapter: graph.adapter,
      routeCount: graph.routes.length,
    });
    return agentJsonResponse(summary);
  } catch (error) {
    return agentErrorResponse(error);
  }
}
