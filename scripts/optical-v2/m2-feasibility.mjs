import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { platform, release, arch } from 'node:os';
import assert from 'node:assert/strict';
import { placementClasses, printedCorners, inwardCorners, centralVoidArea, geometryStudy } from './m2-model.mjs';
import { compareClasses, frameRaster, measureSymmetry, measureTrace, polygonTrace, voidMask, digest } from './m2-raster.mjs';

const studyBase = 'ab159353c61a4959c75267092585b96ed167e70e';
const pin = 'ddad4473f2a30d56e033d578c7bff8263ac4a864';
const artworkRef = '7baefca3cf8d69c6bb52f989afaae3892f15063b';
const artworkPath = 'docs/optical/assets/joker-four-piece-reference.svg';
const artworkBlob = '5f18c59d02d9cdbf18c6270c91dc4fe22c8fb71b';
const prereg = 'docs/optical-v2/results/m2-preregistration.md';
const resultPath = 'docs/optical-v2/results/m2-feasibility.json';
const scriptPaths = ['m2-model.mjs', 'm2-raster.mjs', 'm2-feasibility.mjs', 'm2-feasibility.test.mjs'];
const sourcePath = '.kiro/specs/qroker-game/requirements.md';
const crossCheckPath = '.kiro/specs/qroker-optical-v2/design.md';
const git = (...args) => execFileSync('git', args, { windowsHide: true });
const lf = (bytes) => bytes.toString('utf8').replaceAll('\r\n', '\n');
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) throw new Error('Usage: node scripts/optical-v2/m2-feasibility.mjs [--check]');

// Require the registered plan to be committed and identical to the first recorded version.
const preregCommit = git('log', '--format=%H', '--diff-filter=A', '--', prereg).toString().trim();
assert.match(preregCommit, /^[a-f0-9]{40}$/);
const plan = lf(git('cat-file', 'blob', `${preregCommit}:${prereg}`));
assert.equal(lf(readFileSync(prereg)), plan, 'Preregistration was changed after the initial commit');
const cfg = JSON.parse(/```json\s*([\s\S]+?)```/.exec(plan)[1]);
assert.equal(git('rev-parse', `${artworkRef}:${artworkPath}`).toString().trim(), artworkBlob);
const artBytes = git('cat-file', 'blob', artworkBlob);
const trace = polygonTrace(artBytes.toString('utf8'));

const { classes, pieces } = placementClasses();
const classKey = ({ suit, orientation, slot, bodyCorner }) => `${suit}:${orientation}:${slot}:${bodyCorner}`;
const handDesign = lf(git('cat-file', 'blob', `${studyBase}:${crossCheckPath}`));
const suitCode = { hearts: 'H', diamonds: 'D', clubs: 'C', spades: 'S' };
const handTable = [...handDesign.matchAll(/^\| \d+ \| (hearts|diamonds|clubs|spades) \| (0|180) \| (TL|TR|BL|BR) \| (TL|TR|BL|BR) \|/gm)]
  .map(([, suit, theta, slot, corner]) => classKey({ suit: suitCode[suit], orientation: Number(theta), slot, bodyCorner: corner }));
const computed = classes.map(classKey);
const missing = handTable.filter((id) => !computed.includes(id));
const extra = computed.filter((id) => !handTable.includes(id));
assert.ok(handTable.length > 0, 'Hand table parser did not find any entries');
assert.ok(pieces.every((piece) => piece.pass), 'The two-use invariant failed');

const square = cfg.symmetryReferenceSquareModules;
const radius = cfg.symmetryReferenceRadiusMm;
const n = cfg.modelRaster;
const mask = voidMask(n, square * cfg.moduleMm, radius);
const frame = frameRaster(n, square, cfg, mask);
const unexpectedEmptyPixels = frame.reduce((count, value, i) => count + Number(value === 0 && !mask[i]), 0);
const offClasses = compareClasses(frame, n, classes);
const off = { n, square, radius, maskDigest: digest(mask), maskPixels: mask.reduce((a, b) => a + b, 0),
  symmetry: measureSymmetry(frame, n, square, cfg), classes: offClasses, unexpectedEmptyPixels };

