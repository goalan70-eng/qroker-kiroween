/**
 * TEST SUPPORT ONLY - experimental design of task 7.2 (synthetic-image robustness). Pure data and arithmetic: no
 * rendering, no decoding, no file access. SYNTHETIC images, not real cameras: nothing derived from this design
 * measures or guarantees real-camera performance.
 *
 * Two families, always reported separately:
 *   FLAT      render.ts / group-compose.ts flat 2x2 images (four markers around one vertex);
 *   PHYSICAL  physical-card.ts boards (rounded cards, faces, flips, registration, placement, 3x3 boards with
 *             Distractor_Markers) rasterized by geometry-trial.ts, with the degradations of degrade.ts on top.
 *
 * THREE ERROR CATEGORIES ARE DISTINCT FACTORS AND NEVER SHARE A PARAMETER (they are never conflated or relabelled):
 *   1. fragment position error  = image-space translation of an optical marker footprint by exactly 0, 0.1 or 0.25
 *      module at a seeded uniform direction (degrade.ts `fragmentOffsets` / `shiftFragments`);
 *      parameter: `fragmentModules`
 *   2. card placement error     = physical movement of a whole card on the board (seededErrors / composeBoard model of
 *      physical-card.ts and geometry-trial.ts); parameters: `placementShiftMm`, `placementRotDeg`, `gapMm`
 *   3. duplex registration error = front/back printing misalignment and cut-outline offset (physical-card.ts
 *      duplexRegistration, cutOffsetMm); parameters: `regShiftMm`, `regRotDeg`, `cutOffsetMm`
 * Categories 2 and 3 exist only in the PHYSICAL family. Fragment position error is never crossed with a card
 * placement error or a duplex error (see the plan: the footprint rectangle of the nominal marker position is used).
 *
 * Seeds: the seed of trial i of condition `id` is `trialSeed(id, i) = hash32(base | id | i)`, a pure function of
 * (base seed, condition id, trial index). Random streams of one trial are derived with `streamSeed(seed, stream)`;
 * the stream numbers of this file (10 and above) never collide with the streams 1-4 consumed by `buildScenario` of
 * geometry-trial.ts. Conditions are independent draws and are not paired.
 */
import { FRAGMENT_OFFSET_LEVELS_MODULES } from '../degrade';
import { mulberry32 } from '../prng';
import { SYNTHETIC_DISCLAIMER, hash32, streamSeed, zeroEventUpperBound95, type Face, type Layout } from './geometry-design';

export { SYNTHETIC_DISCLAIMER, zeroEventUpperBound95, hash32, streamSeed };

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

/** Fixed base seed of the whole robustness experiment (different from the geometry experiment). */
export const ROBUSTNESS_BASE_SEED = 20260601;
export const MIN_TRIALS_PER_CONDITION = 1000;
/** Trials of an ordinary flat condition (flat trials cost a few ms, so the minimum is exceeded). */
export const FLAT_TRIALS = 2000;
/** Trials of an ordinary physical condition (a physical trial costs about 0.1 to 0.3 s). */
export const PHYSICAL_TRIALS = 1000;
/** Trials of the randomized-mix conditions (see `resolveParams`). */
export const MIX_TRIALS = { 'A-MIX': 10000, 'A-MIX-INC': 5000, 'P-MIX-2x2-C': 3000, 'P-MIX-2x2-I': 3000, 'P-MIX-3x3-C': 1500, 'P-MIX-3x3-I': 1500 } as const;

export const MODULE_PX = 4;
export const FLAT_CANVAS_MODULES = 32;
export const BASELINE_RADIUS_MM = 3.175;
export const BASELINE_INSET_MODULES = 1;
export const TABLE_GRAY = 64;
export const FLAT_BACKGROUND = 255;
/**
 * Camera distance of the perspective factor in image diagonals. Physical board images use 1.0 (as the task 5.6 camera
 * chain): about 146 modules for a 2x2 board image. The flat canvas is only 32 x 32 modules (diagonal 45 modules), so
 * the same absolute distance in modules is 4 flat diagonals (181 modules); with 1.0 the perspective across one marker
 * would be about four times stronger than in the physical family for the same tilt angle. A pilot (30 trials per
 * condition) showed the flat family rejecting every trial at 30 deg tilt with 1.0, which is how this scale
 * difference was found. This is the only design change made after the pilot.
 */
export const FLAT_DISTANCE_DIAGONALS = 4;
export const PHYSICAL_DISTANCE_DIAGONALS = 1;

export const PASS_CRITERION_TEXT =
  'Experimental pass criterion: the observed misidentification count is 0 in every condition. Any observed misidentification ' +
  'marks the task failed-with-findings (failing seeds and conditions are recorded; thresholds are never loosened). A count of 0 is an ' +
  'observation in n synthetic trials, not a mathematical guarantee, and says nothing about real cameras.';

/** Random stream numbers of one trial (derived with streamSeed from the trial seed). */
export const STREAM = { cards: 1, phase: 10, camera: 11, mix: 12, degrade: 13 } as const;

export type Family = 'FLAT' | 'PHYSICAL';
export type Phase = 'EXACT' | 'JITTER';
export type Reflect = 'none' | 'Fh' | 'Fv';
export type RotationSetting = number | 'RANDOM';
export type { Face, Layout };

// ---------------------------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------------------------

/** Camera-side degradations of degrade.ts (shared by both families). */
export interface CameraParams {
  /** Clockwise rotation in degrees, or 'RANDOM' = uniform in [0, 360) drawn per trial. */
  rotation: RotationSetting;
  /**
   * EXACT: the picture is resampled only as far as the other settings require (rotation by a multiple of 90 degrees
   * is an exact index permutation, no warp at all without rotation/tilt).
   * JITTER: a seeded sub-pixel translation (uniform in [-0.5, 0.5) px on each axis) is composed into the single
   * geometric homography, so that the result does not sample one pixel phase only (Milestone 5 finding).
   */
  phase: Phase;
  tiltDeg: number;
  blurPx: number;
  noiseSigma: number;
  /** Illumination gradient strength 0..1 (random direction per trial). */
  illumination: number;
}

export interface FlatParams extends CameraParams {
  /** One of the four markers is erased (incomplete group): the expected result is a rejection. */
  incomplete: boolean;
  /** Category 1: fragment position error in modules. */
  fragmentModules: number;
  reflect: Reflect;
}

export interface PhysicalParams extends CameraParams {
  layout: Layout;
  incomplete: boolean;
  face: Face;
  radiusMm: number;
  insetModules: number;
  /** Category 1: fragment position error in modules (only with zero category 2 and 3 errors). */
  fragmentModules: number;
  /** Category 2: card placement error (bound of the relative shift of adjacent cards along a seam, mm). */
  placementShiftMm: number;
  /** Category 2: bound of the per-card rotation, degrees. */
  placementRotDeg: number;
  /** Category 2: unintended gap between neighbouring cards, mm. */
  gapMm: number;
  /** Category 3: back-print registration shift, mm. */
  regShiftMm: number;
  /** Category 3: back-print registration rotation, degrees. */
  regRotDeg: number;
  /** Category 3: cut-outline offset relative to the front print, mm. */
  cutOffsetMm: number;
}

