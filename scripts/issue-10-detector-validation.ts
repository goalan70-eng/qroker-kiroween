/** Bounded paired synthetic experiment. Never overwrites the historical M4/M5/M6 reports.
 * Run: npx tsx scripts/issue-10-detector-validation.ts
 * The baseline is loaded from the pinned commit into a temporary directory, never checked out.
 * Both readers receive the identical image and layout options; truth is used only afterwards.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeGroup, type DecodeGroupOptions, type GroupDecodeResult } from '../src/optical/decode-group';
import { detectMarkers } from '../src/optical/detect';
import { mulberry32 } from '../src/optical/prng';
import type { GrayImage } from '../src/optical/render';
import { CLEAN_DARK, type CellParams } from '../src/optical/testing/geometry-design';
import { probeTrial } from '../src/optical/testing/geometry-probe';
import { geometryOf, markerCenterOffsetModules } from '../src/optical/testing/geometry-trial';
import { composeGroup, referenceSum, SLOT_NAMES, type Arrangement, type SlotName } from '../src/optical/testing/group-compose';
import { cardsOfArrangement, drawArrangement, flipDataModules } from '../src/optical/testing/rejection-support';
import { blankImage, compose, rotationMatrix, translationMatrix, warpImage } from '../src/optical/testing/warp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = '3ca08b9';
const OUT = resolve(ROOT, 'docs/optical/results/issue-10-detector-validation');
const sha = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');
const SEED = 0x10decafe;
const random = mulberry32(SEED);
// New fixed independent card seeds, selected before measuring outcomes; the old pinned seed is separate.
const SEEDS = Array.from({ length: 3 }, () => Math.floor(random() * 0x100000000));
const PHASES = [{ x: 0, y: 0 }, { x: 0, y: 0.5 }, { x: 0.25, y: 0.75 }, { x: 0.5, y: 0.25 }];
const ANGLES = [0, 44, 44.9, 45, 45.1, 46, 89];
type Class = 'CORRECT' | 'REJECTED' | 'FALSE_ACCEPT';
type Outcome = { cls: Class; kind: string; cards?: string[]; sum?: number; detected?: number };
type Row = { family: string; input: unknown; before: Outcome; after: Outcome };
const rows: Row[] = [];

function judge(r: GroupDecodeResult, truth: readonly string[] | null): Outcome {
  if (r.kind !== 'IDENTIFIED') return { cls: 'REJECTED', kind: r.kind };
  const cards = [...r.cards].sort();
  const correct = truth !== null && cards.join() === [...truth].sort().join() && r.hiddenSum === referenceSum(truth);
  return { cls: correct ? 'CORRECT' : 'FALSE_ACCEPT', kind: r.kind, cards, sum: r.hiddenSum };
}

const dir = mkdtempSync(join(tmpdir(), 'qroker-issue-10-baseline-'));
try {
  const source = (name: string): string => execFileSync('git', ['show', `${BASELINE}:src/optical/${name}.ts`], { cwd: ROOT, encoding: 'utf8' });
  const beforeSource = source('detect');
  writeFileSync(join(dir, 'detect.ts'), beforeSource);
  const groupSource = source('decode-group').replace(/from '\.\/(decode-fragment|transforms|fragments|render)'/g,
    (_, n: string) => `from '${pathToFileURL(resolve(ROOT, `src/optical/${n}.ts`)).href}'`);
  writeFileSync(join(dir, 'decode-group.ts'), groupSource);
  const before = await import(pathToFileURL(join(dir, 'decode-group.ts')).href) as { decodeGroup: typeof decodeGroup };
  const oldDetector = await import(pathToFileURL(join(dir, 'detect.ts')).href) as { detectMarkers: typeof detectMarkers };
  function pair(family: string, input: unknown, image: GrayImage, truth: readonly string[] | null, options: DecodeGroupOptions = {}): void {
    rows.push({ family, input, before: judge(before.decodeGroup(image, options), truth), after: judge(decodeGroup(image, options), truth) });
  }
  function physical(family: string, p: CellParams, seed: number, angle: number, phase: { x: number; y: number }): void {
    const probe = probeTrial(p, seed, { cameraRotationDeg: angle, shiftPx: phase });
    pair(family, { seed, inset: p.insetModules, layout: p.layout, absentCard: p.absentCard, angle, phase }, probe.image,
      p.absentCard ? null : probe.scenario.truthCards, { centerOffsetModules: markerCenterOffsetModules(geometryOf(p)) });
  }
  for (const insetModules of [1, 1.5, 2]) for (const seed of SEEDS) for (const angle of ANGLES) for (const phase of PHASES) {
    physical('independent-positive', { ...CLEAN_DARK, insetModules }, seed, angle, phase);
  }
  for (const angle of [44.9, 45, 45.1]) for (const phase of PHASES) {
    physical('historical-pinned-positive', { ...CLEAN_DARK, insetModules: 2 }, 4283752155, angle, phase);
  }
  for (const insetModules of [1, 1.5, 2]) for (const seed of SEEDS.slice(0, 2)) for (const angle of [44.9, 45, 45.1]) for (const phase of PHASES) {
    physical('incomplete-physical-negative', { ...CLEAN_DARK, insetModules, absentCard: true }, seed, angle, phase);
  }
  for (const absentCard of [false, true]) for (const seed of SEEDS.slice(0, 2)) for (const angle of [0, 45]) for (const phase of PHASES.slice(0, 2)) {
    physical(absentCard ? '3x3-incomplete-control' : '3x3-positive-control', { ...CLEAN_DARK, layout: '3x3', absentCard }, seed, angle, phase);
  }
  const view = (image: GrayImage, angle: number, phase: { x: number; y: number }): GrayImage => warpImage(image,
    compose(rotationMatrix(angle, image.width / 2, image.height / 2), translationMatrix(phase.x, phase.y)), image.width, image.height,
    { background: 255, supersample: 2 });
  // Filled silhouettes with no marker data. Also score detector output, so group rejection cannot hide spurious markers.
  for (const shape of ['disk', 'ellipse', 'triangle', 'cross', 'pentagon', 'bar', 'noise']) for (const size of [18, 28, 56]) {
    const image = blankImage(128, 128, 255);
    const rng = mulberry32(SEED + size);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const u = (x + 0.5 - 64) / (size / 2), v = (y + 0.5 - 64) / (size / 2);
      const hit = shape === 'disk' ? u * u + v * v <= 1
        : shape === 'ellipse' ? u * u / 0.36 + v * v <= 1
        : shape === 'triangle' ? v >= -1 && v <= 1 && Math.abs(u) <= (v + 1) / 2
        : shape === 'cross' ? Math.max(Math.abs(u), Math.abs(v)) <= 1 && Math.min(Math.abs(u), Math.abs(v)) <= 0.25
        : shape === 'pentagon' ? Array.from({ length: 5 }, (_, i) => u * Math.cos(2 * Math.PI * i / 5) + v * Math.sin(2 * Math.PI * i / 5)).every(d => d <= 0.8)
        : shape === 'bar' ? Math.abs(u) <= 0.2 && Math.abs(v) <= 1
        : Math.abs(u) <= 1 && Math.abs(v) <= 1 && rng() < 0.5;
      if (hit) image.data[y * 128 + x] = 0;
    }
    for (const angle of [0, 45, 73]) for (const phase of PHASES) {
      const sample = view(image, angle, phase);
      const count = (r: ReturnType<typeof detectMarkers>): number => r.kind === 'DETECTED' ? r.markers.length : 0;
      const old = oldDetector.detectMarkers(sample), current = detectMarkers(sample);
      rows.push({ family: 'silhouette-detector-negative', input: { shape, size, angle, phase },
        before: { cls: count(old) === 0 ? 'REJECTED' : 'FALSE_ACCEPT', kind: old.kind, detected: count(old) },
        after: { cls: count(current) === 0 ? 'REJECTED' : 'FALSE_ACCEPT', kind: current.kind, detected: count(current) } });
    }
  }
  for (const seed of SEEDS.slice(0, 2)) {
    const arrangement = drawArrangement(mulberry32(seed));
    const built = composeGroup(arrangement, { modulePx: 4 });
    for (const slot of SLOT_NAMES) for (const bits of [[0, 12], [0, 12, 24]]) {
      const damaged = flipDataModules(built.image, built.centers[slot], 4, bits);
      for (const angle of [44.9, 45, 45.1]) for (const phase of PHASES) {
        pair('radius1-corrupted-negative', { seed, slot, bits, angle, phase }, view(damaged, angle, phase), null);
      }
    }
  }
  const counterexamples = JSON.parse(readFileSync(resolve(ROOT, 'docs/optical/results/m6-1-counterexamples.json'), 'utf8')).counterexamples as
    Array<{ arrangement: string; slot: SlotName; flippedBitIndices: number[]; trueCards: string[] }>;
  for (const [index, example] of counterexamples.entries()) {
    const arrangement = Object.fromEntries(example.arrangement.split(' ').map(s => {
      const [slot, placement] = s.split(':') as [SlotName, string];
      const [card, orientation] = placement.split('@');
      return [slot, { card, orientation: Number(orientation) }];
    })) as Arrangement;
    const built = composeGroup(arrangement, { modulePx: 4 });
    const damaged = flipDataModules(built.image, built.centers[example.slot], 4, example.flippedBitIndices);
    for (const radius of [1, 2] as const) pair(`preserved-counterexample-radius${radius}`,
      { index, radius, flippedBitIndices: example.flippedBitIndices }, damaged, cardsOfArrangement(arrangement), { radius });
  }
  const summary: Record<string, unknown> = {};
  for (const family of new Set(rows.map(r => r.family))) {
    const rs = rows.filter(r => r.family === family);
    const counts = (side: 'before' | 'after') => Object.fromEntries(['CORRECT', 'REJECTED', 'FALSE_ACCEPT'].map(c => [c, rs.filter(r => r[side].cls === c).length]));
    summary[family] = { n: rs.length, before: counts('before'), after: counts('after'),
      changedClassification: rs.filter(r => r.before.cls !== r.after.cls).length,
      changedOutcome: rs.filter(r => JSON.stringify(r.before) !== JSON.stringify(r.after)).length };
  }
  const report = { disclaimer: 'Bounded synthetic samples only; no print, camera, phone, performance-rate or full-sweep claim.',
    baselineCommit: BASELINE, baselineDetectorSha256: sha(beforeSource), detectorSha256: sha(readFileSync(resolve(ROOT, 'src/optical/detect.ts'))),
    codebookSha256: sha(readFileSync(resolve(ROOT, 'src/optical/codebook.v1.json'))),
    historicalCounterexamplesSha256: sha(readFileSync(resolve(ROOT, 'docs/optical/results/m6-1-counterexamples.json'))),
    seed: SEED, independentSeeds: SEEDS, angles: ANGLES, phases: PHASES,
    summary, rows };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(`${OUT}.json`, JSON.stringify(report, null, 2) + '\n');
  const table = Object.entries(summary).map(([family, value]) => {
    const s = value as { n: number; before: Record<string, number>; after: Record<string, number>; changedOutcome: number };
    return `| ${family} | ${s.n} | ${Object.values(s.before).join(' / ')} | ${Object.values(s.after).join(' / ')} | ${s.changedOutcome} |`;
  });
  writeFileSync(`${OUT}.md`, '# Issue #10: paired detector validation\n\n' + report.disclaimer + '\n\n' +
    `Baseline: \`${BASELINE}\`; seed: \`0x${SEED.toString(16)}\`; new card seeds: ${SEEDS.join(', ')}.\n\n` +
    '| Family | n | Before C / R / FA | After C / R / FA | Changed outcome |\n|---|---:|---|---|---:|\n' + table.join('\n') + '\n\n' +
    'C = exact identities and sum; R = rejected; FA = accepted contrary to truth. For silhouette-only detector negatives, any detected marker is FA. ' +
    'Corrupted negative cases require rejection. Preserved radius-2 examples are scored against their original cards, with all false acceptances disclosed. ' +
    'The JSON contains every fixed input and outcome, source hashes and phases. Truth is never supplied to either reader.\n\n' +
    'Reproduce: `npx tsx scripts/issue-10-detector-validation.ts`. No historical report is regenerated.\n');
  console.log(JSON.stringify(summary, null, 2));
} finally {
  if (dirname(resolve(dir)) !== resolve(tmpdir()) || !dir.startsWith(join(tmpdir(), 'qroker-issue-10-baseline-'))) {
    throw new Error('Refusing to remove a directory outside the generated baseline temporary location');
  }
  rmSync(dir, { recursive: true, force: true });
}
