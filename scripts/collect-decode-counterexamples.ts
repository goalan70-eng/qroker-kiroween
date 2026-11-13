// Reproducible decoder counterexamples (task 4.3). SYNTHETIC images and a synthetic bit-flip model,
// NOT real cameras. Writes docs/optical/results/m4-3-counterexamples.json and .md.
// Deterministic: no timestamps, no runtimes, fixed seeds, stable ordering, LF line endings.
//
// Bit-level lists are derived from the independent enumeration in scripts/measure-decode-fragment.ts
// (own D4 maps, own matcher semantics), not from src/optical/decode-fragment.ts. The image-level cells go
// through the real pipeline (renderMarker -> detectMarkers -> decodeDetection) by design.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeDetection } from '../src/optical/decode-fragment';
import { detectMarkers } from '../src/optical/detect';
import { mulberry32 } from '../src/optical/prng';
import { renderMarker } from '../src/optical/render';
import { blankImage, pasteImage } from '../src/optical/testing/warp';
import {
  buildTemplates,
  computeExactStatistics,
  enumerateWords,
  readFrozenCodebook,
  type ExactStatistics,
  type ReferenceTemplate,
} from './measure-decode-fragment';

export const SEED = 20251112;
export const LIST_LENGTH = 25;
export const CELL_TRIALS = 300;
export const CELL_MAX_K = 8;

const popcount = (x: number): number => {
  let n = 0;
  for (let v = x >>> 0; v; v &= v - 1) n++;
  return n;
};
const hex = (bits: number): string => '0x' + (bits >>> 0).toString(16).toUpperCase().padStart(7, '0');

/** Visits the k-subsets of {0..n-1} in lexicographic order. The callback returns true to stop. */
export function forEachCombo(n: number, k: number, cb: (idx: readonly number[], mask: number) => boolean | void): void {
  const idx = Array.from({ length: k }, (_, i) => i);
  for (;;) {
    let mask = 0;
    for (const i of idx) mask |= 1 << i;
    if (cb(idx, mask >>> 0) === true) return;
    let p = k - 1;
    while (p >= 0 && idx[p] === n - k + p) p--;
    if (p < 0) return;
    idx[p] = (idx[p] as number) + 1;
    for (let q = p + 1; q < k; q++) idx[q] = (idx[q - 1] as number) + 1;
  }
}

export interface FalseAcceptance {
  sourceCard: string;
  sourceTransform: string;
  weight: number;
  flippedBits: number[];
  observedBits: string;
  decodedCard: string;
  decodedTransform: string;
  distance: number;
}
export type WrongTransform = FalseAcceptance;

export interface ExactRow {
  k: number;
  events: number;
  correct: number;
  correctExactTransform: number;
  correctOtherTransform: number;
  falseAccept: number;
  rejected: number;
}

export interface CellResult {
  radius: number;
  k: number;
  n: number;
  correct: number;
  correctRate: number;
  sameCardOtherTransform: number;
  falseAccept: number;
  falseAcceptRate: number;
  /** Exact one-sided 95% upper bound 1 - 0.05^(1/n); only when falseAccept is 0. */
  falseAcceptUpper95: number | null;
  rejected: number;
  rejectedRate: number;
  rejectedByKind: { CORRUPTED_FRAGMENT: number; AMBIGUOUS: number; NOT_DETECTED: number; INVALID_MARKER: number };
  /** Trials where no detected fragment carried the intended 25 bits. */
  detectorBitMismatch: number;
  /** Trials where the detector returned more than one fragment (spurious extra detections). */
  trialsWithExtraFragments: number;
}

export interface Report {
  title: string;
  warning: string;
  codebookSha256: string;
  idDistance: number;
  seed: number;
  radii: Array<{
    radius: number;
    exactCountsPerWeight: ExactRow[];
    falseAcceptances: FalseAcceptance[];
    wrongTransforms: WrongTransform[];
  }>;
  imageCellSpec: string;
  imageCells: CellResult[];
}

export function minIdentityDistance(templates: readonly ReferenceTemplate[]): number {
  let d = 99;
  for (const a of templates) for (const b of templates) if (a.card !== b.card) d = Math.min(d, popcount(a.bits ^ b.bits));
  return d;
}

function record(t: ReferenceTemplate, w: number, idx: readonly number[], word: number, dec: ReferenceTemplate, distance: number): FalseAcceptance {
  return {
    sourceCard: t.cardKey,
    sourceTransform: t.transform,
    weight: w,
    flippedBits: [...idx],
    observedBits: hex(word),
    decodedCard: dec.cardKey,
    decodedTransform: dec.transform,
    distance,
  };
}

