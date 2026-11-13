/**
 * TEST SUPPORT ONLY - one trial of the task 5.6 geometry experiment: seeded scenario -> board raster (cards on a
 * table, optional BACK faces with registration and cut offsets) -> camera degradation -> decodeGroup -> scoring.
 * SYNTHETIC images, not real cameras.
 *
 * Information flow: `buildScenario` knows the truth (cards, positions). `renderScenario` and `degradeImage` turn it
 * into pixels. `decodeGroup` receives ONLY the pixels (plus the layout offset of the marker footprints, a geometry
 * option of the reader, never an identity). `classify` compares the decoder result with the truth afterwards.
 *
 * Board model (Requirement 15): cards of 63.5 x 88.9 mm with rounded corners laid out on a pitch of card size + gap.
 * Placement errors: every ROW slides along its horizontal seam by a seeded shift, every COLUMN slides along its
 * vertical seam, so adjacent cards differ along the seam by at most `shiftMm`; every card has its own seeded
 * rotation about its centre. Across-seam displacement is the `gapMm` factor only (no card pushes into another one
 * except through rotation; where cards overlap, the later card in row-major order is painted on top).
 * Double-sided cards follow physical-card.ts (Task 5.5): body-frame layers, view mirror/rotation, per-card back
 * registration and cut-outline offset; the rasterizer below re-implements `observeFace` for a whole board and is
 * tested to be pixel-identical to it.
 */
import { decodeGroup, type GroupDecodeResult } from '../decode-group';
import { ALL_CARDS, placedFragments, type Corner, type Orientation } from '../fragments';
import { mulberry32 } from '../prng';
import { FOOTPRINT_MOD, renderMarker, type GrayImage } from '../render';
import { streamSeed, type CellParams, type Face, type TrialRecord } from './geometry-design';
import { FACING, RANKS, SLOT_NAMES, referenceSum, slotChoices, type SlotName } from './group-compose';
import {
  CORE_MOD,
  DEFAULT_PX_PER_MM,
  DEFAULT_SUPERSAMPLE,
  duplexContainment,
  markerSlotsMm,
  physicalGeometry,
  printLayers,
  type CardError,
  type MarkerPatterns,
  type PhysicalGeometry,
  type RectMm,
} from './physical-card';
import { compose, rotationMatrix, tiltMatrix, warpImage } from './warp';

export const TABLE_MARGIN_MM = 5;
/** Camera distance of the perspective factor, in image diagonals (phone about one board diagonal above the cards). */
export const CAMERA_DISTANCE_DIAGONALS = 1.0;
export const CAMERA_WARP_SUPERSAMPLE = 2;

const CHOICES = slotChoices();
const SLOT_ROW_COL: Record<SlotName, [number, number]> = { TL: [0, 0], TR: [0, 1], BL: [1, 0], BR: [1, 1] };
const CORNER_VERTEX_OFFSET: Record<Corner, [number, number]> = { TL: [0, 0], TR: [0, 1], BL: [1, 0], BR: [1, 1] };
const STREAM = { cards: 1, placement: 2, duplex: 3, camera: 4 } as const;

export function geometryOf(p: CellParams): PhysicalGeometry {
  return physicalGeometry({
    cornerRadiusMm: p.radiusMm,
    insetModules: p.insetModules,
    tableGray: p.tableGray,
    gapMm: p.gapMm,
  });
}

// ---------------------------------------------------------------------------------------------
// Scenario (truth)
// ---------------------------------------------------------------------------------------------

export interface PlacedCard {
  card: string;
  /** Orientation (0 or 180) of the card in the OBSERVED layout, i.e. what the reader sees. */
  observed: Orientation;
  face: Face;
  /** Back-print registration (body frame as seen from the front). Unused for FRONT. */
  reg: { dxMm: number; dyMm: number; rotDeg: number };
  /** Cut-outline displacement relative to the front print. */
  cut: { dxMm: number; dyMm: number };
}

