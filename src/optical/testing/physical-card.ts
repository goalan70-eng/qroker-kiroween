/**
 * TEST SUPPORT ONLY - synthetic physical-card composer (Requirement 15, design.md "Physical Card
 * Geometry"). NOT production camera recognition and NOT evidence about real prints or real cameras.
 *
 * What it models: a flat white card with genuinely rounded corners, one or two corner markers taken from
 * render.ts / fragments.ts, cards placed edge to edge on a uniform table gray, small per-card placement
 * errors. What it does not model: gloss, shadows, warp, paper show-through, any real printer or camera.
 * The last section (Task 5.5) adds a SYNTHETIC double-sided model: print layers in the Body_Frame, the
 * view from above after a physical flip, front-to-back print registration and a cut-outline offset.
 *
 * Conventions (same as detect.ts / warp.ts):
 *  - Physical units are millimetres. x points right, y points down. Card-local origin = top-left corner of
 *    the card's bounding rectangle. Board origin = top-left corner of the nominal card (row 0, col 0).
 *  - Raster: pixel (i, j) covers [i, i+1) x [j, j+1) in pixel units and its CENTRE is (i+.5, j+.5). The
 *    raster origin is the region's top-left corner, so pixel i covers x = x0 + [i, i+1) / pxPerMm.
 *    Every pixel is the mean of supersample x supersample sub-samples at sub-pixel centres, so card
 *    boundaries and the rounded corners are antialiased (coverage = fraction of sub-samples inside).
 *  - Rotation angles are clockwise as displayed (y down), about the card centre.
 *  - Output is deterministic: no randomness except the explicitly seeded placement errors.
 *
 * The expected card identity never enters a decoder: the images carry only pixels; the ground truth is
 * returned separately in BoardRender.cards for the test to compare against afterwards.
 */
import { ALL_CARDS, placedFragments, printedFragments, type Corner, type Orientation } from '../fragments';
import { FOOTPRINT_MOD, renderMarker, type GrayImage } from '../render';
import { mulberry32 } from '../prng';
import { applyTransform } from '../transforms';

// ---------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------

export interface PhysicalGeometry {
  cardWidthMm: number;
  cardHeightMm: number;
  cornerRadiusMm: number;
  /** Size of one marker module. Baseline 1.5875 mm (63.5 mm / 40 modules). */
  moduleMm: number;
  /** Distance, in modules, from the card edge to the OUTER edge of the white quiet margin. */
  insetModules: number;
  /** Width of the white quiet margin around the 7 x 7 black-bordered square, in modules. */
  quietMarginModules: number;
  /** Intended gap between neighbouring cards in a board. 0 = no gap (the baseline, Requirement 15.2). */
  gapMm: number;
  /** Table / background gray level 0..255 (visible outside the card mask and in the central void). */
  tableGray: number;
}

export const BASELINE_GEOMETRY: Readonly<PhysicalGeometry> = Object.freeze({
  cardWidthMm: 63.5,
  cardHeightMm: 88.9,
  cornerRadiusMm: 3.175,
  moduleMm: 1.5875,
  insetModules: 1,
  quietMarginModules: 1,
  gapMm: 0,
  tableGray: 64,
});

/** Size of the black-bordered marker square (border + 5 x 5 data) in modules. */
export const CORE_MOD = FOOTPRINT_MOD - 2;

/** Merges overrides into the baseline and validates. Throws RangeError for malformed parameters. */
export function physicalGeometry(overrides: Partial<PhysicalGeometry> = {}): PhysicalGeometry {
  const g: PhysicalGeometry = { ...BASELINE_GEOMETRY, ...overrides };
  const finite = (n: number, name: string): void => {
    if (typeof n !== 'number' || !Number.isFinite(n)) throw new RangeError(`${name} must be a finite number`);
  };
  for (const k of Object.keys(BASELINE_GEOMETRY) as Array<keyof PhysicalGeometry>) finite(g[k], k);
  if (g.cardWidthMm <= 0 || g.cardHeightMm <= 0) throw new RangeError('card size must be positive');
  if (g.moduleMm <= 0) throw new RangeError('moduleMm must be positive');
  if (g.cornerRadiusMm < 0) throw new RangeError('cornerRadiusMm must be >= 0');
  if (g.cornerRadiusMm > Math.min(g.cardWidthMm, g.cardHeightMm) / 2) {
    throw new RangeError('cornerRadiusMm must not exceed half of the shorter card side');
  }
  if (g.insetModules < 0 || g.quietMarginModules < 0) throw new RangeError('inset and margin must be >= 0');
  if (g.gapMm < 0) throw new RangeError('gapMm must be >= 0 (overlap is not a geometry parameter)');
  if (g.tableGray < 0 || g.tableGray > 255) throw new RangeError('tableGray must be within 0..255');
  return g;
}

