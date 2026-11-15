// Area `common`: application title, generic buttons, seat names, difficulty labels, provisional-scoring banner,
// language selector and the shell notice (task 15.1).
//
// Keys are namespaced `common.<name>`. Placeholders are written `{name}`.
//
// Korean text status:
//   * APPROVED, copied verbatim from the specs: `common.provisionalScoring` ("임시 점수 규칙", requirements 14.8,
//     task 15.1) and the three difficulty labels ("초급", "고급", "전문가"; design.md, AI Strategies, and
//     `DIFFICULTY_LABELS` in ai/strategy.ts; the unit test compares them with that table).
//   * Native names of the languages ("English", "한국어") are proper names and need no review.
//   * Every other Korean string is new text and carries `// REVIEW: new text, needs native-speaker check`.

export const en = Object.freeze({
  'common.appTitle': 'QRoker',
  'common.provisionalScoring': 'provisional scoring',
  'common.shellNotice':
    'The playable game screens are not connected yet. This page only shows the application shell.',

  // Language selector. The language names are shown in their own language in both tables.
  'common.language.label': 'Language',
  'common.languageName.en': 'English',
  'common.languageName.ko': '한국어',

  // Generic buttons.
  'common.button.ok': 'OK',
  'common.button.cancel': 'Cancel',
  'common.button.close': 'Close',
  'common.button.back': 'Back',
  'common.button.next': 'Next',
  'common.button.confirm': 'Confirm',

  // Seat names (the defaults of `defaultConfig` are 'You', 'AI 1', 'AI 2', 'AI 3').
  'common.seat.human': 'You',
  'common.seat.player': 'Player {n}',
  'common.seat.ai': 'AI {n}',

  // Difficulty labels (same wording as DIFFICULTY_LABELS in ai/strategy.ts).
  'common.difficulty.BEGINNER': 'Beginner',
  'common.difficulty.ADVANCED': 'Advanced',
  'common.difficulty.EXPERT': 'Expert',
} as const);

export const ko: Record<keyof typeof en, string> = Object.freeze({
  'common.appTitle': 'QRoker',
  'common.provisionalScoring': '임시 점수 규칙',
  // REVIEW: new text, needs native-speaker check
  'common.shellNotice': '플레이 가능한 게임 화면은 아직 연결되지 않았습니다. 이 페이지는 애플리케이션 셸만 보여 줍니다.',

  // REVIEW: new text, needs native-speaker check
  'common.language.label': '언어',
  'common.languageName.en': 'English',
  'common.languageName.ko': '한국어',

  // REVIEW: new text, needs native-speaker check
  'common.button.ok': '확인',
  // REVIEW: new text, needs native-speaker check
  'common.button.cancel': '취소',
  // REVIEW: new text, needs native-speaker check
  'common.button.close': '닫기',
  // REVIEW: new text, needs native-speaker check
  'common.button.back': '뒤로',
  // REVIEW: new text, needs native-speaker check
  'common.button.next': '다음',
  // REVIEW: new text, needs native-speaker check
  'common.button.confirm': '확정',

  // REVIEW: new text, needs native-speaker check
  'common.seat.human': '나',
  // REVIEW: new text, needs native-speaker check
  'common.seat.player': '플레이어 {n}',
  // REVIEW: new text, needs native-speaker check ("AI" is kept as the common loanword)
  'common.seat.ai': 'AI {n}',

  'common.difficulty.BEGINNER': '초급',
  'common.difficulty.ADVANCED': '고급',
  'common.difficulty.EXPERT': '전문가',
});
