# Requirements Document

## Introduction

This spec covers the QRoker game engine and the browser Practice Mode as a playable product: one human (or several hot-seat humans) plus offline AI opponents play a complete game on an 8×8 Board, from seeded dealing to final ranking, in a mobile-friendly, offline-capable web app.

It is a NEW spec that sits beside `.kiro/specs/qroker-game/`. It does not copy or change the approved gameplay rules. Where a rule is restated, the text cites the approved source as "qroker-game Requirement N.M". The approved requirements that this spec implements are qroker-game Requirements 1–4, 6–8, 10 and 11. Requirement 9 (Scoring Companion) is deferred. Requirements 5 and 12–16 (optical marker system) are out of scope and the optical module `src/optical/**` is not a dependency of this spec.

Score values are undecided (docs/open-decisions.md item 7). This spec therefore defines a clearly labelled development placeholder `ScoreConfig` and makes no balance claim. Where the approved documents are silent or inconsistent, this spec records an Open Question with a provisional default (see the end of this document) and never decides silently.

Scope, in priority order:

1. 52-card deck and deterministic seeded dealing.
2. 8×8 Board and legal placements.
3. Card orientation and Composite Code detection with duplicate prevention.
4. Turn management and drawing rules.
5. Private Guess collection and simultaneous reveal.
6. Configurable scoring (injected) and game termination.
7. Three offline AI opponents with information isolation.
8. Complete playable browser UI.
9. Mobile responsiveness, offline support (Service Worker, PWA basics) and save/resume.

---

## Glossary

- **Game_Engine**: The pure, DOM-independent TypeScript module under `src/game/core/` that holds all rules. Its main entry points are `newGame` and `reduce`.
- **Game_State**: The complete, sealed state of one game, including hands, deck order, pending Guess values and Hidden_Sum values. It is never handed to AI_Player or to the UI.
- **Action**: A request to change the Game_State. The kinds are `PLACE`, `SUBMIT_GUESSES` and `ACK_REVEAL`.
- **Action_Log**: The ordered list of all accepted Actions of one game.
- **Result**: The outcome of an engine operation, either `{ ok: true, value }` or `{ ok: false, error }`, where `error.code` is a member of the closed Error_Code set.
- **Error_Code**: One of the engine rejection codes defined in the design (for example `OUT_OF_BOUNDS`, `OCCUPIED`, `NOT_ADJACENT`, `INVALID_ORIENTATION`, `CARD_NOT_IN_HAND`, `GUESS_OUT_OF_RANGE`).
- **Seed**: An unsigned 32-bit integer that fully determines shuffle and dealing, and with the Action_Log fully determines a game.
- **Seeded_Random**: The engine's own deterministic pseudo-random number generator (PRNG). It is the only source of randomness in `core/` and `ai/`.
- **CardId**: A string of the form `<Suit>-<Rank>`, for example `H-7`, `S-10`, `D-A`. Suit is one of `H`, `D`, `C`, `S`. Rank is one of `A`, `2`–`10`, `J`, `Q`, `K`. The convention matches the card keys used by the optical module, but the engine defines its own type and does not import that module.
- **Seat**: One of the 4 player positions `P0`–`P3`. Each Seat is a human Seat or an AI Seat.
- **Hand**: The cards held privately by one Seat.
- **Neutral_Card**: One of the 4 cards placed on D4, E4, D5, E5 at the start. Neutral_Cards have no owner.
- **Quad_Key**: The public identifier of a 2×2 group, equal to the notation of its top-left cell (for example `D4`). It contains no card identity.
- **Group_Id**: The internal identifier of a Quad_Group, the sorted set of its 4 CardIds serialized as in qroker-game Requirement 4.3. It is sealed and never part of a Player_View while cards are hidden.
- **Prediction_Batch**: The set of all Composite_Codes newly formed by one placement. All Seats submit a Guess for every code of the batch, and the batch is revealed once (qroker-game Requirement 6.5).
- **Player_View**: The only data structure that AI_Player and the UI may read. It contains the viewer's own Hand and public information only.
- **View_Projector**: The function `viewFor(state, viewer)` that derives a Player_View from a Game_State.
- **Identity_Visibility**: A game option with the values `OWNER_ONLY` and `FACE_UP`. Under `OWNER_ONLY`, the identity of a placed card is visible only to the Seat that placed it until the Composite_Code containing it is revealed. Under `FACE_UP`, every placed card is public. See Open Question OQ-1.
- **ScoreConfig**: The injected configuration `{ rewardByError: number[]; handEmptyBonus: number }` (qroker-game design, ScoreEngine).
- **DEV_PLACEHOLDER_SCORE_CONFIG**: The single named constant holding the provisional development ScoreConfig. It carries the flag `provisional: true`. Its numeric values are not a balance claim.
- **Reveal_Result**: The public outcome of one Prediction_Batch: Hidden_Sum and card identities of each code, plus earned score and cumulative score per Seat. It contains no Guess values.
- **Pass_Device_Gate**: A full-screen interstitial shown before the screen of a human Seat is displayed to that Seat, so that the previous human Seat's private information is not visible.
- **Browser_Practice_Mode**: The complete browser game defined by this spec (qroker-game Requirement 8).
- **Practice_UI**: The DOM-based user interface layer under `src/game/ui/`.
- **AI_Player**: A non-human Seat driven by an offline strategy (qroker-game Requirement 7).
- **Difficulty_Label**: The user-visible name of an AI strategy tier: `BEGINNER`, `ADVANCED`, `EXPERT`.
- **Work_Budget**: A deterministic cap, expressed as a count of evaluated candidates, on the computation of one AI decision.
- **Save_Envelope**: The versioned JSON document written to `localStorage` for one in-progress game.
- **Localizer**: The string-table module that maps string keys to Korean or English text.
- **Service_Worker**: The browser caching mechanism for offline access (qroker-game Glossary).
- **Simulation_Runner**: The component that plays many headless games with an injected ScoreConfig and reports statistics (qroker-game design, GameSimulator).
- **Milestone_P1**: The minimal end-to-end playable milestone defined in tasks.md.
- **Schematic_Code_View**: A rule-level drawing of a Composite_Code that shows which corner of each card carries a fragment and which corner is the Inward_Corner. It does not draw optical pixel patterns.