export interface RectMm {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface MarkerSlotMm {
  /** Black-bordered 7 x 7 module square. */
  core: RectMm;
  /** Core plus white quiet margin on every side (its outer corner is `inset` from the card edges). */
  footprint: RectMm;
}

/** Card-local position of the marker slot at each corner. */
export function markerSlotsMm(geometry: Partial<PhysicalGeometry> = {}): Record<Corner, MarkerSlotMm> {
  const g = physicalGeometry(geometry);
  const m = g.moduleMm;
  const a = (g.insetModules + g.quietMarginModules) * m;
  const core = CORE_MOD * m;
  const q = g.quietMarginModules * m;
  const mk = (cx0: number, cy0: number): MarkerSlotMm => ({
    core: { x0: cx0, y0: cy0, x1: cx0 + core, y1: cy0 + core },
    footprint: { x0: cx0 - q, y0: cy0 - q, x1: cx0 + core + q, y1: cy0 + core + q },
  });
  const right = g.cardWidthMm - a - core;
  const bottom = g.cardHeightMm - a - core;
  return { TL: mk(a, a), TR: mk(right, a), BL: mk(a, bottom), BR: mk(right, bottom) };
}

// ---------------------------------------------------------------------------------------------
// Analytic containment (design.md section 2)
// ---------------------------------------------------------------------------------------------

export interface ContainmentReport {
  /** true only when every clearance is strictly positive and the footprints fit in the card (Req. 15.3). */
  valid: boolean;
  /** Human-readable cause when valid is false. */
  reason?: string;
  /** Offset a (mm, along both axes) of the outer corner of the white quiet margin from the card corner. */
  marginCornerOffsetMm: number;
  /** Offset a (mm) of the corner of the black border. */
  borderCornerOffsetMm: number;
  /** Distance from the margin's outer corner to the card boundary; negative = outside the card. */
  marginCornerClearanceMm: number;
  /** Same for the corner of the black border. */
  borderCornerClearanceMm: number;
  /** min of the two clearances (the binding one). */
  clearanceMm: number;
  /** Largest corner radius for which the whole margin still fits: a * sqrt2 / (sqrt2 - 1). */
  maxRadiusForMarginMm: number;
  /** The two footprints on each side of the card do not overlap each other. */
  footprintFitsCard: boolean;
  /** Central_Void area 4 (1 - pi/4) r^2 left by four rounded inner corners at a zero-gap vertex. */
  centralVoidAreaMm2: number;
  /**
   * Distance between a Central_Void horn tip (at distance r along a seam from the vertex) and the corner of
   * the black border. This is the quantity tabulated in design.md; it equals the true minimum distance from
   * the void to the black border only when the border corner offset a_border >= r.
   * null when cornerRadiusMm === 0: the corner is square, there is no Central_Void and no distance is defined.
   */
  voidTipToBorderCornerMm: number | null;
  /**
   * True minimum distance from the Central_Void to the corner of the black border (Requirement 15.4):
   * the horn-tip distance when 0 < r <= a_border, otherwise the distance to the arc, r - sqrt2 (r - a_border).
   * null when cornerRadiusMm === 0: there is no Central_Void, so no void distance is defined.
   */
  voidToBorderCornerMm: number | null;
}

/**
 * Signed clearance (mm) of the point (a, a) measured from the corner of the card: the distance to the card
 * boundary. For r > a this is c = r - sqrt2 (r - a), the radial distance to the arc; for r <= a the point
 * is in the straight-edge zone and the nearest boundary is the straight edge at distance a.
 */
function diagonalClearance(a: number, r: number): number {
  return r > a ? r - Math.SQRT2 * (r - a) : a;
}

/** Implements the analytic formulas of design.md "Physical Card Geometry" section 2. */
export function markerContainment(geometry: Partial<PhysicalGeometry> = {}): ContainmentReport {
  const g = physicalGeometry(geometry);
  const m = g.moduleMm;
  const r = g.cornerRadiusMm;
  const aMargin = g.insetModules * m;
  const aBorder = (g.insetModules + g.quietMarginModules) * m;
  const cMargin = diagonalClearance(aMargin, r);
  const cBorder = diagonalClearance(aBorder, r);
  const clearance = Math.min(cMargin, cBorder);
  const footprint = (CORE_MOD + 2 * g.quietMarginModules) * m;
  const fits = 2 * (aMargin + footprint) <= Math.min(g.cardWidthMm, g.cardHeightMm);
  const reasons: string[] = [];
  if (!(clearance > 0)) {
    reasons.push(
      `marker footprint (including quiet margin) reaches or crosses the card boundary: clearance ${clearance.toFixed(3)} mm <= 0` +
        ` (corner radius ${r} mm, inset ${g.insetModules} modules; largest radius that keeps the margin inside is ` +
        `${((aMargin * Math.SQRT2) / (Math.SQRT2 - 1)).toFixed(3)} mm)`,
    );
  }
  if (!fits) reasons.push('marker footprints of one card overlap each other or leave the card');
  const report: ContainmentReport = {
    valid: reasons.length === 0,
    marginCornerOffsetMm: aMargin,
    borderCornerOffsetMm: aBorder,
    marginCornerClearanceMm: cMargin,
    borderCornerClearanceMm: cBorder,
    clearanceMm: clearance,
    maxRadiusForMarginMm: (aMargin * Math.SQRT2) / (Math.SQRT2 - 1),
    footprintFitsCard: fits,
    centralVoidAreaMm2: 4 * (1 - Math.PI / 4) * r * r,
    voidTipToBorderCornerMm: r === 0 ? null : Math.hypot(aBorder - r, aBorder),
    voidToBorderCornerMm:
      r === 0 ? null : aBorder >= r ? Math.hypot(aBorder - r, aBorder) : r - Math.SQRT2 * (r - aBorder),
  };
  if (reasons.length > 0) report.reason = reasons.join('; ');
  return report;
}

// ---------------------------------------------------------------------------------------------
// Rasterization engine
// ---------------------------------------------------------------------------------------------

/** Default raster scale: 4 pixels per module, same as render.ts DEFAULT_MODULE_PX. */
export const DEFAULT_PX_PER_MM = 4 / BASELINE_GEOMETRY.moduleMm;
export const DEFAULT_SUPERSAMPLE = 4;

const markerGridCache = new Map<number, Uint8Array>();
/** 9 x 9 module grid of a marker (render.ts renderMarker at 1 pixel per module): 0 black, 255 white. */
function markerGrid(pattern: number): Uint8Array {
  let grid = markerGridCache.get(pattern);
  if (grid === undefined) {
    grid = renderMarker(pattern, 1).data;
    markerGridCache.set(pattern, grid);
  }
  return grid;
}

interface PrintedSlot {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  grid: Uint8Array;
}

interface RasterCard {
  /** Top-left of the (possibly shifted) unrotated card, board mm. */
  ox: number;
  oy: number;
  rotDeg: number;
  slots: PrintedSlot[];
  // derived
  cos: number;
  sin: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function makeRasterCard(
  g: PhysicalGeometry,
  ox: number,
  oy: number,
  rotDeg: number,
  patterns: Partial<Record<Corner, number>>,
  omitMarkers: boolean,
): RasterCard {
  const slotsMm = markerSlotsMm(g);
  const slots: PrintedSlot[] = [];
  if (!omitMarkers) {
    for (const corner of ['TL', 'TR', 'BL', 'BR'] as const) {
      const p = patterns[corner];
      if (p === undefined) continue;
      const c = slotsMm[corner].core;
      slots.push({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, grid: markerGrid(p) });
    }
  }
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
    const px = sx * hw;
    const py = sy * hh;
    const X = ox + hw + px * cos - py * sin;
    const Y = oy + hh + px * sin + py * cos;
    minX = Math.min(minX, X);
    maxX = Math.max(maxX, X);
    minY = Math.min(minY, Y);
    maxY = Math.max(maxY, Y);
  }
  return { ox, oy, rotDeg, slots, cos, sin, minX, maxX, minY, maxY };
}

/** Rounded rectangle test: inside iff within the rectangle and, in a corner zone, within r of the arc centre. */
function insideRoundedRect(lx: number, ly: number, w: number, h: number, r: number): boolean {
  if (lx < 0 || lx >= w || ly < 0 || ly >= h) return false;
  if (r === 0) return true;
  const dx = lx < r ? r - lx : lx > w - r ? lx - (w - r) : 0;
  const dy = ly < r ? r - ly : ly > h - r ? ly - (h - r) : 0;
  return dx * dx + dy * dy <= r * r;
}

/** 0 where a black module of a printed marker covers (lx, ly), else 255 (white paper). */
function printedValue(slots: PrintedSlot[], lx: number, ly: number, moduleMm: number): number {
  for (const s of slots) {
    if (lx >= s.x0 && lx < s.x1 && ly >= s.y0 && ly < s.y1) {
      const u = Math.min(CORE_MOD - 1, Math.floor((lx - s.x0) / moduleMm));
      const v = Math.min(CORE_MOD - 1, Math.floor((ly - s.y0) / moduleMm));
      return s.grid[(v + 1) * FOOTPRINT_MOD + (u + 1)] as number;
    }
  }
  return 255;
}

interface RasterResult {
  image: GrayImage;
  coverage: Uint8Array;
  print: Uint8Array;
}

function checkRaster(pxPerMm: number, supersample: number): void {
  if (!(Number.isFinite(pxPerMm) && pxPerMm > 0)) throw new RangeError('pxPerMm must be a positive number');
  if (!Number.isInteger(supersample) || supersample < 1) throw new RangeError('supersample must be a positive integer');
}

function rasterize(
  cards: RasterCard[],
  g: PhysicalGeometry,
  region: RectMm,
  pxPerMm: number,
  ss: number,
): RasterResult {
  if (!(region.x1 > region.x0 && region.y1 > region.y0)) throw new RangeError('region must have positive area');
  const w = Math.ceil((region.x1 - region.x0) * pxPerMm - 1e-9);
  const h = Math.ceil((region.y1 - region.y0) * pxPerMm - 1e-9);
  const image: GrayImage = { width: w, height: h, data: new Uint8Array(w * h) };
  const coverage = new Uint8Array(w * h);
  const print = new Uint8Array(w * h);
  const n = ss * ss;
  const W = g.cardWidthMm;
  const H = g.cardHeightMm;
  const r = g.cornerRadiusMm;
  const hw = W / 2;
  const hh = H / 2;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      let acc = 0;
      let cov = 0;
      let prn = 0;
      for (let sy = 0; sy < ss; sy++) {
        const Y = region.y0 + (py + (sy + 0.5) / ss) / pxPerMm;
        for (let sx = 0; sx < ss; sx++) {
          const X = region.x0 + (px + (sx + 0.5) / ss) / pxPerMm;
          let value = g.tableGray;
          let printed = 255;
          let inside = false;
          for (let ci = cards.length - 1; ci >= 0; ci--) {
            const c = cards[ci] as RasterCard;
            if (X < c.minX || X > c.maxX || Y < c.minY || Y > c.maxY) continue;
            let lx: number;
            let ly: number;
            if (c.rotDeg === 0) {
              lx = X - c.ox;
              ly = Y - c.oy;
            } else {
              const dx = X - (c.ox + hw);
              const dy = Y - (c.oy + hh);
              lx = hw + dx * c.cos + dy * c.sin;
              ly = hh - dx * c.sin + dy * c.cos;
            }
            const pv = printedValue(c.slots, lx, ly, g.moduleMm);
            if (insideRoundedRect(lx, ly, W, H, r)) {
              value = pv;
              printed = pv;
              inside = true;
              break;
            }
            // Printed ink outside the cut outline is reported in `print` only (single-card use).
            if (pv < printed) printed = pv;
          }
          acc += value;
          prn += printed;
          if (inside) cov++;
        }
      }
      const i = py * w + px;
      image.data[i] = Math.round(acc / n);
      coverage[i] = Math.round((255 * cov) / n);
      print[i] = Math.round(prn / n);
    }
  }
  return { image, coverage, print };
}

