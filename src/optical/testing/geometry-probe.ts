/**
 * TEST SUPPORT ONLY - stage-by-stage probe of ONE task 5.6 trial (used by the 45-degree analysis, M5.6 follow-up).
 * SYNTHETIC images, not real cameras.
 *
 * It re-uses the deterministic trial pieces of geometry-trial.ts (scenario, rasterizer, camera degradation) and
 * then calls the exported reader stages one by one: `detectMarkers`, `decodeFragment` per detected marker and
 * `decodeGroup`. The ground truth (where the four central markers are, which card each carries) is computed from
 * the scenario only AFTER the reader has run and is used for scoring, never given to the reader.
 *
 * Nothing in the reader, its thresholds or the geometry is changed. The only extra freedom over `runTrial` is an
 * optional override of the camera rotation angle and an optional sub-pixel image translation, so that the
 * dependence on the exact angle / pixel phase can be measured.
 */
import { detectMarkers, type DetectedMarker, type RejectedCandidate } from '../detect';
import { decodeFragment } from '../decode-fragment';
import { decodeGroup, type GroupDecodeResult, type Slot } from '../decode-group';
import type { Corner } from '../fragments';
import type { GrayImage } from '../render';
import type { CellParams } from './geometry-design';
import {
  CAMERA_DISTANCE_DIAGONALS,
  CAMERA_WARP_SUPERSAMPLE,
  buildScenario,
  classify,
  degradeImage,
  geometryOf,
  markerCenterOffsetModules,
  renderScenario,
  type BoardRaster,
  type PlacedCard,
  type Scenario,
} from './geometry-trial';
import { markerSlotsMm, type CardError, type PhysicalGeometry } from './physical-card';
import { compose, mat3Apply, rotationMatrix, tiltMatrix, translationMatrix, warpImage } from './warp';

export const SLOT_LIST: readonly Slot[] = ['TL', 'TR', 'BL', 'BR'];
const INWARD_CORNER: Record<Slot, Corner> = { TL: 'BR', TR: 'BL', BL: 'TR', BR: 'TL' };
const SLOT_ROW_COL: Record<Slot, [number, number]> = { TL: [0, 0], TR: [0, 1], BL: [1, 0], BR: [1, 1] };

/** Reader stage in which a trial first goes wrong. */
export type FirstFailingStage =
  | 'NONE'
  | 'MARKER_DETECTION_SILENT_DROP'
  | 'MARKER_DETECTION_REJECTED_CANDIDATE'
  | 'FRAGMENT_DECODING'
  | 'GROUP_CLUSTERING'
  | 'GROUP_ARRANGEMENT'
  | 'FALSE_ACCEPT';

export interface SlotProbe {
  slot: Slot;
  /** Where the marker centre must be in the image (from the layout and the camera warp). */
  truthCenter: { x: number; y: number };
  truthCard: string;
  /** Nearest detected marker (null when nothing was detected within 1 module = 1/7 of the marker edge of the truth centre). */
  detected: null | {
    distancePx: number;
    sizePx: number;
    rotationDeg: number;
    /** Reading by decodeFragment on the raw detector bits (any of the 8 transforms). */
    fragment: string;
  };
  /** Reason of the rejected candidate whose bounding box contains the truth centre, if any. */
  rejectedReason: string | null;
}

export interface TrialProbe {
  params: CellParams;
  seed: number;
  cameraRotationDeg: number;
  shiftPx: { x: number; y: number };
  imageSize: { width: number; height: number };
  markersDetected: number;
  rejectedCandidates: RejectedCandidate[];
  slots: SlotProbe[];
  group: GroupDecodeResult;
  cls: 'CORRECT' | 'REJECTED' | 'FALSE_ACCEPT';
  firstFailingStage: FirstFailingStage;
  image: GrayImage;
  markers: DetectedMarker[];
  scenario: Scenario;
}

export interface ProbeOptions {
  /** Camera rotation in degrees, replacing the value the cell would use. */
  cameraRotationDeg?: number;
  /** Extra image translation (pixels) applied after the rotation. Changes only the sub-pixel phase of the scene. */
  shiftPx?: { x: number; y: number };
  /** A central marker counts as detected when a detected marker lies within this many modules of its true centre (default 1). */
  matchToleranceModules?: number;
}

const origin = (g: PhysicalGeometry, p: CellParams, i: number, j: number, e: CardError): { ox: number; oy: number } => ({
  ox: j * (g.cardWidthMm + p.gapMm) + e.dxMm,
  oy: i * (g.cardHeightMm + p.gapMm) + e.dyMm,
});

/** Camera matrix used by `degradeImage` (rotation + perspective), optionally followed by a translation. */
export function cameraMatrix(raster: GrayImage, sc: Scenario, shiftPx: { x: number; y: number }): number[] {
  const cx = raster.width / 2;
  const cy = raster.height / 2;
  const diag = Math.hypot(raster.width, raster.height);
  return compose(
    tiltMatrix({ cx, cy, tiltDeg: sc.camera.tiltDeg, axisDeg: sc.camera.axisDeg, distancePx: CAMERA_DISTANCE_DIAGONALS * diag }),
    rotationMatrix(sc.camera.rotationDeg, cx, cy),
    translationMatrix(shiftPx.x, shiftPx.y),
  );
}