/** Parameter names of the three error categories. They are pairwise disjoint (checked by the tests). */
export const FRAGMENT_ERROR_KEYS = ['fragmentModules'] as const;
export const PLACEMENT_ERROR_KEYS = ['placementShiftMm', 'placementRotDeg', 'gapMm'] as const;
export const DUPLEX_ERROR_KEYS = ['regShiftMm', 'regRotDeg', 'cutOffsetMm'] as const;

// ---------------------------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------------------------

export const FLAT_LEVELS = {
  /** Requirement 12.5: 0, 0.1 and 0.25 module (the levels of degrade.ts). */
  fragmentModules: FRAGMENT_OFFSET_LEVELS_MODULES,
  tiltDeg: [0, 10, 20, 30, 40, 50],
  blurPx: [0, 0.5, 1.0, 1.5, 2.0],
  noiseSigma: [0, 5, 10, 20, 40, 80],
  illumination: [0, 0.2, 0.4, 0.6, 0.8],
  reflect: ['none', 'Fh', 'Fv'] as Reflect[],
} as const;

export const PHYSICAL_LEVELS = {
  fragmentModules: FRAGMENT_OFFSET_LEVELS_MODULES,
  tiltDeg: [0, 10, 20, 30, 40],
  blurPx: [0, 0.5, 1.0, 1.5, 2.0],
  noiseSigma: [0, 5, 10, 20, 40, 80],
  illumination: [0, 0.2, 0.4, 0.6, 0.8],
  layout: ['2x2', '3x3'] as Layout[],
  face: ['FRONT', 'BACK_VERTICAL', 'BACK_HORIZONTAL'] as Face[],
  /** Task 5.6 levels. */
  regShiftMm: [0, 0.25, 0.5, 1.0],
  regRotDeg: [0, 0.5, 1],
  cutOffsetMm: [0, 0.5, 1.0],
  placementShiftMm: [0, 0.5, 1.0, 1.5],
  placementRotDeg: [0, 1, 2, 3],
  gapMm: [0, 0.5, 1.0],
} as const;

/** Fixed camera angles of the flat family. tag: id suffix; EXACT = no sub-pixel jitter. */
export const FLAT_FIXED_ROTATIONS: ReadonlyArray<{ tag: string; deg: number; phase: Phase }> = [
  { tag: '0J', deg: 0, phase: 'JITTER' },
  { tag: '15J', deg: 15, phase: 'JITTER' },
  { tag: '30J', deg: 30, phase: 'JITTER' },
  { tag: '45E', deg: 45, phase: 'EXACT' },
  { tag: '45J', deg: 45, phase: 'JITTER' },
  { tag: '60J', deg: 60, phase: 'JITTER' },
  { tag: '75J', deg: 75, phase: 'JITTER' },
  { tag: '90E', deg: 90, phase: 'EXACT' },
  { tag: '135J', deg: 135, phase: 'JITTER' },
  { tag: '180E', deg: 180, phase: 'EXACT' },
  { tag: '225J', deg: 225, phase: 'JITTER' },
  { tag: '270E', deg: 270, phase: 'EXACT' },
  { tag: '315J', deg: 315, phase: 'JITTER' },
];

/** Angles from which the randomized-mix conditions draw when they do not draw a uniform random angle. */
export const MIX_FIXED_ANGLES_FLAT: readonly number[] = [0, 15, 30, 45, 60, 75, 90, 135, 180, 225, 270, 315];
export const MIX_FIXED_ANGLES_PHYSICAL: readonly number[] = [0, 45, 90, 180, 270];

export interface CameraProfile {
  name: string;
  fragmentModules: number;
  rotation: RotationSetting;
  tiltDeg: number;
  blurPx: number;
  noiseSigma: number;
  illumination: number;
  text: string;
}

/**
 * Combined camera profiles, defined ONCE and used by both families. DESIGN CHOICES, fixed before any sweep result
 * existed and not tuned afterwards. MILD and MODERATE reuse the tilt / blur / lighting of the task 5.6 profiles
 * MODERATE and STRESS (and add noise and fragment position error); STRESS extends them to levels at which the
 * single-factor 5.6 sweeps already lose trials (tilt 30, blur 1.0 px).
 */
export const CAMERA_PROFILES: readonly CameraProfile[] = Object.freeze([
  { name: 'MILD', fragmentModules: 0.1, rotation: 'RANDOM', tiltDeg: 10, blurPx: 0.5, noiseSigma: 5, illumination: 0.2, text: 'fragment error 0.1 module, random rotation, tilt 10 deg, blur 0.5 px, noise sigma 5, illumination 0.2' },
  { name: 'MODERATE', fragmentModules: 0.25, rotation: 'RANDOM', tiltDeg: 20, blurPx: 0.5, noiseSigma: 10, illumination: 0.4, text: 'fragment error 0.25 module, random rotation, tilt 20 deg, blur 0.5 px, noise sigma 10, illumination 0.4' },
  { name: 'STRESS', fragmentModules: 0.25, rotation: 'RANDOM', tiltDeg: 30, blurPx: 1.0, noiseSigma: 20, illumination: 0.6, text: 'fragment error 0.25 module, random rotation, tilt 30 deg, blur 1.0 px, noise sigma 20, illumination 0.6' },
]);

export interface AlignmentProfile {
  name: string;
  placementShiftMm: number;
  placementRotDeg: number;
  gapMm: number;
  regShiftMm: number;
  regRotDeg: number;
  cutOffsetMm: number;
  /** Camera profile applied with it (its fragment position error is NOT applied: categories 2/3 are not crossed with 1). */
  camera: string;
  text: string;
}

/** Physical-family profiles that combine card placement error, duplex registration error and camera degradation. */
export const ALIGNMENT_PROFILES: readonly AlignmentProfile[] = Object.freeze([
  { name: 'ALIGN-MILD', placementShiftMm: 0.5, placementRotDeg: 1, gapMm: 0, regShiftMm: 0.25, regRotDeg: 0.5, cutOffsetMm: 0.5, camera: 'MILD', text: 'placement shift 0.5 mm, card rotation 1 deg, gap 0; registration 0.25 mm, 0.5 deg, cut offset 0.5 mm; camera MILD without fragment error' },
  { name: 'ALIGN-MODERATE', placementShiftMm: 1.0, placementRotDeg: 1, gapMm: 0.5, regShiftMm: 0.5, regRotDeg: 0.5, cutOffsetMm: 0.5, camera: 'MODERATE', text: 'placement shift 1.0 mm, card rotation 1 deg, gap 0.5 mm; registration 0.5 mm, 0.5 deg, cut offset 0.5 mm; camera MODERATE without fragment error' },
  { name: 'ALIGN-MAX', placementShiftMm: 1.0, placementRotDeg: 1, gapMm: 0.5, regShiftMm: 1.0, regRotDeg: 1, cutOffsetMm: 1.0, camera: 'STRESS', text: 'placement shift 1.0 mm, card rotation 1 deg, gap 0.5 mm; registration 1.0 mm, 1 deg, cut offset 1.0 mm (the largest task 5.6 levels); camera STRESS without fragment error' },
]);