// ---------------------------------------------------------------------------------------------
// Single card
// ---------------------------------------------------------------------------------------------

export interface CardPlacement {
  card: string;
  orientation: Orientation;
}

export interface RenderOptions {
  /** Raster scale in pixels per millimetre (default 4 pixels per module). */
  pxPerMm?: number;
  /** Sub-samples per pixel per axis (default 4). */
  supersample?: number;
  /** Card-local region to render, mm (default: the whole card bounding rectangle). */
  regionMm?: RectMm;
  /** Leave the card blank (used to measure the Central_Void without marker pixels). */
  omitMarkers?: boolean;
  /** Throw instead of returning a result when markerContainment(geometry).valid is false. */
  requireValid?: boolean;
}

export interface PhysicalCardRender {
  /** Card on the table background; ink outside the cut outline is NOT drawn (it is cut away). */
  image: GrayImage;
  /** Antialiased card-mask coverage 0..255 per pixel (255 = every sub-sample inside the rounded card). */
  coverage: Uint8Array;
  /** The printed layer on the unclipped rectangle (white paper, black ink); reveals ink outside the mask. */
  print: GrayImage;
  pxPerMm: number;
  regionMm: RectMm;
  geometry: PhysicalGeometry;
  /** Reported with every render so an invalid shape is never clipped silently. */
  containment: ContainmentReport;
}

export function renderPhysicalCard(
  card: string,
  orientation: Orientation,
  geometry: Partial<PhysicalGeometry> = {},
  options: RenderOptions = {},
): PhysicalCardRender {
  const g = physicalGeometry(geometry);
  const pxPerMm = options.pxPerMm ?? DEFAULT_PX_PER_MM;
  const ss = options.supersample ?? DEFAULT_SUPERSAMPLE;
  checkRaster(pxPerMm, ss);
  const containment = markerContainment(g);
  if (options.requireValid === true && !containment.valid) {
    throw new RangeError(`invalid physical geometry: ${containment.reason ?? ''}`);
  }
  const region = options.regionMm ?? { x0: 0, y0: 0, x1: g.cardWidthMm, y1: g.cardHeightMm };
  const rc = makeRasterCard(g, 0, 0, 0, placedFragments(card, orientation), options.omitMarkers === true);
  const out = rasterize([rc], g, region, pxPerMm, ss);
  return {
    image: out.image,
    coverage: out.coverage,
    print: { width: out.image.width, height: out.image.height, data: out.print },
    pxPerMm,
    regionMm: region,
    geometry: g,
    containment,
  };
}

// ---------------------------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------------------------

export interface CardError {
  /** Translation of the card from its nominal position, mm (board axes). */
  dxMm: number;
  dyMm: number;
  /** Rotation about the card centre, degrees clockwise. */
  rotationDeg: number;
}

export interface BoardErrorSpec {
  seed: number;
  /** Each card gets independent uniform dx, dy in [-maxShiftMm, +maxShiftMm]. */
  maxShiftMm: number;
  /** Each card gets an independent uniform rotation in [-maxRotationDeg, +maxRotationDeg]. */
  maxRotationDeg: number;
}

export interface ComposeBoardOptions extends Omit<RenderOptions, 'regionMm'> {
  /** Seeded random errors, or an explicit [row][col] table. Default: no error. */
  errors?: BoardErrorSpec | CardError[][];
  /** Table margin around the board extent when regionMm is not given (default 5 mm). */
  tableMarginMm?: number;
  /** Board-frame region to render (mm). Default: board extent plus the table margin. */
  regionMm?: RectMm;
}

