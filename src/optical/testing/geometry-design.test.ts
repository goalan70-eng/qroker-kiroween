/**
 * Task 5.6 (Phase A): tests of the experimental design (cell enumeration, seeds, statistics). Pure arithmetic, no
 * rendering. Synthetic design only; nothing here says anything about real cameras.
 */
import { describe, expect, it } from 'vitest';
import {
  BASELINE_CELL_TRIALS,
  GEOMETRY_BASE_SEED,
  GRID_GEOMETRIES,
  LEVELS,
  MIN_TRIALS_PER_CELL,
  PROFILES,
  REFERENCE_GEOMETRIES,
  cellId,
  duplexConfigs,
  enumerateCells,
  fullFactorial,
  geometryReport,
  groupSummaries,
  levelCoverage,
  streamSeed,
  summarizeCell,
  tierSummaries,
  trialSeed,
  zeroEventUpperBound95,
  type TrialRecord,
} from './geometry-design';

const cells = enumerateCells();

describe('cell enumeration', () => {
  it('has the documented cell and trial counts per tier', () => {
    expect(tierSummaries(cells)).toEqual([
      { tier: 1, cells: 96, trials: 4 * (23 * MIN_TRIALS_PER_CELL + BASELINE_CELL_TRIALS) },
      { tier: 2, cells: 128, trials: 128 * MIN_TRIALS_PER_CELL },
      { tier: 3, cells: 528, trials: 528 * MIN_TRIALS_PER_CELL },
      { tier: 4, cells: 72, trials: 72 * MIN_TRIALS_PER_CELL },
    ]);
    expect(cells.length).toBe(824);
  });

  it('has no duplicate cell ids, and ids are file-name safe and reproducible', () => {
    const ids = cells.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(enumerateCells().map((c) => c.id)).toEqual(ids);
    for (const id of ids) expect(id).toMatch(/^[0-9A-Za-z.\-]+$/);
    for (const c of cells) expect(cellId(c.params)).toBe(c.id);
  });

  it('gives every cell at least 200 trials and exactly the four baseline-geometry Tier 1 cells 1000', () => {
    for (const c of cells) expect(c.trials).toBeGreaterThanOrEqual(MIN_TRIALS_PER_CELL);
    const thousand = cells.filter((c) => c.trials >= BASELINE_CELL_TRIALS);
    expect(thousand.length).toBe(PROFILES.length);
    for (const c of thousand) {
      expect(c.tier).toBe(1);
      expect([c.params.radiusMm, c.params.insetModules]).toEqual([3.175, 1]);
    }
  });

  it('covers every level of every factor in at least one cell', () => {
    const missing = levelCoverage(cells).filter((l) => l.cells === 0);
    expect(missing).toEqual([]);
    // spot checks of the task list
    for (const r of [0, 2.0, 3.0, 3.175, 3.6, 4.0, 5.0, 6.0]) expect(cells.some((c) => c.params.radiusMm === r)).toBe(true);
    for (const f of ['FRONT', 'BACK_VERTICAL', 'BACK_HORIZONTAL']) expect(cells.some((c) => c.params.face === f)).toBe(true);
    for (const s of [0, 0.25, 0.5, 1.0]) expect(cells.some((c) => c.params.regShiftMm === s)).toBe(true);
    for (const s of [0, 0.5, 1]) expect(cells.some((c) => c.params.regRotDeg === s)).toBe(true);
    for (const s of [0, 0.5, 1.0]) expect(cells.some((c) => c.params.cutOffsetMm === s)).toBe(true);
    expect(cells.some((c) => c.params.layout === '3x3')).toBe(true);
    expect(cells.some((c) => c.params.absentCard)).toBe(true);
  });

  it('Tier 1 contains the full radius x inset grid under every profile', () => {
    for (const p of PROFILES) {
      for (const g of GRID_GEOMETRIES) {
        const hit = cells.filter(
          (c) => c.tier === 1 && c.group === `T1-${p.name}` && c.params.radiusMm === g.radiusMm && c.params.insetModules === g.insetModules,
        );
        expect(hit.length).toBe(1);
      }
    }
    expect(GRID_GEOMETRIES.length).toBe(LEVELS.radiusMm.length * LEVELS.insetModules.length);
  });

  it('Tier 3 applies every duplex configuration on every radius x inset geometry', () => {
    const cfg = duplexConfigs();
    expect(cfg.length).toBe(22);
    const t3 = cells.filter((c) => c.tier === 3);
    expect(t3.length).toBe(cfg.length * GRID_GEOMETRIES.length);
    for (const g of GRID_GEOMETRIES) {
      const own = t3.filter((c) => c.params.radiusMm === g.radiusMm && c.params.insetModules === g.insetModules);
      expect(own.length).toBe(cfg.length);
      expect(new Set(own.map((c) => c.params.face))).toEqual(new Set(['FRONT', 'BACK_VERTICAL', 'BACK_HORIZONTAL']));
    }
  });

  it('Tier 2 and Tier 4 run on the reference geometries only, and 3x3 / absent-card cells exist in Tier 4', () => {
    const ref = new Set(REFERENCE_GEOMETRIES.map((g) => `${g.radiusMm}/${g.insetModules}`));
    for (const c of cells.filter((x) => x.tier === 2 || x.tier === 4)) expect(ref.has(`${c.params.radiusMm}/${c.params.insetModules}`)).toBe(true);
    const t4 = cells.filter((c) => c.tier === 4);
    expect(t4.filter((c) => c.params.layout === '3x3' && !c.params.absentCard).length).toBe(24);
    expect(t4.filter((c) => c.params.layout === '2x2' && c.params.absentCard).length).toBe(24);
    expect(t4.filter((c) => c.params.layout === '3x3' && c.params.absentCard).length).toBe(24);
  });

  it('merges the Tier 2 light-table request into the Tier 1 CLEAN_LIGHT cell and records it', () => {
    const merged = groupSummaries(cells).find((g) => g.group === 'T1-CLEAN_LIGHT');
    expect(merged?.mergedDuplicates).toBe(REFERENCE_GEOMETRIES.length);
  });
});

