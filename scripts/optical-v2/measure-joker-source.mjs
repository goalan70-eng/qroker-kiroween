// The image and all derived arrays remain in memory. Only aggregate metrics go to stdout.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareClasses, measureSymmetry, voidMask } from './m2-raster.mjs';
import { placementClasses } from './m2-model.mjs';

const [, , sourceHash, mode] = process.argv;
assert.match(sourceHash, /^[0-9a-f]{64}$/);
assert.ok(mode === undefined || mode === '--quarter-area', 'Unrecognized measurement mode');
const sideFraction = mode === '--quarter-area' ? 0.5 : 1;
const width = 1280;
const bgr = Buffer.from(readFileSync(0, 'utf8').trim(), 'base64');
assert.equal(bgr.length, 3 * width * width);
const gray = new Uint8Array(width * width);
for (let i = 0; i < gray.length; i++) {
  gray[i] = Math.round((114 * bgr[3 * i] + 587 * bgr[3 * i + 1] + 299 * bgr[3 * i + 2]) / 1000);
}

const base = JSON.parse(readFileSync(new URL('../../docs/optical-v2/results/m2-feasibility.json', import.meta.url)));
const { cfg } = base;
const square = cfg.symmetryReferenceSquareModules;
const model = base.geometry.models.find((item) => item.square === square && item.quiet === 1);
assert.ok(model);
const protectedElements = model.elements.filter((item) => model.keepOut.protectedElementIds.includes(item.id));
const { classes } = placementClasses();

function sourceAt(n) {
  const out = new Uint8Array(n * n);
  const artSize = n * sideFraction;
  const offset = (n - artSize) / 2;
  assert.ok(Number.isInteger(offset));
  const sample = (pixel) => Math.min(width - 1, Math.max(0, (pixel + 0.5) * width / artSize - 0.5));
  for (let y = 0; y < artSize; y++) {
    const fy = sample(y);
    const y0 = Math.floor(fy);
    const y1 = Math.min(y0 + 1, width - 1);
    const wy = fy - y0;
    for (let x = 0; x < artSize; x++) {
      const fx = sample(x);
      const x0 = Math.floor(fx);
      const x1 = Math.min(x0 + 1, width - 1);
      const wx = fx - x0;
      const top = gray[y0 * width + x0] * (1 - wx) + gray[y0 * width + x1] * wx;
      const bottom = gray[y1 * width + x0] * (1 - wx) + gray[y1 * width + x1] * wx;
      out[(y + offset) * n + x + offset] = Number(top * (1 - wy) + bottom * wy < 128);
    }
  }
  return out;
}

function completeHalfTurn(input) {
  const out = input.slice();
  for (let i = input.length / 2; i < input.length; i++) out[i] = input[input.length - 1 - i];
  return out;
}

assert.deepEqual(completeHalfTurn(new Uint8Array([1, 0, 1, 1])), new Uint8Array([1, 0, 0, 1]));

function artMetrics(bytes, n) {
  return {
    dark: bytes.reduce((sum, value) => sum + value, 0),
    halfTurn: measureSymmetry(bytes, n, square, cfg).halfTurn,
    mismatchedClasses: compareClasses(bytes, n, classes).filter((item) => item.mismatches > 0).length,
  };
}

function protectedAt(x, y) {
  return protectedElements.find(({ rect: [left, top, right, bottom] }) =>
    x >= left && x < right && y >= top && y < bottom)?.kind;
}

const results = [];
for (const n of [cfg.modelRaster, width, cfg.artSensitivityRaster]) {
  const original = sourceAt(n);
  const corrected = completeHalfTurn(original);
  const changed = corrected.reduce((total, value, i) => total + Number(value !== original[i]), 0);
  const originalMetrics = artMetrics(original, n);
  const correctedMetrics = artMetrics(corrected, n);
  assert.ok(originalMetrics.halfTurn.mismatches > 0);
  if (mode === undefined) assert.equal(originalMetrics.halfTurn.pass, false);
  assert.equal(correctedMetrics.halfTurn.mismatches, 0);
  assert.equal(correctedMetrics.mismatchedClasses, 0);
  const padding = n * (1 - sideFraction) / 2;
  assert.ok(corrected.every((value, i) => {
    if (!value) return true;
    const x = i % n;
    const y = Math.floor(i / n);
    return x >= padding && x < n - padding && y >= padding && y < n - padding;
  }), 'Decoration extends outside its placement square');
  const rows = [];
  for (const radius of cfg.radiusMm) {
    const voidPixels = voidMask(n, square * cfg.moduleMm, radius);
    const voidOnly = corrected.slice();
    const kept = corrected.slice();
    const removed = { void: 0, data: 0, frame: 0 };
    for (let i = 0; i < corrected.length; i++) {
      if (!corrected[i]) continue;
      if (voidPixels[i]) {
        removed.void++;
        voidOnly[i] = 0;
        kept[i] = 0;
        continue;
      }
      const u = Math.abs((2 * (i % n) + 1 - n) * square / (2 * n));
      const v = Math.abs((2 * Math.floor(i / n) + 1 - n) * square / (2 * n));
      const kind = protectedAt(u, v);
      if (kind) {
        removed[kind]++;
        kept[i] = 0;
      }
    }
    const voidMetrics = artMetrics(voidOnly, n);
    const keepOutMetrics = artMetrics(kept, n);
    for (const measured of [voidMetrics, keepOutMetrics]) {
      assert.equal(measured.halfTurn.mismatches, 0);
      assert.equal(measured.mismatchedClasses, 0);
    }
    assert.equal(correctedMetrics.dark - keepOutMetrics.dark, removed.void + removed.data + removed.frame);
    rows.push({ radius, removed, remainingPercent: 100 * keepOutMetrics.dark / correctedMetrics.dark,
      voidMetrics, keepOutMetrics });
  }
  results.push({ n, changed, changedPercent: 100 * changed / original.length, originalMetrics, correctedMetrics, rows });
}

const placement = mode === '--quarter-area' ? {
  sideModules: square * sideFraction,
  sideMm: square * cfg.moduleMm * sideFraction,
  areaPercent: 100 * sideFraction ** 2,
} : undefined;
console.log(JSON.stringify({ sourceHash, node: process.version, square, quietSide: model.quiet, placement, results }, null, 2));
