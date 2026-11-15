# Save format and privacy (task 20.1)

Code: `src/game/persistence/save-format.ts`. A save is a replay log, not a snapshot. Anyone who can read the text can rebuild the whole game.

## What the serialized envelope contains

| Field | Content | Privacy effect |
| --- | --- | --- |
| `seed` | The Seed. | Reproduces the whole deal: every Hand, the deck order and the initial board. Not secret once the text is readable. |
| `config` | Seat names, kinds, difficulties, score configuration, identity visibility, rules version. | Player names are personal data. |
| `actions`: `PLACE` | Seat, card id, cell, orientation of every accepted placement. | Shows which cards were played, to whoever reads the save. |
| `actions`: `SUBMIT_GUESSES` | Seat and Guess per Quad_Key, for EVERY seat including AI seats. | A save made during `GUESS_COLLECT` holds the Guesses of the batch that is not yet revealed (the engine keeps them sealed in `pending.guesses` and in `log`). The UI must not show them before the reveal. |
| `actions`: `ACK_REVEAL` | Marker only. | None. |
| `savedAtIso` | Caller-supplied UTC time stamp. | Reveals when the game was saved. |
| `format`, `saveVersion`, `rulesVersion` | Versions. | None. |

## What it does not contain

No `GameState`, no deck array, no Hand arrays, no board, no `pending`, no scored groups. Leaving them out does not make the text secret: they are derivable by `replay(seed, config, actions)`. `localStorage` is readable by any script of the same origin and by anyone with DevTools or file access. No encryption is implemented and none is claimed; it would need a separate approved requirement.

## Division of labour

- `parseSave`: structure and version only. Strict: unknown keys, `__proto__`, `constructor` and `prototype` keys are CORRUPT. It never throws and never echoes the input. Text over 1,000,000 characters and more than 1,000 actions are CORRUPT.
- `replay` (core): engine semantics. Illegal placements, wrong cards, Guess values (`3.5`, `99`, empty Guess sets), duplicate submissions and actions after the end pass the parser and are rejected by `replay`. Task 20.2 must map a replay rejection to `DISCARDED`.

## Concerns for task 20.4

1. A resumed multi-human game must go through the gate again. No private view before it.
2. Do not display or log saved Guesses, Hands or the text, and never send them anywhere.
3. Save only after an accepted Action and remove the save at `ENDED` (requirement 18.8).
4. Decide whether to store while a batch is pending (a save then holds unrevealed Guesses). The alternative is to save only at batch boundaries, at the cost of losing the open batch on reload.
5. Owner decision: whether the displayed Seed and the stored Seed need protection (links with IC-13).
6. Encryption: none, see above.

## Unresolved questions

- `core/score` import: design.md lists only `core/replay` and `core/types` for `persistence/`; `RULES_VERSION` lives in `core/score`. No boundary rule forbids it, so the module imports that one constant. Either extend the design table or move the constant.
- `savedAtIso` checks ranges but not the calendar (`2025-02-31T00:00:00Z` passes).
- The parser accepts an empty or non-monotone `rewardByError` table and any finite Guess; the engine rejects them (`validateGameConfig`, `validateGuess`).

## Storage adapters and loading (task 20.2, `persistence/storage.ts`)
- **Durability flag.** `KeyValueStore` has one optional extra member, `durable`. The design interface cannot tell a real browser store from a memory fallback, so a store without the member counts as NOT durable. `memoryStore()` is not durable. `browserStore()` is durable only when the storage exists, has the three functions and survives a probe write; otherwise it returns a memory store (never throws). After creation, operations on a durable store may still throw: `saveGame`, `loadGame`, `clearSave` and the prefs functions catch everything.
- **`saveGame(store, state, nowIso)`** returns `{ ok: true, durable }` or `{ ok: false, reason: 'STORAGE_ERROR' | 'INVALID_STATE' }`. The text is checked with `parseSave` before it is written. A write is not read back (a silent drop without an exception cannot be detected). ENDED state: nothing is written and the save is removed (requirement 18.8); if that removal throws, the result is `STORAGE_ERROR`.
- **`loadGame(store)`** returns `NONE` (`readFailed: true` when `getItem` threw: nothing is removed), `RESUMABLE { state, envelope }`, or `DISCARDED { reason, removed }`. Reasons: `CORRUPT`, `SAVE_VERSION`, `RULES_VERSION`, `REPLAY_REJECTED` (any replay or config rejection), `GAME_ENDED`, `INVALID_VALUE` (stored value is not a string). Every discard removes only `SAVE_KEY`; `removed` is false if that threw. Load never writes (a MIGRATED envelope is not re-saved) and no result holds save text or engine detail.
- **For task 20.4:** show the "this game cannot be saved" notice when `saveGame` returns `ok === false` or `durable === false`.
- **Preferences** (`readPrefs`/`writePrefs`, `PREFS_KEY`): persistence stores `{ prefsVersion: 1, language, setup }` as plain JSON (at most 4096 characters) and imports nothing from `ui/` or `i18n/`. 20.4 validates `language` with `isLang` and `setup` with `sanitizeSetupPrefs`. Prefs hold no seed and survive `clearSave`, discards and ENDED saves.
