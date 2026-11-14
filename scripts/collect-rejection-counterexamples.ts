// SYNTHETIC images and a synthetic independent-bit-flip model, not real cameras.
// Writes docs/optical/results/m6-1-counterexamples.json and .md (task 6.1, Property 24 at radius 2).
// Deterministic: no timestamps, no runtimes, fixed seeds, stable ordering, LF line endings.
//
// What is measured. For a valid four-card group rendered with real pixels, ONE fragment gets k flipped data modules
// (the pixels of those modules are inverted in the composed image), and the whole image goes through
// decodeGroup(image, { radius: 2 }). At radius 2 there is NO guaranteed rejection interval, so nothing here is an
// assertion: the counts say how often a corrupted fragment is rejected, read back as the right card, or accepted as
// ANOTHER card (false acceptance), and what the group decoder then reports. Exact bit-level counts for all 416
// templates are recomputed with a lookup table and must equal docs/optical/results/m4-2-decode-fragment.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeFragment } from '../src/optical/decode-fragment';
import { decodeGroup, type GroupDecodeResult } from '../src/optical/decode-group';
import { mulberry32 } from '../src/optical/prng';
import { SLOT_NAMES, composeGroup, referenceSum, type SlotName } from '../src/optical/testing/group-compose';
import {
  TEMPLATES,
  arrangementText,
  bitToCell,
  cardsOfArrangement,
  drawArrangement,
  flipDataModules,
  masksOfWeight,
  maskToBits,
  minCrossCardDistance,
  observedPatterns,
  popcount,
  predictGroup,
} from '../src/optical/testing/rejection-support';
import { readFrozenCodebook } from './measure-decode-fragment';

export const SEED = 20251201;
export const GROUPS = 8;
export const MODULE_PX = 4;
/** Seeded masks per (group, slot, weight) for the sampled weights 5..8. */
export const SAMPLE_MASKS = 300;
/** Seeded bit-level-rejected words per (group, slot, weight) that are also decoded from pixels, as a consistency sample. */
export const REJECTED_PIXEL_SAMPLE = 6;
export const LIST_LIMIT = 60;

const hex = (bits: number): string => '0x' + (bits >>> 0).toString(16).toUpperCase().padStart(7, '0');

// ---------------------------------------------------------------------------------------------
// Bit-level lookup (radius 2): word -> card / transform / distance
// ---------------------------------------------------------------------------------------------

interface Ball {
  card: number;
  template: number;
  distance: number;
}

const CARD_INDEX = new Map<string, number>();
TEMPLATES.forEach((t) => {
  if (!CARD_INDEX.has(t.card)) CARD_INDEX.set(t.card, CARD_INDEX.size);
});

function buildBall2(): Map<number, Ball> {
  const masks: Array<[number, number]> = [[0, 0]];
  for (let i = 0; i < 25; i++) masks.push([1 << i, 1]);
  for (let i = 0; i < 25; i++) for (let j = i + 1; j < 25; j++) masks.push([(1 << i) | (1 << j), 2]);
  const map = new Map<number, Ball>();
  TEMPLATES.forEach((t, ti) => {
    const card = CARD_INDEX.get(t.card) as number;
    for (const [m, w] of masks) {
      const word = (t.bits ^ m) >>> 0;
      const cur = map.get(word);
      if (!cur) map.set(word, { card, template: ti, distance: w });
      else if (cur.card !== card) cur.card = -1;
      else if (w < cur.distance) {
        cur.distance = w;
        cur.template = ti;
      }
    }
  });
  return map;
}

export interface BitCounts {
  events: number;
  /** Accepted as the source card (any transform). */
  sameCard: number;
  /** Accepted as a different card. */
  falseAccept: number;
  /** Rejected (CORRUPTED_FRAGMENT). */
  rejected: number;
}

const zero = (): BitCounts => ({ events: 0, sameCard: 0, falseAccept: 0, rejected: 0 });

// ---------------------------------------------------------------------------------------------
// Report types
// ---------------------------------------------------------------------------------------------

export type GroupOutcome =
  | 'IDENTIFIED_CORRECT'
  | 'IDENTIFIED_WRONG_CARDS'
  | 'CORRUPTED_FRAGMENT'
  | 'DUPLICATE_CARD'
  | 'INVALID_ARRANGEMENT'
  | 'OTHER';
const OUTCOMES: readonly GroupOutcome[] = ['IDENTIFIED_CORRECT', 'IDENTIFIED_WRONG_CARDS', 'CORRUPTED_FRAGMENT', 'DUPLICATE_CARD', 'INVALID_ARRANGEMENT', 'OTHER'];

