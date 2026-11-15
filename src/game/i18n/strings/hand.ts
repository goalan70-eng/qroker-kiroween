// Area `hand`: the Hand, the placement controls, the status and hint lines, and the drag live-region texts (task 17.3).
//
// Keys are namespaced `hand.<name>`. Placeholders are written `{name}`. Every value is a plain static template.
//
// `{card}` is the accessible name of a card face (area `cards`) of the viewer's OWN Hand card. `{seat}` is a seat
// name from the `common.seat.*` templates ("AI 2", "Player 2"). Nothing here names a card that the viewer cannot
// see, and no string repeats a CardId.
//
// Korean text status: every Korean string here is new text and carries `// REVIEW: new text, needs native-speaker
// check`. The three control labels ("배치 확정", "취소", "180° 회전") are the owner's wording from the task text.

export const en = Object.freeze({
  // The Hand group and its cards.
  'hand.label': 'Your hand',
  'hand.empty': 'Your hand is empty',
  'hand.card.name.selected': '{card}, selected',

  // The placement controls.
  'hand.controls.label': 'Placement controls',
  'hand.confirm': 'Confirm placement',
  'hand.cancel': 'Cancel',
  'hand.rotate': 'Rotate 180°',
  'hand.rotation.state.0': '0° (upright)',
  'hand.rotation.state.180': '180° (rotated)',

  // Hints by draft state (position first or card first; dragging is the third way).
  'hand.hint.idle': 'Select a card or a position on the board. You can also drag a card onto a legal cell.',
  'hand.hint.target': 'Position chosen. Now select a card from your hand.',
  'hand.hint.card': 'Card chosen. Now select a legal position on the board.',
  'hand.hint.preview': 'Preview shown. Confirm the placement or cancel it.',

  // Status while the controls are off.
  'hand.status.ai': '{seat} is playing',
  'hand.status.other': 'Not your turn. Waiting for {seat}.',
  'hand.status.phase': 'No card can be placed in this phase.',

  // Live-region text while a card is dragged.
  'hand.live.dragging': 'Dragging a card. Release it over a legal cell to choose the position.',
  'hand.live.dragCancelled': 'Drag cancelled. Nothing was placed.',
  'hand.live.dropOutside': 'Dropped outside the board. Nothing was placed.',
} as const);

export const ko: Record<keyof typeof en, string> = Object.freeze({
  // REVIEW: new text, needs native-speaker check
  'hand.label': '내 손패',
  // REVIEW: new text, needs native-speaker check
  'hand.empty': '손패가 비었습니다',
  // REVIEW: new text, needs native-speaker check
  'hand.card.name.selected': '{card}, 선택됨',

  // REVIEW: new text, needs native-speaker check
  'hand.controls.label': '배치 컨트롤',
  // REVIEW: new text, needs native-speaker check
  'hand.confirm': '배치 확정',
  // REVIEW: new text, needs native-speaker check
  'hand.cancel': '취소',
  // REVIEW: new text, needs native-speaker check
  'hand.rotate': '180° 회전',
  // REVIEW: new text, needs native-speaker check
  'hand.rotation.state.0': '0° (기본)',
  // REVIEW: new text, needs native-speaker check
  'hand.rotation.state.180': '180° (회전됨)',

  // REVIEW: new text, needs native-speaker check
  'hand.hint.idle': '카드나 보드의 위치를 선택하세요. 카드를 놓을 수 있는 칸으로 끌어다 놓을 수도 있습니다.',
  // REVIEW: new text, needs native-speaker check
  'hand.hint.target': '위치를 선택했습니다. 이제 손패에서 카드를 선택하세요.',
  // REVIEW: new text, needs native-speaker check
  'hand.hint.card': '카드를 선택했습니다. 이제 보드에서 놓을 수 있는 위치를 선택하세요.',
  // REVIEW: new text, needs native-speaker check
  'hand.hint.preview': '미리보기가 표시되었습니다. 배치를 확정하거나 취소하세요.',

  // REVIEW: new text, needs native-speaker check
  'hand.status.ai': '{seat}의 차례입니다',
  // REVIEW: new text, needs native-speaker check
  'hand.status.other': '내 차례가 아닙니다. {seat}의 차례를 기다리고 있습니다.',
  // REVIEW: new text, needs native-speaker check
  'hand.status.phase': '이 단계에서는 카드를 놓을 수 없습니다.',

  // REVIEW: new text, needs native-speaker check
  'hand.live.dragging': '카드를 끌고 있습니다. 놓을 수 있는 칸 위에서 놓으면 위치가 선택됩니다.',
  // REVIEW: new text, needs native-speaker check
  'hand.live.dragCancelled': '끌기가 취소되었습니다. 아무것도 놓이지 않았습니다.',
  // REVIEW: new text, needs native-speaker check
  'hand.live.dropOutside': '보드 밖에 놓았습니다. 아무것도 놓이지 않았습니다.',
});
