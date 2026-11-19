import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { composeGroup, SLOT_NAMES, slotChoices, type Arrangement } from '../src/optical/testing/group-compose';
import type { GrayImage } from '../src/optical/render';
import { evaluateManifest, parsePgm, validateManifest, writeReports } from './validate-optical-photos';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'qroker-photos-')); dirs.push(dir); return dir; };
const fixture = () => {
  const choices = slotChoices();
  const arrangement = Object.fromEntries(SLOT_NAMES.map((slot, i) => [slot, { ...choices[slot][0]!, card: `${choices[slot][0]!.card.split('-')[0]}-${i + 2}` }])) as Arrangement;
  return { ...composeGroup(arrangement, { modulePx: 4 }), cards: Object.values(arrangement).map(p => p.card) };
};
const pgm = (image: GrayImage) => Buffer.concat([Buffer.from(`P5\n${image.width} ${image.height}\n255\n`), Buffer.from(image.data)]);
const manifest = (cards: string[] = []) => ({
  schemaVersion: 1, evidence: 'synthetic',
  session: { id: 'unit-fixture', capturedAt: '2026-11-16T12:00:00+09:00', device: 'synthetic fixture', printer: 'none (synthetic)', paper: 'none (synthetic)', moduleMm: 1.6 },
  plan: { trialsPerCondition: 2, conditions: ['baseline', 'negative'] },
  trials: [{ id: 't1', file: 'photo.pgm', condition: 'baseline', expectedCards: cards, targetRegion: { xMin: 50, yMin: 50, xMax: 80, yMax: 80 } }],
});
const writeInput = (data: ReturnType<typeof manifest>, image: GrayImage) => {
  const dir = temp();
  const path = join(dir, 'manifest.json');
  writeFileSync(path, JSON.stringify(data)); writeFileSync(join(dir, 'photo.pgm'), pgm(image));
  return { dir, path };
};

describe('P5 parser', () => {
  it('supports comments and CRLF without eating binary whitespace or hash pixels', () => {
    const bytes = Buffer.concat([Buffer.from('P5\r\n# phone conversion\r\n3\t1\n# max follows\n255\r\n'), Buffer.from([10, 32, 35])]);
    expect(parsePgm(bytes)).toEqual({ width: 3, height: 1, data: new Uint8Array([10, 32, 35]) });
  });
  it('rejects malformed, truncated, extra and oversized input before raster allocation', () => {
    for (const header of ['P2\n1 1\n255\n', 'P5\n0 1\n255\n', 'P5\n1e2 1\n255\n', 'P5\n1 1\n256\n', 'P5\n4001 4000\n255\n', 'P5\n1 1\n255', `P5\n#${'x'.repeat(65_536)}\n1 1\n255\n`]) {
      expect(() => parsePgm(Buffer.from(header))).toThrow();
    }
    expect(() => parsePgm(Buffer.from('P5\n2 1\n255\nX'))).toThrow(/length/i);
    expect(() => parsePgm(Buffer.from('P5\n1 1\n255\nXY'))).toThrow(/length/i);
    expect(() => parsePgm(Buffer.from('P5\r\n1 1\r\n255\r\n'))).toThrow(/length/i);
    expect(() => parsePgm(Buffer.from([80, 181, 10, 49, 32, 49, 10, 50, 53, 53, 10, 0]))).toThrow();
  });
});

