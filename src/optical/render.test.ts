import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ALL_CARDS, placedFragments, visibleCorners, type Corner, type Orientation } from './fragments';
import {
  CARD_H_MOD,
  CARD_W_MOD,
  FOOTPRINT_MOD,
  applyImageTransform,
  renderCardLayer,
  renderMarker,
  rotate180,
  reflectHorizontalAxis,
  sampleMarkerBits,
  slotOrigin,
  type GrayImage,
} from './render';
import { applyTransform, TRANSFORM_NAMES, type TransformName } from './transforms';

const FROZEN = JSON.parse(
  readFileSync(fileURLToPath(new URL('./codebook.v1.json', import.meta.url)), 'utf8'),
) as { patterns: Record<string, number> };
const BASES = ALL_CARDS.map((k) => FROZEN.patterns[k] as number);
const CORNERS: Corner[] = ['TL', 'TR', 'BL', 'BR'];
const suit = (c: string): string => c.charAt(0);

// ---- own reference helpers (independent of render.ts) ----
type PM = (r: number, c: number, l: number) => [number, number];
const MAPS: Record<TransformName, PM> = {
  I: (r, c) => [r, c],
  R90: (r, c, l) => [c, l - r],
  R180: (r, c, l) => [l - r, l - c],
  R270: (r, c, l) => [l - c, r],
  Fh: (r, c, l) => [l - r, c],
  Fv: (r, c, l) => [r, l - c],
  Dm: (r, c) => [c, r],
  Da: (r, c, l) => [l - c, l - r],
};
function ownTransform(g: TransformName, img: GrayImage): GrayImage {
  const n = img.width;
  const out = new Uint8Array(n * n);
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const [r2, c2] = MAPS[g](r, c, n - 1);
      out[r2 * n + c2] = img.data[r * n + c] as number;
    }
  return { width: n, height: n, data: out };
}
function ownRot180(img: GrayImage): GrayImage {
  const out = new Uint8Array(img.data.length);
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      out[(img.height - 1 - y) * img.width + (img.width - 1 - x)] = img.data[y * img.width + x] as number;
  return { width: img.width, height: img.height, data: out };
}
function ownRowReverse(img: GrayImage): GrayImage {
  const out = new Uint8Array(img.data.length);
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) out[(img.height - 1 - y) * img.width + x] = img.data[y * img.width + x] as number;
  return { width: img.width, height: img.height, data: out };
}
const same = (a: GrayImage, b: GrayImage): boolean =>
  a.width === b.width && a.height === b.height && Buffer.from(a.data).equals(Buffer.from(b.data));
const px = (img: GrayImage, x: number, y: number): number => img.data[y * img.width + x] as number;
function ham(a: number, b: number): number {
  let x = (a ^ b) >>> 0;
  let n = 0;
  while (x) {
    n += x & 1;
    x >>>= 1;
  }
  return n;
}
/** Own tiny pixel-level marker reader: top-left pixel of module (m = x, n = y); checks module uniformity. */
function readModule(img: GrayImage, x0: number, y0: number, m: number, n: number, mp: number): number {
  const v = px(img, x0 + m * mp, y0 + n * mp);
  for (let y = 0; y < mp; y++) for (let x = 0; x < mp; x++) expect(px(img, x0 + m * mp + x, y0 + n * mp + y)).toBe(v);
  return v;
}
/** Own footprint origin in pixels (module coordinates derived from the layout: 1 module card margin). */
function ownOrigin(c: Corner, mp: number): { x: number; y: number } {
  const xm = c === 'TL' || c === 'BL' ? 1 : CARD_W_MOD - FOOTPRINT_MOD - 1;
  const ym = c === 'TL' || c === 'TR' ? 1 : CARD_H_MOD - FOOTPRINT_MOD - 1;
  return { x: xm * mp, y: ym * mp };
}
const hashLayers = (mp: number): string => {
  const h = createHash('sha256');
  for (const card of ALL_CARDS) for (const o of [0, 180] as const) h.update(renderCardLayer(card, o, { modulePx: mp }).data);
  return h.digest('hex');
};

