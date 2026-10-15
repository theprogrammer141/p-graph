import "./env";
import { Client } from "langsmith";
import { evaluate } from "langsmith/evaluation";
import { getAIClient, PINNED_MODEL } from "@/lib/ai/client";

interface PromptEvalInput {
  readonly filePath: string;
  readonly lines: number;
  readonly role?: string;
  readonly imports: readonly string[];
  readonly importedBy: readonly string[];
}

const DATASET_NAME = "p-graph-prompt-eval";

/**
 * Representative dataset of files with real graph neighbours.
 */
const EVAL_EXAMPLES: Array<{ inputs: PromptEvalInput; outputs: { expectedNeighboursCount: number } }> = [
  {
    inputs: {
      filePath: "src/config/morgan.js",
      lines: 28,
      role: "config",
      imports: ["src/config/config.js", "src/config/logger.js"],
      importedBy: ["src/app.js"],
    },
    outputs: { expectedNeighboursCount: 3 },
  },
  {
    inputs: {
      filePath: "src/controllers/auth.controller.js",
      lines: 85,
      role: "controller",
      imports: [
        "src/services/auth.service.js",
        "src/services/user.service.js",
        "src/services/token.service.js",
        "src/utils/catchAsync.js",
      ],
      importedBy: ["src/routes/v1/auth.route.js"],
    },
    outputs: { expectedNeighboursCount: 5 },
  },
  {
    inputs: {
      filePath: "src/services/auth.service.js",
      lines: 95,
      role: "service",
      imports: [
        "src/services/token.service.js",
        "src/services/user.service.js",
        "src/models/token.model.js",
        "src/utils/ApiError.js",
      ],
      importedBy: ["src/controllers/auth.controller.js"],
    },
    outputs: { expectedNeighboursCount: 5 },
  },
  {
    inputs: {
      filePath: "src/models/user.model.js",
      lines: 110,
      role: "model",
      imports: ["src/config/roles.js"],
      importedBy: ["src/services/user.service.js", "src/services/auth.service.js"],
    },
    outputs: { expectedNeighboursCount: 3 },
  },
  {
    inputs: {
      filePath: "src/app.js",
      lines: 45,
      role: "entry",
      imports: [
        "src/config/morgan.js",
        "src/config/passport.js",
        "src/routes/v1/index.js",
        "src/middlewares/error.js",
      ],
      importedBy: ["src/index.js"],
    },
    outputs: { expectedNeighboursCount: 5 },
  },
];

/**
 * Current explanation prompt (v2) from lib/ai/explain.ts.
 */
async function runCurrentPrompt(inputs: PromptEvalInput): Promise<{ explanation: string; version: string }> {
  const client = getAIClient();

  const systemPrompt = `You are a concise codebase explainer. Explain what this file does specifically in the context of its actual neighbours in the dependency graph.

Formatting rules:
- Use EXACTLY three pieces of formatting: inline code (\`code\`), bold (**bold**), and bullets (- bullet).
- NO headings of any kind (do NOT use #, ##, ###, etc.).
- When referencing other files, mention their exact repository path so the developer can click them.
- Keep the explanation dense, informative, and short (1-2 paragraphs).
- Do NOT guess or invent connections. Every neighbour was extracted by parsing the code.`;

  const userPrompt = `File: ${inputs.filePath}
Lines: ${inputs.lines}
${inputs.role ? `Current Role: ${inputs.role}\n` : ""}Imports (${inputs.imports.length} files):
${inputs.imports.length > 0 ? inputs.imports.map((p) => `- ${p}`).join("\n") : "(none)"}

Imported By (${inputs.importedBy.length} files):
${inputs.importedBy.length > 0 ? inputs.importedBy.map((p) => `- ${p}`).join("\n") : "(none)"}

Explain what this file does in the architecture based on its actual neighbours.`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model: PINNED_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 500,
      });

      return {
        explanation: completion?.choices?.[0]?.message?.content?.trim() ?? "",
        version: "v2-current",
      };
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }

  return { explanation: "", version: "v2-current" };
}

