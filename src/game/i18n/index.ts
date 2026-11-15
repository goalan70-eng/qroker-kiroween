// Localization core (task 15.1). Source: .kiro/specs/qroker-playable-game/design.md, "Localization (`i18n/`)";
// requirements 16.2 (key lookup in a Korean and an English table), 16.4/16.5 (language choice, detection).
//
// Pure TypeScript: no DOM global, no node: module, no network API, no clock, no randomness. The browser language
// and the stored choice are SUPPLIED by the UI boundary as arguments of `detectLanguage`.
//
// Contracts (the design fixes the signatures only; the behaviours below are decisions of this implementation):
//
//  * Current language. The design gives `t` no language argument, so the module holds one piece of state: the
//    current language, initially DEFAULT_LANGUAGE ('en'). `setLanguage` changes it, `getLanguage` reads it,
//    `resetLanguage` restores the default (tests call it in `afterEach`, so no state leaks between tests).
//  * `setLanguage(l)` with a value other than 'ko' or 'en' (reachable only through an unchecked cast, for example
//    a value read from storage) throws a RangeError and leaves the current language unchanged.
//  * `t(key, params?)` looks `key` up in the merged table of the current language and replaces each `{name}` by
//    `String(params[name])`. The result is plain text. The UI must assign it with `textContent`, never `innerHTML`.
//      - Missing key (not in the merged table; only possible through a cast, or for an `error.<code>` key until
//        task 15.2 adds `strings/errors.ts`): `t` returns the key itself. It never throws, so one missing string
//        cannot break a screen. The completeness test (Property 29) is what finds missing keys.
//      - Missing parameter (no own property `name` in `params`, or its value is `undefined`): the placeholder
//        `{name}` stays in the text unchanged. Extra parameters are ignored.
//      - Interpolation is a single left-to-right pass. A parameter value containing `{x}` is NOT interpolated
//        again, and `$` or regex characters in a value are inserted literally.
//      - Placeholder syntax: `{name}` with name = [A-Za-z_][A-Za-z0-9_]*. Other braces are ordinary text.
//  * `detectLanguage(navigatorLanguage, stored)`:
//      1. `stored` wins when it is exactly 'ko' or 'en' (requirement 16.5, "unless a stored choice exists").
//         Any other stored value (null, undefined, 'KO', 'fr', a number...) is ignored.
//      2. Otherwise the candidates are `navigatorLanguage` (a string such as `navigator.language`) or each element
//         of it (an array such as `navigator.languages`). The first candidate that is a string whose primary
//         subtag (the text before the first '-' or '_', case-insensitive, surrounding spaces ignored) is 'ko' or
//         'en' decides: 'ko', 'ko-KR', 'KO' => 'ko'; 'en', 'en-US' => 'en'. Non-string candidates are skipped.
//      3. Otherwise DEFAULT_LANGUAGE ('en').
//  * `errorMessageKey(code)` is `'error.' + code`.
//  * The merged tables are built once at load from the explicit area imports below and are frozen. A key defined
//    by two areas is a programming error and makes the module throw at load.

import type { ErrorCode } from '../core/types';
import * as board from './strings/board';
import * as cards from './strings/cards';
import * as common from './strings/common';
import * as end from './strings/end';
import * as errors from './strings/errors';
import * as guess from './strings/guess';
import * as hand from './strings/hand';
import * as reveal from './strings/reveal';
import * as scoreboard from './strings/scoreboard';
import * as setup from './strings/setup';
import type { ErrorStringKey, Lang, StringParams, StringTable } from './types';

export type { ErrorStringKey, Lang, StringParams, StringTable } from './types';

// ---------------------------------------------------------------------------------------------------------
// Area tables. One explicit import per `strings/<area>.ts`; add new areas here AND to AREAS and `AreaKey`.
// (The completeness test lists the folder and fails when an area file is not wired in.)
// ---------------------------------------------------------------------------------------------------------

/** Keys defined by the area tables (English table of each area). Extend with `| keyof typeof <area>.en`. */
type AreaKey =
  | keyof typeof common.en
  | keyof typeof errors.en
  | keyof typeof cards.en
  | keyof typeof board.en
  | keyof typeof hand.en
  | keyof typeof guess.en
  | keyof typeof reveal.en
  | keyof typeof scoreboard.en
  | keyof typeof setup.en
  | keyof typeof end.en;

