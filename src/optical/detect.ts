/**
 * Marker detection WITHOUT known coordinates (design.md, Optical Marker System, sections 2 and 7.1).
 *
 * Pipeline: binarize (Otsu or integral-image adaptive) -> 8-connected dark components -> outer
 * silhouette -> convex hull -> max-area inscribed quadrilateral (rotation independent) -> edge-line
 * refinement -> quality checks -> canonical corner order -> homography (7x7 grid -> image) ->
 * patch sampling -> border / margin / contrast validation -> 25-bit read.
 *
 * Pure TypeScript, no dependencies. No card, codebook or template knowledge lives here: this module
 * only reports the 25 raw bits it reads in the canonical frame. Matching is task 4.2.
 *
 * Coordinates: continuous image space, pixel (i, j) covers [i, i+1) x [j, j+1), centre (i+.5, j+.5),
 * y points down. "Clockwise" means clockwise as displayed.
 *
 * Canonical frame: corners are ordered clockwise, starting at the corner for which the first edge
 * direction is closest to the image x axis, i.e. rotationDeg in (-45, 45]. The remaining 90-degree
 * ambiguity is NOT resolved here. A marker rotated clockwise by 90k degrees is therefore read as
 * R90^k . P (design section 3 cell map).
 *
 * MEASURED LIMITS: synthetic images only, not real cameras. See LIMITS below and
 * docs/optical/results/m4-1-detection.md for the numbers behind them.
 */
import type { GrayImage } from './render';

export interface Point {
  x: number;
  y: number;
}

export interface DetectedMarker {
  /** Image-space outer corners of the 7x7 square, clockwise, canonical frame (grid (0,0),(7,0),(7,7),(0,7)). */
  corners: [Point, Point, Point, Point];
  center: Point;
  /** Mean outer edge length of the 7x7 square in pixels. */
  sizePx: number;
  /** Canonical rotation in (-45, 45], clockwise positive in image space (y down). */
  rotationDeg: number;
  /** 25-bit data read in the canonical frame, bit i = 5r + c, set = black. */
  bits: number;
  /** 25 values 0..1 (1 = black), for later confidence use. */
  cellDarkness: number[];
  /** Min darkness over the 24 border cells (0..1). */
  borderDarkness: number;
  /** Mean normalized brightness of the 1-module margin ring (0..1), null when the ring is mostly outside the image. */
  marginBrightness: number | null;
  /** ADDITIVE: min over the 25 data cells of the fraction of patch samples agreeing with the read bit (0..1). */
  cellPurity: number;
  /** 9 numbers, row-major 3x3, grid units (0..7) -> image. */
  homography: number[];
}

/** GRID_MISALIGNED is an ADDITIVE reason (not in the original list): patches straddle module edges. */
export type RejectionReason =
  | 'NOT_QUADRILATERAL'
  | 'TOO_SMALL'
  | 'TOUCHES_IMAGE_EDGE'
  | 'BORDER_NOT_BLACK'
  | 'MARGIN_NOT_WHITE'
  | 'DEGENERATE_GEOMETRY'
  | 'LOW_CONTRAST'
  | 'GRID_MISALIGNED';

