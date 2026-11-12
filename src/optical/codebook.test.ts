import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CARD_ORDER, generateCodebook, serializeCodebook } from './codebook';
import { TRANSFORM_NAMES, applyTransform, type TransformName } from './transforms';

const FILE = fileURLToPath(new URL('./codebook.v1.json', import.meta.url));
const RAW = readFileSync(FILE, 'utf8');
const FROZEN = JSON.parse(RAW) as {
  patterns: Record<string, number>;
  dId: number;
  dSelf: number;
  sha256: string;
  [k: string]: unknown;
};

// Independent measurement helpers (not imported from the generator).
function popcnt(x: number): number {
  let n = 0;
  for (let i = 0; i < 25; i++) n += (x >>> i) & 1;
  return n;
}
function ham(a: number, b: number): number {
  return popcnt((a ^ b) & 0x1ffffff);
}

const SUITS = ['H', 'D', 'C', 'S'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const EXPECTED_KEYS = SUITS.flatMap((s) => RANKS.map((r) => `${s}-${r}`));
const cards = Object.keys(FROZEN.patterns);
const base = (c: string) => FROZEN.patterns[c] as number;

interface Template {
  card: string;
  g: TransformName;
  bits: number;
}
const templates: Template[] = cards.flatMap((card) =>
  TRANSFORM_NAMES.map((g) => ({ card, g, bits: applyTransform(g, base(card)) })),
);

describe('frozen codebook structure', () => {
  it('has exactly the 52 expected keys in order, no jokers, valid 25-bit integers', () => {
    expect(cards).toHaveLength(52);
    expect(cards).toEqual(EXPECTED_KEYS);
    for (const k of cards) expect(/joker|JK|X/i.test(k)).toBe(false);
    for (const v of Object.values(FROZEN.patterns)) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(2 ** 25);
    }
  });

  it('has 52 pairwise distinct base patterns', () => {
    expect(new Set(Object.values(FROZEN.patterns)).size).toBe(52);
  });

  it('has base popcount in [9, 16]', () => {
    for (const c of cards) {
      const w = popcnt(base(c));
      expect(w).toBeGreaterThanOrEqual(9);
      expect(w).toBeLessThanOrEqual(16);
    }
  });
});

describe('416 templates', () => {
  it('are pairwise distinct with all 86,320 pairs at Hamming distance >= 5; stored dId/dSelf match', () => {
    expect(templates).toHaveLength(416);
    expect(new Set(templates.map((t) => t.bits)).size).toBe(416);
    let pairs = 0;
    let minAll = Infinity;
    let dId = Infinity;
    let dSelf = Infinity;
    for (let i = 0; i < templates.length; i++) {
      for (let j = i + 1; j < templates.length; j++) {
        const a = templates[i] as Template;
        const b = templates[j] as Template;
        const d = ham(a.bits, b.bits);
        pairs++;
        minAll = Math.min(minAll, d);
        if (a.card !== b.card) dId = Math.min(dId, d);
        else dSelf = Math.min(dSelf, d);
      }
    }
    expect(pairs).toBe(86_320);
    expect(minAll).toBeGreaterThanOrEqual(5);
    expect(dId).toBe(FROZEN.dId);
    expect(dSelf).toBe(FROZEN.dSelf);
    expect(dId).toBeGreaterThanOrEqual(5);
    expect(dSelf).toBeGreaterThanOrEqual(5);
  });

  it('property: any two distinct (card, transform) pairs differ in >= 5 bits', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 415 }),
        fc.integer({ min: 0, max: 415 }),
        (i, j) => {
          fc.pre(i !== j);
          return ham((templates[i] as Template).bits, (templates[j] as Template).bits) >= 5;
        },
      ),
      { numRuns: 500, seed: 20251112 },
    );
  });
});

describe('suit-specific second fragment (pattern level)', () => {
  it('is R180.P for hearts/diamonds and Fh.P for clubs/spades, distinct from P by >= 5, within the orbit', () => {
    for (const card of cards) {
      const suit = card.split('-')[0] as string;
      const g: TransformName = suit === 'H' || suit === 'D' ? 'R180' : 'Fh';
      const p = base(card);
      const second = applyTransform(g, p);
      expect(second).not.toBe(p);
      expect(ham(p, second)).toBeGreaterThanOrEqual(5);
      const orbit = TRANSFORM_NAMES.map((t) => applyTransform(t, p));
      expect(orbit).toContain(second);
    }
  });
});

describe('determinism and generation', () => {
  it('two generations are byte-identical and equal the frozen file', () => {
    const a = serializeCodebook(generateCodebook());
    const b = serializeCodebook(generateCodebook());
    expect(a).toBe(b);
    expect(a).toBe(RAW);
  });

  it('a different seed yields a different, still valid codebook', () => {
    const cb = generateCodebook({ seed: (FROZEN.seed as number) + 1 });
    expect(serializeCodebook(cb)).not.toBe(RAW);
    expect(cb.patterns).not.toEqual(FROZEN.patterns);
    const vals = CARD_ORDER.map((c) => cb.patterns[c] as number);
    expect(vals).toHaveLength(52);
    expect(new Set(vals).size).toBe(52);
    for (const v of vals) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(2 ** 25);
      expect(popcnt(v)).toBeGreaterThanOrEqual(9);
      expect(popcnt(v)).toBeLessThanOrEqual(16);
    }
  });

  it('throws when the attempt cap is exhausted instead of returning a partial codebook', () => {
    expect(() => generateCodebook({ attemptCap: 10 })).toThrow();
  });
});

describe('SHA-256', () => {
  it('matches the compact JSON of the content without the sha256 field', () => {
    const { sha256, ...body } = FROZEN;
    const digest = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    expect(digest).toBe(sha256);
  });
});
