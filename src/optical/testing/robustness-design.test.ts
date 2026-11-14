/**
 * Task 7.2 (phase A): tests of the robustness design (condition enumeration, levels, seeds, statistics). Pure
 * arithmetic, no rendering. Synthetic design only; nothing here says anything about real cameras.
 */
import { describe, expect, it } from 'vitest';
import { FRAGMENT_OFFSET_LEVELS_MODULES } from '../degrade';
import {
  ALIGNMENT_PROFILES,
  BASELINE_INSET_MODULES,
  BASELINE_RADIUS_MM,
  CAMERA_PROFILES,
  COST_CLASSES,
  DUPLEX_ERROR_KEYS,
  FLAT_LEVELS,
  FRAGMENT_ERROR_KEYS,
  MIN_TRIALS_PER_CONDITION,
  MIX_TRIALS,
  PLACEMENT_ERROR_KEYS,
  ROBUSTNESS_BASE_SEED,
  STREAM,
  assignShards,
  conditionById,
  coverageMatrix,
  enumerateConditions,
  familySummaries,
  fullFactorial,
  groupSummaries,
  misidentificationBound95,
  resolveParams,
  streamSeed,
  totalTrials,
  trialSeed,
  zeroEventUpperBound95,
  type Condition,
  type FlatParams,
  type PhysicalParams,
} from './robustness-design';
import { GEOMETRY_BASE_SEED } from './geometry-design';

const conds = enumerateConditions();
const flat = conds.filter((c) => c.family === 'FLAT');
const physical = conds.filter((c) => c.family === 'PHYSICAL');

describe('condition enumeration', () => {
  it('has the documented condition and trial counts per family', () => {
    expect(familySummaries(conds)).toEqual([
      { family: 'FLAT', conditions: 84, trials: 179000, minTrials: 2000 },
      { family: 'PHYSICAL', conditions: 179, trials: 184000, minTrials: 1000 },
    ]);
    expect(conds.length).toBe(263);
    expect(totalTrials(conds)).toBe(363000);
  });

  it('is deterministic (two enumerations are identical)', () => {
    expect(enumerateConditions()).toBe(conds);
    expect(JSON.stringify(conds.map((c) => [c.id, c.paramKey]))).toBe(JSON.stringify(enumerateConditions().map((c) => [c.id, c.paramKey])));
  });

  it('has unique, file-name safe ids and unique parameter keys', () => {
    expect(new Set(conds.map((c) => c.id)).size).toBe(conds.length);
    expect(new Set(conds.map((c) => c.paramKey)).size).toBe(conds.length);
    for (const c of conds) expect(c.id).toMatch(/^[A-Za-z0-9._+-]+$/);
  });

  it('keeps stable ids for the documented examples', () => {
    for (const id of ['A-CLEAN', 'A-ROT-45E', 'A-ROT-45J', 'A-ROT-RANDOM', 'A-PROF-STRESS-Fh', 'A-PAIR-BLUR1+NOISE20', 'P-BOARD-3x3-I-BH', 'P-DUP-2x2-C-BV-rs0.25', 'P-ALIGN-MAX-3x3-C-F', 'P-MIX-2x2-C']) {
      expect(conditionById(id), id).toBeDefined();
    }
  });

  it('runs at least 1000 trials in every condition and the planned trials in the mixes', () => {
    for (const c of conds) expect(c.trials, c.id).toBeGreaterThanOrEqual(MIN_TRIALS_PER_CONDITION);
    for (const [id, n] of Object.entries(MIX_TRIALS)) expect(conditionById(id)?.trials).toBe(n);
    expect(MIN_TRIALS_PER_CONDITION).toBe(1000);
  });

  it('assigns every condition to a known cost class and a group', () => {
    for (const c of conds) {
      expect(COST_CLASSES).toContain(c.costClass);
      expect(c.group.length).toBeGreaterThan(0);
    }
    expect(groupSummaries(conds).reduce((t, g) => t + g.conditions, 0)).toBe(conds.length);
  });

  it('uses only the baseline geometry (the task 5.6 decision table names no other radius or inset)', () => {
    for (const c of physical) {
      const p = c.params as PhysicalParams;
      expect(p.radiusMm).toBe(BASELINE_RADIUS_MM);
      expect(p.insetModules).toBe(BASELINE_INSET_MODULES);
      expect(p.radiusMm).toBe(3.175);
      expect(p.insetModules).toBe(1);
    }
  });
});

