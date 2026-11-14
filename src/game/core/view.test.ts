// Unit tests of the ViewProjector (task 9.1): both Identity_Visibility rules, the viewer's own hand, hidden
// information, pending batches, reveal history, ranking, `unseenCards`, `legalCellsFor`, immutability and
// non-aliasing. The property tests of leakage and non-interference (Properties 22 and 23) are task 9.2.
//
// States are real: `newGame` followed by `reduce` (through the generators' legal-play driver and explicit
// submissions), or hand-picked fixtures from `testing/state-fixtures.ts` for the visibility tables.

import { describe, expect, it } from "vitest";
import { legalCells } from "./board";
import { ALL_CARDS, hiddenSum } from "./cards";
import { reduce } from "./engine";
import { fromNotation, quadCells } from "./geometry";
import { rankPlayers } from "./ranking";
import { score } from "./score";
import { defaultConfig, newGame } from "./state";
import type { GameState } from "./state";
import { advanceUntil, playToEnd, replayActions } from "./testing/state-generators";
import type { PlayStyle } from "./testing/state-generators";
import { boardOf, makeState } from "./testing/state-fixtures";
import { SEATS } from "./turn";
import type { Action, CardId, GameConfig, IdentityVisibility, PlayerId } from "./types";
import { legalCellsFor, unseenCards, viewFor } from "./view";
import type { PlayerView } from "./view";

// ---------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------

const MODES: readonly IdentityVisibility[] = ["OWNER_ONLY", "FACE_UP"];
const CHOICES = [7, 13, 3, 99, 5, 1, 42, 8, 21, 64, 2, 17];
const CODE_STYLE: PlayStyle = { codeBias: 100, submitOrder: "SEAT_ORDER" };
const CANONICAL = (cards: readonly CardId[]): CardId[] => ALL_CARDS.filter((c) => cards.includes(c));

function configFor(visibility: IdentityVisibility): GameConfig {
  return { ...defaultConfig(), identityVisibility: visibility };
}

function start(seed: number, visibility: IdentityVisibility): GameState {
  const created = newGame({ seed, config: configFor(visibility) });
  if (!created.ok) throw new Error(`newGame failed: ${created.error.code}`);
  return created.value;
}

function apply(state: GameState, action: Action): GameState {
  const result = reduce(state, action);
  if (!result.ok) throw new Error(`reduce rejected ${JSON.stringify(action)}: ${result.error.code}`);
  return result.value;
}

/** A game in `GUESS_COLLECT` with no submission yet (first seed, from 1 on, that forms a code), for `visibility`. */
function batchState(visibility: IdentityVisibility): GameState {
  for (let seed = 1; seed <= 60; seed++) {
    const run = advanceUntil(start(seed, visibility), (s) => s.phase === "GUESS_COLLECT", CHOICES, CODE_STYLE);
    if (run.state.phase === "GUESS_COLLECT") return run.state;
  }
  throw new Error("no seed in 1..60 reached GUESS_COLLECT");
}

/** Guess values are unique per seat and code: seat s, code i -> 14 + 10 s + i (all within 4..52). */
function guessValue(seat: PlayerId, index: number): number {
  return 14 + 10 * SEATS.indexOf(seat) + index;
}

function guessesOf(state: GameState, seat: PlayerId): Record<string, number> {
  const out: Record<string, number> = {};
  (state.pending?.codes ?? []).forEach((code, i) => {
    out[code.quadKey] = guessValue(seat, i);
  });
  return out;
}

function submit(state: GameState, seat: PlayerId): GameState {
  return apply(state, { type: "SUBMIT_GUESSES", player: seat, guesses: guessesOf(state, seat) });
}

/** Every object and array reachable from `root`. */
function objectsOf(root: unknown, into: Set<object> = new Set()): Set<object> {
  if (typeof root === "object" && root !== null && !into.has(root)) {
    into.add(root);
    for (const child of Object.values(root)) objectsOf(child, into);
  }
  return into;
}

function keysOf(root: unknown, into: Set<string> = new Set()): Set<string> {
  if (typeof root === "object" && root !== null) {
    if (!Array.isArray(root)) for (const key of Object.keys(root)) into.add(key);
    for (const child of Object.values(root)) keysOf(child, into);
  }
  return into;
}

function isDeepFrozen(root: unknown): boolean {
  return [...objectsOf(root)].every((o) => Object.isFrozen(o));
}

