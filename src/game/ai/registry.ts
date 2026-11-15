/**
 * The strategy registry of the QRoker game (task 12.2): maps a `Difficulty` to its `AIStrategy`.
 *
 * Source: .kiro/specs/qroker-playable-game/design.md, "AI Strategies (`ai/`)": `getStrategy(d: Difficulty):
 * AIStrategy`. Requirement 11.7 (a registry from each Difficulty_Label to a strategy, with Korean and English
 * names: the names are `DIFFICULTY_LABELS` in strategy.ts).
 *
 * Contract as implemented:
 * - `getStrategy('BEGINNER')` returns the shared `BEGINNER_STRATEGY` (`id === 'BEGINNER'`); every call returns the
 *   same instance.
 * - `getStrategy('ADVANCED')` returns the shared `ADVANCED_STRATEGY` of `./heuristic` (task 12.3).
 * - The design signature returns an `AIStrategy` for every `Difficulty` and has no failure result. `EXPERT`
 *   (task 23.1) is a declared tier whose strategy does not exist yet. The registry must
 *   not hand out a stand-in, so for a declared tier that is not registered `getStrategy` THROWS a `RangeError`
 *   that names the tier ("not registered yet"). Registering a tier later is one line in `REGISTERED` and it then
 *   appears in `registeredDifficulties()`.
 * - Any other input (an unknown string such as 'EXPERT2', an inherited property name such as 'toString', `null`,
 *   `undefined`, a number, an object) throws a `RangeError` that says the value is not a difficulty.
 *   Look-ups use own properties only, so `'__proto__'` and `'constructor'` cannot reach a strategy.
 * - `registeredDifficulties()` is not in the design's listing; it exists because task 12.4 iterates over "every
 *   strategy id returned by the registry at test time". It returns the registered tiers in the order of
 *   `Difficulty` (BEGINNER, ADVANCED, EXPERT), as a new frozen array.
 *
 * Imports: `./heuristic`, `./random`, `./strategy` and the type of `core/types` only. Pure; no DOM, no node:, no randomness.
 */

import type { Difficulty } from '../core/types';
import { ADVANCED_STRATEGY } from './heuristic';
import { BEGINNER_STRATEGY } from './random';
import { DIFFICULTY_LABELS } from './strategy';
import type { AIStrategy } from './strategy';

/** The registered strategies. The tier EXPERT is added by task 23.1. */
const REGISTERED: Readonly<Partial<Record<Difficulty, AIStrategy>>> = Object.freeze({
  BEGINNER: BEGINNER_STRATEGY,
  ADVANCED: ADVANCED_STRATEGY,
});

/** The declared tiers, in the order of the `Difficulty` type (the keys of the label table). */
const DECLARED: readonly Difficulty[] = Object.freeze(Object.keys(DIFFICULTY_LABELS) as Difficulty[]);

const hasOwn = (record: object, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);

function describeValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'object' && value !== null) return 'an object';
  return `${typeof value} ${String(value)}`;
}

/**
 * The strategy of tier `d`.
 *
 * @throws RangeError if `d` is not a declared difficulty, or is a declared difficulty without a registered
 * strategy (see the module comment).
 */
export function getStrategy(d: Difficulty): AIStrategy {
  const key: unknown = d;
  if (typeof key !== 'string' || !DECLARED.includes(key as Difficulty)) {
    throw new RangeError(`getStrategy: ${describeValue(key)} is not a difficulty (${DECLARED.join(', ')})`);
  }
  if (!hasOwn(REGISTERED, key)) {
    throw new RangeError(`getStrategy: the ${key} strategy is not registered yet`);
  }
  return REGISTERED[key as Difficulty] as AIStrategy;
}

/** The difficulties that have a registered strategy, in the order of `Difficulty`. A new frozen array. */
export function registeredDifficulties(): readonly Difficulty[] {
  return Object.freeze(DECLARED.filter((d) => hasOwn(REGISTERED, d)));
}
