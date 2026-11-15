// Area `end`: the final screen (task 19.2).
//
// Keys are namespaced `end.<name>`. Placeholders are written `{name}`:
//   `{cells}` the public board cells of a code's 2x2 region (for example "D4, E4, D5, E5"), `{n}` the 1-based number of a
//   reveal.
// Reused instead of duplicated (see ui/screens/end.ts): the code title, hidden sum, card names, cards label, "Reveal n:
// placed by" line and the per-batch points headings come from `reveal.*`; the seat column, hand count and seat kinds from
// `reveal.points.seat`, `scoreboard.col.hand` and `scoreboard.kind.*`; the provisional banner from
// `common.provisionalScoring`.
// No string names a Guess, a card or a point value.
//
// Korean text status: every Korean string here is new text and carries `// REVIEW: new text, needs native-speaker
// check`.

export const en = Object.freeze({
  'end.title': 'Game over',
  'end.empty': 'There is no final result to show yet.',

  // Final ranking table.
  'end.ranking.caption': 'Final ranking',
  'end.col.rank': 'Rank',
  'end.col.final': 'Final score',
  'end.col.reveals': 'Points from reveals',
  'end.col.bonus': 'End bonus (difference)',
  'end.tied': 'tied',
  'end.note': 'The final score is the number reported by the game. The end bonus is only the final score minus the points from reveals.',

  // History of every reveal.
  'end.history.title': 'Reveal history',
  'end.history.empty': 'No code was revealed in this game.',
  'end.history.cells': 'Board cells: {cells}',
  'end.history.points': 'Points of reveal {n}',

  // Controls and their states.
  'end.controls.label': 'What next',
  'end.rematch': 'Rematch',
  'end.rematch.hint': 'Same players and options, new seed.',
  'end.replay': 'Replay same seed',
  'end.replay.hint': 'Same players, options and seed: the same deal.',
  'end.newSetup': 'New setup',
  'end.newSetup.hint': 'Go back to the setup screen.',
  'end.status.sent': 'Leaving the final screen.',
  'end.status.stale': 'This final screen is out of date.',
  'end.error.inconsistent': 'The final ranking cannot be shown because the ranking and the scores do not match.',
} as const);

export const ko: Record<keyof typeof en, string> = Object.freeze({
  // REVIEW: new text, needs native-speaker check
  'end.title': '게임 종료',
  // REVIEW: new text, needs native-speaker check
  'end.empty': '아직 보여 줄 최종 결과가 없습니다.',

  // REVIEW: new text, needs native-speaker check
  'end.ranking.caption': '최종 순위',
  // REVIEW: new text, needs native-speaker check
  'end.col.rank': '순위',
  // REVIEW: new text, needs native-speaker check
  'end.col.final': '최종 점수',
  // REVIEW: new text, needs native-speaker check
  'end.col.reveals': '공개로 얻은 점수',
  // REVIEW: new text, needs native-speaker check
  'end.col.bonus': '종료 보너스 (차이)',
  // REVIEW: new text, needs native-speaker check
  'end.tied': '동점',
  // REVIEW: new text, needs native-speaker check
  'end.note': '최종 점수는 게임이 알려 주는 값입니다. 종료 보너스는 최종 점수에서 공개로 얻은 점수를 뺀 차이일 뿐입니다.',

  // REVIEW: new text, needs native-speaker check
  'end.history.title': '공개 기록',
  // REVIEW: new text, needs native-speaker check
  'end.history.empty': '이번 게임에서 공개된 조합이 없습니다.',
  // REVIEW: new text, needs native-speaker check
  'end.history.cells': '판 위의 칸: {cells}',
  // REVIEW: new text, needs native-speaker check
  'end.history.points': '공개 {n}의 점수',

  // REVIEW: new text, needs native-speaker check
  'end.controls.label': '다음 선택',
  // REVIEW: new text, needs native-speaker check
  'end.rematch': '다시 하기',
  // REVIEW: new text, needs native-speaker check
  'end.rematch.hint': '같은 플레이어와 설정, 새 시드.',
  // REVIEW: new text, needs native-speaker check
  'end.replay': '같은 시드로 다시 하기',
  // REVIEW: new text, needs native-speaker check
  'end.replay.hint': '같은 플레이어, 설정, 시드: 같은 카드 배분.',
  // REVIEW: new text, needs native-speaker check
  'end.newSetup': '새 설정',
  // REVIEW: new text, needs native-speaker check
  'end.newSetup.hint': '설정 화면으로 돌아갑니다.',
  // REVIEW: new text, needs native-speaker check
  'end.status.sent': '최종 화면을 떠납니다.',
  // REVIEW: new text, needs native-speaker check
  'end.status.stale': '이 최종 화면은 더 이상 유효하지 않습니다.',
  // REVIEW: new text, needs native-speaker check
  'end.error.inconsistent': '순위와 점수가 맞지 않아 최종 순위를 보여 줄 수 없습니다.',
});
