// Area `reveal`: the public reveal screen (task 18.2).
//
// Keys are namespaced `reveal.<name>`. Placeholders are written `{name}`:
//   `{name}` a public Seat name, `{n}` the 1-based number of the reveal, `{key}` a public Quad_Key, `{sum}` the
//   publicly revealed Hidden_Sum, `{rank}` and `{suit}` the spoken parts of a publicly revealed card.
// No string names a Guess. The provisional-scoring banner reuses `common.provisionalScoring`.
//
// Korean text status: every Korean string here is new text and carries `// REVIEW: new text, needs native-speaker
// check`.

export const en = Object.freeze({
  'reveal.title': 'Reveal',
  'reveal.empty': 'There is no reveal to show yet.',
  'reveal.placer': 'Reveal {n}: the cards were placed by {name}.',

  // One section per completed code.
  'reveal.code.title': 'Code {key}',
  'reveal.code.cards': 'Revealed cards of code {key}',
  'reveal.code.sum': 'Hidden sum: {sum}',
  'reveal.card.name': '{rank} of {suit}',

  // Points table.
  'reveal.points.caption': 'Points of this reveal',
  'reveal.points.seat': 'Player',
  'reveal.points.earned': 'Earned',
  'reveal.points.total': 'Total',
  'reveal.points.final': 'Final score (including any end-of-game bonus)',

  // Continue control and its states.
  'reveal.continue': 'Continue',
  'reveal.status.continuing': 'Continuing the game.',
  'reveal.status.stale': 'This reveal is out of date.',
  'reveal.status.ended': 'The game is over.',
} as const);

export const ko: Record<keyof typeof en, string> = Object.freeze({
  // REVIEW: new text, needs native-speaker check
  'reveal.title': '공개',
  // REVIEW: new text, needs native-speaker check
  'reveal.empty': '아직 공개할 결과가 없습니다.',
  // REVIEW: new text, needs native-speaker check
  'reveal.placer': '공개 {n}: {name}이(가) 카드를 놓았습니다.',

  // REVIEW: new text, needs native-speaker check
  'reveal.code.title': '{key} 조합',
  // REVIEW: new text, needs native-speaker check
  'reveal.code.cards': '{key} 조합의 공개된 카드',
  // REVIEW: new text, needs native-speaker check
  'reveal.code.sum': '숨겨진 합: {sum}',
  // REVIEW: new text, needs native-speaker check
  'reveal.card.name': '{suit} {rank} 카드',

  // REVIEW: new text, needs native-speaker check
  'reveal.points.caption': '이번 공개의 점수',
  // REVIEW: new text, needs native-speaker check
  'reveal.points.seat': '플레이어',
  // REVIEW: new text, needs native-speaker check
  'reveal.points.earned': '획득',
  // REVIEW: new text, needs native-speaker check
  'reveal.points.total': '누적',
  // REVIEW: new text, needs native-speaker check
  'reveal.points.final': '최종 점수 (게임 종료 보너스 포함)',

  // REVIEW: new text, needs native-speaker check
  'reveal.continue': '계속',
  // REVIEW: new text, needs native-speaker check
  'reveal.status.continuing': '게임을 계속합니다.',
  // REVIEW: new text, needs native-speaker check
  'reveal.status.stale': '이 공개 화면은 더 이상 유효하지 않습니다.',
  // REVIEW: new text, needs native-speaker check
  'reveal.status.ended': '게임이 끝났습니다.',
});
