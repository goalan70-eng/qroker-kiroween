/**
 * Task 6.1: rejection tests for the group decoder (Property 15, with Properties 24 and 25; Requirements 5.7, 12.6, 13.4,
 * 13.6, 13.7). SYNTHETIC images only, no real camera. Every input is a real raster that goes through
 * decodeGroup(image, options); no expected identity or board state ever reaches a production decoder. Ground truth
 * (arrangements, flipped modules, the brute-force predictor in testing/rejection-support.ts) is used only to build
 * the image and to judge the result afterwards.
 *
 * What is asserted, and where it comes from:
 *  - design.md Property 15 (a) removed fragments -> INCOMPLETE_GROUP (all four removed -> NOT_DETECTED, the border
 *    itself is not found), (b) duplicate card -> DUPLICATE_CARD, (c) radius 1: 2..3 flips -> CORRUPTED_FRAGMENT, (d) an
 *    observed transform outside the section-5 table -> INVALID_ARRANGEMENT; IDENTIFIED never in these cases.
 *  - Property 24 at radius 2: <= 2 flips are corrected. For >= 3 flips NOTHING is asserted about the outcome; the
 *    measured counts and the concrete false acceptances are recorded in docs/optical/results/m6-1-counterexamples.*.
 *  - Where a case is a violation only if an independent oracle says so (e.g. one fragment turned by 180 degrees), the
 *    composition is generated until the oracle calls it invalid; valid compositions are never counted as violations.
 *
 * Coverage map: docs/optical/results/m6-1-coverage.md. Reproduction: every sweep case is a function of
 * (seed, violation); failure messages carry seed, violation, transform, angle, arrangement and detail.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { buildRejectionReport, renderJson, renderMarkdown, type Report } from '../../scripts/collect-rejection-counterexamples';
import { decodeFragment } from './decode-fragment';
import { decodeGroup, type GroupDecodeResult } from './decode-group';
import { ALL_CARDS, placedFragments, type Corner, type Orientation } from './fragments';
import { mulberry32 } from './prng';
import { compareWithReference } from './reference-check';
import { renderMarker, type GrayImage } from './render';
import { TRANSFORM_NAMES, applyTransform, type TransformName } from './transforms';
import {
  FACING,
  RANKS,
  SLOT_NAMES,
  composeGroup,
  facingPattern,
  referenceSum,
  rotateImage,
  slotChoices,
  transformImage,
  type Arrangement,
  type Placement,
  type SlotName,
} from './testing/group-compose';
import {
  CARD_FACES,
  composeBoard,
  flipCard,
  observeFace,
  physicalGeometry,
  DEFAULT_PX_PER_MM,
  type CardFace,
  type CardFlip,
} from './testing/physical-card';
import {
  TEMPLATES,
  arrangementText,
  boardAroundVertex,
  cardsOfArrangement,
  distanceToCard,
  distanceToOtherCards,
  drawArrangement,
  flipDataModules,
  footprintOrigin,
  hypothesisCounts,
  masksOfWeight,
  minCrossCardDistance,
  nearestTemplate,
  observedPatterns,
  predictGroup,
  transformFootprint,
  vertexMarkerCount,
  type CellPatterns,
  type Mode,
} from './testing/rejection-support';
import { blankImage, fillRect, pasteImage } from './testing/warp';

// Heavy tests (physical boards, report regeneration, exhaustive bit-level loops) take a few seconds alone; the explicit
// limit only guards against CPU contention. The suite alone runs in well under a minute.
const HEAVY = 120_000;
vi.setConfig({ testTimeout: 30_000 });

const SEED = 20251215;
const MP = 6;
const D4: readonly TransformName[] = TRANSFORM_NAMES;
const CHOICES = slotChoices();

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

interface View {
  t: TransformName;
  angle: number;
}
const IDENTITY: View = { t: 'I', angle: 0 };

function applyView(img: GrayImage, v: View): GrayImage {
  const x = v.t === 'I' ? img : transformImage(img, v.t);
  return v.angle === 0 ? x : rotateImage(x, v.angle);
}

function randomView(rng: () => number): View {
  return { t: D4[Math.floor(rng() * 8)] as TransformName, angle: rng() < 0.5 ? 0 : rng() * 360 };
}

const viewText = (v: View): string => `transform=${v.t} angle=${v.angle.toFixed(6)}`;

const sorted = (a: readonly string[]): string[] => [...a].sort();

function shuffle<T>(rng: () => number, a: readonly T[]): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

function composed(arr: Arrangement, override: Partial<Record<SlotName, number | null>> = {}, modulePx = MP) {
  return composeGroup(arr, { modulePx, override });
}

type Expect =
  | { kind: 'NOT_DETECTED' }
  | { kind: 'INCOMPLETE_GROUP'; detected: number }
  | { kind: 'DUPLICATE_CARD'; card: string }
  | { kind: 'CORRUPTED_FRAGMENT'; members: number }
  | { kind: 'INVALID_ARRANGEMENT' }
  /** A rejection of one of the listed kinds (never IDENTIFIED). */
  | { kind: 'REJECTED'; kinds: readonly string[] }
  /** Only for compositions that the independent oracle calls valid. */
  | { kind: 'IDENTIFIED'; cards: string[] };

/** null when the result is what `e` says, else a description of the deviation. */
function deviation(r: GroupDecodeResult, e: Expect): string | null {
  if (e.kind === 'REJECTED') {
    if (r.kind === 'IDENTIFIED') return 'IDENTIFIED where a rejection is required';
    return e.kinds.includes(r.kind) ? null : `kind ${r.kind} not in ${e.kinds.join('|')}`;
  }
  if (r.kind !== e.kind) return `kind ${r.kind}, expected ${e.kind}`;
  switch (e.kind) {
    case 'INCOMPLETE_GROUP':
      return r.kind === 'INCOMPLETE_GROUP' && r.detected !== e.detected ? `detected ${r.detected}, expected ${e.detected}` : null;
    case 'DUPLICATE_CARD':
      return r.kind === 'DUPLICATE_CARD' && r.card !== e.card ? `duplicate card ${r.card}, expected ${e.card}` : null;
    case 'CORRUPTED_FRAGMENT':
      return r.kind === 'CORRUPTED_FRAGMENT' && Object.keys(r.nearestDistances).length !== e.members
        ? `corrupted members ${Object.keys(r.nearestDistances).length}, expected ${e.members}`
        : null;
    case 'INVALID_ARRANGEMENT':
      return r.kind === 'INVALID_ARRANGEMENT' && r.reason !== 'NO_CONSISTENT_HYPOTHESIS' ? `reason ${r.reason}` : null;
    case 'IDENTIFIED':
      return r.kind === 'IDENTIFIED' && sorted(r.cards).join() !== sorted(e.cards).join() ? `cards ${r.cards.join()}, expected ${e.cards.join()}` : null;
    default:
      return null;
  }
}

function identified(r: GroupDecodeResult, what: string) {
  if (r.kind !== 'IDENTIFIED') throw new Error(`${what}: expected IDENTIFIED, got ${r.kind}`);
  return r;
}

/** Unflipped base pattern of a slot in the image frame. */
const patOf = (arr: Arrangement, s: SlotName): number => observedPatterns(arr)[s];

const groups = (n: number, base: number, mode?: Mode): Arrangement[] =>
  Array.from({ length: n }, (_, i) => drawArrangement(mulberry32(base + i), mode ?? (i % 3 === 1 ? 'red' : i % 3 === 2 ? 'cs' : 'any')));

/** Valid-pattern marker of a random card OTHER than `avoid` (a real fragment of some card, any visible corner). */
function distractorPattern(rng: () => number, avoid: readonly string[]): number {
  for (;;) {
    const card = ALL_CARDS[Math.floor(rng() * ALL_CARDS.length)] as string;
    if (avoid.includes(card)) continue;
    const p = placedFragments(card, rng() < 0.5 ? 0 : 180);
    const corners = (['TL', 'TR', 'BL', 'BR'] as const).filter((c) => p[c] !== undefined);
    return p[corners[Math.floor(rng() * corners.length)] as Corner] as number;
  }
}

// ---------------------------------------------------------------------------------------------
// Flat lattice scene: the target group at the centre of an 8 x 8 lattice of markers (pitch 11 modules, the same pitch
// as neighbouring cards), the other lattice cells filled with valid markers of OTHER cards.
// ---------------------------------------------------------------------------------------------

const LAT_MODULES = 88;
const LAT_HALF = 44;

function latticeScene(
  arr: Arrangement,
  rng: () => number,
  o: { missing: SlotName | null; fill: number; avoidComplete: boolean },
): GrayImage {
  const size = LAT_MODULES * MP;
  const canvas = blankImage(size, size, 255);
  const override: Partial<Record<SlotName, null>> = o.missing ? { [o.missing]: null } : {};
  const group = composeGroup(arr, { modulePx: MP, override });
  pasteImage(canvas, group.image, size / 2 - group.image.width / 2, size / 2 - group.image.height / 2);
  // lattice cell (p, q), p = column, q = row, in -4..3; the target group occupies p, q in {-1, 0}.
  const occ = new Map<string, boolean>();
  const key = (p: number, q: number): string => `${p},${q}`;
  const isTarget = (p: number, q: number): boolean => p >= -1 && p <= 0 && q >= -1 && q <= 0;
  const slotAt = (p: number, q: number): SlotName => (q === -1 ? (p === -1 ? 'TL' : 'TR') : p === -1 ? 'BL' : 'BR');
  for (let p = -4; p <= 3; p++) {
    for (let q = -4; q <= 3; q++) {
      occ.set(key(p, q), isTarget(p, q) ? slotAt(p, q) !== o.missing : rng() < o.fill);
    }
  }
  if (o.avoidComplete) {
    for (let pass = 0; pass < 200; pass++) {
      let changed = false;
      for (let p = -4; p <= 2; p++) {
        for (let q = -4; q <= 2; q++) {
          const cells: Array<[number, number]> = [[p, q], [p + 1, q], [p, q + 1], [p + 1, q + 1]];
          if (!cells.every(([a, b]) => occ.get(key(a, b)))) continue;
          const free = cells.filter(([a, b]) => !isTarget(a, b));
          if (free.length === 0) throw new Error('target block cannot be complete here');
          const [a, b] = free[Math.floor(rng() * free.length)] as [number, number];
          occ.set(key(a, b), false);
          changed = true;
        }
      }
      if (!changed) break;
    }
  }
  const avoid = cardsOfArrangement(arr);
  for (let p = -4; p <= 3; p++) {
    for (let q = -4; q <= 3; q++) {
      if (isTarget(p, q) || !occ.get(key(p, q))) continue;
      const m = renderMarker(distractorPattern(rng, avoid), MP);
      pasteImage(canvas, m, (LAT_HALF + 11 * p + 1) * MP, (LAT_HALF + 11 * q + 1) * MP);
    }
  }
  return canvas;
}

