// Exact enumeration of fragment-decoder behaviour under the independent bit-flip model.
// SYNTHETIC MODEL, NOT REAL CAMERAS. Deliberately independent of src/optical/decode-fragment.ts and
// src/optical/transforms.ts: the 8 D4 cell maps are defined locally, the frozen codebook JSON is read
// as bytes (read-only) and the 416 templates are built here.
//
// Model: a template T is corrupted by exactly k independent, uniformly chosen bit flips (every one of
// the C(25,k) masks equally likely). For radius r (1 or 2) the decoder accepts a word w iff exactly one
// distinct card has a template within Hamming distance r of w. The enumeration visits every
// (template, mask) pair of weight k in two parts, so there is no sampling error.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const N = 5;
const BITS = 25;
const FROZEN_SHA256 = "515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4";

type CellMap = (r: number, c: number) => [number, number];
const MAPS: ReadonlyArray<readonly [string, CellMap]> = [
  ["I", (r, c) => [r, c]],
  ["R90", (r, c) => [c, 4 - r]],
  ["R180", (r, c) => [4 - r, 4 - c]],
  ["R270", (r, c) => [4 - c, r]],
  ["Fh", (r, c) => [4 - r, c]],
  ["Fv", (r, c) => [r, 4 - c]],
  ["Dm", (r, c) => [c, r]],
  ["Da", (r, c) => [4 - c, 4 - r]],
];

export interface ReferenceTemplate {
  card: number;
  cardKey: string;
  transform: string;
  bits: number;
}

function popcount(x: number): number {
  x = x >>> 0;
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return Math.imul(x, 0x01010101) >>> 24;
}

function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

function transformBits(map: CellMap, p: number): number {
  let out = 0;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if ((p >>> (5 * r + c)) & 1) {
        const [r2, c2] = map(r, c);
        out |= 1 << (5 * r2 + c2);
      }
    }
  }
  return out >>> 0;
}

export interface Codebook {
  sha256: string;
  cardKeys: string[];
  patterns: number[];
}

/** Reads the frozen codebook as bytes (never written). */
export function readFrozenCodebook(): Codebook {
  const file = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src", "optical", "codebook.v1.json");
  const bytes = readFileSync(file);
  const sha256 = createHash("sha256").update(bytes).digest("hex").toUpperCase();
  const json = JSON.parse(bytes.toString("utf8")) as { cardOrder: string[]; patterns: Record<string, number> };
  return { sha256, cardKeys: json.cardOrder, patterns: json.cardOrder.map((k) => json.patterns[k] as number) };
}

export function buildTemplates(book: Codebook): ReferenceTemplate[] {
  const out: ReferenceTemplate[] = [];
  book.patterns.forEach((p, card) => {
    for (const [name, map] of MAPS) {
      out.push({ card, cardKey: book.cardKeys[card] as string, transform: name, bits: transformBits(map, p) });
    }
  });
  return out;
}

/** Flip masks with weight 0..radius (as bit masks), weight-major. */
function flipMasks(radius: number): number[] {
  const masks: number[] = [0];
  if (radius >= 1) for (let i = 0; i < BITS; i++) masks.push(1 << i);
  if (radius >= 2) for (let i = 0; i < BITS; i++) for (let j = i + 1; j < BITS; j++) masks.push((1 << i) | (1 << j));
  return masks;
}

/** Marker for words within radius of two or more DISTINCT cards. */
const AMBIGUOUS = -1;

export interface AcceptedWords {
  /** word -> card index (>=0) or AMBIGUOUS. */
  words: Map<number, number>;
  accepted: number;
  ambiguous: number;
}

/** Part 1: words within `radius` of some template, with the unique card or AMBIGUOUS. */
export function enumerateWords(templates: readonly ReferenceTemplate[], radius: number): AcceptedWords {
  const masks = flipMasks(radius);
  const words = new Map<number, number>();
  for (const t of templates) {
    for (const m of masks) {
      const w = (t.bits ^ m) >>> 0;
      const cur = words.get(w);
      if (cur === undefined) words.set(w, t.card);
      else if (cur !== t.card) words.set(w, AMBIGUOUS);
    }
  }
  let accepted = 0;
  let ambiguous = 0;
  for (const v of words.values()) {
    if (v === AMBIGUOUS) ambiguous++;
    else accepted++;
  }
  return { words, accepted, ambiguous };
}

export interface WeightRow {
  k: number;
  total: number;
  correct: number;
  correctExactTransform: number;
  correctOtherTransform: number;
  falseAccept: number;
  rejected: number;
  rejectedAmbiguous: number;
  rejectedCorrupted: number;
  correctRate: number;
  exactTransformRate: number;
  falseAcceptRate: number;
  rejectedRate: number;
}

