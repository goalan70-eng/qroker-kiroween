import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ALL_CARDS,
  placedFragments,
  printedFragments,
  visibleCorners,
  type Corner,
  type Orientation,
} from './fragments';

const JSON_PATH = fileURLToPath(new URL('./codebook.v1.json', import.meta.url));
const FROZEN_SHA256 = '515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4';
const sha256File = (): string => createHash('sha256').update(readFileSync(JSON_PATH)).digest('hex').toUpperCase();
const FROZEN = JSON.parse(readFileSync(JSON_PATH, 'utf8')) as { patterns: Record<string, number> };

// ---- own reference helpers (independent of transforms.ts) ----
type Map5 = (r: number, c: number) => [number, number];
const L = 4;
const OWN: Record<string, Map5> = {
  I: (r, c) => [r, c],
  R90: (r, c) => [c, L - r],
  R180: (r, c) => [L - r, L - c],
  R270: (r, c) => [L - c, r],
  Fh: (r, c) => [L - r, c], // reflect about horizontal axis: rows reversed
  Fv: (r, c) => [r, L - c],
  Dm: (r, c) => [c, r],
  Da: (r, c) => [L - c, L - r],
};
function tp(g: string, p: number): number {
  let out = 0;
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++)
      if ((p >>> (5 * r + c)) & 1) {
        const [r2, c2] = (OWN[g] as Map5)(r, c);
        out |= 1 << (5 * r2 + c2);
      }
  return out >>> 0;
}
const ham = (a: number, b: number): number => {
  let x = (a ^ b) >>> 0;
  let n = 0;
  while (x) {
    n += x & 1;
    x >>>= 1;
  }
  return n;
};
const OPP: Record<Corner, Corner> = { TL: 'BR', BR: 'TL', TR: 'BL', BL: 'TR' };
const PRINTED: Record<string, [Corner, Corner]> = {
  H: ['TL', 'BR'],
  D: ['TR', 'BL'],
  C: ['TR', 'BR'],
  S: ['TL', 'BL'],
};
const VIS180: Record<string, Corner[]> = {
  H: ['TL', 'BR'],
  D: ['TR', 'BL'],
  C: ['TL', 'BL'],
  S: ['TR', 'BR'],
};
const suit = (c: string): string => c.charAt(0);
const sortedKeys = (o: object): string[] => Object.keys(o).sort();
const CORNERS: Corner[] = ['TL', 'TR', 'BL', 'BR'];

describe('printedFragments', () => {
  it('holds exactly the expected corners with base from JSON and derived via own transform', () => {
    expect(ALL_CARDS.length).toBe(52);
    for (const card of ALL_CARDS) {
      const s = suit(card);
      const [baseC, derC] = PRINTED[s] as [Corner, Corner];
      const p = printedFragments(card);
      expect(sortedKeys(p)).toEqual([baseC, derC].sort());
      const base = FROZEN.patterns[card] as number;
      expect(p[baseC]).toBe(base);
      const via = s === 'H' || s === 'D' ? 'R180' : 'Fh';
      const derived = tp(via, base);
      expect(p[derC]).toBe(derived);
      expect(ham(base, derived)).toBeGreaterThanOrEqual(5);
      const orbit = Object.keys(OWN).map((g) => tp(g, base));
      expect(orbit).toContain(derived);
    }
  });
});

