// Tests of the `reveal` and `scoreboard` string areas (task 18.2): both languages have the same keys with the same
// placeholder names, no string names a Guess or a card, the Korean text is marked for review, and both areas are
// registered in the merged tables.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../core/cards';
import { resetLanguage, setLanguage, t } from './index';
import type { StringKey } from './index';
import * as reveal from './strings/reveal';
import * as scoreboard from './strings/scoreboard';

afterEach(() => resetLanguage());

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'strings');
const REVIEW_MARKER = '// REVIEW: new text, needs native-speaker check';
const placeholders = (text: string): string[] => [...new Set([...text.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1] as string))].sort();

const AREAS = [
  { name: 'reveal', area: reveal, allowed: ['name', 'n', 'key', 'sum', 'rank', 'suit'] },
  { name: 'scoreboard', area: scoreboard, allowed: ['count'] },
] as const;

for (const { name, area, allowed } of AREAS) {
  const SOURCE = readFileSync(join(DIR, `${name}.ts`), 'utf8');
  const KEYS = Object.keys(area.en);
  const ko = area.ko as Record<string, string>;
  const en = area.en as Record<string, string>;

  describe(`strings/${name}.ts`, () => {
    it('has the same keys in Korean and English, all namespaced', () => {
      expect(Object.keys(ko).sort()).toEqual([...KEYS].sort());
      expect(KEYS.length).toBeGreaterThanOrEqual(8);
      for (const key of KEYS) expect(key.startsWith(`${name}.`), key).toBe(true);
    });

    it('uses the same placeholder names in both languages and only the documented ones', () => {
      for (const key of KEYS) {
        expect(placeholders(ko[key] as string), key).toEqual(placeholders(en[key] as string));
        for (const p of placeholders(en[key] as string)) expect((allowed as readonly string[]).includes(p), `${key} {${p}}`).toBe(true);
      }
    });

    it('is plain text: no markup, no Guess word, no CardId, no point value', () => {
      for (const lang of [en, ko]) {
        for (const [key, value] of Object.entries(lang)) {
          expect(value, key).not.toMatch(/[<>]/);
          expect(value, key).not.toMatch(/guess|예측/i);
          for (const card of ALL_CARDS) expect(value.includes(card), `${key} ${card}`).toBe(false);
          expect(value, `${key} has a number literal`).not.toMatch(/\d/);
        }
      }
    });

    it('English text has no Hangul and Korean text has Hangul', () => {
      for (const key of KEYS) {
        expect(en[key], key).not.toMatch(/[\uAC00-\uD7A3]/);
        expect(ko[key], key).toMatch(/[\uAC00-\uD7A3]/);
      }
    });

    it('marks every Korean entry for review', () => {
      const lines = SOURCE.slice(SOURCE.indexOf('export const ko')).split(/\r?\n/);
      for (const key of KEYS) {
        const at = lines.findIndex((l) => l.includes(`'${key}':`));
        expect(at, key).toBeGreaterThan(0);
        expect((lines[at - 1] ?? '').trim().startsWith(REVIEW_MARKER) || (lines[at] ?? '').includes(REVIEW_MARKER), key).toBe(true);
      }
    });

    it('is registered: t() finds every key in both languages and interpolates its placeholders', () => {
      const params = { name: 'Alice', n: 2, key: 'D4', sum: 31, rank: 'K', suit: 'Spades', count: 12 };
      for (const lang of ['en', 'ko'] as const) {
        setLanguage(lang);
        for (const key of KEYS) {
          const text = t(key as StringKey, params);
          expect(text, `${lang} ${key}`).not.toBe(key);
          expect(text, `${lang} ${key}`).not.toMatch(/\{[A-Za-z_]+\}/);
        }
      }
    });
  });
}

describe('common.provisionalScoring is reused, not duplicated', () => {
  it('neither new area defines a provisional-scoring text', () => {
    for (const { area } of AREAS) expect(Object.keys(area.en).some((k) => /provisional/i.test(k))).toBe(false);
    expect(t('common.provisionalScoring')).toBe('provisional scoring');
  });
});
