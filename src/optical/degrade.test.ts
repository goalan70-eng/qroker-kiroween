/**
 * Tests for degrade.ts (task 7.1). SYNTHETIC images, not real cameras. All randomness is seeded.
 * Expected values come from independent index arithmetic / formulas written in this file, from render.ts
 * `applyImageTransform` (the D4 convention), and from the existing helpers of testing/ (byte-identity of shared cases).
 * Expected cards are used only for assertions after decoding; no identity is passed to a degradation.
 */
import { describe, expect, it } from 'vitest';
import * as D from './degrade';
import { decodeGroup } from './decode-group';
import { mulberry32 } from './prng';
import { applyImageTransform, renderMarker, type GrayImage } from './render';
import { composeGroup, referenceSum, rotateImage as testRotateImage, type Arrangement } from './testing/group-compose';
import { applyLightingGradient, gaussianBlur } from './testing/geometry-trial';
import { composeBoard, observeFace, seededPlacements } from './testing/physical-card';
import { addGaussianNoise, compose, rotationMatrix, tiltMatrix, warpImage } from './testing/warp';

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const randomImage = (w: number, h: number, seed: number): GrayImage => {
  const rng = mulberry32(seed);
  const data = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rng() * 256);
  return { width: w, height: h, data };
};
const flat = (w: number, h: number, v: number): GrayImage => ({ width: w, height: h, data: new Uint8Array(w * h).fill(v) });
const clone = (a: GrayImage): GrayImage => ({ width: a.width, height: a.height, data: new Uint8Array(a.data) });
const same = (a: GrayImage, b: GrayImage): boolean =>
  a.width === b.width && a.height === b.height && Buffer.from(a.data).equals(Buffer.from(b.data));
const mean = (a: GrayImage): number => a.data.reduce((s, v) => s + v, 0) / a.data.length;
/** Smooth test picture (gentle curvature, so bilinear resampling errors stay below one gray level). */
const smooth = (n: number): GrayImage => {
  const data = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) data[y * n + x] = Math.round(128 + 90 * Math.sin(x / 19) * Math.cos(y / 23));
  return { width: n, height: n, data };
};
const SEED = 7_000_001;

const ARR: Arrangement = {
  TL: { card: 'H-5', orientation: 0 },
  TR: { card: 'D-9', orientation: 0 },
  BL: { card: 'C-J', orientation: 0 },
  BR: { card: 'S-2', orientation: 0 },
};
const EXPECTED_CARDS = ['C-J', 'D-9', 'H-5', 'S-2'];

/** Every degradation at a visible, non-zero strength, as (name, function of the input image). */
const ACTIVE: Array<[string, (i: GrayImage) => GrayImage]> = [
  ['reflect Fh', (i) => D.reflectImage(i, 'Fh')],
  ['reflect Fv', (i) => D.reflectImage(i, 'Fv')],
  ['rotate 33.3', (i) => D.rotateImage(i, 33.3)],
  ['rotate 90', (i) => D.rotateImage(i, 90)],
  ['perspective', (i) => D.perspectiveImage(i, { tiltDeg: 25, axisDeg: 40 })],
  ['blur', (i) => D.blurImage(i, 1.4)],
  ['noise', (i) => D.addNoise(i, 7, 5)],
  ['illumination', (i) => D.applyIllumination(i, 0.4, 30)],
  ['fragment offsets', (i) => D.shiftFragments(i, [{ x0: 8, y0: 8, x1: 40, y1: 40 }], 0.25, 4, 3)],
  [
    'degrade (all stages)',
    (i) =>
      D.degrade(i, {
        seed: SEED,
        fragments: { rects: [{ x0: 8, y0: 8, x1: 40, y1: 40 }], magnitudeModules: 0.25, modulePx: 4 },
        reflect: 'Fh',
        rotationDeg: 21,
        perspective: { tiltDeg: 20, axisDeg: 70 },
        illumination: { strength: 0.3, directionDeg: 120 },
        blurSigmaPx: 1,
        noiseSigma: 4,
      }),
  ],
];

/** Every degradation at zero strength. */
const ZERO: Array<[string, (i: GrayImage) => GrayImage]> = [
  ['reflect none', (i) => D.reflectImage(i, 'none')],
  ['rotate 0', (i) => D.rotateImage(i, 0)],
  ['rotate 360', (i) => D.rotateImage(i, 360)],
  ['rotate -720', (i) => D.rotateImage(i, -720)],
  ['perspective tilt 0', (i) => D.perspectiveImage(i, { tiltDeg: 0, axisDeg: 33 })],
  ['warp identity homography', (i) => D.warpHomography(i, [1, 0, 0, 0, 1, 0, 0, 0, 1])],
  ['warp scaled identity homography', (i) => D.warpHomography(i, [3, 0, 0, 0, 3, 0, 0, 0, 3])],
  ['blur 0', (i) => D.blurImage(i, 0)],
  ['noise 0', (i) => D.addNoise(i, 0, 9)],
  ['illumination 0', (i) => D.applyIllumination(i, 0, 77)],
  ['fragment offsets 0', (i) => D.shiftFragments(i, [{ x0: 8, y0: 8, x1: 40, y1: 40 }], 0, 4, 3)],
  ['degrade with no stages', (i) => D.degrade(i, { seed: SEED })],
  [
    'degrade with every stage at zero',
    (i) =>
      D.degrade(i, {
        seed: SEED,
        fragments: { rects: [{ x0: 8, y0: 8, x1: 40, y1: 40 }], magnitudeModules: 0, modulePx: 4 },
        reflect: 'none',
        rotationDeg: 0,
        perspective: { tiltDeg: 0, axisDeg: 10 },
        illumination: { strength: 0, directionDeg: 45 },
        blurSigmaPx: 0,
        noiseSigma: 0,
      }),
  ],
];

