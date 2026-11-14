/**
 * Task 7.2 (phase A): tests of the robustness trial (scene, degradation with sub-pixel phase jitter, scoring,
 * reproducibility). Synthetic images only; nothing here says anything about real cameras.
 */
import { describe, expect, it } from 'vitest';
import type { GroupDecodeResult } from '../decode-group';
import { degrade } from '../degrade';
import { classify as geometryClassify, type Scenario } from './geometry-trial';
import { CLEAN_DARK, type CellParams } from './geometry-design';
import {
  FLAT_BACKGROUND,
  FLAT_DISTANCE_DIAGONALS,
  MODULE_PX,
  STREAM,
  SYNTHETIC_DISCLAIMER,
  conditionById,
  streamSeed,
  trialSeed,
  type Condition,
  type FlatParams,
  type PhysicalParams,
} from './robustness-design';
import {
  buildFlatScene,
  cameraDraws,
  classifyDecode,
  degradeScene,
  nominalMarkerRects,
  runCondition,
  runTrial,
  scenarioParams,
  summarizeCondition,
  type SceneDegradation,
  type TrialRecord,
} from './robustness-trial';
import { geometryOf, buildScenario, renderScenario } from './geometry-trial';

const cond = (id: string): Condition => {
  const c = conditionById(id);
  if (c === undefined) throw new Error(id);
  return c;
};

const LONG = 60_000;

describe('classification', () => {
  const identified = (cards: string[], sum: number): GroupDecodeResult => ({ kind: 'IDENTIFIED', cards, hiddenSum: sum } as unknown as GroupDecodeResult);
  const truth = ['C-3', 'D-7', 'H-A', 'S-K'];

  it('judges CORRECT only for the exact card set and sum', () => {
    expect(classifyDecode(identified([...truth], 24), truth, 24, false).cls).toBe('CORRECT');
    expect(classifyDecode(identified([...truth].reverse(), 24), truth, 24, false).cls).toBe('CORRECT');
  });

  it('counts a wrong card set, a wrong sum and an IDENTIFIED incomplete group as MISIDENTIFIED', () => {
    expect(classifyDecode(identified(['C-3', 'D-7', 'H-A', 'S-Q'], 24), truth, 24, false)).toMatchObject({ cls: 'MISIDENTIFIED', cause: 'MISIDENTIFIED/WRONG_CARD_SET' });
    expect(classifyDecode(identified([...truth], 25), truth, 24, false)).toMatchObject({ cls: 'MISIDENTIFIED', cause: 'MISIDENTIFIED/WRONG_SUM' });
    expect(classifyDecode(identified([...truth], 24), [], null, true)).toMatchObject({ cls: 'MISIDENTIFIED', cause: 'MISIDENTIFIED/IDENTIFIED_INCOMPLETE_GROUP' });
  });

  it('counts every other decoder kind as REJECTED, with the kind', () => {
    expect(classifyDecode({ kind: 'INCOMPLETE_GROUP', detected: 3, markers: 3 }, truth, 24, false)).toEqual({ cls: 'REJECTED', kind: 'INCOMPLETE_GROUP', cause: 'INCOMPLETE_GROUP' });
    expect(classifyDecode({ kind: 'INVALID_ARRANGEMENT', reason: 'NO_CONSISTENT_HYPOTHESIS' } as unknown as GroupDecodeResult, truth, 24, false).kind).toBe('INVALID_ARRANGEMENT/NO_CONSISTENT_HYPOTHESIS');
  });

  it('agrees with the classify of the Milestone 5 geometry trial on the same decoder results', () => {
    const p: CellParams = { ...CLEAN_DARK };
    const sc = { truthCards: truth, truthSum: 24 } as unknown as Scenario;
    const results: GroupDecodeResult[] = [identified([...truth], 24), identified([...truth], 25), identified(['C-3', 'D-7', 'H-A', 'S-Q'], 24), { kind: 'NOT_DETECTED' }];
    for (const res of results) {
      const a = classifyDecode(res, truth, 24, false);
      const b = geometryClassify(res, sc, p, false);
      expect({ cls: a.cls === 'MISIDENTIFIED' ? 'FALSE_ACCEPT' : a.cls, kind: a.kind, cause: a.cause.replace('MISIDENTIFIED', 'FALSE_ACCEPT') }).toEqual(b);
    }
    const inc = geometryClassify(identified([...truth], 24), { truthCards: [], truthSum: null } as unknown as Scenario, { ...p, absentCard: true }, false);
    expect(inc.cls).toBe('FALSE_ACCEPT');
    expect(classifyDecode(identified([...truth], 24), [], null, true).cls).toBe('MISIDENTIFIED');
  });
});

