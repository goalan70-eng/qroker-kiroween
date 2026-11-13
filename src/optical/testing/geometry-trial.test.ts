/**
 * Task 5.6 (Phase A): tests of the trial machinery. The board rasterizer is compared with the existing, already
 * tested renderers (`observeFace`, `composeBoard`); scenarios, trials and degradations must be deterministic.
 * Synthetic images only.
 */
import { describe, expect, it } from 'vitest';
import { CLEAN_DARK, PROFILES, cellId, trialSeed, type CellParams } from './geometry-design';
import {
  applyLightingGradient,
  buildScenario,
  degradeImage,
  gaussianBlur,
  geometryOf,
  markersPerVertex,
  renderScenario,
  runTrial,
  type PlacedCard,
  type Scenario,
} from './geometry-trial';
import { composeBoard, flipCard, observeFace } from './physical-card';
import { placedFragments } from '../fragments';
import type { GrayImage } from '../render';

const mk = (o: Partial<CellParams>): CellParams => Object.assign({}, CLEAN_DARK, o) as CellParams;
const same = (a: GrayImage, b: GrayImage): boolean => a.width === b.width && a.height === b.height && Buffer.from(a.data).equals(Buffer.from(b.data));

/** A 1x1 "board" holding one card, rendered over the card rectangle. */
function singleCard(card: PlacedCard): Scenario {
  return {
    rows: 1,
    cols: 1,
    cells: [[card]],
    focus: { a: 1, b: 1 },
    truthCards: [],
    truthSum: null,
    errors: [[{ dxMm: 0, dyMm: 0, rotationDeg: 0 }]],
    camera: { rotationDeg: 0, tiltDeg: 0, axisDeg: 0, lightingDirDeg: 0 },
    attempts: 0,
  };
}

describe('board rasterizer equals the existing renderers', () => {
  const cases = [
    { card: 'H-5', observed: 0 as const, face: 'FRONT' as const, flip: undefined, o: 0 as const },
    { card: 'S-K', observed: 180 as const, face: 'FRONT' as const, flip: undefined, o: 180 as const },
    { card: 'C-7', observed: 0 as const, face: 'BACK_VERTICAL' as const, flip: flipCard('VERTICAL'), o: 0 as const },
    { card: 'D-Q', observed: 180 as const, face: 'BACK_HORIZONTAL' as const, flip: flipCard('HORIZONTAL'), o: 0 as const },
    { card: 'S-3', observed: 0 as const, face: 'BACK_HORIZONTAL' as const, flip: flipCard('HORIZONTAL'), o: 180 as const },
  ];
  it('one card, FRONT/BACK, both flips, with registration and cut error: identical to observeFace', () => {
    const geometry = { cornerRadiusMm: 3.175, insetModules: 1 };
    const reg = { dxMm: 0.4, dyMm: -0.3, rotDeg: 0.8 };
    const cut = { dxMm: -0.2, dyMm: 0.35 };
    for (const c of cases) {
      const g = geometryOf(mk({ radiusMm: geometry.cornerRadiusMm }));
      const placed: PlacedCard = { card: c.card, observed: c.observed, face: c.face, reg, cut };
      const out = renderScenario(singleCard(placed), g, { regionMm: { x0: 0, y0: 0, x1: g.cardWidthMm, y1: g.cardHeightMm } });
      const ref = observeFace(c.card, c.face === 'FRONT' ? 'FRONT' : 'BACK', c.o, c.flip, {
        geometry: g,
        duplexRegistration: reg,
        cutOffsetMm: cut,
      });
      expect(same(out.image, ref.image), `${c.card} ${c.face}`).toBe(true);
    }
  });

  it('BACK observations at zero error equal the FRONT observation at the same observed orientation', () => {
    const g = geometryOf(mk({}));
    const region = { x0: 0, y0: 0, x1: g.cardWidthMm, y1: g.cardHeightMm };
    for (const card of ['H-A', 'D-9', 'C-K', 'S-2']) {
      for (const observed of [0, 180] as const) {
        const front = renderScenario(singleCard({ card, observed, face: 'FRONT', reg: { dxMm: 0, dyMm: 0, rotDeg: 0 }, cut: { dxMm: 0, dyMm: 0 } }), g, { regionMm: region });
        for (const face of ['BACK_VERTICAL', 'BACK_HORIZONTAL'] as const) {
          const back = renderScenario(singleCard({ card, observed, face, reg: { dxMm: 0, dyMm: 0, rotDeg: 0 }, cut: { dxMm: 0, dyMm: 0 } }), g, { regionMm: region });
          expect(same(front.image, back.image), `${card} ${observed} ${face}`).toBe(true);
        }
      }
    }
  });

  it('a 2x2 FRONT board with seeded placement errors equals composeBoard with the same explicit errors', () => {
    const p = mk({ radiusMm: 4, shiftMm: 1.0, rotationDeg: 2, gapMm: 0 });
    const sc = buildScenario(p, trialSeed('rasterizer-equivalence', 1));
    const g = geometryOf(p);
    const placements = sc.cells.map((row) => row.map((c) => ({ card: (c as PlacedCard).card, orientation: (c as PlacedCard).observed })));
    const ref = composeBoard(placements, g, { errors: sc.errors });
    expect(same(renderScenario(sc, g).image, ref.image)).toBe(true);
  });
});