Terms defined in qroker-game (Board, Card, Card_Value, Quad_Group, Composite_Code, Hidden_Sum, Guess, Score, Placement_Action, Card_Orientation, Inward_Corner, Suit_Group, Fragment_Layout, Draw_Rule, Hand_Empty_End) keep their approved meaning.

---

## Requirements

### Requirement 1: Card Catalog and Card Identifiers

**User Story:** As a developer, I want a single canonical 52-card catalog with stable string identifiers, so that dealing, hands, the Board and later optical integration all refer to the same card names.

#### Acceptance Criteria

1. THE Game_Engine SHALL define the deck as exactly 52 distinct cards, the 13 ranks A, 2–10, J, Q, K in each of the 4 suits H, D, C, S, with no jokers (qroker-game Requirements 1.1 and 1.3).
2. THE Game_Engine SHALL represent each card by a CardId string of the form `<Suit>-<Rank>`, such that the 52 CardIds are pairwise distinct.
3. THE Game_Engine SHALL map Card_Value as A=1, 2–10=face value, J=11, Q=12, K=13 (qroker-game Requirement 1.1).
4. WHEN a string is parsed as a CardId, THE Game_Engine SHALL accept the string if and only if the string equals one of the 52 CardIds, and SHALL otherwise return the Error_Code `INVALID_CARD_ID`.
5. FOR ALL 52 CardIds, formatting the parsed suit and rank SHALL reproduce the original CardId string (round-trip property).
6. THE Game_Engine SHALL expose the 52 cards in one fixed canonical order (suits H, D, C, S; ranks A through K), and the order SHALL NOT change between releases without a rules-version increment.

---

### Requirement 2: Deterministic Seeded Dealing

**User Story:** As a player and as a tester, I want every game to be reproducible from a seed, so that I can replay interesting games and so that automated tests are stable.

#### Acceptance Criteria

1. THE Seeded_Random SHALL produce an identical sequence of values for an identical Seed, and SHALL be implemented inside `src/game/core/` without importing `src/optical`.
2. WHEN `newGame` is called with a Seed and a game configuration, THE Game_Engine SHALL shuffle the 52 cards with a Fisher–Yates shuffle that consumes only Seeded_Random, place 4 Neutral_Cards on D4, E4, D5 and E5, deal 4 Hand cards to each of the 4 Seats, and keep the remaining 32 cards as the deck (qroker-game Requirements 3.1 and 3.2).
3. FOR ALL Seeds, THE Game_Engine SHALL deal 20 pairwise-distinct cards (4 neutral plus 16 Hand cards) and 32 deck cards, and the union of the three zones SHALL equal the 52-card catalog (qroker-game design Property 7).
4. FOR ALL game configurations, calling `newGame` twice with the same Seed and configuration SHALL return deeply equal Game_State values.
5. WHEN the user supplies seed text, THE Seed_Parser SHALL map a decimal integer in the range 0 to 4294967295 to that integer, SHALL map any other non-empty text to an unsigned 32-bit integer by a documented, deterministic hash, and SHALL map text that is empty or whitespace only to the Error_Code `SEED_EMPTY`.
6. THE Game_Engine and the AI_Player modules SHALL NOT call `Math.random`, `Date`, `performance.now` or `crypto`, so that all randomness derives from the Seed.
7. WHEN the Practice_UI starts a game without a user-supplied seed, THE Practice_UI SHALL draw a Seed from the browser's cryptographic random source, display the Seed on the game screen, and pass the Seed to `newGame`.
8. THE Game_Engine SHALL include a golden test fixture that records the full initial deal for at least one fixed Seed, so that an accidental change of shuffle, order or deal sequence fails a test.

---

### Requirement 3: Board and Legal Placement

**User Story:** As a player, I want the Board to enforce the placement rules exactly, so that no illegal move can occur.

#### Acceptance Criteria

1. THE Board SHALL be an 8×8 grid with columns A–H and rows 1–8, with row 1 displayed at the top, and the Game_Engine SHALL convert between notation (for example `D4`) and zero-based coordinates without loss (qroker-game Requirement 3.1).
2. WHEN a `PLACE` Action is processed, THE Placement_Validator SHALL verify that the target cell is within A1–H8, is empty, and is orthogonally adjacent to at least one already placed card, and SHALL reject the Action with the Error_Code `OUT_OF_BOUNDS`, `OCCUPIED` or `NOT_ADJACENT` respectively when the corresponding condition fails (qroker-game Requirement 3.3).
3. WHEN a `PLACE` Action names an orientation other than 0 or 180, THE Placement_Validator SHALL reject the Action with the Error_Code `INVALID_ORIENTATION` (qroker-game Requirement 3.11c).
4. WHEN a `PLACE` Action names a card that is not in the acting Seat's Hand, THE Game_Engine SHALL reject the Action with the Error_Code `CARD_NOT_IN_HAND`.
5. THE Game_Engine SHALL NOT provide any Action that swaps, moves or removes a card already on the Board (qroker-game Requirement 3.4).
6. WHEN the Game_Engine rejects an Action, THE Game_Engine SHALL return an error Result, SHALL leave the input Game_State unmodified, and SHALL NOT produce a next state.
7. FOR ALL accepted `PLACE` Actions, the number of cards on the Board after the Action SHALL equal the number before plus 1 (qroker-game Requirement 3.10).
8. THE Placement_Validator SHALL provide a function that lists all legal target cells for the current Board, and the set of listed cells SHALL equal the set of cells for which the validation of Criterion 2 succeeds.
9. WHILE the number of cards on the Board is less than 64, THE Placement_Validator SHALL list at least one legal target cell, so that a Seat that holds at least one card always has a legal Action.

---

### Requirement 4: Card Orientation and Fragment Slot Rules

**User Story:** As a player, I want orientation (0° or 180°) and suit symmetry to determine whether a card can take part in a Composite Code exactly as the approved rules say, so that the game rules and the later physical cards agree.

#### Acceptance Criteria

