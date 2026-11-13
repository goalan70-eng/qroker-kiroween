import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fc from 'fast-check';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { runVerification } from '../../scripts/verify-codebook';
import { CODEBOOK_SEED, generateCodebook } from './codebook'; // test-only import
import { applyTransform, TRANSFORM_NAMES } from './transforms'; // test-only import
import {
  applyTransformForVerification,
  verifyCodebook,
  VERIFIER_TRANSFORM_NAMES,
  type VerificationReport,
} from './verify-codebook';

vi.setConfig({ testTimeout: 300_000 });

const SEED = 20251112;
const HERE = fileURLToPath(new URL('.', import.meta.url));
const FROZEN_PATH = resolve(HERE, 'codebook.v1.json');
const VERIFIER_SRC_PATH = resolve(HERE, 'verify-codebook.ts');
const CLI_SRC_PATH = resolve(HERE, '../../scripts/verify-codebook.ts');
const FROZEN_BYTES = readFileSync(FROZEN_PATH);
const FROZEN_TEXT = FROZEN_BYTES.toString('utf8');
const FROZEN = JSON.parse(FROZEN_TEXT);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cb = any;
const clone = (): Cb => structuredClone(FROZEN);
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

/** Recompute the internal sha256 field (same rule as the generator: hash of all other fields). */
function rehash(cb: Cb): Cb {
  const body: Record<string, unknown> = {};
  for (const k of Object.keys(cb)) if (k !== 'sha256') body[k] = cb[k];
  cb.sha256 = sha(JSON.stringify(body));
  return cb;
}
function mutate(fn: (cb: Cb) => void, rehashAfter = true): VerificationReport {
  const cb = clone();
  fn(cb);
  if (rehashAfter) rehash(cb);
  return verifyCodebook(cb);
}
function notOk(r: VerificationReport, ...ids: string[]): void {
  expect(r.ok).toBe(false);
  for (const id of ids) {
    const c = r.checks.find((x) => x.id === id);
    expect(c, `check ${id} present`).toBeDefined();
    expect(c!.ok, `check ${id} should fail: ${c?.detail}`).toBe(false);
  }
}

// ---- independent brute-force reference (bit operations, written for this test) ----
const MAP: Record<string, (r: number, c: number) => [number, number]> = {
  I: (r, c) => [r, c],
  R90: (r, c) => [c, 4 - r],
  R180: (r, c) => [4 - r, 4 - c],
  R270: (r, c) => [4 - c, r],
  Fh: (r, c) => [4 - r, c],
  Fv: (r, c) => [r, 4 - c],
  Dm: (r, c) => [c, r],
  Da: (r, c) => [4 - c, 4 - r],
};
const TNAMES = Object.keys(MAP);
function tf(name: string, p: number): number {
  let out = 0;
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 5; c++)
      if ((p >>> (5 * r + c)) & 1) {
        const [r2, c2] = MAP[name]!(r, c);
        out |= 1 << (5 * r2 + c2);
      }
  return out >>> 0;
}
const pc = (x: number) => {
  let n = 0;
  for (let v = x >>> 0; v; v &= v - 1) n++;
  return n;
};
interface Brute {
  ok: boolean;
  dId: number;
  dSelf: number;
}
function bruteForce(cb: Cb): Brute {
  const keys: string[] = cb.cardOrder;
  const tpl: { card: number; v: number }[] = [];
  let ok = keys.length === 52 && new Set(keys).size === 52;
  const bases = new Set<number>();
  keys.forEach((k, ci) => {
    const p: number = cb.patterns[k];
    bases.add(p);
    const w = pc(p);
    if (w < 9 || w > 16) ok = false;
    for (const t of TNAMES) tpl.push({ card: ci, v: tf(t, p) });
    const second = tf(k[0] === 'H' || k[0] === 'D' ? 'R180' : 'Fh', p);
    if (second === p || pc((second ^ p) >>> 0) < 5) ok = false;
  });
  if (bases.size !== 52) ok = false;
  if (new Set(tpl.map((t) => t.v)).size !== 416) ok = false;
  let dId = 99;
  let dSelf = 99;
  for (let i = 0; i < tpl.length; i++)
    for (let j = i + 1; j < tpl.length; j++) {
      const d = pc((tpl[i]!.v ^ tpl[j]!.v) >>> 0);
      if (d < 5) ok = false;
      if (tpl[i]!.card === tpl[j]!.card) dSelf = Math.min(dSelf, d);
      else dId = Math.min(dId, d);
    }
  if (cb.dId !== dId || cb.dSelf !== dSelf) ok = false;
  return { ok, dId, dSelf };
}

