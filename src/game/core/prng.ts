// Seeded pseudo-random number generation for the engine (task 2.2, requirements 2.1 and 2.6).
//
// Pure and deterministic: no Math.random, Date, performance.now, crypto, DOM or node: imports.
// This is the engine's own implementation. It does not import src/optical.

/**
 * mulberry32, the published algorithm (Tommy Ettinger). Returns a generator whose every call yields
 * a float in [0, 1). The seed is coerced to an unsigned 32-bit integer with `seed >>> 0`, so any
 * number (negative, fractional, above 2^32) maps to a defined state; NaN and Infinity map to 0.
 *
 * Per call:
 *   state = (state + 0x6D2B79F5) | 0
 *   t = imul(state ^ (state >>> 15), state | 1)
 *   t = (t + imul(t ^ (t >>> 7), t | 61)) ^ t
 *   result = ((t ^ (t >>> 14)) >>> 0) / 4294967296
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** murmur3 32-bit finalizer: a bijection on uint32 with good avalanche. */
function fmix32(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Deterministic derivation of a new unsigned 32-bit seed from two integers, for example
 * `mix32(gameSeed, seatIndex * 100000 + actionIndex)` for an AI decision seed (design.md, AI section).
 * The design fixes only the purpose, so this is the chosen definition:
 *
 *   h = fmix32((a >>> 0) ^ 0x9E3779B9)
 *   result = fmix32((h + (b >>> 0)) >>> 0)
 *
 * Both arguments are coerced with `>>> 0`. The result is a uint32 and depends on the order of
 * the arguments: mix32(a, b) is in general different from mix32(b, a).
 */
export function mix32(a: number, b: number): number {
  const h = fmix32((a >>> 0) ^ 0x9e3779b9);
  return fmix32((h + (b >>> 0)) >>> 0);
}

/**
 * Fisher-Yates shuffle driven by `rng`. Returns a NEW array; `items` is never mutated.
 *
 * Exact procedure (the deal in core/deck depends on it):
 *   result = copy of items, n = items.length
 *   for i = n - 1 down to 1:           // descending; no draw for i = 0
 *     j = Math.floor(rng() * (i + 1))  // one rng() call per i, so n - 1 calls in total (0 for n <= 1)
 *     swap result[i] and result[j]
 *
 * The same items and a generator in the same state give the same permutation.
 */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i >= 1; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = result[i] as T;
    result[i] = result[j] as T;
    result[j] = tmp;
  }
  return result;
}
