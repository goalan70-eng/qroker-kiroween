/**
 * TEST SUPPORT ONLY - one trial of the task 7.2 robustness experiment and the per-condition statistics.
 * SYNTHETIC images, not real cameras.
 *
 * Information flow: the scene builders know the truth (cards, positions). The image goes through `degradeScene`
 * (degrade.ts) and only then to `decodeGroup` (its only input is the pixel image plus the layout offset of the
 * marker footprints, a property of the predefined layout, never an identity). `classifyDecode` compares the decoder
 * result with the truth afterwards.
 *
 * FLAT family: group-compose.ts `composeGroup` (four markers around one vertex on a 32 x 32 module canvas, 4 px per
 * module). PHYSICAL family: geometry-trial.ts `buildScenario` / `renderScenario` (board of rounded cards with faces,
 * flips, placement and duplex errors, 3x3 boards with Distractor_Markers). The degrade.ts camera stages replace the
 * camera chain of geometry-trial.ts; nothing of the already committed Milestone 5 modules is changed.
 *
 * Sub-pixel phase jitter (phase = JITTER): the stages of `degrade` are applied in their documented order, but the
 * geometric stage is done here with the exported `warpHomography` and `perspectiveMatrix` of degrade.ts, with ONE extra
 * translation (uniform in [-0.5, 0.5) px per axis, seeded) composed after the perspective and rotation matrices in the
 * same single resampling. For a zero translation the result is byte-identical to `degrade` (tested). degrade.ts itself
 * is unchanged.
 */
import { decodeGroup, type GroupDecodeResult } from '../decode-group';
import {
  degrade,
  markerFootprintRect,
  perspectiveMatrix,
  warpHomography,
  type PixelRect,
  type PerspectiveParams,
} from '../degrade';
import { mulberry32 } from '../prng';
import type { GrayImage } from '../render';
import { CLEAN_DARK, streamSeed, type CellParams } from './geometry-design';
import {
  buildScenario,
  decodeScenarioImage,
  focusFootprintsClipped,
  geometryOf,
  renderScenario,
  type BoardRaster,
  type Scenario,
} from './geometry-trial';
import { RANKS, SLOT_NAMES, composeGroup, referenceSum, slotChoices, type Arrangement, type SlotName } from './group-compose';
import { CORE_MOD, boardMmToPixel, type PhysicalGeometry } from './physical-card';
import {
  FLAT_BACKGROUND,
  FLAT_CANVAS_MODULES,
  FLAT_DISTANCE_DIAGONALS,
  MODULE_PX,
  PHYSICAL_DISTANCE_DIAGONALS,
  ROBUSTNESS_BASE_SEED,
  STREAM,
  SYNTHETIC_DISCLAIMER,
  TABLE_GRAY,
  misidentificationBound95,
  resolveParams,
  trialSeed,
  paramKey,
  type CameraParams,
  type Condition,
  type FlatParams,
  type PhysicalParams,
  type Reflect,
} from './robustness-design';
import { compose, rotationMatrix, translationMatrix } from './warp';
import type { Orientation } from '../fragments';

// ---------------------------------------------------------------------------------------------
// Degradation of a composed scene
// ---------------------------------------------------------------------------------------------

export interface Draws {
  angleDeg: number;
  axisDeg: number;
  lightingDirDeg: number;
  phaseX: number;
  phaseY: number;
}

/** Camera draws of a trial (fixed number of draws whatever the levels): random angle, tilt axis, lighting direction, phase. */
export function cameraDraws(seed: number): Draws {
  const rc = mulberry32(streamSeed(seed, STREAM.camera));
  const rp = mulberry32(streamSeed(seed, STREAM.phase));
  return { angleDeg: rc() * 360, axisDeg: rc() * 360, lightingDirDeg: rc() * 360, phaseX: rp() - 0.5, phaseY: rp() - 0.5 };
}

export interface SceneDegradation {
  camera: CameraParams;
  fragmentModules: number;
  reflect: Reflect;
  /** Footprint rectangles of the markers (category 1 error acts on them). */
  rects: readonly PixelRect[];
  modulePx: number;
  /** Gray value of the area the warp uncovers (white for the flat canvas, the table gray for a board). */
  background: number;
  /** Camera distance of the perspective factor in image diagonals. */
  distanceDiagonals: number;
}