describe('full factorial size', () => {
  it('is the product of the level counts and is far beyond what can be run', () => {
    const ff = fullFactorial();
    expect(ff.cells).toBe(ff.factors.reduce((t, f) => t * BigInt(f.levels), 1n));
    expect(ff.factors.find((f) => f.name.startsWith('face'))?.levels).toBe(3 + 2 * 4 * 3 * 3);
    expect(ff.cells).toBe(207_360_000n);
    expect(ff.trialsAtMinimum).toBe(ff.cells * 200n);
  });
});

describe('seed derivation', () => {
  it('is a pure function of (cell id, trial index)', () => {
    const id = cells[0]?.id as string;
    expect(trialSeed(id, 0)).toBe(trialSeed(id, 0));
    expect(trialSeed(id, 0)).not.toBe(trialSeed(id, 1));
    expect(trialSeed(id, 0)).not.toBe(trialSeed(cells[1]?.id as string, 0));
    expect(Number.isInteger(trialSeed(id, 5)) && trialSeed(id, 5) >= 0 && trialSeed(id, 5) < 2 ** 32).toBe(true);
    // fixed expected values guard against accidental changes of the derivation (and of the base seed)
    expect(GEOMETRY_BASE_SEED).toBe(20260514);
    expect(trialSeed('2x2-F-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat', 0)).toBe(
      trialSeed('2x2-F-r3.175-i1-tb64-sh0-ro0-gp0-cm0-tl0-bl0-lt0-rs0-rr0-co0-mat', 0),
    );
  });

  it('gives distinct seeds for every trial of every cell (no repeated draw inside a cell)', () => {
    for (const c of cells) {
      const seen = new Set<number>();
      for (let i = 0; i < c.trials; i++) seen.add(trialSeed(c.id, i));
      expect(seen.size).toBe(c.trials);
    }
  });

  it('derives four different sub-stream seeds from one trial seed', () => {
    const s = trialSeed(cells[3]?.id as string, 7);
    expect(new Set([1, 2, 3, 4].map((k) => streamSeed(s, k))).size).toBe(4);
  });
});