// ---------------------------------------------------------------------------------------------
// Sweep: one seeded case per (seed, violation)
// ---------------------------------------------------------------------------------------------

const VIOLATIONS = [
  'REMOVE_1',
  'REMOVE_2',
  'REMOVE_3',
  'REMOVE_ALL',
  'DUPLICATE_SAME_CARD',
  'DUPLICATE_OTHER_TRANSFORM',
  'CORRUPT_2_FLIPS',
  'CORRUPT_3_FLIPS',
  'WRONG_SUIT_CONTENT',
  'FRAGMENT_ROTATED_90_OR_270',
  'FRAGMENT_DIAGONAL_REFLECTION',
  'FRAGMENT_180_OR_AXIS_REFLECTION_INVALID',
  'SUIT_ABSENT_AT_CORNER',
  'THREE_FRAGMENTS_WITH_DISTRACTORS',
  'SPURIOUS_AT_MISSING_SLOT',
] as const;
type Violation = (typeof VIOLATIONS)[number];

interface Case {
  seed: number;
  violation: Violation;
  arr: Arrangement;
  view: View;
  detail: string;
  image: GrayImage;
  expect: Expect;
  /** true cards of the underlying valid group (the reference a Scoring Companion could hold). */
  trueCards: string[];
}

const caseTag = (c: Pick<Case, 'seed' | 'violation' | 'view' | 'arr' | 'detail'>): string =>
  `[seed=${c.seed} violation=${c.violation} ${viewText(c.view)} arrangement=${arrangementText(c.arr)} detail=${c.detail}]`;

interface Built {
  image: GrayImage;
  expect: Expect;
  detail: string;
}

const PAIR_ORDER: SlotName[] = [...SLOT_NAMES];

function tryBuild(violation: Violation, arr: Arrangement, rng: () => number): Built | null {
  const base = composed(arr);
  const obs = observedPatterns(arr);
  const slot = PAIR_ORDER[Math.floor(rng() * 4)] as SlotName;
  const other = shuffle(rng, PAIR_ORDER.filter((s) => s !== slot))[0] as SlotName;
  const withPattern = (s: SlotName, p: number): Record<SlotName, number> => ({ ...obs, [s]: p }) as Record<SlotName, number>;

  switch (violation) {
    case 'REMOVE_1':
    case 'REMOVE_2':
    case 'REMOVE_3':
    case 'REMOVE_ALL': {
      const k = violation === 'REMOVE_ALL' ? 4 : Number(violation.slice(-1));
      const erased = shuffle(rng, PAIR_ORDER).slice(0, k);
      const override: Partial<Record<SlotName, null>> = {};
      for (const s of erased) override[s] = null;
      return {
        image: composed(arr, override).image,
        expect: k === 4 ? { kind: 'NOT_DETECTED' } : { kind: 'INCOMPLETE_GROUP', detected: 4 - k },
        detail: `removed ${erased.join('+')}`,
      };
    }
    case 'DUPLICATE_SAME_CARD': {
      const X = arr[slot].card;
      const orientation = ([0, 180] as const).find((o) => facingPattern(other, { card: X, orientation: o }) !== undefined);
      if (orientation === undefined) return null;
      const dup: Arrangement = { ...arr, [other]: { card: X, orientation } };
      if (cardsOfArrangement(dup).filter((c) => c === X).length !== 2) return null;
      return { image: composed(dup).image, expect: { kind: 'DUPLICATE_CARD', card: X }, detail: `${X} in ${slot} and ${other}` };
    }
    case 'DUPLICATE_OTHER_TRANSFORM': {
      const g = D4[Math.floor(rng() * 8)] as TransformName;
      const p = applyTransform(g, obs[slot]);
      return { image: composed(arr, { [other]: p }).image, expect: { kind: 'DUPLICATE_CARD', card: arr[slot].card }, detail: `${other} shows ${arr[slot].card} as ${g}` };
    }
    case 'CORRUPT_2_FLIPS':
    case 'CORRUPT_3_FLIPS': {
      const w = violation === 'CORRUPT_2_FLIPS' ? 2 : 3;
      const bits = shuffle(rng, Array.from({ length: 25 }, (_, i) => i)).slice(0, w).sort((a, b) => a - b);
      let word = obs[slot];
      for (const b of bits) word = (word ^ (1 << b)) >>> 0;
      // guaranteed region of radius 1 (checked by brute force, not assumed)
      if (nearestTemplate(word).distance <= 1) throw new Error(`flip of weight ${w} within radius 1: ${arrangementText(arr)} ${slot} ${bits.join()}`);
      return { image: flipDataModules(base.image, base.centers[slot], MP, bits), expect: { kind: 'CORRUPTED_FRAGMENT', members: 1 }, detail: `${slot} flipped bits ${bits.join(',')}` };
    }
    case 'WRONG_SUIT_CONTENT': {
      const hearts = slot === 'TR' || slot === 'BL';
      const suit = hearts ? 'H' : 'D';
      const X = `${suit}-${RANKS[Math.floor(rng() * 13)]}`;
      const src: SlotName = hearts ? (rng() < 0.5 ? 'TL' : 'BR') : rng() < 0.5 ? 'TR' : 'BL';
      const p = facingPattern(src, { card: X, orientation: 0 }) as number;
      if (predictGroup(withPattern(slot, p)).kind !== 'INVALID_ARRANGEMENT') return null;
      return { image: composed(arr, { [slot]: p }).image, expect: { kind: 'INVALID_ARRANGEMENT' }, detail: `${hearts ? 'heart' : 'diamond'} content of ${X} in ${slot}` };
    }
    case 'FRAGMENT_ROTATED_90_OR_270':
    case 'FRAGMENT_DIAGONAL_REFLECTION': {
      const g: TransformName = violation === 'FRAGMENT_ROTATED_90_OR_270' ? (rng() < 0.5 ? 'R90' : 'R270') : rng() < 0.5 ? 'Dm' : 'Da';
      const p = applyTransform(g, obs[slot]);
      // Proof (V = {I, R180, Fh, Fv} is a normal subgroup, g is in the other coset): never valid. Checked, not assumed.
      if (predictGroup(withPattern(slot, p)).kind !== 'INVALID_ARRANGEMENT') throw new Error(`oracle says ${g} on ${slot} can be valid: ${arrangementText(arr)}`);
      return { image: transformFootprint(base.image, base.centers[slot], MP, g), expect: { kind: 'INVALID_ARRANGEMENT' }, detail: `${slot} fragment physically turned by ${g}` };
    }
    case 'FRAGMENT_180_OR_AXIS_REFLECTION_INVALID': {
      const g = (['R180', 'Fh', 'Fv'] as const)[Math.floor(rng() * 3)] as TransformName;
      const p = applyTransform(g, obs[slot]);
      if (predictGroup(withPattern(slot, p)).kind !== 'INVALID_ARRANGEMENT') return null; // a valid composition is not a violation
      return { image: transformFootprint(base.image, base.centers[slot], MP, g), expect: { kind: 'INVALID_ARRANGEMENT' }, detail: `${slot} fragment content turned by ${g} (not allowed there)` };
    }
    case 'SUIT_ABSENT_AT_CORNER': {
      const options: Placement[] = [];
      for (const suit of ['H', 'D', 'C', 'S']) {
        for (const o of [0, 180] as const) {
          const card = `${suit}-${RANKS[Math.floor(rng() * 13)]}`;
          if (facingPattern(slot, { card, orientation: o }) === undefined && !cardsOfArrangement(arr).includes(card)) options.push({ card, orientation: o });
        }
      }
      const pick = options[Math.floor(rng() * options.length)] as Placement;
      return { image: composed({ ...arr, [slot]: pick }).image, expect: { kind: 'INCOMPLETE_GROUP', detected: 3 }, detail: `${pick.card}@${pick.orientation} has no fragment facing the vertex in ${slot}` };
    }
    case 'THREE_FRAGMENTS_WITH_DISTRACTORS': {
      return { image: latticeScene(arr, rng, { missing: slot, fill: 0.7, avoidComplete: true }), expect: { kind: 'INCOMPLETE_GROUP', detected: 3 }, detail: `${slot} missing, valid markers of other cards on the lattice` };
    }
    case 'SPURIOUS_AT_MISSING_SLOT': {
      const img = composed(arr, { [slot]: null });
      const c = img.centers[slot];
      const out: GrayImage = { width: img.image.width, height: img.image.height, data: Uint8Array.from(img.image.data) };
      const kind = Math.floor(rng() * 5);
      const o = footprintOrigin(c, MP);
      if (kind === 0) {
        fillRect(out, Math.round(c.x - MP), Math.round(c.y - MP / 2), 2 * MP, MP, 0);
        return { image: out, expect: { kind: 'INCOMPLETE_GROUP', detected: 3 }, detail: `${slot}: black 1x2 module blob` };
      }
      if (kind === 1) {
        fillRect(out, Math.round(c.x - 1.5 * MP), Math.round(c.y - 1.5 * MP), 3 * MP, 3 * MP, 0);
        return { image: out, expect: { kind: 'INCOMPLETE_GROUP', detected: 3 }, detail: `${slot}: black 3x3 module square` };
      }
      if (kind === 2) {
        pasteImage(out, renderMarker(0x1ffffff, MP), o.x, o.y);
        return { image: out, expect: { kind: 'CORRUPTED_FRAGMENT', members: 1 }, detail: `${slot}: solid black 7x7 marker` };
      }
      if (kind === 3) {
        pasteImage(out, renderMarker(0, MP), o.x, o.y);
        return { image: out, expect: { kind: 'CORRUPTED_FRAGMENT', members: 1 }, detail: `${slot}: empty frame (all data white)` };
      }
      const broken = renderMarker(distractorPattern(rng, cardsOfArrangement(arr)), MP);
      fillRect(broken, 4 * MP, 1 * MP, MP, MP, 255); // one non-corner border module white
      pasteImage(out, broken, o.x, o.y);
      return { image: out, expect: { kind: 'INCOMPLETE_GROUP', detected: 3 }, detail: `${slot}: marker with a broken border` };
    }
  }
}

