// Area `persistence`: the texts of the resume prompt (`ui/screens/resume.ts`) and of the notices and the autosave status
// line (`ui/components/notices.ts`), task 20.4.
//
// Keys are namespaced `persistence.<name>`. Placeholders are written `{name}`: `{time}` the saved time as
// `YYYY-MM-DD HH:MM UTC`, `{n}` the number of human players. No text names a card, a Guess, a Seed or an engine detail.
// A notice text never claims "saved" for a storage that is not durable; the status line exists for `DURABLE` only.
//
// Korean text status: every Korean string here is new text and carries `// REVIEW: new text, needs native-speaker
// check`.
export const en = Object.freeze({
  // Resume prompt.
  'persistence.resume.title': 'A game in progress was found',
  'persistence.resume.body': 'A game in progress was found in this browser. You can continue it or discard it.',
  'persistence.resume.savedAt': 'Saved: {time}',
  'persistence.resume.humans': 'Human players: {n}',
  'persistence.resume.hint':
    'Nothing of the game is shown until you continue. With several human players, a hand-over screen appears first.',
  'persistence.resume.continue': 'Continue',
  'persistence.resume.discard': 'Discard saved game',
  'persistence.resume.discardFailed': 'Could not delete the saved game. You can continue it or try again.',
  'persistence.resume.confirmTitle': 'Discard this game?',
  'persistence.resume.confirmBody': 'This removes your saved progress. You cannot undo this.',

  // Notices (aria-live region).
  'persistence.notices.label': 'Saving',
  'persistence.notice.SAVE_CHANGED': 'The saved game changed in another tab. Progress in this tab cannot be saved. Reload to use the latest save.',
  'persistence.notice.REMOVAL_FAILED': 'The saved game could not be resumed or removed.',
  'persistence.notice.dismiss': 'Dismiss',
  'persistence.notice.STORAGE_NOT_DURABLE':
    'This browser cannot keep data after the page is closed. The game continues, but it will be lost if you reload or close the page.',
  'persistence.notice.STORAGE_WRITE_FAILED':
    'The game continues, but it cannot be saved: it will be lost if you reload or close the page.',
  'persistence.notice.STORAGE_READ_FAILED': 'Saved data could not be read. A new game can still be played.',
  'persistence.notice.SAVE_DISCARDED.CORRUPT': 'The saved game cannot be continued. It was removed.',
  'persistence.notice.SAVE_DISCARDED.SAVE_VERSION': 'The saved game cannot be continued. It was made by another version of the game.',
  'persistence.notice.SAVE_DISCARDED.RULES_VERSION': 'The saved game cannot be continued. It follows other game rules.',
  'persistence.notice.SAVE_DISCARDED.REPLAY_REJECTED': 'The saved game cannot be continued. It could not be restored.',
  'persistence.notice.SAVE_DISCARDED.GAME_ENDED': 'The saved game cannot be continued. It was already finished.',
  'persistence.notice.SAVE_DISCARDED.INVALID_VALUE': 'The saved game cannot be continued. Its data is not valid.',

  // Autosave status line (shown only after a durable save).
  'persistence.status.durable': 'Progress is saved automatically in this browser.',
  'persistence.status.notSecret':
    'The save is not secret: anyone who uses this browser can read it with the developer tools.',
} as const);