export interface RadiusStatistics {
  radius: number;
  acceptedWords: number;
  ambiguousWords: number;
  /** Accepted words whose nearest template of the card is tied (symmetric patterns). */
  acceptedWordsWithTiedNearestTransform: number;
  rows: WeightRow[];
  firstFalseAcceptanceK: number | null;
  guarantees: {
    allCorrectUpToRadius: boolean;
    exactTransformUpToRadius: boolean;
    k2and3AllRejected: boolean | null;
  };
  shareK4to8: { total: number; correct: number; falseAccept: number; rejected: number; correctRate: number; falseAcceptRate: number; rejectedRate: number };
}

export interface ExactStatistics {
  model: string;
  codebookSha256: string;
  codebookMatchesFrozenHash: boolean;
  templates: number;
  radii: RadiusStatistics[];
}

const rate = (num: number, den: number): number => (den === 0 ? 0 : Number((num / den).toPrecision(12)));

function statisticsForRadius(templates: readonly ReferenceTemplate[], radius: number): RadiusStatistics {
  const { words, accepted, ambiguous } = enumerateWords(templates, radius);
  const T = templates.length;
  const tBits = Uint32Array.from(templates, (t) => t.bits);
  const tCard = Int32Array.from(templates, (t) => t.card);
  const cards = templates.reduce((m, t) => Math.max(m, t.card + 1), 0);

  const correct = new Array<number>(BITS + 1).fill(0);
  const exact = new Array<number>(BITS + 1).fill(0);
  const falseAccept = new Array<number>(BITS + 1).fill(0);
  const ambiguousEvents = new Array<number>(BITS + 1).fill(0);
  let tied = 0;

  const cardMin = new Int32Array(cards);
  const cardTies = new Int32Array(cards);
  for (const [w, cw] of words) {
    if (cw === AMBIGUOUS) {
      for (let i = 0; i < T; i++) ambiguousEvents[popcount((w ^ (tBits[i] as number)) >>> 0)]!++;
      continue;
    }
    // Nearest distance of w to the templates of its own card (and how many templates tie for it).
    cardMin[cw] = BITS + 1;
    cardTies[cw] = 0;
    for (let i = 0; i < T; i++) {
      if (tCard[i] !== cw) continue;
      const d = popcount((w ^ (tBits[i] as number)) >>> 0);
      if (d < (cardMin[cw] as number)) {
        cardMin[cw] = d;
        cardTies[cw] = 1;
      } else if (d === cardMin[cw]) {
        cardTies[cw]!++;
      }
    }
    if ((cardTies[cw] as number) > 1) tied++;
    const nearest = cardMin[cw] as number;
    for (let i = 0; i < T; i++) {
      const k = popcount((w ^ (tBits[i] as number)) >>> 0);
      if (tCard[i] === cw) {
        correct[k]!++;
        if (k === nearest) exact[k]!++;
      } else {
        falseAccept[k]!++;
      }
    }
  }

  const rows: WeightRow[] = [];
  for (let k = 0; k <= BITS; k++) {
    const total = T * binom(BITS, k);
    const c = correct[k] as number;
    const f = falseAccept[k] as number;
    const e = exact[k] as number;
    const a = ambiguousEvents[k] as number;
    const rej = total - c - f;
    rows.push({
      k,
      total,
      correct: c,
      correctExactTransform: e,
      correctOtherTransform: c - e,
      falseAccept: f,
      rejected: rej,
      rejectedAmbiguous: a,
      rejectedCorrupted: rej - a,
      correctRate: rate(c, total),
      exactTransformRate: rate(e, total),
      falseAcceptRate: rate(f, total),
      rejectedRate: rate(rej, total),
    });
  }
  const first = rows.find((r) => r.falseAccept > 0);
  const agg = rows.filter((r) => r.k >= 4 && r.k <= 8);
  const sum = (f: (r: WeightRow) => number): number => agg.reduce((s, r) => s + f(r), 0);
  const aTotal = sum((r) => r.total);
  return {
    radius,
    acceptedWords: accepted,
    ambiguousWords: ambiguous,
    acceptedWordsWithTiedNearestTransform: tied,
    rows,
    firstFalseAcceptanceK: first ? first.k : null,
    guarantees: {
      allCorrectUpToRadius: rows.filter((r) => r.k <= radius).every((r) => r.correct === r.total),
      exactTransformUpToRadius: rows.filter((r) => r.k <= radius).every((r) => r.correctExactTransform === r.total),
      k2and3AllRejected: radius === 1 ? rows.filter((r) => r.k === 2 || r.k === 3).every((r) => r.rejected === r.total) : null,
    },
    shareK4to8: {
      total: aTotal,
      correct: sum((r) => r.correct),
      falseAccept: sum((r) => r.falseAccept),
      rejected: sum((r) => r.rejected),
      correctRate: rate(sum((r) => r.correct), aTotal),
      falseAcceptRate: rate(sum((r) => r.falseAccept), aTotal),
      rejectedRate: rate(sum((r) => r.rejected), aTotal),
    },
  };
}

