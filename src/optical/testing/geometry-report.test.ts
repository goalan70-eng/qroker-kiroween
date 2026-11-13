/**
 * Task 5.6 (Phase B): tests of the merge/report step. A tiny fixture of real cells with synthetic trial records;
 * no rendering. Synthetic design only; nothing here says anything about real cameras.
 */
import { describe, expect, it } from 'vitest';
import {
  CLEAN_DARK,
  cellId,
  enumerateCells,
  summarizeCell,
  zeroEventUpperBound95,
  type Cell,
  type CellParams,
  type CellResult,
  type TrialRecord,
} from './geometry-design';
import { buildReport, renderJson, renderMarkdown, twoProportionZ, NO_CENTRAL_VOID } from './geometry-report';

const ALL = enumerateCells();
const byId = new Map(ALL.map((c) => [c.id, c]));
const P = (o: Partial<CellParams>): CellParams => Object.assign({}, CLEAN_DARK, o) as CellParams;
const cellOf = (o: Partial<CellParams>): Cell => {
  const c = byId.get(cellId(P(o)));
  if (c === undefined) throw new Error('not a planned cell');
  return c;
};

/** `correct` correct trials, `fa` false accepts, the rest rejected (INCOMPLETE_GROUP). n = the planned trials of the cell. */
function fake(cell: Cell, correct: number, fa = 0): CellResult {
  const recs: TrialRecord[] = [];
  for (let i = 0; i < cell.trials; i++) {
    if (i < correct) recs.push({ seed: i, cls: 'CORRECT', kind: 'IDENTIFIED', cause: '' });
    else if (i < correct + fa) recs.push({ seed: i, cls: 'FALSE_ACCEPT', kind: 'IDENTIFIED', cause: 'FALSE_ACCEPT/WRONG_SUM' });
    else recs.push({ seed: i, cls: 'REJECTED', kind: 'INCOMPLETE_GROUP', cause: 'INCOMPLETE_GROUP' });
  }
  return summarizeCell(cell, recs);
}

const baseline = cellOf({});
const blur05 = cellOf({ blurPx: 0.5 });
const blur10 = cellOf({ blurPx: 1.0 });
const square = cellOf({ radiusMm: 0 });
const fixtureCells = [baseline, blur05, blur10, square];
const fixtureResults = (): Map<string, CellResult> =>
  new Map([
    [baseline.id, fake(baseline, baseline.trials)],
    [blur05.id, fake(blur05, 198)],
    [blur10.id, fake(blur10, 180, 1)],
    [square.id, fake(square, 200)],
  ]);

