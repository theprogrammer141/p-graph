import { buildFileDetail } from "@/lib/graph/detail";
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
    const path = url.searchParams.get("path") || "";

    if (!path.trim()) {
      return agentErrorResponse(new Error("Missing parameter 'path'."), 400);
    }

    const graph = await authenticateAndLoadGraph(req);
    const filePath = path.trim();

    const detail = buildFileDetail(filePath, graph.filesByPath, graph.edges, graph.adapter);
    if (!detail) {
      return agentErrorResponse(
        new Error(`File '${filePath}' does not exist in the analyzed repository graph.`),
        404
      );
    }

    return agentJsonResponse({
      path: detail.path,
      kind: detail.kind,
      lines: detail.lines,
      dependsOnCount: detail.dependsOnCount,
      dependedOnCount: detail.dependedOnCount,
      dependencies: detail.dependencies.map((d) => ({
        path: d.path,
        kind: d.kind,
        lines: d.lines,
        fanIn: d.fanIn,
        fanOut: d.fanOut,
      })),
      dependents: detail.dependents.map((d) => ({
        path: d.path,
        kind: d.kind,
        lines: d.lines,
        fanIn: d.fanIn,
        fanOut: d.fanOut,
      })),
    });
  } catch (error) {
    return agentErrorResponse(error);
  }
}