/** Applies fragment error, reflection, perspective + rotation (+ phase jitter), illumination, blur and noise. */
export function degradeScene(img: GrayImage, spec: SceneDegradation, draws: Draws, seed: number): GrayImage {
  const master = streamSeed(seed, STREAM.degrade);
  const c = spec.camera;
  const rotationDeg = c.rotation === 'RANDOM' ? draws.angleDeg : c.rotation;
  const perspective: PerspectiveParams | undefined = c.tiltDeg > 0 ? { tiltDeg: c.tiltDeg, axisDeg: draws.axisDeg, distanceDiagonals: spec.distanceDiagonals } : undefined;
  const fragments = spec.fragmentModules > 0 ? { rects: spec.rects, magnitudeModules: spec.fragmentModules, modulePx: spec.modulePx } : undefined;
  const illumination = c.illumination > 0 ? { strength: c.illumination, directionDeg: draws.lightingDirDeg } : undefined;
  const post = { illumination, blurSigmaPx: c.blurPx, noiseSigma: c.noiseSigma };
  if (c.phase === 'EXACT') {
    return degrade(img, { seed: master, fragments, reflect: spec.reflect, rotationDeg, perspective, background: spec.background, ...post });
  }
  // JITTER: stages 0-1 (fragments, reflection), then ONE homography with the phase translation, then stages 3-5.
  const pre = degrade(img, { seed: master, fragments, reflect: spec.reflect });
  const mats: number[][] = [];
  if (perspective !== undefined) mats.push(perspectiveMatrix(img.width, img.height, perspective));
  mats.push(rotationMatrix(rotationDeg, img.width / 2, img.height / 2));
  mats.push(translationMatrix(draws.phaseX, draws.phaseY));
  const warped = warpHomography(pre, compose(...mats), { background: spec.background });
  return degrade(warped, { seed: master, ...post });
}

// ---------------------------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------------------------

export type TrialClass = 'CORRECT' | 'REJECTED' | 'MISIDENTIFIED';

export interface Scored {
  cls: TrialClass;
  /** Decoder result kind (with the arrangement reason where there is one). */
  kind: string;
  /** Failure cause label (empty for CORRECT). */
  cause: string;
}

/**
 * Judged AFTER decoding with the ground truth. CORRECT: IDENTIFIED with exactly the right card set and sum.
 * REJECTED: any other decoder kind. MISIDENTIFIED: IDENTIFIED with a wrong card set or sum, or IDENTIFIED for an
 * incomplete composition. `tag` is appended to the cause of every non-correct trial.
 */
export function classifyDecode(res: GroupDecodeResult, truthCards: readonly string[], truthSum: number | null, incomplete: boolean, tag = ''): Scored {
  if (res.kind === 'IDENTIFIED') {
    if (incomplete) return { cls: 'MISIDENTIFIED', kind: 'IDENTIFIED', cause: `MISIDENTIFIED/IDENTIFIED_INCOMPLETE_GROUP${tag}` };
    const cards = [...res.cards].sort();
    const sameCards = cards.length === truthCards.length && cards.every((c, i) => c === truthCards[i]);
    if (sameCards && res.hiddenSum === truthSum) return { cls: 'CORRECT', kind: 'IDENTIFIED', cause: '' };
    return { cls: 'MISIDENTIFIED', kind: 'IDENTIFIED', cause: `MISIDENTIFIED/${sameCards ? 'WRONG_SUM' : 'WRONG_CARD_SET'}${tag}` };
  }
  const kind = res.kind === 'INVALID_ARRANGEMENT' ? `INVALID_ARRANGEMENT/${res.reason}` : res.kind;
  return { cls: 'REJECTED', kind, cause: `${kind}${tag}` };
}

// ---------------------------------------------------------------------------------------------
// Flat family
// ---------------------------------------------------------------------------------------------

const CHOICES = slotChoices();

function drawGroup(rng: () => number): Array<{ slot: SlotName; card: string; observed: Orientation }> {
  for (;;) {
    const picked = SLOT_NAMES.map((slot) => {
      const pool = CHOICES[slot];
      const pick = pool[Math.floor(rng() * pool.length)] as { card: string; orientation: Orientation };
      const rank = RANKS[Math.floor(rng() * 13)] as string;
      return { slot, card: `${pick.card.charAt(0)}-${rank}`, observed: pick.orientation };
    });
    if (new Set(picked.map((p) => p.card)).size === 4) return picked;
  }
}

export interface FlatScene {
  image: GrayImage;
  rects: PixelRect[];
  truthCards: string[];
  truthSum: number | null;
}

/** Four distinct cards (one per slot, each with a facing fragment) composed on a flat canvas; one marker erased when incomplete. */
export function buildFlatScene(incomplete: boolean, seed: number): FlatScene {
  const rng = mulberry32(streamSeed(seed, STREAM.cards));
  const picked = drawGroup(rng);
  const absent = SLOT_NAMES[Math.floor(rng() * 4)] as SlotName;
  const arr = {} as Arrangement;
  for (const p of picked) arr[p.slot] = { card: p.card, orientation: p.observed };
  const comp = composeGroup(arr, { modulePx: MODULE_PX, canvasModules: FLAT_CANVAS_MODULES, override: incomplete ? { [absent]: null } : undefined });
  const rects = SLOT_NAMES.map((s) => markerFootprintRect(comp.centers[s].x, comp.centers[s].y, MODULE_PX));
  const cards = picked.map((p) => p.card).sort();
  return { image: comp.image, rects, truthCards: incomplete ? [] : cards, truthSum: incomplete ? null : referenceSum(cards) };
}