1. THE Game_Engine SHALL record the Card_Orientation (0 or 180) of every placed card together with the placement (qroker-game Requirement 3.11).
2. THE Game_Engine SHALL define the Fragment_Layout as data: H at 0° = TL+BR and at 180° = TL+BR; D at 0° = TR+BL and at 180° = TR+BL; C at 0° = TR+BR and at 180° = TL+BL; S at 0° = TL+BL and at 180° = TR+BR (qroker-game Requirements 14.1, 14.5 and 14.6, restated from the approved design Core Types).
3. THE Game_Engine SHALL define the Inward_Corner by slot as TL→BR, TR→BL, BL→TR, BR→TL (qroker-game Requirement 14.3).
4. WHEN a card with a given orientation occupies a slot of a 2×2 group, THE Game_Engine SHALL treat the card as a valid member of a Composite_Code if and only if the card's Fragment_Layout corner set for that orientation contains the Inward_Corner of the slot (qroker-game Requirements 3.12 and 14.4).
5. FOR ALL H and D cards, THE Game_Engine SHALL return the same member validity for orientation 0 and orientation 180 (qroker-game Requirement 3.11a).
6. THE Game_Engine SHALL keep its Fragment_Layout table in a module that does not import `src/optical`, and a test-only parity test SHALL assert that the table equals the corner sets implied by `src/optical/fragments.ts`.

---

### Requirement 5: Composite Code Detection and Duplicate Prevention

**User Story:** As a game engine developer, I want each newly formed Composite Code detected exactly once with a correct Hidden_Sum, so that scoring is fair and never duplicated.

#### Acceptance Criteria

1. WHEN a card is placed, THE Composite_Code_Detector SHALL examine only the 2×2 regions that contain the placed cell, at most 4 regions (qroker-game Requirement 4.1).
2. WHEN all 4 cells of an examined 2×2 region are occupied, THE Composite_Code_Detector SHALL classify the region as a Quad_Group, and SHALL classify the Quad_Group as a Composite_Code if and only if all 4 members are valid under Requirement 4 Criterion 4. Occupancy alone SHALL NOT make a Composite_Code (qroker-game Requirements 3.12 and 4.2).
3. THE Composite_Code_Detector SHALL compute the Hidden_Sum of a Composite_Code as the sum of the 4 Card_Values, which is an integer from 4 to 52, and SHALL return the same Hidden_Sum for the same 4 cards regardless of cell arrangement or placement order (qroker-game Requirements 1.2, 1.4 and 1.5).
4. THE Composite_Code_Detector SHALL derive the Group_Id from the sorted set of the 4 CardIds, and SHALL record the Group_Id of every code that enters a Prediction_Batch in a scored-groups record (qroker-game Requirement 4.3).
5. THE Composite_Code_Detector SHALL grant scoring eligibility only when the Composite_Code is formed, is newly formed by the current placement, and its Group_Id is not in the scored-groups record (qroker-game Requirement 4.4).
6. FOR ALL Board states, running the detector repeatedly on the same Board state and the same scored-groups record SHALL not return any additional eligible code after the first run has recorded its results (qroker-game Requirement 4.5).
7. THE Game_Engine SHALL NOT make the 2×2 group of the 4 Neutral_Cards eligible for scoring, because that group is not newly formed by a placement (qroker-game Requirement 4.4b; Open Question OQ-3).
8. THE Game_Engine SHALL identify each Composite_Code in every public structure by its Quad_Key and SHALL NOT place the Group_Id or any CardId of a hidden card in a public structure before the code is revealed.

---

### Requirement 6: Turn Management and Drawing

**User Story:** As a player, I want turns, drawing and the first-round exemption to follow the approved rules, so that hand sizes and the game length are predictable.

#### Acceptance Criteria

1. THE Turn_Manager SHALL give the turn to Seat `P0` first and then to the Seats in increasing order `P0`, `P1`, `P2`, `P3`, `P0`, and so on (Open Question OQ-5).
2. WHILE the phase is `PLACEMENT`, THE Game_Engine SHALL accept a `PLACE` Action only from the Seat whose turn it is, and SHALL reject any other Action or Seat with the Error_Code `NOT_YOUR_TURN` or `WRONG_PHASE`.
3. WHEN a placement does not complete a new Composite_Code and the Seat has already completed its first placement, THE Draw_Manager SHALL draw 1 card from the top of the deck into the Seat's Hand (qroker-game Requirement 3.5).
4. WHEN a placement is the first placement of that Seat, THE Draw_Manager SHALL NOT draw, whether or not the placement completes a Composite_Code (qroker-game Requirement 3.5 and Open Question OQ-4).
5. WHEN a placement completes one or more new Composite_Codes, THE Draw_Manager SHALL NOT draw (qroker-game Requirement 3.6).
6. WHEN a draw is required while the deck is empty, THE Draw_Manager SHALL skip the draw and keep the Hand size unchanged (qroker-game Requirement 3.8).
7. FOR ALL reachable Game_States, the number of deck cards plus Board cards plus the sum of all Hand sizes SHALL equal 52, all those cards SHALL be pairwise distinct, and the number of Board cards SHALL equal the number of accepted `PLACE` Actions plus 4 (qroker-game Requirements 3.2 and 3.10; design GameStateManager invariants).

---

### Requirement 7: Private Guess Collection and Simultaneous Reveal

**User Story:** As a player, I want to enter my Guess privately and see all results at once, so that nobody's Guess influences anybody else's.

#### Acceptance Criteria

1. WHEN a placement newly forms one or more Composite_Codes, THE Game_Engine SHALL move to the phase `GUESS_COLLECT` with one Prediction_Batch that contains all those codes, and SHALL require every one of the 4 Seats, including the placing Seat, to submit one Guess per code (qroker-game Requirements 6.1 and 6.5; Open Question OQ-5).
2. WHEN a `SUBMIT_GUESSES` Action contains a Guess that is not an integer or is outside 4 to 52 inclusive, THE Game_Engine SHALL reject the Action with the Error_Code `GUESS_NOT_INTEGER` or `GUESS_OUT_OF_RANGE` and SHALL keep the Seat's submission pending (qroker-game Requirements 2.8 and 11.3).
3. IF a Seat submits a second `SUBMIT_GUESSES` Action for the same Prediction_Batch, THEN THE Game_Engine SHALL reject the second Action with the Error_Code `DUPLICATE_SUBMISSION` and SHALL keep the first submission.
4. IF a `SUBMIT_GUESSES` Action does not contain exactly one Guess for each Quad_Key of the Prediction_Batch, THEN THE Game_Engine SHALL reject the Action with the Error_Code `GUESS_KEYS_MISMATCH`.
5. WHILE a Prediction_Batch is not fully collected, THE View_Projector SHALL NOT include the Hidden_Sum of any code of the batch, and SHALL NOT include any Guess value of any Seat other than the viewer, in any Player_View (qroker-game Requirements 6.1 and 6.3).
6. WHEN the last Seat's Guesses of a Prediction_Batch are accepted, THE Game_Engine SHALL reveal all codes of the batch at the same time as one Reveal_Result containing for each code the Hidden_Sum and the 4 card identities, and for each Seat the earned score and the cumulative Score, and SHALL NOT include any Guess value (qroker-game Requirements 2.7 and 6.2).
7. FOR ALL Prediction_Batches and ALL orders in which the 4 Seats submit, the resulting Reveal_Result SHALL be identical (confluence).
8. THE Game_Engine SHALL NOT expose any Seat's Guess value to any other Seat during the game, and SHALL NOT expose any Guess value in any Player_View or Reveal_Result at any time, including after the game has ended (qroker-game Requirement 6.3; Open Question OQ-14).
9. WHEN a placement completes no Composite_Code, THE Game_Engine SHALL NOT enter `GUESS_COLLECT` and SHALL move the turn to the next Seat.

