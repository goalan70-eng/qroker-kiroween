/**
 * Task 7.2 (phase A): tests of the robustness runner: deterministic plan, resumable runs, byte-identical results for
 * sharded and unsharded execution, merge step. Tiny smoke runs only (a few trials per condition) in temporary
 * directories; nothing is written to docs/optical/results. Synthetic images, not real cameras.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { conditionById, enumerateConditions, type Condition } from '../src/optical/testing/robustness-design';
import { buildReport } from '../src/optical/testing/robustness-report';
import { mergeResults, readResults, renderPlan, resultPath, runConditions, selectConditions, type BenchRecord } from './run-robustness';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const conds = enumerateConditions();
const tmp = mkdtempSync(resolve(os.tmpdir(), 'robustness-test-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const SMOKE_IDS = ['A-CLEAN', 'A-ROT-45J', 'A-PROF-STRESS-Fh', 'A-INC-MILD', 'A-MIX', 'P-BOARD-2x2-C-BV', 'P-ALIGN-MAX-2x2-I-BH', 'P-MIX-2x2-I'];
const subset: Condition[] = SMOKE_IDS.map((id) => conditionById(id) as Condition);
const LONG = 120_000;

function filesOf(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const sub of ['flat', 'physical']) {
    const d = resolve(dir, sub);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).sort()) out.set(`${sub}/${f}`, readFileSync(resolve(d, f), 'utf8'));
  }
  return out;
}

const fakeBench = (): BenchRecord => {
  const c = { condition: 'x', trials: 10, meanMs: { sceneMs: 1, degradeMs: 2, decodeMs: 3, totalMs: 6 }, outcomes: { CORRECT: 10 } };
  return {
    note: 'n',
    machine: { node: 'v', cpu: 'cpu', logicalCores: 12, totalMemoryGiB: 40, platform: 'p' },
    sample: { warmupTrials: 3, flatTrials: 10, physicalTrials: 10, seedRule: 'r' },
    classes: Object.fromEntries(['F-plain', 'F-camera', 'P2-plain', 'P2-camera', 'P2-errors', 'P2-both', 'P3-plain', 'P3-camera', 'P3-errors', 'P3-both'].map((k) => [k, c])) as unknown as BenchRecord['classes'],
    cpuLoad: [{ phase: 'before', systemCpuPercent: 10 }],
    competingProcesses: [{ name: 'java', logicalProcessors: 1.5 }],
    peakRssMiB: 100,
    scaling: [{ processes: 8, wallSeconds: 2, singleProcessSeconds: 10, speedup: 5, systemCpuPercentMean: 90, systemCpuPercentMax: 100, childPeakRssMiB: 120 }],
    disk: { resultFileBytesMax: 3000, resultFileBytesMean: 2000, sampleFiles: 4 },
    flatPilot: { trialsPerCondition: 30, seedRule: 's', conditions: [{ id: 'A-CLEAN', correct: 30, rejected: 0, misidentified: 0 }] },
  };
};

describe('plan', () => {
  it('is deterministic and states the two required sentences', () => {
    const a = renderPlan(conds, null);
    const b = renderPlan(conds, null);
    expect(a).toBe(b);
    expect(a).toContain('Synthetic images, not real cameras.');
    expect(a).toContain('A zero false-acceptance count is an observation, not a mathematical guarantee.');
    expect(a).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/);
    const withBench = renderPlan(conds, fakeBench());
    expect(renderPlan(conds, fakeBench())).toBe(withBench);
    expect(withBench).toContain('with 8 processes');
  });

  it('lists every condition and gives the exact counts', () => {
    const plan = renderPlan(conds, null);
    for (const c of conds) expect(plan).toContain(`| ${c.id} |`);
    expect(plan).toContain('| A: flat layout | **84** | 179,000 |');
    expect(plan).toContain('| B: physical geometry | **179** | 184,000 |');
    expect(plan).toContain('| **Total** | **263** | **363,000** |');
  });

  it('two runs of --plan from the command line write byte-identical files', { timeout: LONG }, () => {
    const out1 = resolve(tmp, 'plan1.md');
    const out2 = resolve(tmp, 'plan2.md');
    for (const out of [out1, out2]) {
      const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/run-robustness.ts', '--plan', '--out', out], { cwd: ROOT, encoding: 'utf8' });
      expect(r.status, r.stderr).toBe(0);
    }
    expect(readFileSync(out1, 'utf8')).toBe(readFileSync(out2, 'utf8'));
  });
});

describe('selection and shards', () => {
  it('partitions the conditions of a family over k shards without overlap or omission', () => {
    for (const fam of ['flat', 'physical'] as const) {
      const all = selectConditions(conds, { family: fam });
      const seen: string[] = [];
      for (let i = 0; i < 8; i++) seen.push(...selectConditions(conds, { family: fam, shard: { i, k: 8 } }).map((c) => c.id));
      expect([...seen].sort()).toEqual(all.map((c) => c.id).sort());
    }
    expect(selectConditions(conds, { cell: 'A-CLEAN' }).map((c) => c.id)).toEqual(['A-CLEAN']);
    expect(selectConditions(conds, { cell: 'A-PROF-STRESS' }).length).toBe(3);
    expect(() => selectConditions(conds, { shard: { i: 2, k: 2 } })).toThrow();
  });
});

describe('smoke run: sharded and unsharded results are byte identical', () => {
  const whole = resolve(tmp, 'whole');
  const sharded = resolve(tmp, 'sharded');

  it('writes one result file per condition, resumes, and reproduces itself', { timeout: LONG }, () => {
    const r1 = runConditions(subset, whole, 4, false);
    expect(r1).toEqual({ done: subset.length, skipped: 0 });
    expect(runConditions(subset, whole, 4, false)).toEqual({ done: 0, skipped: subset.length });
    const first = filesOf(whole);
    expect(first.size).toBe(subset.length);
    expect(runConditions(subset, whole, 4, true).done).toBe(subset.length);
    expect(filesOf(whole)).toEqual(first);
    for (const c of subset) expect(existsSync(resultPath(whole, c))).toBe(true);
    const parsed = JSON.parse(first.get('flat/A-CLEAN.json') as string);
    expect(parsed).toMatchObject({ id: 'A-CLEAN', n: 4, smokeRun: true, misidentified: 0 });
    expect(parsed.misidentificationUpperBound95).toBe(1 - Math.pow(0.05, 1 / 4));
  });

  it('three shards give the same bytes as one process', { timeout: LONG }, () => {
    let done = 0;
    for (let i = 0; i < 3; i++) done += runConditions(selectConditions(subset, { shard: { i, k: 3 } }), sharded, 4, false).done;
    expect(done).toBe(subset.length);
    expect(filesOf(sharded)).toEqual(filesOf(whole));
  });

  it('the merge step gives the same bytes for both layouts and marks the data set as smoke', { timeout: LONG }, () => {
    const a = mergeResults(whole, resolve(tmp, 'out-a'), true, subset);
    const b = mergeResults(sharded, resolve(tmp, 'out-b'), true, subset);
    expect(a.status).toBe('SMOKE');
    expect(a.verdict).toBe('NOT_EVALUATED');
    for (const f of ['robustness.json', 'robustness.md']) {
      expect(readFileSync(resolve(tmp, 'out-a', f), 'utf8')).toBe(readFileSync(resolve(tmp, 'out-b', f), 'utf8'));
    }
    const json = JSON.parse(readFileSync(resolve(tmp, 'out-a', 'robustness.json'), 'utf8'));
    for (const r of json.conditions) {
      expect(r).toHaveProperty('n');
      expect(r).toHaveProperty('misidentified');
      expect(r).toHaveProperty('misidentificationUpperBound95');
      if (r.misidentified === 0) expect(r.misidentificationUpperBound95).toBe(1 - Math.pow(0.05, 1 / r.n));
    }
    expect(json.statements).toContain('Synthetic images, not real cameras.');
    expect(readFileSync(resolve(tmp, 'out-a', 'robustness.md'), 'utf8')).toContain('Synthetic images, not real cameras.');
    expect(readResults(whole).size).toBe(subset.length);
  });

  it('refuses incomplete data without --allow-partial and never writes smoke data into docs/optical/results', () => {
    expect(() => mergeResults(whole, resolve(tmp, 'out-c'), false, subset)).toThrow(/incomplete data set/);
    expect(() => mergeResults(whole, resolve(ROOT, 'docs/optical/results'), true, subset)).toThrow(/refusing to write/);
    expect(existsSync(resolve(ROOT, 'docs/optical/results/robustness.json'))).toBe(false);
    expect(existsSync(resolve(ROOT, 'docs/optical/results/robustness.md'))).toBe(false);
  });

  it('reports FAILED_WITH_FINDINGS for a complete data set with a misidentification', () => {
    const found = readResults(whole);
    const c = subset[0] as Condition;
    const r = { ...(found.get(c.id) as NonNullable<ReturnType<typeof found.get>>) };
    delete r.smokeRun;
    const bad = { ...r, n: c.trials, misidentified: 1, misidentificationUpperBound95: null, misidentifiedTrials: [{ trial: 3, seed: 9, cause: 'MISIDENTIFIED/WRONG_SUM' }] };
    const report = buildReport([c], new Map([[c.id, bad]]));
    expect(report.status).toBe('COMPLETE');
    expect(report.verdict).toBe('FAILED_WITH_FINDINGS');
    expect(report.conditionsWithMisidentification).toEqual([c.id]);
    const ok = buildReport([c], new Map([[c.id, { ...bad, misidentified: 0, misidentificationUpperBound95: 0.001, misidentifiedTrials: [] }]]));
    expect(ok.verdict).toBe('NO_MISIDENTIFICATION_OBSERVED');
  });
});