// ---------------------------------------------------------------------------------------------

describe('determinism, identity, immutability, ranges', () => {
  const img = randomImage(64, 48, 11);

  it.each(ACTIVE)('%s: repeated calls give byte-identical output', (_n, f) => {
    expect(same(f(img), f(img))).toBe(true);
  });

  it.each(ZERO)('%s: zero strength returns an equal COPY', (_n, f) => {
    const out = f(img);
    expect(same(out, img)).toBe(true);
    expect(out.data).not.toBe(img.data);
  });

  it.each([...ACTIVE, ...ZERO])('%s: input is not modified', (_n, f) => {
    const before = clone(img);
    f(img);
    expect(same(img, before)).toBe(true);
  });

  it.each(ACTIVE)('%s: output keeps size and type, values are integers 0..255', (_n, f) => {
    const out = f(img);
    expect(out.width).toBe(img.width);
    expect(out.height).toBe(img.height);
    expect(out.data).toBeInstanceOf(Uint8Array);
    expect(out.data.length).toBe(img.width * img.height);
  });

  it('a flat gray image stays well inside 0..255 after every geometric/optical stage (no NaN pixels become 0)', () => {
    const f = flat(64, 48, 200);
    for (const [, fn] of ACTIVE.filter(([n]) => n !== 'noise' && n !== 'degrade (all stages)')) {
      const out = fn(f);
      expect(Math.min(...out.data)).toBeGreaterThan(100);
    }
  });

  it('seeded stages react to the seed, and only to it', () => {
    const f = flat(40, 40, 128);
    expect(same(D.addNoise(f, 8, 1), D.addNoise(f, 8, 1))).toBe(true);
    expect(same(D.addNoise(f, 8, 1), D.addNoise(f, 8, 2))).toBe(false);
    expect(D.fragmentOffsets(6, 0.25, 1)).toEqual(D.fragmentOffsets(6, 0.25, 1));
    expect(D.fragmentOffsets(6, 0.25, 1)).not.toEqual(D.fragmentOffsets(6, 0.25, 2));
    const m = renderMarker(0x1234567, 4);
    const rect = [{ x0: 0, y0: 0, x1: m.width, y1: m.height }];
    expect(same(D.shiftFragments(m, rect, 0.25, 4, 1), D.shiftFragments(m, rect, 0.25, 4, 1))).toBe(true);
    expect(same(D.shiftFragments(m, rect, 0.25, 4, 1), D.shiftFragments(m, rect, 0.25, 4, 2))).toBe(false);
    const p = { seed: 5, noiseSigma: 6, rotationDeg: 10 };
    expect(same(D.degrade(f, p), D.degrade(f, { ...p, seed: 5 }))).toBe(true);
    expect(same(D.degrade(f, p), D.degrade(f, { ...p, seed: 6 }))).toBe(false);
  });
});

describe('rotation', () => {
  it('multiples of 90 degrees equal the exact index permutation and the D4 transforms of render.ts (clockwise)', () => {
    const img = randomImage(37, 37, 21);
    const n = 37;
    const ref = (map: (r: number, c: number) => [number, number]): GrayImage => {
      const out = new Uint8Array(n * n);
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const [r2, c2] = map(r, c);
        out[r2 * n + c2] = img.data[r * n + c]!;
      }
      return { width: n, height: n, data: out };
    };
    // clockwise 90: the top row becomes the right column
    expect(same(D.rotateImage(img, 90), ref((r, c) => [c, n - 1 - r]))).toBe(true);
    expect(same(D.rotateImage(img, 180), ref((r, c) => [n - 1 - r, n - 1 - c]))).toBe(true);
    expect(same(D.rotateImage(img, 270), ref((r, c) => [n - 1 - c, r]))).toBe(true);
    for (const [deg, g] of [[90, 'R90'], [180, 'R180'], [270, 'R270']] as const) {
      expect(same(D.rotateImage(img, deg), applyImageTransform(g, img))).toBe(true);
    }
    expect(same(D.rotateImage(img, 450), D.rotateImage(img, 90))).toBe(true);
    expect(same(D.rotateImage(img, -90), D.rotateImage(img, 270))).toBe(true);
    // the top-left pixel moves to the top-right corner after 90 degrees clockwise
    expect(D.rotateImage(img, 90).data[n - 1]).toBe(img.data[0]);
  });

  it('180 degrees is exact for a non-square image', () => {
    const img = randomImage(30, 20, 22);
    const out = D.rotateImage(img, 180);
    for (let r = 0; r < 20; r++) for (let c = 0; c < 30; c++) expect(out.data[(19 - r) * 30 + (29 - c)]).toBe(img.data[r * 30 + c]);
  });

  it('a general angle matches the warp of testing/ byte for byte, and turns clockwise', () => {
    const img = randomImage(48, 48, 23);
    expect(same(D.rotateImage(img, 30, { supersample: 3 }), testRotateImage(img, 30))).toBe(true);
    // a dark pixel at the right of the centre moves DOWN under a small clockwise rotation (y points down)
    const dot = flat(61, 61, 255);
    dot.data[30 * 61 + 50] = 0;
    const out = D.rotateImage(dot, 20, { supersample: 1 });
    let sy = 0;
    let sx = 0;
    let mass = 0;
    for (let y = 0; y < 61; y++) for (let x = 0; x < 61; x++) {
      const d = 255 - out.data[y * 61 + x]!;
      mass += d;
      sx += d * (x + 0.5);
      sy += d * (y + 0.5);
    }
    expect(sy / mass).toBeGreaterThan(30.5 + 5);
    // centre of the dot rotated by 20 deg about (30.5, 30.5): (20 cos20, 20 sin20) from the centre
    expect(sx / mass).toBeCloseTo(30.5 + 20 * Math.cos((20 * Math.PI) / 180), 0);
    expect(sy / mass).toBeCloseTo(30.5 + 20 * Math.sin((20 * Math.PI) / 180), 0);
  });

  it('rotating by theta and then -theta recovers the interior (max error stated: 4 gray levels on a smooth picture)', () => {
    const img = smooth(128);
    for (const theta of [20, -37.5, 133]) {
      const back = D.rotateImage(D.rotateImage(img, theta), -theta);
      let worst = 0;
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
        if (Math.hypot(x + 0.5 - 64, y + 0.5 - 64) > 50) continue;
        worst = Math.max(worst, Math.abs(back.data[y * 128 + x]! - img.data[y * 128 + x]!));
      }
      expect(worst).toBeLessThanOrEqual(4);
    }
  });
});

