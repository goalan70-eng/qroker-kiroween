// Area `setup`: the setup screen (task 19.1).
//
// Keys are namespaced `setup.<name>`. Placeholders are written `{name}`:
//   `{n}` the 1-based number of an AI seat.
// Reused, not duplicated: the difficulty labels (`common.difficulty.*`), the language selector (`common.language.label`,
// `common.languageName.*`) and the messages of `SEED_EMPTY` and `INVALID_CONFIG` (`error.*`).
// The identity-visibility hint states what each option does and claims nothing about the open question OQ-1.
//
// Korean text status: every Korean string here is new text and carries `// REVIEW: new text, needs native-speaker
// check`.

export const en = Object.freeze({
  'setup.title': 'New game',

  // Seed.
  'setup.seed.label': 'Seed',
  'setup.seed.hint': 'A number from 0 to 4294967295, or any text. The same seed gives the same deal.',
  'setup.seed.random': 'Random seed',

  // Human players.
  'setup.humans.legend': 'Human players',
  'setup.humans.option': '{n}',
  'setup.humans.hint': 'With two or more players the device is passed between them.',

  // AI seats.
  'setup.ai.legend': 'AI players',
  'setup.ai.label': 'Difficulty of AI {n}',
  'setup.ai.none': 'Every seat is a human player, so there is no AI difficulty to choose.',

  // Identity visibility.
  'setup.visibility.legend': 'Card identities',
  'setup.visibility.OWNER_ONLY': 'Only the owner sees a card',
  'setup.visibility.FACE_UP': 'Cards are face up',
  'setup.visibility.default': '(default)',
  'setup.visibility.hint': 'Chooses whether other players can see which card is on the board.',

  'setup.start': 'Start game',
} as const);

export const ko: Record<keyof typeof en, string> = Object.freeze({
  // REVIEW: new text, needs native-speaker check
  'setup.title': '새 게임',

  // REVIEW: new text, needs native-speaker check
  'setup.seed.label': '시드',
  // REVIEW: new text, needs native-speaker check
  'setup.seed.hint': '0에서 4294967295 사이의 숫자나 아무 문장을 입력하세요. 같은 시드는 같은 카드 배분을 만듭니다.',
  // REVIEW: new text, needs native-speaker check
  'setup.seed.random': '무작위 시드',

  // REVIEW: new text, needs native-speaker check
  'setup.humans.legend': '사람 플레이어 수',
  // REVIEW: new text, needs native-speaker check
  'setup.humans.option': '{n}명',
  // REVIEW: new text, needs native-speaker check
  'setup.humans.hint': '두 명 이상이면 기기를 서로 넘겨 가며 플레이합니다.',

  // REVIEW: new text, needs native-speaker check
  'setup.ai.legend': 'AI 플레이어',
  // REVIEW: new text, needs native-speaker check
  'setup.ai.label': 'AI {n}의 난이도',
  // REVIEW: new text, needs native-speaker check
  'setup.ai.none': '모든 자리가 사람 플레이어이므로 선택할 AI 난이도가 없습니다.',

  // REVIEW: new text, needs native-speaker check
  'setup.visibility.legend': '카드 공개 방식',
  // REVIEW: new text, needs native-speaker check
  'setup.visibility.OWNER_ONLY': '카드 주인만 볼 수 있음',
  // REVIEW: new text, needs native-speaker check
  'setup.visibility.FACE_UP': '카드를 앞면으로 공개',
  // REVIEW: new text, needs native-speaker check
  'setup.visibility.default': '(기본값)',
  // REVIEW: new text, needs native-speaker check
  'setup.visibility.hint': '보드 위 카드가 무엇인지 다른 플레이어에게 보일지 정합니다.',

  // REVIEW: new text, needs native-speaker check
  'setup.start': '게임 시작',
});
