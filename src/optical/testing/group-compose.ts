/**
 * Test support for the group decoder (NOT production code). Builds REAL pixel images of four markers
 * around a vertex, flat card patches, and D4 / rotated copies of them. It reuses only fragments.ts
 * (placedFragments), render.ts and warp.ts; it never imports decode-group.ts, so the expected content of
 * each slot comes from the printed-layout logic and not from the decoder's own table.
 */
import { placedFragments, type Corner, type Orientation } from '../fragments';
import { FOOTPRINT_MOD, CARD_W_MOD, CARD_H_MOD, renderCardLayer, renderMarker, type GrayImage } from '../render';
import type { TransformName } from '../transforms';
import { blankImage, pasteImage, rotationMatrix, warpImage } from './warp';

export type SlotName = 'TL' | 'TR' | 'BL' | 'BR';
export const SLOT_NAMES: readonly SlotName[] = ['TL', 'TR', 'BL', 'BR'];
/** Corner of a card that faces the vertex: written out independently of the decoder. */
export const FACING: Record<SlotName, Corner> = { TL: 'BR', TR: 'BL', BL: 'TR', BR: 'TL' };

export interface Placement {
  card: string;
  orientation: Orientation;
}
export type Arrangement = Record<SlotName, Placement>;

/** Pattern the card shows towards the vertex in this slot, or undefined (blank corner). */
export function facingPattern(slot: SlotName, p: Placement): number | undefined {
  return placedFragments(p.card, p.orientation)[FACING[slot]];
}

export interface ComposeOptions {
  modulePx: number;
  /** Canvas edge in modules (default 32). The vertex is at the canvas centre. */
  canvasModules?: number;
  /** Replace the pattern of a slot (a number) or erase it (null). */
  override?: Partial<Record<SlotName, number | null>>;
}

export interface Composed {
  image: GrayImage;
  vertex: { x: number; y: number };
  /** Marker centres in pixels, per slot. */
  centers: Record<SlotName, { x: number; y: number }>;
}

/** Marker centres are at (+-5.5, +-5.5) modules from the vertex; footprints start 1 module from it. */
export function composeGroup(arr: Arrangement, o: ComposeOptions): Composed {
  const m = o.modulePx;
  const size = (o.canvasModules ?? 32) * m;
  const img = blankImage(size, size, 255);
  const v = { x: size / 2, y: size / 2 };
  const centers = {} as Composed['centers'];
  for (const s of SLOT_NAMES) {
    const sx = s === 'TL' || s === 'BL' ? -1 : 1;
    const sy = s === 'TL' || s === 'TR' ? -1 : 1;
    centers[s] = { x: v.x + sx * 5.5 * m, y: v.y + sy * 5.5 * m };
    const ov = o.override?.[s];
    const pat = ov === undefined ? facingPattern(s, arr[s]) : ov === null ? undefined : ov;
    if (pat === undefined) continue;
    const x0 = sx < 0 ? v.x - (1 + FOOTPRINT_MOD) * m : v.x + m;
    const y0 = sy < 0 ? v.y - (1 + FOOTPRINT_MOD) * m : v.y + m;
    pasteImage(img, renderMarker(pat, m), x0, y0);
  }
  return { image: img, vertex: v, centers };
}

/** One of the 8 D4 transforms of a (possibly non-square) image; same cell-map rule as transforms.ts. */
export function transformImage(img: GrayImage, g: TransformName): GrayImage {
  const W = img.width;
  const H = img.height;
  const swap = g === 'R90' || g === 'R270' || g === 'Dm' || g === 'Da';
  const out = blankImage(swap ? H : W, swap ? W : H, 0);
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      let r2: number;
      let c2: number;
      switch (g) {
        case 'I': [r2, c2] = [r, c]; break;
        case 'R90': [r2, c2] = [c, H - 1 - r]; break;
        case 'R180': [r2, c2] = [H - 1 - r, W - 1 - c]; break;
        case 'R270': [r2, c2] = [W - 1 - c, r]; break;
        case 'Fh': [r2, c2] = [H - 1 - r, c]; break;
        case 'Fv': [r2, c2] = [r, W - 1 - c]; break;
        case 'Dm': [r2, c2] = [c, r]; break;
        default: [r2, c2] = [W - 1 - c, H - 1 - r]; break;
      }
      out.data[r2 * out.width + c2] = img.data[r * W + c] as number;
    }
  }
  return out;
}

/** Rotates clockwise by deg about the image centre (same size, white background, bilinear). */
export function rotateImage(img: GrayImage, deg: number): GrayImage {
  return warpImage(img, rotationMatrix(deg, img.width / 2, img.height / 2), img.width, img.height, { background: 255 });
}

/**
 * Per slot, the distinct (suit, orientation) choices, found by trying a probe card of each suit and
 * dropping choices that give identical pixels (hearts/diamonds at 0 and 180).
 */
export function slotChoices(): Record<SlotName, Placement[]> {
  const out = {} as Record<SlotName, Placement[]>;
  for (const s of SLOT_NAMES) {
    const list: Placement[] = [];
    const seen = new Set<string>();
    for (const suit of ['H', 'D', 'C', 'S']) {
      for (const o of [0, 180] as const) {
        const p = { card: `${suit}-A`, orientation: o };
        const pat = facingPattern(s, p);
        if (pat === undefined) continue;
        // Distinct observed CONTENT relative to the base pattern: compare against the suit's other orientation.
        const other = facingPattern(s, { card: p.card, orientation: o === 0 ? 180 : 0 });
        const key = `${suit}:${pat === other ? 'same' : o}`;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push(p);
      }
    }
    out[s] = list;
  }
  return out;
}

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
/** Independent Card_Value lookup (A=1 .. 10, J=11, Q=12, K=13). */
export const REFERENCE_VALUE: Readonly<Record<string, number>> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13,
};
export function referenceSum(cards: readonly string[]): number {
  return cards.reduce((t, c) => t + (REFERENCE_VALUE[c.split('-')[1] as string] as number), 0);
}

export interface Patch {
  image: GrayImage;
  /** Pixel position of each interior vertex [row][col] between cards (row,col) .. (row+1,col+1). */
  vertices: Array<Array<{ x: number; y: number }>>;
}

/**
 * Flat patch of cards with zero gap (cards 40 x 56 modules). `grid[i][j]` is the card in row i, column j.
 * The canvas is padded by `padModules` on every side, then the whole canvas is positioned so that the
 * vertex `focus` = [row, col] is at the exact image centre (canvas size given in modules).
 */
export function flatPatch(
  grid: Placement[][],
  modulePx: number,
  canvasModules: { w: number; h: number },
  focus: [number, number],
): Patch {
  const W = canvasModules.w * modulePx;
  const H = canvasModules.h * modulePx;
  const img = blankImage(W, H, 255);
  const cw = CARD_W_MOD * modulePx;
  const ch = CARD_H_MOD * modulePx;
  const ox = W / 2 - (focus[1] + 1) * cw;
  const oy = H / 2 - (focus[0] + 1) * ch;
  grid.forEach((row, i) =>
    row.forEach((p, j) => pasteImage(img, renderCardLayer(p.card, p.orientation, { modulePx }), ox + j * cw, oy + i * ch)),
  );
  const vertices = [];
  for (let i = 0; i + 1 < grid.length; i++) {
    const r = [];
    for (let j = 0; j + 1 < (grid[0] as Placement[]).length; j++) r.push({ x: ox + (j + 1) * cw, y: oy + (i + 1) * ch });
    vertices.push(r);
  }
  return { image: img, vertices };
}
