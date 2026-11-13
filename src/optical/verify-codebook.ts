// Independent codebook verifier. Pure: no file I/O. Deliberately imports
// nothing from ./codebook, ./prng or ./transforms; it re-derives the eight D4
// cell maps and works on 5x5 arrays.
import { createHash } from 'node:crypto';

export const GRID = 5;
export const D_MIN = 5;
export const WEIGHT_MIN = 9;
export const WEIGHT_MAX = 16;
const LIMIT = 1 << 25;

const SUITS = ['H', 'D', 'C', 'S'] as const;
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
export const CANONICAL_KEYS: readonly string[] = SUITS.flatMap((s) => RANKS.map((r) => `${s}-${r}`));

type Cell = readonly [number, number];
type CellMap = (r: number, c: number) => Cell;
const N1 = GRID - 1;
const TRANSFORM_NAMES = ['I', 'R90', 'R180', 'R270', 'Fh', 'Fv', 'Dm', 'Da'] as const;
const MAPS: Record<string, CellMap> = {
  I: (r, c) => [r, c],
  R90: (r, c) => [c, N1 - r],
  R180: (r, c) => [N1 - r, N1 - c],
  R270: (r, c) => [N1 - c, r],
  Fh: (r, c) => [N1 - r, c],
  Fv: (r, c) => [r, N1 - c],
  Dm: (r, c) => [c, r],
  Da: (r, c) => [N1 - c, N1 - r],
};

export interface Check {
  id: string;
  ok: boolean;
  detail: string;
}
export interface VerificationStats {
  cards: number | null;
  templates: number | null;
  pairs: number | null;
  minPairDistance: number | null;
  dId: number | null;
  dSelf: number | null;
  weightMin: number | null;
  weightMax: number | null;
  distanceHistogram: Record<number, number> | null;
}
export interface VerificationReport {
  ok: boolean;
  stats: VerificationStats;
  checks: Check[];
  failures: string[];
}

