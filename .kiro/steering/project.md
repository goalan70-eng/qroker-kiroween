---
inclusion: always
---

# QRoker workspace rules

These rules apply only to QRoker. Keep this file concise; read the actual requirements and tests before implementing a change.

## Product and sources of truth

- QRoker is a 52-card (no Joker card), 8×8, four-seat card-placement and inference game. Neutral cards start at D4/E4/D5/E5; hands start with four cards each. Placement requires an orthogonally adjacent empty cell. Swaps are not supported. Only 0° and meaningful 180° card rotations are legal.
- A valid new 2×2 Composite Code prompts private `Guess` collection; scores are revealed together, never other players' guesses. The empty-hand end and draw rules are specified in `.kiro/specs/qroker-game/requirements.md`.
- Use `.kiro/specs/qroker-game/{requirements,design,tasks}.md` for game/optical rules and `.kiro/specs/qroker-playable-game/{requirements,design,tasks}.md` for browser implementation. Follow the branch's actual `ScoreConfig`; scoring remains provisional.
- Code owners: `src/game/core/` for the engine, `src/game/ai/` for local AI, `src/game/ui/` for the browser, `src/optical/` for the V1 reader. Preserve existing module boundaries.
- Use the term **Composite Code** for card optics. It is **not** an ISO QR code.

## Safety and verification

- Do not regenerate or change frozen `src/optical/codebook.v1.json` or historic optical reports without a separately approved versioned migration.
- The square, four-piece V2 concept is a **proposal**, tracked in Issue #16 and a separate draft plan branch. Do not silently replace V1 or change approved gameplay or Kiro task completion state. Refer to `#optical-v2` when deliberately working on that proposal.
- Keep private `Guess`, unrevealed `Hidden_Sum` and other players' hands out of public views. Seed exposure/localStorage confidentiality are open concerns; do not claim cryptographic privacy.
- Prefer deterministic, reproducible, offline tests: type checks, Vitest/fast-check, Playwright, frozen-codebook verification and GitHub Actions. Preserve failures and distinguishing synthetic from real-camera evidence.
- Never auto-merge, force-push, deploy, upload secrets, trigger paid external AI reviews, or approve tool permissions on the user's behalf. Use focused branches and draft PRs; ask before consequential release or policy choices.
- Attribute actual Kiro work and Codex/other tool work separately. A task checkbox, commit message, CI pass or the presence of a file alone does not establish who executed a task or prove physical-camera performance.
- Preserve Korean UI labels and project vocabulary; do not introduce a Joker playing card merely because Joker artwork may be tested as marker decoration.