describe('statistics', () => {
  it('zero-event bound is 1 - 0.05^(1/n): about 0.30% at n = 1000 and 1.5% at n = 200', () => {
    expect(zeroEventUpperBound95(1000)).toBeCloseTo(1 - Math.pow(0.05, 1 / 1000), 15);
    expect(zeroEventUpperBound95(1000)).toBeCloseTo(0.002991, 5);
    expect(zeroEventUpperBound95(200)).toBeCloseTo(0.014869, 5);
    expect(zeroEventUpperBound95(200)).toBeLessThan(3.01 / 200);
    expect(() => zeroEventUpperBound95(0)).toThrow(RangeError);
  });

  const cell = cells.find((c) => c.params.radiusMm === 0 && c.tier === 1) as (typeof cells)[number];
  const mkRecords = (cls: ('CORRECT' | 'REJECTED' | 'FALSE_ACCEPT')[]): TrialRecord[] =>
    cls.map((c, i) => ({ seed: 100 + i, cls: c, kind: c === 'CORRECT' ? 'IDENTIFIED' : c === 'REJECTED' ? 'INCOMPLETE_GROUP' : 'IDENTIFIED', cause: c === 'CORRECT' ? '' : c === 'REJECTED' ? 'INCOMPLETE_GROUP' : 'FALSE_ACCEPT/WRONG_CARD_SET' }));

  it('with no false acceptance the bound is recorded and no failing seed list is needed', () => {
    const r = summarizeCell(cell, mkRecords(['CORRECT', 'CORRECT', 'REJECTED', 'CORRECT']));
    expect([r.n, r.correct, r.rejected, r.falseAccepts]).toEqual([4, 3, 1, 0]);
    expect(r.correctRate).toBe(0.75);
    expect(r.falseAcceptUpperBound95).toBeCloseTo(zeroEventUpperBound95(4), 15);
    expect(r.rejectionKinds).toEqual({ INCOMPLETE_GROUP: 1 });
    expect(r.failureCauses).toEqual({ INCOMPLETE_GROUP: 1 });
    expect(r.rejectedSeedsSample).toEqual([102]);
  });

  it('with a false acceptance the bound is null and every failing seed is recorded', () => {
    const r = summarizeCell(cell, mkRecords(['CORRECT', 'FALSE_ACCEPT', 'FALSE_ACCEPT', 'REJECTED']));
    expect(r.falseAccepts).toBe(2);
    expect(r.falseAcceptRate).toBe(0.5);
    expect(r.falseAcceptUpperBound95).toBeNull();
    expect(r.falseAcceptSeeds).toEqual([101, 102]);
    expect(r.failureCauses['FALSE_ACCEPT/WRONG_CARD_SET']).toBe(2);
  });

  it('reports "No Central_Void" (null) for r = 0 and the true minimum distance otherwise', () => {
    const g0 = geometryReport({ radiusMm: 0, insetModules: 1 });
    expect(g0.voidToBorderCornerMm).toBeNull();
    expect(g0.voidTipToBorderCornerMm).toBeNull();
    const table: Array<[number, number]> = [[2.0, 3.39], [3.0, 3.18], [3.175, 3.175], [3.6, 3.0], [4.0, 2.83], [5.0, 2.42], [6.0, 2.0]];
    for (const [r, d] of table) expect(geometryReport({ radiusMm: r, insetModules: 1 }).voidToBorderCornerMm).toBeCloseTo(d, 2);
    expect(geometryReport({ radiusMm: 6, insetModules: 1 }).containmentValid).toBe(false);
    expect(geometryReport({ radiusMm: 3.175, insetModules: 1 }).clearanceMm).toBeCloseTo(0.93, 2);
  });

  it('rejecting an incomplete group is the expected outcome and is not tallied as a failure cause', () => {
    const inc = cells.find((c) => c.params.absentCard) as (typeof cells)[number];
    const r = summarizeCell(inc, mkRecords(['REJECTED', 'REJECTED', 'FALSE_ACCEPT']));
    expect(r.expectation).toBe('REJECT');
    expect([r.correct, r.rejected, r.falseAccepts]).toEqual([0, 2, 1]);
    expect(r.failureCauses).toEqual({ 'FALSE_ACCEPT/WRONG_CARD_SET': 1 });
    expect(r.falseAcceptSeeds).toEqual([102]);
  });
});
