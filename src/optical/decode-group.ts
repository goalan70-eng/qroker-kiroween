/**
 * Four-card group decoder (design.md, Optical Marker System, sections 3-5 and 7 steps 2-7; task 5.1).
 *
 * Input: ONE grayscale image (plus tuning options). Output: the four cards that meet at a vertex, their
 * exact Hidden_Sum, whether the image is mirrored, and every slot interpretation that is consistent with
 * the slot table. Nothing else enters: no expected cards, no placement record and no game input. Whatever
 * is read is reported as read; a failed recognition is never replaced by a guess.
 *
 * Pipeline: detectMarkers -> vertex clustering -> per-marker re-framing -> decodeFragment per member ->
 * duplicate check -> 8-hypothesis check against the slot table -> classification -> sum.
 *
 * Geometry assumption (flat layout, UNVERIFIED on real cards): each card's inward marker footprint (9x9
 * modules incl. a 1-module white margin) is 1 module (Marker_Inset) from the card edge, so the four marker
 * centres around a vertex are at (+-5.5, +-5.5) modules from the vertex in the group frame. The offset,
 * the position tolerance and the size-ratio range are options, so later geometry experiments can change
 * them. Only marker centres are used; the four fragments are never assumed to form a connected square
 * (Central_Void).
 *
 * Frames. detect.ts reports each marker in its own canonical frame: a marker rotated clockwise by theta
 * is read as R90^k . P with canonical angle a = theta - 90 k in (-45, 45]. Near +-45 degrees two markers of
 * one group can therefore sit in canonical frames that differ by one quarter turn. The group axis alpha is
 * the circular mean (period 90 degrees) of the member angles. With G the member's content seen in the group
 * frame (image content turned counter-clockwise by alpha) and bits_m the detector's reading, the member's
 * canonical angle is a_m = alpha + 90 j with j = round((a_m - alpha) / 90), hence bits_m = R90^(-j) . G and
 * G = R90^j . bits_m. This direction is proven by tests at boundary angles.
 *
 * Hypotheses. The group frame differs from the nominal (printed) frame by an element h of D4 (4 quarter
 * turns x optional mirror). A member observed at slot s with transform g_obs came from nominal slot
 * h^-1(s) with nominal transform g = h^-1 o g_obs ((g.P)[g(x)] = P[x] composition, from the bit-index
 * permutations of transforms.ts). A hypothesis passes iff every member's nominal transform is allowed for
 * (suit, nominal slot). The allowed table is DERIVED from FRAGMENT_LAYOUT (see ALLOWED_PLACEMENTS), not typed in.
 *
 * Classification of the passing set (design step 6): 2 non-reflected -> NOT_REFLECTED; 2 reflected ->
 * REFLECTED; 2 + 2 -> AMBIGUOUS (clubs/spades only); 0 -> INVALID_ARRANGEMENT; any other count is
 * rejected as INVALID_ARRANGEMENT / INTERNAL_HYPOTHESIS_COUNT. Reflection is never guessed.
 *
 * EXTENSIONS beyond the design's result list (documented on purpose):
 *  - interpretation-level `orientation` (0 | 180 | 'EITHER'; hearts/diamonds are optically identical at 0
 *    and 180 so they report 'EITHER');
 *  - kind INVALID_MARKER (pass-through of detect.ts when no valid marker exists);
 *  - kind AMBIGUOUS_FRAGMENT (a member matches two cards; unreachable with the frozen codebook);
 *  - INVALID_ARRANGEMENT reason INTERNAL_HYPOTHESIS_COUNT;
 *  - `others` (DISTRACTOR_FRAGMENT / SPURIOUS_CANDIDATE) and `alternativeClusters`.
 * REFERENCE_MISMATCH is deliberately absent: it belongs to the reference-check module.
 *
 * LIMITS: the clustering tolerances are defaults chosen for the flat layout and measured on synthetic
 * images only; spurious markers that fall inside the cluster area with a size similar to the markers are
 * not handled; no real camera was used.
 *
 * `cards` is listed in the canonical order suit H, D, C, S then rank A..K.
 */