function buildCase(seed: number, violation: Violation): Case {
  const rng = mulberry32(seed);
  const view = randomView(rng);
  for (let attempt = 0; attempt < 500; attempt++) {
    const mode: Mode = rng() < 0.4 ? 'cs' : rng() < 0.5 ? 'red' : 'any';
    const arr = drawArrangement(rng, mode);
    const built = tryBuild(violation, arr, rng);
    if (built) {
      return { seed, violation, arr, view, detail: built.detail, image: applyView(built.image, view), expect: built.expect, trueCards: cardsOfArrangement(arr) };
    }
  }
  throw new Error(`no violating composition found for seed ${seed} ${violation}`);
}

/** Runs one case; returns every deviation, each prefixed with the reproduction tag. Also exercises the reference comparison. */
function runCase(c: Case): string[] {
  const tag = caseTag(c);
  const r = decodeGroup(c.image);
  const out: string[] = [];
  const d = deviation(r, c.expect);
  if (d) out.push(`${tag} ${d}`);
  if (r.kind === 'IDENTIFIED') out.push(`${tag} IDENTIFIED (cards ${r.cards.join()}, sum ${r.hiddenSum})`);
  // Property 25: the reference never turns a rejection into a success and never supplies a sum.
  const cmp = compareWithReference(r, c.trueCards);
  if (r.kind !== 'IDENTIFIED' && (cmp !== r || 'hiddenSum' in cmp)) out.push(`${tag} reference comparison changed a ${r.kind} result`);
  return out;
}

// =============================================================================================
// 1. Removed fragments (Property 15(a), Requirement 13.4 (1))
// =============================================================================================

describe('1. removed fragments: every subset of 1..4 removed fragments, several groups and transforms', () => {
  const G = groups(4, SEED);

  it('removing 1, 2 or 3 fragments gives INCOMPLETE_GROUP with detected = remaining fragments; removing all 4 gives NOT_DETECTED (4 groups x 15 subsets x 8 D4 transforms)', () => {
    const failures: string[] = [];
    let n = 0;
    G.forEach((arr, gi) => {
      for (let mask = 1; mask < 16; mask++) {
        const erased = SLOT_NAMES.filter((_, i) => (mask >> i) & 1);
        const override: Partial<Record<SlotName, null>> = {};
        for (const s of erased) override[s] = null;
        const base = composed(arr, override).image;
        const want: Expect = erased.length === 4 ? { kind: 'NOT_DETECTED' } : { kind: 'INCOMPLETE_GROUP', detected: 4 - erased.length };
        for (const t of D4) {
          n++;
          const r = decodeGroup(transformImage(base, t));
          const d = deviation(r, want);
          if (d) failures.push(`[group ${gi} ${arrangementText(arr)} removed ${erased.join('+')} transform=${t}] ${d}`);
          if (r.kind === 'INCOMPLETE_GROUP' && r.markers !== 4 - erased.length) failures.push(`[group ${gi} removed ${erased.join('+')} transform=${t}] markers ${r.markers}`);
        }
      }
    });
    expect(n).toBe(4 * 15 * 8);
    expect(failures).toEqual([]);
  });

  it('the same subsets at arbitrary camera angles (3 seeded angles each) are rejected the same way', () => {
    const rng = mulberry32(SEED + 100);
    const failures: string[] = [];
    G.slice(0, 3).forEach((arr, gi) => {
      for (let mask = 1; mask < 16; mask++) {
        const erased = SLOT_NAMES.filter((_, i) => (mask >> i) & 1);
        const override: Partial<Record<SlotName, null>> = {};
        for (const s of erased) override[s] = null;
        const base = composed(arr, override).image;
        const want: Expect = erased.length === 4 ? { kind: 'NOT_DETECTED' } : { kind: 'INCOMPLETE_GROUP', detected: 4 - erased.length };
        for (let k = 0; k < 3; k++) {
          const angle = rng() * 360;
          const d = deviation(decodeGroup(rotateImage(base, angle)), want);
          if (d) failures.push(`[group ${gi} removed ${erased.join('+')} angle=${angle.toFixed(6)}] ${d}`);
        }
      }
    });
    expect(failures).toEqual([]);
  });

  it('whole-image camera rotation is not a violation: the complete group stays IDENTIFIED at the same angles', () => {
    const rng = mulberry32(SEED + 100);
    for (const arr of G) {
      const base = composed(arr).image;
      for (let k = 0; k < 4; k++) {
        const angle = rng() * 360;
        const r = identified(decodeGroup(rotateImage(base, angle)), `angle ${angle}`);
        expect(sorted(r.cards)).toEqual(cardsOfArrangement(arr));
        expect(r.hiddenSum).toBe(referenceSum(cardsOfArrangement(arr)));
      }
    }
  });

  it('all four fragments removed from a PHYSICAL board (rounded-corner voids, markers omitted) and a blank table: NOT_DETECTED', () => {
    const arr = G[0] as Arrangement;
    const placements = [
      [arr.TL, arr.TR],
      [arr.BL, arr.BR],
    ];
    const board = composeBoard(placements, {}, { omitMarkers: true });
    expect(decodeGroup(board.image)).toEqual({ kind: 'NOT_DETECTED' });
    expect(decodeGroup(blankImage(300, 300, physicalGeometry().tableGray))).toEqual({ kind: 'NOT_DETECTED' });
  });
});

// =============================================================================================
// 3. Duplicate card (Property 15(b), Requirement 13.4 (2))
// =============================================================================================

describe('3. duplicate card identity -> DUPLICATE_CARD', () => {
  const PAIRS: Array<[SlotName, SlotName]> = [['TL', 'TR'], ['TL', 'BL'], ['TL', 'BR'], ['TR', 'BL'], ['TR', 'BR'], ['BL', 'BR']];

  it('the same card in two slots in every suit-compatible way (14 suit x slot-pair combinations), identity and a seeded camera view', () => {
    const rng = mulberry32(SEED + 300);
    let combos = 0;
    const failures: string[] = [];
    for (const [s1, s2] of PAIRS) {
      for (const suit of ['H', 'D', 'C', 'S']) {
        const X = `${suit}-7`;
        const seen = new Set<string>();
        for (const o1 of [0, 180] as const) {
          for (const o2 of [0, 180] as const) {
            const p1 = facingPattern(s1, { card: X, orientation: o1 });
            const p2 = facingPattern(s2, { card: X, orientation: o2 });
            if (p1 === undefined || p2 === undefined || seen.has(`${p1}:${p2}`)) continue;
            seen.add(`${p1}:${p2}`);
            combos++;
            const arr = {} as Arrangement;
            arr[s1] = { card: X, orientation: o1 };
            arr[s2] = { card: X, orientation: o2 };
            const rest = SLOT_NAMES.filter((s) => s !== s1 && s !== s2);
            rest.forEach((s, i) => {
              const c = (CHOICES[s] as Placement[])[0] as Placement;
              arr[s] = { card: `${c.card.charAt(0)}-${i === 0 ? 'A' : 'K'}`, orientation: c.orientation };
            });
            const base = composed(arr).image;
            for (const v of [IDENTITY, randomView(rng)]) {
              const r = decodeGroup(applyView(base, v));
              if (r.kind !== 'DUPLICATE_CARD' || r.card !== X) failures.push(`[${s1}+${s2} ${X} o=${o1}/${o2} ${viewText(v)}] got ${r.kind}`);
            }
          }
        }
      }
    }
    expect(combos).toBe(14);
    expect(failures).toEqual([]);
  });

  it('a card in all four slots (4 identical fragments) and a second copy shown as ANY of the 8 transforms (12 ordered slot pairs x 8) gives DUPLICATE_CARD, never IDENTIFIED', () => {
    const four = {} as Arrangement;
    for (const s of SLOT_NAMES) four[s] = { card: 'C-5', orientation: ([0, 180] as const).find((o) => facingPattern(s, { card: 'C-5', orientation: o }) !== undefined) as Orientation };
    expect(decodeGroup(composed(four).image)).toMatchObject({ kind: 'DUPLICATE_CARD', card: 'C-5' });

    const arr = drawArrangement(mulberry32(SEED + 310), 'any');
    const failures: string[] = [];
    let n = 0;
    for (const s1 of SLOT_NAMES) {
      for (const s2 of SLOT_NAMES) {
        if (s1 === s2) continue;
        for (const g of D4) {
          n++;
          const r = decodeGroup(composed(arr, { [s2]: applyTransform(g, patOf(arr, s1)) }).image);
          if (r.kind !== 'DUPLICATE_CARD' || r.card !== arr[s1].card) failures.push(`[${arrangementText(arr)} ${s2} = ${g}(${s1})] got ${r.kind}`);
        }
      }
    }
    expect(n).toBe(96);
    expect(failures).toEqual([]);
  });

  it('precedence of design.md section 7: a corrupted fragment is reported before the duplicate check', () => {
    const arr: Arrangement = { TL: { card: 'H-7', orientation: 0 }, TR: { card: 'D-3', orientation: 0 }, BL: { card: 'C-9', orientation: 0 }, BR: { card: 'H-7', orientation: 0 } };
    const base = composed(arr);
    expect(decodeGroup(base.image).kind).toBe('DUPLICATE_CARD');
    const r = decodeGroup(flipDataModules(base.image, base.centers.TR, MP, [3, 11]));
    expect(r.kind).toBe('CORRUPTED_FRAGMENT');
  });
});

