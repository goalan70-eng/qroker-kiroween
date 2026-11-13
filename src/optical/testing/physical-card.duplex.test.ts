/**
 * Task 5.5 tests: double-sided rendering and flip equivalence (Requirement 16.2-16.8; Properties 29, 30, 31).
 * SYNTHETIC images only. Nothing here is evidence about a real duplex printer, real paper, real show-through
 * (Requirement 16.10, Milestone 8) or a real camera.
 *
 * Independent references (none of them calls the implementation's mirror, flip or containment code):
 *  - the front body-frame raster is render.ts renderCardLayer(card, 0);
 *  - the back body-frame raster, the post-flip view and the horizontal-axis view are derived here with explicit
 *    index arithmetic (out[y*w + (w-1-x)] = in[y*w + x], and so on) from that raster;
 *  - the mirrored fragment content is derived bit by bit (bit 5r+c -> bit 5r+(4-c)), the corner sets are written
 *    out from design.md section 7;
 *  - clearance is the rounded-box signed distance of displaced footprint grid points, the rotation chord uses the
 *    footprint corner distance computed here.
 * Card identity is read from the IMAGE only (detectMarkers -> decodeFragment); the expected card is used only in
 * the final comparison.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ALL_CARDS, printedFragments, placedFragments, type Corner, type Orientation } from '../fragments';
import { renderCardLayer, type GrayImage } from '../render';
import { detectMarkers, type DetectedMarker } from '../detect';
import { decodeFragment } from '../decode-fragment';
import {
  ARTWORK_PROBE,
  BASELINE_GEOMETRY,
  CARD_FACES,
  DEFAULT_PX_PER_MM,
  composeBoard,
  duplexContainment,
  flipCard,
  markerContainment,
  mirrorMarkerLayer,
  observeArtwork,
  observeFace,
  physicalGeometry,
  printLayers,
  printLayersUnmirrored,
  renderArtworkLayer,
  renderMarkerLayer,
  renderPhysicalCard,
  seededPlacements,
  type DuplexOptions,
  type FlipAxis,
  type MarkerLayer,
  type ObservedMarkerLayer,
  type PhysicalGeometry,
  type RectMm,
} from './physical-card';

const B = BASELINE_GEOMETRY;
const W = B.cardWidthMm;
const H = B.cardHeightMm;
const CORNERS: readonly Corner[] = ['TL', 'TR', 'BL', 'BR'];
const ORIENTATIONS: readonly Orientation[] = [0, 180];
const FLIP_V = flipCard('VERTICAL');
const FLIP_H = flipCard('HORIZONTAL');
const FROZEN_SHA256 = '515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4';

/** design.md section 7 "Corner sets", written out literally. */
const FRONT_SET: Record<string, readonly Corner[]> = { H: ['TL', 'BR'], D: ['TR', 'BL'], C: ['TR', 'BR'], S: ['TL', 'BL'] };
const BACK_SET: Record<string, readonly Corner[]> = { H: ['TR', 'BL'], D: ['TL', 'BR'], C: ['TL', 'BL'], S: ['TR', 'BR'] };
const suitOf = (card: string): string => card.charAt(0);
const sorted = (cs: readonly Corner[]): string[] => [...cs].sort();
const cornersOf = (p: Readonly<Partial<Record<Corner, number>>>): Corner[] => CORNERS.filter((c) => p[c] !== undefined);

// ---------------------------------------------------------------------------------------------
// Independent references
// ---------------------------------------------------------------------------------------------

function refMirrorLR(img: GrayImage): GrayImage {
  const out = new Uint8Array(img.data.length);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) out[y * img.width + (img.width - 1 - x)] = img.data[y * img.width + x] as number;
  return { width: img.width, height: img.height, data: out };
}
function refMirrorTB(img: GrayImage): GrayImage {
  const out = new Uint8Array(img.data.length);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) out[(img.height - 1 - y) * img.width + x] = img.data[y * img.width + x] as number;
  return { width: img.width, height: img.height, data: out };
}
function refRot180(img: GrayImage): GrayImage {
  const out = new Uint8Array(img.data.length);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) out[(img.height - 1 - y) * img.width + (img.width - 1 - x)] = img.data[y * img.width + x] as number;
  }
  return { width: img.width, height: img.height, data: out };
}
function sameBytes(a: GrayImage, b: GrayImage): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
  return true;
}
/** Bit 5r+c of the input goes to bit 5r+(4-c): left-right mirror of the 5 x 5 cell map. */
function refMirrorBits(p: number): number {
  let out = 0;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if ((p >> (5 * r + c)) & 1) out |= 1 << (5 * r + (4 - c));
  return out >>> 0;
}
const LR: Record<Corner, Corner> = { TL: 'TR', TR: 'TL', BL: 'BR', BR: 'BL' };

/** Expected view of a card from its front raster, by index arithmetic only (design.md section 7 derivation). */
function refView(card: string, face: 'FRONT' | 'BACK', o: Orientation, axis: FlipAxis | null): GrayImage {
  const front0 = renderCardLayer(card, 0);
  let v: GrayImage;
  if (face === 'FRONT') v = front0;
  else {
    const backBody = refMirrorLR(front0); // B(x, y) = F(W - x, y)
    v = axis === 'HORIZONTAL' ? refMirrorTB(backBody) : refMirrorLR(backBody); // physical flip
  }
  return o === 180 ? refRot180(v) : v;
}

