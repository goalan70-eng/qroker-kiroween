// Task 5.6 geometry experiments: design, plan, benchmark and (Phase B) execution.
// SYNTHETIC images, not real cameras. Nothing here measures or guarantees real-camera performance.
//
//   npm run measure:geometry -- --list [--tier N]
//   npm run measure:geometry -- --plan  [--out FILE]            write the deterministic plan (docs/optical/results/geometry-experiments-plan.md)
//   npm run measure:geometry -- --bench [--write] [--scaling 4,8]   time a fixed sample (and optionally process scaling)
//   npm run measure:geometry -- --run --tier N [--shard i/k] [--work-dir DIR] [--max-trials n] [--cell TEXT] [--force]
//
// --run writes one JSON file per finished cell into the work directory (default .geometry-work/tier<N>/) and
// skips cells whose file exists, so a run can be stopped and resumed and split over processes with --shard.
// --max-trials is for smoke tests only and requires an explicit --work-dir so smoke files never mix with real ones.
// All seeds are derived from (cell id, trial index); no timestamps are written into any result file.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASELINE_CELL_TRIALS,
  CLEAN_DARK,
  GRID_GEOMETRIES,
  LEVELS,
  MIN_TRIALS_PER_CELL,
  PROFILES,
  REFERENCE_GEOMETRIES,
  SYNTHETIC_DISCLAIMER,
  duplexConfigs,
  enumerateCells,
  fullFactorial,
  geometryReport,
  groupSummaries,
  levelCoverage,
  summarizeCell,
  tierSummaries,
  trialSeed,
  zeroEventUpperBound95,
  GEOMETRY_BASE_SEED,
  type Cell,
  type CellParams,
  type TierNumber,
  type TrialRecord,
} from "../src/optical/testing/geometry-design";
import { CAMERA_DISTANCE_DIAGONALS, CAMERA_WARP_SUPERSAMPLE, TABLE_MARGIN_MM, geometryOf, runTrial, type TrialTimings } from "../src/optical/testing/geometry-trial";
import { DEFAULT_PX_PER_MM, DEFAULT_SUPERSAMPLE } from "../src/optical/testing/physical-card";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = resolve(ROOT, "docs/optical/results");
const PLAN_PATH = resolve(RESULTS_DIR, "geometry-experiments-plan.md");
const BENCH_PATH = resolve(RESULTS_DIR, "geometry-bench.json");
const DEFAULT_WORK_DIR = resolve(ROOT, ".geometry-work");

// ---------------------------------------------------------------------------------------------
// Cost classes and benchmark
// ---------------------------------------------------------------------------------------------

export type CostClass = "B2-plain" | "B2-degraded" | "B2-duplex" | "B3-plain" | "B3-degraded";
export const COST_CLASSES: readonly CostClass[] = ["B2-plain", "B2-degraded", "B2-duplex", "B3-plain", "B3-degraded"];

const isDegraded = (p: CellParams): boolean =>
  p.cameraRotation !== "NONE" || p.tiltDeg > 0 || p.blurPx > 0 || p.lightingStrength > 0;

export function costClassOf(p: CellParams): CostClass {
  if (p.layout === "3x3") return isDegraded(p) ? "B3-degraded" : "B3-plain";
  if (p.face !== "FRONT" || p.cutOffsetMm > 0) return "B2-duplex";
  return isDegraded(p) ? "B2-degraded" : "B2-plain";
}

const stress = PROFILES.find((x) => x.name === "STRESS")!.overrides;
const mk = (o: Partial<CellParams>): CellParams => Object.assign({}, CLEAN_DARK, o) as CellParams;
const BENCH_PARAMS: Record<CostClass, CellParams> = {
  "B2-plain": mk({}),
  "B2-degraded": mk(stress),
  "B2-duplex": mk({ face: "BACK_HORIZONTAL", regShiftMm: 1.0, regRotDeg: 1, cutOffsetMm: 1.0 }),
  "B3-plain": mk({ layout: "3x3" }),
  "B3-degraded": mk({ layout: "3x3", ...stress }),
};

interface ClassBench {
  trials: number;
  meanMs: Record<keyof TrialTimings, number>;
  outcomes: Record<string, number>;
}

export interface BenchRecord {
  note: string;
  machine: { node: string; cpu: string; logicalCores: number; totalMemoryGiB: number; platform: string };
  sample: { warmupTrials: number; trialsPerClass: number; seedRule: string };
  classes: Record<CostClass, ClassBench>;
  peakRssMiB: number;
  scaling: Array<{ processes: number; wallSeconds: number; singleProcessSeconds: number; speedup: number }>;
}

function benchClass(cls: CostClass, trials: number, warmup: number): ClassBench {
  const p = BENCH_PARAMS[cls];
  const id = `bench-${cls}`;
  for (let i = 0; i < warmup; i++) runTrial(p, trialSeed(id, 10_000 + i));
  const sum: Record<string, number> = {};
  const outcomes: Record<string, number> = {};
  for (let i = 0; i < trials; i++) {
    const o = runTrial(p, trialSeed(id, i), { timings: true });
    for (const [k, v] of Object.entries(o.timings as TrialTimings)) sum[k] = (sum[k] ?? 0) + v;
    const key = o.record.cls === "CORRECT" ? "CORRECT" : `${o.record.cls}:${o.record.kind}`;
    outcomes[key] = (outcomes[key] ?? 0) + 1;
  }
  const mean = Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, Math.round((v / trials) * 100) / 100])) as Record<keyof TrialTimings, number>;
  return { trials, meanMs: mean, outcomes };
}

