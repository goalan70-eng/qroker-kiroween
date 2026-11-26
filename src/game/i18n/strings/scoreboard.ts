// Area `scoreboard`: the scoreboard shown on every game screen (task 18.2).
//
// Keys are namespaced `scoreboard.<name>`. Placeholders are written `{name}`: `{count}` a public count (deck size).
// The provisional-scoring banner reuses `common.provisionalScoring`; no point value is written in any text.
//
// Korean text status: every Korean string here is new text and carries `// REVIEW: new text, needs native-speaker
// check`.

export const en = Object.freeze({
  'scoreboard.caption': 'Scoreboard',
  'scoreboard.col.seat': 'Player',
  'scoreboard.col.score': 'Score',
  'scoreboard.col.hand': 'Cards in hand',
  'scoreboard.timer.place': 'Placement',
  'scoreboard.timer.guess': 'Prediction',
  'scoreboard.timer.wait': 'Waiting',
  'scoreboard.timer.expired': 'Time up',
  'scoreboard.timer.seconds': '{count}s',
  'scoreboard.active': 'current turn',
  'scoreboard.kind.HUMAN': 'person',
  'scoreboard.kind.AI': 'AI',
  'scoreboard.deck': 'Cards left in the deck: {count}',
} as const);

export const ko: Record<keyof typeof en, string> = Object.freeze({
  // REVIEW: new text, needs native-speaker check
  'scoreboard.caption': '점수판',
  // REVIEW: new text, needs native-speaker check
  'scoreboard.col.seat': '플레이어',
  // REVIEW: new text, needs native-speaker check
  'scoreboard.col.score': '점수',
  // REVIEW: new text, needs native-speaker check
  'scoreboard.col.hand': '손패 수',
  // REVIEW: new text, needs native-speaker check
  'scoreboard.timer.place': '배치',
  // REVIEW: new text, needs native-speaker check
  'scoreboard.timer.guess': '합계 입력',
  // REVIEW: new text, needs native-speaker check
  'scoreboard.timer.wait': '대기',
  // REVIEW: new text, needs native-speaker check
  'scoreboard.timer.expired': '시간 만료',
  // REVIEW: new text, needs native-speaker check
  'scoreboard.timer.seconds': '{count}초',
  // REVIEW: new text, needs native-speaker check
  'scoreboard.active': '현재 차례',
  // REVIEW: new text, needs native-speaker check
  'scoreboard.kind.HUMAN': '사람',
  // REVIEW: new text, needs native-speaker check ("AI" is kept as the common loanword)
  'scoreboard.kind.AI': 'AI 플레이어',
  // REVIEW: new text, needs native-speaker check
  'scoreboard.deck': '남은 덱 카드: {count}장',
});