import { detectMarkers } from './detect';
import type { DetectOptions, DetectedMarker, Point, RejectedCandidate } from './detect';
import { decodeFragment } from './decode-fragment';
import type { FragmentOutcome, Radius } from './decode-fragment';
import { BIT_PERMUTATIONS, TRANSFORM_NAMES, applyTransform } from './transforms';
import type { TransformName } from './transforms';
import { FRAGMENT_LAYOUT } from './fragments';
import type { Corner, Orientation, Suit } from './fragments';
import type { GrayImage } from './render';

export type Slot = Corner;
export const SLOTS: readonly Slot[] = ['TL', 'TR', 'BL', 'BR'];
export type Reflection = 'NOT_REFLECTED' | 'REFLECTED' | 'AMBIGUOUS';

export interface DecodeGroupOptions {
  detect?: DetectOptions;
  /** Acceptance radius of the fragment matcher, 1 (default) or 2. */
  radius?: Radius;
  /** Distance of each marker centre from the vertex along each axis, in marker modules (default 5.5). */
  centerOffsetModules?: number;
  /** Allowed distance between a marker centre and its predicted slot centre, in modules (default 1.0). */
  positionToleranceModules?: number;
  /** Allowed marker size relative to the cluster median (default [0.75, 1.33]). */
  sizeRatioRange?: readonly [number, number];
  /** Allowed difference of the marker axis angles (modulo 90 degrees) inside one cluster (default 15). */
  axisToleranceDeg?: number;
  uncertainThreshold?: number;
}

export interface GroupMember {
  slot: Slot;
  marker: DetectedMarker;
  /** Quarter turns j applied to the detector bits to express them in the group frame (G = R90^j . bits). */
  quarterTurns: number;
  outcome: FragmentOutcome;
}

export interface OtherMarker {
  classification: 'DISTRACTOR_FRAGMENT' | 'SPURIOUS_CANDIDATE';
  marker: DetectedMarker;
  outcome: FragmentOutcome;
}

export interface SlotAssignment {
  card: string;
  orientation: Orientation | 'EITHER';
}

export interface SlotInterpretation {
  reflected: boolean;
  /** The D4 element h: group frame = h applied to the nominal frame. */
  hypothesis: TransformName;
  slots: Record<Slot, SlotAssignment>;
}

export interface FragmentReading {
  card: string;
  /** Slot in the group frame. */
  slot: Slot;
  /** Observed transform in the group frame. */
  transform: TransformName;
  distance: number;
  center: Point;
  minCellConfidence: number | null;
  uncertainCells: number[];
}

interface Located {
  vertex: Point;
  groupAxisDeg: number;
  others: OtherMarker[];
  alternativeClusters: number;
}

export type GroupDecodeResult =
  | { kind: 'NOT_DETECTED' }
  | { kind: 'INVALID_MARKER'; rejected: RejectedCandidate[] }
  | { kind: 'INCOMPLETE_GROUP'; detected: number; markers: number }
  | ({ kind: 'CORRUPTED_FRAGMENT'; members: GroupMember[]; nearestDistances: Partial<Record<Slot, number>> } & Located)
  | ({ kind: 'AMBIGUOUS_FRAGMENT'; members: GroupMember[] } & Located)
  | ({ kind: 'DUPLICATE_CARD'; card: string; members: GroupMember[] } & Located)
  | ({
      kind: 'INVALID_ARRANGEMENT';
      reason: 'NO_CONSISTENT_HYPOTHESIS' | 'INTERNAL_HYPOTHESIS_COUNT';
      passing?: number;
      members: GroupMember[];
    } & Located)
  | ({
      kind: 'IDENTIFIED';
      cards: string[];
      hiddenSum: number;
      reflection: Reflection;
      interpretations: SlotInterpretation[];
      readings: FragmentReading[];
      members: GroupMember[];
    } & Located);