function childSample(): number {
  const t0 = performance.now();
  for (let i = 0; i < 40; i++) runTrial(BENCH_PARAMS["B2-plain"], trialSeed("bench-scaling-b2", i));
  for (let i = 0; i < 10; i++) runTrial(BENCH_PARAMS["B3-degraded"], trialSeed("bench-scaling-b3", i));
  return performance.now() - t0;
}

function runChildren(n: number): Promise<number> {
  const t0 = performance.now();
  const script = fileURLToPath(import.meta.url);
  return new Promise((resolveDone, reject) => {
    let left = n;
    for (let i = 0; i < n; i++) {
      const c = spawn(process.execPath, [...process.execArgv, script, "--bench-child"], { stdio: "ignore" });
      c.on("error", reject);
      c.on("exit", (code) => {
        if (code !== 0) reject(new Error(`bench child exited with ${code}`));
        if (--left === 0) resolveDone((performance.now() - t0) / 1000);
      });
    }
  });
}

async function runBench(trials: number, scaling: number[]): Promise<BenchRecord> {
  const classes = {} as Record<CostClass, ClassBench>;
  for (const cls of COST_CLASSES) {
    classes[cls] = benchClass(cls, trials, 3);
    console.log(`bench ${cls}: ${classes[cls].meanMs.totalMs.toFixed(1)} ms/trial (n=${trials})`);
  }
  const rec: BenchRecord = {
    note:
      "Measured wall-clock timings of a fixed sample (seeds derived from 'bench-<class>' and the trial index). Timings are " +
      "machine dependent and are the only non-deterministic content of the plan; they are recorded here, not recomputed by --plan. " +
      SYNTHETIC_DISCLAIMER,
    machine: {
      node: process.version,
      cpu: os.cpus()[0]?.model.trim() ?? "unknown",
      logicalCores: os.cpus().length,
      totalMemoryGiB: Math.round((os.totalmem() / 2 ** 30) * 10) / 10,
      platform: `${os.platform()} ${os.arch()}`,
    },
    sample: { warmupTrials: 3, trialsPerClass: trials, seedRule: "trialSeed('bench-<class>', i)" },
    classes,
    peakRssMiB: Math.round((process.resourceUsage().maxRSS / 1024) * 10) / 10,
    scaling: [],
  };
  if (scaling.length > 0) {
    const single = await runChildren(1);
    for (const n of scaling) {
      const wall = await runChildren(n);
      rec.scaling.push({
        processes: n,
        wallSeconds: Math.round(wall * 100) / 100,
        singleProcessSeconds: Math.round(single * 100) / 100,
        speedup: Math.round(((n * single) / wall) * 100) / 100,
      });
      console.log(`scaling: ${n} processes: ${wall.toFixed(1)} s (single ${single.toFixed(1)} s) speedup ${((n * single) / wall).toFixed(2)}`);
    }
  }
  return rec;
}

function readBench(): BenchRecord | null {
  return existsSync(BENCH_PATH) ? (JSON.parse(readFileSync(BENCH_PATH, "utf8")) as BenchRecord) : null;
}

export function projectSeconds(cells: readonly Cell[], bench: BenchRecord): { perClass: Record<CostClass, { trials: number; seconds: number }>; perTier: Record<number, number>; total: number } {
  const perClass = Object.fromEntries(COST_CLASSES.map((c) => [c, { trials: 0, seconds: 0 }])) as Record<CostClass, { trials: number; seconds: number }>;
  const perTier: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let total = 0;
  for (const c of cells) {
    const cls = costClassOf(c.params);
    const s = (c.trials * bench.classes[cls].meanMs.totalMs) / 1000;
    perClass[cls].trials += c.trials;
    perClass[cls].seconds += s;
    perTier[c.tier] = (perTier[c.tier] ?? 0) + s;
    total += s;
  }
  return { perClass, perTier, total };
}

// ---------------------------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------------------------

const fmt = (n: number | bigint): string => n.toLocaleString("en-US");
const hours = (s: number): string => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : `${(s / 60).toFixed(0)} min`);

