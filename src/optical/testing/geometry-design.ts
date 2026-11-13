/**
 * TEST SUPPORT ONLY - experimental design of task 5.6 (geometry experiments). Pure data and arithmetic: no
 * rendering, no decoding, no file access. SYNTHETIC images, not real cameras: nothing derived from this design
 * measures or guarantees real-camera performance.
 *
 * Contents: factor levels, the tiered list of experimental cells, the deterministic seed derivation
 * (cell id, trial index) -> 32-bit seed, the per-cell statistics (counts, rates, exact one-sided 95% bound), and
 * the full-factorial size used to show why a tiered design is needed.
 */
import { markerContainment, physicalGeometry } from './physical-card';

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

/** Fixed base seed of the whole experiment. Changing it changes every trial. */
export const GEOMETRY_BASE_SEED = 20260514;

export const MIN_TRIALS_PER_CELL = 200;
export const BASELINE_CELL_TRIALS = 1000;

export const BASELINE_RADIUS_MM = 3.175;
export const BASELINE_INSET_MODULES = 1;
export const DARK_TABLE_GRAY = 64;
export const LIGHT_TABLE_GRAY = 200;

export const SYNTHETIC_DISCLAIMER =
  'synthetic images, not real cameras: these are synthetic-test findings about the sampled conditions only; ' +
  'they do not measure or guarantee real-camera performance, and a zero-event bound applies only to the sampled ' +
  'synthetic condition distribution (independent seeded trials).';

// ---------------------------------------------------------------------------------------------
// Factor levels
// ---------------------------------------------------------------------------------------------

export type Layout = '2x2' | '3x3';
export type Face = 'FRONT' | 'BACK_VERTICAL' | 'BACK_HORIZONTAL';
export type CameraRotation = 'NONE' | 'DEG45' | 'RANDOM';
export type DecoderLayout = 'MATCHED' | 'DEFAULT';

export const LEVELS = {
  radiusMm: [0, 2.0, 3.0, 3.175, 3.6, 4.0, 5.0, 6.0],
  insetModules: [1, 1.5, 2],
  tableGray: [DARK_TABLE_GRAY, LIGHT_TABLE_GRAY],
  /** Bound of the relative shift of adjacent cards along their shared seam, mm. */
  shiftMm: [0, 0.5, 1.0, 1.5],
  /** Bound of the per-card rotation, degrees. */
  rotationDeg: [0, 1, 2, 3],
  /** Unintended uniform gap between neighbouring cards, mm. */
  gapMm: [0, 0.5, 1.0],
  cameraRotation: ['NONE', 'DEG45', 'RANDOM'] as CameraRotation[],
  tiltDeg: [0, 10, 20, 30, 40],
  /** Gaussian blur sigma in image pixels (the render scale is 4 px per module). */
  blurPx: [0, 0.5, 1.0, 1.5, 2.0],
  lightingStrength: [0, 0.2, 0.4, 0.6],
  layout: ['2x2', '3x3'] as Layout[],
  absentCard: [false, true],
  face: ['FRONT', 'BACK_VERTICAL', 'BACK_HORIZONTAL'] as Face[],
  regShiftMm: [0, 0.25, 0.5, 1.0],
  regRotDeg: [0, 0.5, 1],
  cutOffsetMm: [0, 0.5, 1.0],
} as const;

export type FactorName = keyof typeof LEVELS;

export interface CellParams {
  layout: Layout;
  /** One of the four cards around the focus vertex is absent (the scan target is an incomplete group). */
  absentCard: boolean;
  radiusMm: number;
  insetModules: number;
  tableGray: number;
  shiftMm: number;
  rotationDeg: number;
  gapMm: number;
  cameraRotation: CameraRotation;
  tiltDeg: number;
  blurPx: number;
  lightingStrength: number;
  face: Face;
  regShiftMm: number;
  regRotDeg: number;
  cutOffsetMm: number;
  /** MATCHED: the reader is told the inset-dependent marker offset; DEFAULT: decoder defaults (diagnostic only). */
  decoderLayout: DecoderLayout;
}

