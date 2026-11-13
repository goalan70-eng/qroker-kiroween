/**
 * Task 5.4 tests: physical card composer and containment function (Requirement 15.1, 15.2, 15.3, 15.5;
 * Property 27 and the setup of Property 28). Synthetic images only: nothing here is evidence about real
 * prints or real cameras.
 *
 * Reference calculations in this file are written independently of physical-card.ts:
 *  - the rounded card is the Minkowski sum "inner rectangle dilated by r" (distance to the inner rectangle
 *    <= r), and the clearance is the rounded-box signed distance, not the piecewise formula of the
 *    implementation;
 *  - footprints and expected marker positions are computed here from the geometry numbers;
 *  - connected components, seam gaps and areas are measured from pixels with code defined in this file.
 *
 * Pixel-discretization tolerance used for the raster comparisons: one pixel is 1/pxPerMm mm. A cell is only
 * judged against the raster when its analytic |clearance| exceeds BAND_PX pixels; the sweep grid is checked
 * to contain no cell inside that ambiguous band.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ALL_CARDS, placedFragments, type Corner } from '../fragments';
import { renderCardLayer, type GrayImage } from '../render';
import { decodeGroup } from '../decode-group';
import { mulberry32 } from '../prng';
import type { Placement } from './group-compose';
import {
  BASELINE_GEOMETRY,
  DEFAULT_PX_PER_MM,
  boardMmToPixel,
  cardLocalToBoardMm,
  composeBoard,
  markerContainment,
  markerSlotsMm,
  physicalGeometry,
  renderPhysicalCard,
  seededErrors,
  seededPlacements,
  vertexMm,
  type BoardCardInfo,
  type PhysicalGeometry,
  type RectMm,
} from './physical-card';

const B = BASELINE_GEOMETRY;
const M = B.moduleMm;
const CORNERS: readonly Corner[] = ['TL', 'TR', 'BL', 'BR'];

// ---------------------------------------------------------------------------------------------
// Independent references
// ---------------------------------------------------------------------------------------------

/** Rounded-box signed distance of the card outline; clearance = r - sd(inner rectangle). Positive = inside. */
function refClearance(x: number, y: number, W: number, H: number, r: number): number {
  const qx = Math.abs(x - W / 2) - (W / 2 - r);
  const qy = Math.abs(y - H / 2) - (H / 2 - r);
  const sdInner = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
  return r - sdInner;
}

/** Footprint rectangles (incl. quiet margin) written out directly from the parameters. */
function refFootprints(g: PhysicalGeometry): Record<Corner, RectMm> {
  const a = g.insetModules * g.moduleMm;
  const F = (7 + 2 * g.quietMarginModules) * g.moduleMm;
  return {
    TL: { x0: a, y0: a, x1: a + F, y1: a + F },
    TR: { x0: g.cardWidthMm - a - F, y0: a, x1: g.cardWidthMm - a, y1: a + F },
    BL: { x0: a, y0: g.cardHeightMm - a - F, x1: a + F, y1: g.cardHeightMm - a },
    BR: { x0: g.cardWidthMm - a - F, y0: g.cardHeightMm - a - F, x1: g.cardWidthMm - a, y1: g.cardHeightMm - a },
  };
}

/** Minimum reference clearance over a dense grid of the four footprints (grid contains the corners). */
function refFootprintClearance(g: PhysicalGeometry, step = 0.1): number {
  let best = Infinity;
  for (const f of Object.values(refFootprints(g))) {
    const nx = Math.ceil((f.x1 - f.x0) / step);
    const ny = Math.ceil((f.y1 - f.y0) / step);
    for (let i = 0; i <= nx; i++) {
      const x = i === nx ? f.x1 : f.x0 + i * step;
      for (let j = 0; j <= ny; j++) {
        const y = j === ny ? f.y1 : f.y0 + j * step;
        best = Math.min(best, refClearance(x, y, g.cardWidthMm, g.cardHeightMm, g.cornerRadiusMm));
      }
    }
  }
  return best;
}

/** Labels 4-connected black (< 128) components; returns labels (0 = none) and the component count. */
function labelBlack(img: GrayImage): { labels: Int32Array; count: number } {
  const { width: w, height: h, data } = img;
  const labels = new Int32Array(w * h);
  let count = 0;
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if ((data[s] as number) >= 128 || labels[s] !== 0) continue;
    count++;
    labels[s] = count;
    stack.push(s);
    while (stack.length > 0) {
      const p = stack.pop() as number;
      const x = p % w;
      const y = (p - x) / w;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of nb) {
        if (q >= 0 && (data[q] as number) < 128 && labels[q] === 0) {
          labels[q] = count;
          stack.push(q);
        }
      }
    }
  }
  return { labels, count };
}

/** Reads the 25 data cells of a marker whose core starts at (x0mm, y0mm) in a raster with the given origin. */
function readCoreBits(
  img: GrayImage,
  origin: { x0: number; y0: number },
  pxPerMm: number,
  core: { x: number; y: number },
  moduleMm: number,
): number {
  let bits = 0;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const xmm = core.x + (1 + c + 0.5) * moduleMm;
      const ymm = core.y + (1 + r + 0.5) * moduleMm;
      const px = Math.floor((xmm - origin.x0) * pxPerMm);
      const py = Math.floor((ymm - origin.y0) * pxPerMm);
      if ((img.data[py * img.width + px] as number) < 128) bits |= 1 << (5 * r + c);
    }
  }
  return bits >>> 0;
}