// ---------------------------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------------------------

/**
 * Benchmark cost classes. F-*: flat; P2-*, P3-*: physical 2x2 / 3x3 board. plain = no camera effect and no board
 * error; camera = a camera degradation is active; errors = placement or duplex error (face, registration, cut,
 * placement); both = camera and errors.
 */
export type CostClass = 'F-plain' | 'F-camera' | 'P2-plain' | 'P2-camera' | 'P2-errors' | 'P2-both' | 'P3-plain' | 'P3-camera' | 'P3-errors' | 'P3-both';
export const COST_CLASSES: readonly CostClass[] = ['F-plain', 'F-camera', 'P2-plain', 'P2-camera', 'P2-errors', 'P2-both', 'P3-plain', 'P3-camera', 'P3-errors', 'P3-both'];

interface ConditionBase {
  /** Stable, human-readable identifier (file-name safe). */
  id: string;
  group: string;
  label: string;
  trials: number;
  /** Randomized mix: the factor levels are drawn per trial from the level sets (see `resolveParams`). */
  mix: boolean;
  /** Canonical string of every parameter: two conditions never share it. */
  paramKey: string;
  costClass: CostClass;
  /** Other definitions that produced the identical condition and were merged into this one. */
  alsoIn: string[];
}
export interface FlatCondition extends ConditionBase {
  family: 'FLAT';
  params: FlatParams;
}
export interface PhysicalCondition extends ConditionBase {
  family: 'PHYSICAL';
  params: PhysicalParams;
}
export type Condition = FlatCondition | PhysicalCondition;

const FLAT_KEYS: ReadonlyArray<keyof FlatParams> = ['incomplete', 'fragmentModules', 'reflect', 'rotation', 'phase', 'tiltDeg', 'blurPx', 'noiseSigma', 'illumination'];
const PHYSICAL_KEYS: ReadonlyArray<keyof PhysicalParams> = [
  'layout', 'incomplete', 'face', 'radiusMm', 'insetModules', 'fragmentModules', 'placementShiftMm', 'placementRotDeg', 'gapMm',
  'regShiftMm', 'regRotDeg', 'cutOffsetMm', 'rotation', 'phase', 'tiltDeg', 'blurPx', 'noiseSigma', 'illumination',
];

export function paramKey(family: Family, params: FlatParams | PhysicalParams, mix: boolean): string {
  const keys: ReadonlyArray<string> = family === 'FLAT' ? FLAT_KEYS : PHYSICAL_KEYS;
  const rec = params as unknown as Record<string, unknown>;
  return `${family}${mix ? '/MIX' : ''}|${keys.map((k) => `${k}=${String(rec[k])}`).join(';')}`;
}

const flatCamera = (p: FlatParams): boolean =>
  p.fragmentModules > 0 || p.reflect !== 'none' || p.rotation !== 0 || p.tiltDeg > 0 || p.blurPx > 0 || p.noiseSigma > 0 || p.illumination > 0 || p.phase === 'JITTER';
const physicalCamera = (p: PhysicalParams): boolean =>
  p.fragmentModules > 0 || p.rotation !== 0 || p.tiltDeg > 0 || p.blurPx > 0 || p.noiseSigma > 0 || p.illumination > 0 || p.phase === 'JITTER';
const physicalErrors = (p: PhysicalParams): boolean =>
  p.face !== 'FRONT' || p.placementShiftMm > 0 || p.placementRotDeg > 0 || p.gapMm > 0 || p.regShiftMm > 0 || p.regRotDeg > 0 || p.cutOffsetMm > 0;

export function costClassOf(family: Family, params: FlatParams | PhysicalParams, mix: boolean): CostClass {
  if (family === 'FLAT') return mix || flatCamera(params as FlatParams) ? 'F-camera' : 'F-plain';
  const p = params as PhysicalParams;
  const size = p.layout === '3x3' ? 'P3' : 'P2';
  const camera = mix || physicalCamera(p);
  const errors = mix || physicalErrors(p);
  return `${size}-${camera && errors ? 'both' : camera ? 'camera' : errors ? 'errors' : 'plain'}` as CostClass;
}

/** Trial seed: a pure function of (base seed, condition id, trial index), 32 bit. */
export function trialSeed(conditionId: string, trialIndex: number): number {
  return hash32(`${ROBUSTNESS_BASE_SEED}|${conditionId}|${trialIndex}`);
}

/** Sub-stream seed of one trial. */
export const robustnessStream = (seed: number, stream: number): number => streamSeed(seed, stream);

const CLEAN_FLAT: FlatParams = Object.freeze({
  incomplete: false, fragmentModules: 0, reflect: 'none', rotation: 0, phase: 'EXACT', tiltDeg: 0, blurPx: 0, noiseSigma: 0, illumination: 0,
});
const CLEAN_PHYSICAL: PhysicalParams = Object.freeze({
  layout: '2x2', incomplete: false, face: 'FRONT', radiusMm: BASELINE_RADIUS_MM, insetModules: BASELINE_INSET_MODULES, fragmentModules: 0,
  placementShiftMm: 0, placementRotDeg: 0, gapMm: 0, regShiftMm: 0, regRotDeg: 0, cutOffsetMm: 0, rotation: 0, phase: 'EXACT', tiltDeg: 0, blurPx: 0, noiseSigma: 0, illumination: 0,
});

/** Flat parameters; the pixel phase is JITTER whenever any degradation is active unless the caller says otherwise. */
export function flatParams(over: Partial<FlatParams> = {}): FlatParams {
  const p: FlatParams = { ...CLEAN_FLAT, ...over };
  if (over.phase === undefined) p.phase = flatCamera({ ...p, phase: 'EXACT' }) ? 'JITTER' : 'EXACT';
  return p;
}

export function physicalParams(over: Partial<PhysicalParams> = {}): PhysicalParams {
  const p: PhysicalParams = { ...CLEAN_PHYSICAL, ...over };
  if (over.phase === undefined) p.phase = physicalCamera({ ...p, phase: 'EXACT' }) ? 'JITTER' : 'EXACT';
  const boardErrors = p.placementShiftMm > 0 || p.placementRotDeg > 0 || p.gapMm > 0 || p.regShiftMm > 0 || p.regRotDeg > 0 || p.cutOffsetMm > 0;
  if (p.fragmentModules > 0 && boardErrors) {
    throw new RangeError('fragment position error is never combined with card placement or duplex errors');
  }
  return p;
}

class Book {
  readonly list = new Map<string, Condition>();
  private readonly keys = new Map<string, string>();
  addFlat(group: string, id: string, label: string, params: FlatParams, trials = FLAT_TRIALS, mix = false): void {
    this.put({ family: 'FLAT', params, group, id, label, trials, mix });
  }
  addPhysical(group: string, id: string, label: string, params: PhysicalParams, trials = PHYSICAL_TRIALS, mix = false): void {
    this.put({ family: 'PHYSICAL', params, group, id, label, trials, mix });
  }
  private put(c: { family: Family; params: FlatParams | PhysicalParams; group: string; id: string; label: string; trials: number; mix: boolean }): void {
    if (c.trials < MIN_TRIALS_PER_CONDITION) throw new RangeError(`condition ${c.id}: fewer than ${MIN_TRIALS_PER_CONDITION} trials`);
    const key = paramKey(c.family, c.params, c.mix);
    const prior = this.keys.get(key);
    if (prior !== undefined) {
      (this.list.get(prior) as Condition).alsoIn.push(`${c.group}/${c.id}`);
      return;
    }
    if (this.list.has(c.id)) throw new Error(`duplicate condition id ${c.id}`);
    this.keys.set(key, c.id);
    this.list.set(c.id, { ...c, paramKey: key, costClass: costClassOf(c.family, c.params, c.mix), alsoIn: [] } as Condition);
  }
}