export interface WeightCell {
  weight: number;
  /** 'exact' = every mask of this weight; 'sampled' = SAMPLE_MASKS seeded masks per (group, slot). */
  coverage: 'exact' | 'sampled';
  bit: BitCounts;
  /** Words decoded from real pixels: every bit-level accepted word plus a seeded sample of rejected ones. */
  pixelRuns: number;
  pixelRunsAccepted: number;
  groupOutcomes: Record<GroupOutcome, number>;
  /** Pixel runs where decodeGroup disagreed with the independent brute-force prediction (expected 0). */
  predictionMismatches: number;
}

export interface Counterexample {
  groupSeed: number;
  arrangement: string;
  slot: SlotName;
  trueCard: string;
  weight: number;
  flippedBitIndices: number[];
  /** Data modules (row, column) of the 5 x 5 data area, row 0 = top row of the marker as painted. */
  flippedModules: Array<{ row: number; col: number }>;
  observedBits: string;
  decodedCard: string;
  decodedTransform: string;
  fragmentDistance: number;
  groupKind: 'IDENTIFIED';
  groupCards: string[];
  trueCards: string[];
  groupSum: number;
  trueSum: number;
}

export interface Report {
  title: string;
  warning: string;
  codebookSha256: string;
  idDistance: number;
  seed: number;
  radius: 2;
  setup: string;
  /** Exact bit-level counts over ALL 416 templates (lookup); equal to the m4-2 enumeration. */
  allTemplates: Array<{ weight: number } & BitCounts>;
  cells: WeightCell[];
  totals: { pixelRuns: number; identifiedWrongCards: number; counterexamplesListed: number };
  counterexamples: Counterexample[];
}

// ---------------------------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------------------------

function sampleMasks(rng: () => number, weight: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let m = 0;
    while (popcount(m) < weight) m |= 1 << Math.floor(rng() * 25);
    out.push(m >>> 0);
  }
  return out;
}

function outcomeOf(r: GroupDecodeResult, trueCards: string[]): GroupOutcome {
  if (r.kind === 'IDENTIFIED') return [...r.cards].sort().join() === trueCards.join() ? 'IDENTIFIED_CORRECT' : 'IDENTIFIED_WRONG_CARDS';
  if (r.kind === 'CORRUPTED_FRAGMENT' || r.kind === 'DUPLICATE_CARD' || r.kind === 'INVALID_ARRANGEMENT') return r.kind;
  return 'OTHER';
}