export const CLEAN_DARK: Readonly<CellParams> = Object.freeze({
  layout: '2x2',
  absentCard: false,
  radiusMm: BASELINE_RADIUS_MM,
  insetModules: BASELINE_INSET_MODULES,
  tableGray: DARK_TABLE_GRAY,
  shiftMm: 0,
  rotationDeg: 0,
  gapMm: 0,
  cameraRotation: 'NONE',
  tiltDeg: 0,
  blurPx: 0,
  lightingStrength: 0,
  face: 'FRONT',
  regShiftMm: 0,
  regRotDeg: 0,
  cutOffsetMm: 0,
  decoderLayout: 'MATCHED',
});

export interface Profile {
  name: string;
  description: string;
  overrides: Partial<CellParams>;
}

/** The four degradation profiles that cross the radius x inset grid (Tier 1) and the reference geometries (Tier 4). */
export const PROFILES: readonly Profile[] = Object.freeze([
  { name: 'CLEAN_DARK', description: 'flat, aligned, no camera effect, dark table', overrides: {} },
  { name: 'CLEAN_LIGHT', description: 'as CLEAN_DARK on a light table', overrides: { tableGray: LIGHT_TABLE_GRAY } },
  {
    name: 'MODERATE',
    description: 'shift 0.5 mm, rotation 1 deg, random camera rotation, tilt 10 deg, blur 0.5 px, lighting 0.2, dark table',
    overrides: { shiftMm: 0.5, rotationDeg: 1, cameraRotation: 'RANDOM', tiltDeg: 10, blurPx: 0.5, lightingStrength: 0.2 },
  },
  {
    name: 'STRESS',
    description: 'shift 1.0 mm, rotation 1 deg, gap 0.5 mm, random camera rotation, tilt 20 deg, blur 0.5 px, lighting 0.4, dark table',
    overrides: { shiftMm: 1.0, rotationDeg: 1, gapMm: 0.5, cameraRotation: 'RANDOM', tiltDeg: 20, blurPx: 0.5, lightingStrength: 0.4 },
  },
]);

export interface Geometry {
  radiusMm: number;
  insetModules: number;
}

/** Radius x inset grid: 8 x 3 = 24 geometries. */
export const GRID_GEOMETRIES: readonly Geometry[] = Object.freeze(
  LEVELS.radiusMm.flatMap((radiusMm) => LEVELS.insetModules.map((insetModules) => ({ radiusMm, insetModules }))),
);

/**
 * Reference geometries for the one-factor-at-a-time sweeps and the board-layout tier: the baseline, the two
 * inset improvement candidates (Requirement 15.7 step 1), and the boundary radii 0 and 6.0 mm.
 */
export const REFERENCE_GEOMETRIES: readonly Geometry[] = Object.freeze([
  { radiusMm: 3.175, insetModules: 1 },
  { radiusMm: 3.175, insetModules: 1.5 },
  { radiusMm: 3.175, insetModules: 2 },
  { radiusMm: 0, insetModules: 1 },
  { radiusMm: 6.0, insetModules: 1 },
  { radiusMm: 6.0, insetModules: 1.5 },
]);

export const isBaselineGeometry = (g: Geometry): boolean =>
  g.radiusMm === BASELINE_RADIUS_MM && g.insetModules === BASELINE_INSET_MODULES;

// ---------------------------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------------------------

export type TierNumber = 1 | 2 | 3 | 4;

export interface Cell {
  id: string;
  tier: TierNumber;
  /** Sub-experiment inside the tier, e.g. "T2-blur". */
  group: string;
  label: string;
  params: CellParams;
  trials: number;
  /** Other (tier, group) definitions that produced the identical cell and were merged into this one. */
  alsoIn: string[];
}

const FACE_CODE: Record<Face, string> = { FRONT: 'F', BACK_VERTICAL: 'BV', BACK_HORIZONTAL: 'BH' };
const CAMERA_CODE: Record<CameraRotation, string> = { NONE: '0', DEG45: '45', RANDOM: 'R' };

/** Deterministic cell identifier. Every parameter is spelled out, so equal ids mean equal parameters. */
export function cellId(p: CellParams): string {
  return [
    p.layout + (p.absentCard ? 'abs' : ''),
    FACE_CODE[p.face],
    `r${p.radiusMm}`,
    `i${p.insetModules}`,
    `tb${p.tableGray}`,
    `sh${p.shiftMm}`,
    `ro${p.rotationDeg}`,
    `gp${p.gapMm}`,
    `cm${CAMERA_CODE[p.cameraRotation]}`,
    `tl${p.tiltDeg}`,
    `bl${p.blurPx}`,
    `lt${p.lightingStrength}`,
    `rs${p.regShiftMm}`,
    `rr${p.regRotDeg}`,
    `co${p.cutOffsetMm}`,
    p.decoderLayout === 'DEFAULT' ? 'dfl' : 'mat',
  ].join('-');
}

