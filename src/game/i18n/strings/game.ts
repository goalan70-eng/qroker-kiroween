// Area `game`: the texts of the composition host `ui/screens/game.ts` (task 19.4): the Seed line, the live-region and
// status texts, and the label of the top bar.
//
// Keys are namespaced `game.<name>`. Placeholders are written `{name}`: `{seed}` the public Seed of the running game,
// `{name}` a public Seat name, `{n}` a public reveal number. No text names a card, a Guess or a point value.
// The help and abandon opener labels are owned by `help.open` and `abandon.open`; the banner by `common.provisionalScoring`.
//
// Korean text status: every Korean string here is new text and carries `// REVIEW: new text, needs native-speaker
// check`.
export const en = Object.freeze({
  'game.bar.label': 'Game controls',
  'game.seed': 'Seed: {seed}',
  // Live region (aria-live="polite"): public turn and phase changes only.
  'game.live.turn': 'Turn: {name}.',
  'game.live.guess': 'Guess phase.',
  'game.live.reveal': 'Reveal {n} is shown.',
  'game.live.ended': 'The game is over.',
  'game.live.gate': 'Pass the device to {name}.',
  // Status text while an AI Seat acts and nothing private is shown.
  'game.status.aiTurn': '{name} is thinking.',
  'game.status.aiGuess': 'The AI players are submitting their Guesses.',
} as const);

export const ko: Record<keyof typeof en, string> = Object.freeze({
  // REVIEW: new text, needs native-speaker check
  'game.bar.label': '게임 메뉴',
  // REVIEW: new text, needs native-speaker check
  'game.seed': '시드: {seed}',
  // REVIEW: new text, needs native-speaker check
  'game.live.turn': '현재 차례: {name}',
  // REVIEW: new text, needs native-speaker check
  'game.live.guess': '예측값 입력 단계입니다.',
  // REVIEW: new text, needs native-speaker check
  'game.live.reveal': '공개 {n}회차 결과가 표시됩니다.',
  // REVIEW: new text, needs native-speaker check
  'game.live.ended': '게임이 끝났습니다.',
  // REVIEW: new text, needs native-speaker check
  'game.live.gate': '기기를 {name}에게 넘겨 주세요.',
  // REVIEW: new text, needs native-speaker check
  'game.status.aiTurn': '{name}이(가) 생각하고 있습니다.',
  // REVIEW: new text, needs native-speaker check
  'game.status.aiGuess': 'AI 플레이어가 예측값을 제출하고 있습니다.',
});
