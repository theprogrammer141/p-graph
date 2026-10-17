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
    const role = url.searchParams.get("role") || "";

    if (!role.trim()) {
      return agentErrorResponse(new Error("Missing parameter 'role'."), 400);
    }

    const graph = await authenticateAndLoadGraph(req);
    const roleLower = role.trim().toLowerCase();

    const matches = graph.files.filter((f) => f.role?.toLowerCase() === roleLower);

    matches.sort((a, b) => b.fanIn - a.fanIn || (a.path < b.path ? -1 : 1));

    return agentJsonResponse({
      role: role.trim(),
      count: matches.length,
      files: matches.map((f) => ({
        path: f.path,
        lines: f.lines,
        role: f.role ?? "unidentified",
        fanIn: f.fanIn,
        fanOut: f.fanOut,
      })),
    });
  } catch (error) {
    return agentErrorResponse(error);
  }
}