function refClearance(x: number, y: number, w: number, h: number, r: number): number {
  const qx = Math.abs(x - w / 2) - (w / 2 - r);
  const qy = Math.abs(y - h / 2) - (h / 2 - r);
  return r - (Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0));
}
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
/** Grid points (step <= 0.1 mm, corners included) of the footprints of the given corners. */
function footprintPoints(g: PhysicalGeometry, corners: readonly Corner[], step = 0.1): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const fps = refFootprints(g);
  for (const c of corners) {
    const f = fps[c];
    const nx = Math.ceil((f.x1 - f.x0) / step);
    const ny = Math.ceil((f.y1 - f.y0) / step);
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) out.push([i === nx ? f.x1 : f.x0 + (i * (f.x1 - f.x0)) / nx, j === ny ? f.y1 : f.y0 + (j * (f.y1 - f.y0)) / ny]);
  }
  return out;
}
/** Minimum rounded-box clearance of the footprint points after: rotate by rot about the card centre, translate by (tx, ty). */
function refDisplacedClearance(g: PhysicalGeometry, corners: readonly Corner[], tx: number, ty: number, rotDeg: number): number {
  const t = (rotDeg * Math.PI) / 180;
  let best = Infinity;
  for (const [x, y] of footprintPoints(g, corners)) {
    const dx = x - g.cardWidthMm / 2;
    const dy = y - g.cardHeightMm / 2;
    const bx = g.cardWidthMm / 2 + dx * Math.cos(t) - dy * Math.sin(t) + tx;
    const by = g.cardHeightMm / 2 + dx * Math.sin(t) + dy * Math.cos(t) + ty;
    best = Math.min(best, refClearance(bx, by, g.cardWidthMm, g.cardHeightMm, g.cornerRadiusMm));
  }
  return best;
}
function refFootprintRadius(g: PhysicalGeometry): number {
  let rho = 0;
  for (const f of Object.values(refFootprints(g))) {
    for (const [x, y] of [[f.x0, f.y0], [f.x1, f.y0], [f.x0, f.y1], [f.x1, f.y1]] as const) {
      rho = Math.max(rho, Math.hypot(x - g.cardWidthMm / 2, y - g.cardHeightMm / 2));
    }
  }
  return rho;
}

// ---------------------------------------------------------------------------------------------
// Observations decoded from the image only (memoized: each rasterization is shared by several tests)
// ---------------------------------------------------------------------------------------------

type View = { face: 'FRONT' | 'BACK'; axis: FlipAxis | null };
const FRONT_VIEW: View = { face: 'FRONT', axis: null };
const V_VIEW: View = { face: 'BACK', axis: 'VERTICAL' };
const H_VIEW: View = { face: 'BACK', axis: 'HORIZONTAL' };

const obsMemo = new Map<string, ObservedMarkerLayer>();
function observe(card: string, v: View, o: Orientation): ObservedMarkerLayer {
  const key = `${card}|${v.face}|${v.axis}|${o}`;
  let r = obsMemo.get(key);
  if (r === undefined) {
    r = observeFace(card, v.face, o, v.axis === null ? undefined : flipCard(v.axis));
    obsMemo.set(key, r);
  }
  return r;
}

interface Reading {
  kind: string;
  /** center, bits, rotation and corner points, rounded to 1e-6, in the detector's own order. */
  markers: Array<{ cx: number; cy: number; bits: number; rot: number; corners: number[] }>;
  ids: Array<{ status: string; card?: string }>;
}
const q6 = (n: number): number => Math.round(n * 1e6) / 1e6;
function read(img: GrayImage): Reading {
  const d = detectMarkers(img);
  if (d.kind !== 'DETECTED') return { kind: d.kind, markers: [], ids: [] };
  return {
    kind: d.kind,
    markers: d.markers.map((m: DetectedMarker) => ({
      cx: q6(m.center.x),
      cy: q6(m.center.y),
      bits: m.bits,
      rot: q6(m.rotationDeg),
      corners: m.corners.flatMap((p) => [q6(p.x), q6(p.y)]),
    })),
    ids: d.markers.map((m) => {
      const o = decodeFragment(m);
      return o.status === 'IDENTIFIED' ? { status: o.status, card: o.card } : { status: o.status };
    }),
  };
}
const readMemo = new Map<string, Reading>();
function readObs(card: string, v: View, o: Orientation): Reading {
  const key = `${card}|${v.face}|${v.axis}|${o}`;
  let r = readMemo.get(key);
  if (r === undefined) {
    r = read(observe(card, v, o).image);
    readMemo.set(key, r);
  }
  return r;
}
/** Which view corner a detected marker centre lies in (image quadrant). */
function cornerOfCentre(cx: number, cy: number, img: GrayImage): Corner {
  return `${cy < img.height / 2 ? 'T' : 'B'}${cx < img.width / 2 ? 'L' : 'R'}` as Corner;
}

const LONG = 300_000;