// =============================================================================================
// 4. Corrupted fragment (Property 15(c), Property 24)
// =============================================================================================

describe('4. flipped modules in one fragment (Property 15(c), Property 24)', () => {
  const G = groups(6, SEED + 400);

  it('independent facts behind the guarantees: minimum distance between templates of different cards is 5 (so a competing identity is at least 5 - w away after w flips)', () => {
    expect(minCrossCardDistance()).toBe(5);
    expect(TEMPLATES.length).toBe(416);
  });

  it('radius 1, bit level, EXHAUSTIVE: every mask of weight 0..3 on all 24 fragments of 6 groups through decodeFragment; w <= 1 corrected to the same card, w = 2, 3 CORRUPTED_FRAGMENT with distance > 1 to every template', () => {
    const masks = [0, 1, 2, 3].map((w) => (w === 0 ? [0] : masksOfWeight(w)));
    const failures: string[] = [];
    let calls = 0;
    G.forEach((arr, gi) => {
      for (const s of SLOT_NAMES) {
        const trueWord = patOf(arr, s);
        const card = arr[s].card;
        for (let w = 0; w <= 3; w++) {
          for (const m of masks[w] as number[]) {
            const word = (trueWord ^ m) >>> 0;
            const o = decodeFragment(word, { radius: 1 });
            calls++;
            if (w <= 1) {
              if (!(o.status === 'IDENTIFIED' && o.card === card && o.distance === w)) failures.push(`[group ${gi} ${s} ${card} w=${w} mask=${m}] ${o.status}`);
            } else {
              const near = nearestTemplate(word);
              const competing = distanceToOtherCards(word, card);
              const ok =
                o.status === 'CORRUPTED_FRAGMENT' &&
                o.nearestDistance === near.distance &&
                near.distance > 1 &&
                distanceToCard(word, card) > 1 &&
                competing > 1 &&
                competing >= 5 - w;
              if (!ok) failures.push(`[group ${gi} ${s} ${card} w=${w} mask=${m}] ${o.status} nearest ${near.distance} competing ${competing}`);
            }
          }
        }
      }
    });
    expect(calls).toBe(24 * 2626);
    expect(failures).toEqual([]);
  }, HEAVY);

  it('radius 1, pixels: 0 or 1 flipped module is corrected (IDENTIFIED, right cards and sum, distance = flips); 2 or 3 flipped modules give CORRUPTED_FRAGMENT with exactly one corrupted member (6 groups x 4 slots, seeded camera views)', () => {
    const rng = mulberry32(SEED + 410);
    const failures: string[] = [];
    let identifiedN = 0;
    let corruptedN = 0;
    G.forEach((arr, gi) => {
      const base = composed(arr);
      const trueCards = cardsOfArrangement(arr);
      for (const s of SLOT_NAMES) {
        const jobs: number[][] = [[]];
        for (let i = 0; i < 25; i++) jobs.push([i]);
        for (const w of [2, 3]) {
          for (let k = 0; k < 10; k++) jobs.push(shuffle(rng, Array.from({ length: 25 }, (_, i) => i)).slice(0, w).sort((a, b) => a - b));
        }
        for (const bits of jobs) {
          const view = bits.length <= 1 ? IDENTITY : randomView(rng);
          const tag = `[group ${gi} ${arrangementText(arr)} slot ${s} flipped ${bits.join(',') || 'none'} ${viewText(view)}]`;
          const r = decodeGroup(applyView(flipDataModules(base.image, base.centers[s], MP, bits), view), { radius: 1 });
          if (bits.length <= 1) {
            identifiedN++;
            if (r.kind !== 'IDENTIFIED' || sorted(r.cards).join() !== trueCards.join() || r.hiddenSum !== referenceSum(trueCards)) failures.push(`${tag} ${r.kind}`);
            else if (!r.readings.some((x) => x.distance === bits.length) || r.readings.some((x) => x.distance > bits.length)) failures.push(`${tag} reading distances ${r.readings.map((x) => x.distance).join()}`);
          } else {
            corruptedN++;
            let word = patOf(arr, s);
            for (const b of bits) word = (word ^ (1 << b)) >>> 0;
            const near = nearestTemplate(word).distance;
            if (r.kind !== 'CORRUPTED_FRAGMENT') failures.push(`${tag} ${r.kind}`);
            else {
              const keys = Object.keys(r.nearestDistances);
              if (keys.length !== 1 || Object.values(r.nearestDistances)[0] !== near || near <= 1) failures.push(`${tag} nearestDistances ${JSON.stringify(r.nearestDistances)} brute force ${near}`);
            }
          }
        }
      }
    });
    expect(identifiedN).toBe(6 * 4 * 26);
    expect(corruptedN).toBe(6 * 4 * 20);
    expect(failures).toEqual([]);
  }, HEAVY);

  it('the pixel inversion used here equals rendering the flipped pattern (so "flipped module" means the data bit, row-major bit 5r + c)', () => {
    const arr = G[0] as Arrangement;
    const base = composed(arr);
    const bits = [0, 7, 24];
    let word = patOf(arr, 'TL');
    for (const b of bits) word = (word ^ (1 << b)) >>> 0;
    const viaPattern = composed(arr, { TL: word }).image;
    expect(Array.from(flipDataModules(base.image, base.centers.TL, MP, bits).data)).toEqual(Array.from(viaPattern.data));
  });

  it('radius 1: one flipped module in EVERY fragment is corrected; two fragments with 2 flips each are both reported corrupted', () => {
    const rng = mulberry32(SEED + 420);
    for (const arr of G) {
      const base = composed(arr);
      let img = base.image;
      for (const s of SLOT_NAMES) img = flipDataModules(img, base.centers[s], MP, [Math.floor(rng() * 25)]);
      const r = identified(decodeGroup(img), 'one flip in every fragment');
      expect(sorted(r.cards)).toEqual(cardsOfArrangement(arr));
      let two = flipDataModules(base.image, base.centers.TL, MP, [1, 9]);
      two = flipDataModules(two, base.centers.BR, MP, [4, 20]);
      const c = decodeGroup(two);
      expect(c.kind).toBe('CORRUPTED_FRAGMENT');
      if (c.kind === 'CORRUPTED_FRAGMENT') expect(Object.keys(c.nearestDistances).sort()).toEqual(['BR', 'TL']);
    }
  });

  it('radius 2: up to 2 flipped modules are corrected and the result is never silently wrong (IDENTIFIED with the right cards and sum): all single flips, seeded double flips, and two fragments with 2 flips each', () => {
    const rng = mulberry32(SEED + 430);
    const failures: string[] = [];
    let n = 0;
    G.slice(0, 3).forEach((arr, gi) => {
      const base = composed(arr);
      const trueCards = cardsOfArrangement(arr);
      const check = (img: GrayImage, label: string): void => {
        n++;
        const r = decodeGroup(img, { radius: 2 });
        if (r.kind !== 'IDENTIFIED' || sorted(r.cards).join() !== trueCards.join() || r.hiddenSum !== referenceSum(trueCards)) failures.push(`[group ${gi} ${arrangementText(arr)} ${label}] ${r.kind}`);
      };
      for (const s of SLOT_NAMES) {
        for (let i = 0; i < 25; i++) check(flipDataModules(base.image, base.centers[s], MP, [i]), `${s} flip ${i}`);
        for (let k = 0; k < 15; k++) {
          const bits = shuffle(rng, Array.from({ length: 25 }, (_, i) => i)).slice(0, 2).sort((a, b) => a - b);
          check(flipDataModules(base.image, base.centers[s], MP, bits), `${s} flips ${bits.join(',')}`);
        }
      }
      let two = flipDataModules(base.image, base.centers.TR, MP, [2, 13]);
      two = flipDataModules(two, base.centers.BL, MP, [8, 22]);
      check(two, 'TR 2 flips + BL 2 flips');
    });
    expect(n).toBe(3 * (4 * 40 + 1));
    expect(failures).toEqual([]);
  }, HEAVY);

  describe('radius 2, 3 or more flips: no rejection is asserted; counts and counterexamples are recorded (docs/optical/results/m6-1-counterexamples.*)', () => {
    const resultsDir = (name: string): string => fileURLToPath(new URL(`../../docs/optical/results/${name}`, import.meta.url));
    const fresh: { v?: Report } = {};

    it('the files on disk are byte-identical to a fresh regeneration; every pixel run agrees with the independent brute-force prediction', () => {
      const rep = (fresh.v ??= buildRejectionReport());
      expect(readFileSync(resultsDir('m6-1-counterexamples.json'), 'utf8')).toBe(renderJson(rep));
      expect(readFileSync(resultsDir('m6-1-counterexamples.md'), 'utf8')).toBe(renderMarkdown(rep));
      expect(renderJson(rep)).not.toContain('\r');
      expect(rep.codebookSha256).toBe('515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4');
      expect(rep.idDistance).toBe(5);
      for (const c of rep.cells) {
        expect(c.predictionMismatches, `weight ${c.weight}`).toBe(0);
        expect(Object.values(c.groupOutcomes).reduce((a, b) => a + b, 0)).toBe(c.pixelRuns);
        expect(c.bit.sameCard + c.bit.falseAccept + c.bit.rejected).toBe(c.bit.events);
      }
      const t = rep.totals;
      const wrong = rep.cells.reduce((a, c) => a + c.groupOutcomes.IDENTIFIED_WRONG_CARDS, 0);
      expect(t.identifiedWrongCards).toBe(wrong);
      const cell = (w: number) => rep.cells.find((c) => c.weight === w) as Report['cells'][number];
      console.info(
        `radius 2 (seeded groups, one corrupted fragment): ` +
          rep.cells.map((c) => `k=${c.weight}: bit ${c.bit.sameCard}/${c.bit.falseAccept}/${c.bit.rejected} (source/false/rejected), group IDENTIFIED-wrong ${c.groupOutcomes.IDENTIFIED_WRONG_CARDS}`).join('; ') +
          `; total silent wrong ${t.identifiedWrongCards} of ${t.pixelRuns} pixel runs`,
      );
      // The report exists to expose false acceptances, so it must contain at least one at weight 3 (they exist: m4-2 counts 2,720).
      expect(cell(3).bit.falseAccept).toBeGreaterThan(0);
      expect(cell(3).groupOutcomes.IDENTIFIED_WRONG_CARDS).toBeGreaterThan(0);
    }, HEAVY);

    it('the exact all-template counts for k = 3 and 4 equal the m4-2 enumeration', () => {
      const m42 = JSON.parse(readFileSync(resultsDir('m4-2-decode-fragment.json'), 'utf8')) as {
        radii: Array<{ radius: number; rows: Array<{ k: number; total: number; correct: number; falseAccept: number; rejected: number }> }>;
      };
      const rows = (m42.radii.find((r) => r.radius === 2) as (typeof m42.radii)[number]).rows;
      const rep = (fresh.v ??= buildRejectionReport());
      for (const a of rep.allTemplates) {
        const ex = rows.find((r) => r.k === a.weight) as (typeof rows)[number];
        expect([a.events, a.sameCard, a.falseAccept, a.rejected]).toEqual([ex.total, ex.correct, ex.falseAccept, ex.rejected]);
      }
    }, HEAVY);

    it('every recorded group-level counterexample replays from its seed: IDENTIFIED with the recorded wrong cards; the reference comparison reports REFERENCE_MISMATCH and keeps the decoder\'s cards; at radius 1 the weight-3 words are rejected', () => {
      const rep = JSON.parse(readFileSync(resultsDir('m6-1-counterexamples.json'), 'utf8')) as Report;
      expect(rep.counterexamples.length).toBeGreaterThan(0);
      for (const ce of rep.counterexamples) {
        const arr = drawArrangement(mulberry32(ce.groupSeed), 'any');
        expect(arrangementText(arr)).toBe(ce.arrangement);
        const base = composed(arr, {}, 4);
        const img = flipDataModules(base.image, base.centers[ce.slot], 4, ce.flippedBitIndices);
        const r = decodeGroup(img, { radius: 2 });
        const tag = `[seed=${ce.groupSeed} slot=${ce.slot} bits=${ce.flippedBitIndices.join(',')}]`;
        expect(r.kind, tag).toBe('IDENTIFIED');
        if (r.kind !== 'IDENTIFIED') continue;
        expect(r.cards, tag).toEqual(ce.groupCards);
        expect(r.hiddenSum, tag).toBe(ce.groupSum);
        expect(sorted(ce.trueCards), tag).toEqual(cardsOfArrangement(arr));
        expect(ce.groupCards, tag).not.toEqual(ce.trueCards);
        const cmp = compareWithReference(r, ce.trueCards);
        expect(cmp.kind, tag).toBe('REFERENCE_MISMATCH');
        if (cmp.kind === 'REFERENCE_MISMATCH') {
          expect(cmp.decoded, tag).toBe(r);
          expect(sorted(cmp.decodedCards), tag).toEqual(sorted(ce.groupCards));
          expect(cmp.decodedSumReported, tag).toBe(ce.groupSum);
        }
        if (ce.weight === 3) expect(decodeGroup(img, { radius: 1 }).kind, tag).toBe('CORRUPTED_FRAGMENT');
      }
    }, HEAVY);
  });
});