describe('reflection', () => {
  const img = randomImage(23, 15, 31);
  const refl = (kind: 'Fh' | 'Fv'): GrayImage => {
    const out = new Uint8Array(23 * 15);
    for (let r = 0; r < 15; r++) for (let c = 0; c < 23; c++) {
      out[kind === 'Fh' ? (14 - r) * 23 + c : r * 23 + (22 - c)] = img.data[r * 23 + c]!;
    }
    return { width: 23, height: 15, data: out };
  };

  it('equals the independent index reference and the D4 transforms of render.ts', () => {
    expect(same(D.reflectImage(img, 'Fh'), refl('Fh'))).toBe(true);
    expect(same(D.reflectImage(img, 'Fv'), refl('Fv'))).toBe(true);
    const sq = randomImage(17, 17, 32);
    expect(same(D.reflectImage(sq, 'Fh'), applyImageTransform('Fh', sq))).toBe(true);
    expect(same(D.reflectImage(sq, 'Fv'), applyImageTransform('Fv', sq))).toBe(true);
  });

  it('reflecting twice is the identity (lossless)', () => {
    for (const k of ['Fh', 'Fv'] as const) expect(same(D.reflectImage(D.reflectImage(img, k), k), img)).toBe(true);
  });

  it('follows the D4 identities: R180 commutes with a reflection and Fh.R180 = Fv; R90.Fh = Fh.R270', () => {
    expect(same(D.reflectImage(D.rotateImage(img, 180), 'Fh'), D.reflectImage(img, 'Fv'))).toBe(true);
    expect(same(D.rotateImage(D.reflectImage(img, 'Fh'), 180), D.reflectImage(D.rotateImage(img, 180), 'Fh'))).toBe(true);
    const sq = randomImage(17, 17, 33);
    expect(same(D.rotateImage(D.reflectImage(sq, 'Fh'), 90), D.reflectImage(D.rotateImage(sq, 270), 'Fh'))).toBe(true);
  });
});

describe('perspective', () => {
  /** Independent pinhole projection (Rodrigues rotation of the point about the in-plane axis, camera at distance d). */
  const project = (x: number, y: number, w: number, h: number, tiltDeg: number, axisDeg: number, dd: number): { x: number; y: number } => {
    const d = dd * Math.hypot(w, h);
    const tau = (tiltDeg * Math.PI) / 180;
    const al = (axisDeg * Math.PI) / 180;
    const k = [Math.cos(al), Math.sin(al), 0] as const;
    const v = [x - w / 2, y - h / 2, 0] as const;
    const kxv = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]] as const;
    const kv = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
    const rv = [0, 1, 2].map((i) => v[i]! * Math.cos(tau) + kxv[i]! * Math.sin(tau) + k[i]! * kv * (1 - Math.cos(tau)));
    const s = d / (d + rv[2]!);
    return { x: w / 2 + s * rv[0]!, y: h / 2 + s * rv[1]! };
  };

  it('moves four marked blobs to the positions predicted by an independent projection (sub-pixel)', () => {
    const W = 200;
    const src = flat(W, W, 255);
    const blobs = [[56, 56], [136, 60], [60, 140], [140, 136]];
    for (const [bx, by] of blobs) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) src.data[(by! + y) * W + bx! + x] = 0;
    for (const [tilt, axis, dd] of [[30, 35, 1], [-45, 200, 1.5]] as const) {
      const out = D.perspectiveImage(src, { tiltDeg: tilt, axisDeg: axis, distanceDiagonals: dd }, { supersample: 3 });
      for (const [bx, by] of blobs) {
        const exp = project(bx! + 4, by! + 4, W, W, tilt, axis, dd);
        let m = 0;
        let sx = 0;
        let sy = 0;
        for (let y = Math.floor(exp.y) - 14; y <= Math.floor(exp.y) + 14; y++) for (let x = Math.floor(exp.x) - 14; x <= Math.floor(exp.x) + 14; x++) {
          const dk = 255 - out.data[y * W + x]!;
          m += dk;
          sx += dk * (x + 0.5);
          sy += dk * (y + 0.5);
        }
        expect(Math.hypot(sx / m - exp.x, sy / m - exp.y)).toBeLessThan(0.25);
      }
    }
  });

  it('matches warpImage with tiltMatrix of testing/ byte for byte and tilt 0 is the identity', () => {
    const img = randomImage(80, 60, 41);
    const H = tiltMatrix({ cx: 40, cy: 30, tiltDeg: 25, axisDeg: 40, distancePx: Math.hypot(80, 60) });
    expect(same(D.perspectiveImage(img, { tiltDeg: 25, axisDeg: 40 }, { supersample: 3 }), warpImage(img, H, 80, 60, { supersample: 3 }))).toBe(true);
    expect(same(D.perspectiveImage(img, { tiltDeg: 0, axisDeg: 40 }), img)).toBe(true);
  });

  it('warpHomography matches warpImage for a rotation + tilt composition', () => {
    const img = randomImage(64, 64, 42);
    const H = compose(tiltMatrix({ cx: 32, cy: 32, tiltDeg: 15, axisDeg: 100, distancePx: 90 }), rotationMatrix(12, 32, 32));
    expect(same(D.warpHomography(img, H, { supersample: 2, background: 90 }), warpImage(img, H, 64, 64, { supersample: 2, background: 90 }))).toBe(true);
  });

  it('rejects degenerate parameters', () => {
    const img = randomImage(40, 40, 43);
    expect(() => D.perspectiveImage(img, { tiltDeg: 80, axisDeg: 0, distanceDiagonals: 0.2 })).toThrow(RangeError); // horizon in the picture
    expect(() => D.perspectiveImage(img, { tiltDeg: 90, axisDeg: 0 })).toThrow(RangeError);
    expect(() => D.perspectiveImage(img, { tiltDeg: 10, axisDeg: 0, distanceDiagonals: 0 })).toThrow(RangeError);
    expect(() => D.warpHomography(img, [1, 0, 0, 1, 0, 0, 0, 0, 1])).toThrow(RangeError); // singular
    expect(() => D.warpHomography(img, [1, 0, 0, 0, 1, 0, -0.1, 0, 1])).toThrow(RangeError); // horizon at x = 10, inside the image
    expect(() => D.warpHomography(img, [1, 0, 0, 0, 1, 0, 0, 0])).toThrow(TypeError);
  });
});

