// Standalone symbolic and analytic probes for M2. All coordinates are board-facing.
export const corners = { TL: [-1, -1], TR: [1, -1], BL: [-1, 1], BR: [1, 1] };
// Transcribed from V1 requirements.md glossary (Fragment_Layout, Inward_Corner).
export const printedCorners = { H: ['TL', 'BR'], D: ['TR', 'BL'], C: ['TR', 'BR'], S: ['TL', 'BL'] };
export const inwardCorners = { TL: 'BR', TR: 'BL', BL: 'TR', BR: 'TL' };
export const opposite = (corner) => Object.keys(corners).find((key) =>
  corners[key][0] === -corners[corner][0] && corners[key][1] === -corners[corner][1]);

export function placementClasses(layout = printedCorners, inward = inwardCorners) {
  const classes = [];
  const pieces = [];
  for (const [suit, printed] of Object.entries(layout)) {
    for (const bodyCorner of printed) {
      const uses = [];
      for (const orientation of [0, 180]) {
        const visibleCorner = orientation === 0 ? bodyCorner : opposite(bodyCorner);
        for (const [slot, facing] of Object.entries(inward)) {
          if (visibleCorner === facing) uses.push({ suit, bodyCorner, orientation, slot });
        }
      }
      const pass = uses.length === 2 && uses[0].orientation === 0 && uses[1].orientation === 180 &&
        uses[0].slot === opposite(uses[1].slot);
      pieces.push({ suit, bodyCorner, uses, pass });
      classes.push(...uses);
    }
  }
  return { classes, pieces };
}

export const centralVoidArea = (radius) => (4 - Math.PI) * radius ** 2;

export function inVoid(x, y, radius) {
  const u = Math.abs(x);
  const v = Math.abs(y);
  return u < radius && v < radius && Math.hypot(radius - u, radius - v) > radius;
}

/** Shortest Euclidean distance to the closure of the rounded void. */
export function distanceToVoid(x, y, radius) {
  const u = Math.abs(x);
  const v = Math.abs(y);
  if (u <= radius && v <= radius) return Math.max(0, radius - Math.hypot(radius - u, radius - v));
  return Math.min(Math.hypot(u - radius, v), Math.hypot(u, v - radius));
}

function containment(rect, radius, width, height) {
  const [x, y, right, bottom] = rect;
  const cornerMargin = inVoid(x, y, radius)
    ? radius - Math.hypot(radius - x, radius - y) : distanceToVoid(x, y, radius);
  return Math.min(x, y, width - right, height - bottom, cornerMargin);
}

export function probes(half) {
  const data = [];
  for (let y = 2; y < half - 2; y++) {
    for (let x = 2; x < half - 2; x++) {
      if (x !== 2 || y !== 2) data.push({ id: `D${x},${y}`, kind: 'data', rect: [x, y, x + 1, y + 1] });
    }
  }
  const frame = [
    { id: 'F-right', kind: 'frame', rect: [half - 1, 1, half, half] },
    { id: 'F-bottom', kind: 'frame', rect: [1, half - 1, half - 1, half] },
  ];
  const decoration = { id: 'A-probe', kind: 'abstract-decoration', rect: [2.25, 2.25, 2.75, 2.75] };
  return [...data, ...frame, decoration];
}

export function probeMeasurements(probe, radius, cfg, voidOffset, minFeature) {
  const rect = probe.rect.map((value) => value * cfg.moduleMm);
  const [x, y, right, bottom] = rect;
  const distanceMm = distanceToVoid(x, y, radius);
  const safeMarginMm = containment(rect, radius, ...cfg.cardModules.map((v) => v * cfg.moduleMm)) - cfg.printSafetyMm;
  const featureModules = Math.min(probe.rect[2] - probe.rect[0], probe.rect[3] - probe.rect[1]);
  const featureMm = Math.min(right - x, bottom - y);
  return {
    id: probe.id, distanceMm, safeMarginMm, featureModules, featureMm,
    voidPass: distanceMm > voidOffset && !inVoid(x, y, radius),
    containmentPass: safeMarginMm > 0,
    featurePass: featureModules >= minFeature,
  };
}

export function spacing(square, quiet, cfg, alignment) {
  const [width, height] = cfg.cardModules;
  const [boundX, boundY] = cfg.cardModules.map((distance) => distance / 2 - 2 * quiet);
  const mm = cfg.moduleMm;
  const envelope = square + 2 * quiet;
  const rotationMm = Math.hypot(width * mm, height * mm) * Math.sin(Math.abs(alignment.rotationDeg) * Math.PI / 360);
  const displacementMm = rotationMm + Math.SQRT2 * alignment.shiftPerAxisMm + alignment.gapMm / 2;
  return {
    boundX, boundY, overallBound: Math.min(boundX, boundY),
    withinX: square <= boundX, withinY: square <= boundY,
    directClearanceMm: cfg.cardModules.map((distance) => (distance - envelope) * mm),
    conservativeClearanceLowerBoundMm: cfg.cardModules.map((distance) => (distance - 2 * envelope) * mm - 2 * displacementMm),
    displacementMm,
    nominalContinuity: alignment.gapMm === 0 && alignment.shiftPerAxisMm === 0 && alignment.rotationDeg === 0,
  };
}

export function geometryStudy(cfg) {
  const models = [];
  const rows = [];
  for (const square of cfg.squareModules) {
    const elements = probes(square / 2);
    for (const quiet of cfg.quietModulesPerSide) {
      models.push({ square, quiet, quadrantExtentModules: square / 2, elements,
        keepOut: { protectedElementIds: elements.filter((p) => p.kind !== 'abstract-decoration').map((p) => p.id),
          externalBand: { innerSquareModules: square, outerSquareModules: square + 2 * quiet },
          coordinates: 'Reflect the local rectangles across each axis to cover all quadrants.' } });
      for (const radius of cfg.radiusMm) for (const voidOffset of cfg.extraVoidKeepOutMm) {
        for (const minFeature of cfg.minimumFeatureModules) for (const alignment of cfg.alignmentModels) {
          const measures = elements.map((p) => probeMeasurements(p, radius, cfg, voidOffset, minFeature));
          const spread = spacing(square, quiet, cfg, alignment);
          const critical = measures.slice(0, -1);
          const voidPass = critical.every((item) => item.voidPass);
          const containmentPass = critical.every((item) => item.containmentPass);
          const featurePass = critical.every((item) => item.featurePass);
          rows.push({ square, quiet, radius, voidOffset, minFeature, alignment: alignment.id, ...spread,
            voidAreaMm2: centralVoidArea(radius), voidPass, containmentPass, featurePass,
            offPass: voidPass && containmentPass && featurePass && spread.withinX && spread.withinY && spread.nominalContinuity,
            decorationProbePass: measures.at(-1).featurePass && measures.at(-1).containmentPass && measures.at(-1).voidPass,
            measurements: measures });
        }
      }
    }
  }
  return { models, rows };
}
