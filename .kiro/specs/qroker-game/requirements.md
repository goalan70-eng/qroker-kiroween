# Requirements Document

## Introduction

QRoker is a hybrid card-placement and inference game. Players place cards on an 8×8 Board to form 2×2 groups (Composite Code), privately predict the sum of the card values in each group, and compete on score.

The game uses a standard 52-card deck and no jokers. This document covers two modes: (1) Browser Practice Mode, a browser game played against 3 local AI players, and (2) the Physical Scoring Companion, a mobile scoring assistant app for playing with physical cards.

The optical marker system, the validity of the game mechanics, and an offline-first implementation are the key design constraints. Score values will be determined through game simulation and are currently undecided.

---

## Glossary

- **Board**: An 8×8 grid. Columns are labeled A–H and rows 1–8. The 4 default starting cards are placed at D4, E4, D5, and E5.
- **Card**: A card from the standard 52-card deck. No jokers. Each card has a suit (Suit: ♠♥♦♣) and a rank (Rank: A, 2–10, J, Q, K).
- **Card_Value**: The numeric point value of a card. A=1, number cards (2–10)=face value, J=11, Q=12, K=13.
- **Quad_Group**: A set of 4 distinct cards occupying adjacent 2×2 positions on the Board. It is recognized as a Composite Code when the Inward_Corner of all 4 cards has a valid optical fragment.
- **Composite_Code**: The optical marker formed by combining the corner fragments of the 4 cards of a Quad_Group.
- **Hidden_Sum**: The sum of the Card_Value of the 4 cards that make up a Composite Code (2×2 group). The minimum is 4 (A×4=1+1+1+1) and the maximum is 52 (K×4=13×4). This is the value that players predict.
- **Guess**: A player's prediction of the Hidden_Sum, entered privately when a Quad_Group is formed.
- **Score**: A player's cumulative in-game score. It is calculated as the sum of the prediction scores and the Hand_Empty_End bonus.
- **Placement_Action**: The action of placing a card from the hand onto an adjacent empty cell of the Board.
- **AI_Player**: A non-human player driven by an offline local algorithm. No external API is required.
- **Optical_Marker**: A composite visual pattern, identifiable when 4 card-corner fragments are combined.
- **Game_Engine**: The core logic module that manages Board state, action validity, and score calculation.
- **Scoring_Companion**: A helper app for score entry and tallying when playing with physical cards (Physical Scoring Companion).
- **Service_Worker**: A browser caching mechanism for offline access.
- **Card_Orientation**: The rotation angle of a card when it is placed on the Board. Only 0° or 180° is allowed; 90°/270° is not supported.
- **Inward_Corner**: In a 2×2 group, the corner of a card that faces the center (the shared vertex) of the group. Its position is determined by the slot (TL→BR, TR→BL, BL→TR, BR→TL), and which printed corner lands at that position depends on the Card_Orientation.
- **Fragment_Pixel**: The actual pixel data of an optical fragment printed on a card. On rotation, the existing pixels are rotated and transformed; new pixels are not generated.
- **Suit_Group**: A grouping of suits by the symmetry pattern of their Fragment_Layout. (A) 180° point symmetry: Hearts (TL+BR) and Diamonds (TR+BL), where the fragment positions do not change under a 180° rotation. (B) Horizontal reflection symmetry: Clubs (TR+BR → right side) and Spades (TL+BL → left side), where the fragments move to the opposite side under a 180° rotation.
- **Fragment_Layout**: The permanently printed corner positions of the optical fragments for each card suit. Hearts (♥): TL+BR (diagonal A, 180° point symmetry). Diamonds (♦): TR+BL (diagonal B, 180° point symmetry). Clubs (♣): TR+BR (right side, horizontal reflection symmetry). Spades (♠): TL+BL (left side, horizontal reflection symmetry). No jokers. This layout is fixed on the physical cards and does not change during the game.
- **Draw_Rule**: When a player places a card and no new Composite Code is completed, the player draws 1 card from the deck. The first round (each player's first placement) is exempt from the draw obligation.
- **Hand_Empty_End**: The game ends at the moment a player's hand reaches 0 cards. The end is processed after all scoring and prediction collection related to that action are complete. The hand-empty bonus value is undecided and will be determined by simulation.
- **Fragment_Template**: The result of applying a transformation of the 2-dimensional symmetry group D4 (rotations of 0°/90°/180°/270°, and reflections across the horizontal axis, the vertical axis, and the two diagonals) to a card's base pattern (a 5×5 binary grid). 52 cards × 8 transformations = 416.
- **Camera_Rotation**: The rotation of the entire captured image. It is distinct from the physical placement orientation of a card (Card_Orientation) and allows an arbitrary angle.
- **Corner_Radius**: The roundness of the card corners. The reference value is 3.175 mm (1/8 inch). Commercial print-vendor materials show a range of about 3–3.6 mm, and it has not been confirmed as an official standard specification.
- **Central_Void**: The small empty region that forms between the rounded inner corners of four cards in a 2×2 arrangement placed together with no gap. It has the shape of four horns extending from the center along the seams by the Corner_Radius.
- **Printable_Area**: The region inside the card outline (including the rounded corners) where printed content can be placed.
- **Marker_Inset**: The distance between the outer edge of the marker footprint (including the white quiet margin) and the card edge. The reference value is 1 module (1.5875 mm).
- **Distractor_Marker**: A marker that is visible in the same image but does not face the target vertex (a fragment on the outer side of a card, or a fragment around another vertex).
- **Card_Face**: A face of a card. Either FRONT (front side) or BACK (back side).
- **Body_Frame**: A coordinate system fixed to the card body. The origin is the top-left as seen from the front, x points right, and y points down. Back-side printing is also described in the same frame, as seen through the card toward the front (through-view).
- **Flip**: The action of flipping a card left-right about its vertical axis. The x coordinate of the card body changes to W − x.
- **Observed_Layer**: The optical marker layer that is actually visible when the card is viewed from above (its position in Board coordinates and its pixel shape).

---

## Requirements

### Requirement 1: Card Values and Composite Code Sum Calculation

**User Story:** As a game facilitator, I want the hidden sum of a 2×2 Composite Code to be calculated consistently, so that all players can verify their predictions against the same standard.

#### Acceptance Criteria

1. THE Game_Engine SHALL determine the Card_Value of each card by the following rule: A=1, number cards (2–10)=face value, J=11, Q=12, K=13. Jokers are not included in the deck.
2. WHEN a Composite Code (Quad_Group) is formed, THE Game_Engine SHALL add the 4 Card_Value of that group to produce the Hidden_Sum.
3. THE Game_Engine SHALL compose a Composite Code of exactly 4 cards, and cards with the same suit+rank combination cannot be included more than once.
4. THE Game_Engine SHALL guarantee that the Hidden_Sum is always an integer from 4 to 52 inclusive. (Minimum: A+A+A+A=4, maximum: K+K+K+K=52)
5. THE Game_Engine SHALL always produce the same Hidden_Sum for the same combination of 4 cards, regardless of the card placement order.

---

### Requirement 2: Score Calculation

**User Story:** As a player, I want points to be awarded clearly and predictably according to my prediction accuracy, so that my strategic choices are meaningful.

#### Acceptance Criteria

1. WHEN a prediction is scored, THE Game_Engine SHALL determine the prediction score solely from the absolute error e = |Guess − Hidden_Sum|, and SHALL award the same score to positive and negative errors of equal magnitude.
2. THE Game_Engine SHALL calculate the prediction score from a configurable reward table indexed by error, awarding the highest score at e=0 and ensuring that the score does not increase as e grows.
3. WHEN e exceeds the maximum error defined by the reward table, THE Game_Engine SHALL award a prediction score of 0.
4. THE Game_Engine SHALL receive the length of the reward table (the number of error levels) and each of its values as configuration values injected from outside, rather than fixing them in code. These values will be determined after game simulation. IF the configuration values contain a negative value or a segment that increases with e, THEN THE Game_Engine SHALL reject that configuration.
5. THE Game_Engine SHALL NOT award a separate completion bonus score for completing a Composite Code. The completion itself is already rewarded by the opportunity to score a prediction and by the Hand_Empty_End bonus.
6. THE Game_Engine SHALL use only the Guess and Hidden_Sum of the current round when calculating a score, and SHALL NOT access the Guess or score history of previous rounds.
7. WHEN the collection of Guess values from all players is complete, THE Game_Engine SHALL reveal each player's earned score and cumulative Score at the same time, without revealing the individual Guess values.
8. WHEN a player's Guess input window opens, THE Game_Engine SHALL restrict the allowed input values to integers from 4 to 52 inclusive.
9. WHEN a player's hand reaches 0 cards, THE Game_Engine SHALL award the Hand_Empty_End bonus B to that player. (The value of B is undecided; it is to be determined by simulation as a value that is meaningful but not overwhelming relative to the sum of the prediction scores.)

---

### Requirement 3: Board, Placement Rules, Drawing, and Game End

**User Story:** As a player, I want the rules for card placement, drawing, and game end to be clearly enforced, so that there are no invalid moves or rule confusion.

#### Acceptance Criteria

1. THE Board SHALL consist of an 8×8 grid (A1–H8), and at the start of the game 4 neutral cards randomly selected from the 52-card deck are placed at the central 2×2 positions (D4, E4, D5, E5).
2. THE Game_Engine SHALL randomly deal, without duplicates, the 4 neutral cards and 4 hand cards for each player (4+4×4=20 cards in total) from the 52-card deck at the start of the game.
3. WHEN a player places a card, THE Game_Engine SHALL verify that the target position is within the Board bounds (A–H, 1–8), is empty, and is orthogonally (up, down, left, or right) adjacent to an already placed card, and SHALL reject the action if any condition is not met.
4. THE Game_Engine SHALL NOT support a Swap_Action. A player can place a card onto the Board only from the hand.
5. WHEN a player's placement action does not complete a new Composite Code, THE Game_Engine SHALL have that player draw 1 card from the deck. However, each player's first placement action (the first round) is exempt from the draw obligation.
6. WHEN a player's placement action completes one or more Composite Code, THE Game_Engine SHALL NOT perform a draw.
7. WHEN a player's hand reaches 0 cards, THE Game_Engine SHALL declare the game over immediately, after completing all Composite Code scoring and prediction collection related to that action.
8. WHEN a draw is required while the deck is exhausted, THE Game_Engine SHALL skip the draw and keep the player's hand at its current number of cards.
9. THE Game_Engine SHALL determine the ranking by comparing final scores at game end, and SHALL apply the tie rule as follows: players with tied scores are treated as sharing the same rank, and no separate tiebreak is applied.
10. FOR ALL Board state transitions (placements), the total number of cards on the Board increases by exactly 1 compared with before the action (Board card count invariant).
11. THE Game_Engine SHALL record the Card_Orientation together with the card placement, applying the following rules: (a) For Hearts (♥) and Diamonds (♦), the Fragment_Layout is a diagonal pattern, so the fragment positions do not change under a 180° rotation and are equivalent to 0°. (b) For Clubs (♣) and Spades (♠), the Fragment_Layout is a side pattern, so the fragments move to the opposite side under a 180° rotation. (c) Attempts to place any card at 90°/270° are rejected.
12. WHEN a card participates in a Composite Code (Quad_Group), THE Game_Engine SHALL calculate the actual fragment corners by combining that card's Fragment_Layout and Card_Orientation, and SHALL verify that at least one of those corners matches the Inward_Corner of that Board position. If none matches, the group is not judged to be a Composite Code.

---

### Requirement 4: Quad_Group Detection and Duplicate Prevention

**User Story:** As a game engine developer, I want to ensure that the same combination of 4 cards does not receive a duplicate score, so that the fairness of the scoring system is maintained.

#### Acceptance Criteria

1. WHEN a new card is placed on the Board, THE Game_Engine SHALL examine up to 4 candidate 2×2 regions that contain the placed cell.
2. WHEN all 4 cells of a 2×2 region are filled, THE Game_Engine SHALL detect that region as a Quad_Group and SHALL separately determine whether it forms a Composite Code according to Requirement 3.12. Occupancy of the 4 cells alone is not recognized as a Composite Code.
3. THE Game_Engine SHALL record each scored Quad_Group by a unique identifier, and SHALL NOT award a duplicate score to a group with the same identifier. The unique identifier consists of the sorted set of the 4 card IDs (suit+rank), independent of position order. The same combination of 4 cards has a single identifier regardless of its position on the Board or placement order.
4. THE Game_Engine SHALL grant scoring eligibility only when all three of the following conditions are met: (a) a Composite Code is formed, (b) that Composite Code is newly formed by the current placement action, and (c) the card-set identifier is not in the scoring record. Because cards are not moved or removed after placement, the same set of 4 cards can exist at only one position on the Board, and the scoring-record check verifies this invariant defensively.
5. FOR ALL Board states, the set of scored Quad_Group is idempotent: running group detection repeatedly on the same Board state does not add any new group.

---

### Requirement 5: Custom Symmetric Optical Marker System

**User Story:** As a product owner, I want a reliable optical marker system, designed so that the 52 cards can be identified by camera, so that physical card play can be linked to digital scoring.

#### Acceptance Criteria

1. THE optical marker system SHALL NOT use the standard QR code (ISO 18004). Instead, a custom symmetric marker that can uniquely identify each of the 52 cards is designed.
2. THE marker generator SHALL generate one base optical pattern (base pattern) for each card, and SHALL derive the second fragment by applying the symmetry transformation defined in the Fragment_Layout. The two fragments identify the same card.
3. THE codebook SHALL assign a unique 2-dimensional binary base pattern to each of the 52 cards, and SHALL guarantee a minimum Hamming distance of at least 5 between any two distinct templates among all 416 Fragment_Template. The codebook is generated deterministically with a fixed algorithm and a fixed seed, and only the codebook frozen in the repository is used for printing and decoding.
4. THE optical marker SHALL maintain symmetry invariance for Hearts and Diamonds cards, returning the same card ID even when the Fragment_Layout is applied with a 180° rotation.
5. THE optical marker SHALL, for Clubs and Spades cards, move the fragment positions to the opposite side when the Fragment_Layout is applied with a 180° rotation, while the card ID must still be decoded as the same.
6. WHEN all 4 fragments of a Composite Code are decoded, THE optical reader SHALL return the 4 card IDs and Card_Value from the image data alone, without consulting the Board state. The positions within the Quad_Group are returned as the full set of interpretations that the image alone can determine (including interpretations that are 180° rotations of each other and, where the reflection status is ambiguous, reflected interpretations), and the card set and Hidden_Sum are identical in all interpretations.
7. IF a reading result falls under one of the error conditions of Requirement 13.4 (incomplete group, duplicate, corruption, arrangement mismatch) or differs from the reference card set of the Scoring Companion, THEN THE optical reader SHALL reject the scan result and switch to manual entry.

---

### Requirement 6: Information Asymmetry and Reveal Order

**User Story:** As a player, I want to be assured that my prediction does not influence other players' guessing strategies, so that a fair inference competition is established.

#### Acceptance Criteria

1. WHEN a Quad_Group is formed, THE Game_Engine SHALL NOT display the Hidden_Sum in the system UI until the Guess of all participating players has been collected. However, a player looking directly at the cards on the Board and inferring the sum is not subject to this constraint; this constraint applies only to the timing of displaying the value automatically calculated by the software.
2. WHEN all Guess values have been collected, THE Game_Engine SHALL reveal the Hidden_Sum and at the same time display each player's earned score (without the Guess value) and cumulative Score.
3. THE Game_Engine SHALL prevent any player from viewing another player's Guess value while the game is in progress.
4. WHEN a physical card is flipped to reveal the Hidden_Sum, THE Scoring_Companion SHALL keep the left-right placement orientation of the cards (the left-right position of the Composite_Code fragments) based on the original Board placement, so that it is not mirrored.
5. WHEN a single placement action newly forms two or more Composite Code, THE Game_Engine SHALL first collect the predictions for all of those Composite Code and then reveal the results together, so that the result of an earlier code does not influence the prediction for a later code.

---

### Requirement 7: AI Players

**User Story:** As a single player, I want to enjoy practice games against a challenging AI opponent without an internet connection or a paid API.

#### Acceptance Criteria

1. THE Game_Engine SHALL provide 3 AI_Player algorithms that run in the local browser environment, and SHALL NOT depend on an external server or a paid AI API.
2. THE AI_Player SHALL perform only valid Placement_Action.
3. WHEN it is the AI_Player's turn, THE Game_Engine SHALL decide and execute the AI_Player's action within 3 seconds.
4. THE AI_Player SHALL use only the card information revealed on the Board when generating a Guess, and SHALL NOT access other players' private Guess values.
5. WHERE a difficulty setting is provided, THE AI_Player SHALL implement at least 2 difficulty levels (beginner: random valid placement; advanced: a heuristic that maximizes the likelihood of completing a Quad_Group).

---

### Requirement 8: Browser Practice Mode

**User Story:** As a game developer, I want to verify the core game loop in the browser before printing physical cards, so that a proof of concept is possible without wasting printing costs.

#### Acceptance Criteria

1. THE Browser_Practice_Mode SHALL run without installation in standard web browsers (the latest 2 versions of Chrome, Firefox, and Safari).
2. THE Browser_Practice_Mode SHALL implement a complete game loop that includes the 8×8 Board, the card hand, a placement and orientation selection interface, Guess input, and score display.
3. THE Browser_Practice_Mode SHALL render the Composite_Code visualization on screen even without physical cards, so that the optical marker design can be verified.
4. WHEN the game ends, THE Browser_Practice_Mode SHALL display the final scoreboard and the Hidden_Sum details of each Quad_Group.
5. THE Browser_Practice_Mode SHALL provide a responsive layout that is playable with touch interaction on mobile screens (width of 320px or more).

---

### Requirement 9: Scoring Companion Mode (Physical Card Scoring Assistance)

**User Story:** As a physical card player, I want the app to handle score calculation automatically during a real card game, so that accurate score tallying is possible without interrupting the flow of the game.

#### Acceptance Criteria

1. THE Scoring_Companion SHALL support two input methods for deriving the Hidden_Sum of a Quad_Group: manual entry of card values (4 cards) or a camera scan.
2. THE Scoring_Companion SHALL display each player's Guess input screen sequentially, hiding the previous player's input to maintain information asymmetry.
3. WHEN Guess collection is complete, THE Scoring_Companion SHALL reveal the Hidden_Sum and calculate and display the score distribution.
4. THE Scoring_Companion SHALL operate offline through the Service_Worker, and all functionality SHALL be usable without a network connection after the initial load.
5. THE Scoring_Companion SHALL save the in-progress game state to the browser's local storage so that the game can be resumed after an app restart or page refresh.

---

### Requirement 10: Offline-First and Deployment Constraints

**User Story:** As a game operator, I want the app to work fully even in environments with unstable internet, so that it can be used at parties and outdoor events.

#### Acceptance Criteria

1. THE Game_Engine SHALL operate fully without account registration, login, or integration with an external database.
2. THE Service_Worker SHALL cache all static assets of the app (HTML, CSS, JS, card images) on the first visit to support subsequent offline access.
3. WHEN the app is accessed without a network connection, THE Service_Worker SHALL serve the cached version and notify the user that the app is offline.
4. THE Scoring_Companion SHALL be immediately usable without account creation or server integration.
5. WHERE an app update is available, THE Service_Worker SHALL cache the new version in the background and apply the update only when the user chooses to reload.

---

### Requirement 11: Game Strategic Soundness (Strategic Soundness)

**User Story:** As a game designer, I want to verify that the placement orientation constraint, the draw rule, and the information asymmetry mechanics do not create dominant strategies or meaningless game states.

#### Acceptance Criteria

1. THE Game_Engine SHALL evaluate through simulation tests whether any particular strategy becomes a dominant strategy under the rules without swaps, and SHALL record the results.
2. WHEN one player attempts a strategy of completing all Quad_Group alone, THE Game_Engine SHALL verify through score simulation that the other players can also remain competitive through guess scores.
3. THE Game_Engine SHALL restrict the allowed range in Guess input validation to integers from the actual minimum of 4 to the actual maximum of 52 of the Hidden_Sum. (Consistent with Requirement 1 Criterion 4)
4. IF all 4 players enter the same Guess, THEN THE Game_Engine SHALL apply the same scoring standard to all players and SHALL document the tiebreaking rule.

---

### Requirement 12: Custom Optical Marker Prototype Validation

**User Story:** As a game developer, I want to verify that the custom symmetric marker system for identifying the 52 cards actually works, so that optical recognition reliability can be confirmed before printing physical cards.

#### Acceptance Criteria

1. THE prototype SHALL generate and render the optical fragments of the 52 cards with TypeScript raster operations that have no external dependencies, and the automated tests must be runnable in a Node environment without a browser. The Canvas API is used only for browser visualization.
2. THE prototype SHALL, for any Composite Code (a combination of 4 cards), synthesize the 4 fragment images and verify that the optical decoder decodes each fragment independently and returns 4 card IDs.
3. THE prototype SHALL verify the 180° rotation equivalence of Hearts and Diamonds cards: when the same card is rendered at 0° and at 180°, the decoding results must be identical.
4. THE prototype SHALL verify the fragment movement under 180° rotation of Clubs and Spades cards: it confirms that the card ID is the same before and after rotation while the fragment corner positions change.
5. THE prototype SHALL, under synthetic degradation conditions generated with a fixed seed (per-fragment position error of 0, 0.1, and 0.25 modules, arbitrary camera rotation angle, perspective transformation, blur, noise, and lighting gradient), measure the correct recognition rate, rejection rate, and misidentification rate for each condition, and SHALL record the results of at least 1,000 trials per condition. The number of misidentifications (returning a wrong card ID or sum as a success) is also recorded per condition, and any condition with a nonzero count is reported together with the failing seeds. Zero misidentifications is an observation within the measured conditions and not a guarantee against all corruption. For each condition, the number of trials n and the observed count are recorded together, and if the observed count is 0, the 95% one-sided confidence upper bound on the per-trial misidentification probability, 1 − 0.05^(1/n) (about 3/n, about 0.30% for n = 1,000), is also recorded. The mathematical guarantee is limited to the correction and rejection range of the independent bit-flip model (design.md section 7); the fact that 0 occurrences were observed in a finite sample is not that guarantee but an experimental pass criterion over the distribution of synthetic conditions.
6. THE prototype SHALL verify the logic that detects and rejects error conditions (incomplete group (fewer than 4 fragments), duplicate card ID, corrupted fragment).
7. THE team SHALL commit the prototype code, test cases, and measurement results (success rate, error tolerance range) to the repository as a reproducible record. Results from synthetic images and results from real printed cards and a real camera are recorded separately.

---

### Requirement 13: Independent Optical Fragment Decoding and Sum Accuracy

**User Story:** As a scoring companion app user, I want each card's identity to be correctly identified and the Hidden_Sum to be calculated accurately when I scan physical cards, so that reliable score tallying is possible without manual entry.

#### Acceptance Criteria

1. THE optical reader SHALL decode each fragment independently of the expected state of the Board and return the card ID (suit+rank) and Card_Value, and SHALL return the position within the Quad_Group (top-left/top-right/bottom-left/bottom-right) as all interpretations that the image alone can determine (including the 180° ambiguity and, where needed, the reflection ambiguity). This information must be determined from the image data alone, without consulting the Board state.
2. WHEN all 4 fragments are successfully decoded, THE optical reader SHALL return the sum of the 4 independently derived Card_Value as the Hidden_Sum, and SHALL compare this value against the reference value that the Game_Engine calculates from the Board state and record whether they match.
3. IF the decoded Hidden_Sum differs from the Game_Engine reference value, THEN THE optical reader SHALL reject the scan result, request a rescan or manual entry, and SHALL NOT apply the mismatched Hidden_Sum to the game.
4. THE optical reader SHALL detect and reject each of the following error conditions: (1) incomplete group — fewer than 4 fragments are detected around a vertex, (2) duplicate fragment — the same card ID is detected 2 or more times, (3) corrupted fragment — a marker boundary is detected but no matching template exists within the allowed radius, (4) arrangement mismatch — the observed fragment transformation and suit do not match a valid per-slot combination of the Fragment_Layout under any Camera_Rotation hypothesis. A marker that is not detected (detection failure) and a corrupted fragment (identification failure) are reported as different results.
5. WHEN a card placed in an allowed orientation is photographed, THE optical reader SHALL compare the observed pixels against the 416 Fragment_Template, without taking the physical orientation as an input, and determine the card ID and the observed transformation together. The physical orientation of the card is inferred from the observed transformation and the slot.
6. THE optical reader SHALL distinguish the physical rotation of a card from the Camera_Rotation. A Camera_Rotation of any angle is handled as normal input. A card physically placed at 90°/270° is rejected as an arrangement mismatch, because no Camera_Rotation hypothesis is consistent with the remaining fragments. A 180° placement of Hearts and Diamonds is handled as optically identical to 0°, and the orientation of Clubs and Spades is verified against the per-slot valid combinations.
7. THE optical_reader_test_suite SHALL include repeatable randomized tests using a fixed seed, covering the following cases: (a) valid 0° combination — one card of each of the 4 suits (Hearts, Diamonds, Clubs, Spades), in an arrangement where the Fragment_Layout fragment is located at the Inward_Corner of each card, (b) valid 180° combination — an arrangement where Clubs and Spades cards are rotated 180° and the Inward_Corner condition is still satisfied, (c) diagonal pattern equivalence — confirming that the decoding results are identical when Hearts and Diamonds are placed at 0° and at 180°, (d) boundary-value cards — the Hidden_Sum minimum (A+A+A+A=4) and maximum (K+K+K+K=52) combinations, (e) rejection cases — a 90°-rotated fragment, an Inward_Corner with no fragment (incomplete group), a 3-fragment group, a duplicate card ID, and a corrupted fragment.
8. THE optical_reader_test_suite SHALL be runnable independently of the prototype experiments of Requirement 12, and SHALL target the dedicated fragment reader, not a standard QR decoder.
9. THE optical reader SHALL determine whether the captured image contains a reflection (mirror image) and report one of `NOT_REFLECTED`, `REFLECTED`, or `AMBIGUOUS`. When the determination is possible because the group contains a Heart or Diamond, it must report the value that matches the fact; when it cannot be determined from the image alone, as with a group made up only of Clubs and Spades, it reports `AMBIGUOUS` and does not guess either way. Whether the image is reflected does not affect card identification or the Hidden_Sum calculation. THE optical reader SHALL NOT substitute Board records or expected values for the result when optical reading fails.

---

### Requirement 14: Per-Suit Optical Fragment Layout Rules (Fragment Layout)

**User Story:** As a card designer, I want to know clearly which corners the optical fragments must be printed on for each suit, so that once the 52 cards are printed, the fragments combine correctly in every valid Quad_Group.

#### Acceptance Criteria

1. THE card design SHALL permanently define the Fragment_Layout of each suit as follows: Hearts (♥) — TL (top-left)+BR (bottom-right), diagonal A (180° point symmetry); Diamonds (♦) — TR (top-right)+BL (bottom-left), diagonal B (180° point symmetry); Clubs (♣) — TR (top-right)+BR (bottom-right), right side (horizontal reflection symmetry); Spades (♠) — TL (top-left)+BL (bottom-left), left side (horizontal reflection symmetry). Jokers are not used.
2. THE card design SHALL permanently print the Fragment_Layout on the physical cards, and SHALL NOT change it dynamically by Board position or by software during the game.
3. THE Game_Engine SHALL determine the Inward_Corner for each 2×2 Board position as follows: a card at the top-left (TL) position → BR is the Inward_Corner; a card at the top-right (TR) position → BL is the Inward_Corner; a card at the bottom-left (BL) position → TR is the Inward_Corner; a card at the bottom-right (BR) position → TL is the Inward_Corner.
4. THE Game_Engine SHALL judge Quad_Group validity by verifying that at least one of the card's Fragment_Layout fragment corners matches the Inward_Corner of that Board position. Examples of valid combinations: a Heart (TL+BR) at the top-left position — BR matches the Inward_Corner (BR) → valid. A Club (TR+BR) at the top-left position — BR matches the Inward_Corner (BR) → valid. Example of an invalid combination: a Spade (TL+BL) at the bottom-left position — TL does not match the Inward_Corner (TR), and BL does not match the Inward_Corner (TR) → invalid (at 0°). A Diamond (TR+BL) at the top-left position — neither fragment matches the Inward_Corner (BR) → invalid (it is TR+BL even when rotated 180°, so independent of orientation).
5. WHEN a Club (♣) or Spade (♠) card is placed rotated 180°, THE Game_Engine SHALL transform the Fragment_Layout by 180° and re-verify validity: Club at 180° → TL+BL (left side), Spade at 180° → TR+BR (right side). Whether the Inward_Corner matches may change after the transformation.
6. THE Game_Engine SHALL verify that a Club (♣) placed at 0° has its fragments at TR+BR and moves them to TL+BL when placed at 180°. It SHALL verify that a Spade (♠) placed at 0° has its fragments at TL+BL and moves them to TR+BR when placed at 180°. Because a Club at 180° and a Spade at 0° use the same corner set (TL+BL), and a Club at 0° and a Spade at 180° use the same corner set (TR+BR), the suit cannot be distinguished by corner positions alone; the suit is identified by the codebook pattern.
7. THE feasibility_test_suite SHALL build fixtures for each of the valid and invalid combinations defined in 14.4 to verify optical decoding accuracy, and SHALL cover cases that include all 4 suit patterns in automated tests.

---

### Requirement 15: Physical Card Shape and Adjacent Placement

**User Story:** As a card designer, I want optical recognition to work reliably even when cards are placed together with no gap while keeping the same size and rounded corners as ordinary playing cards, so that the game can be played without changing the appearance or handling feel of the cards.

#### Acceptance Criteria

1. THE card design SHALL use a reference shape of 63.5 × 88.9 mm with a Corner_Radius of 3.175 mm, and SHALL map the 40 × 56 module prototype grid to this size at 1.5875 mm per module. This reference is a value based on commercial print-vendor materials and is not a standard specification, so the experiments report results while varying the Corner_Radius around the reference value and above it.
2. THE card design SHALL assume an arrangement in which 4 cards meet along their straight edges without overlapping, and SHALL NOT require an intentional gap between cards. THE optical reader SHALL NOT depend on an intentional gap or on square corners.
3. THE card design SHALL ensure that the black border, the white quiet margin, and the entire Marker_Inset of each marker lie inside the Printable_Area. The containment margin (the distance to the arc) is calculated and reported from the shape parameters (Corner_Radius, Marker_Inset, module size, margin), and a shape whose margin is 0 or less is flagged as invalid.
4. THE optical reader SHALL NOT assume that the four fragments at a vertex form a single seamless square, and SHALL detect and cluster the four markers independently even in the presence of the Central_Void. THE experiment SHALL report the minimum distance between the Central_Void and the nearest marker for each set of shape parameters.
5. THE card design SHALL ensure a white gap of at least 2(Marker_Inset + margin) modules between the black squares of the markers on both sides of a seam when the seam gap is 0, and THE experiment SHALL verify that the connected components of adjacent markers do not merge.
6. WHEN the image contains a Distractor_Marker, THE optical reader SHALL read a group only when exactly 4 markers are gathered around a vertex, and SHALL NOT report a vertex with fewer than 4 as a group.
7. THE team SHALL attempt improvements only in the following order when optical recognition is insufficient with the reference shape: (1) adjust the fragment positions and Marker_Inset, (2) adjust the marker size and margin, (3) improve the detection and geometric-correction algorithm, (4) evaluate the physical alignment tolerance, (5) only if necessary, reduce the Corner_Radius in steps. The card corner shape SHALL NOT be changed based on a single individual failure case.
8. THE experiment SHALL measure the following conditions with reproducible shape parameters and fixed seeds: zero-gap placement, rounded inner corners and the Central_Void, Corner_Radius comparison, small per-card position and rotation errors, and camera rotation, perspective, blur, and lighting changes. For each condition, it records the correct recognition rate (all four cards and the sum are correct), the rejection rate and the rejection kinds, the number of misidentifications, whether incomplete groups were rejected, a tally of failure causes, and the effect of each shape adjustment.
9. THE team SHALL state in the report that synthetic image results do not guarantee real camera performance, and SHALL record real printing and photographing results separately according to the distinction rule of Requirement 12.7.
10. THE card design SHALL NOT change the Fragment_Layout of Requirement 14 or the frozen codebook.

---

### Requirement 16: Double-Sided Optical Markers and Flip Equivalence

**User Story:** As a card designer, I want the position and shape of the markers in Board coordinates to remain the same when a card is flipped left-right, so that the card is read as the same card whichever face is up and flipping does not change the reading rules.

#### Acceptance Criteria

1. THE card design SHALL print optical fragments on both the front and the back, and the front SHALL follow the Fragment_Layout of Requirement 14.
2. THE card design SHALL define the back optical layer in the Body_Frame as the left-right mirror of the front optical layer (position x → W − x, with the same mirroring applied to the pixel content of the fragments). The back fragments are derived only from the front layer of the same card, and no substitute fragments are generated depending on neighboring cards or the Board state.
3. WHEN a card is flipped left-right about its vertical axis, THE Observed_Layer SHALL have, under ideal conditions (no printing or cutting error), the same position, bit pattern, and pixel shape as before the flip, and the card ID that is read SHALL NOT change.
4. WHEN a card is flipped top-bottom about its horizontal axis, THE Observed_Layer SHALL be the same as the observation of the same card placed in an allowed orientation (0° or 180°). This is equivalent to a vertical-axis flip plus an in-plane 180° rotation.
5. THE team SHALL demonstrate through an automated test that printing the same raster as-is on both faces in the Body_Frame produces a left-right-reversed observation after flipping and does not satisfy the requirement, and SHALL document a print-file convention such that the back-side print file has the same shape as the front when viewed from the back. Whether the back side is automatically mirrored in double-sided printing is confirmed by a physical flip test.
6. THE card design SHALL apply the left-right mirroring only to the optical marker layer, and SHALL NOT mirror other card artwork such as text and pictures.
7. THE card design SHALL verify that the front corner set and its left-right mirrored set do not overlap (the fragments of the two faces occupy different corners in the Body_Frame), and both faces satisfy the containment condition of Requirement 15.3 and the white quiet margin.
8. THE experiment SHALL treat, as shape parameters, the allowed orientations on both faces (0°, 180°), zero-gap placement, the front-to-back print registration error (shift and rotation), and the cut outline error, and SHALL record how far these errors displace marker positions from their ideal positions and how much of the containment margin they consume. Printing and cutting tolerances are evaluated first, before changing the card shape (Requirement 15.7).
9. THE documentation SHALL state, as a game security limitation, that hidden card information may be exposed because a marker encoding the card ID is visible on either face. THE team SHALL NOT claim that hiding the sum read by the app makes the printed card identity secret. Countermeasures are proposed as separate game-operation safeguards that do not change the approved double-sided marker shape.
10. THE team SHALL measure on real prints the degree to which a marker on one face shows through the paper onto the empty corner of the opposite face (show-through). Because in body coordinates a back marker lies directly beneath an empty corner of the front (for example, for ♥, front TL·BR and back TR·BL), THE experiment SHALL compare the contrast difference between an empty front corner and clean paper against the reader's marker contrast requirement, and SHALL confirm that an empty corner is not detected as a marker and that a card whose inward corner is empty (for example, a ♥ in the TR cell) does not form a complete group. This verification is performed in the physical test of Milestone 8 and is not replaced by synthetic simulation results.
