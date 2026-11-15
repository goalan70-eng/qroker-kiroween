/**
 * Compile-time check for the reveal view model (task 18.2). Run by `tsc` (npm run typecheck:game), not by vitest:
 * the name `reveal.test-d.ts` does not match the vitest include glob `src/**\/*.test.ts`.
 * A failed assertion is a compile error.
 *
 * The model has no Guess field of any kind: no key at any depth contains "guess" or "submitted" (any case).
 */
import type { RevealViewModel } from './reveal';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function assertType<_T extends true>(): void {}

/** Every property name at every depth of `T` (arrays are looked through). */
type DeepKeys<T> = T extends readonly (infer U)[]
  ? DeepKeys<U>
  : T extends object
    ? { [K in keyof T & string]: K | DeepKeys<T[K]> }[keyof T & string]
    : never;

/** The keys of `K` that name a Guess (`guess`, `myGuesses`, `guessSubmitted`, `submittedValues`, ...). */
type GuessyKey<K> = K extends string ? (Lowercase<K> extends `${string}guess${string}` | `${string}submitted${string}` ? K : never) : never;

// The check has teeth: it finds a Guess key at any depth of a model that has one.
assertType<Equal<GuessyKey<DeepKeys<{ readonly seats: readonly { readonly myGuesses: number }[] }>>, 'myGuesses'>>();
assertType<Equal<GuessyKey<DeepKeys<{ readonly guessSubmitted: boolean }>>, 'guessSubmitted'>>();

// The real model has none.
assertType<Equal<GuessyKey<DeepKeys<RevealViewModel>>, never>>();

// The top-level keys are exactly the documented ones.
assertType<
  Equal<
    keyof RevealViewModel,
    'batchIndex' | 'placer' | 'codes' | 'seats' | 'canContinue' | 'ended' | 'provisional'
  >
>();
