/**
 * TEST SUPPORT ONLY - not production code. Condition families for marker detection, shared by
 * src/optical/detect.test.ts and scripts/measure-detection.ts so both run the same cases.
 * All images are SYNTHETIC rasters, not real camera images. All randomness is seeded (mulberry32).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { detectMarkers, type DetectedMarker, type DetectOptions, type DetectResult } from '../detect';
import { ALL_CARDS, placedFragments, type Corner, type Orientation } from '../fragments';
import { mulberry32 } from '../prng';
import {
  CARD_H_MOD,
  CARD_W_MOD,
  applyImageTransform,
  renderCardLayer,
  renderMarker,
  sampleMarkerBits,
  slotOrigin,
  type GrayImage,
} from '../render';
import { TRANSFORM_NAMES, applyTransform } from '../transforms';
import {
  blankImage,
  cloneImage,
  compose,
  cropImage,
  fillRect,
  gradientImage,
  mat3Apply,
  pasteImage,
  rotationMatrix,
  scaleMatrix,
  similarityMatrix,
  tiltMatrix,
  translationMatrix,
  uniformNoiseImage,
  addGaussianNoise,
  warpImage,
} from './warp';

const FROZEN = JSON.parse(
  readFileSync(fileURLToPath(new URL('../codebook.v1.json', import.meta.url)), 'utf8'),
) as { patterns: Record<string, number> };

/** The 52 frozen base patterns in codebook order. */
export const BASE_PATTERNS: readonly number[] = ALL_CARDS.map((k) => FROZEN.patterns[k] as number);

export const SEED = 20251112;

export interface Failure {
  condition: string;
  params: string;
  observed: string;
}

export interface FamilyResult {
  family: string;
  /** Number of cases. */
  total: number;
  /** Cases whose result kind was DETECTED. */
  detected: number;
  /** Cases that met every expectation (single marker, exact bits, location where checked). */
  exact: number;
  /** DETECTED cases whose bits differ from the truth (the dangerous outcome). */
  wrongBits: number;
  kinds: Record<string, number>;
  /** Reason of the first rejected candidate for non-DETECTED results; 'none' when NOT_DETECTED. */
  reasons: Record<string, number>;
  failures: Failure[];
  extra: Record<string, number | string>;
}

export const MAX_FAILURES = 500;

export function newFamily(family: string): FamilyResult {
  return { family, total: 0, detected: 0, exact: 0, wrongBits: 0, kinds: {}, reasons: {}, failures: [], extra: {} };
}

function bump(m: Record<string, number>, k: string): void {
  m[k] = (m[k] ?? 0) + 1;
}

export function describeResult(res: DetectResult): string {
  if (res.kind === 'NOT_DETECTED') return 'NOT_DETECTED';
  if (res.kind === 'INVALID_MARKER') return `INVALID_MARKER[${res.rejected.map((r) => r.reason).join(',')}]`;
  return `DETECTED[n=${res.markers.length}${res.markers.map((m) => ' bits=' + String(m.bits)).join('')}]`;
}

/**
 * Records one case. `exact` says the case met its expectation, `wrong` says a DETECTED marker
 * carried bits that are not the truth.
 */
export function record(
  fam: FamilyResult,
  res: DetectResult,
  exact: boolean,
  wrong: boolean,
  condition: string,
  params: string,
): void {
  fam.total++;
  bump(fam.kinds, res.kind);
  if (res.kind === 'DETECTED') fam.detected++;
  else bump(fam.reasons, res.kind === 'INVALID_MARKER' ? (res.rejected[0]?.reason ?? 'none') : 'none');
  if (exact) fam.exact++;
  if (wrong) fam.wrongBits++;
  if (!exact && fam.failures.length < MAX_FAILURES) {
    fam.failures.push({ condition, params, observed: describeResult(res) });
  }
}

/** Standard single-marker expectation: exactly one DETECTED marker with `bits`. */
export function expectSingle(res: DetectResult, bits: number): { exact: boolean; wrong: boolean; marker?: DetectedMarker } {
  if (res.kind !== 'DETECTED') return { exact: false, wrong: false };
  const wrong = res.markers.some((m) => m.bits !== bits);
  const marker = res.markers[0];
  const exact = res.markers.length === 1 && !wrong;
  return marker ? { exact, wrong, marker } : { exact, wrong };
}

const maxOf = (fam: FamilyResult, key: string, v: number): void => {
  const cur = fam.extra[key];
  fam.extra[key] = typeof cur === 'number' ? Math.max(cur, v) : v;
};
const minOf = (fam: FamilyResult, key: string, v: number): void => {
  const cur = fam.extra[key];
  fam.extra[key] = typeof cur === 'number' ? Math.min(cur, v) : v;
};

/** n applications of R90 (clockwise quarter turns of the image content). */
export function rot90k(pattern: number, k: number): number {
  let p = pattern;
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) p = applyTransform('R90', p);
  return p;
}

/**
 * Number of 90-degree steps k such that a marker whose grid x axis appears rotated by `angleDeg`
 * (clockwise) is read as R90^k . P in the canonical frame (canonical angle in (-45, 45]).
 */
export function quarterTurns(angleDeg: number): number {
  return ((Math.ceil((angleDeg - 45) / 90) % 4) + 4) % 4;
}

