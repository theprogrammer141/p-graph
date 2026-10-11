import { writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "./index.ts";
/** Parses the repository supplied on the command line, prints coverage, and optionally writes JSON. */
function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const outFile = outIndex >= 0 ? args[outIndex + 1] : undefined;
  
  const rootArg = args.find((a) => !a.startsWith("--"));
  if (!rootArg) {
    console.error("Usage: cli.ts <directory> [--out <file.json>]");
    process.exit(1);
  }

  const root = path.resolve(rootArg);
  let filesParsed = 0;
  
  console.log(`Parsing repository at: ${root}`);
  const start = Date.now();
  
  const result = parse(root, {
    onStartFile: () => {
      filesParsed++;
      if (filesParsed % 100 === 0) {
        process.stdout.write(`\rParsed ${filesParsed} files...`);
      }
    }
  });

  process.stdout.write(`\rParsed ${filesParsed} files.      \n`);
  const ms = Date.now() - start;

  console.log(`Adapter: ${result.adapter}`);

  const { files: covF, imports: covI } = result.coverage;

  console.log(`\nFiles: ${covF.found} found, ${covF.parsed} parsed, ${covF.skipped} skipped.`);
  if (covF.skipped > 0) {
    console.log(`Skips:`);
    for (const [reason, count] of Object.entries(covF.skippedByReason)) {
      if (count > 0) console.log(`  ${count.toString().padStart(4)} ${reason}`);
    }
  }

  console.log(`\nImports: ${covI.found} found`);
  console.log(`  ${covI.resolved.toString().padStart(4)} resolved`);
  console.log(`  ${covI.external.toString().padStart(4)} external`);
  console.log(`  ${covI.excluded.toString().padStart(4)} excluded`);
  const reExports = covI.byKind["re-export"];
  console.log(`\nRe-exports: ${reExports.found} found`);
  console.log(`  ${reExports.resolved.toString().padStart(4)} resolved`);
  console.log(`  ${reExports.external.toString().padStart(4)} external`);
  console.log(`  ${reExports.excluded.toString().padStart(4)} excluded`);
  console.log(`  ${reExports.unresolved.toString().padStart(4)} unresolved`);

  const reqs = covI.byKind["require"];
  if (reqs.found > 0) {
    console.log(`\nRequires: ${reqs.found} found`);
    console.log(`  ${reqs.resolved.toString().padStart(4)} resolved`);
    console.log(`  ${reqs.external.toString().padStart(4)} external`);
    console.log(`  ${reqs.excluded.toString().padStart(4)} excluded`);
    console.log(`  ${reqs.unresolved.toString().padStart(4)} unresolved`);
  }

  if (covI.unresolved > 0) {
    console.log(`\nUnresolved by reason:`);
    for (const [reason, count] of Object.entries(covI.unresolvedByReason)) {
      if (count > 0) console.log(`  ${count.toString().padStart(4)} ${reason}`);
    }
    console.log(`\nSample unresolved imports:`);
    const sample = result.imports.filter((i) => i.outcome.status === "unresolved").slice(0, 5);
    for (const imp of sample) {
      console.log(`  ${imp.from}:${imp.line} -> ${imp.specifier ?? "(non-literal)"}`);
      if (imp.outcome.status === "unresolved") {
        console.log(`    ${imp.outcome.detail}`);
      }
    }
  }

  console.log(`\nFound ${result.files.length} nodes and ${result.edges.length} edges in ${ms}ms.`);
  const moduleCount = new Set(result.files.map(f => f.module)).size;
  console.log(`Nodes are grouped into ${moduleCount} modules.`);

  if (outFile) {
    writeFileSync(outFile, JSON.stringify(result, null, 2));
    console.log(`Wrote result to ${outFile}`);
  }
}

main();
