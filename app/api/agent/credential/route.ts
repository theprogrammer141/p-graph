import { auth } from "@clerk/nextjs/server";
import { createClerkSupabaseClient } from "@/lib/supabase";
import { mintAgentCredential } from "@/lib/agent/credential";
import { agentErrorResponse } from "@/lib/agent/http";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Mints a short-lived signed credential for the requested analysis.
 * Verifies that the caller is signed in with an active organization
 * and owns/has access to the analysis through Supabase RLS.
 */
export async function POST(req: Request) {
  try {
    const { orgId } = await auth();
    if (!orgId) {
      return agentErrorResponse(
        new Error("Unauthorized: Active organization required to mint agent credentials."),
        401
      );
    }

    const rateCheck = checkRateLimit(`credential:${orgId}`, { limit: 10, windowMs: 60_000 });
    if (!rateCheck.success) {
      return agentErrorResponse(
        new Error("Rate limit exceeded for minting credentials. Please wait a moment."),
        429
      );
    }

    const body = (await req.json().catch(() => ({}))) as { analysisId?: string };
    const analysisId = body?.analysisId?.trim();

    if (!analysisId) {
      return agentErrorResponse(new Error("Missing parameter 'analysisId'."), 400);
    }

    // Use Clerk Supabase client: RLS ensures user only sees analyses belonging to their active org
    const supabase = await createClerkSupabaseClient();
    const { data: analysis, error } = await supabase
      .from("analyses")
      .select("id, org_id")
      .eq("id", analysisId)
      .maybeSingle();

    if (error || !analysis) {
      return agentErrorResponse(
        new Error("Analysis not found or not accessible within your organization."),
        404
      );
    }

    const credential = mintAgentCredential({
      analysisId: analysis.id,
      orgId: analysis.org_id,
      expiresInSeconds: 600,
    });

    return Response.json({
      credential,
      expiresIn: 600,
      analysisId: analysis.id,
      orgId: analysis.org_id,
    });
  } catch (error) {
    return agentErrorResponse(error);
  }
}