// ---- A. positive ----
describe('A. positive cases', () => {
  it('frozen codebook passes with full measurements', () => {
    const r = verifyCodebook(FROZEN);
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.stats.cards).toBe(52);
    expect(r.stats.templates).toBe(416);
    expect(r.stats.pairs).toBe(86320);
    expect(r.stats.dId).toBe(FROZEN.dId);
    expect(r.stats.dSelf).toBe(FROZEN.dSelf);
    expect(r.stats.weightMin!).toBeGreaterThanOrEqual(9);
    expect(r.stats.weightMax!).toBeLessThanOrEqual(16);
    expect(r.checks.map((c) => c.id)).toEqual([
      'shape', 'card-keys', 'pattern-values', 'base-distinct', 'weight-range', 'transform-self-check',
      'templates-416', 'min-distance', 'd-id', 'd-self', 'metadata-agreement', 'sha256', 'suit-fragments',
    ]);
    expect(r.checks.every((c) => c.ok)).toBe(true);
  });
  it('freshly generated codebooks (default seed and seed+1) pass', () => {
    for (const seed of [CODEBOOK_SEED, CODEBOOK_SEED + 1]) {
      const cb = generateCodebook({ seed });
      const r = verifyCodebook(JSON.parse(JSON.stringify(cb)));
      expect(r.failures).toEqual([]);
      expect(r.ok).toBe(true);
      expect(r.stats.dId).toBe(cb.dId);
      expect(r.stats.dSelf).toBe(cb.dSelf);
    }
  });
  it('is deterministic for the same input', () => {
    expect(verifyCodebook(clone())).toEqual(verifyCodebook(clone()));
  });
});