/** Image position of the centre of the marker that the card in `slot` of the focus group shows at the vertex. */
export function truthMarkerCenter(sc: Scenario, g: PhysicalGeometry, p: CellParams, raster: BoardRaster, H: readonly number[], slot: Slot): { x: number; y: number } {
  const [di, dj] = SLOT_ROW_COL[slot];
  const i = sc.focus.a - 1 + di;
  const j = sc.focus.b - 1 + dj;
  const e = (sc.errors[i] as CardError[])[j] as CardError;
  const { ox, oy } = origin(g, p, i, j, e);
  const core = markerSlotsMm(g)[INWARD_CORNER[slot]].core;
  // card frame -> board frame (rotation about the card centre, as in the rasterizer)
  const hw = g.cardWidthMm / 2;
  const hh = g.cardHeightMm / 2;
  const lx = (core.x0 + core.x1) / 2 - hw;
  const ly = (core.y0 + core.y1) / 2 - hh;
  const t = (e.rotationDeg * Math.PI) / 180;
  const X = ox + hw + lx * Math.cos(t) - ly * Math.sin(t);
  const Y = oy + hh + lx * Math.sin(t) + ly * Math.cos(t);
  return mat3Apply(H, (X - raster.regionMm.x0) * raster.pxPerMm, (Y - raster.regionMm.y0) * raster.pxPerMm);
}

function containsPoint(b: RejectedCandidate['bbox'], x: number, y: number): boolean {
  return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
}

/** One trial with the reader stages inspected separately. Pure function of (params, seed, options). */
export function probeTrial(p: CellParams, seed: number, options: ProbeOptions = {}): TrialProbe {
  const g = geometryOf(p);
  const sc = buildScenario(p, seed);
  if (options.cameraRotationDeg !== undefined) sc.camera.rotationDeg = options.cameraRotationDeg;
  const shift = options.shiftPx ?? { x: 0, y: 0 };
  const raster = renderScenario(sc, g);
  let image: GrayImage;
  if (shift.x === 0 && shift.y === 0) {
    image = degradeImage(raster.image, p, sc.camera, g.tableGray);
  } else {
    if (p.blurPx !== 0 || p.lightingStrength !== 0) throw new RangeError('shifted probes support only blur 0 and lighting 0');
    const H = cameraMatrix(raster.image, sc, shift);
    image = warpImage(raster.image, H, raster.image.width, raster.image.height, { background: g.tableGray, supersample: CAMERA_WARP_SUPERSAMPLE });
  }
  const H = cameraMatrix(raster.image, sc, shift);

  // Reader, stage 1: detection (exported API only).
  const det = detectMarkers(image);
  const markers = det.kind === 'DETECTED' ? det.markers : [];
  const rejected = det.kind === 'NOT_DETECTED' ? [] : det.rejected;
  // The layout offset is the only geometry given to the reader (see decodeScenarioImage); here the same call is made.
  const group = p.decoderLayout === 'MATCHED' ? decodeGroup(image, { centerOffsetModules: markerCenterOffsetModules(g) }) : decodeGroup(image);

  const slots: SlotProbe[] = SLOT_LIST.map((slot) => {
    const truthCenter = truthMarkerCenter(sc, g, p, raster, H, slot);
    const [di, dj] = SLOT_ROW_COL[slot];
    const card = (sc.cells[sc.focus.a - 1 + di] as Array<PlacedCard | null>)[sc.focus.b - 1 + dj];
    let best: DetectedMarker | null = null;
    let bestD = Infinity;
    for (const m of markers) {
      const d = Math.hypot(m.center.x - truthCenter.x, m.center.y - truthCenter.y);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    const moduleTol = best === null ? 0 : (best.sizePx / 7) * (options.matchToleranceModules ?? 1);
    let detected: SlotProbe['detected'] = null;
    if (best !== null && bestD <= moduleTol) {
      const o = decodeFragment(best);
      detected = {
        distancePx: bestD,
        sizePx: best.sizePx,
        rotationDeg: best.rotationDeg,
        fragment: o.status === 'IDENTIFIED' ? o.card : o.status,
      };
    }
    const rej = rejected.find((r) => containsPoint(r.bbox, truthCenter.x, truthCenter.y));
    return { slot, truthCenter, truthCard: card?.card ?? '(absent)', detected, rejectedReason: rej?.reason ?? null };
  });

  const scored = classify(group, sc, p, false);
  let stage: FirstFailingStage = 'NONE';
  if (scored.cls === 'FALSE_ACCEPT') stage = 'FALSE_ACCEPT';
  else if (scored.cls === 'REJECTED' && !p.absentCard) {
    const missing = slots.find((s) => s.detected === null);
    if (missing !== undefined) stage = missing.rejectedReason === null ? 'MARKER_DETECTION_SILENT_DROP' : 'MARKER_DETECTION_REJECTED_CANDIDATE';
    else if (slots.some((s) => s.detected?.fragment !== s.truthCard)) stage = 'FRAGMENT_DECODING';
    else if (group.kind === 'INCOMPLETE_GROUP') stage = 'GROUP_CLUSTERING';
    else stage = 'GROUP_ARRANGEMENT';
  }
  return {
    params: p,
    seed,
    cameraRotationDeg: sc.camera.rotationDeg,
    shiftPx: shift,
    imageSize: { width: image.width, height: image.height },
    markersDetected: markers.length,
    rejectedCandidates: rejected,
    slots,
    group,
    cls: scored.cls,
    firstFailingStage: stage,
    image,
    markers,
    scenario: sc,
  };
}
