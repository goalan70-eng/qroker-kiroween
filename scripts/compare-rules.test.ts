import { describe, expect, it } from 'vitest';
import { parseCliArgs, runCliExperiment } from './compare-rules';

describe('rule-experiment command-line interface', () => {
  it('preserves the published 4-card / no-code-limit defaults', () => {
    expect(parseCliArgs([])).toEqual({
      hand: 4, codes: null, games: 200, seed: 0,
      mix: 'mixed', visibility: 'owner-only', json: false, help: false,
    });
  });

  it('parses the requested 3-card / 5-code experiment', () => {
    const args = parseCliArgs([
      '--hand', '3', '--codes', '5', '--games', '4', '--seed', '8',
      '--mix', 'advanced', '--visibility', 'face-up', '--json',
    ]);
    expect(args).toEqual({
      hand: 3, codes: 5, games: 4, seed: 8,
      mix: 'advanced', visibility: 'face-up', json: true, help: false,
    });
  });

  it.each([
    ['--hand', '0'], ['--hand', '5'], ['--hand', '3.5'],
    ['--codes', '0'], ['--codes', '49'], ['--codes', '-1'],
    ['--games', '0'], ['--games', '5001'], ['--games', '1.5'],
    ['--mix', 'expert'], ['--visibility', 'none'], ['--seed', '4294967296'],
    ['--hand', '4', '--hand', '3'], ['--bogus'],
  ])('refuses unsupported or ambiguous command arguments: %s', (...args) => {
    expect(() => parseCliArgs(args)).toThrow(RangeError);
  });

  it('rejects a seed interval that exceeds uint32', () => {
    expect(() => parseCliArgs(['--seed', '4294967295', '--games', '2'])).toThrow(RangeError);
  });

  it('produces deterministic summaries with explicit bonus policy', { timeout: 20000 }, () => {
    const options = parseCliArgs(['--hand', '3', '--codes', '5', '--games', '3', '--seed', '7', '--mix', 'mixed']);
    const a = runCliExperiment(options);
    const b = runCliExperiment(options);
    expect(a).toEqual(b);
    expect(a.settings).toMatchObject({ hand: 3, codes: 5, games: 3 });
    expect(Object.values(a.stopCounts).reduce((s, x) => s + x, 0)).toBe(3);
    expect(a.handEmptyBonus).toBe(5);
    expect(a.scoreTable).toEqual([10, 5, 4, 3, 2, 1]);
  });
});
