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
    const url = new URL(req.url);
    const methodFilter = url.searchParams.get("method")?.trim().toUpperCase();

    const graph = await authenticateAndLoadGraph(req);

    const routes = methodFilter
      ? graph.routes.filter((r) => r.method.toUpperCase() === methodFilter)
      : graph.routes;

    return agentJsonResponse({
      count: routes.length,
      routes: routes.map((r) => ({
        method: r.method,
        path: r.path,
        filePath: r.filePath,
      })),
    });
  } catch (error) {
    return agentErrorResponse(error);
  }
}