// ---- B. independence ----
describe('B. verifier independence', () => {
  const specifiers = (src: string): string[] => {
    const out: string[] = [];
    for (const m of src.matchAll(/(?:from|import\s*\(?|require\s*\()\s*['"]([^'"]+)['"]/g)) out.push(m[1]!);
    return out;
  };
  const banned = new Set(['codebook', 'prng', 'transforms']);
  const base = (s: string) => (s.split('/').pop() ?? s).replace(/\.(ts|js)$/, '');
  it('verifier imports only node:crypto', () => {
    const src = readFileSync(VERIFIER_SRC_PATH, 'utf8');
    expect(specifiers(src)).toEqual(['node:crypto']);
    expect(/require\s*\(/.test(src)).toBe(false);
  });
  it('CLI script does not import generator modules', () => {
    const src = readFileSync(CLI_SRC_PATH, 'utf8');
    const specs = specifiers(src);
    expect(specs.length).toBeGreaterThan(0);
    for (const s of specs) expect(banned.has(base(s)), `import ${s}`).toBe(false);
    expect(specs).toContain('../src/optical/verify-codebook');
  });
});

// ---- C. negative ----
describe('C. negative cases', () => {
  it('1. identical base patterns -> base-distinct', () => {
    notOk(mutate((cb) => (cb.patterns['H-2'] = cb.patterns['H-A'])), 'base-distinct');
  });
  it('2. card replaced by another card template under another transform -> min-distance, d-id', () => {
    const r = mutate((cb) => (cb.patterns['H-2'] = tf('R90', cb.patterns['H-A'])));
    notOk(r, 'min-distance', 'd-id');
    expect(r.stats.dId).toBe(0);
    expect(r.stats.minPairDistance).toBe(0);
  });
  it('3. another card template with 1-3 bits flipped -> min-distance with distance < 5', () => {
    for (const flips of [1, 2, 3]) {
      for (const t of ['I', 'R90', 'Fh']) {
        let mask = 0;
        for (let i = 0; i < flips; i++) mask |= 1 << (i * 7 + 1);
        const r = mutate((cb) => (cb.patterns['H-2'] = (tf(t, cb.patterns['H-A']) ^ mask) >>> 0));
        notOk(r, 'min-distance');
        expect(r.stats.minPairDistance!).toBeLessThan(5);
        expect(r.stats.minPairDistance!).toBeLessThanOrEqual(flips);
      }
    }
  });
  it('4. weight out of range -> weight-range', () => {
    for (const v of [(1 << 8) - 1, (1 << 17) - 1, 0, (1 << 25) - 1]) {
      notOk(mutate((cb) => (cb.patterns['S-K'] = v)), 'weight-range');
    }
  });
  it('5. R180-symmetric and Fh-symmetric patterns with weight in range -> d-self / min-distance', () => {
    let r180 = 0;
    for (let i = 0; i < 6; i++) r180 |= (1 << i) | (1 << (24 - i));
    let fh = 0;
    for (let i = 0; i < 6; i++) fh |= (1 << i) | (1 << (5 * (4 - Math.floor(i / 5)) + (i % 5)));
    for (const [name, p] of [['R180', r180], ['Fh', fh]] as const) {
      expect(tf(name, p)).toBe(p);
      expect(pc(p)).toBeGreaterThanOrEqual(9);
      expect(pc(p)).toBeLessThanOrEqual(16);
      const r = mutate((cb) => (cb.patterns['D-7'] = p));
      expect(r.checks.find((c) => c.id === 'weight-range')!.ok).toBe(true);
      notOk(r, 'd-self', 'min-distance');
      expect(r.stats.dSelf).toBe(0);
    }
  });
  it('6. card key set / order problems -> card-keys', () => {
    notOk(mutate((cb) => delete cb.patterns['H-A']), 'card-keys');
    notOk(
      mutate((cb) => {
        delete cb.patterns['H-A'];
        cb.cardOrder = cb.cardOrder.filter((k: string) => k !== 'H-A');
      }),
      'card-keys',
    );
    for (const extra of ['JK', 'JOKER']) {
      notOk(mutate((cb) => (cb.patterns[extra] = 12345)), 'card-keys');
      notOk(
        mutate((cb) => {
          cb.patterns[extra] = 12345;
          cb.cardOrder.push(extra);
        }),
        'card-keys',
      );
    }
    notOk(
      mutate((cb) => {
        cb.patterns['H-1'] = cb.patterns['H-A'];
        delete cb.patterns['H-A'];
      }),
      'card-keys',
    );
    notOk(
      mutate((cb) => {
        cb.patterns['H-1'] = cb.patterns['H-A'];
        delete cb.patterns['H-A'];
        cb.cardOrder[0] = 'H-1';
      }),
      'card-keys',
    );
    notOk(mutate((cb) => ([cb.cardOrder[0], cb.cardOrder[1]] = [cb.cardOrder[1], cb.cardOrder[0]])), 'card-keys');
    notOk(mutate((cb) => cb.cardOrder.reverse()), 'card-keys');
  });
  it('7. invalid pattern values -> pattern-values', () => {
    const bad: unknown[] = [1.5, -1, 2 ** 25, NaN, Infinity, '5', null, true, [5]];
    for (const v of bad) notOk(mutate((cb) => (cb.patterns['C-3'] = v)), 'pattern-values');
  });
  it('8. metadata lies -> metadata-agreement or sha256', () => {
    notOk(mutate((cb) => (cb.dId = 6)), 'metadata-agreement');
    notOk(mutate((cb) => (cb.dSelf = 7)), 'metadata-agreement');
    notOk(mutate((cb) => (cb.weightRange = [8, 16])), 'metadata-agreement');
    notOk(mutate((cb) => (cb.attemptsUsed = cb.attemptCap + 1)), 'metadata-agreement');
    // without rehash both the lie and the stale hash are caught
    notOk(mutate((cb) => (cb.dId = 6), false), 'metadata-agreement', 'sha256');
    // altered hash alone is isolated to sha256
    const r = mutate((cb) => (cb.sha256 = '0'.repeat(64)), false);
    notOk(r, 'sha256');
    expect(r.checks.filter((c) => !c.ok).map((c) => c.id)).toEqual(['sha256']);
    const flipped = mutate((cb) => (cb.sha256 = (cb.sha256[0] === 'a' ? 'b' : 'a') + cb.sha256.slice(1)), false);
    notOk(flipped, 'sha256');
  });
  it('9. non-object inputs -> shape failure, no throw', () => {
    const noPatterns = clone();
    delete noPatterns.patterns;
    const arrPatterns = clone();
    arrPatterns.patterns = [];
    const inputs: unknown[] = [null, undefined, 42, 'codebook', [], {}, noPatterns, arrPatterns];
    for (const inp of inputs) {
      let r: VerificationReport | undefined;
      expect(() => (r = verifyCodebook(inp))).not.toThrow();
      notOk(r!, 'shape');
    }
  });
  it('10. deep-frozen input does not throw and nothing is mutated', () => {
    const deepFreeze = (o: unknown): unknown => {
      if (typeof o === 'object' && o !== null) {
        Object.values(o).forEach(deepFreeze);
        Object.freeze(o);
      }
      return o;
    };
    const frozen = deepFreeze(clone()) as Cb;
    const before = JSON.stringify(frozen);
    let r: VerificationReport | undefined;
    expect(() => (r = verifyCodebook(frozen))).not.toThrow();
    expect(r!.ok).toBe(true);
    expect(JSON.stringify(frozen)).toBe(before);
    expect(JSON.stringify(FROZEN)).toBe(JSON.stringify(JSON.parse(FROZEN_TEXT)));
    expect(before).toBe(JSON.stringify(JSON.parse(FROZEN_TEXT)));
  });
  it('11. property: verifier.ok equals brute-force verdict after random 1-4 bit corruption', () => {
    expect(bruteForce(FROZEN).ok).toBe(true);
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 51 }),
        fc.uniqueArray(fc.integer({ min: 0, max: 24 }), { minLength: 1, maxLength: 4 }),
        fc.boolean(),
        (card, bits, fixMeta) => {
          const cb = clone();
          const key = cb.cardOrder[card];
          for (const b of bits) cb.patterns[key] = (cb.patterns[key] ^ (1 << b)) >>> 0;
          if (fixMeta) {
            const m = bruteForce(cb);
            cb.dId = m.dId;
            cb.dSelf = m.dSelf;
          }
          rehash(cb);
          const brute = bruteForce(cb);
          return verifyCodebook(cb).ok === brute.ok;
        },
      ),
      { seed: SEED, numRuns: 100 },
    );
  });
});

