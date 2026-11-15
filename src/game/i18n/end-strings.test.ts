// Tests of the `end` string area (task 19.2): both languages have the same keys with the same placeholder names, the
// Korean text is marked for review, no text names a Guess, a card or a number, the area is registered in the merged
// tables, and the texts that other areas own are reused, not duplicated. The screen's own key list is checked in
// ui/screens/end.test.ts, because this folder is typechecked without the DOM library and so may not import ui/.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../core/cards';
import { resetLanguage, setLanguage, t } from './index';
import type { StringKey } from './index';
import { en, ko } from './strings/end';

afterEach(() => resetLanguage());

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'strings', 'end.ts'), 'utf8');
const REVIEW_MARKER = '// REVIEW: new text, needs native-speaker check';
const placeholders = (text: string): string[] => [...new Set([...text.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1] as string))].sort();
const KEYS = Object.keys(en) as (keyof typeof en)[];

describe('strings/end.ts', () => {
  it('has the same keys in Korean and English, all namespaced end.*', () => {
    expect(Object.keys(ko).sort()).toEqual([...KEYS].sort());
    expect(KEYS.length).toBeGreaterThanOrEqual(20);
    for (const key of KEYS) expect(key.startsWith('end.'), key).toBe(true);
  });

  it('uses the same placeholder names in both languages and only the documented ones', () => {
    for (const key of KEYS) {
      expect(placeholders(ko[key]), key).toEqual(placeholders(en[key]));
      for (const name of placeholders(en[key])) expect(['cells', 'n'], `${key} {${name}}`).toContain(name);
    }
  });

  it('is plain text: no markup, no Guess word, no CardId, no number literal; English without Hangul, Korean with Hangul', () => {
    for (const key of KEYS) {
      for (const text of [en[key], ko[key]]) {
        expect(text, key).not.toMatch(/[<>]/);
        expect(text, key).not.toMatch(/guess|예측/i);
        expect(text, key).not.toMatch(/\d/);
        for (const card of ALL_CARDS) expect(text.includes(card), `${key} ${card}`).toBe(false);
      }
      expect(en[key], key).not.toMatch(/[\uAC00-\uD7A3]/);
      expect(ko[key], key).toMatch(/[\uAC00-\uD7A3]/);
    }
  });

  it('does not duplicate texts that other areas own', () => {
    for (const key of KEYS) expect(key, key).not.toMatch(/provisional|hiddenSum|\.sum$|quad|\.seat$|difficulty|languageName/i);
  });

  it('marks every Korean entry for review, as the other areas do', () => {
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
        const text = t(key as StringKey, { n: 2, cells: 'D4, E4, D5, E5' });
        expect(text, `${lang} ${key}`).not.toBe(key);
        expect(text, `${lang} ${key}`).not.toMatch(/\{[A-Za-z_]+\}/);
      }
    }
  });
});
