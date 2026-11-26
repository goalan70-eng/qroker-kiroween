// Setup model (task 19.1; requirements 2.5, 2.7, 15.1, 15.2): the options of the setup screen as plain data, their
// validation, and the seat list they stand for. Pure: imports `core/types` only, no clock, no randomness, no global.
//
// What is NOT here
//   * The seed is not parsed here. `parseSeed` lives in core/seed, which ui/ files other than the controller may not
//     import. `SetupOptions.seedText` is raw text; `controller.startFromSetup` parses it.
//   * No storage. `SetupPrefs` (everything except the seed) is the JSON-serializable shape that Task 20.2/20.4 will keep
//     under `PREFS_KEY`. Task 20 reads the stored JSON and passes it to `sanitizeSetupPrefs`, which never throws and
//     falls back to the defaults field by field, so a corrupt or old record cannot break the setup screen.
//
// Tiers offered in P1: `BEGINNER` and `ADVANCED`. `EXPERT` exists in the engine but is not offered (task 23.4) and is
// rejected here.

import type { Difficulty, ErrorCode, IdentityVisibility, PlayerId, SeatConfig } from '../core/types';

export const MIN_HUMANS = 1;
export const MAX_HUMANS = 4;

/** The tiers the setup screen offers (not `EXPERT`; task 23.4 adds it). */
export const SETUP_DIFFICULTIES: readonly Difficulty[] = Object.freeze(['BEGINNER', 'ADVANCED'] as const);
/** The identity visibilities the setup screen offers. The first is the default (OQ-1, provisional). */
export const SETUP_VISIBILITIES: readonly IdentityVisibility[] = Object.freeze(['OWNER_ONLY', 'BLIND', 'BLIND_SCORE_ONLY'] as const);

const DEFAULT_DIFFICULTY: Difficulty = 'BEGINNER';
const DEFAULT_VISIBILITY: IdentityVisibility = 'OWNER_ONLY';
const SEAT_IDS: readonly PlayerId[] = Object.freeze(['P0', 'P1', 'P2', 'P3'] as const);

/** One entry per seat P0..P3; only the entries of AI seats are used. */
export type SetupDifficulties = readonly [Difficulty, Difficulty, Difficulty, Difficulty];

export const DEFAULT_PLACEMENT_SECONDS = 20;
export const DEFAULT_PREDICTION_SECONDS = 10;
export const MAX_TURN_SECONDS = 600;

export function validTurnSeconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_TURN_SECONDS;
}

/** Store only overrides; older preferences use the same defaults as a new installation. */
function timerOverrides(source: Record<string, unknown>) {
  const { placementSeconds, predictionSeconds } = source;
  return {
    ...(validTurnSeconds(placementSeconds) && placementSeconds !== DEFAULT_PLACEMENT_SECONDS ? { placementSeconds } : {}),
    ...(validTurnSeconds(predictionSeconds) && predictionSeconds !== DEFAULT_PREDICTION_SECONDS ? { predictionSeconds } : {}),
  };
}

/** Everything of the setup except the seed. Plain, JSON-serializable data. */
export interface SetupPrefs {
  readonly placementSeconds?: number;
  readonly predictionSeconds?: number;
  /** Integer 1..4: seats P0..P(k-1) are human. */
  readonly humanCount: number;
  readonly difficulties: SetupDifficulties;
  readonly identityVisibility: IdentityVisibility;
}

export interface SetupOptions extends SetupPrefs {
  /** Raw text of the seed field; parsed by the controller. */
  readonly seedText: string;
}

export const DEFAULT_SETUP_PREFS: SetupPrefs = Object.freeze({
  humanCount: 1,
  difficulties: Object.freeze([DEFAULT_DIFFICULTY, DEFAULT_DIFFICULTY, DEFAULT_DIFFICULTY, DEFAULT_DIFFICULTY]) as SetupDifficulties,
  identityVisibility: DEFAULT_VISIBILITY,
});

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isHumanCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= MIN_HUMANS && v <= MAX_HUMANS;
const isTier = (v: unknown): v is Difficulty => typeof v === 'string' && (SETUP_DIFFICULTIES as readonly string[]).includes(v);
const isVisibility = (v: unknown): v is IdentityVisibility =>
  typeof v === 'string' && (SETUP_VISIBILITIES as readonly string[]).includes(v);

/**
 * Prefs from untrusted data (for example stored JSON). Never throws; every field that is missing or not allowed
 * (including `EXPERT` and a human count outside 1..4) falls back to its default on its own.
 */