/** Distance of `angleDeg` to the nearest +-45 degree canonical boundary, in degrees (0..45). */
export function distToBoundary(angleDeg: number): number {
  const m = ((angleDeg % 90) + 90) % 90;
  return Math.abs(m - 45);
}

// ---------------------------------------------------------------------------------------------
// 1. Clean markers
// ---------------------------------------------------------------------------------------------

export function cleanBase(modulePx = 4): FamilyResult {
  const fam = newFamily('clean-base-patterns');
  BASE_PATTERNS.forEach((p, i) => {
    const m = renderMarker(p, modulePx);
    const c = blankImage(30 * modulePx, 25 * modulePx);
    const x0 = 4 * modulePx + (i % 5) * 3;
    const y0 = 5 * modulePx + (i % 7) * 2;
    pasteImage(c, m, x0, y0);
    const res = detectMarkers(c);
    const e = expectSingle(res, p);
    let ok = e.exact;
    if (e.marker) {
      const size = 7 * modulePx;
      const sizeErr = Math.abs(e.marker.sizePx - size);
      const centerErr = Math.hypot(e.marker.center.x - (x0 + 4.5 * modulePx), e.marker.center.y - (y0 + 4.5 * modulePx));
      maxOf(fam, 'maxSizeErrPx', sizeErr);
      maxOf(fam, 'maxCenterErrPx', centerErr);
      maxOf(fam, 'maxAbsRotationDeg', Math.abs(e.marker.rotationDeg));
      minOf(fam, 'minBorderDarkness', e.marker.borderDarkness);
      if (sizeErr > 0.5 || Math.abs(e.marker.rotationDeg) > 1) ok = false;
    }
    record(fam, res, ok, e.wrong, 'clean-base', `card=${ALL_CARDS[i]} modulePx=${modulePx} at=(${x0},${y0})`);
  });
  return fam;
}

export function cleanD4(modulePx = 4): FamilyResult {
  const fam = newFamily('clean-d4-transforms');
  BASE_PATTERNS.forEach((p, i) => {
    for (const g of TRANSFORM_NAMES) {
      const img = applyImageTransform(g, renderMarker(p, modulePx));
      const c = blankImage(30 * modulePx, 25 * modulePx);
      pasteImage(c, img, 5 * modulePx, 4 * modulePx);
      const res = detectMarkers(c);
      const e = expectSingle(res, applyTransform(g, p));
      record(fam, res, e.exact, e.wrong, 'clean-d4', `card=${ALL_CARDS[i]} g=${g} modulePx=${modulePx}`);
    }
  });
  return fam;
}

// ---------------------------------------------------------------------------------------------
// 2. Card layers and contact sheet
// ---------------------------------------------------------------------------------------------

const CORNERS: readonly Corner[] = ['TL', 'TR', 'BL', 'BR'];

interface Expected {
  x: number;
  y: number;
  bits: number;
  label: string;
}

/**
 * Matches detected markers against expected (centre, bits) entries. Returns whether every expected
 * marker was found within `tol` px with the right bits and nothing else was reported.
 */