describe('placedFragments / visibleCorners', () => {
  it('visible corners match the table at 0 and 180', () => {
    for (const card of ALL_CARDS) {
      const s = suit(card);
      expect([...visibleCorners(card, 0)].sort()).toEqual([...(PRINTED[s] as Corner[])].sort());
      expect([...visibleCorners(card, 180)].sort()).toEqual([...(VIS180[s] as Corner[])].sort());
      expect(sortedKeys(placedFragments(card, 0))).toEqual([...(PRINTED[s] as Corner[])].sort());
      expect(sortedKeys(placedFragments(card, 180))).toEqual([...(VIS180[s] as Corner[])].sort());
    }
  });

  /*
   * Content rule: visible180[Y] = R180(printed[opposite(Y)]).
   * With printed H: TL=P, BR=R180.P ; D: TR=P, BL=R180.P ; C: TR=P, BR=Fh.P ; S: TL=P, BL=Fh.P:
   *  H, D: 180 content equals 0 content corner by corner (R180.R180.P = P, R180.P stays).
   *  C: TL = R180.Fh.P = Fv.P, BL = R180.P   (not the 0 content; suit-dependent mirror-image).
   *  S: TR = R180.Fh.P = Fv.P, BR = R180.P.
   */
  it('180 content follows visible[Y] = R180(printed[opposite(Y)]) and the per-suit derivation', () => {
    for (const card of ALL_CARDS) {
      const s = suit(card);
      const printed = printedFragments(card);
      const p0 = placedFragments(card, 0);
      const p180 = placedFragments(card, 180);
      for (const y of CORNERS) {
        const src = printed[OPP[y]];
        if (src === undefined) expect(p180[y]).toBeUndefined();
        else expect(p180[y]).toBe(tp('R180', src));
      }
      const P = FROZEN.patterns[card] as number;
      if (s === 'H' || s === 'D') {
        expect(p180).toEqual(p0);
      } else if (s === 'C') {
        expect(p180).toEqual({ TL: tp('Fv', P), BL: tp('R180', P) });
      } else {
        expect(p180).toEqual({ TR: tp('Fv', P), BR: tp('R180', P) });
      }
    }
  });

  it('club and spade patterns differ by >= 5 bits at every shared corner (suit identifiable)', () => {
    const clubs = ALL_CARDS.filter((c) => suit(c) === 'C');
    const spades = ALL_CARDS.filter((c) => suit(c) === 'S');
    expect(clubs.length).toBe(13);
    expect(spades.length).toBe(13);
    for (const c of clubs)
      for (const s of spades) {
        const c180 = placedFragments(c, 180);
        const s0 = placedFragments(s, 0);
        for (const k of ['TL', 'BL'] as const) {
          expect(ham(c180[k] as number, s0[k] as number)).toBeGreaterThanOrEqual(5);
        }
        const c0 = placedFragments(c, 0);
        const s180 = placedFragments(s, 180);
        for (const k of ['TR', 'BR'] as const) {
          expect(ham(c0[k] as number, s180[k] as number)).toBeGreaterThanOrEqual(5);
        }
      }
  });
});

describe('rejection', () => {
  const badOrientations: unknown[] = [90, 270, -90, 360, 1, NaN, '0', '180', null, undefined];
  it.each(badOrientations.map((o) => [String(o), o]))('orientation %s throws RangeError', (_n, o) => {
    expect(() => placedFragments('H-A', o as Orientation)).toThrow(RangeError);
    expect(() => visibleCorners('H-A', o as Orientation)).toThrow(RangeError);
  });

  const badKeys = ['JK', 'JOKER', 'X-JOKER', '', 'H-1', 'H-11', 'X-A', 'h-a'];
  it.each(badKeys.map((k) => [k]))('card key %j throws', (k) => {
    expect(() => printedFragments(k)).toThrow();
    expect(() => placedFragments(k, 0)).toThrow();
    expect(() => placedFragments(k, 180)).toThrow();
    expect(() => visibleCorners(k, 0)).toThrow();
  });

  it('ALL_CARDS has 52 unique keys and no joker', () => {
    expect(new Set(ALL_CARDS).size).toBe(52);
    expect(ALL_CARDS.some((k) => /JK|JOKER/i.test(k))).toBe(false);
    for (const k of ALL_CARDS) expect(k).toMatch(/^[HDCS]-(A|10|[2-9]|J|Q|K)$/);
  });

  it('every placed corner is derived from printed patterns (no substitute pattern)', () => {
    const allowed = new Set<number>();
    for (const card of ALL_CARDS)
      for (const v of Object.values(printedFragments(card))) {
        allowed.add(v as number);
        allowed.add(tp('R180', v as number));
      }
    for (const card of ALL_CARDS)
      for (const o of [0, 180] as const)
        for (const v of Object.values(placedFragments(card, o))) expect(allowed.has(v as number)).toBe(true);
  });
});

describe('frozen codebook integrity', () => {
  it('using the module does not change the frozen JSON bytes', async () => {
    expect(sha256File()).toBe(FROZEN_SHA256);
    const mod = await import('./fragments');
    for (const c of mod.ALL_CARDS) {
      mod.placedFragments(c, 0);
      mod.placedFragments(c, 180);
    }
    expect(sha256File()).toBe(FROZEN_SHA256);
  });
});
