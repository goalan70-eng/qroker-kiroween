// Unit tests of the localization core (task 15.1). The property tests are in i18n.properties.test.ts.

import { afterEach, describe, expect, it } from 'vitest';
import { DIFFICULTY_LABELS } from '../ai/strategy';
import type { Difficulty, ErrorCode } from '../core/types';
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  detectLanguage,
  errorMessageKey,
  getLanguage,
  interpolate,
  resetLanguage,
  setLanguage,
  t,
} from './index';
import type { Lang, StringKey } from './index';
import * as common from './strings/common';

// Every test that changes the language is followed by this reset, so no state leaks between tests.
afterEach(() => {
  resetLanguage();
});

describe('approved and shared wording', () => {
  it('the provisional banner is exactly "provisional scoring" and "임시 점수 규칙" (requirement 14.8)', () => {
    setLanguage('en');
    expect(t('common.provisionalScoring')).toBe('provisional scoring');
    setLanguage('ko');
    expect(t('common.provisionalScoring')).toBe('임시 점수 규칙');
  });

  it('the difficulty labels equal DIFFICULTY_LABELS for every tier, in both languages', () => {
    const tiers = Object.keys(DIFFICULTY_LABELS) as Difficulty[];
    expect(tiers.length).toBeGreaterThanOrEqual(3);
    for (const tier of tiers) {
      const key = `common.difficulty.${tier}` as StringKey;
      setLanguage('en');
      expect(t(key), `en ${tier}`).toBe(DIFFICULTY_LABELS[tier].en);
      setLanguage('ko');
      expect(t(key), `ko ${tier}`).toBe(DIFFICULTY_LABELS[tier].ko);
    }
    // and the common area has no difficulty key for a tier that DIFFICULTY_LABELS lacks
    const difficultyKeys = Object.keys(common.en).filter((k) => k.startsWith('common.difficulty.'));
    expect(difficultyKeys.sort()).toEqual(tiers.map((d) => `common.difficulty.${d}`).sort());
  });

  it('the language names are shown in their own language in both tables', () => {
    for (const lang of LANGUAGES) {
      setLanguage(lang);
      expect(t('common.languageName.en')).toBe('English');
      expect(t('common.languageName.ko')).toBe('한국어');
    }
  });

  it('the default seat names match the English defaultConfig names (You, AI 1..3)', () => {
    setLanguage('en');
    expect(t('common.seat.human')).toBe('You');
    expect([1, 2, 3].map((n) => t('common.seat.ai', { n }))).toEqual(['AI 1', 'AI 2', 'AI 3']);
  });

  it('the shell notice says the game screens are not connected yet', () => {
    setLanguage('en');
    expect(t('common.shellNotice')).toMatch(/not connected yet/);
  });

  it('the area tables are frozen', () => {
    expect(Object.isFrozen(common.en)).toBe(true);
    expect(Object.isFrozen(common.ko)).toBe(true);
    expect(Object.isFrozen(LANGUAGES)).toBe(true);
  });
});

describe('setLanguage / getLanguage', () => {
  it('starts in the default language (en) and switches both ways', () => {
    expect(DEFAULT_LANGUAGE).toBe('en');
    expect(getLanguage()).toBe('en');
    setLanguage('ko');
    expect(getLanguage()).toBe('ko');
    expect(t('common.button.close')).toBe('닫기');
    setLanguage('en');
    expect(getLanguage()).toBe('en');
    expect(t('common.button.close')).toBe('Close');
  });

  it('throws a RangeError for an unsupported value and keeps the current language', () => {
    setLanguage('ko');
    for (const bad of ['fr', 'KO', '', undefined, null, 1, {}, ['ko']]) {
      expect(() => setLanguage(bad as unknown as Lang), String(bad)).toThrow(RangeError);
      expect(getLanguage()).toBe('ko');
    }
  });

  it('resetLanguage restores the default', () => {
    setLanguage('ko');
    resetLanguage();
    expect(getLanguage()).toBe('en');
  });

  it('does not leak state between tests (part 1: change the language)', () => {
    setLanguage('ko');
    expect(getLanguage()).toBe('ko');
  });
  it('does not leak state between tests (part 2: afterEach has reset it)', () => {
    expect(getLanguage()).toBe('en');
  });
});