function matchExpected(
  res: DetectResult,
  exp: Expected[],
  tol: number,
  fam: FamilyResult,
): { exact: boolean; wrong: boolean; found: number; badBits: number; extra: number } {
  const markers = res.kind === 'DETECTED' ? res.markers : [];
  let found = 0;
  let badBits = 0;
  const used = new Set<number>();
  for (const e of exp) {
    let bi = -1;
    let bd = Infinity;
    markers.forEach((m, i) => {
      if (used.has(i)) return;
      const d = Math.hypot(m.center.x - e.x, m.center.y - e.y);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    if (bi >= 0 && bd <= tol) {
      used.add(bi);
      found++;
      maxOf(fam, 'maxCenterErrPx', bd);
      if (markers[bi]!.bits !== e.bits) badBits++;
    }
  }
  const extra = markers.length - used.size;
  return { exact: found === exp.length && badBits === 0 && extra === 0, wrong: badBits > 0 || extra > 0, found, badBits, extra };
}

function expectedForCard(card: string, o: Orientation, modulePx: number, ox: number, oy: number): Expected[] {
  const placed = placedFragments(card, o);
  const out: Expected[] = [];
  for (const corner of CORNERS) {
    const p = placed[corner];
    if (p === undefined) continue;
    const s = slotOrigin(corner, modulePx);
    out.push({ x: ox + s.x + 4.5 * modulePx, y: oy + s.y + 4.5 * modulePx, bits: p, label: `${card}/${o}/${corner}` });
  }
  return out;
}

export function cardLayers(modulePx = 4): FamilyResult {
  const fam = newFamily('card-layers');
  let markersFound = 0;
  for (const card of ALL_CARDS) {
    for (const o of [0, 180] as const) {
      const img = renderCardLayer(card, o, { modulePx });
      const res = detectMarkers(img);
      const exp = expectedForCard(card, o, modulePx, 0, 0);
      const m = matchExpected(res, exp, 1, fam);
      markersFound += m.found;
      record(fam, res, m.exact, m.wrong, 'card-layer', `card=${card} orientation=${o} modulePx=${modulePx}`);
    }
  }
  fam.extra['expectedMarkers'] = 104;
  fam.extra['markersLocatedWithExactBits'] = markersFound;
  return fam;
}

/** Same layout as scripts/render-samples.ts (13 x 4 cards at 0 degrees, 4 px gaps of gray 200). */
export function contactSheet(modulePx = 2): FamilyResult {
  const fam = newFamily('contact-sheet');
  const GAP = 4;
  const first = renderCardLayer(ALL_CARDS[0] as string, 0, { modulePx });
  const cw = first.width;
  const ch = first.height;
  const W = GAP + 13 * (cw + GAP);
  const H = GAP + 4 * (ch + GAP);
  const sheet: GrayImage = { width: W, height: H, data: new Uint8Array(W * H).fill(200) };
  const exp: Expected[] = [];
  ALL_CARDS.forEach((card, i) => {
    const img = renderCardLayer(card, 0, { modulePx });
    const x0 = GAP + (i % 13) * (cw + GAP);
    const y0 = GAP + Math.floor(i / 13) * (ch + GAP);
    pasteImage(sheet, img, x0, y0);
    exp.push(...expectedForCard(card, 0, modulePx, x0, y0));
  });
  const res = detectMarkers(sheet);
  const m = matchExpected(res, exp, 1, fam);
  fam.extra['expectedMarkers'] = exp.length;
  fam.extra['markersLocatedWithExactBits'] = m.found - m.badBits;
  fam.extra['markersWithWrongBits'] = m.badBits;
  fam.extra['unexpectedExtraMarkers'] = m.extra;
  fam.extra['rejectedCandidates'] = res.kind === 'NOT_DETECTED' ? 0 : res.rejected.length;
  record(fam, res, m.exact, m.wrong, 'contact-sheet', `modulePx=${modulePx} size=${W}x${H} found=${m.found}/${exp.length}`);
  return fam;
}

// ---------------------------------------------------------------------------------------------
// 4. Positions
// ---------------------------------------------------------------------------------------------

export function positions(n = 300, seed = SEED): FamilyResult {
  const fam = newFamily('positions');
  const rng = mulberry32(seed);
  const ri = (lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));
  let sub = 0;
  for (let i = 0; i < n; i++) {
    const modulePx = ri(3, 12);
    const F = 9 * modulePx;
    const cw = F + 16 + ri(0, 100);
    const chh = F + 16 + ri(0, 100);
    const pi = ri(0, 51);
    const p = BASE_PATTERNS[pi]!;
    let x = ri(8, cw - F - 8);
    let y = ri(8, chh - F - 8);
    const subPixel = rng() < 0.5;
    let canvas: GrayImage;
    if (subPixel) {
      sub++;
      const fx = Math.min(rng(), 0.999);
      const fy = Math.min(rng(), 0.999);
      const x2 = Math.min(x + fx, cw - F - 8);
      const y2 = Math.min(y + fy, chh - F - 8);
      canvas = warpImage(renderMarker(p, modulePx), translationMatrix(x2, y2), cw, chh, { supersample: 3 });
      x = x2;
      y = y2;
    } else {
      canvas = blankImage(cw, chh);
      pasteImage(canvas, renderMarker(p, modulePx), x, y);
    }
    const res = detectMarkers(canvas);
    const e = expectSingle(res, p);
    let ok = e.exact;
    if (e.marker) {
      const err = Math.hypot(e.marker.center.x - (x + F / 2), e.marker.center.y - (y + F / 2));
      maxOf(fam, 'maxCenterErrPx', err);
      if (err > 1) ok = false;
    }
    record(fam, res, ok, e.wrong, 'position', `i=${i} seed=${seed} card=${ALL_CARDS[pi]} modulePx=${modulePx} at=(${x.toFixed(2)},${y.toFixed(2)}) canvas=${cw}x${chh} subPixel=${subPixel}`);
  }
  fam.extra['subPixelCases'] = sub;
  return fam;
}

// ---------------------------------------------------------------------------------------------
// 5. Rotations
// ---------------------------------------------------------------------------------------------

/** The 10 fixed random patterns used for rotation / scale / perspective studies. */
export function studyPatterns(seed = SEED + 1, n = 10): number[] {
  const rng = mulberry32(seed);
  const out: number[] = [];
  while (out.length < n) {
    const p = BASE_PATTERNS[Math.floor(rng() * 52)]!;
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

export function rotations(stepDeg = 5, modulePx = 8): FamilyResult {
  const fam = newFamily('rotations');
  const F = 9 * modulePx;
  const S = 160;
  const o = (S - F) / 2;
  let boundaryCases = 0;
  let strictCases = 0;
  let strictExact = 0;
  for (const p of studyPatterns()) {
    const src = blankImage(S, S);
    pasteImage(src, renderMarker(p, modulePx), o, o);
    for (let th = 0; th < 360; th += stepDeg) {
      const img = warpImage(src, similarityMatrix({ cx: S / 2, cy: S / 2, rotationDeg: th }), S, S, { supersample: 3 });
      const res = detectMarkers(img);
      const near = distToBoundary(th) < 5;
      const k = Math.round(th / 90) % 4;
      const four = [0, 1, 2, 3].map((j) => rot90k(p, j));
      let ok: boolean;
      let wrong: boolean;
      if (res.kind !== 'DETECTED') {
        ok = false;
        wrong = false;
      } else if (near) {
        boundaryCases++;
        wrong = res.markers.some((m) => !four.includes(m.bits));
        ok = res.markers.length === 1 && !wrong;
      } else {
        const e = expectSingle(res, rot90k(p, k));
        ok = e.exact;
        wrong = e.wrong;
        strictCases++;
        if (ok) strictExact++;
      }
      if (res.kind === 'DETECTED' && res.markers[0]) {
        const m = res.markers[0];
        maxOf(fam, 'maxSizeErrPx', Math.abs(m.sizePx - 7 * modulePx));
        maxOf(fam, 'maxCenterErrPx', Math.hypot(m.center.x - S / 2, m.center.y - S / 2));
      }
      record(fam, res, ok, wrong, 'rotation', `pattern=${p} thetaDeg=${th} modulePx=${modulePx}`);
    }
  }
  fam.extra['boundaryCases(within 5 deg of +-45; any of four R90 rotations accepted)'] = boundaryCases;
  fam.extra['strictCases'] = strictCases;
  fam.extra['strictExact'] = strictExact;
  return fam;
}

// ---------------------------------------------------------------------------------------------
// 6. Scaling
// ---------------------------------------------------------------------------------------------

/** Integer modulePx renders (crisp, no resampling) of all 52 patterns for each module size. */
export function scalesInteger(modules: number[] = Array.from({ length: 23 }, (_, i) => i + 2), options: DetectOptions = {}): {
  fam: FamilyResult;
  perModule: Array<{ modulePx: number; sizePx: number; total: number; exact: number; wrongBits: number; detected: number }>;
} {
  const fam = newFamily('scales-integer-modulePx');
  const perModule: Array<{ modulePx: number; sizePx: number; total: number; exact: number; wrongBits: number; detected: number }> = [];
  for (const m of modules) {
    const row = { modulePx: m, sizePx: 7 * m, total: 0, exact: 0, wrongBits: 0, detected: 0 };
    BASE_PATTERNS.forEach((p, i) => {
      const F = 9 * m;
      const c = blankImage(F + 24 + (i % 4), F + 20 + (i % 3));
      pasteImage(c, renderMarker(p, m), 9 + (i % 5), 7 + (i % 4));
      const res = detectMarkers(c, options);
      const e = expectSingle(res, p);
      row.total++;
      if (res.kind === 'DETECTED') row.detected++;
      if (e.exact) row.exact++;
      if (e.wrong) row.wrongBits++;
      record(fam, res, e.exact, e.wrong, 'scale-integer', `card=${ALL_CARDS[i]} modulePx=${m}`);
    });
    perModule.push(row);
  }
  return { fam, perModule };
}

/** Smallest modulePx m* such that every tested size >= m* is 100% exact (null if none). */
export function minExactModule(rows: Array<{ modulePx: number; total: number; exact: number }>): number | null {
  let best: number | null = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]!;
    if (r.exact === r.total) best = r.modulePx;
    else break;
  }
  return best;
}

/**
 * Non-integer effective module sizes: modulePx 8 renders are scaled by modulePx/8 with a supersampled
 * bilinear warp (area-averaging when shrinking, which blurs like a camera would) and placed at a
 * fractional offset.
 */
export function scalesFractional(
  effectiveModules: number[],
  nPatterns = 10,
  options: DetectOptions = {},
): { fam: FamilyResult; perModule: Array<{ modulePx: number; sizePx: number; total: number; exact: number; wrongBits: number; detected: number }> } {
  const fam = newFamily('scales-fractional');
  const perModule: Array<{ modulePx: number; sizePx: number; total: number; exact: number; wrongBits: number; detected: number }> = [];
  const base = 8;
  for (const em of effectiveModules) {
    const s = em / base;
    const row = { modulePx: em, sizePx: 7 * em, total: 0, exact: 0, wrongBits: 0, detected: 0 };
    studyPatterns(SEED + 2, nPatterns).forEach((p, i) => {
      const F = 9 * em;
      const W = Math.ceil(F) + 40;
      const H = compose(scaleMatrix(s, s, 0, 0), translationMatrix(17.37 + i * 0.31, 14.61 + i * 0.17));
      const img = warpImage(renderMarker(p, base), H, W, W, { supersample: s < 1 ? 4 : 3 });
      const res = detectMarkers(img, options);
      const e = expectSingle(res, p);
      row.total++;
      if (res.kind === 'DETECTED') row.detected++;
      if (e.exact) row.exact++;
      if (e.wrong) row.wrongBits++;
      record(fam, res, e.exact, e.wrong, 'scale-fractional', `pattern=${p} effectiveModulePx=${em} scale=${s}`);
    });
    perModule.push(row);
  }
  return { fam, perModule };
}

// ---------------------------------------------------------------------------------------------
// 7. Perspective
// ---------------------------------------------------------------------------------------------

export interface PerspectiveRow {
  tiltDeg: number;
  total: number;
  detected: number;
  exact: number;
  wrongBits: number;
}

/**
 * For each tilt strength, `casesPer` seeded cases: random pattern from the 52, random in-plane
 * rotation, random tilt-axis direction, camera distance = 5 marker sizes (see tiltMatrix).
 * The expected canonical reading is derived from the TRUE projected corners of the 7x7 square
 * (independent of the detector). Cases whose true canonical angle is within 3 degrees of +-45 accept
 * any of the four R90 rotations.
 */
export function perspective(
  tilts: number[] = [0, 10, 20, 30, 40],
  casesPer = 20,
  modulePx = 8,
  distanceFactor = 5,
): { fam: FamilyResult; rows: PerspectiveRow[] } {
  const fam = newFamily('perspective');
  const rows: PerspectiveRow[] = [];
  const S = 220;
  const F = 9 * modulePx;
  const o = (S - F) / 2;
  for (const tilt of tilts) {
    const row: PerspectiveRow = { tiltDeg: tilt, total: 0, detected: 0, exact: 0, wrongBits: 0 };
    for (let i = 0; i < casesPer; i++) {
      const rng = mulberry32(SEED + 1000 * tilt + i);
      const p = BASE_PATTERNS[Math.floor(rng() * 52)]!;
      const rot = Math.floor(rng() * 3600) / 10;
      const axis = Math.floor(rng() * 3600) / 10;
      const src = blankImage(S, S);
      pasteImage(src, renderMarker(p, modulePx), o, o);
      const H = compose(
        rotationMatrix(rot, S / 2, S / 2),
        tiltMatrix({ cx: S / 2, cy: S / 2, tiltDeg: tilt, axisDeg: axis, distancePx: distanceFactor * 7 * modulePx }),
      );
      const img = warpImage(src, H, S, S, { supersample: 3 });
      // true projected corners of the 7x7 square (source grid origin at o + modulePx)
      const g0 = o + modulePx;
      const g = (u: number, v: number) => mat3Apply(H, g0 + u * modulePx, g0 + v * modulePx);
      const tl = g(0, 0);
      const tr = g(7, 0);
      const br = g(7, 7);
      const bl = g(0, 7);
      // grid x-axis angle: circular mean of the four true edge directions, each turned back 90 deg per index
      const cs = [tl, tr, br, bl];
      let sS = 0;
      let sC = 0;
      for (let j = 0; j < 4; j++) {
        const a = cs[j]!;
        const b = cs[(j + 1) % 4]!;
        const t = Math.atan2(b.y - a.y, b.x - a.x) - (j * Math.PI) / 2;
        sS += Math.sin(t);
        sC += Math.cos(t);
      }
      const ang = (Math.atan2(sS, sC) * 180) / Math.PI;
      const k = quarterTurns(ang);
      const near = distToBoundary(ang) < 3;
      const four = [0, 1, 2, 3].map((j) => rot90k(p, j));
      const res = detectMarkers(img);
      let ok: boolean;
      let wrong: boolean;
      if (res.kind !== 'DETECTED') {
        ok = false;
        wrong = false;
      } else if (near) {
        wrong = res.markers.some((m) => !four.includes(m.bits));
        ok = res.markers.length === 1 && !wrong;
      } else {
        const e = expectSingle(res, rot90k(p, k));
        ok = e.exact;
        wrong = e.wrong;
      }
      row.total++;
      if (res.kind === 'DETECTED') row.detected++;
      if (ok) row.exact++;
      if (wrong) row.wrongBits++;
      record(fam, res, ok, wrong, 'perspective', `tiltDeg=${tilt} case=${i} seed=${SEED + 1000 * tilt + i} card=${p} rotationDeg=${rot} axisDeg=${axis} distance=${distanceFactor}x`);
    }
    rows.push(row);
  }
  return { fam, rows };
}

// ---------------------------------------------------------------------------------------------
// 8. Invalid borders and other damaged markers
// ---------------------------------------------------------------------------------------------

export interface CaseSummary {
  name: string;
  total: number;
  /** Counts keyed by `KIND` or `INVALID_MARKER/REASON` (first rejected candidate). */
  outcomes: Record<string, number>;
  detectedWithWrongBits: number;
  detectedButInvalidStructure: number;
}

const IB_MOD = 6;
const IB_CANVAS = 14 * IB_MOD;
const IB_ORIGIN = 2 * IB_MOD;

function ibCanvas(p: number): GrayImage {
  const c = blankImage(IB_CANVAS, IB_CANVAS);
  pasteImage(c, renderMarker(p, IB_MOD), IB_ORIGIN, IB_ORIGIN);
  return c;
}

/** Sets footprint module (m, n) (0..8, margin ring included) to value. */
function setFootprintModule(img: GrayImage, m: number, n: number, value: number, origin = IB_ORIGIN): void {
  fillRect(img, origin + m * IB_MOD, origin + n * IB_MOD, IB_MOD, IB_MOD, value);
}

/** Border cells (module coordinates in the 7x7 square, 0..6). */
const BORDER_CELLS: Array<[number, number]> = [];
for (let n = 0; n < 7; n++) for (let m = 0; m < 7; m++) if (m === 0 || m === 6 || n === 0 || n === 6) BORDER_CELLS.push([m, n]);
const isCorner = (m: number, n: number): boolean => (m === 0 || m === 6) && (n === 0 || n === 6);

/** Ground truth from the raster itself: all 24 border module centres black. */
function borderIntact(img: GrayImage, origin = IB_ORIGIN): boolean {
  const half = Math.floor(IB_MOD / 2);
  for (const [m, n] of BORDER_CELLS) {
    const x = origin + (m + 1) * IB_MOD + half;
    const y = origin + (n + 1) * IB_MOD + half;
    if (x < 0 || y < 0 || x >= img.width || y >= img.height || img.data[y * img.width + x]! >= 128) return false;
  }
  return true;
}

function summarize(
  fam: FamilyResult,
  cases: Map<string, CaseSummary>,
  name: string,
  img: GrayImage,
  accepted: number[],
  structureValid: boolean,
  params: string,
): void {
  const res = detectMarkers(img);
  let cs = cases.get(name);
  if (!cs) {
    cs = { name, total: 0, outcomes: {}, detectedWithWrongBits: 0, detectedButInvalidStructure: 0 };
    cases.set(name, cs);
  }
  cs.total++;
  const key = res.kind === 'INVALID_MARKER' ? `INVALID_MARKER/${res.rejected.map((r) => r.reason).join('+')}` : res.kind;
  cs.outcomes[key] = (cs.outcomes[key] ?? 0) + 1;
  let ok = true;
  let wrong = false;
  if (res.kind === 'DETECTED') {
    wrong = res.markers.some((m) => !accepted.includes(m.bits));
    if (wrong) cs.detectedWithWrongBits++;
    if (!structureValid) {
      ok = false;
      cs.detectedButInvalidStructure++;
    }
    if (wrong) ok = false;
  }
  record(fam, res, ok, wrong, `invalid-border/${name}`, params);
}

export function invalidBorders(): { fam: FamilyResult; cases: CaseSummary[] } {
  const fam = newFamily('invalid-borders');
  const cases = new Map<string, CaseSummary>();
  const pats = studyPatterns(SEED + 3, 3);

  for (const p of pats) {
    // (a) one non-corner / (b) one corner border cell white
    for (const [m, n] of BORDER_CELLS) {
      const img = ibCanvas(p);
      setFootprintModule(img, m + 1, n + 1, 255);
      summarize(fam, cases, isCorner(m, n) ? 'b-corner-border-cell-white' : 'a-noncorner-border-cell-white', img, [p], false, `card=${p} cell=(${m},${n})`);
    }
    // (c) a whole border side white
    for (const side of ['top', 'bottom', 'left', 'right'] as const) {
      const img = ibCanvas(p);
      for (let k = 0; k < 7; k++) {
        const [m, n] = side === 'top' ? [k, 0] : side === 'bottom' ? [k, 6] : side === 'left' ? [0, k] : [6, k];
        setFootprintModule(img, m + 1, n + 1, 255);
      }
      summarize(fam, cases, 'c-border-side-white', img, [p], false, `card=${p} side=${side}`);
    }
    // (e) margin ring black on one side (touching the black border)
    for (const side of ['top', 'bottom', 'left', 'right'] as const) {
      for (const partial of [false, true]) {
        const img = ibCanvas(p);
        for (let k = partial ? 3 : 0; k <= (partial ? 5 : 8); k++) {
          const [m, n] = side === 'top' ? [k, 0] : side === 'bottom' ? [k, 8] : side === 'left' ? [0, k] : [8, k];
          setFootprintModule(img, m, n, 0);
        }
        summarize(fam, cases, partial ? 'e-margin-black-side-partial' : 'e-margin-black-side-full', img, [p], false, `card=${p} side=${side}`);
      }
    }
    // (e2) isolated dark dots inside the margin ring, separated from the marker by a 1 px gap
    for (const count of [1, 8]) {
      const img = ibCanvas(p);
      const cells: Array<[number, number]> = [[4, 0], [1, 0], [2, 0], [3, 0], [5, 8], [6, 8], [7, 8], [3, 8]];
      for (const [m, n] of cells.slice(0, count)) {
        fillRect(img, IB_ORIGIN + m * IB_MOD + 1, IB_ORIGIN + n * IB_MOD + 1, IB_MOD - 2, IB_MOD - 2, 0);
      }
      summarize(fam, cases, `e-margin-isolated-dots-${count}`, img, [p], count === 1, `card=${p} dots=${count}`);
    }
    // (h) two markers touching (side by side, stacked, corner to corner)
    const q = pats[(pats.indexOf(p) + 1) % pats.length]!;
    for (const kind of ['horizontal', 'vertical', 'diagonal'] as const) {
      const c = blankImage(26 * IB_MOD, 26 * IB_MOD, 255);
      const base = 4 * IB_MOD;
      const dx = kind === 'vertical' ? 0 : 7 * IB_MOD;
      const dy = kind === 'horizontal' ? 0 : 7 * IB_MOD;
      pasteImage(c, renderMarker(p, IB_MOD), base, base);
      // second marker's black square starts exactly where the first one's ends (no margin between)
      const second = renderMarker(q, IB_MOD);
      for (let y = 0; y < second.height; y++)
        for (let x = 0; x < second.width; x++) {
          const v = second.data[y * second.width + x]!;
          const px = base + dx + x;
          const py = base + dy + y;
          if (v < 128) c.data[py * c.width + px] = 0;
        }
      summarize(fam, cases, 'h-two-markers-touching', c, [p, q], false, `cards=${p},${q} layout=${kind}`);
    }
  }

  // (d) gray border cells (single cell, then the whole border)
  const pd = pats[0]!;
  for (const gray of [100, 128]) {
    for (const [m, n] of BORDER_CELLS) {
      const img = ibCanvas(pd);
      setFootprintModule(img, m + 1, n + 1, gray);
      summarize(fam, cases, `d-border-cell-gray${gray}`, img, [pd], borderIntact(img), `card=${pd} cell=(${m},${n}) gray=${gray}`);
    }
  }
  {
    const img = ibCanvas(pd);
    for (const [m, n] of BORDER_CELLS) setFootprintModule(img, m + 1, n + 1, 128);
    // A uniformly gray border is a valid low-contrast marker for a detector that measures the border
    // level locally (design: threshold between measured border darkness and margin brightness).
    summarize(fam, cases, 'd-whole-border-gray128', img, [pd], true, `card=${pd}`);
  }

  // (f) marker cut by the image edge: visible fraction 25 / 50 / 75 %
  for (const p of pats.slice(0, 2)) {
    const black = 7 * IB_MOD;
    const bx = IB_ORIGIN + IB_MOD;
    for (const side of ['left', 'right', 'top', 'bottom'] as const) {
      for (const f of [0.25, 0.5, 0.75]) {
        const full = ibCanvas(p);
        const cut = Math.round(f * black);
        let img: GrayImage;
        if (side === 'left') img = cropImage(full, bx + black - cut, 0, full.width - (bx + black - cut), full.height);
        else if (side === 'right') img = cropImage(full, 0, 0, bx + cut, full.height);
        else if (side === 'top') img = cropImage(full, 0, bx + black - cut, full.width, full.height - (bx + black - cut));
        else img = cropImage(full, 0, 0, full.width, bx + cut);
        summarize(fam, cases, `f-cropped-visible-${Math.round(f * 100)}pct`, img, [p], false, `card=${p} cutSide=${side}`);
      }
    }
  }

  // (g) white occluder, module aligned, seeded
  const rng = mulberry32(SEED + 4);
  for (let i = 0; i < 40; i++) {
    const p = pats[i % 3]!;
    const img = ibCanvas(p);
    const w = 1 + Math.floor(rng() * 3);
    const h = 1 + Math.floor(rng() * 3);
    const m0 = 1 + Math.floor(rng() * (9 - w));
    const n0 = 1 + Math.floor(rng() * (9 - h));
    fillRect(img, IB_ORIGIN + (m0 - 1) * IB_MOD, IB_ORIGIN + (n0 - 1) * IB_MOD, w * IB_MOD, h * IB_MOD, 255);
    const truth = sampleMarkerBits(img, IB_ORIGIN, IB_ORIGIN, IB_MOD);
    summarize(fam, cases, 'g-white-occluder', img, [truth], borderIntact(img), `case=${i} card=${p} modules=(${m0},${n0}) size=${w}x${h}`);
  }
  return { fam, cases: [...cases.values()] };
}

// ---------------------------------------------------------------------------------------------
// 3. Blank and negative images
// ---------------------------------------------------------------------------------------------

export interface NegativeRow {
  name: string;
  total: number;
  detected: number;
  invalidMarker: number;
  notDetected: number;
}

function constant(w: number, h: number, v: number): GrayImage {
  return blankImage(w, h, v);
}

/**
 * Images that contain no marker. `detected` counts false positives (kind DETECTED). The solid black
 * 7x7-module square is reported separately in `solidSquare`.
 */
export function negatives(): {
  fam: FamilyResult;
  rows: NegativeRow[];
  solidSquare: { observed: string; bits: number | null };
} {
  const fam = newFamily('negatives');
  const rows: NegativeRow[] = [];
  const run = (name: string, imgs: GrayImage[]): void => {
    const row: NegativeRow = { name, total: 0, detected: 0, invalidMarker: 0, notDetected: 0 };
    imgs.forEach((img, i) => {
      const res = detectMarkers(img);
      row.total++;
      if (res.kind === 'DETECTED') row.detected++;
      else if (res.kind === 'INVALID_MARKER') row.invalidMarker++;
      else row.notDetected++;
      record(fam, res, res.kind !== 'DETECTED', res.kind === 'DETECTED', `negative/${name}`, `index=${i} size=${img.width}x${img.height}`);
    });
    rows.push(row);
  };

  run('constant-white', [constant(64, 64, 255)]);
  run('constant-black', [constant(64, 64, 0)]);
  run('constant-gray', [constant(64, 64, 128)]);
  run('empty-0x0', [{ width: 0, height: 0, data: new Uint8Array(0) }]);
  run('degenerate-sizes', [
    constant(1, 1, 0),
    constant(1, 1, 255),
    constant(2, 2, 0),
    constant(3, 3, 0),
    constant(1, 200, 0),
    constant(200, 1, 255),
    uniformNoiseImage(5, 5, mulberry32(SEED + 10)),
    uniformNoiseImage(1, 50, mulberry32(SEED + 11)),
    uniformNoiseImage(300, 2, mulberry32(SEED + 12)),
  ]);

  const rngU = mulberry32(SEED + 20);
  const uni: GrayImage[] = [];
  for (let i = 0; i < 200; i++) uni.push(uniformNoiseImage(32 + Math.floor(rngU() * 97), 32 + Math.floor(rngU() * 97), rngU));
  run('uniform-noise-200', uni);

  const rngG = mulberry32(SEED + 21);
  const gau: GrayImage[] = [];
  for (let i = 0; i < 100; i++) {
    const g = blankImage(32 + Math.floor(rngG() * 97), 32 + Math.floor(rngG() * 97), 128);
    addGaussianNoise(g, 20 + 40 * rngG(), rngG);
    gau.push(g);
  }
  run('gaussian-noise-around-gray-100', gau);

  run('gradient-only', [gradientImage(128, 128, 0, 255), gradientImage(128, 128, 255, 0), gradientImage(200, 60, 30, 230)]);

  const bar = blankImage(100, 100);
  fillRect(bar, 20, 40, 60, 10, 0);
  const bar2 = blankImage(100, 100);
  fillRect(bar2, 45, 10, 8, 80, 0);
  run('bar-wrong-aspect', [bar, bar2]);

  const disk = blankImage(100, 100);
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < 100; x++) if (Math.hypot(x + 0.5 - 50, y + 0.5 - 50) <= 30) disk.data[y * 100 + x] = 0;
  const ring = cloneImage(disk);
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < 100; x++) if (Math.hypot(x + 0.5 - 50, y + 0.5 - 50) <= 18) ring.data[y * 100 + x] = 255;
  run('filled-black-disk', [disk, ring]);

  // Solid black 7x7-module square with a 1-module white margin: structurally a valid ring with all-ones data.
  const solid = blankImage(11 * 4, 11 * 4);
  fillRect(solid, 8, 8, 28, 28, 0);
  const sres = detectMarkers(solid);
  const solidSquare = {
    observed: describeResult(sres),
    bits: sres.kind === 'DETECTED' && sres.markers[0] ? sres.markers[0].bits : null,
  };
  return { fam, rows, solidSquare };
}

