/** Synthetic negative regressions around the repaired pixel-phase gate; no real-camera claim. */
import { describe, expect, it } from 'vitest';
import { decodeGroup } from '../decode-group';
import { mulberry32 } from '../prng';
import { composeGroup, SLOT_NAMES } from './group-compose';
import { drawArrangement, flipDataModules } from './rejection-support';
import { compose, rotationMatrix, translationMatrix, warpImage } from './warp';
import type { GrayImage } from '../render';

const phases = [{ x: 0, y: 0 }, { x: 0, y: 0.5 }, { x: 0.25, y: 0.75 }];
const arrangement = drawArrangement(mulberry32(0x10decafe));
function view(image: GrayImage, angle: number, phase: { x: number; y: number }): GrayImage {
  return warpImage(image, compose(rotationMatrix(angle, image.width / 2, image.height / 2), translationMatrix(phase.x, phase.y)),
    image.width, image.height, { background: 255, supersample: 2 });
}

describe('Issue #10: near-diagonal candidate recovery retains rejection checks', () => {
  it('never identifies a group with one missing fragment at the repaired angles and phases', () => {
    for (const slot of SLOT_NAMES) {
      const { image } = composeGroup(arrangement, { modulePx: 4, override: { [slot]: null } });
      for (const angle of [44.9, 45, 45.1]) for (const phase of phases) {
        expect(decodeGroup(view(image, angle, phase)).kind, `${slot} ${angle} ${JSON.stringify(phase)}`).not.toBe('IDENTIFIED');
      }
    }
  });

  it('rejects two or three inverted data modules at default radius 1 around the repaired angles', () => {
    const built = composeGroup(arrangement, { modulePx: 4 });
    for (const slot of SLOT_NAMES) for (const bits of [[0, 12], [0, 12, 24]]) {
      const image = flipDataModules(built.image, built.centers[slot], 4, bits);
      for (const angle of [44.9, 45, 45.1]) for (const phase of phases) {
        expect(decodeGroup(view(image, angle, phase)).kind, `${slot} ${bits} ${angle} ${JSON.stringify(phase)}`).not.toBe('IDENTIFIED');
      }
    }
  });
});