const faceCode = (f: Face): string => (f === 'FRONT' ? 'F' : f === 'BACK_VERTICAL' ? 'BV' : 'BH');
const kindCode = (incomplete: boolean): string => (incomplete ? 'I' : 'C');
const FACES: readonly Face[] = PHYSICAL_LEVELS.face;
const LAYOUTS: readonly Layout[] = PHYSICAL_LEVELS.layout;
const reflTag = (r: Reflect): string => (r === 'none' ? 'N' : r);

function cameraOf(name: string): CameraProfile {
  const c = CAMERA_PROFILES.find((x) => x.name === name);
  if (c === undefined) throw new Error(`unknown camera profile ${name}`);
  return c;
}

/** The flat sweeps, in definition order: [factor tag, key, levels]. */
const FLAT_SWEEPS: ReadonlyArray<{ tag: string; key: 'tiltDeg' | 'blurPx' | 'noiseSigma' | 'illumination' | 'fragmentModules'; levels: readonly number[] }> = [
  { tag: 'FRAG', key: 'fragmentModules', levels: [0.1, 0.25] },
  { tag: 'TILT', key: 'tiltDeg', levels: [10, 20, 30, 40, 50] },
  { tag: 'BLUR', key: 'blurPx', levels: [0.5, 1.0, 1.5, 2.0] },
  { tag: 'NOISE', key: 'noiseSigma', levels: [5, 10, 20, 40, 80] },
  { tag: 'ILLUM', key: 'illumination', levels: [0.2, 0.4, 0.6, 0.8] },
];

/** Pair levels of the two-factor interaction conditions of the flat family (random rotation context). */
export const FLAT_PAIR_LEVELS: ReadonlyArray<{ tag: string; over: Partial<FlatParams> }> = [
  { tag: 'FRAG0.25', over: { fragmentModules: 0.25 } },
  { tag: 'TILT30', over: { tiltDeg: 30 } },
  { tag: 'BLUR1', over: { blurPx: 1.0 } },
  { tag: 'NOISE20', over: { noiseSigma: 20 } },
  { tag: 'ILLUM0.6', over: { illumination: 0.6 } },
];