export interface RejectedCandidate {
  reason: RejectionReason;
  center: Point;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export type DetectResult =
  | { kind: 'DETECTED'; markers: DetectedMarker[]; rejected: RejectedCandidate[] }
  | { kind: 'INVALID_MARKER'; rejected: RejectedCandidate[] }
  | { kind: 'NOT_DETECTED' };

export interface DetectOptions {
  /** 'otsu' (default, global) or 'adaptive' (integral-image local mean). */
  binarization?: 'otsu' | 'adaptive';
  /** Adaptive window edge in px (default max(15, min(w,h)/8), made odd). */
  adaptiveWindow?: number;
  /** Adaptive: a pixel is dark when value < localMean - offset (default 12). */
  adaptiveOffset?: number;
  /** Minimum outer edge length in px (default DEFAULT_MIN_SIZE_PX). */
  minSizePx?: number;
  /** Minimum gray-level difference between white and black reference (default 40). */
  minContrast?: number;
  /** Every border cell must have darkness >= this (default 0.6). */
  borderMinDarkness?: number;
  /** Mean normalized margin brightness must be >= this (default 0.8). */
  marginMinBrightness?: number;
  /** At most this fraction of margin cells may be dark (default 0.15). */
  maxDarkMarginFraction?: number;
  /** Minimum cell purity over data cells (default 0.7). */
  minCellPurity?: number;
}

/**
 * LIMITS (measured on synthetic rasters only, NOT real cameras; numbers in
 * docs/optical/results/m4-1-detection.md, conditions in src/optical/testing/detect-conditions.ts):
 *
 * - Minimum size: crisp (unblurred, integer module size) markers read exactly from modulePx 2, i.e.
 *   an outer 7x7 edge of 14 px (52/52 patterns, every size 2..24). Modules of 1 px are never detected.
 *   After a box-filtered downscale (camera-like blur) exact reads start at 2.5 px per module (edge
 *   17.5 px); between 2.0 and 2.5 some markers are rejected (GRID_MISALIGNED / NOT_QUADRILATERAL) but
 *   none returned wrong bits in the measured sets. DEFAULT_MIN_SIZE_PX = 14 matches the crisp limit.
 * - Rotation: 0..355 degrees in 5 degree steps are all read exactly (canonical frame, see top comment).
 * - Perspective (plane tilt about an in-plane axis, camera distance 5 marker edges): exact through
 *   40 degrees (the required range); the sanity limits (interior angles 40..140 degrees, side ratio
 *   >= 0.5) start rejecting some views at about 60 degrees, and 70 degrees is never detected.
 * - Illumination: global Otsu handled uniform dimming and a 1:1.7 brightness ramp across the canvas
 *   but not a 1:2.9 ramp; the integral-image adaptive mode (binarization: 'adaptive') handled 1:2.9
 *   but not 1:5. Shadows with hard edges, glare and colour are not handled.
 * - MARGIN_NOT_WHITE only fires for dark structure in the margin that is NOT connected to the marker
 *   (e.g. isolated dots; 8 of 32 margin cells fail, 1 is tolerated). Dark structure touching the border
 *   merges with the marker component and is reported as NOT_QUADRILATERAL or BORDER_NOT_BLACK.
 * - Noise and blur: gaussian noise up to sigma 60 and box blur up to 3 px on an 8 px module were read
 *   exactly (20 patterns each); this says nothing about real sensor noise or defocus.
 * - Occlusion: any missing or darkened border cell, or contamination of the 1-module margin, is
 *   rejected (BORDER_NOT_BLACK / NOT_QUADRILATERAL / MARGIN_NOT_WHITE / TOUCHES_IMAGE_EDGE) or not
 *   detected. Occluded DATA cells are read as seen (white = 0).
 * - Border darkness is measured relative to the marker's own white margin, so a uniformly gray (but
 *   contrasty, >= minContrast levels) marker is accepted. Absolute blackness is not required.
 * - A solid black 7x7 square with white margin is structurally a valid ring with all-ones data and is
 *   reported DETECTED with bits 0x1FFFFFF. Rejecting it is the job of template matching (task 4.2).
 * - Markers must not touch other dark structures (the margin guarantees a separate component) and
 *   must not touch the image border. Clustering of several markers into a card group is NOT done here.
 */
export const DEFAULT_MIN_SIZE_PX = 14;

interface ResolvedOptions {
  binarization: 'otsu' | 'adaptive';
  adaptiveWindow: number | null;
  adaptiveOffset: number;
  minSizePx: number;
  minContrast: number;
  borderMinDarkness: number;
  marginMinBrightness: number;
  maxDarkMarginFraction: number;
  minCellPurity: number;
}

function num(v: number | undefined, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

function resolveOptions(o: DetectOptions): ResolvedOptions {
  return {
    binarization: o.binarization === 'adaptive' ? 'adaptive' : 'otsu',
    adaptiveWindow: typeof o.adaptiveWindow === 'number' && o.adaptiveWindow >= 3 ? Math.floor(o.adaptiveWindow) : null,
    adaptiveOffset: num(o.adaptiveOffset, 12),
    minSizePx: num(o.minSizePx, DEFAULT_MIN_SIZE_PX),
    minContrast: num(o.minContrast, 40),
    borderMinDarkness: num(o.borderMinDarkness, 0.6),
    marginMinBrightness: num(o.marginMinBrightness, 0.8),
    maxDarkMarginFraction: num(o.maxDarkMarginFraction, 0.15),
    minCellPurity: num(o.minCellPurity, 0.7),
  };
}

// ---------------------------------------------------------------------------------------------
// Binarization
// ---------------------------------------------------------------------------------------------

/** Otsu threshold: dark means value <= t. Plateaus of equal variance are resolved to their middle. */
function otsuThreshold(data: ArrayLike<number>): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < data.length; i++) hist[data[i]! & 255]!++;
  const total = data.length;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t]!;
  let wB = 0;
  let sumB = 0;
  let best = -1;
  let first = 0;
  let last = 0;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best + 1e-9) {
      best = v;
      first = t;
      last = t;
    } else if (Math.abs(v - best) <= 1e-9) {
      last = t;
    }
  }
  return Math.floor((first + last) / 2);
}

