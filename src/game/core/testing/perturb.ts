// Hidden-information perturbations for the view non-interference property (task 9.2, Property 23).
// Test support only: imported by tests, never by engine code. Pure and deterministic: no Math.random, clock or
// crypto; all randomness comes from fast-check (`arbHiddenPerturbation`) or from the numbers it generates.
//
// Source: .kiro/specs/qroker-playable-game/design.md, Property 23 "View non-interference": for a reachable state S, a
// viewer V and a state S' obtained from S by changing only information hidden from V, `viewFor(S, V)` deeply equals
// `viewFor(S', V)`.
//
// WHAT IS CHANGED (and what never is). `arbHiddenPerturbation(S, V)` derives S' from S by one or more of the kinds
// below. Every kind changes only fields that the view of V must not depend on:
//
//   DECK_ORDER       `deck` is permuted. Deck contents (as a multiset), the deck COUNT and the unseen pool of V are
//                    unchanged.
//   HAND_EXCHANGE    The cards of the hands of the seats other than V and the deck cards are pooled and redistributed
//                    by a permutation (hand sizes and deck size are kept). Card conservation is kept: board + hands +
//                    deck are still the 52 catalog cards. V's hand, the board, handCounts and deckCount are unchanged.
//   PENDING_GUESSES While a batch is collected (GUESS_COLLECT): the values of `pending.guesses[seat]` of every seat
//                    other than V that has submitted are replaced by other valid integers (4..52, the same keys), and
//                    the log entries of those submissions (the SUBMIT_GUESSES actions after the last PLACE) are
//                    changed the same way, so the log stays consistent with `pending`. The set of submitted seats
//                    (what `guessSubmitted` shows) and V's own submission are unchanged.
//   INTERNAL_FIELDS The `seed` and the `scoredGroups` group-id strings (replaced by other well-formed ids of the same
//                    number). Neither field is read by the view. S' is NOT claimed to be a state from which the
//                    engine would behave like S (a later move may be judged differently); only the view is compared.
//   PENDING_SECRETS While a batch is collected: the `groupId` and the `hiddenSum` of every code of `pending.codes`.
//                    The Hidden_Sum of a pending code must not reach any view (requirement 7.5). A changed hiddenSum
//                    makes S' internally inconsistent with the cards of the code (the sealed sum no longer equals the
//                    sum of the four cards); this kind exists to prove the view does not read it. It is a separate
//                    kind so that the report can show its share.
//   BOARD_SWAP       OWNER_ONLY only: the identities of two board cells that are HIDDEN from V (placed by another seat,
//                    not neutral, not part of a revealed code, not V's) are exchanged. Orientation and owner stay with
//                    the cell. The swap is kept only when the state stays internally consistent with the committed code
//                    structure, checked by an independent brute-force scan (`validRegions`): neither cell is part of any
//                    valid 2x2 region before the swap, the cards are in no pending or revealed code, and the set of
//                    valid regions (quad key -> group id) is identical after the swap. The action log is NOT rewritten
//                    (it still names the original identities); the log is not part of any view. In FACE_UP the board
//                    identities are public: this kind is never produced and a visible identity is never touched.
//
// The pairs (S, S') are VALID-CONSISTENT states (the 52-card catalog is conserved, every guess is valid, the code
// structure of the board is unchanged), NOT claimed to be reachable by play: S' need not have a legal action history.
// That does not matter for non-interference; the BASE state S is always reachable (the caller builds it from
// `newGame` and accepted `reduce` calls).
//
// Every state returned is deeply frozen, like the states of the engine. The input state is never mutated.
//
// Boundary rule 'score-table' (src/game/boundaries.test.ts): this file is scanned. No score table is written here.

import fc from "fast-check";
import type { Board, PlacedCard } from "../board";
import { ALL_CARDS } from "../cards";
import { isValidMember } from "../fragment-layout";
import { deepFreeze } from "../state";
import type { GameState, PendingBatch } from "../state";
import { SEATS } from "../turn";
import type { Action, CardId, PlayerId, QuadKey, Slot } from "../types";