const GROUP_TEXT: Record<string, string> = {
  "T1-CLEAN_DARK": "radius x inset grid, profile CLEAN_DARK (2x2 board, FRONT, zero error, no camera effect, dark table)",
  "T1-CLEAN_LIGHT": "radius x inset grid, profile CLEAN_LIGHT (as CLEAN_DARK on a light table)",
  "T1-MODERATE": "radius x inset grid, profile MODERATE (combined mid-level degradations)",
  "T1-STRESS": "radius x inset grid, profile STRESS (combined high-level degradations)",
  "T2-placement-shift": "shift along a seam 0.5 / 1.0 / 1.5 mm",
  "T2-placement-rotation": "per-card rotation bound 1 / 2 / 3 deg",
  "T2-placement-gap": "unintended gap 0.5 / 1.0 mm",
  "T2-camera-rotation": "camera rotation 45 deg / uniform random",
  "T2-perspective": "perspective tilt 10 / 20 / 30 / 40 deg",
  "T2-blur": "Gaussian blur sigma 0.5 / 1.0 / 1.5 / 2.0 px",
  "T2-lighting": "lighting gradient strength 0.2 / 0.4 / 0.6",
  "T2-table": "light table (identical to the Tier 1 CLEAN_LIGHT cell of the same geometry; merged, not repeated)",
  "T2-decoder-layout": "diagnostic: decoder defaults (marker offset 5.5 modules) at insets 1.5 and 2",
  "T3-duplex": "22 face / flip / registration / cut configurations on each of the 24 radius x inset geometries",
  "T4-3x3": "3x3 board with Distractor_Markers, complete group at a random interior vertex",
  "T4-2x2-incomplete": "2x2 board, one of the four cards absent",
  "T4-3x3-incomplete": "3x3 board, one of the four cards around the focus vertex absent",
};

const FACTOR_ROWS: Array<{ factor: string; key: keyof typeof LEVELS; levels: string; why: string }> = [
  { factor: "Corner radius (mm)", key: "radiusMm", levels: "0, 2.0, 3.0, 3.175, 3.6, 4.0, 5.0, 6.0", why: "Task list. 0 = square-corner control (no Central_Void), 3.175 = baseline (Req 15.1), 6.0 = past the containment limit at inset 1 (clearance -0.24 mm, reported invalid)." },
  { factor: "Inset (modules)", key: "insetModules", levels: "1, 1.5, 2", why: "Task list; Requirement 15.7 step 1. The reader is given the matching marker offset (inset + 1 + 3.5 modules), see Reader below." },
  { factor: "Table gray", key: "tableGray", levels: "64 (dark), 200 (light)", why: "64 is the BASELINE_GEOMETRY table of task 5.4; 200 is the light table of its seam tests. 255 is not used: it equals the card white, so seam and void would be invisible." },
  { factor: "Shift along a seam (mm)", key: "shiftMm", levels: "0, 0.5, 1.0, 1.5", why: "Task range 0-1.5 mm in equal steps. Level = bound on the relative shift of adjacent cards along their shared seam: each row slides in x and each column slides in y by a seeded uniform value in +-level/2." },
  { factor: "Per-card rotation bound (deg)", key: "rotationDeg", levels: "0, 1, 2, 3", why: "Task range 0-3 deg, integer steps. Each card gets an independent seeded uniform rotation in +-level about its centre (same convention as `seededErrors`)." },
  { factor: "Unintended gap (mm)", key: "gapMm", levels: "0, 0.5, 1.0", why: "Task range 0-1 mm: both ends and the midpoint. Uniform gap in both directions (pitch = card size + gap); this is the only across-seam displacement." },
  { factor: "Camera rotation", key: "cameraRotation", levels: "NONE (0 deg), DEG45, RANDOM (uniform 0-360)", why: "45 deg is the canonical-frame boundary of the marker detector (+-45 deg), the hardest axis angle; RANDOM covers arbitrary rotation (Requirement 12.5)." },
  { factor: "Perspective tilt (deg)", key: "tiltDeg", levels: "0, 10, 20, 30, 40", why: "Pinhole tilt about a seeded random in-plane axis, camera at 1.0 image diagonals. The marker detector alone was exact to 50 deg (m4-1); 40 deg is the highest level kept so that the transition region is sampled." },
  { factor: "Blur sigma (px)", key: "blurPx", levels: "0, 0.5, 1.0, 1.5, 2.0", why: "Gaussian, in image pixels; one module is 4 px, so 2.0 px is half a module. A 10-trial unrecorded pilot on the baseline showed the reader failing between 1.0 and 1.5 px, so the transition lies inside the range." },
  { factor: "Lighting gradient", key: "lightingStrength", levels: "0, 0.2, 0.4, 0.6", why: "Linear multiplicative ramp, gain 1 on one side to 1 - level on the other, seeded random direction (m4-1 used ramps x0.6..x1 down to x0.2)." },
  { factor: "Board kind", key: "layout", levels: "2x2, 3x3", why: "Task: 3x3 boards with Distractor_Markers. A 3x3 board has 18 markers: 4 at the focus vertex, 14 distractors." },
  { factor: "Card absent", key: "absentCard", levels: "no, yes", why: "Task: incomplete groups (one card absent). Expected result is a rejection; any IDENTIFIED result is a false acceptance." },
  { factor: "Face / flip", key: "face", levels: "FRONT, BACK_VERTICAL, BACK_HORIZONTAL", why: "Task: FRONT/BACK, vertical-axis and horizontal-axis flips (design.md section 7)." },
  { factor: "Back-print registration shift (mm)", key: "regShiftMm", levels: "0, 0.25, 0.5, 1.0", why: "Task values. Fixed magnitude, uniformly random direction per card. No effect on FRONT (the front is the registration reference)." },
  { factor: "Back-print registration rotation (deg)", key: "regRotDeg", levels: "0, 0.5, 1", why: "Task values. Fixed magnitude, random sign per card." },
  { factor: "Cut-outline offset (mm)", key: "cutOffsetMm", levels: "0, 0.5, 1.0", why: "Task values. Fixed magnitude, uniformly random direction per card; applies to both faces." },
];