describe('fragment position offsets', () => {
  it('have exactly the requested length in modules, in random directions, and are reproducible', () => {
    for (const mag of D.FRAGMENT_OFFSET_LEVELS_MODULES) {
      const a = D.fragmentOffsets(200, mag, SEED);
      expect(a).toEqual(D.fragmentOffsets(200, mag, SEED));
      for (const o of a) expect(Math.abs(Math.hypot(o.dxModules, o.dyModules) - mag)).toBeLessThan(1e-12);
      if (mag > 0) {
        // directions cover the circle: every quadrant is used, mean vector is small
        const q = new Set(a.map((o) => `${Math.sign(o.dxModules)}${Math.sign(o.dyModules)}`));
        expect(q.size).toBe(4);
        expect(Math.hypot(a.reduce((s, o) => s + o.dxModules, 0), a.reduce((s, o) => s + o.dyModules, 0)) / 200).toBeLessThan(0.3 * mag);
      }
    }
    // magnitude 0: exactly +0 (no negative zero)
    for (const o of D.fragmentOffsets(50, 0, SEED)) {
      expect(Object.is(o.dxModules, 0)).toBe(true);
      expect(Object.is(o.dyModules, 0)).toBe(true);
    }
    // directions do not depend on the level: offsets are proportional
    const a = D.fragmentOffsets(10, 0.1, 3);
    const b = D.fragmentOffsets(10, 0.25, 3);
    a.forEach((o, i) => {
      expect(o.dxModules * 2.5).toBeCloseTo(b[i]!.dxModules, 12);
      expect(o.dyModules * 2.5).toBeCloseTo(b[i]!.dyModules, 12);
    });
  });

  it('shift the content of each footprint by the offset, in module units (+x right, +y down), measured by centroid', () => {
    const modulePx = 8;
    const { image, centers } = composeGroup(ARR, { modulePx });
    const rects = (['TL', 'TR', 'BL', 'BR'] as const).map((s) => D.markerFootprintRect(centers[s].x, centers[s].y, modulePx));
    const centroid = (img: GrayImage, r: D.PixelRect): { x: number; y: number } => {
      let m = 0;
      let sx = 0;
      let sy = 0;
      for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
        const d = 255 - img.data[y * img.width + x]!;
        m += d;
        sx += d * (x + 0.5);
        sy += d * (y + 0.5);
      }
      return { x: sx / m, y: sy / m };
    };
    for (const mag of [0.1, 0.25]) {
      const offs = D.fragmentOffsets(4, mag, 99);
      const out = D.applyFragmentOffsets(image, rects, offs, modulePx);
      rects.forEach((r, i) => {
        const a = centroid(image, r);
        const b = centroid(out, r);
        expect(Math.abs(b.x - a.x - offs[i]!.dxModules * modulePx)).toBeLessThan(0.05);
        expect(Math.abs(b.y - a.y - offs[i]!.dyModules * modulePx)).toBeLessThan(0.05);
      });
      // nothing outside the footprints changes
      const inside = (x: number, y: number): boolean => rects.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
      for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
        if (!inside(x, y)) expect(out.data[y * image.width + x]).toBe(image.data[y * image.width + x]);
      }
    }
  });

  it('a whole-pixel offset is an exact shift and an all-zero offset list is an exact copy', () => {
    const modulePx = 4;
    const m = renderMarker(0x0a5a5a5, modulePx);
    const rect = [{ x0: 0, y0: 0, x1: m.width, y1: m.height }];
    const out = D.applyFragmentOffsets(m, rect, [{ dxModules: 1 / modulePx, dyModules: -2 / modulePx }], modulePx);
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      const sx = x - 1;
      const sy = y + 2;
      const expected = sx >= 0 && sx < m.width && sy >= 0 && sy < m.height ? m.data[sy * m.width + sx]! : 255;
      expect(out.data[y * m.width + x]).toBe(expected);
    }
    expect(same(D.applyFragmentOffsets(m, rect, [{ dxModules: 0, dyModules: 0 }], modulePx), m)).toBe(true);
  });
});

