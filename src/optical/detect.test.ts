/**
 * Detection tests on ACTUAL generated rasters (SYNTHETIC images, not real cameras).
 * Conditions live in testing/detect-conditions.ts and are shared with scripts/measure-detection.ts.
 * Thresholds below were MEASURED (see docs/optical/results/m4-1-detection.md), not chosen a priori.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { detectMarkers } from './detect';
import { renderMarker, type GrayImage } from './render';
import * as C from './testing/detect-conditions';
import { blankImage, pasteImage, rotationMatrix, warpImage } from './testing/warp';
import { applyTransform } from './transforms';

describe('1. clean valid markers', () => {
  it('all 52 base patterns at modulePx 4 on a larger canvas: exact bits, size 28, rotation 0', () => {
    const fam = C.cleanBase(4);
    expect(fam.failures).toEqual([]);
    expect(fam.total).toBe(52);
    expect(fam.exact).toBe(52);
    expect(fam.extra['maxSizeErrPx']).toBeLessThanOrEqual(0.5);
    expect(fam.extra['maxAbsRotationDeg']).toBeLessThanOrEqual(1);
    expect(fam.extra['minBorderDarkness']).toBeGreaterThanOrEqual(0.95);
  });

  it('all 52 x 8 D4-transformed renders are read faithfully (bits = applyTransform(g, P))', () => {
    const fam = C.cleanD4(4);
    expect(fam.failures).toEqual([]);
    expect(fam.total).toBe(416);
    expect(fam.exact).toBe(416);
  });
});

describe('2. card layers and contact sheet', () => {
  it('52 cards x orientation 0/180: two markers with the placed bits at the slot centres (+-1 px)', () => {
    const fam = C.cardLayers(4);
    expect(fam.failures).toEqual([]);
    expect(fam.total).toBe(104);
    expect(fam.exact).toBe(104);
    expect(fam.extra['markersLocatedWithExactBits']).toBe(208);
  });

  it('contact sheet (52 cards, modulePx 2): 104 markers found with expected bits and locations', () => {
    const fam = C.contactSheet(2);
    expect(fam.failures).toEqual([]);
    expect(fam.extra['markersLocatedWithExactBits']).toBe(104);
    expect(fam.extra['unexpectedExtraMarkers']).toBe(0);
    expect(fam.exact).toBe(1);
  });
});

describe('3. blank and negative images', () => {
  const neg = C.negatives();
  it('never reports DETECTED for blank, noise, gradient, bar or disk images (false positives: 0)', () => {
    expect(neg.fam.failures).toEqual([]);
    expect(neg.fam.total).toBe(320);
    expect(neg.fam.detected).toBe(0);
    for (const row of neg.rows) expect(row.detected, row.name).toBe(0);
  });

  it('blank, disk, bar, gradient and tiny images are NOT_DETECTED, not INVALID_MARKER', () => {
    for (const row of neg.rows) {
      expect(row.invalidMarker, row.name).toBe(0);
      expect(row.notDetected, row.name).toBe(row.total);
    }
  });

  it('a solid black 7x7 square with a white margin is DETECTED with all-ones data (decided behaviour)', () => {
    // Structurally a valid ring with 25 black data cells. The detector has no template knowledge;
    // task 4.2 rejects the all-ones pattern because codebook patterns have 9..16 black cells.
    expect(neg.solidSquare.bits).toBe(0x1ffffff);
  });
});

describe('4. positions', () => {
  it('300 seeded placements (modulePx 3..12, integer and sub-pixel) are all DETECTED with exact bits', () => {
    const fam = C.positions(300, C.SEED);
    expect(fam.failures).toEqual([]);
    expect(fam.total).toBe(300);
    expect(fam.exact).toBe(300);
    expect(fam.extra['maxCenterErrPx']).toBeLessThanOrEqual(1);
  });

  it('property: any 25-bit pattern at any integer position and module size is read back exactly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: (1 << 25) - 1 }),
        fc.integer({ min: 3, max: 10 }),
        fc.integer({ min: 8, max: 40 }),
        fc.integer({ min: 8, max: 40 }),
        (pattern, m, x, y) => {
          const canvas = blankImage(9 * m + 90, 9 * m + 90);
          pasteImage(canvas, renderMarker(pattern, m), x, y);
          const res = detectMarkers(canvas);
          return res.kind === 'DETECTED' && res.markers.length === 1 && res.markers[0]!.bits === pattern;
        },
      ),
      { seed: 20251112, numRuns: 200 },
    );
  });
});

describe('5. rotations', () => {
  const fam = C.rotations(5, 8);
  it('every 5 degrees, 10 patterns: DETECTED; bits = R90^k . P (k = round(theta/90)) away from +-45', () => {
    expect(fam.failures).toEqual([]);
    expect(fam.total).toBe(720);
    expect(fam.exact).toBe(720);
    expect(fam.extra['strictExact']).toBe(fam.extra['strictCases']);
    expect(fam.extra['maxSizeErrPx']).toBeLessThanOrEqual(0.5);
  });

  it('the analytic relation holds with the design cell map and the reported canonical rotation is in (-45, 45]', () => {
    const p = C.BASE_PATTERNS[3]!;
    const src = blankImage(160, 160);
    pasteImage(src, renderMarker(p, 8), 44, 44);
    for (const th of [0, 30, 90, 100, 180, 200, 270, 300, 355]) {
      const res = detectMarkers(warpImage(src, rotationMatrix(th, 80, 80), 160, 160));
      expect(res.kind).toBe('DETECTED');
      if (res.kind !== 'DETECTED') continue;
      const m = res.markers[0]!;
      const k = Math.round(th / 90) % 4;
      let e = p;
      for (let i = 0; i < k; i++) e = applyTransform('R90', e);
      expect(m.bits).toBe(e);
      expect(m.rotationDeg).toBeGreaterThan(-45);
      expect(m.rotationDeg).toBeLessThanOrEqual(45);
      const residual = th - 90 * Math.round(th / 90); // the rotation left after removing whole quarter turns
      expect(Math.abs(m.rotationDeg - residual)).toBeLessThan(1.5);
    }
  });
});

describe('6. scaling (measured thresholds)', () => {
  it('crisp integer modulePx 2..24, all 52 patterns: exact bits for sizePx >= 14 (min exact modulePx = 2)', () => {
    const s = C.scalesInteger();
    expect(s.fam.failures).toEqual([]);
    expect(C.minExactModule(s.perModule)).toBe(2);
    for (const r of s.perModule) expect(r.exact, `modulePx ${r.modulePx}`).toBe(52);
  });

  it('1 px modules (7 px marker) are never DETECTED and never wrong', () => {
    const s = C.scalesInteger([1]);
    expect(s.perModule[0]!.detected).toBe(0);
    expect(s.perModule[0]!.wrongBits).toBe(0);
  });

  it('blurred non-integer scales: exact for effective modulePx >= 2.5 (sizePx >= 17.5), spec range 0.5..3x of modulePx 8 included', () => {
    const mods = [4, 5, 6, 8, 10, 12, 16, 20, 24, 3, 2.75, 2.5];
    const f = C.scalesFractional(mods, 52);
    expect(f.fam.failures).toEqual([]);
    for (const r of f.perModule) expect(r.exact, `module ${r.modulePx}`).toBe(52);
  });

  it('below the exact threshold (2.0..2.25 blurred) results may be rejected but are never wrong', () => {
    const f = C.scalesFractional([1, 1.5, 2, 2.25], 52);
    expect(f.fam.wrongBits).toBe(0);
  });
});

describe('7. perspective (plane tilt, camera distance 5 marker edges)', () => {
  const p = C.perspective([0, 10, 20, 30, 40, 50, 60], 20);
  it('exact bits for 20 seeded cases (random rotation, random tilt axis) at 0, 10, 20, 30, 40 and 50 degrees', () => {
    for (const row of p.rows.filter((r) => r.tiltDeg <= 50)) {
      expect(row.exact, `tilt ${row.tiltDeg}`).toBe(20);
      expect(row.wrongBits, `tilt ${row.tiltDeg}`).toBe(0);
    }
  });

  it('60 degrees: partial recall is allowed (measured 16/20) but wrong bits are never returned', () => {
    const row = p.rows.find((r) => r.tiltDeg === 60)!;
    expect(row.wrongBits).toBe(0);
    expect(row.exact).toBeGreaterThanOrEqual(12);
  });
});

describe('8. invalid borders and damaged markers', () => {
  const inv = C.invalidBorders();
  const byName = new Map(inv.cases.map((c) => [c.name, c]));

  it('never DETECTED with wrong bits and never DETECTED when the structure is invalid', () => {
    expect(inv.fam.failures).toEqual([]);
    expect(inv.fam.wrongBits).toBe(0);
    for (const c of inv.cases) {
      expect(c.detectedWithWrongBits, c.name).toBe(0);
      expect(c.detectedButInvalidStructure, c.name).toBe(0);
    }
  });

  it('(a) every non-corner border cell white: INVALID_MARKER / BORDER_NOT_BLACK (60 of 60)', () => {
    expect(byName.get('a-noncorner-border-cell-white')!.outcomes).toEqual({ 'INVALID_MARKER/BORDER_NOT_BLACK': 60 });
  });

  it('(b) every corner border cell white: INVALID_MARKER / BORDER_NOT_BLACK (12 of 12)', () => {
    expect(byName.get('b-corner-border-cell-white')!.outcomes).toEqual({ 'INVALID_MARKER/BORDER_NOT_BLACK': 12 });
  });

  it('(c) a whole border side white is rejected', () => {
    const c = byName.get('c-border-side-white')!;
    expect(c.outcomes['DETECTED']).toBeUndefined();
  });

  it('(d) a single gray (128) border cell is BORDER_NOT_BLACK; a single darker gray (100) cell is a still-valid marker', () => {
    expect(byName.get('d-border-cell-gray128')!.outcomes).toEqual({ 'INVALID_MARKER/BORDER_NOT_BLACK': 24 });
    expect(byName.get('d-border-cell-gray100')!.outcomes).toEqual({ DETECTED: 24 });
  });

  it('(e) black margin touching the border is never DETECTED', () => {
    expect(byName.get('e-margin-black-side-full')!.outcomes['DETECTED']).toBeUndefined();
    expect(byName.get('e-margin-black-side-partial')!.outcomes['DETECTED']).toBeUndefined();
  });

  it('(e2) one isolated dark dot in the margin is tolerated; eight are MARGIN_NOT_WHITE', () => {
    expect(byName.get('e-margin-isolated-dots-1')!.outcomes).toEqual({ DETECTED: 3 });
    expect(byName.get('e-margin-isolated-dots-8')!.outcomes).toEqual({ 'INVALID_MARKER/MARGIN_NOT_WHITE': 3 });
  });

  it('(f) marker cut by the image edge: 25 % visible is NOT_DETECTED, 50 % and 75 % are TOUCHES_IMAGE_EDGE', () => {
    expect(byName.get('f-cropped-visible-25pct')!.outcomes).toEqual({ NOT_DETECTED: 8 });
    expect(byName.get('f-cropped-visible-50pct')!.outcomes).toEqual({ 'INVALID_MARKER/TOUCHES_IMAGE_EDGE': 8 });
    expect(byName.get('f-cropped-visible-75pct')!.outcomes).toEqual({ 'INVALID_MARKER/TOUCHES_IMAGE_EDGE': 8 });
  });

  it('(g) white occluders: DETECTED only when the border is intact and the bits equal what the raster shows', () => {
    const c = byName.get('g-white-occluder')!;
    expect(c.total).toBe(40);
    expect(c.detectedWithWrongBits).toBe(0);
    expect(c.detectedButInvalidStructure).toBe(0);
  });

  it('(h) two markers touching are never DETECTED', () => {
    expect(byName.get('h-two-markers-touching')!.outcomes['DETECTED']).toBeUndefined();
  });
});

describe('9. determinism and input safety', () => {
  const img = blankImage(120, 100);
  pasteImage(img, renderMarker(C.BASE_PATTERNS[9]!, 5), 20, 18);

  it('same input twice gives deep-equal results', () => {
    expect(detectMarkers(img)).toEqual(detectMarkers(img));
    const sheet = blankImage(200, 100);
    pasteImage(sheet, renderMarker(C.BASE_PATTERNS[1]!, 4), 10, 10);
    pasteImage(sheet, renderMarker(C.BASE_PATTERNS[2]!, 4), 100, 40);
    const r = detectMarkers(sheet);
    expect(r).toEqual(detectMarkers(sheet));
    if (r.kind === 'DETECTED') {
      expect(r.markers.length).toBe(2);
      expect(r.markers[0]!.center.y).toBeLessThan(r.markers[1]!.center.y);
    }
  });

  it('does not mutate the input image', () => {
    const copy = new Uint8Array(img.data);
    detectMarkers(img);
    detectMarkers(img, { binarization: 'adaptive' });
    expect(Array.from(img.data)).toEqual(Array.from(copy));
  });

  it('throws RangeError only for malformed image objects', () => {
    const bad = (i: unknown): unknown => () => detectMarkers(i as GrayImage);
    expect(bad({ width: 10, height: 10, data: new Uint8Array(99) })).toThrow(RangeError);
    expect(bad({ width: -1, height: 1, data: new Uint8Array(0) })).toThrow(RangeError);
    expect(bad({ width: 1.5, height: 2, data: new Uint8Array(3) })).toThrow(RangeError);
    expect(bad({ width: 2, height: 2 })).toThrow(RangeError);
    expect(bad(null)).toThrow(RangeError);
  });

  it('returns NOT_DETECTED without throwing for degenerate sizes', () => {
    for (const [w, h] of [[0, 0], [0, 5], [5, 0], [1, 1], [2, 2], [1, 500], [500, 1], [3, 3]] as const) {
      const g: GrayImage = { width: w, height: h, data: new Uint8Array(w * h).map((_, i) => (i % 3) * 120) };
      expect(detectMarkers(g)).toEqual({ kind: 'NOT_DETECTED' });
    }
  });

  it('optional adaptive binarization reads a clean marker and a strong illumination ramp', () => {
    const rows = C.degradations();
    const get = (name: string) => rows.find((r) => r.condition === name)!;
    expect(get('clean adaptive').exact).toBe(20);
    expect(get('illumination ramp x0.35..x1 adaptive').exact).toBe(20);
    for (const r of rows) expect(r.wrongBits, r.condition).toBe(0);
  });
});