interface NotRun {
  what: string;
  why: string;
  count: string;
}

function notRunList(cells: readonly Cell[]): NotRun[] {
  const nGrid = GRID_GEOMETRIES.length;
  const nRef = REFERENCE_GEOMETRIES.length;
  const ofat = cells.filter((c) => c.group.startsWith("T2-") && c.group !== "T2-table" && c.group !== "T2-decoder-layout").length / nRef;
  const duplexRun = duplexConfigs().filter((c) => c.overrides.face !== "FRONT").length / 2;
  const duplexFull = LEVELS.regShiftMm.length * LEVELS.regRotDeg.length * LEVELS.cutOffsetMm.length;
  return [
    { what: "Full factorial cross product of all factors", why: "size, see above", count: fmt(fullFactorial().cells) },
    { what: `One-factor-at-a-time sweeps (Tier 2) on the other ${nGrid - nRef} radius x inset geometries`, why: "those geometries are sampled by the four Tier 1 profiles and, for the duplex factors, by Tier 3; the OFAT sweeps need only the baseline, its inset candidates and the boundary radii (task text: at least the boundary radii)", count: `${fmt((nGrid - nRef) * ofat)} cells` },
    { what: "Cross products of the degradation factors with each other, other than the three combined profiles (MODERATE, STRESS, CLEAN_LIGHT)", why: "pairwise interactions (shift x rotation, tilt x blur, ...) are not enumerated; the combined profiles are the only interaction points", count: "not enumerated" },
    { what: "Duplex configurations (BACK/flip/registration/cut) combined with placement or camera degradation, a light table, or 3x3 boards", why: "Tier 3 isolates the geometric effect of registration and cut error on the radius x inset grid; camera effects are Tier 1/2 factors", count: "not enumerated" },
    { what: `Full registration shift x rotation x cut cross (${duplexFull} per flip) beyond one-factor, all-mid and all-max`, why: `containment loss is additive in the three errors (duplexContainment bound), so all-max is the worst case for clipping; intermediate combinations fall between all-zero and all-max`, count: `${fmt((duplexFull - duplexRun) * 2 * nGrid)} cells (${duplexFull - duplexRun} per flip per geometry)` },
    { what: "FRONT face x back-print registration", why: "by model the registration moves only the back print; the front is the reference (physical-card.ts)", count: "not applicable" },
    { what: "Mixed faces inside one group (some cards FRONT, some BACK, different flips)", why: "not required by task 5.6, where each face and flip is a homogeneous parameter; at zero error every face looks like the front (task 5.5)", count: "not enumerated" },
    { what: "3x3 boards and incomplete groups on the 18 geometries that are not reference geometries", why: "Tier 4 uses the reference geometries x four profiles", count: `${fmt((nGrid - nRef) * PROFILES.length * 3)} cells` },
    { what: "3x3 boards and incomplete groups with BACK faces", why: "face x board-kind is not required; Tier 3 covers the faces on 2x2 boards", count: "not enumerated" },
    { what: "Every slot as the absent card of an incomplete group", why: "the absent slot is a seeded uniform draw per trial (about 50 trials per slot at n = 200)", count: "-" },
    { what: "Other incomplete or invalid arrangements (90/270 degree cards, wrong slot orientation, duplicate card)", why: "rejection logic of task 6, not a geometry factor", count: "-" },
    { what: "Module size and white quiet-margin sweeps (Requirement 15.7 step 2)", why: "not in the task 5.6 factor list; see the open question below", count: "not enumerated" },
    { what: "Decoder options other than the marker offset: radius 2, adaptive binarization, tolerances", why: "thresholds and recognition parameters are preserved; the default-options diagnostic is run only for insets 1.5 and 2", count: "-" },
  ];
}