function buildConditions(): Condition[] {
  const b = new Book();
  const RR: Partial<FlatParams> = { rotation: 'RANDOM' };

  // ---- Family A: flat layout -------------------------------------------------------------
  b.addFlat('A-BASE', 'A-CLEAN', 'clean flat 2x2 group, exact pixel lattice', flatParams());
  for (const s of FLAT_SWEEPS) {
    for (const lv of s.levels) {
      b.addFlat(`A-${s.tag}`, `A-${s.tag}-${lv}`, `${s.key} = ${lv}`, flatParams({ [s.key]: lv }));
    }
  }
  for (const r of FLAT_FIXED_ROTATIONS) {
    b.addFlat('A-ROT', `A-ROT-${r.tag}`, `rotation ${r.deg} deg, ${r.phase === 'EXACT' ? 'exact pixel lattice' : 'sub-pixel phase jitter'}`, flatParams({ rotation: r.deg, phase: r.phase }));
  }
  b.addFlat('A-ROT', 'A-ROT-RANDOM', 'rotation uniform random 0-360 deg, sub-pixel phase jitter', flatParams(RR));
  for (const s of FLAT_SWEEPS) {
    for (const lv of s.levels) {
      b.addFlat(`A-RR-${s.tag}`, `A-RR-${s.tag}-${lv}`, `random rotation + ${s.key} = ${lv}`, flatParams({ ...RR, [s.key]: lv }));
    }
  }
  for (const r of ['Fh', 'Fv'] as const) {
    b.addFlat('A-REFL', `A-REFL-${r}`, `reflection ${r}`, flatParams({ reflect: r }));
    b.addFlat('A-RR-REFL', `A-RR-REFL-${r}`, `random rotation + reflection ${r}`, flatParams({ ...RR, reflect: r }));
  }
  for (const prof of CAMERA_PROFILES) {
    for (const r of FLAT_LEVELS.reflect) {
      b.addFlat('A-PROF', `A-PROF-${prof.name}-${reflTag(r)}`, `profile ${prof.name}, reflection ${r}`, flatParams({
        fragmentModules: prof.fragmentModules, rotation: prof.rotation, tiltDeg: prof.tiltDeg, blurPx: prof.blurPx, noiseSigma: prof.noiseSigma, illumination: prof.illumination, reflect: r,
      }));
    }
  }
  for (let i = 0; i < FLAT_PAIR_LEVELS.length; i++) {
    for (let j = i + 1; j < FLAT_PAIR_LEVELS.length; j++) {
      const a = FLAT_PAIR_LEVELS[i] as (typeof FLAT_PAIR_LEVELS)[number];
      const c = FLAT_PAIR_LEVELS[j] as (typeof FLAT_PAIR_LEVELS)[number];
      b.addFlat('A-PAIR', `A-PAIR-${a.tag}+${c.tag}`, `random rotation + ${a.tag} + ${c.tag}`, flatParams({ ...RR, ...a.over, ...c.over }));
    }
  }
  b.addFlat('A-INC', 'A-INC-CLEAN', 'incomplete group (one marker erased), clean', flatParams({ incomplete: true }));
  for (const prof of CAMERA_PROFILES) {
    b.addFlat('A-INC', `A-INC-${prof.name}`, `incomplete group, profile ${prof.name}`, flatParams({
      incomplete: true, fragmentModules: prof.fragmentModules, rotation: prof.rotation, tiltDeg: prof.tiltDeg, blurPx: prof.blurPx, noiseSigma: prof.noiseSigma, illumination: prof.illumination,
    }));
  }
  b.addFlat('A-MIX', 'A-MIX', 'randomized mix: every factor drawn per trial from its level set', flatParams({ phase: 'JITTER' }), MIX_TRIALS['A-MIX'], true);
  b.addFlat('A-MIX', 'A-MIX-INC', 'randomized mix, incomplete group', flatParams({ phase: 'JITTER', incomplete: true }), MIX_TRIALS['A-MIX-INC'], true);

  // ---- Family B: physical geometry ---------------------------------------------------------
  const P = physicalParams;
  const camOf = (name: string, withFragment: boolean): Partial<PhysicalParams> => {
    const c = cameraOf(name);
    return { fragmentModules: withFragment ? c.fragmentModules : 0, rotation: c.rotation, tiltDeg: c.tiltDeg, blurPx: c.blurPx, noiseSigma: c.noiseSigma, illumination: c.illumination };
  };
  const tag = (layout: Layout, incomplete: boolean): string => `${layout}-${kindCode(incomplete)}`;

  // B-BOARD: boards x complete/incomplete x faces, clean.
  for (const layout of LAYOUTS) {
    for (const incomplete of [false, true]) {
      for (const face of FACES) {
        b.addPhysical('P-BOARD', `P-BOARD-${tag(layout, incomplete)}-${faceCode(face)}`, `${layout} board, ${incomplete ? 'one card absent' : 'complete group'}, ${face}, no error`, P({ layout, incomplete, face }));
      }
    }
  }

  // B-DUP: duplex registration and cut sweeps (category 3).
  const duplexSpecs = (face: Face): Array<{ tag: string; over: Partial<PhysicalParams> }> =>
    face === 'FRONT'
      ? [0.5, 1.0].map((c) => ({ tag: `co${c}`, over: { cutOffsetMm: c } }))
      : [
          ...[0.25, 0.5, 1.0].map((s) => ({ tag: `rs${s}`, over: { regShiftMm: s } })),
          ...[0.5, 1].map((r) => ({ tag: `rr${r}`, over: { regRotDeg: r } })),
          ...[0.5, 1.0].map((c) => ({ tag: `co${c}`, over: { cutOffsetMm: c } })),
          { tag: 'mid', over: { regShiftMm: 0.5, regRotDeg: 0.5, cutOffsetMm: 0.5 } },
          { tag: 'max', over: { regShiftMm: 1.0, regRotDeg: 1, cutOffsetMm: 1.0 } },
        ];
  for (const face of FACES) {
    for (const s of duplexSpecs(face)) {
      b.addPhysical('P-DUP', `P-DUP-2x2-C-${faceCode(face)}-${s.tag}`, `2x2 complete, ${face}, ${JSON.stringify(s.over)}`, P({ face, ...s.over }));
    }
  }
  const dupSubset: Array<{ face: Face; tag: string; over: Partial<PhysicalParams> }> = [
    { face: 'FRONT', tag: 'co1', over: { cutOffsetMm: 1.0 } },
    { face: 'BACK_VERTICAL', tag: 'max', over: { regShiftMm: 1.0, regRotDeg: 1, cutOffsetMm: 1.0 } },
    { face: 'BACK_HORIZONTAL', tag: 'max', over: { regShiftMm: 1.0, regRotDeg: 1, cutOffsetMm: 1.0 } },
  ];
  for (const [layout, incomplete] of [['2x2', true], ['3x3', false], ['3x3', true]] as const) {
    for (const d of dupSubset) {
      b.addPhysical('P-DUP', `P-DUP-${tag(layout, incomplete)}-${faceCode(d.face)}-${d.tag}`, `${layout} ${incomplete ? 'one card absent' : 'complete'}, ${d.face}, ${JSON.stringify(d.over)}`, P({ layout, incomplete, face: d.face, ...d.over }));
    }
  }

  // B-PLACE: card placement error sweeps (category 2).
  const placeSpecs: Array<{ tag: string; over: Partial<PhysicalParams> }> = [
    ...[0.5, 1.0, 1.5].map((v) => ({ tag: `sh${v}`, over: { placementShiftMm: v } })),
    ...[1, 2, 3].map((v) => ({ tag: `ro${v}`, over: { placementRotDeg: v } })),
    ...[0.5, 1.0].map((v) => ({ tag: `gp${v}`, over: { gapMm: v } })),
  ];
  for (const s of placeSpecs) b.addPhysical('P-PLACE', `P-PLACE-2x2-C-${s.tag}`, `2x2 complete, ${JSON.stringify(s.over)}`, P(s.over));
  const placeMax: Array<{ tag: string; over: Partial<PhysicalParams> }> = [
    { tag: 'sh1.5', over: { placementShiftMm: 1.5 } },
    { tag: 'ro3', over: { placementRotDeg: 3 } },
    { tag: 'gp1', over: { gapMm: 1.0 } },
  ];
  for (const [layout, incomplete] of [['3x3', false], ['2x2', true], ['3x3', true]] as const) {
    for (const s of placeMax) b.addPhysical('P-PLACE', `P-PLACE-${tag(layout, incomplete)}-${s.tag}`, `${layout} ${incomplete ? 'one card absent' : 'complete'}, ${JSON.stringify(s.over)}`, P({ layout, incomplete, ...s.over }));
  }

  // B-CAM: camera degradations of degrade.ts on top of the compositions.
  const camSweeps: Array<{ tag: string; over: Partial<PhysicalParams> }> = [
    ...[{ t: '0J', deg: 0, phase: 'JITTER' }, { t: '45E', deg: 45, phase: 'EXACT' }, { t: '45J', deg: 45, phase: 'JITTER' }, { t: '90E', deg: 90, phase: 'EXACT' }, { t: '180E', deg: 180, phase: 'EXACT' }, { t: '270E', deg: 270, phase: 'EXACT' }].map((r) => ({
      tag: `ROT-${r.t}`, over: { rotation: r.deg, phase: r.phase as Phase },
    })),
    { tag: 'ROT-RANDOM', over: { rotation: 'RANDOM' } },
    ...[10, 20, 30, 40].map((v) => ({ tag: `TILT-${v}`, over: { tiltDeg: v } })),
    ...[0.5, 1.0, 1.5, 2.0].map((v) => ({ tag: `BLUR-${v}`, over: { blurPx: v } })),
    ...[5, 10, 20, 40, 80].map((v) => ({ tag: `NOISE-${v}`, over: { noiseSigma: v } })),
    ...[0.2, 0.4, 0.6, 0.8].map((v) => ({ tag: `ILLUM-${v}`, over: { illumination: v } })),
    ...[0.1, 0.25].map((v) => ({ tag: `FRAG-${v}`, over: { fragmentModules: v } })),
  ];
  for (const s of camSweeps) b.addPhysical('P-CAM', `P-CAM-2x2-C-F-${s.tag}`, `2x2 complete FRONT, ${JSON.stringify(s.over)}`, P(s.over));
  for (const face of ['BACK_VERTICAL', 'BACK_HORIZONTAL'] as const) {
    b.addPhysical('P-CAM', `P-CAM-2x2-C-${faceCode(face)}-ROT-RANDOM`, `2x2 complete ${face}, random rotation`, P({ face, rotation: 'RANDOM' }));
  }
  for (const [layout, incomplete, keep] of [
    ['3x3', false, ['ROT-45J', 'ROT-RANDOM', 'TILT-30', 'BLUR-1', 'NOISE-20', 'ILLUM-0.6', 'FRAG-0.25']],
    ['2x2', true, ['ROT-RANDOM', 'TILT-30', 'BLUR-1', 'NOISE-20', 'FRAG-0.25']],
    ['3x3', true, ['ROT-RANDOM', 'TILT-30', 'BLUR-1', 'NOISE-20', 'FRAG-0.25']],
  ] as const) {
    for (const t of keep) {
      const s = camSweeps.find((x) => x.tag === t);
      if (s === undefined) throw new Error(`unknown camera sweep ${t}`);
      b.addPhysical('P-CAM', `P-CAM-${tag(layout, incomplete)}-F-${s.tag}`, `${layout} ${incomplete ? 'one card absent' : 'complete'} FRONT, ${JSON.stringify(s.over)}`, P({ layout, incomplete, ...s.over }));
    }
  }

  // B-PROF / B-ALIGN: combined profiles on every board, kind and face.
  for (const prof of CAMERA_PROFILES) {
    for (const layout of LAYOUTS) {
      for (const incomplete of [false, true]) {
        for (const face of FACES) {
          b.addPhysical('P-PROF', `P-PROF-${prof.name}-${tag(layout, incomplete)}-${faceCode(face)}`, `profile ${prof.name} (${prof.text}), ${layout} ${incomplete ? 'one card absent' : 'complete'}, ${face}`, P({ layout, incomplete, face, ...camOf(prof.name, true) }));
        }
      }
    }
  }
  for (const al of ALIGNMENT_PROFILES) {
    for (const layout of LAYOUTS) {
      for (const incomplete of [false, true]) {
        for (const face of FACES) {
          b.addPhysical('P-ALIGN', `P-${al.name}-${tag(layout, incomplete)}-${faceCode(face)}`, `profile ${al.name} (${al.text}), ${layout} ${incomplete ? 'one card absent' : 'complete'}, ${face}`, P({
            layout, incomplete, face, placementShiftMm: al.placementShiftMm, placementRotDeg: al.placementRotDeg, gapMm: al.gapMm,
            regShiftMm: al.regShiftMm, regRotDeg: al.regRotDeg, cutOffsetMm: al.cutOffsetMm, ...camOf(al.camera, false),
          }));
        }
      }
    }
  }

  // B-MIX: randomized mixes (no fragment position error, see resolveParams).
  for (const layout of LAYOUTS) {
    for (const incomplete of [false, true]) {
      const t = tag(layout, incomplete);
      b.addPhysical('P-MIX', `P-MIX-${t}`, `randomized mix, ${layout} ${incomplete ? 'one card absent' : 'complete'}`, P({ layout, incomplete, phase: 'JITTER' }), MIX_TRIALS[`P-MIX-${t}` as keyof typeof MIX_TRIALS], true);
    }
  }
  return [...b.list.values()];
}

