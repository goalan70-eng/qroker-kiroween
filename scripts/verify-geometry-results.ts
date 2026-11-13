// Task 5.6 stored-result audit (read-only). SYNTHETIC images, not real cameras.
//
//   npm run verify:geometry
//
// Checks the merged result files against the plan and against each other, with an independent recomputation of the
// zero-false-accept bound. Writes nothing. Exit code 1 when any check fails.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { enumerateCells } from "../src/optical/testing/geometry-design";
import { readResults } from "./merge-geometry";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const R = (p: string): string => resolve(ROOT, p);
const CODEBOOK_SHA256 = "515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4";

interface Cell {
  id: string;
  n: number;
  plannedTrials: number;
  correct: number;
  rejected: number;
  falseAccepts: number;
  rejectionKinds: Record<string, number>;
  failureCauses: Record<string, number>;
  falseAcceptSeeds: number[];
  falseAcceptUpperBound95: number | null;
  falseAcceptRate: number;
  correctRate: number;
  rejectedRate: number;
  expectation: "IDENTIFY" | "REJECT";
  rejectedSeedsSample: number[];
}

let failures = 0;
const check = (ok: boolean, text: string, detail = ""): void => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${text}${detail === "" ? "" : "  " + detail}`);
  if (!ok) failures++;
};
const sum = (o: Record<string, number>): number => Object.values(o).reduce((a, b) => a + b, 0);

const json = JSON.parse(readFileSync(R("docs/optical/results/geometry-experiments.json"), "utf8")) as { cells: Cell[]; disclaimer: string; completeness: { complete: boolean } };
const planned = enumerateCells();
const plannedIds = new Set(planned.map((c) => c.id));
const jsonIds = json.cells.map((c) => c.id);
const jsonIdSet = new Set(jsonIds);

check(planned.length === 824, "plan enumerates 824 cells", `(${planned.length})`);
check(plannedIds.size === planned.length, "planned cell ids are unique");
check(json.cells.length === 824 && jsonIdSet.size === 824, "result json has 824 distinct cells", `(${json.cells.length}/${jsonIdSet.size})`);
check(planned.every((c) => jsonIdSet.has(c.id)) && jsonIds.every((id) => plannedIds.has(id)), "result cell ids equal planned cell ids (none missing, none extra)");
check(json.completeness.complete === true, "result json completeness.complete is true");

const raw = readResults(R(".geometry-work"));
check(raw.results.size === 824 && raw.smokeFiles.length === 0, "stored per-cell files: 824, smoke files 0", `(${raw.results.size}, ${raw.smokeFiles.length})`);
check(planned.every((c) => raw.results.has(c.id)), "every planned cell has a stored per-cell file");

const totalN = json.cells.reduce((t, c) => t + c.n, 0);
const plannedN = planned.reduce((t, c) => t + c.trials, 0);
check(totalN === 168000, "sum of n over cells is 168000", `(${totalN})`);
check(plannedN === 168000, "sum of planned trials is 168000", `(${plannedN})`);
check(json.cells.every((c) => c.n === (planned.find((p) => p.id === c.id)?.trials ?? -1)), "every cell n equals its planned trial count");
check(json.cells.every((c) => c.n === c.plannedTrials), "n equals plannedTrials in every cell");

let badBook = 0;
let badKinds = 0;
let badCauses = 0;
let badFaSeeds = 0;
let badRates = 0;
let badBound = 0;
let boundCells = 0;
let boundMaxExpDiff = 0;
let faCells = 0;
let faCellsBad = 0;
for (const c of json.cells) {
  if (c.correct + c.rejected + c.falseAccepts !== c.n) badBook++;
  if (sum(c.rejectionKinds) !== c.rejected) badKinds++;
  // failure causes: failing rejected trials (only counted for IDENTIFY cells) + false accepts
  const expectedCauses = (c.expectation === "IDENTIFY" ? c.rejected : 0) + c.falseAccepts;
  if (sum(c.failureCauses) !== expectedCauses) badCauses++;
  if (c.falseAcceptSeeds.length !== c.falseAccepts) badFaSeeds++;
  if (c.correctRate !== c.correct / c.n || c.rejectedRate !== c.rejected / c.n || c.falseAcceptRate !== c.falseAccepts / c.n) badRates++;
  if (c.falseAccepts === 0) {
    boundCells++;
    const viaPow = 1 - Math.pow(0.05, 1 / c.n);
    const viaExp = -Math.expm1(Math.log(0.05) / c.n); // independent formula: 1 - exp(ln(0.05)/n)
    boundMaxExpDiff = Math.max(boundMaxExpDiff, Math.abs(viaExp - (c.falseAcceptUpperBound95 as number)));
    if (c.falseAcceptUpperBound95 !== viaPow || !(Math.abs(viaExp - (c.falseAcceptUpperBound95 as number)) < 1e-14)) badBound++;
  } else {
    faCells++;
    if (c.falseAcceptUpperBound95 !== null || c.falseAcceptSeeds.length === 0) faCellsBad++;
  }
}
check(badBook === 0, "correct + rejected + falseAccepts = n in every cell", `(${badBook} bad)`);
check(badKinds === 0, "sum of rejectionKinds = rejected in every cell", `(${badKinds} bad)`);
check(badCauses === 0, "sum of failureCauses = failing rejected (IDENTIFY cells) + false accepts in every cell", `(${badCauses} bad)`);
check(badFaSeeds === 0, "falseAcceptSeeds.length = falseAccepts in every cell", `(${badFaSeeds} bad)`);
check(badRates === 0, "stored rates equal count / n in every cell", `(${badRates} bad)`);
check(badBound === 0, "bound equals 1 - 0.05^(1/n) exactly (pow) and within 1e-14 of the expm1/log form in every zero-FA cell", `(${boundCells} cells, max |pow - expm1| = ${boundMaxExpDiff.toExponential(2)}, ${badBound} bad)`);
check(faCellsBad === 0, "every cell with false accepts lists its failing seeds and has no bound", `(${faCells} cells with false accepts)`);
const rejectCells = json.cells.filter((c) => c.expectation === "REJECT");
check(rejectCells.every((c) => c.correct === 0), "cells with an absent card have correct = 0 (rejection is counted as rejected, not correct)", `(${rejectCells.length} cells)`);

// the same bookkeeping on the raw per-cell files, and equality with the merged json
let rawMismatch = 0;
for (const c of json.cells) {
  const r = raw.results.get(c.id);
  if (r === undefined || r.n !== c.n || r.correct !== c.correct || r.rejected !== c.rejected || r.falseAccepts !== c.falseAccepts || r.falseAcceptUpperBound95 !== c.falseAcceptUpperBound95) rawMismatch++;
}
check(rawMismatch === 0, "merged json equals the stored per-cell files (n, correct, rejected, false accepts, bound)", `(${rawMismatch} mismatches)`);

// synthetic-limitation statements
const synthetic = /synthetic images, not real cameras/i;
const files = [
  "docs/optical/results/geometry-experiments-plan.md",
  "docs/optical/results/geometry-experiments.md",
  "docs/optical/results/geometry-experiments.json",
  "docs/optical/results/geometry-failure-diagnostics.json",
  "docs/optical/results/geometry-bench.json",
  "docs/optical/results/m5-6-tier1-output.txt",
  "docs/optical/results/m5-6-tier2-output.txt",
  "docs/optical/results/m5-6-tier3-output.txt",
  "docs/optical/results/m5-6-tier4-output.txt",
];
for (const f of files) {
  const ok = existsSync(R(f)) && synthetic.test(readFileSync(R(f), "utf8"));
  check(ok, `synthetic limitation stated in ${f}`);
}
let rawNoDisclaimer = 0;
for (const r of raw.results.values()) if (!synthetic.test((r as unknown as { disclaimer: string }).disclaimer ?? "")) rawNoDisclaimer++;
check(rawNoDisclaimer === 0, "every stored per-cell file carries the synthetic disclaimer", `(${rawNoDisclaimer} without)`);
check(synthetic.test(json.disclaimer) && /zero-event bound applies only/i.test(json.disclaimer), "json disclaimer limits the zero-event bound to the sampled synthetic distribution");

// codebook
const codebook = createHash("sha256").update(readFileSync(R("src/optical/codebook.v1.json"))).digest("hex").toUpperCase();
check(codebook === CODEBOOK_SHA256, "frozen codebook SHA256 unchanged", `(${codebook})`);

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
