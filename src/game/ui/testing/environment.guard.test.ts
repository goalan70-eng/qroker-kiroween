// Guard (task 21.1): this file has NO environment docblock, so it runs in the global `node` environment of
// `vitest.config.ts`. The optical tests rely on that; `happy-dom` must stay opt-in per test file.
import { describe, expect, it } from 'vitest';

describe('default test environment', () => {
  it('has no DOM globals (model/node evidence class)', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
  });
});
