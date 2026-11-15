/**
 * Types of the headless driver and the simulation interface (task 13.1).
 *
 * Source: .kiro/specs/qroker-playable-game/design.md, "Headless Driver and Simulation Interface (`sim/`)".
 * Requirements: 20.1 (headless driver), 20.4 (simulation runner interface).
 *
 * This file contains type declarations only (`export interface`). It has no runtime code and no value
 * imports, so importing it costs nothing at runtime.
 *
 * `SimulationConfig`, `SimulationResult` and `GameSimulator` are INTERFACES ONLY in P1. The simulator itself is
 * a milestone P3 task (requirement 20.6: tuning of the score table and the bonus is deferred to P3). No value of
 * `ScoreConfig` is fixed by anything in this file.
 *
 * Deviation from the design listing (one optional field, added on purpose): `PlayGameOptions.maxActions`.
 * The design lists `seed`, `config`, `strategies` and `checkInvariants`. `maxActions` is an optional test knob
 * for the finite-execution guard of `playGame`; leaving it out gives the documented default.
 */

import type { AIStrategy } from '../ai/strategy';
import type { GameState } from '../core/state';
import type { Action, Difficulty, GameConfig, IdentityVisibility, PlayerId, ScoreConfig } from '../core/types';

export interface PlayGameOptions {
  /** A Seed as returned by `parseSeed` (an integer in 0..4294967295). An invalid seed makes `playGame` throw. */
  readonly seed: number;
  readonly config: GameConfig;
  /**
   * One strategy for EVERY seat, including seats whose `config.seats[i].kind` is `'HUMAN'`. `playGame` ignores the
   * seat kinds: a simulation or a test may let an AI play a seat that is configured as HUMAN. The registry maps a
   * difficulty to a strategy (`getStrategy`); a test may pass its own `AIStrategy` object.
   */
  readonly strategies: Readonly<Record<PlayerId, AIStrategy>>;
  /** Check the invariants of design.md "Invariants" after every accepted Action. Default `true`. */
  readonly checkInvariants?: boolean;
  /**
   * Upper bound of accepted Actions before `playGame` gives up with `ActionLimitError`. Default
   * `DEFAULT_MAX_ACTIONS` (in `play-game.ts`), which no legal game can reach. Must be a positive integer.
   */
  readonly maxActions?: number;
}

export interface PlayGameResult {
  /** The final state: phase `ENDED`, deeply frozen (it is the state the reducer built). */
  readonly final: GameState;
  /** The accepted Actions in order: a copy of `final.log`. Replaying it from the seed gives `final`. */
  readonly log: readonly Action[];
}

// Interface only in P1; implemented in P3 (qroker-game design GameSimulator).
export interface SimulationConfig {
  seed: number;
  gameCount: number;
  scoreConfig: ScoreConfig;
  strategies: readonly Difficulty[]; // 4 Seats
  identityVisibility: IdentityVisibility;
}

export interface SimulationResult {
  winRates: Record<string, number>;
  avgGameLength: number;
  predictionScoreShare: number;
  handEmptyBonusImpact: number;
  scoreDistribution: number[];
}

export interface GameSimulator {
  run(c: SimulationConfig): SimulationResult;
  runBatch(cs: SimulationConfig[]): SimulationResult[];
}
