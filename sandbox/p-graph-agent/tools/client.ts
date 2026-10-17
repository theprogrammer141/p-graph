// Client helper to talk to the read-only HTTP surface in the p-graph application.
// Credentials and API URL are resolved per invocation from RunnableConfig or environment.

export interface PGraphApiConfig {
  configurable?: {
    credential?: string;
    apiUrl?: string;
  };
}

export async function callPGraphApi<T>(
  endpoint: string,
  params?: Record<string, string | number | undefined>,
  runnableConfig?: unknown
): Promise<T> {
  const cfg = (runnableConfig as PGraphApiConfig | undefined)?.configurable;
  const baseUrl = cfg?.apiUrl || process.env.PGRAPH_API_URL || "http://localhost:3000";
  const token = cfg?.credential || process.env.PGRAPH_CREDENTIAL;
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
  const url = new URL(cleanEndpoint, base);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers["X-PGraph-Token"] = token;
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `p-graph HTTP service error on ${endpoint} (${response.status}): ${
        errorBody || response.statusText
      }`
    );
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `p-graph HTTP service on ${endpoint} returned non-JSON response (${response.status}): ${text.slice(0, 300)}`
    );
  }

  return (await response.json()) as T;
}