function unpack(p: number): number[][] {
  const g: number[][] = [];
  for (let r = 0; r < GRID; r++) {
    const row: number[] = [];
    for (let c = 0; c < GRID; c++) row.push(Math.floor(p / 2 ** (GRID * r + c)) % 2);
    g.push(row);
  }
  return g;
}
function pack(g: number[][]): number {
  let p = 0;
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) if (g[r]?.[c]) p += 2 ** (GRID * r + c);
  return p;
}
function applyTransform(name: string, p: number): number {
  const f = MAPS[name]!;
  const src = unpack(p);
  const dst: number[][] = Array.from({ length: GRID }, () => new Array<number>(GRID).fill(0));
  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++) {
      const [r2, c2] = f(r, c);
      dst[r2!]![c2!] = src[r]![c]!;
    }
  return pack(dst);
}
/** Narrow pure helper exposing the verifier's own transform logic (for cross-checking in tests). */
export const VERIFIER_TRANSFORM_NAMES: readonly string[] = TRANSFORM_NAMES;
export function applyTransformForVerification(name: string, pattern: number): number {
  if (!Object.prototype.hasOwnProperty.call(MAPS, name)) throw new Error(`unknown transform: ${name}`);
  return applyTransform(name, pattern);
}
function popcount(p: number): number {
  let n = 0;
  for (let x = p; x > 0; x = Math.floor(x / 2)) n += x % 2;
  return n;
}
function hamming(a: number, b: number): number {
  let n = 0;
  for (let i = 0; i < GRID * GRID; i++) if (Math.floor(a / 2 ** i) % 2 !== Math.floor(b / 2 ** i) % 2) n++;
  return n;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isValidPattern(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < LIMIT;
}

function selfCheckMaps(): { ok: boolean; detail: string } {
  const problems: string[] = [];
  // Represent each map as the permutation of the 25 cells it induces.
  const perm = (name: string): number[] => {
    const out: number[] = [];
    for (let r = 0; r < GRID; r++)
      for (let c = 0; c < GRID; c++) {
        const [r2, c2] = MAPS[name]!(r, c);
        out.push(GRID * r2 + c2);
      }
    return out;
  };
  const perms = TRANSFORM_NAMES.map((n) => perm(n));
  perms.forEach((p, i) => {
    if (new Set(p).size !== 25 || p.some((x) => x < 0 || x > 24)) problems.push(`${TRANSFORM_NAMES[i]} not a bijection`);
  });
  const key = (p: number[]) => p.join(',');
  const known = new Map(perms.map((p, i) => [key(p), i]));
  if (known.size !== 8) problems.push('maps are not 8 distinct permutations');
  for (let a = 0; a < 8; a++) {
    for (let b = 0; b < 8; b++) {
      const pa = perms[a]!;
      const pb = perms[b]!;
      const comp = pa.map((_, x) => pa[pb[x]!]!);
      if (!known.has(key(comp))) problems.push(`not closed: ${TRANSFORM_NAMES[a]}∘${TRANSFORM_NAMES[b]}`);
    }
    const pa2 = perms[a]!;
    const hasInverse = perms.some((q) => pa2.every((_, x) => pa2[q[x]!] === x));
    if (!hasInverse) problems.push(`no inverse for ${TRANSFORM_NAMES[a]}`);
  }
  return problems.length === 0
    ? { ok: true, detail: '8 maps are bijections on 25 cells; closed under composition; every map has an inverse' }
    : { ok: false, detail: problems.join('; ') };
}

function sameArray(a: unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export function verifyCodebook(input: unknown): VerificationReport {
  const checks: Check[] = [];
  const add = (id: string, ok: boolean, detail: string) => checks.push({ id, ok, detail });
  const stats: VerificationStats = {
    cards: null,
    templates: null,
    pairs: null,
    minPairDistance: null,
    dId: null,
    dSelf: null,
    weightMin: null,
    weightMax: null,
    distanceHistogram: null,
  };
  const finish = (): VerificationReport => {
    const failures = checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.detail}`);
    return { ok: checks.every((c) => c.ok), stats, checks, failures };
  };

  try {
    // 1. shape
    const shapeProblems: string[] = [];
    let obj: Record<string, unknown> = {};
    if (!isPlainObject(input)) {
      shapeProblems.push('input is not a non-null plain object');
    } else {
      obj = input;
      if (!isPlainObject(obj.patterns)) shapeProblems.push('patterns missing or not an object');
      if (!Array.isArray(obj.cardOrder)) shapeProblems.push('cardOrder missing or not an array');
      for (const k of ['dId', 'dSelf', 'seed'])
        if (typeof obj[k] !== 'number') shapeProblems.push(`${k} missing or not a number`);
      for (const k of ['version', 'sha256'])
        if (typeof obj[k] !== 'string') shapeProblems.push(`${k} missing or not a string`);
      const wr = obj.weightRange;
      if (!Array.isArray(wr) || wr.length !== 2 || wr.some((x) => typeof x !== 'number'))
        shapeProblems.push('weightRange missing or not an array of two numbers');
    }
    add('shape', shapeProblems.length === 0, shapeProblems.length === 0 ? 'required fields present with correct types' : shapeProblems.join('; '));
    if (shapeProblems.length > 0) {
      const sc = selfCheckMaps();
      add('transform-self-check', sc.ok, sc.detail);
      return finish();
    }
    const patterns = obj.patterns as Record<string, unknown>;
    const cardOrder = obj.cardOrder as unknown[];

    // 2. card-keys
    const keys = Object.keys(patterns);
    const missing = CANONICAL_KEYS.filter((k) => !Object.prototype.hasOwnProperty.call(patterns, k));
    const extra = keys.filter((k) => !CANONICAL_KEYS.includes(k));
    const orderOk = sameArray(cardOrder, CANONICAL_KEYS);
    const keyProblems: string[] = [];
    if (missing.length) keyProblems.push(`missing keys: ${missing.join(',')}`);
    if (extra.length) keyProblems.push(`unexpected keys: ${extra.join(',')}`);
    if (!orderOk) keyProblems.push('cardOrder differs from canonical order');
    add('card-keys', keyProblems.length === 0, keyProblems.length === 0 ? '52 canonical keys, canonical cardOrder' : keyProblems.join('; '));
    const keysOk = missing.length === 0 && extra.length === 0;

    // 3. pattern-values
    const badValues = keys.filter((k) => !isValidPattern(patterns[k]));
    add('pattern-values', badValues.length === 0, badValues.length === 0 ? 'all values are integers in [0, 2^25)' : `invalid values for: ${badValues.join(',')}`);
    const valuesOk = badValues.length === 0;

    const validKeys = CANONICAL_KEYS.filter((k) => isValidPattern(patterns[k]));
    const P = (k: string) => patterns[k] as number;

    // 4. base-distinct
    {
      const seen = new Map<number, string>();
      const coll: string[] = [];
      for (const k of validKeys) {
        const prev = seen.get(P(k));
        if (prev !== undefined) coll.push(`${prev}=${k}`);
        else seen.set(P(k), k);
      }
      add('base-distinct', coll.length === 0 && validKeys.length === 52, coll.length === 0 ? `${seen.size} distinct base patterns among ${validKeys.length} valid` : `colliding cards: ${coll.join(', ')}`);
    }

    // 5. weight-range
    {
      const weights = validKeys.map((k) => ({ k, w: popcount(P(k)) }));
      const offenders = weights.filter((x) => x.w < WEIGHT_MIN || x.w > WEIGHT_MAX);
      if (weights.length > 0) {
        stats.weightMin = Math.min(...weights.map((x) => x.w));
        stats.weightMax = Math.max(...weights.map((x) => x.w));
      }
      add('weight-range', offenders.length === 0 && weights.length > 0, offenders.length === 0 ? `weights in [${WEIGHT_MIN},${WEIGHT_MAX}]; measured min=${stats.weightMin} max=${stats.weightMax}` : `out of range: ${offenders.map((x) => `${x.k}=${x.w}`).join(', ')}; measured min=${stats.weightMin} max=${stats.weightMax}`);
    }

    // 6. transform-self-check
    const selfCheck = selfCheckMaps();
    add('transform-self-check', selfCheck.ok, selfCheck.detail);

    const canBuild = keysOk && valuesOk;
    if (!canBuild) {
      add('templates-416', false, 'skipped: card-keys or pattern-values failed');
      add('min-distance', false, 'skipped: card-keys or pattern-values failed');
      add('d-id', false, 'skipped: card-keys or pattern-values failed');
      add('d-self', false, 'skipped: card-keys or pattern-values failed');
      add('metadata-agreement', false, 'skipped: measured dId/dSelf unavailable');
      addSha(obj, add);
      add('suit-fragments', false, 'skipped: card-keys or pattern-values failed');
      return finish();
    }

    // 7. templates-416
    interface Tpl { card: number; t: number; v: number; label: string }
    const tpls: Tpl[] = [];
    CANONICAL_KEYS.forEach((k, ci) =>
      TRANSFORM_NAMES.forEach((tn, ti) => tpls.push({ card: ci, t: ti, v: applyTransform(tn, P(k)), label: `${k}/${tn}` })),
    );
    stats.cards = 52;
    stats.templates = tpls.length;
    {
      const seen = new Map<number, string>();
      const coll: string[] = [];
      for (const t of tpls) {
        const prev = seen.get(t.v);
        if (prev !== undefined) coll.push(`${prev}=${t.label}`);
        else seen.set(t.v, t.label);
      }
      add('templates-416', coll.length === 0 && tpls.length === 416, coll.length === 0 ? `${seen.size} distinct templates` : `${coll.length} collisions, first: ${coll.slice(0, 5).join(', ')}`);
    }

    // 8/9. distances
    const hist: Record<number, number> = {};
    let pairs = 0;
    let minD = Infinity;
    let dId = Infinity;
    let dSelf = Infinity;
    let violations = 0;
    const firstViol: string[] = [];
    for (let i = 0; i < tpls.length; i++)
      for (let j = i + 1; j < tpls.length; j++) {
        const ti = tpls[i]!;
        const tj = tpls[j]!;
        const d = hamming(ti.v, tj.v);
        pairs++;
        hist[d] = (hist[d] ?? 0) + 1;
        if (d < minD) minD = d;
        if (ti.card === tj.card) dSelf = Math.min(dSelf, d);
        else dId = Math.min(dId, d);
        if (d < D_MIN) {
          violations++;
          if (firstViol.length < 5) firstViol.push(`${ti.label} vs ${tj.label} d=${d}`);
        }
      }
    const sortedHist: Record<number, number> = {};
    Object.keys(hist).map(Number).sort((a, b) => a - b).forEach((d) => (sortedHist[d] = hist[d] ?? 0));
    stats.pairs = pairs;
    stats.minPairDistance = minD;
    stats.dId = dId;
    stats.dSelf = dSelf;
    stats.distanceHistogram = sortedHist;
    add('min-distance', violations === 0 && pairs === 86320, violations === 0 ? `all ${pairs} pairs have distance >= ${D_MIN}; min=${minD}` : `${violations} of ${pairs} pairs below ${D_MIN}; first: ${firstViol.join('; ')}`);
    add('d-id', dId >= D_MIN, `measured dId=${dId} (required >= ${D_MIN})`);
    add('d-self', dSelf >= D_MIN, `measured dSelf=${dSelf} (required >= ${D_MIN})`);

    // 10. metadata-agreement
    {
      const probs: string[] = [];
      if (obj.dId !== dId) probs.push(`dId stored=${String(obj.dId)} measured=${dId}`);
      if (obj.dSelf !== dSelf) probs.push(`dSelf stored=${String(obj.dSelf)} measured=${dSelf}`);
      const wr = obj.weightRange as number[];
      if (wr[0] !== WEIGHT_MIN || wr[1] !== WEIGHT_MAX) probs.push(`weightRange stored=[${wr.join(',')}] expected=[${WEIGHT_MIN},${WEIGHT_MAX}]`);
      if (typeof obj.attemptsUsed === 'number' && typeof obj.attemptCap === 'number' && obj.attemptsUsed > obj.attemptCap)
        probs.push(`attemptsUsed=${obj.attemptsUsed} exceeds attemptCap=${obj.attemptCap}`);
      add('metadata-agreement', probs.length === 0, probs.length === 0 ? 'stored dId, dSelf, weightRange agree with measurements; attempts within cap' : probs.join('; '));
    }

    // 11. sha256
    addSha(obj, add);

    // 12. suit-fragments
    {
      const probs: string[] = [];
      CANONICAL_KEYS.forEach((k, ci) => {
        const suit = k[0];
        const tn = suit === 'H' || suit === 'D' ? 'R180' : 'Fh';
        const second = applyTransform(tn, P(k));
        const d = hamming(P(k), second);
        if (second === P(k)) probs.push(`${k}: ${tn}.P equals P`);
        if (d < D_MIN) probs.push(`${k}: hamming(P,${tn}.P)=${d}`);
        if (!tpls.some((t) => t.card === ci && t.v === second)) probs.push(`${k}: ${tn}.P not in orbit`);
      });
      add('suit-fragments', probs.length === 0, probs.length === 0 ? 'second fragments (R180 for H/D, Fh for C/S) differ from P by >= 5 and lie in the orbit' : probs.join('; '));
    }
  } catch (e) {
    add('internal-error', false, `verifier error: ${e instanceof Error ? e.message : String(e)}`);
  }
  return finish();
}

function addSha(obj: Record<string, unknown>, add: (id: string, ok: boolean, detail: string) => void): void {
  const body: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) if (k !== 'sha256') body[k] = obj[k];
  let recomputed: string;
  try {
    recomputed = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  } catch (e) {
    add('sha256', false, `could not hash: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  add('sha256', recomputed === obj.sha256, recomputed === obj.sha256 ? `sha256 matches (${recomputed})` : `stored=${String(obj.sha256)} recomputed=${recomputed}`);
}

/** Recompute the internal sha256 field value for an object (used by the CLI report). */
export function recomputeSha256(obj: unknown): string | null {
  if (!isPlainObject(obj)) return null;
  const body: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) if (k !== 'sha256') body[k] = obj[k];
  try {
    return createHash('sha256').update(JSON.stringify(body)).digest('hex');
  } catch {
    return null;
  }
}
