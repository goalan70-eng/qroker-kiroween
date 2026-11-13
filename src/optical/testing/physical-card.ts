/**
 * TEST SUPPORT ONLY - synthetic physical-card composer (Requirement 15, design.md "Physical Card
 * Geometry"). NOT production camera recognition and NOT evidence about real prints or real cameras.
 *
 * What it models: a flat white card with genuinely rounded corners, one or two corner markers taken from
 * render.ts / fragments.ts, cards placed edge to edge on a uniform table gray, small per-card placement
 * errors. What it does not model: card cut tolerance, print registration, gloss, shadows, warp, artwork,
 * the second (back) face. Double-sided rendering is Task 5.5 and is NOT here.
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
import { ALL_CARDS, placedFragments, type Corner, type Orientation } from '../fragments';
import { FOOTPRINT_MOD, renderMarker, type GrayImage } from '../render';
import { mulberry32 } from '../prng';

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