// ---------------------------------------------------------------------------------------------
// Physical family
// ---------------------------------------------------------------------------------------------

/** Parameters of the Milestone 5 scenario builder for a physical robustness condition (camera chain left to degrade.ts). */
export function scenarioParams(p: PhysicalParams): CellParams {
  return {
    ...CLEAN_DARK,
    layout: p.layout,
    absentCard: p.incomplete,
    face: p.face,
    radiusMm: p.radiusMm,
    insetModules: p.insetModules,
    tableGray: TABLE_GRAY,
    shiftMm: p.placementShiftMm,
    rotationDeg: p.placementRotDeg,
    gapMm: p.gapMm,
    regShiftMm: p.regShiftMm,
    regRotDeg: p.regRotDeg,
    cutOffsetMm: p.cutOffsetMm,
  };
}

/**
 * Footprint rectangles of every marker slot of every present card at its NOMINAL position (card pitch, no placement
 * or duplex error). Fragment position error is only applied with zero placement and duplex error, where the nominal
 * position is the true one.
 */
export function nominalMarkerRects(sc: Scenario, g: PhysicalGeometry, raster: BoardRaster): PixelRect[] {
  const off = (g.insetModules + g.quietMarginModules + CORE_MOD / 2) * g.moduleMm;
  const modulePx = g.moduleMm * raster.pxPerMm;
  const out: PixelRect[] = [];
  for (let i = 0; i < sc.rows; i++) {
    for (let j = 0; j < sc.cols; j++) {
      if ((sc.cells[i] as Array<unknown>)[j] === null) continue;
      for (const [cx, cy] of [[off, off], [g.cardWidthMm - off, off], [off, g.cardHeightMm - off], [g.cardWidthMm - off, g.cardHeightMm - off]] as const) {
        const p = boardMmToPixel(raster, j * (g.cardWidthMm + g.gapMm) + cx, i * (g.cardHeightMm + g.gapMm) + cy);
        out.push(markerFootprintRect(p.x, p.y, modulePx));
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Trial
// ---------------------------------------------------------------------------------------------

export interface TrialRecord extends Scored {
  trial: number;
  seed: number;
  /** For MIX conditions: the canonical parameter key of the drawn parameters. */
  drawn?: string;
}

export interface TrialTimings {
  sceneMs: number;
  degradeMs: number;
  decodeMs: number;
  totalMs: number;
}

export interface TrialOutput {
  record: TrialRecord;
  params: FlatParams | PhysicalParams;
  timings?: TrialTimings;
  /** Image given to the decoder (only when requested). */
  image?: GrayImage;
}

/** One complete trial: a pure function of (condition, trial index). */
export function runTrial(cond: Condition, trial: number, opts: { timings?: boolean; keepImage?: boolean } = {}): TrialOutput {
  const clock = (): number => performance.now();
  const T0 = clock();
  const seed = trialSeed(cond.id, trial);
  const params = resolveParams(cond, seed);
  const draws = cameraDraws(seed);
  let image: GrayImage;
  let res: GroupDecodeResult;
  let scored: Scored;
  let T1: number;
  let T2: number;
  if (cond.family === 'FLAT') {
    const p = params as FlatParams;
    const scene = buildFlatScene(p.incomplete, seed);
    T1 = clock();
    image = degradeScene(scene.image, { camera: p, fragmentModules: p.fragmentModules, reflect: p.reflect, rects: scene.rects, modulePx: MODULE_PX, background: FLAT_BACKGROUND, distanceDiagonals: FLAT_DISTANCE_DIAGONALS }, draws, seed);
    T2 = clock();
    res = decodeGroup(image);
    scored = classifyDecode(res, scene.truthCards, scene.truthSum, p.incomplete);
  } else {
    const p = params as PhysicalParams;
    const cell = scenarioParams(p);
    const g = geometryOf(cell);
    const sc = buildScenario(cell, seed);
    const raster = renderScenario(sc, g);
    T1 = clock();
    const rects = p.fragmentModules > 0 ? nominalMarkerRects(sc, g, raster) : [];
    image = degradeScene(raster.image, { camera: p, fragmentModules: p.fragmentModules, reflect: 'none', rects, modulePx: g.moduleMm * raster.pxPerMm, background: TABLE_GRAY, distanceDiagonals: PHYSICAL_DISTANCE_DIAGONALS }, draws, seed);
    T2 = clock();
    res = decodeScenarioImage(image, cell, g);
    scored = classifyDecode(res, sc.truthCards, sc.truthSum, p.incomplete);
    if (scored.cls !== 'CORRECT' && focusFootprintsClipped(sc, g)) {
      scored = { ...scored, cause: `${scored.cause}|containment-not-guaranteed` };
    }
  }
  const T3 = clock();
  const record: TrialRecord = { trial, seed, ...scored };
  if (cond.mix) record.drawn = paramKey(cond.family, params, false);
  const out: TrialOutput = { record, params };
  if (opts.timings) out.timings = { sceneMs: T1 - T0, degradeMs: T2 - T1, decodeMs: T3 - T2, totalMs: T3 - T0 };
  if (opts.keepImage) out.image = image;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Per-condition statistics (never pooled across conditions)
// ---------------------------------------------------------------------------------------------

export const MAX_RECORDED_REJECTED_SEEDS = 10;

export interface ConditionResult {
  id: string;
  family: Condition['family'];
  group: string;
  label: string;
  paramKey: string;
  params: FlatParams | PhysicalParams;
  mix: boolean;
  /** 'IDENTIFY': a complete group is present. 'REJECT': incomplete composition; any IDENTIFIED result is a misidentification. */
  expectation: 'IDENTIFY' | 'REJECT';
  n: number;
  correct: number;
  correctRate: number;
  rejected: number;
  rejectedRate: number;
  rejectionKinds: Record<string, number>;
  misidentified: number;
  misidentifiedRate: number;
  /** 1 - 0.05^(1/n) when `misidentified` is 0, otherwise null (the failing seeds are recorded instead). */
  misidentificationUpperBound95: number | null;
  /** Every misidentified trial: reproduce with `--repro --cell <id> --trial <trial>`. */
  misidentifiedTrials: Array<{ trial: number; seed: number; cause: string; drawn?: string }>;
  /** First non-expected rejected trials (diagnostics only). */
  rejectedSample: Array<{ trial: number; seed: number; kind: string; drawn?: string }>;
  failureCauses: Record<string, number>;
  baseSeed: number;
  disclaimer: string;
  /** True for a run that was cut short with --max-trials (never part of the real result set). */
  smokeRun?: boolean;
}

const bump = (m: Record<string, number>, k: string): void => {
  m[k] = (m[k] ?? 0) + 1;
};
const sortedRecord = (m: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(m).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

export function summarizeCondition(cond: Condition, records: readonly TrialRecord[]): ConditionResult {
  const n = records.length;
  if (n === 0) throw new RangeError('a condition needs at least one trial');
  const incomplete = cond.params.incomplete;
  let correct = 0;
  let rejected = 0;
  const kinds: Record<string, number> = {};
  const causes: Record<string, number> = {};
  const mis: ConditionResult['misidentifiedTrials'] = [];
  const rejSample: ConditionResult['rejectedSample'] = [];
  for (const r of records) {
    if (r.cls === 'CORRECT') correct++;
    else if (r.cls === 'REJECTED') {
      rejected++;
      bump(kinds, r.kind);
      if (!incomplete) {
        bump(causes, r.cause);
        if (rejSample.length < MAX_RECORDED_REJECTED_SEEDS) rejSample.push({ trial: r.trial, seed: r.seed, kind: r.kind, ...(r.drawn === undefined ? {} : { drawn: r.drawn }) });
      }
    } else {
      bump(causes, r.cause);
      mis.push({ trial: r.trial, seed: r.seed, cause: r.cause, ...(r.drawn === undefined ? {} : { drawn: r.drawn }) });
    }
  }
  return {
    id: cond.id,
    family: cond.family,
    group: cond.group,
    label: cond.label,
    paramKey: cond.paramKey,
    params: cond.params,
    mix: cond.mix,
    expectation: incomplete ? 'REJECT' : 'IDENTIFY',
    n,
    correct,
    correctRate: correct / n,
    rejected,
    rejectedRate: rejected / n,
    rejectionKinds: sortedRecord(kinds),
    misidentified: mis.length,
    misidentifiedRate: mis.length / n,
    misidentificationUpperBound95: misidentificationBound95(n, mis.length),
    misidentifiedTrials: mis,
    rejectedSample: rejSample,
    failureCauses: sortedRecord(causes),
    baseSeed: ROBUSTNESS_BASE_SEED,
    disclaimer: SYNTHETIC_DISCLAIMER,
  };
}

/** Runs trials 0..n-1 of one condition (n defaults to the planned number). */
export function runCondition(cond: Condition, maxTrials: number | null = null): ConditionResult {
  const n = maxTrials === null ? cond.trials : Math.min(cond.trials, maxTrials);
  const records: TrialRecord[] = [];
  for (let i = 0; i < n; i++) records.push(runTrial(cond, i).record);
  const result = summarizeCondition(cond, records);
  return maxTrials === null ? result : { ...result, smokeRun: true };
}