let cache: Condition[] | null = null;
/** Every robustness condition in deterministic order (family A, then family B; definition order inside). */
export function enumerateConditions(): Condition[] {
  cache ??= buildConditions();
  return cache;
}

export const conditionById = (id: string): Condition | undefined => enumerateConditions().find((c) => c.id === id);

// ---------------------------------------------------------------------------------------------
// Randomized mixes
// ---------------------------------------------------------------------------------------------

/**
 * Concrete parameters of one trial. Fixed conditions return their parameters. A MIX condition keeps its structural
 * parameters (family, board layout, complete/incomplete) and draws every other factor independently and uniformly from
 * its level set with a fixed number of draws (stream `STREAM.mix` of the trial seed):
 *  FLAT: fragment {0, 0.1, 0.25}, reflection {none, Fh, Fv}, rotation = uniform random angle with probability 1/2,
 *        otherwise one of the 12 fixed angles, tilt, blur, noise, illumination from the flat level sets, phase JITTER.
 *  PHYSICAL: face, registration shift/rotation, cut offset, placement shift/rotation, gap from the task 5.6 level sets,
 *        camera rotation (random with probability 1/2, otherwise one of 0, 45, 90, 180, 270), tilt, blur, noise,
 *        illumination, phase JITTER; fragment position error is always 0 (it is never combined with categories 2 and 3).
 * A MIX condition is ONE condition (one distribution of mixed degradations): its counts are not pooled from other
 * conditions, and it never replaces the explicit conditions.
 */
export function resolveParams(cond: Condition, seed: number): FlatParams | PhysicalParams {
  if (!cond.mix) return cond.params;
  const rng = mulberry32(streamSeed(seed, STREAM.mix));
  const pick = <T>(xs: readonly T[]): T => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))] as T;
  if (cond.family === 'FLAT') {
    const fragmentModules = pick(FLAT_LEVELS.fragmentModules);
    const reflect = pick(FLAT_LEVELS.reflect);
    const useRandom = rng() < 0.5;
    const fixed = pick(MIX_FIXED_ANGLES_FLAT);
    return flatParams({
      incomplete: cond.params.incomplete, fragmentModules, reflect, rotation: useRandom ? 'RANDOM' : fixed, phase: 'JITTER',
      tiltDeg: pick(FLAT_LEVELS.tiltDeg), blurPx: pick(FLAT_LEVELS.blurPx), noiseSigma: pick(FLAT_LEVELS.noiseSigma), illumination: pick(FLAT_LEVELS.illumination),
    });
  }
  const base = cond.params;
  const face = pick(PHYSICAL_LEVELS.face);
  const regShiftMm = pick(PHYSICAL_LEVELS.regShiftMm);
  const regRotDeg = pick(PHYSICAL_LEVELS.regRotDeg);
  const cutOffsetMm = pick(PHYSICAL_LEVELS.cutOffsetMm);
  const placementShiftMm = pick(PHYSICAL_LEVELS.placementShiftMm);
  const placementRotDeg = pick(PHYSICAL_LEVELS.placementRotDeg);
  const gapMm = pick(PHYSICAL_LEVELS.gapMm);
  const useRandom = rng() < 0.5;
  const fixed = pick(MIX_FIXED_ANGLES_PHYSICAL);
  return physicalParams({
    layout: base.layout, incomplete: base.incomplete, face, regShiftMm, regRotDeg, cutOffsetMm, placementShiftMm, placementRotDeg, gapMm,
    rotation: useRandom ? 'RANDOM' : fixed, phase: 'JITTER', tiltDeg: pick(PHYSICAL_LEVELS.tiltDeg), blurPx: pick(PHYSICAL_LEVELS.blurPx),
    noiseSigma: pick(PHYSICAL_LEVELS.noiseSigma), illumination: pick(PHYSICAL_LEVELS.illumination),
  });
}

// ---------------------------------------------------------------------------------------------
// Summaries, coverage, full factorial
// ---------------------------------------------------------------------------------------------

export interface FamilySummary {
  family: Family;
  conditions: number;
  trials: number;
  minTrials: number;
}

export function familySummaries(conditions: readonly Condition[]): FamilySummary[] {
  return (['FLAT', 'PHYSICAL'] as const).map((family) => {
    const c = conditions.filter((x) => x.family === family);
    return { family, conditions: c.length, trials: c.reduce((t, x) => t + x.trials, 0), minTrials: Math.min(...c.map((x) => x.trials)) };
  });
}

export interface GroupSummary {
  family: Family;
  group: string;
  conditions: number;
  trials: number;
  mergedDuplicates: number;
}

export function groupSummaries(conditions: readonly Condition[]): GroupSummary[] {
  const out = new Map<string, GroupSummary>();
  for (const c of conditions) {
    const key = `${c.family}|${c.group}`;
    const s = out.get(key) ?? { family: c.family, group: c.group, conditions: 0, trials: 0, mergedDuplicates: 0 };
    s.conditions++;
    s.trials += c.trials;
    s.mergedDuplicates += c.alsoIn.length;
    out.set(key, s);
  }
  return [...out.values()];
}