function withParams(...parts: Array<Partial<CellParams>>): CellParams {
  return Object.assign({}, CLEAN_DARK, ...parts) as CellParams;
}

const geometryParams = (g: Geometry): Partial<CellParams> => ({ radiusMm: g.radiusMm, insetModules: g.insetModules });

class CellBook {
  readonly cells = new Map<string, Cell>();
  add(tier: TierNumber, group: string, label: string, params: CellParams): void {
    const id = cellId(params);
    const existing = this.cells.get(id);
    if (existing !== undefined) {
      existing.alsoIn.push(`T${tier}/${group}`);
      return;
    }
    const baselineTier1 =
      tier === 1 && params.radiusMm === BASELINE_RADIUS_MM && params.insetModules === BASELINE_INSET_MODULES;
    this.cells.set(id, {
      id,
      tier,
      group,
      label,
      params,
      trials: baselineTier1 ? BASELINE_CELL_TRIALS : MIN_TRIALS_PER_CELL,
      alsoIn: [],
    });
  }
}

/** One-factor-at-a-time levels (non-zero / non-nominal) swept in Tier 2 around the CLEAN_DARK nominal. */
export const OFAT_FACTORS: ReadonlyArray<{ group: string; key: keyof CellParams; levels: ReadonlyArray<number | string> }> = [
  { group: 'T2-placement-shift', key: 'shiftMm', levels: [0.5, 1.0, 1.5] },
  { group: 'T2-placement-rotation', key: 'rotationDeg', levels: [1, 2, 3] },
  { group: 'T2-placement-gap', key: 'gapMm', levels: [0.5, 1.0] },
  { group: 'T2-camera-rotation', key: 'cameraRotation', levels: ['DEG45', 'RANDOM'] },
  { group: 'T2-perspective', key: 'tiltDeg', levels: [10, 20, 30, 40] },
  { group: 'T2-blur', key: 'blurPx', levels: [0.5, 1.0, 1.5, 2.0] },
  { group: 'T2-lighting', key: 'lightingStrength', levels: [0.2, 0.4, 0.6] },
];

interface DuplexConfig {
  name: string;
  overrides: Partial<CellParams>;
}

/** The 22 duplex/face configurations run on every radius x inset geometry (Tier 3). */
export function duplexConfigs(): DuplexConfig[] {
  const out: DuplexConfig[] = [];
  for (const co of [0.5, 1.0]) out.push({ name: `FRONT cut ${co}`, overrides: { face: 'FRONT', cutOffsetMm: co } });
  for (const face of ['BACK_VERTICAL', 'BACK_HORIZONTAL'] as const) {
    const f = (o: Partial<CellParams>): Partial<CellParams> => ({ face, ...o });
    out.push({ name: `${face} zero error`, overrides: f({}) });
    for (const s of [0.25, 0.5, 1.0]) out.push({ name: `${face} reg shift ${s}`, overrides: f({ regShiftMm: s }) });
    for (const r of [0.5, 1]) out.push({ name: `${face} reg rotation ${r}`, overrides: f({ regRotDeg: r }) });
    for (const c of [0.5, 1.0]) out.push({ name: `${face} cut ${c}`, overrides: f({ cutOffsetMm: c }) });
    out.push({ name: `${face} all mid (0.5 mm, 0.5 deg, cut 0.5 mm)`, overrides: f({ regShiftMm: 0.5, regRotDeg: 0.5, cutOffsetMm: 0.5 }) });
    out.push({ name: `${face} all max (1.0 mm, 1 deg, cut 1.0 mm)`, overrides: f({ regShiftMm: 1.0, regRotDeg: 1, cutOffsetMm: 1.0 }) });
  }
  return out;
}

const geoLabel = (g: Geometry): string => `r=${g.radiusMm} mm, inset ${g.insetModules}`;

