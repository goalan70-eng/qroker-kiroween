/**
 * CHARACTERIZATION of a KNOWN LIMITATION (task 5.6 follow-up, docs/optical/results/m5-6-45deg-analysis.md).
 * SYNTHETIC images, not real cameras.
 *
 * These tests PIN the currently observed behaviour; they do NOT claim that the behaviour is correct. They assert
 * that a camera rotation of exactly 45 degrees at layout inset 2 loses one central marker in the detector (the
 * component is dropped silently by the marker-like gate, so it is not even listed as a rejected candidate), that
 * the same seed is read correctly at 44 and 46 degrees, at inset 1, and at other sub-pixel phases. If the
 * detector is ever changed on purpose, the "known limitation" expectations below must be updated together with
 * the analysis document; they must not be loosened to make a failing run pass.
 */
import { describe, expect, it } from 'vitest';
import { CLEAN_DARK, cellId, trialSeed, type CellParams } from './geometry-design';
import { probeTrial } from './geometry-probe';
import { geometryOf, markerCenterOffsetModules } from './geometry-trial';

const cell = (inset: number): CellParams => Object.assign({}, CLEAN_DARK, { insetModules: inset, cameraRotation: 'DEG45' }) as CellParams;
/** First trial seed of the stored cell "camera rotation 45 deg, inset 2" (also the seed named in the stored diagnostics). */
const SEED = 4283752155;

describe('45 degree camera rotation at inset 2: characterization of a known detector limitation (synthetic)', () => {
  it('the pinned seed is trial 0 of the stored cell', () => {
    expect(trialSeed(cellId(cell(2)), 0)).toBe(SEED);
  });

  it('KNOWN LIMITATION: inset 2 at exactly 45 deg loses the BR central marker silently in detection', () => {
    const p = probeTrial(cell(2), SEED);
    expect(p.cameraRotationDeg).toBe(45);
    expect(p.cls).toBe('REJECTED');
    expect(p.group.kind).toBe('INCOMPLETE_GROUP');
    expect(p.firstFailingStage).toBe('MARKER_DETECTION_SILENT_DROP');
    // exactly the BR marker is missing; the other three are found within a quarter pixel and read as the true cards
    expect(p.slots.filter((s) => s.detected === null).map((s) => s.slot)).toEqual(['BR']);
    for (const s of p.slots.filter((x) => x.detected !== null)) {
      expect(s.detected?.distancePx).toBeLessThan(0.25);
      expect(s.detected?.fragment).toBe(s.truthCard);
    }
    // not listed as a rejected candidate either: nothing covers the missing marker's truth centre
    expect(p.slots.find((s) => s.slot === 'BR')?.rejectedReason).toBeNull();
    // 5 markers in the image: the 3 central ones and 2 outer ones; the two rejected candidates touch the image edge
    expect(p.markersDetected).toBe(5);
    expect(p.rejectedCandidates.map((r) => r.reason)).toEqual(['TOUCHES_IMAGE_EDGE', 'TOUCHES_IMAGE_EDGE']);
    // the detector reports the canonical rotation of the detected ones at the +-45 boundary
    for (const s of p.slots.filter((x) => x.detected !== null)) expect(Math.abs(s.detected?.rotationDeg ?? 0)).toBeCloseTo(45, 1);
  });

  it('same seed, inset 2, 44 deg and 46 deg: all four markers found and the group identified correctly', () => {
    for (const deg of [44, 46]) {
      const p = probeTrial(cell(2), SEED, { cameraRotationDeg: deg });
      expect(p.cls, `${deg} deg`).toBe('CORRECT');
      expect(p.slots.every((s) => s.detected !== null && s.detected.fragment === s.truthCard), `${deg} deg`).toBe(true);
    }
  });

  it('control: same seed at exactly 45 deg with inset 1 and 1.5 is identified correctly', () => {
    for (const inset of [1, 1.5]) {
      const p = probeTrial(cell(inset), SEED, { cameraRotationDeg: 45 });
      expect(p.cls, `inset ${inset}`).toBe('CORRECT');
      expect(p.slots.every((s) => s.detected !== null), `inset ${inset}`).toBe(true);
    }
  });

  it('pixel-phase dependence: at 45 deg and inset 2 a shift of the image by half a pixel in x recovers the marker, (0.25, 0.75) loses it', () => {
    const ok = probeTrial(cell(2), SEED, { cameraRotationDeg: 45, shiftPx: { x: 0.5, y: 0 } });
    expect(ok.cls).toBe('CORRECT');
    const lost = probeTrial(cell(2), SEED, { cameraRotationDeg: 45, shiftPx: { x: 0.25, y: 0.75 } });
    expect(lost.cls).toBe('REJECTED');
    expect(lost.firstFailingStage).toBe('MARKER_DETECTION_SILENT_DROP');
    expect(lost.slots.filter((s) => s.detected === null)).toHaveLength(1);
  });

  it('the near-45 band is affected, not only the exact angle: 44.9 and 45.1 deg at inset 2 lose a marker', () => {
    for (const deg of [44.9, 45.1]) expect(probeTrial(cell(2), SEED, { cameraRotationDeg: deg }).firstFailingStage, `${deg} deg`).toBe('MARKER_DETECTION_SILENT_DROP');
  });

  it('44.5 and 45.5 deg at inset 2 are identified correctly (the affected band is narrow)', () => {
    for (const deg of [44.5, 45.5]) expect(probeTrial(cell(2), SEED, { cameraRotationDeg: deg }).cls, `${deg} deg`).toBe('CORRECT');
  });

  it('the reader is given the layout offset from the inset parameter only (inset + 1 quiet module + 3.5), never an identity', () => {
    expect(markerCenterOffsetModules(geometryOf(cell(1)))).toBe(5.5);
    expect(markerCenterOffsetModules(geometryOf(cell(1.5)))).toBe(6);
    expect(markerCenterOffsetModules(geometryOf(cell(2)))).toBe(6.5);
  });
});
