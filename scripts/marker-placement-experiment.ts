/** Run with: npx tsx scripts/marker-placement-experiment.ts [seeds] [prepared-engine-root] */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PlayerView } from '../src/game/core/view';
import type { GameState } from '../src/game/core/state';
import type { Action } from '../src/game/core/types';
import { nextSeat } from '../src/game/core/turn';
import { markerMask, pickMarkerPlacement } from './completion/marker-placement';
import type { Tier } from './completion/marker-placement';

const seeds = Number(process.argv[2] ?? 2);
const root = resolve(process.argv[3] ?? 'D:/DevCaches/tmp/qroker-completion-opportunities');
assert(Number.isSafeInteger(seeds) && seeds > 0, 'Provide a positive number of seeds');

// The adapter projects marks only. Neither opposing card IDs nor the deck reach the placement strategy.
function tableFor(state: GameState, view: PlayerView) {
  return {
    side: Math.sqrt(state.board.length),
    board: state.board.map(c => c ? markerMask(c.card, c.orientation) : 0),
    nextHand: state.hands[nextSeat(view.viewer)].map(c => markerMask(c, 0)),
    myHand: view.myHand,
  };
}

for (const variant of ['v6new', 'v8']) {
  const base = resolve(root, variant, 'src/game');
  assert(existsSync(resolve(base, 'ai/intermediate.ts')), 'Expected prepared completion-opportunities engines at ' + base);
  const load = (p: string) => import(pathToFileURL(resolve(base, p + '.ts')).href);
  const { newGame, defaultConfig }: typeof import('../src/game/core/state') = await load('core/state');
  const { reduce, actingSeats }: typeof import('../src/game/core/engine') = await load('core/engine');
  const { viewFor }: typeof import('../src/game/core/view') = await load('core/view');
  const { decisionSeed, checkStateInvariants }: typeof import('../src/game/sim/play-game') = await load('sim/play-game');
  const { enumeratePlacements, toPlaceAction }: typeof import('../src/game/ai/strategy') = await load('ai/strategy');
  const { getStrategy }: { getStrategy(t: Tier): ReturnType<typeof import('../src/game/ai/registry').getStrategy> } = await load('ai/registry');
  const { detect }: typeof import('../src/game/core/composite-code') = await load('core/composite-code');
  const { placeOnBoard }: typeof import('../src/game/core/board') = await load('core/board');
  for (const mode of ['OWNER_ONLY', 'BLIND'] as const) for (const tier of ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const) {
    const results = { games: 0, placements: 0, opportunities: 0, captured: 0, codes: 0 };
    const guesses = getStrategy(tier);
    for (let seed = 1; seed <= seeds; seed++) {
      const initial = newGame({ seed, config: { ...defaultConfig(), identityVisibility: mode } });
      assert(initial.ok);
      let state = initial.value;
      while (state.phase !== 'ENDED') {
        assert(state.log.length < 300, 'Game exceeded the normal action bound');
        let action: Action;
        let expected: number | undefined;
        if (state.phase === 'REVEAL') action = { type: 'ACK_REVEAL' };
        else {
          const seat = actingSeats(state)[0]!;
          const view = viewFor(state, seat);
          const ctx = { decisionSeed: decisionSeed(seed, seat, state.log.length) };
          if (state.phase === 'GUESS_COLLECT') action = guesses.chooseGuesses(view, ctx);
          else {
            const candidates = enumeratePlacements(view);
            const chosen = pickMarkerPlacement(tableFor(state, view), candidates, tier, ctx.decisionSeed);
            action = toPlaceAction(view, chosen);
            // Independent ground truth AFTER choice; the actual reader is the variant's rule engine.
            const scored = new Set(state.scoredGroups);
            function codes(c: typeof chosen): number {
              const placed = placeOnBoard(state.board, c.pos, { card: c.card, owner: seat, orientation: c.orientation });
              assert(placed.ok);
              return detect(placed.value, c.pos, scored).length;
            }
            expected = codes(chosen);
            const opportunity = expected > 0 || candidates.some(c => codes(c) > 0);
            results.placements++;
            results.opportunities += Number(opportunity);
            results.captured += Number(expected > 0);
            assert(!opportunity || expected > 0, 'Missed a legal immediate completion');
          }
        }
        const next = reduce(state, action);
        assert(next.ok);
        if (expected !== undefined) assert.equal(next.value.scoredGroups.length - state.scoredGroups.length, expected);
        checkStateInvariants(next.value, state);
        state = next.value;
      }
      results.games++;
      results.codes += state.scoredGroups.length;
    }
    console.log(JSON.stringify({ variant, mode, tier, ...results }));
  }
}
