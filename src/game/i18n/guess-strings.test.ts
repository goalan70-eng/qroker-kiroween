// Tests of the `guess` string area (task 18.1): both languages have the same keys with the same placeholder names, no
// string carries private data, the Korean text is marked for review, and the area is registered in the merged tables.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../core/cards';
import { resetLanguage, setLanguage, t } from './index';
import type { StringKey } from './index';
import { en, ko } from './strings/guess';

afterEach(() => resetLanguage());

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'strings', 'guess.ts'), 'utf8');
const REVIEW_MARKER = '// REVIEW: new text, needs native-speaker check';
const placeholders = (text: string): string[] => [...new Set([...text.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1] as string))].sort();
const KEYS = Object.keys(en) as (keyof typeof en)[];

describe('strings/guess.ts', () => {
  it('has the same keys in Korean and English, all namespaced guess.*', () => {
    expect(Object.keys(ko).sort()).toEqual([...KEYS].sort());
    expect(KEYS.length).toBeGreaterThanOrEqual(15);
    for (const key of KEYS) expect(key.startsWith('guess.'), key).toBe(true);
  });

  it('uses the same placeholder names in both languages and only the documented ones', () => {
    const allowed = new Set(['name', 'key', 'cells', 'min', 'max']);
    for (const key of KEYS) {
      expect(placeholders(ko[key]), key).toEqual(placeholders(en[key]));
      for (const name of placeholders(en[key])) expect(allowed.has(name), `${key} {${name}}`).toBe(true);
    }
  });

  it('is plain text: no markup, no Hidden_Sum word, no CardId, no Guess number, no range literal', () => {
    for (const lang of [en, ko]) {
      for (const [key, value] of Object.entries(lang)) {
        expect(value, key).not.toMatch(/[<>]/);
        expect(value, key).not.toMatch(/Hidden_Sum|hiddenSum/);
        for (const card of ALL_CARDS) expect(value.includes(card), `${key} ${card}`).toBe(false);
        expect(value.replace(/2×2/g, ''), `${key} has a number literal (the range comes from core/score)`).not.toMatch(/\d/);
      }
    }
  });

  it('English text has no Hangul and Korean text has Hangul wherever it is prose', () => {
    for (const key of KEYS) {
      expect(en[key], key).not.toMatch(/[\uAC00-\uD7A3]/);
      expect(ko[key], key).toMatch(/[\uAC00-\uD7A3]/);
    }
  });

  it('marks every Korean entry for review, as the other areas do', () => {
    const koSection = SOURCE.slice(SOURCE.indexOf('export const ko'));
    const lines = koSection.split(/\r?\n/);
    for (const key of KEYS) {
      const at = lines.findIndex((l) => l.includes(`'${key}':`));
      expect(at, key).toBeGreaterThan(0);
      expect(lines[at - 1]?.trim() === REVIEW_MARKER || lines[at]?.includes(REVIEW_MARKER) === true, key).toBe(true);
    }
  });

  it('is registered: t() finds every key in both languages and interpolates its placeholders', () => {
    const params = { name: 'Alice', key: 'D4', cells: 'D4, E4, D5, E5', min: 4, max: 52 };
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
