import { transitiveWalk, type WalkDirection } from "@/lib/graph/maths";
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
    const directionParam = url.searchParams.get("direction") || "";
    const maxDepthParam =
      url.searchParams.get("maxDepth") || url.searchParams.get("depth") || "2";

    if (!path.trim()) {
      return agentErrorResponse(new Error("Missing parameter 'path'."), 400);
    }

    if (directionParam !== "blast-radius" && directionParam !== "dependency-chain") {
      return agentErrorResponse(
        new Error(
          "Invalid parameter 'direction'. Must be either 'blast-radius' or 'dependency-chain'."
        ),
        400
      );
    }

    const direction = directionParam as WalkDirection;
    const maxDepth = Math.max(1, Math.min(10, parseInt(maxDepthParam, 10) || 2));

    const graph = await authenticateAndLoadGraph(req);
    const filePath = path.trim();

    if (!graph.filesByPath.has(filePath)) {
      return agentErrorResponse(
        new Error(`File '${filePath}' does not exist in the analyzed repository graph.`),
        404
      );
    }

    const items = transitiveWalk(filePath, graph.edges, direction, maxDepth);

    return agentJsonResponse({
      startPath: filePath,
      direction,
      maxDepth,
      count: items.length,
      items,
    });
  } catch (error) {
    return agentErrorResponse(error);
  }
}
