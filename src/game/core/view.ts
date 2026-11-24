/**
 * ViewProjector of the QRoker game engine (task 9.1).
 *
 * Source: .kiro/specs/qroker-playable-game/design.md, "ViewProjector and PlayerView (`core/view.ts`)", the
 * visibility table for `CellView.card`, and decisions D1, D7 and D10.
 * Requirements: 5.8 (public structures identify a code by its Quad_Key, never by the Group_Id), 7.5 (no
 * Hidden_Sum of a pending code and no Guess of another Seat in any view), 7.8 (no Guess value after the game
 * has ended), 10.1 to 10.5 (consumers read a `PlayerView` only; what it contains and what it must not).
 * Property 22 (no leakage) and Property 23 (non-interference) are tested in task 9.2.
 *
 * `PlayerView` is the ONLY projection of the sealed `GameState` that the AI and the UI may read. It is plain,
 * JSON-serializable data, built by copying: it shares no object or array with the state, and it is deeply
 * frozen (`deepFreeze`), so a consumer can neither change it nor reach the state through it.
 *
 * Identity_Visibility (OQ-1 is NOT decided; both rules are implemented, `OWNER_ONLY` stays the default of
 * `defaultConfig`; this module only reads `state.config.identityVisibility`):
 * - `OWNER_ONLY`: `CellView.card` is non-null for a Neutral_Card, for a card placed by the viewer, and for a
 *   card of a Composite_Code that was already revealed (`state.revealedCards` and the cards of the reveal
 *   history, which are public anyway). Every other occupied cell has `card: null`. Occupancy, owner and
 *   orientation of every occupied cell stay visible.
 * - `FACE_UP` (legacy saves): every occupied cell is visible.
 * - Both blind settings hide all board identities and redact cards from reveal history.
 *   BLIND_SCORE_ONLY also redacts each revealed sum. The viewer still sees their hand.
 * In both modes the view never contains: the seed, the deck contents or order, the Hand of another Seat, a Guess of
 * another Seat, the Hidden_Sum or any other sealed field of a pending batch, the `groupId` of any code, the
 * `scoredGroups` record, the action log, or the raw `PendingBatch`.
 *
 * Decisions where the design leaves room (reported with the task):
 * - `myGuesses` is the viewer's OWN submission of the batch that is currently collected (requirement 10.2 and the
 *   design field `myGuesses`). It is `null` before the viewer submitted and in every phase other than
 *   `GUESS_COLLECT`: the reducer clears the guesses at the reveal, and no Guess value is ever shown after that,
 *   including after the game has ended (requirement 7.8, OQ-14).
 * - `guessSubmitted` has an entry for each Seat P0..P3. Outside `GUESS_COLLECT` there is no collected batch, so all
 *   four entries are `false`.
 * - `pendingQuadKeys` lists the Quad_Keys of the batch in `GUESS_COLLECT` (code-unit order, as the detector orders
 *   them) and is empty in every other phase. A Quad_Key is the notation of a 2x2 region; it holds no card identity.
 * - `rules` is `PublicRules` as the design defines it: rules version, the four seats, the named score
 *   configuration (it carries the `provisional` flag and, as the design lists, the injected `ScoreConfig`) and the
 *   Identity_Visibility. No score value is written in this module; the configuration is only copied.
 * - `lastReveal` and `history` use the design's `RevealRecord` (public once created, no Guess value). They are
 *   copies, so a consumer holds no reference to the state's records. `cumulative` is the score after the batch's
 *   prediction points and before the hand-empty bonus, as the reducer defines it; the bonus is visible in `scores`.
 * - `ranking` is `rankPlayers(scores)` (competition ranking, equal scores share a rank) when the phase is `ENDED`,
 *   else `null`.
 * - `viewFor` throws a `RangeError` for a viewer that is not one of P0..P3, as `turn.nextSeat` does for an
 *   invalid seat: the design gives `viewFor` no error result, and the closed `ErrorCode` set has no code for it.
 *   The reducer reports `UNKNOWN_PLAYER` for an unknown seat in an Action; a view request is not an Action.
 *
 * Ordering: `board` is row-major (index = row * 8 + col, 64 entries, `null` = empty); `myHand` is in the canonical
 * `ALL_CARDS` order whatever the deal order was; every per-seat record has the keys in the order P0, P1, P2, P3.
 *
 * Pure and deterministic: no DOM, no node, no randomness, no clock, no import from `src/optical`. The AI imports
 * only types, `unseenCards` and `legalCellsFor` from this module, and the types it needs from the state module are
 * re-exported here (`GamePhase`, `RevealRecord`, `RankEntry`), so an AI module never imports `core/state`.
 */