export function buildRejectionReport(): Report {
  const book = readFrozenCodebook();
  const ball = buildBall2();
  const classify = (word: number, trueCard: number): 'SAME' | 'FALSE' | 'REJECT' => {
    const e = ball.get(word >>> 0);
    if (!e) return 'REJECT';
    return e.card === trueCard ? 'SAME' : 'FALSE';
  };

  // 1. all 416 templates, weights 3 and 4 (exact)
  const allTemplates: Report['allTemplates'] = [];
  for (const w of [3, 4]) {
    const masks = masksOfWeight(w);
    const c = zero();
    TEMPLATES.forEach((t) => {
      const card = CARD_INDEX.get(t.card) as number;
      for (const m of masks) {
        c.events++;
        const k = classify((t.bits ^ m) >>> 0, card);
        if (k === 'SAME') c.sameCard++;
        else if (k === 'FALSE') c.falseAccept++;
        else c.rejected++;
      }
    });
    allTemplates.push({ weight: w, ...c });
  }

  // 2. seeded groups, one corrupted fragment each
  const exactMasks: Record<number, number[]> = { 3: masksOfWeight(3), 4: masksOfWeight(4) };
  const cells = new Map<number, WeightCell>();
  const cell = (weight: number): WeightCell => {
    let c = cells.get(weight);
    if (!c) {
      c = {
        weight,
        coverage: weight <= 4 ? 'exact' : 'sampled',
        bit: zero(),
        pixelRuns: 0,
        pixelRunsAccepted: 0,
        groupOutcomes: Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<GroupOutcome, number>,
        predictionMismatches: 0,
      };
      cells.set(weight, c);
    }
    return c;
  };
  const found: Counterexample[] = [];
  let identifiedWrong = 0;
  let pixelRuns = 0;

  for (let gi = 0; gi < GROUPS; gi++) {
    const groupSeed = SEED + gi;
    const rng = mulberry32(groupSeed);
    const arr = drawArrangement(rng, 'any');
    const obs = observedPatterns(arr);
    const trueCards = cardsOfArrangement(arr);
    const trueSum = referenceSum(trueCards);
    const composed = composeGroup(arr, { modulePx: MODULE_PX });
    for (const slot of SLOT_NAMES) {
      const trueWord = obs[slot];
      const trueCard = CARD_INDEX.get(arr[slot].card) as number;
      for (const weight of [3, 4, 5, 6, 7, 8]) {
        const masks = weight <= 4 ? (exactMasks[weight] as number[]) : sampleMasks(mulberry32(groupSeed * 31 + weight * 7 + SLOT_NAMES.indexOf(slot)), weight, SAMPLE_MASKS);
        const c = cell(weight);
        const rejectedSeen: number[] = [];
        const runs: number[] = [];
        const stride = Math.max(1, Math.floor(masks.length / REJECTED_PIXEL_SAMPLE));
        let rejectedIndex = 0;
        for (const m of masks) {
          const word = (trueWord ^ m) >>> 0;
          const k = classify(word, trueCard);
          c.bit.events++;
          if (k === 'SAME') c.bit.sameCard++;
          else if (k === 'FALSE') c.bit.falseAccept++;
          else c.bit.rejected++;
          if (k !== 'REJECT') runs.push(m);
          else {
            if (rejectedIndex % stride === 0 && rejectedSeen.length < REJECTED_PIXEL_SAMPLE) rejectedSeen.push(m);
            rejectedIndex++;
          }
        }
        const accepted = runs.length;
        runs.push(...rejectedSeen);
        for (let ri = 0; ri < runs.length; ri++) {
          const m = runs[ri] as number;
          const word = (trueWord ^ m) >>> 0;
          const img = flipDataModules(composed.image, composed.centers[slot], MODULE_PX, maskToBits(m));
          const res = decodeGroup(img, { radius: 2 });
          pixelRuns++;
          c.pixelRuns++;
          if (ri < accepted) c.pixelRunsAccepted++;
          const out = outcomeOf(res, trueCards);
          c.groupOutcomes[out]++;
          // independent prediction of what the group decoder must report (brute force, no decoder code)
          const pred = predictGroup({ ...obs, [slot]: word } as Record<SlotName, number>, 2);
          const same =
            pred.kind === res.kind &&
            (pred.kind !== 'IDENTIFIED' || (res.kind === 'IDENTIFIED' && pred.cards.join() === [...res.cards].sort().join())) &&
            (pred.kind !== 'DUPLICATE_CARD' || (res.kind === 'DUPLICATE_CARD' && pred.card === res.card));
          if (!same) c.predictionMismatches++;
          if (out === 'IDENTIFIED_WRONG_CARDS' && res.kind === 'IDENTIFIED') {
            identifiedWrong++;
            const frag = decodeFragment(word, { radius: 2 });
            if (frag.status === 'IDENTIFIED') {
              found.push({
                groupSeed,
                arrangement: arrangementText(arr),
                slot,
                trueCard: arr[slot].card,
                weight,
                flippedBitIndices: maskToBits(m),
                flippedModules: maskToBits(m).map(bitToCell),
                observedBits: hex(word),
                decodedCard: frag.card,
                decodedTransform: frag.transform,
                fragmentDistance: frag.distance,
                groupKind: 'IDENTIFIED',
                groupCards: [...res.cards],
                trueCards,
                groupSum: res.hiddenSum,
                trueSum,
              });
            }
          }
        }
      }
    }
  }

  // list order: weight, group, slot, mask (generation order is already group, slot, weight); sort for stability
  const slotIdx = (s: SlotName): number => SLOT_NAMES.indexOf(s);
  found.sort((a, b) => a.weight - b.weight || a.groupSeed - b.groupSeed || slotIdx(a.slot) - slotIdx(b.slot) || a.observedBits.localeCompare(b.observedBits));
  const listed = found.slice(0, LIST_LIMIT);

  return {
    title: 'Group decoder at radius 2: corrupted-fragment outcomes beyond the guaranteed range (task 6.1)',
    warning: 'SYNTHETIC images and a synthetic independent-bit-flip model, not real cameras. Radius 2 has no guaranteed rejection interval.',
    codebookSha256: book.sha256,
    idDistance: minCrossCardDistance(),
    seed: SEED,
    radius: 2,
    setup:
      `${GROUPS} seeded valid groups (seed ${SEED} + i, drawArrangement 'any', modulePx ${MODULE_PX}); for each of the 4 slots exactly one fragment gets k flipped data modules ` +
      `(pixel inversion), decodeGroup(image, { radius: 2 }) sees only the image. Weights 3 and 4: every mask (2,300 and 12,650) is classified at bit level; weights 5..8: ${SAMPLE_MASKS} seeded masks per (group, slot). ` +
      `Every bit-level accepted word and a seeded sample of at most ${REJECTED_PIXEL_SAMPLE} rejected words per (group, slot, weight) are decoded from real pixels.`,
    allTemplates,
    cells: [...cells.values()].sort((a, b) => a.weight - b.weight),
    totals: { pixelRuns, identifiedWrongCards: identifiedWrong, counterexamplesListed: listed.length },
    counterexamples: listed,
  };
}