export interface Scenario {
  rows: number;
  cols: number;
  cells: Array<Array<PlacedCard | null>>;
  /** Vertex lattice point (a, b): the vertex between rows a-1, a and columns b-1, b. */
  focus: { a: number; b: number };
  /** Cards of the focus group (sorted, empty when one is absent). */
  truthCards: string[];
  truthSum: number | null;
  errors: CardError[][];
  camera: { rotationDeg: number; tiltDeg: number; axisDeg: number; lightingDirDeg: number };
  /** Rejection-sampling attempts used for the distractor cards of a 3x3 board. */
  attempts: number;
}

/** Four distinct cards, one per slot, each with a facing fragment (same generator as the group-decoder property tests). */
function drawFocusGroup(rng: () => number): Array<{ slot: SlotName; card: string; observed: Orientation }> {
  for (;;) {
    const picked = SLOT_NAMES.map((slot) => {
      const pool = CHOICES[slot];
      const pick = pool[Math.floor(rng() * pool.length)] as { card: string; orientation: Orientation };
      const rank = RANKS[Math.floor(rng() * 13)] as string;
      return { slot, card: `${pick.card.charAt(0)}-${rank}`, observed: pick.orientation };
    });
    if (new Set(picked.map((p) => p.card)).size === 4) return picked;
  }
}

/** Markers per vertex lattice point (a, b) of a board whose cards are `cells` (null = absent). */
export function markersPerVertex(cells: ReadonlyArray<ReadonlyArray<{ card: string; observed: Orientation } | null>>): Map<string, number> {
  const out = new Map<string, number>();
  cells.forEach((row, i) =>
    row.forEach((c, j) => {
      if (c === null) return;
      const frag = placedFragments(c.card, c.observed);
      for (const corner of ['TL', 'TR', 'BL', 'BR'] as const) {
        if (frag[corner] === undefined) continue;
        const [di, dj] = CORNER_VERTEX_OFFSET[corner];
        const key = `${i + di},${j + dj}`;
        out.set(key, (out.get(key) ?? 0) + 1);
      }
    }),
  );
  return out;
}

