// Test support for the reducer scenarios (task 8.2). Imported by tests only, never by engine code.
//
// `makeState` builds a real `GameState` (the shape of `newGame`) from hand-picked pieces: board cells, hands,
// deck, phase, turn, `firstPlacementDone`, `scoredGroups`, scores and so on. Every value is frozen with
// `deepFreeze`, like the states the engine returns. Pieces that are not given keep the `newGame` value, except
// the three card zones, which are completed so that the 52 catalog cards are always accounted for exactly once:
//   - board: the four neutral cards `FIXTURE_NEUTRAL` on D4, E4, D5, E5 plus the given `cells`;
//   - hands: a seat without a given hand receives 4 cards taken in catalog order from the unused cards;
//   - deck: when not given, all cards that remain (top = last element).
// A fixture whose card zones do not hold the 52 catalog cards exactly once is a test bug and throws.

import { ALL_CARDS } from "../cards";
import { initialBoard } from "../board";
import type { Board, PlacedCard } from "../board";
import { fromNotation } from "../geometry";
import { SEATS } from "../turn";
import { defaultConfig, deepFreeze, newGame } from "../state";
import type { GamePhase, GameState, PendingBatch, RevealRecord } from "../state";
import type { Action, CardId, GameConfig, Orientation, Owner, PlayerId } from "../types";

/** The neutral cards of a fixture board, in the order D4, E4, D5, E5. */
export const FIXTURE_NEUTRAL: readonly [CardId, CardId, CardId, CardId] = ["H-K", "D-K", "C-K", "S-K"];

/** One extra card of a fixture board: `at` is a cell notation such as `'F4'`. */
export interface BoardCell {
  readonly at: string;
  readonly card: CardId;
  readonly orientation?: Orientation;
  readonly owner?: Owner;
}

/** A fixture board: the neutral group plus `cells`, without any adjacency check (a fixture is hand-picked). */
export function boardOf(cells: readonly BoardCell[], neutral = FIXTURE_NEUTRAL): Board {
  const slots: (PlacedCard | null)[] = [...initialBoard(neutral)];
  for (const cell of cells) {
    const pos = fromNotation(cell.at);
    if (!pos.ok) throw new Error(`fixture: bad cell notation ${cell.at}`);
    const index = pos.value.row * 8 + pos.value.col;
    if (slots[index] !== null) throw new Error(`fixture: cell ${cell.at} is already occupied`);
    slots[index] = { card: cell.card, orientation: cell.orientation ?? 0, owner: cell.owner ?? "P0" };
  }
  return slots;
}

export interface StateParts {
  readonly seed?: number;
  readonly config?: GameConfig;
  /** Cards added to the neutral group (ignored when `board` is given). */
  readonly cells?: readonly BoardCell[];
  /** A complete board; takes precedence over `cells`. */
  readonly board?: Board;
  readonly hands?: Partial<Record<PlayerId, readonly CardId[]>>;
  readonly deck?: readonly CardId[];
  readonly phase?: GamePhase;
  readonly turn?: PlayerId;
  readonly firstPlacementDone?: readonly PlayerId[];
  readonly scoredGroups?: readonly string[];
  readonly scores?: Partial<Record<PlayerId, number>>;
  readonly pending?: PendingBatch | null;
  readonly placements?: number;
  readonly history?: readonly RevealRecord[];
  readonly lastReveal?: RevealRecord | null;
  readonly revealedCards?: readonly CardId[];
  readonly bonusAwarded?: PlayerId | null;
  readonly log?: readonly Action[];
}

/** All cards held by the three zones of a state (board, hands, deck), in no particular order. */
export function cardsOfState(state: GameState): CardId[] {
  const onBoard = state.board.flatMap((cell) => (cell === null ? [] : [cell.card]));
  return [...onBoard, ...SEATS.flatMap((seat) => state.hands[seat]), ...state.deck];
}

/** Returns a description of the first conservation problem of the state, or `null` when it holds. */
export function conservationProblem(state: GameState): string | null {
  const cards = cardsOfState(state);
  if (cards.length !== ALL_CARDS.length) return `${cards.length} cards instead of ${ALL_CARDS.length}`;
  const unique = new Set(cards);
  if (unique.size !== cards.length) return "duplicate card";
  for (const card of ALL_CARDS) if (!unique.has(card)) return `missing card ${card}`;
  return null;
}

/** Builds a frozen state from hand-picked pieces (see the file comment). */
export function makeState(parts: StateParts = {}): GameState {
  const created = newGame({ seed: parts.seed ?? 1, config: parts.config ?? defaultConfig() });
  if (!created.ok) throw new Error(`fixture: newGame failed with ${created.error.code}`);
  const base = created.value;

  const board = parts.board ?? boardOf(parts.cells ?? []);
  const used = new Set<CardId>(board.flatMap((cell) => (cell === null ? [] : [cell.card])));
  for (const seat of SEATS) for (const card of parts.hands?.[seat] ?? []) used.add(card);
  for (const card of parts.deck ?? []) used.add(card);
  const pool = ALL_CARDS.filter((card) => !used.has(card));

  const hands = {} as Record<PlayerId, readonly CardId[]>;
  for (const seat of SEATS) {
    const given = parts.hands?.[seat];
    if (given !== undefined) hands[seat] = [...given];
    else hands[seat] = pool.splice(0, 4);
  }
  const deck = parts.deck !== undefined ? [...parts.deck] : pool.splice(0, pool.length);

  const scores = { ...base.scores, ...parts.scores } as Record<PlayerId, number>;
  const cardCountOnBoard = board.filter((cell) => cell !== null).length;
  const state: GameState = {
    ...base,
    seed: parts.seed ?? base.seed,
    phase: parts.phase ?? "PLACEMENT",
    board,
    deck,
    hands,
    turn: parts.turn ?? "P0",
    firstPlacementDone: parts.firstPlacementDone ?? [],
    scoredGroups: parts.scoredGroups ?? base.scoredGroups,
    revealedCards: parts.revealedCards ?? [],
    pending: parts.pending ?? null,
    scores,
    placements: parts.placements ?? cardCountOnBoard - FIXTURE_NEUTRAL.length,
    history: parts.history ?? [],
    lastReveal: parts.lastReveal ?? null,
    bonusAwarded: parts.bonusAwarded ?? null,
    log: parts.log ?? [],
  };
  const problem = conservationProblem(state);
  if (problem !== null) throw new Error(`fixture: card zones are inconsistent: ${problem}`);
  return deepFreeze(structuredClone(state));
}