---

### Requirement 8: Configurable Scoring and Provisional Placeholder

**User Story:** As a game designer, I want all numeric score values to come from an injected configuration, so that simulation can decide them later without code changes.

#### Acceptance Criteria

1. WHEN a Guess is scored, THE Score_Engine SHALL compute the error e as the absolute difference between the Guess and the Hidden_Sum, and SHALL return `rewardByError[e]` when e is less than the table length and 0 otherwise (qroker-game Requirements 2.1–2.3).
2. THE Score_Engine SHALL return the same score for Guess = Hidden_Sum + e and Guess = Hidden_Sum − e, and SHALL return a score that does not increase as e increases (qroker-game Requirements 2.1 and 2.2).
3. WHEN a ScoreConfig is supplied to `newGame`, THE Score_Engine SHALL reject the configuration with the Error_Code `INVALID_SCORE_CONFIG` if the table is empty, if any value is negative or not finite, if `rewardByError[0]` is not greater than 0, if the table increases anywhere, or if `handEmptyBonus` is negative or not finite (qroker-game Requirement 2.4).
4. THE Game_Engine SHALL receive the ScoreConfig only through its configuration input, and no numeric score value SHALL be written in engine code outside the constant DEV_PLACEHOLDER_SCORE_CONFIG and test files (qroker-game Requirement 2.4).
5. THE Game_Engine SHALL provide DEV_PLACEHOLDER_SCORE_CONFIG with `provisional: true`, a non-increasing table that awards the highest value at e=0, and a comment stating that the values are a development placeholder, chosen only to make scoring visible during development, and that no balance claim is made (docs/open-decisions.md item 7).
6. THE Game_Engine SHALL NOT award a completion bonus for forming a Composite_Code (qroker-game Requirement 2.5).
7. THE Score_Engine SHALL compute a prediction score only from the Guess and Hidden_Sum of the current Prediction_Batch (qroker-game Requirement 2.6).
8. WHEN a Seat's Hand reaches 0 cards, THE Game_Engine SHALL add `handEmptyBonus` to that Seat's cumulative Score exactly once (qroker-game Requirement 2.9).

---

### Requirement 9: Game End, Ranking and Termination

**User Story:** As a player, I want the game to end at the approved moment with a clear ranking, so that every game has a result.

#### Acceptance Criteria

1. WHEN a placement reduces a Seat's Hand to 0 cards, THE Game_Engine SHALL finish the scoring and Guess collection that belong to that placement, apply the hand-empty bonus, and then set the phase to `ENDED` (qroker-game Requirement 3.7).
2. WHILE the phase is `ENDED`, THE Game_Engine SHALL reject every Action with the Error_Code `GAME_ENDED`.
3. WHEN the deck becomes empty, THE Game_Engine SHALL continue the game and SHALL NOT end the game (qroker-game Requirement 3.8).
4. WHEN the game ends, THE Ranking_Function SHALL rank Seats by descending final Score, assign the same rank to Seats with equal Scores, and apply no further tiebreak (qroker-game Requirement 3.9; Open Question OQ-6).
5. FOR ALL final score distributions, Seats with equal Scores SHALL have equal ranks, a Seat with a higher Score SHALL have a lower rank number, and at least one Seat SHALL have rank 1 (qroker-game design Property 19).
6. FOR ALL Seeds and ALL combinations of AI strategies, THE Game_Engine SHALL reach the phase `ENDED` after at most 48 accepted `PLACE` Actions (52 cards minus 4 Neutral_Cards), with every placement succeeding from a legal cell.
7. WHEN the phase is `ENDED`, THE Game_Engine SHALL provide the full history of revealed Composite_Codes, each with its Quad_Key, card identities, Hidden_Sum and per-Seat earned score, for display on the final scoreboard (qroker-game Requirement 8.4).

---

### Requirement 10: Information Isolation by Player View

**User Story:** As a player, I want a structural guarantee that AI opponents and other seats cannot see my private information, so that the inference game is fair.

#### Acceptance Criteria

1. THE Game_Engine SHALL expose the Game_State to consumers only through the View_Projector, and the AI_Player and Practice_UI modules SHALL read only Player_View values.
2. THE Player_View SHALL contain the viewer's own Hand, the public Board, the Hand sizes of all Seats, the deck size, the cumulative Scores, the per-Seat flag whether a Guess was submitted, the viewer's own submitted Guesses, the phase, the active Seat, and the revealed history (qroker-game design PlayerView).
3. THE Player_View SHALL NOT contain the Hand of any other Seat, the contents or order of the deck, any Guess of another Seat, any not-yet-revealed Hidden_Sum, or the identity of any card that is hidden from the viewer.
4. WHERE Identity_Visibility is `OWNER_ONLY`, THE View_Projector SHALL show the identity of a placed card only to the Seat that placed it, SHALL show every Neutral_Card to all Seats, and SHALL show the 4 cards of a code to all Seats from the moment the code is revealed (Open Question OQ-1).
5. WHERE Identity_Visibility is `FACE_UP`, THE View_Projector SHALL show the identity of every placed card to all Seats.
6. FOR ALL pairs of Game_States that are identical in everything a given viewer is allowed to see and differ only in information hidden from that viewer, THE View_Projector SHALL return deeply equal Player_Views for that viewer (non-interference).
7. FOR ALL AI strategies and ALL pairs of Game_States that give a viewer equal Player_Views and equal seeds, THE AI_Player SHALL return equal decisions.
8. THE Practice_UI documentation SHALL state that hot-seat privacy is an honor-system protection on a shared screen, that `localStorage` content is readable through browser developer tools, and that no protection against a determined local user is claimed.

