import "./env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { checkInventedPaths, type InventedPathsResult } from "@/lib/ai/invented-paths";

interface ExplanationRow {
  readonly id: string;
  readonly analysis_id: string;
  readonly target_path: string | null;
  readonly target_type: string | null;
  readonly content: string;
  readonly created_at: string | null;
}

interface EvaluatedExplanationSample {
  readonly content: string;
  readonly shownPaths: readonly string[];
}

const EXPLANATION_FETCH_LIMIT = 20;

const FALLBACK_SAMPLE_TEXT =
  "This file configures **Morgan** HTTP request logging middleware by importing settings from `src/config/config.js` and `src/config/logger.js`. Mounted by `src/app.js`.";

const FALLBACK_SHOWN_PATHS: readonly string[] = [
  "src/config/morgan.js",
  "src/config/config.js",
  "src/config/logger.js",
  "src/app.js",
];

/**
 * Safely extracts the `path` field from a Supabase foreign-key join result.
 */
function extractJoinedPath(relation: unknown): string | null {
  if (!relation) return null;
  if (Array.isArray(relation)) {
    const first = relation[0] as { path?: unknown } | undefined;
    return typeof first?.path === "string" ? first.path : null;
  }
  const record = relation as { path?: unknown };
  return typeof record.path === "string" ? record.path : null;
}

/**
 * Escapes SQL LIKE wildcard characters (`%`, `_`, `\`) and normalizes trailing slashes.
 */
function buildFolderLikePattern(folderPath: string): string {
  const normalized = folderPath.replace(/\/+$/, "");
  const escaped = normalized.replace(/([\\%_])/g, "\\$1");
  return `${escaped}/%`;
}

/**
 * Resolves the deduplicated list of valid graph paths shown to the model for a given explanation.
 */
async function resolveShownPathsForExplanation(
  supabase: SupabaseClient<Database>,
  expl: ExplanationRow & { readonly target_path: string },
): Promise<string[]> {
  if (expl.target_type === "file") {
    const { data: file, error: fileError } = await supabase
      .from("files")
      .select("id, path")
      .eq("analysis_id", expl.analysis_id)
      .eq("path", expl.target_path)
      .maybeSingle();

    if (fileError) {
      throw new Error(
        `Failed to fetch file record for "${expl.target_path}" (analysis ${expl.analysis_id}): ${fileError.message}`,
      );
    }

    if (!file) {
      return [expl.target_path];
    }

    const [outgoingRes, incomingRes] = await Promise.all([
      supabase
        .from("edges")
        .select("target:files!edges_target_file_id_org_id_fkey(path)")
        .eq("analysis_id", expl.analysis_id)
        .eq("source_file_id", file.id),
      supabase
        .from("edges")
        .select("source:files!edges_source_file_id_org_id_fkey(path)")
        .eq("analysis_id", expl.analysis_id)
        .eq("target_file_id", file.id),
    ]);

    if (outgoingRes.error) {
      throw new Error(
        `Failed to fetch outgoing edges for "${expl.target_path}": ${outgoingRes.error.message}`,
      );
    }
    if (incomingRes.error) {
      throw new Error(
        `Failed to fetch incoming edges for "${expl.target_path}": ${incomingRes.error.message}`,
      );
    }

    const outPaths = (outgoingRes.data ?? [])
      .map((e) => extractJoinedPath(e.target))
      .filter((p): p is string => Boolean(p));

    const inPaths = (incomingRes.data ?? [])
      .map((e) => extractJoinedPath(e.source))
      .filter((p): p is string => Boolean(p));

    return Array.from(new Set([file.path, ...outPaths, ...inPaths]));
  }

  // Folder target: match strictly files under `${target_path}/`
  const normalizedFolder = expl.target_path.replace(/\/+$/, "");
  const likePattern = buildFolderLikePattern(normalizedFolder);

  const { data: folderFiles, error: folderError } = await supabase
    .from("files")
    .select("id, path")
    .eq("analysis_id", expl.analysis_id)
    .like("path", likePattern);

  if (folderError) {
    throw new Error(
      `Failed to fetch folder files for "${expl.target_path}": ${folderError.message}`,
    );
  }

  const prefix = `${normalizedFolder}/`;
  const childFiles = (folderFiles ?? [])
    .filter((f): f is { id: string; path: string } => Boolean(f?.path && f.path.startsWith(prefix)));
  const childPaths = childFiles.map((f) => f.path);
  const fileIdSet = new Set(childFiles.map((f) => f.id));

  let incomingFiles: string[] = [];
  let outgoingFiles: string[] = [];

  if (childFiles.length > 0) {
    const fileIds = Array.from(fileIdSet);
    const [incomingRes, outgoingRes] = await Promise.all([
      supabase
        .from("edges")
        .select("source:files!edges_source_file_id_org_id_fkey(id, path)")
        .eq("analysis_id", expl.analysis_id)
        .in("target_file_id", fileIds),
      supabase
        .from("edges")
        .select("target:files!edges_target_file_id_org_id_fkey(id, path)")
        .eq("analysis_id", expl.analysis_id)
        .in("source_file_id", fileIds),
    ]);

    if (incomingRes.error) {
      throw new Error(
        `Failed to fetch incoming edges for folder "${expl.target_path}": ${incomingRes.error.message}`,
      );
    }
    if (outgoingRes.error) {
      throw new Error(
        `Failed to fetch outgoing edges for folder "${expl.target_path}": ${outgoingRes.error.message}`,
      );
    }

    incomingFiles = Array.from(
      new Set(
        (incomingRes.data ?? [])
          .map((e) => e.source as { id?: string; path?: string } | null)
          .filter((f): f is { id: string; path: string } => Boolean(f?.path && !fileIdSet.has(f.id!)))
          .map((f) => f.path),
      ),
    );

    outgoingFiles = Array.from(
      new Set(
        (outgoingRes.data ?? [])
          .map((e) => e.target as { id?: string; path?: string } | null)
          .filter((f): f is { id: string; path: string } => Boolean(f?.path && !fileIdSet.has(f.id!)))
          .map((f) => f.path),
      ),
    );
  }

  const MAX_FOLDER_FILES_IN_PROMPT = 30;
  const MAX_FOLDER_NEIGHBOURS_IN_PROMPT = 25;

  const displayedChildren = childPaths.slice(0, MAX_FOLDER_FILES_IN_PROMPT);
  const displayedIncoming = incomingFiles.slice(0, MAX_FOLDER_NEIGHBOURS_IN_PROMPT);
  const displayedOutgoing = outgoingFiles.slice(0, MAX_FOLDER_NEIGHBOURS_IN_PROMPT);

  return Array.from(
    new Set([expl.target_path, ...displayedChildren, ...displayedIncoming, ...displayedOutgoing]),
  );
}