// ---------------------------------------------------------------------------------------------
// Informational: degradations outside the required conditions (noise, blur, illumination)
// ---------------------------------------------------------------------------------------------

export interface DegradationRow {
  condition: string;
  total: number;
  detected: number;
  exact: number;
  wrongBits: number;
}

function boxBlur(img: GrayImage, radius: number): GrayImage {
  const out = blankImage(img.width, img.height, 255);
  const n = (2 * radius + 1) ** 2;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      let s = 0;
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = Math.min(img.width - 1, Math.max(0, x + dx));
          const yy = Math.min(img.height - 1, Math.max(0, y + dy));
          s += img.data[yy * img.width + xx]!;
        }
      out.data[y * img.width + x] = Math.round(s / n);
    }
  return out;
}

/**
 * Not part of the required list: marker (modulePx 8, 20 patterns, centred on a 140x140 canvas) under
 * gaussian noise, box blur and a multiplicative illumination ramp. Reports measured behaviour only.
 */
export function degradations(): DegradationRow[] {
  const rows: DegradationRow[] = [];
  const pats = studyPatterns(SEED + 5, 20);
  const modulePx = 8;
  const mk = (p: number): GrayImage => {
    const c = blankImage(140, 140);
    pasteImage(c, renderMarker(p, modulePx), 34, 34);
    return c;
  };
  const run = (condition: string, make: (p: number, i: number) => GrayImage, options: DetectOptions = {}): void => {
    const row: DegradationRow = { condition, total: 0, detected: 0, exact: 0, wrongBits: 0 };
    pats.forEach((p, i) => {
      const res = detectMarkers(make(p, i), options);
      const e = expectSingle(res, p);
      row.total++;
      if (res.kind === 'DETECTED') row.detected++;
      if (e.exact) row.exact++;
      if (e.wrong) row.wrongBits++;
    });
    rows.push(row);
  };
  for (const sigma of [10, 20, 40, 60]) {
    run(`gaussian-noise sigma=${sigma}`, (p, i) => {
      const img = mk(p);
      addGaussianNoise(img, sigma, mulberry32(SEED + 100 * sigma + i));
      return img;
    });
  }
  for (const r of [1, 2, 3]) run(`box-blur radius=${r}px (module 8px)`, (p) => boxBlur(mk(p), r));
  const ramp = (p: number, lo: number): GrayImage => {
    const img = mk(p);
    for (let y = 0; y < img.height; y++)
      for (let x = 0; x < img.width; x++) {
        const f = lo + ((1 - lo) * x) / (img.width - 1);
        img.data[y * img.width + x] = Math.round(img.data[y * img.width + x]! * f);
      }
    return img;
  };
  for (const lo of [0.6, 0.35, 0.2]) {
    run(`illumination ramp x${lo}..x1 otsu`, (p) => ramp(p, lo));
    run(`illumination ramp x${lo}..x1 adaptive`, (p) => ramp(p, lo), { binarization: 'adaptive' });
  }
  run('clean adaptive', (p) => mk(p), { binarization: 'adaptive' });
  run('dim marker: black=90 white=170 otsu', (p) => {
    const img = mk(p);
    for (let i = 0; i < img.data.length; i++) img.data[i] = 90 + Math.round((img.data[i]! * 80) / 255);
    return img;
  });
  return rows;
}