export function buildScenario(p: CellParams, seed: number): Scenario {
  const n = p.layout === '3x3' ? 3 : 2;
  const rng = mulberry32(streamSeed(seed, STREAM.cards));
  const focusCards = drawFocusGroup(rng);
  const focus = n === 3 ? { a: 1 + Math.floor(rng() * 2), b: 1 + Math.floor(rng() * 2) } : { a: 1, b: 1 };
  const absentIndex = Math.floor(rng() * 4);
  const absentSlot = SLOT_NAMES[absentIndex] as SlotName;

  const makeCard = (card: string, observed: Orientation): PlacedCard => ({
    card,
    observed,
    face: p.face,
    reg: { dxMm: 0, dyMm: 0, rotDeg: 0 },
    cut: { dxMm: 0, dyMm: 0 },
  });

  const grid: Array<Array<PlacedCard | null>> = Array.from({ length: n }, () => Array<PlacedCard | null>(n).fill(null));
  const isFocusPos = (i: number, j: number): boolean => i >= focus.a - 1 && i <= focus.a && j >= focus.b - 1 && j <= focus.b;
  for (const f of focusCards) {
    const [di, dj] = SLOT_ROW_COL[f.slot];
    (grid[focus.a - 1 + di] as Array<PlacedCard | null>)[focus.b - 1 + dj] = makeCard(f.card, f.observed);
  }

  let attempts = 0;
  if (n === 3) {
    const used = new Set(focusCards.map((f) => f.card));
    for (;;) {
      attempts++;
      if (attempts > 100000) throw new Error('no distractor layout without a second complete vertex found');
      const pool = ALL_CARDS.filter((c) => !used.has(c));
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (isFocusPos(i, j)) continue;
          const k = Math.floor(rng() * pool.length);
          const card = pool.splice(k, 1)[0] as string;
          (grid[i] as Array<PlacedCard | null>)[j] = makeCard(card, rng() < 0.5 ? 0 : 180);
        }
      }
      // Ground-truth uniqueness: no other interior vertex may have four markers (a second complete group).
      const counts = markersPerVertex(grid);
      let ok = true;
      for (let a = 1; a <= n - 1 && ok; a++) {
        for (let b = 1; b <= n - 1; b++) {
          if (a === focus.a && b === focus.b) continue;
          if ((counts.get(`${a},${b}`) ?? 0) >= 4) {
            ok = false;
            break;
          }
        }
      }
      if (ok) break;
    }
  }

  let truthCards = focusCards.map((f) => f.card).sort();
  if (p.absentCard) {
    const [di, dj] = SLOT_ROW_COL[absentSlot];
    (grid[focus.a - 1 + di] as Array<PlacedCard | null>)[focus.b - 1 + dj] = null;
    truthCards = [];
  }

  // Placement errors (stream "placement": a fixed number of draws, independent of the levels).
  const prng = mulberry32(streamSeed(seed, STREAM.placement));
  const rowShift = Array.from({ length: n }, () => (2 * prng() - 1) * (p.shiftMm / 2));
  const colShift = Array.from({ length: n }, () => (2 * prng() - 1) * (p.shiftMm / 2));
  const errors: CardError[][] = [];
  for (let i = 0; i < n; i++) {
    const row: CardError[] = [];
    for (let j = 0; j < n; j++) {
      row.push({ dxMm: rowShift[i] as number, dyMm: colShift[j] as number, rotationDeg: (2 * prng() - 1) * p.rotationDeg });
    }
    errors.push(row);
  }

  // Duplex errors (stream "duplex": three draws per card, row-major). Magnitudes are the level, directions random.
  const drng = mulberry32(streamSeed(seed, STREAM.duplex));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const th = drng() * 2 * Math.PI;
      const sign = drng() < 0.5 ? -1 : 1;
      const ph = drng() * 2 * Math.PI;
      const c = (grid[i] as Array<PlacedCard | null>)[j];
      if (c === null || c === undefined) continue;
      c.reg = { dxMm: p.regShiftMm * Math.cos(th), dyMm: p.regShiftMm * Math.sin(th), rotDeg: sign * p.regRotDeg };
      c.cut = { dxMm: p.cutOffsetMm * Math.cos(ph), dyMm: p.cutOffsetMm * Math.sin(ph) };
    }
  }

  const crng = mulberry32(streamSeed(seed, STREAM.camera));
  const randRot = crng() * 360;
  const axisDeg = crng() * 360;
  const lightingDirDeg = crng() * 360;
  const rotationDeg = p.cameraRotation === 'NONE' ? 0 : p.cameraRotation === 'DEG45' ? 45 : randRot;

  return {
    rows: n,
    cols: n,
    cells: grid,
    focus,
    truthCards,
    truthSum: p.absentCard ? null : referenceSum(truthCards),
    errors,
    camera: { rotationDeg, tiltDeg: p.tiltDeg, axisDeg, lightingDirDeg },
    attempts,
  };
}

// ---------------------------------------------------------------------------------------------
// Board rasterizer (whole-board version of observeFace)
// ---------------------------------------------------------------------------------------------

interface ViewSpec {
  mirrorX: boolean;
  mirrorY: boolean;
  rot180: boolean;
}

interface Slot {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  grid: Uint8Array;
}

interface RasterCard {
  ox: number;
  oy: number;
  rotated: boolean;
  cos: number;
  sin: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  view: ViewSpec;
  slots: Slot[];
  poseTx: number;
  poseTy: number;
  poseRotated: boolean;
  poseCos: number;
  poseSin: number;
}

const gridCache = new Map<number, Uint8Array>();
function markerGrid(pattern: number): Uint8Array {
  let g = gridCache.get(pattern);
  if (g === undefined) {
    g = renderMarker(pattern, 1).data;
    gridCache.set(pattern, g);
  }
  return g;
}