export function computeExactStatistics(): ExactStatistics {
  const book = readFrozenCodebook();
  const templates = buildTemplates(book);
  return {
    model: "template corrupted by exactly k independent uniformly-chosen bit flips; exact enumeration, synthetic model, not real cameras",
    codebookSha256: book.sha256,
    codebookMatchesFrozenHash: book.sha256 === FROZEN_SHA256,
    templates: templates.length,
    radii: [1, 2].map((r) => statisticsForRadius(templates, r)),
  };
}

const fmt = (n: number): string => n.toLocaleString("en-US");
const pct = (r: number): string => (r === 0 ? "0" : r === 1 ? "1" : r.toPrecision(6));

export function renderMarkdown(s: ExactStatistics): string {
  const lines: string[] = [];
  lines.push("# Fragment decoder: exact enumeration (task 4.2)");
  lines.push("");
  lines.push("**Synthetic model, not real cameras.** This is an EXACT enumeration of the independent-uniform-bit-flip");
  lines.push("model, not a sample, so there is no sampling error and no confidence bound is needed. It is not a model of real");
  lines.push("image corruption (blur, misaligned sampling and lighting do not flip independent bits).");
  lines.push("");
  lines.push("Model: a template T (52 cards x 8 D4 transforms = " + s.templates + ") is corrupted by exactly k independent,");
  lines.push("uniformly chosen bit flips; every one of the C(25,k) masks is equally likely. Each (T, mask) pair is visited once,");
  lines.push("so the number of events at weight k is 416 x C(25,k). The decoder accepts a word iff exactly one DISTINCT card has a");
  lines.push("template within the radius. correct = accepted as the source card (any transform); exact transform = the source");
  lines.push("template is the nearest template of that card; falseAccept = accepted as a different card; rejected = the rest");
  lines.push("(CORRUPTED_FRAGMENT or AMBIGUOUS).");
  lines.push("");
  lines.push(`Codebook SHA-256: ${s.codebookSha256} (${s.codebookMatchesFrozenHash ? "matches the frozen hash" : "**DOES NOT MATCH the frozen hash**"})`);
  for (const r of s.radii) {
    lines.push("");
    lines.push(`## Radius ${r.radius}`);
    lines.push("");
    lines.push(`- accepted words (unique card within radius): ${fmt(r.acceptedWords)}`);
    lines.push(`- ambiguous words (within radius of two or more distinct cards): ${fmt(r.ambiguousWords)}`);
    lines.push(`- accepted words with tied nearest transform: ${fmt(r.acceptedWordsWithTiedNearestTransform)}`);
    lines.push(`- smallest k with a false acceptance: ${r.firstFalseAcceptanceK === null ? "none" : r.firstFalseAcceptanceK}`);
    lines.push(`- k <= ${r.radius} all correct: ${r.guarantees.allCorrectUpToRadius}; all with the exact transform: ${r.guarantees.exactTransformUpToRadius}`);
    if (r.guarantees.k2and3AllRejected !== null) lines.push(`- k in {2, 3} all rejected: ${r.guarantees.k2and3AllRejected}`);
    const a = r.shareK4to8;
    lines.push(
      `- k = 4..8 pooled (${fmt(a.total)} events): correct ${pct(a.correctRate)}, false acceptance ${pct(a.falseAcceptRate)}, rejected ${pct(a.rejectedRate)}`,
    );
    lines.push("");
    lines.push("| k | events | correct (any transform) | correct, exact transform | correct, other transform | false acceptance | rejected | of which ambiguous | correct rate | false-acceptance rate | rejected rate |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
    for (const w of r.rows) {
      lines.push(
        `| ${w.k} | ${fmt(w.total)} | ${fmt(w.correct)} | ${fmt(w.correctExactTransform)} | ${fmt(w.correctOtherTransform)} | ${fmt(w.falseAccept)} | ${fmt(w.rejected)} | ${fmt(w.rejectedAmbiguous)} | ${pct(w.correctRate)} | ${pct(w.falseAcceptRate)} | ${pct(w.rejectedRate)} |`,
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

function main(): void {
  const stats = computeExactStatistics();
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const dir = resolve(root, "docs/optical/results");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "m4-2-decode-fragment.json"), JSON.stringify(stats, null, 2) + "\n");
  const md = renderMarkdown(stats);
  writeFileSync(resolve(dir, "m4-2-decode-fragment.md"), md);
  console.log(md);
  const ok = stats.codebookMatchesFrozenHash && stats.radii.every((r) => r.guarantees.allCorrectUpToRadius);
  if (!ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
