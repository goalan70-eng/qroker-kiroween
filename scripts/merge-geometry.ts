// Task 5.6 merge/report step. SYNTHETIC images, not real cameras.
//
//   npm run merge:geometry [-- --work-dir DIR] [--out-dir DIR] [--allow-partial]
//
// Reads the per-cell result files written by `measure-geometry --run` (default .geometry-work/tier<N>/*.json),
// checks them against the plan (every cell present with the planned n), and writes
// docs/optical/results/geometry-experiments.json and .md. Output is deterministic: cells are sorted by id, there
// are no timestamps and no benchmark timings, so running the merge twice gives byte-identical files.
// Exit code 2 when the data set is incomplete (unless --allow-partial).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { enumerateCells, type CellResult } from "../src/optical/testing/geometry-design";
import { buildReport, renderJson, renderMarkdown, type FailureDiagnostics } from "../src/optical/testing/geometry-report";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = resolve(ROOT, "docs/optical/results");

function parseArgs(argv: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (!a.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      m.set(a.slice(2), next);
      i++;
    } else m.set(a.slice(2), "true");
  }
  return m;
}

export function readResults(workDir: string): { results: Map<string, CellResult>; smokeFiles: string[] } {
  const results = new Map<string, CellResult>();
  const smokeFiles: string[] = [];
  for (const tier of [1, 2, 3, 4]) {
    const dir = resolve(workDir, `tier${tier}`);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
      const r = JSON.parse(readFileSync(resolve(dir, f), "utf8")) as CellResult & { smokeRun?: boolean };
      if (r.smokeRun === true) {
        smokeFiles.push(`tier${tier}/${f}`);
        continue;
      }
      results.set(r.id, r);
    }
  }
  return { results, smokeFiles };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const workDir = args.has("work-dir") ? resolve(ROOT, args.get("work-dir") as string) : resolve(ROOT, ".geometry-work");
  const outDir = args.has("out-dir") ? resolve(ROOT, args.get("out-dir") as string) : RESULTS_DIR;
  const diagPath = resolve(RESULTS_DIR, "geometry-failure-diagnostics.json");
  const diagnostics = existsSync(diagPath) ? (JSON.parse(readFileSync(diagPath, "utf8")) as FailureDiagnostics) : null;

  const cells = enumerateCells();
  const { results, smokeFiles } = readResults(workDir);
  if (smokeFiles.length > 0) console.warn(`ignored smoke-run files: ${smokeFiles.join(", ")}`);
  const report = buildReport(cells, results, diagnostics);
  const c = report.completeness;
  console.log(`cells found ${c.foundCells}/${c.plannedCells}, trials ${c.foundTrials}/${c.plannedTrials}, complete: ${c.complete}`);
  if (c.missing.length > 0) console.error(`missing cells (${c.missing.length}): ${c.missing.slice(0, 10).join(", ")}${c.missing.length > 10 ? ", ..." : ""}`);
  if (c.wrongTrialCount.length > 0) console.error(`cells with wrong n: ${c.wrongTrialCount.map((w) => w.id).join(", ")}`);
  if (c.unplanned.length > 0) console.error(`unplanned result files: ${c.unplanned.join(", ")}`);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "geometry-experiments.json"), renderJson(report));
  writeFileSync(resolve(outDir, "geometry-experiments.md"), renderMarkdown(report));
  console.log(`written to ${outDir}`);
  if (!c.complete && !args.has("allow-partial")) process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