describe('t: lookup, interpolation and the missing-key and missing-parameter contracts', () => {
  it('returns the key itself for a missing key, never throws, in both languages', () => {
    for (const lang of LANGUAGES) {
      setLanguage(lang);
      expect(t('common.noSuchKey' as StringKey)).toBe('common.noSuchKey');
      expect(t('' as StringKey)).toBe('');
      // inherited Object.prototype names are not keys
      for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
        expect(t(name as StringKey), name).toBe(name);
      }
    }
  });

  it('an error.<code> key is a valid StringKey; until the errors area exists it returns the key', () => {
    // After task 15.2 the table has the message, so only the type-level acceptance is asserted here.
    const key: StringKey = errorMessageKey('OCCUPIED');
    expect(typeof t(key)).toBe('string');
  });

  it('replaces {name} by String(value) and every repeated occurrence', () => {
    setLanguage('en');
    expect(t('common.seat.ai', { n: 2 })).toBe('AI 2');
    expect(t('common.seat.player', { n: '3' })).toBe('Player 3');
    setLanguage('ko');
    expect(t('common.seat.player', { n: 3 })).toBe('플레이어 3');
    expect(interpolate('{a}-{a}-{b}', { a: 'x', b: 7 })).toBe('x-x-7');
  });

  it('leaves a placeholder without a parameter unchanged, and ignores extra parameters', () => {
    setLanguage('en');
    expect(t('common.seat.ai')).toBe('AI {n}');
    expect(t('common.seat.ai', {})).toBe('AI {n}');
    expect(t('common.seat.ai', { m: 1 })).toBe('AI {n}');
    expect(t('common.seat.ai', { n: 1, extra: 'ignored' })).toBe('AI 1');
    expect(interpolate('{a} {b}', { a: 1 })).toBe('1 {b}');
    // an inherited property name is not a parameter
    expect(interpolate('{constructor} {toString}', {})).toBe('{constructor} {toString}');
    expect(interpolate('{a}', { a: undefined as unknown as string })).toBe('{a}');
  });

  it('does not interpolate parameter values again (single pass)', () => {
    expect(interpolate('{a} {b}', { a: '{b}', b: 'B' })).toBe('{b} B');
    expect(interpolate('{a}', { a: '{a}' })).toBe('{a}');
    expect(t('common.seat.ai', { n: '{n}' })).toBe('AI {n}');
  });

  it('inserts $ patterns, regex characters and markup literally (plain text, no HTML handling)', () => {
    expect(interpolate('<{a}>', { a: '$& $1 $$ $` $\' (.*)[\\]' })).toBe("<$& $1 $$ $` $' (.*)[\\]>");
    expect(interpolate('{a}', { a: '<img src=x onerror=alert(1)>' })).toBe('<img src=x onerror=alert(1)>');
  });

  it('treats malformed or non-identifier braces as ordinary text', () => {
    expect(interpolate('{ a } {} {1a} {a-b} {{a}} {a', { a: 'X' })).toBe('{ a } {} {1a} {a-b} {X} {a');
  });

  it('returns the template unchanged without parameters', () => {
    expect(interpolate('no placeholders', { a: 1 })).toBe('no placeholders');
    expect(interpolate('{a}')).toBe('{a}');
  });
});

describe('detectLanguage', () => {
  it('a valid stored language wins over the browser language', () => {
    expect(detectLanguage('ko-KR', 'en')).toBe('en');
    expect(detectLanguage('en-US', 'ko')).toBe('ko');
    expect(detectLanguage(undefined, 'ko')).toBe('ko');
  });

  it('without a stored language, a Korean browser language gives ko and any other gives en', () => {
    for (const tag of ['ko', 'ko-KR', 'KO', 'Ko-kr', 'ko_KR', ' ko-KR ']) expect(detectLanguage(tag, null), tag).toBe('ko');
    for (const tag of ['en', 'en-US', 'EN-gb', 'fr', 'fr-CA', 'ja', 'zh-Hans', '', 'kok', 'korean', 'x-ko']) {
      expect(detectLanguage(tag, null), tag).toBe('en');
    }
    expect(detectLanguage(undefined, null)).toBe('en');
  });

  it('uses the first ko or en entry of a language list and skips others', () => {
    expect(detectLanguage(['fr', 'ko-KR', 'en'], null)).toBe('ko');
    expect(detectLanguage(['fr', 'en-GB', 'ko'], null)).toBe('en');
    expect(detectLanguage(['fr', 'de'], null)).toBe('en');
    expect(detectLanguage([], null)).toBe('en');
  });

  it('ignores an invalid stored value and non-string candidates', () => {
    for (const bad of ['KO', 'fr', '', 'ko ', 0, 1, {}, [], true, undefined, null]) {
      expect(detectLanguage('ko', bad), String(bad)).toBe('ko');
      expect(detectLanguage('en', bad), String(bad)).toBe('en');
    }
    const junk = [42, null, undefined, {}, [], 'ko'] as unknown as string[];
    expect(detectLanguage(junk, null)).toBe('ko');
    expect(detectLanguage(42 as unknown as string, null)).toBe('en');
    expect(detectLanguage({ length: 1, 0: 'ko' } as unknown as string, null)).toBe('en');
  });
});

describe('errorMessageKey', () => {
  it("is 'error.' + code for every ErrorCode", () => {
    // `satisfies` makes this list exhaustive: a new ErrorCode is a compile error until it is added here.
    const all = {
      INVALID_CARD_ID: 1, SEED_EMPTY: 1, INVALID_SCORE_CONFIG: 1, INVALID_CONFIG: 1, OUT_OF_BOUNDS: 1, OCCUPIED: 1,
      NOT_ADJACENT: 1, INVALID_ORIENTATION: 1, CARD_NOT_IN_HAND: 1, NOT_YOUR_TURN: 1, WRONG_PHASE: 1, GAME_ENDED: 1,
      GUESS_NOT_INTEGER: 1, GUESS_OUT_OF_RANGE: 1, DUPLICATE_SUBMISSION: 1, GUESS_KEYS_MISMATCH: 1,
      UNKNOWN_PLAYER: 1, REPLAY_REJECTED: 1,
    } satisfies Record<ErrorCode, 1>;
    const codes = Object.keys(all) as ErrorCode[];
    expect(codes).toHaveLength(18);
    const keys = codes.map((c) => errorMessageKey(c));
    for (const c of codes) expect(errorMessageKey(c)).toBe(`error.${c}`);
    expect(new Set(keys).size).toBe(codes.length); // 1:1
  });
});