describe('required levels are covered by explicit conditions', () => {
  const rows = coverageMatrix(conds);
  it('has no required level without a condition', () => {
    expect(rows.length).toBeGreaterThan(80);
    for (const r of rows) expect(r.conditions, `${r.family} ${r.requirement} ${r.level}`).toBeGreaterThan(0);
  });

  it('covers fragment position error 0 / 0.1 / 0.25 in both families', () => {
    for (const fam of ['FLAT', 'PHYSICAL'] as const) {
      const lv = rows.filter((r) => r.family === fam && r.requirement.startsWith('Fragment position error')).map((r) => r.level);
      expect(lv).toEqual(FRAGMENT_OFFSET_LEVELS_MODULES.map((x) => `${x} module`));
    }
  });

  it('covers 0, exactly 45, axis angles and random rotation, with and without phase jitter', () => {
    const levels = rows.filter((r) => r.family === 'FLAT' && r.requirement === 'Camera rotation').map((r) => r.level);
    for (const needle of ['0 deg, exact', '0 deg, sub-pixel', 'exactly 45 deg, exact', 'exactly 45 deg, sub-pixel', 'axis angle 90', 'axis angle 180', 'axis angle 270', 'uniform random']) {
      expect(levels.some((l) => l.startsWith(needle)), needle).toBe(true);
    }
    // every degraded flat condition has phase jitter unless it is one of the exact-lattice conditions
    for (const c of flat.filter((x) => !x.mix)) {
      const p = c.params as FlatParams;
      const exactOk = p.phase === 'EXACT';
      const degraded = p.fragmentModules > 0 || p.reflect !== 'none' || p.rotation !== 0 || p.tiltDeg > 0 || p.blurPx > 0 || p.noiseSigma > 0 || p.illumination > 0;
      if (degraded && exactOk) expect(typeof p.rotation === 'number' && [45, 90, 180, 270].includes(p.rotation), c.id).toBe(true);
    }
  });

  it('covers both families with the combined profiles CLEAN, MILD, MODERATE, STRESS', () => {
    for (const name of ['CLEAN', 'MILD', 'MODERATE', 'STRESS']) {
      expect(rows.some((r) => r.family === 'FLAT' && r.requirement === 'Combined profile' && r.level === name)).toBe(true);
    }
    for (const p of CAMERA_PROFILES) expect(rows.some((r) => r.family === 'PHYSICAL' && r.level === p.name)).toBe(true);
    for (const p of ALIGNMENT_PROFILES) expect(rows.some((r) => r.family === 'PHYSICAL' && r.level === p.name)).toBe(true);
  });

  it('covers 2x2 and 3x3, complete and incomplete, FRONT and both BACK flips, and duplex levels', () => {
    const lv = new Set(rows.filter((r) => r.family === 'PHYSICAL').map((r) => `${r.requirement}|${r.level}`));
    for (const key of ['Board|2x2 board', 'Board|3x3 board', 'Group|complete group', 'Group|incomplete group (one card absent)', 'Face / flip|FRONT', 'Face / flip|BACK, vertical-axis flip', 'Face / flip|BACK, horizontal-axis flip',
      'Duplex registration shift (category 3)|0.25 mm', 'Duplex registration shift (category 3)|1 mm', 'Duplex registration rotation (category 3)|0.5 deg', 'Cut-outline offset (category 3)|0.5 mm', 'Cut-outline offset (category 3)|1 mm']) {
      expect(lv.has(key), key).toBe(true);
    }
  });

  it('has the required flat level sets', () => {
    expect(FLAT_LEVELS.fragmentModules).toEqual([0, 0.1, 0.25]);
    expect(FLAT_LEVELS.reflect).toEqual(['none', 'Fh', 'Fv']);
  });
});