/**
 * Retired explanation prompt (v1).
 * Constraint: Lives strictly with evals, never in the application code.
 */
async function runRetiredPrompt(inputs: PromptEvalInput): Promise<{ explanation: string; version: string }> {
  const client = getAIClient();

  const systemPrompt = `You are a helpful software engineer. Explain what this code file does.`;

  const userPrompt = `File: ${inputs.filePath}
Imports:
${inputs.imports.join(", ") || "none"}

What does this file do?`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model: PINNED_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 500,
      });

      return {
        explanation: completion?.choices?.[0]?.message?.content?.trim() ?? "",
        version: "v1-retired",
      };
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }

  return { explanation: "", version: "v1-retired" };
}

/**
 * Model-as-judge evaluator.
 * Constraint: Prompt-version comparison unavoidably requires a model judge.
 * Scores specificity to actual neighbours, formatting discipline (no headings, tight), and path references.
 */
async function judgeExplanationQuality(params: {
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
}): Promise<{ key: string; score?: number; comment: string }> {
  const client = getAIClient();
  const fileInput = params.inputs as unknown as PromptEvalInput;
  const explanation = (params.outputs?.explanation as string) ?? "";

  const systemPrompt = `You are an expert code architect judging the quality of an automated codebase explanation for a developer navigation tool.
Evaluate the explanation on a continuous scale from 0.0 to 1.0 based on these criteria:
1. Specificity & Architectural Utility: Does it explain what the file does specifically in terms of its actual neighbour dependencies, rather than reciting generic boilerplate?
2. Formatting Discipline: Adheres to dense UI tool formatting (NO markdown headings like #, ##, ###, which break narrow panes; allows inline code, bold, bullets).
3. Path Precision: References exact repository file paths.

Output ONLY a JSON object in this format:
{"score": <number between 0.0 and 1.0>, "reasoning": "<1-2 sentence justification>"}`;

  const userPrompt = `File: ${fileInput.filePath}
Actual Imports: ${fileInput.imports.join(", ") || "none"}
Imported By: ${fileInput.importedBy?.join(", ") || "none"}

Generated Explanation to Evaluate:
${explanation}

Judge this explanation.`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model: PINNED_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 250,
      });

      const raw = completion?.choices?.[0]?.message?.content?.trim() ?? "";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const score = typeof parsed.score === "number" ? Math.max(0, Math.min(1, parsed.score)) : 0.5;
        return {
          key: "utility_and_specificity",
          score,
          comment: parsed.reasoning || "Evaluation completed",
        };
      }
    } catch {
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }

  // Report judge failure as unavailable instead of scoring with an arbitrary fallback
  return {
    key: "utility_and_specificity",
    comment: "Judge model evaluation unavailable (all attempts failed)",
  };
}

