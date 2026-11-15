// Tests of the error message strings (task 15.2; requirements 12.7 and 16.3; Property 29 covers key-set and
// placeholder parity for every area and is not repeated here).
//
// Node-side test: it reads the specs and the source of strings/errors.ts with node:fs.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { ErrorCode } from '../core/types';
import { errorMessageKey, resetLanguage, setLanguage, t } from './index';
import type { ErrorStringKey, Lang } from './index';
import { en, ko } from './strings/errors';

afterEach(() => {
  resetLanguage();
});

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const readText = (...parts: string[]): string => readFileSync(resolve(REPO, ...parts), 'utf8');

const ORIGINAL_DESIGN = readText('.kiro', 'specs', 'qroker-game', 'design.md');
const PLAYABLE_DESIGN = readText('.kiro', 'specs', 'qroker-playable-game', 'design.md');
const ERRORS_SOURCE = readText('src', 'game', 'i18n', 'strings', 'errors.ts');

const REVIEW_MARKER = '// REVIEW: new text, needs native-speaker check';

// ---------------------------------------------------------------------------------------------------------
// Independent expectations (written out here, not read from errors.ts)
// ---------------------------------------------------------------------------------------------------------

/** The 5 approved placement messages, copied from qroker-game design.md, "Placement errors". */
const APPROVED_KO = {
  OUT_OF_BOUNDS: '유효하지 않은 위치',
  OCCUPIED: '이미 카드가 있는 위치',
  NOT_ADJACENT: '기존 카드와 인접해야 합니다',
  INVALID_ORIENTATION: '90°/270° 배치는 지원하지 않습니다',
  CARD_NOT_IN_HAND: '손패에 없는 카드',
} as const;
const APPROVED_EN = {
  OUT_OF_BOUNDS: 'Invalid position',
  OCCUPIED: 'Position already has a card',
  NOT_ADJACENT: 'Must be adjacent to an existing card',
  INVALID_ORIENTATION: '90°/270° placement is not supported',
  CARD_NOT_IN_HAND: 'Card not in hand',
} as const;
const APPROVED_CODES = Object.keys(APPROVED_KO) as (keyof typeof APPROVED_KO)[];

/** All 18 codes with their texts. `satisfies` makes the list exhaustive over the engine's ErrorCode union. */
const EXPECTED = {
  OUT_OF_BOUNDS: { en: 'Invalid position', ko: '유효하지 않은 위치' },
  OCCUPIED: { en: 'Position already has a card', ko: '이미 카드가 있는 위치' },
  NOT_ADJACENT: { en: 'Must be adjacent to an existing card', ko: '기존 카드와 인접해야 합니다' },
  INVALID_ORIENTATION: { en: '90°/270° placement is not supported', ko: '90°/270° 배치는 지원하지 않습니다' },
  CARD_NOT_IN_HAND: { en: 'Card not in hand', ko: '손패에 없는 카드' },
  NOT_YOUR_TURN: { en: 'It is not your turn', ko: '지금은 내 차례가 아닙니다' },
  WRONG_PHASE: { en: 'This action is not available now', ko: '지금은 할 수 없는 동작입니다' },
  GAME_ENDED: { en: 'The game has already ended', ko: '게임이 이미 끝났습니다' },
  GUESS_NOT_INTEGER: { en: 'Enter a whole number', ko: '정수만 입력할 수 있습니다' },
  GUESS_OUT_OF_RANGE: { en: 'The guess must be between 4 and 52', ko: '예측값은 4에서 52 사이여야 합니다' },
  DUPLICATE_SUBMISSION: { en: 'Already submitted', ko: '이미 제출했습니다' },
  GUESS_KEYS_MISMATCH: { en: 'A guess is required for every code', ko: '모든 조합에 예측값이 필요합니다' },
  INVALID_SCORE_CONFIG: { en: 'The score configuration is invalid', ko: '점수 설정이 올바르지 않습니다' },
  INVALID_CONFIG: { en: 'The game configuration is invalid', ko: '게임 설정이 올바르지 않습니다' },
  INVALID_CARD_ID: { en: 'Unknown card', ko: '알 수 없는 카드입니다' },
  SEED_EMPTY: { en: 'Enter a seed', ko: '시드를 입력하세요' },
  UNKNOWN_PLAYER: { en: 'Unknown player', ko: '알 수 없는 플레이어입니다' },
  REPLAY_REJECTED: { en: 'The saved game cannot be continued', ko: '저장된 게임을 이어할 수 없습니다' },
} as const satisfies Record<ErrorCode, { readonly en: string; readonly ko: string }>;

const CODES = Object.keys(EXPECTED) as ErrorCode[];
const LANGS: readonly Lang[] = ['en', 'ko'];
const TABLES = { en, ko } as const;

// Compile-level coverage: both tables hold exactly the keys `error.<ErrorCode>`.
const _enCoversAllCodes: Readonly<Record<ErrorStringKey, string>> = en;
const _koCoversAllCodes: Readonly<Record<ErrorStringKey, string>> = ko;
const _noExtraKeys: ErrorStringKey = '' as keyof typeof en;
void _enCoversAllCodes;
void _koCoversAllCodes;
void _noExtraKeys;