describe('blur', () => {
  const sigmaRef = 1.5;
  const kernel = (): Map<number, number> => {
    const r = Math.ceil(3 * sigmaRef);
    let s = 0;
    for (let i = -r; i <= r; i++) s += Math.exp(-(i * i) / (2 * sigmaRef * sigmaRef));
    const k = new Map<number, number>();
    for (let i = -r; i <= r; i++) k.set(i, Math.exp(-(i * i) / (2 * sigmaRef * sigmaRef)) / s);
    return k;
  };

  it('matches an independent separable-kernel reference on a block and preserves the total mass', () => {
    const n = 41;
    const img = flat(n, n, 0);
    for (let y = 18; y <= 22; y++) for (let x = 18; x <= 22; x++) img.data[y * n + x] = 255;
    const out = D.blurImage(img, sigmaRef);
    const k = kernel();
    const w1 = (p: number): number => {
      let s = 0;
      for (let b = 18; b <= 22; b++) s += k.get(p - b) ?? 0;
      return s;
    };
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      expect(Math.abs(out.data[y * n + x]! - 255 * w1(x) * w1(y))).toBeLessThanOrEqual(0.5 + 1e-9);
    }
    const mass = out.data.reduce((s, v) => s + v, 0);
    expect(Math.abs(mass - 25 * 255) / (25 * 255)).toBeLessThan(0.01);
  });

  it('lowers the peak of a single pixel, and a larger sigma lowers it more', () => {
    const img = flat(31, 31, 0);
    img.data[15 * 31 + 15] = 255;
    const peak = (s: number): number => Math.max(...D.blurImage(img, s).data);
    expect(peak(1)).toBeLessThan(255 * 0.2);
    expect(peak(1)).toBeGreaterThan(255 * 0.1);
    expect(peak(2)).toBeLessThan(peak(1));
  });

  it('matches gaussianBlur of testing/geometry-trial.ts byte for byte, and keeps flat images flat', () => {
    const img = randomImage(50, 40, 51);
    for (const s of [0.4, 1.3, 3]) expect(same(D.blurImage(img, s), gaussianBlur(img, s))).toBe(true);
    for (const v of [0, 1, 128, 255]) expect(same(D.blurImage(flat(30, 30, v), 2.2), flat(30, 30, v))).toBe(true);
  });
});

describe('noise', () => {
  it('has mean about 0 and standard deviation about sigma on a flat image', () => {
    const img = flat(200, 200, 128);
    for (const sigma of [3, 10, 25]) {
      const out = D.addNoise(img, sigma, SEED);
      const n = out.data.length;
      const mu = out.data.reduce((s, v) => s + (v - 128), 0) / n;
      const sd = Math.sqrt(out.data.reduce((s, v) => s + (v - 128 - mu) ** 2, 0) / n);
      // 4 standard errors of the sample mean / standard deviation (the stream is fixed, so this is deterministic)
      expect(Math.abs(mu)).toBeLessThan((4 * sigma) / Math.sqrt(n) + 0.01);
      // rounding adds variance 1/12
      expect(Math.abs(sd - Math.sqrt(sigma * sigma + 1 / 12))).toBeLessThan((4 * sigma) / Math.sqrt(2 * n) + 0.01);
    }
  });

  it('clamps to 0..255: about half of the pixels of a black or white image stay at the limit', () => {
    for (const v of [0, 255]) {
      const out = D.addNoise(flat(200, 200, v), 30, SEED);
      const atLimit = out.data.filter((x) => x === v).length / out.data.length;
      expect(atLimit).toBeGreaterThan(0.49);
      expect(atLimit).toBeLessThan(0.52);
      expect(out.data.some((x) => x === 255 - v)).toBe(false);
    }
  });

  it('matches addGaussianNoise with mulberry32(seed) of testing/warp.ts byte for byte', () => {
    const img = randomImage(60, 40, 61);
    const ref = clone(img);
    addGaussianNoise(ref, 9, mulberry32(1234));
    expect(same(D.addNoise(img, 9, 1234), ref)).toBe(true);
  });
});

