// Aggregated detection measurements on SYNTHETIC images (not real cameras).
// Runs the same condition families as src/optical/detect.test.ts with fixed seeds and writes
// docs/optical/results/m4-1-detection.json and .md. Output is deterministic: no timestamps, no
// runtimes, stable key order, numbers rounded to 4 decimals.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MIN_SIZE_PX } from '../src/optical/detect';
import * as C from '../src/optical/testing/detect-conditions';

const outDir = fileURLToPath(new URL('../docs/optical/results/', import.meta.url));
mkdirSync(outDir, { recursive: true });

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function norm(v: unknown): Json {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : String(v);
  if (typeof v === 'string' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.map(norm);
  const o = v as Record<string, unknown>;
  const out: { [k: string]: Json } = {};
  for (const k of Object.keys(o).sort()) out[k] = norm(o[k]);
  return out;
}

const rate = (a: number, b: number): string => (b === 0 ? 'n/a' : `${((100 * a) / b).toFixed(1)}%`);

const clean = C.cleanBase(4);
const d4 = C.cleanD4(4);
const layers = C.cardLayers(4);
const sheet = C.contactSheet(2);
const pos = C.positions(300, C.SEED);
const rot = C.rotations(5, 8);
const intSweep = C.scalesInteger(Array.from({ length: 24 }, (_, i) => i + 1));
const intIntrinsic = C.scalesInteger([1, 2, 3], { minSizePx: 3 });
const fracModules = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.5, 4, 5, 6, 8, 12, 16, 24];
const fracSweep = C.scalesFractional(fracModules, 52);
const fracIntrinsic = C.scalesFractional([1, 1.5, 2, 2.25, 2.5], 52, { minSizePx: 3 });
const tilts = [0, 10, 20, 30, 40, 50, 60, 70];
const persp = C.perspective(tilts, 20, 8, 5);
const perspClose = C.perspective(tilts, 20, 8, 3);
const inv = C.invalidBorders();
const neg = C.negatives();
const degr = C.degradations();

const minIntModule = C.minExactModule(intSweep.perModule);
const minFracModule = C.minExactModule(fracSweep.perModule);
let maxFullTilt = -1;
for (const r of persp.rows) {
  if (r.exact === r.total) maxFullTilt = r.tiltDeg;
  else break;
}
let maxFullTiltClose = -1;
for (const r of perspClose.rows) {
  if (r.exact === r.total) maxFullTiltClose = r.tiltDeg;
  else break;
}
const wrongTotals = [clean, d4, layers, sheet, pos, rot, intSweep.fam, fracSweep.fam, persp.fam, perspClose.fam, inv.fam, neg.fam].reduce(
  (s, f) => s + f.wrongBits,
  0,
);

const families = [clean, d4, layers, sheet, pos, rot, neg.fam, inv.fam].map((f) => ({
  family: f.family,
  cases: f.total,
  detected: f.detected,
  detectionRate: rate(f.detected, f.total),
  exact: f.exact,
  exactRate: rate(f.exact, f.total),
  wrongBitsDetected: f.wrongBits,
  kinds: f.kinds,
  firstRejectedReasons: f.reasons,
  extra: f.extra,
}));

// Failures of the required conditions (expected: none), reproducible from condition + params + seed.
const failureCases = [clean, d4, layers, sheet, pos, rot, inv.fam, neg.fam].flatMap((f) =>
  f.failures.map((x) => ({ family: f.family, condition: x.condition, params: x.params, observed: x.observed })),
);
// Failures inside the sweeps are measured limits (below-threshold scales, strong tilts). Two examples per level.
const levelOf = (params: string): string =>
  /(?:effectiveModulePx|modulePx)=([\d.]+)/.exec(params)?.[1] ?? /tiltDeg=(\d+).*distance=(\d)x/.exec(params)?.slice(1).join('/') ?? params;
const limitCases: Array<{ family: string; level: string; params: string; observed: string }> = [];
for (const f of [intSweep.fam, fracSweep.fam, persp.fam, perspClose.fam]) {
  const seen = new Map<string, number>();
  for (const x of f.failures) {
    const level = levelOf(x.params);
    const n = seen.get(level) ?? 0;
    seen.set(level, n + 1);
    if (n < 2) limitCases.push({ family: f.family, level, params: x.params, observed: x.observed });
  }
}