// ---------------------------------------------------------------------------------------------
// D4 algebra, derived from the bit-index permutations of transforms.ts
// ---------------------------------------------------------------------------------------------

const D4: readonly TransformName[] = TRANSFORM_NAMES;
const MIRRORS: ReadonlySet<TransformName> = new Set<TransformName>(['Fh', 'Fv', 'Dm', 'Da']);

function permOf(g: TransformName): readonly number[] {
  return BIT_PERMUTATIONS[g];
}

function nameOfPerm(p: readonly number[]): TransformName {
  for (const g of D4) {
    const q = permOf(g);
    if (q.every((v, i) => v === p[i])) return g;
  }
  throw new Error('permutation is not an element of D4');
}

/** (a o b): apply b first, then a, in the convention (g.P)[g(x)] = P[x]. */
export function composeTransforms(a: TransformName, b: TransformName): TransformName {
  const pa = permOf(a);
  const pb = permOf(b);
  return nameOfPerm(pb.map((v) => pa[v] as number));
}

export function inverseTransform(a: TransformName): TransformName {
  const found = D4.find((b) => composeTransforms(a, b) === 'I');
  if (found === undefined) throw new Error('no inverse');
  return found;
}

/** Same cell maps as transforms.ts, for a square grid whose last index is `last` (4 for data, 1 for slots). */
export function mapCell(g: TransformName, r: number, c: number, last: number): readonly [number, number] {
  switch (g) {
    case 'I':
      return [r, c];
    case 'R90':
      return [c, last - r];
    case 'R180':
      return [last - r, last - c];
    case 'R270':
      return [last - c, r];
    case 'Fh':
      return [last - r, c];
    case 'Fv':
      return [r, last - c];
    case 'Dm':
      return [c, r];
    case 'Da':
      return [last - c, last - r];
  }
}

const SLOT_RC: Record<Slot, readonly [number, number]> = { TL: [0, 0], TR: [0, 1], BL: [1, 0], BR: [1, 1] };
const RC_SLOT: Record<string, Slot> = { '0,0': 'TL', '0,1': 'TR', '1,0': 'BL', '1,1': 'BR' };

function mapSlot(g: TransformName, s: Slot): Slot {
  const [r, c] = SLOT_RC[s];
  const [r2, c2] = mapCell(g, r, c, 1);
  return RC_SLOT[`${r2},${c2}`] as Slot;
}

// ---------------------------------------------------------------------------------------------
// Allowed placements, derived from FRAGMENT_LAYOUT
// ---------------------------------------------------------------------------------------------

const OPPOSITE: Record<Corner, Corner> = { TL: 'BR', BR: 'TL', TR: 'BL', BL: 'TR' };
/** The corner of a card that faces a vertex when the card is in slot s: TL->BR, TR->BL, BL->TR, BR->TL. */
const INWARD_CORNER: Record<Slot, Corner> = { TL: 'BR', TR: 'BL', BL: 'TR', BR: 'TL' };

export interface AllowedPlacement {
  /** Observed transform of the card's base pattern at the vertex. */
  transform: TransformName;
  /** Card orientations that produce it. */
  orientations: Orientation[];
}

function printedTransform(suit: Suit, corner: Corner): TransformName | null {
  const lay = FRAGMENT_LAYOUT[suit];
  if (corner === lay.base) return 'I';
  if (corner === lay.derived) return lay.via;
  return null;
}

