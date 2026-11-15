// Area `cards`: spoken names of card faces (task 17.1): suit names, the names of the four face ranks, the
// orientation and owner phrases, and the accessible-name templates of a face-up and a face-down card.
//
// Keys are namespaced `cards.<name>`. Placeholders are written `{name}`. Every value is a plain static template.
// The numeral ranks (2 to 10) need no table entry: the rank digits are the same in both languages and are passed
// to the template as a parameter. The visible rank letters A, J, Q, K are language-neutral symbols and are drawn by
// the component itself; the entries below are only their spoken names.
//
// Korean text status: every Korean string here is new text and carries `// REVIEW: new text, needs native-speaker
// check`.

export const en = Object.freeze({
  // Suit names (the key suffix is the Suit letter of core/types).
  'cards.suit.H': 'Hearts',
  'cards.suit.D': 'Diamonds',
  'cards.suit.C': 'Clubs',
  'cards.suit.S': 'Spades',

  // Spoken names of the face ranks (the key suffix is the Rank of core/types).
  'cards.rank.A': 'Ace',
  'cards.rank.J': 'Jack',
  'cards.rank.Q': 'Queen',
  'cards.rank.K': 'King',

  // Orientation of the card as it lies on the Board (the key suffix is the Orientation value of core/types).
  'cards.orientation.0': 'upright (0°)',
  'cards.orientation.180': 'rotated 180°',

  // Owner of a Neutral_Card. Seat owners use the `common.seat.*` names, which the caller passes as `ownerLabel`.
  'cards.owner.NEUTRAL': 'Neutral',

  // Accessible names. `{rank}` is a digit or a `cards.rank.*` name, `{suit}` a `cards.suit.*` name.
  'cards.name.up': '{rank} of {suit}, {orientation}, owner: {owner}',
  'cards.name.down': 'Face-down card, {orientation}, owner: {owner}',
} as const);

export const ko: Record<keyof typeof en, string> = Object.freeze({
  // REVIEW: new text, needs native-speaker check
  'cards.suit.H': '하트',
  // REVIEW: new text, needs native-speaker check
  'cards.suit.D': '다이아몬드',
  // REVIEW: new text, needs native-speaker check
  'cards.suit.C': '클럽',
  // REVIEW: new text, needs native-speaker check
  'cards.suit.S': '스페이드',

  // REVIEW: new text, needs native-speaker check
  'cards.rank.A': '에이스',
  // REVIEW: new text, needs native-speaker check
  'cards.rank.J': '잭',
  // REVIEW: new text, needs native-speaker check
  'cards.rank.Q': '퀸',
  // REVIEW: new text, needs native-speaker check
  'cards.rank.K': '킹',

  // REVIEW: new text, needs native-speaker check
  'cards.orientation.0': '바르게 놓임 (0°)',
  // REVIEW: new text, needs native-speaker check
  'cards.orientation.180': '180° 회전됨',

  // REVIEW: new text, needs native-speaker check
  'cards.owner.NEUTRAL': '중립',

  // REVIEW: new text, needs native-speaker check
  'cards.name.up': '{suit} {rank}, {orientation}, 소유자: {owner}',
  // REVIEW: new text, needs native-speaker check
  'cards.name.down': '뒤집힌 카드, {orientation}, 소유자: {owner}',
});