export interface CoverageRow {
  family: Family;
  /** Requirement (task 7.2 text) the row belongs to. */
  requirement: string;
  level: string;
  conditions: number;
  groups: string;
  examples: string[];
}

type Pred = (c: Condition) => boolean;
const fixedFlat = (f: (p: FlatParams) => boolean): Pred => (c) => c.family === 'FLAT' && !c.mix && f(c.params);
const fixedPhys = (f: (p: PhysicalParams) => boolean): Pred => (c) => c.family === 'PHYSICAL' && !c.mix && f(c.params);

/** Required levels and the predicate that finds the explicit (non-mix) conditions covering each of them. */
export function coverageSpec(): Array<{ family: Family; requirement: string; level: string; pred: Pred }> {
  const rows: Array<{ family: Family; requirement: string; level: string; pred: Pred }> = [];
  const A = (requirement: string, level: string, f: (p: FlatParams) => boolean): void => void rows.push({ family: 'FLAT', requirement, level, pred: fixedFlat(f) });
  const B = (requirement: string, level: string, f: (p: PhysicalParams) => boolean): void => void rows.push({ family: 'PHYSICAL', requirement, level, pred: fixedPhys(f) });
  for (const lv of FRAGMENT_OFFSET_LEVELS_MODULES) {
    A('Fragment position error (category 1)', `${lv} module`, (p) => p.fragmentModules === lv);
    B('Fragment position error (category 1)', `${lv} module`, (p) => p.fragmentModules === lv);
  }
  A('Camera rotation', '0 deg, exact lattice', (p) => p.rotation === 0 && p.phase === 'EXACT');
  A('Camera rotation', '0 deg, sub-pixel phase jitter', (p) => p.rotation === 0 && p.phase === 'JITTER' && p.tiltDeg === 0 && p.blurPx === 0 && p.noiseSigma === 0);
  A('Camera rotation', 'exactly 45 deg, exact lattice (single pixel phase)', (p) => p.rotation === 45 && p.phase === 'EXACT');
  A('Camera rotation', 'exactly 45 deg, sub-pixel phase jitter', (p) => p.rotation === 45 && p.phase === 'JITTER');
  for (const a of [90, 180, 270]) A('Camera rotation', `axis angle ${a} deg`, (p) => p.rotation === a);
  A('Camera rotation', 'other fixed angles (15, 30, 60, 75, 135, 225, 315 deg), phase jitter', (p) => typeof p.rotation === 'number' && [15, 30, 60, 75, 135, 225, 315].includes(p.rotation));
  A('Camera rotation', 'uniform random 0-360 deg, phase jitter', (p) => p.rotation === 'RANDOM');
  B('Camera rotation', '0 deg, exact lattice', (p) => p.rotation === 0 && p.phase === 'EXACT');
  B('Camera rotation', '0 deg, sub-pixel phase jitter', (p) => p.rotation === 0 && p.phase === 'JITTER' && p.tiltDeg === 0 && p.blurPx === 0 && p.noiseSigma === 0 && p.fragmentModules === 0);
  B('Camera rotation', 'exactly 45 deg, exact lattice (single pixel phase)', (p) => p.rotation === 45 && p.phase === 'EXACT');
  B('Camera rotation', 'exactly 45 deg, sub-pixel phase jitter', (p) => p.rotation === 45 && p.phase === 'JITTER');
  for (const a of [90, 180, 270]) B('Camera rotation', `axis angle ${a} deg`, (p) => p.rotation === a);
  B('Camera rotation', 'uniform random 0-360 deg, phase jitter', (p) => p.rotation === 'RANDOM');
  for (const lv of FLAT_LEVELS.tiltDeg.filter((x) => x > 0)) A('Perspective tilt', `${lv} deg`, (p) => p.tiltDeg === lv);
  for (const lv of PHYSICAL_LEVELS.tiltDeg.filter((x) => x > 0)) B('Perspective tilt', `${lv} deg`, (p) => p.tiltDeg === lv);
  for (const lv of FLAT_LEVELS.blurPx.filter((x) => x > 0)) A('Blur', `sigma ${lv} px`, (p) => p.blurPx === lv);
  for (const lv of PHYSICAL_LEVELS.blurPx.filter((x) => x > 0)) B('Blur', `sigma ${lv} px`, (p) => p.blurPx === lv);
  for (const lv of FLAT_LEVELS.noiseSigma.filter((x) => x > 0)) A('Noise', `sigma ${lv}`, (p) => p.noiseSigma === lv);
  for (const lv of PHYSICAL_LEVELS.noiseSigma.filter((x) => x > 0)) B('Noise', `sigma ${lv}`, (p) => p.noiseSigma === lv);
  for (const lv of FLAT_LEVELS.illumination.filter((x) => x > 0)) A('Illumination gradient', `strength ${lv}`, (p) => p.illumination === lv);
  for (const lv of PHYSICAL_LEVELS.illumination.filter((x) => x > 0)) B('Illumination gradient', `strength ${lv}`, (p) => p.illumination === lv);
  for (const r of ['none', 'Fh', 'Fv'] as const) A('Reflection', r, (p) => p.reflect === r);
  A('Incomplete group', 'one marker erased', (p) => p.incomplete);
  for (const prof of ['CLEAN', ...CAMERA_PROFILES.map((x) => x.name)]) {
    A('Combined profile', prof, (p) => {
      const c = prof === 'CLEAN' ? null : cameraOf(prof);
      return c === null ? !p.incomplete && p.fragmentModules === 0 && p.reflect === 'none' && p.rotation === 0 && p.tiltDeg === 0 && p.blurPx === 0 && p.noiseSigma === 0 && p.illumination === 0 && p.phase === 'EXACT'
        : !p.incomplete && p.fragmentModules === c.fragmentModules && p.rotation === c.rotation && p.tiltDeg === c.tiltDeg && p.blurPx === c.blurPx && p.noiseSigma === c.noiseSigma && p.illumination === c.illumination;
    });
  }
  // physical geometry
  B('Geometry', `baseline corner radius ${BASELINE_RADIUS_MM} mm, inset ${BASELINE_INSET_MODULES} module`, (p) => p.radiusMm === BASELINE_RADIUS_MM && p.insetModules === BASELINE_INSET_MODULES);
  for (const l of LAYOUTS) B('Board', `${l} board`, (p) => p.layout === l);
  B('Board', '3x3 with Distractor_Markers, complete group', (p) => p.layout === '3x3' && !p.incomplete);
  B('Group', 'complete group', (p) => !p.incomplete);
  B('Group', 'incomplete group (one card absent)', (p) => p.incomplete);
  for (const f of FACES) B('Face / flip', f === 'FRONT' ? 'FRONT' : f === 'BACK_VERTICAL' ? 'BACK, vertical-axis flip' : 'BACK, horizontal-axis flip', (p) => p.face === f);
  for (const lv of [0.25, 0.5, 1.0]) B('Duplex registration shift (category 3)', `${lv} mm`, (p) => p.regShiftMm === lv && p.face !== 'FRONT');
  for (const lv of [0.5, 1]) B('Duplex registration rotation (category 3)', `${lv} deg`, (p) => p.regRotDeg === lv && p.face !== 'FRONT');
  for (const lv of [0.5, 1.0]) B('Cut-outline offset (category 3)', `${lv} mm`, (p) => p.cutOffsetMm === lv);
  for (const lv of [0.5, 1.0, 1.5]) B('Card placement shift (category 2)', `${lv} mm`, (p) => p.placementShiftMm === lv);
  for (const lv of [1, 2, 3]) B('Card placement rotation (category 2)', `${lv} deg`, (p) => p.placementRotDeg === lv);
  for (const lv of [0.5, 1.0]) B('Card placement gap (category 2)', `${lv} mm`, (p) => p.gapMm === lv);
  for (const f of ['BACK_VERTICAL', 'BACK_HORIZONTAL'] as const) {
    B('Degradation on top of duplex composition', `${f}: camera degradation active together with duplex error`, (p) => p.face === f && (p.regShiftMm > 0 || p.regRotDeg > 0 || p.cutOffsetMm > 0) && physicalCamera(p));
  }
  B('Degradation on top of placement error', 'camera degradation active together with card placement error', (p) => (p.placementShiftMm > 0 || p.placementRotDeg > 0 || p.gapMm > 0) && physicalCamera(p));
  for (const prof of CAMERA_PROFILES) {
    B('Combined profile (camera only, perfect cards)', prof.name, (p) => p.fragmentModules === prof.fragmentModules && p.rotation === prof.rotation && p.tiltDeg === prof.tiltDeg && p.blurPx === prof.blurPx && p.noiseSigma === prof.noiseSigma && p.illumination === prof.illumination && p.placementShiftMm === 0 && p.regShiftMm === 0 && p.cutOffsetMm === 0);
  }
  for (const al of ALIGNMENT_PROFILES) {
    B('Combined profile (placement + duplex + camera)', al.name, (p) => p.placementShiftMm === al.placementShiftMm && p.placementRotDeg === al.placementRotDeg && p.gapMm === al.gapMm && p.regShiftMm === al.regShiftMm && p.regRotDeg === al.regRotDeg && p.cutOffsetMm === al.cutOffsetMm && p.fragmentModules === 0 && p.rotation === cameraOf(al.camera).rotation);
  }
  return rows;
}

