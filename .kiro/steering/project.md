---
inclusion: always
---
# QRoker workspace rules
Short on purpose: it is loaded in every chat. Read the real specs and tests before changing anything; do not rely on this file for details.

## Sources of truth
- Game and optical rules: `.kiro/specs/qroker-game/`. Browser game: `.kiro/specs/qroker-playable-game/`. Task status lives in each `tasks.md`; do not tick a task without evidence.
- Optical V2 is a planning-only proposal in `.kiro/specs/qroker-optical-v2/` (not on every branch). Use `#optical-v2` only when working on it.
- Approved rules (owner decision; spec text by Kiro, implementation by Codex, `RULES_VERSION = 4`): 3-card hands, 36-card draw pile, the same draw rule from the first placement, game end when a code-completing placement empties a hand, when a draw takes the last pile card (at once, current scores, no bonus), or when five distinct codes exist in total (whole last batch scored first); hand-empty bonus only for the player who emptied their hand by a code placement. PR #21 and #22 are earlier draw-rule experiments, kept as history.
- Proposals that are not approved specs: unmerged scoring (PR #13, branch-dependent), Steering/Hooks changes. Follow the branch's actual specs and `ScoreConfig`; scoring stays provisional.

## Game and architecture
- 52 cards, no Joker card, 8x8 board, four seats; neutral cards at D4/E4/D5/E5; placement must be edge-adjacent to a placed card; no swaps; cards are placed at 0 or 180 degrees. A new 2x2 Composite Code triggers private Guesses and a simultaneous reveal.
- Layers: `src/game/core` (pure engine), `ai`, `sim`, `persistence`, `i18n`, `ui`; `src/optical` is the V1 reader. `boundaries.test.ts` enforces imports: screens never see `GameState` or the controller, only `PlayerView`; `src/game` must not import `src/optical`.
- Human placement goes only through `confirmPlacement()`; `PLACE` through the screen dispatch is refused.

## Optical V1 preservation
- Never edit or regenerate `src/optical/codebook.v1.json` (SHA256 `515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4`) or historic optical reports without a separately approved, versioned migration.
- "Composite Code" is the project's own optical code, not an ISO QR code. V1 results are synthetic-image results; none of them proves real-camera performance.

## Privacy and offline-first
- Keep private Guesses, unrevealed Hidden_Sum and other players' hands out of public views, logs, DOM and notices.
- The game is offline-first; no network calls in game code. A save holds the Seed and every accepted Action (including unrevealed Guesses) and `localStorage` is readable: never claim secrecy or encryption.

## Testing and conventions
- Check with `npm run typecheck`, `npm run typecheck:game`, focused `npx vitest run <path>`, `npm run build`; full suite with `npm run test:ci` (not bare `npm test`). Two optical tests time out under CPU load: rerun them alone and report it; never raise timeouts or weaken assertions.
- Browser checks: `npx playwright test`; keep real-browser, fake-DOM (happy-dom) and model evidence separate and labelled; happy-dom is not a real browser.
- Reports to the user are in Korean; keep code identifiers, paths and project vocabulary unchanged. Keep Korean UI labels.
- Do not push, merge, force-push or deploy unless asked. Any paid external action needs the owner's approval, except the one standing approval below. Other optional paid hooks stay disabled.
- Standing owner approval (one hook only): the enabled hook `QRoker optional OpenAI independent review` (`.kiro/hooks/optional-openai-review.json`, PostTaskExec) may run after a Spec task completes without asking each time. Its scope and limits are unchanged (`docs/openai-review-setup.md`): tracked `src/game/` patches only, never `.kiro/` or secrets; at most 12,000 changed characters, 900 output tokens, 3 attempted requests per UTC day per PC, no automatic retries. It still needs the local opt-in `QROKER_OPENAI_REVIEW_AUTOMATION=1` and the API key. Do not widen the scope, raise a limit, run a manual `--send`, or start any other paid call without approval. Treat its findings as hypotheses until local tests confirm them; never present them as Kiro test results.

## Attribution
- Record who did what from evidence (commit labels such as `(Codex, #N)`, `tasks.meta.json` execution history, PR text), not from a checkbox, a CI pass or a file's existence. Kiro agent work, Codex changes and ChatGPT plans (PR #18) are credited separately.
