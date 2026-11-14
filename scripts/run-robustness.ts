// Task 7.2 robustness experiment: design, plan, benchmark, execution (resumable, shardable) and merge/report.
// SYNTHETIC images, not real cameras. Nothing here measures or guarantees real-camera performance.
//
//   npm run robustness -- --list [--family flat|physical] [--match TEXT]
//   npm run robustness -- --plan [--out FILE]                      deterministic plan (docs/optical/results/robustness-plan.md)
//   npm run robustness -- --bench [--write] [--scaling 4,8]        time representative conditions of every cost class
//   npm run robustness -- --run [--family flat|physical] [--shard i/k] [--cell ID] [--work-dir DIR] [--max-trials N] [--force]
//   npm run robustness -- --repro --cell ID --trial N [--image FILE.png]
//   npm run robustness -- --merge [--work-dir DIR] [--out-dir DIR] [--allow-partial]
//
// --run writes one JSON file per finished condition into <work dir>/<family>/<id>.json (default .robustness-work/,
// git-ignored) and skips conditions whose file exists, so a run can be stopped and resumed and split over processes with
// --shard i/k (conditions are dealt by a deterministic cost-balanced rule). --max-trials is for smoke tests only and
// requires an explicit --work-dir. All seeds derive from (condition id, trial index); no timestamps are written into
// any result file. --merge writes robustness.json / robustness.md; it refuses to write smoke or partial data into
// docs/optical/results.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALIGNMENT_PROFILES,
  BASELINE_INSET_MODULES,
  BASELINE_RADIUS_MM,
  CAMERA_PROFILES,
  COST_CLASSES,
  FLAT_DISTANCE_DIAGONALS,
  FLAT_FIXED_ROTATIONS,
  FLAT_LEVELS,
  FLAT_TRIALS,
  MIN_TRIALS_PER_CONDITION,
  MIX_TRIALS,
  PASS_CRITERION_TEXT,
  PHYSICAL_DISTANCE_DIAGONALS,
  PHYSICAL_LEVELS,
  PHYSICAL_TRIALS,
  ROBUSTNESS_BASE_SEED,
  SYNTHETIC_DISCLAIMER,
  assignShards,
  conditionById,
  coverageMatrix,
  enumerateConditions,
  familySummaries,
  fullFactorial,
  groupSummaries,
  totalTrials,
  trialSeed,
  zeroEventUpperBound95,
  type Condition,
  type CostClass,
  type Family,
} from '../src/optical/testing/robustness-design';
import { buildReport, renderJson, renderMarkdown } from '../src/optical/testing/robustness-report';
import { runCondition, runTrial, type ConditionResult } from '../src/optical/testing/robustness-trial';
import { encodePng } from './png';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS_DIR = resolve(ROOT, 'docs/optical/results');
const PLAN_PATH = resolve(RESULTS_DIR, 'robustness-plan.md');
const BENCH_PATH = resolve(RESULTS_DIR, 'robustness-bench.json');
const DEFAULT_WORK_DIR = resolve(ROOT, '.robustness-work');

// ---------------------------------------------------------------------------------------------
// Benchmark
// ---------------------------------------------------------------------------------------------

/** One representative condition per cost class (easy = plain, difficult = camera / errors / both). */
export const REPRESENTATIVES: Readonly<Record<CostClass, string>> = {
  'F-plain': 'A-CLEAN',
  'F-camera': 'A-PROF-MODERATE-N',
  'P2-plain': 'P-BOARD-2x2-C-F',
  'P2-camera': 'P-PROF-MODERATE-2x2-C-F',
  'P2-errors': 'P-DUP-2x2-C-BH-max',
  'P2-both': 'P-ALIGN-MODERATE-2x2-C-BH',
  'P3-plain': 'P-BOARD-3x3-C-F',
  'P3-camera': 'P-PROF-MODERATE-3x3-C-F',
  'P3-errors': 'P-DUP-3x3-C-BH-max',
  'P3-both': 'P-ALIGN-MODERATE-3x3-C-BH',
};

interface ClassBench {
  condition: string;
  trials: number;
  meanMs: { sceneMs: number; degradeMs: number; decodeMs: number; totalMs: number };
  outcomes: Record<string, number>;
}

export interface BenchRecord {
  note: string;
  machine: { node: string; cpu: string; logicalCores: number; totalMemoryGiB: number; platform: string };
  sample: { warmupTrials: number; flatTrials: number; physicalTrials: number; seedRule: string };
  classes: Record<CostClass, ClassBench>;
  cpuLoad: Array<{ phase: string; systemCpuPercent: number }>;
  competingProcesses: Array<{ name: string; logicalProcessors: number }>;
  peakRssMiB: number;
  scaling: Array<{
    processes: number;
    wallSeconds: number;
    singleProcessSeconds: number;
    speedup: number;
    systemCpuPercentMean: number;
    systemCpuPercentMax: number;
    childPeakRssMiB: number;
  }>;
  disk: { resultFileBytesMax: number; resultFileBytesMean: number; sampleFiles: number };
  flatPilot: { trialsPerCondition: number; seedRule: string; conditions: Array<{ id: string; correct: number; rejected: number; misidentified: number }> };
  /** Optional second measurement taken while other processes (for example an Android emulator) were using the CPU. */
  loaded?: Pick<BenchRecord, 'sample' | 'classes' | 'cpuLoad' | 'competingProcesses' | 'scaling'>;
}

const round = (x: number, d = 2): number => Math.round(x * 10 ** d) / 10 ** d;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function cpuTimes(): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    idle += c.times.idle;
    total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
  }
  return { idle, total };
}

async function sampleSystemCpu(ms: number): Promise<number> {
  const a = cpuTimes();
  await sleep(ms);
  const b = cpuTimes();
  const total = b.total - a.total;
  return total <= 0 ? 0 : round(100 * (1 - (b.idle - a.idle) / total), 1);
}

class CpuMonitor {
  private last = cpuTimes();
  readonly samples: number[] = [];
  private timer: NodeJS.Timeout | null = null;
  start(): void {
    this.last = cpuTimes();
    this.timer = setInterval(() => {
      const b = cpuTimes();
      const total = b.total - this.last.total;
      if (total > 0) this.samples.push(100 * (1 - (b.idle - this.last.idle) / total));
      this.last = b;
    }, 500);
  }
  stop(): { mean: number; max: number } {
    if (this.timer !== null) clearInterval(this.timer);
    const n = this.samples.length;
    return { mean: n === 0 ? 0 : round(this.samples.reduce((s, x) => s + x, 0) / n, 1), max: n === 0 ? 0 : round(Math.max(...this.samples), 1) };
  }
}

/** Top CPU consumers over a short window (Windows PowerShell), so that interference such as an emulator is documented. */
function competingProcesses(windowSeconds = 3): Array<{ name: string; logicalProcessors: number }> {
  if (os.platform() !== 'win32') return [];
  try {
    const script =
      `$a=Get-Process|Select-Object Id,Name,CPU;Start-Sleep ${windowSeconds};$r=foreach($p in Get-Process){$o=$a|Where-Object Id -eq $p.Id;` +
      `if($o -and $p.CPU -ne $null -and $o.CPU -ne $null){[pscustomobject]@{n=$p.Name;c=[math]::Round(($p.CPU-$o.CPU)/${windowSeconds},2)}}};` +
      `$r|Sort-Object c -Descending|Select-Object -First 4|ConvertTo-Json -Compress`;
    const out = execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8', timeout: 30000 }).trim();
    const parsed = JSON.parse(out) as { n: string; c: number } | Array<{ n: string; c: number }>;
    return (Array.isArray(parsed) ? parsed : [parsed]).map((x) => ({ name: x.n, logicalProcessors: x.c }));
  } catch {
    return [];
  }
}

const pseudo = (cond: Condition, id: string): Condition => ({ ...cond, id });