// =============================================================================================
// 5. Fragment in a suit-incompatible slot (Property 15(d), second clause)
// =============================================================================================

describe('5. suit-incompatible slot', () => {
  const G = groups(6, SEED + 500);

  it('physically placing a card whose suit has no fragment at the facing corner (heart in TR or BL, diamond in TL or BR, club/spade in the wrong orientation) leaves 3 markers: INCOMPLETE_GROUP, detected 3 (Property 15(a))', () => {
    const rng = mulberry32(SEED + 510);
    let combos = 0;
    const failures: string[] = [];
    for (const arr of G.slice(0, 3)) {
      for (const slot of SLOT_NAMES) {
        for (const suit of ['H', 'D', 'C', 'S']) {
          for (const o of [0, 180] as const) {
            const card = `${suit}-${RANKS[Math.floor(rng() * 13)]}`;
            if (facingPattern(slot, { card, orientation: o }) !== undefined || cardsOfArrangement(arr).includes(card)) continue;
            combos++;
            const v = randomView(rng);
            const r = decodeGroup(applyView(composed({ ...arr, [slot]: { card, orientation: o } }).image, v));
            if (!(r.kind === 'INCOMPLETE_GROUP' && r.detected === 3)) failures.push(`[${card}@${o} in ${slot} ${viewText(v)}] got ${r.kind}`);
          }
        }
      }
    }
    expect(combos).toBeGreaterThanOrEqual(3 * 16 - 8); // 4 impossible (suit, orientation) choices per slot, a few skipped for duplicate cards
    expect(failures).toEqual([]);
  });

  it('heart CONTENT shown in a TR or BL slot (or diamond content in TL or BR) is an observed transform outside the slot table: INVALID_ARRANGEMENT, and the oracle also finds no camera rotation or mirror that explains it', () => {
    const rng = mulberry32(SEED + 520);
    let n = 0;
    const failures: string[] = [];
    for (const arr of G) {
      for (const [slot, suit, sources] of [
        ['TR', 'H', ['TL', 'BR']],
        ['BL', 'H', ['TL', 'BR']],
        ['TL', 'D', ['TR', 'BL']],
        ['BR', 'D', ['TR', 'BL']],
      ] as Array<[SlotName, string, SlotName[]]>) {
        let X = `${suit}-${RANKS[Math.floor(rng() * 13)]}`;
        while (cardsOfArrangement(arr).includes(X)) X = `${suit}-${RANKS[Math.floor(rng() * 13)]}`;
        for (const src of sources) {
          const content = facingPattern(src, { card: X, orientation: 0 }) as number;
          const obs = { ...observedPatterns(arr), [slot]: content } as Record<SlotName, number>;
          const hyp = hypothesisCounts(obs);
          const v = randomView(rng);
          const r = decodeGroup(applyView(composed(arr, { [slot]: content }).image, v));
          n++;
          const tag = `[${arrangementText(arr)} ${suit}-content of ${X} (as in ${src}) in ${slot} ${viewText(v)}]`;
          if (hyp.plain + hyp.mirrored !== 0) failures.push(`${tag} oracle finds ${hyp.plain + hyp.mirrored} hypotheses`);
          if (!(r.kind === 'INVALID_ARRANGEMENT' && r.reason === 'NO_CONSISTENT_HYPOTHESIS')) failures.push(`${tag} got ${r.kind}`);
        }
      }
    }
    expect(n).toBe(6 * 8);
    expect(failures).toEqual([]);
  });
});

// =============================================================================================
// 6. One physical fragment turned (distinct from whole-image camera rotation)
// =============================================================================================

describe('6. turning ONE fragment gives INVALID_ARRANGEMENT; turning the whole image does not', () => {
  const G = groups(8, SEED + 600);

  it('precondition: turning the pixels of one marker equals rendering the transformed pattern', () => {
    const arr = G[0] as Arrangement;
    const base = composed(arr);
    for (const g of D4) {
      const viaPixels = transformFootprint(base.image, base.centers.BR, MP, g);
      const viaPattern = composed(arr, { BR: applyTransform(g, patOf(arr, 'BR')) }).image;
      expect(Array.from(viaPixels.data), g).toEqual(Array.from(viaPattern.data));
    }
  });

  it('90 / 270 degree turn (and diagonal reflection) of one fragment: INVALID_ARRANGEMENT for every group and slot (8 groups x 4 slots x 4 transforms); the same groups with the WHOLE image rotated by 90 / 270 / a seeded angle stay IDENTIFIED with the same cards', () => {
    const rng = mulberry32(SEED + 610);
    const failures: string[] = [];
    let n = 0;
    for (const [gi, arr] of G.entries()) {
      const base = composed(arr);
      const trueCards = cardsOfArrangement(arr);
      for (const s of SLOT_NAMES) {
        for (const g of ['R90', 'R270', 'Dm', 'Da'] as const) {
          n++;
          const r = decodeGroup(transformFootprint(base.image, base.centers[s], MP, g));
          const tag = `[group ${gi} ${arrangementText(arr)} ${s} fragment turned by ${g}]`;
          if (!(r.kind === 'INVALID_ARRANGEMENT' && r.reason === 'NO_CONSISTENT_HYPOTHESIS')) failures.push(`${tag} got ${r.kind}`);
          // the fragment still reads as the same card: only the arrangement is wrong
          if (r.kind === 'INVALID_ARRANGEMENT' && sorted(r.members.map((m) => (m.outcome.status === 'IDENTIFIED' ? m.outcome.card : '?'))).join() !== trueCards.join()) failures.push(`${tag} members changed`);
        }
      }
      for (const angle of [90, 270, rng() * 360]) {
        const r = decodeGroup(rotateImage(base.image, angle));
        if (r.kind !== 'IDENTIFIED' || sorted(r.cards).join() !== trueCards.join()) failures.push(`[group ${gi} whole image rotated ${angle}] got ${r.kind}`);
      }
    }
    expect(n).toBe(8 * 4 * 4);
    expect(failures).toEqual([]);
  });

  it('a 180 degree turn (or axis reflection) of one fragment is judged by the oracle: INVALID_ARRANGEMENT where the oracle finds no hypothesis, IDENTIFIED with the same cards where it does (a valid composition); decoder and oracle always agree; clubs/spades-only groups produce invalid cases', () => {
    const csGroups = Array.from({ length: 8 }, (_, i) => drawArrangement(mulberry32(SEED + 620 + i), 'cs'));
    const failures: string[] = [];
    const tally = { invalid: 0, valid: 0 };
    for (const [gi, arr] of [...G, ...csGroups].entries()) {
      const base = composed(arr);
      const obs = observedPatterns(arr);
      for (const s of SLOT_NAMES) {
        for (const g of ['R180', 'Fh', 'Fv'] as const) {
          const pred = predictGroup({ ...obs, [s]: applyTransform(g, obs[s]) } as Record<SlotName, number>);
          const r = decodeGroup(transformFootprint(base.image, base.centers[s], MP, g));
          const tag = `[group ${gi} ${arrangementText(arr)} ${s} fragment turned by ${g}]`;
          if (pred.kind === 'INVALID_ARRANGEMENT') {
            tally.invalid++;
            if (r.kind !== 'INVALID_ARRANGEMENT') failures.push(`${tag} oracle invalid, got ${r.kind}`);
          } else if (pred.kind === 'IDENTIFIED') {
            tally.valid++;
            if (r.kind !== 'IDENTIFIED' || sorted(r.cards).join() !== pred.cards.join()) failures.push(`${tag} oracle valid, got ${r.kind}`);
          } else failures.push(`${tag} unexpected oracle kind ${pred.kind}`);
        }
      }
    }
    console.info(`one fragment turned by 180/Fh/Fv: oracle invalid ${tally.invalid}, valid composition ${tally.valid}`);
    expect(tally.invalid).toBeGreaterThan(40);
    expect(failures).toEqual([]);
  });
});

