/**
 * Fragment template matching (design.md, Optical Marker System, sections 3-7; task 4.2).
 *
 * Input: the 25 bits that detect.ts read in the canonical frame (or a raw 25-bit number).
 * Output: which card the fragment belongs to, which D4 transform of the card's base pattern was
 * observed, and the Hamming distance, or a rejection. The matcher compares against all 52 x 8 = 416
 * templates built from the frozen codebook file (codebook.v1.json, read-only) with applyTransform.
 *
 * This module takes only the fragment. It has no access to any other game input and never uses one
 * to choose or override a result. A reading is never replaced by a guess.
 *
 * Outcomes
 *  - IDENTIFIED          exactly one DISTINCT card has a template within `radius`.
 *  - AMBIGUOUS           two or more DISTINCT cards have templates within `radius`. Rejected on purpose,
 *                        whatever the margin; the closer card is never picked.
 *  - CORRUPTED_FRAGMENT  no template within `radius`. Only the nearest distance is reported, not which
 *                        card was nearest, so the value cannot be used as an identity.
 *  NOT_DETECTED / INVALID_MARKER from detect.ts are passed through by decodeDetection and are not
 *  turned into CORRUPTED_FRAGMENT.
 *  A card whose base pattern is symmetric (identical bits under several transforms) is still one card.
 *  The tied transforms are listed in `transformCandidates`; this is not ambiguity.
 *
 * ERROR TOLERANCE (independent bit-flip model: every bit of the fragment flips independently):
 *  - Guaranteed. With the frozen codebook (pairwise template distance d >= 5) the radius-2 balls around
 *    the 416 templates are disjoint. Up to `radius` flips (radius <= 2) are always corrected to the
 *    original card and transform. For radius 1, exactly 2 or 3 flips can never land inside any
 *    template's radius-1 ball, so they are always rejected as CORRUPTED_FRAGMENT. AMBIGUOUS cannot
 *    occur for radius <= 2 with this codebook.
 *  - Not guaranteed. For radius 1 from 4 flips on, and for radius 2 from 3 flips on, a corrupted fragment
 *    can land inside the ball of another card and be accepted as that card (false acceptance). For
 *    radius 2 there is no guaranteed rejection at all. The exact false-acceptance rates under this model
 *    are enumerated by scripts/measure-decode-fragment.ts (docs/optical/results/m4-2-decode-fragment.*).
 *  - Real image errors (misplaced sampling, blur, lighting) are not independent bit flips, so the
 *    numbers above do not carry over. They describe a synthetic model, not real cameras.
 *
 * Cell confidence is REPORTED ONLY: cellConfidence[i] = |cellDarkness[i] - 0.5| * 2, and uncertainCells
 * lists the cells below `uncertainThreshold` (default 0.3). It never changes the status. There is no
 * soft-decision decoding.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { DetectedMarker, DetectResult, RejectedCandidate } from './detect';
import { TRANSFORM_NAMES, applyTransform, type TransformName } from './transforms';

export type Radius = 1 | 2;

const CELLS = 25;
const MAX_PATTERN = 2 ** CELLS;
export const DEFAULT_RADIUS: Radius = 1;
export const DEFAULT_UNCERTAIN_THRESHOLD = 0.3;

export interface FragmentTemplate {
  card: string;
  transform: TransformName;
  /** 25-bit pattern of `transform` applied to the card's base pattern. */
  bits: number;
}

export interface FragmentCandidate {
  card: string;
  transform: TransformName;
  distance: number;
}

export type MatchResult =
  | {
      status: 'IDENTIFIED';
      card: string;
      transform: TransformName;
      transformCandidates: TransformName[];
      distance: number;
    }
  | { status: 'CORRUPTED_FRAGMENT'; nearestDistance: number }
  | { status: 'AMBIGUOUS'; candidates: FragmentCandidate[] };

export interface FragmentMatcher {
  readonly cards: readonly string[];
  readonly templates: readonly FragmentTemplate[];
  /** Radius used when decodeFragment gets no `radius` option. */
  readonly defaultRadius: Radius;
  match(bits: number, radius: Radius): MatchResult;
}

export interface FragmentMatcherOptions {
  radius?: Radius;
}

interface Confidence {
  cellConfidence: number[] | null;
  minCellConfidence: number | null;
  uncertainCells: number[];
}

interface OutcomeCommon extends Confidence {
  radius: Radius;
  /** The observed 25 bits. */
  bits: number;
}