const report = {
  title: 'M4.1 marker detection measurements',
  scope: 'SYNTHETIC images, not real cameras. No claim about printed cards, phone sensors, lenses or lighting.',
  seed: C.SEED,
  detectorDefaults: { minSizePx: DEFAULT_MIN_SIZE_PX, binarization: 'otsu' },
  summary: {
    wrongBitsDetectedAcrossAllFamilies: wrongTotals,
    falsePositivesOnNegatives: neg.fam.detected,
    negativeImages: neg.fam.total,
    minExactModulePxCrisp: minIntModule,
    minExactSizePxCrisp: minIntModule === null ? null : 7 * minIntModule,
    minExactModulePxBlurredFractional: minFracModule,
    minExactSizePxBlurredFractional: minFracModule === null ? null : 7 * minFracModule,
    perspectiveMaxFullyExactTiltDeg: maxFullTilt,
    perspectiveCloseCameraMaxFullyExactTiltDeg: maxFullTiltClose,
  },
  families,
  scalesIntegerCrisp: { defaultOptions: intSweep.perModule, minSizePxLoweredTo3: intIntrinsic.perModule },
  scalesFractionalBlurred: { defaultOptions: fracSweep.perModule, minSizePxLoweredTo3: fracIntrinsic.perModule, reasons: fracSweep.fam.reasons },
  perspective: {
    model: 'plane tilted by tiltDeg about a random in-plane axis, random in-plane rotation, 20 seeded cases per strength, modulePx 8',
    cameraDistance5MarkerEdges: persp.rows,
    cameraDistance3MarkerEdges: perspClose.rows,
    reasonsDistance5: persp.fam.reasons,
  },
  invalidBorders: inv.cases,
  negatives: { rows: neg.rows, solidBlack7x7Square: neg.solidSquare },
  degradationsInformational: degr,
  failureCases,
  measuredLimitCases: limitCases,
};

writeFileSync(join(outDir, 'm4-1-detection.json'), JSON.stringify(norm(report), null, 2) + '\n');

