// Tests of the `persistence` string area (task 20.4): both languages have the same keys with the same placeholders, the
// Korean text is marked for review, one notice text exists per closed discard reason, no text names a card, a Seed or
// an engine detail, and the area is registered in the merged tables.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../core/cards';
import { resetLanguage, setLanguage, t } from './index';
import type { StringKey } from './index';
import { en, ko } from './strings/persistence';

afterEach(() => resetLanguage());

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'strings', 'persistence.ts'), 'utf8');
const REVIEW_MARKER = '// REVIEW: new text, needs native-speaker check';
const placeholders = (text: string): string[] => [...new Set([...text.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1] as string))].sort();
const KEYS = Object.keys(en) as (keyof typeof en)[];
const REASONS = ['CORRUPT', 'SAVE_VERSION', 'RULES_VERSION', 'REPLAY_REJECTED', 'GAME_ENDED', 'INVALID_VALUE'] as const;

describe('strings/persistence.ts', () => {
  it('has the same keys in Korean and English, all namespaced persistence.*', () => {
    expect(Object.keys(ko).sort()).toEqual([...KEYS].sort());
    for (const key of KEYS) expect(key.startsWith('persistence.'), key).toBe(true);
  });
  it('has one notice text per storage notice and per closed discard reason', () => {
    for (const kind of ['STORAGE_NOT_DURABLE', 'STORAGE_WRITE_FAILED', 'STORAGE_READ_FAILED']) {
      expect(KEYS, kind).toContain(`persistence.notice.${kind}`);
    }
    for (const reason of REASONS) expect(KEYS, reason).toContain(`persistence.notice.SAVE_DISCARDED.${reason}`);
  });
  it('uses the same placeholder names in both languages and only the documented ones', () => {
    for (const key of KEYS) {
      expect(placeholders(ko[key]), key).toEqual(placeholders(en[key]));
      for (const name of placeholders(en[key])) expect(['time', 'n'], `${key} {${name}}`).toContain(name);
    }
  });
  it('is plain text without markup, CardIds or the word seed; English has no Hangul, Korean has', () => {
    for (const key of KEYS) {
      for (const text of [en[key], ko[key]]) {
        expect(text, key).not.toMatch(/[<>]/);
        expect(text.toLowerCase(), key).not.toContain('seed');
        for (const card of ALL_CARDS) expect(text.includes(card), `${key} ${card}`).toBe(false);
      }
      expect(en[key], key).not.toMatch(/[\uAC00-\uD7A3]/);
      expect(ko[key], key).toMatch(/[\uAC00-\uD7A3]/);
    }
  });
  it('never claims "saved" in a notice text', () => {
    for (const key of KEYS.filter((k) => k.startsWith('persistence.notice.') && k !== 'persistence.notice.dismiss')) {
      expect(en[key].toLowerCase(), key).not.toMatch(/\b(?:is|was|are) saved\b|saved automatically/);
    }
  });
  it('marks every Korean entry for review', () => {
    const lines = SOURCE.slice(SOURCE.indexOf('export const ko')).split(/\r?\n/);
    for (const key of KEYS) {
      const at = lines.findIndex((l) => l.includes(`'${key}':`));
      expect(at, key).toBeGreaterThan(0);
      expect(lines[at - 1]?.trim() === REVIEW_MARKER || lines[at]?.includes(REVIEW_MARKER) === true, key).toBe(true);
    }
  });
  it('is registered: t() finds every key in both languages and interpolates its placeholders', () => {
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      for (const key of KEYS) {
        const text = t(key as StringKey, { time: '2025-01-02 03:04 UTC', n: 2 });
        expect(text, `${lang} ${key}`).not.toBe(key);
        expect(text, `${lang} ${key}`).not.toMatch(/\{[A-Za-z_]+\}/);
      }
    }
  });
});
