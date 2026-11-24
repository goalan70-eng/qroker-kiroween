// Finds a seed and a legal move sequence for Task 8.6: one placement that completes two Composite Codes in the
// browser configuration (P0 human, P1-P3 BEGINNER AI). Read-only: it runs only the pure engine.
//
// Human moves follow the browser test helpers (e2e/helpers/game.ts):
//   placement  first card of the Hand in view order, first legal cell in row-major order, orientation 0
//   guesses    20 + index, in the order of view.pendingQuadKeys (the order of the guess inputs)
// AI moves follow ui/controller.ts: decisionSeed of sim/play-game.ts, the registry strategy of the seat, and the AI
// seats submit before the human seat (the controller picks the first AI in actingSeats order).
//
// Expected points use a reward table written in this file, not the engine's score().
//
// Usage: npx tsx scripts/find-two-code-scene.ts [--from N] [--to M]     (one JSON object on stdout)

import { getStrategy } from '../src/game/ai/registry';
import { actingSeats, reduce } from '../src/game/core/engine';
import { defaultConfig, newGame } from '../src/game/core/state';
import type { GameState } from '../src/game/core/state';
import type { Action, PlayerId, QuadKey } from '../src/game/core/types';
import { legalCellsFor, viewFor } from '../src/game/core/view';
import { decisionSeed } from '../src/game/sim/play-game';

const REWARD = [10, 5, 4, 3, 2, 1];
const SEATS: readonly PlayerId[] = ['P0', 'P1', 'P2', 'P3'];
const HUMAN: PlayerId = 'P0';

const argNumber = (name: string, fallback: number): number => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};

const rewardFor = (guess: number, hidden: number): number => {
  const e = Math.abs(guess - hidden);
  return e < REWARD.length ? REWARD[e]! : 0;
};

interface Candidate {
  seed: number;
  batchIndex: number; // history index of the two-code batch
  placeLogIndex: number; // index in state.log of the two-code PLACE
  placer: PlayerId;
  placedCard: string;
  placedCell: { row: number; col: number };
  quadKeys: QuadKey[];
  hiddenSums: Record<string, number>;
  cumulativeBefore: Record<PlayerId, number>;
  endsGame: boolean;
  humanMoves: Array<Record<string, unknown>>; // human actions up to and including the two-code PLACE
  guessesBySeat?: Record<string, Record<QuadKey, number>>;
  reveal?: unknown;
  cumulativeAfter?: Record<string, number>;
}

const topLeft = (key: QuadKey): { row: number; col: number } => ({
  col: key.charCodeAt(0) - 'A'.charCodeAt(0),
  row: Number(key.slice(1)) - 1,
});

