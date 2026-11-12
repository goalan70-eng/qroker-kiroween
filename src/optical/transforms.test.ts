import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CELL_MAPS, TRANSFORM_NAMES, applyTransform, type TransformName } from './transforms';

const FROZEN = JSON.parse(
  readFileSync(fileURLToPath(new URL('./codebook.v1.json', import.meta.url)), 'utf8'),
) as { patterns: Record<string, number> };
const BASES = Object.values(FROZEN.patterns);

const cellPerm = (g: TransformName): number[] => {
  const p: number[] = [];
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++) {
      const [r2, c2] = CELL_MAPS[g](r, c);
      p[5 * r + c] = 5 * r2 + c2;
    }
  return p;
};

describe('D4 cell maps', () => {
  it('each map is a bijection on the 25 cells', () => {
    for (const g of TRANSFORM_NAMES) {
      const p = cellPerm(g);
      expect(p).toHaveLength(25);
      expect([...p].sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, i) => i));
    }
  });

  it('the 8 maps are distinct, closed under composition, and have inverses in the set', () => {
    const perms = TRANSFORM_NAMES.map(cellPerm);
    const keys = new Set(perms.map((p) => p.join(',')));
    expect(keys.size).toBe(8);
    for (const a of perms) {
      for (const b of perms) {
        const comp = a.map((x) => b[x] as number);
        expect(keys.has(comp.join(','))).toBe(true);
      }
      const hasInverse = perms.some((b) => a.every((x, i) => b[x] === i));
      expect(hasInverse).toBe(true);
    }
    expect(keys.has(Array.from({ length: 25 }, (_, i) => i).join(','))).toBe(true);
  });

  it('known cell checks', () => {
    expect(CELL_MAPS.R180(0, 0)).toEqual([4, 4]);
    expect(CELL_MAPS.R90(0, 0)).toEqual([0, 4]);
    for (let k = 0; k < 5; k++) {
      expect(CELL_MAPS.Fh(0, k)).toEqual([4, k]);
      expect(CELL_MAPS.Fv(k, 0)).toEqual([k, 4]);
      for (let j = 0; j < 5; j++) expect(CELL_MAPS.Dm(k, j)).toEqual([j, k]);
    }
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 5; c++) {
        let cur: readonly [number, number] = [r, c];
        for (let n = 0; n < 4; n++) cur = CELL_MAPS.R90(cur[0], cur[1]);
        expect(cur).toEqual([r, c]);
      }
  });
});

// Independent 5x5 matrix implementation.
type M = number[][];
const toMatrix = (p: number): M =>
  Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, c) => (p >>> (5 * r + c)) & 1));
const reverseRows = (m: M): M => [...m].reverse();
const reverseEach = (m: M): M => m.map((row) => [...row].reverse());
const transpose = (m: M): M => m.map((_, i) => m.map((row) => row[i] as number));
const rotCW = (m: M): M => reverseEach(transpose(m));
const MATRIX_OPS: Record<TransformName, (m: M) => M> = {
  I: (m) => m.map((r) => [...r]),
  R90: rotCW,
  R180: (m) => reverseEach(reverseRows(m)),
  R270: (m) => rotCW(rotCW(rotCW(m))),
  Fh: reverseRows,
  Fv: reverseEach,
  Dm: transpose,
  Da: (m) => reverseRows(reverseEach(transpose(m))),
};

describe('equivalence with 2D matrix operations (Property 21 partial)', () => {
  it('applyTransform matches the independent matrix op for 52 base patterns x 8 transforms', () => {
    expect(BASES).toHaveLength(52);
    for (const p of BASES)
      for (const g of TRANSFORM_NAMES)
        expect(toMatrix(applyTransform(g, p))).toEqual(MATRIX_OPS[g](toMatrix(p)));
  });
});

const pat = fc.integer({ min: 0, max: 2 ** 25 - 1 });
const popc = (x: number) => {
  let n = 0;
  for (let i = 0; i < 25; i++) n += (x >>> i) & 1;
  return n;
};
const OPT = { numRuns: 200, seed: 20251112 };

describe('algebra on patterns', () => {
  it('R180^2 = Fh^2 = R90^4 = identity', () => {
    fc.assert(
      fc.property(pat, (p) => {
        const r90 = (x: number) => applyTransform('R90', x);
        return (
          applyTransform('R180', applyTransform('R180', p)) === p &&
          applyTransform('Fh', applyTransform('Fh', p)) === p &&
          r90(r90(r90(r90(p)))) === p
        );
      }),
      OPT,
    );
  });

  it('every transform preserves popcount', () => {
    fc.assert(
      fc.property(pat, (p) => TRANSFORM_NAMES.every((g) => popc(applyTransform(g, p)) === popc(p))),
      OPT,
    );
  });
});

describe('symmetry rules', () => {
  it('R180-symmetric patterns satisfy R180.P == P', () => {
    fc.assert(
      fc.property(pat, (p) => {
        const s = (p | applyTransform('R180', p)) >>> 0;
        return applyTransform('R180', s) === s;
      }),
      OPT,
    );
  });

  it('Fh-symmetric patterns satisfy Fh.P == P', () => {
    fc.assert(
      fc.property(pat, (p) => {
        const s = (p | applyTransform('Fh', p)) >>> 0;
        return applyTransform('Fh', s) === s;
      }),
      OPT,
    );
  });

  it('frozen base patterns are not invariant under any non-identity transform', () => {
    for (const p of BASES)
      for (const g of TRANSFORM_NAMES)
        if (g !== 'I') expect(applyTransform(g, p)).not.toBe(p);
  });
});
