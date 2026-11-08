# QRoker — Project Brief

## Objective

Use **Kiro as the primary tool to conceptualize, design, implement, and validate** QRoker for Kiroween 2026. Begin with this brief, not with an imported implementation. Kiro should critically evaluate feasibility and gameplay before producing detailed specs or committing to an architecture.

## Game concept

QRoker is a hybrid card-placement and deduction game. Players assemble four card corners into a composite QR/optical code, privately predict a hidden number, and share **points rather than their guesses**.

### Established direction

- **Cards:** 53 distinct cards: a standard 52-card deck plus one Joker. Suit patterns affect where code fragments appear.
- **Board:** 8×8 by default. Start with four neutral cards in the central 2×2 area (D4, E4, D5, E5). Optional tabletop house rules may allow a freer layout.
- **Actions:** Players place cards adjacent to the existing board or swap two already placed cards. The intended default is one board-to-board swap per player per game.
- **Code formation:** A 2×2 group of four different cards can produce a composite code. Check new groups without awarding points twice for the same four-card set.
- **Deduction:** For the current concept, the hidden number is the sum of the four card values (A=1, J=11, Q=12, K=13, Joker=0). Each player privately enters a guess.
- **Scoring:** Current proposed baseline: exact guess +5; error of 1: +2; error of 2: +1; otherwise 0. The player creating a new valid group gets a +1 completion bonus. Display each earned score and the running total, not the private guess.
- **Reveal:** Collect all relevant players' guesses before revealing results. When physical cards are flipped face up, retain the physical left/right arrangement of code fragments rather than accidentally mirroring the composition.
- **Modes:** A browser practice game against three local AI players, and a lightweight mobile-friendly scoring companion for physical card play. Prefer an offline-first approach without accounts or a paid AI dependency.

## Questions for Kiro to investigate

1. Can real, camera-readable standard QR codes be assembled reliably from four independently movable physical cards? If not, compare technically sound alternatives such as a clearly identified custom optical marker. Do not mislabel a nonstandard marker as a standard QR code.
2. How should card orientation, scanning, reveal, scoring and information privacy work without ambiguous rules or repeated scores?
3. Is the core loop strategically engaging? Identify and test potential exploits, dominant strategies and confusing interactions.
4. What is the smallest playable browser prototype that proves the concept before attempting print-ready physical cards?
5. Which assumptions require actual printed-card / phone-camera tests rather than simulated or browser-only tests?

## Working approach

- **First:** Review the concept, identify meaningful uncertainties, propose a concise product spec and feasibility checks. Retain the established direction unless evidence warrants proposing a change.
- **Then:** Implement iteratively in Kiro with measurable acceptance criteria, automated tests and playable iterations.
- Maintain an honest record of which work Kiro actually performed and which tests were run. Do not present pre-existing work or simulated QR tests as fresh Kiro work or physical-device validation.
- Keep the initial repository minimal. Do not import the pre-existing CODE FOUR starter ZIP or its code/specs by default; treat it as optional historical reference only if its use and provenance are deliberately reviewed.
- Create `.kiro/` files **during genuine Kiro development** and commit them for submission. Never put `.kiro/` in `.gitignore`.

## Intended first deliverable

A brief Kiro-authored feasibility assessment and design proposal, followed by a minimal playable game prototype. Full production rules, optical encoding and artwork remain open to evidence-based refinement.