export function sanitizeSetupPrefs(raw: unknown): SetupPrefs {
  const source = isRecord(raw) ? raw : {};
  const list: unknown = source.difficulties;
  const tiers = SEAT_IDS.map((_, i) => {
    const entry: unknown = Array.isArray(list) ? (list as unknown[])[i] : undefined;
    return isTier(entry) ? entry : DEFAULT_DIFFICULTY;
  }) as unknown as SetupDifficulties;
  return Object.freeze({
    ...timerOverrides(source),
    humanCount: isHumanCount(source.humanCount) ? source.humanCount : DEFAULT_SETUP_PREFS.humanCount,
    difficulties: Object.freeze(tiers),
    identityVisibility: isVisibility(source.identityVisibility) ? source.identityVisibility : DEFAULT_VISIBILITY,
  });
}

export interface SetupProblem {
  readonly field: 'seedText' | 'humanCount' | 'difficulties' | 'identityVisibility' | 'placementSeconds' | 'predictionSeconds';
  /** Engine-style code; the setup problems are all `INVALID_CONFIG`. */
  readonly code: ErrorCode;
  /** The AI seat of a `difficulties` problem. */
  readonly seat?: PlayerId;
}

export type SetupValidation =
  | { readonly ok: true; readonly value: SetupOptions }
  | { readonly ok: false; readonly problems: readonly SetupProblem[] };

/** The AI seats (those without a human) for `humanCount` humans. An invalid count gives no seats. */
export function aiSeatIds(humanCount: number): readonly PlayerId[] {
  return isHumanCount(humanCount) ? SEAT_IDS.slice(humanCount) : [];
}

/**
 * Checks `options` (any value) and returns a normalized, frozen `SetupOptions` or one problem per bad field. Only
 * the difficulties of AI seats are checked; the entries of human seats are not used and are normalized to the default
 * tier. The seed text must be a string; its content is not examined here.
 */
export function validateSetup(options: unknown): SetupValidation {
  if (!isRecord(options)) return { ok: false, problems: [{ field: 'humanCount', code: 'INVALID_CONFIG' }] };
  const problems: SetupProblem[] = [];
  if (typeof options.seedText !== 'string') problems.push({ field: 'seedText', code: 'INVALID_CONFIG' });
  const humans = options.humanCount;
  if (!isHumanCount(humans)) problems.push({ field: 'humanCount', code: 'INVALID_CONFIG' });
  const list: unknown = options.difficulties;
  if (!Array.isArray(list) || list.length !== SEAT_IDS.length) {
    problems.push({ field: 'difficulties', code: 'INVALID_CONFIG' });
  } else {
    // An invalid human count leaves no AI seat to name; the count problem is already reported.
    for (const seat of aiSeatIds(humans as number)) {
      if (!isTier((list as unknown[])[SEAT_IDS.indexOf(seat)])) problems.push({ field: 'difficulties', code: 'INVALID_CONFIG', seat });
    }
  }
  if (!isVisibility(options.identityVisibility)) problems.push({ field: 'identityVisibility', code: 'INVALID_CONFIG' });
  for (const field of ['placementSeconds', 'predictionSeconds'] as const) {
    if (options[field] !== undefined && !validTurnSeconds(options[field])) problems.push({ field, code: 'INVALID_CONFIG' });
  }
  if (problems.length > 0) return { ok: false, problems };
  const count = humans as number;
  const tiers = SEAT_IDS.map((_, i) => (i >= count ? (list as Difficulty[])[i] : DEFAULT_DIFFICULTY)) as unknown as SetupDifficulties;
  return {
    ok: true,
    value: Object.freeze({
      ...timerOverrides(options),
      seedText: options.seedText as string,
      humanCount: count,
      difficulties: Object.freeze(tiers),
      identityVisibility: options.identityVisibility as IdentityVisibility,
    }),
  };
}

/**
 * The four seats for validated `prefs` (call `validateSetup` first): P0..P(k-1) human, the rest AI with the chosen
 * tier. Names are the English literals of `defaultConfig`: `You` for a single human, `Player 1`.. for two or more,
 * `AI 1`.. numbered among the AI seats. For `DEFAULT_SETUP_PREFS` the result equals the seats of `defaultConfig()`.
 */
export function seatsFor(prefs: SetupPrefs): readonly [SeatConfig, SeatConfig, SeatConfig, SeatConfig] {
  const seats = SEAT_IDS.map((id, i): SeatConfig => {
    if (i < prefs.humanCount) {
      return Object.freeze({ id, kind: 'HUMAN', name: prefs.humanCount === 1 ? 'You' : `Player ${i + 1}` });
    }
    return Object.freeze({ id, kind: 'AI', difficulty: prefs.difficulties[i] as Difficulty, name: `AI ${i - prefs.humanCount + 1}` });
  });
  return Object.freeze(seats) as unknown as readonly [SeatConfig, SeatConfig, SeatConfig, SeatConfig];
}