---

### Requirement 11: Offline AI Opponents

**User Story:** As a single player, I want three distinct AI opponents that play offline within a short time, so that I can practice without a network or a paid API.

#### Acceptance Criteria

1. THE Game_Engine SHALL provide 3 distinct AI strategies that run in the local browser without any network access or external API: `BEGINNER` (random legal placement and random Guess), `ADVANCED` (heuristic placement that maximizes the likelihood of completing a Quad_Group, and Guess from visible cards plus the mean of the unseen cards), and `EXPERT` (placement heuristic plus a Guess that maximizes expected score under the injected ScoreConfig from a posterior over unseen cards) (qroker-game Requirements 7.1 and 7.5).
2. THE AI_Player SHALL return only `PLACE` and `SUBMIT_GUESSES` Actions that the Game_Engine accepts, for every Player_View in which the AI Seat is the acting Seat (qroker-game Requirements 7.2; design Property 17).
3. THE AI_Player SHALL derive its decisions only from the Player_View, the injected ScoreConfig from the public rules, and a seed value, and SHALL return the same decision for the same Player_View and seed (qroker-game Requirement 7.4).
4. THE AI_Player SHALL bound the computation of one decision by a Work_Budget of evaluated candidates that is a named, documented constant per strategy.
5. WHEN a test measures the elapsed time of one AI decision on the test machine, THE test SHALL record the elapsed time and SHALL fail if one decision takes longer than 3000 ms (qroker-game Requirement 7.3).
6. WHEN the Practice_UI applies an AI Action, THE Practice_UI SHALL add a presentation delay of at most 1000 ms, so that decision time plus delay stays within the 3-second limit of qroker-game Requirement 7.3.
7. THE Game_Engine SHALL provide a registry that maps each Difficulty_Label to a strategy, with Korean and English display names for each label.
8. THE AI_Player modules SHALL import from the engine only the Player_View types, the geometry and rule helpers, and the Seeded_Random, and a boundary test SHALL fail if an AI module imports the Game_State type or any engine state module.

---

### Requirement 12: Engine Architecture and Deterministic Replay

**User Story:** As a developer, I want the engine to be a pure reducer that runs headless in Node, so that it is simple to test and replay.

#### Acceptance Criteria

1. THE Game_Engine SHALL expose `newGame(options) → Result<Game_State>` and `reduce(state, action) → Result<Game_State>` as pure functions that do not mutate their inputs and perform no I/O.
2. THE Game_Engine SHALL NOT reference DOM globals, `window`, `document`, `localStorage` or any `node:` module, so that the same code runs in Node and in the browser.
3. THE Game_Engine, the AI_Player modules, the persistence layer and the Practice_UI SHALL NOT import any module under `src/optical` at runtime, except one test-only parity test named in Requirement 4 Criterion 6.
4. WHEN `replay(seed, configuration, actionLog)` is called, THE Game_Engine SHALL return a Game_State deeply equal to the state reached by applying the same Actions one by one to `newGame(seed, configuration)`, and SHALL return an error identifying the index of the first rejected Action.
5. THE Game_Engine SHALL include the AI_Players' Actions in the Action_Log, so that replay needs no AI computation.
6. THE Game_Engine SHALL define a `RULES_VERSION` integer constant that is part of every configuration and every Save_Envelope, and that SHALL be incremented whenever a change alters the outcome of replaying an existing Action_Log.
7. THE Game_Engine SHALL report every rejection as an Error_Code from one closed enumeration, so that each code has exactly one Korean and one English message.

---

### Requirement 13: Playable Board, Hand and Placement Interface

**User Story:** As a human player, I want to see the Board and my Hand and place cards by tap or click, so that I can play complete turns without reading documentation.

#### Acceptance Criteria

1. THE Practice_UI SHALL render the Board as an 8×8 grid of 64 focusable button elements, with column labels A–H and row labels 1–8, using DOM elements and CSS (Design Decision D2).
2. THE Practice_UI SHALL display, for the active human Seat, the Hand cards as selectable buttons, and SHALL NOT display the Hand of any other Seat.
3. WHEN the human Seat selects a Hand card, THE Practice_UI SHALL highlight all legal target cells obtained from the Placement_Validator and SHALL show an orientation toggle with the values 0° and 180°.
4. WHEN the human Seat taps or clicks a legal cell with a card selected, THE Practice_UI SHALL show a preview of the card at that cell with the chosen orientation and SHALL show a confirm button, and SHALL send the `PLACE` Action only when the confirm button is activated.
5. WHEN the human Seat taps or clicks a cell that is not legal, THE Practice_UI SHALL show the localized message for the corresponding Error_Code and SHALL NOT change the Game_State.
6. WHILE an AI Seat is the active Seat, THE Practice_UI SHALL disable the placement controls and SHALL display a status that names the active AI Seat.
7. THE Practice_UI SHALL render each visible card as its rank and suit symbol (♥ ♦ ♣ ♠), with the suit shown by shape and not by color alone, an indicator of the orientation, and the owner of the card.
8. WHERE a placed card is hidden from the viewer, THE Practice_UI SHALL render the card as a face-down card that shows the owner and the orientation but not the rank or suit.
9. WHEN a Composite_Code has been formed, THE Practice_UI SHALL mark its 2×2 region on the Board, and WHERE the Schematic_Code_View is available, THE Practice_UI SHALL show it for the marked region (qroker-game Requirement 8.3; Open Question OQ-12).

---

### Requirement 14: Guess Entry, Privacy Gate, Reveal and Scoreboard

**User Story:** As a player, I want a private Guess entry and a clear reveal, so that I can predict without being seen and see everybody's points at once.

#### Acceptance Criteria