describe('three distinct error categories', () => {
  it('share no parameter name', () => {
    const all = [...FRAGMENT_ERROR_KEYS, ...PLACEMENT_ERROR_KEYS, ...DUPLEX_ERROR_KEYS] as string[];
    expect(new Set(all).size).toBe(all.length);
  });

  it('the flat family has the fragment error only; categories 2 and 3 exist only in the physical family', () => {
    const flatKeys = Object.keys((flat[0] as Condition).params);
    expect(flatKeys).toContain('fragmentModules');
    for (const k of [...PLACEMENT_ERROR_KEYS, ...DUPLEX_ERROR_KEYS]) expect(flatKeys).not.toContain(k);
    const physKeys = Object.keys((physical[0] as Condition).params);
    for (const k of [...FRAGMENT_ERROR_KEYS, ...PLACEMENT_ERROR_KEYS, ...DUPLEX_ERROR_KEYS]) expect(physKeys).toContain(k);
  });

  it('fragment position error is never combined with a placement or duplex error', () => {
    for (const c of physical) {
      const p = c.params as PhysicalParams;
      if (p.fragmentModules > 0) {
        for (const k of [...PLACEMENT_ERROR_KEYS, ...DUPLEX_ERROR_KEYS]) expect((p as unknown as Record<string, number>)[k], `${c.id} ${k}`).toBe(0);
      }
    }
    for (let i = 0; i < 300; i++) {
      const p = resolveParams(conditionById('P-MIX-2x2-C') as Condition, trialSeed('P-MIX-2x2-C', i)) as PhysicalParams;
      expect(p.fragmentModules).toBe(0);
    }
  });

  it('single-category sweeps change only that category', () => {
    const base = (conditionById('P-BOARD-2x2-C-F') as Condition).params as unknown as Record<string, unknown>;
    const cases: Array<[string, readonly string[]]> = [
      ['P-PLACE-2x2-C-sh1', PLACEMENT_ERROR_KEYS],
      ['P-PLACE-2x2-C-gp0.5', PLACEMENT_ERROR_KEYS],
      ['P-DUP-2x2-C-F-co0.5', DUPLEX_ERROR_KEYS],
      ['P-CAM-2x2-C-F-FRAG-0.1', FRAGMENT_ERROR_KEYS],
    ];
    for (const [id, keys] of cases) {
      const c = conditionById(id);
      expect(c, id).toBeDefined();
      const q = (c as Condition).params as unknown as Record<string, unknown>;
      const changed = Object.keys(q).filter((k) => q[k] !== base[k] && k !== 'phase');
      expect(changed.length, id).toBeGreaterThan(0);
      for (const k of changed) expect(keys as readonly string[], `${id}: ${k}`).toContain(k);
    }
  });
});

describe('seeds', () => {
  it('is a pure function of (base seed, condition id, trial index), pinned for stability', () => {
    expect(trialSeed('A-INC-CLEAN', 3)).toBe(1927521444);
    expect(trialSeed('A-CLEAN', 0)).toBe(trialSeed('A-CLEAN', 0));
    expect(ROBUSTNESS_BASE_SEED).not.toBe(GEOMETRY_BASE_SEED);
  });

  it('differs between conditions and between trials, with no collision in the first trials of every condition', () => {
    const first = new Set(conds.map((c) => trialSeed(c.id, 0)));
    expect(first.size).toBe(conds.length);
    const run = new Set(Array.from({ length: 2000 }, (_, i) => trialSeed('A-CLEAN', i)));
    expect(run.size).toBe(2000);
    expect(trialSeed('A-CLEAN', 0)).not.toBe(trialSeed('A-FRAG-0.1', 0));
  });

  it('derives independent streams: the stream numbers are distinct and above those of buildScenario (1-4)', () => {
    const nums = Object.values(STREAM);
    expect(new Set(nums).size).toBe(nums.length);
    for (const n of [STREAM.phase, STREAM.camera, STREAM.mix, STREAM.degrade]) expect(n).toBeGreaterThanOrEqual(10);
    const s = trialSeed('A-CLEAN', 7);
    expect(new Set([1, 2, 3, 4, ...nums.filter((n) => n >= 10)].map((n) => streamSeed(s, n))).size).toBe(4 + nums.filter((n) => n >= 10).length);
  });
});