/** Every experimental cell, in deterministic order (tier, group, definition order). */
export function enumerateCells(): Cell[] {
  const book = new CellBook();

  // Tier 1: radius x inset full grid under four degradation profiles (2x2 board, FRONT).
  for (const profile of PROFILES) {
    for (const g of GRID_GEOMETRIES) {
      book.add(1, `T1-${profile.name}`, `${profile.name}: ${geoLabel(g)}`, withParams(geometryParams(g), profile.overrides));
    }
  }

  // Tier 2: one-factor-at-a-time sweeps on the reference geometries, nominal = CLEAN_DARK.
  for (const g of REFERENCE_GEOMETRIES) {
    for (const f of OFAT_FACTORS) {
      for (const level of f.levels) {
        book.add(2, f.group, `${f.key}=${level}: ${geoLabel(g)}`, withParams(geometryParams(g), { [f.key]: level } as Partial<CellParams>));
      }
    }
    // The light-table level of the table factor is Tier 1 CLEAN_LIGHT (merged by id, not repeated).
    book.add(2, 'T2-table', `light table: ${geoLabel(g)}`, withParams(geometryParams(g), { tableGray: LIGHT_TABLE_GRAY }));
  }
  // Diagnostic: decoder defaults (marker offset 5.5 modules) on the two larger insets.
  for (const inset of [1.5, 2]) {
    book.add(
      2,
      'T2-decoder-layout',
      `decoder defaults (not told the inset): r=3.175 mm, inset ${inset}`,
      withParams({ radiusMm: BASELINE_RADIUS_MM, insetModules: inset, decoderLayout: 'DEFAULT' }),
    );
  }

  // Tier 3: face / flip / registration / cut sweeps on every radius x inset geometry (CLEAN_DARK nominal).
  for (const g of GRID_GEOMETRIES) {
    for (const c of duplexConfigs()) {
      book.add(3, 'T3-duplex', `${c.name}: ${geoLabel(g)}`, withParams(geometryParams(g), c.overrides));
    }
  }

  // Tier 4: 3x3 boards with Distractor_Markers and incomplete groups on the reference geometries x four profiles.
  const t4: Array<{ group: string; name: string; overrides: Partial<CellParams> }> = [
    { group: 'T4-3x3', name: '3x3 board', overrides: { layout: '3x3' } },
    { group: 'T4-2x2-incomplete', name: '2x2 one card absent', overrides: { absentCard: true } },
    { group: 'T4-3x3-incomplete', name: '3x3 one card absent', overrides: { layout: '3x3', absentCard: true } },
  ];
  for (const t of t4) {
    for (const g of REFERENCE_GEOMETRIES) {
      for (const profile of PROFILES) {
        book.add(
          4,
          t.group,
          `${t.name}, ${profile.name}: ${geoLabel(g)}`,
          withParams(geometryParams(g), profile.overrides, t.overrides),
        );
      }
    }
  }

  return [...book.cells.values()];
}

export interface TierSummary {
  tier: TierNumber;
  cells: number;
  trials: number;
}

export function tierSummaries(cells: readonly Cell[]): TierSummary[] {
  return ([1, 2, 3, 4] as const).map((tier) => {
    const c = cells.filter((x) => x.tier === tier);
    return { tier, cells: c.length, trials: c.reduce((t, x) => t + x.trials, 0) };
  });
}

export interface GroupSummary {
  tier: TierNumber;
  group: string;
  cells: number;
  trials: number;
  mergedDuplicates: number;
}

export function groupSummaries(cells: readonly Cell[]): GroupSummary[] {
  const out = new Map<string, GroupSummary>();
  for (const c of cells) {
    const key = `${c.tier}|${c.group}`;
    const s = out.get(key) ?? { tier: c.tier, group: c.group, cells: 0, trials: 0, mergedDuplicates: 0 };
    s.cells++;
    s.trials += c.trials;
    s.mergedDuplicates += c.alsoIn.length;
    out.set(key, s);
  }
  return [...out.values()];
}

// ---------------------------------------------------------------------------------------------
// Level coverage and full-factorial size
// ---------------------------------------------------------------------------------------------

export interface LevelCoverage {
  factor: FactorName;
  level: string;
  cells: number;
  firstCell: string | null;
}

const PARAM_OF_FACTOR: Record<FactorName, keyof CellParams> = {
  radiusMm: 'radiusMm',
  insetModules: 'insetModules',
  tableGray: 'tableGray',
  shiftMm: 'shiftMm',
  rotationDeg: 'rotationDeg',
  gapMm: 'gapMm',
  cameraRotation: 'cameraRotation',
  tiltDeg: 'tiltDeg',
  blurPx: 'blurPx',
  lightingStrength: 'lightingStrength',
  layout: 'layout',
  absentCard: 'absentCard',
  face: 'face',
  regShiftMm: 'regShiftMm',
  regRotDeg: 'regRotDeg',
  cutOffsetMm: 'cutOffsetMm',
};