1. WHEN the phase becomes `GUESS_COLLECT`, THE Practice_UI SHALL show, for each human Seat that has not yet submitted, a Guess entry for every Quad_Key of the batch, with the code's 2×2 region marked on the Board and without showing any Hidden_Sum.
2. WHERE the game has 2 or more human Seats, THE Practice_UI SHALL show the Pass_Device_Gate before a human Seat's Guess entry and before a human Seat's Hand, and SHALL remove the previous Seat's private content from the DOM before the gate is shown.
3. WHILE the Pass_Device_Gate is shown, THE Practice_UI SHALL NOT render any Hand card, Guess value or owner-only card identity of any Seat.
4. THE Practice_UI SHALL accept only integer Guess input from 4 to 52 and SHALL show the localized message for `GUESS_NOT_INTEGER` or `GUESS_OUT_OF_RANGE` otherwise (qroker-game Requirement 2.8).
5. THE Practice_UI SHALL NOT display any AI Seat's Guess, and SHALL show only a submitted or waiting status per Seat during `GUESS_COLLECT` (qroker-game Requirement 6.3).
6. WHEN the Reveal_Result is available, THE Practice_UI SHALL show, on one screen, the Hidden_Sum and the 4 revealed cards of each code, and the earned score and cumulative Score of each Seat, and SHALL NOT show any Guess value (qroker-game Requirements 2.7 and 6.2).
7. THE Practice_UI SHALL show a scoreboard on every game screen with the cumulative Score, the Hand size and the Seat name of each Seat, and the deck size.
8. WHILE the active ScoreConfig has `provisional: true`, THE Practice_UI SHALL display a banner on every game screen with the text "provisional scoring" (Korean "임시 점수 규칙").

---

### Requirement 15: Game Lifecycle: New Game, Seed, Rematch and Final Ranking

**User Story:** As a player, I want to start, restart and finish games easily and see a final ranking, so that I can play repeatedly.

#### Acceptance Criteria

1. THE Practice_UI SHALL provide a setup screen with a seed field, the number of human Seats from 1 to 4 (default 1), the Difficulty_Label of each AI Seat, the Identity_Visibility option, and the language option.
2. WHEN the user starts a game from the setup screen, THE Practice_UI SHALL call `newGame` with the entered values and SHALL display the Seed on the game screen.
3. WHEN the game ends, THE Practice_UI SHALL show the final ranking with shared ranks for ties, the final Scores, and the Hidden_Sum details of every revealed code (qroker-game Requirements 3.9 and 8.4).
4. THE Practice_UI SHALL offer on the final screen a "rematch" that starts a new game with the same Seats and options and a new Seed, and a "replay same seed" that starts a new game with the same Seed and options.
5. WHEN the user chooses to abandon a game in progress, THE Practice_UI SHALL ask for confirmation before discarding the game.
6. FOR ALL games started with the same Seed and the same options, THE Practice_UI SHALL produce the same initial deal as the headless engine (shared `newGame`).

---

### Requirement 16: Help, Localization and Accessibility

**User Story:** As a player, I want rules help in my language and an interface that I can use with keyboard, screen reader and low vision, so that the game is accessible.

#### Acceptance Criteria

1. THE Practice_UI SHALL provide a rules and help overlay, openable from every screen, that summarizes the placement rules, orientation, drawing, Guess and reveal, and ranking, states that scoring is provisional while the ScoreConfig is provisional, and closes with the Escape key and a close button.
2. THE Localizer SHALL provide every user-visible string through a key lookup in a Korean table and an English table, and a test SHALL fail if a key exists in one table and not in the other or if the placeholder names differ between the two.
3. THE Localizer SHALL provide the Korean text of the approved Error Handling table of qroker-game design verbatim for the placement errors, and an English message for each Error_Code.
4. WHEN the user changes the language, THE Practice_UI SHALL apply the new language without losing the game in progress and SHALL store the choice in `localStorage`.
5. THE Practice_UI SHALL start in Korean if the browser language starts with `ko` and in English otherwise, unless a stored choice exists.
6. THE Practice_UI SHALL make every function operable by keyboard alone, SHALL move focus within the Board by the arrow keys, and SHALL show a visible focus indicator.
7. THE Practice_UI SHALL give each Board cell an accessible name that states its notation and state (empty, legal, occupied with owner), and SHALL announce turn changes, errors and reveal results in a polite live region.
8. THE Practice_UI SHALL use color pairs whose contrast ratio is at least 4.5:1 for text and at least 3:1 for interface component boundaries, as computed by a test from the design tokens.
9. WHILE the browser reports `prefers-reduced-motion: reduce`, THE Practice_UI SHALL disable non-essential animation.

---

### Requirement 17: Mobile Responsiveness

**User Story:** As a mobile player, I want to play on a phone in portrait or landscape, so that I can practice anywhere (qroker-game Requirement 8.5).

#### Acceptance Criteria

1. THE Practice_UI SHALL be usable at a viewport width of 320 CSS pixels without horizontal page scrolling.
2. THE Practice_UI SHALL size each Board cell to at least 24×24 CSS pixels and every other interactive control to at least 44×44 CSS pixels.
3. THE Practice_UI SHALL arrange the Board above the Hand in portrait orientation and the Board beside the Hand and scoreboard in landscape orientation, by CSS media queries.
4. THE Practice_UI SHALL perform every function by pointer events and keyboard events, and SHALL NOT require hover.
5. THE Practice_UI SHALL include a viewport meta tag and SHALL define font sizes in relative units.
6. THE team SHALL record a manual verification matrix of viewports and browsers in `docs/`, and the report SHALL state that no browser outside the matrix was tested.

---

### Requirement 18: Save, Resume and Versioned Storage

**User Story:** As a player, I want an interrupted game to resume after a reload, so that closing the tab does not lose my game (qroker-game Requirement 10.1: no account or server).

#### Acceptance Criteria

1. WHEN the Game_Engine accepts an Action in the browser, THE Persistence_Layer SHALL write the Save_Envelope to `localStorage` before the next Action is processed.
2. THE Save_Envelope SHALL contain a format identifier, a `saveVersion` integer, the `RULES_VERSION`, the Seed, the game configuration and the Action_Log, and SHALL NOT contain the full Game_State.
3. WHEN the app loads and a valid Save_Envelope exists, THE Practice_UI SHALL offer "continue" and "discard", and SHALL restore the game by replaying the Action_Log when the user continues.
4. IF the stored `saveVersion` is older and a migration function exists, THEN THE Persistence_Layer SHALL migrate the envelope and replay it.
5. IF the stored `saveVersion` or `RULES_VERSION` has no migration, or the JSON is invalid, or the replay rejects an Action, THEN THE Persistence_Layer SHALL discard the envelope, SHALL tell the user in the current language that the saved game cannot be continued, and SHALL start the setup screen without throwing an exception.
6. IF `localStorage` is unavailable or a write fails, THEN THE Persistence_Layer SHALL keep the game in memory, SHALL show a notice that the game cannot be saved, and SHALL continue the game.
7. FOR ALL valid Game_States reachable by legal Actions, serializing a Save_Envelope, parsing the result and replaying SHALL produce a Game_State deeply equal to the original (round-trip property).
8. WHEN the game reaches the phase `ENDED`, THE Persistence_Layer SHALL remove the in-progress save, and SHALL keep the stored language and setup preferences (stored under a separate key).