describe('illumination gradient', () => {
  it('gain falls monotonically along the direction (flat image), with the independent closed form for direction 0', () => {
    const W = 100;
    const H = 60;
    const f = flat(W, H, 200);
    const out0 = D.applyIllumination(f, 0.4, 0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      expect(Math.abs(out0.data[y * W + x]! - 200 * (1 - (0.4 * (x + 0.5)) / W))).toBeLessThanOrEqual(0.5 + 1e-9);
    }
    const at = (img: GrayImage, x: number, y: number): number => img.data[y * W + x]!;
    const out90 = D.applyIllumination(f, 0.4, 90);
    const out180 = D.applyIllumination(f, 0.4, 180);
    const out45 = D.applyIllumination(f, 0.4, 45);
    for (let x = 0; x < W; x++) for (let y = 0; y + 1 < H; y++) expect(at(out90, x, y + 1)).toBeLessThanOrEqual(at(out90, x, y));
    for (let y = 0; y < H; y++) for (let x = 0; x + 1 < W; x++) {
      expect(at(out0, x + 1, y)).toBeLessThanOrEqual(at(out0, x, y));
      expect(at(out180, x + 1, y)).toBeGreaterThanOrEqual(at(out180, x, y));
    }
    for (let k = 0; k + 1 < H; k++) expect(at(out45, k + 1, k + 1)).toBeLessThanOrEqual(at(out45, k, k));
    expect(at(out0, 0, 5)).toBeGreaterThan(at(out0, W - 1, 5) + 60);
  });

  it('multiplies the mean by 1 - strength/2 and matches applyLightingGradient of testing/geometry-trial.ts', () => {
    expect(Math.abs(mean(D.applyIllumination(flat(80, 50, 200), 0.4, 33)) - 160)).toBeLessThan(0.5);
    const img = randomImage(50, 40, 71);
    expect(same(D.applyIllumination(img, 0.35, 123), applyLightingGradient(img, 0.35, 123))).toBe(true);
  });
});

describe('parameter validation', () => {
  const img = randomImage(40, 40, 81);
  const rect = { x0: 4, y0: 4, x1: 20, y1: 20 };
  const badRange: Array<[string, () => unknown]> = [
    ['blur NaN', () => D.blurImage(img, NaN)],
    ['blur Infinity', () => D.blurImage(img, Infinity)],
    ['blur negative', () => D.blurImage(img, -0.5)],
    ['blur too large', () => D.blurImage(img, 33)],
    ['noise sigma negative', () => D.addNoise(img, -1, 1)],
    ['noise sigma NaN', () => D.addNoise(img, NaN, 1)],
    ['noise sigma too large', () => D.addNoise(img, 129, 1)],
    ['noise seed fractional', () => D.addNoise(img, 1, 1.5)],
    ['noise seed negative', () => D.addNoise(img, 1, -1)],
    ['noise seed 2^32', () => D.addNoise(img, 1, 2 ** 32)],
    ['noise seed NaN', () => D.addNoise(img, 1, NaN)],
    ['illumination strength > 1', () => D.applyIllumination(img, 1.1, 0)],
    ['illumination strength negative', () => D.applyIllumination(img, -0.1, 0)],
    ['illumination direction NaN', () => D.applyIllumination(img, 0.1, NaN)],
    ['illumination direction Infinity', () => D.applyIllumination(img, 0.1, Infinity)],
    ['rotation NaN', () => D.rotateImage(img, NaN)],
    ['rotation Infinity', () => D.rotateImage(img, -Infinity)],
    ['rotation background 300', () => D.rotateImage(img, 10, { background: 300 })],
    ['rotation background fractional', () => D.rotateImage(img, 10, { background: 1.5 })],
    ['supersample 0', () => D.rotateImage(img, 10, { supersample: 0 })],
    ['supersample fractional', () => D.rotateImage(img, 10, { supersample: 2.5 })],
    ['perspective tilt too large', () => D.perspectiveImage(img, { tiltDeg: 81, axisDeg: 0 })],
    ['perspective axis NaN', () => D.perspectiveImage(img, { tiltDeg: 10, axisDeg: NaN })],
    ['perspective distance negative', () => D.perspectiveImage(img, { tiltDeg: 10, axisDeg: 0, distanceDiagonals: -1 })],
    ['offsets count fractional', () => D.fragmentOffsets(1.5, 0.1, 1)],
    ['offsets count negative', () => D.fragmentOffsets(-1, 0.1, 1)],
    ['offsets magnitude negative', () => D.fragmentOffsets(2, -0.1, 1)],
    ['offsets magnitude > 1', () => D.fragmentOffsets(2, 1.01, 1)],
    ['offsets magnitude NaN', () => D.fragmentOffsets(2, NaN, 1)],
    ['offsets seed fractional', () => D.fragmentOffsets(2, 0.1, 0.5)],
    ['shift rect outside the image', () => D.shiftFragments(img, [{ x0: 30, y0: 0, x1: 50, y1: 10 }], 0.1, 4, 1)],
    ['shift rect empty', () => D.shiftFragments(img, [{ x0: 5, y0: 5, x1: 5, y1: 10 }], 0.1, 4, 1)],
    ['shift rect fractional', () => D.shiftFragments(img, [{ x0: 5.5, y0: 5, x1: 9, y1: 10 }], 0.1, 4, 1)],
    ['shift modulePx 0', () => D.shiftFragments(img, [rect], 0.1, 0, 1)],
    ['shift offset too long', () => D.applyFragmentOffsets(img, [rect], [{ dxModules: 2, dyModules: 0 }], 4)],
    ['degrade rotation NaN', () => D.degrade(img, { seed: 1, rotationDeg: NaN })],
    ['degrade blur negative', () => D.degrade(img, { seed: 1, blurSigmaPx: -1 })],
    ['degrade noise Infinity', () => D.degrade(img, { seed: 1, noiseSigma: Infinity })],
    ['degrade illumination strength 2', () => D.degrade(img, { seed: 1, illumination: { strength: 2, directionDeg: 0 } })],
    ['degrade seed fractional', () => D.degrade(img, { seed: 1.5 })],
    ['degrade seed negative', () => D.degrade(img, { seed: -1 })],
    ['degrade degenerate perspective', () => D.degrade(img, { seed: 1, perspective: { tiltDeg: 80, axisDeg: 0, distanceDiagonals: 0.2 } })],
    ['degrade fragment magnitude 2', () => D.degrade(img, { seed: 1, fragments: { rects: [rect], magnitudeModules: 2, modulePx: 4 } })],
    ['degrade warpSupersample 9', () => D.degrade(img, { seed: 1, warpSupersample: 9 })],
    ['stageSeed with a bad master seed', () => D.stageSeed(-1, 'noise')],
    ['image with zero width', () => D.blurImage({ width: 0, height: 5, data: new Uint8Array(0) }, 1)],
    ['image with wrong data length', () => D.blurImage({ width: 5, height: 5, data: new Uint8Array(24) }, 1)],
    ['image with fractional size', () => D.blurImage({ width: 2.5, height: 2, data: new Uint8Array(5) }, 1)],
  ];
  it.each(badRange)('%s throws RangeError', (_n, f) => {
    expect(f).toThrow(RangeError);
  });

  const badType: Array<[string, () => unknown]> = [
    ['blur given a string', () => D.blurImage(img, '1' as never)],
    ['noise given null', () => D.addNoise(img, null as never, 1)],
    ['rotation given undefined', () => D.rotateImage(img, undefined as never)],
    ['unknown reflection', () => D.reflectImage(img, 'Fx' as never)],
    ['degrade unknown reflection', () => D.degrade(img, { seed: 1, reflect: 'sideways' as never })],
    ['degrade unknown field', () => D.degrade(img, { seed: 1, gamma: 2 } as never)],
    ['degrade missing seed', () => D.degrade(img, {} as never)],
    ['degrade unknown perspective field', () => D.degrade(img, { seed: 1, perspective: { tiltDeg: 5, axisDeg: 0, roll: 1 } } as never)],
    ['degrade unknown illumination field', () => D.degrade(img, { seed: 1, illumination: { strength: 0.1, directionDeg: 0, gamma: 1 } } as never)],
    ['unknown warp option', () => D.rotateImage(img, 10, { bg: 3 } as never)],
    ['unknown stage name', () => D.stageSeed(1, 'blur' as never)],
    ['image is not an object', () => D.blurImage(null as never, 1)],
    ['image data is a plain array', () => D.blurImage({ width: 2, height: 2, data: [1, 2, 3, 4] } as never, 1)],
    ['homography with 8 entries', () => D.warpHomography(img, [1, 0, 0, 0, 1, 0, 0, 0] as never)],
    ['shift offsets length mismatch', () => D.applyFragmentOffsets(img, [rect], [], 4)],
    ['rects not an array', () => D.shiftFragments(img, 'x' as never, 0.1, 4, 1)],
  ];
  it.each(badType)('%s throws TypeError', (_n, f) => {
    expect(f).toThrow(TypeError);
  });

  it('degrade validates every stage before doing any work, and does not touch the input when it throws', () => {
    const before = clone(img);
    expect(() => D.degrade(img, { seed: 1, rotationDeg: 10, blurSigmaPx: 1, noiseSigma: -1 })).toThrow(RangeError);
    expect(same(img, before)).toBe(true);
  });
});