function binarizeOtsu(data: ArrayLike<number>, n: number): { dark: Uint8Array; bright: number } {
  const t = otsuThreshold(data);
  const dark = new Uint8Array(n);
  let sum = 0;
  let cnt = 0;
  for (let i = 0; i < n; i++) {
    const v = data[i]!;
    if (v <= t) dark[i] = 1;
    else {
      sum += v;
      cnt++;
    }
  }
  return { dark, bright: cnt > 0 ? sum / cnt : 255 };
}

function binarizeAdaptive(
  data: ArrayLike<number>,
  w: number,
  h: number,
  window: number | null,
  offset: number,
): { dark: Uint8Array; bright: number } {
  let win = window ?? Math.max(15, Math.floor(Math.min(w, h) / 8));
  if (win % 2 === 0) win++;
  const half = (win - 1) >> 1;
  const stride = w + 1;
  const integral = new Float64Array(stride * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += data[y * w + x]!;
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1]! + row;
    }
  }
  const dark = new Uint8Array(w * h);
  let sum = 0;
  let cnt = 0;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(h, y + half + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(w, x + half + 1);
      const s =
        integral[y1 * stride + x1]! - integral[y0 * stride + x1]! - integral[y1 * stride + x0]! + integral[y0 * stride + x0]!;
      const mean = s / ((x1 - x0) * (y1 - y0));
      const v = data[y * w + x]!;
      if (v < mean - offset) dark[y * w + x] = 1;
      else {
        sum += v;
        cnt++;
      }
    }
  }
  return { dark, bright: cnt > 0 ? sum / cnt : 255 };
}

// ---------------------------------------------------------------------------------------------
// Connected components (8-connected, union-find, iterative)
// ---------------------------------------------------------------------------------------------

interface Components {
  labels: Int32Array;
  count: number;
  area: Int32Array;
  minX: Int32Array;
  minY: Int32Array;
  maxX: Int32Array;
  maxY: Int32Array;
}

function labelComponents(dark: Uint8Array, w: number, h: number): Components {
  const labels = new Int32Array(w * h);
  // Label creators form an independent set in the king graph, so this bound holds.
  const parent = new Int32Array(((w + 1) >> 1) * ((h + 1) >> 1) + 2);
  let next = 1;
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]!]!;
      a = parent[a]!;
    }
    return a;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra < rb) parent[rb] = ra;
    else if (rb < ra) parent[ra] = rb;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!dark[i]) continue;
      const nW = x > 0 ? labels[i - 1]! : 0;
      const nNW = x > 0 && y > 0 ? labels[i - w - 1]! : 0;
      const nN = y > 0 ? labels[i - w]! : 0;
      const nNE = y > 0 && x < w - 1 ? labels[i - w + 1]! : 0;
      let m = 0;
      for (const l of [nW, nNW, nN, nNE]) if (l !== 0 && (m === 0 || l < m)) m = l;
      if (m === 0) {
        parent[next] = next;
        labels[i] = next++;
      } else {
        labels[i] = m;
        for (const l of [nW, nNW, nN, nNE]) if (l !== 0 && l !== m) union(m, l);
      }
    }
  }
  const finalId = new Int32Array(next);
  let count = 0;
  for (let l = 1; l < next; l++) {
    if (find(l) === l) finalId[l] = ++count;
  }
  const area = new Int32Array(count + 1);
  const minX = new Int32Array(count + 1).fill(2147483647);
  const minY = new Int32Array(count + 1).fill(2147483647);
  const maxX = new Int32Array(count + 1).fill(-1);
  const maxY = new Int32Array(count + 1).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const l = labels[i]!;
      if (l === 0) continue;
      const id = finalId[find(l)]!;
      labels[i] = id;
      area[id]!++;
      if (x < minX[id]!) minX[id] = x;
      if (x > maxX[id]!) maxX[id] = x;
      if (y < minY[id]!) minY[id] = y;
      if (y > maxY[id]!) maxY[id] = y;
    }
  }
  return { labels, count, area, minX, minY, maxX, maxY };
}

/**
 * Pixel centres of the OUTER boundary of component `id`: component pixels that 4-touch the
 * background region connected (4-connected) to the outside of the image. Inner holes (white data
 * cells) are ignored on purpose.
 */