function isWhiteCore(img: GrayImage, origin: { x0: number; y0: number }, pxPerMm: number, c: RectMm): boolean {
  const xa = Math.round((c.x0 - origin.x0) * pxPerMm);
  const xb = Math.round((c.x1 - origin.x0) * pxPerMm);
  const ya = Math.round((c.y0 - origin.y0) * pxPerMm);
  const yb = Math.round((c.y1 - origin.y0) * pxPerMm);
  for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) if ((img.data[y * img.width + x] as number) !== 255) return false;
  return true;
}

/** An arrangement of four cards around one vertex in which every slot faces a printed marker. */
function focusArrangement(seed: number): Placement[][] {
  const rng = mulberry32(seed);
  const suits = ['H', 'D', 'C', 'S'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  for (;;) {
    const pool = [...suits];
    const pick: Placement[] = [];
    let ok = true;
    for (const slot of ['TL', 'TR', 'BL', 'BR'] as const) {
      const suit = pool.splice(Math.floor(rng() * pool.length), 1)[0] as string;
      const ori = rng() < 0.5 ? 0 : 180;
      const rank = ranks[Math.floor(rng() * ranks.length)] as string;
      // the slot must face a printed marker for this suit/orientation (facing corner written out here)
      const facingCorner: Record<string, Corner> = { TL: 'BR', TR: 'BL', BL: 'TR', BR: 'TL' };
      if (placedFragments(`${suit}-A`, ori)[facingCorner[slot] as Corner] === undefined) {
        ok = false;
        break;
      }
      pick.push({ card: `${suit}-${rank}`, orientation: ori });
    }
    if (ok) {
      return [
        [pick[0] as Placement, pick[1] as Placement],
        [pick[2] as Placement, pick[3] as Placement],
      ];
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Geometry validation and the analytic function
// ---------------------------------------------------------------------------------------------

describe('PhysicalGeometry defaults and validation', () => {
  it('has the approved baseline values and no gap', () => {
    expect(B).toMatchObject({
      cardWidthMm: 63.5,
      cardHeightMm: 88.9,
      cornerRadiusMm: 3.175,
      moduleMm: 1.5875,
      insetModules: 1,
      quietMarginModules: 1,
      gapMm: 0,
    });
    expect(physicalGeometry()).toEqual({ ...B });
    // the 40 x 56 module grid of render.ts maps exactly onto the physical card
    expect(40 * M).toBeCloseTo(63.5, 12);
    expect(56 * M).toBeCloseTo(88.9, 12);
  });

  it('rejects malformed parameters', () => {
    expect(() => physicalGeometry({ cornerRadiusMm: -1 })).toThrow(RangeError);
    expect(() => physicalGeometry({ cornerRadiusMm: 40 })).toThrow(RangeError);
    expect(() => physicalGeometry({ gapMm: -0.1 })).toThrow(RangeError);
    expect(() => physicalGeometry({ moduleMm: Number.NaN })).toThrow(RangeError);
    expect(() => physicalGeometry({ tableGray: 300 })).toThrow(RangeError);
  });
});

describe('markerContainment baseline values (design.md section 2)', () => {
  it('reproduces the design numbers: baseline 0.93 mm, border corner on the arc centre', () => {
    const c = markerContainment();
    expect(c.valid).toBe(true);
    expect(c.reason).toBeUndefined();
    expect(c.marginCornerClearanceMm).toBeCloseTo(0.93, 2);
    expect(c.clearanceMm).toBeCloseTo(0.93, 2);
    // the corner of the black border sits at a = 3.175 mm = r, i.e. on the arc centre: distance r to the arc
    expect(c.borderCornerOffsetMm).toBeCloseTo(3.175, 12);
    expect(c.borderCornerClearanceMm).toBeCloseTo(3.175, 9);
    expect(c.centralVoidAreaMm2).toBeCloseTo(8.65, 2);
  });

  it('reproduces the comparison values for inset 1 / 1.5 and the maximum radii', () => {
    const at = (r: number, inset: number) => markerContainment({ cornerRadiusMm: r, insetModules: inset });
    expect(at(3.175, 1.5).clearanceMm).toBeCloseTo(2.05, 2);
    expect(at(3.6, 1).clearanceMm).toBeCloseTo(0.75, 2);
    expect(at(3.6, 1.5).clearanceMm).toBeCloseTo(1.88, 2);
    expect(at(4, 1).clearanceMm).toBeCloseTo(0.59, 2);
    expect(at(4, 1.5).clearanceMm).toBeCloseTo(1.71, 2);
    expect(at(5, 1).clearanceMm).toBeCloseTo(0.17, 2);
    expect(at(6, 1).clearanceMm).toBeCloseTo(-0.24, 2);
    expect(at(3.175, 0.5).clearanceMm).toBeCloseTo(-0.19, 2);
    for (const [inset, rmax] of [[0.5, 2.71], [1, 5.42], [1.5, 8.13], [2, 10.84]] as const) {
      expect(at(3.175, inset).maxRadiusForMarginMm).toBeCloseTo(rmax, 2);
    }
  });

  it('reproduces the horn-tip to border-corner distances and void areas', () => {
    const expectedTip: Array<[number, number]> = [[2, 3.39], [3.175, 3.17], [4, 3.28], [5, 3.66], [6, 4.25]];
    for (const [r, d] of expectedTip) {
      expect(markerContainment({ cornerRadiusMm: r }).voidTipToBorderCornerMm).toBeCloseTo(d, 2);
    }
    const area: Array<[number, number]> = [[2, 3.43], [3.175, 8.65], [4, 13.73], [5, 21.46]];
    for (const [r, v] of area) expect(markerContainment({ cornerRadiusMm: r }).centralVoidAreaMm2).toBeCloseTo(v, 2);
  });
});

describe('Property 27 (analytic part): clearance agrees with an independent signed-distance reference', () => {
  /** **Validates: Requirements 15.3** */
  it('matches the rounded-box reference for random geometries, and valid <=> clearance > 0 and footprints fit', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 8, noNaN: true }),
        fc.double({ min: 0.25, max: 3, noNaN: true }),
        fc.double({ min: 0, max: 2, noNaN: true }),
        fc.double({ min: 1.2, max: 2.2, noNaN: true }),
        (r, inset, margin, moduleMm) => {
          const g = physicalGeometry({ cornerRadiusMm: r, insetModules: inset, quietMarginModules: margin, moduleMm });
          const rep = markerContainment(g);
          const ref = refFootprintClearance(g, 0.5);
          expect(rep.clearanceMm).toBeCloseTo(ref, 9);
          const fits = refFootprints(g).TL.x1 <= refFootprints(g).TR.x0 && refFootprints(g).TL.y1 <= refFootprints(g).BL.y0;
          expect(rep.valid).toBe(ref > 0 && fits);
        },
      ),
      { numRuns: 150 },
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Test 1: sweep grid, analytic containment vs rasterized rounded-corner mask (Property 27)
// ---------------------------------------------------------------------------------------------

describe('Property 27: radius x inset sweep, analytic containment vs rasterized rounded-corner mask', () => {
  /** **Validates: Requirements 15.3** */
  const radii = [0, 2.0, 3.0, 3.175, 3.6, 4.0, 5.0, 6.0];
  const insets = [0.5, 1, 1.5, 2];
  const PX = 32; // pixels per mm in the sweep: one pixel = 0.03125 mm
  const BAND_PX = 2; // cells with |clearance| below this many pixels would be ambiguous
  const WINDOW = 7; // mm; every corner arc (r <= 6) lies inside [0, 7]^2 of its corner

  const windows = (g: PhysicalGeometry): Record<Corner, RectMm> => ({
    TL: { x0: 0, y0: 0, x1: WINDOW, y1: WINDOW },
    TR: { x0: g.cardWidthMm - WINDOW, y0: 0, x1: g.cardWidthMm, y1: WINDOW },
    BL: { x0: 0, y0: g.cardHeightMm - WINDOW, x1: WINDOW, y1: g.cardHeightMm },
    BR: { x0: g.cardWidthMm - WINDOW, y0: g.cardHeightMm - WINDOW, x1: g.cardWidthMm, y1: g.cardHeightMm },
  });

  it('no sweep cell falls into the ambiguous pixel band (tolerance is documented, not used to hide cells)', () => {
    for (const r of radii) {
      for (const inset of insets) {
        const g = physicalGeometry({ cornerRadiusMm: r, insetModules: inset });
        expect(Math.abs(refFootprintClearance(g, 0.25))).toBeGreaterThan(BAND_PX / PX);
      }
    }
  });

  for (const r of radii) {
    for (const inset of insets) {
      it(`r=${r} mm, inset=${inset} modules`, () => {
        const g = physicalGeometry({ cornerRadiusMm: r, insetModules: inset });
        const rep = markerContainment(g);
        const refC = refFootprintClearance(g, 0.1);
        // analytic value equals the independent signed-distance minimum over the whole footprint grid
        expect(rep.clearanceMm).toBeCloseTo(refC, 9);
        expect(rep.valid).toBe(refC > 0);

        const fps = refFootprints(g);
        let anyOutside = false;
        let allInside = true;
        for (const corner of CORNERS) {
          const win = windows(g)[corner];
          const rc = renderPhysicalCard('H-A', 0, g, { pxPerMm: PX, supersample: 3, regionMm: win, omitMarkers: true });
          const fp = fps[corner];
          for (let py = 0; py < rc.image.height; py++) {
            for (let px = 0; px < rc.image.width; px++) {
              const xc = win.x0 + (px + 0.5) / PX; // pixel-centre convention
              const yc = win.y0 + (py + 0.5) / PX;
              if (xc < fp.x0 || xc >= fp.x1 || yc < fp.y0 || yc >= fp.y1) continue;
              const cov = rc.coverage[py * rc.image.width + px] as number;
              if (cov !== 255) allInside = false;
              if (cov === 0) anyOutside = true;
            }
          }
        }
        if (refC > 0) {
          expect(allInside).toBe(true); // every footprint pixel, margin included, is fully inside the mask
        } else {
          expect(anyOutside).toBe(true); // a footprint pixel lies completely outside the mask
        }
        expect(rep.valid ? allInside : anyOutside).toBe(true);
      });
    }
  }
});

// ---------------------------------------------------------------------------------------------
// Tests 2 and 3: baseline printed pixels inside the card; radius 6 / inset 1 is invalid
// ---------------------------------------------------------------------------------------------

describe('baseline printed pixels', () => {
  it('every printed marker pixel of every card at both orientations lies fully inside the card mask', () => {
    for (const card of ALL_CARDS) {
      for (const ori of [0, 180] as const) {
        const rc = renderPhysicalCard(card, ori, {}, { supersample: 2 });
        let ink = 0;
        for (let i = 0; i < rc.print.data.length; i++) {
          if ((rc.print.data[i] as number) < 255) {
            ink++;
            if (rc.coverage[i] !== 255) throw new Error(`${card}@${ori}: ink pixel ${i} has coverage ${String(rc.coverage[i])}`);
          }
        }
        expect(ink).toBeGreaterThan(0);
        // clipping never removed ink at the baseline: image equals the print where the mask is full
        for (let i = 0; i < rc.image.data.length; i++) {
          if (rc.coverage[i] === 255 && rc.image.data[i] !== rc.print.data[i]) throw new Error(`${card}@${ori}: image != print at ${i}`);
        }
      }
    }
  }, 120_000);

  it('whole footprints including the quiet margin are inside at baseline, with the reported clearance', () => {
    const rc = renderPhysicalCard('S-Q', 180, {}, { pxPerMm: 32, supersample: 3, regionMm: { x0: 0, y0: 0, x1: 8, y1: 8 } });
    const fp = refFootprints(physicalGeometry());
    for (let py = 0; py < rc.image.height; py++) {
      for (let px = 0; px < rc.image.width; px++) {
        const xc = (px + 0.5) / 32;
        const yc = (py + 0.5) / 32;
        if (xc >= fp.TL.x0 && yc >= fp.TL.y0) expect(rc.coverage[py * rc.image.width + px]).toBe(255);
      }
    }
    expect(rc.containment.valid).toBe(true);
    expect(rc.containment.clearanceMm).toBeCloseTo(0.93, 2);
  });
});

describe('invalid shapes are reported, not silently clipped', () => {
  it('radius 6 mm with inset 1 module is invalid, with a reason and a negative clearance', () => {
    const c = markerContainment({ cornerRadiusMm: 6 });
    expect(c.valid).toBe(false);
    expect(c.clearanceMm).toBeCloseTo(-0.24, 2);
    expect(c.reason).toMatch(/clearance -0\.240 mm <= 0/);
    // the raster agrees: part of the (white) margin lies outside the rounded corner
    const rc = renderPhysicalCard('H-A', 0, { cornerRadiusMm: 6 }, { pxPerMm: 32, supersample: 3, regionMm: { x0: 0, y0: 0, x1: 7, y1: 7 }, omitMarkers: true });
    const a = 1 * M;
    const px = Math.floor((a + 0.5 / 32) * 32);
    expect(rc.coverage[px * rc.image.width + px]).toBe(0);
    expect(rc.containment.valid).toBe(false);
    expect(() => renderPhysicalCard('H-A', 0, { cornerRadiusMm: 6 }, { requireValid: true, regionMm: { x0: 0, y0: 0, x1: 7, y1: 7 } })).toThrow(/invalid physical geometry/);
  });

  it('inset 0.5 module at the baseline radius is invalid; ink outside the outline is visible in `print` but cut away in `image`', () => {
    const g = { insetModules: 0.2, quietMarginModules: 0.2 }; // black border corner at 0.4 module: ink leaves the card
    const rc = renderPhysicalCard('H-A', 0, g, { pxPerMm: 32, supersample: 2, regionMm: { x0: 0, y0: 0, x1: 7, y1: 7 } });
    expect(rc.containment.valid).toBe(false);
    let clipped = 0;
    for (let i = 0; i < rc.print.data.length; i++) {
      if ((rc.print.data[i] as number) === 0 && rc.coverage[i] === 0) {
        clipped++;
        expect(rc.image.data[i]).toBe(B.tableGray);
      }
    }
    expect(clipped).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Test 4: zero-gap composition, seam white separation, separate connected components (Req. 15.5)
// ---------------------------------------------------------------------------------------------

describe('zero-gap 2x2 composition', () => {
  const MARGIN_MM = 4 * M; // 4 modules of table margin keeps every boundary on a pixel boundary at the default scale

  function seamGaps(inset: number): { vertical: number; horizontal: number } {
    const g = physicalGeometry({ insetModules: inset });
    const arr = focusArrangement(11);
    const board = composeBoard(arr, { ...g, tableGray: 200 }, { tableMarginMm: MARGIN_MM, supersample: 4 });
    expect(board.geometry.gapMm).toBe(0);
    const ppm = board.pxPerMm;
    const img = board.image;
    const v = vertexMm(g, 0, 0);
    const a = (inset + 1) * M;
    const coreSpan = 7 * M;
    const sx = Math.round(boardMmToPixel(board, v.x, 0).x);
    const sy = Math.round(boardMmToPixel(board, 0, v.y).y);
    const black = (x: number, y: number): boolean => (img.data[y * img.width + x] as number) < 128;
    // vertical seam: rows spanned by the two markers above the horizontal seam
    let vMin = Infinity;
    const yA = Math.round(boardMmToPixel(board, 0, v.y - a - coreSpan).y);
    const yB = Math.round(boardMmToPixel(board, 0, v.y - a).y);
    for (let y = yA; y < yB; y++) {
      let l = -1;
      for (let x = sx - 1; x >= 0; x--) if (black(x, y)) { l = x; break; }
      let r = -1;
      for (let x = sx; x < img.width; x++) if (black(x, y)) { r = x; break; }
      if (l >= 0 && r >= 0) vMin = Math.min(vMin, r - l - 1);
    }
    // horizontal seam: columns spanned by the two markers left of the vertical seam
    let hMin = Infinity;
    const xA = Math.round(boardMmToPixel(board, v.x - a - coreSpan, 0).x);
    const xB = Math.round(boardMmToPixel(board, v.x - a, 0).x);
    for (let x = xA; x < xB; x++) {
      let t = -1;
      for (let y = sy - 1; y >= 0; y--) if (black(x, y)) { t = y; break; }
      let b = -1;
      for (let y = sy; y < img.height; y++) if (black(x, y)) { b = y; break; }
      if (t >= 0 && b >= 0) hMin = Math.min(hMin, b - t - 1);
    }
    return { vertical: vMin / ppm / M, horizontal: hMin / ppm / M };
  }

  it('seam white separation equals 2(inset + margin) modules (baseline: 4 modules = 6.35 mm)', () => {
    const base = seamGaps(1);
    expect(base.vertical).toBeCloseTo(4, 9);
    expect(base.horizontal).toBeCloseTo(4, 9);
    expect(base.vertical * M).toBeCloseTo(6.35, 9);
    const wider = seamGaps(1.5); // 5 modules = 7.94 mm
    expect(wider.vertical).toBeCloseTo(5, 9);
    expect(wider.horizontal).toBeCloseTo(5, 9);
  });

  it('the black squares of adjacent cards are separate connected components (no component crosses a seam)', () => {
    for (const seed of [1, 2, 3]) {
      const arr = focusArrangement(seed);
      // light table so that only ink is < 128; the dark-table case is the next test
      const board = composeBoard(arr, { tableGray: 200 }, { tableMarginMm: MARGIN_MM });
      const { labels, count } = labelBlack(board.image);
      const w = board.image.width;
      // every component lies inside one card rectangle
      const boxes = new Map<number, { x0: number; y0: number; x1: number; y1: number }>();
      for (let i = 0; i < labels.length; i++) {
        const l = labels[i] as number;
        if (l === 0) continue;
        const x = i % w;
        const y = (i - x) / w;
        const bx = boxes.get(l);
        if (bx === undefined) boxes.set(l, { x0: x, y0: y, x1: x, y1: y });
        else {
          bx.x0 = Math.min(bx.x0, x);
          bx.x1 = Math.max(bx.x1, x);
          bx.y0 = Math.min(bx.y0, y);
          bx.y1 = Math.max(bx.y1, y);
        }
      }
      const seamX = boardMmToPixel(board, B.cardWidthMm, 0).x;
      const seamY = boardMmToPixel(board, 0, B.cardHeightMm).y;
      for (const bx of boxes.values()) {
        expect(bx.x1 + 1 <= seamX || bx.x0 >= seamX).toBe(true);
        expect(bx.y1 + 1 <= seamY || bx.y0 >= seamY).toBe(true);
      }
      // each of the 8 printed fragments has its own border component (distinct labels at the border corner module)
      const labelsOfBorder = new Set<number>();
      let fragments = 0;
      for (const info of board.cards) {
        const slots = markerSlotsMm(B);
        for (const corner of CORNERS) {
          if (placedFragments(info.card, info.orientation)[corner] === undefined) continue;
          fragments++;
          const c = slots[corner].core;
          const p = boardMmToPixel(board, info.nominalOriginMm.x + c.x0 + 0.5 * M, info.nominalOriginMm.y + c.y0 + 0.5 * M);
          const l = labels[Math.floor(p.y) * w + Math.floor(p.x)] as number;
          expect(l).toBeGreaterThan(0);
          labelsOfBorder.add(l);
        }
      }
      expect(fragments).toBe(8);
      expect(labelsOfBorder.size).toBe(8);
      expect(count).toBeGreaterThanOrEqual(8);
    }
  });

  it('with a dark table (gray 64) the table is one dark component separate from every marker', () => {
    const arr = focusArrangement(2);
    const board = composeBoard(arr, { tableGray: 64 }, { tableMarginMm: MARGIN_MM });
    const { labels } = labelBlack(board.image);
    const w = board.image.width;
    const table = labels[0] as number;
    expect(table).toBeGreaterThan(0);
    // the central void is dark too (its horns end in cusps, so it is its own component); no marker joins either
    const vc = boardMmToPixel(board, B.cardWidthMm, B.cardHeightMm);
    const voidLabel = labels[Math.floor(vc.y) * w + Math.floor(vc.x)] as number;
    expect(voidLabel).toBeGreaterThan(0);
    for (const info of board.cards) {
      for (const corner of CORNERS) {
        if (placedFragments(info.card, info.orientation)[corner] === undefined) continue;
        const c = markerSlotsMm(B)[corner].core;
        const p = boardMmToPixel(board, info.nominalOriginMm.x + c.x0 + 0.5 * M, info.nominalOriginMm.y + c.y0 + 0.5 * M);
        const l = labels[Math.floor(p.y) * w + Math.floor(p.x)];
        expect(l).not.toBe(table);
        expect(l).not.toBe(voidLabel);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Test 5: central void (Req. 15.1 geometry, 15.4 distance report)
// ---------------------------------------------------------------------------------------------

describe('central void of a zero-gap 2x2 vertex', () => {
  const PX = 20;
  function measure(r: number, tableGray: number): { area: number; tipDistance: number } {
    const g = physicalGeometry({ cornerRadiusMm: r, tableGray });
    const placements = focusArrangement(5);
    const v = vertexMm(g, 0, 0);
    const half = r + 1;
    const region = { x0: v.x - half, y0: v.y - half, x1: v.x + half, y1: v.y + half };
    const blank = composeBoard(placements, g, { pxPerMm: PX, supersample: 4, regionMm: region, omitMarkers: true });
    let area = 0;
    for (const p of blank.image.data) area += (255 - p) / (255 - tableGray) / (PX * PX);
    // distance from void pixels (> 5 % table coverage) to the corner of the black border of the TL card
    const a = 2 * M;
    const corner = { x: B.cardWidthMm - a, y: B.cardHeightMm - a };
    let best = Infinity;
    for (let py = 0; py < blank.image.height; py++) {
      for (let px = 0; px < blank.image.width; px++) {
        const cov = (255 - (blank.image.data[py * blank.image.width + px] as number)) / (255 - tableGray);
        if (cov <= 0.05) continue;
        const x = region.x0 + (px + 0.5) / PX;
        const y = region.y0 + (py + 0.5) / PX;
        best = Math.min(best, Math.hypot(x - corner.x, y - corner.y));
      }
    }
    return { area, tipDistance: best };
  }

  for (const r of [2, 3.175, 4, 5]) {
    it(`r=${r} mm: area matches 4(1-pi/4)r^2 within 1.5 %`, () => {
      const expected = 4 * (1 - Math.PI / 4) * r * r;
      const m = measure(r, 0);
      expect(Math.abs(m.area - expected) / expected).toBeLessThan(0.015);
      // lighter table, lower contrast: still within 2 %
      const m2 = measure(r, 128);
      expect(Math.abs(m2.area - expected) / expected).toBeLessThan(0.02);
      // measured minimum distance from the void to the corner of the black border agrees with the report (0.1 mm)
      const rep = markerContainment({ cornerRadiusMm: r });
      expect(rep.voidToBorderCornerMm).not.toBeNull();
      expect(rep.voidTipToBorderCornerMm).not.toBeNull();
      expect(Math.abs(m.tipDistance - (rep.voidToBorderCornerMm as number))).toBeLessThan(0.1);
      // the design.md table lists the horn-tip distance, which is only the minimum when a_border >= r
      if (r > 2 * M + 0.5) expect(m.tipDistance).toBeLessThan((rep.voidTipToBorderCornerMm as number) - 0.3);
    });
  }

  it('square corners leave no void', () => {
    expect(measure(0, 0).area).toBe(0);
  });

  it('r = 0 reports no void distance (null), area 0, and containment still valid by the usual rules', () => {
    const rep = markerContainment({ cornerRadiusMm: 0 });
    expect(rep.voidTipToBorderCornerMm).toBeNull();
    expect(rep.voidToBorderCornerMm).toBeNull();
    expect(rep.centralVoidAreaMm2).toBe(0);
    // square corner: clearance is the straight-edge offset of the margin corner (inset 1 module)
    expect(rep.valid).toBe(true);
    expect(rep.reason).toBeUndefined();
    expect(rep.marginCornerClearanceMm).toBeCloseTo(M, 9);
    expect(rep.borderCornerClearanceMm).toBeCloseTo(2 * M, 9);
    expect(rep.clearanceMm).toBeCloseTo(M, 9);
    expect(rep.footprintFitsCard).toBe(true);
    // r > 0 stays numeric
    expect(typeof markerContainment({ cornerRadiusMm: 0.5 }).voidToBorderCornerMm).toBe('number');
  });
});

// ---------------------------------------------------------------------------------------------
// Test 6: determinism
// ---------------------------------------------------------------------------------------------

describe('determinism', () => {
  it('repeated card renders are byte-identical', () => {
    const a = renderPhysicalCard('C-7', 180);
    const b = renderPhysicalCard('C-7', 180);
    expect(Buffer.from(a.image.data).equals(Buffer.from(b.image.data))).toBe(true);
    expect(Buffer.from(a.coverage).equals(Buffer.from(b.coverage))).toBe(true);
    expect(Buffer.from(a.print.data).equals(Buffer.from(b.print.data))).toBe(true);
  });

  it('seeded boards are reproducible, different seeds differ, explicit errors equal the seeded table', () => {
    const pl = seededPlacements(7, 2, 2);
    const spec = { seed: 99, maxShiftMm: 0.5, maxRotationDeg: 2 };
    const a = composeBoard(pl, {}, { errors: spec });
    const b = composeBoard(pl, {}, { errors: spec });
    const c = composeBoard(pl, {}, { errors: { ...spec, seed: 100 } });
    const d = composeBoard(pl, {}, { errors: seededErrors(2, 2, spec) });
    expect(Buffer.from(a.image.data).equals(Buffer.from(b.image.data))).toBe(true);
    expect(Buffer.from(a.image.data).equals(Buffer.from(c.image.data))).toBe(false);
    expect(Buffer.from(a.image.data).equals(Buffer.from(d.image.data))).toBe(true);
    expect(a.cards.map((x) => x.error)).toEqual(b.cards.map((x) => x.error));
    for (const e of a.cards.map((x) => x.error)) {
      expect(Math.abs(e.dxMm)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(e.rotationDeg)).toBeLessThanOrEqual(2);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Test 7: identities and fragment patterns preserved
// ---------------------------------------------------------------------------------------------

describe('card identities and fragment patterns are preserved', () => {
  it('baseline print layer is pixel-identical to render.ts renderCardLayer for all 52 cards x {0, 180}', () => {
    expect(DEFAULT_PX_PER_MM * M).toBeCloseTo(4, 12);
    for (const card of ALL_CARDS) {
      for (const ori of [0, 180] as const) {
        const rc = renderPhysicalCard(card, ori);
        const ref = renderCardLayer(card, ori, { modulePx: 4 });
        expect([rc.print.width, rc.print.height]).toEqual([ref.width, ref.height]);
        expect(Buffer.from(rc.print.data).equals(Buffer.from(ref.data))).toBe(true);
      }
    }
  }, 120_000);

  it('reading the rendered module grid returns placedFragments for every card/orientation (inset 1.5, other module size)', () => {
    const g = physicalGeometry({ insetModules: 1.5, moduleMm: 1.6 });
    for (const card of ALL_CARDS) {
      for (const ori of [0, 180] as const) {
        const rc = renderPhysicalCard(card, ori, g, { pxPerMm: 5, supersample: 2 });
        const placed = placedFragments(card, ori);
        const slots = markerSlotsMm(g);
        for (const corner of CORNERS) {
          const core = slots[corner].core;
          const pat = placed[corner];
          if (pat === undefined) {
            expect(isWhiteCore(rc.print, { x0: 0, y0: 0 }, 5, core)).toBe(true);
          } else {
            expect(readCoreBits(rc.print, { x0: 0, y0: 0 }, 5, { x: core.x0, y: core.y0 }, g.moduleMm)).toBe(pat);
          }
        }
        // exactly two fragments per card
        expect(CORNERS.filter((c) => placed[c] !== undefined).length).toBe(2);
      }
    }
  }, 120_000);

  it('distinct cards give distinct renders at a fixed orientation', () => {
    const seen = new Set<string>();
    for (const card of ALL_CARDS) seen.add(Buffer.from(renderPhysicalCard(card, 0, {}, { supersample: 1 }).print.data).toString('base64'));
    expect(seen.size).toBe(52);
  }, 120_000);

  it('table gray is configurable and only appears outside the card outline', () => {
    for (const gray of [0, 200]) {
      const rc = renderPhysicalCard('H-A', 0, { tableGray: gray }, { pxPerMm: 16, supersample: 3, regionMm: { x0: 0, y0: 0, x1: 4, y1: 4 }, omitMarkers: true });
      expect(rc.image.data[0]).toBe(gray); // corner pixel is entirely outside the radius
      const mid = (rc.image.height - 1) * rc.image.width + rc.image.width - 1;
      expect(rc.image.data[mid]).toBe(255);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Test 8: 3x3 boards keep the distractor fragments; placement errors are applied geometrically
// ---------------------------------------------------------------------------------------------

describe('3x3 boards with Distractor_Markers', () => {
  function fragmentPresent(board: ReturnType<typeof composeBoard>, info: BoardCardInfo, corner: Corner): boolean {
    const core = markerSlotsMm(board.geometry)[corner].core;
    const pattern = placedFragments(info.card, info.orientation)[corner] as number;
    let bits = 0;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const p = cardLocalToBoardMm(info, board.geometry, core.x0 + (2 + c - 0.5) * M, core.y0 + (2 + r - 0.5) * M);
        const px = boardMmToPixel(board, p.x, p.y);
        if ((board.image.data[Math.floor(px.y) * board.image.width + Math.floor(px.x)] as number) < 128) bits |= 1 << (5 * r + c);
      }
    }
    return bits >>> 0 === pattern;
  }

  /** Vertex (row, col) that a fragment at `corner` of card (i, j) faces, written out directly. */
  const faces = (i: number, j: number, corner: Corner): [number, number] => [
    corner === 'TL' || corner === 'TR' ? i - 1 : i,
    corner === 'TL' || corner === 'BL' ? j - 1 : j,
  ];

  for (const withErrors of [false, true]) {
    it(`every fragment of all 9 cards is present, 4 at the focus vertex and the rest distractors (${withErrors ? 'seeded errors' : 'no error'})`, () => {
      const focus = focusArrangement(21);
      const rest = seededPlacements(33, 3, 3);
      const grid: Placement[][] = [
        [focus[0]![0]!, focus[0]![1]!, rest[0]![2]!],
        [focus[1]![0]!, focus[1]![1]!, rest[1]![2]!],
        [rest[2]![0]!, rest[2]![1]!, rest[2]![2]!],
      ];
      const board = composeBoard(grid, {}, withErrors ? { errors: { seed: 4, maxShiftMm: 0.3, maxRotationDeg: 1.5 } } : {});
      expect(board.cards).toHaveLength(9);
      let total = 0;
      let atFocus = 0;
      let distractors = 0;
      for (const info of board.cards) {
        const placed = placedFragments(info.card, info.orientation);
        for (const corner of CORNERS) {
          if (placed[corner] === undefined) {
            if (!withErrors) {
              // blank corner stays white paper (exact pixel rectangle only exists without placement error)
              const c = markerSlotsMm(board.geometry)[corner].core;
              const o = info.nominalOriginMm;
              const rect = { x0: o.x + c.x0, y0: o.y + c.y0, x1: o.x + c.x1, y1: o.y + c.y1 };
              expect(isWhiteCore(board.image, board.regionMm, board.pxPerMm, rect)).toBe(true);
            }
            continue;
          }
          total++;
          expect(fragmentPresent(board, info, corner)).toBe(true);
          const [vr, vc] = faces(info.row, info.col, corner);
          if (vr === 0 && vc === 0) atFocus++;
          else distractors++;
        }
      }
      expect(total).toBe(18);
      expect(atFocus).toBe(4);
      expect(distractors).toBe(14);
    });
  }

  it('a rotated card is rotated about its centre: its corner moves as the clockwise rotation predicts', () => {
    const grid = seededPlacements(1, 2, 2);
    const err = [
      [{ dxMm: 0, dyMm: 0, rotationDeg: 0 }, { dxMm: 0, dyMm: 0, rotationDeg: 0 }],
      [{ dxMm: 0, dyMm: 0, rotationDeg: 0 }, { dxMm: 0.4, dyMm: -0.2, rotationDeg: 2 }],
    ];
    const board = composeBoard(grid, {}, { errors: err, pxPerMm: 16, supersample: 4 });
    const info = board.cards[3] as BoardCardInfo;
    // top-left corner of the rotated card: centre + R(2 deg) * (-W/2, -H/2)
    const t = (2 * Math.PI) / 180;
    const cx = B.cardWidthMm * 1.5 + 0.4;
    const cy = B.cardHeightMm * 1.5 - 0.2;
    const expected = { x: cx + (-B.cardWidthMm / 2) * Math.cos(t) + (B.cardHeightMm / 2) * Math.sin(t), y: cy + (-B.cardWidthMm / 2) * Math.sin(t) - (B.cardHeightMm / 2) * Math.cos(t) };
    const mapped = cardLocalToBoardMm(info, board.geometry, 0, 0);
    expect(mapped.x).toBeCloseTo(expected.x, 9);
    expect(mapped.y).toBeCloseTo(expected.y, 9);
    // Raster: a point 3 mm inside that corner along the card's own diagonal is card-white, 1 mm outside it is not
    const inside = cardLocalToBoardMm(info, board.geometry, 6, 6);
    const outside = cardLocalToBoardMm(info, board.geometry, B.cardWidthMm + 1.5, 20); // beyond the board's right edge
    const at = (p: { x: number; y: number }): number => {
      const q = boardMmToPixel(board, p.x, p.y);
      return board.image.data[Math.floor(q.y) * board.image.width + Math.floor(q.x)] as number;
    };
    expect(at(inside)).toBe(255);
    expect(at(outside)).toBe(B.tableGray);
  });

  it('zero errors with gapMm > 0 opens exactly that gap (gap is a parameter, never required)', () => {
    const g = physicalGeometry({ gapMm: 2 });
    const board = composeBoard(seededPlacements(2, 2, 2), g, { pxPerMm: 8, supersample: 2, tableMarginMm: 4 });
    const seam = boardMmToPixel(board, B.cardWidthMm + 1, B.cardHeightMm / 2);
    expect(board.image.data[Math.floor(seam.y) * board.image.width + Math.floor(seam.x)]).toBe(B.tableGray);
    expect(vertexMm(g, 0, 0)).toEqual({ x: B.cardWidthMm + 1, y: B.cardHeightMm + 1 });
  });
});

// ---------------------------------------------------------------------------------------------
// Composer smoke check with the real decoder (identity is never passed in; compared afterwards)
// ---------------------------------------------------------------------------------------------

describe('composer smoke check with decodeGroup (8 seeded baseline boards, no placement error; NOT the 5.6 experiment)', () => {
  it('decodeGroup receives only pixels; results are compared with the ground truth afterwards', () => {
    const outcomes: string[] = [];
    for (let seed = 100; seed < 108; seed++) {
      const arr = focusArrangement(seed);
      const board = composeBoard(arr, {}, { pxPerMm: 8 / M, supersample: 3 });
      const result = decodeGroup(board.image); // no expected card, board state or geometry is passed
      const truth = board.cards.map((c) => c.card).sort();
      outcomes.push(result.kind === 'IDENTIFIED' ? ([...result.cards].sort().join(',') === truth.join(',') ? 'ok' : 'WRONG') : result.kind);
    }
    expect(outcomes).toEqual(Array(8).fill('ok'));
  });
});