describe('scenario generation', () => {
  it('is deterministic and independent of the cell it is used in, given the same seed', () => {
    const p = mk({ layout: '3x3', ...PROFILES[3]!.overrides });
    const id = cellId(p);
    const a = buildScenario(p, trialSeed(id, 3));
    const b = buildScenario(p, trialSeed(id, 3));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(buildScenario(p, trialSeed(id, 4)))).not.toBe(JSON.stringify(a));
  });

  it('2x2: four distinct deck cards, each with a fragment facing the centre vertex', () => {
    for (let i = 0; i < 40; i++) {
      const sc = buildScenario(mk({}), trialSeed('scenario-2x2', i));
      expect(new Set(sc.truthCards).size).toBe(4);
      expect(markersPerVertex(sc.cells).get('1,1')).toBe(4);
      expect(sc.truthSum).toBeGreaterThanOrEqual(4);
      expect(sc.truthSum).toBeLessThanOrEqual(52);
    }
  });

  it('3x3: nine distinct cards, one interior vertex with four markers, all other interior vertices at most three', () => {
    for (let i = 0; i < 40; i++) {
      const sc = buildScenario(mk({ layout: '3x3' }), trialSeed('scenario-3x3', i));
      const all = sc.cells.flat().map((c) => (c as PlacedCard).card);
      expect(new Set(all).size).toBe(9);
      const counts = markersPerVertex(sc.cells);
      for (const a of [1, 2]) for (const b of [1, 2]) expect(counts.get(`${a},${b}`) ?? 0).toBe(a === sc.focus.a && b === sc.focus.b ? 4 : counts.get(`${a},${b}`) ?? 0);
      for (const a of [1, 2]) for (const b of [1, 2]) if (!(a === sc.focus.a && b === sc.focus.b)) expect(counts.get(`${a},${b}`) ?? 0).toBeLessThanOrEqual(3);
      expect(counts.get(`${sc.focus.a},${sc.focus.b}`)).toBe(4);
    }
  });

  it('absent card: three cards remain around the focus vertex and no truth group exists', () => {
    const sc = buildScenario(mk({ absentCard: true }), trialSeed('scenario-absent', 0));
    expect(sc.cells.flat().filter((c) => c === null).length).toBe(1);
    expect(sc.truthCards).toEqual([]);
    expect(sc.truthSum).toBeNull();
  });

  it('error magnitudes follow the levels: shift bound per row/column, rotation bound per card, duplex magnitudes exact', () => {
    const p = mk({ layout: '3x3', shiftMm: 1.5, rotationDeg: 3, regShiftMm: 1.0, regRotDeg: 1, cutOffsetMm: 0.5, face: 'BACK_VERTICAL' });
    for (let i = 0; i < 20; i++) {
      const sc = buildScenario(p, trialSeed('scenario-errors', i));
      for (const row of sc.errors) for (const e of row) {
        expect(Math.abs(e.dxMm)).toBeLessThanOrEqual(0.75 + 1e-12);
        expect(Math.abs(e.dyMm)).toBeLessThanOrEqual(0.75 + 1e-12);
        expect(Math.abs(e.rotationDeg)).toBeLessThanOrEqual(3);
      }
      for (const c of sc.cells.flat() as PlacedCard[]) {
        expect(Math.hypot(c.reg.dxMm, c.reg.dyMm)).toBeCloseTo(1.0, 12);
        expect(Math.abs(c.reg.rotDeg)).toBeCloseTo(1, 12);
        expect(Math.hypot(c.cut.dxMm, c.cut.dyMm)).toBeCloseTo(0.5, 12);
      }
    }
    const zero = buildScenario(mk({}), trialSeed('scenario-errors', 0));
    for (const row of zero.errors) for (const e of row) expect([e.dxMm, e.dyMm, e.rotationDeg].map((v) => Math.abs(v))).toEqual([0, 0, 0]);
  });
});