describe('renderMarker geometry', () => {
  for (const mp of [1, 2, 4, 8]) {
    it(`modulePx ${mp}: size, margin ring, border ring, data cells`, () => {
      for (const P of BASES) {
        const img = renderMarker(P, mp);
        expect(img.width).toBe(9 * mp);
        expect(img.height).toBe(9 * mp);
        expect(img.data.length).toBe(81 * mp * mp);
        for (let n = 0; n < 9; n++)
          for (let m = 0; m < 9; m++) {
            const v = readModule(img, 0, 0, m, n, mp);
            if (m === 0 || m === 8 || n === 0 || n === 8) expect(v).toBe(255);
            else if (m === 1 || m === 7 || n === 1 || n === 7) expect(v).toBe(0);
            else {
              const bit = (P >>> (5 * (n - 2) + (m - 2))) & 1;
              expect(v).toBe(bit ? 0 : 255);
            }
          }
      }
    });
  }
});

describe('raster-level transform equivalence (Property 21)', () => {
  for (const mp of [1, 2, 3]) {
    it(`render(applyTransform(g,P)) == ownTransform(g, render(P)) == applyImageTransform, modulePx ${mp}`, () => {
      for (const P of BASES)
        for (const g of TRANSFORM_NAMES) {
          const base = renderMarker(P, mp);
          const viaPattern = renderMarker(applyTransform(g, P), mp);
          const viaOwn = ownTransform(g, base);
          expect(same(viaPattern, viaOwn), `pattern-vs-own g=${g} P=${P}`).toBe(true);
          expect(same(applyImageTransform(g, base), viaOwn), `module-vs-own g=${g} P=${P}`).toBe(true);
        }
    });
  }
});

describe('card layer symmetry (Property 14)', () => {
  for (const mp of [2, 4]) {
    it(`modulePx ${mp}: H/D point symmetric, C/S reflection symmetric, and not the other`, () => {
      for (const card of ALL_CARDS) {
        const l0 = renderCardLayer(card, 0, { modulePx: mp });
        const s = suit(card);
        if (s === 'H' || s === 'D') {
          expect(same(l0, ownRot180(l0)), card).toBe(true);
          expect(same(l0, ownRowReverse(l0)), card).toBe(false);
        } else {
          expect(same(l0, ownRowReverse(l0)), card).toBe(true);
          expect(same(l0, ownRot180(l0)), card).toBe(false);
        }
      }
    });

    it(`modulePx ${mp}: physical rotation law layer(180) == rot180(layer(0))`, () => {
      for (const card of ALL_CARDS) {
        const l0 = renderCardLayer(card, 0, { modulePx: mp });
        const l180 = renderCardLayer(card, 180, { modulePx: mp });
        expect(same(l180, ownRot180(l0)), card).toBe(true);
        expect(same(l180, rotate180(l0)), card).toBe(true);
        expect(same(reflectHorizontalAxis(l0), ownRowReverse(l0))).toBe(true);
        const s = suit(card);
        expect(same(l180, l0), card).toBe(s === 'H' || s === 'D');
      }
    });
  }
});

describe('blank corners and layer size', () => {
  for (const mp of [1, 2, 4]) {
    it(`modulePx ${mp}`, () => {
      const fp = FOOTPRINT_MOD * mp;
      for (const card of ALL_CARDS)
        for (const o of [0, 180] as const) {
          const layer = renderCardLayer(card, o, { modulePx: mp });
          expect(layer.width).toBe(CARD_W_MOD * mp);
          expect(layer.height).toBe(CARD_H_MOD * mp);
          expect(layer.data.length).toBe(CARD_W_MOD * CARD_H_MOD * mp * mp);
          const printed = visibleCorners(card, o);
          expect(printed.length).toBe(2);
          const inPrinted = new Uint8Array(layer.data.length);
          for (const c of CORNERS) {
            const { x, y } = ownOrigin(c, mp);
            let nonWhite = 0;
            for (let j = 0; j < fp; j++)
              for (let i = 0; i < fp; i++) {
                if (px(layer, x + i, y + j) !== 255) nonWhite++;
                if (printed.includes(c)) inPrinted[(y + j) * layer.width + x + i] = 1;
              }
            if (printed.includes(c)) expect(nonWhite, `${card} ${o} ${c}`).toBeGreaterThan(0);
            else expect(nonWhite, `${card} ${o} ${c}`).toBe(0);
          }
          let outside = 0;
          for (let i = 0; i < layer.data.length; i++) if (!inPrinted[i] && layer.data[i] !== 255) outside++;
          expect(outside, `${card} ${o}`).toBe(0);
        }
    });
  }
});