export function renderJson(report: Report): string {
  return JSON.stringify(report, null, 2) + '\n';
}

const fmt = (n: number): string => n.toLocaleString('en-US');

export function renderMarkdown(r: Report): string {
  const L: string[] = [];
  L.push(`# ${r.title}`, '');
  L.push(`**${r.warning}**`, '');
  L.push(`Codebook SHA-256: ${r.codebookSha256}. Minimum Hamming distance between templates of different cards (d_id): ${r.idDistance}. Seed: ${r.seed}.`, '');
  L.push(r.setup, '');
  L.push('Nothing below is an assertion about a guaranteed rejection. At radius 2 a word that is 3 or more flips from its source can lie within radius 2 of ANOTHER card, and the decoder then accepts it as that card. These are the measured counts, not a bound on arbitrary corruption.', '');
  L.push('## Exact bit-level counts over all 416 templates (equal to the m4-2 enumeration)', '');
  L.push('| flips k | events | accepted as the source card | falsely accepted as another card | rejected (CORRUPTED_FRAGMENT) |', '|---|---|---|---|---|');
  for (const a of r.allTemplates) L.push(`| ${a.weight} | ${fmt(a.events)} | ${fmt(a.sameCard)} | ${fmt(a.falseAccept)} | ${fmt(a.rejected)} |`);
  L.push('');
  L.push('## Per flip weight, for the corrupted fragments of the seeded groups', '');
  L.push('Bit level = decodeFragment semantics (lookup). Group level = decodeGroup on real pixels. "Pixel runs" are all bit-level accepted words plus a small seeded sample of rejected words.', '');
  L.push('| k | coverage | bit events | bit: source card | bit: other card (false accept) | bit: rejected | pixel runs (accepted / total) | group: IDENTIFIED correct | group: IDENTIFIED WRONG cards | group: CORRUPTED_FRAGMENT | group: DUPLICATE_CARD | group: INVALID_ARRANGEMENT | group: other | prediction mismatches |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const c of r.cells) {
    const g = c.groupOutcomes;
    L.push(
      `| ${c.weight} | ${c.coverage} | ${fmt(c.bit.events)} | ${fmt(c.bit.sameCard)} | ${fmt(c.bit.falseAccept)} | ${fmt(c.bit.rejected)} | ${c.pixelRunsAccepted} / ${c.pixelRuns} | ${g.IDENTIFIED_CORRECT} | ${g.IDENTIFIED_WRONG_CARDS} | ${g.CORRUPTED_FRAGMENT} | ${g.DUPLICATE_CARD} | ${g.INVALID_ARRANGEMENT} | ${g.OTHER} | ${c.predictionMismatches} |`,
    );
  }
  L.push('');
  L.push(`Total pixel runs: ${fmt(r.totals.pixelRuns)}. Group-level silent wrong identifications (IDENTIFIED with a different card set): ${fmt(r.totals.identifiedWrongCards)}. Listed below: ${r.totals.counterexamplesListed} (smallest weight first).`, '');
  L.push('A group-level false acceptance needs the falsely accepted word to be a transform that the slot table allows for the other card, and the other card must not already be in the group; most fragment-level false acceptances are therefore still rejected by the duplicate or arrangement check.', '');
  L.push('## Concrete group-level counterexamples (IDENTIFIED with wrong cards)', '');
  L.push('| # | group seed | arrangement | slot | true card | k | flipped modules (row,col) | observed bits | decoded as (transform, distance) | cards returned | true cards | sum returned | true sum |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  r.counterexamples.forEach((c, i) =>
    L.push(
      `| ${i + 1} | ${c.groupSeed} | ${c.arrangement} | ${c.slot} | ${c.trueCard} | ${c.weight} | ${c.flippedModules.map((m) => `(${m.row},${m.col})`).join(' ')} | ${c.observedBits} | ${c.decodedCard} (${c.decodedTransform}, ${c.fragmentDistance}) | ${c.groupCards.join(' ')} | ${c.trueCards.join(' ')} | ${c.groupSum} | ${c.trueSum} |`,
    ),
  );
  L.push('');
  return L.join('\n');
}

function main(): void {
  const report = buildRejectionReport();
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const dir = resolve(root, 'docs/optical/results');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'm6-1-counterexamples.json'), renderJson(report));
  writeFileSync(resolve(dir, 'm6-1-counterexamples.md'), renderMarkdown(report));
  console.log(`wrote m6-1-counterexamples.json/.md: ${report.totals.pixelRuns} pixel runs, ${report.totals.identifiedWrongCards} IDENTIFIED with wrong cards`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