function outerBoundary(c: Components, w: number, id: number): Float64Array {
  const bx0 = c.minX[id]!;
  const by0 = c.minY[id]!;
  const bw = c.maxX[id]! - bx0 + 1;
  const bh = c.maxY[id]! - by0 + 1;
  const pw = bw + 2;
  const ph = bh + 2;
  const inComp = new Uint8Array(pw * ph);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (c.labels[(by0 + y) * w + bx0 + x] === id) inComp[(y + 1) * pw + x + 1] = 1;
    }
  }
  const outside = new Uint8Array(pw * ph);
  const stack = new Int32Array(pw * ph);
  let sp = 0;
  stack[sp++] = 0;
  outside[0] = 1;
  while (sp > 0) {
    const p = stack[--sp]!;
    const px = p % pw;
    const py = (p - px) / pw;
    if (px > 0) push(p - 1);
    if (px < pw - 1) push(p + 1);
    if (py > 0) push(p - pw);
    if (py < ph - 1) push(p + pw);
  }
  function push(q: number): void {
    if (inComp[q] === 0 && outside[q] === 0) {
      outside[q] = 1;
      stack[sp++] = q;
    }
  }
  const pts: number[] = [];
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const p = (y + 1) * pw + x + 1;
      if (inComp[p] === 0) continue;
      if (outside[p - 1] || outside[p + 1] || outside[p - pw] || outside[p + pw]) {
        pts.push(bx0 + x + 0.5, by0 + y + 0.5);
      }
    }
  }
  return Float64Array.from(pts);
}

// ---------------------------------------------------------------------------------------------
// Geometry: hull, inscribed quadrilateral, line refinement
// ---------------------------------------------------------------------------------------------

type Quad = [Point, Point, Point, Point];

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Shoelace sum / 2. Positive = clockwise as displayed (y down). */
function signedArea(p: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % p.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Hull (monotone chain) of the pixel-corner points of the given pixel centres. */
function hullOfPixelCorners(centres: Float64Array, w: number, h: number): Point[] {
  const keys = new Set<number>();
  const H = h + 1;
  for (let i = 0; i < centres.length; i += 2) {
    const x = Math.floor(centres[i]!);
    const y = Math.floor(centres[i + 1]!);
    keys.add(x * H + y);
    keys.add((x + 1) * H + y);
    keys.add(x * H + y + 1);
    keys.add((x + 1) * H + y + 1);
  }
  void w;
  const sorted = Int32Array.from(keys).sort();
  const pts: Point[] = [];
  for (const k of sorted) pts.push({ x: Math.floor(k / H), y: k % H });
  if (pts.length < 3) return pts;
  const cross = (o: Point, a: Point, b: Point): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Max-area quadrilateral inscribed in the hull vertices (rotation independent). A is tried over the
 * few vertices farthest from the centroid; for each A every vertex is tried as the opposite corner C,
 * B and D are the vertices farthest from line AC on each side.
 */
function inscribedQuad(hull: readonly Point[]): Quad | null {
  const n = hull.length;
  if (n < 4) return null;
  let cx = 0;
  let cy = 0;
  for (const p of hull) {
    cx += p.x;
    cy += p.y;
  }
  cx /= n;
  cy /= n;
  const order = hull
    .map((_, i) => i)
    .sort((i, j) => Math.hypot(hull[j]!.x - cx, hull[j]!.y - cy) - Math.hypot(hull[i]!.x - cx, hull[i]!.y - cy));
  let bestArea = 0;
  let best: Quad | null = null;
  for (const ia of order.slice(0, 6)) {
    const A = hull[ia]!;
    for (let ic = 0; ic < n; ic++) {
      if (ic === ia) continue;
      const C = hull[ic]!;
      const dx = C.x - A.x;
      const dy = C.y - A.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) continue;
      let dPos = 0;
      let dNeg = 0;
      let B: Point | null = null;
      let D: Point | null = null;
      for (let k = 0; k < n; k++) {
        const P = hull[k]!;
        const d = (dx * (P.y - A.y) - dy * (P.x - A.x)) / len;
        if (d > dPos) {
          dPos = d;
          B = P;
        } else if (-d > dNeg) {
          dNeg = -d;
          D = P;
        }
      }
      if (!B || !D) continue;
      const area = 0.5 * len * (dPos + dNeg);
      if (area > bestArea + 1e-9) {
        bestArea = area;
        best = [A, B, C, D];
      }
    }
  }
  if (!best) return null;
  const q: Quad = [best[0], best[1], best[2], best[3]];
  return signedArea(q) < 0 ? [q[0], q[3], q[2], q[1]] : q;
}

const sideLengths = (q: Quad): number[] => [dist(q[0], q[1]), dist(q[1], q[2]), dist(q[2], q[3]), dist(q[3], q[0])];

function sideStats(q: Quad): { mean: number; ratio: number } {
  const s = sideLengths(q);
  const mn = Math.min(...s);
  const mx = Math.max(...s);
  return { mean: (s[0]! + s[1]! + s[2]! + s[3]!) / 4, ratio: mx > 0 ? mn / mx : 0 };
}

interface Line {
  mx: number;
  my: number;
  ux: number;
  uy: number;
}

/** Total-least-squares line through the points (flat x,y array). */
function fitLine(xs: number[], ys: number[]): Line | null {
  const n = xs.length;
  if (n < 2) return null;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i]!;
    my += ys[i]!;
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { mx, my, ux: Math.cos(th), uy: Math.sin(th) };
}