function bitLevelLists(templates: readonly ReferenceTemplate[], radius: number): { fa: FalseAcceptance[]; wt: WrongTransform[] } {
  const { words } = enumerateWords(templates, radius);
  const fa: FalseAcceptance[] = [];
  const wt: WrongTransform[] = [];
  for (let w = 0; w <= 25 && (fa.length < LIST_LENGTH || wt.length < LIST_LENGTH); w++) {
    for (const t of templates) {
      if (fa.length >= LIST_LENGTH && wt.length >= LIST_LENGTH) break;
      forEachCombo(25, w, (idx, mask) => {
        const word = (t.bits ^ mask) >>> 0;
        const c = words.get(word);
        if (c === undefined || c === -1) return;
        if (c !== t.card && fa.length >= LIST_LENGTH) return;
        if (c === t.card && wt.length >= LIST_LENGTH) return;
        // Nearest template of the accepted card (first by transform order on a tie).
        let best: ReferenceTemplate | null = null;
        let bestD = 99;
        for (const u of templates) {
          if (u.card !== c) continue;
          const d = popcount((word ^ u.bits) >>> 0);
          if (d < bestD) {
            bestD = d;
            best = u;
          }
        }
        if (!best) return;
        if (c !== t.card) fa.push(record(t, w, idx, word, best, bestD));
        else if (bestD < w) wt.push(record(t, w, idx, word, best, bestD));
      });
    }
  }
  return { fa, wt };
}

const rate = (num: number, den: number): number => Number((num / den).toPrecision(6));

function runCell(templates: readonly ReferenceTemplate[], radius: 1 | 2, k: number): CellResult {
  const rng = mulberry32(SEED + 1000 * radius + k);
  const cell: CellResult = {
    radius,
    k,
    n: CELL_TRIALS,
    correct: 0,
    correctRate: 0,
    sameCardOtherTransform: 0,
    falseAccept: 0,
    falseAcceptRate: 0,
    falseAcceptUpper95: null,
    rejected: 0,
    rejectedRate: 0,
    rejectedByKind: { CORRUPTED_FRAGMENT: 0, AMBIGUOUS: 0, NOT_DETECTED: 0, INVALID_MARKER: 0 },
    detectorBitMismatch: 0,
    trialsWithExtraFragments: 0,
  };
  for (let t = 0; t < CELL_TRIALS; t++) {
    const ti = Math.floor(rng() * templates.length);
    const mp = 4 + Math.floor(rng() * 7);
    const ox = 12 + Math.floor(rng() * 25);
    const oy = 12 + Math.floor(rng() * 25);
    const pool = Array.from({ length: 25 }, (_, i) => i);
    let mask = 0;
    for (let j = 0; j < k; j++) {
      const pick = Math.floor(rng() * pool.length);
      mask |= 1 << (pool[pick] as number);
      pool.splice(pick, 1);
    }
    const src = templates[ti] as ReferenceTemplate;
    const bits = (src.bits ^ mask) >>> 0;
    const canvas = blankImage(9 * mp + 60, 9 * mp + 60);
    pasteImage(canvas, renderMarker(bits, mp), ox, oy);
    const res = decodeDetection(detectMarkers(canvas), { radius });
    if (res.kind === 'NOT_DETECTED' || res.kind === 'INVALID_MARKER') {
      cell.rejected++;
      cell.rejectedByKind[res.kind]++;
      cell.detectorBitMismatch++;
      continue;
    }
    // The real marker is the fragment that carries the intended bits. Any further fragment is a spurious
    // detection (for example an isolated black data blob) and is only counted, not classified.
    if (res.fragments.length > 1) cell.trialsWithExtraFragments++;
    const f = res.fragments.find((x) => x.marker.bits === bits);
    if (!f) {
      cell.detectorBitMismatch++;
      cell.rejected++;
      cell.rejectedByKind.NOT_DETECTED++; // the intended marker was not among the detections
      continue;
    }
    const o = f.outcome;
    if (o.status === 'IDENTIFIED') {
      if (o.card !== src.cardKey) cell.falseAccept++;
      else if (o.transform === src.transform) cell.correct++;
      else cell.sameCardOtherTransform++;
    } else {
      cell.rejected++;
      cell.rejectedByKind[o.status]++;
    }
  }
  cell.correctRate = rate(cell.correct, CELL_TRIALS);
  cell.falseAcceptRate = rate(cell.falseAccept, CELL_TRIALS);
  cell.rejectedRate = rate(cell.rejected, CELL_TRIALS);
  cell.falseAcceptUpper95 = cell.falseAccept === 0 ? Number((1 - Math.pow(0.05, 1 / CELL_TRIALS)).toPrecision(6)) : null;
  return cell;
}