function revealedCardsOf(state: GameState): Set<CardId> {
  const cards = new Set<CardId>(state.revealedCards);
  for (const record of state.history) for (const code of record.codes) for (const card of code.cards) cards.add(card);
  return cards;
}

/** The identity rule of the design table, written independently of the implementation. */
function expectedCard(state: GameState, viewer: PlayerId, index: number): CardId | null {
  const cell = state.board[index];
  if (cell === null || cell === undefined) throw new Error("empty cell has no expected card");
  if (state.config.identityVisibility === "FACE_UP") return cell.card;
  if (cell.owner === "NEUTRAL" || cell.owner === viewer || revealedCardsOf(state).has(cell.card)) return cell.card;
  return null;
}

function visibleBoardCards(view: PlayerView): CardId[] {
  return view.board.flatMap((cell) => (cell === null || cell.card === null ? [] : [cell.card]));
}

/** Legal cells by an independent scan (inline neighbour offsets, no helper of the engine). */
function independentLegalCells(state: GameState, viewer: PlayerId): { row: number; col: number }[] {
  if (state.phase !== "PLACEMENT" || state.turn !== viewer) return [];
  const out: { row: number; col: number }[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (state.board[row * 8 + col] !== null) continue;
      const adjacent = [
        [row - 1, col],
        [row + 1, col],
        [row, col - 1],
        [row, col + 1],
      ].some(([r, c]) => (r as number) >= 0 && (r as number) < 8 && (c as number) >= 0 && (c as number) < 8 && state.board[(r as number) * 8 + (c as number)] !== null);
      if (adjacent) out.push({ row, col });
    }
  }
  return out;
}

/** Checks every state-independent rule of a projection against the state it came from. */
function expectProjection(state: GameState, viewer: PlayerId): PlayerView {
  const view = viewFor(state, viewer);
  const label = `${state.phase}/${state.config.identityVisibility}/${viewer}`;

  expect(view.viewer, label).toBe(viewer);
  expect(view.phase, label).toBe(state.phase);
  expect(view.turn, label).toBe(state.turn);
  expect(view.board, label).toHaveLength(64);
  state.board.forEach((cell, index) => {
    const seen = view.board[index];
    if (cell === null) {
      expect(seen, `${label} cell ${index}`).toBeNull();
    } else {
      expect(seen, `${label} cell ${index}`).toEqual({
        owner: cell.owner,
        orientation: cell.orientation,
        card: expectedCard(state, viewer, index),
      });
    }
  });
  expect(view.myHand, label).toEqual(CANONICAL(state.hands[viewer]));
  expect(view.handCounts, label).toEqual({
    P0: state.hands.P0.length,
    P1: state.hands.P1.length,
    P2: state.hands.P2.length,
    P3: state.hands.P3.length,
  });
  expect(view.deckCount, label).toBe(state.deck.length);
  expect(view.scores, label).toEqual(state.scores);
  expect(view.ranking !== null, label).toBe(state.phase === "ENDED");
  expect(legalCellsFor(view), label).toEqual(independentLegalCells(state, viewer));
  if (state.phase === "PLACEMENT" && state.turn === viewer) expect(legalCellsFor(view), label).toEqual(legalCells(state.board));

  // unseenCards: |unseen| = 52 - |own hand| - |visible board identities|, canonical order, no duplicates.
  const unseen = unseenCards(view);
  const visible = visibleBoardCards(view);
  expect(unseen.length, label).toBe(52 - view.myHand.length - visible.length);
  expect(unseen, label).toEqual(CANONICAL(unseen));
  expect(new Set(unseen).size, label).toBe(unseen.length);
  const known = new Set<CardId>([...view.myHand, ...visible]);
  expect(unseen, label).toEqual(ALL_CARDS.filter((c) => !known.has(c)));
  // The pool holds every card that is not known to the viewer: hidden board cards, other hands and the deck.
  const hiddenOnBoard = state.board.flatMap((cell, i) => (cell !== null && view.board[i]?.card === null ? [cell.card] : []));
  const others = SEATS.filter((s) => s !== viewer).flatMap((s) => state.hands[s]);
  expect(CANONICAL([...hiddenOnBoard, ...others, ...state.deck]), label).toEqual(unseen);
  if (hiddenOnBoard.length === 0) {
    // Nothing hidden on the board: own hand + visible board identities + unseen = the 52 catalog exactly.
    expect(CANONICAL([...view.myHand, ...visible, ...unseen]), label).toEqual([...ALL_CARDS]);
  }

  // The JSON of the view holds a card identity only where the viewer may see it.
  const text = JSON.stringify(view);
  const allowed = new Set<CardId>([...view.myHand, ...visible]);
  for (const record of view.history) for (const code of record.codes) for (const card of code.cards) allowed.add(card);
  for (const card of ALL_CARDS) expect(text.includes(`"${card}"`), `${label} ${card}`).toBe(allowed.has(card));

  // Shape, sealed fields, immutability and plain data.
  expect(Object.keys(view).sort(), label).toEqual(
    [
      "viewer", "rules", "phase", "turn", "board", "myHand", "handCounts", "deckCount", "scores",
      "pendingQuadKeys", "guessSubmitted", "myGuesses", "lastReveal", "history", "ranking",
    ].sort(),
  );
  const keys = keysOf(view);
  for (const banned of ["seed", "deck", "hands", "log", "scoredGroups", "pending", "guesses", "groupId", "revealedCards", "firstPlacementDone", "endsGame", "placements", "bonusAwarded"]) {
    expect(keys.has(banned), `${label} key ${banned}`).toBe(false);
  }
  for (const group of state.scoredGroups) expect(text.includes(group), label).toBe(false);
  for (const code of state.pending?.codes ?? []) expect(text.includes(code.groupId), label).toBe(false);
  expect(isDeepFrozen(view), label).toBe(true);
  expect(JSON.parse(text), label).toStrictEqual(view);

  // No object of the view is an object of the state.
  const stateObjects = objectsOf(state);
  for (const obj of objectsOf(view)) expect(stateObjects.has(obj), `${label} aliasing`).toBe(false);
  return view;
}