describe('geometry report', () => {
  it('is deterministic and independent of the order in which results were read', () => {
    const a = fixtureResults();
    const b = new Map([...a.entries()].reverse());
    const ra = buildReport(fixtureCells, a);
    const rb = buildReport([...fixtureCells].reverse(), b);
    expect(renderJson(ra)).toBe(renderJson(rb));
    expect(renderMarkdown(ra)).toBe(renderMarkdown(rb));
    expect(renderJson(buildReport(fixtureCells, a))).toBe(renderJson(ra));
    // sorted by cell id; no timestamps and no timing fields
    const ids = ra.cells.map((c) => c.id);
    expect(ids).toEqual([...ids].sort());
    const text = renderJson(ra) + renderMarkdown(ra);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/);
    expect(text).not.toMatch(/totalMs|renderMs|decodeMs|warpMs|"timings"/);
  });

  it('records the 95% bound 1 - 0.05^(1/n) only when there are no false accepts, otherwise count, rate and seeds', () => {
    const rep = buildReport(fixtureCells, fixtureResults());
    const get = (id: string) => rep.cells.find((c) => c.id === id)!;
    const ok = get(baseline.id);
    expect(ok.n).toBe(1000);
    expect(ok.falseAccepts).toBe(0);
    expect(ok.falseAcceptUpperBound95).toBeCloseTo(1 - Math.pow(0.05, 1 / 1000), 12);
    expect(ok.falseAcceptUpperBound95).toBe(zeroEventUpperBound95(1000));
    expect(ok.falseAcceptSeeds).toEqual([]);
    const bad = get(blur10.id);
    expect(bad.falseAccepts).toBe(1);
    expect(bad.falseAcceptUpperBound95).toBeNull();
    expect(bad.falseAcceptSeeds).toEqual([180]);
    expect(bad.falseAcceptRate).toBeCloseTo(1 / 200, 12);
    expect(rep.falseAccepts.map((f) => [f.cellId, f.count, f.seeds])).toEqual([[blur10.id, 1, [180]]]);
    expect(rep.falseAccepts[0]!.reproduce).toContain(`--cell ${blur10.id} --seed 180`);
    const md = renderMarkdown(rep);
    expect(md).toContain('seeds 180');
  });

  it('writes "No Central_Void" for radius 0 and the true void distance otherwise', () => {
    const rep = buildReport(fixtureCells, fixtureResults());
    const sq = rep.cells.find((c) => c.id === square.id)!;
    expect(sq.voidToBorderCornerMm).toBe(NO_CENTRAL_VOID);
    expect(sq.voidTipToBorderCornerMm).toBe(NO_CENTRAL_VOID);
    const base = rep.cells.find((c) => c.id === baseline.id)!;
    expect(typeof base.voidToBorderCornerMm).toBe('number');
  });

  it('flags missing cells and a wrong n, and states the synthetic disclaimer in both outputs', () => {
    const partial = fixtureResults();
    partial.delete(square.id);
    partial.set(blur05.id, summarizeCell(blur05, [{ seed: 0, cls: 'CORRECT', kind: 'IDENTIFIED', cause: '' }]));
    const rep = buildReport(fixtureCells, partial);
    expect(rep.completeness.complete).toBe(false);
    expect(rep.completeness.missing).toEqual([square.id]);
    expect(rep.completeness.wrongTrialCount).toEqual([{ id: blur05.id, planned: 200, found: 1 }]);
    for (const text of [renderJson(rep), renderMarkdown(rep)]) {
      expect(text).toContain('synthetic images, not real cameras');
    }
    expect(renderMarkdown(rep)).toContain('INCOMPLETE');
    expect(renderMarkdown(rep)).toContain('not a guarantee');
  });

  it('reports the transition levels of a sweep from the series of cells', () => {
    const rep = buildReport(fixtureCells, fixtureResults());
    const t = rep.transitions.find((x) => x.tier === 2 && x.factor === 'blurPx' && x.scope === 'r=3.175 mm, inset 1')!;
    expect(t.series.map((p) => [p.level, p.correctRate])).toEqual([
      ['0', 1],
      ['0.5', 0.99],
      ['1', 0.9],
      ['1.5', null],
      ['2', null],
    ]);
    expect(t.firstLevelBelow100).toBe('0.5');
    expect(t.firstLevelBelow95).toBe('1');
  });

  it('records steps 2 and 3 of Requirement 15.7 as not evaluated and recommends no radius reduction', () => {
    const rep = buildReport(fixtureCells, fixtureResults());
    const steps = rep.decisionTable;
    expect(steps.map((s) => s.requirement)).toEqual(['15.7 (1)', '15.7 (2)', '15.7 (3)', '15.7 (4), 16.8', '15.7 (5)']);
    expect(steps[1]!.evaluated).toBe(false);
    expect(steps[2]!.evaluated).toBe(false);
    expect(steps[1]!.outcome).toContain('NOT EVALUATED');
    expect(steps[2]!.outcome).toContain('NOT EVALUATED');
    expect(steps[4]!.outcome).toContain('NO corner-radius reduction is recommended');
    const md = renderMarkdown(rep);
    // tolerances (section 4) come before the decision table (section 9)
    expect(md.indexOf('## 4. Placement, registration and cut tolerances')).toBeGreaterThan(0);
    expect(md.indexOf('## 4. Placement')).toBeLessThan(md.indexOf('## 9. Decision table'));
  });

  it('lists the known unresolved detection limitations in the Limitations section of the Markdown only', () => {
    const rep = buildReport(fixtureCells, fixtureResults());
    const md = renderMarkdown(rep);
    const start = md.indexOf('### 10.1 Known unresolved detection limitations');
    expect(start).toBeGreaterThan(md.indexOf('## 10. Limitations'));
    expect(start).toBeLessThan(md.indexOf('## Appendix A'));
    const section = md.slice(start, md.indexOf('## Appendix A'));
    expect(section).toContain('`quadArea / hullArea < 0.85`');
    expect(section).toContain('without recording a rejected candidate');
    expect(section).toContain('2x2-F-r3.175-i2-tb64-sh0-ro0-gp0-cm45-tl0-bl0-lt0-rs0-rr0-co0-mat');
    expect(section).toContain('200 of 200 trials INCOMPLETE_GROUP');
    expect(section).toContain('0.843');
    expect(section).toContain('0.892 to 0.894');
    expect(section).toContain('docs/optical/results/m5-6-45deg-analysis.md');
    expect(section).toContain('single pixel phase');
    expect(section).toContain('must not be read as robust');
    expect(section).toContain('from 0.85 to 0.80 is NOT applied');
    expect(section).toContain('separate dataset');
    expect(section).toContain('stays 1.0');
    expect(section).toContain('not an adopted change');
    expect(section).toContain('Tier 5 was not run');
    expect(section).toContain('No corner-radius reduction is recommended');
    expect(section).toContain('`centerOffsetModules = inset + 1 + 3.5`');
    expect(section).toContain('never derived from card identities');
    expect(renderJson(rep)).not.toContain('Known unresolved detection limitations');
  });

  it('does not copy the disclaimer of the diagnostics file into the report', () => {
    const diag = { disclaimer: 'synthetic images, not real cameras: diagnostics file', method: 'm', analyzedTrials: 0, trialsWithSpuriousCandidates: 0, consequentialSpurious: [], falseAcceptNotes: [], limits: [] };
    const withDiag = buildReport(fixtureCells, fixtureResults(), diag);
    expect(renderJson(withDiag)).not.toContain('diagnostics file');
    expect(withDiag.diagnostics).not.toHaveProperty('disclaimer');
    expect(diag.disclaimer).toContain('diagnostics file');
  });

  it('two-proportion z is symmetric and zero for equal rates', () => {
    expect(twoProportionZ(10, 100, 10, 100)).toBe(0);
    expect(twoProportionZ(50, 100, 80, 100)).toBeCloseTo(-twoProportionZ(80, 100, 50, 100), 12);
    expect(twoProportionZ(0, 100, 0, 100)).toBe(0);
  });
});
