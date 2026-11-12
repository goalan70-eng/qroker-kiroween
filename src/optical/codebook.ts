import { createHash } from 'node:crypto';
import { mulberry32 } from './prng';
import { TRANSFORM_NAMES, applyTransform } from './transforms';

/** Fixed, documented seed ("QROK" in ASCII). Never tuned; whatever it yields is frozen. */
export const CODEBOOK_SEED = 0x51524f4b;
export const DEFAULT_ATTEMPT_CAP = 2_000_000;
export const CODEBOOK_VERSION = 'codebook.v1';
export const ALGORITHM =
  'greedy; mulberry32(seed); candidate=floor(rng()*2^25); accept if popcount in [9,16], ' +
  'hamming(P,g.P)>=5 for all g!=I, hamming(P,t)>=5 for all 8 transforms t of accepted cards; ' +
  'assigned in acceptance order to H,D,C,S x A..K';

const SUITS = ['H', 'D', 'C', 'S'] as const;
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export const CARD_ORDER: readonly string[] = SUITS.flatMap((s) => RANKS.map((r) => `${s}-${r}`));

export interface Codebook {
  version: string;
  algorithm: string;
  seed: number;
  attemptCap: number;
  attemptsUsed: number;
  cardOrder: string[];
  patterns: Record<string, number>;
  dId: number;
  dSelf: number;
  weightRange: [number, number];
  sha256: string;
}

export interface GenerateOptions {
  seed?: number;
  attemptCap?: number;
}

export function popcount(x: number): number {
  let v = x >>> 0;
  let n = 0;
  while (v) {
    v &= v - 1;
    n++;
  }
  return n;
}

export function hamming(a: number, b: number): number {
  return popcount((a ^ b) >>> 0);
}

function templatesOf(p: number): number[] {
  return TRANSFORM_NAMES.map((g) => applyTransform(g, p));
}

function selfDistance(p: number): number {
  let m = Infinity;
  for (const g of TRANSFORM_NAMES) {
    if (g === 'I') continue;
    m = Math.min(m, hamming(p, applyTransform(g, p)));
  }
  return m;
}

function hashBody(body: Omit<Codebook, 'sha256'>): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

export function generateCodebook(options: GenerateOptions = {}): Codebook {
  const seed = options.seed ?? CODEBOOK_SEED;
  const attemptCap = options.attemptCap ?? DEFAULT_ATTEMPT_CAP;
  const rng = mulberry32(seed);
  const accepted: number[] = [];
  const templates: number[] = [];
  let attempts = 0;

  while (accepted.length < CARD_ORDER.length) {
    if (attempts >= attemptCap) {
      throw new Error(
        `Codebook generation failed: accepted ${accepted.length}/${CARD_ORDER.length} within ${attemptCap} draws`,
      );
    }
    attempts++;
    const p = Math.floor(rng() * 2 ** 25);
    const w = popcount(p);
    if (w < 9 || w > 16) continue;
    if (selfDistance(p) < 5) continue;
    let ok = true;
    for (const t of templates) {
      if (hamming(p, t) < 5) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    accepted.push(p);
    templates.push(...templatesOf(p));
  }

  // Direct measurement over the produced codebook.
  let dId = Infinity;
  let dSelf = Infinity;
  let wMin = Infinity;
  let wMax = -Infinity;
  accepted.forEach((p, i) => {
    dSelf = Math.min(dSelf, selfDistance(p));
    wMin = Math.min(wMin, popcount(p));
    wMax = Math.max(wMax, popcount(p));
    for (let j = i + 1; j < accepted.length; j++) {
      const q = accepted[j] as number;
      for (const t of templatesOf(q)) dId = Math.min(dId, hamming(p, t));
    }
  });
  // p vs all 8 transforms of q covers all template pairs across cards (distance is D4-invariant).

  const patterns: Record<string, number> = {};
  CARD_ORDER.forEach((card, i) => {
    patterns[card] = accepted[i] as number;
  });

  const body: Omit<Codebook, 'sha256'> = {
    version: CODEBOOK_VERSION,
    algorithm: ALGORITHM,
    seed,
    attemptCap,
    attemptsUsed: attempts,
    cardOrder: [...CARD_ORDER],
    patterns,
    dId,
    dSelf,
    weightRange: [wMin, wMax],
  };
  return { ...body, sha256: hashBody(body) };
}

/** Stable key order, 2-space indent, trailing LF. */
export function serializeCodebook(cb: Codebook): string {
  const ordered = {
    version: cb.version,
    algorithm: cb.algorithm,
    seed: cb.seed,
    attemptCap: cb.attemptCap,
    attemptsUsed: cb.attemptsUsed,
    cardOrder: cb.cardOrder,
    patterns: Object.fromEntries(cb.cardOrder.map((c) => [c, cb.patterns[c]])),
    dId: cb.dId,
    dSelf: cb.dSelf,
    weightRange: cb.weightRange,
    sha256: cb.sha256,
  };
  return JSON.stringify(ordered, null, 2).replace(/\r\n/g, '\n') + '\n';
}