describe('degradation of a flat scene', () => {
  const scene = buildFlatScene(false, 777);
  const draws = cameraDraws(777);
  const full: SceneDegradation = {
    camera: { rotation: 33, phase: 'EXACT', tiltDeg: 20, blurPx: 0.5, noiseSigma: 5, illumination: 0.4 },
    fragmentModules: 0.25,
    reflect: 'Fh',
    rects: scene.rects,
    modulePx: MODULE_PX,
    background: FLAT_BACKGROUND,
    distanceDiagonals: FLAT_DISTANCE_DIAGONALS,
  };

  it('with a zero phase translation the jitter path is byte-identical to degrade of degrade.ts', () => {
    const direct = degradeScene(scene.image, full, draws, 777);
    const zero = degradeScene(scene.image, { ...full, camera: { ...full.camera, phase: 'JITTER' } }, { ...draws, phaseX: 0, phaseY: 0 }, 777);
    expect(Buffer.from(zero.data).equals(Buffer.from(direct.data))).toBe(true);
    // and the direct path really is degrade() of degrade.ts with the documented parameters
    const viaDegrade = degrade(scene.image, {
      seed: streamSeed(777, STREAM.degrade),
      fragments: { rects: scene.rects, magnitudeModules: 0.25, modulePx: MODULE_PX },
      reflect: 'Fh',
      rotationDeg: 33,
      perspective: { tiltDeg: 20, axisDeg: draws.axisDeg, distanceDiagonals: FLAT_DISTANCE_DIAGONALS },
      background: FLAT_BACKGROUND,
      illumination: { strength: 0.4, directionDeg: draws.lightingDirDeg },
      blurSigmaPx: 0.5,
      noiseSigma: 5,
    });
    expect(Buffer.from(viaDegrade.data).equals(Buffer.from(direct.data))).toBe(true);
  });

  it('a non-zero phase translation changes the image, deterministically', () => {
    const j = { ...full, camera: { ...full.camera, phase: 'JITTER' as const } };
    const a = degradeScene(scene.image, j, draws, 777);
    const b = degradeScene(scene.image, j, draws, 777);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
    const direct = degradeScene(scene.image, full, draws, 777);
    expect(Buffer.from(a.data).equals(Buffer.from(direct.data))).toBe(false);
  });

  it('fragment position error changes pixels only inside the marker footprint rectangles', () => {
    const base: SceneDegradation = { ...full, camera: { rotation: 0, phase: 'EXACT', tiltDeg: 0, blurPx: 0, noiseSigma: 0, illumination: 0 }, reflect: 'none', fragmentModules: 0 };
    const none = degradeScene(scene.image, base, draws, 777);
    expect(Buffer.from(none.data).equals(Buffer.from(scene.image.data))).toBe(true);
    const shifted = degradeScene(scene.image, { ...base, fragmentModules: 0.25 }, draws, 777);
    let changed = 0;
    for (let y = 0; y < shifted.height; y++) {
      for (let x = 0; x < shifted.width; x++) {
        if (shifted.data[y * shifted.width + x] === scene.image.data[y * shifted.width + x]) continue;
        changed++;
        expect(scene.rects.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1), `pixel ${x},${y}`).toBe(true);
      }
    }
    expect(changed).toBeGreaterThan(0);
  });

  it('draws are deterministic and independent of the levels', () => {
    expect(cameraDraws(5)).toEqual(cameraDraws(5));
    expect(cameraDraws(5)).not.toEqual(cameraDraws(6));
    const d = cameraDraws(123456);
    expect(Math.abs(d.phaseX)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(d.phaseY)).toBeLessThanOrEqual(0.5);
  });
});

describe('flat trials', () => {
  it('are reproducible: the same (condition, trial) gives the same record', () => {
    const c = cond('A-PROF-MODERATE-N');
    for (const i of [0, 1, 17]) {
      const a = runTrial(c, i);
      const b = runTrial(c, i);
      expect(a.record).toEqual(b.record);
      expect(a.record.seed).toBe(trialSeed(c.id, i));
    }
  });

  it('identify the clean group correctly and reject an incomplete group', () => {
    for (let i = 0; i < 5; i++) {
      expect(runTrial(cond('A-CLEAN'), i).record.cls).toBe('CORRECT');
      expect(runTrial(cond('A-INC-CLEAN'), i).record).toMatchObject({ cls: 'REJECTED', kind: 'INCOMPLETE_GROUP' });
    }
  });

  it('record the drawn parameters of a mix trial and return the image on request', () => {
    const o = runTrial(cond('A-MIX'), 2, { keepImage: true });
    expect(o.record.drawn).toContain('FLAT|');
    expect(o.image?.width).toBe(128);
    expect(runTrial(cond('A-CLEAN'), 2).record.drawn).toBeUndefined();
  });
});

