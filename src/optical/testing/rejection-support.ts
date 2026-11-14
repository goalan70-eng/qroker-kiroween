/**
 * TEST SUPPORT ONLY (task 6.1, rejection tests for Property 15). Not production code.
 *
 * Everything here is used to BUILD inputs and to compute ground truth AFTER decoding. Nothing in this file is
 * passed to a production decoder: decodeGroup always receives only an image. The independent predictor below
 * (brute-force nearest template over the 416 templates, then a pattern-level hypothesis oracle) shares no code
 * with decode-group.ts. It only reuses placedFragments / applyTransform / transformImage, which other test
 * suites already verify against raster ground truth.
 *
 * SYNTHETIC images only; none of this is evidence about real cameras or real prints.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALL_CARDS, placedFragments, type Corner, type Orientation } from '../fragments';
import type { GrayImage } from '../render';
import { TRANSFORM_NAMES, applyTransform, type TransformName } from '../transforms';
import {
  RANKS,
  SLOT_NAMES,
  facingPattern,
  slotChoices,
  transformImage,
  type Arrangement,
  type Placement,
  type SlotName,
} from './group-compose';
import { blankImage, cropImage, pasteImage } from './warp';

// ---------------------------------------------------------------------------------------------
// Hamming helpers and the 416 templates (built from the frozen codebook file, read-only)
// ---------------------------------------------------------------------------------------------

export function popcount(x: number): number {
  let v = x >>> 0;
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return Math.imul(v, 0x01010101) >>> 24;
}

export const hamming = (a: number, b: number): number => popcount((a ^ b) >>> 0);

export interface Template {
  card: string;
  transform: TransformName;
  bits: number;
}

const FROZEN = JSON.parse(readFileSync(fileURLToPath(new URL('../codebook.v1.json', import.meta.url)), 'utf8')) as {
  cardOrder: string[];
  patterns: Record<string, number>;
};

/** 52 x 8 templates, card-major, transforms in TRANSFORM_NAMES order. */
export const TEMPLATES: readonly Template[] = FROZEN.cardOrder.flatMap((card) =>
  TRANSFORM_NAMES.map((transform) => ({ card, transform, bits: applyTransform(transform, FROZEN.patterns[card] as number) })),
);

export interface Nearest {
  distance: number;
  card: string;
  transform: TransformName;
  /** Bits of the nearest template (the first one in template order on a tie). */
  bits: number;
}

/** Brute-force nearest template. */
export function nearestTemplate(word: number): Nearest {
  let best: Template = TEMPLATES[0] as Template;
  let d = 99;
  for (const t of TEMPLATES) {
    const x = hamming(word, t.bits);
    if (x < d) {
      d = x;
      best = t;
    }
  }
  return { distance: d, card: best.card, transform: best.transform, bits: best.bits };
}

/** Smallest distance from `word` to any of the 8 templates of `card`. */
export function distanceToCard(word: number, card: string): number {
  let d = 99;
  for (const t of TEMPLATES) if (t.card === card) d = Math.min(d, hamming(word, t.bits));
  return d;
}

/** Smallest distance from `word` to any template of a card OTHER than `card`. */
export function distanceToOtherCards(word: number, card: string): number {
  let d = 99;
  for (const t of TEMPLATES) if (t.card !== card) d = Math.min(d, hamming(word, t.bits));
  return d;
}

/** Minimum Hamming distance between templates of different cards (independent re-computation; 5 for the frozen codebook). */
export function minCrossCardDistance(): number {
  let d = 99;
  for (let i = 0; i < TEMPLATES.length; i++) {
    for (let j = i + 1; j < TEMPLATES.length; j++) {
      const a = TEMPLATES[i] as Template;
      const b = TEMPLATES[j] as Template;
      if (a.card !== b.card) d = Math.min(d, hamming(a.bits, b.bits));
    }
  }
  return d;
}

/** All C(25, w) masks of weight w, ascending as numbers. */
export function masksOfWeight(w: number): number[] {
  const out: number[] = [];
  const rec = (start: number, left: number, mask: number): void => {
    if (left === 0) {
      out.push(mask >>> 0);
      return;
    }
    for (let i = start; i <= 25 - left; i++) rec(i + 1, left - 1, mask | (1 << i));
  };
  rec(0, w, 0);
  return out.sort((a, b) => a - b);
}

export const maskToBits = (mask: number): number[] => Array.from({ length: 25 }, (_, i) => i).filter((i) => (mask >>> i) & 1);
/** Data module of bit i in the marker's own frame (render.ts: bit 5r + c, r = row, c = column). */
export const bitToCell = (i: number): { row: number; col: number } => ({ row: Math.floor(i / 5), col: i % 5 });

// ---------------------------------------------------------------------------------------------
// Independent hypothesis oracle (pattern level) and whole-group predictor
// ---------------------------------------------------------------------------------------------

const MIRROR = new Set<TransformName>(['Fh', 'Fv', 'Dm', 'Da']);