export type PerturbationKind =
  | "DECK_ORDER"
  | "HAND_EXCHANGE"
  | "PENDING_GUESSES"
  | "INTERNAL_FIELDS"
  | "PENDING_SECRETS"
  | "BOARD_SWAP";

export const PERTURBATION_KINDS: readonly PerturbationKind[] = [
  "DECK_ORDER",
  "HAND_EXCHANGE",
  "PENDING_GUESSES",
  "INTERNAL_FIELDS",
  "PENDING_SECRETS",
  "BOARD_SWAP",
];

/** Numbers generated per permutation (the pool of other hands plus deck has at most 3 * 4 + 32 = 44 cards). */
const KEY_COUNT = 52;
/** Numbers generated for guess values, hidden sums and group ids. */
const VALUE_COUNT = 16;

/** The generated numbers of one perturbation. `applyPerturbation` is a pure function of (state, viewer, spec). */
export interface PerturbationSpec {
  readonly kinds: readonly PerturbationKind[];
  readonly deckKeys: readonly number[];
  readonly poolKeys: readonly number[];
  readonly valueKeys: readonly number[];
  readonly seedKey: number;
  readonly swapPick: number;
}

export interface HiddenPerturbation {
  readonly viewer: PlayerId;
  readonly before: GameState;
  readonly after: GameState;
  /** The kinds that were asked for. */
  readonly requested: readonly PerturbationKind[];
  /** The kinds that really changed something (a permutation can be the identity). */
  readonly effective: readonly PerturbationKind[];
  /** Board indexes whose identities were exchanged (BOARD_SWAP), else `null`. */
  readonly swappedCells: readonly [number, number] | null;
  /** True when some other seat holds a different SET of cards afterwards (not merely a different order). */
  readonly otherHandCardsChanged: boolean;
  readonly spec: PerturbationSpec;
}

// ---------------------------------------------------------------------------------------------------------
// Low-level helpers (also used by the negative controls of the test file)
// ---------------------------------------------------------------------------------------------------------

/** A new frozen state with `patch` applied on top of `state`. */
export function withPatch(state: GameState, patch: Partial<GameState>): GameState {
  return deepFreeze({ ...state, ...patch });
}

/** A new frozen state whose board has the card identities of `changes` (board index -> card). Owner/orientation stay. */
export function withBoardCards(state: GameState, changes: ReadonlyMap<number, CardId>): GameState {
  const board = state.board.map((cell, index): PlacedCard | null => {
    const card = changes.get(index);
    if (card === undefined) return cell;
    if (cell === null) throw new RangeError(`withBoardCards: cell ${index} is empty`);
    return { card, orientation: cell.orientation, owner: cell.owner };
  });
  return withPatch(state, { board });
}

/** A new frozen state with the hand of `seat` replaced. */
export function withHand(state: GameState, seat: PlayerId, hand: readonly CardId[]): GameState {
  return withPatch(state, { hands: { ...state.hands, [seat]: [...hand] } as Record<PlayerId, readonly CardId[]> });
}

/** A new frozen state with the deck replaced. */
export function withDeck(state: GameState, deck: readonly CardId[]): GameState {
  return withPatch(state, { deck: [...deck] });
}

/**
 * A new frozen state in which the pending submission of `seat` is `guesses` (same keys), and the log entry of that
 * submission (a SUBMIT_GUESSES of `seat` after the last PLACE) says the same.
 */
export function withSubmission(state: GameState, seat: PlayerId, guesses: Readonly<Record<QuadKey, number>>): GameState {
  const pending = state.pending;
  if (pending === null || pending.guesses[seat] === undefined) {
    throw new RangeError(`withSubmission: ${seat} has no pending submission`);
  }
  let lastPlace = -1;
  state.log.forEach((entry, i) => {
    if (entry.type === "PLACE") lastPlace = i;
  });
  const log = state.log.map((entry, i): Action =>
    i > lastPlace && entry.type === "SUBMIT_GUESSES" && entry.player === seat ? { type: "SUBMIT_GUESSES", player: seat, guesses: { ...guesses } } : entry,
  );
  const next: PendingBatch = { ...pending, guesses: { ...pending.guesses, [seat]: { ...guesses } } };
  return withPatch(state, { pending: next, log });
}