function derivePlacements(): Record<Suit, Record<Slot, AllowedPlacement[]>> {
  const out = {} as Record<Suit, Record<Slot, AllowedPlacement[]>>;
  for (const suit of Object.keys(FRAGMENT_LAYOUT) as Suit[]) {
    const bySlot = {} as Record<Slot, AllowedPlacement[]>;
    for (const slot of SLOTS) {
      const y = INWARD_CORNER[slot];
      const list: AllowedPlacement[] = [];
      for (const o of [0, 180] as const) {
        let t: TransformName | null;
        if (o === 0) t = printedTransform(suit, y);
        else {
          const p = printedTransform(suit, OPPOSITE[y]);
          t = p === null ? null : composeTransforms('R180', p);
        }
        if (t === null) continue;
        const hit = list.find((e) => e.transform === t);
        if (hit) hit.orientations.push(o);
        else list.push({ transform: t, orientations: [o] });
      }
      bySlot[slot] = list;
    }
    out[suit] = bySlot;
  }
  return out;
}

/** ALLOWED_PLACEMENTS[suit][slot]: empty list = the suit cannot occupy that slot. */
export const ALLOWED_PLACEMENTS: Readonly<Record<Suit, Readonly<Record<Slot, readonly AllowedPlacement[]>>>> =
  derivePlacements();

// ---------------------------------------------------------------------------------------------
// Card values (computed from the rank; independent of any game module)
// ---------------------------------------------------------------------------------------------

const RANK_VALUE: Readonly<Record<string, number>> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13,
};
const SUIT_ORDER = 'HDCS';

function suitOfCard(card: string): Suit {
  return card.charAt(0) as Suit;
}

function valueOfCard(card: string): number {
  return RANK_VALUE[card.slice(2)] as number;
}

function canonicalOrder(a: string, b: string): number {
  return SUIT_ORDER.indexOf(a.charAt(0)) - SUIT_ORDER.indexOf(b.charAt(0)) || valueOfCard(a) - valueOfCard(b);
}

// ---------------------------------------------------------------------------------------------
// Option handling
// ---------------------------------------------------------------------------------------------

interface Resolved {
  detect: DetectOptions;
  radius: Radius | undefined;
  offset: number;
  tol: number;
  ratioLo: number;
  ratioHi: number;
  axisTol: number;
  uncertainThreshold: number | undefined;
}

function positive(v: unknown, d: number, name: string): number {
  if (v === undefined) return d;
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new RangeError(`${name} must be a positive finite number`);
  return v;
}

function resolve(o: DecodeGroupOptions): Resolved {
  if (typeof o !== 'object' || o === null) throw new TypeError('options must be an object');
  let lo = 0.75;
  let hi = 1.33;
  if (o.sizeRatioRange !== undefined) {
    const r = o.sizeRatioRange;
    if (!Array.isArray(r) || r.length !== 2 || !(r[0] > 0) || !(r[1] >= r[0]) || !Number.isFinite(r[1])) {
      throw new RangeError('sizeRatioRange must be [lo, hi] with 0 < lo <= hi');
    }
    lo = r[0];
    hi = r[1];
  }
  // Validate the radius the same way decodeFragment does, even when no marker is ever decoded.
  if (o.radius !== undefined) decodeFragment(0, { radius: o.radius });
  return {
    detect: o.detect ?? {},
    radius: o.radius,
    offset: positive(o.centerOffsetModules, 5.5, 'centerOffsetModules'),
    tol: positive(o.positionToleranceModules, 1.0, 'positionToleranceModules'),
    ratioLo: lo,
    ratioHi: hi,
    axisTol: positive(o.axisToleranceDeg, 15, 'axisToleranceDeg'),
    uncertainThreshold: o.uncertainThreshold,
  };
}

// ---------------------------------------------------------------------------------------------
// Vertex clustering
// ---------------------------------------------------------------------------------------------

const RAD = Math.PI / 180;

/** Smallest absolute difference of two angles modulo 90 degrees (0..45). */
function axisDiff(a: number, b: number): number {
  const m = (((a - b) % 90) + 90) % 90;
  return Math.min(m, 90 - m);
}

