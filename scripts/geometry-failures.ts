// Task 5.6 failure analysis and reproduction. SYNTHETIC images, not real cameras.
//
//   npm run analyze:geometry -- --repro --cell <cell id> --seed <seed>   re-run one trial and print what the reader saw
//   npm run analyze:geometry [-- --work-dir DIR] [--out FILE]            re-run the recorded failing seeds of every cell
//
// The analysis re-runs (a) every false-accept seed and (b) the recorded failing seeds of every cell (at most 20
// per cell, see `rejectedSeedsSample`), and checks whether the known detector finding (an isolated black blob
// read as the marker pattern 0x1FFFFFF, documented for bits 0x5AC54 in m4-3-coverage.md) occurred and whether it
// became a group member. Nothing is changed in the detector, the decoder, any threshold or any geometry.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { detectMarkers } from "../src/optical/detect";
import { decodeGroup, type GroupDecodeResult } from "../src/optical/decode-group";
import { CLEAN_DARK, SYNTHETIC_DISCLAIMER, cellId, enumerateCells, type Cell, type CellParams, type CellResult } from "../src/optical/testing/geometry-design";
import type { FailureDiagnostics } from "../src/optical/testing/geometry-report";
import { classify, decodeScenarioImage, geometryOf, markerCenterOffsetModules, runTrial } from "../src/optical/testing/geometry-trial";
import { readResults } from "./merge-geometry";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BLOB_BITS = 0x1ffffff;

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

interface TrialLook {
  cls: string;
  kind: string;
  cause: string;
  blobsDetected: number;
  smallestMarkerPx: number | null;
  blobIsMember: boolean;
  spuriousCandidates: number;
  decoded: string;
  truth: string;
}

function look(cell: Cell, seed: number): TrialLook {
  const out = runTrial(cell.params, seed, { keepImage: true });
  const image = out.image!;
  const sc = out.scenario!;
  const g = geometryOf(cell.params);
  const det = detectMarkers(image);
  const markers = det.kind === "DETECTED" ? det.markers : [];
  const res: GroupDecodeResult = decodeScenarioImage(image, cell.params, g);
  const members = "members" in res ? res.members : [];
  const others = "others" in res ? res.others : [];
  const decoded =
    res.kind === "IDENTIFIED"
      ? `IDENTIFIED cards [${[...res.cards].sort().join(" ")}] sum ${res.hiddenSum}, reflection ${res.reflection}, reading distances ${res.readings.map((r) => `${r.card}@${r.slot}:${r.distance}`).join(" ")}`
      : res.kind === "INCOMPLETE_GROUP"
        ? `INCOMPLETE_GROUP detected ${res.detected}, markers ${res.markers}`
        : res.kind;
  return {
    cls: out.record.cls,
    kind: out.record.kind,
    cause: out.record.cause,
    blobsDetected: markers.filter((m) => m.bits === BLOB_BITS).length,
    smallestMarkerPx: markers.length === 0 ? null : Math.round(Math.min(...markers.map((m) => m.sizePx)) * 10) / 10,
    blobIsMember: members.some((m) => m.marker.bits === BLOB_BITS),
    spuriousCandidates: others.filter((o) => o.classification === "SPURIOUS_CANDIDATE").length,
    decoded,
    truth: `cards [${sc.truthCards.join(" ")}] sum ${sc.truthSum}`,
  };
}

const PROBE_SEEDS = 20;
const PROBE_TOLERANCES = [1, 1.5, 2];
const PROBE_CELLS: Array<{ name: string; params: Partial<CellParams> }> = [
  { name: "FRONT, cut offset 1.0 mm", params: { face: "FRONT", cutOffsetMm: 1.0 } },
  { name: "BACK_VERTICAL, registration shift 1.0 mm", params: { face: "BACK_VERTICAL", regShiftMm: 1.0 } },
  { name: "BACK_VERTICAL, registration rotation 1 deg", params: { face: "BACK_VERTICAL", regRotDeg: 1 } },
  { name: "placement rotation bound 2 deg", params: { rotationDeg: 2 } },
];

/**
 * Diagnostic probes (nothing in the reader is changed): (1) the first failing seeds of four baseline-geometry
 * cells are decoded again with a larger positionToleranceModules (the default is 1.0) to test whether marker
 * displacement against the reader's position tolerance explains the failures; (2) the decoder outcome of the
 * first failing seeds of the DEG45 / inset 2 cell, where every trial was rejected.
 */
