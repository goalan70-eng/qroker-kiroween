import test from 'node:test';
import assert from 'node:assert/strict';
import { centralVoidArea, corners, distanceToVoid, geometryStudy, inwardCorners, opposite, placementClasses, printedCorners, probeMeasurements, spacing } from './m2-model.mjs';
import { compareClasses, frameRaster, measureSymmetry, polygonTrace, rasterizeTrace, voidMask } from './m2-raster.mjs';

const metrics = { localWindowModules: 1, maxGlobalMismatchFraction: 0.001, maxLocalDeviationModules: 0.125 };
const cfg = { moduleMm: 1.5875, cardModules: [40, 56], printSafetyMm: 0.25 };
const nominal = { id: 'nominal', gapMm: 0, shiftPerAxisMm: 0, rotationDeg: 0 };
const perturbed = { id: 'perturbed', gapMm: 0.25, shiftPerAxisMm: 0.2, rotationDeg: 1 };

test('off-diagonal fixture derives two opposite slots without a hand class count', () => {
  assert.deepEqual(placementClasses({ C: ['TR'] }).classes, [
    { suit: 'C', bodyCorner: 'TR', orientation: 0, slot: 'BL' },
    { suit: 'C', bodyCorner: 'TR', orientation: 180, slot: 'TR' },
  ]);
});

test('a deliberately corrupt inward table breaks the two-use invariant', () => {
  const result = placementClasses({ C: ['TR'] }, { ...inwardCorners, BR: 'TR' });
  assert.equal(result.pieces[0].pass, false);
  assert.equal(result.pieces[0].uses.length, 3);
});

test('analytic off-diagonal void distance uses both arc and horn cases', () => {
  assert.equal(distanceToVoid(0.05, 0.1, 1), 0);
  assert.equal(distanceToVoid(0.25, 1, 1), 0.25);
  assert.equal(distanceToVoid(2, 0.25, 1), Math.hypot(1, 0.25));
  assert.equal(distanceToVoid(-2, -0.25, 1), Math.hypot(1, 0.25));
  assert.equal(distanceToVoid(2, 3, 1), Math.SQRT2 * 2);
  assert.equal(centralVoidArea(3.175).toFixed(2), '8.65');
});

test('a critical rectangle touching the safety boundary fails, and equal feature size passes', () => {
  const unit = { ...cfg, moduleMm: 1 };
  const onEdge = probeMeasurements({ id: 'D', rect: [0.25, 2, 1.25, 3] }, 1, unit, 0, 1);
  assert.equal(onEdge.safeMarginMm, 0);
  assert.equal(onEdge.containmentPass, false);
  assert.equal(onEdge.featurePass, true);
  const clipped = probeMeasurements({ id: 'D', rect: [0, 0, 2, 2] }, 1, unit, 0, 1);
  assert.equal(clipped.voidPass, false);
  assert.ok(clipped.safeMarginMm < 0);
});

test('spacing honors the inclusive width limit and exposes perturbed seam interference', () => {
  const exact = spacing(18, 1, cfg, nominal);
  assert.equal(exact.withinX, true);
  assert.equal(exact.withinY, true);
  assert.equal(exact.conservativeClearanceLowerBoundMm[0], 0);
  const offset = spacing(18, 1, cfg, perturbed);
  assert.equal(offset.nominalContinuity, false);
  assert.ok(offset.conservativeClearanceLowerBoundMm[0] < 0);
  assert.equal(spacing(20, 1, cfg, nominal).withinX, false);
});

test('one output row per parameter combination and keep-out excludes the abstract decoration', () => {
  const study = geometryStudy({ ...cfg, squareModules: [12, 16], quietModulesPerSide: [1, 2], radiusMm: [3.175, 4],
    extraVoidKeepOutMm: [0, 0.4], minimumFeatureModules: [0.5, 1], alignmentModels: [nominal, perturbed] });
  assert.equal(study.rows.length, 64);
  assert.equal(study.models.length, 4);
  assert.ok(study.models.every((x) => !x.keepOut.protectedElementIds.includes('A-probe')));
  assert.ok(study.rows.some((x) => x.offPass));
  assert.ok(study.rows.filter((x) => x.alignment === 'perturbed').every((x) => !x.offPass));
});

test('nominal OFF frame covers its square outside the modeled void and is identical across placements', () => {
  const n = 64;
  const mask = voidMask(n, 16 * cfg.moduleMm, 3.175);
  const frame = frameRaster(n, 16, cfg, mask);
  assert.ok(mask.some((value) => value === 1));
  assert.ok(frame.every((value, i) => (value === 0) === Boolean(mask[i])));
  assert.ok(Object.values(measureSymmetry(frame, n, 16, metrics)).every((value) => value.mismatches === 0));
  assert.ok(compareClasses(frame, n, placementClasses().classes).every((value) => value.mismatches === 0));
});

test('single mirror symmetry does not imply a half-turn or class agreement', () => {
  const n = 4;
  const raster = new Uint8Array(16);
  raster[0] = raster[3] = 1;
  const values = measureSymmetry(raster, n, 4, metrics);
  assert.equal(values.leftRight.mismatches, 0);
  assert.equal(values.halfTurn.pass, false);
  assert.deepEqual(values.halfTurn.windowOriginPx, [0, 0]);
  assert.ok(compareClasses(raster, n, placementClasses().classes).some((x) => x.mismatches));
});

test('half-turn symmetry alone is sufficient for every class with independent shared crops', () => {
  const raster = new Uint8Array(16);
  raster[0] = raster[15] = 1;
  const values = measureSymmetry(raster, 4, 4, metrics);
  assert.equal(values.halfTurn.pass, true);
  assert.equal(values.leftRight.pass, false);
  assert.equal(values.topBottom.pass, false);
  assert.ok(compareClasses(raster, 4, placementClasses().classes).every((x) => x.mismatches === 0));
});

test('mirrored body layer restores front positions on the ideal left/right flip', () => {
  const fromSigns = (u, v) => Object.keys(corners).find((name) => corners[name][0] === u && corners[name][1] === v);
  const lr = (name) => fromSigns(-corners[name][0], corners[name][1]);
  const tb = (name) => fromSigns(corners[name][0], -corners[name][1]);
  for (const layout of Object.values(printedCorners)) {
    const back = layout.map(lr);
    assert.ok(back.every((corner) => !layout.includes(corner)));
    assert.deepEqual(back.map(lr), layout);
    assert.deepEqual(back.map(tb), layout.map(opposite));
    // Unchanged front positions use the wrong corners after the same flip.
    assert.notDeepEqual(layout.map(lr), layout);
  }
});

test('evenodd rasterization preserves a polygon hole and rejects unsupported curves', () => {
  const template = (d) => `<svg viewBox="0 0 4 4"><path fill="#000" fill-rule="evenodd" d="${d}"/></svg>`;
  const fixture = polygonTrace(template('M0,0 4,0 4,4 0,4Z M1,1 3,1 3,3 1,3Z'));
  assert.deepEqual(Array.from(rasterizeTrace(fixture, 4)), [1,1,1,1, 1,0,0,1, 1,0,0,1, 1,1,1,1]);
  assert.throws(() => polygonTrace(template('M0,0 C0,1 2,1 3,0Z')), /closed absolute polygon/);
});