// Plays one seed with the browser policy. Returns the first two-code batch (its PLACE log index), or null.
function search(seed: number): Candidate | null {
  const config = defaultConfig();
  const created = newGame({ seed, config });
  if (!created.ok) throw new Error(`newGame rejected seed ${seed}`);
  let state: GameState = created.value;
  const humanMoves: Array<Record<string, unknown>> = [];

  const apply = (action: Action): GameState => {
    const next = reduce(state, action);
    if (!next.ok) throw new Error(`seed ${seed}: rejected ${JSON.stringify(action)}: ${next.error.code} ${next.error.detail ?? ''}`);
    return next.value;
  };

  let captured: Candidate | null = null;
  for (let guard = 0; state.phase !== 'ENDED'; guard++) {
    if (guard > 2000) throw new Error(`seed ${seed}: no end`);

    if (state.phase === 'REVEAL') {
      if (captured !== null && state.lastReveal !== null && state.lastReveal.batchIndex === captured.batchIndex) {
        const submissions = state.log.slice(captured.placeLogIndex + 1).filter((a): a is Extract<Action, { type: 'SUBMIT_GUESSES' }> => a.type === 'SUBMIT_GUESSES');
        const guessesBySeat = Object.fromEntries(submissions.map((a) => [a.player, { ...a.guesses }]));
        return { ...captured, guessesBySeat, reveal: state.lastReveal, cumulativeAfter: Object.fromEntries(state.lastReveal.perPlayer.map((p) => [p.player, p.cumulative])), humanMoves };
      }
      state = apply({ type: 'ACK_REVEAL' });
      continue;
    }

    if (state.phase === 'PLACEMENT') {
      const seat = state.turn;
      const placeIndex = state.log.length;
      if (seat === HUMAN) {
        const view = viewFor(state, HUMAN);
        const card = view.myHand[0];
        const cell = legalCellsFor(view)[0];
        if (card === undefined || cell === undefined) throw new Error(`seed ${seed}: no card or cell`);
        humanMoves.push({ seat: HUMAN, action: 'PLACE', card, row: cell.row, col: cell.col, orientation: 0 });
        state = apply({ type: 'PLACE', player: HUMAN, card, pos: { row: cell.row, col: cell.col }, orientation: 0 });
      } else {
        const ctx = Object.freeze({ decisionSeed: decisionSeed(state.seed, seat, state.log.length) });
        const difficulty = config.seats[SEATS.indexOf(seat)]!.difficulty!;
        state = apply(getStrategy(difficulty).choosePlacement(viewFor(state, seat), ctx));
      }
      const placed = state.log[placeIndex] as Extract<Action, { type: 'PLACE' }>;
      if (state.phase === 'GUESS_COLLECT' && state.pending !== null && state.pending.codes.length >= 2 && captured === null) {
        if (state.pending.codes.length !== 2 || state.pending.endsGame) return null; // keep only clean two-code batches
        captured = {
          seed,
          batchIndex: state.history.length,
          placeLogIndex: placeIndex,
          placer: state.pending.placer,
          placedCard: placed.card,
          placedCell: { row: placed.pos.row, col: placed.pos.col },
          quadKeys: state.pending.codes.map((c) => c.quadKey),
          hiddenSums: Object.fromEntries(state.pending.codes.map((c) => [c.quadKey, c.hiddenSum])),
          cumulativeBefore: { ...state.scores },
          endsGame: false,
          humanMoves,
        };
      }
      continue;
    }

    if (state.phase === 'GUESS_COLLECT') {
      const pending = state.pending!;
      const waiting = actingSeats(state);
      const seat = waiting.find((s) => s !== HUMAN) ?? waiting[0]!;
      if (seat === HUMAN) {
        const guesses: Record<QuadKey, number> = {};
        pending.codes.forEach((c, i) => {
          guesses[c.quadKey] = 20 + i;
        });
        humanMoves.push({ seat: HUMAN, action: 'SUBMIT_GUESSES', guesses: { ...guesses } });
        state = apply({ type: 'SUBMIT_GUESSES', player: HUMAN, guesses });
      } else {
        const ctx = Object.freeze({ decisionSeed: decisionSeed(state.seed, seat, state.log.length) });
        const difficulty = config.seats[SEATS.indexOf(seat)]!.difficulty!;
        state = apply(getStrategy(difficulty).chooseGuesses(viewFor(state, seat), ctx));
      }
      continue;
    }
  }
  return null;
}

// Expected points, derived from the hidden sums and the logged guesses with the reward table above (not from the
// reveal record). The engine's own reveal record is printed next to them as a cross-check.
function expectedPoints(c: Candidate): Record<string, { earned: number; cumulative: number }> {
  const out: Record<string, { earned: number; cumulative: number }> = {};
  for (const seat of SEATS) {
    let earned = 0;
    for (const key of c.quadKeys) {
      const guess = c.guessesBySeat![seat]![key]!;
      earned += rewardFor(guess, c.hiddenSums[key]!);
    }
    out[seat] = { earned, cumulative: c.cumulativeBefore[seat]! + earned };
  }
  return out;
}

const from = argNumber('--from', 1);
const to = argNumber('--to', 5000);
let found: Candidate | null = null;
let searched = 0;
let skipped = 0;
let tripped = 0;
for (let seed = from; seed <= to && found === null; seed++) {
  searched++;
  try {
    const candidate = search(seed);
    if (candidate === null || candidate.placer !== HUMAN || candidate.guessesBySeat === undefined) continue;
    tripped++;
    found = candidate;
  } catch (error) {
    skipped++;
    process.stderr.write(`skip ${seed}: ${(error as Error).message}\n`);
  }
}
const output =
  found === null
    ? { from, to, searched, skipped, found: null }
    : {
        from,
        to,
        searched,
        skipped,
        found: {
          ...found,
          expected: expectedPoints(found),
          engineReveal: found.reveal,
          expectedMatchesEngine: SEATS.every((seat) => {
            const row = (found!.reveal as { perPlayer: Array<{ player: PlayerId; earned: number; cumulative: number }> }).perPlayer.find((p) => p.player === seat)!;
            const e = expectedPoints(found!)[seat]!;
            return row.earned === e.earned && row.cumulative === e.cumulative;
          }),
        },
      };
void tripped;
process.stdout.write(JSON.stringify(output, null, 2) + '\n');
