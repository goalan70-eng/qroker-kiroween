// Area `guess`: the Pass_Device_Gate and the private Guess entry (task 18.1).
//
// Keys are namespaced `guess.<name>`. Placeholders are written `{name}`:
//   `{name}` a public Seat name, `{key}` a public Quad_Key such as "D4", `{cells}` the public cell notations of the
//   2x2 region of a code, `{min}` and `{max}` the Guess range (the screen passes `GUESS_MIN` and `GUESS_MAX`; the
//   numbers are not written into the texts, so the range stays in core/score only).
// No string names a card, a Guess value or a Hidden_Sum. Missing and out-of-range entries have field-specific messages.
//
// Korean text status: every Korean string here is new text and carries `// REVIEW: new text, needs native-speaker
// check`.

export const en = Object.freeze({
  // Pass_Device_Gate.
  'guess.gate.title': 'Pass the device',
  'guess.gate.hand': 'It is {name}\'s turn to place a card. Hand over the device. Press the button only when {name} is the only one looking at the screen.',
  'guess.gate.guess': '{name} enters Guesses next. Hand over the device. Press the button only when {name} is the only one looking at the screen.',
  'guess.gate.ready': 'I am ready',

  // Guess form.
  'guess.form.label': 'Your Guesses',
  'guess.input.label': 'Code {key}',
  'guess.input.region': 'Code {key}: the 2×2 region of the board with the cells {cells}.',
  'guess.error.range': 'Try again with a whole number from {min} to {max}.',
  'guess.error.missing': 'Enter a whole number from {min} to {max}',
  'guess.submit': 'Submit Guesses',

  // Status after submission, for a stale form and per Seat.
  'guess.status.submitted': 'Your Guesses are submitted. Waiting for the other players.',
  'guess.status.stale': 'This form is out of date. Waiting for the game to continue.',
  'guess.seats.label': 'Guesses submitted',
  'guess.seat.submitted': '{name}: submitted',
  'guess.seat.waiting': '{name}: waiting',
} as const);

export const ko: Record<keyof typeof en, string> = Object.freeze({
  // REVIEW: new text, needs native-speaker check
  'guess.gate.title': '기기를 넘겨주세요',
  // REVIEW: new text, needs native-speaker check
  'guess.gate.hand': '{name}의 카드 배치 차례입니다. 기기를 넘겨주세요. {name}만 화면을 볼 수 있을 때 버튼을 누르세요.',
  // REVIEW: new text, needs native-speaker check
  'guess.gate.guess': '다음은 {name}이(가) 예측값을 입력합니다. 기기를 넘겨주세요. {name}만 화면을 볼 수 있을 때 버튼을 누르세요.',
  // REVIEW: new text, needs native-speaker check
  'guess.gate.ready': '준비되었습니다',

  // REVIEW: new text, needs native-speaker check
  'guess.form.label': '내 예측값',
  // REVIEW: new text, needs native-speaker check
  'guess.input.label': '{key} 조합',
  // REVIEW: new text, needs native-speaker check
  'guess.input.region': '{key} 조합: 보드에서 {cells} 칸으로 이루어진 2×2 영역입니다.',
  // REVIEW: new text, needs native-speaker check
  'guess.error.range': '{min}~{max} 사이의 정수로 다시 입력해 주세요.',
  'guess.error.missing': '{min}에서 {max} 사이의 정수를 입력하세요',
  // REVIEW: new text, needs native-speaker check
  'guess.submit': '예측값 제출',

  // REVIEW: new text, needs native-speaker check
  'guess.status.submitted': '예측값을 제출했습니다. 다른 플레이어를 기다리고 있습니다.',
  // REVIEW: new text, needs native-speaker check
  'guess.status.stale': '이 입력 화면은 더 이상 유효하지 않습니다. 게임이 계속되기를 기다리고 있습니다.',
  // REVIEW: new text, needs native-speaker check
  'guess.seats.label': '예측값 제출 현황',
  // REVIEW: new text, needs native-speaker check
  'guess.seat.submitted': '{name}: 제출함',
  // REVIEW: new text, needs native-speaker check
  'guess.seat.waiting': '{name}: 대기 중',
});