describe('composition', () => {
  const img = randomImage(96, 72, 91);
  const rects = [{ x0: 10, y0: 10, x1: 40, y1: 40 }, { x0: 50, y0: 30, x1: 80, y1: 60 }];
  const full: D.DegradeParams = {
    seed: 2025,
    fragments: { rects, magnitudeModules: 0.25, modulePx: 3 },
    reflect: 'Fv',
    rotationDeg: 17,
    perspective: { tiltDeg: 22, axisDeg: 60, distanceDiagonals: 1.2 },
    background: 200,
    warpSupersample: 2,
    illumination: { strength: 0.3, directionDeg: 200 },
    blurSigmaPx: 1.1,
    noiseSigma: 5,
  };

  it('is the documented chain: fragments -> reflect -> (tilt, rotation) warp -> illumination -> blur -> noise', () => {
    const w = 96;
    const h = 72;
    const s0 = D.shiftFragments(img, rects, 0.25, 3, D.stageSeed(2025, 'fragments'));
    const s1 = D.reflectImage(s0, 'Fv');
    const H = compose(tiltMatrix({ cx: w / 2, cy: h / 2, tiltDeg: 22, axisDeg: 60, distancePx: 1.2 * Math.hypot(w, h) }), rotationMatrix(17, w / 2, h / 2));
    const s2 = warpImage(s1, H, w, h, { background: 200, supersample: 2 });
    const s3 = applyLightingGradient(s2, 0.3, 200);
    const s4 = gaussianBlur(s3, 1.1);
    const s5 = clone(s4);
    addGaussianNoise(s5, 5, mulberry32(D.stageSeed(2025, 'noise')));
    expect(same(D.degrade(img, full), s5)).toBe(true);
  });

  it('does not depend on the order of the fields of the parameter object', () => {
    const shuffled: D.DegradeParams = {
      noiseSigma: 5, blurSigmaPx: 1.1, illumination: full.illumination!, warpSupersample: 2, background: 200,
      perspective: full.perspective!, rotationDeg: 17, reflect: 'Fv', fragments: full.fragments!, seed: 2025,
    };
    expect(same(D.degrade(img, shuffled), D.degrade(img, full))).toBe(true);
  });

  it('stage seeds are pure, distinct per stage, and independent of the other stages', () => {
    expect(D.stageSeed(5, 'noise')).toBe(D.stageSeed(5, 'noise'));
    expect(D.stageSeed(5, 'noise')).not.toBe(D.stageSeed(5, 'fragments'));
    expect(D.stageSeed(5, 'noise')).not.toBe(D.stageSeed(6, 'noise'));
    // changing the noise sigma leaves everything before the noise stage untouched
    const quiet = D.degrade(img, { ...full, noiseSigma: 0 });
    for (const sigma of [2, 5, 11]) {
      expect(same(D.degrade(img, { ...full, noiseSigma: sigma }), D.addNoise(quiet, sigma, D.stageSeed(2025, 'noise')))).toBe(true);
    }
    // removing blur, perspective, rotation or illumination does not change the noise stream
    for (const drop of ['blurSigmaPx', 'perspective', 'rotationDeg', 'illumination', 'reflect'] as const) {
      const p: D.DegradeParams = { ...full };
      delete p[drop];
      const pre = D.degrade(img, { ...p, noiseSigma: 0 });
      expect(same(D.degrade(img, p), D.addNoise(pre, 5, D.stageSeed(2025, 'noise')))).toBe(true);
    }
    // removing the fragment stage does not change the noise stream either
    const noFrag: D.DegradeParams = { ...full };
    delete noFrag.fragments;
    expect(same(D.degrade(img, noFrag), D.addNoise(D.degrade(img, { ...noFrag, noiseSigma: 0 }), 5, D.stageSeed(2025, 'noise')))).toBe(true);
    // changing the noise sigma does not change the fragment offsets
    expect(same(D.degrade(img, { seed: 2025, fragments: full.fragments! }), D.shiftFragments(img, rects, 0.25, 3, D.stageSeed(2025, 'fragments')))).toBe(true);
  });

  it('is deterministic and reacts to the master seed only through the random stages', () => {
    expect(same(D.degrade(img, full), D.degrade(img, { ...full }))).toBe(true);
    expect(same(D.degrade(img, full), D.degrade(img, { ...full, seed: 2026 }))).toBe(false);
    const noRandom: D.DegradeParams = { seed: 1, rotationDeg: 17, blurSigmaPx: 1 };
    expect(same(D.degrade(img, noRandom), D.degrade(img, { ...noRandom, seed: 2 }))).toBe(true);
  });
});

