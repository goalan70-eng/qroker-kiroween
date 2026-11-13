/**
 * Deterministic synthetic rasterizer for marker fragments and card layers.
 * Pure, no dependencies. 255 = white, 0 = black, row-major.
 */
import { placedFragments, type Corner, type Orientation } from './fragments';
import type { TransformName } from './transforms';

export interface GrayImage {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Marker footprint in modules: 1 margin + 7x7 (border + 5x5 data) + 1 margin. */
export const FOOTPRINT_MOD = 9;
/**
 * Prototype card layout in modules (ratio close to a poker card).
 * The physical card size and print quality are UNVERIFIED.
 */
export const CARD_W_MOD = 40;
export const CARD_H_MOD = 56;
export const DEFAULT_MODULE_PX = 4;

function checkModulePx(modulePx: number): void {
  if (!Number.isInteger(modulePx) || modulePx <= 0) {
    throw new RangeError(`modulePx must be a positive integer, got ${String(modulePx)}`);
  }
}

function blank(width: number, height: number): GrayImage {
  return { width, height, data: new Uint8Array(width * height).fill(255) };
}

function fillModule(img: GrayImage, mx: number, my: number, modulePx: number, value: number): void {
  for (let y = 0; y < modulePx; y++) {
    const row = (my * modulePx + y) * img.width + mx * modulePx;
    img.data.fill(value, row, row + modulePx);
  }
}

/** Renders one marker footprint (9x9 modules). Data bit i = 5r+c, set = black. */
export function renderMarker(pattern25: number, modulePx: number): GrayImage {
  checkModulePx(modulePx);
  const size = FOOTPRINT_MOD * modulePx;
  const img = blank(size, size);
  for (let m = 1; m <= 7; m++) {
    for (let n = 1; n <= 7; n++) {
      const border = m === 1 || m === 7 || n === 1 || n === 7;
      if (border) {
        fillModule(img, m, n, modulePx, 0);
      } else {
        const r = n - 2;
        const c = m - 2;
        if ((pattern25 >> (5 * r + c)) & 1) fillModule(img, m, n, modulePx, 0);
      }
    }
  }
  return img;
}

/** Top-left pixel of a corner slot's 9x9 footprint in the card layer. */
export function slotOrigin(corner: Corner, modulePx: number): { x: number; y: number } {
  checkModulePx(modulePx);
  const xm = corner === 'TL' || corner === 'BL' ? 1 : CARD_W_MOD - FOOTPRINT_MOD - 1;
  const ym = corner === 'TL' || corner === 'TR' ? 1 : CARD_H_MOD - FOOTPRINT_MOD - 1;
  return { x: xm * modulePx, y: ym * modulePx };
}

/** Rotates any image by 180 degrees. */
export function rotate180(img: GrayImage): GrayImage {
  const out = blank(img.width, img.height);
  const n = img.data.length;
  for (let i = 0; i < n; i++) out.data[n - 1 - i] = img.data[i] as number;
  return out;
}

/** Reflects about the horizontal axis (reverses row order). */
export function reflectHorizontalAxis(img: GrayImage): GrayImage {
  const out = blank(img.width, img.height);
  for (let y = 0; y < img.height; y++) {
    const src = y * img.width;
    const dst = (img.height - 1 - y) * img.width;
    out.data.set(img.data.subarray(src, src + img.width), dst);
  }
  return out;
}

type PixMap = (r: number, c: number, last: number) => readonly [number, number];
const PIX_MAPS: Record<TransformName, PixMap> = {
  I: (r, c) => [r, c],
  R90: (r, c, l) => [c, l - r],
  R180: (r, c, l) => [l - r, l - c],
  R270: (r, c, l) => [l - c, r],
  Fh: (r, c, l) => [l - r, c],
  Fv: (r, c, l) => [r, l - c],
  Dm: (r, c) => [c, r],
  Da: (r, c, l) => [l - c, l - r],
};

/** Applies one of the 8 D4 transforms to a square image; same rule as the 5x5 pattern transforms. */
export function applyImageTransform(g: TransformName, img: GrayImage): GrayImage {
  if (img.width !== img.height) throw new RangeError('applyImageTransform requires a square image');
  const n = img.width;
  const out = blank(n, n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const [r2, c2] = PIX_MAPS[g](r, c, n - 1);
      out.data[r2 * n + c2] = img.data[r * n + c] as number;
    }
  }
  return out;
}

/**
 * Reads the 25 data cells of a marker whose 9x9 footprint starts at (x0, y0), sampling the
 * centre pixel of each module (threshold 128). Known-geometry inspection aid, NOT a decoder.
 */
export function sampleMarkerBits(img: GrayImage, x0: number, y0: number, modulePx: number): number {
  checkModulePx(modulePx);
  let bits = 0;
  const half = Math.floor(modulePx / 2);
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const x = x0 + (2 + c) * modulePx + half;
      const y = y0 + (2 + r) * modulePx + half;
      const v = img.data[y * img.width + x] as number;
      if (v < 128) bits |= 1 << (5 * r + c);
    }
  }
  return bits >>> 0;
}

function blit(dst: GrayImage, src: GrayImage, x0: number, y0: number): void {
  for (let y = 0; y < src.height; y++) {
    const s = y * src.width;
    dst.data.set(src.data.subarray(s, s + src.width), (y0 + y) * dst.width + x0);
  }
}

/** Composes the placed fragments of a card onto an all-white card layer. */
export function renderCardLayer(
  card: string,
  orientation: Orientation,
  opts: { modulePx?: number } = {},
): GrayImage {
  const modulePx = opts.modulePx ?? DEFAULT_MODULE_PX;
  checkModulePx(modulePx);
  const placed = placedFragments(card, orientation);
  const layer = blank(CARD_W_MOD * modulePx, CARD_H_MOD * modulePx);
  for (const corner of ['TL', 'TR', 'BL', 'BR'] as const) {
    const p = placed[corner];
    if (p === undefined) continue;
    const { x, y } = slotOrigin(corner, modulePx);
    blit(layer, renderMarker(p, modulePx), x, y);
  }
  return layer;
}
