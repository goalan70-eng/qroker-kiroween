// Area `help`: the rules and help overlay (task 19.3; requirements 16.1, 16.2).
//
// Keys are namespaced `help.<name>`. No placeholders: every value is static text. The overlay reads no game data, so no
// string names a card, a Guess value, a Hidden_Sum value or a point value. The only numbers are rule numbers: the 8×8
// board, the 4 neutral cards, the 2×2 region, the 180° rotation and the Guess range 4 to 52 (help.test.ts pins this).
//
// The sections summarize the approved rules; ui/overlays/help.ts has the table that maps each section to the
// requirement it summarizes. Reused, not duplicated: the close button (`common.button.close`) and the provisional
// scoring label (`common.provisionalScoring`). Terminology follows the `guess`, `reveal` and `hand` areas: English
// "code", "guess", "hidden sum", "hand"; Korean "조합", "예측값", "숨겨진 합", "손패".
//
// Korean text status: every Korean string here is new text and carries `// REVIEW: new text, needs native-speaker
// check`.

export const en = Object.freeze({
  'help.figure.hand': 'Choose one of the three cards in your hand.',
  'help.figure.placement': 'The dots mark legal spaces. Select one beside an existing card, then confirm.',
  'help.figure.code': 'The four corner fragments meet in the center. Aim the scanner at the complete square.',

  'help.open': 'Rules and help',
  'help.title': 'Rules and help',
  'help.intro': 'A short summary of the rules of this game.',

  'help.s1.title': 'Goal',
  'help.s1.body':
    'Players take turns placing cards on a shared board. When placed cards form a code, every player privately guesses its hidden sum, and the points depend on how close each guess is. When the game ends, the player with the highest score has the best rank.',

  'help.s2.title': 'The board',
  'help.s2.body':
    'The board is an 8×8 grid with columns A to H. At the start, 4 neutral cards lie in the middle of the board. Neutral cards belong to nobody. Each player starts with three cards.',

  'help.s3.title': 'Where a card can go',
  'help.s3.body':
    'A new card must touch a card that is already on the board along a full edge. A cell that touches cards only at a corner (diagonally) is not allowed. Cards sit in their cells with no gap between them.',

  'help.s4.title': 'How to place a card',
  'help.s4.body':
    'Drag a card from your hand onto a legal cell, or click the card and the cell in either order. The card stays in preview until you press ✓ beside it. The cancel button and the Escape key discard your choice.',

  'help.s5.title': 'Rotating a card',
  'help.s5.body':
    'Press ↻ beside a previewed club or spade to turn it 180°. Press it again to turn the card back. Hearts and diamonds look the same when rotated, so they have no rotation control.',

  'help.s6.title': 'Codes',
  'help.s6.body':
    'Place four cards in a 2×2 block so the four code fragments meet at the center. A gold border marks each code completed by a placement.',

  'help.s7.title': 'Guesses',
  'help.s7.body':
    'Every player, including the one who placed the card, privately guesses the hidden sum of each new code: the sum of the values of its four cards. A counts as 1, J as 11, Q as 12 and K as 13. A guess is a whole number from 4 to 52. Nobody sees another player\'s guess, and no hidden sum is shown before the reveal.',

  'help.s8.title': 'Drawing cards',
  'help.s8.body':
    'After you place a card that does not complete a new code, you draw one card from the deck. This applies from your first placement. A placement that completes a code draws nothing. Drawing the last card ends the game immediately.',

  'help.s9.title': 'Reveal and points',
  'help.s9.body':
    'When every player has guessed, all players see the points together. In Normal they also see the four cards and their sum. Blind keeps cards hidden and shows the sum only if that feedback was selected. The points depend on the distance between each guess and the hidden sum, and a closer guess never earns fewer points than a farther one. If one placement forms several codes, they are guessed and revealed together. The guesses themselves are not shown.',

  'help.s10.title': 'End of the game and ranking',
  'help.s10.body':
    'The game ends when a player has no cards left in hand or the players have completed at least five codes in total. Every code from the last placement is scored first. Only a player who empties their hand receives an end bonus. If the last card is drawn, the game ends immediately at the current scores. Players are ranked by final score, highest first. Players with equal scores share the same rank, and there is no further tiebreak.',

  'help.visibility.title': 'Card visibility option',
  'help.visibility.body':
    'Normal starts with the four center cards face up. You can see your own placements. Once everyone predicts, the four cards of each completed code stay face up for everyone. In Blind you can see your hand, but all board cards stay face down through the final history. Choose points only or the correct sum and points at setup.',

  'help.provisional.body': 'the point values are a development placeholder and may change.',
} as const);