/**
 * Replaces the corner estimates with intersections of lines fitted to the outer boundary pixels along
 * each edge. Boundary pixel centres lie on average max(|nx|,|ny|)/2 inside the true edge (pixel centre
 * threshold), so the points are shifted outward by that amount before fitting. Outliers (notches,
 * neighbouring structure) are rejected iteratively.
 */
function refineQuad(q: Quad, pts: Float64Array, size: number): Quad | null {
  const band = Math.max(1.5, 0.1 * size);
  const lines: Line[] = [];
  for (let k = 0; k < 4; k++) {
    const P = q[k]!;
    const Q = q[(k + 1) % 4]!;
    const L = dist(P, Q);
    if (L < 1e-6) return null;
    const dx = (Q.x - P.x) / L;
    const dy = (Q.y - P.y) / L;
    const nx = -dy;
    const ny = dx;
    const shift = Math.max(Math.abs(nx), Math.abs(ny)) / 2;
    let xs: number[] = [];
    let ys: number[] = [];
    for (let i = 0; i < pts.length; i += 2) {
      const px = pts[i]!;
      const py = pts[i + 1]!;
      const t = ((px - P.x) * dx + (py - P.y) * dy) / L;
      const s = (px - P.x) * nx + (py - P.y) * ny;
      if (t < 0.08 || t > 0.92 || Math.abs(s) > band) continue;
      xs.push(px - nx * shift);
      ys.push(py - ny * shift);
    }
    if (xs.length < 6) return null;
    let line = fitLine(xs, ys);
    for (let it = 0; it < 3 && line; it++) {
      const keepX: number[] = [];
      const keepY: number[] = [];
      for (let i = 0; i < xs.length; i++) {
        const r = Math.abs((xs[i]! - line.mx) * -line.uy + (ys[i]! - line.my) * line.ux);
        if (r <= 0.9) {
          keepX.push(xs[i]!);
          keepY.push(ys[i]!);
        }
      }
      if (keepX.length < 6) return null;
      xs = keepX;
      ys = keepY;
      line = fitLine(xs, ys);
    }
    if (!line) return null;
    let tmin = Infinity;
    let tmax = -Infinity;
    for (let i = 0; i < xs.length; i++) {
      const t = ((xs[i]! - P.x) * dx + (ys[i]! - P.y) * dy) / L;
      if (t < tmin) tmin = t;
      if (t > tmax) tmax = t;
    }
    if (tmax - tmin < 0.5) return null;
    lines.push(line);
  }
  const out: Point[] = [];
  for (let k = 0; k < 4; k++) {
    const a = lines[(k + 3) % 4]!;
    const b = lines[k]!;
    const det = a.ux * -b.uy - -b.ux * a.uy;
    if (Math.abs(det) < 0.2) return null;
    const rx = b.mx - a.mx;
    const ry = b.my - a.my;
    const s = (rx * -b.uy - -b.ux * ry) / det;
    out.push({ x: a.mx + s * a.ux, y: a.my + s * a.uy });
  }
  const r: Quad = [out[0]!, out[1]!, out[2]!, out[3]!];
  return signedArea(r) > 0 ? r : null;
}

/** Largest distance by which p lies outside the clockwise convex quad (0 when inside). */
function outsideDistance(q: Quad, p: Point): number {
  let worst = 0;
  for (let k = 0; k < 4; k++) {
    const P = q[k]!;
    const Q = q[(k + 1) % 4]!;
    const L = dist(P, Q);
    const nx = -(Q.y - P.y) / L;
    const ny = (Q.x - P.x) / L;
    const out = -((p.x - P.x) * nx + (p.y - P.y) * ny);
    if (out > worst) worst = out;
  }
  return worst;
}

function isConvexClockwise(q: Quad): boolean {
  for (let k = 0; k < 4; k++) {
    const a = q[k]!;
    const b = q[(k + 1) % 4]!;
    const c = q[(k + 2) % 4]!;
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0) return false;
  }
  return true;
}

/** Interior angle at corner k in degrees. */
function interiorAngle(q: Quad, k: number): number {
  const a = q[(k + 3) % 4]!;
  const b = q[k]!;
  const c = q[(k + 1) % 4]!;
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  return (Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y))))) * 180) / Math.PI;
}