import { isBlindMode } from './types';
import { ALL_CARDS } from './cards';
import { BOARD_SIZE, orthogonalNeighbors } from './geometry';
import { rankPlayers } from './ranking';
import type { RankEntry } from './ranking';
import { deepFreeze } from './state';
import type { GamePhase, GameState, RevealRecord } from './state';
import { SEATS, isPlayerId } from './turn';
import type {
  CardId,
  GameConfig,
  GridPosition,
  IdentityVisibility,
  NamedScoreConfig,
  Orientation,
  Owner,
  PlayerId,
  QuadKey,
  SeatConfig,
} from './types';

export type { GamePhase, RankEntry, RevealRecord };

/** One occupied board cell as a viewer sees it. `card: null` means the identity is hidden from this viewer. */
export interface CellView {
  readonly owner: Owner;
  readonly orientation: Orientation;
  readonly card: CardId | null;
}

/** The game rules that are public to every Seat. */
export interface PublicRules {
  readonly rulesVersion: number;
  readonly seats: GameConfig['seats'];
  readonly scoreConfig: NamedScoreConfig;
  readonly identityVisibility: IdentityVisibility;
}

/** Everything one Seat may know. See the module comment for what is and is not included. */
export interface PlayerView {
  readonly viewer: PlayerId;
  readonly rules: PublicRules;
  readonly phase: GamePhase;
  readonly turn: PlayerId;
  /** 64 entries, row-major (`index = row * 8 + col`); `null` is an empty cell. */
  readonly board: readonly (CellView | null)[];
  /** The viewer's own Hand in canonical (`ALL_CARDS`) order. */
  readonly myHand: readonly CardId[];
  readonly handCounts: Readonly<Record<PlayerId, number>>;
  readonly deckCount: number;
  readonly scores: Readonly<Record<PlayerId, number>>;
  /** Quad_Keys of the codes awaiting Guesses (only in `GUESS_COLLECT`). Positions only. */
  readonly pendingQuadKeys: readonly QuadKey[];
  /** Whether each Seat has submitted its Guesses for the batch being collected. */
  readonly guessSubmitted: Readonly<Record<PlayerId, boolean>>;
  /** The viewer's own submission for the batch being collected, else `null`. Never another Seat's. */
  readonly myGuesses: Readonly<Record<QuadKey, number>> | null;
  readonly lastReveal: RevealRecord<number | null> | null;
  readonly history: readonly RevealRecord<number | null>[];
  /** Final ranking when the phase is `ENDED`, else `null`. */
  readonly ranking: readonly RankEntry[] | null;
}

const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;

const CANONICAL_INDEX: ReadonlyMap<CardId, number> = new Map(ALL_CARDS.map((card, index) => [card, index] as const));

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function describeViewer(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : `${typeof value} ${String(value)}`;
}

function perSeat<T>(read: (seat: PlayerId) => T): Record<PlayerId, T> {
  const record = {} as Record<PlayerId, T>;
  for (const seat of SEATS) record[seat] = read(seat);
  return record;
}

function copyRules(config: GameConfig): PublicRules {
  const seats = config.seats.map(
    (seat: SeatConfig): SeatConfig =>
      seat.difficulty === undefined
        ? { id: seat.id, kind: seat.kind, name: seat.name }
        : { id: seat.id, kind: seat.kind, difficulty: seat.difficulty, name: seat.name },
  ) as unknown as GameConfig['seats'];
  const named = config.scoreConfig;
  const table = [...named.config.rewardByError];
  return {
    rulesVersion: config.rulesVersion,
    seats,
    scoreConfig: {
      id: named.id,
      provisional: named.provisional,
      config: { rewardByError: table, handEmptyBonus: named.config.handEmptyBonus },
    },
    identityVisibility: config.identityVisibility,
  };
}

function copyReveal(record: RevealRecord, mode: IdentityVisibility): RevealRecord<number | null> {
  return {
    batchIndex: record.batchIndex,
    placer: record.placer,
    codes: record.codes.map((code) => ({
      quadKey: code.quadKey,
      cards: isBlindMode(mode) ? [] : [...code.cards],
      hiddenSum: mode === 'BLIND_SCORE_ONLY' ? null : code.hiddenSum,
    })),
    perPlayer: record.perPlayer.map((entry) => ({
      player: entry.player,
      earned: entry.earned,
      cumulative: entry.cumulative,
    })),
  };
}