export const ko: Record<keyof typeof en, string> = Object.freeze({
  // REVIEW: new text, needs native-speaker check
  'help.figure.hand': '손패 세 장 중 놓을 카드 한 장을 고르세요.',
  // REVIEW: new text, needs native-speaker check
  'help.figure.placement': '점이 찍힌 칸에 놓을 수 있습니다. 기존 카드 옆의 칸을 고른 뒤 배치를 확정하세요.',
  // REVIEW: new text, needs native-speaker check
  'help.figure.code': '네 모서리의 조각이 가운데에서 정사각형을 이룹니다. 앱으로 읽을 때는 이곳에 조준하세요.',
  // REVIEW: new text, needs native-speaker check
  'help.open': '규칙과 도움말',
  // REVIEW: new text, needs native-speaker check
  'help.title': '규칙과 도움말',
  // REVIEW: new text, needs native-speaker check
  'help.intro': '이 게임의 규칙을 짧게 정리했습니다.',

  // REVIEW: new text, needs native-speaker check
  'help.s1.title': '목표',
  // REVIEW: new text, needs native-speaker check
  'help.s1.body':
    '플레이어들은 번갈아 가며 공유 보드에 카드를 놓습니다. 놓인 카드들이 조합을 이루면 모든 플레이어가 그 조합의 숨겨진 합을 비공개로 예측하고, 예측값이 얼마나 가까운지에 따라 점수를 받습니다. 게임이 끝났을 때 점수가 가장 높은 플레이어가 가장 높은 순위를 차지합니다.',

  // REVIEW: new text, needs native-speaker check
  'help.s2.title': '보드',
  // REVIEW: new text, needs native-speaker check
  'help.s2.body':
    '보드는 열 A부터 H까지의 8×8 격자입니다. 게임을 시작할 때 중립 카드 4장이 보드 가운데에 놓여 있습니다. 중립 카드는 누구의 것도 아닙니다. 각 플레이어는 손패 세 장으로 시작합니다.',

  // REVIEW: new text, needs native-speaker check
  'help.s3.title': '카드를 놓을 수 있는 곳',
  // REVIEW: new text, needs native-speaker check
  'help.s3.body':
    '새 카드는 이미 보드에 있는 카드와 한 변이 완전히 맞닿아야 합니다. 꼭짓점으로만 닿는 칸(대각선)에는 놓을 수 없습니다. 카드는 칸 사이에 틈 없이 붙어서 놓입니다.',

  // REVIEW: new text, needs native-speaker check
  'help.s4.title': '카드를 놓는 방법',
  // REVIEW: new text, needs native-speaker check
  'help.s4.body':
    '손패에서 카드를 끌어 놓거나, 카드와 놓을 칸을 차례로 누르세요. 칸을 먼저 골라도 됩니다. 카드 옆의 ✓를 누르면 배치가 확정됩니다. 취소 버튼이나 Escape 키를 누르면 선택이 지워집니다.',

  // REVIEW: new text, needs native-speaker check
  'help.s5.title': '카드 회전',
  // REVIEW: new text, needs native-speaker check
  'help.s5.body':
    '클럽과 스페이드는 배치를 확정하기 전에 카드 옆의 ↻로 180° 돌릴 수 있습니다. 한 번 더 누르면 원래 방향으로 돌아옵니다. 하트와 다이아몬드는 회전해도 모양이 같으므로 회전 버튼이 없습니다.',

  // REVIEW: new text, needs native-speaker check
  'help.s6.title': '조합',
  // REVIEW: new text, needs native-speaker check
  'help.s6.body':
    '카드 네 장을 2×2로 놓아 가운데에 네 모서리의 코드 조각이 모이면 조합이 완성됩니다. 카드를 놓아 새로 완성한 자리에는 금색 테두리가 생깁니다.',

  // REVIEW: new text, needs native-speaker check
  'help.s7.title': '예측',
  // REVIEW: new text, needs native-speaker check
  'help.s7.body':
    '카드를 놓은 플레이어를 포함한 모든 플레이어가 새 조합마다 숨겨진 합, 즉 네 카드 값의 합을 비공개로 예측합니다. A는 1, J는 11, Q는 12, K는 13으로 셉니다. 예측값은 4에서 52 사이의 정수입니다. 다른 플레이어의 예측값은 볼 수 없고, 공개 전에는 어떤 숨겨진 합도 표시되지 않습니다.',

  // REVIEW: new text, needs native-speaker check
  'help.s8.title': '카드 뽑기',
  // REVIEW: new text, needs native-speaker check
  'help.s8.body':
    '새 조합을 완성하지 않는 카드를 놓으면 덱에서 카드 한 장을 뽑습니다. 첫 배치부터 이 규칙을 적용합니다. 조합을 완성하면 뽑지 않습니다. 덱의 마지막 카드를 뽑으면 즉시 게임이 끝납니다.',

  // REVIEW: new text, needs native-speaker check
  'help.s9.title': '공개와 점수',
  // REVIEW: new text, needs native-speaker check
  'help.s9.body':
    '모두 예측을 마치면 함께 점수를 확인합니다. 일반에서는 조합의 네 장과 정답 합도 공개됩니다. 블라인드에서는 카드가 계속 가려지고 정답 합은 선택한 설정에 따라 표시됩니다. 점수는 각 예측값과 숨겨진 합의 차이에 따라 정해지며, 더 가까운 예측이 더 먼 예측보다 적은 점수를 받는 일은 없습니다. 한 번의 배치로 조합이 여러 개 만들어지면 함께 예측하고 함께 공개합니다. 예측값 자체는 표시되지 않습니다.',

  // REVIEW: new text, needs native-speaker check
  'help.s10.title': '게임 종료와 순위',
  // REVIEW: new text, needs native-speaker check
  'help.s10.body':
    '한 플레이어의 손패가 비거나 모두가 완성한 조합이 누적 다섯 개에 도달하면 게임이 끝납니다. 마지막 배치에서 생긴 모든 조합의 예측과 채점을 마친 뒤, 손패를 비운 플레이어만 종료 보너스를 받습니다. 덱의 마지막 카드를 뽑으면 그때까지 얻은 점수로 즉시 게임을 끝냅니다. 최종 점수가 높은 순서대로 순위를 매기며, 점수가 같은 플레이어는 같은 순위를 공유합니다. 동점을 가르는 별도의 규칙은 없습니다.',

  // REVIEW: new text, needs native-speaker check
  'help.visibility.title': '카드 공개 방식 설정',
  // REVIEW: new text, needs native-speaker check
  'help.visibility.body':
    '일반에서는 중앙 4장을 앞면으로 놓습니다. 자기가 놓은 카드는 볼 수 있고, 모두 예측하면 완성된 조합의 네 장을 모두에게 공개합니다. 블라인드에서는 자기 손패만 보이고 중앙 카드를 포함한 보드 전체가 끝까지 뒷면입니다. 정답 합과 점수를 볼지, 점수만 볼지 시작 전에 고르세요.',

  // REVIEW: new text, needs native-speaker check
  'help.provisional.body': '점수 값은 개발용 임시 값이며 바뀔 수 있습니다.',
});