/** For every factor level, how many cells use it. A level with zero cells would be a silent omission. */
export function levelCoverage(cells: readonly Cell[]): LevelCoverage[] {
  const out: LevelCoverage[] = [];
  for (const factor of Object.keys(LEVELS) as FactorName[]) {
    const key = PARAM_OF_FACTOR[factor];
    for (const level of LEVELS[factor] as ReadonlyArray<number | string | boolean>) {
      const used = cells.filter((c) => c.params[key] === level);
      out.push({ factor, level: String(level), cells: used.length, firstCell: used[0]?.id ?? null });
    }
  }
  return out;
}

export interface FullFactorial {
  /** Per-factor level counts, in the order multiplied. */
  factors: Array<{ name: string; levels: number }>;
  /** Cells of the full cross product (distinct duplex combinations). */
  cells: bigint;
  /** Trials at the minimum of 200 per cell. */
  trialsAtMinimum: bigint;
}

/**
 * Size of the full factorial cross product of every factor level of task 5.6. The face / registration / cut group
 * is counted by its distinct combinations: FRONT ignores the back-print registration (3 cut offsets), each BACK
 * flip has 4 x 3 x 3 combinations: 3 + 2 x 36 = 75. Layout x absent-card gives 4 board kinds.
 */
export function fullFactorial(): FullFactorial {
  const duplexDistinct =
    LEVELS.cutOffsetMm.length + 2 * LEVELS.regShiftMm.length * LEVELS.regRotDeg.length * LEVELS.cutOffsetMm.length;
  const factors = [
    { name: 'corner radius', levels: LEVELS.radiusMm.length },
    { name: 'inset', levels: LEVELS.insetModules.length },
    { name: 'table (dark / light)', levels: LEVELS.tableGray.length },
    { name: 'shift along a seam', levels: LEVELS.shiftMm.length },
    { name: 'per-card rotation', levels: LEVELS.rotationDeg.length },
    { name: 'unintended gap', levels: LEVELS.gapMm.length },
    { name: 'camera rotation', levels: LEVELS.cameraRotation.length },
    { name: 'perspective tilt', levels: LEVELS.tiltDeg.length },
    { name: 'blur', levels: LEVELS.blurPx.length },
    { name: 'lighting gradient', levels: LEVELS.lightingStrength.length },
    { name: 'board kind (2x2/3x3 x complete/one card absent)', levels: LEVELS.layout.length * LEVELS.absentCard.length },
    { name: 'face x flip x registration shift x registration rotation x cut offset (distinct)', levels: duplexDistinct },
  ];
  const cells = factors.reduce((t, f) => t * BigInt(f.levels), 1n);
  return { factors, cells, trialsAtMinimum: cells * BigInt(MIN_TRIALS_PER_CELL) };
}

// ---------------------------------------------------------------------------------------------
// Seeds
// ---------------------------------------------------------------------------------------------