/** Cards of revealed codes (public): `revealedCards` plus the cards of every record of the history. */
export function revealedCardSet(state: GameState): ReadonlySet<CardId> {
  const cards = new Set<CardId>(state.revealedCards);
  for (const record of state.history) for (const code of record.codes) for (const card of code.cards) cards.add(card);
  return cards;
}

const SLOT_OF_INDEX: readonly Slot[] = ["TL", "TR", "BL", "BR"];
const COLUMN_LETTERS = "ABCDEFGH";

/**
 * Independent brute-force scan: every 2x2 region of `board` whose four cells are occupied by valid members of their
 * slots, as a map quad key -> group id (the four card ids, sorted, joined with '|'). Reads only the board.
 */
export function validRegions(board: Board): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  for (let row = 0; row <= 6; row++) {
    for (let col = 0; col <= 6; col++) {
      const cells = [board[row * 8 + col], board[row * 8 + col + 1], board[(row + 1) * 8 + col], board[(row + 1) * 8 + col + 1]];
      if (cells.some((cell) => cell === null || cell === undefined)) continue;
      const placed = cells as PlacedCard[];
      if (!placed.every((cell, i) => isValidMember(cell.card, cell.orientation, SLOT_OF_INDEX[i] as Slot))) continue;
      found.set(`${COLUMN_LETTERS.charAt(col)}${row + 1}`, placed.map((cell) => cell.card).sort().join("|"));
    }
  }
  return found;
}

/** Board indexes of the cells that belong to at least one valid region. */
function cellsInValidRegions(board: Board): ReadonlySet<number> {
  const inRegion = new Set<number>();
  for (const key of validRegions(board).keys()) {
    const col = COLUMN_LETTERS.indexOf(key.charAt(0));
    const row = Number(key.slice(1)) - 1;
    for (const index of [row * 8 + col, row * 8 + col + 1, (row + 1) * 8 + col, (row + 1) * 8 + col + 1]) inRegion.add(index);
  }
  return inRegion;
}

/**
 * Board indexes of the cells whose identity V does NOT see in OWNER_ONLY: placed by another seat, not neutral and not
 * a card of a revealed code. Empty in FACE_UP (every identity is public).
 */
export function hiddenBoardCells(state: GameState, viewer: PlayerId): number[] {
  if (state.config.identityVisibility !== "OWNER_ONLY") return [];
  const revealed = revealedCardSet(state);
  const out: number[] = [];
  state.board.forEach((cell, index) => {
    if (cell !== null && cell.owner !== "NEUTRAL" && cell.owner !== viewer && !revealed.has(cell.card)) out.push(index);
  });
  return out;
}

/** Hidden cells that may be swapped: not in any valid region and not a card of a pending code. */
function swappableCells(state: GameState, viewer: PlayerId): number[] {
  const inRegion = cellsInValidRegions(state.board);
  const pendingCards = new Set<CardId>(state.pending?.codes.flatMap((code) => [...code.cards]) ?? []);
  return hiddenBoardCells(state, viewer).filter((index) => !inRegion.has(index) && !pendingCards.has((state.board[index] as PlacedCard).card));
}