// =============================================================================================
// 7. Three-fragment compositions
// =============================================================================================

describe('7. three-fragment compositions are never IDENTIFIED', () => {
  it('20 groups x 4 missing slots x 8 D4 transforms: INCOMPLETE_GROUP, detected 3, 3 markers', () => {
    const failures: string[] = [];
    let n = 0;
    groups(20, SEED + 700).forEach((arr, gi) => {
      for (const missing of SLOT_NAMES) {
        const base = composed(arr, { [missing]: null }).image;
        for (const t of D4) {
          n++;
          const r = decodeGroup(transformImage(base, t));
          if (!(r.kind === 'INCOMPLETE_GROUP' && r.detected === 3 && r.markers === 3)) failures.push(`[group ${gi} ${arrangementText(arr)} missing ${missing} transform=${t}] got ${JSON.stringify(r.kind === 'INCOMPLETE_GROUP' ? r : r.kind)}`);
        }
      }
    });
    expect(n).toBe(640);
    expect(failures).toEqual([]);
  });
});

// =============================================================================================
// 8. Distractor markers
// =============================================================================================

describe('8. unrelated valid distractor markers', () => {
  const G = groups(6, SEED + 800);
  const summary = (r: GroupDecodeResult): unknown =>
    r.kind === 'IDENTIFIED' ? { cards: r.cards, sum: r.hiddenSum, reflection: r.reflection, n: r.interpretations.length } : r.kind;

  it('a complete group inside a lattice of valid markers of other cards (neighbour pitch, random occupancy 60%, other complete blocks allowed) stays IDENTIFIED with the identical card set, sum, reflection and interpretations, at seeded camera views', () => {
    const rng = mulberry32(SEED + 810);
    const failures: string[] = [];
    let withOtherBlocks = 0;
    for (const [gi, arr] of G.entries()) {
      for (let k = 0; k < 3; k++) {
        const view = randomView(rng);
        const alone = decodeGroup(applyView(composed(arr).image, view));
        const scene = applyView(latticeScene(arr, rng, { missing: null, fill: 0.6, avoidComplete: false }), view);
        const r = decodeGroup(scene);
        const tag = `[group ${gi} ${arrangementText(arr)} ${viewText(view)}]`;
        if (JSON.stringify(summary(r)) !== JSON.stringify(summary(alone))) failures.push(`${tag} ${JSON.stringify(summary(r))} != alone ${JSON.stringify(summary(alone))}`);
        if (r.kind === 'IDENTIFIED' && r.alternativeClusters > 0) withOtherBlocks++;
      }
    }
    expect(failures).toEqual([]);
    expect(withOtherBlocks).toBeGreaterThan(0); // the scenes do contain other complete groups, and they are ignored
  });

  it('a 3-fragment target inside a lattice of valid markers of other cards, with no complete block anywhere (every 3-of-4 block could be "completed" by one more marker): INCOMPLETE_GROUP, detected 3, never IDENTIFIED', () => {
    const rng = mulberry32(SEED + 820);
    const failures: string[] = [];
    let n = 0;
    for (const [gi, arr] of G.entries()) {
      for (const missing of SLOT_NAMES) {
        const view = randomView(rng);
        const r = decodeGroup(applyView(latticeScene(arr, rng, { missing, fill: 0.7, avoidComplete: true }), view));
        n++;
        if (!(r.kind === 'INCOMPLETE_GROUP' && r.detected === 3)) failures.push(`[group ${gi} ${arrangementText(arr)} missing ${missing} ${viewText(view)}] got ${r.kind}`);
      }
    }
    expect(n).toBe(24);
    expect(failures).toEqual([]);
  });

  it('a valid marker of another card placed NEAR the missing slot but outside the position tolerance (1.5, 2, 3, 5 modules, outward, every slot) does not complete the group', () => {
    const rng = mulberry32(SEED + 830);
    const failures: string[] = [];
    let n = 0;
    for (const [gi, arr] of G.slice(0, 3).entries()) {
      for (const missing of SLOT_NAMES) {
        const base = composed(arr, { [missing]: null });
        const c = base.centers[missing];
        const sx = missing === 'TL' || missing === 'BL' ? -1 : 1;
        const sy = missing === 'TL' || missing === 'TR' ? -1 : 1;
        for (const delta of [1.5, 2, 3, 5]) {
          for (const [dx, dy] of [[sx, 0], [0, sy], [sx, sy]] as Array<[number, number]>) {
            n++;
            const img: GrayImage = { width: base.image.width, height: base.image.height, data: Uint8Array.from(base.image.data) };
            const m = renderMarker(distractorPattern(rng, cardsOfArrangement(arr)), MP);
            // canvas is padded so that the displaced footprint stays inside
            const padded = blankImage(img.width + 16 * MP, img.height + 16 * MP, 255);
            pasteImage(padded, img, 8 * MP, 8 * MP);
            const o = footprintOrigin({ x: c.x + 8 * MP + dx * delta * MP, y: c.y + 8 * MP + dy * delta * MP }, MP);
            pasteImage(padded, m, Math.round(o.x), Math.round(o.y));
            const r = decodeGroup(padded);
            if (!(r.kind === 'INCOMPLETE_GROUP' && r.detected === 3)) failures.push(`[group ${gi} missing ${missing} marker displaced ${delta} modules along (${dx},${dy})] got ${r.kind}`);
          }
        }
      }
    }
    expect(n).toBe(3 * 4 * 12);
    expect(failures).toEqual([]);
  });

  it('CHARACTERIZATION (not a violation of the written design): if the vertex at the image centre has only 3 fragments but another, genuine, complete group is in view, decodeGroup returns that other group, built only from its own four markers, and reports its vertex', () => {
    const [target, far] = [G[0] as Arrangement, G[1] as Arrangement];
    const farCards = cardsOfArrangement(far);
    const size = LAT_MODULES * MP;
    for (const missing of SLOT_NAMES) {
      const canvas = blankImage(size, size, 255);
      const t = composed(target, { [missing]: null });
      pasteImage(canvas, t.image, size / 2 - t.image.width / 2, size / 2 - t.image.height / 2);
      const f = composed(far);
      const farVertexX = size / 2 + 28 * MP;
      pasteImage(canvas, f.image, farVertexX - f.image.width / 2, size / 2 - f.image.height / 2);
      const r = identified(decodeGroup(canvas), `far group, ${missing} missing in the target`);
      expect(sorted(r.cards)).toEqual(farCards);
      expect(r.hiddenSum).toBe(referenceSum(farCards));
      // (set equality with farCards above also excludes any mixture with the target's three fragments)
      expect(Math.abs(r.vertex.x - farVertexX)).toBeLessThan(MP); // the reported vertex is the far group's, not the image centre
      expect(Math.abs(r.vertex.y - size / 2)).toBeLessThan(MP);
    }
  });
});

// =============================================================================================
// 9 / 10. Physical (rounded-corner) boards, both faces, both flips
// =============================================================================================

interface PhysView {
  label: string;
  face: CardFace;
  flip: CardFlip | undefined;
}
const PHYS_VIEWS: PhysView[] = [
  { label: 'FRONT', face: 'FRONT', flip: undefined },
  { label: 'BACK after vertical-axis flip', face: 'BACK', flip: flipCard('VERTICAL') },
  { label: 'BACK after horizontal-axis flip', face: 'BACK', flip: flipCard('HORIZONTAL') },
];