function slotsFor(g: PhysicalGeometry, patterns: MarkerPatterns): Slot[] {
  const mm = markerSlotsMm(g);
  const out: Slot[] = [];
  for (const corner of ['TL', 'TR', 'BL', 'BR'] as const) {
    const pat = patterns[corner];
    if (pat === undefined) continue;
    const c = mm[corner].core;
    out.push({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, grid: markerGrid(pat) });
  }
  return out;
}

function viewFor(face: Face, observed: Orientation): ViewSpec {
  if (face === 'FRONT') return { mirrorX: false, mirrorY: false, rot180: observed === 180 };
  // A vertical-axis flip shows the front appearance; a horizontal-axis flip shows it rotated by 180 degrees, so the
  // in-plane placement before the flip is the opposite orientation (design.md section 7).
  if (face === 'BACK_VERTICAL') return { mirrorX: true, mirrorY: false, rot180: observed === 180 };
  return { mirrorX: false, mirrorY: true, rot180: observed === 0 };
}

function makeRasterCard(g: PhysicalGeometry, c: PlacedCard, ox: number, oy: number, rotDeg: number): RasterCard {
  const layers = printLayers(c.card);
  const layer = c.face === 'FRONT' ? layers.front : layers.back;
  const t = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const hw = g.cardWidthMm / 2;
  const hh = g.cardHeightMm / 2;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const X = ox + hw + sx * hw * cos - sy * hh * sin;
    const Y = oy + hh + sx * hw * sin + sy * hh * cos;
    minX = Math.min(minX, X);
    maxX = Math.max(maxX, X);
    minY = Math.min(minY, Y);
    maxY = Math.max(maxY, Y);
  }
  const front = c.face === 'FRONT';
  const poseTx = front ? -c.cut.dxMm : -c.cut.dxMm + c.reg.dxMm;
  const poseTy = front ? -c.cut.dyMm : -c.cut.dyMm + c.reg.dyMm;
  const poseRot = front ? 0 : c.reg.rotDeg;
  const pt = (poseRot * Math.PI) / 180;
  return {
    ox,
    oy,
    rotated: rotDeg !== 0,
    cos,
    sin,
    minX,
    maxX,
    minY,
    maxY,
    view: viewFor(c.face, c.observed),
    slots: slotsFor(g, layer.patterns),
    poseTx,
    poseTy,
    poseRotated: poseRot !== 0,
    poseCos: Math.cos(pt),
    poseSin: Math.sin(pt),
  };
}

function insideRoundedRect(lx: number, ly: number, w: number, h: number, r: number): boolean {
  if (lx < 0 || lx >= w || ly < 0 || ly >= h) return false;
  if (r === 0) return true;
  const dx = lx < r ? r - lx : lx > w - r ? lx - (w - r) : 0;
  const dy = ly < r ? r - ly : ly > h - r ? ly - (h - r) : 0;
  return dx * dx + dy * dy <= r * r;
}

function printedValue(slots: Slot[], lx: number, ly: number, moduleMm: number): number {
  for (const s of slots) {
    if (lx >= s.x0 && lx < s.x1 && ly >= s.y0 && ly < s.y1) {
      const u = Math.min(CORE_MOD - 1, Math.floor((lx - s.x0) / moduleMm));
      const v = Math.min(CORE_MOD - 1, Math.floor((ly - s.y0) / moduleMm));
      return s.grid[(v + 1) * FOOTPRINT_MOD + (u + 1)] as number;
    }
  }
  return 255;
}

export interface BoardRaster {
  image: GrayImage;
  regionMm: RectMm;
  pxPerMm: number;
}

export interface RasterOptions {
  pxPerMm?: number;
  supersample?: number;
  regionMm?: RectMm;
}

/**
 * Rasterizes the board of `sc` on the table. Cards are painted in row-major order (later on top). The sample
 * positions and the arithmetic follow `rasterizeView` of physical-card.ts, so a 1x1 board over the card rectangle
 * reproduces `observeFace(...).image` exactly.
 */
