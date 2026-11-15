// Tests of the `help` and `abandon` string areas (task 19.3): both languages have the same keys with the same placeholder
// names, the Korean text is marked for review, no text names a card or a Guess value, the areas are registered in the merged
// tables, and the texts that other areas own are reused, not duplicated. The key lists of the components are checked in
// ui/overlays/*.test.ts, because this folder is typechecked without the DOM library and so may not import ui/.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../core/cards';
import { resetLanguage, setLanguage, t } from './index';
import type { StringKey } from './index';
import * as abandon from './strings/abandon';
import * as help from './strings/help';

afterEach(() => resetLanguage());

const FOLDER = join(dirname(fileURLToPath(import.meta.url)), 'strings');
const REVIEW_MARKER = '// REVIEW: new text, needs native-speaker check';
const placeholders = (text: string): string[] => [...new Set([...text.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1] as string))].sort();

const AREAS = [
  { name: 'help', en: help.en, ko: help.ko, min: 24 },
  { name: 'abandon', en: abandon.en, ko: abandon.ko, min: 4 },
] as const;

for (const area of AREAS) {
  const KEYS = Object.keys(area.en);
  const source = readFileSync(join(FOLDER, `${area.name}.ts`), 'utf8');

  describe(`strings/${area.name}.ts`, () => {
    it('has the same keys in Korean and English, all namespaced', () => {
      expect(Object.keys(area.ko).sort()).toEqual([...KEYS].sort());
      expect(KEYS.length).toBeGreaterThanOrEqual(area.min);
      for (const key of KEYS) expect(key.startsWith(`${area.name}.`), key).toBe(true);
    });

    it('uses the same placeholder names in both languages (this area has none)', () => {
      const ko = area.ko as Record<string, string>;
      const en = area.en as Record<string, string>;
      for (const key of KEYS) {
        expect(placeholders(ko[key] as string), key).toEqual(placeholders(en[key] as string));
        expect(placeholders(en[key] as string), key).toEqual([]);
      }
    });

    it('is plain text: no markup, no CardId, no Guess value; English without Hangul, Korean with Hangul', () => {
      const ko = area.ko as Record<string, string>;
      const en = area.en as Record<string, string>;
      for (const key of KEYS) {
        for (const text of [en[key] as string, ko[key] as string]) {
          expect(text, key).not.toMatch(/[<>]/);
          for (const card of ALL_CARDS) expect(text.includes(card), `${key} ${card}`).toBe(false);
        }
        expect(en[key], key).not.toMatch(/[\uAC00-\uD7A3]/);
        expect(ko[key], key).toMatch(/[\uAC00-\uD7A3]/);
      }
    });

    it('marks every Korean entry for review, as the other areas do', () => {
      const lines = source.slice(source.indexOf('export const ko')).split(/\r?\n/);
      for (const key of KEYS) {
        const at = lines.findIndex((l) => l.includes(`'${key}':`));
        expect(at, key).toBeGreaterThan(0);
        expect(lines[at - 1]?.trim() === REVIEW_MARKER || lines[at]?.includes(REVIEW_MARKER) === true, key).toBe(true);
      }
    });

    it('is registered: t() finds every key in both languages', () => {
      for (const lang of ['en', 'ko'] as const) {
        setLanguage(lang);
        for (const key of KEYS) expect(t(key as StringKey), `${lang} ${key}`).not.toBe(key);
      }
    });
  });
}

describe('strings/help.ts and strings/abandon.ts: reuse', () => {
  it('does not duplicate the close/cancel buttons or the provisional label of the common area', () => {
    for (const area of AREAS) {
      for (const key of Object.keys(area.en)) expect(key, key).not.toMatch(/\.close$|\.cancel$|provisionalScoring|\.sum$|difficulty/i);
    }
    expect(Object.keys(help.en)).not.toContain('help.close');
  });

  it('keeps the rule vocabulary of the guess and reveal areas', () => {
    expect(help.ko['help.s7.body']).toContain('예측값');
    expect(help.ko['help.s7.body']).toContain('숨겨진 합');
    expect(help.ko['help.s6.body']).toContain('조합');
    expect(help.en['help.s7.body']).toContain('hidden sum');
  });

  it('keeps the approved Korean banner wording where the help repeats it (it reuses the common key)', () => {
    setLanguage('ko');
    expect(t('common.provisionalScoring')).toBe('임시 점수 규칙');
  });
});