function runProbes(byId: Map<string, Cell>, results: Map<string, CellResult>): string[] {
  const out: string[] = [];
  for (const pc of PROBE_CELLS) {
    const params = Object.assign({}, CLEAN_DARK, pc.params) as CellParams;
    const cell = byId.get(cellId(params));
    const r = cell === undefined ? undefined : results.get(cell.id);
    if (cell === undefined || r === undefined) continue;
    const seeds = r.rejectedSeedsSample.slice(0, PROBE_SEEDS);
    const g = geometryOf(params);
    const counts = PROBE_TOLERANCES.map(() => ({ CORRECT: 0, REJECTED: 0, FALSE_ACCEPT: 0 }));
    for (const seed of seeds) {
      const o = runTrial(params, seed, { keepImage: true });
      PROBE_TOLERANCES.forEach((tol, k) => {
        const res = decodeGroup(o.image!, { centerOffsetModules: markerCenterOffsetModules(g), positionToleranceModules: tol });
        const c = classify(res, o.scenario!, params, false);
        counts[k]![c.cls]++;
      });
    }
    out.push(
      `Probe, ${pc.name} (r=3.175 mm, inset 1, ${seeds.length} failing seeds of cell ${cell.id}): re-decoded with positionToleranceModules ` +
        PROBE_TOLERANCES.map((t, k) => `${t}: correct ${counts[k]!.CORRECT}, rejected ${counts[k]!.REJECTED}, false accept ${counts[k]!.FALSE_ACCEPT}`).join("; ") +
        ". This is a diagnostic re-run of failing seeds only; the reader's tolerance was not changed and the other cells were not re-run.",
  );
  }
  const d45 = byId.get(cellId(Object.assign({}, CLEAN_DARK, { insetModules: 2, cameraRotation: "DEG45" }) as CellParams));
  const r45 = d45 === undefined ? undefined : results.get(d45.id);
  if (d45 !== undefined && r45 !== undefined) {
    const lines = r45.rejectedSeedsSample.slice(0, 6).map((s) => `seed ${s}: ${look(d45, s).decoded}`);
    out.push(`Probe, camera rotation exactly 45 deg at inset 2 (cell ${d45.id}, ${r45.rejected} of ${r45.n} trials rejected): ${lines.join("; ")}.`);
  }
  return out;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const cells = enumerateCells();
  const byId = new Map(cells.map((c) => [c.id, c]));

  if (args.has("repro")) {
    const id = args.get("cell");
    const seed = Number(args.get("seed"));
    const cell = id === undefined ? undefined : byId.get(id);
    if (cell === undefined || !Number.isInteger(seed)) throw new Error("--repro needs --cell <known cell id> and --seed <integer>");
    console.log(JSON.stringify({ cell: cell.id, label: cell.label, seed, ...look(cell, seed) }, null, 2));
    return;
  }

  const workDir = args.has("work-dir") ? resolve(ROOT, args.get("work-dir") as string) : resolve(ROOT, ".geometry-work");
  const out = resolve(ROOT, args.has("out") ? (args.get("out") as string) : "docs/optical/results/geometry-failure-diagnostics.json");
  const perCell = args.has("per-cell") ? Number(args.get("per-cell")) : 20;
  const { results } = readResults(workDir);
  const ids = [...results.keys()].sort();

  let analyzed = 0;
  let withBlobDetected = 0;
  let withSpurious = 0;
  const consequential: FailureDiagnostics["consequentialSpurious"] = [];
  const blobNotMember: Array<{ cellId: string; seed: number; kind: string }> = [];
  const faNotes: FailureDiagnostics["falseAcceptNotes"] = [];
  for (const id of ids) {
    const r = results.get(id)!;
    const cell = byId.get(id);
    if (cell === undefined) continue;
    const seeds = [...new Set([...r.falseAcceptSeeds, ...(r.expectation === "IDENTIFY" ? r.rejectedSeedsSample.slice(0, perCell) : [])])];
    for (const seed of seeds) {
      const l = look(cell, seed);
      analyzed++;
      if (l.blobsDetected > 0) withBlobDetected++;
      if (l.spuriousCandidates > 0) withSpurious++;
      if (l.blobIsMember) consequential.push({ cellId: id, seed, kind: l.kind, spuriousCandidates: l.spuriousCandidates });
      else if (l.blobsDetected > 0) blobNotMember.push({ cellId: id, seed, kind: l.kind });
      if (l.cls === "FALSE_ACCEPT") faNotes.push({ cellId: id, seed, text: `truth ${l.truth}; reader returned ${l.decoded}; cause ${l.cause}; blobs detected ${l.blobsDetected}` });
    }
  }
  const diag: FailureDiagnostics = {
    disclaimer: SYNTHETIC_DISCLAIMER,
    method:
      `Every recorded false-accept seed and the first ${perCell} recorded failing seeds of every cell were re-run and the image given to the reader was inspected. ` +
      "A blob is a detected marker with bits 0x1FFFFFF (the signature of the documented 0x5AC54 finding: an isolated black blob inside a marker data area accepted as a marker). " +
      "A failure counts as consequentially spurious only when such a blob was a member of the decoded group. " +
      `Trials with a blob detected (anywhere in the image): ${withBlobDetected}; of these, blob not a group member: ${blobNotMember.length}.`,
    analyzedTrials: analyzed,
    trialsWithSpuriousCandidates: withSpurious,
    consequentialSpurious: consequential,
    falseAcceptNotes: faNotes,
    limits: [
      `Only the first ${perCell} recorded failing seeds per cell were re-run (a cell stores at most 20); cells with more failures than that are covered by a sample of their failures, not all of them. Correct trials were not inspected.`,
      "The decoder result lists no markers for NOT_DETECTED, INVALID_MARKER and INCOMPLETE_GROUP; for these the image was checked with detectMarkers directly, so a blob can be seen but its effect on the result is not attributable from the result alone.",
      "A spurious marker other than the 0x1FFFFFF signature (SPURIOUS_CANDIDATE with other bits) is counted in trialsWithSpuriousCandidates but not classified.",
    ],
  };
  diag.probes = runProbes(byId, results);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(diag, null, 2) + "\n");
  console.log(`analyzed ${analyzed} trials; blob detected in ${withBlobDetected}; blob as group member in ${consequential.length}; false-accept notes ${faNotes.length}; written to ${out}`);
  if (!existsSync(out)) process.exitCode = 1;
}

main();