export interface BoardCardInfo {
  row: number;
  col: number;
  card: string;
  orientation: Orientation;
  /** Nominal top-left corner of the card in board mm (before the error). */
  nominalOriginMm: { x: number; y: number };
  error: CardError;
  /** Centre of the card (rotation centre) after the translation error, board mm. */
  centerMm: { x: number; y: number };
}

export interface BoardRender {
  image: GrayImage;
  pxPerMm: number;
  regionMm: RectMm;
  geometry: PhysicalGeometry;
  /** Ground truth for tests. It is never given to a decoder. */
  cards: BoardCardInfo[];
  containment: ContainmentReport;
  /** Extent of the nominal board (no margin), mm. */
  boardSizeMm: { width: number; height: number };
}

const ZERO_ERROR: CardError = { dxMm: 0, dyMm: 0, rotationDeg: 0 };

/** Seeded per-card errors in row-major order; same seed and spec give the same table. */
export function seededErrors(rows: number, cols: number, spec: BoardErrorSpec): CardError[][] {
  const rng = mulberry32(spec.seed);
  const out: CardError[][] = [];
  for (let i = 0; i < rows; i++) {
    const row: CardError[] = [];
    for (let j = 0; j < cols; j++) {
      const dx = (2 * rng() - 1) * spec.maxShiftMm;
      const dy = (2 * rng() - 1) * spec.maxShiftMm;
      const rot = (2 * rng() - 1) * spec.maxRotationDeg;
      row.push({ dxMm: dx, dyMm: dy, rotationDeg: rot });
    }
    out.push(row);
  }
  return out;
}

/**
 * Seeded rows x cols grid of DISTINCT real cards with orientation 0 or 180. Used to build boards whose
 * neighbouring cards supply Distractor_Markers (the outward fragments and fragments around other vertices).
 */
export function seededPlacements(seed: number, rows: number, cols: number): CardPlacement[][] {
  const need = rows * cols;
  if (need > ALL_CARDS.length) throw new RangeError('not enough distinct cards');
  const rng = mulberry32(seed);
  const pool = [...ALL_CARDS];
  const out: CardPlacement[][] = [];
  for (let i = 0; i < rows; i++) {
    const row: CardPlacement[] = [];
    for (let j = 0; j < cols; j++) {
      const k = Math.floor(rng() * pool.length);
      const card = pool.splice(k, 1)[0] as string;
      row.push({ card, orientation: rng() < 0.5 ? 0 : 180 });
    }
    out.push(row);
  }
  return out;
}

/** Board-frame position of the interior vertex between cards (row,col) and (row+1,col+1). */
export function vertexMm(geometry: Partial<PhysicalGeometry>, row: number, col: number): { x: number; y: number } {
  const g = physicalGeometry(geometry);
  return {
    x: (col + 1) * g.cardWidthMm + col * g.gapMm + g.gapMm / 2,
    y: (row + 1) * g.cardHeightMm + row * g.gapMm + g.gapMm / 2,
  };
}

/** Maps a card-local point (mm) to the board frame, including that card's translation and rotation error. */
export function cardLocalToBoardMm(
  info: BoardCardInfo,
  geometry: Partial<PhysicalGeometry>,
  lx: number,
  ly: number,
): { x: number; y: number } {
  const g = physicalGeometry(geometry);
  const t = (info.error.rotationDeg * Math.PI) / 180;
  const dx = lx - g.cardWidthMm / 2;
  const dy = ly - g.cardHeightMm / 2;
  return {
    x: info.centerMm.x + dx * Math.cos(t) - dy * Math.sin(t),
    y: info.centerMm.y + dx * Math.sin(t) + dy * Math.cos(t),
  };
}

/** Continuous pixel coordinates of a board point in a render (pixel centres are at i + 0.5). */
export function boardMmToPixel(
  render: { regionMm: RectMm; pxPerMm: number },
  xMm: number,
  yMm: number,
): { x: number; y: number } {
  return { x: (xMm - render.regionMm.x0) * render.pxPerMm, y: (yMm - render.regionMm.y0) * render.pxPerMm };
}

/**
 * Lays the cards out edge to edge (pitch = card size + gapMm, default 0), applies the per-card errors and
 * rasterizes the board. Cards later in row-major order are painted on top where errors make them overlap.
 * Where errors open a wedge between cards, the table gray shows through.
 */
export function composeBoard(
  placements: readonly (readonly CardPlacement[])[],
  geometry: Partial<PhysicalGeometry> = {},
  options: ComposeBoardOptions = {},
): BoardRender {
  const g = physicalGeometry(geometry);
  const rows = placements.length;
  const cols = placements[0]?.length ?? 0;
  if (rows === 0 || cols === 0 || placements.some((r) => r.length !== cols)) {
    throw new RangeError('placements must be a non-empty rectangular grid');
  }
  const pxPerMm = options.pxPerMm ?? DEFAULT_PX_PER_MM;
  const ss = options.supersample ?? DEFAULT_SUPERSAMPLE;
  checkRaster(pxPerMm, ss);
  const containment = markerContainment(g);
  if (options.requireValid === true && !containment.valid) {
    throw new RangeError(`invalid physical geometry: ${containment.reason ?? ''}`);
  }
  let errors: CardError[][];
  if (options.errors === undefined) {
    errors = placements.map((r) => r.map(() => ZERO_ERROR));
  } else if (Array.isArray(options.errors)) {
    errors = options.errors;
    if (errors.length !== rows || errors.some((r) => r.length !== cols)) {
      throw new RangeError('explicit errors must match the placement grid');
    }
  } else {
    errors = seededErrors(rows, cols, options.errors);
  }
  const boardW = cols * g.cardWidthMm + (cols - 1) * g.gapMm;
  const boardH = rows * g.cardHeightMm + (rows - 1) * g.gapMm;
  const margin = options.tableMarginMm ?? 5;
  const region = options.regionMm ?? { x0: -margin, y0: -margin, x1: boardW + margin, y1: boardH + margin };
  const infos: BoardCardInfo[] = [];
  const rasterCards: RasterCard[] = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const p = (placements[i] as readonly CardPlacement[])[j] as CardPlacement;
      const e = (errors[i] as CardError[])[j] as CardError;
      const nx = j * (g.cardWidthMm + g.gapMm);
      const ny = i * (g.cardHeightMm + g.gapMm);
      infos.push({
        row: i,
        col: j,
        card: p.card,
        orientation: p.orientation,
        nominalOriginMm: { x: nx, y: ny },
        error: { ...e },
        centerMm: { x: nx + e.dxMm + g.cardWidthMm / 2, y: ny + e.dyMm + g.cardHeightMm / 2 },
      });
      rasterCards.push(
        makeRasterCard(g, nx + e.dxMm, ny + e.dyMm, e.rotationDeg, placedFragments(p.card, p.orientation), options.omitMarkers === true),
      );
    }
  }
  const out = rasterize(rasterCards, g, region, pxPerMm, ss);
  return {
    image: out.image,
    pxPerMm,
    regionMm: region,
    geometry: g,
    cards: infos,
    containment,
    boardSizeMm: { width: boardW, height: boardH },
  };
}