---

### Requirement 19: Offline Operation and PWA Basics

**User Story:** As a player at an event with poor connectivity, I want the game to load and run offline after the first visit (qroker-game Requirement 10).

#### Acceptance Criteria

1. WHEN the app is loaded for the first time, THE Service_Worker SHALL cache all static assets listed in the build output (HTML, CSS, JavaScript, icons, manifest) (qroker-game Requirement 10.2).
2. WHEN the app is opened without a network connection after the first visit, THE Service_Worker SHALL serve the cached assets, and THE Practice_UI SHALL show an offline notice (qroker-game Requirement 10.3).
3. WHERE a new app version is available, THE Service_Worker SHALL cache the new version in the background and THE Practice_UI SHALL apply the new version only after the user chooses to reload (qroker-game Requirement 10.5).
4. WHEN a new Service_Worker version activates, THE Service_Worker SHALL delete caches of earlier versions.
5. THE web app manifest SHALL provide the name, short name, start URL, standalone display mode, theme and background colors, language, and icons of at least 192 and 512 pixels.
6. IF Service_Worker registration fails or is unsupported, THEN THE Practice_UI SHALL continue to work without offline support and SHALL NOT show an error dialog.
7. THE Practice_UI SHALL NOT issue any network request other than loading its own static assets, and a static scan test SHALL fail if application code outside the Service_Worker calls `fetch`, `XMLHttpRequest`, `WebSocket` or `sendBeacon`.
8. THE build SHALL declare a browser target, and the team SHALL verify the latest 2 versions of Chrome, Firefox and Safari manually and record the result, without claiming other browsers (qroker-game Requirement 8.1).

---

### Requirement 20: Headless Play Harness and Simulation Interface

**User Story:** As a developer, I want to play complete games headless and later simulate many games, so that I can prove termination now and tune scoring later.

#### Acceptance Criteria

1. THE Game_Engine package SHALL provide a headless driver `playGame({ seed, seats, scoreConfig })` that plays a complete game by asking each AI strategy for its Actions through the Player_View and applying them with `reduce`, and returns the final Game_State and the Action_Log.
2. FOR ALL Seeds in a configurable test range (default at least 200 Seeds), WHEN `playGame` plays a game of 4 AI Seats, THE driver SHALL end in the phase `ENDED`, SHALL have rejected no Action, and SHALL have kept every invariant of Requirement 6 Criterion 7 after every Action.
3. FOR ALL Seeds in the test range, replaying the Action_Log produced by `playGame` SHALL return a Game_State deeply equal to the final Game_State of the driver.
4. THE Simulation_Runner interface SHALL accept an injected ScoreConfig, a Seed, a game count and the strategies of the Seats, and SHALL return win rates per strategy, average game length, the share of prediction score in the total score, the frequency of rank changes caused by the hand-empty bonus, and a score histogram (qroker-game design GameSimulator).
5. THE Simulation_Runner SHALL return identical results for identical inputs.
6. THE Simulation_Runner results SHALL NOT be used by this spec to fix any value of ScoreConfig, and the spec SHALL record that tuning of the score table and bonus is deferred to Milestone P3.

---

### Requirement 21: Test and Quality Gates

**User Story:** As a maintainer, I want automated gates that keep the engine correct and information-safe, so that later changes cannot silently break rules or leak hidden data.

#### Acceptance Criteria

1. THE team SHALL implement each correctness property of the design as one property-based test with `fast-check`, run at least 100 iterations per property, and tag each test with the comment `// Feature: qroker-playable-game, Property N: <text>`.
2. THE team SHALL provide non-interference tests (Requirement 10 Criteria 6 and 7) and a serialized-view scan test that fail if a Player_View for an incomplete Prediction_Batch contains a not-yet-revealed Hidden_Sum or another Seat's Guess.
3. THE team SHALL provide a boundary test that scans `src/game/**` non-test files and fails on an import of `src/optical`, on a `node:` import in `core/`, `ai/`, `persistence/` or `ui/`, on a DOM global in `core/` or `ai/`, on `Math.random`, `Date` or `performance.now` in `core/` or `ai/`, and on an AI import of an engine state module.
4. THE team SHALL provide UI smoke tests in a headless DOM environment that play a complete game by DOM events from setup to the final ranking, and that check the Pass_Device_Gate, the language switch and the error messages.
5. WHEN the game tests run, THE existing test suite under `src/optical` and the frozen codebook SHALL remain unmodified and SHALL pass.
6. THE team SHALL document in `docs/practice-mode.md` the commands to install, run in development, build, serve the build, run the tests, and type-check.

---

### Requirement 22: Scope Boundaries and Deferred Integration

**User Story:** As a product owner, I want the boundary between Practice Mode and the optical Scoring Companion kept explicit, so that no unverified optical or camera claim enters this spec.

#### Acceptance Criteria

1. THE Browser_Practice_Mode SHALL NOT depend on `src/optical`, a camera, or any optical decoding at runtime.
2. THE Practice_UI SHALL show Composite_Codes as a Schematic_Code_View only, and the pixel-level optical marker rendering of qroker-game Requirement 8.3 SHALL be deferred to the Scoring Companion integration (Open Question OQ-12).
3. THE team SHALL defer the Scoring Companion integration with `src/optical` (qroker-game Requirements 9.6–9.11; status pointer: `docs/optical/OPTICAL-STATUS.md`), and the CardId convention of Requirement 1 SHALL be the integration key.
4. THE spec documents SHALL NOT claim any result of real printed cards, real camera reading, strategic balance or measured performance that the team has not measured.
5. THE spec SHALL NOT change any approved gameplay rule, and each gap or inconsistency SHALL be recorded as an Open Question or an inconsistency note with a provisional default.

---

## Open Questions and Provisional Defaults

Each item has a provisional default that the design and tasks use. Changing a default does not require a rule change in qroker-game unless stated.