/** 32-bit finalizer of MurmurHash3. */
function fmix32(h: number): number {
  let x = h >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

/** FNV-1a over the UTF-16 code units of `s`, then fmix32. Deterministic and platform independent. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return fmix32(h);
}

/** Seed of trial `trialIndex` of the cell `id`: a pure function of (base seed, cell id, trial index). */
export function trialSeed(id: string, trialIndex: number): number {
  return hash32(`${GEOMETRY_BASE_SEED}|${id}|${trialIndex}`);
}

/** Independent sub-stream seed (cards, placement, duplex errors, camera) derived from one trial seed. */
export function streamSeed(seed: number, stream: number): number {
  return fmix32((seed ^ Math.imul(stream + 1, 0x9e3779b1)) >>> 0);
}

// ---------------------------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------------------------

/** Exact one-sided 95% upper confidence bound for a binomial proportion when 0 events were seen in n trials. */
export function zeroEventUpperBound95(n: number): number {
  if (!Number.isInteger(n) || n < 1) throw new RangeError('n must be a positive integer');
  return 1 - Math.pow(0.05, 1 / n);
}

export type TrialClass = 'CORRECT' | 'REJECTED' | 'FALSE_ACCEPT';

export interface TrialRecord {
  seed: number;
  cls: TrialClass;
  /** Decoder result kind (with the arrangement reason where there is one). */
  kind: string;
  /** Failure-cause label (empty for CORRECT). */
  cause: string;
}

export const MAX_RECORDED_REJECTED_SEEDS = 20;

export interface GeometryReport {
  radiusMm: number;
  insetModules: number;
  /** Minimum distance from any point of the Central_Void to the nearest black-border corner; null = "No Central_Void". */
  voidToBorderCornerMm: number | null;
  /** Horn-tip to border-corner distance (reference column only); null = "No Central_Void". */
  voidTipToBorderCornerMm: number | null;
  clearanceMm: number;
  containmentValid: boolean;
  centralVoidAreaMm2: number;
}

export function geometryReport(g: Geometry): GeometryReport {
  const c = markerContainment(physicalGeometry({ cornerRadiusMm: g.radiusMm, insetModules: g.insetModules }));
  return {
    radiusMm: g.radiusMm,
    insetModules: g.insetModules,
    voidToBorderCornerMm: c.voidToBorderCornerMm,
    voidTipToBorderCornerMm: c.voidTipToBorderCornerMm,
    clearanceMm: c.clearanceMm,
    containmentValid: c.valid,
    centralVoidAreaMm2: c.centralVoidAreaMm2,
  };
}

export interface CellResult {
  id: string;
  tier: TierNumber;
  group: string;
  label: string;
  params: CellParams;
  /** 'IDENTIFY': a complete group is present. 'REJECT': one card is absent and any IDENTIFIED result is a false acceptance. */
  expectation: 'IDENTIFY' | 'REJECT';
  n: number;
  correct: number;
  correctRate: number;
  rejected: number;
  rejectedRate: number;
  rejectionKinds: Record<string, number>;
  falseAccepts: number;
  falseAcceptRate: number;
  /** 1 - 0.05^(1/n) when falseAccepts = 0, otherwise null (failing seeds are recorded instead). */
  falseAcceptUpperBound95: number | null;
  falseAcceptSeeds: number[];
  /** First failing (non-correct) seeds, capped. */
  rejectedSeedsSample: number[];
  failureCauses: Record<string, number>;
  geometry: GeometryReport;
  baseSeed: number;
  disclaimer: string;
}

const bump = (m: Record<string, number>, k: string): void => {
  m[k] = (m[k] ?? 0) + 1;
};

const sortedRecord = (m: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(m).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** Aggregates the trial records of ONE cell. Never pools across cells. */
export function summarizeCell(cell: Cell, records: readonly TrialRecord[]): CellResult {
  const n = records.length;
  if (n === 0) throw new RangeError('a cell needs at least one trial');
  let correct = 0;
  let rejected = 0;
  const falseAcceptSeeds: number[] = [];
  const rejectedSeeds: number[] = [];
  const kinds: Record<string, number> = {};
  const causes: Record<string, number> = {};
  const incomplete = cell.params.absentCard;
  for (const r of records) {
    if (r.cls === 'CORRECT') correct++;
    else if (r.cls === 'REJECTED') {
      rejected++;
      bump(kinds, r.kind);
      // Rejecting an incomplete group is the expected outcome, not a failure.
      if (!incomplete) {
        bump(causes, r.cause);
        if (rejectedSeeds.length < MAX_RECORDED_REJECTED_SEEDS) rejectedSeeds.push(r.seed);
      }
    } else {
      bump(causes, r.cause);
      falseAcceptSeeds.push(r.seed);
    }
  }
  const fa = falseAcceptSeeds.length;
  return {
    id: cell.id,
    tier: cell.tier,
    group: cell.group,
    label: cell.label,
    params: cell.params,
    expectation: cell.params.absentCard ? 'REJECT' : 'IDENTIFY',
    n,
    correct,
    correctRate: correct / n,
    rejected,
    rejectedRate: rejected / n,
    rejectionKinds: sortedRecord(kinds),
    falseAccepts: fa,
    falseAcceptRate: fa / n,
    falseAcceptUpperBound95: fa === 0 ? zeroEventUpperBound95(n) : null,
    falseAcceptSeeds,
    rejectedSeedsSample: rejectedSeeds,
    failureCauses: sortedRecord(causes),
    geometry: geometryReport(cell.params),
    baseSeed: GEOMETRY_BASE_SEED,
    disclaimer: SYNTHETIC_DISCLAIMER,
  };
}
