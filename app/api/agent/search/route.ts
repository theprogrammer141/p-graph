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
    const query = url.searchParams.get("query") || url.searchParams.get("q") || "";

    if (!query.trim()) {
      return agentErrorResponse(new Error("Missing search query parameter 'query'."), 400);
    }

    const graph = await authenticateAndLoadGraph(req);
    const qLower = query.trim().toLowerCase();

    const matches = graph.files.filter((f) => f.path.toLowerCase().includes(qLower));

    matches.sort((a, b) => {
      const aLower = a.path.toLowerCase();
      const bLower = b.path.toLowerCase();
      const aExact = aLower === qLower;
      const bExact = bLower === qLower;
      if (aExact !== bExact) return aExact ? -1 : 1;
      return a.path.length - b.path.length || (a.path < b.path ? -1 : 1);
    });

    return agentJsonResponse({
      query: query.trim(),
      count: matches.length,
      files: matches.slice(0, 50).map((f) => ({
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