/** Marker patterns that some card can show at each slot (all 52 cards x orientations). */
const PLACEABLE: Record<SlotName, Set<number>> = { TL: new Set(), TR: new Set(), BL: new Set(), BR: new Set() };
for (const c of ALL_CARDS) {
  for (const o of [0, 180] as const) {
    for (const s of SLOT_NAMES) {
      const p = facingPattern(s, { card: c, orientation: o });
      if (p !== undefined) PLACEABLE[s].add(p);
    }
  }
}

/** For an image transform g, where does each slot of a 2x2 go? Found by transforming a real 2x2 raster. */
function slotMap(g: TransformName): Record<SlotName, SlotName> {
  const img: GrayImage = { width: 2, height: 2, data: Uint8Array.from([0, 1, 2, 3]) };
  const t = transformImage(img, g);
  const out = {} as Record<SlotName, SlotName>;
  t.data.forEach((v, pos) => {
    out[SLOT_NAMES[v] as SlotName] = SLOT_NAMES[pos] as SlotName;
  });
  return out;
}

const PROBE = 0x0a3c5e1;
function inverseName(g: TransformName): TransformName {
  const hit = TRANSFORM_NAMES.find((h) => applyTransform(h, applyTransform(g, PROBE)) === PROBE);
  if (!hit) throw new Error('no inverse');
  return hit;
}

/**
 * Number of image transforms t (4 plain, 4 mirrored) for which the observed marker patterns are a transformed
 * valid arrangement. 0 means no camera rotation or mirror explains the observation.
 */
export function hypothesisCounts(obs: Record<SlotName, number>): { plain: number; mirrored: number } {
  let plain = 0;
  let mirrored = 0;
  for (const t of TRANSFORM_NAMES) {
    const forward = slotMap(t);
    const back = {} as Record<SlotName, SlotName>;
    for (const s of SLOT_NAMES) back[forward[s]] = s;
    const inv = inverseName(t);
    const ok = SLOT_NAMES.every((s) => PLACEABLE[back[s] as SlotName].has(applyTransform(inv, obs[s])));
    if (ok) (MIRROR.has(t) ? mirrored++ : plain++);
  }
  return { plain, mirrored };
}

export type Predicted =
  | { kind: 'CORRUPTED_FRAGMENT'; slots: SlotName[] }
  | { kind: 'DUPLICATE_CARD'; card: string }
  | { kind: 'INVALID_ARRANGEMENT' }
  | { kind: 'IDENTIFIED'; cards: string[]; hypotheses: number };

/**
 * What design.md section 7 prescribes (steps 4, 5, 6) for four marker patterns that were all detected, computed with
 * brute force: any fragment farther than `radius` from every template -> CORRUPTED_FRAGMENT; two equal cards ->
 * DUPLICATE_CARD; no consistent hypothesis -> INVALID_ARRANGEMENT; otherwise IDENTIFIED.
 */
export function predictGroup(obs: Record<SlotName, number>, radius: 1 | 2 = 1): Predicted {
  const near = SLOT_NAMES.map((s) => ({ s, n: nearestTemplate(obs[s]) }));
  const bad = near.filter((x) => x.n.distance > radius).map((x) => x.s);
  if (bad.length > 0) return { kind: 'CORRUPTED_FRAGMENT', slots: bad };
  const seen = new Set<string>();
  for (const x of near) {
    if (seen.has(x.n.card)) return { kind: 'DUPLICATE_CARD', card: x.n.card };
    seen.add(x.n.card);
  }
  const decoded = {} as Record<SlotName, number>;
  for (const x of near) decoded[x.s] = x.n.bits;
  const h = hypothesisCounts(decoded);
  if (h.plain + h.mirrored === 0) return { kind: 'INVALID_ARRANGEMENT' };
  return { kind: 'IDENTIFIED', cards: near.map((x) => x.n.card).sort(), hypotheses: h.plain + h.mirrored };
}

// ---------------------------------------------------------------------------------------------
// Seeded arrangement generation
// ---------------------------------------------------------------------------------------------

export type Mode = 'any' | 'red' | 'cs';
const CHOICES = slotChoices();
const hasRed = (a: Arrangement): boolean => SLOT_NAMES.some((s) => 'HD'.includes(a[s].card.charAt(0)));
export const cardsOfArrangement = (a: Arrangement): string[] => SLOT_NAMES.map((s) => a[s].card).sort();

/** Four DISTINCT cards, each in a slot where it shows a fragment (every arrangement is valid). */
export function drawArrangement(rng: () => number, mode: Mode = 'any'): Arrangement {
  for (;;) {
    const arr = {} as Arrangement;
    for (const s of SLOT_NAMES) {
      const pool: Placement[] = (CHOICES[s] as Placement[]).filter((c) => mode !== 'cs' || 'CS'.includes(c.card.charAt(0)));
      const pick = pool[Math.floor(rng() * pool.length)] as Placement;
      const rank = RANKS[Math.floor(rng() * 13)] as string;
      arr[s] = { card: `${pick.card.charAt(0)}-${rank}`, orientation: pick.orientation };
    }
    if (new Set(cardsOfArrangement(arr)).size !== 4) continue;
    if (mode === 'red' && !hasRed(arr)) continue;
    return arr;
  }
}