describe('compatibility with the decoder and the physical-card rasters', () => {
  it('a rendered 2x2 group degraded with a small rotation and blur still decodes to the right cards', () => {
    const base = composeGroup(ARR, { modulePx: 8 }).image;
    const degraded = D.degrade(base, { seed: 3, rotationDeg: 3.5, blurSigmaPx: 0.6, noiseSigma: 3, illumination: { strength: 0.2, directionDeg: 30 } });
    const r = decodeGroup(degraded);
    expect(r.kind).toBe('IDENTIFIED');
    if (r.kind === 'IDENTIFIED') {
      expect([...r.cards].sort()).toEqual(EXPECTED_CARDS);
      expect(r.hiddenSum).toBe(referenceSum(EXPECTED_CARDS));
    }
  });

  it('a mirrored and rotated picture is still read (the reflection is a view, the cards stay the same)', () => {
    const base = composeGroup(ARR, { modulePx: 8 }).image;
    const r = decodeGroup(D.degrade(base, { seed: 3, reflect: 'Fv', rotationDeg: 100 }));
    expect(r.kind).toBe('IDENTIFIED');
    if (r.kind === 'IDENTIFIED') expect([...r.cards].sort()).toEqual(EXPECTED_CARDS);
  });

  it('fragment offsets of 0.1 and 0.25 module on a rendered group still decode', () => {
    const { image, centers } = composeGroup(ARR, { modulePx: 8 });
    const rects = (['TL', 'TR', 'BL', 'BR'] as const).map((s) => D.markerFootprintRect(centers[s].x, centers[s].y, 8));
    for (const mag of [0.1, 0.25]) {
      const r = decodeGroup(D.shiftFragments(image, rects, mag, 8, 17));
      expect(r.kind).toBe('IDENTIFIED');
      if (r.kind === 'IDENTIFIED') expect([...r.cards].sort()).toEqual(EXPECTED_CARDS);
    }
  });

  it('a zero-strength composition decodes exactly like the original', () => {
    const base = composeGroup(ARR, { modulePx: 8 }).image;
    const zero = D.degrade(base, {
      seed: 1, reflect: 'none', rotationDeg: 0, perspective: { tiltDeg: 0, axisDeg: 0 }, illumination: { strength: 0, directionDeg: 0 }, blurSigmaPx: 0, noiseSigma: 0,
    });
    expect(same(zero, base)).toBe(true);
    expect(decodeGroup(zero)).toEqual(decodeGroup(base));
  });

  it('works on images of testing/physical-card.ts (observeFace, composeBoard) and keeps them deterministic', () => {
    const face = observeFace('H-5', 'FRONT', 0, undefined, { pxPerMm: 3, supersample: 2 }).image;
    const board = composeBoard(seededPlacements(7, 2, 2), {}, { pxPerMm: 2, supersample: 2 }).image;
    for (const src of [face, board]) {
      const p: D.DegradeParams = { seed: 4, reflect: 'Fh', rotationDeg: 12, perspective: { tiltDeg: 10, axisDeg: 20 }, illumination: { strength: 0.2, directionDeg: 10 }, blurSigmaPx: 0.8, noiseSigma: 2 };
      const before = clone(src);
      const a = D.degrade(src, p);
      expect(same(a, D.degrade(src, p))).toBe(true);
      expect(same(src, before)).toBe(true);
      expect(a.width).toBe(src.width);
      expect(a.height).toBe(src.height);
      expect(same(D.degrade(src, { seed: 4 }), src)).toBe(true);
    }
  });
});