function benchClass(cls: CostClass, trials: number, warmup: number): ClassBench {
  const cond = conditionById(REPRESENTATIVES[cls]);
  if (cond === undefined) throw new Error(`unknown representative ${REPRESENTATIVES[cls]}`);
  if (cond.costClass !== cls) throw new Error(`representative ${cond.id} is class ${cond.costClass}, not ${cls}`);
  const b = pseudo(cond, `bench:${cls}`);
  for (let i = 0; i < warmup; i++) runTrial(b, 10_000 + i);
  const sum = { sceneMs: 0, degradeMs: 0, decodeMs: 0, totalMs: 0 };
  const outcomes: Record<string, number> = {};
  for (let i = 0; i < trials; i++) {
    const o = runTrial(b, i, { timings: true });
    const t = o.timings as NonNullable<typeof o.timings>;
    sum.sceneMs += t.sceneMs;
    sum.degradeMs += t.degradeMs;
    sum.decodeMs += t.decodeMs;
    sum.totalMs += t.totalMs;
    const key = o.record.cls === 'CORRECT' ? 'CORRECT' : `${o.record.cls}:${o.record.kind}`;
    outcomes[key] = (outcomes[key] ?? 0) + 1;
  }
  const mean = Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, round(v / trials)])) as ClassBench['meanMs'];
  return { condition: cond.id, trials, meanMs: mean, outcomes: Object.fromEntries(Object.entries(outcomes).sort(([a], [c]) => (a < c ? -1 : 1))) };
}

function childSample(): { ms: number; maxRssMiB: number } {
  const t0 = performance.now();
  const run = (cls: CostClass, n: number): void => {
    const b = pseudo(conditionById(REPRESENTATIVES[cls]) as Condition, `bench-scaling:${cls}`);
    for (let i = 0; i < n; i++) runTrial(b, i);
  };
  run('F-camera', 300);
  run('P2-camera', 40);
  run('P3-camera', 15);
  return { ms: performance.now() - t0, maxRssMiB: round(process.resourceUsage().maxRSS / 1024, 1) };
}

function runChildren(n: number): Promise<{ wall: number; maxRssMiB: number }> {
  const t0 = performance.now();
  const script = fileURLToPath(import.meta.url);
  return new Promise((resolveDone, reject) => {
    let left = n;
    let maxRss = 0;
    for (let i = 0; i < n; i++) {
      const c = spawn(process.execPath, [...process.execArgv, script, '--bench-child'], { stdio: ['ignore', 'pipe', 'inherit'] });
      let out = '';
      c.stdout.on('data', (d: Buffer) => (out += d.toString()));
      c.on('error', reject);
      c.on('exit', (code) => {
        if (code !== 0) reject(new Error(`bench child exited with ${String(code)}`));
        try {
          maxRss = Math.max(maxRss, (JSON.parse(out.trim().split('\n').pop() as string) as { maxRssMiB: number }).maxRssMiB);
        } catch {
          /* ignore */
        }
        if (--left === 0) resolveDone({ wall: (performance.now() - t0) / 1000, maxRssMiB: maxRss });
      });
    }
  });
}