// ---------------------------------------------------------------------------------------------
// Double-sided cards (Task 5.5, Requirement 16, design.md "Physical Card Geometry" section 7)
//
// SYNTHETIC test support. Nothing here is evidence about a real duplex printer, real paper, real
// show-through (Requirement 16.10, Milestone 8) or a real camera.
//
// Model (all derived in design.md section 7):
//  - The Body_Frame is fixed to the card body, origin at the upper-left corner as seen from the FRONT, x right,
//    y down. A layer is described in that frame "as seen through the card toward the front".
//  - Front marker layer F = printedFragments(card). Back marker layer B(x, y) = F(W - x, y): corner positions
//    are mirrored left-right (TL <-> TR, BL <-> BR) and the 5 x 5 fragment content is mirrored with the Fv cell
//    map. B is computed from the same card's front layer only (mirrorMarkerLayer takes a layer, nothing else).
//  - A physical flip about the VERTICAL axis maps view x to W - x; about the HORIZONTAL axis, view y to H - y.
//    The card first lies front up at orientation o (0 or 180), then it is flipped; the observation is the view
//    from above. A vertical-axis flip therefore shows B(W - x', y) = F(x', y) (front appearance), and a
//    horizontal-axis flip shows the front appearance rotated by 180 degrees.
//  - Registration error (duplexRegistration) displaces the BACK print relative to the FRONT print, expressed in
//    the Body_Frame (as seen from the front); rotation is clockwise as seen from the front, about the card
//    centre. The cut-outline offset moves the cut outline relative to the FRONT print: with the outline fixed in
//    the body, the front print appears shifted by minus the offset and the back print by minus the offset plus
//    the registration. Both default to zero.
//  - The artwork probe is a separate, asymmetric raster. The library never applies a mirror to it (the
//    mirror step exists only for MarkerLayer).
// ---------------------------------------------------------------------------------------------

export type CardFace = 'FRONT' | 'BACK';
/** Name used in the spec glossary. */
export type Card_Face = CardFace;
export const CARD_FACES: readonly CardFace[] = Object.freeze(['FRONT', 'BACK'] as const);

/** VERTICAL: left-right flip about the vertical axis. HORIZONTAL: top-bottom flip about the horizontal axis. */
export type FlipAxis = 'VERTICAL' | 'HORIZONTAL';

export interface CardFlip {
  readonly axis: FlipAxis;
  /** D4 element the flip applies to what is seen: Fv (left-right) or Fh (top-bottom). */
  readonly viewTransform: 'Fv' | 'Fh';
}

/** A physical flip of the card. A horizontal-axis flip equals a vertical-axis flip plus an in-plane 180 degree rotation. */
export function flipCard(axis: FlipAxis): CardFlip {
  if (axis === 'VERTICAL') return Object.freeze({ axis, viewTransform: 'Fv' as const });
  if (axis === 'HORIZONTAL') return Object.freeze({ axis, viewTransform: 'Fh' as const });
  throw new RangeError(`unsupported flip axis: ${String(axis)}`);
}

export const MIRROR_LEFT_RIGHT: Readonly<Record<Corner, Corner>> = Object.freeze({ TL: 'TR', TR: 'TL', BL: 'BR', BR: 'BL' });
const MIRROR_TOP_BOTTOM: Readonly<Record<Corner, Corner>> = Object.freeze({ TL: 'BL', BL: 'TL', TR: 'BR', BR: 'TR' });
const OPPOSITE_CORNER: Readonly<Record<Corner, Corner>> = Object.freeze({ TL: 'BR', BR: 'TL', TR: 'BL', BL: 'TR' });
const ALL_CORNERS: readonly Corner[] = Object.freeze(['TL', 'TR', 'BL', 'BR'] as const);

export type MarkerPatterns = Readonly<Partial<Record<Corner, number>>>;

/** The optical marker layer of one face in the Body_Frame: 25-bit pattern at each printed corner. */
export interface MarkerLayer {
  readonly face: CardFace;
  readonly patterns: MarkerPatterns;
}

/** Asymmetric artwork probe (a letter F, 5 x 7 cells, 2 modules per cell), placed off-centre. */
export interface ArtworkProbe {
  readonly cellModules: number;
  /** Top-left of the glyph in modules from the card's top-left corner. */
  readonly originModule: { readonly x: number; readonly y: number };
  /** '#' = black cell. */
  readonly rows: readonly string[];
}

export const ARTWORK_PROBE: ArtworkProbe = Object.freeze({
  cellModules: 2,
  originModule: Object.freeze({ x: 8, y: 14 }),
  rows: Object.freeze(['#####', '#....', '####.', '#....', '#....', '#....', '#....']),
});

/** The artwork of one face. It is never mirrored by this library. */
export interface ArtworkLayer {
  readonly face: CardFace;
  readonly probe: ArtworkProbe;
}

export interface PrintLayers {
  readonly card: string;
  readonly front: MarkerLayer;
  readonly back: MarkerLayer;
  readonly artwork: { readonly front: ArtworkLayer; readonly back: ArtworkLayer };
}

function checkPattern(p: unknown, what: string): number {
  if (typeof p !== 'number' || !Number.isInteger(p) || p < 0 || p >= 2 ** 25) {
    throw new RangeError(`${what} must be an integer in [0, 2^25), got ${String(p)}`);
  }
  return p;
}

/**
 * Back marker layer from a FRONT marker layer ONLY: positions x -> W - x (TL <-> TR, BL <-> BR) and fragment
 * content mirrored with the Fv cell map. There is no other input, so neighbouring cards and board state
 * cannot influence the result (Requirement 16.2).
 */
export function mirrorMarkerLayer(front: MarkerLayer): MarkerLayer {
  if (typeof front !== 'object' || front === null || front.face !== 'FRONT') {
    throw new RangeError('mirrorMarkerLayer takes a FRONT marker layer');
  }
  const out: Partial<Record<Corner, number>> = {};
  for (const c of ALL_CORNERS) {
    const p = front.patterns[c];
    if (p === undefined) continue;
    out[MIRROR_LEFT_RIGHT[c]] = applyTransform('Fv', checkPattern(p, `pattern at ${c}`));
  }
  return Object.freeze({ face: 'BACK' as const, patterns: Object.freeze(out) });
}

function artworkLayers(): PrintLayers['artwork'] {
  return Object.freeze({
    front: Object.freeze({ face: 'FRONT' as const, probe: ARTWORK_PROBE }),
    back: Object.freeze({ face: 'BACK' as const, probe: ARTWORK_PROBE }),
  });
}

/**
 * Printed content of both faces of one card in the Body_Frame. Takes the card only (no board, no neighbours).
 * back = mirrorMarkerLayer(front). The artwork probe is carried unchanged on both faces.
 */