export function renderScenario(sc: Scenario, g: PhysicalGeometry, options: RasterOptions = {}): BoardRaster {
  const pxPerMm = options.pxPerMm ?? DEFAULT_PX_PER_MM;
  const ss = options.supersample ?? DEFAULT_SUPERSAMPLE;
  const W = g.cardWidthMm;
  const H = g.cardHeightMm;
  const boardW = sc.cols * W + (sc.cols - 1) * g.gapMm;
  const boardH = sc.rows * H + (sc.rows - 1) * g.gapMm;
  const region = options.regionMm ?? { x0: -TABLE_MARGIN_MM, y0: -TABLE_MARGIN_MM, x1: boardW + TABLE_MARGIN_MM, y1: boardH + TABLE_MARGIN_MM };
  const cards: RasterCard[] = [];
  for (let i = 0; i < sc.rows; i++) {
    for (let j = 0; j < sc.cols; j++) {
      const c = (sc.cells[i] as Array<PlacedCard | null>)[j];
      if (c === null || c === undefined) continue;
      const e = (sc.errors[i] as CardError[])[j] as CardError;
      cards.push(makeRasterCard(g, c, j * (W + g.gapMm) + e.dxMm, i * (H + g.gapMm) + e.dyMm, e.rotationDeg));
    }
  }
  const w = Math.ceil((region.x1 - region.x0) * pxPerMm - 1e-9);
  const h = Math.ceil((region.y1 - region.y0) * pxPerMm - 1e-9);
  const data = new Uint8Array(w * h);
  const n = ss * ss;
  const hw = W / 2;
  const hh = H / 2;
  const r = g.cornerRadiusMm;
  const mm = g.moduleMm;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      let acc = 0;
      for (let sy = 0; sy < ss; sy++) {
        const Y = region.y0 + (py + (sy + 0.5) / ss) / pxPerMm;
        for (let sx = 0; sx < ss; sx++) {
          const X = region.x0 + (px + (sx + 0.5) / ss) / pxPerMm;
          let value = g.tableGray;
          for (let ci = cards.length - 1; ci >= 0; ci--) {
            const c = cards[ci] as RasterCard;
            if (X < c.minX || X > c.maxX || Y < c.minY || Y > c.maxY) continue;
            let lx: number;
            let ly: number;
            if (!c.rotated) {
              lx = X - c.ox;
              ly = Y - c.oy;
            } else {
              const dx = X - (c.ox + hw);
              const dy = Y - (c.oy + hh);
              lx = hw + dx * c.cos + dy * c.sin;
              ly = hh - dx * c.sin + dy * c.cos;
            }
            if (!insideRoundedRect(lx, ly, W, H, r)) continue;
            // view frame -> body frame -> print frame
            let bx = lx - hw;
            let by = ly - hh;
            if (c.view.mirrorX) bx = -bx;
            if (c.view.mirrorY) by = -by;
            if (c.view.rot180) {
              bx = -bx;
              by = -by;
            }
            const dx = bx - c.poseTx;
            const dy = by - c.poseTy;
            const plx = c.poseRotated ? hw + dx * c.poseCos + dy * c.poseSin : hw + dx;
            const ply = c.poseRotated ? hh - dx * c.poseSin + dy * c.poseCos : hh + dy;
            value = printedValue(c.slots, plx, ply, mm);
            break;
          }
          acc += value;
        }
      }
      data[py * w + px] = Math.round(acc / n);
    }
  }
  return { image: { width: w, height: h, data }, regionMm: region, pxPerMm };
}

// ---------------------------------------------------------------------------------------------
// Camera degradation
// ---------------------------------------------------------------------------------------------

function gaussianKernel(sigma: number): Float64Array {
  const radius = Math.max(1, Math.ceil(3 * sigma));
  const k = new Float64Array(2 * radius + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] = (k[i] as number) / sum;
  return k;
}