const sameRegions = (a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean =>
  a.size === b.size && [...a].every(([key, id]) => b.get(key) === id);

/**
 * Two hidden cells whose identities can be exchanged without changing the code structure of the board (see the file
 * comment), or `undefined`. `pickA` and `pickB` choose where the search starts; the same inputs give the same pair.
 */
export function findConsistentSwap(state: GameState, viewer: PlayerId, pickA: number, pickB: number): [number, number] | undefined {
  const cells = swappableCells(state, viewer);
  const n = cells.length;
  if (n < 2) return undefined;
  const before = validRegions(state.board);
  for (let i = 0; i < n; i++) {
    const a = cells[(Math.abs(pickA) + i) % n] as number;
    for (let j = 0; j < n; j++) {
      const b = cells[(Math.abs(pickB) + j) % n] as number;
      if (a === b) continue;
      const cellA = state.board[a] as PlacedCard;
      const cellB = state.board[b] as PlacedCard;
      const swapped = state.board.map((cell, index): PlacedCard | null =>
        index === a ? { ...cellA, card: cellB.card } : index === b ? { ...cellB, card: cellA.card } : cell,
      );
      if (sameRegions(before, validRegions(swapped))) return [a, b];
    }
  }
  return undefined;
}

/** The kinds that can change something in `state` for `viewer`. `INTERNAL_FIELDS` is always applicable. */
export function applicableKinds(state: GameState, viewer: PlayerId): PerturbationKind[] {
  const others = SEATS.filter((seat) => seat !== viewer);
  const poolSize = others.reduce((sum, seat) => sum + state.hands[seat].length, 0) + state.deck.length;
  const pending = state.phase === "GUESS_COLLECT" ? state.pending : null;
  const kinds: PerturbationKind[] = [];
  if (state.deck.length >= 2) kinds.push("DECK_ORDER");
  if (poolSize >= 2) kinds.push("HAND_EXCHANGE");
  if (pending !== null && others.some((seat) => pending.guesses[seat] !== undefined)) kinds.push("PENDING_GUESSES");
  kinds.push("INTERNAL_FIELDS");
  if (pending !== null) kinds.push("PENDING_SECRETS");
  if (findConsistentSwap(state, viewer, 0, 0) !== undefined) kinds.push("BOARD_SWAP");
  return kinds;
}

/** Indexes 0..n-1 ordered by `keys` (ties by index): a permutation that is a pure function of the numbers. */
function arrangement(keys: readonly number[], n: number): number[] {
  if (n > keys.length) throw new RangeError(`arrangement: ${n} items but only ${keys.length} keys`);
  return Array.from({ length: n }, (_, i) => i).sort((a, b) => (keys[a] as number) - (keys[b] as number) || a - b);
}

/** A value in 4..52 that differs from `old` (the shift is 1..48 modulo 49). */
const otherValue = (old: number, key: number): number => 4 + ((old - 4 + 1 + (key % 48)) % 49);

/** A well-formed group id (four distinct catalog cards, sorted, joined by '|') that differs from `old`. */
function otherGroupId(old: string, key: number): string {
  for (let attempt = 0; attempt < 4; attempt++) {
    const start = key + attempt;
    const id = [0, 1, 2, 3].map((i) => ALL_CARDS[(start + i * 13) % ALL_CARDS.length] as CardId).sort().join("|");
    if (id !== old) return id;
  }
  return `${old}~`;
}

const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Applies the requested kinds (order: BOARD_SWAP, HAND_EXCHANGE, DECK_ORDER, PENDING_GUESSES, PENDING_SECRETS,
 * INTERNAL_FIELDS) to `state` for `viewer`. A kind that is not applicable is a no-op and is not listed as effective.
 */
export function applyPerturbation(state: GameState, viewer: PlayerId, spec: PerturbationSpec): HiddenPerturbation {
  const wants = (kind: PerturbationKind): boolean => spec.kinds.includes(kind);
  const others = SEATS.filter((seat) => seat !== viewer);
  const effective: PerturbationKind[] = [];
  let current = state;
  let swappedCells: [number, number] | null = null;
  let otherHandCardsChanged = false;

  if (wants("BOARD_SWAP")) {
    const pair = findConsistentSwap(current, viewer, spec.swapPick, spec.valueKeys[0] as number);
    if (pair !== undefined) {
      const [a, b] = pair;
      const swap = new Map<number, CardId>([
        [a, (current.board[b] as PlacedCard).card],
        [b, (current.board[a] as PlacedCard).card],
      ]);
      current = withBoardCards(current, swap);
      swappedCells = pair;
      effective.push("BOARD_SWAP");
    }
  }

  if (wants("HAND_EXCHANGE")) {
    const pool = [...others.flatMap((seat) => current.hands[seat]), ...current.deck];
    if (pool.length >= 2) {
      const mixed = arrangement(spec.poolKeys, pool.length).map((i) => pool[i] as CardId);
      const hands = { ...current.hands } as Record<PlayerId, readonly CardId[]>;
      let at = 0;
      for (const seat of others) {
        const size = current.hands[seat].length;
        hands[seat] = mixed.slice(at, at + size);
        at += size;
      }
      const deck = mixed.slice(at);
      const changed = others.some((seat) => !sameList(hands[seat], current.hands[seat])) || !sameList(deck, current.deck);
      if (changed) {
        otherHandCardsChanged = others.some((seat) => !sameList([...hands[seat]].sort(), [...current.hands[seat]].sort()));
        current = withPatch(current, { hands, deck });
        effective.push("HAND_EXCHANGE");
      }
    }
  }

  if (wants("DECK_ORDER") && current.deck.length >= 2) {
    const deck = arrangement(spec.deckKeys, current.deck.length).map((i) => current.deck[i] as CardId);
    if (!sameList(deck, current.deck)) {
      current = withDeck(current, deck);
      effective.push("DECK_ORDER");
    }
  }

  if (wants("PENDING_GUESSES") && current.phase === "GUESS_COLLECT" && current.pending !== null) {
    let changedAny = false;
    others.forEach((seat, seatIndex) => {
      const old = (current.pending as PendingBatch).guesses[seat];
      if (old === undefined) return;
      const next: Record<QuadKey, number> = {};
      Object.keys(old).forEach((key, codeIndex) => {
        next[key] = otherValue(old[key] as number, spec.valueKeys[(seatIndex * 4 + codeIndex) % VALUE_COUNT] as number);
      });
      current = withSubmission(current, seat, next);
      changedAny = true;
    });
    if (changedAny) effective.push("PENDING_GUESSES");
  }

  if (wants("PENDING_SECRETS") && current.phase === "GUESS_COLLECT" && current.pending !== null) {
    const pending = current.pending;
    const codes = pending.codes.map((code, i) => ({
      ...code,
      groupId: otherGroupId(code.groupId, spec.valueKeys[(i + 5) % VALUE_COUNT] as number),
      hiddenSum: otherValue(code.hiddenSum, spec.valueKeys[(i + 9) % VALUE_COUNT] as number),
    }));
    current = withPatch(current, { pending: { ...pending, codes } });
    effective.push("PENDING_SECRETS");
  }

  if (wants("INTERNAL_FIELDS")) {
    const seed = (current.seed + 1 + (spec.seedKey % 0xfffffffe)) % 0x100000000;
    const scoredGroups = current.scoredGroups
      .map((id, i) => otherGroupId(id, spec.valueKeys[(i + 3) % VALUE_COUNT] as number))
      .sort();
    current = withPatch(current, { seed, scoredGroups });
    effective.push("INTERNAL_FIELDS");
  }

  return withPrinter({
    viewer,
    before: state,
    after: current,
    requested: spec.kinds,
    effective,
    swappedCells,
    otherHandCardsChanged,
    spec,
  });
}

/** fast-check prints a failing value with `fc.stringify`; the states are replaced by a summary (the base state is reproducible from the Reachable). */
function withPrinter(p: HiddenPerturbation): HiddenPerturbation {
  Object.defineProperty(p, fc.toStringMethod, {
    value: (): string =>
      `HiddenPerturbation{ viewer=${p.viewer} requested=[${p.requested.join(",")}] effective=[${p.effective.join(",")}] swappedCells=${JSON.stringify(p.swappedCells)} spec=${JSON.stringify(p.spec)} }`,
    enumerable: false,
  });
  return p;
}

const arbNumbers = (length: number): fc.Arbitrary<number[]> =>
  fc.array(fc.nat({ max: 1_000_000 }), { minLength: length, maxLength: length });

/**
 * Perturbations of `state` that change only what `viewer` cannot see (see the file comment): a non-empty subset of the
 * kinds applicable to this state and viewer, with generated permutation keys, guess values and a swap choice.
 */
export function arbHiddenPerturbation(state: GameState, viewer: PlayerId): fc.Arbitrary<HiddenPerturbation> {
  const applicable = applicableKinds(state, viewer);
  return fc
    .record({
      kinds: fc.subarray(applicable, { minLength: 1 }),
      deckKeys: arbNumbers(KEY_COUNT),
      poolKeys: arbNumbers(KEY_COUNT),
      valueKeys: arbNumbers(VALUE_COUNT),
      seedKey: fc.nat({ max: 0xfffffffd }),
      swapPick: fc.nat({ max: 1_000_000 }),
    })
    .map((spec) => applyPerturbation(state, viewer, spec));
}