export function printLayers(card: string): PrintLayers {
  const front: MarkerLayer = Object.freeze({ face: 'FRONT' as const, patterns: Object.freeze({ ...printedFragments(card) }) });
  return Object.freeze({ card, front, back: mirrorMarkerLayer(front), artwork: artworkLayers() });
}

/**
 * NEGATIVE MODEL ONLY (Requirement 16.5): the same Body_Frame raster printed unchanged on both faces. It does
 * not satisfy flip equivalence and exists so that tests can show it is rejected.
 */
export function printLayersUnmirrored(card: string): PrintLayers {
  const front: MarkerLayer = Object.freeze({ face: 'FRONT' as const, patterns: Object.freeze({ ...printedFragments(card) }) });
  const back: MarkerLayer = Object.freeze({ face: 'BACK' as const, patterns: Object.freeze({ ...front.patterns }) });
  return Object.freeze({ card, front, back, artwork: artworkLayers() });
}

// ----- errors ---------------------------------------------------------------------------------

/** Back print displacement relative to the front print, Body_Frame, as seen from the front. rotDeg clockwise about the card centre. */
export interface DuplexRegistration {
  dxMm: number;
  dyMm: number;
  rotDeg: number;
}
export const ZERO_REGISTRATION: Readonly<DuplexRegistration> = Object.freeze({ dxMm: 0, dyMm: 0, rotDeg: 0 });

/** Displacement of the cut outline relative to the front print (the outline moves; the print stays). */
export interface CutOffsetMm {
  dxMm: number;
  dyMm: number;
}
export const ZERO_CUT_OFFSET: Readonly<CutOffsetMm> = Object.freeze({ dxMm: 0, dyMm: 0 });

function checkFiniteFields(o: object, names: readonly string[], what: string): void {
  if (typeof o !== 'object' || o === null) throw new RangeError(`${what} must be an object`);
  for (const k of names) {
    const v = (o as Record<string, unknown>)[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new RangeError(`${what}.${k} must be a finite number`);
  }
}

function resolveErrors(opts: { duplexRegistration?: DuplexRegistration; cutOffsetMm?: CutOffsetMm }): {
  reg: DuplexRegistration;
  cut: CutOffsetMm;
} {
  const reg = { ...(opts.duplexRegistration ?? ZERO_REGISTRATION) };
  const cut = { ...(opts.cutOffsetMm ?? ZERO_CUT_OFFSET) };
  checkFiniteFields(reg, ['dxMm', 'dyMm', 'rotDeg'], 'duplexRegistration');
  checkFiniteFields(cut, ['dxMm', 'dyMm'], 'cutOffsetMm');
  return { reg, cut };
}

// ----- view and rasterization -----------------------------------------------------------------

interface ViewSpec {
  mirrorX: boolean;
  mirrorY: boolean;
  rot180: boolean;
}

function resolveView(face: CardFace, orientation: Orientation, flip: CardFlip | undefined): { view: ViewSpec; flip: CardFlip | null } {
  if (orientation !== 0 && orientation !== 180) throw new RangeError(`unsupported orientation: ${String(orientation)}`);
  if (face === 'FRONT') {
    if (flip !== undefined) throw new RangeError('the FRONT face is observed without a flip');
    return { view: { mirrorX: false, mirrorY: false, rot180: orientation === 180 }, flip: null };
  }
  if (face !== 'BACK') throw new RangeError(`unknown face: ${String(face)}`);
  const f = flip ?? flipCard('VERTICAL');
  const axis = flipCard(f.axis); // validates the axis
  return {
    view: { mirrorX: axis.axis === 'VERTICAL', mirrorY: axis.axis === 'HORIZONTAL', rot180: orientation === 180 },
    flip: axis,
  };
}

/** Maps a view-frame offset from the card centre to the body-frame offset (mirror first, then in-plane rotation by o). */
function viewToBodyOffset(view: ViewSpec, ux: number, uy: number): [number, number] {
  let x = ux;
  let y = uy;
  if (view.mirrorX) x = -x;
  if (view.mirrorY) y = -y;
  if (view.rot180) {
    x = -x;
    y = -y;
  }
  return [x, y];
}

/** Where a layer's print frame sits in the body frame: b = R(rotDeg)(p - c0) + c0 + (tx, ty). */
interface PrintPose {
  tx: number;
  ty: number;
  rotDeg: number;
}

function printedSlots(g: PhysicalGeometry, patterns: MarkerPatterns): PrintedSlot[] {
  const slotsMm = markerSlotsMm(g);
  const slots: PrintedSlot[] = [];
  for (const corner of ALL_CORNERS) {
    const p = patterns[corner];
    if (p === undefined) continue;
    const c = slotsMm[corner].core;
    slots.push({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, grid: markerGrid(checkPattern(p, `pattern at ${corner}`)) });
  }
  return slots;
}

function viewRasterSize(g: PhysicalGeometry, pxPerMm: number): { w: number; h: number } {
  return { w: Math.ceil(g.cardWidthMm * pxPerMm - 1e-9), h: Math.ceil(g.cardHeightMm * pxPerMm - 1e-9) };
}

/**
 * Rasterizes the card rectangle as seen from above. For every sub-sample at view position v, the body position is
 * b = viewToBody(v), the print-frame position is p = pose^-1(b), and the ink is read at p. `image` is clipped to
 * the cut outline (table gray outside); `print` is the ink on the whole rectangle.
 */
function rasterizeView(
  g: PhysicalGeometry,
  pxPerMm: number,
  ss: number,
  slots: PrintedSlot[],
  pose: PrintPose,
  view: ViewSpec,
): { image: GrayImage; print: GrayImage } {
  const { w, h } = viewRasterSize(g, pxPerMm);
  const image: GrayImage = { width: w, height: h, data: new Uint8Array(w * h) };
  const print: GrayImage = { width: w, height: h, data: new Uint8Array(w * h) };
  const W = g.cardWidthMm;
  const H = g.cardHeightMm;
  const c0x = W / 2;
  const c0y = H / 2;
  const t = (pose.rotDeg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const n = ss * ss;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      let accImage = 0;
      let accPrint = 0;
      for (let sy = 0; sy < ss; sy++) {
        const Y = (py + (sy + 0.5) / ss) / pxPerMm;
        for (let sx = 0; sx < ss; sx++) {
          const X = (px + (sx + 0.5) / ss) / pxPerMm;
          const [ox, oy] = viewToBodyOffset(view, X - c0x, Y - c0y);
          const dx = ox - pose.tx;
          const dy = oy - pose.ty;
          const lx = c0x + dx * cos + dy * sin;
          const ly = c0y - dx * sin + dy * cos;
          const pv = printedValue(slots, lx, ly, g.moduleMm);
          accPrint += pv;
          accImage += insideRoundedRect(X, Y, W, H, g.cornerRadiusMm) ? pv : g.tableGray;
        }
      }
      const i = py * w + px;
      image.data[i] = Math.round(accImage / n);
      print.data[i] = Math.round(accPrint / n);
    }
  }
  return { image, print };
}

