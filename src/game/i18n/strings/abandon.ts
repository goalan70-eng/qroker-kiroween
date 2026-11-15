// Area `abandon`: the abandon-game confirmation (task 19.3; requirement 15.5).
//
// Keys are namespaced `abandon.<name>`. No placeholders. The Cancel button reuses `common.button.cancel`; the engine
// message of a refused abandon comes from the `error.*` texts. No string names a card, a Guess or a point value.
//
// Korean text status: every Korean string here is new text and carries `// REVIEW: new text, needs native-speaker
// check`.

export const en = Object.freeze({
  /** The label of the control that opens the confirmation (the host puts the control on the game screen). */
  'abandon.open': 'Abandon game',
  'abandon.title': 'Abandon this game?',
  'abandon.body': 'Progress will be lost.',
  /** The destructive confirm button. */
  'abandon.confirm': 'Abandon game',
} as const);

export const ko: Record<keyof typeof en, string> = Object.freeze({
  // REVIEW: new text, needs native-speaker check
  'abandon.open': '게임 포기',
  // REVIEW: new text, needs native-speaker check
  'abandon.title': '이 게임을 포기할까요?',
  // REVIEW: new text, needs native-speaker check
  'abandon.body': '진행 상황이 사라집니다.',
  // REVIEW: new text, needs native-speaker check
  'abandon.confirm': '게임 포기',
});
