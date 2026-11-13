/**
 * Card fragment layout (design.md, Optical Marker System, sections 2-5).
 * Base patterns come from the frozen codebook file; the second fragment of a card is
 * COMPUTED at runtime with applyTransform (R180 for H/D, Fh for C/S), never stored.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyTransform, type TransformName } from './transforms';

export type Suit = 'H' | 'D' | 'C' | 'S';
export type Corner = 'TL' | 'TR' | 'BL' | 'BR';
/** Only 0 and 180 degree placements are representable. */
export type Orientation = 0 | 180;

interface LayoutEntry {
  readonly base: Corner;
  readonly derived: Corner;
  readonly via: TransformName;
}

/** Printed layout at orientation 0 in the card frame. */
export const FRAGMENT_LAYOUT: Readonly<Record<Suit, LayoutEntry>> = {
  H: { base: 'TL', derived: 'BR', via: 'R180' },
  D: { base: 'TR', derived: 'BL', via: 'R180' },
  C: { base: 'TR', derived: 'BR', via: 'Fh' },
  S: { base: 'TL', derived: 'BL', via: 'Fh' },
};

const OPPOSITE: Readonly<Record<Corner, Corner>> = { TL: 'BR', BR: 'TL', TR: 'BL', BL: 'TR' };
const CORNERS: readonly Corner[] = ['TL', 'TR', 'BL', 'BR'];

const CODEBOOK_URL = new URL('./codebook.v1.json', import.meta.url);

interface Loaded {
  readonly order: readonly string[];
  readonly patterns: Readonly<Record<string, number>>;
}

let cache: Loaded | undefined;

function load(): Loaded {
  if (cache) return cache;
  const raw = JSON.parse(readFileSync(fileURLToPath(CODEBOOK_URL), 'utf8')) as {
    cardOrder: string[];
    patterns: Record<string, number>;
  };
  const order = raw.cardOrder;
  if (!Array.isArray(order) || order.length !== 52 || new Set(order).size !== 52) {
    throw new Error('codebook cardOrder must contain 52 unique keys');
  }
  for (const k of order) {
    if (typeof raw.patterns[k] !== 'number') throw new Error(`codebook missing pattern for ${k}`);
  }
  cache = { order: Object.freeze([...order]), patterns: Object.freeze({ ...raw.patterns }) };
  return cache;
}

/** The 52 card keys (e.g. 'H-A', 'S-10') in codebook order. */
export const ALL_CARDS: readonly string[] = load().order;

function suitOf(card: string): Suit {
  const l = load();
  if (typeof card !== 'string' || !Object.hasOwn(l.patterns, card) || !l.order.includes(card)) {
    throw new RangeError(`unknown card key: ${String(card)}`);
  }
  return card.charAt(0) as Suit;
}

/** Exactly two corners with their 25-bit patterns at orientation 0. */
export function printedFragments(card: string): Partial<Record<Corner, number>> {
  const suit = suitOf(card);
  const base = load().patterns[card] as number;
  const lay = FRAGMENT_LAYOUT[suit];
  return { [lay.base]: base, [lay.derived]: applyTransform(lay.via, base) };
}

/**
 * Fragments visible at each corner with the card lying at 0 or 180 degrees.
 * Rotating the card by 180 moves corner X to opposite(X) and applies R180 to its content.
 */
export function placedFragments(card: string, orientation: Orientation): Partial<Record<Corner, number>> {
  if (orientation !== 0 && orientation !== 180) {
    throw new RangeError(`unsupported orientation: ${String(orientation)}`);
  }
  const printed = printedFragments(card);
  if (orientation === 0) return printed;
  const out: Partial<Record<Corner, number>> = {};
  for (const y of CORNERS) {
    const src = printed[OPPOSITE[y]];
    if (src !== undefined) out[y] = applyTransform('R180', src);
  }
  return out;
}

/** Corners that hold a fragment for this placement. */
export function visibleCorners(card: string, orientation: Orientation): Corner[] {
  const p = placedFragments(card, orientation);
  return CORNERS.filter((c) => p[c] !== undefined);
}