/** Result files of a small run in a temporary directory: measures the disk footprint of the real result files. */
function measureDisk(): BenchRecord['disk'] {
  const dir = resolve(os.tmpdir(), `robustness-disk-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const sizes: number[] = [];
  for (const id of ['A-PROF-MODERATE-N', 'A-INC-STRESS', 'P-PROF-STRESS-2x2-C-BH', 'P-ALIGN-MAX-3x3-I-BV']) {
    const c = conditionById(id) as Condition;
    const file = resolve(dir, `${id}.json`);
    writeFileSync(file, JSON.stringify(runCondition(c, 12), null, 2) + '\n');
    sizes.push(statSync(file).size);
  }
  return { resultFileBytesMax: Math.max(...sizes), resultFileBytesMean: Math.round(sizes.reduce((s, x) => s + x, 0) / sizes.length), sampleFiles: sizes.length };
}

const PILOT_TRIALS = 30;
function flatPilot(conditions: readonly Condition[]): BenchRecord['flatPilot'] {
  const out: BenchRecord['flatPilot']['conditions'] = [];
  for (const c of conditions.filter((x) => x.family === 'FLAT' && !x.mix)) {
    const p = pseudo(c, `pilot:${c.id}`);
    let correct = 0;
    let rejected = 0;
    let mis = 0;
    for (let i = 0; i < PILOT_TRIALS; i++) {
      const r = runTrial(p, i).record;
      if (r.cls === 'CORRECT') correct++;
      else if (r.cls === 'REJECTED') rejected++;
      else mis++;
    }
    out.push({ id: c.id, correct, rejected, misidentified: mis });
  }
  return { trialsPerCondition: PILOT_TRIALS, seedRule: "trialSeed('pilot:<id>', i): seeds disjoint from the sweep", conditions: out };
}

async function runBench(conditions: readonly Condition[], flatTrials: number, physicalTrials: number, scaling: number[], pilot: boolean): Promise<BenchRecord> {
  const classes = {} as Record<CostClass, ClassBench>;
  const cpuLoad: BenchRecord['cpuLoad'] = [{ phase: 'before benchmark', systemCpuPercent: await sampleSystemCpu(2000) }];
  const competing = competingProcesses();
  for (const cls of COST_CLASSES) {
    const n = cls.startsWith('F-') ? flatTrials : physicalTrials;
    classes[cls] = benchClass(cls, n, 3);
    console.log(`bench ${cls} (${classes[cls].condition}): ${classes[cls].meanMs.totalMs.toFixed(1)} ms/trial (n=${n})`);
    cpuLoad.push({ phase: `after ${cls}`, systemCpuPercent: await sampleSystemCpu(1000) });
  }
  const rec: BenchRecord = {
    note:
      'Measured wall-clock timings of a fixed sample (seeds derived from "bench:<class>" and the trial index, disjoint from the sweep seeds). ' +
      'Timings, CPU load samples and process lists are machine dependent: they are the only non-deterministic content of the plan and are ' +
      'recorded here, not recomputed by --plan. ' + SYNTHETIC_DISCLAIMER,
    machine: {
      node: process.version,
      cpu: os.cpus()[0]?.model.trim() ?? 'unknown',
      logicalCores: os.cpus().length,
      totalMemoryGiB: round(os.totalmem() / 2 ** 30, 1),
      platform: `${os.platform()} ${os.arch()}`,
    },
    sample: { warmupTrials: 3, flatTrials, physicalTrials, seedRule: "trialSeed('bench:<class>', i)" },
    classes,
    cpuLoad,
    competingProcesses: competing,
    peakRssMiB: round(process.resourceUsage().maxRSS / 1024, 1),
    scaling: [],
    disk: measureDisk(),
    flatPilot: pilot ? flatPilot(conditions) : { trialsPerCondition: 0, seedRule: '', conditions: [] },
  };
  if (scaling.length > 0) {
    // Best of 2 repetitions (minimum wall time) for the single process and for each N, to limit the effect of
    // intermittent interference from other applications on this machine; the CPU monitor covers the kept repetition.
    const best = async (n: number): Promise<{ wall: number; maxRssMiB: number; cpu: { mean: number; max: number } }> => {
      let kept: { wall: number; maxRssMiB: number; cpu: { mean: number; max: number } } | null = null;
      for (let rep = 0; rep < 2; rep++) {
        const mon = new CpuMonitor();
        mon.start();
        const r = await runChildren(n);
        const cpu = mon.stop();
        if (kept === null || r.wall < kept.wall) kept = { ...r, cpu };
      }
      return kept as NonNullable<typeof kept>;
    };
    const single = await best(1);
    for (const n of scaling) {
      const r = await best(n);
      const cpu = r.cpu;
      rec.scaling.push({
        processes: n,
        wallSeconds: round(r.wall),
        singleProcessSeconds: round(single.wall),
        speedup: round((n * single.wall) / r.wall),
        systemCpuPercentMean: cpu.mean,
        systemCpuPercentMax: cpu.max,
        childPeakRssMiB: r.maxRssMiB,
      });
      console.log(`scaling: ${n} processes: ${r.wall.toFixed(1)} s (single ${single.wall.toFixed(1)} s) speedup ${((n * single.wall) / r.wall).toFixed(2)}, system CPU mean ${cpu.mean}% max ${cpu.max}%`);
    }
  }
  return rec;
}

function readBench(path = BENCH_PATH): BenchRecord | null {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as BenchRecord) : null;
}

export interface Projection {
  perClass: Record<CostClass, { conditions: number; trials: number; seconds: number }>;
  perFamily: Record<Family, { trials: number; seconds: number }>;
  total: number;
}

export function projectSeconds(conditions: readonly Condition[], bench: BenchRecord, trialsOverride?: (c: Condition) => number): Projection {
  const perClass = Object.fromEntries(COST_CLASSES.map((c) => [c, { conditions: 0, trials: 0, seconds: 0 }])) as Projection['perClass'];
  const perFamily: Projection['perFamily'] = { FLAT: { trials: 0, seconds: 0 }, PHYSICAL: { trials: 0, seconds: 0 } };
  let total = 0;
  for (const c of conditions) {
    const n = trialsOverride === undefined ? c.trials : trialsOverride(c);
    const s = (n * bench.classes[c.costClass].meanMs.totalMs) / 1000;
    perClass[c.costClass].conditions++;
    perClass[c.costClass].trials += n;
    perClass[c.costClass].seconds += s;
    perFamily[c.family].trials += n;
    perFamily[c.family].seconds += s;
    total += s;
  }
  return { perClass, perFamily, total };
}

// ---------------------------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------------------------

const fmt = (n: number | bigint): string => n.toLocaleString('en-US');
const dur = (s: number): string => (s >= 365 * 86400 ? `${fmt(Math.round(s / (365 * 86400)))} years` : s >= 86400 ? `${(s / 86400).toFixed(1)} days` : s >= 3600 ? `${(s / 3600).toFixed(2)} h` : `${(s / 60).toFixed(0)} min`);
const pctOf = (x: number): string => `${(100 * x).toFixed(2)}%`;

const GROUP_TEXT: Record<string, string> = {
  'A-BASE': 'clean flat 2x2 group on the exact pixel lattice',
  'A-FRAG': 'fragment position error 0.1 / 0.25 module, nothing else',
  'A-TILT': 'perspective tilt 10 / 20 / 30 / 40 / 50 deg, nothing else',
  'A-BLUR': 'blur sigma 0.5 / 1.0 / 1.5 / 2.0 px, nothing else',
  'A-NOISE': 'noise sigma 5 / 10 / 20 / 40 / 80, nothing else',
  'A-ILLUM': 'illumination gradient 0.2 / 0.4 / 0.6 / 0.8, nothing else',
  'A-ROT': 'camera rotation: 13 fixed angles (with / without sub-pixel phase jitter) and uniform random 0-360 deg',
  'A-RR-FRAG': 'random rotation + fragment position error',
  'A-RR-TILT': 'random rotation + tilt',
  'A-RR-BLUR': 'random rotation + blur',
  'A-RR-NOISE': 'random rotation + noise',
  'A-RR-ILLUM': 'random rotation + illumination',
  'A-REFL': 'reflection Fh / Fv, nothing else',
  'A-RR-REFL': 'random rotation + reflection Fh / Fv',
  'A-PROF': 'combined profiles MILD / MODERATE / STRESS x reflection none / Fh / Fv',
  'A-PAIR': 'ten two-factor interactions (random rotation + two of fragment 0.25, tilt 30, blur 1.0, noise 20, illumination 0.6)',
  'A-INC': 'incomplete group (one marker erased): clean and the three profiles (expected result: rejection)',
  'A-MIX': 'randomized mix: every factor drawn per trial from its level set (complete and incomplete)',
  'P-BOARD': '2x2 and 3x3 boards x complete / one card absent x FRONT / BACK vertical flip / BACK horizontal flip, no error',
  'P-DUP': 'duplex registration shift / rotation and cut offset sweeps on 2x2 (all faces), plus the largest levels on incomplete and 3x3 boards',
  'P-PLACE': 'card placement error sweeps on 2x2, plus the largest levels on 3x3 and incomplete boards',
  'P-CAM': 'camera degradations of degrade.ts on top of the compositions (2x2 FRONT sweeps, BACK with random rotation, 3x3 and incomplete subsets)',
  'P-PROF': 'camera-only profiles MILD / MODERATE / STRESS (incl. fragment position error) on perfect cards: 2 boards x 2 group kinds x 3 faces',
  'P-ALIGN': 'ALIGN-MILD / MODERATE / MAX: placement + duplex error + camera (no fragment error): 2 boards x 2 group kinds x 3 faces',
  'P-MIX': 'randomized mix of all physical factors (no fragment error): 2x2 / 3x3, complete / incomplete',
};

function notCovered(conds: readonly Condition[]): Array<{ what: string; why: string; size: string }> {
  const ffA = fullFactorial('FLAT');
  const ffB = fullFactorial('PHYSICAL');
  return [
    { what: 'Full factorial cross product of the flat factors', why: 'size; see section 5', size: `${fmt(ffA.conditions)} conditions` },
    { what: 'Full factorial cross product of the physical factors', why: 'size; see section 5', size: `${fmt(ffB.conditions)} conditions` },
    { what: 'Flat: fragment error / tilt / blur / noise / illumination crossed with each other except the 10 pair conditions, the three profiles and the randomized mix', why: 'pairs are sampled at the STRESS level of each factor (which, axis-aligned, is also the highest level at which the factor alone was mostly recognised in the pilot); other pairs, triples and higher are covered only by the profiles and the mix', size: 'not enumerated' },
    { what: 'Flat: reflection crossed with individual factors', why: 'reflection is an exact permutation applied before every other stage; it is crossed with random rotation, the profiles and the mix only', size: 'not enumerated' },
    { what: 'Flat: fixed rotation angles crossed with other factors', why: 'the 13 fixed angles are run alone; other factors are crossed with the random rotation, which samples all angles', size: 'not enumerated' },
    { what: 'Flat: incomplete groups under single factors and reflection', why: 'incomplete groups are run clean, under the three profiles and in the mix', size: 'not enumerated' },
    { what: 'Flat: module size other than 4 px, canvas other than 32 x 32 modules', why: 'one image scale, as the task 5.6 experiment (4 px per module)', size: '-' },
    { what: `Physical: any corner radius or inset other than ${BASELINE_RADIUS_MM} mm / ${BASELINE_INSET_MODULES} module`, why: 'the task 5.6 decision table recommends NO corner-radius reduction and names no radius or inset candidate; the inset 1.5 / 2 and radius 0 / 6 mm cells of task 5.6 are evaluation points, not recommendations', size: 'none to add' },
    { what: 'Physical: fragment position error crossed with card placement error or duplex error', why: 'the three error categories are distinct factors; the fragment error acts on the nominal marker footprints, which equal the true marker positions only when no card moves; ALIGN profiles and the mix therefore have fragment error 0', size: 'never combined' },
    { what: 'Physical: duplex registration shift x rotation x cut offset cross', why: 'run one factor at a time, "mid" (0.5 mm, 0.5 deg, 0.5 mm) and "max" (1.0 mm, 1 deg, 1.0 mm); containment loss is additive in the three errors (task 5.6)', size: `${(PHYSICAL_LEVELS.regShiftMm.length - 1) * (PHYSICAL_LEVELS.regRotDeg.length - 1) * (PHYSICAL_LEVELS.cutOffsetMm.length - 1) - 2} cells per flip not run` },
    { what: 'Physical: placement shift x rotation x gap cross', why: 'run one factor at a time and inside the ALIGN profiles', size: 'not enumerated' },
    { what: 'Physical: single camera factors crossed with BACK faces, with duplex error, or with placement error', why: 'BACK faces get the random rotation and the three profiles; duplex / placement error get the ALIGN profiles (camera + errors together) and the mix', size: 'not enumerated' },
    { what: 'Physical: 3x3 boards with every duplex or placement level', why: 'cost; 3x3 boards get the largest levels (cut 1.0 mm, "max", shift 1.5, rotation 3, gap 1.0), the camera subset and the profiles', size: 'not enumerated' },
    { what: 'Physical: tilt 50 deg, table gray other than 64, mixed faces inside one group', why: 'not required; the dark table 64 is the BASELINE_GEOMETRY table of task 5.4; mixed faces were not part of task 5.6', size: '-' },
    { what: 'Physical: whole-image reflection (Fh / Fv)', why: 'not physically meaningful for a table image; physically meaningful reflections are the vertical-axis and horizontal-axis card flips, which are covered as faces', size: 'not applicable' },
    { what: 'Every slot as the absent card of an incomplete group', why: 'the absent slot is a seeded uniform draw per trial (about n / 4 trials per slot)', size: '-' },
    { what: 'Other decoder options (acceptance radius 2, adaptive binarization, tolerances)', why: 'thresholds are never loosened or varied: r_acc = 1, position tolerance 1.0, marker-like gate unchanged', size: '-' },
    { what: `Conditions with fewer than ${MIN_TRIALS_PER_CONDITION} trials`, why: 'not allowed', size: `${conds.filter((c) => c.trials < MIN_TRIALS_PER_CONDITION).length}` },
  ];
}

export function renderPlan(conds: readonly Condition[], bench: BenchRecord | null): string {
  const L: string[] = [];
  const fams = familySummaries(conds);
  const groups = groupSummaries(conds);
  const A = fams.find((f) => f.family === 'FLAT') as (typeof fams)[number];
  const B = fams.find((f) => f.family === 'PHYSICAL') as (typeof fams)[number];
  const total = totalTrials(conds);
  const ffA = fullFactorial('FLAT');
  const ffB = fullFactorial('PHYSICAL');

  L.push('# Task 7.2 robustness experiment: design, workload and timing plan');
  L.push('');
  L.push('**Synthetic images, not real cameras.**');
  L.push('');
  L.push('**A zero false-acceptance count is an observation, not a mathematical guarantee.**');
  L.push('');
  L.push('Everything planned here, and every number the experiment will produce, concerns rasters drawn by `src/optical/` and `src/optical/testing/` and degraded by `src/optical/degrade.ts` with fixed seeds. They are synthetic-test findings about the sampled conditions only. They do not measure or guarantee real-camera performance, and the zero-event bound applies only to the sampled synthetic condition distribution (independent seeded trials).');
  L.push('');
  L.push('This file is generated by `npm run robustness -- --plan` from `src/optical/testing/robustness-design.ts`. Its design parts are deterministic (no timestamps); the timing section is copied from `docs/optical/results/robustness-bench.json`, written by `--bench --write`. The sweep (tasks 7.2 execution and 7.4) writes `robustness.json` and `robustness.md`; they do not exist yet.');
  L.push('');
  L.push('## 1. Numbers at a glance');
  L.push('');
  L.push('| Family | Conditions | Trials | Smallest n |');
  L.push('|---|---|---|---|');
  L.push(`| A: flat layout | **${A.conditions}** | ${fmt(A.trials)} | ${fmt(A.minTrials)} |`);
  L.push(`| B: physical geometry | **${B.conditions}** | ${fmt(B.trials)} | ${fmt(B.minTrials)} |`);
  L.push(`| **Total** | **${A.conditions + B.conditions}** | **${fmt(total)}** | ${fmt(Math.min(A.minTrials, B.minTrials))} |`);
  L.push('');
  L.push(`Every condition has at least ${fmt(MIN_TRIALS_PER_CONDITION)} trials (checked by the tests). The two families are reported separately and never pooled; conditions are never pooled. The exact one-sided 95% bound for zero misidentifications is ${pctOf(zeroEventUpperBound95(1000))} for n = 1000, ${pctOf(zeroEventUpperBound95(2000))} for n = 2000, ${pctOf(zeroEventUpperBound95(10000))} for n = 10000.`);
  L.push('');
  L.push('## 2. What is simulated, what the reader gets, what is judged');
  L.push('');
  L.push('**Flat family (A).** `composeGroup` of `group-compose.ts`: four markers around one vertex on a 32 x 32 module canvas, 4 px per module (128 x 128 px), white background, four distinct cards drawn per trial with a facing fragment in every slot (the generator of the task 5 group tests). The reader is `decodeGroup(image)` with its defaults.');
  L.push('');
  L.push('**Physical family (B).** `buildScenario` / `renderScenario` of `geometry-trial.ts`: rounded cards of 63.5 x 88.9 mm on a dark table (gray 64), 4 px per module, faces, flips, registration and cut offsets, placement errors, 3x3 boards with Distractor_Markers (rejection-sampled so that exactly one interior vertex has four markers). The Milestone 5 camera chain is NOT used; the degradations of `degrade.ts` are applied on top of the composition. The reader is `decodeGroup(image, { centerOffsetModules })` where the offset (`inset + quiet margin + 3.5` modules) comes from the predefined layout parameter, never from identities or board state (the rule of task 5.6). Default acceptance radius r_acc = 1, position tolerance 1.0, marker-like gate and the frozen codebook (SHA256 `515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4`) are untouched.');
  L.push('');
  L.push('**Judging.** The truth is used only after decoding. CORRECT = IDENTIFIED with exactly the right card set and sum. REJECTED = any other decoder kind (kinds are tallied). MISIDENTIFIED = IDENTIFIED with a wrong card set or sum, or IDENTIFIED for an incomplete composition (one card or marker absent, where the expected outcome is a rejection). Per condition the result files record n, correct count and rate, rejected count and rate with kinds, the misidentification count and rate, every misidentified trial (trial index and seed, reproducible), the first 10 non-expected rejections, and, only when the misidentification count is 0, the exact one-sided 95% bound 1 - 0.05^(1/n).');
  L.push('');
  L.push(`${PASS_CRITERION_TEXT} Success rates are measurements, not pass/fail. The mathematical guarantee (independent bit-flip model of design.md section 7, correction up to 2 bit errors, rejection of 2 to 3 bit errors for r_acc = 1) is a different statement from this finite-sample criterion; for arbitrary image corruption there is no guarantee.`);
  L.push('');
  L.push('## 3. The three error categories are distinct factors');
  L.push('');
  L.push('| Category | What it is | Parameter(s) | Family | Implementation |');
  L.push('|---|---|---|---|---|');
  L.push('| 1. Fragment position error | image-space translation of the optical marker footprint by exactly 0, 0.1 or 0.25 module in a seeded uniformly distributed direction, one independent direction per marker | `fragmentModules` | A and B | `fragmentOffsets` / `shiftFragments` of `degrade.ts` (stage 0) |');
  L.push('| 2. Card placement error | physical movement of a whole card: seam shift, per-card rotation, unintended gap | `placementShiftMm`, `placementRotDeg`, `gapMm` | B | `buildScenario` / `renderScenario` (the 5.6 model of `seededErrors` / `composeBoard`) |');
  L.push('| 3. Duplex registration error | front/back printing misalignment (shift, rotation) and cut-outline offset | `regShiftMm`, `regRotDeg`, `cutOffsetMm` | B | `printLayers` / registration model of `physical-card.ts` as used by `geometry-trial.ts` |');
  L.push('');
  L.push('The three categories share no parameter and are never relabelled (checked by `robustness-design.test.ts`). Fragment position error is never combined with category 2 or 3: it is applied to the footprint rectangles of the NOMINAL marker positions, which equal the true positions only when no card moves, and a moved card could otherwise be cut by the rectangle. The combined physical profiles with placement and duplex error therefore have fragment error 0, and the camera-only profiles (perfect cards) carry the fragment error.');
  L.push('');
  L.push('## 4. Physical geometries permitted by the task 5.6 decision table');
  L.push('');
  L.push(`The decision table of \`geometry-experiments.md\` section 9 recommends NO corner-radius reduction (Requirement 15.7 allows it only after steps 1 to 4 are evaluated; steps 2 and 3 were not) and names no radius or inset candidate. Step 1 only reports one descriptive difference (r = 0 mm, STRESS, inset 2 lower than inset 1). Therefore family B uses the baseline only: **corner radius ${BASELINE_RADIUS_MM} mm, inset ${BASELINE_INSET_MODULES} module**, and no other radius or inset is included. If the decision table is ever changed, adding a geometry means adding the conditions of family B for it; no code of this design assumes a single geometry besides the two constants.`);
  L.push('');
  L.push('## 5. Factors, levels and why');
  L.push('');
  L.push('Levels are design choices fixed before any sweep result existed; they were not tuned to make results look good. The flat and physical level sets are the same wherever the factor exists in both.');
  L.push('');
  L.push('| Factor | Levels | Family | Why these levels |');
  L.push('|---|---|---|---|');
  L.push(`| Fragment position error (modules) | ${FLAT_LEVELS.fragmentModules.join(', ')} | A, B | Requirement 12.5; the levels of \`degrade.ts\` |`);
  L.push(`| Camera rotation | clean = 0 deg on the exact lattice; fixed angles ${FLAT_FIXED_ROTATIONS.map((r) => r.tag).join(', ')} (13); uniform random 0-360 | A (all), B (0J, 45E, 45J, 90E, 180E, 270E, random) | Task: include 0, exactly 45, axis angles and random uniform. 45 deg is the canonical-frame boundary of the marker detector (+-45 deg). E = exact pixel lattice (rotation by a multiple of 90 deg is an exact index permutation; 45E is a single pixel phase), J = with sub-pixel phase jitter (below). 15, 30, 60, 75, 135, 225, 315 add angles inside each quadrant |`);
  L.push(`| Perspective tilt (deg) | ${FLAT_LEVELS.tiltDeg.filter((x) => x > 0).join(', ')} (B: up to 40) | A, B | task 5.6 levels 10-40 (the detector alone was exact to 50 deg); 50 added in the cheap flat family. Camera distance ${FLAT_DISTANCE_DIAGONALS} image diagonals in A and ${PHYSICAL_DISTANCE_DIAGONALS} in B (see the pilot disclosure), tilt axis uniform random per trial |`);
  L.push(`| Blur sigma (px) | ${FLAT_LEVELS.blurPx.filter((x) => x > 0).join(', ')} | A, B | task 5.6 levels; one module is 4 px, 5.6 found the transition between 1.0 and 1.5 px |`);
  L.push(`| Noise sigma (gray levels) | ${FLAT_LEVELS.noiseSigma.filter((x) => x > 0).join(', ')} | A, B | factor-of-two steps from 5 (about 2% of the 255 range) to 80 (31%), to span "no effect" to "destroyed" without a prior measurement; Gaussian, independent per pixel |`);
  L.push(`| Illumination gradient strength | ${FLAT_LEVELS.illumination.filter((x) => x > 0).join(', ')} | A, B | task 5.6 levels 0.2-0.6 plus 0.8 (gain 1 to 0.2 across the image, the darkest ramp of m4-1); direction uniform random per trial |`);
  L.push('| Reflection | none, Fh, Fv | A | D4 reflections of `transforms.ts`. B does not use whole-image reflection (not physically meaningful for a table image); the physical reflections are the card flips |');
  L.push('| Group | complete, incomplete (one marker / card absent) | A, B | expected result of an incomplete group is a rejection; IDENTIFIED is a misidentification |');
  L.push('| Board | 2x2, 3x3 (Distractor_Markers) | B | task |');
  L.push('| Face / flip | FRONT, BACK vertical-axis flip, BACK horizontal-axis flip | B | task; design.md section 7 |');
  L.push(`| Duplex registration shift (mm) | ${PHYSICAL_LEVELS.regShiftMm.join(', ')} | B | task 5.6 levels |`);
  L.push(`| Duplex registration rotation (deg) | ${PHYSICAL_LEVELS.regRotDeg.join(', ')} | B | task 5.6 levels |`);
  L.push(`| Cut-outline offset (mm) | ${PHYSICAL_LEVELS.cutOffsetMm.join(', ')} | B | task 5.6 levels |`);
  L.push(`| Card placement shift (mm) | ${PHYSICAL_LEVELS.placementShiftMm.join(', ')} | B | task 5.6 plan ("small" placement errors) |`);
  L.push(`| Card placement rotation (deg, per-card bound) | ${PHYSICAL_LEVELS.placementRotDeg.join(', ')} | B | task 5.6 plan |`);
  L.push(`| Card placement gap (mm) | ${PHYSICAL_LEVELS.gapMm.join(', ')} | B | task 5.6 plan |`);
  L.push('');
  L.push('### Sub-pixel phase jitter');
  L.push('');
  L.push('The Milestone 5 analysis found that cells with exactly 45 deg rotation, or without any warp, sample one pixel phase only, so their 0% and 100% results do not show robustness over phases. Every condition with any degradation therefore carries `phase = JITTER`: a seeded translation, uniform in [-0.5, 0.5) px per axis, is composed into the single geometric homography of the camera stage (perspective, rotation, translation; one resampling). It is the same as placing the scene on the canvas at a random sub-pixel offset. `degrade.ts` is not changed: `robustness-trial.ts` calls its exported `degrade`, `perspectiveMatrix` and `warpHomography`, and for a zero translation the result is byte-identical to `degrade` (tested). Conditions with `phase = EXACT` (the clean condition, 45E, 90E, 180E, 270E, and the physical conditions without a camera degradation) keep the exact lattice on purpose; the exact 45 deg conditions are kept next to the jittered ones so that the two can be compared. Axis-aligned conditions without jitter sample one pixel phase by construction (physical conditions without a camera effect still vary through the seeded card errors).');
  L.push('');
  L.push('### Combined profiles (design choices, defined once)');
  L.push('');
  L.push('| Profile | Definition |');
  L.push('|---|---|');
  L.push('| CLEAN | no degradation, exact lattice |');
  for (const p of CAMERA_PROFILES) L.push(`| ${p.name} | ${p.text} |`);
  for (const p of ALIGNMENT_PROFILES) L.push(`| ${p.name} (B only) | ${p.text} |`);
  L.push('');
  L.push('MILD and MODERATE reuse the tilt / blur / lighting levels of the task 5.6 profiles MODERATE and STRESS and add noise and fragment position error; STRESS extends them to levels at which the single-factor sweeps already lose trials. The ALIGN profiles pair the 5.6 placement and registration levels with the matching camera profile.');
  L.push('');
  L.push('### Pilot disclosure');
  L.push('');
  const pilot = bench?.flatPilot;
  if (pilot !== undefined && pilot.conditions.length > 0) {
    const allOk = pilot.conditions.filter((c) => c.correct === pilot.trialsPerCondition).length;
    const allRej = pilot.conditions.filter((c) => c.rejected === pilot.trialsPerCondition).length;
    const mixed = pilot.conditions.length - allOk - allRej;
    const mis = pilot.conditions.reduce((t, c) => t + c.misidentified, 0);
    const stress = pilot.conditions.filter((c) => c.id.startsWith('A-PROF-STRESS-'));
    const stressOk = stress.reduce((t, c) => t + c.correct, 0);
    L.push(`Before the plan was frozen, ${pilot.trialsPerCondition} trials of each of the ${pilot.conditions.length} explicit flat conditions were run with pilot seeds disjoint from the sweep seeds (\`${pilot.seedRule}\`; the counts of the final design are in \`robustness-bench.json\`, \`flatPilot\`): ${allOk} conditions all correct, ${allRej} all rejected, ${mixed} mixed; misidentifications seen in the pilot: ${mis}. An earlier run of the same pilot (not stored, it was repeated after the change below) found exactly one design problem: with the camera distance of 1.0 image diagonal every flat trial at 30 deg tilt was rejected, because the flat canvas (45 modules diagonal) is much smaller than a board image (146 modules for 2x2), which makes the perspective across a marker about four times stronger. The flat camera distance was changed to ${FLAT_DISTANCE_DIAGONALS} diagonals (the same distance in modules as the physical family) and nothing else was changed: no level, profile, threshold or tolerance was tuned to the results. The three flat STRESS conditions had ${stressOk} of ${stress.length * pilot.trialsPerCondition} pilot trials correct; the profile is kept as defined (it was fixed before the pilot), because a profile that is mostly rejected still tests that the reader rejects instead of guessing. No physical pilot was run besides the ${bench?.sample.physicalTrials ?? 20} timing trials per cost class (outcomes in \`robustness-bench.json\`).`);
  } else {
    L.push('No pilot recorded yet (run `--bench --write`).');
  }
  L.push('');
  L.push('## 6. Design: conditions per family and group');
  L.push('');
  L.push('| Family | Group | Description | Conditions | Trials |');
  L.push('|---|---|---|---|---|');
  for (const g of groups) L.push(`| ${g.family === 'FLAT' ? 'A' : 'B'} | ${g.group} | ${GROUP_TEXT[g.group] ?? ''} | ${g.conditions} | ${fmt(g.trials)} |`);
  L.push(`| | **Total** | | **${conds.length}** | **${fmt(total)}** |`);
  L.push('');
  L.push(`Trials: ${fmt(FLAT_TRIALS)} per ordinary flat condition (flat trials cost milliseconds), ${fmt(PHYSICAL_TRIALS)} per ordinary physical condition (the task minimum; physical trials cost 0.1 to 0.3 s), and ${Object.entries(MIX_TRIALS).map(([k, v]) => `${k} ${fmt(v)}`).join(', ')} for the randomized mixes. A condition requested twice is run once; merged duplicates: ${conds.reduce((t, c) => t + c.alsoIn.length, 0)}.`);
  L.push('');
  L.push('The **randomized mix** conditions are supplementary: each trial draws every factor independently and uniformly from its level set (rule in `resolveParams`), which samples the full cross product without enumerating it. A mix is ONE condition with its own n and bound; it never stands in for the explicit conditions and its counts are never added to other conditions. They can be removed from the design by deleting six lines of `buildConditions` without touching anything else.');
  L.push('');
  L.push('### Full factorial for comparison, and why it is not run');
  L.push('');
  for (const ff of [ffA, ffB]) {
    L.push(`Family ${ff.family === 'FLAT' ? 'A (flat)' : 'B (physical)'}: ${ff.factors.map((f) => `${f.name} ${f.levels}`).join(' x ')} = **${fmt(ff.conditions)} conditions**, ${fmt(ff.trialsAtMinimum)} trials at the minimum of ${fmt(MIN_TRIALS_PER_CONDITION)}.`);
    L.push('');
  }
  if (bench !== null) {
    const flatMs = bench.classes['F-camera'].meanMs.totalMs;
    const physMs = bench.classes['P2-camera'].meanMs.totalMs;
    L.push(`At the measured ${flatMs.toFixed(1)} ms per flat trial and ${physMs.toFixed(0)} ms per physical 2x2 trial the full factorials need about ${dur((Number(ffA.trialsAtMinimum) * flatMs) / 1000)} (A) and ${dur((Number(ffB.trialsAtMinimum) * physMs) / 1000)} (B) of single-process time, so the stratified design below is the only feasible one.`);
    L.push('');
  }
  L.push('### Cross products that are NOT covered');
  L.push('');
  L.push('| Not covered | Why | Size |');
  L.push('|---|---|---|');
  for (const n of notCovered(conds)) L.push(`| ${n.what} | ${n.why} | ${n.size} |`);
  L.push('');
  L.push('## 7. Coverage matrix: required level -> conditions');
  L.push('');
  L.push('Explicit (non-mix) conditions only. The groups column gives the number of covering conditions per group; the full list of ids with parameters is in the appendix and in `--list`. A level with 0 conditions would be a silent omission; the test fails on it.');
  L.push('');
  L.push('| Family | Requirement | Level | Conditions | Groups | Examples |');
  L.push('|---|---|---|---|---|---|');
  for (const r of coverageMatrix(conds)) L.push(`| ${r.family === 'FLAT' ? 'A' : 'B'} | ${r.requirement} | ${r.level} | ${r.conditions} | ${r.groups} | ${r.examples.join(', ')} |`);
  L.push('');
  L.push('## 8. Seeds and reproduction');
  L.push('');
  L.push(`Seed of trial i of condition \`id\`: \`trialSeed(id, i)\` = 32-bit hash (FNV-1a with the MurmurHash3 finalizer, \`hash32\` of the geometry experiment) of the text \`${ROBUSTNESS_BASE_SEED}|<id>|<i>\`, a pure function of (base seed, condition id, trial index). Random streams of one trial are derived with \`streamSeed(seed, stream)\`: cards (1), placement and duplex errors (streams 2 and 3 of \`buildScenario\`), camera angle / tilt axis / lighting direction (11), sub-pixel phase (10), randomized-mix draws (12), and the master seed of the \`degrade\` stages (13), whose fragment and noise streams are \`stageSeed(master, ...)\`. Conditions are independent draws and are not paired. Example: trial 0 of \`A-CLEAN\` has seed ${trialSeed('A-CLEAN', 0)}.`);
  L.push('');
  L.push('Re-run one trial (for example a failing one): `npm run robustness -- --repro --cell <condition id> --trial <trial index> [--image out.png]`. It prints the seed, the resolved parameters (the drawn ones for a mix), the decoder result class and kind, and optionally writes the decoder input image. Results do not depend on sharding or the number of processes.');
  L.push('');
  L.push('## 9. Timing and runtime projection');
  L.push('');
  if (bench === null) {
    L.push('No benchmark recorded yet. Run `npm run robustness -- --bench --write --scaling 4,8`.');
  } else {
    const proj = projectSeconds(conds, bench);
    L.push(`Measured on ${bench.machine.cpu}, ${bench.machine.logicalCores} logical processors, ${bench.machine.totalMemoryGiB} GiB, Node ${bench.machine.node} (${bench.machine.platform}); ${bench.sample.flatTrials} (flat) or ${bench.sample.physicalTrials} (physical) timed trials per class after ${bench.sample.warmupTrials} warm-up trials; fixed seeds (${bench.sample.seedRule}). Times in ms per trial, one process.`);
    L.push('');
    L.push('| Cost class | Representative condition | scene | degrade | decode | total | outcomes in sample | conditions | trials | single-process time |');
    L.push('|---|---|---|---|---|---|---|---|---|---|');
    for (const cls of COST_CLASSES) {
      const c = bench.classes[cls];
      const m = c.meanMs;
      const p = proj.perClass[cls];
      L.push(`| ${cls} | ${c.condition} | ${m.sceneMs.toFixed(1)} | ${m.degradeMs.toFixed(1)} | ${m.decodeMs.toFixed(1)} | **${m.totalMs.toFixed(1)}** | ${Object.entries(c.outcomes).map(([k, v]) => `${k} ${v}`).join(', ')} | ${p.conditions} | ${fmt(p.trials)} | ${dur(p.seconds)} |`);
    }
    L.push('');
    L.push('Cost classes: F = flat; P2 / P3 = physical 2x2 / 3x3 board; plain = no camera effect and no board error; camera = a camera degradation is active; errors = placement or duplex error (or a BACK face); both = camera and errors. Randomized mixes are charged at the "both" class (an upper estimate).');
    L.push('');
    L.push(`Single-process projection: family A ${dur(proj.perFamily.FLAT.seconds)}, family B ${dur(proj.perFamily.PHYSICAL.seconds)}, total **${dur(proj.total)}** (${(proj.total / 3600).toFixed(2)} h).`);
    L.push('');
    if (bench.scaling.length > 0) {
      L.push('Measured process scaling (each of N processes runs the same fixed sample of 300 flat + 40 physical 2x2 + 15 physical 3x3 trials; speedup = N x single-process time / wall time):');
      L.push('');
      L.push('| Processes | Wall time (s) | Single process (s) | Speedup | System CPU during run, mean / max | Peak RSS of a worker (MiB) |');
      L.push('|---|---|---|---|---|---|');
      for (const s of bench.scaling) L.push(`| ${s.processes} | ${s.wallSeconds} | ${s.singleProcessSeconds} | ${s.speedup} | ${s.systemCpuPercentMean}% / ${s.systemCpuPercentMax}% | ${s.childPeakRssMiB} |`);
      L.push('');
      for (const s of bench.scaling) L.push(`- ${s.processes} processes: projected wall time about **${dur(proj.total / s.speedup)}**.`);
      L.push('');
    }
    L.push('CPU load samples (system-wide utilisation over the sampling window, taken by the benchmark):');
    L.push('');
    L.push('| Moment | System CPU |');
    L.push('|---|---|');
    for (const s of bench.cpuLoad) L.push(`| ${s.phase} | ${s.systemCpuPercent}% |`);
    L.push('');
    if (bench.competingProcesses.length > 0) {
      L.push(`Largest CPU consumers outside the benchmark during a ${3}-second window before it (logical processors used): ${bench.competingProcesses.map((p) => `${p.name} ${p.logicalProcessors}`).join(', ')}. An Android emulator or a Gradle build on this machine can take several logical processors and slow the benchmark and the sweep: during development one benchmark run, taken while an emulator process used 7 to 11 logical processors (system CPU 90 to 100%), measured about three times longer per trial (25.6 h single-process projection instead of the 8.3 h of the table above). That run was not stored. The projections above include whatever interference was present during the stored measurement, so check the load before starting the sweep.`);
      L.push('');
    }
    if (bench.loaded !== undefined) {
      const lb: BenchRecord = { ...bench, classes: bench.loaded.classes, scaling: bench.loaded.scaling };
      const lp = projectSeconds(conds, lb);
      L.push('### The same benchmark while other applications used the CPU');
      L.push('');
      L.push(`A second measurement was taken while ${bench.loaded.competingProcesses.map((p) => `${p.name} used ${p.logicalProcessors} logical processors`).join(', ')} (system CPU before the benchmark ${bench.loaded.cpuLoad[0]?.systemCpuPercent ?? 'n/a'}%). It is meant to show the effect of interference (for example the Android emulator that runs on this machine), not as the headline estimate.`);
      L.push('');
      L.push('| Cost class | ms per trial, quiet | ms per trial, interference | ratio |');
      L.push('|---|---|---|---|');
      for (const cls of COST_CLASSES) {
        const q = bench.classes[cls].meanMs.totalMs;
        const l = bench.loaded.classes[cls].meanMs.totalMs;
        L.push(`| ${cls} | ${q.toFixed(1)} | ${l.toFixed(1)} | ${(l / q).toFixed(2)} |`);
      }
      L.push('');
      L.push(`Single-process projection under interference: **${dur(lp.total)}**. Measured speedups under interference: ${bench.loaded.scaling.map((s) => `${s.processes} processes ${s.speedup}`).join(', ')}; projected wall time ${bench.loaded.scaling.map((s) => `${s.processes} processes ${dur(lp.total / s.speedup)}`).join(', ')}.`);
      L.push('');
    }
    L.push(`Memory: peak resident set of the benchmark process ${bench.peakRssMiB} MiB; a worker process in the scaling run peaked at ${bench.scaling.length > 0 ? Math.max(...bench.scaling.map((s) => s.childPeakRssMiB)) : 'n/a'} MiB. A trial holds the board raster (about 2.6 MP for 3x3, 1 byte per pixel), one warp output and blur temporaries (Float64), all released after the trial, so memory does not limit the number of processes.`);
    L.push('');
    const files = conds.length;
    L.push(`Disk: a result file of one condition measured ${bench.disk.resultFileBytesMean} bytes on average and ${bench.disk.resultFileBytesMax} bytes at most (${bench.disk.sampleFiles} sample files with rejected samples and no misidentifications), so ${files} files need about ${fmt(Math.ceil((files * bench.disk.resultFileBytesMax) / 1024))} KiB in the work directory; \`robustness.json\` is of the same order (about ${fmt(Math.ceil((files * bench.disk.resultFileBytesMax) / 1024))} KiB) and \`robustness.md\` about ${fmt(Math.ceil((files * 260) / 1024))} KiB.`);
    L.push('');
    const speed8 = bench.scaling.find((s) => s.processes === 8)?.speedup;
    const speed4 = bench.scaling.find((s) => s.processes === 4)?.speedup;
    L.push('### Feasibility');
    L.push('');
    if (speed8 !== undefined) {
      const wall8 = proj.total / speed8;
      L.push(`Recommended design (this plan): **${conds.length} conditions, ${fmt(total)} trials, ${dur(proj.total)} single process${speed4 !== undefined ? `, about ${dur(proj.total / speed4)} with 4 processes` : ''}, about ${dur(wall8)} wall time with 8 processes** (measured speedup ${speed8}).`);
      L.push('');
      const big = projectSeconds(conds, bench, (c) => (c.family === 'PHYSICAL' && !c.mix ? Math.max(c.trials, 3000) : c.trials));
      L.push(`Larger variant for comparison (every ordinary physical condition at n = 3000, so the bound is 0.10% instead of 0.30%): ${fmt(conds.reduce((t, c) => t + (c.family === 'PHYSICAL' && !c.mix ? Math.max(c.trials, 3000) : c.trials), 0))} trials, ${dur(big.total)} single process, about ${dur(big.total / speed8)} with 8 processes.`);
      L.push('');
      L.push(wall8 <= 3 * 3600 ? 'The recommended design is within about 3 hours of wall time at 8 processes, so no reduced design is needed to stay inside that budget; every required level appears in explicit conditions and no condition is below 1,000 trials.' : 'The recommended design exceeds about 3 hours of wall time at 8 processes. A compliant reduced alternative keeps every required level in at least one condition and every condition at 1,000 trials, but drops the cross products listed as "optional" in the design groups (P-ALIGN and P-PROF for the BACK faces on 3x3 boards, the 3x3 mixes); the decision is left to the owner.');
    }
  }
  L.push('');
  L.push('## 10. Recommended launch procedure');
  L.push('');
  L.push('1. Check the machine: `Get-Process | Sort-Object CPU -Descending | Select-Object -First 8` and the CPU counter. Do not run `npm run test:ci` during the sweep (the load-sensitive 5 s tests of `detect.test.ts` and `physical-card.test.ts` time out under saturation).');
  L.push('2. Smoke test: `npm run robustness -- --run --max-trials 5 --work-dir .robustness-smoke` then `npm run robustness -- --merge --allow-partial --work-dir .robustness-smoke --out-dir .robustness-smoke/out`. Never write smoke data to `docs/optical/results` (the merge step refuses).');
  L.push('3. Family A (minutes): create the log folder (`New-Item -ItemType Directory -Force .robustness-work/logs`), then start 8 shards, for example `0..7 | ForEach-Object { Start-Process -NoNewWindow npx.cmd -ArgumentList "tsx scripts/run-robustness.ts --run --family flat --shard $_/8" -RedirectStandardOutput ".robustness-work/logs/flat-$_.txt" }`.');
  L.push('4. Family B: the same with `--family physical`. Shards are cost balanced (greedy by trials x class weight); each writes disjoint files to `.robustness-work/physical/<id>.json`. A restarted shard skips finished conditions, so an interruption loses at most one condition per shard.');
  L.push('5. Merge: `npm run robustness -- --merge` writes `docs/optical/results/robustness.json` and `.md` (deterministic, sorted by plan order, no timestamps). Exit code 2 when the data set is incomplete.');
  L.push('6. Keep the console output of each shard next to the results (task 7.4).');
  L.push('');
  L.push('## Appendix: every condition');
  L.push('');
  L.push('| Id | Family | Group | Trials | Cost class | Parameters |');
  L.push('|---|---|---|---|---|---|');
  for (const c of conds) L.push(`| ${c.id} | ${c.family === 'FLAT' ? 'A' : 'B'} | ${c.group} | ${fmt(c.trials)} | ${c.costClass} | ${c.mix ? 'randomized mix; structural: ' : ''}${c.paramKey.split('|')[1]} |`);
  L.push('');
  return L.join('\n') + '\n';
}

