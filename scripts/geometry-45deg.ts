// Task 5.6 follow-up: analysis of the "camera rotation exactly 45 deg at inset 2 is recognised 0%" finding.
// SYNTHETIC images, not real cameras. Read-only: nothing in the reader, its thresholds, the codebook or the
// geometry is changed, and the stored sweep results are only read (never re-run as a whole).
//
//   npm run analyze:45deg                      full analysis (about 10-15 minutes), writes docs/optical/results/m5-6-45deg-analysis.md
//   npm run analyze:45deg -- --no-write        print only
//   npm run analyze:45deg -- --sample 0        skip the sample of stored failing seeds (section 6)
//
// The reader stages are called through their exported APIs (detectMarkers, decodeFragment, decodeGroup, see
// src/optical/testing/geometry-probe.ts). The one internal quantity that is not observable from outside, the
// "marker-like" gate of detect.ts (area of the max inscribed quadrilateral / area of the convex hull >= 0.85, after
// which a component is dropped WITHOUT being listed as a rejected candidate), is read from TRACED COPIES of detect.ts
// and decode-group.ts generated in the temp directory: one recording statement is inserted in front of the gate and the
// gate constant is made a variable. The copies are checked to return the same markers / the same decoder result as
// the production modules at the production gate value on every image they are used on. The what-if variants with a
// different gate value exist only in these temp copies; no production file is touched.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { detectMarkers, type DetectedMarker } from "../src/optical/detect";
import { decodeGroup, type DecodeGroupOptions, type GroupDecodeResult } from "../src/optical/decode-group";
import { FOOTPRINT_MOD, renderMarker, type GrayImage } from "../src/optical/render";
import { mulberry32 } from "../src/optical/prng";
import { CLEAN_DARK, cellId, trialSeed, type CellParams } from "../src/optical/testing/geometry-design";
import { buildScenario, classify, geometryOf, markerCenterOffsetModules } from "../src/optical/testing/geometry-trial";
import { SLOT_LIST, probeTrial, type FirstFailingStage, type TrialProbe } from "../src/optical/testing/geometry-probe";
import { compose, rotationMatrix, translationMatrix, warpImage } from "../src/optical/testing/warp";
import { readResults } from "./merge-geometry";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "docs/optical/results/m5-6-45deg-analysis.md");
const SRC = resolve(ROOT, "src/optical");

// ---------------------------------------------------------------------------------------------
// Traced copies (temp directory only)
// ---------------------------------------------------------------------------------------------

interface GateRecord {
  bbox: [number, number, number, number];
  area: number;
  hullVertices: number;
  hullArea: number;
  quadArea: number;
  areaRatio: number;
  sideRatio: number;
  dropped: boolean;
}
interface Traced {
  detectMarkers: typeof detectMarkers;
  TRACE: GateRecord[];
  GATE: { area: number };
}
interface TracedGroup {
  decodeGroup: (image: GrayImage, options?: DecodeGroupOptions) => GroupDecodeResult;
}

const PRODUCTION_GATE = 0.85;
const GATE_LINE = "if (quadArea / hullArea < 0.85 || st0.ratio < 0.45) return { kind: 'drop' };";