describe('randomized mixes', () => {
  it('are deterministic per trial seed, draw from the level sets and vary between trials', () => {
    const mix = conditionById('A-MIX') as Condition;
    const a = resolveParams(mix, 12345) as FlatParams;
    expect(resolveParams(mix, 12345)).toEqual(a);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const p = resolveParams(mix, trialSeed('A-MIX', i)) as FlatParams;
      expect(FLAT_LEVELS.fragmentModules as readonly number[]).toContain(p.fragmentModules);
      expect(FLAT_LEVELS.tiltDeg as readonly number[]).toContain(p.tiltDeg);
      expect(FLAT_LEVELS.noiseSigma as readonly number[]).toContain(p.noiseSigma);
      expect(p.phase).toBe('JITTER');
      seen.add(JSON.stringify(p));
    }
    expect(seen.size).toBeGreaterThan(300);
  });

  it('keep the structural parameters of the condition (complete / incomplete, board)', () => {
    for (const id of ['A-MIX-INC', 'P-MIX-3x3-I', 'P-MIX-2x2-C']) {
      const c = conditionById(id) as Condition;
      const p = resolveParams(c, 99) as FlatParams & Partial<PhysicalParams>;
      expect(p.incomplete).toBe((c.params as FlatParams).incomplete);
      if (c.family === 'PHYSICAL') expect(p.layout).toBe((c.params as PhysicalParams).layout);
    }
  });

  it('returns the fixed parameters of an explicit condition unchanged', () => {
    const c = conditionById('A-PROF-STRESS-N') as Condition;
    expect(resolveParams(c, 5)).toBe(c.params);
  });
});

describe('statistics', () => {
  it('computes the exact one-sided 95% bound 1 - 0.05^(1/n) for zero misidentifications only', () => {
    for (const n of [1, 2, 10, 1000, 2000, 10000]) {
      expect(zeroEventUpperBound95(n)).toBe(1 - Math.pow(0.05, 1 / n));
      expect(misidentificationBound95(n, 0)).toBe(1 - Math.pow(0.05, 1 / n));
    }
    expect(zeroEventUpperBound95(1)).toBeCloseTo(0.95, 12);
    expect(zeroEventUpperBound95(1000)).toBeCloseTo(0.002988, 5);
    expect(Math.abs(zeroEventUpperBound95(1000) * 1000 - 3)).toBeLessThan(0.02);
    expect(misidentificationBound95(1000, 1)).toBeNull();
    expect(() => zeroEventUpperBound95(0)).toThrow(RangeError);
  });
});

describe('full factorial sizes and shards', () => {
  it('reports the size of the full cross product of each family', () => {
    expect(fullFactorial('FLAT').conditions).toBe(226_800n);
    expect(fullFactorial('PHYSICAL').conditions).toBe(259_200_000n);
    expect(fullFactorial('FLAT').trialsAtMinimum).toBe(226_800_000n);
  });

  it('assigns every condition to exactly one shard, deterministically and balanced', () => {
    for (const k of [1, 3, 8]) {
      const a = assignShards(physical, k);
      expect(assignShards(physical, k)).toEqual(a);
      expect(a.length).toBe(physical.length);
      expect(a.every((s) => s >= 0 && s < k)).toBe(true);
      if (k === 8) {
        const load = new Array<number>(k).fill(0);
        a.forEach((s, i) => (load[s] = (load[s] as number) + (physical[i] as Condition).trials));
        expect(Math.max(...load) / Math.min(...load)).toBeLessThan(1.15);
      }
    }
    expect(() => assignShards(conds, 0)).toThrow(RangeError);
  });
});