const tableText = (lang: Lang, code: ErrorCode): string =>
  (TABLES[lang] as Readonly<Record<string, string>>)[errorMessageKey(code)] as string;

// ---------------------------------------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------------------------------------

describe('error strings: coverage', () => {
  it('the literal list has the 18 codes of the closed ErrorCode set', () => {
    expect(CODES).toHaveLength(18);
    expect(new Set(CODES).size).toBe(18);
  });

  it('every ErrorCode has a non-empty entry in both languages, and the tables hold no other key', () => {
    for (const lang of LANGS) {
      const keys = Object.keys(TABLES[lang]).sort();
      expect(keys, lang).toEqual(CODES.map((c) => `error.${c}`).sort());
      for (const code of CODES) {
        const text = tableText(lang, code);
        expect(typeof text, `${lang} ${code}`).toBe('string');
        expect(text.trim().length, `${lang} ${code}`).toBeGreaterThan(0);
      }
    }
  });

  it('the texts equal the expected literals', () => {
    for (const code of CODES) {
      expect(tableText('en', code), `en ${code}`).toBe(EXPECTED[code].en);
      expect(tableText('ko', code), `ko ${code}`).toBe(EXPECTED[code].ko);
    }
  });

  it('the texts equal the Error Handling table of the playable-game design', () => {
    const rows = new Map<string, { ko: string; en: string }>();
    for (const line of PLAYABLE_DESIGN.split(/\r?\n/)) {
      const m = /^\| `([A-Z_]+)` \|/.exec(line);
      if (m === null) continue;
      const cells = line.split('|').map((c) => c.trim());
      // cells: '', code, condition, state effect, Korean, English, ''
      if (cells.length === 7) rows.set(m[1] as string, { ko: cells[4] as string, en: cells[5] as string });
    }
    for (const code of CODES) {
      const row = rows.get(`${code}`);
      expect(row, `design row of ${code}`).toBeDefined();
      expect(tableText('ko', code), `ko ${code}`).toBe((row as { ko: string }).ko);
      expect(tableText('en', code), `en ${code}`).toBe((row as { en: string }).en);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
// The five approved Korean placement messages
// ---------------------------------------------------------------------------------------------------------

describe('error strings: the 5 approved Korean placement messages', () => {
  it('equal the string literals written in this test', () => {
    expect(APPROVED_CODES).toHaveLength(5);
    for (const code of APPROVED_CODES) {
      expect(tableText('ko', code), `ko ${code}`).toBe(APPROVED_KO[code]);
      expect(tableText('en', code), `en ${code}`).toBe(APPROVED_EN[code]);
    }
  });

  it('occur verbatim in the approved qroker-game design (Korean in quotes, English in parentheses)', () => {
    for (const code of APPROVED_CODES) {
      const ko5 = tableText('ko', code);
      const en5 = tableText('en', code);
      expect(ORIGINAL_DESIGN.includes(`"${ko5}" (${en5})`), `original design has "${ko5}" (${en5})`).toBe(true);
      // The playable design repeats them in its table cell.
      expect(PLAYABLE_DESIGN.includes(`| ${ko5} | ${en5} |`), `playable design row of ${code}`).toBe(true);
    }
  });

  it('are in Unicode normalization form NFC and contain no zero-width or non-breaking spaces', () => {
    for (const code of APPROVED_CODES) {
      const s = tableText('ko', code);
      expect(s.normalize('NFC'), code).toBe(s);
      expect(/[\u200B-\u200D\uFEFF\u00A0]/.test(s), code).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
// Review markers
// ---------------------------------------------------------------------------------------------------------

describe('error strings: REVIEW markers in strings/errors.ts', () => {
  const koSection = ERRORS_SOURCE.slice(ERRORS_SOURCE.indexOf('export const ko'));
  const lines = koSection.split(/\r?\n/);
  const entryLine = (code: ErrorCode): number => lines.findIndex((l) => l.trimStart().startsWith(`'error.${code}':`));

  it('every non-approved Korean entry has the marker on the line above, and no approved entry has it', () => {
    const nonApproved = CODES.filter((c) => !(APPROVED_CODES as readonly string[]).includes(c));
    expect(nonApproved).toHaveLength(13);
    for (const code of nonApproved) {
      const i = entryLine(code);
      expect(i, `ko entry of ${code}`).toBeGreaterThan(0);
      const carries = lines[i - 1]?.trim() === REVIEW_MARKER || lines[i]?.includes(REVIEW_MARKER) === true;
      expect(carries, `${code} is marked`).toBe(true);
    }
    for (const code of APPROVED_CODES) {
      const i = entryLine(code);
      expect(i, `ko entry of ${code}`).toBeGreaterThan(0);
      expect(lines[i - 1]?.includes('REVIEW'), `${code} (approved) has no marker above`).toBe(false);
      expect(lines[i]?.includes('REVIEW'), `${code} (approved) has no marker on its line`).toBe(false);
    }
  });

  it('the marker count in the Korean table is at least the number of non-approved entries (and not more than that)', () => {
    const count = lines.filter((l) => l.trim() === REVIEW_MARKER).length;
    expect(count).toBeGreaterThanOrEqual(13);
    expect(count).toBe(13);
  });
});

// ---------------------------------------------------------------------------------------------------------
// User-facing messages hold no internal diagnostic data
// ---------------------------------------------------------------------------------------------------------

describe('error strings: no internal diagnostic data in the messages', () => {
  /** Codes whose message legitimately contains digits (the Guess range 4-52, the orientations 90 and 270). */
  const DIGIT_CODES: readonly ErrorCode[] = ['GUESS_OUT_OF_RANGE', 'INVALID_ORIENTATION'];

  it('has no placeholders, braces, brackets, quotes, line breaks or markup', () => {
    for (const lang of LANGS) {
      for (const code of CODES) {
        const text = tableText(lang, code);
        expect(/[{}[\]<>"`\n\r\t]/.test(text), `${lang} ${code}`).toBe(false);
      }
    }
  });

  it('has no stack frames, file paths, JSON, debug words, group ids or card ids', () => {
    for (const lang of LANGS) {
      for (const code of CODES) {
        const text = tableText(lang, code);
        const where = `${lang} ${code}: ${text}`;
        expect(/\bat\s+\S+\s*\(/.test(text), `${where} (stack frame)`).toBe(false);
        expect(/\bat\s+\S+:\d+/.test(text), `${where} (stack frame location)`).toBe(false);
        expect(/[\\/][A-Za-z]/.test(text), `${where} (path separator before a letter)`).toBe(false);
        expect(/[A-Za-z]:\\/.test(text) || text.includes(':\\'), `${where} (drive path)`).toBe(false);
        expect(/\.(?:ts|js|json|map)\b/i.test(text), `${where} (file name)`).toBe(false);
        expect(/groupId/i.test(text), `${where} (groupId)`).toBe(false);
        expect(/log/i.test(text), `${where} (log)`).toBe(false);
        expect(/[HDCS]-(?:10|[2-9AJQK])/.test(text), `${where} (card id)`).toBe(false);
        expect(/undefined|null|NaN|\[object|Error:|Exception/.test(text), `${where} (debug word)`).toBe(false);
        expect(/\d{4,}/.test(text), `${where} (long number: seed, index, id)`).toBe(false);
      }
    }
  });

  it('contains digits only where the design states a fixed number (Guess range 4-52, orientations 90 and 270)', () => {
    for (const lang of LANGS) {
      for (const code of CODES) {
        const hasDigit = /\d/.test(tableText(lang, code));
        expect(hasDigit, `${lang} ${code}`).toBe(DIGIT_CODES.includes(code));
      }
    }
    expect(tableText('en', 'GUESS_OUT_OF_RANGE').match(/\d+/g)).toEqual(['4', '52']);
    expect(tableText('ko', 'GUESS_OUT_OF_RANGE').match(/\d+/g)).toEqual(['4', '52']);
    expect(tableText('en', 'INVALID_ORIENTATION').match(/\d+/g)).toEqual(['90', '270']);
    expect(tableText('ko', 'INVALID_ORIENTATION').match(/\d+/g)).toEqual(['90', '270']);
  });

  it('names the word "seed" only in the SEED_EMPTY prompt (a request for input, no seed value)', () => {
    for (const lang of LANGS) {
      for (const code of CODES) {
        const text = tableText(lang, code);
        const mentionsSeed = /seed|시드/i.test(text);
        expect(mentionsSeed, `${lang} ${code}`).toBe(code === 'SEED_EMPTY');
      }
    }
    expect(tableText('en', 'SEED_EMPTY')).toBe('Enter a seed');
    expect(tableText('ko', 'SEED_EMPTY')).toBe('시드를 입력하세요');
  });
});

// ---------------------------------------------------------------------------------------------------------
// Lookup through t
// ---------------------------------------------------------------------------------------------------------

describe('error strings: lookup through t(errorMessageKey(code))', () => {
  it('returns the table text, not the key, for every code in both languages', () => {
    for (const lang of LANGS) {
      setLanguage(lang);
      for (const code of CODES) {
        const key = errorMessageKey(code);
        const text = t(key);
        expect(text, `${lang} ${code}`).not.toBe(key);
        expect(text, `${lang} ${code}`).toBe(EXPECTED[code][lang]);
      }
    }
  });

  it('switching the language changes the text of every code', () => {
    for (const code of CODES) {
      const key = errorMessageKey(code);
      setLanguage('en');
      const english = t(key);
      setLanguage('ko');
      const korean = t(key);
      expect(korean, code).not.toBe(english);
      setLanguage('en');
      expect(t(key), code).toBe(english);
    }
  });

  it('does not change the text when parameters are supplied (the messages are static)', () => {
    setLanguage('en');
    for (const code of CODES) {
      expect(t(errorMessageKey(code), { cell: 'D4', seat: 'P1', n: 3 }), code).toBe(EXPECTED[code].en);
    }
  });
});