// ---------------------------------------------------------------------------------------------------------
// New game
// ---------------------------------------------------------------------------------------------------------

describe("viewFor of a new game", () => {
  it("shows the neutral group, the own hand, counts, an empty history and no ranking (default OWNER_ONLY)", () => {
    const created = newGame({ seed: 1, config: defaultConfig() });
    if (!created.ok) throw new Error("newGame failed");
    const state = created.value;
    for (const viewer of SEATS) {
      const view = expectProjection(state, viewer);
      expect(view.rules.identityVisibility).toBe("OWNER_ONLY");
      expect(view.phase).toBe("PLACEMENT");
      expect(view.turn).toBe("P0");
      expect(view.board.filter((c) => c !== null)).toHaveLength(4);
      expect(visibleBoardCards(view)).toHaveLength(4);
      expect(view.myHand).toHaveLength(4);
      expect(view.handCounts).toEqual({ P0: 4, P1: 4, P2: 4, P3: 4 });
      expect(view.deckCount).toBe(32);
      expect(view.scores).toEqual({ P0: 0, P1: 0, P2: 0, P3: 0 });
      expect(view.pendingQuadKeys).toEqual([]);
      expect(view.guessSubmitted).toEqual({ P0: false, P1: false, P2: false, P3: false });
      expect(view.myGuesses).toBeNull();
      expect(view.lastReveal).toBeNull();
      expect(view.history).toEqual([]);
      expect(view.ranking).toBeNull();
      expect(unseenCards(view)).toHaveLength(52 - 4 - 4);
    }
  });

  it("copies the public rules: version, seats, score configuration with its provisional flag, visibility", () => {
    const state = start(3, "FACE_UP");
    const view = viewFor(state, "P2");
    expect(Object.keys(view.rules).sort()).toEqual(["identityVisibility", "rulesVersion", "scoreConfig", "seats"]);
    expect(view.rules).toEqual(state.config);
    expect(view.rules.scoreConfig.provisional).toBe(true);
    expect(view.rules.identityVisibility).toBe("FACE_UP");
    expect(view.rules.seats).not.toBe(state.config.seats);
    expect(view.rules.scoreConfig.config.rewardByError).not.toBe(state.config.scoreConfig.config.rewardByError);
  });

  it("lists the legal cells (the 8 neighbours of the start group) for the acting seat only", () => {
    const state = start(1, "OWNER_ONLY");
    expect(legalCellsFor(viewFor(state, "P0"))).toHaveLength(8);
    for (const viewer of ["P1", "P2", "P3"] as const) expect(legalCellsFor(viewFor(state, viewer))).toEqual([]);
  });

  it("rejects a viewer that is not one of P0..P3 with a RangeError", () => {
    const state = start(1, "OWNER_ONLY");
    for (const bad of ["P4", "p0", "", "toString", "NEUTRAL", undefined, null, 0]) {
      expect(() => viewFor(state, bad as unknown as PlayerId), String(bad)).toThrow(RangeError);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
// Visibility tables
// ---------------------------------------------------------------------------------------------------------

describe("Identity_Visibility on a fixed board", () => {
  // F4 by P1, C4 by P2 (its card is in revealedCards), D6 by P0, E6 by P3, with two orientations.
  const cells = [
    { at: "F4", card: "D-3", owner: "P1", orientation: 180 },
    { at: "C4", card: "S-9", owner: "P2", orientation: 0 },
    { at: "D6", card: "C-7", owner: "P0", orientation: 180 },
    { at: "E6", card: "H-2", owner: "P3", orientation: 0 },
  ] as const;
  const build = (visibility: IdentityVisibility, revealedCards: readonly CardId[] = ["S-9"]): GameState =>
    makeState({ config: configFor(visibility), board: boardOf(cells), revealedCards });

  const at = (view: PlayerView, notation: string) => {
    const pos = fromNotation(notation);
    if (!pos.ok) throw new Error(notation);
    return view.board[pos.value.row * 8 + pos.value.col];
  };

  it("OWNER_ONLY: neutral, own placed and revealed cards are visible; other unrevealed cards are null", () => {
    const state = build("OWNER_ONLY");
    const expected: Record<PlayerId, Record<string, CardId | null>> = {
      P0: { F4: null, C4: "S-9", D6: "C-7", E6: null },
      P1: { F4: "D-3", C4: "S-9", D6: null, E6: null },
      P2: { F4: null, C4: "S-9", D6: null, E6: null },
      P3: { F4: null, C4: "S-9", D6: null, E6: "H-2" },
    };
    for (const viewer of SEATS) {
      const view = expectProjection(state, viewer);
      for (const [notation, card] of Object.entries(expected[viewer])) {
        expect(at(view, notation)?.card, `${viewer} ${notation}`).toBe(card);
      }
      // The four neutral cards (D4, E4, D5, E5) are visible to everyone.
      for (const notation of ["D4", "E4", "D5", "E5"]) expect(at(view, notation)?.card).not.toBeNull();
    }
  });

  it("OWNER_ONLY: owner, orientation and occupancy of a hidden cell stay visible", () => {
    const view = viewFor(build("OWNER_ONLY"), "P0");
    expect(at(view, "F4")).toEqual({ owner: "P1", orientation: 180, card: null });
    expect(at(view, "E6")).toEqual({ owner: "P3", orientation: 0, card: null });
    expect(at(view, "D6")).toEqual({ owner: "P0", orientation: 180, card: "C-7" });
    expect(at(view, "A1")).toBeNull();
    expect(view.board.filter((c) => c !== null)).toHaveLength(8);
    expect(view.board.filter((c) => c !== null && c.card === null)).toHaveLength(2);
  });

  it("OWNER_ONLY: the cards of a revealed code become visible to every seat, also through the history alone", () => {
    const before = build("OWNER_ONLY", []);
    expect(at(viewFor(before, "P0"), "C4")?.card).toBeNull();
    const withRevealed = build("OWNER_ONLY", ["S-9", "D-3"]);
    for (const viewer of SEATS) {
      const view = viewFor(withRevealed, viewer);
      expect(at(view, "C4")?.card).toBe("S-9");
      expect(at(view, "F4")?.card).toBe("D-3");
    }
    const viaHistory = makeState({
      config: configFor("OWNER_ONLY"),
      board: boardOf(cells),
      history: [
        { batchIndex: 0, placer: "P1", codes: [{ quadKey: "B3", cards: ["D-3", "S-9", "C-7", "H-2"], hiddenSum: 3 + 9 + 7 + 2 }], perPlayer: [] },
      ],
    });
    expect(at(viewFor(viaHistory, "P3"), "F4")?.card).toBe("D-3");
    expect(at(viewFor(viaHistory, "P3"), "C4")?.card).toBe("S-9");
  });

  it("FACE_UP: every placed card is visible to every seat, other hands and the deck stay private", () => {
    const state = build("FACE_UP", []);
    for (const viewer of SEATS) {
      const view = expectProjection(state, viewer);
      expect(view.board.every((c) => c === null || c.card !== null)).toBe(true);
      expect(visibleBoardCards(view)).toHaveLength(8);
      expect(at(view, "F4")?.card).toBe("D-3");
      expect(view.myHand).toEqual(CANONICAL(state.hands[viewer]));
      expect(view.deckCount).toBe(state.deck.length);
      // 52 = own hand (4) + 8 visible board cards + unseen (other hands 12 + deck 28).
      expect(unseenCards(view)).toHaveLength(52 - 4 - 8);
    }
  });
});

describe("hand order", () => {
  it("returns the own hand in canonical order even when the deal or the fixture order differs", () => {
    const state = makeState({ hands: { P0: ["S-Q", "H-2", "C-5", "D-A"] } });
    expect(state.hands.P0).toEqual(["S-Q", "H-2", "C-5", "D-A"]);
    expect(viewFor(state, "P0").myHand).toEqual(["H-2", "D-A", "C-5", "S-Q"]);
  });

  it("is canonical for real deals, and at least one real deal is not dealt in canonical order", () => {
    let differing = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const state = start(seed, "OWNER_ONLY");
      for (const viewer of SEATS) {
        const hand = state.hands[viewer];
        if (hand.join() !== CANONICAL(hand).join()) differing++;
        expect(viewFor(state, viewer).myHand).toEqual(CANONICAL(hand));
      }
    }
    expect(differing).toBeGreaterThan(0);
  });

  it("shows other seats' hand sizes only, never their cards", () => {
    const state = makeState({ hands: { P1: ["H-2", "H-3", "H-4"] } });
    const view = viewFor(state, "P0");
    expect(view.handCounts.P1).toBe(3);
    const text = JSON.stringify(view);
    for (const card of ["H-2", "H-3", "H-4"]) expect(text.includes(`"${card}"`)).toBe(false);
    expect(view.deckCount).toBe(state.deck.length);
    for (const card of state.deck) expect(text.includes(`"${card}"`)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Pending batch, submissions, reveal, end
// ---------------------------------------------------------------------------------------------------------

function pendingOf(state: GameState): NonNullable<GameState["pending"]> {
  if (state.pending === null) throw new Error("no pending batch");
  return state.pending;
}

describe.each(MODES)("guess collection and reveal (%s)", (mode) => {
  const initial = batchState(mode);
  const keys = pendingOf(initial).codes.map((c) => c.quadKey);

  it("starts a batch with the Quad_Keys, no submission status set and no sealed batch field", () => {
    for (const viewer of SEATS) {
      const view = expectProjection(initial, viewer);
      expect(view.phase).toBe("GUESS_COLLECT");
      expect(view.pendingQuadKeys).toEqual([...keys].sort());
      expect(view.guessSubmitted).toEqual({ P0: false, P1: false, P2: false, P3: false });
      expect(view.myGuesses).toBeNull();
      expect(legalCellsFor(view)).toEqual([]);
      expect(keysOf({ ...view, history: [], lastReveal: null }).has("hiddenSum")).toBe(false);
    }
  });

  it("with 1..3 submissions: status per seat, the own guesses only in the own view, nobody else's values", () => {
    const order: PlayerId[] = ["P2", "P0", "P3"];
    let state = initial;
    const submitted: PlayerId[] = [];
    for (const seat of order) {
      state = submit(state, seat);
      submitted.push(seat);
      expect(state.phase).toBe("GUESS_COLLECT");
      for (const viewer of SEATS) {
        const view = expectProjection(state, viewer);
        expect(view.pendingQuadKeys).toEqual([...keys].sort());
        for (const s of SEATS) expect(view.guessSubmitted[s], `${viewer} sees ${s}`).toBe(submitted.includes(s));
        expect(view.myGuesses).toEqual(submitted.includes(viewer) ? guessesOf(state, viewer) : null);

        const text = JSON.stringify(view);
        for (const other of SEATS) {
          if (other === viewer) continue;
          for (const [key, value] of Object.entries(guessesOf(state, other))) {
            expect(text.includes(`"${key}":${value}`), `${viewer} must not see ${other}'s ${key}=${value}`).toBe(false);
          }
        }
        // Hidden sums of the pending codes are not in the view; the history of earlier batches may hold others.
        const body = { ...view, history: [], lastReveal: null };
        expect(keysOf(body).has("hiddenSum")).toBe(false);
        expect(view.lastReveal).toBeNull();
      }
    }
  });

  it("after the last submission: the reveal holds sums, cards and earned points of the batch, and no guess", () => {
    let state = initial;
    for (const seat of SEATS) state = submit(state, seat);
    expect(["REVEAL", "ENDED"]).toContain(state.phase);
    const batch = pendingOf(initial);
    for (const viewer of SEATS) {
      const view = expectProjection(state, viewer);
      expect(view.pendingQuadKeys).toEqual([]);
      expect(view.guessSubmitted).toEqual({ P0: false, P1: false, P2: false, P3: false });
      expect(view.myGuesses).toBeNull();
      const record = view.lastReveal;
      expect(record).not.toBeNull();
      expect(view.history).toEqual([record]);
      expect(record?.placer).toBe(batch.placer);
      expect(record?.codes).toEqual(
        batch.codes.map((code) => ({ quadKey: code.quadKey, cards: [...code.cards], hiddenSum: hiddenSum(code.cards) })),
      );
      const table = initial.config.scoreConfig.config;
      expect(record?.perPlayer).toEqual(
        SEATS.map((player) => {
          const earned = batch.codes.reduce((sum, code, i) => sum + score(guessValue(player, i), hiddenSum(code.cards), table), 0);
          return { player, earned, cumulative: earned };
        }),
      );
      expect(Object.keys(record ?? {}).sort()).toEqual(["batchIndex", "codes", "perPlayer", "placer"]);
      const text = JSON.stringify(view);
      for (const seat of SEATS) {
        for (const key of keys) {
          const value = guessValue(seat, keys.indexOf(key));
          expect(text.includes(`"${key}":${value}`), `${viewer} sees ${seat}'s guess`).toBe(false);
        }
      }
      // All four cards of every revealed code are visible to every seat, also in OWNER_ONLY.
      for (const code of batch.codes) {
        const origin = fromNotation(code.quadKey);
        if (!origin.ok) throw new Error(code.quadKey);
        for (const p of quadCells(origin.value)) expect(view.board[p.row * 8 + p.col]?.card, `${viewer} ${code.quadKey}`).not.toBeNull();
      }
    }
  });

  it("OWNER_ONLY hides the cards of a pending code that a seat did not place; the reveal shows them", () => {
    const batch = pendingOf(initial);
    const cellsOfBatch = batch.codes.flatMap((code) => {
      const origin = fromNotation(code.quadKey);
      if (!origin.ok) throw new Error(code.quadKey);
      return quadCells(origin.value).map((p) => p.row * 8 + p.col);
    });
    for (const viewer of SEATS) {
      const view = viewFor(initial, viewer);
      const hiddenNow = cellsOfBatch.filter((i) => view.board[i]?.card === null);
      if (mode === "FACE_UP") expect(hiddenNow).toEqual([]);
      else
        for (const i of cellsOfBatch) {
          const cell = initial.board[i];
          const mustSee = cell?.owner === "NEUTRAL" || cell?.owner === viewer;
          expect(view.board[i]?.card === null, `${viewer} cell ${i}`).toBe(!mustSee);
        }
    }
  });
});

describe.each(MODES)("a finished game (%s)", (mode) => {
  const seed = 11;
  const run = playToEnd(seed, configFor(mode), CHOICES, CODE_STYLE);
  const end = run.state;

  it("holds ENDED with a competition ranking, no pending batch and no guess value", () => {
    const guesses = run.actions.flatMap((a) => (a.type === "SUBMIT_GUESSES" ? [a.guesses] : []));
    expect(end.phase).toBe("ENDED");
    for (const viewer of SEATS) {
      const view = expectProjection(end, viewer);
      expect(view.ranking).toEqual(rankPlayers(end.scores));
      expect(view.ranking?.map((r) => r.rank)).toContain(1);
      expect(view.pendingQuadKeys).toEqual([]);
      expect(view.myGuesses).toBeNull();
      expect(view.guessSubmitted).toEqual({ P0: false, P1: false, P2: false, P3: false });
      expect(view.history).toHaveLength(end.history.length);
      expect(legalCellsFor(view)).toEqual([]);
      const text = JSON.stringify(view);
      for (const g of guesses) for (const [key, value] of Object.entries(g)) expect(text.includes(`"${key}":${value}`)).toBe(false);
    }
    expect(guesses.length).toBeGreaterThan(0);
  });

  it("returns the ranking only in the ENDED phase", () => {
    run.states.forEach((state, i) => {
      expect(viewFor(state, "P1").ranking === null, `state ${i} (${state.phase})`).toBe(state.phase !== "ENDED");
    });
  });
});

// ---------------------------------------------------------------------------------------------------------
// unseenCards and legalCellsFor over whole games
// ---------------------------------------------------------------------------------------------------------

describe("projection of every few states of a complete game, both modes, all viewers", () => {
  const owner = playToEnd(5, configFor("OWNER_ONLY"), CHOICES, CODE_STYLE);
  const faceUp = replayActions(5, configFor("FACE_UP"), owner.actions);

  it("keeps the unseen-pool identity and the legal cells at every step", () => {
    const phases = new Set<string>();
    owner.states.forEach((state, i) => {
      if (i % 3 !== 0 && i !== owner.states.length - 1) return;
      phases.add(state.phase);
      for (const viewer of SEATS) {
        expectProjection(state, viewer);
        expectProjection(faceUp[i] as GameState, viewer);
      }
    });
    expect([...phases].sort()).toEqual(["ENDED", "GUESS_COLLECT", "PLACEMENT", "REVEAL"].filter((p) => phases.has(p)));
    expect(phases.has("PLACEMENT")).toBe(true);
    expect(phases.has("ENDED")).toBe(true);
  });

  it("FACE_UP unseen pool is exactly the other hands plus the deck; OWNER_ONLY adds the hidden board cards", () => {
    const i = Math.floor(owner.states.length / 2);
    const ownerState = owner.states[i] as GameState;
    const faceUpState = faceUp[i] as GameState;
    for (const viewer of SEATS) {
      const others = SEATS.filter((s) => s !== viewer).flatMap((s) => ownerState.hands[s]);
      const base = CANONICAL([...others, ...ownerState.deck]);
      expect(unseenCards(viewFor(faceUpState, viewer))).toEqual(base);
      const hiddenOnBoard = viewFor(ownerState, viewer).board.filter((c) => c !== null && c.card === null).length;
      expect(unseenCards(viewFor(ownerState, viewer))).toHaveLength(base.length + hiddenOnBoard);
      expect(hiddenOnBoard).toBeGreaterThan(0);
    }
  });

  it("OWNER_ONLY reveals more cards after a reveal, which shrinks the unseen pool", () => {
    const states = owner.states;
    const beforeIndex = states.findIndex((s) => s.phase === "GUESS_COLLECT" && s.pending !== null && SEATS.every((x) => s.pending?.guesses[x] === undefined));
    expect(beforeIndex).toBeGreaterThan(0);
    const before = states[beforeIndex] as GameState;
    let afterIndex = beforeIndex;
    while ((states[afterIndex] as GameState).phase === "GUESS_COLLECT") afterIndex++;
    const after = states[afterIndex] as GameState;
    expect(after.history.length).toBe(before.history.length + 1);
    for (const viewer of SEATS) {
      const poolBefore = unseenCards(viewFor(before, viewer));
      const poolAfter = unseenCards(viewFor(after, viewer));
      const revealed = (after.lastReveal?.codes ?? []).flatMap((c) => c.cards);
      for (const card of revealed) expect(poolAfter.includes(card), `${viewer} ${card}`).toBe(false);
      // Cards of other seats in the code were in the pool before the reveal (hidden), unless they were visible.
      const hiddenBefore = revealed.filter((c) => poolBefore.includes(c));
      for (const card of hiddenBefore) expect(poolAfter.includes(card)).toBe(false);
      expect(poolAfter.length).toBeLessThanOrEqual(poolBefore.length);
    }
  });
});

describe("unseenCards", () => {
  it("keeps the identity of a hidden board card in the pool (OWNER_ONLY) and removes it (FACE_UP)", () => {
    const cells = [{ at: "F4", card: "D-3", owner: "P1" }] as const;
    const hidden = viewFor(makeState({ config: configFor("OWNER_ONLY"), board: boardOf(cells) }), "P0");
    const open = viewFor(makeState({ config: configFor("FACE_UP"), board: boardOf(cells) }), "P0");
    expect(unseenCards(hidden)).toContain("D-3");
    expect(unseenCards(open)).not.toContain("D-3");
    expect(unseenCards(hidden)).toHaveLength(52 - 4 - 4);
    expect(unseenCards(open)).toHaveLength(52 - 4 - 5);
  });

  it("excludes the own hand and the visible identities, is canonical, duplicate-free and does not alias", () => {
    const view = viewFor(makeState({ hands: { P0: ["S-Q", "H-2", "C-5", "D-A"] } }), "P0");
    const pool = unseenCards(view);
    for (const card of ["S-Q", "H-2", "C-5", "D-A", "H-K", "D-K", "C-K", "S-K"]) expect(pool).not.toContain(card);
    expect(pool).toEqual(CANONICAL(pool));
    expect(new Set(pool).size).toBe(pool.length);
    expect(unseenCards(view)).toEqual(pool);
    expect(unseenCards(view)).not.toBe(pool);
  });

  it("depends on the view alone", () => {
    const view = viewFor(makeState({ hands: { P0: ["S-Q", "H-2", "C-5", "D-A"] } }), "P0");
    const copy: PlayerView = JSON.parse(JSON.stringify(view));
    expect(unseenCards(copy)).toEqual(unseenCards(view));
  });
});

describe("legalCellsFor", () => {
  it("is empty outside PLACEMENT and for a seat that is not on turn, whatever the board", () => {
    const placement = makeState({ turn: "P2", cells: [{ at: "F4", card: "D-3", owner: "P1" }] });
    expect(legalCellsFor(viewFor(placement, "P2"))).toEqual(independentLegalCells(placement, "P2"));
    expect(legalCellsFor(viewFor(placement, "P2")).length).toBeGreaterThan(8);
    for (const viewer of ["P0", "P1", "P3"] as const) expect(legalCellsFor(viewFor(placement, viewer))).toEqual([]);
    const batch = batchState("OWNER_ONLY");
    for (const viewer of SEATS) expect(legalCellsFor(viewFor(batch, viewer))).toEqual([]);
  });

  it("is row-major and does not depend on hidden identities", () => {
    const cells = [{ at: "F4", card: "D-3", owner: "P1" }] as const;
    const hidden = viewFor(makeState({ turn: "P0", config: configFor("OWNER_ONLY"), board: boardOf(cells) }), "P0");
    const open = viewFor(makeState({ turn: "P0", config: configFor("FACE_UP"), board: boardOf(cells) }), "P0");
    const list = legalCellsFor(hidden);
    expect(list).toEqual(legalCellsFor(open));
    const index = list.map((p) => p.row * 8 + p.col);
    expect(index).toEqual([...index].sort((a, b) => a - b));
  });
});

// ---------------------------------------------------------------------------------------------------------
// Purity
// ---------------------------------------------------------------------------------------------------------

describe("purity of viewFor", () => {
  it("is deterministic, leaves the state unchanged and returns a deeply frozen, JSON-serializable view", () => {
    const state = batchState("OWNER_ONLY");
    const snapshot = JSON.stringify(state);
    const a = viewFor(state, "P1");
    const b = viewFor(state, "P1");
    expect(a).toStrictEqual(b);
    expect(a).not.toBe(b);
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(isDeepFrozen(a)).toBe(true);
    expect(() => {
      (a as { phase: string }).phase = "ENDED";
    }).toThrow(TypeError);
    expect(() => (a.myHand as CardId[]).push("H-A")).toThrow(TypeError);
    expect(() => {
      (a.board[27] as { card: string | null }).card = "H-A";
    }).toThrow(TypeError);
    expect(JSON.parse(JSON.stringify(a))).toStrictEqual(a);
  });

  it("shares nothing with the state: changing a deep clone of the view cannot change the state or a new view", () => {
    let state = batchState("FACE_UP");
    state = submit(state, "P1");
    const snapshot = JSON.stringify(state);
    const view = viewFor(state, "P1");
    expect(view.myGuesses).not.toBeNull();
    const clone = structuredClone(view) as unknown as {
      board: ({ card: string | null } | null)[];
      myHand: string[];
      scores: Record<string, number>;
      rules: { seats: { name: string }[]; scoreConfig: { config: { rewardByError: number[] } } };
      myGuesses: Record<string, number>;
    };
    clone.board.forEach((cell) => {
      if (cell !== null) cell.card = "X";
    });
    clone.myHand.push("X");
    clone.scores.P0 = 999;
    clone.rules.seats[0]!.name = "changed";
    clone.rules.scoreConfig.config.rewardByError.push(999);
    for (const key of Object.keys(clone.myGuesses)) clone.myGuesses[key] = 0;
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(viewFor(state, "P1")).toStrictEqual(view);

    const stateObjects = objectsOf(state);
    for (const obj of objectsOf(view)) expect(stateObjects.has(obj)).toBe(false);
  });

  it("does not alias the state in a reveal and an ended game either", () => {
    let state = batchState("OWNER_ONLY");
    for (const seat of SEATS) state = submit(state, seat);
    const ended = playToEnd(2, configFor("OWNER_ONLY"), CHOICES, CODE_STYLE).state;
    for (const s of [state, ended]) {
      const stateObjects = objectsOf(s);
      for (const viewer of SEATS) {
        for (const obj of objectsOf(viewFor(s, viewer))) expect(stateObjects.has(obj)).toBe(false);
      }
    }
  });
});
