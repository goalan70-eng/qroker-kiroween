// Tests of the `setup` string area (task 19.1): both languages have the same keys with the same placeholder names, the
// Korean text is marked for review and the area is registered in the merged tables. The difficulty, language and error
// texts are reused from other areas, not duplicated. The screen's own key list is checked in ui/screens/setup.test.ts,
// because this folder is typechecked without the DOM library and so may not import ui/.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { resetLanguage, setLanguage, t } from './index';
import type { StringKey } from './index';
import { en, ko } from './strings/setup';

afterEach(() => resetLanguage());

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'strings', 'setup.ts'), 'utf8');
const REVIEW_MARKER = '// REVIEW: new text, needs native-speaker check';
const placeholders = (text: string): string[] => [...new Set([...text.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1] as string))].sort();
const KEYS = Object.keys(en) as (keyof typeof en)[];

describe('strings/setup.ts', () => {
  it('has the same keys in Korean and English, all namespaced setup.*', () => {
    expect(Object.keys(ko).sort()).toEqual([...KEYS].sort());
    for (const key of KEYS) expect(key.startsWith('setup.'), key).toBe(true);
  });

  it('uses the same placeholder names in both languages and only the documented one', () => {
    for (const key of KEYS) {
      expect(placeholders(ko[key]), key).toEqual(placeholders(en[key]));
      for (const name of placeholders(en[key])) expect(name, key).toBe('n');
    }
  });

  it('is plain text, English without Hangul and Korean with Hangul', () => {
    for (const key of KEYS) {
      expect(en[key], key).not.toMatch(/[<>]/);
      expect(ko[key], key).not.toMatch(/[<>]/);
      expect(en[key], key).not.toMatch(/[\uAC00-\uD7A3]/);
      expect(ko[key], key).toMatch(/[\uAC00-\uD7A3]/);
    }
  });

  it('does not duplicate the reused texts: no difficulty, language-name or error key in this area', () => {
    for (const key of KEYS) expect(key, key).not.toMatch(/difficulty|languageName|^setup\.error|SEED_EMPTY|INVALID_CONFIG/);
  });

  it('marks every Korean entry for review, as the other areas do', () => {
    const lines = SOURCE.slice(SOURCE.indexOf('export const ko')).split(/\r?\n/);
    for (const key of KEYS) {
      const at = lines.findIndex((l) => l.includes(`'${key}':`));
      expect(at, key).toBeGreaterThan(0);
      expect(lines[at - 1]?.trim() === REVIEW_MARKER || lines[at]?.includes(REVIEW_MARKER) === true, key).toBe(true);
    }
  });

  it('is registered: t() finds every key in both languages and interpolates its placeholder', () => {
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      for (const key of KEYS) {
        const text = t(key as StringKey, { n: 2 });
        expect(text, `${lang} ${key}`).not.toBe(key);
        expect(text, `${lang} ${key}`).not.toMatch(/\{[A-Za-z_]+\}/);
      }
    }
  });
});