/** Builds the full report. Pass precomputed exact statistics to avoid recomputing them. */
export function buildReport(stats: ExactStatistics = computeExactStatistics()): Report {
  const book = readFrozenCodebook();
  const templates = buildTemplates(book);
  const radii = ([1, 2] as const).map((radius) => {
    const lists = bitLevelLists(templates, radius);
    const rs = stats.radii[radius - 1];
    if (!rs) throw new Error('missing exact statistics');
    return {
      radius,
      exactCountsPerWeight: rs.rows.map((r) => ({
        k: r.k,
        events: r.total,
        correct: r.correct,
        correctExactTransform: r.correctExactTransform,
        correctOtherTransform: r.correctOtherTransform,
        falseAccept: r.falseAccept,
        rejected: r.rejected,
      })),
      falseAcceptances: lists.fa,
      wrongTransforms: lists.wt,
    };
  });
  const imageCells: CellResult[] = [];
  for (const radius of [1, 2] as const) for (let k = 0; k <= CELL_MAX_K; k++) imageCells.push(runCell(templates, radius, k));
  return {
    title: 'Fragment decoder counterexamples (task 4.3)',
    warning: 'SYNTHETIC images and a synthetic independent-bit-flip model, not real cameras.',
    codebookSha256: book.sha256,
    idDistance: minIdentityDistance(templates),
    seed: SEED,
    radii,
    imageCellSpec: `Per (radius, k) cell: n = ${CELL_TRIALS} seeded random (card, transform, k distinct flipped bits), rendered with renderMarker at a seeded modulePx 4..10 and integer offset, then detectMarkers + decodeDetection. Cells are never pooled.`,
    imageCells,
  };
}

export function renderJson(report: Report): string {
  return JSON.stringify(report, null, 2) + '\n';
}

const fmt = (n: number): string => n.toLocaleString('en-US');

function listTable(rows: FalseAcceptance[]): string[] {
  const out = ['| # | source card | source transform | weight | flipped bit indices | observed bits | decoded card | decoded transform | distance |', '|---|---|---|---|---|---|---|---|---|'];
  rows.forEach((r, i) =>
    out.push(`| ${i + 1} | ${r.sourceCard} | ${r.sourceTransform} | ${r.weight} | ${r.flippedBits.join(',')} | ${r.observedBits} | ${r.decodedCard} | ${r.decodedTransform} | ${r.distance} |`),
  );
  return out;
}

export function renderMarkdown(report: Report): string {
  const L: string[] = [];
  L.push(`# ${report.title}`, '');
  L.push(`**${report.warning}** Exact enumeration (no sampling, no bound needed) is the authoritative bit-level statistic.`);
  L.push('The image-level cells are finite samples of a synthetic rendering; they are not real-camera results.', '');
  L.push(`Codebook SHA-256: ${report.codebookSha256}. Minimum Hamming distance between templates of different cards (d_id): ${report.idDistance}.`);
  L.push(`Seed: ${report.seed}. Inherent limit: a false acceptance needs at least d_id - radius flips; the decoder cannot tell such a word from a corrupted one.`, '');
  for (const r of report.radii) {
    L.push(`## Radius ${r.radius}`, '');
    L.push(`### Smallest-weight cross-card false acceptances (first ${r.falseAcceptances.length}; order: weight, template index, flip-index lexicographic)`, '');
    L.push(...listTable(r.falseAcceptances), '');
    L.push(`### Same card, different transform than the source (first ${r.wrongTransforms.length}; same order)`, '');
    L.push(...listTable(r.wrongTransforms), '');
    L.push('### Exact counts per flip weight (full enumeration)', '');
    L.push('| k | events | correct (any transform) | correct, exact transform | correct, other transform | false acceptance | rejected |', '|---|---|---|---|---|---|---|');
    for (const w of r.exactCountsPerWeight) {
      L.push(`| ${w.k} | ${fmt(w.events)} | ${fmt(w.correct)} | ${fmt(w.correctExactTransform)} | ${fmt(w.correctOtherTransform)} | ${fmt(w.falseAccept)} | ${fmt(w.rejected)} |`);
    }
    L.push('');
  }
  L.push('## Image-level cells (synthetic images, not real cameras)', '');
  L.push(report.imageCellSpec, '');
  L.push('correct = right card and right transform. Zero false acceptances give only the one-sided 95% upper bound 1 - 0.05^(1/n), not a zero rate.', '');
  L.push('| radius | k | n | correct | correct rate | same card, other transform | false accept | false-accept rate | upper 95% bound (only if 0) | rejected | rejected rate | rejected by kind (CORRUPTED / AMBIGUOUS / NOT_DETECTED / INVALID; NOT_DETECTED also counts trials where no detection carried the intended bits) | detector bit mismatch | trials with extra (spurious) fragments |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const c of report.imageCells) {
    const b = c.rejectedByKind;
    L.push(
      `| ${c.radius} | ${c.k} | ${c.n} | ${c.correct} | ${c.correctRate} | ${c.sameCardOtherTransform} | ${c.falseAccept} | ${c.falseAcceptRate} | ${c.falseAcceptUpper95 === null ? '-' : c.falseAcceptUpper95} | ${c.rejected} | ${c.rejectedRate} | ${b.CORRUPTED_FRAGMENT} / ${b.AMBIGUOUS} / ${b.NOT_DETECTED} / ${b.INVALID_MARKER} | ${c.detectorBitMismatch} | ${c.trialsWithExtraFragments} |`,
    );
  }
  L.push('');
  return L.join('\n');
}

function main(): void {
  const report = buildReport();
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const dir = resolve(root, 'docs/optical/results');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'm4-3-counterexamples.json'), renderJson(report));
  writeFileSync(resolve(dir, 'm4-3-counterexamples.md'), renderMarkdown(report));
  console.log(`wrote m4-3-counterexamples.json/.md (d_id ${report.idDistance})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