/** Separable Gaussian blur with clamped edges. sigma 0 returns the input unchanged. */
export function gaussianBlur(img: GrayImage, sigma: number): GrayImage {
  if (!(sigma > 0)) return img;
  const k = gaussianKernel(sigma);
  const radius = (k.length - 1) / 2;
  const { width: w, height: h } = img;
  const tmp = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -radius; i <= radius; i++) {
        const xx = x + i < 0 ? 0 : x + i >= w ? w - 1 : x + i;
        s += (img.data[y * w + xx] as number) * (k[i + radius] as number);
      }
      tmp[y * w + x] = s;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -radius; i <= radius; i++) {
        const yy = y + i < 0 ? 0 : y + i >= h ? h - 1 : y + i;
        s += (tmp[yy * w + x] as number) * (k[i + radius] as number);
      }
      out[y * w + x] = Math.round(s);
    }
  }
  return { width: w, height: h, data: out };
}

/** Multiplicative linear illumination ramp: gain 1 on one side of the image falling to 1 - strength on the other. */
export function applyLightingGradient(img: GrayImage, strength: number, dirDeg: number): GrayImage {
  if (!(strength > 0)) return img;
  const { width: w, height: h } = img;
  const a = (dirDeg * Math.PI) / 180;
  const cx = Math.cos(a);
  const cy = Math.sin(a);
  const half = (Math.abs(cx) * w) / 2 + (Math.abs(cy) * h) / 2;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = 0.5 + ((x + 0.5 - w / 2) * cx + (y + 0.5 - h / 2) * cy) / (2 * half);
      const gain = 1 - strength * t;
      const v = Math.round((img.data[y * w + x] as number) * gain);
      out[y * w + x] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  return { width: w, height: h, data: out };
}

export interface DegradeTimings {
  warpMs: number;
  blurMs: number;
  lightMs: number;
}