export function coverageMatrix(conditions: readonly Condition[]): CoverageRow[] {
  return coverageSpec().map((r) => {
    const hit = conditions.filter((c) => c.family === r.family && r.pred(c));
    const byGroup = new Map<string, number>();
    for (const c of hit) byGroup.set(c.group, (byGroup.get(c.group) ?? 0) + 1);
    return {
      family: r.family,
      requirement: r.requirement,
      level: r.level,
      conditions: hit.length,
      groups: [...byGroup.entries()].map(([g, n]) => `${g} ${n}`).join(', '),
      examples: hit.slice(0, 3).map((c) => c.id),
    };
  });
}

export interface FullFactorial {
  family: Family;
  factors: Array<{ name: string; levels: number }>;
  conditions: bigint;
  trialsAtMinimum: bigint;
}

/** Size of the full cross product of every factor level of one family (duplex errors counted by distinct combinations). */
export function fullFactorial(family: Family): FullFactorial {
  const L = PHYSICAL_LEVELS;
  const f = FLAT_LEVELS;
  const factors =
    family === 'FLAT'
      ? [
          { name: 'complete / incomplete group', levels: 2 },
          { name: 'fragment position error', levels: f.fragmentModules.length },
          { name: 'camera rotation setting (13 fixed + random)', levels: FLAT_FIXED_ROTATIONS.length + 1 },
          { name: 'perspective tilt', levels: f.tiltDeg.length },
          { name: 'blur', levels: f.blurPx.length },
          { name: 'noise', levels: f.noiseSigma.length },
          { name: 'illumination gradient', levels: f.illumination.length },
          { name: 'reflection', levels: f.reflect.length },
        ]
      : [
          { name: 'board layout', levels: L.layout.length },
          { name: 'complete / incomplete group', levels: 2 },
          { name: 'face x flip x registration shift x registration rotation x cut offset (distinct)', levels: L.cutOffsetMm.length + 2 * L.regShiftMm.length * L.regRotDeg.length * L.cutOffsetMm.length },
          { name: 'placement shift', levels: L.placementShiftMm.length },
          { name: 'placement rotation', levels: L.placementRotDeg.length },
          { name: 'gap', levels: L.gapMm.length },
          { name: 'fragment position error', levels: L.fragmentModules.length },
          { name: 'camera rotation setting (0 exact, 0 jitter, 45 exact, 45 jitter, 90, 180, 270, random)', levels: 8 },
          { name: 'perspective tilt', levels: L.tiltDeg.length },
          { name: 'blur', levels: L.blurPx.length },
          { name: 'noise', levels: L.noiseSigma.length },
          { name: 'illumination gradient', levels: L.illumination.length },
        ];
  const conditions = factors.reduce((t, x) => t * BigInt(x.levels), 1n);
  return { family, factors, conditions, trialsAtMinimum: conditions * BigInt(MIN_TRIALS_PER_CONDITION) };
}

/** Relative cost per trial of each class (static, only used to balance shards; real timings are in robustness-bench.json). */
export const COST_WEIGHT: Readonly<Record<CostClass, number>> = Object.freeze({
  'F-plain': 0.02, 'F-camera': 0.08, 'P2-plain': 1, 'P2-camera': 1.3, 'P2-errors': 1, 'P2-both': 1.3, 'P3-plain': 2.2, 'P3-camera': 2.9, 'P3-errors': 2.2, 'P3-both': 2.9,
});

/**
 * Deterministic shard assignment (greedy longest-first on trials x static class weight): returns, for every condition of
 * `conditions` in order, its shard index 0..k-1. Depends only on the given list and k, never on timings.
 */
export function assignShards(conditions: readonly Condition[], k: number): number[] {
  if (!Number.isInteger(k) || k < 1) throw new RangeError('k must be a positive integer');
  const cost = conditions.map((c) => c.trials * COST_WEIGHT[c.costClass]);
  const order = conditions.map((_, i) => i).sort((a, b) => (cost[b] as number) - (cost[a] as number) || a - b);
  const load = new Array<number>(k).fill(0);
  const out = new Array<number>(conditions.length).fill(0);
  for (const i of order) {
    let best = 0;
    for (let s = 1; s < k; s++) if ((load[s] as number) < (load[best] as number)) best = s;
    out[i] = best;
    load[best] = (load[best] as number) + (cost[i] as number);
  }
  return out;
}

/** Number of condition-trials (planned). */
export const totalTrials = (conditions: readonly Condition[]): number => conditions.reduce((t, c) => t + c.trials, 0);

// ---------------------------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------------------------

/** The exact one-sided 95% bound on the per-trial misidentification probability, only meaningful for a zero count. */
export function misidentificationBound95(n: number, misidentified: number): number | null {
  return misidentified === 0 ? zeroEventUpperBound95(n) : null;
}