describe('physical trials', () => {
  it('identify a clean 2x2 board on every face and reject an incomplete 3x3 board', { timeout: LONG }, () => {
    for (const id of ['P-BOARD-2x2-C-F', 'P-BOARD-2x2-C-BV', 'P-BOARD-2x2-C-BH']) expect(runTrial(cond(id), 0).record.cls, id).toBe('CORRECT');
    expect(runTrial(cond('P-BOARD-3x3-I-F'), 0).record).toMatchObject({ cls: 'REJECTED', kind: 'INCOMPLETE_GROUP' });
  });

  it('are reproducible, also with camera degradation and fragment position error', { timeout: LONG }, () => {
    for (const id of ['P-CAM-2x2-C-F-FRAG-0.25', 'P-ALIGN-MILD-2x2-C-BV']) {
      const a = runTrial(cond(id), 1);
      expect(runTrial(cond(id), 1).record).toEqual(a.record);
    }
  });

  it('derive the fragment footprints of every present card from the layout, inside the image', () => {
    const c = cond('P-CAM-2x2-C-F-FRAG-0.1');
    const p = c.params as PhysicalParams;
    const cell = scenarioParams(p);
    const g = geometryOf(cell);
    const sc = buildScenario(cell, 5);
    const raster = renderScenario(sc, g);
    const rects = nominalMarkerRects(sc, g, raster);
    expect(rects.length).toBe(16);
    for (const r of rects) {
      expect(r.x0).toBeGreaterThanOrEqual(0);
      expect(r.y0).toBeGreaterThanOrEqual(0);
      expect(r.x1).toBeLessThanOrEqual(raster.image.width);
      expect(r.y1).toBeLessThanOrEqual(raster.image.height);
      expect(r.x1 - r.x0).toBe(36);
    }
  });

  it('give the Milestone 5 scenario builder no camera setting (the camera chain is degrade.ts)', () => {
    const cell = scenarioParams(cond('P-ALIGN-MAX-2x2-C-BH').params as PhysicalParams);
    expect(cell).toMatchObject({ cameraRotation: 'NONE', tiltDeg: 0, blurPx: 0, lightingStrength: 0, decoderLayout: 'MATCHED', face: 'BACK_HORIZONTAL', regShiftMm: 1, cutOffsetMm: 1 });
  });
});

describe('per-condition statistics', () => {
  const rec = (trial: number, cls: TrialRecord['cls'], kind = 'IDENTIFIED', cause = ''): TrialRecord => ({ trial, seed: trial + 100, cls, kind, cause });
  const c = cond('A-CLEAN');

  it('counts correct, rejected and misidentified trials per condition and records the bound only for a zero count', () => {
    const records = [rec(0, 'CORRECT'), rec(1, 'CORRECT'), rec(2, 'REJECTED', 'INCOMPLETE_GROUP', 'INCOMPLETE_GROUP'), rec(3, 'CORRECT')];
    const r = summarizeCondition(c, records);
    expect(r).toMatchObject({ n: 4, correct: 3, correctRate: 0.75, rejected: 1, rejectedRate: 0.25, misidentified: 0, misidentifiedRate: 0, expectation: 'IDENTIFY' });
    expect(r.misidentificationUpperBound95).toBe(1 - Math.pow(0.05, 1 / 4));
    expect(r.rejectionKinds).toEqual({ INCOMPLETE_GROUP: 1 });
    expect(r.rejectedSample).toEqual([{ trial: 2, seed: 102, kind: 'INCOMPLETE_GROUP' }]);
    expect(r.disclaimer).toBe(SYNTHETIC_DISCLAIMER);
  });

  it('records the failing trials and seeds and no bound when there is a misidentification', () => {
    const r = summarizeCondition(c, [rec(0, 'CORRECT'), rec(1, 'MISIDENTIFIED', 'IDENTIFIED', 'MISIDENTIFIED/WRONG_SUM')]);
    expect(r.misidentified).toBe(1);
    expect(r.misidentificationUpperBound95).toBeNull();
    expect(r.misidentifiedTrials).toEqual([{ trial: 1, seed: 101, cause: 'MISIDENTIFIED/WRONG_SUM' }]);
  });

  it('treats rejections of an incomplete group as the expected outcome (no diagnostic sample)', () => {
    const r = summarizeCondition(cond('A-INC-CLEAN'), [rec(0, 'REJECTED', 'INCOMPLETE_GROUP', 'INCOMPLETE_GROUP')]);
    expect(r).toMatchObject({ expectation: 'REJECT', rejected: 1, correct: 0 });
    expect(r.rejectedSample).toEqual([]);
  });

  it('marks a run cut short with maxTrials as a smoke run', () => {
    const r = runCondition(c, 3);
    expect(r).toMatchObject({ n: 3, smokeRun: true, id: 'A-CLEAN' });
  });
});
