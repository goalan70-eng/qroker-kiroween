import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

describe('smoke', () => {
  it('runs a plain test', () => {
    expect(1 + 1).toBe(2);
  });

  it('loads fast-check: addition commutes', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => a + b === b + a),
    );
  });
});