| ID | Question | Source | Options | Provisional default |
|----|----------|--------|---------|---------------------|
| OQ-1 | Hidden-identity handling (docs/open-decisions.md #2). With every placed card visible, any Seat can add 4 visible values, the Guess is trivial, and ties dominate. qroker-game 6.1 and 7.4 imply visible Board cards, while 6.4 implies face-down cards flipped at reveal. | open-decisions #2; qroker-game 6.1, 6.4, 7.4 | (a) `FACE_UP`: all placed cards public. (b) `OWNER_ONLY`: only the placer sees a placed card until its code is revealed. (c) Both as an option. | (c) Implement both as the option Identity_Visibility, default `OWNER_ONLY` so that the Guess is a real inference. The setup screen shows the option. No rule is changed. |
| OQ-2 | Orientation of the 4 Neutral_Cards (not stated in qroker-game 3.1). It matters for ♣ and ♠ in later groups. | qroker-game 3.1, 3.11 | (a) all 0°. (b) seeded random per card. | (a) all 0°. |
| OQ-3 | Valid starting four cards (open-decisions #3). | open-decisions #3; qroker-game 4.4b | (a) starting group never scored. (b) adjust orientation or arrangement until valid. (c) redeal until valid. | (a), which follows qroker-game 4.4b because the starting group is not formed by a placement. No redeal. |
| OQ-4 | First-round exemption scope (open-decisions #6). qroker-game 3.5 and the Glossary (Draw_Rule) already say "each player's first placement". | qroker-game 3.5; open-decisions #6 | (a) per-Seat first placement. (b) first N placements of the game. | (a), the approved text. The open-decisions row appears outdated. |
| OQ-5 | Unspecified turn rules: first Seat, direction, and whether the placing Seat also guesses. | qroker-game 3.x, 6.1 ("all participating players") | various | `P0` first, increasing order, all 4 Seats guess including the placer. |
| OQ-6 | Numbering of tied ranks ("same rank", no tiebreak). | qroker-game 3.9 | (a) competition ranking 1,1,3,4. (b) dense ranking 1,1,2,3. | (a) competition ranking. |
| OQ-7 | UI framework and bundler. | qroker-game design Overview ("bundler-agnostic") | (a) no bundler (tsc + static files). (b) Vite. (c) a UI framework. | (b) Vite as an explicit devDependency, no UI framework. Vite 8.3.8 is already installed as a transitive dependency of Vitest 5.1.0. Flagged decision D3. |
| OQ-8 | Number of AI players in P1. | qroker-game 7.1, 8 | 1 or 3 AI | 3 AI plus 1 human, because qroker-game 3.2 fixes 4 players. Setup also allows 1–4 human Seats. |
| OQ-9 | Localization scope. | user request | ko only; ko+en; more | Korean and English for all UI text, help and errors. Card names are glyph based. No other language. |
| OQ-10 | Score table and hand-empty bonus (open-decisions #7). | qroker-game 2.2, 2.4, 2.9 | simulation | Placeholder only. Final values are decided in P3 or later. |
| OQ-11 | Headless DOM test environment and browser tests. | user request | jsdom, happy-dom, Playwright | `happy-dom` as a devDependency, selected per test file. Playwright is deferred and optional (large browser download). Flagged decision D4. |
| OQ-12 | Depth of the Composite_Code visualization (qroker-game 8.3). `src/optical/fragments.ts` reads the codebook through `node:fs`, so the optical module cannot run in the browser without a change outside this spec. | qroker-game 8.3 | (a) schematic. (b) pixel patterns via optical module. | (a) schematic, pixel rendering deferred to the Scoring Companion integration. |
| OQ-13 | Staging of the third AI tier. | qroker-game 7.1, 7.5 | P1 or P2 | P1 ships `BEGINNER` and `ADVANCED` (the two levels required by 7.5). `EXPERT` follows in P2, which completes 7.1. |
| OQ-14 | Post-game disclosure of Guess values. | qroker-game 6.3 ("while the game is in progress") | never, or after the game | Never disclosed. |
| OQ-15 | Board row direction and cell naming. | qroker-game Glossary | row 1 top or bottom | Row 1 at the top. This does not affect any rule, because rules use TL/TR/BL/BR relative to the screen. |

## Inconsistencies and Gaps Found in the Approved Documents

None of these changes an approved rule. Each is resolved here by a provisional default.

- **IC-1**: qroker-game design `AIStrategy.selectPlacement(view, deck: CardId[])` passes the deck contents to the AI, which conflicts with qroker-game Requirement 7.4 and with information isolation. This spec passes only the Player_View.
- **IC-2**: qroker-game design defines `CardId` as an object `{ suit, rank }` in Core Types but uses a `"suit-rank"` string in `DeckState`, `groupId` and the optical keys (`H-7`). This spec uses the string form.
- **IC-3**: qroker-game design `GridPosition` is described both as "row 1–8" and "row 0–7". This spec uses zero-based coordinates with notation conversion.
- **IC-4**: `PredictionBatch.groupIds` in qroker-game design are sorted card ids, so a public batch would reveal the 4 card identities and therefore the Hidden_Sum before collection is complete. This spec uses the Quad_Key in public structures.
- **IC-5**: docs/open-decisions.md #6 lists the first-round exemption scope as undecided, while qroker-game Requirement 3.5 states it. This spec follows Requirement 3.5.
- **IC-6**: qroker-game Requirements 6.1 and 7.4 (visible Board cards) and 6.4 (cards flipped at reveal) do not agree on whether Board cards are hidden (see OQ-1).
- **IC-7**: qroker-game Requirement 8.3 asks Practice Mode to render the Composite_Code for optical verification, but the optical module is a separate library that is not browser-loadable (see OQ-12).
- **IC-8**: qroker-game Requirement 11.4 says to "document the tiebreaking rule" while Requirement 3.9 says no separate tiebreak applies. This spec treats equal Guesses as equal scores and equal final Scores as shared ranks, and documents that no tiebreak exists.
- **IC-9**: Requirement 2.7 reveals earned scores together with the Hidden_Sum. With a strictly decreasing reward table, an observer can infer the absolute error of each Seat, but not the sign. This is inherent in the approved text and is recorded here, not changed.
- **IC-10**: qroker-game design `GamePhase` contains `INIT`, which no consumer can observe because `newGame` returns an already dealt state. This spec omits `INIT`.
