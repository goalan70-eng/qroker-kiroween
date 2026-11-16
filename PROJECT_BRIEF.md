# QRoker — Current Project Brief

This brief describes the release candidate on
`codex/issue-5-submission-materials` as of 2026-11-16. It supersedes the
[initial concept brief](docs/history/PROJECT_BRIEF.initial.md), whose full
original text is archived. The approved
[game requirements](.kiro/specs/qroker-game/requirements.md) and
[playable-game specification](.kiro/specs/qroker-playable-game/requirements.md)
describe the current rules; the implemented score defaults are in
[`src/game/core/score.ts`](src/game/core/score.ts).

## Objective and current deliverable

QRoker combines card placement, information asymmetry and private sum
predictions. The current deliverable is a browser Practice Mode in which
four seats, filled by 1–4 hot-seat humans and local AI, play a complete game
from seeded dealing to final ranking. Korean and English interfaces are
available. Gameplay needs no accounts, credentials or paid AI dependency.

Physical play with custom optical fragments and a mobile Scoring Companion
remains a broader product direction. It is separate from the implemented
browser game and still requires real-card and phone-camera validation.

## Current rules

- **Deck and setup:** Use 52 distinct cards, without Jokers: A=1, 2–10 at
  face value, J=11, Q=12, K=13. Use an 8×8 board with four neutral cards at
  D4, E4, D5 and E5, all at 0°. Deal four cards to each of four seats;
  32 remain in the deck. The starting group is never scored and there is
  no redeal.
- **Placement:** Place one hand card into an empty cell orthogonally
  adjacent to the existing board. Swapping, moving and removing placed
  cards are unsupported. The engine accepts 0° or 180°, never 90°/270°.
  Human rotation controls appear for clubs/spades, where 180° changes
  fragment positions. Dragging or selecting creates a preview; explicit
  confirmation commits the placement.
- **Valid groups:** Inspect the new card's adjacent 2×2 groups. All four
  inward corners must carry fragments. A filled 2×2 block alone is
  insufficient. Track the four-card set to prevent duplicate scoring.
- **Drawing:** Draw one card if the placement creates no new valid
  group, except on each seat's first placement. Creating any new valid
  group avoids the draw. Skip a required draw when the deck is empty;
  deck exhaustion does not end play.
- **Deduction and reveal:** All four seats privately predict each new
  group's sum, an integer from 4 to 52. Collect the entire batch before
  revealing sums and awarded points together. Other players' Guess
  values stay undisclosed, including after game end.
- **Provisional scoring:** New games use exact=10; absolute errors
  1–5 earn 5,4,3,2,1; larger errors earn 0. Emptying a hand earns +5;
  there is no group-completion bonus. These owner-selected defaults
  remain marked provisional pending balance experiments. Resuming older
  saves preserves their stored score configuration and earned points.
- **End and ranking:** A player emptying their hand triggers game end
  after that placement's Guess collection, scoring and reveal. Rank by
  final points with shared competition ranks for ties (e.g. 1,1,3,4).

## Implemented browser scope

The TypeScript engine is deterministic for a given seed, configuration and
action log. The Vite browser UI includes board/hand controls, keyboard
navigation, hot-seat hand-over gates, scoreboard, help, language switching,
final ranking, same-seed replay and rematches. Versioned browser storage
supports save/resume, validation and storage-failure notices.

`OWNER_ONLY` is the provisional default for unrevealed board identities;
`FACE_UP` is also available. Each private view shows only that viewer's
hand and own pending Guess data. Hot-seat privacy relies on honest device
hand-over. Saves contain private state and are accessible through browser
storage; these controls do not protect against someone controlling the
browser or developer tools.

AI strategies operate on a restricted player view and require no external
service. `BEGINNER` and `ADVANCED` are registered; their labels do not
establish a measured strength ordering. `EXPERT` remains deferred.

## Evidence and unfinished work

The repository contains engine/property tests, headless full-game tests,
fake-DOM acceptance tests and Playwright Chromium regressions. Executed
checks and their limits are recorded in the
[P1 report](docs/practice-mode-p1-report.md) and
[development provenance](docs/kiroween-development-log.md). These records
do not constitute human playtesting, real-device testing or final balance
validation. Historical Kiro task checkboxes remain unchanged.

The optical module is separate from the browser game's runtime. It uses a
**custom optical marker, not a standard QR code**. Its codebook, synthetic
image pipeline, bounded detector repair and physical test preparation are
documented in the [optical status](docs/optical/OPTICAL-STATUS.md). All
optical measurements currently come from synthetic images. Printed-card
and camera validation, physical privacy controls, full tabletop play and
the Scoring Companion remain incomplete or unverified. Test preparation
does not establish camera accuracy or physical-card readiness.

Service Worker caching, installable PWA support and verified offline
relaunch are unfinished. A local algorithmic game is not evidence of
offline reload support. Full simulation tooling and score tuning are
deferred; the current point table is a provisional owner choice.

## Development provenance and delivery

The owner reports Kiro as the primary historical specification-driven tool.
The repository retains its genuine `.kiro/specs/`, hooks and task history.
Codex performed the later audits, score change, optical repair and
submission preparation recorded in the provenance log. The presence of a
specification or commit subject alone does not certify which assistant
executed a historical change; original Kiro session transcripts were not
independently audited here.

This candidate includes changes proposed in draft PRs
[#12](https://github.com/goalan70-eng/qroker-kiroween/pull/12),
[#13](https://github.com/goalan70-eng/qroker-kiroween/pull/13) and
[#14](https://github.com/goalan70-eng/qroker-kiroween/pull/14), which remain
unmerged. `main` was at `3ca08b9` when this candidate was assembled; its
contents differ from this candidate. A public application URL and a
published YouTube demo are not available yet. License selection is pending
owner confirmation; review the [license proposal](docs/submission/license-choice.md).
Finalized terms belong in root `LICENSE`.

For local setup, build and checks, see [README](README.md) and the
[Practice Mode guide](docs/practice-mode.md). Submission text, demo planning
and outstanding owner decisions are collected in
[the submission materials](docs/submission/README.md).
