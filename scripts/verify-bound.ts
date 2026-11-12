// Independent reproduction of the codebook capacity bound by exhaustive
// enumeration of all 2^25 5x5 patterns. Deliberately imports nothing from
// src/optical (transforms, codebook, prng).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const N = 5;
const TOTAL = 1 << 25;

// The seven non-identity D4 cell maps (identity is omitted: distance 0).
const MAPS: ReadonlyArray<readonly [string, (r: number, c: number) => [number, number]]> = [
  ["R90", (r, c) => [c, 4 - r]],
  ["R180", (r, c) => [4 - r, 4 - c]],
  ["R270", (r, c) => [4 - c, r]],
  ["Fh", (r, c) => [4 - r, c]],
  ["Fv", (r, c) => [r, 4 - c]],
  ["Dm", (r, c) => [c, r]],
  ["Da", (r, c) => [4 - c, 4 - r]],
];

export interface BoundResult {
  total: number;
  balanceFail: number;
  selfDistanceFail: number;
  perTransformSelfDistanceFail: Record<string, number>;
  eitherFail: number;
  F: number;
  V4: number;
  bound: number;
  d6: { selfDistanceFail: number; eitherFail: number; F: number; V: number; bound: number };
  d7: { selfDistanceFail: number; eitherFail: number; F: number; V: number; bound: number };
}

function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

/** Hamming ball volume V(25, radius). */
function ballVolume(radius: number): number {
  let v = 0;
  for (let k = 0; k <= radius; k++) v += binom(25, k);
  return v;
}

function popcount(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return Math.imul(x, 0x01010101) >>> 24;
}

export function computeBound(): BoundResult {
  // tables[g][r*32+v] = 25-bit contribution of row r holding value v to g.P
  const tables: Int32Array[] = MAPS.map(([, f]) => {
    const t = new Int32Array(N * 32);
    for (let r = 0; r < N; r++) {
      for (let v = 0; v < 32; v++) {
        let m = 0;
        for (let c = 0; c < N; c++) {
          if ((v >> c) & 1) {
            const [r2, c2] = f(r, c);
            m |= 1 << (5 * r2 + c2);
          }
        }
        t[r * 32 + v] = m;
      }
    }
    return t;
  });
  const G = MAPS.length;
  const [t0, t1, t2, t3, t4, t5, t6] = tables;
  const tt = [t0!, t1!, t2!, t3!, t4!, t5!, t6!];

  const perT = new Array<number>(G).fill(0); // d=5 per-transform fails
  // hist[balanceOK(0/1)][minDist 0..25]
  const hist = [new Array<number>(26).fill(0), new Array<number>(26).fill(0)];
  let balanceFail = 0;

  for (let P = 0; P < TOTAL; P++) {
    const w = popcount(P);
    const balOk = w >= 9 && w <= 16 ? 1 : 0;
    if (!balOk) balanceFail++;
    const r0 = P & 31,
      r1 = (P >>> 5) & 31,
      r2 = (P >>> 10) & 31,
      r3 = (P >>> 15) & 31,
      r4 = (P >>> 20) & 31;
    let minD = 25;
    for (let g = 0; g < G; g++) {
      const t = tt[g]!;
      const Q = t[r0]! | t[32 + r1]! | t[64 + r2]! | t[96 + r3]! | t[128 + r4]!;
      const d = popcount(P ^ Q);
      if (d < 5) perT[g]!++;
      if (d < minD) minD = d;
    }
    hist[balOk]![minD]!++;
  }

  const countFor = (d: number) => {
    let sd = 0; // self-distance fail (all patterns)
    let either = 0;
    for (let bal = 0; bal < 2; bal++) {
      for (let m = 0; m < 26; m++) {
        const n = hist[bal]![m]!;
        if (m < d) sd += n;
        if (m < d || bal === 0) either += n;
      }
    }
    const F = TOTAL - either;
    const V = ballVolume(d - 1);
    return { selfDistanceFail: sd, eitherFail: either, F, V, bound: Math.ceil(F / (8 * V)) };
  };

  const r5 = countFor(5);
  const r6 = countFor(6);
  const r7 = countFor(7);
  const perTransformSelfDistanceFail: Record<string, number> = {};
  MAPS.forEach(([name], i) => (perTransformSelfDistanceFail[name] = perT[i]!));

  return {
    total: TOTAL,
    balanceFail,
    selfDistanceFail: r5.selfDistanceFail,
    perTransformSelfDistanceFail,
    eitherFail: r5.eitherFail,
    F: r5.F,
    V4: r5.V,
    bound: r5.bound,
    d6: r6,
    d7: r7,
  };
}

