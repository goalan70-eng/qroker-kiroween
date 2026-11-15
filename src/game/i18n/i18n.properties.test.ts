// Feature: qroker-playable-game, Property 29: Localization completeness and language detection
//
// **Validates: Requirements 14.8, 16.2, 16.4, 16.5, 12.7**
//
// Area files are discovered by listing src/game/i18n/strings/*.ts (this test runs in Node and may use node:fs), so a
// later area such as errors.ts (task 15.2) is covered without editing this file. The tables are checked
// exhaustively (they are finite); the language detection and the interpolation are checked on generated input
// against oracles written independently of the implementation. Each random property is ONE fc.assert with a fixed
// seed.

import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import type { ErrorCode } from '../core/types';
import { detectLanguage, errorMessageKey, interpolate, resetLanguage, setLanguage, t } from './index';
import type { Lang, StringKey } from './index';

afterEach(() => {
  resetLanguage();
});

const SEED = 29;
const NUM_RUNS = 300;
const LANGS: readonly Lang[] = ['en', 'ko'];

// ---------------------------------------------------------------------------------------------------------
// Area discovery
// ---------------------------------------------------------------------------------------------------------

const STRINGS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'strings');

/** `strings/<area>.ts` files: every .ts file except test files and declaration files. */
function discoverAreaNames(): string[] {
  return readdirSync(STRINGS_DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts') && !/\.(?:test|spec)(?:-d)?\.ts$/.test(f))
    .map((f) => f.slice(0, -'.ts'.length))
    .sort();
}

interface AreaTables {
  readonly name: string;
  readonly en: Readonly<Record<string, string>>;
  readonly ko: Readonly<Record<string, string>>;
}

async function loadArea(name: string): Promise<AreaTables> {
  const mod = (await import(`./strings/${name}.ts`)) as { en?: unknown; ko?: unknown };
  expect(typeof mod.en, `${name}.ts exports en`).toBe('object');
  expect(typeof mod.ko, `${name}.ts exports ko`).toBe('object');
  return { name, en: mod.en as Record<string, string>, ko: mod.ko as Record<string, string> };
}

const AREA_NAMES = discoverAreaNames();
const AREAS: readonly AreaTables[] = await Promise.all(AREA_NAMES.map(loadArea));

interface Entry {
  readonly area: string;
  readonly key: string;
}
const ENTRIES: readonly Entry[] = AREAS.flatMap((a) => Object.keys(a.en).map((key) => ({ area: a.name, key })));
const areaOf = (name: string): AreaTables => AREAS.find((a) => a.name === name) as AreaTables;

// ---------------------------------------------------------------------------------------------------------
// Independent helpers (not the implementation's regex)
// ---------------------------------------------------------------------------------------------------------

interface Parsed {
  readonly names: readonly string[]; // placeholder names, in order, with repeats
  readonly malformed: boolean; // a brace outside a well-formed {identifier}
}

function parsePlaceholders(text: string): Parsed {
  const names: string[] = [];
  const rest = text.replace(/\{([^{}]*)\}/g, (_m, inner: string) => {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(inner)) names.push(inner);
    else names.push(`<invalid:${inner}>`);
    return '';
  });
  const invalid = names.some((n) => n.startsWith('<invalid:'));
  return { names: names.filter((n) => !n.startsWith('<invalid:')), malformed: invalid || /[{}]/.test(rest) };
}

const nameSet = (text: string): string[] => [...new Set(parsePlaceholders(text).names)].sort();

/** Reference rendering: split on well-formed tokens and rebuild; absent or undefined parameters keep their token. */
function oracleRender(template: string, params: Readonly<Record<string, string | number | undefined>>): string {
  return template
    .split(/(\{[^{}]*\})/)
    .map((part) => {
      const m = /^\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(part);
      if (m === null) return part;
      const name = m[1] as string;
      const value = Object.prototype.propertyIsEnumerable.call(params, name) ? params[name] : undefined;
      return value === undefined ? part : String(value);
    })
    .join('');
}

