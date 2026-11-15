// Tests of the pure overlay state model (task 19.3). Evidence class: model tests.
import { describe, expect, it } from 'vitest';
import { isAbandonable, reduceOverlay } from './overlay-model';
import type { OverlayContext, OverlayEvent, OverlayState } from './overlay-model';

const SETUP: OverlayContext = { screen: 'SETUP', phase: null };
const GAME: OverlayContext = { screen: 'GAME', phase: 'PLACEMENT' };
const GAME_NO_VIEW: OverlayContext = { screen: 'GAME', phase: null };
const END: OverlayContext = { screen: 'END', phase: 'ENDED' };
const ENDED_ON_GAME: OverlayContext = { screen: 'GAME', phase: 'ENDED' };

const openAbandon = (c: OverlayContext): OverlayEvent => ({ type: 'OPEN_ABANDON', ...c });
const context = (c: OverlayContext): OverlayEvent => ({ type: 'CONTEXT', ...c });

describe('help', () => {
  it('opens from every screen state: SETUP, GAME and END (the OPEN_HELP event carries no screen)', () => {
    expect(reduceOverlay('NONE', { type: 'OPEN_HELP' })).toBe('HELP');
    // Opening does not depend on the context, and a later context change does not close it.
    for (const c of [SETUP, GAME, GAME_NO_VIEW, END, ENDED_ON_GAME]) {
      expect(reduceOverlay('HELP', context(c)), JSON.stringify(c)).toBe('HELP');
    }
  });

  it('is refused while another overlay is open, and a repeated open changes nothing', () => {
    expect(reduceOverlay('HELP', { type: 'OPEN_HELP' })).toBe('HELP');
    expect(reduceOverlay('ABANDON_CONFIRM', { type: 'OPEN_HELP' })).toBe('ABANDON_CONFIRM');
  });
});

describe('abandon confirmation', () => {
  it('opens only for an active game: GAME screen and a phase other than ENDED', () => {
    expect(reduceOverlay('NONE', openAbandon(GAME))).toBe('ABANDON_CONFIRM');
    expect(reduceOverlay('NONE', openAbandon(GAME_NO_VIEW))).toBe('ABANDON_CONFIRM'); // an all-AI game has no view
    for (const phase of ['PLACEMENT', 'GUESS_COLLECT', 'REVEAL'] as const) {
      expect(reduceOverlay('NONE', openAbandon({ screen: 'GAME', phase })), phase).toBe('ABANDON_CONFIRM');
    }
  });

  it('is refused on SETUP, END and phase ENDED', () => {
    for (const c of [SETUP, END, ENDED_ON_GAME]) expect(reduceOverlay('NONE', openAbandon(c)), JSON.stringify(c)).toBe('NONE');
    expect(isAbandonable(SETUP)).toBe(false);
    expect(isAbandonable(END)).toBe(false);
    expect(isAbandonable(ENDED_ON_GAME)).toBe(false);
    expect(isAbandonable(GAME)).toBe(true);
  });

  it('does not replace an open help, and a repeated open changes nothing', () => {
    expect(reduceOverlay('HELP', openAbandon(GAME))).toBe('HELP');
    expect(reduceOverlay('ABANDON_CONFIRM', openAbandon(GAME))).toBe('ABANDON_CONFIRM');
  });

  it('closes when the context says the game is no longer active (stale closing events)', () => {
    expect(reduceOverlay('ABANDON_CONFIRM', context(GAME))).toBe('ABANDON_CONFIRM');
    for (const c of [SETUP, END, ENDED_ON_GAME]) expect(reduceOverlay('ABANDON_CONFIRM', context(c)), JSON.stringify(c)).toBe('NONE');
    expect(reduceOverlay('NONE', context(SETUP))).toBe('NONE');
  });
});

describe('close and Escape', () => {
  it('return to NONE from any state, and stay NONE from NONE', () => {
    for (const state of ['NONE', 'HELP', 'ABANDON_CONFIRM'] as const) {
      expect(reduceOverlay(state, { type: 'CLOSE' }), state).toBe('NONE');
      expect(reduceOverlay(state, { type: 'ESCAPE' }), state).toBe('NONE');
    }
  });
});

describe('purity', () => {
  it('is a total, deterministic function of (state, event) and never returns an unknown state', () => {
    const states: OverlayState[] = ['NONE', 'HELP', 'ABANDON_CONFIRM'];
    const contexts = [SETUP, GAME, GAME_NO_VIEW, END, ENDED_ON_GAME];
    const events: OverlayEvent[] = [
      { type: 'OPEN_HELP' },
      { type: 'CLOSE' },
      { type: 'ESCAPE' },
      ...contexts.flatMap((c) => [openAbandon(c), context(c)]),
    ];
    for (const s of states) {
      for (const e of events) {
        const a = reduceOverlay(s, e);
        expect(states).toContain(a);
        expect(reduceOverlay(s, e)).toBe(a);
      }
    }
  });
});