describe('9/10. physical composition (baseline rounded cards, zero gap): one card absent, both faces, both flips', () => {
  const geometry = physicalGeometry();
  const W = Math.round(geometry.cardWidthMm * DEFAULT_PX_PER_MM);
  const H = Math.round(geometry.cardHeightMm * DEFAULT_PX_PER_MM);

  const obsCache = new Map<string, ReturnType<typeof observeFace>>();
  const observe = (card: string, v: PhysView, o: Orientation): ReturnType<typeof observeFace> => {
    const key = `${card}|${v.label}|${o}`;
    let hit = obsCache.get(key);
    if (!hit) {
      hit = observeFace(card, v.face, o, v.flip);
      obsCache.set(key, hit);
    }
    return hit;
  };

  /** Observed image of `card` lying so that it shows `pattern` at `corner` in this view, or null if no orientation does. */
  function cellFor(card: string, corner: Corner, pattern: number | undefined, v: PhysView): { image: GrayImage; patterns: CellPatterns } | null {
    for (const o of [0, 180] as const) {
      const obs = observe(card, v, o);
      if (pattern === undefined ? obs.patterns[corner] === undefined : obs.patterns[corner] === pattern) return { image: obs.image, patterns: obs.patterns };
    }
    return null;
  }

  function groupCells(arr: Arrangement, v: PhysView): Record<SlotName, { image: GrayImage; patterns: CellPatterns }> {
    const out = {} as Record<SlotName, { image: GrayImage; patterns: CellPatterns }>;
    for (const s of SLOT_NAMES) {
      const cell = cellFor(arr[s].card, FACING[s], facingPattern(s, arr[s]), v);
      if (!cell) throw new Error(`${v.label}: no orientation of ${arr[s].card} shows the expected fragment at ${FACING[s]} for slot ${s}`);
      out[s] = cell;
    }
    return out;
  }

  const gridOf = (c: Record<SlotName, { image: GrayImage }>, absent: SlotName | null): Array<Array<GrayImage | null>> => {
    const pick = (s: SlotName): GrayImage | null => (s === absent ? null : c[s].image);
    return [[pick('TL'), pick('TR')], [pick('BL'), pick('BR')]];
  };
  const board2x2 = (c: Record<SlotName, { image: GrayImage }>, absent: SlotName | null): GrayImage =>
    boardAroundVertex(gridOf(c, absent), { a: 1, b: 1 }, geometry.tableGray, W + 40, H + 40);

  const G = groups(4, SEED + 900);

  it('precondition: the assembled FRONT board is pixel-identical to composeBoard, and a complete group decodes IDENTIFIED in every view', () => {
    for (const arr of G) {
      const cells = groupCells(arr, PHYS_VIEWS[0] as PhysView);
      const px = DEFAULT_PX_PER_MM;
      const board = composeBoard(
        [[arr.TL, arr.TR], [arr.BL, arr.BR]],
        {},
        { regionMm: { x0: geometry.cardWidthMm - (W + 40) / px, y0: geometry.cardHeightMm - (H + 40) / px, x1: geometry.cardWidthMm + (W + 40) / px, y1: geometry.cardHeightMm + (H + 40) / px } },
      );
      const mine = board2x2(cells, null);
      expect(Array.from(mine.data)).toEqual(Array.from(board.image.data));
      for (const v of PHYS_VIEWS) {
        const r = identified(decodeGroup(board2x2(groupCells(arr, v), null)), `${v.label} ${arrangementText(arr)}`);
        expect(sorted(r.cards)).toEqual(cardsOfArrangement(arr));
        expect(r.hiddenSum).toBe(referenceSum(cardsOfArrangement(arr)));
      }
    }
  }, HEAVY);

  it('one card absent from the 2x2 composition (table gray in its place): three markers around the vertex, INCOMPLETE_GROUP, on FRONT, on BACK after a vertical-axis flip and on BACK after a horizontal-axis flip (4 groups x 4 absent slots x 3 views)', () => {
    const failures: string[] = [];
    let n = 0;
    for (const [gi, arr] of G.entries()) {
      for (const v of PHYS_VIEWS) {
        const cells = groupCells(arr, v);
        for (const absent of SLOT_NAMES) {
          n++;
          const r = decodeGroup(board2x2(cells, absent));
          // 3 of the 4 facing fragments exist; `markers` counts every marker in view (each card also shows one fragment at
          // another corner), so only `detected` is asserted.
          if (!(r.kind === 'INCOMPLETE_GROUP' && r.detected === 3)) failures.push(`[group ${gi} ${arrangementText(arr)} ${v.label} absent ${absent}] got ${JSON.stringify(r.kind === 'INCOMPLETE_GROUP' ? r : r.kind)}`);
        }
      }
    }
    expect(n).toBe(48);
    expect(failures).toEqual([]);
  }, HEAVY);

  it('a ♥ physically placed in the TR slot (♦ in TL, BR; ♥ in BL) shows no fragment at the facing corner: three markers, INCOMPLETE_GROUP, in every view', () => {
    const failures: string[] = [];
    let n = 0;
    for (const arr of G.slice(0, 2)) {
      for (const v of PHYS_VIEWS) {
        const cells = groupCells(arr, v);
        for (const [slot, card] of [['TR', 'H-4'], ['BL', 'H-4'], ['TL', 'D-4'], ['BR', 'D-4']] as Array<[SlotName, string]>) {
          if (cardsOfArrangement(arr).includes(card)) continue;
          const wrong = cellFor(card, FACING[slot], undefined, v);
          if (!wrong) throw new Error(`${card} always shows a fragment at ${FACING[slot]} in ${v.label}`);
          n++;
          const swapped = { ...cells, [slot]: wrong };
          const r = decodeGroup(board2x2(swapped, null));
          if (!(r.kind === 'INCOMPLETE_GROUP' && r.detected === 3)) failures.push(`[${arrangementText(arr)} ${card} in ${slot} ${v.label}] got ${r.kind}`);
        }
      }
    }
    expect(n).toBeGreaterThanOrEqual(20);
    expect(failures).toEqual([]);
  }, HEAVY);

  it('3x3 board with five neighbouring cards (their outward and other-vertex fragments are Distractor_Markers; no other vertex has 4 markers): complete centre group IDENTIFIED, one card absent INCOMPLETE_GROUP with detected 3, in every view', () => {
    const failures: string[] = [];
    let n = 0;
    for (const [gi, arr] of G.slice(0, 3).entries()) {
      for (const v of PHYS_VIEWS) {
        const cells = groupCells(arr, v);
        // five neighbours of the 3x3 board: (0,2), (1,2), (2,0), (2,1), (2,2), seeded and rejection-sampled so that no
        // other interior vertex ever has 4 markers (ground truth from the visible corner patterns).
        const used = new Set(cardsOfArrangement(arr));
        const rng = mulberry32(SEED + 910 + gi);
        let neighbours: Array<{ image: GrayImage; patterns: CellPatterns }> = [];
        for (let attempt = 0; attempt < 500; attempt++) {
          const pool = shuffle(rng, ALL_CARDS.filter((c) => !used.has(c))).slice(0, 5);
          neighbours = pool.map((card) => {
            const obs = observe(card, v, rng() < 0.5 ? 0 : 180);
            return { image: obs.image, patterns: obs.patterns };
          });
          const grid: Array<Array<CellPatterns | null>> = [
            [cells.TL.patterns, cells.TR.patterns, (neighbours[0] as { patterns: CellPatterns }).patterns],
            [cells.BL.patterns, cells.BR.patterns, (neighbours[1] as { patterns: CellPatterns }).patterns],
            [(neighbours[2] as { patterns: CellPatterns }).patterns, (neighbours[3] as { patterns: CellPatterns }).patterns, (neighbours[4] as { patterns: CellPatterns }).patterns],
          ];
          if ([[1, 2], [2, 1], [2, 2]].every(([a, b]) => vertexMarkerCount(grid, a as number, b as number) < 4)) break;
          if (attempt === 499) throw new Error('no neighbour layout without a second complete vertex');
        }
        const board = (absent: SlotName | null): GrayImage => {
          const g = gridOf(cells, absent);
          const nb = (k: number): GrayImage => (neighbours[k] as { image: GrayImage }).image;
          return boardAroundVertex(
            [
              [g[0]?.[0] ?? null, g[0]?.[1] ?? null, nb(0)],
              [g[1]?.[0] ?? null, g[1]?.[1] ?? null, nb(1)],
              [nb(2), nb(3), nb(4)],
            ],
            { a: 1, b: 1 },
            geometry.tableGray,
            2 * W,
            2 * H,
          );
        };
        const full = decodeGroup(board(null));
        n++;
        if (full.kind !== 'IDENTIFIED' || sorted(full.cards).join() !== cardsOfArrangement(arr).join()) failures.push(`[group ${gi} ${v.label} complete, 3x3] got ${full.kind}`);
        for (const absent of SLOT_NAMES) {
          n++;
          const r = decodeGroup(board(absent));
          if (!(r.kind === 'INCOMPLETE_GROUP' && r.detected === 3)) failures.push(`[group ${gi} ${arrangementText(arr)} ${v.label} absent ${absent}, 3x3] got ${r.kind}`);
        }
      }
    }
    expect(n).toBe(3 * 3 * 5);
    expect(failures).toEqual([]);
  }, HEAVY);

  it('the faces and flips exercised are exactly FRONT, BACK + vertical-axis flip, BACK + horizontal-axis flip', () => {
    expect(CARD_FACES).toEqual(['FRONT', 'BACK']);
    expect(PHYS_VIEWS.map((v) => v.flip?.axis ?? 'none')).toEqual(['none', 'VERTICAL', 'HORIZONTAL']);
  });
});

// =============================================================================================
// 11. Spurious detector candidates
// =============================================================================================