export function renderPlan(cells: readonly Cell[], bench: BenchRecord | null): string {
  const L: string[] = [];
  const tiers = tierSummaries(cells);
  const groups = groupSummaries(cells);
  const ff = fullFactorial();
  const totalCells = cells.length;
  const totalTrials = cells.reduce((t, c) => t + c.trials, 0);
  const gBase = geometryOf(CLEAN_DARK);
  const px = (n: number): number => Math.ceil(n * DEFAULT_PX_PER_MM - 1e-9);
  const dims = (n: number): string => `${px(n * gBase.cardWidthMm + 2 * TABLE_MARGIN_MM)} x ${px(n * gBase.cardHeightMm + 2 * TABLE_MARGIN_MM)}`;

  L.push("# Task 5.6 geometry experiments: design, workload and timing plan");
  L.push("");
  L.push("**Synthetic images, not real cameras.** Everything planned here, and every number the experiment will produce, concerns rasters drawn by `src/optical/testing/` and sampled with fixed seeds. These are synthetic-test findings about the sampled conditions only. They do not measure or guarantee real-camera performance, and the zero-event bound applies only to the sampled synthetic condition distribution (independent seeded trials).");
  L.push("");
  L.push("This file is generated by `npm run measure:geometry -- --plan` from `src/optical/testing/geometry-design.ts`. Its design parts are deterministic (no timestamps); the timing section is copied from `docs/optical/results/geometry-bench.json`, written by `--bench --write`. Results of the sweep are in `geometry-experiments.md` / `.json` (merge step: `npm run merge:geometry`).");
  L.push("");
  L.push("## 1. What is simulated and what the reader gets");
  L.push("");
  L.push(`- Board: cards of 63.5 x 88.9 mm (module 1.5875 mm), rounded corners, laid out on a pitch of card size + gap, on a table of uniform gray, plus a ${TABLE_MARGIN_MM} mm table margin. Raster: ${DEFAULT_PX_PER_MM.toFixed(3)} px/mm (4 px per module, marker core 28 px), ${DEFAULT_SUPERSAMPLE} x ${DEFAULT_SUPERSAMPLE} anti-aliasing sub-samples. Image size ${dims(2)} px (2x2) and ${dims(3)} px (3x3).`);
  L.push("- Camera chain, applied to the board raster in this order: in-plane rotation and perspective tilt (one projective warp, background = table gray, supersample " + CAMERA_WARP_SUPERSAMPLE + "), Gaussian blur, multiplicative lighting ramp. Each stage at zero strength is skipped, so the image is unchanged. Camera distance for the perspective factor: " + CAMERA_DISTANCE_DIAGONALS.toFixed(1) + " image diagonals. The warp is about the image centre, which is the focus vertex of a 2x2 board; outer parts of the board can leave the frame at large rotation.");
  L.push("- Reader: `decodeGroup(image, { centerOffsetModules })`. The image is the only data input. The expected cards, positions and sum are used only afterwards, to score the result (`classify` in `geometry-trial.ts`). All recognition thresholds, tolerances, the acceptance radius (1), binarization (Otsu default) and the frozen codebook (SHA256 `515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4`) are untouched.");
  L.push("- **Reader layout parameter (decision for review).** The decoder's default expects marker centres 5.5 modules from the vertex (inset 1). For inset 1.5 and 2 the centres are 6.0 and 6.5 modules away. The reader is told the matching offset `inset + 1 + 3.5` (an existing option, `centerOffsetModules`; no threshold changes). To show that this is necessary, Tier 2 has two diagnostic cells that run inset 1.5 and 2 with the decoder defaults (an unrecorded 10-trial pilot: the defaults identified 10/10 at inset 1.5 and rejected 10/10 as INCOMPLETE_GROUP at inset 2). Without this option the inset sweep would measure the reader's built-in layout assumption instead of the card geometry. Decision needed: confirm that telling the reader the card layout is acceptable for the inset sweep.");
  L.push("- Scoring per trial: CORRECT = IDENTIFIED with the exact four cards and the exact Hidden_Sum. REJECTED = any other decoder kind (kinds tallied). FALSE_ACCEPT = IDENTIFIED with a wrong card set or sum, or IDENTIFIED when a card is absent. A 3x3 board is drawn so that exactly one interior vertex has four markers (rejection sampling on the distractor cards), so the ground-truth group is unique.");
  L.push("- Placement model: rows slide along their horizontal seams and columns along their vertical seams (the shift factor), every card rotates by its own seeded angle about its centre, and the gap factor is the only across-seam displacement. Where a rotated card runs into a neighbour, the later card in row-major order is painted on top (a raster convention, not a contact-mechanics model).");
  L.push("- Double-sided model: task 5.5 (`printLayers`, `observeFace`), extended to a whole board. The board rasterizer is tested to be pixel-identical to `observeFace` for one card and to `composeBoard` for FRONT boards. Registration and cut offsets are drawn per card (magnitude = level, direction random). Paper show-through is not simulated (Requirement 16.10 is a Milestone 8 measurement).");
  L.push("");
  L.push("## 2. Factors and levels");
  L.push("");
  L.push("| Factor | Levels | Why these levels | Cells using each level (all tiers) |");
  L.push("|---|---|---|---|");
  const cover = levelCoverage(cells);
  for (const f of FACTOR_ROWS) {
    const per = cover.filter((c) => c.factor === f.key).map((c) => `${c.level}: ${fmt(c.cells)}`).join("; ");
    L.push(`| ${f.factor} | ${f.levels} | ${f.why} | ${per} |`);
  }
  L.push("");
  L.push("Every level of every factor appears in at least one cell (checked by `geometry-design.test.ts`).");
  L.push("");
  L.push("## 3. Full factorial: not feasible");
  L.push("");
  L.push("| Factor | Levels |");
  L.push("|---|---|");
  for (const f of ff.factors) L.push(`| ${f.name} | ${f.levels} |`);
  L.push("");
  L.push(`Cells of the full cross product: **${fmt(ff.cells)}** (about ${(Number(ff.cells) / 1e6).toFixed(0)} million). At the minimum of ${MIN_TRIALS_PER_CELL} trials per cell this is ${fmt(ff.trialsAtMinimum)} trials, about ${(Number(ff.trialsAtMinimum) / 1e9).toFixed(0)} billion. Even at 0.07 s per trial that is on the order of ${(Number(ff.trialsAtMinimum) * 0.07 / 3.15e7).toFixed(0)} CPU-years, so a tiered design is required. (The duplex group is counted by distinct combinations: FRONT x 3 cut offsets, plus 2 flips x 4 x 3 x 3.)`);
  L.push("");
  L.push("## 4. Tiered design");
  L.push("");
  L.push("Reference geometries (Tiers 2 and 4): " + REFERENCE_GEOMETRIES.map((g) => `(r=${g.radiusMm}, inset ${g.insetModules})`).join(", ") + ". They are the baseline, its two inset improvement candidates (Requirement 15.7 step 1) and the boundary radii 0 and 6.0 mm.");
  L.push("");
  L.push("Profiles (degradation levels, all taken from the factor levels above):");
  L.push("");
  L.push("| Profile | Definition |");
  L.push("|---|---|");
  for (const p of PROFILES) L.push(`| ${p.name} | ${p.description} |`);
  L.push("");
  L.push(`Trials: ${BASELINE_CELL_TRIALS} for the four Tier 1 cells with the baseline geometry (r = 3.175 mm, inset 1), ${MIN_TRIALS_PER_CELL} for every other cell. Cells are never pooled.`);
  L.push("");
  const otherBaseline = cells.filter((c) => c.params.radiusMm === 3.175 && c.params.insetModules === 1 && c.trials < BASELINE_CELL_TRIALS);
  L.push(`Option, not applied: the task text asks for 1,000 trials for "the baseline cell". The plan reads that as the Tier 1 baseline cell of each profile. ${otherBaseline.length} further cells (Tiers 2-4) also use the baseline geometry; raising them to 1,000 trials would add ${fmt(otherBaseline.length * (BASELINE_CELL_TRIALS - MIN_TRIALS_PER_CELL))} trials.`);
  L.push("");
  L.push("**Disclosure: how the profile levels were chosen.** The CLEAN / MODERATE / STRESS profile parameters were chosen after a small, unrecorded pilot on the baseline geometry (10 to 30 trials per variant, no log kept). STRESS was lowered to 1 deg per-card rotation and 0.5 px blur because the first draft (2 deg, 1.0 px) failed about 80% of baseline trials. The profile levels are therefore design choices made to put the reader in a region where it neither passes nor fails everything, not thresholds tuned until the reader passed. No recognition threshold, tolerance, acceptance radius or codebook value was changed at any point. The profile definitions were fixed before the sweep; no sweep result feeds back into them.");
  L.push("");
  L.push("| Tier | Purpose | Cells | Trials |");
  L.push("|---|---|---|---|");
  const purpose: Record<number, string> = {
    1: "radius x inset full grid under four degradation profiles",
    2: "one-factor-at-a-time sweeps on the six reference geometries (nominal = CLEAN_DARK) and the decoder-layout diagnostic",
    3: "face / flip / registration / cut sweeps on top of the full radius x inset grid",
    4: "3x3 boards with Distractor_Markers and incomplete groups on the reference geometries x four profiles",
  };
  for (const t of tiers) L.push(`| ${t.tier} | ${purpose[t.tier]} | ${fmt(t.cells)} | ${fmt(t.trials)} |`);
  L.push(`| **Total** | | **${fmt(totalCells)}** | **${fmt(totalTrials)}** |`);
  L.push("");
  L.push("Cells by group:");
  L.push("");
  L.push("| Tier | Group | Description | Cells | Trials | Duplicates merged |");
  L.push("|---|---|---|---|---|---|");
  for (const g of groups) L.push(`| ${g.tier} | ${g.group} | ${GROUP_TEXT[g.group] ?? ""} | ${fmt(g.cells)} | ${fmt(g.trials)} | ${g.mergedDuplicates} |`);
  L.push("");
  L.push("A cell is identified by all of its parameters (`cellId`), so a configuration requested twice is run once and its second request is listed as a merged duplicate (the Tier 2 light-table cells equal the Tier 1 CLEAN_LIGHT cells).");
  L.push("");
  L.push("### Tier 3 configurations (per geometry, 22 cells)");
  L.push("");
  for (const c of duplexConfigs()) L.push(`- ${c.name}`);
  L.push("");
  L.push("FRONT with zero cut offset is the Tier 1 CLEAN_DARK cell; BACK with zero error is run as its own cell (it must reproduce the FRONT image exactly, so it doubles as a regression check of the flip model).");
  L.push("");
  L.push("## 5. Cross products that are NOT run");
  L.push("");
  L.push("| Not run | Why | Size |");
  L.push("|---|---|---|");
  for (const n of notRunList(cells)) L.push(`| ${n.what} | ${n.why} | ${n.count} |`);
  L.push("");
  L.push("### Requirement 15.7 steps 2 and 3 (decision: not evaluated)");
  L.push("");
  L.push("The decision table must evaluate steps 1-4 before it may recommend a corner-radius reduction. This plan evaluates step 1 (inset, Tier 1 and 2) and step 4 (alignment tolerances: placement errors in Tier 1/2, registration and cut in Tier 3). Step 2 (marker size and white margin) has no sweep in the task 5.6 text, and step 3 (detection and geometric-correction algorithm) is out of scope while the decoder is frozen. Decision taken for this task: steps 2 and 3 are NOT evaluated, so the decision table records them as such and does not recommend a radius reduction. The following Tier 5 was proposed and is NOT implemented: a Tier 5 on the reference geometries with module size {1.4, 1.5875, 2.0} mm x quiet margin {1, 1.5} modules under the CLEAN_DARK and STRESS profiles, about 6 x 6 x 200 = 7,200 trials; it needs `moduleMm` and `quietMarginModules` as cell parameters.");
  L.push("");
  L.push("## 6. Statistics recorded per cell");
  L.push("");
  L.push("For each cell, separately and never pooled: trials n; correct (all four cards and the sum) with rate; rejected with rate and a tally of the rejection kinds; false acceptances (wrong card set or sum returned as IDENTIFIED, or IDENTIFIED for an incomplete group) with rate; when the false-acceptance count is 0, the exact one-sided 95% upper bound 1 - 0.05^(1/n) (" + `${(100 * zeroEventUpperBound95(1000)).toFixed(2)}% for n = 1000, ${(100 * zeroEventUpperBound95(200)).toFixed(2)}% for n = 200` + "); otherwise the count, the rate and all failing seeds instead of a bound; a tally of failure causes (decoder kind, plus a flag when the conservative containment bound of the cell's cards is violated); the first rejected seeds; `voidToBorderCornerMm` (true minimum distance from the Central_Void to the black-border corner; `null` in code and \"No Central_Void\" in the report for r = 0) and `voidTipToBorderCornerMm` as an additional reference column, with the containment clearance and validity of the geometry. For incomplete-group cells rejection is the expected outcome (correct = 0 by definition, `rejected` is the good count, a false acceptance is any IDENTIFIED result). Results carry the disclaimer text and no timestamps.");
  L.push("");
  L.push("Seeds: `trialSeed(cellId, trialIndex)` = hash of (base seed " + GEOMETRY_BASE_SEED + ", cell id, trial index), 32 bit. Cards, placement errors, duplex errors and camera draws use four independent streams derived from that seed. Trials within a cell are independent draws; cells are not paired.");
  L.push("");
  L.push("## 7. Timing and runtime projection");
  L.push("");
  if (bench === null) {
    L.push("No benchmark recorded yet. Run `npm run measure:geometry -- --bench --write --scaling 4,8`.");
  } else {
    const proj = projectSeconds(cells, bench);
    L.push(`Measured on ${bench.machine.cpu}, ${bench.machine.logicalCores} logical cores, ${bench.machine.totalMemoryGiB} GiB, Node ${bench.machine.node} (${bench.machine.platform}); ${bench.sample.trialsPerClass} timed trials per class after ${bench.sample.warmupTrials} warm-up trials, fixed seeds (${bench.sample.seedRule}). Times in ms per trial, one process.`);
    L.push("");
    L.push("| Cost class | Example | build | render | warp | blur | light | decode | total | outcomes in sample |");
    L.push("|---|---|---|---|---|---|---|---|---|---|");
    const example: Record<CostClass, string> = {
      "B2-plain": "2x2, CLEAN_DARK",
      "B2-degraded": "2x2, STRESS",
      "B2-duplex": "2x2, BACK_HORIZONTAL, all-max registration and cut",
      "B3-plain": "3x3, CLEAN_DARK",
      "B3-degraded": "3x3, STRESS",
    };
    for (const cls of COST_CLASSES) {
      const c = bench.classes[cls];
      const m = c.meanMs;
      L.push(`| ${cls} | ${example[cls]} | ${m.buildMs.toFixed(1)} | ${m.renderMs.toFixed(1)} | ${m.warpMs.toFixed(1)} | ${m.blurMs.toFixed(1)} | ${m.lightMs.toFixed(1)} | ${m.decodeMs.toFixed(1)} | **${m.totalMs.toFixed(1)}** | ${Object.entries(c.outcomes).map(([k, v]) => `${k} ${v}`).join(", ")} |`);
    }
    L.push("");
    L.push("Cost class of a cell: 3x3 or 2x2; degraded if any camera effect is on; duplex if the face is BACK or the cut offset is non-zero.");
    L.push("");
    L.push("| Tier | Trials | Single-process time |");
    L.push("|---|---|---|");
    for (const t of tiers) L.push(`| ${t.tier} | ${fmt(t.trials)} | ${hours(proj.perTier[t.tier] ?? 0)} |`);
    L.push(`| **Total** | **${fmt(totalTrials)}** | **${hours(proj.total)}** (${(proj.total / 3600).toFixed(2)} h) |`);
    L.push("");
    if (bench.scaling.length > 0) {
      L.push("Measured process scaling (each of N processes runs the same fixed 50-trial sample; speedup = N x single-process time / wall time):");
      L.push("");
      L.push("| Processes | Wall time (s) | Single process (s) | Speedup |");
      L.push("|---|---|---|---|");
      for (const s of bench.scaling) L.push(`| ${s.processes} | ${s.wallSeconds} | ${s.singleProcessSeconds} | ${s.speedup} |`);
      L.push("");
      for (const s of bench.scaling) L.push(`- ${s.processes} processes: projected wall time about ${hours(proj.total / s.speedup)}.`);
      L.push("");
    }
    L.push(`Memory: peak resident set of the benchmark process ${bench.peakRssMiB} MiB. A trial holds the board raster (${dims(2)} px or ${dims(3)} px, 1 byte per pixel), one warp output and blur temporaries (Float64, 8 bytes per pixel), all released after the trial; per-cell state is the list of trial records (a few hundred small objects). Every worker process therefore needs roughly the same amount, so memory does not limit the number of processes on this machine.`);
  }
  L.push("");
  L.push("## 8. How to run it");
  L.push("");
  L.push("- Run per tier: `npm run measure:geometry -- --run --tier 1`, then 4, 2, 3 (Tier 3 is the largest). Each finished cell is written to `.geometry-work/tier<N>/<cell id>.json`; a restarted run skips cells that already have a file, so an interrupted run loses at most one cell.");
  L.push("- Concurrency: processes are independent and share nothing. Start k shards of a tier with `--shard i/k` (cells are dealt round-robin, so every shard gets a similar mix); each shard writes disjoint files. A merge step (Phase B) reads the cell files in cell-id order and writes `geometry-experiments.json` and `.md` plus the decision table; results do not depend on the shard layout or the number of processes because every trial seed depends only on (cell id, trial index).");
  L.push("- Smoke test before the real run: `--run --tier 1 --max-trials 5 --work-dir .geometry-smoke --cell r3.175-i1`.");
  L.push("- Phase B should also keep a verbatim copy of the console output of each tier run next to the results (`m5-6-*.txt`).");
  L.push("");
  return L.join("\n") + "\n";
}