// ---------------------------------------------------------------------------------------------
// Run, merge, repro
// ---------------------------------------------------------------------------------------------

function parseArgs(argv: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      m.set(a.slice(2), next);
      i++;
    } else m.set(a.slice(2), 'true');
  }
  return m;
}

export interface Selection {
  family?: 'flat' | 'physical';
  cell?: string;
  shard?: { i: number; k: number };
}

/** Conditions selected by --family, --cell (exact id, else substring) and --shard i/k, in plan order. */
export function selectConditions(all: readonly Condition[], sel: Selection): Condition[] {
  let list = [...all];
  if (sel.family !== undefined) list = list.filter((c) => c.family === (sel.family === 'flat' ? 'FLAT' : 'PHYSICAL'));
  if (sel.cell !== undefined) {
    const exact = list.filter((c) => c.id === sel.cell);
    list = exact.length > 0 ? exact : list.filter((c) => c.id.includes(sel.cell as string));
  }
  if (sel.shard !== undefined) {
    const { i, k } = sel.shard;
    if (!(Number.isInteger(i) && Number.isInteger(k) && k >= 1 && i >= 0 && i < k)) throw new Error('--shard i/k needs 0 <= i < k');
    const a = assignShards(list, k);
    list = list.filter((_, idx) => a[idx] === i);
  }
  return list;
}

