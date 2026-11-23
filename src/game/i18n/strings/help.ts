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
    'There are two ways. Drag a card from your hand onto a legal cell of the board. Or select a cell first and then select a card from your hand (selecting the card first also works). Either way a preview appears, and the card is placed only when you press the confirm button. The cancel button and the Escape key discard your choice.',

  'help.s5.title': 'Rotating a card',
  'help.s5.body':
    'A card can lie upright or be rotated by 180°. Rotation matters only for clubs and spades, where it changes which corners carry the fragments. Hearts and diamonds look the same when rotated, so they have no rotation control.',

  'help.s6.title': 'Codes',
  'help.s6.body':
    'A code forms when the four cards around a 2×2 region of the board each show a fragment in the corner that points to the center of the region. Cards lying side by side are not enough on their own.',

  'help.s7.title': 'Guesses',
  'help.s7.body':
    'Every player, including the one who placed the card, privately guesses the hidden sum of each new code: the sum of the values of its four cards. A guess is a whole number from 4 to 52. Nobody sees another player\'s guess, and no hidden sum is shown before the reveal.',

  'help.s8.title': 'Drawing cards',
  'help.s8.body':
    'After you place a card that does not complete a new code, you draw one card from the deck. This applies from your first placement. A placement that completes a code draws nothing. When the deck is empty nothing is drawn and the game goes on.',

  'help.s9.title': 'Reveal and points',
  'help.s9.body':
    'When every player has guessed, the cards of the code and its hidden sum are revealed to everyone at the same time. The points depend on the distance between each guess and the hidden sum, and a closer guess never earns fewer points than a farther one. If one placement forms several codes, they are guessed and revealed together. The guesses themselves are not shown.',

  'help.s10.title': 'End of the game and ranking',
  'help.s10.body':
    'The game ends when a player has no cards left in hand or the players have completed at least five codes in total. Every code from the last placement is scored first. Only a player who empties their hand receives an end bonus. An empty deck does not end the game. Players are ranked by final score, highest first. Players with equal scores share the same rank, and there is no further tiebreak.',

  'help.visibility.title': 'Card visibility option',
  'help.visibility.body':
    'The setup screen has an option for who can see placed cards. Only the owner sees a card: the player who placed a card sees it until the code that contains it is revealed, then everyone sees it. Neutral cards are visible to everyone. Cards are face up: every placed card is visible to everyone.',

  'help.provisional.body': 'the point values are a development placeholder and may change.',
} as const);

export const ko: Record<keyof typeof en, string> = Object.freeze({
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
    '방법은 두 가지입니다. 손패의 카드를 끌어서 보드의 놓을 수 있는 칸에 놓거나, 먼저 칸을 선택한 다음 손패의 카드를 선택합니다(카드를 먼저 선택해도 됩니다). 어느 쪽이든 미리보기가 나타나며, 배치 확정 버튼을 눌러야 카드가 놓입니다. 취소 버튼이나 Escape 키를 누르면 선택이 지워집니다.',

  // REVIEW: new text, needs native-speaker check
  'help.s5.title': '카드 회전',
  // REVIEW: new text, needs native-speaker check
  'help.s5.body':
    '카드는 바르게 놓거나 180° 회전해서 놓을 수 있습니다. 회전은 클럽과 스페이드에서만 의미가 있으며, 조각이 있는 모서리가 바뀝니다. 하트와 다이아몬드는 회전해도 모양이 같으므로 회전 버튼이 없습니다.',

  // REVIEW: new text, needs native-speaker check
  'help.s6.title': '조합',
  // REVIEW: new text, needs native-speaker check
  'help.s6.body':
    '보드의 2×2 영역을 이루는 네 장의 카드가 모두 영역의 중심을 향한 모서리에 조각을 가지고 있으면 조합이 만들어집니다. 카드가 나란히 놓였다는 것만으로는 조합이 되지 않습니다.',

  // REVIEW: new text, needs native-speaker check
  'help.s7.title': '예측',
  // REVIEW: new text, needs native-speaker check
  'help.s7.body':
    '카드를 놓은 플레이어를 포함한 모든 플레이어가 새 조합마다 숨겨진 합, 즉 네 카드 값의 합을 비공개로 예측합니다. 예측값은 4에서 52 사이의 정수입니다. 다른 플레이어의 예측값은 볼 수 없고, 공개 전에는 어떤 숨겨진 합도 표시되지 않습니다.',

  // REVIEW: new text, needs native-speaker check
  'help.s8.title': '카드 뽑기',
  // REVIEW: new text, needs native-speaker check
  'help.s8.body':
    '새 조합을 완성하지 않는 카드를 놓으면 덱에서 카드 한 장을 뽑습니다. 첫 배치부터 이 규칙을 적용합니다. 조합을 완성하면 뽑지 않습니다. 덱이 비어 있으면 아무것도 뽑지 않고 게임은 계속됩니다.',

  // REVIEW: new text, needs native-speaker check
  'help.s9.title': '공개와 점수',
  // REVIEW: new text, needs native-speaker check
  'help.s9.body':
    '모든 플레이어가 예측을 마치면 조합의 카드와 숨겨진 합이 모두에게 동시에 공개됩니다. 점수는 각 예측값과 숨겨진 합의 차이에 따라 정해지며, 더 가까운 예측이 더 먼 예측보다 적은 점수를 받는 일은 없습니다. 한 번의 배치로 조합이 여러 개 만들어지면 함께 예측하고 함께 공개합니다. 예측값 자체는 표시되지 않습니다.',

  // REVIEW: new text, needs native-speaker check
  'help.s10.title': '게임 종료와 순위',
  // REVIEW: new text, needs native-speaker check
  'help.s10.body':
    '한 플레이어의 손패가 비거나 모두가 완성한 조합이 누적 다섯 개에 도달하면 게임이 끝납니다. 마지막 배치에서 생긴 모든 조합의 예측과 채점을 마친 뒤, 손패를 비운 플레이어만 종료 보너스를 받습니다. 덱이 비는 것만으로는 게임이 끝나지 않습니다. 최종 점수가 높은 순서대로 순위를 매기며, 점수가 같은 플레이어는 같은 순위를 공유합니다. 동점을 가르는 별도의 규칙은 없습니다.',

  // REVIEW: new text, needs native-speaker check
  'help.visibility.title': '카드 공개 방식 설정',
  // REVIEW: new text, needs native-speaker check
  'help.visibility.body':
    '설정 화면에서 놓인 카드를 누가 볼 수 있는지 고를 수 있습니다. 카드 주인만 볼 수 있음: 카드를 놓은 플레이어만 그 카드를 볼 수 있고, 그 카드가 속한 조합이 공개되면 모두가 볼 수 있습니다. 중립 카드는 모두에게 보입니다. 카드를 앞면으로 공개: 놓인 모든 카드를 모든 플레이어가 볼 수 있습니다.',

  // REVIEW: new text, needs native-speaker check
  'help.provisional.body': '점수 값은 개발용 임시 값이며 바뀔 수 있습니다.',
});