// Construct a half-turn-only ornament witness on the neutral model, with no Joker data.
const illustrative = frame.slice();
const unit = n / square;
for (let y = n / 2 + 2.25 * unit; y < n / 2 + 2.75 * unit; y++) {
  for (let x = n / 2 + 2.25 * unit; x < n / 2 + 2.75 * unit; x++) {
    illustrative[y * n + x] = 3;
    illustrative[(n - 1 - y) * n + n - 1 - x] = 3;
  }
}
const ornament = { symmetry: measureSymmetry(illustrative, n, square, cfg), classes: compareClasses(illustrative, n, classes) };
const artworkResults = [n, cfg.artSensitivityRaster].map((size) => {
  const result = measureTrace(trace, size, square, radius, cfg, classes);
  assert.deepEqual(measureTrace(trace, size, square, radius, cfg, classes), result);
  return result;
});
const contourSpans = trace.contours.map((points, i) => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { contour: i + 1, minimumBoundingSpanSvgUnits: Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) };
});
const { models, rows } = geometryStudy(cfg);
const rowCount = [cfg.squareModules, cfg.quietModulesPerSide, cfg.radiusMm, cfg.extraVoidKeepOutMm,
  cfg.minimumFeatureModules, cfg.alignmentModels].reduce((product, values) => product * values.length, 1);
assert.equal(rows.length, rowCount);

// Q and alignment do not change the local printed elements. Store their measurements once.
const measurementsById = {};
for (const row of rows) {
  const id = [row.square, row.radius, row.voidOffset, row.minFeature].join('/');
  const measurements = row.measurements;
  if (measurementsById[id]) assert.deepEqual(measurementsById[id], measurements);
  else measurementsById[id] = measurements;
  delete row.measurements;
  row.measurementId = id;
}
const witnesses = rows.filter((row) => row.offPass);
const nominalReference = rows.find((row) => row.square === square && row.radius === radius && row.quiet === 1 &&
  row.voidOffset === 0 && row.minFeature === 1 && row.alignment === 'nominal');
const result = {
  evidenceClass: 1, producer: 'Codex', seed: null, command: 'node scripts/optical-v2/m2-feasibility.mjs',
  environment: { node: process.version, platform: platform(), os: release(), arch: arch() },
  inputs: { studyBase, pin, artworkRef, artworkBlob, artworkSha256: digest(artBytes), preregCommit,
    sourceTables: `${pin}:${sourcePath} (Fragment_Layout and Inward_Corner glossary)`,
    sourceHashesLfSha256: Object.fromEntries(scriptPaths.map((file) => [file, digest(lf(readFileSync(`scripts/optical-v2/${file}`)))])),
    dependencies: ['m2-model.mjs', 'm2-raster.mjs', 'node:assert/strict', 'node:child_process', 'node:crypto', 'node:fs', 'node:os', 'git executable'] },
  cfg, placement: { printedCorners, inwardCorners, computedCount: classes.length, handCount: handTable.length, missing, extra, pieces },
  off, ornament, artwork: { ownerOriginalCompared: false, repeatAtEachResolutionIdentical: true, results: artworkResults,
    contourSpans, contourSpanModulesBySquare: Object.fromEntries(cfg.squareModules.map((s) => [s, contourSpans.map((x) => x.minimumBoundingSpanSvgUnits * s / trace.extent)])) },
  geometry: { plannedRows: rowCount, recordedRows: rows.length, offNominalWitnesses: witnesses.length,
    referenceVoidAreaMm2: centralVoidArea(radius), nominalReference, models, rows, measurementsById },
};
const output = JSON.stringify(result, null, 2) + '\n';
if (args[0] === '--check') assert.equal(lf(readFileSync(resultPath)), output, 'Recorded study differs from the repeated result');
else writeFileSync(resultPath, output);
console.log(JSON.stringify({ classes: classes.length, hand: handTable.length, missing, extra,
  frame: off.symmetry, empty: unexpectedEmptyPixels, offClassErrors: offClasses.filter((x) => x.mismatches).length,
  art: artworkResults.map((x) => ({ n: x.n, removed: x.removed, darkBefore: x.darkBefore, minRunModules: x.minRunModules, symmetry: x.symmetry })),
  rows: rows.length, witnesses: witnesses.length, referenceVoidAreaMm2: result.geometry.referenceVoidAreaMm2 }, null, 2));