describe('11. spurious candidates cannot fabricate a four-card group', () => {
  const MP10 = 10;
  const BAD = 0x5ac54; // the documented spurious 1x2-module blob case (m4-3): the marker itself decodes as CORRUPTED_FRAGMENT
  const arr: Arrangement = {
    TL: { card: 'H-5', orientation: 0 },
    TR: { card: 'D-9', orientation: 0 },
    BL: { card: 'C-J', orientation: 0 },
    BR: { card: 'S-2', orientation: 0 },
  };

  it('0x5AC54 at the missing slot of a 3-fragment target (marker + its blob): the result is exactly what the brute-force predictor says for four read markers (CORRUPTED_FRAGMENT), never IDENTIFIED; far away it changes nothing about an incomplete target', () => {
    const obs = observedPatterns(arr);
    expect(nearestTemplate(BAD).distance).toBeGreaterThan(1);
    for (const missing of SLOT_NAMES) {
      const withBad = composed(arr, { [missing]: BAD }, MP10);
      const r = decodeGroup(withBad.image);
      const pred = predictGroup({ ...obs, [missing]: BAD } as Record<SlotName, number>);
      expect(pred.kind).toBe('CORRUPTED_FRAGMENT');
      expect(r.kind, missing).toBe(pred.kind);
      if (r.kind === 'CORRUPTED_FRAGMENT') expect(Object.keys(r.nearestDistances)).toEqual([missing]);
      // 3-fragment target with the 0x5AC54 marker far away: incomplete, the marker (and its blob) never completes anything
      const g = composed(arr, { [missing]: null }, MP10);
      const S = 80 * MP10;
      const canvas = blankImage(S, S, 255);
      pasteImage(canvas, g.image, (S - g.image.width) / 2, (S - g.image.height) / 2);
      pasteImage(canvas, renderMarker(BAD, MP10), 17, 13);
      const far = decodeGroup(canvas);
      expect(far.kind, `far ${missing}`).toBe('INCOMPLETE_GROUP');
    }
  });

  it('blobs and noise near the vertex or in the missing slot never complete a 3-fragment group (1x2 and 3x3 black blobs, disc in the Central_Void, 3% salt noise over the slot, 4 groups x 4 slots)', () => {
    const rng = mulberry32(SEED + 1100);
    const failures: string[] = [];
    for (const [gi, a] of groups(4, SEED + 1110).entries()) {
      for (const missing of SLOT_NAMES) {
        const g = composed(a, { [missing]: null }, MP10);
        const c = g.centers[missing];
        const make = (draw: (img: GrayImage) => void): GrayImage => {
          const img: GrayImage = { width: g.image.width, height: g.image.height, data: Uint8Array.from(g.image.data) };
          draw(img);
          return img;
        };
        const cases: Array<[string, GrayImage]> = [
          ['1x2 blob at the slot centre', make((i) => fillRect(i, Math.round(c.x - MP10), Math.round(c.y - MP10 / 2), 2 * MP10, MP10, 0))],
          ['3x3 square at the slot centre', make((i) => fillRect(i, Math.round(c.x - 1.5 * MP10), Math.round(c.y - 1.5 * MP10), 3 * MP10, 3 * MP10, 0))],
          [
            'disc r = 2 modules in the Central_Void',
            make((i) => {
              for (let y = 0; y < i.height; y++) for (let x = 0; x < i.width; x++) if (Math.hypot(x + 0.5 - g.vertex.x, y + 0.5 - g.vertex.y) <= 2 * MP10) i.data[y * i.width + x] = 0;
            }),
          ],
          [
            '3% salt noise over the slot footprint',
            make((i) => {
              const o = footprintOrigin(c, MP10);
              for (let y = o.y; y < o.y + 9 * MP10; y++) for (let x = o.x; x < o.x + 9 * MP10; x++) if (rng() < 0.03) i.data[y * i.width + x] = 0;
            }),
          ],
        ];
        for (const [name, img] of cases) {
          const r = decodeGroup(img);
          if (r.kind === 'IDENTIFIED') failures.push(`[group ${gi} ${arrangementText(a)} missing ${missing}: ${name}] IDENTIFIED ${r.cards.join()}`);
          else if (name !== '3% salt noise over the slot footprint' && r.kind !== 'INCOMPLETE_GROUP') failures.push(`[group ${gi} missing ${missing}: ${name}] got ${r.kind}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('four markers that are NOT genuine fragments (solid black 7x7, or an empty frame) in the four slots give CORRUPTED_FRAGMENT, never IDENTIFIED; a genuine group with one such marker in place of a fragment is also rejected', () => {
    for (const bits of [0x1ffffff, 0]) {
      const img = composed(arr, { TL: bits, TR: bits, BL: bits, BR: bits });
      const r = decodeGroup(img.image);
      expect(r.kind, `bits ${bits}`).toBe('CORRUPTED_FRAGMENT');
      if (r.kind === 'CORRUPTED_FRAGMENT') expect(Object.keys(r.nearestDistances).sort()).toEqual(['BL', 'BR', 'TL', 'TR']);
      for (const s of SLOT_NAMES) expect(decodeGroup(composed(arr, { [s]: bits }).image).kind, `${s} ${bits}`).toBe('CORRUPTED_FRAGMENT');
    }
  });
});

// =============================================================================================
// 12. Reference comparison never substitutes expected identities
// =============================================================================================

describe('12. reference comparison with rejected / incomplete / corrupted / wrong results', () => {
  // Existing coverage (reference-check.test.ts section 6, decode-group.properties.test.ts P-E) already shows the
  // pass-through for the six base kinds. Here: the new result shapes of task 6.1 and the one that matters most, a false
  // acceptance at radius 2 (IDENTIFIED with wrong cards), compared with the true reference.
  const arr = drawArrangement(mulberry32(SEED + 1200), 'any');
  const truth = cardsOfArrangement(arr);
  const other = ['H-A', 'D-A', 'C-A', 'S-A'];

  it('3-fragment, physical-gap-free, spurious-solid and 90-degree results are returned unchanged (same object) for the true reference and for a different valid reference; no hiddenSum is manufactured', () => {
    const base = composed(arr);
    const results: Array<[string, GroupDecodeResult]> = [
      ['INCOMPLETE_GROUP 3 fragments', decodeGroup(composed(arr, { BL: null }).image)],
      ['INCOMPLETE_GROUP 1 fragment', decodeGroup(composed(arr, { TL: null, TR: null, BL: null }).image)],
      ['NOT_DETECTED', decodeGroup(composed(arr, { TL: null, TR: null, BL: null, BR: null }).image)],
      ['CORRUPTED_FRAGMENT 3 flips', decodeGroup(flipDataModules(base.image, base.centers.TR, MP, [0, 12, 24]))],
      ['DUPLICATE_CARD', decodeGroup(composed(arr, { BR: applyTransform('R90', patOf(arr, 'TL')) }).image)],
      ['INVALID_ARRANGEMENT one fragment turned', decodeGroup(transformFootprint(base.image, base.centers.BR, MP, 'R90'))],
    ];
    for (const [label, r] of results) {
      expect(r.kind, label).not.toBe('IDENTIFIED');
      for (const ref of [truth, other]) {
        const out = compareWithReference(r, ref);
        expect(out, label).toBe(r);
        expect('hiddenSum' in out, label).toBe(false);
        expect(out.kind, label).toBe(r.kind);
      }
    }
    expect(results.map(([, r]) => r.kind)).toEqual(['INCOMPLETE_GROUP', 'INCOMPLETE_GROUP', 'NOT_DETECTED', 'CORRUPTED_FRAGMENT', 'DUPLICATE_CARD', 'INVALID_ARRANGEMENT']);
  });

  it('a wrong IDENTIFIED result (radius-2 false acceptance, from the recorded counterexamples) compared with the TRUE reference is REFERENCE_MISMATCH: decoder result kept, reference cards and sum never substituted', () => {
    const rep = JSON.parse(readFileSync(fileURLToPath(new URL('../../docs/optical/results/m6-1-counterexamples.json', import.meta.url)), 'utf8')) as Report;
    const ce = rep.counterexamples[0];
    expect(ce).toBeDefined();
    if (!ce) return;
    const a = drawArrangement(mulberry32(ce.groupSeed), 'any');
    const b = composed(a, {}, 4);
    const r = identified(decodeGroup(flipDataModules(b.image, b.centers[ce.slot], 4, ce.flippedBitIndices), { radius: 2 }), 'counterexample');
    const out = compareWithReference(r, cardsOfArrangement(a));
    expect(out.kind).toBe('REFERENCE_MISMATCH');
    if (out.kind !== 'REFERENCE_MISMATCH') return;
    expect(out.decoded).toBe(r);
    expect(out.decodedCards).toEqual(sorted(r.cards));
    expect(out.decodedSumReported).toBe(r.hiddenSum);
    expect(out.referenceSum).toBe(referenceSum(cardsOfArrangement(a)));
    expect(out.referenceSum).not.toBe(out.decodedSumReported);
    // the decoder's own result object is untouched by the comparison
    expect(r.cards).toEqual(ce.groupCards);
    // and with the reference equal to the (wrong) decoded set the comparison cannot know better: it matches
    expect(compareWithReference(r, r.cards)).toBe(r);
  });
});

// =============================================================================================
// Seeded sweep over all violation types (Property 15, all clauses)
// =============================================================================================

describe('sweep: every violation type, seeded, deterministic', () => {
  const PER_TYPE = 12;

  for (const violation of VIOLATIONS) {
    it(`${violation}: ${PER_TYPE} seeded cases are rejected with the expected kind (never IDENTIFIED); reference comparison leaves them unchanged`, () => {
      const failures: string[] = [];
      for (let i = 0; i < PER_TYPE; i++) failures.push(...runCase(buildCase(SEED + 2000 + 97 * i + VIOLATIONS.indexOf(violation) * 10007, violation)));
      expect(failures).toEqual([]);
    }, HEAVY);
  }

  it('property (fast-check, fixed seed): for any violation type and any seed the result kind is never IDENTIFIED and equals the expected kind', () => {
    fc.assert(
      fc.property(fc.constantFrom(...VIOLATIONS), fc.integer({ min: 1, max: 2_000_000 }), (violation, seed) => {
        expect(runCase(buildCase(seed, violation))).toEqual([]);
      }),
      { seed: SEED, numRuns: 120 },
    );
  }, HEAVY);

  it('reproducibility: a case is a function of (seed, violation); same inputs give the same pixels and result, and the message tag carries seed, violation, transform, angle, arrangement and detail', () => {
    for (const violation of VIOLATIONS) {
      const a = buildCase(SEED + 3000, violation);
      const b = buildCase(SEED + 3000, violation);
      expect(Array.from(b.image.data), violation).toEqual(Array.from(a.image.data));
      expect(JSON.stringify(decodeGroup(b.image)), violation).toBe(JSON.stringify(decodeGroup(a.image)));
      const tag = caseTag(a);
      for (const part of [`seed=${a.seed}`, `violation=${violation}`, 'transform=', 'angle=', 'arrangement=TL:', 'detail=']) expect(tag).toContain(part);
    }
    // a deliberately wrong expectation is reported with the tag
    const c = buildCase(SEED + 3001, 'REMOVE_1');
    const msgs = runCase({ ...c, expect: { kind: 'NOT_DETECTED' } });
    expect(msgs.length).toBeGreaterThan(0);
    expect(msgs[0]).toContain('violation=REMOVE_1');
  });

  it('the violation list covers every clause of Property 15: (a) removed, (b) duplicate, (c) flipped modules, (d) transform outside the table / wrong suit', () => {
    expect(VIOLATIONS.filter((v) => v.startsWith('REMOVE')).length).toBe(4);
    expect(VIOLATIONS).toContain('DUPLICATE_SAME_CARD');
    expect(VIOLATIONS).toContain('CORRUPT_2_FLIPS');
    expect(VIOLATIONS).toContain('CORRUPT_3_FLIPS');
    expect(VIOLATIONS).toContain('WRONG_SUIT_CONTENT');
    expect(VIOLATIONS).toContain('FRAGMENT_ROTATED_90_OR_270');
  });
});