export const arrangementText = (a: Arrangement): string => SLOT_NAMES.map((s) => `${s}:${a[s].card}@${a[s].orientation}`).join(' ');

/** The four observed marker patterns of a valid arrangement (image frame, camera rotation 0). */
export function observedPatterns(a: Arrangement): Record<SlotName, number> {
  const out = {} as Record<SlotName, number>;
  for (const s of SLOT_NAMES) {
    const p = facingPattern(s, a[s]);
    if (p === undefined) throw new Error(`no fragment faces the vertex in slot ${s} for ${a[s].card}@${a[s].orientation}`);
    out[s] = p;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Pixel operations on a composed group image (marker footprint = 9 x 9 modules around its centre)
// ---------------------------------------------------------------------------------------------

export interface Pt {
  x: number;
  y: number;
}

/** Top-left pixel of the 9 x 9 module footprint whose centre is `center`. */
export function footprintOrigin(center: Pt, modulePx: number): Pt {
  return { x: Math.round(center.x - 4.5 * modulePx), y: Math.round(center.y - 4.5 * modulePx) };
}

/** Copy of `img` in which the listed data modules of the marker at `center` are inverted (black <-> white). */
export function flipDataModules(img: GrayImage, center: Pt, modulePx: number, bits: readonly number[]): GrayImage {
  const out: GrayImage = { width: img.width, height: img.height, data: Uint8Array.from(img.data) };
  const o = footprintOrigin(center, modulePx);
  for (const i of bits) {
    const { row, col } = bitToCell(i);
    const x0 = o.x + (col + 2) * modulePx;
    const y0 = o.y + (row + 2) * modulePx;
    for (let y = y0; y < y0 + modulePx; y++) {
      for (let x = x0; x < x0 + modulePx; x++) out.data[y * out.width + x] = 255 - (out.data[y * out.width + x] as number);
    }
  }
  return out;
}

/** Copy of `img` in which the marker footprint at `center` is physically turned by the D4 element `g` (in place). */
export function transformFootprint(img: GrayImage, center: Pt, modulePx: number, g: TransformName): GrayImage {
  const out: GrayImage = { width: img.width, height: img.height, data: Uint8Array.from(img.data) };
  const o = footprintOrigin(center, modulePx);
  const size = 9 * modulePx;
  pasteImage(out, transformImage(cropImage(img, o.x, o.y, size, size), g), o.x, o.y);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Boards assembled from per-card observations (physical-card.ts observeFace / renderPhysicalCard images)
// ---------------------------------------------------------------------------------------------

/**
 * Canvas of 2 halfW x 2 halfH pixels in table gray, with the vertex between rows a-1, a and columns b-1, b at the
 * canvas centre. `cells[i][j]` is the observed image of card (i, j) (null = no card there: the table shows). All
 * card images must have the same size. Cards are pasted edge to edge (zero gap); the canvas clips the board.
 */
export function boardAroundVertex(
  cells: ReadonlyArray<ReadonlyArray<GrayImage | null>>,
  focus: { a: number; b: number },
  tableGray: number,
  halfW: number,
  halfH: number,
): GrayImage {
  const first = cells.flat().find((c): c is GrayImage => c !== null);
  if (!first) throw new RangeError('no card image');
  const W = first.width;
  const H = first.height;
  const canvas = blankImage(2 * halfW, 2 * halfH, tableGray);
  cells.forEach((row, i) =>
    row.forEach((img, j) => {
      if (img === null) return;
      if (img.width !== W || img.height !== H) throw new RangeError('card images differ in size');
      pasteImage(canvas, img, halfW + (j - focus.b) * W, halfH + (i - focus.a) * H);
    }),
  );
  return canvas;
}

/** Marker patterns visible at each corner of one card as seen from above (null = no card). */
export type CellPatterns = Readonly<Partial<Record<Corner, number>>>;

/**
 * Number of fragments that face the vertex (a, b) from the four cards around it, counted from the visible corner
 * patterns of each card (ground truth; never given to a decoder).
 */
export function vertexMarkerCount(grid: ReadonlyArray<ReadonlyArray<CellPatterns | null>>, a: number, b: number): number {
  const probe: Array<[number, number, Corner]> = [
    [a - 1, b - 1, 'BR'],
    [a - 1, b, 'BL'],
    [a, b - 1, 'TR'],
    [a, b, 'TL'],
  ];
  let n = 0;
  for (const [i, j, corner] of probe) {
    const p = grid[i]?.[j];
    if (p && p[corner] !== undefined) n++;
  }
  return n;
}

/** Visible corner patterns of a placement (single-card view at FRONT, as the board model sees it). */
export const placementPatterns = (card: string, orientation: Orientation): CellPatterns => placedFragments(card, orientation);