interface Cluster {
  /** Marker indices in slot order TL, TR, BL, BR (group frame of the cluster axis). */
  indices: number[];
  vertex: Point;
  key: string;
}

interface Search {
  clusters: Cluster[];
  /** Largest number of occupied quadrants around any predicted vertex (complete or not). */
  maxOccupied: number;
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? (s[(n - 1) / 2] as number) : ((s[n / 2 - 1] as number) + (s[n / 2] as number)) / 2;
}

/** Circular mean of angles with period 90 degrees, in (-45, 45]. */
function axisMean(angles: number[]): number {
  let sx = 0;
  let sy = 0;
  for (const a of angles) {
    sx += Math.cos(a * 4 * RAD);
    sy += Math.sin(a * 4 * RAD);
  }
  if (Math.hypot(sx, sy) < 1e-9) return angles[0] as number;
  let m = (Math.atan2(sy, sx) / RAD) / 4;
  if (m <= -45) m += 90;
  return m;
}

function slotOf(center: Point, vertex: Point, alphaDeg: number): Slot {
  const dx = center.x - vertex.x;
  const dy = center.y - vertex.y;
  const co = Math.cos(alphaDeg * RAD);
  const si = Math.sin(alphaDeg * RAD);
  const x = dx * co + dy * si;
  const y = -dx * si + dy * co;
  return (y < 0 ? (x < 0 ? 'TL' : 'TR') : x < 0 ? 'BL' : 'BR') as Slot;
}

function search(markers: readonly DetectedMarker[], r: Resolved): Search {
  const clusters = new Map<string, Cluster>();
  let maxOccupied = 0;
  for (let i = 0; i < markers.length; i++) {
    const mi = markers[i] as DetectedMarker;
    const u = mi.sizePx / 7;
    const a = mi.rotationDeg * RAD;
    const co = Math.cos(a);
    const si = Math.sin(a);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const ox = sx * r.offset * u;
        const oy = sy * r.offset * u;
        const vx = mi.center.x - (ox * co - oy * si);
        const vy = mi.center.y - (ox * si + oy * co);
        const buckets: Record<Slot, number[]> = { TL: [], TR: [], BL: [], BR: [] };
        for (let j = 0; j < markers.length; j++) {
          const mj = markers[j] as DetectedMarker;
          const ratio = mj.sizePx / mi.sizePx;
          if (ratio < r.ratioLo || ratio > r.ratioHi) continue;
          if (axisDiff(mj.rotationDeg, mi.rotationDeg) > r.axisTol) continue;
          const dx = mj.center.x - vx;
          const dy = mj.center.y - vy;
          const rx = dx * co + dy * si;
          const ry = -dx * si + dy * co;
          const ex = (rx < 0 ? -1 : 1) * r.offset * u;
          const ey = (ry < 0 ? -1 : 1) * r.offset * u;
          if (Math.hypot(rx - ex, ry - ey) > r.tol * u) continue;
          const q: Slot = ry < 0 ? (rx < 0 ? 'TL' : 'TR') : rx < 0 ? 'BL' : 'BR';
          buckets[q].push(j);
        }
        const occupied = SLOTS.filter((s) => buckets[s].length > 0).length;
        if (occupied > maxOccupied) maxOccupied = occupied;
        if (!SLOTS.every((s) => buckets[s].length === 1)) continue;
        const idx = SLOTS.map((s) => (buckets[s] as number[])[0] as number);
        const sizes = idx.map((k) => (markers[k] as DetectedMarker).sizePx);
        const med = median(sizes);
        if (!sizes.every((s) => s / med >= r.ratioLo && s / med <= r.ratioHi)) continue;
        const key = [...idx].sort((p, q) => p - q).join(',');
        if (clusters.has(key)) continue;
        const cs = idx.map((k) => (markers[k] as DetectedMarker).center);
        const vertex = { x: cs.reduce((t, c) => t + c.x, 0) / 4, y: cs.reduce((t, c) => t + c.y, 0) / 4 };
        clusters.set(key, { indices: idx, vertex, key });
      }
    }
  }
  return { clusters: [...clusters.values()], maxOccupied };
}