async function main() {
  const client = new Client({
    apiKey: process.env.LANGSMITH_API_KEY,
    apiUrl: process.env.LANGSMITH_ENDPOINT,
  });

  const shouldRerun = process.argv.includes("--rerun");

  console.log("================================================================================");
  console.log("Phase 11: Prompt Version Comparison (Current vs Retired)");
  console.log("================================================================================\n");

  // 1. Ensure dataset exists in LangSmith and has all expected examples
  console.log(`Setting up LangSmith dataset "${DATASET_NAME}"...`);
  let dataset: { id: string } | null = null;
  try {
    const existing = await client.readDataset({ datasetName: DATASET_NAME });
    dataset = existing;
    console.log(`Found existing LangSmith dataset: ${dataset.id}`);
  } catch {
    dataset = await client.createDataset(DATASET_NAME, {
      description: "Representative files with actual neighbours for comparing explanation prompt versions",
    });
    console.log(`Created new LangSmith dataset: ${dataset.id}`);
  }

  const existingExamples = new Set<string>();
  for await (const example of client.listExamples({ datasetId: dataset.id })) {
    const filePath = (example.inputs as { filePath?: string })?.filePath;
    if (filePath) {
      existingExamples.add(filePath);
    }
  }

  for (const ex of EVAL_EXAMPLES) {
    if (!existingExamples.has(ex.inputs.filePath)) {
      await client.createExample(ex.inputs, ex.outputs, { datasetId: dataset.id });
      existingExamples.add(ex.inputs.filePath);
    }
  }

  // Check existing experiments on this dataset paired by comparisonRunId metadata
  let currentProject: { id: string; name: string } | null = null;
  let retiredProject: { id: string; name: string } | null = null;

  if (!shouldRerun && dataset) {
    const pairsByRunId = new Map<
      string,
      { current?: { id: string; name: string }; retired?: { id: string; name: string } }
    >();

    for await (const p of client.listProjects({ referenceDatasetId: dataset.id })) {
      const pName = p.name ?? "";
      const meta = (p.extra?.metadata ?? p.extra ?? {}) as Record<string, unknown>;
      const runId = typeof meta.comparisonRunId === "string" ? meta.comparisonRunId : null;

      if (runId) {
        const pair = pairsByRunId.get(runId) ?? {};
        if (pName.startsWith("prompt-current-v2-")) {
          pair.current = { id: p.id, name: pName };
        } else if (pName.startsWith("prompt-retired-v1-")) {
          pair.retired = { id: p.id, name: pName };
        }
        pairsByRunId.set(runId, pair);
      }
    }

    for (const [, pair] of pairsByRunId) {
      if (pair.current && pair.retired) {
        currentProject = pair.current;
        retiredProject = pair.retired;
        break;
      }
    }
  }

  // If rerun requested or no paired existing experiments found, run evaluate()
  if (shouldRerun || !currentProject || !retiredProject) {
    const comparisonRunId = `compare-${Date.now()}`;
    console.log(`\nStarting paired comparison run "${comparisonRunId}"...`);

    console.log("\nRunning Experiment 1: Current Prompt (v2)...");
    const currentExp = await evaluate(runCurrentPrompt, {
      data: DATASET_NAME,
      experimentPrefix: "prompt-current-v2",
      metadata: { comparisonRunId, promptVersion: "v2-current" },
      evaluators: [judgeExplanationQuality],
      client,
      maxConcurrency: 1,
    });
    const sessionId = (currentExp.results[0]?.run?.session_id as string) ?? currentExp.experimentName;
    currentProject = { id: sessionId, name: currentExp.experimentName };

    console.log("\nRunning Experiment 2: Retired Prompt (v1)...");
    const retiredExp = await evaluate(runRetiredPrompt, {
      data: DATASET_NAME,
      experimentPrefix: "prompt-retired-v1",
      metadata: { comparisonRunId, promptVersion: "v1-retired" },
      evaluators: [judgeExplanationQuality],
      client,
      maxConcurrency: 1,
    });
    const retiredSessionId = (retiredExp.results[0]?.run?.session_id as string) ?? retiredExp.experimentName;
    retiredProject = { id: retiredSessionId, name: retiredExp.experimentName };
  }

  // Fetch runs and feedback from both experiments in LangSmith
  console.log(`\nRetrieving side-by-side scores from LangSmith experiments:`);
  console.log(`  - Current Experiment: ${currentProject.name} (${currentProject.id})`);
  console.log(`  - Retired Experiment: ${retiredProject.name} (${retiredProject.id})`);

  const currentDetails: Map<string, { score: number; comment: string }> = new Map();
  for await (const r of client.listRuns({ projectName: currentProject.name, isRoot: true })) {
    const filePath = (r.inputs as PromptEvalInput)?.filePath || r.name;
    for await (const f of client.listFeedback({ runIds: [r.id] })) {
      if (typeof f.score === "number") {
        currentDetails.set(filePath, { score: f.score, comment: f.comment ?? "" });
        break;
      }
    }
  }

  const retiredDetails: Map<string, { score: number; comment: string }> = new Map();
  for await (const r of client.listRuns({ projectName: retiredProject.name, isRoot: true })) {
    const filePath = (r.inputs as PromptEvalInput)?.filePath || r.name;
    for await (const f of client.listFeedback({ runIds: [r.id] })) {
      if (typeof f.score === "number") {
        retiredDetails.set(filePath, { score: f.score, comment: f.comment ?? "" });
        break;
      }
    }
  }

  const testPaths = EVAL_EXAMPLES.map((e) => e.inputs.filePath);
  const currentScores: number[] = [];
  const retiredScores: number[] = [];

  console.log("\n================================================================================");
  console.log("SIDE-BY-SIDE PROMPT VERSION EVALUATION RESULTS (LANGSMITH DASHBOARD)");
  console.log("================================================================================");
  let dashboardCompareUrl: string;
  try {
    const datasetUrl = await client.getDatasetUrl({ datasetId: dataset.id });
    dashboardCompareUrl = `${datasetUrl}/compare?selectedSessions=${currentProject.id}&selectedSessions=${retiredProject.id}`;
  } catch {
    const endpoint = process.env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com";
    const host = endpoint.includes("apac") ? "https://apac.smith.langchain.com" : "https://smith.langchain.com";
    dashboardCompareUrl = `${host}/datasets/${dataset.id}/compare?selectedSessions=${currentProject.id}&selectedSessions=${retiredProject.id}`;
  }
  console.log(`Dashboard Compare URL:\n${dashboardCompareUrl}`);
  console.log("--------------------------------------------------------------------------------");
  console.log("File Path".padEnd(42) + "Current (v2)".padEnd(16) + "Retired (v1)".padEnd(16));
  console.log("--------------------------------------------------------------------------------");

  for (const filePath of testPaths) {
    const cur = currentDetails.get(filePath);
    const ret = retiredDetails.get(filePath);
    const curScore = cur?.score;
    const retScore = ret?.score;

    if (typeof curScore === "number") currentScores.push(curScore);
    if (typeof retScore === "number") retiredScores.push(retScore);

    const curDisplay = typeof curScore === "number" ? curScore.toFixed(2) : "N/A";
    const retDisplay = typeof retScore === "number" ? retScore.toFixed(2) : "N/A";

    console.log(
      filePath.padEnd(42) +
        curDisplay.padEnd(16) +
        retDisplay.padEnd(16),
    );
  }

  if (currentScores.length === 0 || retiredScores.length === 0) {
    console.log("--------------------------------------------------------------------------------");
    console.error("Error: One or both experiments produced no valid quality scores (feedback unavailable).");
    console.log("--------------------------------------------------------------------------------");
    process.exit(1);
  }

  const currentAvg = currentScores.reduce((a, b) => a + b, 0) / currentScores.length;
  const retiredAvg = retiredScores.reduce((a, b) => a + b, 0) / retiredScores.length;
  const difference = currentAvg - retiredAvg;
  const pctImprovement = retiredAvg > 0 ? (difference / retiredAvg) * 100 : 0;

  console.log("--------------------------------------------------------------------------------");
  console.log(
    "Average Quality Score:".padEnd(42) +
      currentAvg.toFixed(2).padEnd(16) +
      retiredAvg.toFixed(2).padEnd(16),
  );
  console.log("--------------------------------------------------------------------------------");

  if (difference >= 0) {
    console.log(
      `Conclusion: Current prompt (v2) is better by +${difference.toFixed(2)} (+${pctImprovement.toFixed(1)}% improvement).`,
    );
  } else {
    console.log(
      `Conclusion: Retired prompt scored higher by +${Math.abs(difference).toFixed(2)}.`,
    );
  }

  console.log("\nImportant Note (Methodology Disclaimer):");
  console.log(
    'Evaluated using model-as-judge (LLM-graded): "is this specific enough to be useful" has',
  );
  console.log(
    "no exact closed-form answer. These scores reflect model judgment rather than exact",
  );
  console.log("deterministic set-membership measurement.");
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Prompt comparison evaluation failed:", err);
  process.exit(1);
});