/** Cards of revealed codes: `revealedCards` plus the cards of the (public) reveal history. */
function revealedSet(state: GameState): ReadonlySet<CardId> {
  const cards = new Set<CardId>(state.revealedCards);
  for (const record of state.history) for (const code of record.codes) for (const card of code.cards) cards.add(card);
  return cards;
}

/**
 * The view of `state` for `viewer`. Pure; `state` is not changed and nothing of it is shared with the result.
 *
 * @throws RangeError if `viewer` is not one of 'P0', 'P1', 'P2', 'P3'.
 */
export function viewFor(state: GameState, viewer: PlayerId): PlayerView {
  if (!isPlayerId(viewer)) {
    throw new RangeError(`viewFor: not a seat id: ${describeViewer(viewer)}`);
  }
  const visibility = state.config.identityVisibility;
  const revealed = revealedSet(state);
  const showCard = (owner: Owner, card: CardId): boolean =>
    !isBlindMode(visibility) && (visibility === 'FACE_UP' || owner === 'NEUTRAL' || owner === viewer || revealed.has(card));

  const board: (CellView | null)[] = new Array<CellView | null>(CELL_COUNT).fill(null);
  for (let index = 0; index < CELL_COUNT; index++) {
    const cell = state.board[index];
    if (cell === null || cell === undefined) continue;
    board[index] = {
      owner: cell.owner,
      orientation: cell.orientation,
      card: showCard(cell.owner, cell.card) ? cell.card : null,
    };
  }

  const myHand = [...state.hands[viewer]].sort(
    (a, b) => (CANONICAL_INDEX.get(a) as number) - (CANONICAL_INDEX.get(b) as number),
  );

  const pending = state.phase === 'GUESS_COLLECT' ? state.pending : null;
  const pendingQuadKeys = pending === null ? [] : pending.codes.map((code) => code.quadKey).sort(compareText);
  const guessSubmitted = perSeat((seat) => pending !== null && pending.guesses[seat] !== undefined);
  const own = pending?.guesses[viewer];
  const myGuesses: Record<QuadKey, number> | null =
    own === undefined ? null : Object.fromEntries(pendingQuadKeys.map((key) => [key, own[key] as number]));

  const view: PlayerView = {
    viewer,
    rules: copyRules(state.config),
    phase: state.phase,
    turn: state.turn,
    board,
    myHand,
    handCounts: perSeat((seat) => state.hands[seat].length),
    deckCount: state.deck.length,
    scores: perSeat((seat) => state.scores[seat]),
    pendingQuadKeys,
    guessSubmitted,
    myGuesses,
    lastReveal: state.lastReveal === null ? null : copyReveal(state.lastReveal, visibility),
    history: state.history.map(record => copyReveal(record, visibility)),
    ranking:
      state.phase === 'ENDED'
        ? rankPlayers(state.scores).map((entry) => ({ player: entry.player, score: entry.score, rank: entry.rank }))
        : null,
  };
  return deepFreeze(view);
}

/**
 * The cards that may still be anywhere unseen, from the view alone: the 52-card catalog (canonical order) minus
 * the viewer's own Hand minus every card identity that is visible on the board in this view.
 *
 * An occupied cell with a hidden identity (`card: null`) removes nothing: that card stays in the pool, with the
 * cards of other Seats' Hands and of the deck. Hence `|unseen| = 52 - |myHand| - |visible board identities|`, and
 * when no board cell is hidden (`FACE_UP`, or `OWNER_ONLY` before any hidden card is placed) the unseen cards are
 * exactly the other Seats' Hands plus the deck. No duplicates; deterministic.
 */
export function unseenCards(view: PlayerView): CardId[] {
  const known = new Set<CardId>(view.myHand);
  for (const cell of view.board) {
    if (cell !== null && cell.card !== null) known.add(cell.card);
  }
  return ALL_CARDS.filter((card) => !known.has(card));
}

/**
 * The cells where the viewer may place a card now, row-major: the empty cells with an orthogonally adjacent
 * occupied cell, when the phase is `PLACEMENT` and it is the viewer's turn; otherwise an empty list. Only the
 * occupancy of the view's board is read (hidden identities are not needed). Equals `board.legalCells` of the
 * state's board for the acting Seat. Returns a new array of new positions on every call.
 */
export function legalCellsFor(view: PlayerView): GridPosition[] {
  if (view.phase !== 'PLACEMENT' || view.turn !== view.viewer) return [];
  const cells: GridPosition[] = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (view.board[row * BOARD_SIZE + col] != null) continue;
      const p = { row, col };
      if (orthogonalNeighbors(p).some((q) => view.board[q.row * BOARD_SIZE + q.col] != null)) cells.push(p);
    }
  }
  return cells;
}