// ---------------------------------------------------------------------------------------------
describe('Task 5.5 double-sided: print layers (Property 30, Requirement 16.2, 16.6, 16.7)', () => {
  it('exports the faces and flips', () => {
    expect(CARD_FACES).toEqual(['FRONT', 'BACK']);
    expect(flipCard('VERTICAL')).toEqual({ axis: 'VERTICAL', viewTransform: 'Fv' });
    expect(flipCard('HORIZONTAL')).toEqual({ axis: 'HORIZONTAL', viewTransform: 'Fh' });
    expect(() => flipCard('DIAGONAL' as unknown as FlipAxis)).toThrow(RangeError);
  });

  it('front corner sets follow Fragment_Layout and the back is the left-right mirrored set, for all 52 cards', () => {
    let n = 0;
    for (const card of ALL_CARDS) {
      const L = printLayers(card);
      expect(L.card).toBe(card);
      expect(L.front.face).toBe('FRONT');
      expect(L.back.face).toBe('BACK');
      expect(sorted(cornersOf(L.front.patterns))).toEqual(sorted(FRONT_SET[suitOf(card)] as Corner[]));
      expect(sorted(cornersOf(L.back.patterns))).toEqual(sorted(BACK_SET[suitOf(card)] as Corner[]));
      n++;
    }
    expect(n).toBe(52);
  });

  it('front and back corner sets are disjoint for all four suits and for all 52 cards', () => {
    for (const s of ['H', 'D', 'C', 'S']) {
      const f = FRONT_SET[s] as Corner[];
      const b = BACK_SET[s] as Corner[];
      expect(f.filter((c) => b.includes(c))).toEqual([]);
      expect(sorted([...f, ...b])).toEqual(sorted(CORNERS)); // together they cover all four corners exactly once
      expect(sorted(f.map((c) => LR[c]))).toEqual(sorted(b)); // back set = left-right mirror of the front set
    }
    for (const card of ALL_CARDS) {
      const L = printLayers(card);
      const fc_ = cornersOf(L.front.patterns);
      expect(cornersOf(L.back.patterns).filter((c) => fc_.includes(c))).toEqual([]);
    }
  });

  it('back patterns are the Fv-mirrored front patterns at mirrored corners (bit arithmetic written here), for all 52 cards', () => {
    for (const card of ALL_CARDS) {
      const L = printLayers(card);
      const expected: Partial<Record<Corner, number>> = {};
      for (const c of CORNERS) {
        const p = L.front.patterns[c];
        if (p !== undefined) expected[LR[c]] = refMirrorBits(p);
      }
      expect({ ...L.back.patterns }).toEqual(expected);
      // the mirrored content really differs from the unmirrored content (the codebook patterns are not left-right symmetric)
      for (const c of CORNERS) {
        const p = L.front.patterns[c];
        if (p !== undefined) expect(refMirrorBits(p)).not.toBe(p);
      }
    }
  });

  it('Body_Frame rasters: front = renderCardLayer, back = per-row reversal of the front, back differs from front (all 52)', () => {
    for (const card of ALL_CARDS) {
      const L = printLayers(card);
      const front = renderMarkerLayer(L.front);
      const back = renderMarkerLayer(L.back);
      const oracleFront = renderCardLayer(card, 0);
      expect(front.width).toBe(oracleFront.width);
      expect(front.height).toBe(oracleFront.height);
      expect(sameBytes(front, oracleFront)).toBe(true);
      expect(sameBytes(back, refMirrorLR(oracleFront))).toBe(true);
      expect(sameBytes(back, front)).toBe(false);
    }
  }, LONG);

  it('back layer is a pure function of the card: arity 1, repeatable, independent of order, neighbours and boards', () => {
    expect(printLayers.length).toBe(1);
    const snapshot = (): string => JSON.stringify(ALL_CARDS.map((c) => printLayers(c)));
    const first = snapshot();
    // compose boards with many different neighbours / orientations / errors in between
    for (const seed of [1, 2, 3, 4]) {
      composeBoard(seededPlacements(seed, 3, 3), {}, { errors: { seed, maxShiftMm: 1, maxRotationDeg: 3 }, pxPerMm: 1, supersample: 1 });
    }
    expect(snapshot()).toBe(first);
    const reversed = [...ALL_CARDS].reverse().map((c) => printLayers(c)).reverse();
    expect(JSON.stringify(reversed)).toBe(first);
    // back is a function of the front layer alone
    for (const card of ALL_CARDS) {
      const L = printLayers(card);
      expect(JSON.stringify(mirrorMarkerLayer(L.front))).toBe(JSON.stringify(L.back));
    }
  });

  it('no substitute fragments: every back pattern decodes to the SAME card from the image-free bit reading', () => {
    for (const card of ALL_CARDS) {
      for (const c of CORNERS) {
        const p = printLayers(card).back.patterns[c];
        if (p === undefined) continue;
        const out = decodeFragment(p);
        expect(out.status).toBe('IDENTIFIED');
        if (out.status === 'IDENTIFIED') expect(out.card).toBe(card);
      }
    }
  });

  /** **Validates: Requirements 16.2** */
  it('property: mirrorMarkerLayer(any FRONT layer) = mirrored corners + mirrored bits, using only that layer', () => {
    const corner = fc.constantFrom(...CORNERS);
    const layer = fc.dictionary(corner, fc.integer({ min: 0, max: 2 ** 25 - 1 }), { minKeys: 1, maxKeys: 4 });
    fc.assert(
      fc.property(layer, (patterns) => {
        const front: MarkerLayer = { face: 'FRONT', patterns };
        const back = mirrorMarkerLayer(front);
        const expected: Partial<Record<Corner, number>> = {};
        for (const c of CORNERS) {
          const p = patterns[c];
          if (p !== undefined) expected[LR[c]] = refMirrorBits(p);
        }
        expect(back.face).toBe('BACK');
        expect({ ...back.patterns }).toEqual(expected);
      }),
      { numRuns: 200 },
    );
  });

  it('mirrorMarkerLayer rejects a BACK layer and malformed patterns', () => {
    expect(() => mirrorMarkerLayer(printLayers('H-A').back)).toThrow(RangeError);
    expect(() => mirrorMarkerLayer({ face: 'FRONT', patterns: { TL: 2 ** 25 } })).toThrow(RangeError);
    expect(() => mirrorMarkerLayer({ face: 'FRONT', patterns: { TL: -1 } })).toThrow(RangeError);
    expect(() => mirrorMarkerLayer({ face: 'FRONT', patterns: { TL: 1.5 } })).toThrow(RangeError);
    expect(() => printLayers('Z-9')).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Task 5.5 double-sided: artwork probe is kept separate and never mirrored (Requirement 16.6)', () => {
  const PROBE_F = ['#####', '#....', '####.', '#....', '#....', '#....', '#....'];
  const reverseRows = (rows: readonly string[]): string[] => rows.map((r) => [...r].reverse().join(''));

  it('the probe is the asymmetric glyph F, and its mirror image differs', () => {
    expect([...ARTWORK_PROBE.rows]).toEqual(PROBE_F);
    expect(reverseRows(PROBE_F)).not.toEqual(PROBE_F);
    expect([...PROBE_F].reverse()).not.toEqual(PROBE_F);
  });

  it('both faces carry the unchanged probe while the marker layer is mirrored', () => {
    const L = printLayers('S-Q');
    expect([...L.artwork.front.probe.rows]).toEqual(PROBE_F);
    expect([...L.artwork.back.probe.rows]).toEqual(PROBE_F);
    expect([...L.artwork.back.probe.rows]).not.toEqual(reverseRows(PROBE_F));
    expect(cornersOf(L.back.patterns)).not.toEqual(cornersOf(L.front.patterns));
  });

  it('artwork rasters: back == front, back != its left-right mirror; marker rasters: back == mirror(front), back != front', () => {
    const L = printLayers('H-7');
    const aFront = renderArtworkLayer(L.artwork.front);
    const aBack = renderArtworkLayer(L.artwork.back);
    expect(sameBytes(aBack, aFront)).toBe(true);
    expect(sameBytes(aBack, refMirrorLR(aFront))).toBe(false);
    expect(aFront.data.some((v) => v === 0)).toBe(true);
    // glyph pixels written independently: cell (col 0, row 0) is black, cell (col 4, row 1) is white
    const cell = ARTWORK_PROBE.cellModules * 4; // pixels per cell at 4 px per module
    const px = (col: number, row: number): number =>
      aFront.data[(ARTWORK_PROBE.originModule.y * 4 + row * cell + 1) * aFront.width + ARTWORK_PROBE.originModule.x * 4 + col * cell + 1] as number;
    expect(px(0, 0)).toBe(0);
    expect(px(4, 1)).toBe(255);
    expect(px(0, 6)).toBe(0);
    expect(px(1, 6)).toBe(255);
    const mFront = renderMarkerLayer(L.front);
    const mBack = renderMarkerLayer(L.back);
    expect(sameBytes(mBack, refMirrorLR(mFront))).toBe(true);
    expect(sameBytes(mBack, mFront)).toBe(false);
  });

  it('observed artwork after a vertical-axis flip is the front artwork (not mirrored); markers and artwork are rendered separately', () => {
    for (const o of ORIENTATIONS) {
      const front = observeArtwork('D-3', 'FRONT', o);
      const back = observeArtwork('D-3', 'BACK', o, FLIP_V);
      expect(sameBytes(back, front)).toBe(true);
      expect(sameBytes(back, refMirrorLR(front))).toBe(false);
    }
    const front0 = observeArtwork('D-3', 'FRONT', 0);
    expect(sameBytes(observeArtwork('D-3', 'FRONT', 180), refRot180(front0))).toBe(true);
    expect(sameBytes(observeArtwork('D-3', 'BACK', 0, FLIP_H), refRot180(front0))).toBe(true);
    // the artwork never appears in the marker observation and vice versa
    const marker = observe('D-3', FRONT_VIEW, 0);
    expect(sameBytes(marker.print, front0)).toBe(false);
    // no probe pixel lies inside any marker footprint (so the two layers do not interfere)
    const prints = marker.print;
    const slots = refFootprints(B);
    for (const f of Object.values(slots)) {
      const x0 = Math.floor(f.x0 * DEFAULT_PX_PER_MM);
      const x1 = Math.ceil(f.x1 * DEFAULT_PX_PER_MM);
      const y0 = Math.floor(f.y0 * DEFAULT_PX_PER_MM);
      const y1 = Math.ceil(f.y1 * DEFAULT_PX_PER_MM);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) expect(front0.data[y * prints.width + x]).toBe(255);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('Task 5.5 double-sided: observation API', () => {
  it('FRONT observation at zero error equals the existing single-card renderer and placedFragments (all 52 x {0,180})', () => {
    for (const card of ALL_CARDS) {
      for (const o of ORIENTATIONS) {
        const obs = observe(card, FRONT_VIEW, o);
        const ref = renderPhysicalCard(card, o);
        expect(sameBytes(obs.image, ref.image)).toBe(true);
        expect(sameBytes(obs.print, ref.print)).toBe(true);
        expect(sameBytes(obs.print, renderCardLayer(card, o))).toBe(true);
        expect({ ...obs.patterns }).toEqual({ ...placedFragments(card, o) });
        expect(obs.flip).toBeNull();
      }
    }
  }, LONG);

  it('rejects unsupported orientations, a flip on the FRONT, unknown faces, flips, cards, errors and foreign layers', () => {
    expect(() => observeFace('H-A', 'FRONT', 90 as unknown as Orientation)).toThrow(RangeError);
    expect(() => observeFace('H-A', 'BACK', 270 as unknown as Orientation, FLIP_V)).toThrow(RangeError);
    expect(() => observeFace('H-A', 'FRONT', 0, FLIP_V)).toThrow(RangeError);
    expect(() => observeFace('H-A', 'SIDE' as never, 0)).toThrow(RangeError);
    expect(() => observeFace('H-A', 'BACK', 0, { axis: 'DIAGONAL', viewTransform: 'Fv' } as never)).toThrow(RangeError);
    expect(() => observeFace('Z-9', 'FRONT', 0)).toThrow(RangeError);
    expect(() => observeFace('H-A', 'BACK', 0, FLIP_V, { layers: printLayers('H-2') })).toThrow(RangeError);
    expect(() => observeFace('H-A', 'BACK', 0, FLIP_V, { duplexRegistration: { dxMm: NaN, dyMm: 0, rotDeg: 0 } })).toThrow(RangeError);
    expect(() => observeFace('H-A', 'BACK', 0, FLIP_V, { cutOffsetMm: { dxMm: 0, dyMm: Infinity } })).toThrow(RangeError);
    expect(() => observeFace('H-A', 'FRONT', 0, undefined, { pxPerMm: 0 })).toThrow(RangeError);
    expect(() => duplexContainment({}, { duplexRegistration: { dxMm: 0, dyMm: 0, rotDeg: NaN } })).toThrow(RangeError);
    // the default flip of the BACK face is the vertical-axis flip
    expect(observeFace('H-A', 'BACK', 0).flip).toEqual(FLIP_V);
  });

  it('is deterministic: repeated observations (also with errors) are byte-identical', () => {
    const opt: DuplexOptions = { duplexRegistration: { dxMm: 0.31, dyMm: -0.2, rotDeg: 0.7 }, cutOffsetMm: { dxMm: 0.1, dyMm: 0.15 } };
    const a = observeFace('C-9', 'BACK', 180, FLIP_H, opt);
    const b = observeFace('C-9', 'BACK', 180, FLIP_H, opt);
    expect(sameBytes(a.image, b.image)).toBe(true);
    expect(sameBytes(a.print, b.print)).toBe(true);
    expect(a.patterns).toEqual(b.patterns);
    const c = observeFace('C-9', 'BACK', 180, FLIP_H, { ...opt, duplexRegistration: { dxMm: 0.31, dyMm: -0.2, rotDeg: 0.71 } });
    expect(sameBytes(a.print, c.print)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Task 5.5 double-sided: flip equivalence (Property 29, Requirement 16.3, 16.4)', () => {
  const tally = { vertical: 0, horizontal: 0, ids: 0 };

  /** **Validates: Requirements 16.3** */
  it('vertical-axis flip: marker layer of the BACK face is pixel-identical to the FRONT observation (52 x {0,180})', () => {
    for (const card of ALL_CARDS) {
      for (const o of ORIENTATIONS) {
        const f = observe(card, FRONT_VIEW, o);
        const b = observe(card, V_VIEW, o);
        // pixels (clipped image and ink layer) and structural bits/positions
        expect(sameBytes(b.image, f.image)).toBe(true);
        expect(sameBytes(b.print, f.print)).toBe(true);
        expect({ ...b.patterns }).toEqual({ ...f.patterns });
        // independent oracle: front raster -> back body raster (reversal) -> flip (reversal) -> orientation
        expect(sameBytes(b.print, refView(card, 'BACK', o, 'VERTICAL'))).toBe(true);
        expect(sameBytes(b.print, refView(card, 'FRONT', o, null))).toBe(true);
        // positions, bits and card id from the image only
        const rf = readObs(card, FRONT_VIEW, o);
        const rb = readObs(card, V_VIEW, o);
        expect(rf.kind).toBe('DETECTED');
        expect(rf.markers).toHaveLength(2);
        expect(rb).toEqual(rf);
        expect(rb.ids.map((x) => x.card)).toEqual([card, card]);
        tally.vertical++;
      }
    }
    expect(tally.vertical).toBe(104);
  }, LONG);

  /** **Validates: Requirements 16.4** */
  it('horizontal-axis flip equals the FRONT observation at the opposite allowed orientation (52 x {0,180})', () => {
    for (const card of ALL_CARDS) {
      for (const o of ORIENTATIONS) {
        const opposite: Orientation = o === 0 ? 180 : 0;
        const h = observe(card, H_VIEW, o);
        const f = observe(card, FRONT_VIEW, opposite);
        expect(sameBytes(h.image, f.image)).toBe(true);
        expect(sameBytes(h.print, f.print)).toBe(true);
        expect({ ...h.patterns }).toEqual({ ...f.patterns });
        expect({ ...h.patterns }).toEqual({ ...placedFragments(card, opposite) });
        // independent oracle: vertical flip view rotated by 180 degrees in the plane
        expect(sameBytes(h.print, refView(card, 'BACK', o, 'HORIZONTAL'))).toBe(true);
        expect(sameBytes(h.print, refRot180(refView(card, 'BACK', o, 'VERTICAL')))).toBe(true);
        expect(readObs(card, H_VIEW, o)).toEqual(readObs(card, FRONT_VIEW, opposite));
        tally.horizontal++;
      }
    }
    expect(tally.horizontal).toBe(104);
  }, LONG);

  it('card identity is preserved under every supported flip and orientation; 90/270 observations never arise', () => {
    const views: View[] = [FRONT_VIEW, V_VIEW, H_VIEW];
    let reads = 0;
    for (const card of ALL_CARDS) {
      for (const v of views) {
        for (const o of ORIENTATIONS) {
          const r = readObs(card, v, o);
          expect(r.kind).toBe('DETECTED');
          expect(r.ids).toHaveLength(2);
          for (const id of r.ids) {
            expect(id.status).toBe('IDENTIFIED');
            expect(id.card).toBe(card);
          }
          // detected marker orientation stays within the allowed 0/180 family (canonical rotation ~ 0)
          for (const m of r.markers) expect(Math.abs(m.rot)).toBeLessThan(1);
          reads++;
        }
      }
    }
    tally.ids = reads;
    expect(reads).toBe(52 * 3 * 2);
    // positions of the decoded markers are exactly the corner sets of the equivalent front observation
    for (const card of ALL_CARDS) {
      for (const o of ORIENTATIONS) {
        const img = observe(card, V_VIEW, o).image;
        const got = readObs(card, V_VIEW, o).markers.map((m) => cornerOfCentre(m.cx, m.cy, img));
        expect(sorted(got)).toEqual(sorted(cornersOf(placedFragments(card, o))));
      }
    }
  }, LONG);

});

// ---------------------------------------------------------------------------------------------
describe('Task 5.5 double-sided: the same raster on both faces is rejected (Property 30, Requirement 16.5)', () => {
  /** The acceptance check applied to a candidate printing model: back observation must equal the front observation. */
  function accepts(front: ObservedMarkerLayer, back: ObservedMarkerLayer, rf: Reading, rb: Reading): boolean {
    return (
      sameBytes(back.image, front.image) &&
      sameBytes(back.print, front.print) &&
      JSON.stringify(back.patterns) === JSON.stringify(front.patterns) &&
      JSON.stringify(rb) === JSON.stringify(rf)
    );
  }

  it('printLayersUnmirrored prints identical Body_Frame patterns and rasters on both faces', () => {
    for (const card of ['H-A', 'D-K', 'C-7', 'S-Q']) {
      const L = printLayersUnmirrored(card);
      expect({ ...L.back.patterns }).toEqual({ ...L.front.patterns });
      expect(sameBytes(renderMarkerLayer(L.back), renderMarkerLayer(L.front))).toBe(true);
    }
  });

  it('for every card and orientation the post-flip observation differs in corner positions and bits, and is rejected; the real model is accepted', () => {
    let different = 0;
    let positionsDiffer = 0;
    let bitsDiffer = 0;
    let rejected = 0;
    let accepted = 0;
    for (const card of ALL_CARDS) {
      const naive = printLayersUnmirrored(card);
      for (const o of ORIENTATIONS) {
        const front = observe(card, FRONT_VIEW, o);
        const bad = observeFace(card, 'BACK', o, FLIP_V, { layers: naive });
        const rf = readObs(card, FRONT_VIEW, o);
        const rb = read(bad.image);
        // the failing mode is exactly the left-right reversal (index arithmetic written here)
        expect(sameBytes(bad.image, refMirrorLR(front.image))).toBe(true);
        expect(sameBytes(bad.print, refMirrorLR(front.print))).toBe(true);
        expect(sameBytes(bad.image, front.image)).toBe(false);
        // positions: the set of occupied view corners is not the front's
        const badCorners = sorted(cornersOf(bad.patterns));
        const frontCorners = sorted(cornersOf(front.patterns));
        if (JSON.stringify(badCorners) !== JSON.stringify(frontCorners)) positionsDiffer++;
        // the same positions read from the image, via the detector
        const imgCorners = sorted(rb.markers.map((m) => cornerOfCentre(m.cx, m.cy, bad.image)));
        expect(imgCorners).toEqual(badCorners);
        // bits: no marker bit pattern of the observation equals a front bit pattern at the same corner
        const frontBits = new Map(rf.markers.map((m) => [cornerOfCentre(m.cx, m.cy, front.image), m.bits]));
        const sameBitsAtSameCorner = rb.markers.filter((m) => frontBits.get(cornerOfCentre(m.cx, m.cy, bad.image)) === m.bits);
        if (sameBitsAtSameCorner.length === 0) bitsDiffer++;
        if (JSON.stringify(rb) !== JSON.stringify(rf)) different++;
        if (!accepts(front, bad, rf, rb)) rejected++;
        // the real model is accepted by the same check
        const good = observe(card, V_VIEW, o);
        if (accepts(front, good, rf, readObs(card, V_VIEW, o))) accepted++;
      }
    }
    expect(positionsDiffer).toBe(104);
    expect(bitsDiffer).toBe(104);
    expect(different).toBe(104);
    expect(rejected).toBe(104);
    expect(accepted).toBe(104);
  }, LONG);
});

// ---------------------------------------------------------------------------------------------
describe('Task 5.5 double-sided: registration and cut error move the markers as modelled (Requirement 16.8)', () => {
  const card = 'H-A';
  const px = DEFAULT_PX_PER_MM;
  const centres = (r: Reading): Array<{ cx: number; cy: number }> => r.markers.map((m) => ({ cx: m.cx, cy: m.cy }));

  it('back registration shift: view x moves by -dx (mirrored by the flip), view y by +dy', () => {
    const base = read(observeFace(card, 'BACK', 0, FLIP_V).image);
    const moved = read(observeFace(card, 'BACK', 0, FLIP_V, { duplexRegistration: { dxMm: 0.8, dyMm: 0.6, rotDeg: 0 } }).image);
    expect(moved.markers).toHaveLength(2);
    const a = centres(base);
    const b = centres(moved);
    for (let i = 0; i < 2; i++) {
      expect(Math.abs((b[i] as { cx: number }).cx - (a[i] as { cx: number }).cx - -0.8 * px)).toBeLessThan(0.35);
      expect(Math.abs((b[i] as { cy: number }).cy - (a[i] as { cy: number }).cy - 0.6 * px)).toBeLessThan(0.35);
    }
    // bits survive a sub-module shift (ideal conditions)
    expect(moved.markers.map((m) => m.bits)).toEqual(base.markers.map((m) => m.bits));
  });

  it('a horizontal-axis flip mirrors dy instead of dx', () => {
    const base = read(observeFace(card, 'BACK', 0, FLIP_H).image);
    const moved = read(observeFace(card, 'BACK', 0, FLIP_H, { duplexRegistration: { dxMm: 0.8, dyMm: 0.6, rotDeg: 0 } }).image);
    const a = centres(base);
    const b = centres(moved);
    for (let i = 0; i < 2; i++) {
      expect(Math.abs((b[i] as { cx: number }).cx - (a[i] as { cx: number }).cx - 0.8 * px)).toBeLessThan(0.35);
      expect(Math.abs((b[i] as { cy: number }).cy - (a[i] as { cy: number }).cy - -0.6 * px)).toBeLessThan(0.35);
    }
  });

  it('the FRONT is the reference: registration does not move it; the cut offset moves the print by minus the offset', () => {
    const base = read(observeFace(card, 'FRONT', 0).image);
    const reg = read(observeFace(card, 'FRONT', 0, undefined, { duplexRegistration: { dxMm: 0.8, dyMm: 0.6, rotDeg: 2 } }).image);
    expect(reg).toEqual(base);
    const cut = read(observeFace(card, 'FRONT', 0, undefined, { cutOffsetMm: { dxMm: 0.8, dyMm: -0.6 } }).image);
    const a = centres(base);
    const b = centres(cut);
    for (let i = 0; i < 2; i++) {
      expect(Math.abs((b[i] as { cx: number }).cx - (a[i] as { cx: number }).cx - -0.8 * px)).toBeLessThan(0.35);
      expect(Math.abs((b[i] as { cy: number }).cy - (a[i] as { cy: number }).cy - 0.6 * px)).toBeLessThan(0.35);
    }
  });

  it('a clockwise-from-the-front registration rotation reads counter-clockwise after the flip', () => {
    const base = read(observeFace(card, 'BACK', 0, FLIP_V).image);
    for (const theta of [2, -2]) {
      const rot = read(observeFace(card, 'BACK', 0, FLIP_V, { duplexRegistration: { dxMm: 0, dyMm: 0, rotDeg: theta } }).image);
      expect(rot.markers).toHaveLength(2);
      // The view is mirrored, so the rotation is by -theta in image coordinates (y down, forward rotation matrix),
      // about the raster centre. Expected centres are computed here from the unrotated centres.
      const phi = (-theta * Math.PI) / 180;
      const cx0 = (W * px) / 2;
      const cy0 = (H * px) / 2;
      for (let i = 0; i < 2; i++) {
        const a = base.markers[i] as { cx: number; cy: number; rot: number };
        const b = rot.markers[i] as { cx: number; cy: number; rot: number };
        const ex = cx0 + (a.cx - cx0) * Math.cos(phi) - (a.cy - cy0) * Math.sin(phi);
        const ey = cy0 + (a.cx - cx0) * Math.sin(phi) + (a.cy - cy0) * Math.cos(phi);
        expect(Math.abs(b.cx - ex)).toBeLessThan(0.4);
        expect(Math.abs(b.cy - ey)).toBeLessThan(0.4);
        // The detector's rotation estimate is coarse at 2 degrees (it reads -0.69 / +0.75 on these images), so only
        // the sign is asserted: counter-clockwise after the flip for a clockwise-from-the-front theta.
        expect(Math.sign(b.rot - a.rot)).toBe(-Math.sign(theta));
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('Task 5.5 double-sided: containment under registration and cut error (Property 31, Requirement 16.7, 16.8, 15.3)', () => {
  const RADII = [0, 2.0, 3.0, 3.175, 3.6, 4.0, 5.0, 6.0];
  const INSETS = [0.5, 1, 1.5, 2];

  it('zero error: both faces report exactly markerContainment, over the radius x inset sweep and three module sizes', () => {
    let cells = 0;
    for (const moduleMm of [1.2, 1.5875, 2.0]) {
      for (const r of RADII) {
        for (const inset of INSETS) {
          const geom: Partial<PhysicalGeometry> = { cornerRadiusMm: r, insetModules: inset, moduleMm };
          const g = physicalGeometry(geom);
          const m = markerContainment(g);
          const d = duplexContainment(g);
          for (const face of [d.front, d.back]) {
            expect(face.nominalClearanceMm).toBe(m.clearanceMm);
            expect(face.errorLossBoundMm).toBe(0);
            expect(face.clearanceMm).toBe(m.clearanceMm);
            expect(face.valid).toBe(m.valid);
            // independent geometry: all four footprints, zero displacement
            const ref = refDisplacedClearance(g, CORNERS, 0, 0, 0);
            expect(Math.abs(face.actualClearanceMm - ref)).toBeLessThan(1e-9);
          }
          expect(d.front.clearanceMm).toBe(d.back.clearanceMm);
          expect(d.front.actualClearanceMm).toBe(d.back.actualClearanceMm);
          expect(d.front.valid).toBe(d.back.valid);
          cells++;
        }
      }
    }
    expect(cells).toBe(96);
  });

  it('zero error: baseline clearance is 0.930 mm for both faces and both faces are valid', () => {
    const d = duplexContainment();
    expect(d.front.clearanceMm).toBeCloseTo(0.93, 3);
    expect(d.back.clearanceMm).toBeCloseTo(0.93, 3);
    expect(d.front.valid && d.back.valid && d.front.actualValid && d.back.actualValid).toBe(true);
    // 6 mm radius, inset 1 module: invalid on both faces
    const bad = duplexContainment({ cornerRadiusMm: 6 });
    expect(bad.front.valid).toBe(false);
    expect(bad.back.valid).toBe(false);
    expect(bad.front.reason).toContain('worst-case clearance');
  });

  /** **Validates: Requirements 16.7, 16.8, 15.3** */
  it('property: the guaranteed clearance subtracts the error magnitudes and never exceeds the exact displaced clearance', () => {
    fc.assert(
      fc.property(
        fc.record({
          radius: fc.double({ min: 0, max: 5, noNaN: true }),
          inset: fc.double({ min: 0.75, max: 2.5, noNaN: true }),
          cut: fc.record({ dxMm: fc.double({ min: -1, max: 1, noNaN: true }), dyMm: fc.double({ min: -1, max: 1, noNaN: true }) }),
          reg: fc.record({
            dxMm: fc.double({ min: -1, max: 1, noNaN: true }),
            dyMm: fc.double({ min: -1, max: 1, noNaN: true }),
            rotDeg: fc.double({ min: -3, max: 3, noNaN: true }),
          }),
        }),
        ({ radius, inset, cut, reg }) => {
          const g = physicalGeometry({ cornerRadiusMm: radius, insetModules: inset });
          const d = duplexContainment(g, { duplexRegistration: reg, cutOffsetMm: cut });
          const nominal = markerContainment(g).clearanceMm;
          const cutMag = Math.hypot(cut.dxMm, cut.dyMm);
          const chord = 2 * refFootprintRadius(g) * Math.sin((Math.abs(reg.rotDeg) * Math.PI) / 180 / 2);
          // guaranteed bound = nominal - error magnitudes (independent formula)
          expect(Math.abs(d.front.clearanceMm - (nominal - cutMag))).toBeLessThan(1e-9);
          expect(Math.abs(d.back.clearanceMm - (nominal - cutMag - Math.hypot(reg.dxMm, reg.dyMm) - chord))).toBeLessThan(1e-9);
          // exact displaced clearance from displaced footprint grid points (independent) is never below the bound
          const exactFront = refDisplacedClearance(g, CORNERS, -cut.dxMm, -cut.dyMm, 0);
          const exactBack = refDisplacedClearance(g, CORNERS, -cut.dxMm + reg.dxMm, -cut.dyMm + reg.dyMm, reg.rotDeg);
          expect(exactFront).toBeGreaterThanOrEqual(d.front.clearanceMm - 1e-9);
          expect(exactBack).toBeGreaterThanOrEqual(d.back.clearanceMm - 1e-9);
          // and the implementation's exact figure agrees with the reference
          expect(Math.abs(d.front.actualClearanceMm - exactFront)).toBeLessThan(1e-6);
          expect(Math.abs(d.back.actualClearanceMm - exactBack)).toBeLessThan(1e-6);
          // validity follows the sign of the guaranteed clearance
          expect(d.front.valid).toBe(d.front.clearanceMm > 0 && d.nominal.footprintFitsCard);
          expect(d.back.valid).toBe(d.back.clearanceMm > 0 && d.nominal.footprintFitsCard);
        },
      ),
      { numRuns: 120 },
    );
  }, LONG);

  it('the bound is tight: an outward diagonal shift of a corner footprint loses exactly the shift magnitude', () => {
    const g = physicalGeometry();
    const nominal = markerContainment(g).clearanceMm;
    const s = 0.3 * Math.SQRT2;
    const front = duplexContainment(g, { cutOffsetMm: { dxMm: 0.3, dyMm: 0.3 } }); // print moves (-0.3,-0.3), toward TL
    expect(front.front.actualClearanceMm).toBeCloseTo(nominal - s, 9);
    expect(front.front.clearanceMm).toBeCloseTo(nominal - s, 9);
    const back = duplexContainment(g, { duplexRegistration: { dxMm: -0.3, dyMm: -0.3, rotDeg: 0 } });
    expect(back.back.actualClearanceMm).toBeCloseTo(nominal - s, 9);
    expect(back.back.clearanceMm).toBeCloseTo(nominal - s, 9);
    expect(back.front.clearanceMm).toBe(nominal); // registration never touches the front
  });

  it('a shift along an edge is cheaper than the worst-case bound (the bound is conservative, not exact)', () => {
    const d = duplexContainment(physicalGeometry(), { duplexRegistration: { dxMm: 0.5, dyMm: 0, rotDeg: 0 } });
    expect(d.back.actualClearanceMm).toBeGreaterThan(d.back.clearanceMm + 0.1);
    expect(d.back.actualClearanceMm).toBeLessThan(d.nominal.clearanceMm);
  });

  it('reports the registration / cut values that invalidate containment at the baseline (and with inset 1.5)', () => {
    const g = physicalGeometry();
    const nominal = markerContainment(g).clearanceMm;
    const rho = refFootprintRadius(g);
    const rotLimitDeg = (2 * Math.asin(nominal / (2 * rho)) * 180) / Math.PI; // chord = nominal clearance
    // translation: just below / above the clearance, along the worst-case diagonal
    const below = (nominal * 0.95) / Math.SQRT2;
    const above = (nominal * 1.05) / Math.SQRT2;
    const okV = duplexContainment(g, { duplexRegistration: { dxMm: -below, dyMm: -below, rotDeg: 0 } });
    const badV = duplexContainment(g, { duplexRegistration: { dxMm: -above, dyMm: -above, rotDeg: 0 } });
    expect(okV.back.valid && okV.back.actualValid).toBe(true);
    expect(badV.back.valid).toBe(false);
    expect(badV.back.actualValid).toBe(false);
    expect(badV.front.valid).toBe(true);
    // rotation: bound turns invalid at rotLimitDeg
    const rotOk = duplexContainment(g, { duplexRegistration: { dxMm: 0, dyMm: 0, rotDeg: rotLimitDeg * 0.95 } });
    const rotBad = duplexContainment(g, { duplexRegistration: { dxMm: 0, dyMm: 0, rotDeg: rotLimitDeg * 1.05 } });
    expect(rotOk.back.valid).toBe(true);
    expect(rotBad.back.valid).toBe(false);
    expect(rotBad.back.actualClearanceMm).toBeGreaterThanOrEqual(rotBad.back.clearanceMm);
    // limits used in the report
    expect(nominal).toBeCloseTo(0.93, 3);
    expect(rotLimitDeg).toBeGreaterThan(0.9);
    expect(rotLimitDeg).toBeLessThan(1.2);
    const g15 = physicalGeometry({ insetModules: 1.5 });
    expect(markerContainment(g15).clearanceMm).toBeCloseTo(2.05, 2);
    // rotation-only limit with inset 1.5 modules (figure quoted in the report)
    const nominal15 = markerContainment(g15).clearanceMm;
    const limit15 = (2 * Math.asin(nominal15 / (2 * refFootprintRadius(g15))) * 180) / Math.PI;
    expect(limit15).toBeGreaterThan(2.2);
    expect(limit15).toBeLessThan(2.4);
  });

  /** Pixels whose centre is inside a displaced footprint rect, whose paper was cut away (print white, image not). */
  function cutAwayPixels(obs: ObservedMarkerLayer, rects: RectMm[]): number {
    let n = 0;
    const { width: w, height: h } = obs.image;
    for (const r of rects) {
      for (let y = Math.floor(r.y0 * obs.pxPerMm); y < Math.ceil(r.y1 * obs.pxPerMm) && y < h; y++) {
        for (let x = Math.floor(r.x0 * obs.pxPerMm); x < Math.ceil(r.x1 * obs.pxPerMm) && x < w; x++) {
          if (x < 0 || y < 0) continue;
          const cx = (x + 0.5) / obs.pxPerMm;
          const cy = (y + 0.5) / obs.pxPerMm;
          if (cx < r.x0 || cx >= r.x1 || cy < r.y0 || cy >= r.y1) continue;
          if (obs.print.data[y * w + x] === 255 && (obs.image.data[y * w + x] as number) < 250) n++;
        }
      }
    }
    return n;
  }
  const shiftRect = (r: RectMm, dx: number, dy: number): RectMm => ({ x0: r.x0 + dx, y0: r.y0 + dy, x1: r.x1 + dx, y1: r.y1 + dy });
  const mirrorRectLR = (r: RectMm): RectMm => ({ x0: W - r.x1, y0: r.y0, x1: W - r.x0, y1: r.y1 });

  it('raster agrees with the geometry: valid error -> no paper cut away inside the footprints; invalid -> paper cut away', () => {
    const fps = refFootprints(B);
    // FRONT, cut offset (the outline moves, the print appears shifted by minus the offset)
    for (const [c, expectCut] of [[0.2, false], [1.0, true]] as const) {
      const obs = observeFace('H-A', 'FRONT', 0, undefined, { cutOffsetMm: { dxMm: c, dyMm: c } });
      const rects = (FRONT_SET.H as Corner[]).map((k) => shiftRect(fps[k], -c, -c));
      const exact = refDisplacedClearance(B, FRONT_SET.H as Corner[], -c, -c, 0);
      expect(exact > 0).toBe(!expectCut);
      expect(cutAwayPixels(obs, rects) > 0).toBe(expectCut);
    }
    // BACK of D-5 (back corners TL, BR in the Body_Frame), vertical-axis flip, registration shifts TL outward
    for (const [s, expectCut] of [[0.3, false], [0.9, true]] as const) {
      const obs = observeFace('D-5', 'BACK', 0, FLIP_V, { duplexRegistration: { dxMm: -s, dyMm: -s, rotDeg: 0 } });
      const rects = (BACK_SET.D as Corner[]).map((k) => mirrorRectLR(shiftRect(fps[k], -s, -s)));
      const exact = refDisplacedClearance(B, BACK_SET.D as Corner[], -s, -s, 0);
      expect(exact > 0).toBe(!expectCut);
      expect(cutAwayPixels(obs, rects) > 0).toBe(expectCut);
    }
  }, LONG);
});

// ---------------------------------------------------------------------------------------------
describe('Task 5.5 double-sided: frozen identities are unchanged', () => {
  it('codebook file hash, front layers and fragment identities are untouched by the double-sided model', () => {
    const file = fileURLToPath(new URL('../codebook.v1.json', import.meta.url));
    expect(createHash('sha256').update(readFileSync(file)).digest('hex').toUpperCase()).toBe(FROZEN_SHA256);
    expect(ALL_CARDS).toHaveLength(52);
    const before = JSON.stringify(ALL_CARDS.map((c) => printedFragments(c)));
    for (const c of ALL_CARDS) {
      printLayers(c);
      printLayersUnmirrored(c);
      expect({ ...printLayers(c).front.patterns }).toEqual({ ...printedFragments(c) });
    }
    expect(JSON.stringify(ALL_CARDS.map((c) => printedFragments(c)))).toBe(before);
    const front = printLayers('H-A').front;
    expect(Object.isFrozen(front)).toBe(true);
    expect(Object.isFrozen(front.patterns)).toBe(true);
    expect(() => {
      (front.patterns as Record<string, number>).TL = 0;
    }).toThrow();
  });
});