/** Every key accepted by `t`. The `error.<code>` keys are part of the type from the start (task 15.2 fills them in). */
export type StringKey = AreaKey | ErrorStringKey;

const AREAS: readonly { readonly en: StringTable; readonly ko: StringTable }[] = [common, errors, cards, board, hand, guess, reveal, scoreboard, setup, end];

export const LANGUAGES: readonly Lang[] = Object.freeze(['en', 'ko'] as const);
export const DEFAULT_LANGUAGE: Lang = 'en';

const hasOwn = (record: object, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(record, key);

function merge(pick: (area: { readonly en: StringTable; readonly ko: StringTable }) => StringTable): StringTable {
  const out: Record<string, string> = {};
  for (const area of AREAS) {
    for (const [key, value] of Object.entries(pick(area))) {
      if (hasOwn(out, key)) throw new Error(`i18n: duplicate string key "${key}" in two areas`);
      out[key] = value;
    }
  }
  return Object.freeze(out);
}

const TABLES: Readonly<Record<Lang, StringTable>> = Object.freeze({
  en: merge((a) => a.en),
  ko: merge((a) => a.ko),
});

// ---------------------------------------------------------------------------------------------------------
// Current language
// ---------------------------------------------------------------------------------------------------------

let current: Lang = DEFAULT_LANGUAGE;

export const isLang = (value: unknown): value is Lang => value === 'ko' || value === 'en';

/** Sets the current language. Throws a RangeError for any value other than 'ko' or 'en'; the language is then unchanged. */
export function setLanguage(l: Lang): void {
  if (!isLang(l)) throw new RangeError(`i18n: unsupported language ${JSON.stringify(l) ?? String(l)}`);
  current = l;
}

export function getLanguage(): Lang {
  return current;
}

/** Restores the default language ('en'). Tests call it after every test that changes the language. */
export function resetLanguage(): void {
  current = DEFAULT_LANGUAGE;
}

// ---------------------------------------------------------------------------------------------------------
// Lookup and interpolation
// ---------------------------------------------------------------------------------------------------------

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/**
 * Replaces each `{name}` of `template` by `String(params[name])` in one pass. A name without an own, defined
 * parameter keeps its `{name}` text. Replaced text is not scanned again.
 */
export function interpolate(template: string, params?: StringParams): string {
  if (params === undefined || params === null) return template;
  // The replacer function (not a replacement string) keeps `$&`, `$1` and the like in values literal.
  return template.replace(PLACEHOLDER, (match, name: string) => {
    if (!hasOwn(params, name)) return match;
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/** The text of `key` in the current language with `params` applied. See the module comment for the contracts. */
export function t(key: StringKey, params?: StringParams): string {
  const table = TABLES[current];
  if (typeof key !== 'string' || !hasOwn(table, key)) return String(key);
  return interpolate(table[key] as string, params);
}

// ---------------------------------------------------------------------------------------------------------
// Detection and error keys
// ---------------------------------------------------------------------------------------------------------

function languageOfTag(tag: unknown): Lang | undefined {
  if (typeof tag !== 'string') return undefined;
  const primary = (tag.trim().toLowerCase().split(/[-_]/, 1)[0] ?? '');
  return primary === 'ko' || primary === 'en' ? primary : undefined;
}

/**
 * The start language: `stored` if it is 'ko' or 'en', else the first 'ko' or 'en' language tag among the browser
 * languages, else 'en'. `navigatorLanguage` is `navigator.language` or `navigator.languages`; `stored` is the
 * unvalidated value read from storage. Both are supplied by the UI; this function reads no global.
 */
export function detectLanguage(
  navigatorLanguage: string | readonly string[] | null | undefined,
  stored: unknown,
): Lang {
  if (isLang(stored)) return stored;
  const candidates: readonly unknown[] = Array.isArray(navigatorLanguage) ? navigatorLanguage : [navigatorLanguage];
  for (const candidate of candidates) {
    const lang = languageOfTag(candidate);
    if (lang !== undefined) return lang;
  }
  return DEFAULT_LANGUAGE;
}

/** The string key of the message of `code`: `'error.' + code`. Compiles independently of `strings/errors.ts`. */
export function errorMessageKey(code: ErrorCode): ErrorStringKey {
  return `error.${code}`;
}