/** Values stated in tasks.md / design.md; UNVERIFIED claims. */
export const EXPECTED = {
  balanceFail: 3_615_562,
  selfDistanceFail: 7_152_896,
  perTransformSelfDistanceFail: {
    R90: 74_624,
    R270: 74_624,
    R180: 647_168,
    Fh: 1_835_008,
    Fv: 1_835_008,
    Dm: 1_835_008,
    Da: 1_835_008,
  } as Record<string, number>,
  eitherFail: 9_456_896,
  F: 24_097_536,
  V4: 15_276,
  bound: 198,
  d6Bound: 45,
  d7Bound: 7,
};

export function flatten(r: BoundResult): Record<string, number> {
  const out: Record<string, number> = {
    balanceFail: r.balanceFail,
    selfDistanceFail: r.selfDistanceFail,
    eitherFail: r.eitherFail,
    F: r.F,
    V4: r.V4,
    bound: r.bound,
    d6Bound: r.d6.bound,
    d7Bound: r.d7.bound,
  };
  for (const [k, v] of Object.entries(r.perTransformSelfDistanceFail)) out[`perTransform.${k}`] = v;
  return out;
}

export function flattenExpected(): Record<string, number> {
  const out: Record<string, number> = {
    balanceFail: EXPECTED.balanceFail,
    selfDistanceFail: EXPECTED.selfDistanceFail,
    eitherFail: EXPECTED.eitherFail,
    F: EXPECTED.F,
    V4: EXPECTED.V4,
    bound: EXPECTED.bound,
    d6Bound: EXPECTED.d6Bound,
    d7Bound: EXPECTED.d7Bound,
  };
  for (const [k, v] of Object.entries(EXPECTED.perTransformSelfDistanceFail)) out[`perTransform.${k}`] = v;
  return out;
}

function main(): void {
  const t0 = Date.now();
  const r = computeBound();
  const seconds = (Date.now() - t0) / 1000;
  const measured = flatten(r);
  const expected = flattenExpected();
  const matches: Record<string, boolean> = {};
  for (const k of Object.keys(expected)) matches[k] = measured[k] === expected[k];
  const allMatch = Object.values(matches).every(Boolean);

  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const dir = resolve(root, "docs/optical/results");
  mkdirSync(dir, { recursive: true });
  const json = {
    note: "expected = values stated in tasks.md/design.md (unverified claims); measured = exhaustive enumeration of 2^25 patterns.",
    runtimeSeconds: seconds,
    expected,
    measured,
    matches,
    allMatch,
    detail: r,
  };
  writeFileSync(resolve(dir, "bound.json"), JSON.stringify(json, null, 2) + "\n");

  const rows = Object.keys(expected)
    .map((k) => `| ${k} | ${expected[k]!.toLocaleString("en-US")} | ${measured[k]!.toLocaleString("en-US")} | ${matches[k] ? "yes" : "**NO**"} |`)
    .join("\n");
  const md = `# Codebook capacity bound (exhaustive enumeration)

Enumerated all 2^25 patterns independently of \`src/optical\`. Runtime: ${seconds.toFixed(1)} s.

Overall: ${allMatch ? "all stated claims matched" : "**MISMATCH: at least one stated claim differs from the measured value**"}.

| field | expected (claim) | measured | match |
|---|---|---|---|
${rows}

Bound = ceil(|F| / (8 * V(25, d-1))). Measured |F| / V:
- d=5: |F| = ${r.F.toLocaleString("en-US")}, V(25,4) = ${r.V4.toLocaleString("en-US")}, bound ${r.bound}
- d=6: |F| = ${r.d6.F.toLocaleString("en-US")}, V(25,5) = ${r.d6.V.toLocaleString("en-US")}, bound ${r.d6.bound}
- d=7: |F| = ${r.d7.F.toLocaleString("en-US")}, V(25,6) = ${r.d7.V.toLocaleString("en-US")}, bound ${r.d7.bound}
`;
  writeFileSync(resolve(dir, "bound.md"), md);
  console.log(md);
  if (!allMatch) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