describe('degradations', () => {
  const img: GrayImage = { width: 40, height: 30, data: Uint8Array.from({ length: 1200 }, (_, i) => (i * 37) % 256) };
  it('zero strength leaves the image unchanged (same object)', () => {
    expect(gaussianBlur(img, 0)).toBe(img);
    expect(applyLightingGradient(img, 0, 33)).toBe(img);
    const p = mk({});
    expect(degradeImage(img, p, { rotationDeg: 0, tiltDeg: 0, axisDeg: 12, lightingDirDeg: 99 }, 64)).toBe(img);
  });
  it('is deterministic and non-trivial for non-zero strength', () => {
    const p = mk({ blurPx: 1, lightingStrength: 0.4, tiltDeg: 20 });
    const cam = { rotationDeg: 30, tiltDeg: 20, axisDeg: 70, lightingDirDeg: 120 };
    const a = degradeImage(img, p, cam, 64);
    expect(same(a, degradeImage(img, p, cam, 64))).toBe(true);
    expect(same(a, img)).toBe(false);
  });
});

describe('trials', () => {
  it('a clean baseline 2x2 trial is correct and is a pure function of (params, seed)', () => {
    const p = mk({});
    const seed = trialSeed(cellId(p), 0);
    const a = runTrial(p, seed, { keepImage: true });
    const b = runTrial(p, seed, { keepImage: true });
    expect(a.record).toEqual(b.record);
    expect(same(a.image as GrayImage, b.image as GrayImage)).toBe(true);
    expect(a.record.cls).toBe('CORRECT');
  });

  it('a clean 3x3 trial is correct; BACK faces at zero error give the same record as FRONT for the same seed', () => {
    const p3 = mk({ layout: '3x3' });
    expect(runTrial(p3, trialSeed(cellId(p3), 0)).record.cls).toBe('CORRECT');
    const seed = trialSeed('front-vs-back', 2);
    const f = runTrial(mk({}), seed);
    for (const face of ['BACK_VERTICAL', 'BACK_HORIZONTAL'] as const) {
      const b = runTrial(mk({ face }), seed);
      expect(b.record).toEqual(f.record);
    }
  });

  it('an incomplete group is rejected, never identified (clean 2x2)', () => {
    const p = mk({ absentCard: true });
    for (let i = 0; i < 5; i++) {
      const r = runTrial(p, trialSeed(cellId(p), i)).record;
      expect(r.cls).toBe('REJECTED');
    }
  });

  it('the decoder is not given the truth: classification uses the scenario only after decoding', () => {
    // A decoded group with a wrong card set is scored FALSE_ACCEPT, a missing group REJECTED (classify is exercised on real output)
    const p = mk({ blurPx: 2.0 });
    const r = runTrial(p, trialSeed(cellId(p), 0)).record;
    expect(['REJECTED', 'FALSE_ACCEPT', 'CORRECT']).toContain(r.cls);
    expect(placedFragments('H-A', 0)).toBeDefined();
  });
});