/** Camera effects in the order: in-plane rotation and perspective (one warp), blur, lighting. Zero strength = unchanged. */
export function degradeImage(img: GrayImage, p: CellParams, camera: Scenario['camera'], tableGray: number, timings?: DegradeTimings): GrayImage {
  let out = img;
  const clock = (): number => performance.now();
  let t0 = clock();
  if (camera.rotationDeg !== 0 || camera.tiltDeg !== 0) {
    const cx = img.width / 2;
    const cy = img.height / 2;
    const diag = Math.hypot(img.width, img.height);
    const H = compose(
      tiltMatrix({ cx, cy, tiltDeg: camera.tiltDeg, axisDeg: camera.axisDeg, distancePx: CAMERA_DISTANCE_DIAGONALS * diag }),
      rotationMatrix(camera.rotationDeg, cx, cy),
    );
    out = warpImage(out, H, img.width, img.height, { background: tableGray, supersample: CAMERA_WARP_SUPERSAMPLE });
  }
  let t1 = clock();
  if (timings) timings.warpMs = t1 - t0;
  t0 = t1;
  out = gaussianBlur(out, p.blurPx);
  t1 = clock();
  if (timings) timings.blurMs = t1 - t0;
  t0 = t1;
  out = applyLightingGradient(out, p.lightingStrength, camera.lightingDirDeg);
  if (timings) timings.lightMs = clock() - t0;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Decoding and scoring
// ---------------------------------------------------------------------------------------------

/** Marker-centre offset from the vertex in modules for a layout: inset + quiet margin + half of the 7x7 core. */
export function markerCenterOffsetModules(g: PhysicalGeometry): number {
  return g.insetModules + g.quietMarginModules + CORE_MOD / 2;
}

export function decodeScenarioImage(image: GrayImage, p: CellParams, g: PhysicalGeometry): GroupDecodeResult {
  // Only the image and the layout offset of the marker footprints are given to the reader (never an identity).
  return p.decoderLayout === 'MATCHED' ? decodeGroup(image, { centerOffsetModules: markerCenterOffsetModules(g) }) : decodeGroup(image);
}

/** True when any focus card's four corner footprints may be cut by its outline (conservative duplexContainment bound). */
export function focusFootprintsClipped(sc: Scenario, g: PhysicalGeometry): boolean {
  for (let di = 0; di < 2; di++) {
    for (let dj = 0; dj < 2; dj++) {
      const c = (sc.cells[sc.focus.a - 1 + di] as Array<PlacedCard | null>)[sc.focus.b - 1 + dj];
      if (c === null || c === undefined) continue;
      const d = duplexContainment(g, { duplexRegistration: c.reg, cutOffsetMm: c.cut });
      const face = c.face === 'FRONT' ? d.front : d.back;
      if (!face.actualValid) return true;
    }
  }
  return false;
}

export function classify(res: GroupDecodeResult, sc: Scenario, p: CellParams, clipped: boolean): Omit<TrialRecord, 'seed'> {
  const tag = clipped ? '|containment-not-guaranteed' : '';
  if (res.kind === 'IDENTIFIED') {
    if (p.absentCard) {
      return { cls: 'FALSE_ACCEPT', kind: 'IDENTIFIED', cause: `FALSE_ACCEPT/IDENTIFIED_INCOMPLETE_GROUP${tag}` };
    }
    const cards = [...res.cards].sort();
    const sameCards = cards.length === sc.truthCards.length && cards.every((c, i) => c === sc.truthCards[i]);
    if (sameCards && res.hiddenSum === sc.truthSum) return { cls: 'CORRECT', kind: 'IDENTIFIED', cause: '' };
    return { cls: 'FALSE_ACCEPT', kind: 'IDENTIFIED', cause: `FALSE_ACCEPT/${sameCards ? 'WRONG_SUM' : 'WRONG_CARD_SET'}${tag}` };
  }
  const kind = res.kind === 'INVALID_ARRANGEMENT' ? `INVALID_ARRANGEMENT/${res.reason}` : res.kind;
  return { cls: 'REJECTED', kind, cause: `${kind}${tag}` };
}

export interface TrialTimings extends DegradeTimings {
  buildMs: number;
  renderMs: number;
  decodeMs: number;
  totalMs: number;
}

export interface TrialOutput {
  record: TrialRecord;
  timings?: TrialTimings;
  /** Image given to the decoder (only kept when `keepImage` is requested). */
  image?: GrayImage;
  scenario?: Scenario;
}

/** One complete trial. Pure function of (params, seed). */
export function runTrial(p: CellParams, seed: number, opts: { timings?: boolean; keepImage?: boolean } = {}): TrialOutput {
  const clock = (): number => performance.now();
  const T0 = clock();
  const g = geometryOf(p);
  const sc = buildScenario(p, seed);
  const T1 = clock();
  const raster = renderScenario(sc, g);
  const T2 = clock();
  const dt: DegradeTimings = { warpMs: 0, blurMs: 0, lightMs: 0 };
  const image = degradeImage(raster.image, p, sc.camera, g.tableGray, dt);
  const T3 = clock();
  const res = decodeScenarioImage(image, p, g);
  const T4 = clock();
  const scored = classify(res, sc, p, clipAnnotation(sc, g, res, p));
  const out: TrialOutput = { record: { seed, ...scored } };
  if (opts.timings) {
    out.timings = { buildMs: T1 - T0, renderMs: T2 - T1, ...dt, decodeMs: T4 - T3, totalMs: clock() - T0 };
  }
  if (opts.keepImage) {
    out.image = image;
    out.scenario = sc;
  }
  return out;
}

/** The containment annotation is only computed for trials that are not correct. */
function clipAnnotation(sc: Scenario, g: PhysicalGeometry, res: GroupDecodeResult, p: CellParams): boolean {
  if (res.kind === 'IDENTIFIED' && !p.absentCard) {
    const cards = [...res.cards].sort();
    if (cards.length === sc.truthCards.length && cards.every((c, i) => c === sc.truthCards[i]) && res.hiddenSum === sc.truthSum) return false;
  }
  return focusFootprintsClipped(sc, g);
}