export type FragmentOutcome =
  | ({
      status: 'IDENTIFIED';
      card: string;
      transform: TransformName;
      transformCandidates: TransformName[];
      distance: number;
    } & OutcomeCommon)
  | ({ status: 'CORRUPTED_FRAGMENT'; nearestDistance: number } & OutcomeCommon)
  | ({ status: 'AMBIGUOUS'; candidates: FragmentCandidate[] } & OutcomeCommon);

export interface DecodeOptions {
  /** Acceptance radius, 1 (default) or 2. Anything else throws RangeError. */
  radius?: Radius;
  matcher?: FragmentMatcher;
  /** Cells with confidence below this are listed in uncertainCells (default 0.3). */
  uncertainThreshold?: number;
}

export type DecodeDetectionResult =
  | { kind: 'NOT_DETECTED' }
  | { kind: 'INVALID_MARKER'; rejected: RejectedCandidate[] }
  | {
      kind: 'DECODED';
      fragments: Array<{ marker: DetectedMarker; outcome: FragmentOutcome }>;
      rejected: RejectedCandidate[];
    };

function popcount(x: number): number {
  let v = x >>> 0;
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return Math.imul(v, 0x01010101) >>> 24;
}

function resolveRadius(value: unknown, fallback: Radius): Radius {
  if (value === undefined) return fallback;
  if (value === 1 || value === 2) return value;
  throw new RangeError(`radius must be 1 or 2, got ${String(value)}`);
}

function checkBits(bits: unknown, what: string): number {
  if (typeof bits !== 'number' || !Number.isInteger(bits) || bits < 0 || bits >= MAX_PATTERN) {
    throw new RangeError(`${what} must be an integer in [0, 2^25), got ${String(bits)}`);
  }
  return bits;
}

/**
 * Builds the 8 transforms of every card. Throws RangeError when two DIFFERENT cards share an identical
 * template bit pattern. One card producing the same bits under several transforms is allowed.
 */
export function createFragmentMatcher(patterns: Record<string, number>, opts: FragmentMatcherOptions = {}): FragmentMatcher {
  if (typeof patterns !== 'object' || patterns === null) throw new RangeError('patterns must be an object');
  const defaultRadius = resolveRadius(opts.radius, DEFAULT_RADIUS);
  const entries = Object.entries(patterns);
  if (entries.length === 0) throw new RangeError('patterns must contain at least one card');

  const templates: FragmentTemplate[] = [];
  const owner = new Map<number, string>();
  for (const [card, base] of entries) {
    checkBits(base, `pattern of ${card}`);
    for (const g of TRANSFORM_NAMES) {
      const bits = applyTransform(g, base);
      const prior = owner.get(bits);
      if (prior !== undefined && prior !== card) {
        throw new RangeError(`cards ${prior} and ${card} share an identical template pattern ${bits} (at transform ${g})`);
      }
      owner.set(bits, card);
      templates.push({ card, transform: g, bits });
    }
  }
  const cards = entries.map(([card]) => card);
  const n = templates.length;
  const tBits = Uint32Array.from(templates, (t) => t.bits);

  const match = (bits: number, radius: Radius): MatchResult => {
    let nearest = CELLS + 1;
    const within: number[] = [];
    const dist = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const d = popcount((bits ^ (tBits[i] as number)) >>> 0);
      dist[i] = d;
      if (d < nearest) nearest = d;
      if (d <= radius) within.push(i);
    }
    if (within.length === 0) return { status: 'CORRUPTED_FRAGMENT', nearestDistance: nearest };

    // Group the templates within radius by card (templates are stored card-major).
    const groups: Array<{ card: string; best: number; transforms: TransformName[] }> = [];
    for (const i of within) {
      const t = templates[i] as FragmentTemplate;
      const d = dist[i] as number;
      let g = groups[groups.length - 1];
      if (!g || g.card !== t.card) {
        g = { card: t.card, best: d, transforms: [t.transform] };
        groups.push(g);
      } else if (d < g.best) {
        g.best = d;
        g.transforms = [t.transform];
      } else if (d === g.best) {
        g.transforms.push(t.transform);
      }
    }
    if (groups.length === 1) {
      const g = groups[0] as (typeof groups)[number];
      return {
        status: 'IDENTIFIED',
        card: g.card,
        transform: g.transforms[0] as TransformName,
        transformCandidates: [...g.transforms],
        distance: g.best,
      };
    }
    const candidates = groups
      .map((g) => ({ card: g.card, transform: g.transforms[0] as TransformName, distance: g.best }))
      .sort((a, b) => a.distance - b.distance);
    return { status: 'AMBIGUOUS', candidates };
  };

  return { cards, templates, defaultRadius, match };
}