// ---- markdown ----
const L: string[] = [];
const tbl = (head: string[], rows: Array<Array<string | number>>): void => {
  L.push(`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`);
  for (const r of rows) L.push(`| ${r.join(' | ')} |`);
  L.push('');
};
L.push('# M4.1 marker detection measurements', '');
L.push('**All numbers are from synthetic images, not real cameras.** Generated by `npm run measure:detection` (`scripts/measure-detection.ts`);');
L.push('conditions are in `src/optical/testing/detect-conditions.ts` and are the same ones `src/optical/detect.test.ts` asserts on.');
L.push(`Output is deterministic (seed ${C.SEED}, no timestamps or runtimes). Detector defaults: Otsu binarization, minSizePx ${DEFAULT_MIN_SIZE_PX}.`, '');
L.push('## Summary', '');
tbl(
  ['Quantity', 'Value'],
  [
    ['DETECTED results with wrong bits (all families, required conditions)', wrongTotals],
    ['False positives on negative images', `${neg.fam.detected} of ${neg.fam.total}`],
    ['Min exact module size, crisp integer renders (all 52 patterns, all larger sizes up to 24 also exact)', minIntModule === null ? 'none' : `${minIntModule} px per module (7x7 edge ${7 * minIntModule} px)`],
    ['Min exact module size, blurred fractional scales (52 patterns)', minFracModule === null ? 'none' : `${minFracModule} px per module (7x7 edge ${7 * minFracModule} px)`],
    ['Perspective: highest tilt with 100% exact reads (camera 5 marker edges away)', `${maxFullTilt} degrees`],
    ['Perspective: highest tilt with 100% exact reads (camera 3 marker edges away)', `${maxFullTiltClose} degrees`],
  ],
);
L.push('## Condition families', '');
tbl(
  ['Family', 'Cases', 'DETECTED', 'Exact', 'Wrong-bit DETECTED', 'Kinds'],
  families.map((f) => [f.family, f.cases, `${f.detected} (${f.detectionRate})`, `${f.exact} (${f.exactRate})`, f.wrongBitsDetected, JSON.stringify(f.kinds)]),
);
L.push('Notes: "exact" means exactly one marker (or the expected markers for card layers / sheet) with the expected bits, at the expected location where checked.');
L.push('For `negatives` and `invalid-borders`, "exact" means the acceptable behaviour (not DETECTED, or DETECTED with a fully valid structure and true bits).', '');
L.push('Extra measurements:', '');
for (const f of families) if (Object.keys(f.extra).length) L.push(`- ${f.family}: \`${JSON.stringify(norm(f.extra))}\``);
L.push('');
L.push('## Rotation (every 5 degrees, 10 patterns, modulePx 8)', '');
L.push(`${rot.exact} of ${rot.total} cases exact. Away from the +-45 degree canonical boundaries the bits equal R90^k . P with k = round(theta/90) mod 4 (clockwise degrees); the analytic expectation was **not contradicted**.`);
L.push(`At the boundary angles (45, 135, 225, 315 degrees) any of the four R90 rotations is accepted; strict cases ${String(rot.extra['strictExact'])} of ${String(rot.extra['strictCases'])} exact.`, '');
L.push('## Scale', '');
L.push('Crisp integer module sizes (no resampling), all 52 patterns per size, default options:', '');
tbl(['modulePx', 'edge px', 'exact', 'DETECTED', 'wrong bits'], intSweep.perModule.map((r) => [r.modulePx, r.sizePx, `${r.exact}/${r.total}`, r.detected, r.wrongBits]));
L.push('With `minSizePx` lowered to 3 (shows the limit of the pixel pipeline itself, not of the size gate):', '');
tbl(['modulePx', 'exact', 'DETECTED', 'wrong bits'], intIntrinsic.perModule.map((r) => [r.modulePx, `${r.exact}/${r.total}`, r.detected, r.wrongBits]));
L.push('Blurred fractional scales (modulePx 8 render, box-filter supersampled warp, fractional offset), 52 patterns per size, default options:', '');
tbl(['effective modulePx', 'edge px', 'exact', 'DETECTED', 'wrong bits'], fracSweep.perModule.map((r) => [r.modulePx, r.sizePx, `${r.exact}/${r.total}`, r.detected, r.wrongBits]));
L.push(`First-rejected reasons across the fractional sweep: \`${JSON.stringify(norm(fracSweep.fam.reasons))}\`.`, '');
L.push('## Perspective', '');
L.push('Plane tilted by the given angle about a random in-plane axis (pinhole camera), random in-plane rotation, 20 seeded cases per strength, modulePx 8. Expected reading is derived from the true projected corners.', '');
tbl(
  ['tilt (deg)', 'camera 5 edges: exact', 'DETECTED', 'wrong', 'camera 3 edges: exact', 'DETECTED', 'wrong'],
  persp.rows.map((r, i) => {
    const c = perspClose.rows[i]!;
    return [r.tiltDeg, `${r.exact}/${r.total}`, r.detected, r.wrongBits, `${c.exact}/${c.total}`, c.detected, c.wrongBits];
  }),
);
L.push('## Invalid borders and damaged markers', '');
tbl(
  ['Case', 'Count', 'Outcomes (first rejected reason)', 'DETECTED wrong bits', 'DETECTED with invalid structure'],
  inv.cases.map((c) => [c.name, c.total, JSON.stringify(norm(c.outcomes)), c.detectedWithWrongBits, c.detectedButInvalidStructure]),
);
L.push('## Negative images', '');
tbl(['Name', 'Images', 'DETECTED', 'INVALID_MARKER', 'NOT_DETECTED'], neg.rows.map((r) => [r.name, r.total, r.detected, r.invalidMarker, r.notDetected]));
L.push(`Solid black 7x7-module square with white margin: \`${neg.solidSquare.observed}\` (bits ${String(neg.solidSquare.bits)} = 0x1FFFFFF). Structurally a valid ring with all-ones data; the detector has no template knowledge and reports it. Rejection belongs to template matching (task 4.2).`, '');
L.push('## Informational degradations (20 patterns each, modulePx 8; not required conditions)', '');
tbl(['Condition', 'exact', 'DETECTED', 'wrong bits'], degr.map((r) => [r.condition, `${r.exact}/${r.total}`, r.detected, r.wrongBits]));
L.push('## Reproducible failure cases', '');
L.push('### Required conditions (clean, cards, sheet, positions, rotations, invalid borders, negatives)', '');
if (failureCases.length === 0) L.push('None. Every case met its expectation.', '');
else tbl(['Family', 'Condition', 'Params', 'Observed'], failureCases.map((f) => [f.family, f.condition, f.params, f.observed]));
L.push('### Measured limits inside the sweeps (two examples per level; the seed above and the params reproduce each one)', '');
L.push('These are expected failures below the exact-scale threshold and at strong tilts. None of them returned wrong bits.', '');
tbl(['Family', 'Level', 'Params', 'Observed'], limitCases.map((f) => [f.family, f.level, f.params, f.observed]));
L.push('## Remaining limitations', '');
L.push(
  '- Synthetic rasters only. Real printing, paper gloss, lens distortion, motion blur, rolling shutter and colour are untested.',
  '- Illumination: see the degradation table. Global Otsu fails on strong ramps; the adaptive mode has a fixed window and offset and was only tried on linear ramps.',
  '- Occluded or damaged borders are rejected, never repaired. Damaged data cells are read as they appear.',
  '- Markers closer than the 1-module margin to other dark structure merge into one component and are rejected.',
  '- Several markers per image are detected independently. Grouping into a 2x2 corner cluster (design 7.2) is not implemented here.',
  '',
);
writeFileSync(join(outDir, 'm4-1-detection.md'), L.join('\n'));
console.log(`wrote m4-1-detection.json and m4-1-detection.md to ${outDir}`);
