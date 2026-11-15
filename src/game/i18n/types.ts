// Localization types (task 15.1). Source: .kiro/specs/qroker-playable-game/design.md, "Localization (`i18n/`)".
//
// Pure types: no runtime code, no DOM, no node: modules. Only `core/types` is imported (allowed for i18n/).

import type { ErrorCode } from '../core/types';

/** The two supported languages (requirements OQ-9: Korean and English, no other language). */
export type Lang = 'ko' | 'en';

/** One language table of one UI area. Placeholders are written as `{name}`. */
export type StringTable = Readonly<Record<string, string>>;

/** Values accepted for the placeholders of a string. Rendered with `String(value)`. */
export type StringParams = Readonly<Record<string, string | number>>;

/** The key of the message of an `ErrorCode`: `'error.' + code`. The table `strings/errors.ts` (task 15.2) defines them. */
export type ErrorStringKey = `error.${ErrorCode}`;