// ---- D. CLI / report ----
describe('D. runVerification', () => {
  const dirs: string[] = [];
  const tmp = () => {
    const d = mkdtempSync(join(tmpdir(), 'qroker-verify-'));
    dirs.push(d);
    return d;
  };
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

  it('is deterministic, writes exactly what it returns, and does not touch the frozen file', () => {
    const before = sha(readFileSync(FROZEN_PATH));
    const o1 = tmp();
    const o2 = tmp();
    const a = runVerification(FROZEN_PATH, o1);
    const b = runVerification(FROZEN_PATH, o2);
    expect(a.report.ok).toBe(true);
    expect(a.jsonText).toBe(b.jsonText);
    expect(a.mdText).toBe(b.mdText);
    expect(readFileSync(join(o1, 'codebook-verification.json'), 'utf8')).toBe(a.jsonText);
    expect(readFileSync(join(o1, 'codebook-verification.md'), 'utf8')).toBe(a.mdText);
    expect(readdirSync(o1).sort()).toEqual(['codebook-verification.json', 'codebook-verification.md']);
    expect(JSON.parse(a.jsonText).fileSha256).toBe(before);
    expect(sha(readFileSync(FROZEN_PATH))).toBe(before);
    expect(a.mdText).toContain('PASS');
  });
  it('reports failure for a corrupted temp copy and leaves the frozen file untouched', () => {
    const before = sha(readFileSync(FROZEN_PATH));
    const d = tmp();
    const cb = clone();
    cb.patterns['H-2'] = cb.patterns['H-A'];
    rehash(cb);
    const bad = join(d, 'corrupt.json');
    writeFileSync(bad, JSON.stringify(cb, null, 2) + '\n');
    const out = tmp();
    const r = runVerification(bad, out);
    expect(r.report.ok).toBe(false);
    expect(r.report.checks.find((c) => c.id === 'base-distinct')!.ok).toBe(false);
    expect(r.mdText).toContain('FAIL');
    expect(sha(readFileSync(FROZEN_PATH))).toBe(before);
    expect(sha(readFileSync(bad))).not.toBe(before);
  });
  it('reports failure for unparsable input without throwing', () => {
    const d = tmp();
    const bad = join(d, 'garbage.json');
    writeFileSync(bad, '{not json');
    const r = runVerification(bad, tmp());
    notOk(r.report, 'shape');
  });
});

// ---- E. cross-check of template bits ----
describe('E. verifier template bits vs applyTransform', () => {
  it('verifier transform names equal TRANSFORM_NAMES exactly', () => {
    expect([...VERIFIER_TRANSFORM_NAMES]).toEqual([...TRANSFORM_NAMES]);
  });
  it('verifier transform matches applyTransform for 52 base patterns x 8 transforms (416)', () => {
    let n = 0;
    for (const key of FROZEN.cardOrder as string[]) {
      for (const g of TRANSFORM_NAMES) {
        expect(applyTransformForVerification(g, FROZEN.patterns[key])).toBe(applyTransform(g, FROZEN.patterns[key]));
        n++;
      }
    }
    expect(n).toBe(416);
  });
  it('helper throws on an unknown transform name', () => {
    expect(() => applyTransformForVerification('R45', 1)).toThrow();
    expect(() => applyTransformForVerification('toString', 1)).toThrow();
  });
});