/**
 * Evaluates recent real explanations stored in Supabase against their exact shown paths.
 * Also tests synthetic/spliced hallucinated paths to verify detection.
 */
async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in environment.");
    process.exit(1);
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey);

  console.log("================================================================================");
  console.log("Phase 11: Invented-Path Evaluation (Deterministic Set-Membership Check)");
  console.log("================================================================================\n");

  // 1. Fetch recent real explanations
  const { data: explanations, error: explError } = await supabase
    .from("explanations")
    .select("id, analysis_id, target_path, target_type, content, created_at")
    .order("created_at", { ascending: false })
    .limit(EXPLANATION_FETCH_LIMIT);

  if (explError) {
    console.error("Failed to query explanations:", explError.message);
    process.exit(1);
  }

  let firstCleanSample: EvaluatedExplanationSample | null = null;

  if (!explanations || explanations.length === 0) {
    console.log("No real explanations found in database to evaluate.");
  } else {
    console.log(`Evaluating ${explanations.length} recent real explanation(s)...\n`);

    let passedCount = 0;
    let totalEvaluated = 0;

    for (const expl of explanations) {
      if (!expl.target_path || typeof expl.content !== "string") continue;
      totalEvaluated++;

      const shownPaths = await resolveShownPathsForExplanation(supabase, {
        ...expl,
        target_path: expl.target_path,
      });

      const res: InventedPathsResult = checkInventedPaths(expl.content, shownPaths);
      if (res.valid) {
        passedCount++;
        if (!firstCleanSample) {
          firstCleanSample = { content: expl.content, shownPaths };
        }
      }

      const extractedList =
        res.extractedPaths.length > 0 ? res.extractedPaths.join(", ") : "(none)";
      const accuracyPct = (res.pathAccuracy * 100).toFixed(1);

      console.log(
        `[${res.valid ? "PASS" : "FAIL"}] Target: ${expl.target_path} (${expl.target_type ?? "unknown"})`,
      );
      console.log(`  - Explanation ID: ${expl.id}`);
      console.log(`  - Shown paths count: ${shownPaths.length}`);
      console.log(`  - Extracted path tokens (${res.extractedPaths.length}): ${extractedList}`);
      console.log(`  - Path accuracy score: ${accuracyPct}% (Pass score: ${res.score})`);

      if (res.inventedPaths.length > 0) {
        console.log(`  - FLAGGED INVENTED PATHS: ${res.inventedPaths.join(", ")}`);
        console.log("    (Check context: none of these paths were present in the model's input)");
      }
      console.log();
    }

    const accuracy = totalEvaluated > 0 ? (passedCount / totalEvaluated) * 100 : 100;
    console.log("--------------------------------------------------------------------------------");
    console.log(
      `Real Explanations Score: ${accuracy.toFixed(1)}% clean (${passedCount}/${totalEvaluated} explanations passed with 0 invented paths).`,
    );
    console.log(
      "--------------------------------------------------------------------------------\n",
    );
  }

  // 2. Spliced hallucination test (Acceptance check #2: Feed it an explanation with a made-up filename spliced in. It catches it.)
  console.log("Running Spliced Made-Up Filename Test (Acceptance Check #2)...");

  const sampleRealText = firstCleanSample?.content ?? FALLBACK_SAMPLE_TEXT;
  const sampleShownPaths = firstCleanSample ? [...firstCleanSample.shownPaths] : [...FALLBACK_SHOWN_PATHS];

  const madeUpPath = "src/fake/secret-auth-handler.js";
  const splicedText = `${sampleRealText}\n\nCoordinates authentication by referencing \`${madeUpPath}\` before processing requests.`;

  console.log(`Spliced fake filename into prose: "${madeUpPath}"`);
  const splicedResult = checkInventedPaths(splicedText, sampleShownPaths);

  if (!splicedResult.valid && splicedResult.inventedPaths.includes(madeUpPath)) {
    console.log("\n[SUCCESS] Invented-path check caught made-up filename!");
    console.log(`  - Flagged paths: ${splicedResult.inventedPaths.join(", ")}`);
    console.log(
      `  - Score: ${splicedResult.score} (Failing as expected due to hallucinated path)`,
    );
    console.log(`  - Hand-confirmation: "${madeUpPath}" is not in shown paths:`);
    console.log(`    Shown: [${sampleShownPaths.join(", ")}]`);
  } else {
    console.error("\n[FAILURE] Spliced hallucination was not caught! Result:", splicedResult);
    process.exit(1);
  }

  console.log("\n================================================================================");
  console.log("Invented-path evaluation finished successfully.");
  console.log("================================================================================");
}

main().catch((err: unknown) => {
  console.error("Invented-path evaluation error:", err);
  process.exit(1);
});