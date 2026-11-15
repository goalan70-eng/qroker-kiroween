// Area `errors`: one Korean and one English message per `ErrorCode` (task 15.2; requirements 12.7 and 16.3).
// Source of the texts: .kiro/specs/qroker-playable-game/design.md, "Error Handling", "Engine Errors" table.
//
// Keys are `error.<ErrorCode>` (the same string as `errorMessageKey(code)`). The English table is checked at compile
// time against `ErrorStringKey`, so a missing or an extra code is a compile error; the Korean table is typed
// `Record<keyof typeof en, string>`.
//
// The messages are STATIC user-facing texts. They have no placeholders and never carry internal diagnostic data:
// the engine's `detail` text (raw values, card ids, group ids, seeds, log positions) is for developers and tests and
// is never shown by these messages. The UI looks the message up by the code only.
//
// Korean text status:
//   * APPROVED, copied verbatim from the Error Handling table of the approved qroker-game design
//     (.kiro/specs/qroker-game/design.md, "Placement errors"): OUT_OF_BOUNDS, OCCUPIED, NOT_ADJACENT,
//     INVALID_ORIENTATION and CARD_NOT_IN_HAND. These five carry no review marker. A unit test compares them with
//     the design file.
//   * Every other Korean text is new text proposed by the playable-game design table. It carries the marker
//     `// REVIEW: new text, needs native-speaker check` on the line above it.

import type { ErrorStringKey } from '../types';

export const en = Object.freeze({
  // Placement errors.
  'error.OUT_OF_BOUNDS': 'Invalid position',
  'error.OCCUPIED': 'Position already has a card',
  'error.NOT_ADJACENT': 'Must be adjacent to an existing card',
  'error.INVALID_ORIENTATION': '90°/270° placement is not supported',
  'error.CARD_NOT_IN_HAND': 'Card not in hand',

  // Turn and phase errors.
  'error.NOT_YOUR_TURN': 'It is not your turn',
  'error.WRONG_PHASE': 'This action is not available now',
  'error.GAME_ENDED': 'The game has already ended',

  // Guess errors.
  'error.GUESS_NOT_INTEGER': 'Enter a whole number',
  'error.GUESS_OUT_OF_RANGE': 'The guess must be between 4 and 52',
  'error.DUPLICATE_SUBMISSION': 'Already submitted',
  'error.GUESS_KEYS_MISMATCH': 'A guess is required for every code',

  // Setup, parsing and save errors.
  'error.INVALID_SCORE_CONFIG': 'The score configuration is invalid',
  'error.INVALID_CONFIG': 'The game configuration is invalid',
  'error.INVALID_CARD_ID': 'Unknown card',
  'error.SEED_EMPTY': 'Enter a seed',
  'error.UNKNOWN_PLAYER': 'Unknown player',
  'error.REPLAY_REJECTED': 'The saved game cannot be continued',
} as const satisfies Record<ErrorStringKey, string>);

export const ko: Record<keyof typeof en, string> = Object.freeze({
  // Approved text, verbatim from the qroker-game design (no review marker).
  'error.OUT_OF_BOUNDS': '유효하지 않은 위치',
  'error.OCCUPIED': '이미 카드가 있는 위치',
  'error.NOT_ADJACENT': '기존 카드와 인접해야 합니다',
  'error.INVALID_ORIENTATION': '90°/270° 배치는 지원하지 않습니다',
  'error.CARD_NOT_IN_HAND': '손패에 없는 카드',

  // REVIEW: new text, needs native-speaker check
  'error.NOT_YOUR_TURN': '지금은 내 차례가 아닙니다',
  // REVIEW: new text, needs native-speaker check
  'error.WRONG_PHASE': '지금은 할 수 없는 동작입니다',
  // REVIEW: new text, needs native-speaker check
  'error.GAME_ENDED': '게임이 이미 끝났습니다',

  // REVIEW: new text, needs native-speaker check
  'error.GUESS_NOT_INTEGER': '정수만 입력할 수 있습니다',
  // REVIEW: new text, needs native-speaker check
  'error.GUESS_OUT_OF_RANGE': '예측값은 4에서 52 사이여야 합니다',
  // REVIEW: new text, needs native-speaker check
  'error.DUPLICATE_SUBMISSION': '이미 제출했습니다',
  // REVIEW: new text, needs native-speaker check
  'error.GUESS_KEYS_MISMATCH': '모든 조합에 예측값이 필요합니다',

  // REVIEW: new text, needs native-speaker check
  'error.INVALID_SCORE_CONFIG': '점수 설정이 올바르지 않습니다',
  // REVIEW: new text, needs native-speaker check
  'error.INVALID_CONFIG': '게임 설정이 올바르지 않습니다',
  // REVIEW: new text, needs native-speaker check
  'error.INVALID_CARD_ID': '알 수 없는 카드입니다',
  // REVIEW: new text, needs native-speaker check
  'error.SEED_EMPTY': '시드를 입력하세요',
  // REVIEW: new text, needs native-speaker check
  'error.UNKNOWN_PLAYER': '알 수 없는 플레이어입니다',
  // REVIEW: new text, needs native-speaker check
  'error.REPLAY_REJECTED': '저장된 게임을 이어할 수 없습니다',
});