// ---------------------------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------------------------

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

function runCells(cells: readonly Cell[], workDir: string, maxTrials: number | null, force: boolean): void {
  let done = 0;
  let skipped = 0;
  for (const cell of cells) {
    const file = resolve(workDir, `tier${cell.tier}`, `${cell.id}.json`);
    if (!force && existsSync(file)) {
      skipped++;
      continue;
    }
    const n = maxTrials === null ? cell.trials : Math.min(cell.trials, maxTrials);
    const t0 = performance.now();
    const records: TrialRecord[] = [];
    for (let i = 0; i < n; i++) records.push(runTrial(cell.params, trialSeed(cell.id, i)).record);
    const result = summarizeCell(cell, records);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(maxTrials === null ? result : { ...result, smokeRun: true }, null, 2) + "\n");
    done++;
    console.log(
      `${cell.id} n=${result.n} correct=${result.correct} rejected=${result.rejected} falseAccepts=${result.falseAccepts} (${((performance.now() - t0) / 1000).toFixed(1)} s)`,
    );
  }
  console.log(`cells run: ${done}, skipped (file exists): ${skipped}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cells = enumerateCells();

  if (args.has("bench-child")) {
    console.log(JSON.stringify({ ms: childSample() }));
    return;
  }
  if (args.has("list")) {
    const tier = args.has("tier") ? Number(args.get("tier")) : null;
    for (const c of cells) if (tier === null || c.tier === tier) console.log(`T${c.tier}\t${c.trials}\t${c.id}\t${c.label}`);
    return;
  }
  if (args.has("plan")) {
    const out = resolve(ROOT, args.get("out") !== undefined && args.get("out") !== "true" ? (args.get("out") as string) : PLAN_PATH);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, renderPlan(cells, readBench()));
    const g = geometryReport({ radiusMm: 0, insetModules: 1 });
    console.log(`plan written to ${out} (${cells.length} cells; r=0 void distance ${g.voidToBorderCornerMm === null ? "No Central_Void" : g.voidToBorderCornerMm})`);
    return;
  }
  if (args.has("bench")) {
    const trials = args.has("trials") ? Number(args.get("trials")) : 20;
    const scaling = args.has("scaling") ? (args.get("scaling") as string).split(",").map(Number) : [];
    const rec = await runBench(trials, scaling);
    if (args.has("write")) {
      writeFileSync(BENCH_PATH, JSON.stringify(rec, null, 2) + "\n");
      console.log(`bench written to ${BENCH_PATH}`);
    }
    const proj = projectSeconds(cells, rec);
    console.log(`projected single-process time for ${cells.reduce((t, c) => t + c.trials, 0)} trials: ${(proj.total / 3600).toFixed(2)} h`);
    return;
  }
  if (args.has("run")) {
    if (!args.has("tier")) throw new Error("--run needs --tier N (1-4)");
    const tier = Number(args.get("tier")) as TierNumber;
    const maxTrials = args.has("max-trials") ? Number(args.get("max-trials")) : null;
    if (maxTrials !== null && !args.has("work-dir")) throw new Error("--max-trials is a smoke option and requires an explicit --work-dir");
    const workDir = args.has("work-dir") ? resolve(ROOT, args.get("work-dir") as string) : DEFAULT_WORK_DIR;
    let sel = cells.filter((c) => c.tier === tier);
    if (args.has("cell")) sel = sel.filter((c) => c.id.includes(args.get("cell") as string));
    if (args.has("shard")) {
      const [i, k] = (args.get("shard") as string).split("/").map(Number) as [number, number];
      if (!(Number.isInteger(i) && Number.isInteger(k) && k >= 1 && i >= 0 && i < k)) throw new Error("--shard i/k needs 0 <= i < k");
      sel = sel.filter((_, idx) => idx % k === i);
    }
    runCells(sel, workDir, maxTrials, args.has("force"));
    return;
  }
  console.log("usage: --list | --plan | --bench [--write] [--scaling 4,8] | --run --tier N [--shard i/k] [--work-dir D] [--max-trials n] [--cell TEXT] [--force]");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  });
}
