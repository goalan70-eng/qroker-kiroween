/**
 * The 8 D4 transforms on the 5x5 data grid (design.md, Optical Marker System, section 3).
 * Bit index i = 5r + c; bit i of a pattern is (p >> i) & 1.
 * Rule: (g.P)[g(x)] = P[x].
 */

export const TRANSFORM_NAMES = ['I', 'R90', 'R180', 'R270', 'Fh', 'Fv', 'Dm', 'Da'] as const;
export type TransformName = (typeof TRANSFORM_NAMES)[number];

export const GRID = 5;
export const CELLS = 25;

type CellMap = (r: number, c: number) => readonly [number, number];

export const CELL_MAPS: Record<TransformName, CellMap> = {
  I: (r, c) => [r, c],
  R90: (r, c) => [c, 4 - r],
  R180: (r, c) => [4 - r, 4 - c],
  R270: (r, c) => [4 - c, r],
  Fh: (r, c) => [4 - r, c],
  Fv: (r, c) => [r, 4 - c],
  Dm: (r, c) => [c, r],
  Da: (r, c) => [4 - c, 4 - r],
};

function buildPermutation(g: TransformName): readonly number[] {
  const perm: number[] = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const [r2, c2] = CELL_MAPS[g](r, c);
      perm[GRID * r + c] = GRID * r2 + c2;
    }
  }
  return perm;
}

/** BIT_PERMUTATIONS[g][i] = destination bit index of source bit i. */
export const BIT_PERMUTATIONS: Record<TransformName, readonly number[]> = Object.fromEntries(
  TRANSFORM_NAMES.map((g) => [g, buildPermutation(g)]),
) as Record<TransformName, readonly number[]>;

/** Returns g.P as a 25-bit integer: out[perm[i]] = in[i]. */
export function applyTransform(g: TransformName, pattern25: number): number {
  const perm = BIT_PERMUTATIONS[g];
  let out = 0;
  for (let i = 0; i < CELLS; i++) {
    if ((pattern25 >> i) & 1) out |= 1 << (perm[i] as number);
  }
  return out >>> 0;
}
