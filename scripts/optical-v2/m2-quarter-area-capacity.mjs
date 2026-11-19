// M2 capacity and fixed-center alignment probes. No card patterns or recognition.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { corners, placementClasses, probeMeasurements, spacing } from './m2-model.mjs';

const { cfg, geometry } = JSON.parse(readFileSync(new URL(
  '../../docs/optical-v2/results/m2-feasibility.json', import.meta.url,
)));
const square = cfg.symmetryReferenceSquareModules;
const quiet = 1;
const model = geometry.models.find((item) => item.square === square && item.quiet === quiet);
const data = model.elements.filter((item) => item.kind === 'data');
const frame = model.elements.filter((item) => item.kind === 'frame');
const decorationEdge = square / 4;
const outsideDecoration = ({ rect: [left, top] }) => left >= decorationEdge || top >= decorationEdge;
const outside = data.filter(outsideDecoration);
assert.ok(frame.length === 2 && frame.every(outsideDecoration));
assert.ok([...data, ...frame].every(({ id }) => model.keepOut.protectedElementIds.includes(id)));
const radiusRows = cfg.radiusMm.map((radius) => {
  const probes = [...data, ...frame].map((element) => probeMeasurements(element, radius, cfg, 0.4, 1));
  assert.ok(probes.every((probe) => probe.voidPass && probe.containmentPass && probe.featurePass));
  return { radius, minVoidDistanceMm: Math.min(...probes.map((probe) => probe.distanceMm)),
    minPrintSlackMm: Math.min(...probes.map((probe) => probe.safeMarginMm)) };
});

// Error syndromes must be distinct for the zero error and every supported error.
function countSyndromes(columns, errors) {
  const sums = [0, ...columns];
  if (errors === 2) {
    for (let i = 0; i < columns.length; i++) {
      for (let j = i + 1; j < columns.length; j++) sums.push(columns[i] ^ columns[j]);
    }
  }
  assert.equal(new Set(sums).size, sums.length);
  return sums.length;
}

function polynomialRemainder(value) {
  const generator = 0b111010001; // x^8 + x^7 + x^6 + x^4 + 1
  for (let bit = 14; bit >= 8; bit--) {
    if (value & (1 << bit)) value ^= generator << (bit - 8);
  }
  return value;
}

assert.equal(outside.length, 12);
assert.equal(data.length, 15);
const oneErrorSyndromes = countSyndromes(Array.from({ length: outside.length }, (_, i) => i + 1), 1);
const radiusTwoBall = 1 + outside.length + outside.length * (outside.length - 1) / 2;
const maxTwoErrorWordsOutside = Math.floor(2 ** outside.length / radiusTwoBall);
const twoErrorSyndromes = countSyndromes(Array.from({ length: data.length }, (_, i) => polynomialRemainder(1 << i)), 2);
assert.ok(2 ** (outside.length - 4) >= 52 && maxTwoErrorWordsOutside < 52 && 2 ** (data.length - 8) >= 52);
assert.throws(() => countSyndromes([1, 1, 2], 1), assert.AssertionError);

const perturbed = cfg.alignmentModels.find((item) => item.id === 'illustrative-perturbed');
const nominal = cfg.alignmentModels.find((item) => item.id === 'nominal');
const nominalSpacing = spacing(square, quiet, cfg, nominal);
assert.ok(nominalSpacing.withinX && nominalSpacing.withinY && nominalSpacing.nominalContinuity);
const pivot = cfg.cardModules.map((length) => length * cfg.moduleMm / 2);
const { classes } = placementClasses();
assert.equal(classes.length, 16);

function missedCells(cells, slot, rotationDeg, shiftX, shiftY, gapMm) {
  const [signX, signY] = corners[slot];
  const angle = -rotationDeg * Math.PI / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return cells.filter(({ rect: [left, top] }) => {
    const x = signX * ((left + 0.5) * cfg.moduleMm - pivot[0] - gapMm / 2) - shiftX;
    const y = signY * ((top + 0.5) * cfg.moduleMm - pivot[1] - gapMm / 2) - shiftY;
    const u = (signX * (x * cosine - y * sine) + pivot[0]) / cfg.moduleMm;
    const v = (signY * (x * sine + y * cosine) + pivot[1]) / cfg.moduleMm;
    return u < left || u >= left + 1 || v < top || v >= top + 1;
  }).length;
}

for (const { slot } of classes) assert.equal(missedCells(data, slot, 0, 0, 0, 0), 0);
const grid = [-1, 1].flatMap((rot) => [-1, 1].flatMap((x) => [-1, 1].map((y) => [rot, x, y])));
const stress = classes.flatMap(({ slot }) => grid.map(([rot, x, y]) => {
  const args = [slot, rot * perturbed.rotationDeg, x * perturbed.shiftPerAxisMm,
    y * perturbed.shiftPerAxisMm, perturbed.gapMm];
  return { all: missedCells(data, ...args), outside: missedCells(outside, ...args) };
}));
const outcomes = (key) => ({ casesWithMiss: stress.filter((row) => row[key] > 0).length,
  maxMiss: Math.max(...stress.map((row) => row[key])) });
assert.ok(outcomes('all').casesWithMiss > 0 && outcomes('all').casesWithMiss < stress.length);

console.log(JSON.stringify({
  square, quiet, radiusRows,
  cells: { outsidePerPiece: outside.length, protectedPerPiece: data.length,
    insideIds: data.filter((cell) => !outside.includes(cell)).map((cell) => cell.id), frameProbesPerPiece: frame.length },
  capacity: { oneErrorSyndromes, oneErrorWordsOutside: 2 ** (outside.length - 4), maxTwoErrorWordsOutside,
    twoErrorSyndromes, twoErrorWordsProtected: 2 ** (data.length - 8) },
  placement: { nominalCases: classes.length, nominalMisses: 0, stressCases: stress.length,
    outside: outcomes('outside'), all: outcomes('all') },
  nominalSpacing,
}, null, 2));
