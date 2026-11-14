/**
 * Core types of the QRoker game engine.
 *
 * Source: .kiro/specs/qroker-playable-game/design.md, "Core Types (`core/types.ts`)".
 * Requirements: 1.2 (CardId string form), 12.7 (closed ErrorCode enumeration).
 *
 * This file contains type declarations only (`export type` / `export interface`).
 * It has no runtime code: no consts, functions, classes or enums, and no imports.
 *
 * Resolved inconsistencies of the qroker-game design (see the inconsistency notes
 * IC-1 to IC-10 in the requirements.md of qroker-playable-game):
 * - IC-2: `CardId` is the string form `'<Suit>-<Rank>'` (for example `'H-7'`, `'S-10'`),
 *   not an object `{ suit, rank }`. It is the same text as the optical card keys, but
 *   nothing is imported from `src/optical`.
 * - IC-3: `GridPosition` is 0-based: `row` 0 is the top row "1", `col` 0 is column "A".
 *   Notation such as `D4` is converted by `core/geometry.ts`.
 * - IC-4: public structures identify a Composite_Code by its `QuadKey` (the notation of
 *   the top-left cell, for example `'D4'`), never by a sorted CardId group id.
 * - IC-10: there is no `INIT` phase; this file does not define phases (see core/state.ts).
 *
 * `ErrorCode` is a closed union. It lists exactly the codes of the design's Error
 * Handling table (18 codes). Adding a code requires a design change and a Korean and
 * English message in `i18n/strings/errors.ts`.
 */

export type Suit = 'H' | 'D' | 'C' | 'S';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
export type CardId = `${Suit}-${Rank}`; // 'H-7', 'S-10'
export type Orientation = 0 | 180;
export type Corner = 'TL' | 'TR' | 'BL' | 'BR';
export type Slot = Corner; // position of a card inside a 2x2 group
export type PlayerId = 'P0' | 'P1' | 'P2' | 'P3';
export type Owner = PlayerId | 'NEUTRAL';
export type Difficulty = 'BEGINNER' | 'ADVANCED' | 'EXPERT';
export type QuadKey = string; // notation of the top-left cell, e.g. 'D4'

/** 0-based; row 0 is the row labelled "1" (top), col 0 is column "A". */
export interface GridPosition {
  readonly row: number;
  readonly col: number;
}

export type Result<T, E = EngineError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export interface EngineError {
  readonly code: ErrorCode;
  readonly detail?: string;
}

export type ErrorCode =
  | 'INVALID_CARD_ID'
  | 'SEED_EMPTY'
  | 'INVALID_SCORE_CONFIG'
  | 'INVALID_CONFIG'
  | 'OUT_OF_BOUNDS'
  | 'OCCUPIED'
  | 'NOT_ADJACENT'
  | 'INVALID_ORIENTATION'
  | 'CARD_NOT_IN_HAND'
  | 'NOT_YOUR_TURN'
  | 'WRONG_PHASE'
  | 'GAME_ENDED'
  | 'GUESS_NOT_INTEGER'
  | 'GUESS_OUT_OF_RANGE'
  | 'DUPLICATE_SUBMISSION'
  | 'GUESS_KEYS_MISMATCH'
  | 'UNKNOWN_PLAYER'
  | 'REPLAY_REJECTED';

export interface ScoreConfig {
  readonly rewardByError: readonly number[];
  readonly handEmptyBonus: number;
}

export interface NamedScoreConfig {
  readonly id: string;
  readonly provisional: boolean;
  readonly config: ScoreConfig;
}

export type IdentityVisibility = 'OWNER_ONLY' | 'FACE_UP';

export interface SeatConfig {
  readonly id: PlayerId;
  readonly kind: 'HUMAN' | 'AI';
  readonly difficulty?: Difficulty;
  readonly name: string;
}

export interface GameConfig {
  readonly rulesVersion: number; // RULES_VERSION
  readonly seats: readonly [SeatConfig, SeatConfig, SeatConfig, SeatConfig];
  readonly scoreConfig: NamedScoreConfig;
  readonly identityVisibility: IdentityVisibility;
}

export type Action =
  | {
      readonly type: 'PLACE';
      readonly player: PlayerId;
      readonly card: CardId;
      readonly pos: GridPosition;
      readonly orientation: Orientation;
    }
  | {
      readonly type: 'SUBMIT_GUESSES';
      readonly player: PlayerId;
      readonly guesses: Readonly<Record<QuadKey, number>>;
    }
  | { readonly type: 'ACK_REVEAL' };
