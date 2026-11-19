export const format = {
  version: '2.0.0-m3.1',
  square: 16,
  piece: 8,
  quiet: 1,
  moduleMm: 1.5875,
  radiusMm: 3.175,
} as const;

export const corners = ['TL', 'TR', 'BL', 'BR'] as const;
export type Corner = typeof corners[number];
export type Suit = 'H' | 'D' | 'C' | 'S';
export type Orientation = 0 | 180;
export type Offset = readonly [x: number, y: number];
export type Rect = readonly [left: number, top: number, right: number, bottom: number];

export const opposite: Readonly<Record<Corner, Corner>> = { TL: 'BR', TR: 'BL', BL: 'TR', BR: 'TL' };
export const mirrorX: Readonly<Record<Corner, Corner>> = { TL: 'TR', TR: 'TL', BL: 'BR', BR: 'BL' };

// Corner positions transcribed from V1 Requirement 14.1. V2 uses its own data layout.
export const printedCorners: Readonly<Record<Suit, readonly [Corner, Corner]>> = {
  H: ['TL', 'BR'],
  D: ['TR', 'BL'],
  C: ['TR', 'BR'],
  S: ['TL', 'BL'],
};

export const dataCells: readonly Offset[] = [2, 3, 4, 5]
  .flatMap((v) => [2, 3, 4, 5].map((u): Offset => [u, v]))
  .slice(1);
export const criticalFrame: readonly Rect[] = [[7, 1, 8, 8], [1, 7, 7, 8]];
export const noData = -1;
export const lightField = 1;
export const darkFrame = 2;
