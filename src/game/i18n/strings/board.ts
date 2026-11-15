// Area `board`: the accessible names and hint text of the Board (task 17.2).
//
// Keys are namespaced `board.<name>`. Placeholders are written `{name}`. Every value is a plain static template.
//
// The names of an occupied cell reuse the card face name of area `cards` through `{card}`, so a face-down cell is
// named with its owner and orientation only (the face name has no rank or suit). Nothing here names a hidden card.
// Cell notation ('A1' to 'H8') is language-neutral and is passed as `{notation}`.
//
// Korean text status: every Korean string here is new text and carries `// REVIEW: new text, needs native-speaker
// check`.

export const en = Object.freeze({
  // The grid itself and the description that explains the markers (read through aria-describedby).
  'board.grid.label': 'Game board, 8 by 8 cells, columns A to H, rows 1 to 8',
  'board.hint':
    'Use the arrow keys to move between cells. Cells with a dot and a dashed outline are legal placements. Press Enter or Space on a legal cell to choose it as the target. Press Escape to clear the placement.',

  // Cell names, by state. `{card}` is the accessible name of a card face (area `cards`).
  'board.cell.name.empty': '{notation}, empty',
  'board.cell.name.legal': '{notation}, empty, legal placement',
  'board.cell.name.target': '{notation}, empty, selected target',
  'board.cell.name.preview': '{notation}, selected target, preview: {card}',
  'board.cell.name.up': '{notation}, occupied, {card}',
  'board.cell.name.down': '{notation}, occupied, {card}',

  // The name of a cell inside a 2x2 code region: {name} is the name built from the state above.
  'board.cell.name.pending': '{name}, part of a code awaiting guesses',
  'board.cell.name.revealed': '{name}, part of a revealed code',
} as const);

export const ko: Record<keyof typeof en, string> = Object.freeze({
  // REVIEW: new text, needs native-speaker check
  'board.grid.label': '게임 보드, 8×8 칸, 열 A부터 H, 행 1부터 8',
  // REVIEW: new text, needs native-speaker check
  'board.hint':
    '방향키로 칸 사이를 이동합니다. 점과 점선 테두리가 있는 칸은 놓을 수 있는 칸입니다. 놓을 수 있는 칸에서 Enter 또는 Space를 누르면 목표 칸으로 선택됩니다. Escape를 누르면 배치를 취소합니다.',

  // REVIEW: new text, needs native-speaker check
  'board.cell.name.empty': '{notation}, 빈 칸',
  // REVIEW: new text, needs native-speaker check
  'board.cell.name.legal': '{notation}, 빈 칸, 놓을 수 있는 칸',
  // REVIEW: new text, needs native-speaker check
  'board.cell.name.target': '{notation}, 빈 칸, 선택된 목표 칸',
  // REVIEW: new text, needs native-speaker check
  'board.cell.name.preview': '{notation}, 선택된 목표 칸, 미리보기: {card}',
  // REVIEW: new text, needs native-speaker check
  'board.cell.name.up': '{notation}, 카드 있음, {card}',
  // REVIEW: new text, needs native-speaker check
  'board.cell.name.down': '{notation}, 카드 있음, {card}',

  // REVIEW: new text, needs native-speaker check
  'board.cell.name.pending': '{name}, 추측을 기다리는 코드의 일부',
  // REVIEW: new text, needs native-speaker check
  'board.cell.name.revealed': '{name}, 공개된 코드의 일부',
});