describe('manifest validation', () => {
  it('requires real-camera declarations, valid card sets and unique planned conditions/trial IDs', () => {
    const good = manifest();
    expect(validateManifest(good)).toEqual(good);
    for (const bad of [
      { ...good, schemaVersion: 2 },
      { ...good, evidence: 'unknown' },
      { ...good, evidence: 'real-camera', session: { ...good.session, printer: '' } },
      { ...good, session: { ...good.session, capturedAt: 'yesterday' } },
      { ...good, session: { ...good.session, capturedAt: '2026-02-31T12:00:00Z' } },
      { ...good, plan: { ...good.plan, trialsPerCondition: 0 } },
      { ...good, plan: { ...good.plan, conditions: ['baseline', 'baseline'] } },
      { ...good, trials: [good.trials[0], good.trials[0]] },
      { ...good, trials: [{ ...good.trials[0], expectedCards: ['H-A', 'H-A', 'C-A', 'S-A'] }] },
      { ...good, trials: [{ ...good.trials[0], condition: 'undeclared' }] },
    ]) expect(() => validateManifest(bad)).toThrow();
  });
  it('rejects symlinked directories that lead outside the manifest directory', (context) => {
    const root = temp(), outside = temp(); const f = fixture();
    writeFileSync(join(outside, 'photo.pgm'), pgm(f.image));
    try { symlinkSync(outside, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') { context.skip('Sandbox does not permit symlinks/junctions'); return; }
      throw error;
    }
    const data = manifest(f.cards); data.trials[0]!.file = 'linked/photo.pgm';
    const path = join(root, 'manifest.json'); writeFileSync(path, JSON.stringify(data));
    expect(() => evaluateManifest(path)).toThrow(/symlink|escapes/i);
  });
  it('rejects unsafe paths and out-of-bounds target regions', () => {
    const f = fixture();
    for (const file of ['../outside.pgm', 'nested/../photo.pgm', '/photo.pgm', 'C:\\photo.pgm', 'https://example.test/p.pgm', '..\\photo.pgm']) {
      expect(() => validateManifest({ ...manifest(f.cards), trials: [{ ...manifest(f.cards).trials[0], file }] })).toThrow(/file|path/i);
    }
    const data = manifest(f.cards); data.trials[0]!.targetRegion.xMax = 129;
    const { path } = writeInput(data, f.image);
    expect(() => evaluateManifest(path)).toThrow(/bounds/i);
  });
});

describe('offline evaluation', () => {
  it('decodes identical pixels identically even when expected identities change; counts caught mistakes as raw false accepts', () => {
    const f = fixture(); const data = manifest(f.cards);
    data.trials.push({ ...data.trials[0]!, id: 'wrong-reference', expectedCards: ['H-A', 'D-A', 'C-A', 'S-A'] });
    const { path } = writeInput(data, f.image); const report = evaluateManifest(path);
    expect(report.trials[0]!.raw).toEqual(report.trials[1]!.raw);
    expect(report.trials[0]).toMatchObject({ rawOutcome: 'CORRECT', rawClassification: 'RAW_CORRECT', postcheckOutcome: 'ACCEPTED', referenceCheck: 'IDENTIFIED' });
    expect(report.trials[1]).toMatchObject({ rawOutcome: 'FALSE_ACCEPT', rawClassification: 'RAW_FALSE_ACCEPT', postcheckOutcome: 'REFERENCE_MISMATCH' });
    expect(report.totals).toMatchObject({ completed: 2, planned: 4, falseAccepts: 1, correct: 1, zeroFalseAcceptUpperBound95: null });
    expect(report.status).toBe('INCOMPLETE');
    expect(report.conditions[1]).toMatchObject({ condition: 'negative', completed: 0, planned: 2, zeroFalseAcceptUpperBound95: null });
  });
  it('records a nearby complete group as a raw false accept for an incomplete intended target and guards its vertex separately', () => {
    const f = fixture(); const data = manifest([]);
    data.trials[0]!.targetRegion = { xMin: 0, yMin: 0, xMax: 10, yMax: 10 };
    const { path } = writeInput(data, f.image);
    const trial = evaluateManifest(path).trials[0]!;
    expect(trial).toMatchObject({ raw: { kind: 'IDENTIFIED' }, rawOutcome: 'FALSE_ACCEPT', rawClassification: 'RAW_FALSE_ACCEPT', targetCheck: 'OUTSIDE_TARGET', postcheckOutcome: 'TARGET_MISMATCH' });
  });
  it('does not turn a correct-identity result outside its target into raw accuracy', () => {
    const f = fixture(); const data = manifest(f.cards); data.trials[0]!.targetRegion = { xMin: 0, yMin: 0, xMax: 10, yMax: 10 };
    const { path } = writeInput(data, f.image);
    expect(evaluateManifest(path).trials[0]).toMatchObject({ referenceCheck: 'IDENTIFIED', groundTruthMatch: true, rawOutcome: 'FALSE_ACCEPT', targetCheck: 'OUTSIDE_TARGET', postcheckOutcome: 'TARGET_MISMATCH' });
  });
  it('preserves raw rejection and separates expected negative rejections from positive misses', () => {
    const f = fixture(); f.image.data.fill(255); const data = manifest(f.cards);
    data.trials.push({ ...data.trials[0]!, id: 'negative', condition: 'negative', expectedCards: [] });
    const { path } = writeInput(data, f.image); const report = evaluateManifest(path);
    expect(report.trials.map(t => t.raw.kind)).toEqual(['NOT_DETECTED', 'NOT_DETECTED']);
    expect(report.trials.map(t => t.rawOutcome)).toEqual(['REJECTED', 'REJECTED']);
    expect(report.conditions[0]).toMatchObject({ correct: 0, rejected: 1, positiveMisses: 1 });
    expect(report.conditions[1]).toMatchObject({ correct: 0, rejected: 1, correctRejections: 1 });
    expect(report.totals.zeroFalseAcceptUpperBound95).toBeCloseTo(1 - Math.pow(0.05, 1 / 2));
  });
  it('never passes empty plans and writes stable reports that declare evidence and timing limits', () => {
    const dir = temp(); const path = join(dir, 'manifest.json');
    writeFileSync(path, JSON.stringify({ ...manifest(), trials: [] }));
    const report = evaluateManifest(path);
    expect(report).toMatchObject({ status: 'INCOMPLETE', assessment: 'DESCRIPTIVE_ONLY', evidenceVerification: 'USER-DECLARED; not independently verified', totals: { completed: 0, zeroFalseAcceptUpperBound95: null } });
    const out = join(dir, 'reports'); writeReports(report, out);
    const json = readFileSync(join(out, 'optical-photos.json'), 'utf8');
    const markdown = readFileSync(join(out, 'optical-photos.md'), 'utf8');
    expect(JSON.parse(json)).toEqual(report);
    expect(markdown).toContain('USER-DECLARED');
    expect(markdown).toContain('adjacent frames');
    expect(markdown).toContain('excludes camera capture');
    writeReports(report, out);
    expect(readFileSync(join(out, 'optical-photos.json'), 'utf8')).toBe(json);
    expect(readFileSync(join(out, 'optical-photos.md'), 'utf8')).toBe(markdown);
  });
  it('counts completion per condition rather than replacing missing conditions with excess captures', () => {
    const f = fixture(); f.image.data.fill(255); const data = manifest([]);
    data.plan.trialsPerCondition = 1;
    data.trials.push({ ...data.trials[0]!, id: 'extra-baseline' });
    const { path } = writeInput(data, f.image); const incomplete = evaluateManifest(path);
    expect(incomplete).toMatchObject({ status: 'INCOMPLETE', totals: { planned: 2, completed: 2, status: 'INCOMPLETE' } });
    data.trials[1]!.condition = 'negative'; writeFileSync(path, JSON.stringify(data));
    const complete = evaluateManifest(path);
    expect(complete).toMatchObject({ status: 'COMPLETE', assessment: 'DESCRIPTIVE_ONLY', totals: { completed: 2, correctRejections: 2 } });
  });
});