describe('slot geometry', () => {
  for (let mp = 1; mp <= 8; mp++) {
    it(`modulePx ${mp}: TL/BR point-symmetric, TL/BL and TR/BR mirror about horizontal axis`, () => {
      const W = CARD_W_MOD * mp;
      const H = CARD_H_MOD * mp;
      const f = FOOTPRINT_MOD * mp;
      const tl = slotOrigin('TL', mp);
      const tr = slotOrigin('TR', mp);
      const bl = slotOrigin('BL', mp);
      const br = slotOrigin('BR', mp);
      expect(tl.x + br.x + f).toBe(W);
      expect(tl.y + br.y + f).toBe(H);
      expect(tr.x + bl.x + f).toBe(W);
      expect(tr.y + bl.y + f).toBe(H);
      expect(tl.x).toBe(bl.x);
      expect(tl.y + bl.y + f).toBe(H);
      expect(tr.x).toBe(br.x);
      expect(tr.y + br.y + f).toBe(H);
      expect(tl).toEqual(ownOrigin('TL', mp));
      expect(br).toEqual(ownOrigin('BR', mp));
    });
  }
});

describe('marker readback against the model (not a decoder test)', () => {
  it('sampleMarkerBits at each printed corner equals placedFragments', () => {
    for (const mp of [1, 2, 4])
      for (const card of ALL_CARDS)
        for (const o of [0, 180] as const) {
          const layer = renderCardLayer(card, o, { modulePx: mp });
          const placed = placedFragments(card, o);
          for (const c of visibleCorners(card, o)) {
            const { x, y } = slotOrigin(c, mp);
            expect(sampleMarkerBits(layer, x, y, mp), `${card} ${o} ${c}`).toBe(placed[c]);
          }
        }
  });
});

describe('determinism and input validation', () => {
  it('renders are byte-identical and hashes repeat', () => {
    expect(same(renderCardLayer('S-Q', 180), renderCardLayer('S-Q', 180))).toBe(true);
    expect(same(renderMarker(BASES[0] as number, 4), renderMarker(BASES[0] as number, 4))).toBe(true);
    expect(hashLayers(2)).toBe(hashLayers(2));
  });
  it.each([[0], [-1], [1.5], [NaN], ['2']])('modulePx %j throws RangeError', (bad) => {
    expect(() => renderMarker(1, bad as number)).toThrow(RangeError);
    expect(() => renderCardLayer('H-A', 0, { modulePx: bad as number })).toThrow(RangeError);
    expect(() => slotOrigin('TL', bad as number)).toThrow(RangeError);
  });
});

describe('fast-check properties', () => {
  const cardArb = fc.constantFrom(...ALL_CARDS);
  const oriArb = fc.constantFrom<Orientation>(0, 180);
  const pxArb = fc.integer({ min: 1, max: 6 });

  it('layer(card,180) == ownRot180(layer(card,0)) and layer(card,0) == ownRot180(layer(card,180))', () => {
    fc.assert(
      fc.property(cardArb, oriArb, pxArb, (card, o, mp) => {
        const a = renderCardLayer(card, o, { modulePx: mp });
        const b = renderCardLayer(card, o === 0 ? 180 : 0, { modulePx: mp });
        return same(b, ownRot180(a));
      }),
      { numRuns: 150, seed: 20251112 },
    );
  });

  it('suit symmetry invariants hold', () => {
    fc.assert(
      fc.property(cardArb, pxArb, (card, mp) => {
        const l0 = renderCardLayer(card, 0, { modulePx: mp });
        const s = suit(card);
        if (s === 'H' || s === 'D') return same(l0, ownRot180(l0)) && !same(l0, ownRowReverse(l0));
        return same(l0, ownRowReverse(l0)) && !same(l0, ownRot180(l0));
      }),
      { numRuns: 150, seed: 20251112 },
    );
  });

  it('club/spade shared corners differ by >= 5 bits', () => {
    const ranks = ALL_CARDS.filter((k) => suit(k) === 'C').map((k) => k.slice(2));
    fc.assert(
      fc.property(fc.constantFrom(...ranks), fc.constantFrom(...ranks), (rc, rs) => {
        const c180 = placedFragments(`C-${rc}`, 180);
        const s0 = placedFragments(`S-${rs}`, 0);
        const c0 = placedFragments(`C-${rc}`, 0);
        const s180 = placedFragments(`S-${rs}`, 180);
        return (
          ham(c180.TL as number, s0.TL as number) >= 5 &&
          ham(c180.BL as number, s0.BL as number) >= 5 &&
          ham(c0.TR as number, s180.TR as number) >= 5 &&
          ham(c0.BR as number, s180.BR as number) >= 5
        );
      }),
      { numRuns: 150, seed: 20251112 },
    );
  });
});