/** Homography from 4 point pairs (h22 = 1), Gaussian elimination with partial pivoting. */
function solveHomography(src: readonly Point[], dst: readonly Point[]): number[] | null {
  const m: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const X = src[i]!.x;
    const Y = src[i]!.y;
    const x = dst[i]!.x;
    const y = dst[i]!.y;
    m.push([X, Y, 1, 0, 0, 0, -x * X, -x * Y, x]);
    m.push([0, 0, 0, X, Y, 1, -y * X, -y * Y, y]);
  }
  for (let col = 0; col < 8; col++) {
    let piv = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[piv]![col]!)) piv = r;
    if (Math.abs(m[piv]![col]!) < 1e-12) return null;
    [m[col], m[piv]] = [m[piv]!, m[col]!];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = m[r]![col]! / m[col]![col]!;
      for (let c = col; c < 9; c++) m[r]![c] = m[r]![c]! - f * m[col]![c]!;
    }
  }
  const h: number[] = [];
  for (let i = 0; i < 8; i++) h.push(m[i]![8]! / m[i]![i]!);
  h.push(1);
  return h;
}

// ---------------------------------------------------------------------------------------------
// Sampling and validation
// ---------------------------------------------------------------------------------------------

/** Patch offsets (grid units) for the 3x3 averaged sample inside one module. */
const PATCH = 0.25;
const PATCH_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-PATCH, -PATCH], [0, -PATCH], [PATCH, -PATCH],
  [-PATCH, 0], [0, 0], [PATCH, 0],
  [-PATCH, PATCH], [0, PATCH], [PATCH, PATCH],
];

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function percentile(v: number[], p: number): number {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Bilinear gray value at continuous coordinates (pixel centres at +0.5), edges clamped. */
function bilinear(data: ArrayLike<number>, w: number, h: number, x: number, y: number): number {
  const fx = x - 0.5;
  const fy = y - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const xa = Math.min(w - 1, Math.max(0, x0));
  const xb = Math.min(w - 1, Math.max(0, x0 + 1));
  const ya = Math.min(h - 1, Math.max(0, y0));
  const yb = Math.min(h - 1, Math.max(0, y0 + 1));
  const top = data[ya * w + xa]! * (1 - tx) + data[ya * w + xb]! * tx;
  const bot = data[yb * w + xa]! * (1 - tx) + data[yb * w + xb]! * tx;
  return top * (1 - ty) + bot * ty;
}

interface CellSample {
  mean: number;
  values: number[];
}

type Candidate =
  | { kind: 'drop' }
  | { kind: 'rejected'; rejected: RejectedCandidate }
  | { kind: 'marker'; marker: DetectedMarker };

interface Context {
  w: number;
  h: number;
  data: ArrayLike<number>;
  comps: Components;
  opts: ResolvedOptions;
  brightLevel: number;
}

function wrapAngle(a: number): number {
  let r = a % 360;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  return r;
}

/**
 * Rotates the clockwise corner list so the first edge direction is closest to the image x axis,
 * rotationDeg in (-45, 45]. The angle is the circular mean of the four edge angles (each turned back
 * by 90 degrees per edge index), which stays stable under perspective keystone.
 */
function canonicalize(q: Quad): { corners: Quad; rotationDeg: number } {
  // Grid x-axis angle of the shift-0 frame: circular mean of the four edge angles, each turned back by
  // 90 degrees per edge index. Averaging cancels the opposite keystone rotation of opposite edges.
  let sumS = 0;
  let sumC = 0;
  for (let j = 0; j < 4; j++) {
    const a = q[j]!;
    const b = q[(j + 1) % 4]!;
    const ang = Math.atan2(b.y - a.y, b.x - a.x) - (j * Math.PI) / 2;
    sumS += Math.sin(ang);
    sumC += Math.cos(ang);
  }
  const mean = (Math.atan2(sumS, sumC) * 180) / Math.PI;
  let chosen = 0;
  let angle = wrapAngle(mean);
  for (let s = 0; s < 4; s++) {
    const a = wrapAngle(mean + 90 * s);
    if (a > -45 && a <= 45) {
      chosen = s;
      angle = a;
      break;
    }
  }
  const corners: Quad = [q[chosen]!, q[(chosen + 1) % 4]!, q[(chosen + 2) % 4]!, q[(chosen + 3) % 4]!];
  return { corners, rotationDeg: angle };
}

function reject(c: Components, id: number, reason: RejectionReason): Candidate {
  const x0 = c.minX[id]!;
  const y0 = c.minY[id]!;
  const x1 = c.maxX[id]! + 1;
  const y1 = c.maxY[id]! + 1;
  return { kind: 'rejected', rejected: { reason, center: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, bbox: { x0, y0, x1, y1 } } };
}

function analyzeComponent(ctx: Context, id: number): Candidate {
  const { w, h, comps, opts } = ctx;
  const bw = comps.maxX[id]! - comps.minX[id]! + 1;
  const bh = comps.maxY[id]! - comps.minY[id]! + 1;
  // Background-like regions that span the whole image cannot be a complete marker with margin.
  if (bw >= 0.98 * w || bh >= 0.98 * h) return { kind: 'drop' };
  if (comps.area[id]! < 24) return { kind: 'drop' };

  const pts = outerBoundary(comps, w, id);
  const hull = hullOfPixelCorners(pts, w, h);
  const q0 = inscribedQuad(hull);
  if (!q0) return { kind: 'drop' };
  const hullArea = Math.abs(signedArea(hull));
  const quadArea = signedArea(q0);
  if (hullArea <= 0 || quadArea <= 0) return { kind: 'drop' };
  const st0 = sideStats(q0);
  // Marker-like gate: nearly a quadrilateral and not elongated. Everything else is silently ignored.
  if (quadArea / hullArea < 0.85 || st0.ratio < 0.45) return { kind: 'drop' };
  if (st0.mean < 0.5 * opts.minSizePx) return { kind: 'drop' };
  if (st0.mean < opts.minSizePx) {
    // Pixel-level geometry is noisy this small, so only report clearly square, reasonably filled blobs.
    const squarish = quadArea / hullArea >= 0.9 && st0.ratio >= 0.7 && comps.area[id]! / hullArea >= 0.4;
    return squarish && st0.mean >= 0.6 * opts.minSizePx ? reject(comps, id, 'TOO_SMALL') : { kind: 'drop' };
  }
  const touches =
    comps.minX[id] === 0 || comps.minY[id] === 0 || comps.maxX[id] === w - 1 || comps.maxY[id] === h - 1;
  if (touches) return reject(comps, id, 'TOUCHES_IMAGE_EDGE');

  const q = refineQuad(q0, pts, st0.mean);
  if (!q) return reject(comps, id, 'NOT_QUADRILATERAL');
  const st = sideStats(q);
  const tolE = Math.max(1.5, 0.04 * st.mean);
  let worst = 0;
  for (const p of hull) worst = Math.max(worst, outsideDistance(q, p));
  const refArea = signedArea(q);
  if (worst > tolE || hullArea / refArea < 0.92 || hullArea / refArea > 1.08) {
    return reject(comps, id, 'NOT_QUADRILATERAL');
  }
  for (let k = 0; k < 4; k++) {
    if (dist(q[k]!, q0[k]!) > 0.25 * st.mean) return reject(comps, id, 'NOT_QUADRILATERAL');
  }
  if (!isConvexClockwise(q) || st.ratio < 0.5) return reject(comps, id, 'DEGENERATE_GEOMETRY');
  for (let k = 0; k < 4; k++) {
    const a = interiorAngle(q, k);
    if (a < 40 || a > 140) return reject(comps, id, 'DEGENERATE_GEOMETRY');
  }
  if (st.mean < opts.minSizePx) return reject(comps, id, 'TOO_SMALL');

  const { corners, rotationDeg } = canonicalize(q);
  const H = solveHomography(
    [{ x: 0, y: 0 }, { x: 7, y: 0 }, { x: 7, y: 7 }, { x: 0, y: 7 }],
    corners,
  );
  if (!H) return reject(comps, id, 'DEGENERATE_GEOMETRY');
  return readMarker(ctx, id, corners, rotationDeg, st.mean, H);
}

function readMarker(
  ctx: Context,
  id: number,
  corners: Quad,
  rotationDeg: number,
  sizePx: number,
  H: number[],
): Candidate {
  const { w, h, data, comps, opts } = ctx;
  const toImage = (u: number, v: number): Point => {
    const d = H[6]! * u + H[7]! * v + H[8]!;
    return { x: (H[0]! * u + H[1]! * v + H[2]!) / d, y: (H[3]! * u + H[4]! * v + H[5]!) / d };
  };
  /** Averaged 3x3 patch for the module with grid centre (u, v); null when any sample is off-image. */
  const sampleCell = (u: number, v: number): CellSample | null => {
    const values: number[] = [];
    for (const [du, dv] of PATCH_OFFSETS) {
      const p = toImage(u + du, v + dv);
      if (!(p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h)) return null;
      values.push(bilinear(data, w, h, p.x, p.y));
    }
    let s = 0;
    for (const x of values) s += x;
    return { mean: s / 9, values };
  };

  const borderCells: CellSample[] = [];
  for (let n = 0; n < 7; n++) {
    for (let m = 0; m < 7; m++) {
      if (m !== 0 && m !== 6 && n !== 0 && n !== 6) continue;
      const cell = sampleCell(m + 0.5, n + 0.5);
      if (!cell) return reject(comps, id, 'TOUCHES_IMAGE_EDGE');
      borderCells.push(cell);
    }
  }
  const marginCells: CellSample[] = [];
  for (let n = -1; n <= 7; n++) {
    for (let m = -1; m <= 7; m++) {
      if (m >= 0 && m <= 6 && n >= 0 && n <= 6) continue;
      const cell = sampleCell(m + 0.5, n + 0.5);
      if (cell) marginCells.push(cell);
    }
  }
  const gBlack = median(borderCells.map((c) => c.mean));
  const marginOk = marginCells.length >= 16;
  const gWhite = marginOk ? percentile(marginCells.map((c) => c.mean), 0.85) : ctx.brightLevel;
  const span = gWhite - gBlack;
  if (!(span >= opts.minContrast)) return reject(comps, id, 'LOW_CONTRAST');
  const dark = (g: number): number => clamp01((gWhite - g) / span);

  let borderDarkness = 1;
  for (const c of borderCells) borderDarkness = Math.min(borderDarkness, dark(c.mean));
  if (borderDarkness < opts.borderMinDarkness) return reject(comps, id, 'BORDER_NOT_BLACK');

  let marginBrightness: number | null = null;
  if (marginOk) {
    let sum = 0;
    let darkCount = 0;
    for (const c of marginCells) {
      const d = dark(c.mean);
      sum += 1 - d;
      if (d > 0.5) darkCount++;
    }
    marginBrightness = sum / marginCells.length;
    if (marginBrightness < opts.marginMinBrightness || darkCount / marginCells.length > opts.maxDarkMarginFraction) {
      return reject(comps, id, 'MARGIN_NOT_WHITE');
    }
  }

  let bits = 0;
  let purity = 1;
  const cellDarkness: number[] = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const cell = sampleCell(c + 1.5, r + 1.5);
      if (!cell) return reject(comps, id, 'TOUCHES_IMAGE_EDGE');
      const d = dark(cell.mean);
      const bit = d >= 0.5;
      cellDarkness.push(d);
      if (bit) bits |= 1 << (5 * r + c);
      let agree = 0;
      for (const v of cell.values) if (dark(v) >= 0.5 === bit) agree++;
      purity = Math.min(purity, agree / 9);
    }
  }
  if (purity < opts.minCellPurity) return reject(comps, id, 'GRID_MISALIGNED');

  const marker: DetectedMarker = {
    corners,
    center: toImage(3.5, 3.5),
    sizePx,
    rotationDeg,
    bits,
    cellDarkness,
    borderDarkness,
    marginBrightness,
    cellPurity: purity,
    homography: H.slice(),
  };
  return { kind: 'marker', marker };
}

