/**
 * REGRESSIONS for the pixel-phase detector defect fixed for Issue #10.
 * SYNTHETIC images, not real cameras.
 *
 * The original failure characterization and measurements remain historical evidence in
 * docs/optical/results/m5-6-45deg-analysis.md. Assert exact decoded identities AND hidden sum;
 * merely accepting an image is not sufficient.
 */
import { describe, expect, it } from 'vitest';
import { CLEAN_DARK, cellId, trialSeed, type CellParams } from './geometry-design';
import { probeTrial } from './geometry-probe';
import { geometryOf, markerCenterOffsetModules } from './geometry-trial';

const cell = (inset: number): CellParams => Object.assign({}, CLEAN_DARK, { insetModules: inset, cameraRotation: 'DEG45' }) as CellParams;
/** First trial seed of the stored cell "camera rotation 45 deg, inset 2" (also the seed named in the stored diagnostics). */
const SEED = 4283752155;

function expectCorrect(p: ReturnType<typeof probeTrial>): void {
  expect(p.cls).toBe('CORRECT');
  expect(p.group.kind).toBe('IDENTIFIED');
  expect(p.firstFailingStage).toBe('NONE');
  expect(p.slots.every((s) => s.detected !== null && s.detected.fragment === s.truthCard)).toBe(true);
  if (p.group.kind === 'IDENTIFIED') {
    expect([...p.group.cards].sort()).toEqual(p.slots.map((s) => s.truthCard).sort());
    const expected = p.slots.reduce((sum, s) => {
      const rank = s.truthCard.slice(2);
      const court: Record<string, number> = { A: 1, J: 11, Q: 12, K: 13 };
      return sum + (court[rank] ?? Number(rank));
    }, 0);
    expect(p.group.hiddenSum).toBe(expected);
  }
}

describe('45 degree camera rotation: pixel-phase regressions (synthetic)', () => {
  it('the pinned seed is trial 0 of the stored cell', () => {
    expect(trialSeed(cellId(cell(2)), 0)).toBe(SEED);
  });

  it('inset 2 at exactly 45 deg identifies all four central markers, identities and sum', () => {
    const p = probeTrial(cell(2), SEED);
    expect(p.cameraRotationDeg).toBe(45);
    expectCorrect(p);
    for (const s of p.slots) {
      expect(s.detected?.distancePx).toBeLessThan(0.25);
      expect(s.detected?.fragment).toBe(s.truthCard);
    }
    expect(p.slots.find((s) => s.slot === 'BR')?.rejectedReason).toBeNull();
    expect(p.markersDetected).toBe(6);
    expect(p.rejectedCandidates.map((r) => r.reason)).toEqual(['TOUCHES_IMAGE_EDGE', 'TOUCHES_IMAGE_EDGE']);
    // Preserve the three original rotation controls. The recovered blunt-tip BR fit is slightly
    // asymmetric (about 44.46 deg), still correctly sampled and grouped without changing tolerances.
    for (const s of p.slots.filter((s) => s.slot !== 'BR')) expect(Math.abs(s.detected?.rotationDeg ?? 0)).toBeCloseTo(45, 1);
  });

  it('same seed, inset 2, 44 deg and 46 deg: all four markers found and the group identified correctly', () => {
    for (const deg of [44, 46]) {
      const p = probeTrial(cell(2), SEED, { cameraRotationDeg: deg });
      expectCorrect(p);
    }
  });

  it('control: same seed at exactly 45 deg with inset 1 and 1.5 is identified correctly', () => {
    for (const inset of [1, 1.5]) {
      const p = probeTrial(cell(inset), SEED, { cameraRotationDeg: 45 });
      expectCorrect(p);
    }
  });

  it('identifies both previously passing and failing fractional pixel phases at each inset', () => {
    const ok = probeTrial(cell(2), SEED, { cameraRotationDeg: 45, shiftPx: { x: 0.5, y: 0 } });
    expectCorrect(ok);
    for (const inset of [1, 1.5, 2]) {
      for (const shiftPx of [{ x: 0.25, y: 0.75 }, { x: 0, y: 0.5 }, { x: 0, y: 0.75 }]) {
        expectCorrect(probeTrial(cell(inset), SEED, { cameraRotationDeg: 45, shiftPx }));
      }
    }
  });

  it('identifies the previously failing near-45 band: 44.9 and 45.1 deg at inset 2', () => {
    for (const deg of [44.9, 45.1]) expectCorrect(probeTrial(cell(2), SEED, { cameraRotationDeg: deg }));
  });

  it('44.5 and 45.5 deg at inset 2 are identified correctly (the affected band is narrow)', () => {
    for (const deg of [44.5, 45.5]) expectCorrect(probeTrial(cell(2), SEED, { cameraRotationDeg: deg }));
  });

  it('the reader is given the layout offset from the inset parameter only (inset + 1 quiet module + 3.5), never an identity', () => {
    expect(markerCenterOffsetModules(geometryOf(cell(1)))).toBe(5.5);
    expect(markerCenterOffsetModules(geometryOf(cell(1.5)))).toBe(6);
    expect(markerCenterOffsetModules(geometryOf(cell(2)))).toBe(6.5);
  });
});