export const resultPath = (workDir: string, c: Condition): string => resolve(workDir, c.family === 'FLAT' ? 'flat' : 'physical', `${c.id}.json`);

/** Runs the conditions, writing one result file each (atomically); returns the numbers of conditions run and skipped. */
export function runConditions(conds: readonly Condition[], workDir: string, maxTrials: number | null, force: boolean, log: (s: string) => void = () => undefined): { done: number; skipped: number } {
  let done = 0;
  let skipped = 0;
  for (const c of conds) {
    const file = resultPath(workDir, c);
    if (!force && existsSync(file)) {
      skipped++;
      continue;
    }
    const t0 = performance.now();
    const r = runCondition(c, maxTrials);
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(r, null, 2) + '\n');
    renameSync(tmp, file);
    done++;
    log(`${c.id} n=${r.n} correct=${r.correct} rejected=${r.rejected} misidentified=${r.misidentified} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  }
  return { done, skipped };
}

export function readResults(workDir: string): Map<string, ConditionResult> {
  const out = new Map<string, ConditionResult>();
  for (const sub of ['flat', 'physical']) {
    const dir = resolve(workDir, sub);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
      const r = JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as ConditionResult;
      out.set(r.id, r);
    }
  }
  return out;
}

/** Merge step: writes robustness.json and robustness.md into outDir. Returns the status of the data set. */
export function mergeResults(workDir: string, outDir: string, allowPartial: boolean, conds: readonly Condition[] = enumerateConditions()): { status: string; verdict: string; jsonPath: string; mdPath: string } {
  const found = readResults(workDir);
  const report = buildReport(conds, found, { allowPartial });
  if (report.status !== 'COMPLETE' && resolve(outDir) === RESULTS_DIR) {
    throw new Error(`refusing to write a ${report.status} data set into ${RESULTS_DIR}`);
  }
  mkdirSync(outDir, { recursive: true });
  const jsonPath = resolve(outDir, 'robustness.json');
  const mdPath = resolve(outDir, 'robustness.md');
  writeFileSync(jsonPath, renderJson(report));
  writeFileSync(mdPath, renderMarkdown(report));
  return { status: report.status, verdict: report.verdict, jsonPath, mdPath };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const conds = enumerateConditions();

  if (args.has('bench-child')) {
    console.log(JSON.stringify(childSample()));
    return;
  }
  if (args.has('list')) {
    const fam = args.get('family');
    const match = args.get('match');
    for (const c of selectConditions(conds, { family: fam === 'flat' || fam === 'physical' ? fam : undefined })) {
      if (match !== undefined && match !== 'true' && !c.id.includes(match)) continue;
      console.log(`${c.family}\t${c.trials}\t${c.id}\t${c.costClass}\t${c.group}\t${c.label}`);
    }
    return;
  }
  if (args.has('plan')) {
    const outArg = args.get('out');
    const out = resolve(ROOT, outArg !== undefined && outArg !== 'true' ? outArg : PLAN_PATH);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, renderPlan(conds, readBench()));
    console.log(`plan written to ${out} (${conds.length} conditions, ${totalTrials(conds)} trials)`);
    return;
  }
  if (args.has('bench')) {
    const flat = args.has('flat-trials') ? Number(args.get('flat-trials')) : 100;
    const phys = args.has('trials') ? Number(args.get('trials')) : 20;
    const scaling = args.has('scaling') ? (args.get('scaling') as string).split(',').map(Number) : [];
    const asLoaded = args.get('as') === 'loaded';
    const previous = readBench();
    if (asLoaded && previous === null) throw new Error('--as loaded needs an existing primary benchmark (run --bench --write first)');
    let rec = await runBench(conds, flat, phys, scaling, !asLoaded && !args.has('no-pilot'));
    if (asLoaded) {
      const { sample, classes, cpuLoad, competingProcesses: cp, scaling: sc } = rec;
      rec = { ...(previous as BenchRecord), loaded: { sample, classes, cpuLoad, competingProcesses: cp, scaling: sc } };
    } else if (previous?.loaded !== undefined) {
      rec = { ...rec, loaded: previous.loaded };
    }
    if (args.has('write')) {
      writeFileSync(BENCH_PATH, JSON.stringify(rec, null, 2) + '\n');
      console.log(`bench written to ${BENCH_PATH}`);
    }
    const proj = projectSeconds(conds, rec);
    console.log(`projected single-process time for ${totalTrials(conds)} trials: ${(proj.total / 3600).toFixed(2)} h`);
    return;
  }
  if (args.has('run')) {
    const maxTrials = args.has('max-trials') ? Number(args.get('max-trials')) : null;
    if (maxTrials !== null && !args.has('work-dir')) throw new Error('--max-trials is a smoke option and requires an explicit --work-dir');
    if (maxTrials !== null && !(Number.isInteger(maxTrials) && maxTrials >= 1)) throw new Error('--max-trials must be a positive integer');
    const workDir = args.has('work-dir') ? resolve(ROOT, args.get('work-dir') as string) : DEFAULT_WORK_DIR;
    const fam = args.get('family');
    if (fam !== undefined && fam !== 'flat' && fam !== 'physical') throw new Error('--family must be flat or physical');
    let shard: Selection['shard'];
    if (args.has('shard')) {
      const [i, k] = (args.get('shard') as string).split('/').map(Number) as [number, number];
      shard = { i, k };
    }
    const sel = selectConditions(conds, { family: fam, cell: args.get('cell'), shard });
    const r = runConditions(sel, workDir, maxTrials, args.has('force'), console.log);
    console.log(`conditions run: ${r.done}, skipped (file exists): ${r.skipped}, selected: ${sel.length}`);
    return;
  }
  if (args.has('repro')) {
    const id = args.get('cell');
    const trial = Number(args.get('trial'));
    const cond = id === undefined ? undefined : conditionById(id);
    if (cond === undefined || !Number.isInteger(trial) || trial < 0) throw new Error('--repro needs --cell <exact condition id> and --trial <index>');
    const o = runTrial(cond, trial, { keepImage: true });
    console.log(JSON.stringify({ condition: cond.id, trial, seed: trialSeed(cond.id, trial), expectation: cond.params.incomplete ? 'REJECT' : 'IDENTIFY', result: o.record, params: o.params }, null, 2));
    const img = args.get('image');
    if (img !== undefined && img !== 'true' && o.image !== undefined) {
      writeFileSync(resolve(ROOT, img), encodePng(o.image.width, o.image.height, o.image.data));
      console.log(`decoder input image written to ${img}`);
    }
    return;
  }
  if (args.has('merge')) {
    const workDir = args.has('work-dir') ? resolve(ROOT, args.get('work-dir') as string) : DEFAULT_WORK_DIR;
    const outDir = args.has('out-dir') ? resolve(ROOT, args.get('out-dir') as string) : RESULTS_DIR;
    try {
      const r = mergeResults(workDir, outDir, args.has('allow-partial'));
      console.log(`merged: status ${r.status}, verdict ${r.verdict}\n${r.jsonPath}\n${r.mdPath}`);
    } catch (e) {
      console.error(String((e as Error).message));
      process.exitCode = 2;
    }
    return;
  }
  console.log('usage: --list | --plan | --bench [--write] [--scaling 4,8] | --run [--family flat|physical] [--shard i/k] [--cell ID] [--work-dir D] [--max-trials n] [--force] | --repro --cell ID --trial N | --merge [--work-dir D] [--out-dir D] [--allow-partial]');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  });
}