export interface RenderLayerOptions {
  pxPerMm?: number;
  supersample?: number;
}

/** Raster of one marker layer in the Body_Frame (white paper, black ink, the whole card rectangle, no registration error). */
export function renderMarkerLayer(
  layer: MarkerLayer,
  geometry: Partial<PhysicalGeometry> = {},
  options: RenderLayerOptions = {},
): GrayImage {
  const g = physicalGeometry(geometry);
  const pxPerMm = options.pxPerMm ?? DEFAULT_PX_PER_MM;
  const ss = options.supersample ?? DEFAULT_SUPERSAMPLE;
  checkRaster(pxPerMm, ss);
  const none: ViewSpec = { mirrorX: false, mirrorY: false, rot180: false };
  return rasterizeView(g, pxPerMm, ss, printedSlots(g, layer.patterns), { tx: 0, ty: 0, rotDeg: 0 }, none).print;
}

function artworkValue(probe: ArtworkProbe, g: PhysicalGeometry, lx: number, ly: number): number {
  const cell = probe.cellModules * g.moduleMm;
  const col = Math.floor((lx - probe.originModule.x * g.moduleMm) / cell);
  const row = Math.floor((ly - probe.originModule.y * g.moduleMm) / cell);
  const line = probe.rows[row];
  if (line === undefined || col < 0 || col >= line.length) return 255;
  return line.charAt(col) === '#' ? 0 : 255;
}

/** Raster of one artwork layer in its own (readable) frame. No mirror is ever applied. */
export function renderArtworkLayer(
  layer: ArtworkLayer,
  geometry: Partial<PhysicalGeometry> = {},
  options: RenderLayerOptions & { rot180?: boolean } = {},
): GrayImage {
  const g = physicalGeometry(geometry);
  const pxPerMm = options.pxPerMm ?? DEFAULT_PX_PER_MM;
  const ss = options.supersample ?? DEFAULT_SUPERSAMPLE;
  checkRaster(pxPerMm, ss);
  const { w, h } = viewRasterSize(g, pxPerMm);
  const out: GrayImage = { width: w, height: h, data: new Uint8Array(w * h) };
  const sign = options.rot180 === true ? -1 : 1;
  const W = g.cardWidthMm;
  const H = g.cardHeightMm;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      let acc = 0;
      for (let sy = 0; sy < ss; sy++) {
        const Y = (py + (sy + 0.5) / ss) / pxPerMm;
        for (let sx = 0; sx < ss; sx++) {
          const X = (px + (sx + 0.5) / ss) / pxPerMm;
          acc += artworkValue(layer.probe, g, W / 2 + sign * (X - W / 2), H / 2 + sign * (Y - H / 2));
        }
      }
      out.data[py * w + px] = Math.round(acc / (ss * ss));
    }
  }
  return out;
}

// ----- observation ----------------------------------------------------------------------------

export interface DuplexOptions {
  geometry?: Partial<PhysicalGeometry>;
  /** Print layers to observe. Default printLayers(card). Must belong to the same card. */
  layers?: PrintLayers;
  /** Back print displacement (default zero). Has no effect on the FRONT face, which is the reference. */
  duplexRegistration?: DuplexRegistration;
  /** Cut-outline displacement relative to the front print (default zero). */
  cutOffsetMm?: CutOffsetMm;
  pxPerMm?: number;
  supersample?: number;
}

export interface ObservedMarkerLayer {
  card: string;
  face: CardFace;
  orientation: Orientation;
  /** null for the FRONT face. */
  flip: CardFlip | null;
  /** Fragment bits at each corner of the VIEW (structural result; the image is the pixel result). */
  patterns: MarkerPatterns;
  /** The card on the table as seen from above: ink clipped to the cut outline, table gray outside. */
  image: GrayImage;
  /** The ink on the whole card rectangle (white paper / black ink), not clipped to the outline. */
  print: GrayImage;
  pxPerMm: number;
  regionMm: RectMm;
  geometry: PhysicalGeometry;
  duplexRegistration: DuplexRegistration;
  cutOffsetMm: CutOffsetMm;
}

function viewPatterns(patterns: MarkerPatterns, view: ViewSpec): MarkerPatterns {
  const out: Partial<Record<Corner, number>> = {};
  for (const c of ALL_CORNERS) {
    const p = patterns[c];
    if (p === undefined) continue;
    let corner: Corner = c;
    let bits = p;
    if (view.mirrorX) {
      corner = MIRROR_LEFT_RIGHT[corner];
      bits = applyTransform('Fv', bits);
    }
    if (view.mirrorY) {
      corner = MIRROR_TOP_BOTTOM[corner];
      bits = applyTransform('Fh', bits);
    }
    if (view.rot180) {
      corner = OPPOSITE_CORNER[corner];
      bits = applyTransform('R180', bits);
    }
    out[corner] = bits;
  }
  return Object.freeze(out);
}

function resolveLayers(card: string, options: DuplexOptions): PrintLayers {
  const layers = options.layers ?? printLayers(card);
  if (layers.card !== card) throw new RangeError('layers belong to a different card');
  return layers;
}

/**
 * The marker layer seen from above when `card` lies with `face` up. orientation is the in-plane placement (0 or
 * 180) of the card while it lies FRONT up; the BACK face is reached by `flip` (default: vertical axis). With zero
 * error, observeFace(card, 'BACK', o, flipCard('VERTICAL')) equals observeFace(card, 'FRONT', o), and a
 * horizontal-axis flip equals the FRONT observation at the opposite orientation.
 */
export function observeFace(
  card: string,
  face: CardFace,
  orientation: Orientation,
  flip?: CardFlip,
  options: DuplexOptions = {},
): ObservedMarkerLayer {
  const g = physicalGeometry(options.geometry ?? {});
  const pxPerMm = options.pxPerMm ?? DEFAULT_PX_PER_MM;
  const ss = options.supersample ?? DEFAULT_SUPERSAMPLE;
  checkRaster(pxPerMm, ss);
  const { reg, cut } = resolveErrors(options);
  const { view, flip: resolvedFlip } = resolveView(face, orientation, flip);
  const layers = resolveLayers(card, options);
  const layer = face === 'FRONT' ? layers.front : layers.back;
  const pose: PrintPose =
    face === 'FRONT'
      ? { tx: -cut.dxMm, ty: -cut.dyMm, rotDeg: 0 }
      : { tx: -cut.dxMm + reg.dxMm, ty: -cut.dyMm + reg.dyMm, rotDeg: reg.rotDeg };
  const { image, print } = rasterizeView(g, pxPerMm, ss, printedSlots(g, layer.patterns), pose, view);
  return {
    card,
    face,
    orientation,
    flip: resolvedFlip,
    patterns: viewPatterns(layer.patterns, view),
    image,
    print,
    pxPerMm,
    regionMm: { x0: 0, y0: 0, x1: g.cardWidthMm, y1: g.cardHeightMm },
    geometry: g,
    duplexRegistration: reg,
    cutOffsetMm: cut,
  };
}