const HANGUL = /[\uAC00-\uD7A3]/;
/**
 * Keys whose Korean text legitimately has no Hangul: the brand name, the English language name (shown in its own
 * language in both tables) and the "AI {n}" seat name (the loanword "AI"). Every other Korean text must contain Hangul.
 */
const NO_HANGUL_EXCEPTIONS: readonly string[] = ['common.appTitle', 'common.languageName.en', 'common.seat.ai'];

// ---------------------------------------------------------------------------------------------------------
// (a), (b), (e) Tables
// ---------------------------------------------------------------------------------------------------------

describe('Property 29: area tables are complete in en and ko', () => {
  it('discovers the area files (not vacuous) and includes the known area common', () => {
    expect(AREA_NAMES.length).toBeGreaterThanOrEqual(1);
    expect(AREA_NAMES).toContain('common');
    expect(ENTRIES.length).toBeGreaterThan(0);
  });

  it('(a) every area has the same key set in en and ko', () => {
    for (const a of AREAS) {
      expect(Object.keys(a.ko).sort(), `area ${a.name}`).toEqual(Object.keys(a.en).sort());
    }
  });

  it('(a) keys are namespaced by area and unique across areas', () => {
    const seen = new Set<string>();
    for (const a of AREAS) {
      const prefix = a.name === 'errors' ? 'error.' : `${a.name}.`;
      for (const key of Object.keys(a.en)) {
        expect(key.startsWith(prefix), `${a.name}: ${key} must start with ${prefix}`).toBe(true);
        expect(seen.has(key), `duplicate key ${key}`).toBe(false);
        seen.add(key);
      }
    }
  });

  it('(a) t finds every discovered key in both languages: the area is wired into i18n/index.ts', () => {
    for (const lang of LANGS) {
      setLanguage(lang);
      for (const { area, key } of ENTRIES) {
        // `{}` keeps placeholders in the text, so the result must equal the raw table string.
        expect(t(key as StringKey, {}), `${lang} ${key}`).toBe(areaOf(area)[lang][key]);
      }
    }
  });

  it('(b) en and ko have the same placeholder names, and no malformed braces', () => {
    for (const { area, key } of ENTRIES) {
      const en = areaOf(area).en[key] as string;
      const ko = areaOf(area).ko[key] as string;
      expect(nameSet(ko), `placeholders of ${key}`).toEqual(nameSet(en));
      expect(parsePlaceholders(en).malformed, `en ${key} has malformed braces`).toBe(false);
      expect(parsePlaceholders(ko).malformed, `ko ${key} has malformed braces`).toBe(false);
    }
  });

  it('(e) strings are non-empty, trimmed and plain text; Korean text contains Hangul except for the listed keys', () => {
    for (const { area, key } of ENTRIES) {
      for (const lang of LANGS) {
        const text = areaOf(area)[lang][key] as string;
        expect(typeof text, `${lang} ${key}`).toBe('string');
        expect(text.length, `${lang} ${key} is empty`).toBeGreaterThan(0);
        expect(text, `${lang} ${key} has leading or trailing whitespace`).toBe(text.trim());
        expect(/[<>]/.test(text), `${lang} ${key} contains markup characters`).toBe(false);
      }
      const ko = areaOf(area).ko[key] as string;
      const en = areaOf(area).en[key] as string;
      expect(HANGUL.test(en), `en ${key} contains Hangul`).toBe(key === 'common.languageName.ko');
      if (!NO_HANGUL_EXCEPTIONS.includes(key)) expect(HANGUL.test(ko), `ko ${key} has no Hangul`).toBe(true);
    }
  });

  it('(e) every key of the no-Hangul exception list exists (no stale exceptions)', () => {
    const keys = new Set(ENTRIES.map((e) => e.key));
    for (const key of NO_HANGUL_EXCEPTIONS) expect(keys.has(key), key).toBe(true);
  });

  it('every ErrorCode maps to a key that exists in both tables once the errors area exists (task 15.2)', () => {
    // `satisfies` makes the list exhaustive: a new ErrorCode is a compile error until it is added here.
    const all = {
      INVALID_CARD_ID: 1, SEED_EMPTY: 1, INVALID_SCORE_CONFIG: 1, INVALID_CONFIG: 1, OUT_OF_BOUNDS: 1, OCCUPIED: 1,
      NOT_ADJACENT: 1, INVALID_ORIENTATION: 1, CARD_NOT_IN_HAND: 1, NOT_YOUR_TURN: 1, WRONG_PHASE: 1, GAME_ENDED: 1,
      GUESS_NOT_INTEGER: 1, GUESS_OUT_OF_RANGE: 1, DUPLICATE_SUBMISSION: 1, GUESS_KEYS_MISMATCH: 1,
      UNKNOWN_PLAYER: 1, REPLAY_REJECTED: 1,
    } satisfies Record<ErrorCode, 1>;
    const codes = Object.keys(all) as ErrorCode[];
    const errors = AREAS.find((a) => a.name === 'errors');
    if (errors === undefined) return; // task 15.2 has not added strings/errors.ts yet: nothing to check
    for (const code of codes) {
      const key = errorMessageKey(code);
      expect(Object.prototype.hasOwnProperty.call(errors.en, key), `en ${key}`).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(errors.ko, key), `ko ${key}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
// (c) Detection
// ---------------------------------------------------------------------------------------------------------

const arbTag: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 6, arbitrary: fc.constantFrom('ko', 'ko-KR', 'KO', 'Ko-kr', 'ko_KR', 'en', 'en-US', 'en-GB', 'EN', 'fr', 'fr-CA', 'ja', 'zh-Hans', 'kok', 'korean', 'english', 'x-ko', '한국어', ' ko-KR ', '\nen\t', '', ' ', '-', 'ko-', '-ko') },
  { weight: 3, arbitrary: fc.tuple(fc.constantFrom('ko', 'en', 'KO', 'En', 'fr', 'de', ''), fc.constantFrom('', '-KR', '-US', '_KR', '-Hang-KR', 'x', '.', '-')).map(([a, b]) => `${a}${b}`) },
  { weight: 2, arbitrary: fc.string({ unit: 'grapheme-ascii', maxLength: 8 }) },
  { weight: 2, arbitrary: fc.constantFrom(null, undefined, 42, 0, true, {}, [], ['ko'], () => 'ko') },
);
const arbNavigator: fc.Arbitrary<unknown> = fc.oneof(arbTag, fc.array(arbTag, { maxLength: 6 }));
const arbStored: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom('ko', 'en', 'ko', 'en', 'KO', 'EN', 'fr', '', ' ko', 'ko ', null, undefined, 0, 1, {}, [], 'ko-KR'),
  fc.string({ unit: 'grapheme-ascii', maxLength: 4 }),
);

/** Reference for Property 29 (c) and requirement 16.5, written without the implementation's helper. */
function oracleDetect(navigatorLanguage: unknown, stored: unknown): Lang {
  if (stored === 'ko' || stored === 'en') return stored;
  const list = Array.isArray(navigatorLanguage) ? navigatorLanguage : [navigatorLanguage];
  for (const item of list as unknown[]) {
    if (typeof item !== 'string') continue;
    const m = /^(ko|en)(?:[-_][\s\S]*)?$/i.exec(item.replace(/^\s+|\s+$/g, ''));
    if (m !== null) return (m[1] as string).toLowerCase() as Lang;
  }
  return 'en';
}

describe('Property 29: language detection', () => {
  it('(c) detectLanguage equals the oracle for any browser language(s) and stored value', () => {
    let koWins = 0;
    let enWins = 0;
    let storedWins = 0;
    fc.assert(
      fc.property(arbNavigator, arbStored, (nav, stored) => {
        const got = detectLanguage(nav as string, stored);
        const want = oracleDetect(nav, stored);
        if (stored === 'ko' || stored === 'en') storedWins++;
        else if (want === 'ko') koWins++;
        else enWins++;
        expect(got).toBe(want);
        // the two stated rules, restated: stored wins; a single 'ko…' string without stored gives ko
        if (stored === 'ko' || stored === 'en') expect(got).toBe(stored);
        if (typeof nav === 'string' && /^ko(?:[-_]|$)/i.test(nav) && stored !== 'ko' && stored !== 'en') expect(got).toBe('ko');
      }),
      { seed: SEED, numRuns: NUM_RUNS },
    );
    // the generators reach every outcome (guards against a vacuous run)
    expect(koWins).toBeGreaterThan(0);
    expect(enWins).toBeGreaterThan(0);
    expect(storedWins).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------------------
// (d) Interpolation
// ---------------------------------------------------------------------------------------------------------

const PLACEHOLDER_NAMES = ['a', 'b', 'n', 'x_1', '_z'] as const;

const arbLiteral: fc.Arbitrary<string> = fc.oneof(
  fc.string({ unit: 'grapheme', maxLength: 6 }).map((s) => s.replace(/[{}]/g, '')),
  fc.constantFrom('', ' ', '$&', '$1', '$$', '\\', '(.*)', '[a-z]', '^', '.', '임시', '<b>', '\u{1F0A1}'),
);
const arbValue: fc.Arbitrary<string | number> = fc.oneof(
  fc.string({ unit: 'grapheme', maxLength: 8 }),
  fc.string({ unit: 'binary', maxLength: 6 }),
  fc.constantFrom('{a}', '{b}', '{n}', '{{a}}', '{', '}', '$&', '$1', '$`', "$'", '\\', '(.*)', '', '임시 {a}'),
  fc.integer(),
  fc.double({ noNaN: false }),
);
type Segment = { readonly kind: 'text'; readonly text: string } | { readonly kind: 'slot'; readonly name: string };
const arbSegments: fc.Arbitrary<Segment[]> = fc.array(
  fc.oneof(
    arbLiteral.map((text): Segment => ({ kind: 'text', text })),
    fc.constantFrom(...PLACEHOLDER_NAMES).map((name): Segment => ({ kind: 'slot', name })),
  ),
  { maxLength: 8 },
);
const arbParams: fc.Arbitrary<Record<string, string | number | undefined>> = fc.record(
  Object.fromEntries(PLACEHOLDER_NAMES.map((n) => [n, fc.option(arbValue, { nil: undefined, freq: 3 })])) as Record<
    (typeof PLACEHOLDER_NAMES)[number],
    fc.Arbitrary<string | number | undefined>
  >,
  { requiredKeys: [] },
);

const definedParams = (p: Readonly<Record<string, string | number | undefined>>): Record<string, string | number> =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as Record<string, string | number>;

describe('Property 29: interpolation', () => {
  it('(d) interpolate replaces each placeholder exactly once with String(value), never re-interpolating', () => {
    fc.assert(
      fc.property(arbSegments, arbParams, (segments, params) => {
        const supplied = definedParams(params);
        const template = segments.map((s) => (s.kind === 'text' ? s.text : `{${s.name}}`)).join('');
        // expected, built from the segments (no parsing of the template at all)
        const want = segments
          .map((s) => {
            if (s.kind === 'text') return s.text;
            return Object.prototype.hasOwnProperty.call(supplied, s.name) ? String(supplied[s.name]) : `{${s.name}}`;
          })
          .join('');
        expect(interpolate(template, supplied)).toBe(want);
        // the independent split-based reference agrees
        expect(interpolate(template, supplied)).toBe(oracleRender(template, supplied));
      }),
      { seed: SEED, numRuns: NUM_RUNS },
    );
  });

  it('(d) t renders every real key in both languages like the reference, for any parameters', () => {
    const placeholderKeys = ENTRIES.filter((e) => parsePlaceholders(areaOf(e.area).en[e.key] as string).names.length > 0);
    expect(placeholderKeys.length, 'the tables hold at least one string with a placeholder').toBeGreaterThan(0);
    fc.assert(
      fc.property(fc.constantFrom(...ENTRIES), fc.constantFrom(...LANGS), arbParams, (entry, lang, params) => {
        setLanguage(lang);
        const supplied = definedParams(params);
        const template = areaOf(entry.area)[lang][entry.key] as string;
        expect(t(entry.key as StringKey, supplied)).toBe(oracleRender(template, supplied));
      }),
      { seed: SEED, numRuns: NUM_RUNS },
    );
  });
});