const CODEBOOK_URL = new URL('./codebook.v1.json', import.meta.url);
let defaultMatcher: FragmentMatcher | undefined;

/** Matcher for the frozen codebook (read once, cached). */
export function getDefaultFragmentMatcher(): FragmentMatcher {
  if (defaultMatcher) return defaultMatcher;
  const raw = JSON.parse(readFileSync(fileURLToPath(CODEBOOK_URL), 'utf8')) as {
    cardOrder: string[];
    patterns: Record<string, number>;
  };
  if (!Array.isArray(raw.cardOrder) || raw.cardOrder.length !== 52 || new Set(raw.cardOrder).size !== 52) {
    throw new Error('codebook cardOrder must contain 52 unique keys');
  }
  const ordered: Record<string, number> = {};
  for (const k of raw.cardOrder) {
    const v = raw.patterns[k];
    if (typeof v !== 'number') throw new Error(`codebook missing pattern for ${k}`);
    ordered[k] = v;
  }
  defaultMatcher = createFragmentMatcher(ordered);
  return defaultMatcher;
}

function confidenceOf(input: number | DetectedMarker, threshold: number): Confidence {
  if (typeof input === 'number') return { cellConfidence: null, minCellConfidence: null, uncertainCells: [] };
  const dark = input.cellDarkness;
  if (!Array.isArray(dark) || dark.length !== CELLS || !dark.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    return { cellConfidence: null, minCellConfidence: null, uncertainCells: [] };
  }
  const cellConfidence = dark.map((v) => Math.abs(v - 0.5) * 2);
  const uncertainCells: number[] = [];
  cellConfidence.forEach((c, i) => {
    if (c < threshold) uncertainCells.push(i);
  });
  return { cellConfidence, minCellConfidence: Math.min(...cellConfidence), uncertainCells };
}

/** Matches one fragment. Throws RangeError for an invalid radius, threshold or bit value. */
export function decodeFragment(input: number | DetectedMarker, options: DecodeOptions = {}): FragmentOutcome {
  const matcher = options.matcher ?? getDefaultFragmentMatcher();
  const radius = resolveRadius(options.radius, matcher.defaultRadius);
  const threshold = options.uncertainThreshold ?? DEFAULT_UNCERTAIN_THRESHOLD;
  if (typeof threshold !== 'number' || !Number.isFinite(threshold)) {
    throw new RangeError(`uncertainThreshold must be a finite number, got ${String(threshold)}`);
  }
  let bits: number;
  if (typeof input === 'number') bits = checkBits(input, 'bits');
  else if (typeof input === 'object' && input !== null) bits = checkBits(input.bits, 'marker.bits');
  else throw new TypeError('input must be a 25-bit number or a DetectedMarker');

  const common: OutcomeCommon = { radius, bits, ...confidenceOf(input, threshold) };
  const m = matcher.match(bits, radius);
  switch (m.status) {
    case 'IDENTIFIED':
      return {
        status: 'IDENTIFIED',
        card: m.card,
        transform: m.transform,
        transformCandidates: m.transformCandidates,
        distance: m.distance,
        ...common,
      };
    case 'CORRUPTED_FRAGMENT':
      return { status: 'CORRUPTED_FRAGMENT', nearestDistance: m.nearestDistance, ...common };
    case 'AMBIGUOUS':
      return { status: 'AMBIGUOUS', candidates: m.candidates, ...common };
  }
}

/**
 * Decodes every marker of a detect result. NOT_DETECTED and INVALID_MARKER are passed through
 * unchanged; they are different from CORRUPTED_FRAGMENT (a marker was read, but matches no template).
 */
export function decodeDetection(result: DetectResult, options: DecodeOptions = {}): DecodeDetectionResult {
  if (result.kind === 'NOT_DETECTED') return { kind: 'NOT_DETECTED' };
  if (result.kind === 'INVALID_MARKER') return { kind: 'INVALID_MARKER', rejected: result.rejected };
  return {
    kind: 'DECODED',
    fragments: result.markers.map((marker) => ({ marker, outcome: decodeFragment(marker, options) })),
    rejected: result.rejected,
  };
}