/** The artwork probe as seen from above. Never mirrored: only the in-plane rotation of the view applies. */
export function observeArtwork(
  card: string,
  face: CardFace,
  orientation: Orientation,
  flip?: CardFlip,
  options: DuplexOptions = {},
): GrayImage {
  const { view } = resolveView(face, orientation, flip);
  const layers = resolveLayers(card, options);
  const layer = face === 'FRONT' ? layers.artwork.front : layers.artwork.back;
  // The probe is authored readable for each face. A horizontal-axis flip shows the back upside down relative to
  // a vertical-axis flip, so only the 180 degree component of the view applies.
  const rot180 = view.rot180 !== view.mirrorY;
  return renderArtworkLayer(layer, options.geometry ?? {}, {
    rot180,
    ...(options.pxPerMm !== undefined ? { pxPerMm: options.pxPerMm } : {}),
    ...(options.supersample !== undefined ? { supersample: options.supersample } : {}),
  });
}

// ----- containment under registration and cut error --------------------------------------------

export interface FaceContainment {
  face: CardFace;
  /** markerContainment(geometry).clearanceMm, identical for both faces. */
  nominalClearanceMm: number;
  /** Largest amount the errors can reduce the clearance (cut offset; for the back also registration shift and rotation). */
  errorLossBoundMm: number;
  /** nominalClearanceMm - errorLossBoundMm (guaranteed lower bound over every error direction). */
  clearanceMm: number;
  /** Clearance computed from the actual displaced footprint and core vertices (all four slots). */
  actualClearanceMm: number;
  /** clearanceMm > 0 and the footprints fit the card. */
  valid: boolean;
  /** actualClearanceMm > 0 and the footprints fit the card. */
  actualValid: boolean;
  reason?: string;
}

export interface DuplexContainmentReport {
  nominal: ContainmentReport;
  /** |cut offset|. */
  cutOffsetMagnitudeMm: number;
  /** |(dx, dy)| of the registration. */
  registrationShiftMm: number;
  /** Chord 2 rho sin(|rot| / 2) of the farthest footprint vertex (rho = distance from the card centre). */
  registrationRotationMm: number;
  /** rho: largest distance from the card centre to a footprint vertex. */
  footprintRadiusMm: number;
  front: FaceContainment;
  back: FaceContainment;
}

/** Signed clearance (positive inside) of a body-frame point to the rounded cut outline, via the rounded-box distance. */
function outlineClearance(g: PhysicalGeometry, x: number, y: number): number {
  const r = g.cornerRadiusMm;
  const qx = Math.abs(x - g.cardWidthMm / 2) - (g.cardWidthMm / 2 - r);
  const qy = Math.abs(y - g.cardHeightMm / 2) - (g.cardHeightMm / 2 - r);
  const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
  return r - sd;
}

function slotVertices(g: PhysicalGeometry): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const s of Object.values(markerSlotsMm(g))) {
    for (const rect of [s.core, s.footprint]) {
      out.push([rect.x0, rect.y0], [rect.x1, rect.y0], [rect.x0, rect.y1], [rect.x1, rect.y1]);
    }
  }
  return out;
}

/**
 * Containment of both faces under front-back registration and cut-outline error. At zero error both faces report
 * exactly markerContainment(geometry). The guaranteed bound `clearanceMm` subtracts the error magnitudes (cut
 * offset; for the back also the registration shift and the rotation chord of the farthest footprint vertex). It is
 * a worst case over directions; `actualClearanceMm` evaluates the given error exactly. Only the 8 vertices of each
 * slot are needed because clearance is concave inside the convex footprints.
 */
export function duplexContainment(
  geometry: Partial<PhysicalGeometry> = {},
  errors: { duplexRegistration?: DuplexRegistration; cutOffsetMm?: CutOffsetMm } = {},
): DuplexContainmentReport {
  const g = physicalGeometry(geometry);
  const { reg, cut } = resolveErrors(errors);
  const nominal = markerContainment(g);
  const cutMag = Math.hypot(cut.dxMm, cut.dyMm);
  const regShift = Math.hypot(reg.dxMm, reg.dyMm);
  const verts = slotVertices(g);
  const c0x = g.cardWidthMm / 2;
  const c0y = g.cardHeightMm / 2;
  const rho = Math.max(...verts.map(([x, y]) => Math.hypot(x - c0x, y - c0y)));
  const regRot = 2 * rho * Math.sin(Math.min(Math.PI, (Math.abs(reg.rotDeg) * Math.PI) / 180) / 2);

  const actual = (pose: PrintPose): number => {
    const t = (pose.rotDeg * Math.PI) / 180;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    let best = Infinity;
    for (const [x, y] of verts) {
      const dx = x - c0x;
      const dy = y - c0y;
      const bx = c0x + dx * cos - dy * sin + pose.tx;
      const by = c0y + dx * sin + dy * cos + pose.ty;
      best = Math.min(best, outlineClearance(g, bx, by));
    }
    return best;
  };

  const face = (f: CardFace, loss: number, pose: PrintPose): FaceContainment => {
    const clearance = nominal.clearanceMm - loss;
    const actualClearance = actual(pose);
    const reasons: string[] = [];
    if (!(clearance > 0)) {
      reasons.push(
        `worst-case clearance ${clearance.toFixed(3)} mm <= 0 (nominal ${nominal.clearanceMm.toFixed(3)} mm minus error bound ${loss.toFixed(3)} mm)`,
      );
    }
    if (!nominal.footprintFitsCard) reasons.push('marker footprints of one card overlap each other or leave the card');
    const r: FaceContainment = {
      face: f,
      nominalClearanceMm: nominal.clearanceMm,
      errorLossBoundMm: loss,
      clearanceMm: clearance,
      actualClearanceMm: actualClearance,
      valid: reasons.length === 0,
      actualValid: actualClearance > 0 && nominal.footprintFitsCard,
    };
    if (reasons.length > 0) r.reason = reasons.join('; ');
    return r;
  };

  return {
    nominal,
    cutOffsetMagnitudeMm: cutMag,
    registrationShiftMm: regShift,
    registrationRotationMm: regRot,
    footprintRadiusMm: rho,
    front: face('FRONT', cutMag, { tx: -cut.dxMm, ty: -cut.dyMm, rotDeg: 0 }),
    back: face('BACK', cutMag + regShift + regRot, {
      tx: -cut.dxMm + reg.dxMm,
      ty: -cut.dyMm + reg.dyMm,
      rotDeg: reg.rotDeg,
    }),
  };
}