const byRowMajor = (a: { center: Point }, b: { center: Point }): number =>
  a.center.y - b.center.y || a.center.x - b.center.x;

export function detectMarkers(image: GrayImage, options: DetectOptions = {}): DetectResult {
  if (typeof image !== 'object' || image === null) throw new RangeError('image must be a GrayImage');
  const { width: w, height: h, data } = image;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 0 || h < 0) {
    throw new RangeError(`invalid image dimensions ${String(w)}x${String(h)}`);
  }
  if (data === null || typeof data !== 'object' || typeof data.length !== 'number' || data.length !== w * h) {
    throw new RangeError('image.data length must equal width * height');
  }
  const opts = resolveOptions(options);
  if (w < 3 || h < 3) return { kind: 'NOT_DETECTED' };
  let lo = 255;
  let hi = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i]!;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (hi - lo < opts.minContrast) return { kind: 'NOT_DETECTED' };

  const bin =
    opts.binarization === 'adaptive'
      ? binarizeAdaptive(data, w, h, opts.adaptiveWindow, opts.adaptiveOffset)
      : binarizeOtsu(data, w * h);
  const comps = labelComponents(bin.dark, w, h);
  const ctx: Context = { w, h, data, comps, opts, brightLevel: bin.bright };

  const markers: DetectedMarker[] = [];
  const rejected: RejectedCandidate[] = [];
  for (let id = 1; id <= comps.count; id++) {
    const res = analyzeComponent(ctx, id);
    if (res.kind === 'marker') markers.push(res.marker);
    else if (res.kind === 'rejected') rejected.push(res.rejected);
  }
  markers.sort(byRowMajor);
  rejected.sort(byRowMajor);
  if (markers.length > 0) return { kind: 'DETECTED', markers, rejected };
  if (rejected.length > 0) return { kind: 'INVALID_MARKER', rejected };
  return { kind: 'NOT_DETECTED' };
}