export const ko: Record<keyof typeof en, string> = Object.freeze({
  // REVIEW: new text, needs native-speaker check
  'persistence.resume.title': '진행 중인 게임이 있습니다',
  // REVIEW: new text, needs native-speaker check
  'persistence.resume.body': '이 브라우저에서 진행 중인 게임을 찾았습니다. 이어서 하거나 삭제할 수 있습니다.',
  // REVIEW: new text, needs native-speaker check
  'persistence.resume.savedAt': '저장 시각: {time}',
  // REVIEW: new text, needs native-speaker check
  'persistence.resume.humans': '사람 플레이어: {n}명',
  // REVIEW: new text, needs native-speaker check
  'persistence.resume.hint':
    '이어하기를 누르기 전에는 게임의 내용이 표시되지 않습니다. 사람 플레이어가 여러 명이면 먼저 기기 전달 화면이 나옵니다.',
  // REVIEW: new text, needs native-speaker check
  'persistence.resume.continue': '이어하기',
  // REVIEW: new text, needs native-speaker check
  'persistence.resume.discard': '저장된 게임 삭제',
  // REVIEW: new text, needs native-speaker check
  'persistence.resume.discardFailed': '저장된 게임을 삭제하지 못했습니다. 이어서 하거나 다시 삭제할 수 있습니다.',
  // REVIEW: new text, needs native-speaker check
  'persistence.resume.confirmTitle': '진행 중인 게임을 삭제할까요?',
  // REVIEW: new text, needs native-speaker check
  'persistence.resume.confirmBody': '삭제하면 이 판을 다시 이어갈 수 없습니다.',

  // REVIEW: new text, needs native-speaker check
  'persistence.notices.label': '저장',
  // REVIEW: new text, needs native-speaker check
  'persistence.notice.REMOVAL_FAILED': '저장된 게임을 이어갈 수 없고, 저장본도 삭제하지 못했습니다.',
  // REVIEW: new text, needs native-speaker check
  'persistence.notice.dismiss': '알림 닫기',
  // REVIEW: new text, needs native-speaker check
  'persistence.notice.STORAGE_NOT_DURABLE':
    '이 브라우저는 페이지를 닫은 뒤에 데이터를 보관하지 못합니다. 게임은 계속되지만, 페이지를 새로 고치거나 닫으면 사라집니다.',
  // REVIEW: new text, needs native-speaker check
  'persistence.notice.STORAGE_WRITE_FAILED': '게임은 계속되지만 저장할 수 없습니다. 페이지를 새로 고치거나 닫으면 사라집니다.',
  // REVIEW: new text, needs native-speaker check
  'persistence.notice.SAVE_CHANGED': '다른 탭에서 저장 기록을 변경해 이 탭의 진행 상황을 저장할 수 없습니다. 최신 기록을 사용하려면 새로고침하세요.',
  // REVIEW: new text, needs native-speaker check
  'persistence.notice.STORAGE_READ_FAILED': '저장된 데이터를 읽을 수 없습니다. 새 게임은 그대로 할 수 있습니다.',
  // REVIEW: new text, needs native-speaker check
  'persistence.notice.SAVE_DISCARDED.CORRUPT': '저장된 게임을 이어서 할 수 없어 삭제했습니다.',
  // REVIEW: new text, needs native-speaker check
  'persistence.notice.SAVE_DISCARDED.SAVE_VERSION': '저장된 게임을 이어서 할 수 없습니다. 다른 버전의 게임에서 저장된 것입니다.',
  // REVIEW: new text, needs native-speaker check
  'persistence.notice.SAVE_DISCARDED.RULES_VERSION': '저장된 게임을 이어서 할 수 없습니다. 다른 게임 규칙으로 저장된 것입니다.',
  // REVIEW: new text, needs native-speaker check
  'persistence.notice.SAVE_DISCARDED.REPLAY_REJECTED': '저장된 게임을 이어서 할 수 없습니다. 복원하지 못했습니다.',
  // REVIEW: new text, needs native-speaker check
  'persistence.notice.SAVE_DISCARDED.GAME_ENDED': '저장된 게임을 이어서 할 수 없습니다. 이미 끝난 게임입니다.',
  // REVIEW: new text, needs native-speaker check
  'persistence.notice.SAVE_DISCARDED.INVALID_VALUE': '저장된 게임을 이어서 할 수 없습니다. 저장된 데이터가 올바르지 않습니다.',

  // REVIEW: new text, needs native-speaker check
  'persistence.status.durable': '진행 상황이 이 브라우저에 자동으로 저장됩니다.',
  // REVIEW: new text, needs native-speaker check
  'persistence.status.notSecret': '저장 내용은 비밀이 아닙니다. 이 브라우저를 쓰는 사람은 개발자 도구로 읽을 수 있습니다.',
});
