/**
 * Compile-time checks for core/types.ts (task 1.4). Run by `tsc`, not by vitest:
 * the name `types.test-d.ts` does not match the vitest include glob `src/**\/*.test.ts`.
 * A failed assertion is a compile error. An unused `@ts-expect-error` is also an error.
 */
import type {
  Action,
  CardId,
  Difficulty,
  ErrorCode,
  GameConfig,
  GridPosition,
  IdentityVisibility,
  NamedScoreConfig,
  Orientation,
  Owner,
  PlayerId,
  Rank,
  Result,
  ScoreConfig,
  SeatConfig,
  Slot,
  Corner,
  Suit,
} from './types';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
function assertType<_T extends true>(): void {}

// --- closed unions and counts ---
assertType<Equal<Suit, 'H' | 'D' | 'C' | 'S'>>();
assertType<Equal<Orientation, 0 | 180>>();
assertType<Equal<Slot, Corner>>();
assertType<Equal<Owner, PlayerId | 'NEUTRAL'>>();
assertType<Equal<Difficulty, 'BEGINNER' | 'ADVANCED' | 'EXPERT'>>();
assertType<Equal<IdentityVisibility, 'OWNER_ONLY' | 'FACE_UP'>>();

// ErrorCode is exactly the 18 codes of the design Error Handling table.
assertType<
  Equal<
    ErrorCode,
    | 'OUT_OF_BOUNDS' | 'OCCUPIED' | 'NOT_ADJACENT' | 'INVALID_ORIENTATION' | 'CARD_NOT_IN_HAND'
    | 'NOT_YOUR_TURN' | 'WRONG_PHASE' | 'GAME_ENDED'
    | 'GUESS_NOT_INTEGER' | 'GUESS_OUT_OF_RANGE' | 'DUPLICATE_SUBMISSION' | 'GUESS_KEYS_MISMATCH'
    | 'INVALID_SCORE_CONFIG' | 'INVALID_CONFIG' | 'INVALID_CARD_ID' | 'SEED_EMPTY'
    | 'UNKNOWN_PLAYER' | 'REPLAY_REJECTED'
  >
>();

// CardId is the template literal over Suit and Rank (4 x 13 members).
assertType<Equal<CardId, `${Suit}-${Rank}`>>();

// --- legal values ---
const okCard = 'H-7' satisfies CardId;
const okTen = 'S-10' satisfies CardId;
const okOrientations = [0, 180] satisfies Orientation[];
const okPos = { row: 0, col: 7 } satisfies GridPosition;
const okErr = { ok: false, error: { code: 'OCCUPIED' } } satisfies Result<number>;
const okVal = { ok: true, value: 1 } satisfies Result<number>;
const okScore = { rewardByError: [10, 5, 1], handEmptyBonus: 3 } satisfies ScoreConfig;
const okNamed = { id: 'dev', provisional: true, config: okScore } satisfies NamedScoreConfig;
const seat = (id: PlayerId) => ({ id, kind: 'AI', difficulty: 'BEGINNER', name: id }) satisfies SeatConfig;
const okConfig = {
  rulesVersion: 1,
  seats: [seat('P0'), seat('P1'), seat('P2'), seat('P3')],
  scoreConfig: okNamed,
  identityVisibility: 'OWNER_ONLY',
} satisfies GameConfig;
const okPlace = {
  type: 'PLACE',
  player: 'P0',
  card: okCard,
  pos: okPos,
  orientation: 180,
} satisfies Action;
const okGuess = { type: 'SUBMIT_GUESSES', player: 'P1', guesses: { D4: 30 } } satisfies Action;
const okAck = { type: 'ACK_REVEAL' } satisfies Action;
void [okTen, okOrientations, okErr, okVal, okConfig, okPlace, okGuess, okAck];

// --- illegal values must not compile ---
// @ts-expect-error orientation 90 is not allowed
const badOrientation = 90 satisfies Orientation;
// @ts-expect-error rank 14 does not exist
const badRank = '14' satisfies Rank;
// @ts-expect-error 'X' is not a suit
const badCard = 'X-1' satisfies CardId;
// @ts-expect-error rank 1 is written 'A'
const badAce = 'H-1' satisfies CardId;
// @ts-expect-error unknown error code
const badCode = 'NO_SUCH_CODE' satisfies ErrorCode;
// @ts-expect-error seat P4 does not exist
const badPlayer = 'P4' satisfies PlayerId;
// @ts-expect-error seats tuple needs exactly 4 entries
const badSeats = { ...okConfig, seats: [seat('P0')] } satisfies GameConfig;
// @ts-expect-error PLACE needs an orientation
const badPlace = { type: 'PLACE', player: 'P0', card: 'H-7', pos: okPos } satisfies Action;
declare const typedPos: GridPosition;
// @ts-expect-error GridPosition fields are readonly
typedPos.row = 1;
void [badOrientation, badRank, badCard, badAce, badCode, badPlayer, badSeats, badPlace];