// ---------------------------------------------------------------------------------------------
// Re-framing
// ---------------------------------------------------------------------------------------------

function reframe(marker: DetectedMarker, turns: number): DetectedMarker {
  const t = ((turns % 4) + 4) % 4;
  if (t === 0) return marker;
  const perm = permOf('R90');
  let bits = marker.bits;
  let dark = marker.cellDarkness;
  for (let k = 0; k < t; k++) {
    bits = applyTransform('R90', bits);
    const next = new Array<number>(dark.length);
    for (let i = 0; i < dark.length; i++) next[perm[i] as number] = dark[i] as number;
    dark = next;
  }
  return { ...marker, bits, cellDarkness: dark };
}

// ---------------------------------------------------------------------------------------------
// Decoder
// ---------------------------------------------------------------------------------------------

export function decodeGroup(image: GrayImage, options: DecodeGroupOptions = {}): GroupDecodeResult {
  const r = resolve(options);
  const det = detectMarkers(image, r.detect);
  if (det.kind === 'NOT_DETECTED') return { kind: 'NOT_DETECTED' };
  if (det.kind === 'INVALID_MARKER') return { kind: 'INVALID_MARKER', rejected: det.rejected };
  const markers = det.markers;
  const dopts = { ...(r.radius !== undefined ? { radius: r.radius } : {}), ...(r.uncertainThreshold !== undefined ? { uncertainThreshold: r.uncertainThreshold } : {}) };

  const found = search(markers, r);
  if (found.clusters.length === 0) {
    return { kind: 'INCOMPLETE_GROUP', detected: Math.max(1, Math.min(3, found.maxOccupied)), markers: markers.length };
  }

  // Closest to the image centre; ties by y then x.
  const cx = image.width / 2;
  const cy = image.height / 2;
  const ranked = [...found.clusters].sort((a, b) => {
    const da = Math.hypot(a.vertex.x - cx, a.vertex.y - cy);
    const db = Math.hypot(b.vertex.x - cx, b.vertex.y - cy);
    return da - db || a.vertex.y - b.vertex.y || a.vertex.x - b.vertex.x;
  });
  const chosen = ranked[0] as Cluster;

  // Group frame
  const angles = chosen.indices.map((k) => (markers[k] as DetectedMarker).rotationDeg);
  const alpha = axisMean(angles);
  const bySlot = new Map<Slot, number>();
  for (const k of chosen.indices) bySlot.set(slotOf((markers[k] as DetectedMarker).center, chosen.vertex, alpha), k);
  if (bySlot.size !== 4) {
    // The final axis disagrees with the clustering frame: report as incomplete rather than guess.
    return { kind: 'INCOMPLETE_GROUP', detected: 3, markers: markers.length };
  }

  const members: GroupMember[] = SLOTS.map((slot) => {
    const m = markers[bySlot.get(slot) as number] as DetectedMarker;
    const turns = Math.round((m.rotationDeg - alpha) / 90);
    const outcome = decodeFragment(reframe(m, turns), dopts);
    return { slot, marker: m, quarterTurns: ((turns % 4) + 4) % 4, outcome };
  });

  const inCluster = new Set(chosen.indices);
  const sizes = chosen.indices.map((k) => (markers[k] as DetectedMarker).sizePx);
  const med = median(sizes);
  const others: OtherMarker[] = [];
  markers.forEach((m, k) => {
    if (inCluster.has(k)) return;
    const outcome = decodeFragment(m, dopts);
    const ratio = m.sizePx / med;
    const sizeOk = ratio >= r.ratioLo && ratio <= r.ratioHi;
    others.push({
      classification: outcome.status === 'IDENTIFIED' && sizeOk ? 'DISTRACTOR_FRAGMENT' : 'SPURIOUS_CANDIDATE',
      marker: m,
      outcome,
    });
  });

  const located: Located = {
    vertex: chosen.vertex,
    groupAxisDeg: alpha,
    others,
    alternativeClusters: ranked.length - 1,
  };

  const corrupted = members.filter((m) => m.outcome.status === 'CORRUPTED_FRAGMENT');
  if (corrupted.length > 0) {
    const nearestDistances: Partial<Record<Slot, number>> = {};
    for (const m of corrupted) {
      if (m.outcome.status === 'CORRUPTED_FRAGMENT') nearestDistances[m.slot] = m.outcome.nearestDistance;
    }
    return { kind: 'CORRUPTED_FRAGMENT', members, nearestDistances, ...located };
  }
  if (members.some((m) => m.outcome.status === 'AMBIGUOUS')) {
    return { kind: 'AMBIGUOUS_FRAGMENT', members, ...located };
  }

  type Id = { slot: Slot; card: string; transform: TransformName; distance: number; member: GroupMember };
  const ids: Id[] = members.map((m) => {
    const o = m.outcome;
    if (o.status !== 'IDENTIFIED') throw new Error('unreachable');
    return { slot: m.slot, card: o.card, transform: o.transform, distance: o.distance, member: m };
  });

  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id.card)) return { kind: 'DUPLICATE_CARD', card: id.card, members, ...located };
    seen.add(id.card);
  }

  // Hypotheses
  interface Passing {
    h: TransformName;
    slots: Record<Slot, SlotAssignment>;
  }
  const passing: Passing[] = [];
  for (const h of D4) {
    const hInv = inverseTransform(h);
    const slots = {} as Record<Slot, SlotAssignment>;
    let ok = true;
    for (const id of ids) {
      const nominalSlot = mapSlot(hInv, id.slot);
      const g = composeTransforms(hInv, id.transform);
      const entry = ALLOWED_PLACEMENTS[suitOfCard(id.card)][nominalSlot].find((e) => e.transform === g);
      if (!entry) {
        ok = false;
        break;
      }
      slots[nominalSlot] = {
        card: id.card,
        orientation: entry.orientations.length === 2 ? 'EITHER' : (entry.orientations[0] as Orientation),
      };
    }
    if (ok) passing.push({ h, slots });
  }

  if (passing.length === 0) {
    return { kind: 'INVALID_ARRANGEMENT', reason: 'NO_CONSISTENT_HYPOTHESIS', members, ...located };
  }
  const plain = passing.filter((p) => !MIRRORS.has(p.h)).length;
  const mirrored = passing.length - plain;
  let reflection: Reflection;
  if (plain === 2 && mirrored === 0) reflection = 'NOT_REFLECTED';
  else if (plain === 0 && mirrored === 2) reflection = 'REFLECTED';
  else if (plain === 2 && mirrored === 2) reflection = 'AMBIGUOUS';
  else {
    return { kind: 'INVALID_ARRANGEMENT', reason: 'INTERNAL_HYPOTHESIS_COUNT', passing: passing.length, members, ...located };
  }

  const cards = ids.map((i) => i.card).sort(canonicalOrder);
  const hiddenSum = cards.reduce((t, c) => t + valueOfCard(c), 0);
  const interpretations: SlotInterpretation[] = passing.map((p) => ({
    reflected: MIRRORS.has(p.h),
    hypothesis: p.h,
    slots: p.slots,
  }));
  const readings: FragmentReading[] = ids.map((i) => ({
    card: i.card,
    slot: i.slot,
    transform: i.transform,
    distance: i.distance,
    center: i.member.marker.center,
    minCellConfidence: i.member.outcome.minCellConfidence,
    uncertainCells: i.member.outcome.uncertainCells,
  }));
  return { kind: 'IDENTIFIED', cards, hiddenSum, reflection, interpretations, readings, members, ...located };
}