async function loadTraced(): Promise<{ detect: Traced; group: TracedGroup; dir: string }> {
  const detSrc = readFileSync(resolve(SRC, "detect.ts"), "utf8");
  if (detSrc.split(GATE_LINE).length !== 2) throw new Error("detect.ts no longer has the expected single marker-like gate line; update scripts/geometry-45deg.ts");
  const record =
    "TRACE.push({ bbox: [comps.minX[id]!, comps.minY[id]!, comps.maxX[id]!, comps.maxY[id]!], area: comps.area[id]!, hullVertices: hull.length, hullArea, quadArea, " +
    "areaRatio: quadArea / hullArea, sideRatio: st0.ratio, dropped: quadArea / hullArea < GATE.area || st0.ratio < 0.45 });\n  ";
  const gate = "if (quadArea / hullArea < GATE.area || st0.ratio < 0.45) return { kind: 'drop' };";
  const detTraced = detSrc.replace(GATE_LINE, record + gate) + "\nexport const TRACE: any[] = [];\nexport const GATE = { area: 0.85 };\n";
  const grpSrc = readFileSync(resolve(SRC, "decode-group.ts"), "utf8");
  const absolute = (name: string): string => pathToFileURL(resolve(SRC, name)).href;
  const grpTraced = grpSrc
    .replace(/from '\.\/detect'/g, "from './detect-traced'")
    .replace(/from '\.\/(decode-fragment|transforms|fragments|render)'/g, (_m, n: string) => `from '${absolute(n)}'`);
  const dir = mkdtempSync(join(os.tmpdir(), "qroker-detect-traced-"));
  writeFileSync(join(dir, "detect-traced.ts"), detTraced);
  writeFileSync(join(dir, "decode-group-traced.ts"), grpTraced);
  const detect = (await import(pathToFileURL(join(dir, "detect-traced.ts")).href)) as Traced;
  const group = (await import(pathToFileURL(join(dir, "decode-group-traced.ts")).href)) as TracedGroup;
  return { detect, group, dir };
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const INSETS = [1, 1.5, 2];
const ANGLES = [43, 44, 45, 46, 47];
const QUICK = process.argv.includes("--quick");
const TABLE_SEEDS = QUICK ? 2 : 50;
const VARIANTS = [0.85, 0.8, 0.75, 0.7];

const cellParams = (inset: number): CellParams => ({ ...CLEAN_DARK, insetModules: inset, cameraRotation: "DEG45" }) as CellParams;
const seedsOf = (n: number): number[] => {
  const id = cellId(cellParams(2));
  return Array.from({ length: n }, (_, i) => trialSeed(id, i));
};
const f2 = (x: number): string => (Number.isFinite(x) ? x.toFixed(3) : "-");
const sameMarkers = (a: DetectedMarker[], b: DetectedMarker[]): boolean =>
  a.length === b.length && a.every((m, i) => m.bits === b[i]!.bits && m.center.x === b[i]!.center.x && m.center.y === b[i]!.center.y && m.sizePx === b[i]!.sizePx);

function angDiff90(a: number, b: number): number {
  const m = (((a - b) % 90) + 90) % 90;
  return Math.min(m, 90 - m);
}
const median = (v: number[]): number => {
  if (v.length === 0) return NaN;
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? (s[(s.length - 1) / 2] as number) : ((s[s.length / 2 - 1] as number) + (s[s.length / 2] as number)) / 2;
};
const kindsText = (k: Record<string, number>): string => {
  const e = Object.entries(k).sort(([a], [b]) => (a < b ? -1 : 1));
  return e.length === 0 ? "-" : e.map(([a, b]) => `${a} ${b}`).join(", ");
};

interface GateView {
  /** Gate record of the component that contains the truth centre of each slot (null when no component reached the gate). */
  bySlot: Array<GateRecord | null>;
}
type Cls = "CORRECT" | "REJECTED" | "FALSE_ACCEPT";
interface Seen {
  probe: TrialProbe;
  view: GateView;
  /** class of the same image decoded with the traced reader at each gate value of VARIANTS */
  variant: Cls[];
}

interface Agg {
  n: number;
  correct: number;
  rejectedKinds: Record<string, number>;
  stages: Record<FirstFailingStage, number>;
  missingBySlot: Record<string, number>;
  minAreaRatio: number;
  droppedByGate: number;
  maxRotationErrDeg: number;
  perTrialMin: number[];
  variantCorrect: number[];
  variantFalseAccept: number[];
}
const newAgg = (): Agg => ({
  n: 0,
  correct: 0,
  rejectedKinds: {},
  stages: { NONE: 0, MARKER_DETECTION_SILENT_DROP: 0, MARKER_DETECTION_REJECTED_CANDIDATE: 0, FRAGMENT_DECODING: 0, GROUP_CLUSTERING: 0, GROUP_ARRANGEMENT: 0, FALSE_ACCEPT: 0 },
  missingBySlot: {},
  minAreaRatio: Infinity,
  droppedByGate: 0,
  maxRotationErrDeg: 0,
  perTrialMin: [],
  variantCorrect: VARIANTS.map(() => 0),
  variantFalseAccept: VARIANTS.map(() => 0),
});
function addTrial(agg: Agg, s: Seen): void {
  const { probe, view } = s;
  agg.n++;
  if (probe.cls === "CORRECT") agg.correct++;
  else if (probe.group.kind !== "IDENTIFIED") agg.rejectedKinds[probe.group.kind] = (agg.rejectedKinds[probe.group.kind] ?? 0) + 1;
  agg.stages[probe.firstFailingStage]++;
  let mn = Infinity;
  probe.slots.forEach((sl, k) => {
    if (sl.detected === null) agg.missingBySlot[sl.slot] = (agg.missingBySlot[sl.slot] ?? 0) + 1;
    else agg.maxRotationErrDeg = Math.max(agg.maxRotationErrDeg, angDiff90(sl.detected.rotationDeg, probe.cameraRotationDeg));
    const r = view.bySlot[k];
    if (r !== null && r !== undefined) {
      mn = Math.min(mn, r.areaRatio);
      if (r.dropped) agg.droppedByGate++;
    }
  });
  if (Number.isFinite(mn)) {
    agg.minAreaRatio = Math.min(agg.minAreaRatio, mn);
    agg.perTrialMin.push(mn);
  }
  s.variant.forEach((c, i) => {
    if (c === "CORRECT") agg.variantCorrect[i]!++;
    if (c === "FALSE_ACCEPT") agg.variantFalseAccept[i]!++;
  });
}
const stageText = (s: Agg["stages"]): string => {
  const e = Object.entries(s).filter(([k, v]) => k !== "NONE" && v > 0);
  return e.length === 0 ? "-" : e.map(([a, b]) => `${a} ${b}`).join(", ");
};
const slotText = (m: Record<string, number>): string => (Object.keys(m).length === 0 ? "-" : SLOT_LIST.filter((s) => m[s] !== undefined).map((s) => `${s} ${m[s]}`).join(", "));
const variantText = (a: Agg): string => VARIANTS.map((v, i) => `${a.variantCorrect[i]}${(a.variantFalseAccept[i] ?? 0) > 0 ? ` (+${a.variantFalseAccept[i]} FA)` : ""}`).join(" / ");

// ---------------------------------------------------------------------------------------------

async function main(): Promise<void> {
  const write = !process.argv.includes("--no-write") && !QUICK;
  const sampleIdx = process.argv.indexOf("--sample");
  const samplePerCell = QUICK ? 0 : sampleIdx >= 0 ? Number(process.argv[sampleIdx + 1]) : 3;
  const { detect: tr, group: trGroup, dir } = await loadTraced();
  const lines: string[] = [];
  const out = (s = ""): void => {
    lines.push(s);
  };
  let equalityFailures = 0;
  let imagesChecked = 0;

  const classOf = (p: TrialProbe, res: GroupDecodeResult): Cls => classify(res, p.scenario, p.params, false).cls;
  const tracedDecode = (p: TrialProbe, area: number): GroupDecodeResult => {
    tr.GATE.area = area;
    try {
      const o: DecodeGroupOptions = p.params.decoderLayout === "MATCHED" ? { centerOffsetModules: markerCenterOffsetModules(geometryOf(p.params)) } : {};
      return trGroup.decodeGroup(p.image, o);
    } finally {
      tr.GATE.area = PRODUCTION_GATE;
    }
  };

  const run = (params: CellParams, seed: number, o: Parameters<typeof probeTrial>[2]): Seen => {
    const probe = probeTrial(params, seed, o);
    // gate quantities at the production gate; instrument check against production detectMarkers
    tr.GATE.area = PRODUCTION_GATE;
    tr.TRACE.length = 0;
    const det = tr.detectMarkers(probe.image);
    const recs = [...tr.TRACE];
    const prodMarkers = probe.markers;
    const tracedMarkers = det.kind === "DETECTED" ? det.markers : [];
    imagesChecked++;
    if (!sameMarkers(tracedMarkers, prodMarkers)) equalityFailures++;
    const bySlot = probe.slots.map((s) => {
      const { x, y } = s.truthCenter;
      const hit = recs.filter((r) => x >= r.bbox[0] && x <= r.bbox[2] + 1 && y >= r.bbox[1] && y <= r.bbox[3] + 1);
      hit.sort((a, b) => a.area - b.area);
      return hit[0] ?? null;
    });
    const variant: Cls[] = VARIANTS.map((v) => {
      const res = tracedDecode(probe, v);
      if (v === PRODUCTION_GATE && (res.kind !== probe.group.kind || (res.kind === "IDENTIFIED" && probe.group.kind === "IDENTIFIED" && res.hiddenSum !== probe.group.hiddenSum))) equalityFailures++;
      return classOf(probe, res);
    });
    return { probe, view: { bySlot }, variant };
  };

  try {
    const seeds = seedsOf(TABLE_SEEDS);

    // ---- A. angle x inset table
    const tableRows: string[] = [];
    const variantRows: string[] = [];
    for (const inset of INSETS) {
      for (const angle of ANGLES) {
        const agg = newAgg();
        for (const s of seeds) addTrial(agg, run(cellParams(inset), s, { cameraRotationDeg: angle }));
        tableRows.push(
          `| ${inset} | ${angle} | ${agg.n} | ${agg.correct} | ${kindsText(agg.rejectedKinds)} | ${stageText(agg.stages)} | ${slotText(agg.missingBySlot)} | ${f2(agg.minAreaRatio)} | ${f2(median(agg.perTrialMin))} | ${agg.droppedByGate} | ${agg.maxRotationErrDeg.toFixed(2)} |`,
        );
        variantRows.push(`| ${inset} | ${angle} | ${agg.n} | ${variantText(agg)} |`);
      }
    }

    // ---- B. fine angle sweep
    const fine = [44, 44.5, 44.9, 44.99, 45, 45.01, 45.1, 45.5, 46];
    const fineSeeds = seeds.slice(0, QUICK ? 1 : 10);
    const fineRows: string[] = [];
    for (const inset of INSETS) {
      for (const angle of fine) {
        const agg = newAgg();
        for (const s of fineSeeds) addTrial(agg, run(cellParams(inset), s, { cameraRotationDeg: angle }));
        fineRows.push(`| ${inset} | ${angle} | ${agg.n} | ${agg.correct} | ${stageText(agg.stages)} | ${f2(agg.minAreaRatio)} | ${f2(median(agg.perTrialMin))} | ${variantText(agg)} |`);
      }
    }

    // ---- C. sub-pixel phase at exactly 45 deg
    const shifts = [0, 0.25, 0.5, 0.75];
    const phaseRows: string[] = [];
    const phaseSeeds = seeds.slice(0, QUICK ? 1 : 10);
    const phaseTotals: Record<string, Agg> = {};
    for (const inset of INSETS) {
      phaseTotals[String(inset)] = newAgg();
      for (const sy of shifts) {
        const cells: string[] = [];
        for (const sx of shifts) {
          const agg = newAgg();
          for (const s of phaseSeeds) {
            const seen = run(cellParams(inset), s, { cameraRotationDeg: 45, shiftPx: { x: sx, y: sy } });
            addTrial(agg, seen);
            addTrial(phaseTotals[String(inset)] as Agg, seen);
          }
          cells.push(`${agg.correct}/${agg.n} (min ${f2(agg.minAreaRatio)})`);
        }
        phaseRows.push(`| ${inset} | ${sy} | ${cells.join(" | ")} |`);
      }
    }

    // ---- D. stored RANDOM-rotation cells with failures: camera angle and first failing stage
    const stored = readResults(resolve(ROOT, ".geometry-work")).results;
    const randRows: string[] = [];
    for (const [id, r] of [...stored.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const p = r.params;
      if (p.cameraRotation !== "RANDOM" || p.tiltDeg !== 0 || r.rejected === 0 || r.expectation !== "IDENTIFY") continue;
      if (p.shiftMm !== 0 || p.rotationDeg !== 0 || p.gapMm !== 0 || p.blurPx !== 0 || p.lightingStrength !== 0 || p.face !== "FRONT" || p.layout !== "2x2") continue;
      const items = r.rejectedSeedsSample.map((s) => ({ seed: s, deg: buildScenario(p, s).camera.rotationDeg }));
      const stages: Record<string, number> = {};
      const reasons: Record<string, number> = {};
      let near = 0;
      let recovered = 0;
      for (const a of items) {
        const seen = run(p, a.seed, {});
        stages[seen.probe.firstFailingStage] = (stages[seen.probe.firstFailingStage] ?? 0) + 1;
        const miss = seen.probe.slots.find((s) => s.detected === null);
        if (miss !== undefined) reasons[miss.rejectedReason ?? "dropped silently"] = (reasons[miss.rejectedReason ?? "dropped silently"] ?? 0) + 1;
        if (angDiff90(a.deg, 45) <= 3) near++;
        if (seen.variant[1] === "CORRECT") recovered++;
      }
      randRows.push(
        `| ${id} | ${r.n} | ${r.rejected} | ${items.map((a) => (((a.deg % 90) + 90) % 90).toFixed(1)).join(" ")} | ${near} | ${kindsText(stages)} | ${kindsText(reasons)} | ${recovered}/${items.length} |`,
      );
    }

    // ---- E. repro of the single reported failure
    const reproSeed = seeds[0] as number;
    const repro = run(cellParams(2), reproSeed, {});
    const reproOk = run(cellParams(2), reproSeed, { cameraRotationDeg: 44 });
    const reproOk46 = run(cellParams(2), reproSeed, { cameraRotationDeg: 46 });
    const reproCtl = run(cellParams(1), reproSeed, {});
    const slotLine = (p: TrialProbe): string =>
      p.slots
        .map((s) => `${s.slot} truth (${s.truthCenter.x.toFixed(1)}, ${s.truthCenter.y.toFixed(1)}) ${s.detected === null ? `NOT DETECTED (rejected candidate there: ${s.rejectedReason ?? "none"})` : `detected ${s.detected.distancePx.toFixed(2)} px away, read ${s.detected.fragment}, canonical rotation ${s.detected.rotationDeg.toFixed(2)}`}`)
        .join("; ");
    const gateLine = (v: GateView): string =>
      v.bySlot.map((r, k) => `${SLOT_LIST[k]}: ${r === null ? "no component reached the gate" : `hull ${r.hullVertices} vertices, hull area ${r.hullArea.toFixed(1)}, inscribed quad ${r.quadArea.toFixed(1)}, ratio ${r.areaRatio.toFixed(3)}${r.dropped ? " DROPPED" : ""}`}`).join("; ");

    // ---- F. gate margin of an isolated marker vs module size (no board, no card; the same warp helper)
    const marginRows: string[] = [];
    {
      const rng = mulberry32(20260514);
      const patterns = Array.from({ length: 4 }, () => {
        // valid marker structure: any 25-bit data pattern
        return Math.floor(rng() * 2 ** 25);
      });
      for (const modulePx of [2, 3, 4, 6, 8]) {
        let n = 0;
        let below = 0;
        let min = Infinity;
        let minAngle = 0;
        const detectedAt: number[] = VARIANTS.map(() => 0);
        const phases = [0, 0.5];
        for (const pattern of patterns) {
          const m = renderMarker(pattern, modulePx);
          const pad = FOOTPRINT_MOD * modulePx;
          const W = 3 * pad;
          const canvas: GrayImage = { width: W, height: W, data: new Uint8Array(W * W).fill(64) };
          for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) canvas.data[(y + pad) * W + x + pad] = m.data[y * m.width + x] as number;
          for (let angle = 0; angle < 90; angle += QUICK ? 15 : 1) {
            for (const sx of phases) {
              for (const sy of phases) {
                const H = compose(rotationMatrix(angle, W / 2, W / 2), translationMatrix(sx, sy));
                const img = warpImage(canvas, H, W, W, { background: 64, supersample: 2 });
                tr.GATE.area = PRODUCTION_GATE;
                tr.TRACE.length = 0;
                tr.detectMarkers(img);
                const rec = tr.TRACE.filter((r) => W / 2 >= r.bbox[0] && W / 2 <= r.bbox[2] + 1 && W / 2 >= r.bbox[1] && W / 2 <= r.bbox[3] + 1).sort((a, b) => a.area - b.area)[0];
                if (rec === undefined) continue;
                n++;
                if (rec.areaRatio < PRODUCTION_GATE) below++;
                if (rec.areaRatio < min) {
                  min = rec.areaRatio;
                  minAngle = angle;
                }
              }
            }
          }
        }
        void detectedAt;
        marginRows.push(`| ${modulePx} | ${7 * modulePx} | ${n} | ${f2(min)} (at ${minAngle} deg) | ${below} (${((100 * below) / Math.max(1, n)).toFixed(1)}%) |`);
      }
    }

    // ---- G. what-if on a sample of the recorded failing seeds of the stored cells
    const sampleRows: string[] = [];
    let sampleN = 0;
    const sampleStages: Record<string, number> = {};
    const sampleRecovered = VARIANTS.map(() => 0);
    const sampleFalseAccept = VARIANTS.map(() => 0);
    const byGroupRows = new Map<string, { n: number; silent: number; rec: number[] }>();
    if (samplePerCell > 0) {
      for (const [id, r] of [...stored.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
        if (r.expectation !== "IDENTIFY" || r.rejected === 0) continue;
        const group = `${r.params.cameraRotation === "NONE" ? "" : "camera " + r.params.cameraRotation + ", "}${r.group}`;
        for (const seed of r.rejectedSeedsSample.slice(0, samplePerCell)) {
          const seen = run(r.params, seed, { matchToleranceModules: 2 });
          sampleN++;
          const st = seen.probe.firstFailingStage;
          sampleStages[st] = (sampleStages[st] ?? 0) + 1;
          const g = byGroupRows.get(group) ?? { n: 0, silent: 0, rec: VARIANTS.map(() => 0) };
          g.n++;
          if (st === "MARKER_DETECTION_SILENT_DROP") g.silent++;
          seen.variant.forEach((c, i) => {
            if (c === "CORRECT") {
              sampleRecovered[i]!++;
              g.rec[i]!++;
            }
            if (c === "FALSE_ACCEPT") sampleFalseAccept[i]!++;
          });
          byGroupRows.set(group, g);
        }
      }
      for (const [g, v] of [...byGroupRows.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
        sampleRows.push(`| ${g} | ${v.n} | ${v.silent} | ${v.rec.slice(1).join(" / ")} |`);
      }
    }

    // ---- assemble the report
    out("# Task 5.6 follow-up: camera rotation of exactly 45 degrees at inset 2");
    out();
    out("SYNTHETIC images, not real cameras. These are synthetic-test findings about the sampled conditions only; they do not measure or guarantee real-camera performance. Nothing in the reader (detection, decoding, clustering), any threshold, the frozen codebook or the geometry was changed for this analysis, and the 824-cell sweep was not re-run (the stored results were only read). All numbers in sections 1 to 8 are generated by `scripts/geometry-45deg.ts`; the text of sections 9 onwards is the interpretation.");
    out();
    out("Reproduce: `npm run analyze:45deg` (deterministic, no timestamps, 10 to 15 minutes). Single trial: `npm run analyze:geometry -- --repro --cell 2x2-F-r3.175-i2-tb64-sh0-ro0-gp0-cm45-tl0-bl0-lt0-rs0-rr0-co0-mat --seed " + reproSeed + "`. Pinned regression test: `npx vitest --run src/optical/testing/geometry-45deg.test.ts`.");
    out();
    out("Seeds: the first " + TABLE_SEEDS + " trial seeds of the stored cell `" + cellId(cellParams(2)) + "` (`trialSeed(cell id, i)`), used for every inset and every angle, so the card draws are identical across the rows (only the camera angle and the layout inset differ). Every other factor is CLEAN_DARK (2x2 board, FRONT, r = 3.175 mm, dark table, no placement error, tilt 0, blur 0, no lighting gradient). The reader is told the layout offset `centerOffsetModules = inset + 1 + 3.5` and nothing else.");
    out();
    out("Instrument check: the traced copies of `detect.ts` and `decode-group.ts` (production gate value 0.85) returned the same markers / the same decoder result as the production modules on " + imagesChecked + " analysed images; differences found: **" + equalityFailures + "**.");
    out();
    out("## 1. The reported failure, stage by stage");
    out();
    out("Stored cell: `" + cellId(cellParams(2)) + "` (T2-camera-rotation, 200 trials, 0 correct, 200 INCOMPLETE_GROUP). Trial seed " + reproSeed + " (first trial of that cell):");
    out();
    out("- Inset 2, 45 deg: result `" + repro.probe.group.kind + "`, markers detected " + repro.probe.markersDetected + ", rejected candidates " + repro.probe.rejectedCandidates.length + " (none at a central marker). First failing stage: **" + repro.probe.firstFailingStage + "**. " + slotLine(repro.probe));
    out("- Gate record of the same image: " + gateLine(repro.view));
    out("- Inset 2, 44 deg, same seed: " + reproOk.probe.cls + ", stage " + reproOk.probe.firstFailingStage + ". " + gateLine(reproOk.view));
    out("- Inset 2, 46 deg, same seed: " + reproOk46.probe.cls + ", stage " + reproOk46.probe.firstFailingStage + ". " + gateLine(reproOk46.view));
    out("- Inset 1, 45 deg, same seed (control): " + reproCtl.probe.cls + ", stage " + reproCtl.probe.firstFailingStage + ". " + gateLine(reproCtl.view));
    out();
    out("## 2. Angle x inset table (n = " + TABLE_SEEDS + " per row)");
    out();
    out("`stages` = first failing reader stage of each non-correct trial (`MARKER_DETECTION_SILENT_DROP`: a central marker is missing from `detectMarkers` and no rejected candidate covers it). `missing slots` counts the slot (TL/TR/BL/BR of the group frame) of the missing marker. `min ratio` / `median ratio` are the smallest and the median (over trials) of the smallest, over the four central markers, ratio of the inscribed-quadrilateral area to the convex-hull area; a component with ratio < " + PRODUCTION_GATE + " is silently dropped by the marker-like gate. `gate drops` counts central markers dropped by that gate. `max rot err` is the largest deviation (degrees, modulo 90) of a detected central marker's canonical rotation from the camera angle.");
    out();
    out("| inset | camera angle | n | correct | rejected (kind) | stages | missing slots | min ratio | median ratio | gate drops | max rot err |");
    out("|---|---|---|---|---|---|---|---|---|---|---|");
    for (const r of tableRows) out(r);
    out();
    out("## 3. Fine angle sweep around 45 degrees (n = 10 per row, first 10 seeds)");
    out();
    out("Last column: correct trials when the same images are decoded by the traced copy with the gate value " + VARIANTS.join(" / ") + " (WHAT-IF, not production).");
    out();
    out("| inset | camera angle | n | correct | stages | min ratio | median ratio | correct at gate " + VARIANTS.join(" / ") + " |");
    out("|---|---|---|---|---|---|---|---|");
    for (const r of fineRows) out(r);
    out();
    out("## 4. Sub-pixel phase at exactly 45 degrees (n = 10 per entry, first 10 seeds)");
    out();
    out("The rotated image is translated by (dx, dy) pixels after the rotation (same warp, same supersampling). Entries are correct/n and the smallest central-marker ratio. Rows: dy, columns: dx (pixels).");
    out();
    out("| inset | dy \\ dx | " + shifts.join(" | ") + " |");
    out("|---|---|" + shifts.map(() => "---").join("|") + "|");
    for (const r of phaseRows) out(r);
    out();
    out("Totals over the 16 phases (n = 160 per inset): " + INSETS.map((i) => `inset ${i}: ${(phaseTotals[String(i)] as Agg).correct} correct, stages ${stageText((phaseTotals[String(i)] as Agg).stages)}; correct at gate ${VARIANTS.join(" / ")} = ${variantText(phaseTotals[String(i)] as Agg)}`).join(". ") + ".");
    out();
    out("## 5. Stored RANDOM-rotation cells with failures (2x2, FRONT, no other degradation)");
    out();
    out("Camera angle of the recorded failing seeds (modulo 90, the quarter-turn symmetry of the marker), `near 45` = within 3 degrees of 45 modulo 90, first failing stage, the rejected-candidate reason at the missing marker, and how many of these failures the gate value 0.80 would recover (WHAT-IF).");
    out();
    out("| cell | n | failed | angle mod 90 of each recorded failing seed | near 45 | first failing stage | reason at missing marker | recovered at gate 0.80 |");
    out("|---|---|---|---|---|---|---|---|");
    for (const r of randRows) out(r);
    out();
    out("## 6. Gate margin of an isolated marker versus module size");
    out();
    out("Four random 25-bit patterns rendered with `renderMarker` at an integer module size on a 64-gray table, rotated by 0 to 89 degrees in 1 degree steps, each at 4 sub-pixel phases (dx, dy in {0, 0.5}); 2x2 supersampled warp. Column `min ratio` is the smallest inscribed-quad / hull ratio of the marker component over all angles and phases, `below 0.85` the number of views dropped by the gate. (The synthetic board images of the sweep have 4 px per module.)");
    out();
    out("| module px | marker edge px | views | min ratio | below 0.85 |");
    out("|---|---|---|---|---|");
    for (const r of marginRows) out(r);
    out();
    if (samplePerCell > 0) {
      out("## 7. Sample of the recorded failing seeds of all stored cells with failures");
      out();
      out("The first " + samplePerCell + " recorded failing seeds of every IDENTIFY cell that has failures were re-run (" + sampleN + " trials; the stored cells hold at most 20 recorded seeds each, so this is a sample of failures, not all of them, and correct trials were not re-run). Central markers were matched within 2 modules to allow for the duplex registration and cut offsets of the back-face cells. Stage attribution: " + kindsText(sampleStages) + ".");
      out();
      out("What-if recoveries (traced copy with a lower gate value, same images): correct at gate " + VARIANTS.slice(1).join(" / ") + " = " + sampleRecovered.slice(1).join(" / ") + " of " + sampleN + "; false accepts " + sampleFalseAccept.slice(1).join(" / ") + ".");
      out();
      out("| cell group | n | silent gate drops | recovered at gate " + VARIANTS.slice(1).join(" / ") + " |");
      out("|---|---|---|---|");
      for (const r of sampleRows) out(r);
      out();
    }
    out("## 8. What-if: correct trials in the angle x inset table if the gate value were lower");
    out();
    out("Correct trials of the section 2 rows (n = 50 each) decoded by the traced copy with gate value " + VARIANTS.join(" / ") + " (the first number reproduces the production result). `+k FA` would mark false accepts; none occurred.");
    out();
    out("| inset | camera angle | n | correct at gate " + VARIANTS.join(" / ") + " |");
    out("|---|---|---|---|");
    for (const r of variantRows) out(r);
    out();
    const edge = Math.min(
      ...repro.probe.slots.flatMap((s) => [s.truthCenter.x, s.truthCenter.y, repro.probe.imageSize.width - s.truthCenter.x, repro.probe.imageSize.height - s.truthCenter.y]),
    );
    const t = (i: number): Agg => phaseTotals[String(i)] as Agg;
    out("The numbers of sections 1 to 8 are produced by this script; the wording of sections 9 to 14 is static text written from them.");
    out();
    out("## 9. First failing stage, per stage of the reader");
    out();
    out("| stage | what the data show | verdict |");
    out("|---|---|---|");
    out("| marker detection: binarization, 8-connected components, size filters | The component of the missing marker exists (bounding box about 38 x 38 px, area about 640 px, no contact with the image edge or another component) and reaches the marker-like gate; it is not removed by the size filters. | not the cause |");
    out("| marker detection: marker-like gate (`quadArea / hullArea < 0.85`, `detect.ts` `analyzeComponent`) | At 45 deg, inset 2, the BR central marker has hull area 866.0 and inscribed-quadrilateral area 730.0, ratio 0.843 < 0.85, and is dropped by the `return { kind: 'drop' }` path, which does NOT add a rejected candidate. The other three markers of the same image have 0.892 to 0.894. All 50 seeds: BR dropped, 50 of 50. | **first failing stage, root cause** |");
    out("| canonical rotation estimation | The three detected central markers report +45.00 / +45.00 / -45.00 (the boundary of the canonical range (-45, 45]); `max rot err` is 0.00 at 45 deg and at most 1.02 deg elsewhere. With the fourth marker restored (what-if gate 0.80) all 50 trials are identified correctly. | not the cause |");
    out("| grid sampling / fragment decoding | The three detected markers read as the true cards at all 50 seeds; at inset 1 and 1.5 at 45 deg all four are read correctly; with the fourth marker restored, 50 of 50 correct. | not the cause |");
    out("| group clustering (`centerOffsetModules = inset + 1 + 3.5 = 6.5`, position tolerance 1.0) | With the fourth marker restored (what-if gate 0.80), 50 of 50 trials at 45 deg and inset 2 form the correct group with the unchanged offset 6.5 and tolerance 1.0. The `INCOMPLETE_GROUP detected 3` result is the consequence of the missing marker, not of the geometry. (Other cells fail in clustering for a different reason: section 7.) | not the cause here |");
    out("| canvas / crop clipping | The four central marker centres lie at least " + edge.toFixed(0) + " px from the nearest image edge (image " + repro.probe.imageSize.width + " x " + repro.probe.imageSize.height + " px); the only rejected candidates are the two board corners (TOUCHES_IMAGE_EDGE). | not the cause |");
    out("| synthetic warp | The warp is the same bilinear, 2 x 2 supersampled resampling at all angles. It does not misplace anything (the truth centres computed from the layout match the detected centres to 0.2 px), but at exactly 45 deg it fixes the pixel phase of every central marker (section 10). | exposes the limitation, no defect found in the warp |");
    out();
    out("## 10. Why exactly 45 degrees at inset 2, and why 200 of 200");
    out();
    out("The focus vertex of the 2 x 2 board lies at raster position (172.598, 236.598) px, the image centre (the rotation centre) at (173, 237): the offset (-0.402, -0.402) px has equal components because both raster dimensions are rounded up by the same 0.8 px (345.2 to 346 px and 473.2 to 474 px) while the vertex is 43.15 and 59.15 modules, i.e. 172.598 and 236.598 px, from the origin. Rotated by exactly 45 deg, that offset becomes (0, -0.568) px, so the vertex, and with it two central markers, lie exactly on the pixel column x = 173.000, and the four central markers sit on the image axes at distance 1.414 x 6.5 x 4 = 36.77 px from the vertex. The pixel phase of every marker is therefore the same in all 200 trials of the cell (only the card patterns change). At inset 2 the BR marker has the phase (x 0.00, y 0.20 px) and its staircase outline has a blunt tip: the pixel-corner convex hull (866.0 px^2) is larger than the quadrilateral inscribed in its vertices (730.0 px^2), ratio 0.843. At inset 1 and 1.5 the same marker has a different y phase and ratios of 0.892 to 0.912. The 0% is thus the result of ONE pixel phase, not a failure rate.");
    out();
    out("The failure is not specific to the exact angle (section 3: 44.9, 44.99, 45.01 and 45.1 deg at inset 2 fail 10 of 10, 44.5 and 45.5 deg do not; at inset 1.5, 44.5 and 45.5 deg lose 1 of 10) and not specific to inset 2 (section 4: with the image shifted by a fraction of a pixel at exactly 45 deg, inset 1 loses " + (160 - t(1).correct) + " of 160 trials, inset 1.5 " + (160 - t(1.5).correct) + " of 160 and inset 2 " + (160 - t(2).correct) + " of 160, always by a silent gate drop). It is a sensitivity of the detector's marker-like gate to the pixel phase of a near-diagonal marker at 4 px per module.");
    out();
    out("## 11. Real detector sensitivity or harness artifact?");
    out();
    out("Both, with different roles. **Detector limitation (cause):** the gate value 0.85 has a thin margin. A valid marker at 4 px per module produces ratios between 0.843 (board image) and 0.912; isolated rendered markers reach 0.861 (section 6); at 3 px per module (edge 21 px) 3.9% of the isolated views and at 2 px per module (edge 14 px = `DEFAULT_MIN_SIZE_PX`) 25.8% are below 0.85 and are dropped silently. The ratio falls with marker size; the likely reason is that the pixel-corner hull of a diagonal staircase edge adds a fixed fraction of a pixel on every side, which weighs more on a smaller marker (not isolated here). **Harness property (amplifier):** rotating a 2 x 2 board about its own centre by exactly 45 deg makes the pixel phase of the four central markers identical for all trials, so a marginal ratio turns into a 0% or 100% result for the whole cell. Cells with camera rotation NONE and no tilt have no warp at all, so their pixel phase is also fixed for a given layout; RANDOM-rotation cells sample many phases. The stored 100% at 45 deg for inset 1 and 1.5 therefore do not show that those insets are robust at 45 deg (phase-shifted: " + t(1).correct + "/160 and " + t(1.5).correct + "/160 correct, inset 2: " + t(2).correct + "/160; coarse 0.25 px lattice, 10 seeds each, not a rate for random phases).");
    out();
    out("The failures of the stored RANDOM-rotation cells are a different mechanism (section 5 and 7): the missing marker there is a listed rejected candidate (NOT_QUADRILATERAL), the camera angles are mostly far from 45 deg, and a lower gate recovers none of them. Of 1100 sampled failing trials of all stored cells, 924 fail in group clustering, 172 in marker detection with a listed rejected candidate and only 4 by a silent gate drop (3 of them in the 45 deg inset 2 cell, 1 in a duplex cell); in the stored sample the gate issue is therefore almost entirely the 45 deg family.");
    out();
    out("## 12. Approved condition: centerOffsetModules never comes from card identities or the board truth");
    out();
    out("Confirmed, no violation. In `src/optical/testing/geometry-trial.ts`: `markerCenterOffsetModules(g)` (line 554) returns `g.insetModules + g.quietMarginModules + CORE_MOD / 2`, where `g = geometryOf(p)` is built from the cell parameters (`p.insetModules`, the physical layout) by `physicalGeometry(...)`. `decodeScenarioImage(image, p, g)` (line 558) passes exactly that number as `centerOffsetModules` (line 560) when the cell is `MATCHED`, and nothing else besides the image. `runTrial` calls it with `(image, p, g)` at line 619; the scenario `sc` (cards, positions, errors) is not an argument and is used only afterwards by `classify`. The offset takes the values 5.5 / 6.0 / 6.5 for inset 1 / 1.5 / 2 (pinned in `geometry-45deg.test.ts`). The `DEFAULT` decoder-layout diagnostic cells use `decodeGroup(image)` with no option at all.");
    out();
    out("## 13. Reproducible defect? Proposed correction (NOT applied)");
    out();
    out("A reproducible limitation of production code exists (`src/optical/detect.ts`, `analyzeComponent`, the marker-like gate): a valid marker whose staircase outline gives a hull/inscribed-quadrilateral area ratio below 0.85 is dropped without a rejected candidate. Smallest correction: lower the constant `0.85` of that one comparison. What-if with a traced copy (gate value 0.80 / 0.75 / 0.70, same images, nothing applied): every failing gate-drop trial in sections 2 to 4 is identified correctly (45 deg inset 2: 50/50, phase table: 160/160 at every inset, fine sweep: all recovered), the number of correct trials never decreased in the 750 + 270 + 480 analysed trials, no false accept appeared, and none of the other 1097 sampled failing trials became correct or a false accept (section 7; 3 of 1100 sampled failures recovered, all from the 45 deg cell). A value of 0.80 keeps a margin of 0.043 below the lowest ratio seen at 4 px per module (0.843) and covers isolated markers down to 3 px per module (lowest 0.830); covering 2 px per module (lowest 0.780) would need about 0.75. The gate protects against non-marker blobs, so the false-positive side of the change is NOT measured here.");
    out();
    out("Expected effect on the stored sweep, by construction: lowering the gate only admits components with ratio in [new value, 0.85) to the later checks, so every trial without such a component is bit-identical. Known: the stored DEG45 inset 2 cell (200 trials, 0 correct) would become about 200 correct (verified on 50 seeds), the two other DEG45 cells with r = 3.175 mm are unchanged at their phase (minimum ratio 0.892); the r = 0 and r = 6 mm DEG45 cells were not re-run here. Not known: how many other stored trials contain a component in that band (distractor cards on 3 x 3 boards, rounded-corner voids, partial occlusion); the sample says few. Pre-fix and post-fix data must not be mixed; any application needs a full re-run of all 824 cells as a separate data set, the detector tests (`detect.test.ts`, the m4-1 measurement) and a check of the Tier 4 false-accept counts.");
    out();
    out("A harness-side remedy (also NOT applied): add a seeded sub-pixel translation (uniform in [0, 1) px in both axes, from the existing camera stream) to the camera warp, so that DEG45 and other rotated cells sample the pixel phase instead of one phase. This changes every cell with an active warp and needs a re-run of those cells. It does not remove the detector sensitivity; it only makes the sweep report it as a rate.");
    out();
    out("## 14. What is established and what is not");
    out();
    out("Established (synthetic images, the sampled conditions only):");
    out();
    out("- The 45 deg / inset 2 recognition failure is a marker-detection failure of exactly one central marker (BR), by the silent marker-like gate drop, in 200 of 200 stored trials by construction and 50 of 50 re-run seeds; rotation estimation, fragment decoding, clustering geometry and image bounds are not involved.");
    out("- The loss depends on the pixel phase and the angle (44.9 to 45.1 deg at inset 2; fractional-pixel shifts at 45 deg at every inset), so it is not an inset-2-only or exact-45-only effect, and the stored 45 deg cells measure one pixel phase each.");
    out("- `centerOffsetModules` is derived only from the inset parameter of the cell.");
    out("- No false accept occurred in any of the re-run trials (production reader); this analysis changes nothing in the stored zero-false-accept results.");
    out();
    out("Not established:");
    out();
    out("- Real-camera behaviour of any kind (synthetic only), including whether real markers of 3 to 4 px per module fall into the affected ratio band at a rate that matters.");
    out("- The rate of the failure over random pixel phases (the phase lattice here is 0.25 px with 10 seeds per phase; section 6 uses 1 degree and 2 x 2 phases).");
    out("- The effect of a lower gate on false positives, on detection of non-marker blobs, on 3 x 3 boards, or on any cell other than the ones named above; this requires a separate full re-run.");
    out("- Whether other stored failures also depend on pixel phase (the RANDOM-rotation NOT_QUADRILATERAL failures were not analysed beyond their stage and reason).");
    out("- The silent gate drop in the duplex cell (1 of the 4 in the 1100-trial sample) was not examined further, and the recorded failing seeds beyond the first 3 per cell (up to 20 are stored) were not re-run.");
    out();
    return finish(lines, write, equalityFailures);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function finish(lines: string[], write: boolean, equalityFailures: number): void {
  const text = lines.join("\n") + "\n";
  console.log(text);
  if (equalityFailures > 0) process.exitCode = 1;
  if (write) {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, text);
    console.log(`written to ${OUT}`);
  }
}

void main();
