# Requirements Document

> **STATUS: PLANNING DRAFT. NOTHING IS IMPLEMENTED, VERIFIED OR APPROVED.**
> Every requirement below describes what a FUTURE QRoker Optical V2 system and its verification SHALL do. No V2 code, codebook, asset, test, measurement or print exists. No criterion is met, and no criterion has been checked. Numbers taken from PR #18 are marked `proposed, pending owner approval (O-4)` and are not decided release thresholds.

## Introduction

QRoker Optical V2 (Composite Code V2) is a proposed, experimental successor track to the Optical V1 marker system. The four corner pieces printed on four existing cards of a Quad_Group are intended to assemble into one visually continuous square Composite_Code_V2 in which the only intended empty area is the Central_Void. The Official_Scanner is intended to return a success, a card ID or a Hidden_Sum only when all four valid pieces are present. The approach is feasibility-first: a geometric prerequisite (HYP-1, section "Geometric Feasibility Prerequisite" of `design.md`) is settled by an independent computation before any generator, detector or decoration work is detailed. Milestones V2-M1 to V2-M8 each end in a go/no-go Gate. Optical V1 stays unchanged until V2 is independently validated.

This document derives its requirements from the planning draft `design.md` of this spec (not owner-approved). Terms defined in the V1 glossary (`.kiro/specs/qroker-game/requirements.md`) keep their V1 meaning and are not redefined here. V1 requirement text is referenced and not copied.

### Provenance of the requirements

| Source class | Authority | Treatment in this document |
|---|---|---|
| Owner goals G1 to G7 (the owner's seven stated goals, `design.md` "Purpose") | Highest | The authoritative source of every requirement's intent. |
| Approved V1 specification (`.kiro/specs/qroker-game/**`) | Baseline | Cited by requirement number. Unchanged by this spec. |
| PR #18 draft requirements R01 to R11 (`docs/optical/COMPOSITE-V2-PLAN.md`, not on this branch) | Proposal, NOT approved | Mapped in Appendix A. Any threshold from PR #18 is `proposed, pending owner approval (O-4)`. |
| AI-derived hypothesis (HYP-1 and the hand-derived class table) | UNVERIFIED | A hypothesis until the independent computation of Requirement 2 confirms it. |

Source-of-truth ordering: owner goals > approved V1 specs > PR #18 > everything else.

### Verification labels

Each acceptance criterion ends with a label `[EC n]` naming the evidence class of `design.md` ("Verification and Evidence Plan") that can check the criterion:

| Label | Evidence class | Meaning |
|---|---|---|
| `[EC 1]` | 1. Model or geometry computation | Also used, by assumption A-1 below, for checks by deterministic computation or inspection over repository contents or recorded documents (hash, diff, import graph, document content). |
| `[EC 2]` | 2. Synthetic raster in Node | Rendered squares, seeded degradations, A/B arms, Node-run tests. |
| `[EC 3]` | 3. Headless browser | Browser bundle load and decode in a worker. |
| `[EC 4]` | 4. Real print and real phone | Printed cards, physical flip test, real camera, human test on prints. |

Assumption A-1: the design defines four evidence classes for results and none for repository or document inspection. This document assigns such checks to class 1 because they are deterministic and need no image or device. The owner may redefine this.

### Traceability summary

The complete tables are in the appendices at the end of this document. Appendix A maps the owner goals and PR #18 R01 to R11 to the requirements below. Appendix B maps design conflicts C1 to C11, risks RK-1 to RK-20 and open owner decisions O-1 to O-9, and cross-references the open points `OP-<requirement>.<n>` to O-1 to O-9. Appendix C maps the 12 correctness properties of `design.md` to criteria. Appendix D lists the open points and review notes collected in the refinement pass and the final consistency review, together with the integration notes of those passes. Appendix E classifies every open point (class A, B or C) and gives the prioritized owner decisions. Open points are questions for the owner or for later design decisions. They are not decisions.

---

## Glossary

Terms of the V1 glossary (Board, Card, Card_Value, Quad_Group, Composite_Code, Hidden_Sum, Guess, Inward_Corner, Fragment_Layout, Fragment_Template, Central_Void, Corner_Radius, Printable_Area, Marker_Inset, Distractor_Marker, Card_Orientation, Camera_Rotation, Body_Frame, Face_Local_Frame, Card_Face, Flip, Observed_Layer, Scoring_Companion, Target_Group, Target_Region, Vertex_Position) are used with their V1 meaning. The terms below are new for V2. All V2 names, module names, file names and result-kind names are proposals.

- **V2_Programme**: The planned QRoker Optical V2 effort, including the people and tools (Kiro, Codex, ChatGPT, human) that carry out its milestones. It is the subject of process requirements.
- **Composite_Code_V2**: The assembled marker formed by the four pieces of a valid Quad_Group, intended to be one continuous square.
- **Piece**: One printed corner region of one card (a V2 fragment). Synonym: Fragment_V2. Each card carries two Pieces at body corners given by the Fragment_Layout.
- **Assembled_Square**: The square region of S x S modules formed by the four Pieces of a valid group, including the Central_Void and excluding the quiet zone. S is the assembled square size chosen in V2-M2.
- **Central_Void**: As in V1. In V2 it is the only intentionally empty area of the Assembled_Square and is applied as a mask, never as data.
- **Shared_Layer**: The part of the Assembled_Square that does not depend on the card identity: frame, outline and decoration, excluding the card-specific data cells.
- **Data_Layer**: The card-specific data cells of the Assembled_Square. The Data_Layer may differ per card and per slot.
- **Decoration_Layer**: The optional ornament inside the Assembled_Square (for example the Joker decoration). It is part of the Shared_Layer when it is present.
- **Joker_Decoration**: An ornament derived from the user-supplied symmetric monochrome Joker artwork, placed inside the Assembled_Square. It is not a card.
- **Decoration_Mode**: One of OFF, SIMPLIFIED, ORIGINAL_BASED, FRAME_ONLY.
- **Keep_Out_Mask**: The region, defined over the Assembled_Square plus its quiet zone, where decoration is forbidden: data cells, detection-critical frame elements and the quiet zone. (The quiet zone lies outside the Assembled_Square, so the mask is defined over the Assembled_Square together with its quiet zone.)
- **Placement_Class**: One tuple (suit, orientation, slot, printed body corner) for which the printed corner, rotated by the orientation, lands on the Inward_Corner of the slot.
- **HYP-1**: The hypothesis that the Shared_Layer must be 180-degree point symmetric for all Placement_Classes to show the same appearance, together with the hand-derived table of 16 Placement_Classes. UNVERIFIED until Requirement 2 is executed.
- **Feasibility_Computation**: The V2-M2 computation that enumerates Placement_Classes, tests symmetry and runs the parameter study. It shares no code with the Fragment_Generator, the Square_Renderer or V1 modules.
- **Fragment_Generator**: The planned V2 component that produces the printed Pieces of the 52 cards and the back layer.
- **Square_Renderer**: The planned V2 component that renders an Assembled_Square raster with the Central_Void mask, Decoration_Mode, seam and placement errors.
- **Official_Scanner**: The production entry point of V2 recognition (`decodeComposite` in the design). It returns exactly one OfficialResult per call.
- **OfficialResult**: The single result returned by one call of the Official_Scanner. Its kind is one Official_Result_Kind value. The fields `cards`, `hiddenSum` and `reflection` exist only when the kind is IDENTIFIED (Requirement 9.2). The remaining field set is decided in V2-M4 (see OP-8.4 in Appendix D).
- **Internal_Diagnostics**: Per-piece measurements inside the decoder, available only to the test harness and never part of the production export.
- **Atomic_Result_Policy**: The result rule of the Official_Scanner: no IDENTIFIED result, card ID or Hidden_Sum unless all four valid Pieces are present and the arrangement is valid. It is a result policy and not secrecy.
- **Atomic_Decision_Policy**: The planned component that implements the Atomic_Result_Policy.
- **IDENTIFIED**: The only result kind that carries card IDs and a Hidden_Sum.
- **Reject**: Any result kind other than IDENTIFIED.
- **Wrong_Accept**: A trial whose result is IDENTIFIED and that is not CORRECT. WRONG_ACCEPT_VALID is a Wrong_Accept on a valid input with cards or sum differing from the truth. WRONG_ACCEPT_NEGATIVE is a Wrong_Accept on a negative input.
- **Valid_Input**: A scene that contains the four Pieces of a valid group, with four distinct card IDs and a valid arrangement.
- **Negative_Input**: A scene that is not a Valid_Input: missing Pieces, duplicate card, illegal suit or orientation or slot, damaged Piece, distractor, foreign decoration or background only.
- **Proper_Subset_Scene**: A scene containing only a non-empty strict subset of the four Pieces of a valid group. There are 14 such subsets (4 + 6 + 4).
- **Oracle**: The independent truth source of the Comparison_Harness. Truth is never an input to the decoder.
- **Comparison_Harness**: The planned test harness that runs the pinned Baseline_V1, V2 candidates and Decoration_Modes on identical inputs and classifies each trial with the Oracle.
- **Candidate_A**: Whole-square, frame-first recognition (`design.md` "Candidate comparison").
- **Candidate_B**: Four regions read internally, then atomic validation.
- **Baseline_V1**: The V1 code and tests pinned in V2-M1 to explicit commit IDs. It is an unevaluated baseline while V1 Task 7.2 and Milestone 8 are not run.
- **Evidence_Class**: One of the four classes defined in "Verification labels". Each result belongs to exactly one.
- **Result_Record**: The stored record of one result: evidence class, command, commit, environment, seed, sample identifiers and producer.
- **Gate**: The go/no-go decision that ends a milestone, as in the gate diagram of `design.md`.
- **Pre-registration**: A record, made before a run, of conditions, trial counts, seeds, thresholds, the definition of "significant degradation", the analysis method and the stopping rule.
- **Open_Owner_Decision**: One of O-1 to O-9 in `design.md`.
- **Official_Result_Kind**: One of the proposed kinds IDENTIFIED, INCOMPLETE_GROUP, INVALID_ARRANGEMENT, DUPLICATE_CARD, CORRUPTED, NOT_DETECTED, AMBIGUOUS. The V2 kind AMBIGUOUS is distinct from the V1 reflection value AMBIGUOUS.
- **Go_No_Go_Outcome**: One of GO, GO-WITH-REDESIGN, NO-GO for decoration, NO-GO for square appearance. It is the outcome of the V2-M2 Gate (`design.md` "V2-M2 go/no-go outcomes"). The other Gates use the decision values of Requirement 19.11.
- **Outcome_Class**: One of CORRECT, REJECTED, WRONG_ACCEPT_VALID, WRONG_ACCEPT_NEGATIVE, with the definitions of `design.md` "Metric definitions". Every classified trial has exactly one Outcome_Class.
- **Failure_Attribution_Record**: The record of Requirement 16.16 that accompanies a Gate 7 no-go. It names one primary cause class and the route taken, and is built only from Result_Records.

---

## Requirements

### Requirement 1: Baseline Pinning and V1 Preservation (V2-M1)

**User Story:** As the project owner, I want Optical V1 preserved and a precise V1 baseline pinned, so that every V2 comparison is made against a known, unchanged reference.

#### Acceptance Criteria

1. WHEN V2-M1 starts, THE V2_Programme SHALL record the Baseline_V1 as one pin record containing: the baseline name (`main` or the PR #14 stack), the full-length commit ID of every branch in the stack (one commit ID if the name is `main`), and the version of the runtime, the version of the package manager and the version of the test runner used. The pin record is verified by inspecting that all four fields are present and that every recorded commit ID resolves to a commit in the repository. [EC 1]
2. IF any of the following three items has no record with a date, THEN THE V2_Programme SHALL record the missing item as blocking and SHALL NOT start V2-M2: (a) the owner decision on Open_Owner_Decision O-1 (which V1 baseline); (b) the owner decision on Open_Owner_Decision O-2 (finish V1 Task 7.2 and Milestone 8 first, or run V2 in parallel against an unevaluated baseline); (c) the Gate 1 decision `go` (Requirement 19.11). V2-M2 has started when any V2-M2 Result_Record or V2-M2 work product exists. The criterion is verified by checking that no V2-M2 Result_Record carries a date earlier than the latest of the three dated records. [EC 1]
3. THE V2_Programme SHALL, at every Gate, compute the SHA256 of `src/optical/codebook.v1.json` as stored at the Baseline_V1 pin. It SHALL record the computed value, the expected value `515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4`, and an equal or not-equal outcome. Hexadecimal digits are compared without regard to letter case. [EC 1]
4. WHEN a V2 change set is evaluated, THE V2_Programme SHALL compute the file-level difference between the Baseline_V1 pin and the evaluated V2 commit. It SHALL verify that the difference lists no added, modified, deleted or renamed file under `src/optical/**`, and none among the V1 test files and V1 report files present at the Baseline_V1 pin. It SHALL record the difference listing, whose expected content is empty for those paths. [EC 1]
5. THE V2_Programme SHALL state V1 Task 7.2 (the 363,000-trial sweep) and V1 Milestone 8 (print and physical) as "unevaluated" in every V2 document that reports on V1 status. THE V2_Programme SHALL NOT report the V1 Task 7 pass criterion as met in any V2 document. Verified by inspecting those documents for the word "unevaluated" next to each of the two items and for the absence of a statement that the Task 7 pass criterion is met. [EC 1]
6. WHILE no Result_Record of a completed V1 Task 7.2 run and no Result_Record of a completed V1 Milestone 8 run exists, THE V2_Programme SHALL label every comparison of a V2 result against the Baseline_V1, in each document and Comparison_Harness output that reports it, with the exact text "unevaluated V1 baseline (synthetic)". [EC 1]
7. WHEN a milestone Gate is evaluated, THE V2_Programme SHALL run the V1 regression gates and SHALL record one Result_Record per gate, each with its pass or fail outcome, including failures. The gates are: the codebook SHA256 check of criterion 3, the no-change check under `src/optical/**` of criterion 4, and the V1 test command of the pinned baseline. For the V1 test command, the record SHALL contain the number of tests passed, failed and skipped and the name of every failing test. It SHALL also name the load-sensitive tests of the pinned baseline, or SHALL state "load-sensitive tests not determined" if they are not known. [EC 2]
8. WHEN V2-M1 starts, THE V2_Programme SHALL check the state of each PR listed in the repository-state table of `design.md` (#12, #13, #14, #15, #17, #18, #21, #22; #16 is an issue, not a PR) by direct access to the repository with the owner's authorised access, and not by inference from other documents. For each PR it SHALL record the observed state (merged, open or draft; any other observed state is recorded as observed), and for each PR whose state differs from the state recorded as observed on 2026-11-19 it SHALL record the PR number, the old state and the new state. The 2026-11-19 states are labelled "inferred from refs/pull/N/merge refs and commit history, not read from the GitHub API (repository is private)". [EC 1]
9. IF the SHA256 of criterion 3 is not equal to the expected value, or the difference listing of criterion 4 is not empty for the paths named there, THEN THE V2_Programme SHALL record a failed V1 regression result that contains the computed value or the offending paths, and SHALL NOT record the V1 regression gates as passed for that Gate. [EC 1]
10. WHEN Open_Owner_Decision O-2 (finish V1 first or run V2 in parallel) is decided, THE V2_Programme SHALL record the chosen option and the decision date as a calendar date (YYYY-MM-DD) in one decision record. [EC 1]
11. IF direct repository access for criterion 8 is unavailable, THEN THE V2_Programme SHALL record the check as "not performed" with the date of the attempt, SHALL keep the 2026-11-19 states labelled "inferred, unverified", and SHALL NOT report the check as passed. [EC 1]
12. IF the O-2 decision record states "finish V1 first", THEN THE V2_Programme SHALL NOT start V2-M2 until a Result_Record exists for each V1 task named in that decision, or until the owner records a changed O-2 decision with its date. THE V2_Programme SHALL NOT report a V1 result as met without those Result_Records. [EC 1]

---

### Requirement 2: Independent Placement-Class Enumeration and Shared-Layer Symmetry (V2-M2)

**User Story:** As the project owner, I want the geometric feasibility of one continuous square settled by an independent computation, so that no generator or decoration work starts on an unverified hypothesis.

#### Acceptance Criteria

1. WHEN V2-M2 runs the enumeration, THE Feasibility_Computation SHALL derive every Placement_Class, as a tuple (suit, orientation, slot, printed body corner), from the V1 Fragment_Layout and Inward_Corner tables, and THE Result_Record SHALL contain the table values as entered and the V1 source from which each was transcribed. [EC 1]
2. THE Feasibility_Computation SHALL share no source code with the Fragment_Generator, the Square_Renderer or any V1 module, and THE V2_Programme SHALL record a dependency listing of every module the computation uses, in which no such module appears. [EC 1]
3. THE V2_Programme SHALL record in the Result_Record of V2-M2 the number of Placement_Classes produced by the Feasibility_Computation, and SHALL record the hand-derived value 16 only as a cross-check, never as an input. [EC 1]
4. WHEN the enumeration completes, THE Feasibility_Computation SHALL report, for each of the 8 printed (suit, body corner) Pieces, the list of Placement_Classes it serves and a pass or fail verdict. The verdict is pass only if the Piece serves exactly two classes, in diametrically opposite slots, one at 0 degrees and one at 180 degrees. [EC 1]
5. WHEN the symmetry check runs, THE Feasibility_Computation SHALL report, for each of the 180-degree rotation, the left-right mirror and the top-bottom mirror of the Shared_Layer, the pixel difference, the largest local deviation in modules and its location, the Central_Void mask used, the tolerance, and a pass or fail verdict against that tolerance. The tolerance SHALL be recorded in a Pre-registration made before the run. [EC 1]
6. WHILE the Feasibility_Computation has not confirmed HYP-1, THE V2_Programme SHALL ensure that every citation of HYP-1 or of the hand-derived class table, in any document, carries the label "hypothesis, unverified" at the point of citation. [EC 1]
7. WHEN V2-M2 tests the supplied Joker artwork, THE Feasibility_Computation SHALL rasterize the artwork with the Central_Void mask applied. It SHALL report the same measures and verdict as criterion 5 for its 180-degree point symmetry. THE V2_Programme SHALL record yes or no for whether the check against the owner's original picture was done under owner supervision. [EC 1]
8. WHEN V2-M2 completes, THE V2_Programme SHALL record exactly one Go_No_Go_Outcome, together with the identifiers of the Result_Record entries it was derived from. The outcome SHALL NOT come from a manual override. [EC 1]
9. IF the Go_No_Go_Outcome is NO-GO for square appearance, THEN THE V2_Programme SHALL start no further V2 milestone, SHALL leave V1 identical to the Baseline_V1 pinned commit IDs, and SHALL record the Result_Record entries that caused the outcome. [EC 1]
10. IF the Go_No_Go_Outcome is NO-GO for decoration, THEN THE V2_Programme SHALL produce no V2-M5 result and SHALL run V2-M6 and V2-M7 with Decoration_Mode OFF only. [EC 1]
11. IF the Go_No_Go_Outcome is GO-WITH-REDESIGN, THEN THE V2_Programme SHALL record that the supplied artwork was not used as is. It SHALL also record the owner's O-3 decision (point-symmetric redesign, or frame-only decoration acceptable) with its date. Both records SHALL exist before V2-M3 starts. [EC 1]
12. IF the computed Placement_Class count differs from 16, THEN THE V2_Programme SHALL record both values and the classes that differ. It SHALL label the hand-derived table "refuted" until a later Result_Record states the resolved count and the reason for the difference. [EC 1]
13. WHEN V2-M2 produces a result under criteria 3, 4, 5 or 7, THE V2_Programme SHALL store it as a Result_Record with evidence class, command, commit, environment, seed, sample identifiers and producer. [EC 1]
14. IF the Feasibility_Computation ends without producing the reports of criteria 3 to 5, THEN THE V2_Programme SHALL record no Go_No_Go_Outcome and SHALL record the failure in a Result_Record. [EC 1]

---

### Requirement 3: Geometry Parameter Study (V2-M2)

**User Story:** As the project owner, I want the assembled square size, quiet zone, corner radius, void and minimum feature size studied before generator work, so that the format fits real cards and a full board.

#### Acceptance Criteria

1. WHEN V2-M2 runs the parameter study, THE Feasibility_Computation SHALL vary the assembled square size S, the quiet zone, the Corner_Radius, the Central_Void and the minimum feature size, and SHALL record, in one table row per combination, the parameter values and the outcome of criteria 2 to 5 for that combination (valid, invalid or flagged, per criterion). The Corner_Radius value set SHALL include the 3.175 mm reference and at least one value greater than 3.175 mm. The value set of every parameter SHALL be written down before the run. [EC 1]
2. THE Feasibility_Computation SHALL derive an upper bound on S separately for the 40-module spacing (card width) and the 56-module spacing (card height) of neighbouring vertex squares on a full board. It SHALL record the S and quiet-zone pairs for which 2S plus the quiet zones is less than or equal to the spacing, and SHALL record the lower of the two bounds as the overall bound. [EC 1]
3. THE Feasibility_Computation SHALL compute the Central_Void area from the Corner_Radius. For each data cell, detection-critical frame element and decoration element, it SHALL record the distance to the nearest point of the Central_Void, computed for any position of the element and not only for the diagonal point. It SHALL NOT rely on the V1 formulas that cover only the diagonal point. [EC 1]
4. THE Feasibility_Computation SHALL report, for each decoration element, its feature size in modules and in millimetres (modules × 1.5875 mm). It SHALL flag every element whose feature size is below the minimum feature size fixed in V2-M2. An element equal to the minimum SHALL NOT be flagged. [EC 1]
5. WHEN the Corner_Radius is greater than 0, THE Feasibility_Computation SHALL record, for every data cell and detection-critical frame element, the containment margin to the Printable_Area boundary. It SHALL flag the combination as invalid if any margin is 0 or less. [EC 1]
6. THE V2_Programme SHALL record the conflict between the Assembled_Square and the front-face card index (design conflict C11) as an input of V2-M2. It SHALL record the status of O-8 (open or decided) and, once decided, the decision. It SHALL NOT decide the card-face design in this spec. [EC 1]
7. IF a parameter combination cannot be evaluated, THEN THE Feasibility_Computation SHALL keep its row in the table, mark the outcome NOT_EVALUATED (proposed name) with a stated reason, and SHALL NOT omit the row. [EC 1]
8. WHEN the parameter study finishes, THE Feasibility_Computation SHALL record the number of planned combinations and the number of recorded rows, and the two numbers SHALL be equal. [EC 1]

---

### Requirement 4: Assembled-Square Appearance (G1, G2)

**User Story:** As the project owner, I want the four pieces to assemble into one continuous square with only the Central_Void empty, so that the physical card corners form a single recognisable mark.

#### Acceptance Criteria

1. THE V2 format SHALL define the Assembled_Square as one square region formed by the four Pieces of a valid group, in which the Central_Void is the only intentionally empty area. [EC 1]
2. WHEN the Square_Renderer renders a Valid_Input with zero seam gap and nominal geometry, THE Square_Renderer SHALL output an Assembled_Square raster in which every pixel inside the outer outline that has no printed content lies within the Central_Void mask. [EC 2]
3. WHEN the Square_Renderer renders the Assembled_Square for each Placement_Class enumerated by the Feasibility_Computation, THE Square_Renderer SHALL output Shared_Layer rasters for which the difference between any two Placement_Classes is within the tolerance fixed in V2-M2. [EC 2]
4. WHERE the Data_Layer content differs between cards or slots, THE Square_Renderer SHALL output frame, outline and Decoration_Layer rasters whose difference between any two such cards or slots is within the tolerance fixed in V2-M2 (criterion 3). [EC 2]
5. THE V2 format SHALL state a quiet-zone rule as a size with a unit, applied around the Assembled_Square and not between Pieces. This rule replaces V1 Requirement 15.5 for V2 only. V1 Requirements 15.4 and 15.5 stay unchanged for V1. [EC 1]
6. WHEN seam gaps and print or cut offsets are applied, THE Comparison_Harness SHALL report, for each trial, the visible gap and the displacement of the frame continuity as numbers in modules. [EC 2]
7. IF, in the V2-M2 model-level check of the Feasibility_Computation with Decoration_Mode OFF, the Shared_Layer of any two Placement_Classes differs by more than the tolerance fixed in V2-M2, THEN THE V2_Programme SHALL record the Go_No_Go_Outcome "NO-GO for square appearance" in a Result_Record. A difference found later by the Square_Renderer is handled under Requirement 7.6 and is not a Gate 2 outcome. [EC 1]
8. THE V2_Programme SHALL describe "one continuous square" in every Result_Record and report as a target appearance. Its status SHALL be given only by the measurements of criterion 6, not by assumption. [EC 2]
9. WHEN V2-M2 fixes the tolerance used in criteria 3, 4 and 7, THE V2_Programme SHALL record the difference metric and the tolerance value in the Pre-registration before any comparison run. If the owner has not approved the value, the record SHALL mark it "proposed, pending owner approval". [EC 1]

---

### Requirement 5: Fixed-Print Compatibility and Double-Sided Behavior (G4)

**User Story:** As a card designer, I want V2 to work on the existing 52 cards with the fixed Fragment_Layout and rotations, so that one printed card works in every legal slot and on both faces.

#### Acceptance Criteria

1. THE V2 format SHALL define exactly 52 cards, the cards of the standard deck, and SHALL define no Joker card. The Joker_Decoration is an ornament and not a card. [EC 1]
2. THE V2 format SHALL use the V1 Fragment_Layout of V1 Requirement 14.1 without changing any corner position. It SHALL use the Card_Orientation values 0 and 180 degrees and no other value. [EC 1]
3. THE V2 format SHALL define exactly one printed raster for each of the 52 cards and each of its two body corners. No raster SHALL differ by slot, orientation or neighbouring cards. [EC 1]
4. WHEN the same unmodified printed raster of a Piece is placed in each legal slot and orientation of its Placement_Classes, THE Square_Renderer SHALL produce, for each placement, an Assembled_Square of a valid group per the V1 slot table. [EC 2]
5. WHEN V2-M2 evaluates the Decoration_Layer, THE V2_Programme SHALL record a written decision on design conflict C4 before V2-M3 starts. The record SHALL name the chosen alternative (decoration in the mirrored optical layer, as proposed, or face-local artwork) and who decided. [EC 1]
6. THE V2 format SHALL define the back optical layer as the left-right mirror, about the vertical axis of the Body_Frame, of the front optical layer of the same card. The back layer includes the Decoration_Layer (proposal, pending C4). It SHALL be derived from no input other than that front layer. [EC 1]
7. WHEN a card is flipped left-right under ideal conditions (definition pending, see OP-5.1 in Appendix D), THE Observed_Layer of the face shown after the flip, including the Decoration_Layer, SHALL equal the Observed_Layer of the face shown before the flip. The comparison is in position, bit pattern and pixel shape. [EC 2]
8. WHEN a card is flipped top-bottom under ideal conditions, THE Observed_Layer SHALL equal the observation of the same card in at least one of the allowed orientations, 0 or 180 degrees. [EC 2]
9. THE V2_Programme SHALL provide an automated test with a negative control that prints the same raster unchanged on both faces. The test's expected outcome is a detected violation of criterion 7, and each run SHALL be stored as a Result_Record. [EC 2]
10. THE V2 format SHALL place the front and back corner sets so that the Body_Frame area they occupy has zero intersection. It SHALL keep both faces inside the containment condition of V1 Requirement 15.3 (the V1 criterion, evaluated for V2 with the containment check of Requirement 3.5). [EC 1]
11. THE V2 format SHALL apply the left-right mirroring only to the optical layer. Text, pictures and other card artwork SHALL NOT be mirrored by it (V1 Requirement 16.6). This is checked by comparing artwork pixels with the unmirrored artwork. [EC 1]
12. THE V2 documentation SHALL contain a statement that a marker visible on either face reveals the card identity (V1 Requirement 16.9). It SHALL contain no claim that V2 makes printed card identity secret. [EC 1]
13. IF a test of criterion 4, 7, 8 or 9 fails or gives an undecidable result, THEN THE V2_Programme SHALL store a Result_Record naming the card, face, and Placement_Class or flip direction. It SHALL NOT report that criterion as met. [EC 2]
14. WHEN the test of criterion 4 enumerates Placement_Classes, THE V2_Programme SHALL state the number covered. It SHALL label the HYP-1 count of 16 as UNVERIFIED until Requirement 2 is executed. [EC 2]

---

### Requirement 6: V2 Format, Versioning and Module Isolation (conflicts C3, C5)

**User Story:** As a maintainer, I want V2 isolated and versioned, so that V1 prints, code and tests are never disturbed and V1 and V2 decks are never confused.

#### Acceptance Criteria

1. THE V2_Programme SHALL place every V2 production source file outside the `src/optical/` directory tree, in a V2 module location named in `design.md` (proposed: `src/optical-v2/`), so that `src/optical/` contains no V2 production source file. [EC 1]
2. THE V2_Programme SHALL define one format version identifier for V2. THE V2_Programme SHALL include that identifier in every V2 artifact, and every OfficialResult SHALL carry that same identifier. [EC 1]
3. WHERE a V2 codebook is created, THE V2_Programme SHALL create it as a new file whose name carries a version and differs from `codebook.v1.json`. It SHALL create it only after a Result_Record exists that proves a different pattern format is necessary. It SHALL NOT modify, rename or delete `codebook.v1.json`, and SHALL read it only as read-only data. [EC 1]
4. THE V2_Programme SHALL record, in one compatibility policy document, the statement that V1 cards and V2 cards are different print runs unless a test with a Result_Record shows them equal. THE V2_Programme SHALL also record in that document the O-9 decision (coexistence or retirement rule) as one of: coexistence, retirement, or "not yet decided". [EC 1]
5. THE V2 production code SHALL contain no import that resolves to code under `src/game`. [EC 1]
6. WHILE no recorded owner approval of V2-M8 exists, THE code under `src/game` SHALL contain no import of V2 code. [EC 1]
7. THE V2 production code SHALL contain no import of a V1 runtime module that reads the codebook with `node:fs`. Every import of a V1 module from V2 code SHALL occur only in the Comparison_Harness. [EC 1]
8. THE V2_Programme SHALL keep V2 tests in a directory inside the V2 module location. It SHALL keep V2 results in a directory that is neither `docs/optical/results/` nor inside it, so that no V2 result file exists under `docs/optical/results/`. [EC 1]
9. THE V2_Programme SHALL record, for each of criteria 1, 5, 6, 7 and 8, a Result_Record that names the inspection performed and its outcome (pass or fail). [EC 1]
10. THE V2_Programme SHALL keep the V1 source, test and result files identical to the Baseline_V1 pinned commit IDs. [EC 1]

---

### Requirement 7: Fragment Generation and Rendering (V2-M3)

**User Story:** As a developer, I want deterministic generation and rendering with the Central_Void as a mask, so that all placement classes can be compared reproducibly before any decoration is added.

#### Acceptance Criteria

1. WHEN the Fragment_Generator is run twice with identical parameters and the same seed, THE Fragment_Generator SHALL produce Pieces for all 52 cards and the back layer. A comparison of the two stored outputs SHALL show zero differing modules. [EC 2]
2. WHEN the Square_Renderer is run twice with identical parameters and the same seed, THE Square_Renderer SHALL produce rasters. A comparison of the two stored rasters SHALL show zero differing raster values. [EC 2]
3. THE Fragment_Generator SHALL support Decoration_Mode OFF before any other Decoration_Mode (SIMPLIFIED, ORIGINAL_BASED, FRAME_ONLY). A Result_Record for the OFF mode must exist before any Result_Record for another mode. [EC 1]
4. THE Square_Renderer SHALL apply the Central_Void as a mask. In the rendered raster, no printed module SHALL lie inside the Central_Void region. The Data_Layer SHALL contain no data value at any Central_Void position. [EC 2]
5. THE Square_Renderer SHALL produce a raster and a Data_Layer in which the Central_Void mask overlaps zero data cells and zero detection-critical frame elements, under the nominal geometry as defined in V2-M2 (see OP-7.2 in Appendix D). [EC 2]
6. WHEN all Placement_Classes enumerated by the Feasibility_Computation are rendered with Decoration_Mode OFF, THE Square_Renderer SHALL produce Shared_Layer rasters. The difference between any two classes SHALL be within the tolerance recorded in the V2-M2 Result_Record before the comparison. IF any difference exceeds that tolerance, THEN THE V2_Programme SHALL record a Gate 3 no-go, SHALL return to V2-M2 to re-run the enumeration (design gate diagram, Requirement 19.13), and SHALL NOT record that difference as a retroactive Gate 2 outcome. [EC 2]
7. THE Fragment_Generator SHALL derive the back layer of each card only from the front layer of that same card. The back layer of a card SHALL be unchanged when the front layer of any other card is altered. [EC 2]
8. THE Square_Renderer SHALL compute the Keep_Out_Mask as the union of the data cells, the detection-critical frame elements and the quiet zone. No other region SHALL be included. The Keep_Out_Mask computed by the Square_Renderer SHALL be equal to the mask recorded in the V2-M2 Result_Record for the same parameters. IF the two masks differ, THEN THE V2_Programme SHALL record a Gate 3 no-go and SHALL return to V2-M2, as for criterion 6, and SHALL NOT record the difference as a retroactive Gate 2 outcome. [EC 2]
9. WHEN the V2-M3 Gate is evaluated, THE V2_Programme SHALL compare the V1 files and the Fragment_Layout with the Baseline_V1 pin. The comparison SHALL be stored in a Result_Record that states the number of differing files. [EC 1]
10. WHILE the V2-M2 Go_No_Go_Outcome does not allow a Decoration_Mode other than OFF, THE V2_Programme SHALL NOT enable that mode. [EC 1]
11. IF the comparison in criterion 9 shows any difference from the Baseline_V1 pin, THEN THE V2_Programme SHALL NOT record the V2-M3 Gate as passed. THE V2_Programme SHALL record the differing items in the Result_Record. [EC 1]

---

### Requirement 8: Atomic Recognition Policy and Official Scanner (V2-M4, G3)

**User Story:** As the project owner, I want the official scanner to return a success, a card ID or a sum only when all four valid pieces are present, so that one to three pieces never score.

#### Acceptance Criteria

1. THE Official_Scanner SHALL be the only production entry point of V2 recognition, and every call SHALL return exactly one OfficialResult whose kind is exactly one Official_Result_Kind value. [EC 1]
2. IF the result kind is not IDENTIFIED, THEN THE Official_Scanner SHALL return a result in which the card ID, rank, suit, Card_Value and Hidden_Sum fields are absent (not present with a null, empty or placeholder value). [EC 2]
3. WHEN a Proper_Subset_Scene is presented, THE Official_Scanner SHALL return a Reject for each of the 14 non-empty proper subsets of the four Pieces of a Valid_Input. [EC 2]
4. WHEN a scene contains no Piece (background only), THE Official_Scanner SHALL return a Reject. [EC 2]
5. THE Official_Scanner SHALL return IDENTIFIED only when the scene is a Valid_Input (four valid Pieces, four distinct card IDs, a valid arrangement). [EC 2]
6. THE V2 production export SHALL list the Official_Scanner as its only recognition function, and Internal_Diagnostics SHALL NOT appear in that export list and SHALL be reachable only from the test harness. [EC 1]
7. THE V2_Programme SHALL keep `decodeFragment` identical to its Baseline_V1 pinned commit version, and no function in the V2 production export SHALL report per-piece success. [EC 1]
8. THE Official_Scanner SHALL accept an options input limited to the layout and tuning values listed in the V2 design, and SHALL accept no board state and no expected card identity in any input. [EC 1]
9. THE Official_Scanner SHALL NOT write a card identity to any log and SHALL NOT include one in an exception message, for any call whose outcome is not IDENTIFIED. [EC 2]
10. THE V2 documentation SHALL contain a statement that the Atomic_Result_Policy (a) is a result rule of the official API, (b) is not cryptographic secrecy, and (c) makes no claim that card identity cannot be derived from one to three Pieces by other means. [EC 1]
11. WHERE O-6 is approved by the owner, THE Official_Scanner SHALL carry in an INCOMPLETE_GROUP result only the geometric hint type(s) named in the approved O-6 decision (the source's only example is the visible fraction), and no card ID, rank, suit, Card_Value or Hidden_Sum. [EC 2]
12. WHEN a Proper_Subset_Scene run is recorded, THE Result_Record SHALL state the total trial count n, the number of the 14 subsets covered, and the observed Wrong_Accept count, SHALL label them finite-sample observations, and SHALL NOT present an observed count of zero as a guarantee. [EC 2]
13. WHEN THE Official_Scanner receives untrusted image input, THE Official_Scanner SHALL stay within a maximum memory use and a maximum processing time. The values are proposed, pending owner approval. [EC 2]
14. IF O-6 is not approved by the owner, THEN THE Official_Scanner SHALL carry no hint in any result. [EC 2]

---

### Requirement 9: Result Kinds and Metric Partition (V2-M4)

**User Story:** As an evaluator, I want every trial classified into exactly one outcome and rejections never mixed into the success rate, so that wrong acceptance is visible and measured honestly.

#### Acceptance Criteria

1. THE Official_Scanner SHALL return exactly one OfficialResult per call, and the kind of that OfficialResult SHALL be a member of the Official_Result_Kind set decided in V2-M4. [EC 1]
2. WHEN the Official_Scanner returns an OfficialResult, THE OfficialResult SHALL contain `cards`, `hiddenSum` and `reflection` if and only if its kind is IDENTIFIED, and SHALL contain none of the three for every other kind. [EC 2]
3. WHEN the kind is IDENTIFIED, THE OfficialResult SHALL contain four pairwise distinct card IDs and a Hidden_Sum that is an integer from 4 to 52. [EC 2]
4. WHEN the Official_Scanner has returned a result for a trial, THE Comparison_Harness SHALL assign exactly one of CORRECT, REJECTED, WRONG_ACCEPT_VALID and WRONG_ACCEPT_NEGATIVE by comparing that result with the Oracle truth, and SHALL assign no other label. [EC 2]
5. THE Result_Record SHALL report the counts of CORRECT, REJECTED, WRONG_ACCEPT_VALID and WRONG_ACCEPT_NEGATIVE separately with n. It SHALL NOT count REJECTED trials in the numerator of any success rate. It SHALL state the numerator and denominator of every reported success rate. It SHALL report the false-reject count (Valid_Input trials whose kind is a Reject) with the number of Valid_Input trials. [EC 2]
6. THE Comparison_Harness SHALL keep the truth fields in the Oracle only, and the input it passes to the Official_Scanner SHALL contain none of them. [EC 2]
7. WHEN the kind is IDENTIFIED for a Valid_Input, THE Comparison_Harness SHALL compare `cards` and `hiddenSum` with the independent truth. It SHALL record the mismatch count, n, the observed rate and the upper bound computed by the method fixed in the Pre-registration. [EC 2]
8. WHEN zero events of one named event type are observed in n independent trials, THE Result_Record SHALL name the event type and n, SHALL state the one-sided 95% upper bound 1 - 0.05^(1/n), and SHALL give the argument for independence of the trials. It SHALL also state that zero observed events is not a guarantee. [EC 1]
9. THE V2_Programme SHALL keep the V2 kind AMBIGUOUS distinct from the V1 reflection value AMBIGUOUS, so that the V2-M4 result-kind definition and every Result_Record name the two separately. [EC 1]
10. IF the four class counts do not sum to n, THEN THE Result_Record SHALL mark the run as not evaluable and list the identifiers of the trials not assigned to exactly one class. [EC 2]
11. THE V2_Programme SHALL record in the Pre-registration, before the first classified run, a table that maps each combination of input type (Valid_Input or Negative_Input), result kind and Oracle comparison to exactly one of the four classes. [EC 2]

---

### Requirement 10: Invalid Arrangements, Negative Suites and Target Region

**User Story:** As a scoring companion user, I want illegal, damaged or foreign scenes rejected and only the intended group applied, so that a wrong card is never silently accepted.

#### Acceptance Criteria

1. WHEN a scene contains a card whose suit, orientation (including 90 and 270 degrees) or slot is not one of the Placement_Classes (HYP-1 table, UNVERIFIED), THE Official_Scanner SHALL return a Reject of kind INVALID_ARRANGEMENT that carries no card ID and no Hidden_Sum. [EC 2]
2. WHEN a scene contains the same card ID more than once, THE Official_Scanner SHALL return a Reject of kind DUPLICATE_CARD that carries no card ID and no Hidden_Sum. [EC 2]
3. WHEN a Piece is damaged, as defined by the damaged-Piece class of the pre-registered negative suite, THE Official_Scanner SHALL return a Reject of kind CORRUPTED. [EC 2]
4. THE Official_Scanner SHALL form a group only from exactly four Pieces whose Inward_Corners meet at one vertex, one Piece per slot, and a Piece whose Inward_Corner is not at that vertex SHALL NOT contribute to the group. [EC 2]
5. WHEN the frame contains more than one complete square, THE Official_Scanner SHALL select the complete group whose vertex is nearest the frame center, SHALL report that vertex, and SHALL build the result only from the four Pieces of that group (V1 Requirement 13 note). [EC 2]
6. WHEN squares at neighbouring vertices of a full board are present as distractors, THE Official_Scanner SHALL NOT return an IDENTIFIED result that contains a Piece from a different vertex. [EC 2]
7. IF the reported `vertex` lies outside the Target_Region, THEN THE Scoring_Companion SHALL discard the result for the Target_Group, leaving its stored card identities and Hidden_Sum unchanged. Before V2-M8, this criterion is verified on the `verifyTargetVertex` function of `design.md` and on the Official_Scanner results (EC 2); the Scoring_Companion behaviour itself is verified in V2-M8 under Requirement 17.7 (EC 3). [EC 2]
8. THE Scoring_Companion SHALL store for the Target_Group exactly the card IDs the Official_Scanner decoded, including when they differ from the Board record (V1 Requirements 9.11 and 13.9). Before V2-M8, this criterion is verified on the `verifyTargetVertex` function of `design.md` and on the Official_Scanner results (EC 2); the Scoring_Companion behaviour itself is verified in V2-M8 under Requirement 17.7 (EC 3). [EC 2]
9. IF the Official_Scanner returns a Reject for the Target_Group, or the reported `vertex` does not match the Target_Group, THEN THE Scoring_Companion SHALL apply no result and SHALL present a request for repositioning, rescan or manual entry. Before V2-M8, this criterion is verified on the `verifyTargetVertex` function of `design.md` and on the Official_Scanner results (EC 2); the Scoring_Companion behaviour itself is verified in V2-M8 under Requirement 17.7 (EC 3). [EC 2]
10. THE V2_Programme SHALL, in a Pre-registration made before the run, list the negative classes (all 14 Proper_Subset_Scenes, duplicate cards, illegal suit, orientation and slot combinations, 90-degree Pieces, distractor squares at neighbouring vertices at the S and quiet zone selected from the parameter study of Requirements 3.1 and 3.2 (the selection itself is open, see OP-3.8), foreign decoration, background only). THE V2_Programme SHALL report one row per class with n and the WRONG_ACCEPT_NEGATIVE count, each row backed by a Result_Record. [EC 2]
11. WHEN a scene is a Proper_Subset_Scene, THE Official_Scanner SHALL return a Reject of kind INCOMPLETE_GROUP that carries no card ID and no Hidden_Sum. [EC 2]
12. WHEN a Piece reading is ambiguous, as defined by the pre-registered ambiguity rule, THE Official_Scanner SHALL return a Reject of kind AMBIGUOUS. [EC 2]
13. WHEN a scene contains no Piece, THE Official_Scanner SHALL return a Reject of kind NOT_DETECTED. [EC 2]

---

### Requirement 11: Candidate A and B Comparison (V2-M4)

**User Story:** As the project owner, I want the recognition approach decided by pre-registered measurement, so that the choice is evidence-based and neither candidate leaks per-piece success.

#### Acceptance Criteria

1. WHEN V2-M4 starts the comparison, THE V2_Programme SHALL complete a stored Pre-registration of conditions, trial counts, seeds, metrics, thresholds, the definition of "significant degradation", the analysis method, the stopping rule and the decision rule, before any Result_Record of Candidate_A or Candidate_B exists, so that the stored ordering shows the Pre-registration came first. [EC 1]
2. THE Comparison_Harness SHALL run Candidate_A, Candidate_B and the pinned Baseline_V1 on identical inputs, and each Result_Record SHALL list the sample identifiers and seed so that the three systems' identifier sets are equal. [EC 2]
3. WHEN the comparison is complete, THE V2_Programme SHALL record a choice of Candidate_A or Candidate_B that cites the Pre-registration decision rule clause applied and the Oracle-classified results it used. [EC 2]
4. THE Candidate_A and the Candidate_B SHALL each pass their readings through the Atomic_Decision_Policy, so that for every Proper_Subset_Scene the OfficialResult is a Reject kind and carries no card ID, Hidden_Sum or per-piece success indicator. [EC 2]
5. THE V2 production export SHALL contain no exported name and no OfficialResult content through which Internal_Diagnostics (the internal per-region readings of Candidate_B) reach the caller, as shown by an export-surface inspection stored in a Result_Record. [EC 1]
6. THE Comparison_Harness SHALL store, in the Result_Record of each candidate, the median and p95 decode latency, the environment and the working resolution used. [EC 2]
7. IF a candidate requires a separate quiet margin between Pieces, THEN THE V2_Programme SHALL record a written evaluation naming the Requirement 4 criteria checked and the outcome (appearance violation or none), as design conflict C1. [EC 2]
8. IF neither candidate satisfies the Gate 4 criteria, THEN THE V2_Programme SHALL record a Gate decision stating that neither candidate was chosen, and SHALL return to V2-M3 as in the gate diagram. [EC 1]
9. WHEN the comparison is complete, THE V2_Programme SHALL store the discordant pairs, meaning sample identifiers on which two systems have different Oracle classifications, together with the aggregate rates. [EC 2]
10. IF a run departs from the Pre-registered conditions, trial counts or seeds, THEN THE V2_Programme SHALL record the departure as a labelled deviation in the affected Result_Record and cite it in the choice record of criterion 3. [EC 1]

---

### Requirement 12: Joker Decoration Constraints and Rights (V2-M2 and V2-M5, G5)

**User Story:** As the project owner, I want the Joker artwork used only as decoration inside the assembled marker and only with rights approved, so that recognition is not harmed and no artwork is published without permission.

#### Acceptance Criteria

1. THE Decoration_Layer SHALL be placed only inside the Assembled_Square and outside the Keep_Out_Mask computed in V2-M2, and THE Feasibility_Computation SHALL record the Keep_Out_Mask computed in V2-M2 in the V2-M2 Result_Record, as the reference for the equality check of Requirement 7.8. The planned Square_Renderer output SHALL show no decoration element outside the Assembled_Square or inside the Keep_Out_Mask. [EC 1]
2. THE Decoration_Layer SHALL NOT overlap a data cell, a detection-critical frame element or the quiet zone. The check compares the Decoration_Layer region with the Keep_Out_Mask in the Square_Renderer output and passes only if the intersection is empty. [EC 2]
3. THE Joker_Decoration SHALL NOT be a 53rd card, SHALL carry no card ID or Card_Value, and SHALL NOT contribute to the Hidden_Sum. The Oracle Hidden_Sum of any Valid_Input SHALL be identical in every Decoration_Mode. [EC 1]
4. WHERE the Decoration_Layer is present, THE Composite_Code_V2 SHALL remain complete and valid when the Decoration_Layer is removed. "Complete and valid" means the render without the Decoration_Layer differs from the decorated render only inside the Decoration_Layer region, and every data cell and frame element is unchanged. [EC 2]
5. WHERE the Decoration_Layer is present, THE Shared_Layer including the Decoration_Layer SHALL satisfy the symmetry check of Requirement 2.5 for every Placement_Class enumerated by the Feasibility_Computation. Each per-class outcome SHALL be stored in a Result_Record. [EC 1]
6. THE V2_Programme SHALL define the Decoration_Modes OFF, SIMPLIFIED, ORIGINAL_BASED and, where V2-M2 returns GO-WITH-REDESIGN in that form, FRAME_ONLY. [EC 1]
7. THE V2_Programme SHALL treat the user-supplied Joker SVG as a visual reference only and as the test subject of Requirement 2.7. THE V2_Programme SHALL NOT use the SVG as an operational optical code, as a Valid_Input or as an Oracle entry. [EC 1]
8. WHEN the original artwork or a trace of it would be stored in the repository or published, THE V2_Programme SHALL first record its rights status and the owner's publication permission decision (O-5). [EC 1]
9. IF a decoration element is below the minimum feature size fixed in V2-M2, THEN THE V2_Programme SHALL simplify or remove that element. The re-rendered Decoration_Layer SHALL contain no element below that size. [EC 1]
10. IF no rights record exists for the original artwork or a derived trace, or the recorded O-5 decision is not a permission, THEN THE V2_Programme SHALL NOT upload, commit or publish that artwork or trace. [EC 1]
11. WHEN V2-M2 concludes, THE V2_Programme SHALL record the O-7 decision on the wording "inside the assembled marker" in the Open_Owner_Decision entry for O-7. [EC 1]

---

### Requirement 13: Joker Decoration A/B Validation (V2-M5)

**User Story:** As the project owner, I want the decoration compared with the decoration-free code under identical conditions, so that the decoration is kept, simplified or removed on evidence.

#### Acceptance Criteria

1. WHEN a decoration comparison run is executed, THE Comparison_Harness SHALL run the Decoration_Modes OFF, SIMPLIFIED and ORIGINAL_BASED, and FRAME_ONLY only WHERE it is defined, on identical card sets, arrangements, degradation seeds, noise, blur, illumination, perspective and geometry. THE Result_Record SHALL list these inputs per arm, so that only the Decoration_Layer differs between arms. If FRAME_ONLY is not defined, the Result_Record SHALL state that it was not run. [EC 2]
2. THE Comparison_Harness SHALL compare the arms per trial in pairs. For each pair of arms it SHALL report as discordant every trial whose outcome differs, listing the trial identifier and both outcomes. The outcomes are CORRECT, REJECTED with kind, WRONG_ACCEPT_VALID and WRONG_ACCEPT_NEGATIVE. [EC 2]
3. THE Result_Record SHALL report per arm and condition: the trial count, correct, REJECTED per Official_Result_Kind, WRONG_ACCEPT_VALID and WRONG_ACCEPT_NEGATIVE as separate counts, and decode latency (median and p95), each with its environment field. [EC 2]
4. WHEN a V2-M5 run is about to start, THE V2_Programme SHALL already hold a completed Pre-registration. It SHALL contain every item in the Pre-registration definition, including the threshold for the correct rate, the threshold for the rejection rate, and the meaning of "significant degradation". It SHALL be dated before the first V2-M5 trial record. [EC 1]
5. IF a decoration arm yields at least one Wrong_Accept on an input where the OFF arm does not on the same paired trial, THEN THE V2_Programme SHALL remove or simplify the Decoration_Mode of that arm. [EC 2]
6. IF the correct rate or the rejection rate of a decoration arm falls below the OFF arm by more than the matching Pre-registration threshold, THEN THE V2_Programme SHALL remove or simplify that arm's decoration. [EC 2]
7. IF a decoration element conflicts with the Keep_Out_Mask, the Central_Void or the minimum feature size, THEN THE V2_Programme SHALL remove or simplify the decoration. [EC 1]
8. IF the Shared_Layer fails the symmetry check across the Placement_Classes, THEN THE V2_Programme SHALL remove or simplify the decoration. [EC 1]
9. IF the Composite_Code_V2 with Decoration_Mode OFF fails the completeness and validity definition recorded in the Pre-registration, THEN THE V2_Programme SHALL remove or simplify the decoration. [EC 2]
10. WHEN the V2-M5 Gate is evaluated, THE V2_Programme SHALL record the decision keep, simplify or remove. The record SHALL cite the Result_Records and discordant pairs, and state which of criteria 5 to 9 fired. THE V2_Programme SHALL record "keep" only if none of them fired. [EC 1]
11. IF a trial lacks a paired result for any run arm, THEN THE Comparison_Harness SHALL exclude it from pairwise comparison and report it by identifier and arm. [EC 2]
12. WHEN a trial is classified, THE Comparison_Harness SHALL assign the outcome from the Oracle. THE Oracle truth SHALL NOT be an input to the decoder. [EC 2]

---

### Requirement 14: Synthetic Robustness and Regression (V2-M6)

**User Story:** As an evaluator, I want pre-registered synthetic conditions and V1 regression gates, so that robustness claims are bounded and every failure is kept.

#### Acceptance Criteria

1. WHEN V2-M6 starts, THE V2_Programme SHALL record a Pre-registration, before its first trial, that lists the conditions (camera rotations of 0, 45, 90, 180 and 270 degrees, near-boundary values 44.9 and 45.1 degrees, reflection, perspective, occlusion, brightness, noise, blur, seam gaps, print and cut offsets) and the levels, trial count and seeds of each. [EC 1]
2. WHEN V2-M6 starts, THE V2_Programme SHALL record the count of valid (card set, arrangement) combinations before and after deduplication, together with the deduplication rule. THE V2_Programme SHALL NOT use the V1 numbers 81 or 648 as V2 counts, and SHALL NOT claim exhaustive coverage before the deduplicated count is recorded. [EC 1]
3. WHEN V2-M6 evaluates its Gate, THE Result_Record SHALL list each V1 regression gate of Requirement 1.7 with its pass or fail outcome. THE V2_Programme SHALL NOT record GO or GO-WITH-REDESIGN while any of them is failed or unlisted. [EC 2]
4. THE Result_Record SHALL preserve, for every trial the Oracle does not classify as CORRECT, the seed, the input image and the Oracle classification. THE Result_Record SHALL discard none, and its failure count SHALL equal the number of such trials. [EC 2]
5. WHEN a statement reports zero observed events, THE Result_Record SHALL state n, the upper bound computed under Requirement 9.8, and the argument for why the n trials are independent, or that independence is not established. [EC 1]
6. THE Result_Record SHALL label every V2-M6 result as Evidence_Class 2 and SHALL state that synthetic results are not real-camera results. [EC 1]
7. IF a condition shows a nonzero Wrong_Accept count in any arm, THEN THE Result_Record SHALL report that condition, that arm, the counts of WRONG_ACCEPT_VALID and WRONG_ACCEPT_NEGATIVE, and the failing seeds. [EC 2]
8. WHEN V2-M6 runs a trial, THE Comparison_Harness SHALL run the Baseline_V1 arm pinned in V2-M1 on the same sample identifiers and seeds as each V2 arm, and THE Result_Record SHALL show those identifiers for every arm. [EC 2]
9. WHILE V2-M5 was skipped because of a NO-GO for decoration, THE Comparison_Harness SHALL run V2-M6 with Decoration_Mode OFF as the only V2 arm and SHALL still run the Baseline_V1 arm of criterion 8 on the same sample identifiers and seeds as that V2 arm, and THE Result_Record SHALL state that V2-M5 was skipped. [EC 2]
10. THE Result_Record SHALL state the Node decode latency with its measurement statistic and environment, and SHALL state that the figures are not phone timings. [EC 2]
11. IF a pre-registered condition is run with different levels, seeds or trial counts than registered, or is not run, THEN THE Result_Record SHALL list that deviation and SHALL NOT claim coverage of that condition. [EC 1]
12. THE Result_Record SHALL limit every robustness claim to the pre-registered conditions and levels it reports. [EC 2]
13. WHEN V2-M5 ran, THE Comparison_Harness SHALL run V2-M6 with exactly the Decoration_Modes the Gate 5 record names: `keep` -> OFF plus the kept mode(s); `simplify` -> OFF plus SIMPLIFIED; `remove` -> OFF only. The Baseline_V1 arm of criterion 8 runs in every case, and the Result_Record SHALL cite the Gate 5 decision it applied. Criterion 9 covers the skip of V2-M5, and Requirement 16.17 covers the Decoration_Modes of V2-M7. [EC 2]

---

### Requirement 15: Visual Indistinguishability of Marker Patterns (PR #18 R06, optional, NOT security)

**User Story:** As the project owner, I want an optional measurable test of how well marker patterns can be told apart by eye, so that the claim is a stated proposal and not mistaken for a security property.

#### Acceptance Criteria

1. WHERE the owner approves the indistinguishability test, THE V2_Programme SHALL execute it as an optional experiment, and no Gate decision record SHALL cite the test or its result as a condition. [EC 1]
2. WHEN the owner approves the test, THE V2_Programme SHALL record in the Pre-registration, before any trial is run, the following four items: the blind procedure, including which parties (at least the participants) do not see the labels; the participant count; the numeric target for the identification rate; the publication channel for the results. [EC 1]
3. WHILE the owner has not approved the numeric target (O-4), THE Pre-registration SHALL mark that target `proposed, pending owner approval (O-4)`. [EC 1]
4. THE Result_Record SHALL report the observed identification rate as correct identifications over total trials. It SHALL give an exact binomial confidence interval at the level stated in the Pre-registration. It SHALL include a statement that no observed rate, including zero, is a guarantee of indistinguishability. [EC 4]
5. THE V2 documentation SHALL include, in every place that describes the test, a statement that visual indistinguishability is a proposal and not a security property, and that static patterns remain reverse-engineerable. [EC 1]
6. IF a test run uses rendered images, THEN THE Result_Record SHALL label that run Evidence_Class 2. IF it uses printed cards, THEN THE Result_Record SHALL label that run Evidence_Class 4. [EC 1]
7. IF a test uses both rendered images and printed cards, THEN THE Result_Record SHALL keep a separate record and rate for each stimulus type, each with its own Evidence_Class label. [EC 1]
8. IF the owner has not approved the test, or the test has not been executed, THEN THE V2 documentation SHALL NOT state or imply that marker patterns are visually indistinguishable. [EC 1]

---

### Requirement 16: Physical Printing and Phone Validation (V2-M7)

**User Story:** As the project owner, I want real prints and real phones tested against thresholds I approved in advance, so that physical results are honest and separate from synthetic ones.

#### Acceptance Criteria

1. WHEN V2-M7 prepares a real-device test, THE V2_Programme SHALL obtain the owner's approval of each threshold before the first capture, SHALL record that approval in the Result_Record as one entry per threshold, and SHALL record the PR #18 values (95% correct in 100 independent shots per normal condition, zero observed wrong card acceptance, and 5 seconds end to end) as `proposed, pending owner approval (O-4)` until the entry exists. [EC 4]
2. IF a threshold has no approval entry in the Result_Record, THEN THE V2_Programme SHALL NOT report a real-device result as a pass or a fail against that threshold, and SHALL report the raw counts labelled `unevaluated, threshold not approved`. [EC 4]
3. WHEN captures are taken, THE V2_Programme SHALL record for each capture whether re-framing and re-lighting were done relative to the previous capture, SHALL argue independence in the Result_Record, and SHALL NOT count repeated frames of one setup as independent. [EC 4]
4. THE Result_Record SHALL keep every failed frame, meaning every frame that the Oracle does not classify as CORRECT. It SHALL keep the unaltered frame with its Official_Result and SHALL include the frame in n. [EC 4]
5. THE V2_Programme SHALL measure the seam gap and the front-to-back registration and cut outline errors on real prints in millimetres and modules. [EC 4]
6. THE V2_Programme SHALL perform a physical duplex and flip test that compares the Observed_Layer after a physical flip with the front observation, and SHALL verify the back-side print-file convention (V1 Requirement 16.5). WHERE a Decoration_Layer exists in the printed mode (Gate 5 `keep` or `simplify`), THE V2_Programme SHALL include the Decoration_Layer in that comparison. Otherwise (V2-M5 skipped or Gate 5 `remove`), THE V2_Programme SHALL run the same test on the optical layer with Decoration_Mode OFF. [EC 4]
7. THE V2_Programme SHALL perform the show-through test of V1 Requirement 16.10. WHERE a Decoration_Layer exists in the printed mode (Gate 5 `keep` or `simplify`), THE V2_Programme SHALL include the Decoration_Layer in that test. Otherwise (V2-M5 skipped or Gate 5 `remove`), THE V2_Programme SHALL run the same test on the optical layer with Decoration_Mode OFF. [EC 4]
8. THE Result_Record SHALL keep real-device results in files separate from synthetic results and SHALL NOT merge them in one rate. [EC 4]
9. THE Result_Record SHALL record device model, operating system, camera settings, lighting, print process, paper stock, cutting method and measured decode time per capture, and SHALL record `unknown` for any field that cannot be obtained, not leave it empty. [EC 4]
10. THE V2_Programme SHALL measure the real Corner_Radius of the printed cards and SHALL record it as a measured value because the 3.175 mm reference is unconfirmed. [EC 4]
11. THE Result_Record SHALL report REJECTED, WRONG_ACCEPT_VALID and WRONG_ACCEPT_NEGATIVE as separate counts with n. [EC 4]
12. THE V2_Programme SHALL include physical negative scenes (one to three Pieces, a wrong orientation, a duplicate) in the physical protocol, each with its Oracle truth recorded before capture. [EC 4]
13. THE V2_Programme SHALL confirm, and record the observed result in the Result_Record, that an empty corner is not detected as a Piece. [EC 4]
14. THE V2_Programme SHALL confirm, and record the observed result in the Result_Record, that a card whose inward corner is empty does not form a complete group. [EC 4]
15. WHEN V2-M7 prepares a real-device test, THE V2_Programme SHALL record a Pre-registration in the Result_Record before the first capture. [EC 4]
16. WHEN a Gate 7 no-go is recorded, THE V2_Programme SHALL store a Failure_Attribution_Record built only from Result_Records (Evidence_Class 4 frames, the failures kept under criterion 4, and Oracle classifications). The record SHALL name exactly one primary cause class and the route taken, as in the Gate 7 routing table of `design.md`. The cause classes are DECORATION, PRINT_OR_GEOMETRY, RECOGNITION_OR_DECISION_POLICY, THRESHOLD_NOT_APPROVED_OR_PROTOCOL_DEVIATION and UNDETERMINED_OR_UNREACHABLE (proposed names). A threshold SHALL NOT be changed after the results of the same captures have been seen. [EC 4]
17. WHEN V2-M5 ran, THE V2_Programme SHALL print and capture in V2-M7 only the Decoration_Modes the Gate 5 record names (`keep`: OFF plus the kept mode(s); `simplify`: OFF plus SIMPLIFIED; `remove`: OFF only), and the Result_Record of each capture session SHALL cite the Gate 5 decision applied; WHEN V2-M5 was skipped, V2-M7 SHALL use Decoration_Mode OFF only. [EC 4]

---

### Requirement 17: Optional Scoring Companion Integration (V2-M8, PR #18 R10 and R11)

**User Story:** As a physical card player, I want an optional V2 camera scan in the Scoring Companion that never reveals card identity or sum before all Guesses are confirmed, so that the inference game stays fair.

#### Acceptance Criteria

1. IF V2-M8 is not separately approved by the owner, THEN THE V2_Programme SHALL perform no Scoring Companion integration work, evidenced by the absence of any change that connects V2 to the Companion layer. [EC 1]
2. WHEN V2-M8 is approved, THE V2_Programme SHALL connect V2 to the Scoring_Companion only through a thin adapter in the Companion layer, evidenced by a dependency check showing that no Scoring_Companion module other than the adapter imports V2 code. [EC 1]
3. WHEN V2-M8 is approved, THE V2 browser bundle SHALL load its pattern data without `node:fs`, and THE V2_Programme SHALL store a Result_Record of a headless browser worker decoding a V2 test frame to the result the Oracle expects. This criterion verifies browser readiness inside the scope of V2-M8. Independent of V2-M8, Requirement 6.7 already forbids V2 production code from importing V1 modules that read the codebook with `node:fs`, so no V2 code is built that blocks later browser use. [EC 3]
4. WHERE the camera scan input is offered, WHEN the user selects it, THE Scoring_Companion SHALL request the camera with `getUserMedia`. [EC 3]
5. WHEN the Scoring_Companion is reopened without a network connection after at least one successful initial load, THE Scoring_Companion SHALL scan and score with V2 (V1 Requirement 9.4), evidenced by a network-disabled run in which a Valid_Input returns IDENTIFIED. [EC 3]
6. THE Scoring_Companion SHALL process camera frames on the device and SHALL NOT transmit a camera frame over a network, evidenced by a recorded capture of network traffic during a scan that contains no outbound request carrying frame data. [EC 3]
7. THE Scoring_Companion SHALL match the reported `vertex` against the Target_Region as specified in Requirements 10.7 to 10.9, and SHALL store for the Target_Group exactly the card IDs the Official_Scanner decoded (V1 Requirements 9.11 and 13.9). [EC 3]
8. WHILE the Guess of any participating player for a Quad_Group is unconfirmed, THE Scoring_Companion SHALL NOT display, in any user-visible output, a card identity, rank, suit, Card_Value or Hidden_Sum decoded from the scan of that Quad_Group. This is stricter than V1 Requirement 6.1 and is a PR #18 proposal (R11). [EC 3]
9. WHEN all Guesses for a Quad_Group are confirmed and the Official_Scanner result for that Quad_Group is IDENTIFIED, THE Scoring_Companion SHALL display the Hidden_Sum and the scores per V1 Requirements 6.2 and 9.3. [EC 3]
10. THE V2 documentation SHALL state that a QR code used only for packaging or opening the application over HTTPS is a standard QR code and is not the Composite_Code_V2. [EC 1]
11. WHEN the Official_Scanner returns a Reject, THE Scoring_Companion SHALL display a prompt offering both rescan and manual entry, and SHALL apply no card identity and no sum. [EC 3]
12. WHEN V2-M8 is approved, THE V2_Programme SHALL record the boundary change decision before any import from `src/game`. [EC 1]
13. IF camera permission is denied or no camera is available, THEN THE Scoring_Companion SHALL display a manual entry option (V1 Requirement 9.1) and SHALL process no camera frame. [EC 3]
14. WHEN V2-M8 integration exists, THE V2_Programme SHALL verify, on at least one real phone, the end-to-end flow of a camera capture of four cards, identification of the correct group, confirmation of all Guesses and display of the score. It SHALL record the number of repetitions and the success definition in a Pre-registration before the run. The PR #18 condition that the flow is repeatable stays `proposed, pending owner approval (O-4)`. [EC 4]

---

### Requirement 18: Evidence, Provenance and Reporting

**User Story:** As the project owner, I want every result labelled with its evidence class and its producer, so that no claim exceeds its evidence and no work is credited to the wrong tool.

#### Acceptance Criteria

1. THE Result_Record SHALL carry exactly one Evidence_Class label for each reported result. [EC 1]
2. THE V2 documents SHALL NOT combine results of different Evidence_Classes into one reported rate, count or claim. [EC 1]
3. THE Result_Record SHALL contain the command, the commit ID, the environment (operating system, runtime and tool versions), the seed, the sample identifiers and the producer (Kiro, Codex, ChatGPT or human) of the result. [EC 1]
4. IF no producer is recorded in the evidence of a result, THEN THE Result_Record SHALL state "unattributed" in its producer field. [EC 1]
5. THE Result_Record SHALL list each failed item and each unrun item by identifier, separately from passed items. [EC 1]
6. IF an item has no Result_Record whose evidence was produced independently of the artifact under test, THEN THE V2_Programme SHALL NOT make a completion claim for that item. [EC 1]
7. WHEN a statement is written in a V2 document, THE V2_Programme SHALL label it as owner goal, approved V1 specification, PR #18 proposal or AI-derived hypothesis. [EC 1]
8. WHILE no Result_Record supports a stronger status for a V2 item, THE V2 documents SHALL describe that item as planned or proposed. [EC 1]
9. WHEN the command in a Result_Record of Evidence_Class 2 is re-run with the same commit, seed and environment, THE re-run SHALL reproduce the counts stated in that Result_Record. [EC 2]
10. THE V2_Programme SHALL NOT infer the producer of a result from a task checkbox or from a CI pass. [EC 1]
11. IF two labelled statements in V2 documents conflict, THEN THE V2_Programme SHALL apply the statement from the higher source in the ordering of the Introduction and SHALL mark the other statement as overridden. [EC 1]
12. IF a re-run under criterion 9 yields different counts, THEN THE V2_Programme SHALL record the difference as a failed item in a new Result_Record. [EC 2]

---

### Requirement 19: Milestone Gating and Process

**User Story:** As the project owner, I want ordered milestones with go/no-go Gates and my explicit authorization, so that no work starts on an unverified or unauthorized base.

#### Acceptance Criteria

1. THE V2_Programme SHALL execute the milestones in the order V2-M1 to V2-M8, except for a return or skip required by a route under criterion 4, and each milestone SHALL end with the Gate defined in `design.md`. [EC 1]
2. IF no Result_Record of a Gate decision exists for a milestone with a Go_No_Go_Outcome that `design.md` maps to continuing, THEN THE V2_Programme SHALL NOT start the next milestone. The outcomes that continue are: "go" at Gates 1, 3, 4 and 6 and "decided" at Gate 5, each as drawn in the gate diagram; and, at Gate 2 (V2-M2), GO, GO-WITH-REDESIGN, and NO-GO for decoration (which continues to V2-M3 with V2-M5 skipped). NO-GO for square appearance does not continue. A "go" at Gate 7 continues to V2-M8 only when the owner has separately approved V2-M8 (criterion 3 and Requirement 17.1). Gate 8 has no next milestone (criterion 15). [EC 1]
3. THE V2_Programme SHALL NOT start work on a milestone until a record exists, dated before that work, of a written owner statement that names that milestone and authorizes it. [EC 1]
4. WHEN a no-go Gate decision is recorded (a NO-GO Go_No_Go_Outcome at Gate 2, or a no-go at any other Gate), THE V2_Programme SHALL record which route of the gate diagram of `design.md` was taken (stop, return to an earlier milestone, keep V1, skip V2-M5, or, at Gate 7, the route that the Failure_Attribution_Record of Requirement 16.16 names), and SHALL start no milestone other than the one that route names. [EC 1]
5. WHEN implementation tasks are created for this spec, THE V2_Programme SHALL create every task in the unchecked state in the task list. [EC 1]
6. THE V2_Programme SHALL NOT mark a task complete unless a Result_Record that names that task and carries an Evidence_Class exists. [EC 1]
7. THE V2 planning documents SHALL NOT modify any approved spec, steering file, hook, other document or completed task history that existed before V2 planning began, so that a before/after comparison of those items shows no change. [EC 1]
8. THE V2_Programme SHALL NOT cite the steering or hooks of PR #17 as a source, precondition or rule in any V2 document, task or Result_Record. [EC 1]
9. THE repository automation SHALL NOT commit V2 results or artwork unless the owner has confirmed that specific commit. [EC 1]
10. THE V2 documents SHALL contain no scoring value and no draw-rule statement, SHALL NOT depend on them, and SHALL define Hidden_Sum only as the sum of four Card_Value (design conflict C8). [EC 1]
11. WHEN a Gate decision is made, THE V2_Programme SHALL store a Result_Record that names the milestone and exactly one decision value: for V2-M2, one Go_No_Go_Outcome value; for V2-M5, keep, simplify or remove (Requirement 13.10); for every other milestone, go or no-go as drawn in the gate diagram. [EC 1]
12. WHEN a restated V2 goal is received, THE V2_Programme SHALL record, before acting on it, a comparison against this spec that lists each conflict found or states that none was found (design conflict C9). [EC 1]
13. WHEN a route returns to an earlier milestone, THE V2_Programme SHALL treat every later Gate decision that depends on a changed artifact (format, geometry parameters, decoration or decision policy) as superseded and SHALL re-pass those Gates with new Result_Records. The superseded Result_Records SHALL be kept, marked superseded and never deleted, and the failed frames and trials of earlier rounds SHALL remain in the record. THE V2_Programme SHALL re-run the V1 regression gates of Requirement 1.7 at every re-entered Gate, SHALL treat physical captures taken after a change as new independent captures, and SHALL require for each re-entry an explicit owner authorization that names the milestone (criterion 3). [EC 1]
14. WHEN a Gate 7 go is recorded and no separate owner approval of V2-M8 exists, THE V2_Programme SHALL end V2 at Gate 7 and SHALL record the status "validated for print, integration not approved". [EC 1]
15. WHEN a Gate 8 go is recorded, THE V2_Programme SHALL end the programme. IF a Gate 8 no-go is recorded, THEN THE V2_Programme SHALL return to the V2-M8 tasks or stop by owner decision, and SHALL keep the Gate 7 decision valid unless a V2 artifact changed, in which case criterion 13 applies. [EC 1]

---

### Requirement 20: Open Decisions, Risks and Scope Boundaries

**User Story:** As the project owner, I want every open decision and risk traceable and the out-of-scope claims stated, so that no milestone proceeds on an assumption.

#### Acceptance Criteria

1. WHEN an Open_Owner_Decision blocks a milestone, THE V2_Programme SHALL add an entry to the register of criterion 2 that names the decision ID and the blocked milestone, using the class and needed-by gate of Appendix E. THE V2_Programme SHALL NOT proceed on an assumption, meaning that no Gate record for that milestone may rely on an answer that is not written in that entry. [EC 1]
2. THE V2_Programme SHALL keep a register that maps each of O-1 to O-9 and RK-1 to RK-20 to the requirement that handles it (Appendix B), and that gives the class and needed-by gate of each of O-1 to O-9 and of each open point OP-* (Appendix E). [EC 1]
3. WHEN a contradiction between two sources is found, THE V2_Programme SHALL add an entry to the design's contradiction list that cites both sources and quotes the conflicting statements. THE V2_Programme SHALL NOT mark the entry resolved, or edit either source to remove the conflict, unless the entry also records who resolved it and on what basis. [EC 1]
4. THE V2 documentation SHALL contain a statement that the Assembled_Square is not an ISO 18004 QR code and that no standard QR scanner is required to read it. [EC 1]
5. THE V2 documentation SHALL contain a statement that V2 is not cryptographic secrecy and that printed ranks and suits remain visible. [EC 1]
6. THE V2_Programme SHALL NOT state real-camera or real-print performance in any Result_Record, report or Gate record on the basis of a result whose Evidence_Class is 1, 2 or 3. [EC 1]
7. THE V2_Programme SHALL NOT include in any V2 plan or milestone deliverable a change to the game rules, the scoring values, the draw rule, the AI, the V1 Fragment_Layout or the frozen V1 codebook, as compared with the Baseline_V1 pinned in V2-M1. [EC 1]
8. THE requirements, design and tasks phases of this spec SHALL add or change only specification documents. They SHALL NOT add or change any code, test, script, asset or configuration file, except the Kiro-managed spec metadata file `.config.kiro` of this spec, which is required for the specification to work and carries no project configuration. [EC 1]
9. WHEN a risk occurs or its mitigation is executed, THE V2_Programme SHALL record in the register of criterion 2 the risk ID, what occurred or was executed, and the status of the mitigation. [EC 1]
10. IF an item of O-1 to O-9 or RK-1 to RK-20 maps to no requirement, THEN THE V2_Programme SHALL mark that item "unmapped" in the register and SHALL NOT describe the register as complete. [EC 1]

---

## Appendix A: Traceability of Owner Goals and PR #18 Requirements

### Owner goals (authoritative)

| Goal | Statement (short) | Requirements |
|---|---|---|
| G1 | Four fragments assemble into one continuous square | 2, 3, 4, 5, 7, 16 |
| G2 | Central_Void is the only intended empty area | 3, 4, 7 |
| G3 | Success only when all four valid fragments are present (result policy, not secrecy) | 8, 9, 10, 11, 14, 17 |
| G4 | 52 cards, no Joker card, rotations and Fragment_Layout preserved | 2, 5, 6 |
| G5 | Optional Joker decoration inside the assembled marker, simplified or removed if harmful | 12, 13 |
| G6 | Verification of geometry, arrangement, optical reliability, wrong acceptance, decoration interference | 2, 3, 9, 10, 11, 13, 14, 16, 18 |
| G7 | V1 preserved until V2 is independently validated | 1, 6, 19, 20 |

### PR #18 draft requirements (proposals, not approved)

| PR #18 | Meaning | Requirements |
|---|---|---|
| R01 | Square appearance | 4 (criteria 4.1 to 4.9) |
| R02 | Central_Void only | 3.3, 4.1, 4.2, 7.4, 7.5 |
| R03 | No success for 1 to 3 pieces | 8.2, 8.3, 8.4, 8.5, 8.12, 10.11, 10.13 |
| R04 | Illegal arrangements rejected | 10.1, 10.2, 10.3, 10.10, 10.12 |
| R05 | Exact identity and sum for valid codes | 9.2, 9.3, 9.7, 9.8 |
| R06 | Visual indistinguishability of markers (proposal, NOT security) | 15 |
| R07 | Optional Joker inside the marker with A/B and removal | 12, 13 |
| R08 | Consistency with 52 cards, suit corners, rotations, double-sided behavior | 5 |
| R09 | Only the central four cards are read (targetRegion) | 10.4, 10.5, 10.7, 17.7 |
| R10 | Web camera with manual fallback | 17.3, 17.4, 17.5, 17.6, 17.13, 17.14 |
| R11 | No identity or sum disclosure before all Guesses are confirmed | 17.8, 17.9 |

PR #18 R01 to R11 are proposals. Where this document keeps them, they are traced above, and numeric values from PR #18 stay `proposed, pending owner approval (O-4)`.

## Appendix B: Traceability of Conflicts, Risks and Open Decisions

| Item | Handled by |
|---|---|
| C1 | 4.5, 11.7 |
| C2 | 8.6, 8.7 |
| C3 | 6.3 |
| C4 | 5.5 |
| C5 | 6.6, 17.1, 17.2, 17.12 |
| C6 | 1.5, 1.6, 1.12 |
| C7 | 1.1 |
| C8 | 19.10 |
| C9 | 19.8, 19.12 |
| C10 | 7.8, 12.1, 12.11 |
| C11 | 3.6 |
| RK-1 | 2.6, 2.8, 2.12 |
| RK-2 | 2.7, 12.8, 12.10 |
| RK-3 | 4.6, 16.5 |
| RK-4 | 4.5 |
| RK-5 | 8.6, 8.11, 8.14 |
| RK-6 | 13.5, 9.5 |
| RK-7 | 16.7, 16.13, 16.14, 16.17 |
| RK-8 | 6.7, 17.3 |
| RK-9 | 14.10, 16.1, 16.9 |
| RK-10 | 1.2, 1.10, 1.12 |
| RK-11 | 1.1, 1.2 |
| RK-12 | 19.10 |
| RK-13 | 19.8, 19.12 |
| RK-14 | 1.8, 1.11 |
| RK-15 | 3.4, 12.9 |
| RK-16 | 3.3, 7.5 |
| RK-17 | 5.7, 16.6 |
| RK-18 | 3.2, 10.6, 10.10 |
| RK-19 | 5.12, 8.10, 15.5, 15.8, 20.5 |
| RK-20 | 18.3, 18.4, 18.10 |
| O-1 | 1.2 |
| O-2 | 1.2, 1.10, 1.12 |
| O-3 | 2.11 |
| O-4 | 15.3, 16.1, 16.2, 16.16, 17.14 |
| O-5 | 12.8, 12.10 |
| O-6 | 8.11, 8.14 |
| O-7 | 12.11 |
| O-8 | 3.6 |
| O-9 | 6.4 |

Generic rule for any Open_Owner_Decision: 20.1. Register rules: 20.2 (register), 20.9 (risk events), 20.10 (unmapped items).

Process rules added in the final consistency review that carry no C, RK or O identifier: Gate 7 failure attribution and routes 16.16, 19.4; revalidation after a return to an earlier milestone 19.13; end states of Gate 7 and Gate 8 19.14, 19.15; Gate 1 record requirements 1.2, 1.12 (also traced under O-1, O-2 above); the `.config.kiro` exception 20.8; real-phone end-to-end check 17.14 (also traced under O-4 above); decoration modes after a Gate 5 decision: V2-M6 14.13, V2-M7 16.17.

### Cross-reference of open points (OP) to O-1 to O-9

The open points `OP-<requirement>.<n>` are listed in Appendix D. This cross-reference creates no new O-number. "Related" means the open point concerns the same subject as the existing owner decision. The open point stays a question until the owner or a later design step decides it.

| Existing item | Related open points |
|---|---|
| O-3 (redesign or frame-only) | OP-2.1, OP-2.2, OP-2.6, OP-12.4, OP-13.6 |
| O-4 (PR #18 thresholds) | OP-15.5, OP-16.1, OP-16.5 |
| O-5 (rights and publication) | OP-12.5 |
| O-6 (INCOMPLETE_GROUP hint) | OP-8.6, OP-8.7, OP-8.8 |
| O-8 (S and card-face area) | OP-3.1, OP-3.5, OP-3.8, OP-4.6 |
| O-9 (retirement or coexistence) | OP-6.4, OP-6.5 |
| C4 (not an O-number) | OP-5.5 |

Open points that need an owner decision or owner approval and have no related O-1 to O-9 item (candidates for a later register entry under Requirement 20.1; no O-number is assigned here): OP-1.1, OP-2.4, OP-3.1 (who sets the value grids), OP-4.2, OP-6.7, OP-8.3, OP-9.3, OP-14.1, OP-17.1, OP-17.5, OP-17.7. The final consistency review classified these points in Appendix E: OP-2.4, OP-3.1, OP-4.2, OP-8.3, OP-9.3 and OP-14.1 are class B (technical, recorded as `proposed, pending owner approval` where the requirements say so), OP-1.1 is class C, and OP-6.7, OP-17.1, OP-17.5 and OP-17.7 are class C (V2-M8). Appendix E supersedes this list.

## Appendix C: Traceability of Correctness Properties

| Property (design.md) | Criteria |
|---|---|
| 1 Atomicity | 8.2, 9.2 |
| 2 Subset rejection | 8.3, 8.4, 8.12, 10.11 |
| 3 Placement equivalence | 2.1, 2.3, 2.5, 2.12, 4.3, 4.7, 4.9, 5.4, 7.6 |
| 4 Identity correctness | 9.7, 9.8 |
| 5 Decoration non-interference | 12.2, 13.5 |
| 6 V1 preservation | 1.3, 1.4, 1.7, 1.9 |
| 7 Boundary | 6.5, 6.6, 6.7 |
| 8 Determinism | 7.1, 7.2 |
| 9 Flip equivalence | 5.7, 5.8 |
| 10 Metric partition | 9.4, 9.5, 9.10, 9.11 |
| 11 Void respect | 3.5, 7.4, 7.5 |
| 12 Target safety | 10.7, 10.9 |

---

## Appendix D: Open Points and Review Notes from the Refinement Pass

This appendix records what the QA refinement pass left open. Entries are not decisions and do not change any criterion. `OP-<requirement>.<n>` is an open point, phrased as a question for the owner or for a later design decision. `RV-<requirement>.<n>` is a review note about a risk in the refined text. Open points that relate to O-1 to O-9 are cross-referenced in Appendix B. No new O-number is created. Provenance of all entries: AI-derived refinement review (hypothesis, not owner-approved).

### D.1 Integration notes of the refinement pass

1. **PR range (Requirement 1.8).** The refinement text named an inclusive range of PRs. This document instead lists each PR of the repository-state table in `design.md` (#12, #13, #14, #15, #17, #18, #21, #22; #16 is an issue, not a PR). The 2026-11-19 states stay labelled as inferred from refs and commit history, not read from the GitHub API. The statement that #16 is an issue was supplied by the owner's instruction and is not in `design.md`.
2. **Gate 1 and O-2 (Requirement 1.2 and 1.10). RESOLVED by the final consistency review (see item 16).** The gate diagram in `design.md` requires owner decisions O-1 and O-2 to be recorded at Gate 1. The refinement text of Requirement 1.2 blocked V2-M2 on O-1 only, and Requirement 1.10 records O-2 when decided. The question was whether Requirement 1.2 should also name O-2 as blocking. Decision applied in the review: Requirement 1.2 now blocks V2-M2 on the dated O-1 record, the dated O-2 record and the dated Gate 1 decision `go`, and Requirement 1.12 adds the "finish V1 first" condition. Requirement 1.10 is kept.
3. **Containment reference (Requirement 5.10).** The refinement cited V1 Requirement 15.3. V1 Requirement 15.3 is the containment condition (confirmed in `.kiro/specs/qroker-game/requirements.md`). The previous text cited V2 Requirement 3.5, which is the V2 evaluation of that condition. Both are kept: the criterion cites V1 15.3 and names 3.5 as the V2 check, and Appendix C still traces 3.5 to Property 11.
4. **Owner-approved V1 changes (Requirement 6.10).** The refinement allowed V1 files to differ from the Baseline_V1 "except for changes the owner approves in a recorded decision". That exception conflicts with owner goal G7, with `design.md` ("No change to V1 code, ..."), and with Requirements 1.4 and 20.7. It was NOT adopted.
5. **Keep_Out_Mask (glossary, Requirement 7.8, 12.1).** The glossary said the Assembled_Square excludes the quiet zone while the Keep_Out_Mask is a region of the Assembled_Square that includes the quiet zone. The glossary entry now defines the mask over the Assembled_Square plus its quiet zone. This is a wording fix for consistency. Whether the Central_Void lies inside the Keep_Out_Mask stays open (OP-12.2).
6. **Joker SVG (Requirement 12.7).** The refinement forbade using the SVG "as artwork with the Central_Void applied", which contradicts Requirement 2.7 (the SVG is rasterized with the Central_Void mask for the symmetry test). Criterion 12.7 now allows the SVG as the test subject of Requirement 2.7 and forbids its use as an operational optical code, as a Valid_Input and as an Oracle entry. The refinement's ban on use in "any Result_Record" was dropped, because the Requirement 2.7 test result is a Result_Record.
7. **Decision values at Gates (Requirement 19.2, 19.4, 19.11).** The refinement spoke of a Go_No_Go_Outcome at every Gate. The glossary and `design.md` define Go_No_Go_Outcome only for the V2-M2 Gate. The criteria now apply a Go_No_Go_Outcome at Gate 2, "go" or "no-go" at the other Gates as in the gate diagram, and keep, simplify or remove at Gate 5. Criterion 19.2 now states which outcomes continue, following the gate diagram: at Gate 2, GO, GO-WITH-REDESIGN and NO-GO for decoration continue to V2-M3, and NO-GO for square appearance stops.
8. **Negative-suite S and quiet zone (Requirement 10.10).** The refinement pointed at Requirement 3.2. Requirement 3.2 derives an upper bound and does not choose S. The criterion now points at the parameter study of Requirements 3.1 and 3.2 and notes that the selection itself is open (OP-3.8).
9. **Tasks phase (Requirement 20.8).** Extended to "requirements, design and tasks phases", as instructed.
10. **Label of Requirement 15.4.** Kept `[EC 4]`, the label of the existing criterion.
11. **Pre-registration content (Requirement 11.1).** The refinement lists "metrics" and "the decision rule" in addition to the items of the glossary definition and of `design.md` ("Statistical caution"). This is a superset, so it was adopted. The glossary definition was not changed.
12. **New criteria numbering.** Added criteria were appended at the end of each list and numbered contiguously. In Requirement 19 the added criteria are 11 and 12 and follow the unchanged criterion 10. Criteria the refinement did not mention are unchanged: 8.4, 9.3, 10.5, 12.6, 13.7, 13.8, 14.6, 16.5, 16.6, 16.8, 16.10, 16.11, 17.7, 17.10, 18.3 and 19.10.
13. **Glossary addition.** An `OfficialResult` entry was added because Requirements 6.2, 8 and 9 use the term and the refinement noted its absence (OP-8.4, OP-9.10). The entry states only what the criteria already say.
14. **Requirement 8.2 wording.** "Absent, not present with a null, empty or placeholder value" is consistent with `design.md` ("absent when kind is not IDENTIFIED"). See RV-8.1.
15. **Refinement 4.3 and 4.4 versus Requirement 2.5.** Requirement 4.3 and 4.4 use the tolerance "fixed in V2-M2". Requirement 2.5 records that tolerance in a Pre-registration made before the symmetry run, and Requirement 4.9 records the metric and value. Numbers remain `proposed, pending owner approval` until the owner approves them. No threshold was invented.

Items 16 to 37 were added by the final consistency review (planning-only; criterion numbers were kept stable and new criteria were appended at the end of their requirement). Each is marked `Resolved in the final consistency review` unless stated otherwise.

16. **O-1, O-2 and V2-M2 entry (Requirements 1.2, 1.12; `design.md` gate diagram and V2-M1 gate criteria, risk and owner-decision tables). Resolved in the final consistency review.** V2-M2 now needs three dated records: the O-1 decision, the O-2 decision and the Gate 1 `go`. New criterion 1.12 adds the condition that a "finish V1 first" decision blocks V2-M2 until the named V1 tasks have Result_Records or the owner records a changed O-2 decision. Requirement 1.10 is kept. Appendix B now traces O-2, C6 and RK-10 to 1.2, 1.10 and 1.12. This resolves item 2.
17. **Gate 7 failure, Gate 8 and revalidation (Requirements 16.16, 19.2, 19.4, 19.13, 19.14, 19.15; `design.md` gate diagram, Gate 7 routing table, revalidation and end-state subsections). Resolved in the final consistency review.** The old edge "Gate 7 no-go to V2-M5" was wrong when V2-M5 was skipped and for causes other than decoration. A Gate 7 no-go now needs a Failure_Attribution_Record with one primary cause class, with five routes. Gate 7 `go` leads to V2-M8 only with separate owner approval, otherwise V2 ends as `validated for print, integration not approved`. Gate 8 has `go` (end of programme) and `no-go` (return to V2-M8 tasks or stop) edges and does not invalidate the Gate 7 validation unless a V2 artifact changed. Requirement 19.13 is the general revalidation rule.
18. **V2-M5 skipped and the V1 arm (Requirement 14.9, OP-14.5). Resolved in the final consistency review.** The skip limits only the V2 decoration arms. The Baseline_V1 arm of 14.8 still runs on the same identifiers and seeds. The `design.md` sentence under the gate diagram says the same.
19. **Square appearance before the renderer exists (Requirements 4.7, 7.6, 4.9; `design.md` outcome table). Resolved in the final consistency review.** Requirement 4.7 produced the Gate 2 outcome from rasters, but the Square_Renderer exists only from V2-M3. Requirement 4.7 is now a V2-M2 model-level check of the Feasibility_Computation with label `[EC 1]` (it was `[EC 2]`). A later renderer mismatch (Requirement 7.6) is a Gate 3 no-go that returns to V2-M2 and is not a retroactive Gate 2 outcome. Requirement 4.9 changed from `[EC 2]` to `[EC 1]` because it records the metric and tolerance in a Pre-registration before any raster exists. Appendix C traces 4.7 to Property 3.
20. **Real-device criterion for V2-M8 (Requirement 17.14). Resolved in the final consistency review.** The V2-M8 completion condition of PR #18 (real four-card phone capture, correct group, all Guesses, score, repeatable) had no criterion. Criterion 17.14 `[EC 4]` requires a Pre-registration of repetitions and success definition and keeps "repeatable" as `proposed, pending owner approval (O-4)`. No number was invented. The wording of task 8.6 in `tasks.md` ("No Requirement 17 criterion carries EC 4") is stale after this change and belongs to the later tasks revision.
21. **`.config.kiro` and Requirement 20.8. Resolved in the final consistency review.** Requirement 20.8 forbade any configuration file. The Kiro-managed metadata file of this spec is required and carries no project configuration, so criterion 20.8 now names it as the exception. `design.md` states this in its provenance notes.
22. **Names and routes (systematic pass, item i). Resolved in the final consistency review.** The design used "NO-GO for V2 square appearance", "NO-GO decoration" and "NO-GO square appearance" for one Go_No_Go_Outcome. All places now use the glossary names "NO-GO for square appearance" and "NO-GO for decoration". The Gate 8 box text no longer says "separate owner approval", which belongs to the Gate 7 to V2-M8 edge. Requirement 19.2, the gate diagram and the milestone table now agree for Gates 1 to 8.
23. **Criteria that need a later artifact (systematic pass, item ii).** Requirement 4.7 was the clear case (item 19). Four others were recorded as review notes and not decided: RV-2.1, RV-7.1, RV-10.3, RV-17.3. RV-7.1, RV-10.3 and RV-17.3 were resolved in the follow-up pass (items 34, 33 and 32).
24. **Evidence-class labels (systematic pass, item iii). Resolved in the final consistency review.** Labels were checked against the evidence-class table of `design.md`. Only 4.7 and 4.9 contradicted it (item 19). Other mixed cases were noted in RV-16.1 and RV-10.3 (both resolved in the follow-up pass, items 31 and 33).
25. **Glossary (systematic pass, item iv). Resolved in the final consistency review.** The glossary now defines Outcome_Class (CORRECT, REJECTED, WRONG_ACCEPT_VALID, WRONG_ACCEPT_NEGATIVE, by reference to `design.md`) and Failure_Attribution_Record. The Introduction no longer calls `design.md` "approved-for-planning", which contradicted the status banner. The stale statement in `design.md` that tasks are written later was updated. Terms still undefined are recorded in RV-3.1 and in OP-7.3, OP-18.6.
26. **Numbers from PR #18 or invented thresholds (systematic pass, item v).** All PR #18 numbers found (95% in 100 shots, zero observed wrong acceptance, 5 seconds, PR #18 "repeatable") carry `proposed, pending owner approval (O-4)` in Requirements 15.3, 16.1 and 17.14 and in `design.md`. The rotation values of Requirement 14.1 have no stated source and are recorded in RV-14.2. No number was added by the review.
27. **Property Validates lines and design tables (systematic pass, items vi and vii). Resolved in the final consistency review.** Every `**Validates:**` criterion exists. Property 3 now also cites 4.7. The text of Property 9 covered only the vertical-axis flip while it cites 5.8 (top-bottom flip), so the top-bottom statement was added. The risk and owner-decision tables of `design.md` agree with Appendix B for all of RK-1 to RK-20 and O-1 to O-9, apart from the additions of items 16 and 20. The Gate 5 decision "remove" had no stated V2-M6 arm rule (RV-14.3, resolved in the follow-up pass by Requirement 14.13, item 30).
28. **Open points classified (Appendix E). Resolved in the final consistency review.** Appendix E classifies all 140 open points, reduces the owner-decision list to a prioritized table and marks as `closed by this review` the points answered by these edits (OP-7.4, OP-12.2, OP-13.6, OP-14.5, OP-17.4, OP-19.1, OP-19.6). Appendix B no longer treats the list of owner-decision candidates as current.
29. **Independence from unmerged game-branch changes (`design.md`, new subsection after the repository-state table). Resolved in the final consistency review.** The subsection records that the working branch contains PR #13's unmerged scoring, that the V2 files use none of it, how that is verified (Requirements 19.10 and 20.7) and, as a NOTE and not a requirement, that a branch based on `origin/main` is the neutral place to commit. The repository facts dated 2026-11-19 are unchanged.
30. **Arms after a Gate 5 decision (Requirement 14.13, RV-14.3). RESOLVED in the final consistency review (follow-up pass).** New last criterion 14.13 `[EC 2]`: when V2-M5 ran, V2-M6 and V2-M7 use exactly the Decoration_Modes the Gate 5 record names (`keep`: OFF plus the kept mode(s); `simplify`: OFF plus SIMPLIFIED; `remove`: OFF only). The Baseline_V1 arm of 14.8 runs in every case, and the Result_Record cites the Gate 5 decision applied. Criterion 14.9 is unchanged and still covers the skip of V2-M5. The sentence after the gate diagram in `design.md` states the same. The V2-M7 part of this criterion was moved to Requirement 16.17 by item 37, so 14.13 now covers V2-M6 only.
31. **Flip and show-through tests without a Decoration_Layer (Requirements 16.6, 16.7, RV-16.1). RESOLVED in the final consistency review (follow-up pass).** Both criteria include the Decoration_Layer WHERE one exists in the printed mode (Gate 5 `keep` or `simplify`). Otherwise (V2-M5 skipped or Gate 5 `remove`) the same tests run on the optical layer with Decoration_Mode OFF. The V1 Requirement 16.10 trace in 16.7 and the V1 Requirement 16.5 trace in 16.6 are kept. Labels stay `[EC 4]`.
32. **Browser readiness and V2-M8 (Requirement 17.3, RV-17.3). RESOLVED in the final consistency review (follow-up pass).** Criterion 17.3 now applies WHEN V2-M8 is approved, so it no longer conflicts with 17.1. The criterion notes that Requirement 6.7 forbids, independent of V2-M8, V2 production imports of V1 modules that read the codebook with `node:fs`. Label stays `[EC 3]`.
33. **Scoring_Companion criteria before V2-M8 (Requirements 10.7, 10.8, 10.9, RV-10.3). RESOLVED in the final consistency review (follow-up pass).** Each of the three criteria now states that before V2-M8 it is verified on the `verifyTargetVertex` function of `design.md` and on the Official_Scanner results (EC 2), and that the Scoring_Companion behaviour itself is verified in V2-M8 under Requirement 17.7 (EC 3). The meaning of the criteria is unchanged.
34. **Keep_Out_Mask computed twice (Requirement 7.8, RV-7.1). RESOLVED in the final consistency review (follow-up pass).** Criterion 7.8 (same criterion, label `[EC 2]`) now requires the mask computed by the Square_Renderer to equal the mask recorded in the V2-M2 Result_Record for the same parameters. A difference is a Gate 3 no-go that returns to V2-M2, as for 7.6, and is not a retroactive Gate 2 outcome.
35. **Not decided in the follow-up pass.** (a) Requirement 17.7 cites 10.7 and 10.9 only, so the clause added to 10.8 points at 17.7 as instructed while no Requirement 17 criterion states the 10.8 behaviour in the Scoring_Companion. `RESOLVED in the final consistency review (1c)`, see item 36. (b) No V2-M2 criterion states in so many words that the V2-M2 Result_Record contains the Keep_Out_Mask itself (Requirement 12.1 speaks of "the Keep_Out_Mask computed in V2-M2"). `RESOLVED in the final consistency review (1c)`, see item 36. (c) Criterion 14.13 carries `[EC 2]` as instructed, although its V2-M7 part is checked from the Result_Records of V2-M7. All three are recorded; points (a) and (b) are resolved by item 36. Point (c) `RESOLVED in the final consistency review (1d)`, see item 37.
36. **Requirement 17.7 and Requirement 12.1 (item 35 points (a) and (b)). RESOLVED in the final consistency review (1c).** (a) Criterion 17.7 now cites Requirements 10.7 to 10.9 (it cited 10.7 and 10.9) and adds one clause: the Scoring_Companion stores for the Target_Group exactly the card IDs the Official_Scanner decoded (V1 Requirements 9.11 and 13.9). The clause added to 10.8 ("verified in V2-M8 under Requirement 17.7") therefore resolves. Label stays `[EC 3]`. (b) Criterion 12.1 now also states that the Feasibility_Computation records the Keep_Out_Mask computed in V2-M2 in the V2-M2 Result_Record, which gives the equality check of Requirement 7.8 a recorded reference. The other content of 12.1 and its label `[EC 1]` are unchanged. No criterion was added, no number changed, and Appendices A, B and C needed no change because no trace changed. Note: `tasks.md` lists Requirements 10.7, 10.9, 17.7, 17.8, 17.9 and 17.11 for task 8.4 and was not edited in this pass.
37. **Decoration modes of V2-M6 and V2-M7 split by evidence class (Requirements 14.13 and 16.17, item 35 point (c)). RESOLVED in the final consistency review (1d).** Criterion 14.13 carried `[EC 2]` but also governed V2-M7, whose evidence is Evidence_Class 4. 14.13 now covers V2-M6 only (synthetic, `[EC 2]`) and keeps the Baseline_V1 arm in every case. New last criterion 16.17 `[EC 4]` states the V2-M7 part: when V2-M5 ran, only the Decoration_Modes the Gate 5 record names are printed and captured, each capture session's Result_Record cites the Gate 5 decision applied, and when V2-M5 was skipped V2-M7 uses Decoration_Mode OFF only. Criteria 16.6 and 16.7 are unchanged. The sentence after the gate diagram in `design.md` cites 14.13 for V2-M6 and 16.17 for V2-M7. Appendix B traces 16.17 under RK-7 and in the process-rule sentence. Criterion numbers stayed stable. Note: `tasks.md` cites 14.13 for V2-M7 work and was not edited in this pass.

### D.2 Open points and review notes per requirement

**Requirement 1**
- OP-1.1 Where are the load-sensitive tests of the pinned baseline listed? Criterion 7 permits "load-sensitive tests not determined".
- OP-1.2 Which state is recorded for a PR that was closed without merge? Criterion 8 records any other observed state as observed.
- OP-1.3 Is criterion 9 (failed V1 regression result) the intended consequence? It is the refinement agent's inference. Please confirm.
- RV-1.1 The label `[EC 1]` for criteria 1 to 6 and 8 to 11 holds under assumption A-1 only.

**Requirement 2**
- OP-2.1 What is the decision rule that maps the V2-M2 report to GO, GO-WITH-REDESIGN or a NO-GO outcome? (Owner decision, to be fixed in the Pre-registration.)
- OP-2.2 What outcome applies when both NO-GO conditions hold at once?
- OP-2.3 What does "confirmed HYP-1" mean (which report fields, which verdicts)?
- OP-2.4 Which pixel-difference metric, raster resolution, local-deviation window and tolerance values apply? (Values are pending owner approval.)
- OP-2.5 What does the check against the owner's original picture compare?
- OP-2.6 What happens after a failing Piece verdict (criterion 4) or a failing Joker check (criterion 7)?
- OP-2.7 Which documents does criterion 6 cover?
- RV-2.1 Criterion 7 needs the supplied Joker artwork, which is on the PR #18 branch and not on this branch, and storing it needs the rights record of Requirement 12.8. The check can run on a local untracked copy. Not decided here.

**Requirement 3**
- OP-3.1 What are the value grids for S, quiet zone, Central_Void and minimum feature size, and who sets them?
- OP-3.2 How is "feature size" defined?
- OP-3.3 How is "varying the Central_Void" parameterised?
- OP-3.4 How many quiet zones enter the bound of criterion 2, and is the comparison inclusive? (The refinement assumed "less than or equal".)
- OP-3.5 What are the unit and reference edge of the containment margin, and what is the numeric Printable_Area?
- OP-3.6 What is the containment check when the Corner_Radius is 0?
- OP-3.7 Are Corner_Radius values below 3.175 mm part of the value set?
- OP-3.8 Who chooses the final S and Corner_Radius, and at which Gate?
- RV-3.1 The terms quiet zone, seam gap, module and detection-critical frame element are used without glossary entries (see OP-4.6, OP-4.7, OP-7.3). The V1 glossary does not define them either. Not defined here.

**Requirement 4**
- OP-4.1 What is "nominal geometry"?
- OP-4.2 Which difference metric and tolerance value does V2-M2 fix? (Pending owner approval.)
- OP-4.3 Does criterion 4 use the same tolerance as criterion 3?
- OP-4.4 Is "exceeds tolerance" measured pairwise or against one reference class?
- OP-4.5 What outcome applies when the tolerance is exceeded only with decoration on (a separate NO-GO for decoration)?
- OP-4.6 What are the size and unit of the quiet-zone rule?
- OP-4.7 How is the "visible gap" defined?
- OP-4.8 Which seam gap and offset values are tested?

**Requirement 5**
- OP-5.1 What are "ideal conditions" for criteria 7 and 8?
- OP-5.2 What tolerance defines "equal" in criterion 7?
- OP-5.3 What is the comparison reference for a "valid group" in criterion 4?
- OP-5.4 Does "one raster per (card, body corner)" (criterion 3) also cover the back layer?
- OP-5.5 Who decides C4? C4 is not among O-1 to O-9.
- OP-5.6 Is the negative control of criterion 9 vacuous when the layer is symmetric?
- OP-5.7 Which documents are "the V2 documentation" (criterion 12)?
- RV-5.1 Criteria 6, 7 and 11 depend on the C4 outcome.

**Requirement 6**
- OP-6.1 Should criterion 1 point at one design.md location? (`design.md` proposes `src/optical-v2/`.)
- OP-6.2 Which files are "V2 artifacts", and what form has the format version identifier?
- OP-6.3 What counts as proof for criterion 3 that a different pattern format is necessary?
- OP-6.4 Where does the compatibility policy document live?
- OP-6.5 Does "not yet decided" for O-9 weaken the intent? Alternative: make an undecided O-9 a Gate blocker.
- OP-6.6 Is "game code" in criterion 5 the same as `src/game`?
- OP-6.7 Where is the owner approval of V2-M8 recorded (criterion 6)?
- OP-6.8 Is the Comparison_Harness V2 production code (criterion 7)?
- OP-6.9 What is the scope of criterion 10 (which V1 result files)?

**Requirement 7**
- OP-7.1 What does "identical" mean (byte, module or raster; shared environment)?
- OP-7.2 What is "nominal geometry" (assumed: zero seam gap and zero placement error)?
- OP-7.3 Which elements are "detection-critical frame elements"?
- OP-7.4 The glossary contradiction on the Keep_Out_Mask was fixed in the glossary (D.1 item 5). Please confirm. CLOSED by the final consistency review: the glossary entry and Requirement 7.8 settle the definition.
- OP-7.5 May the seed or parameters feed the back layer (criterion 7)?
- OP-7.6 Which Go_No_Go_Outcomes allow which Decoration_Modes? GO-WITH-REDESIGN is unclear in criterion 10.
- OP-7.7 Which V1 files are in scope for criterion 9 and 11, and how is a failed gate classed?
- RV-7.1 The Keep_Out_Mask is computed twice: in V2-M2 at model level (Requirement 12.1, design conflict C10) and by the Square_Renderer in V2-M3 (Requirement 7.8). No criterion required the two to be compared. RESOLVED in the final consistency review: Requirement 7.8 now requires the renderer mask to equal the mask recorded in V2-M2, and a difference is a Gate 3 no-go that returns to V2-M2.

**Requirement 8**
- OP-8.1 "Valid Piece" and "valid arrangement" are defined only through Valid_Input. Is a separate definition needed?
- OP-8.2 What does the options list contain, and how are extra options handled?
- OP-8.3 What are the maximum memory use and processing time, and what happens at the limit? (Owner decision.)
- OP-8.4 What is the full OfficialResult field set?
- OP-8.5 Which document holds the statement of criterion 10?
- OP-8.6 Is "O-6 rejected" different from "O-6 undecided" for criteria 11 and 14?
- OP-8.7 May other kinds than INCOMPLETE_GROUP carry hints?
- OP-8.8 Must a Reject for a Proper_Subset_Scene be INCOMPLETE_GROUP? (Requirement 10.11 now says yes.)
- OP-8.9 Which trial counts n apply (criterion 12)?
- OP-8.10 May IDENTIFIED results be logged?
- OP-8.11 Does "`decodeFragment` unchanged" cover its dependencies?
- RV-8.1 "Absent, not null" (criterion 2) is stricter than the source wording of the refinement input. It matches `design.md`.

**Requirement 9**
- OP-9.1 Is a Reject on a Negative_Input classified CORRECT or REJECTED?
- OP-9.2 How is a trial with no result, a failure, or an out-of-set kind classified?
- OP-9.3 What is the denominator of the success rate?
- OP-9.4 Which bound method applies for non-zero counts?
- OP-9.5 Which event types does criterion 8 count?
- OP-9.6 Is independence argued for the trials of criterion 7 and 8?
- OP-9.7 Is `cards` ordered or a set?
- OP-9.8 What is the domain of `reflection`?
- OP-9.9 What is the domain of a card ID?
- OP-9.10 OfficialResult was added to the glossary without a full field set (see OP-8.4).

**Requirement 10**
- OP-10.1 What happens when two complete groups are at equal distance from the frame center?
- OP-10.2 Does a nearer incomplete group block a farther complete one? (V1 rule, kept unchanged.)
- OP-10.3 What is the Target_Region boundary? (Take the V1 definition.)
- OP-10.4 What does "does not match the Target_Group" mean for the reported `vertex`?
- OP-10.5 Which kind does foreign decoration get?
- OP-10.6 Where are "damaged" and "ambiguous" pre-registered?
- OP-10.7 What is the Wrong_Accept rule and the n per negative class?
- OP-10.8 Does criterion 9 require all three options (repositioning, rescan, manual entry)?
- RV-10.1 The mapping from Reject condition to kind is a proposal.
- RV-10.2 Criterion 9 now also triggers on any Reject.
- RV-10.3 Criteria 7 to 9 name the Scoring_Companion, which V2 integrates only in the optional V2-M8, while the criteria carry `[EC 2]` (Node) and Requirement 17.7 repeats the check as `[EC 3]`. Before V2-M8 these criteria can be tested only on the `verifyTargetVertex` function of `design.md`. RESOLVED in the final consistency review: Requirements 10.7 to 10.9 now state that before V2-M8 they are verified on `verifyTargetVertex` and the Official_Scanner results (EC 2), and that the Scoring_Companion behaviour is verified in V2-M8 under Requirement 17.7 (EC 3).

**Requirement 11**
- OP-11.1 Where are the Gate 4 criteria defined? `design.md` Gate 4 reads "atomic invariants and candidate choice", and the V2-M4 row of the deliverables table lists the gate criteria. Should criterion 8 cite them?
- OP-11.2 How is "before" evidenced (timestamps, commit order)?
- OP-11.3 May the Pre-registration be amended, and how?
- OP-11.4 What does the decision rule return on a tie?
- OP-11.5 Which latency method applies?
- OP-11.6 Is Wrong_Accept per system part of the metrics?
- OP-11.7 What effect does a labelled deviation have on the choice?
- OP-11.8 What is the "V2 production export" as an inspectable surface?

**Requirement 12**
- OP-12.1 What are the value and unit of the minimum feature size?
- OP-12.2 Is the Central_Void inside or outside the Keep_Out_Mask? The glossary lists data cells, frame elements and the quiet zone only. CLOSED by the final consistency review: Requirement 7.8 limits the mask to those three regions, so the Central_Void is outside it, and Requirement 7.4 separately forbids any printed module inside the Central_Void.
- OP-12.3 What does "in that form" mean for FRAME_ONLY in criterion 6?
- OP-12.4 What is the consequence of a failing criterion 2 or 5 (NO-GO for decoration)?
- OP-12.5 Is a SIMPLIFIED render a derived trace for criteria 8 and 10?

**Requirement 13**
- OP-13.1 Does criterion 6 apply per condition or to the aggregate?
- OP-13.2 What are the definitions of minimum feature size, environment fields and the p95 method?
- OP-13.3 What does "complete and valid" mean for criterion 9 in the Pre-registration?
- OP-13.4 Is discordance measured against OFF only or between all pairs?
- OP-13.5 Which of remove or simplify applies in criteria 5 to 9?
- OP-13.6 How do keep, simplify and remove map to Go_No_Go_Outcome values? CLOSED by the final consistency review: Go_No_Go_Outcome applies to Gate 2 only. Gate 5 records keep, simplify or remove (Requirements 13.10 and 19.11).
- RV-13.1 Criterion 5 ("at least one") makes a single Wrong_Accept sufficient to remove or simplify.
- RV-13.2 Criterion 10 is stricter than the source.

**Requirement 14**
- OP-14.1 What are the levels, trial counts and seeds per condition?
- OP-14.2 What equivalence rule defines deduplication?
- OP-14.3 Do correctly rejected Negative_Inputs count as CORRECT?
- OP-14.4 Which latency statistic and environment fields apply?
- OP-14.5 Does the Baseline_V1 arm still run when V2-M5 is skipped? Criteria 8 and 9 may conflict. The V1 arm should run in both cases. CLOSED by the final consistency review: Requirement 14.9 now limits only the V2 decoration arms to Decoration_Mode OFF and states that the Baseline_V1 arm of 14.8 still runs.
- OP-14.6 How can the V1 regression gates pass while Baseline_V1 is unevaluated?
- RV-14.1 Criterion 3 blocks GO or GO-WITH-REDESIGN on a failed or unlisted gate. That consequence is an inference.
- RV-14.2 Criterion 1 lists the rotation values 0, 45, 90, 180, 270 and the near-boundary values 44.9 and 45.1 degrees without naming their source in this document, and without the label `proposed, pending owner approval`. They are test conditions and not release thresholds. The Pre-registration should cite their source (for example the V1 45-degree boundary). Not decided here.
- RV-14.3 Criterion 9 covers the skip of V2-M5 caused by a Gate 2 NO-GO for decoration. No criterion stated the V2-M6 arms after a Gate 5 decision "remove". RESOLVED in the final consistency review: new criterion 14.13 fixes the decoration modes of V2-M6 for each Gate 5 decision and keeps the Baseline_V1 arm in every case. The V2-M7 part moved to new criterion 16.17 (D.1 item 37).

**Requirement 15**
- OP-15.1 What is a "correct identification"?
- OP-15.2 Which confidence level applies?
- OP-15.3 Is the test administrator blinded?
- OP-15.4 Which documents are "V2 documentation"?
- OP-15.5 Is a separate owner decision needed beyond O-4?

**Requirement 16**
- OP-16.1 What are a "normal condition" and "end to end" (events and boundaries)?
- OP-16.2 Are REJECTED and CORRECT defined for physical trials (not in the glossary)?
- OP-16.3 How does "wrong card acceptance" map to WRONG_ACCEPT_VALID and WRONG_ACCEPT_NEGATIVE?
- OP-16.4 What is the minimum change that counts as re-framing or re-lighting?
- OP-16.5 What sample sizes apply? (Owner approval of thresholds, O-4.)
- OP-16.6 What equivalence rule applies to the flip comparison?
- OP-16.7 Which physical scenes cover the other Negative_Input kinds?
- RV-16.1 Criteria 6 and 7 name the Decoration_Layer, which does not exist when V2-M5 was skipped or the decoration was removed (Decoration_Mode OFF). What the flip and show-through tests cover in that case was not stated. RESOLVED in the final consistency review: Requirements 16.6 and 16.7 include the Decoration_Layer only where one exists in the printed mode (Gate 5 `keep` or `simplify`) and otherwise run the same tests on the optical layer with Decoration_Mode OFF.

**Requirement 17**
- OP-17.1 Where is the V2-M8 approval recorded?
- OP-17.2 What does "thin" mean for the adapter?
- OP-17.3 Which V2 test frame and which headless browser apply?
- OP-17.4 Do the references cited in criterion 7 resolve (Requirements 10.7 and 10.9)? (Checked in this pass: they do.) CLOSED by the final consistency review: both references were checked again and resolve.
- OP-17.5 When does a Guess count as confirmed?
- OP-17.6 How much Reject detail may be shown before confirmation?
- OP-17.7 Is there a rescan limit?
- OP-17.8 Which document holds the statement of criterion 10?
- RV-17.1 Criterion 6 now requires a recorded traffic capture.
- RV-17.2 Criterion 11 changes "or" to "both" (rescan and manual entry).
- RV-17.3 Criterion 3 (browser bundle without `node:fs`) is not conditioned on V2-M8 approval, while criterion 1 forbids Companion integration work without that approval. Whether criterion 3 applied before V2-M8 approval was not decided. RESOLVED in the final consistency review: criterion 3 now applies WHEN V2-M8 is approved and notes that Requirement 6.7 already forbids V2 production code from importing V1 modules that read the codebook with `node:fs`.

**Requirement 18**
- OP-18.1 What is an "item"?
- OP-18.2 What does "independently of the artifact under test" mean?
- OP-18.3 Which counts must a re-run reproduce?
- OP-18.4 How is a Result_Record without a seed handled?
- OP-18.5 Who may declare a producer unknown?
- OP-18.6 "V2 documents" is not in the glossary.
- OP-18.7 Does criterion 7 apply to every statement or only to claims?

**Requirement 19**
- OP-19.1 Which Go_No_Go values permit continuing? (Addressed in criterion 2. Please confirm.) CLOSED by the final consistency review: criterion 2 lists the continuing outcomes, now including Gate 7 and Gate 8 (criteria 14 and 15).
- OP-19.2 Where are authorizations, Gate decisions and route choices recorded?
- OP-19.3 What does "approved" mean in criterion 7?
- OP-19.4 Which components are "repository automation"?
- OP-19.5 What is a "restated V2 goal"?
- OP-19.6 Which EC class applies to the added criteria? (`[EC 1]` was used.) CLOSED by the final consistency review: the labels were re-checked against the evidence-class table of `design.md`. Criteria 13 to 15 added in the review are document and record checks and carry `[EC 1]`.

**Requirement 20**
- OP-20.1 Which documents are "the V2 documentation" (criteria 4 and 5)?
- OP-20.2 Where does Appendix B live once the spec is complete?
- OP-20.3 Who judges that a decision "blocks" or a risk "occurs"?
- OP-20.4 Is the frozen codebook covered by the Baseline_V1 pin in criterion 7?

### D.3 Count summary

OP entries: 140 (R1 3, R2 7, R3 8, R4 8, R5 7, R6 9, R7 7, R8 11, R9 10, R10 8, R11 8, R12 5, R13 6, R14 6, R15 5, R16 7, R17 8, R18 7, R19 6, R20 4). The final consistency review added no OP entry and closed 7 of them (see Appendix E). RV entries: 18 (10 from the refinement pass and 8 added by the final consistency review: RV-2.1, RV-3.1, RV-7.1, RV-10.3, RV-14.2, RV-14.3, RV-16.1, RV-17.3). The follow-up pass of the final consistency review marked 5 of the 8 as RESOLVED (RV-7.1, RV-10.3, RV-14.3, RV-16.1, RV-17.3). Unresolved RV notes: 13 (RV-1.1, RV-2.1, RV-3.1, RV-5.1, RV-8.1, RV-10.1, RV-10.2, RV-13.1, RV-13.2, RV-14.1, RV-14.2, RV-17.1, RV-17.2). Integration notes: 37 (15 from the refinement pass, items 16 to 37 from the final consistency review). Item 35 points (a) and (b) are marked RESOLVED in the final consistency review (1c) by item 36; point (c) is marked RESOLVED in the final consistency review (1d) by item 37. No integration-note point remains open from item 35.

---

## Appendix E: Classification of Open Points and Prioritized Owner Decisions

Provenance: AI-derived classification of the final consistency review (hypothesis, not owner-approved). It decides nothing for the owner. The owner may reclassify any point.

### E.1 Class definitions

- **CLASS A**: An owner decision is genuinely required before the named gate or milestone. Typical subjects: scope, rights and legal status, release thresholds, priorities, policy, and anything the owner reserved.
- **CLASS B**: A technical decision that Kiro may resolve during the named future design or implementation step. It is recorded in the named artifact (Pre-registration, format specification, design addendum or Result_Record) and reported to the owner. It SHALL NOT change an owner goal, a release threshold, rights, scope or an approved requirement. Where a requirement says a value stays `proposed, pending owner approval`, the class B record carries that label.
- **CLASS C**: Deferred, optional or non-blocking. Subjects: V2-M8 details, the optional indistinguishability test, wording, information that can be read from V1 documents, and questions that cannot arise unless an earlier gate outcome occurs.
- **closed by this review**: A separate marker, not a fourth class, for a point answered by the edits of the final consistency review.

Points and items other than OP-* that the review also closed: the O-1/O-2 point of D.1 item 2 (Requirements 1.2 and 1.12), the Gate 7 and Gate 8 routes (Requirements 16.16, 19.2, 19.4, 19.13 to 19.15), the Gate value mappings (Requirements 19.2 and 19.11), the `.config.kiro` exception (Requirement 20.8) and the Keep_Out_Mask definition (OP-7.4, OP-12.2). The follow-up pass also resolved the review notes RV-7.1, RV-10.3, RV-14.3, RV-16.1 and RV-17.3 (Appendix D, items 30 to 34). No class assignment of an OP id changed.

### E.2 Classification of the 140 open points

| OP id | class | needed by | disposition |
|---|---|---|---|
| OP-1.1 | C | Gate 1 (V2-M1) | Read from the V1 status document, or record "load-sensitive tests not determined" as 1.7 allows. |
| OP-1.2 | C | Gate 1 (V2-M1) | Answered by 1.8: record any other observed state as observed. |
| OP-1.3 | C | Gate 1 (V2-M1) | Wording confirmation of 1.9. Non-blocking. |
| OP-2.1 | B | Gate 2 (V2-M2) | Decision rule written in the V2-M2 Pre-registration from the outcome table of `design.md`. |
| OP-2.2 | B | Gate 2 (V2-M2) | Precedence fixed in the Pre-registration. The design pseudocode tests square appearance first. |
| OP-2.3 | B | Gate 2 (V2-M2) | Report fields and verdicts that define "confirmed" fixed in the Pre-registration. |
| OP-2.4 | B | Gate 2 (V2-M2) | Metric, resolution, window and tolerance recorded in the Pre-registration, marked proposed (4.9). |
| OP-2.5 | B | Gate 2 (V2-M2) | Comparison method recorded. Owner supervision recorded as yes or no (2.7). |
| OP-2.6 | B | Gate 2 (V2-M2) | Failure-to-outcome mapping in the Pre-registration. Acceptance of a redesign stays O-3. |
| OP-2.7 | C | Gate 2 (V2-M2) | Wording. List the documents in the V2-M1 provenance record. |
| OP-3.1 | B | Gate 2 (V2-M2) | Value grids written in the Pre-registration before the run. The owner may veto. |
| OP-3.2 | B | Gate 2 (V2-M2) | Feature-size definition recorded in the Pre-registration. |
| OP-3.3 | B | Gate 2 (V2-M2) | Void parameterisation recorded in the Pre-registration. |
| OP-3.4 | B | Gate 2 (V2-M2) | Number of quiet zones in the bound recorded. 3.2 already states "less than or equal". |
| OP-3.5 | B | Gate 2 (V2-M2) | Unit, reference edge and Printable_Area values recorded from the V1 geometry. |
| OP-3.6 | B | Gate 2 (V2-M2) | Containment rule for radius 0 recorded in the Pre-registration. |
| OP-3.7 | B | Gate 2 (V2-M2) | Value set written before the run. 3.1 already requires 3.175 mm and one larger value. |
| OP-3.8 | B | Gate 2 (V2-M2) | Numeric S and radius chosen from the study and recorded at Gate 2. The constraints on S are O-8. |
| OP-4.1 | B | Gate 2 (V2-M2) | Nominal geometry defined in the Pre-registration (zero seam gap, zero placement error assumed). |
| OP-4.2 | B | Gate 2 (V2-M2) | Metric and tolerance recorded and marked proposed, pending owner approval (4.9). |
| OP-4.3 | B | Gate 2 (V2-M2) | Same tolerance for 4.3 and 4.4, or a separate value stated in the Pre-registration. |
| OP-4.4 | B | Gate 2 (V2-M2) | Pairwise or reference-class comparison fixed in the Pre-registration. |
| OP-4.5 | B | Gate 2 (V2-M2) | Maps to the existing outcome NO-GO for decoration. Rule recorded in the Pre-registration. |
| OP-4.6 | B | Gate 2 (V2-M2) | Quiet-zone size and unit taken from the parameter study. O-8 is touched only if card area is shared. |
| OP-4.7 | B | Gate 3 (V2-M3) | Visible-gap definition written in the format specification. |
| OP-4.8 | B | Gate 3 (V2-M3) | Seam gap and offset values for the renderer recorded in the format specification. |
| OP-5.1 | B | Gate 3 (V2-M3) | "Ideal conditions" defined in the format specification. |
| OP-5.2 | B | Gate 3 (V2-M3) | Equality tolerance for the flip comparison recorded in the format specification. |
| OP-5.3 | B | Gate 3 (V2-M3) | Reference for a valid group is the V1 slot table, recorded in the format specification. |
| OP-5.4 | B | Gate 3 (V2-M3) | Back layer included by the format specification. |
| OP-5.5 | A | Gate 2 (V2-M2), before V2-M3 | Design conflict C4 (decoration mirrored with the optical layer, or face-local artwork) needs a named decider (5.5). |
| OP-5.6 | B | Gate 3 (V2-M3) | Negative-control design recorded in the test plan. |
| OP-5.7 | C | Gate 1 (V2-M1) | Wording. List the documents in the V2-M1 provenance record. |
| OP-6.1 | B | Gate 3 (V2-M3) | Module location fixed in the format specification (proposal `src/optical-v2/`). |
| OP-6.2 | B | Gate 3 (V2-M3) | Artifact list and identifier form fixed in the format specification. |
| OP-6.3 | B | Gate 3 (V2-M3) | Proof criterion for a new pattern format recorded before any `codebook.v2.*` file. |
| OP-6.4 | B | Gate 3 (V2-M3) | Location of the compatibility policy document chosen in V2-M3. |
| OP-6.5 | C | Gate 7 (before V2-M8) | Deferred with O-9. Default "not yet decided" (6.4). |
| OP-6.6 | C | Gate 3 (V2-M3) | Wording. 6.5 names `src/game`. |
| OP-6.7 | C | Gate 7 (before V2-M8) | V2-M8 detail. Record location chosen with the V2-M8 approval. |
| OP-6.8 | B | Gate 3 (V2-M3) | Harness location fixed in the module layout. |
| OP-6.9 | C | Gate 1 (V2-M1) | Read the V1 result files from the Baseline_V1 pin. |
| OP-7.1 | B | Gate 3 (V2-M3) | Meaning of "identical" (byte, module or raster) recorded in the format specification. |
| OP-7.2 | B | Gate 2 (V2-M2) | Same as OP-4.1. |
| OP-7.3 | B | Gate 2 (V2-M2) | List of detection-critical frame elements recorded in the V2-M2 geometry record. |
| OP-7.4 | closed by this review | Gate 3 (V2-M3) | Glossary and 7.8 settle the Keep_Out_Mask definition. |
| OP-7.5 | B | Gate 3 (V2-M3) | Seed and parameter input to the back layer decided in the format specification. 7.7 still holds. |
| OP-7.6 | B | Gate 3 (V2-M3) | Outcome-to-Decoration_Mode mapping in a design addendum. Redesign acceptance stays O-3. |
| OP-7.7 | B | Gate 3 (V2-M3) | V1 file scope listed from the Baseline_V1 pin. |
| OP-8.1 | B | Gate 4 (V2-M4) | Definitions written in the V2-M4 design addendum before the API freeze. |
| OP-8.2 | B | Gate 4 (V2-M4) | Options list and handling of extra options fixed in the API definition. |
| OP-8.3 | B | Gate 4 (V2-M4) | Memory and time limits recorded in the design addendum, marked proposed, pending owner approval (8.13). |
| OP-8.4 | B | Gate 4 (V2-M4) | Full OfficialResult field set fixed in the V2-M4 design addendum. |
| OP-8.5 | C | Gate 4 (V2-M4) | Wording. Name the document in the V2-M4 deliverables. |
| OP-8.6 | A | Gate 4, before the API freeze | Part of O-6: whether "rejected" differs from "undecided" for hints. |
| OP-8.7 | A | Gate 4, before the API freeze | Part of O-6: whether kinds other than INCOMPLETE_GROUP may carry hints. |
| OP-8.8 | C | Gate 4 (V2-M4) | Answered by 10.11 and the policy table of `design.md`. |
| OP-8.9 | B | Gate 4 (V2-M4) | Trial counts n fixed in the Pre-registration. |
| OP-8.10 | B | Gate 4 (V2-M4) | Logging rule for IDENTIFIED results fixed in the API design addendum. |
| OP-8.11 | B | Gate 4 (V2-M4) | Dependency scope fixed in the inspection method of the Pre-registration. |
| OP-9.1 | C | Gate 4 (V2-M4) | Answered by the metric definitions of `design.md`: a Reject on a Negative_Input is REJECTED. |
| OP-9.2 | B | Gate 4 (V2-M4) | Mapping rows added to the table of 9.11. |
| OP-9.3 | B | Gate 4 (V2-M4) | Denominator stated per rate (9.5) and fixed in the Pre-registration. |
| OP-9.4 | B | Gate 4 (V2-M4) | Bound method for non-zero counts fixed in the Pre-registration. |
| OP-9.5 | B | Gate 4 (V2-M4) | Event types listed in the Pre-registration. |
| OP-9.6 | B | Gate 4 (V2-M4) | Independence argument recorded in each Result_Record. |
| OP-9.7 | B | Gate 4 (V2-M4) | Ordered list or set fixed in the result schema. |
| OP-9.8 | C | Gate 4 (V2-M4) | Domain is the V1 reflection set (NOT_REFLECTED, REFLECTED, AMBIGUOUS). |
| OP-9.9 | C | Gate 4 (V2-M4) | Domain is the set of the 52 V1 card IDs. |
| OP-9.10 | B | Gate 4 (V2-M4) | Same as OP-8.4. |
| OP-10.1 | B | Gate 4 (V2-M4) | Tie rule recorded in the design addendum. |
| OP-10.2 | C | Gate 4 (V2-M4) | V1 rule kept unchanged. Answered by the V1 requirements. |
| OP-10.3 | C | Gate 4 (V2-M4) | V1 definition taken. The Scoring_Companion defines the Target_Region. |
| OP-10.4 | B | Gate 4 (V2-M4) | Vertex-match tolerance recorded in the `verifyTargetVertex` design. |
| OP-10.5 | B | Gate 4 (V2-M4) | Result kind for foreign decoration recorded in the design addendum (RV-10.1). |
| OP-10.6 | B | Gate 4 (V2-M4) | Definitions of "damaged" and "ambiguous" written in the Pre-registration. |
| OP-10.7 | B | Gate 4 (V2-M4) | Wrong_Accept rule and n per negative class written in the Pre-registration. |
| OP-10.8 | C | Gate 7 (V2-M8) | Companion prompt details belong to V2-M8. |
| OP-11.1 | C | Gate 4 (V2-M4) | Answered by the V2-M4 row of the deliverables table. Cite it in the Pre-registration. |
| OP-11.2 | B | Gate 4 (V2-M4) | Commit order and timestamps named in the Pre-registration. |
| OP-11.3 | B | Gate 4 (V2-M4) | Amendment rule recorded. Every change is a labelled deviation (11.10). |
| OP-11.4 | B | Gate 4 (V2-M4) | Tie rule written in the decision rule. |
| OP-11.5 | B | Gate 4 (V2-M4) | Latency method written in the Pre-registration. |
| OP-11.6 | B | Gate 4 (V2-M4) | Metric list written in the Pre-registration. |
| OP-11.7 | B | Gate 4 (V2-M4) | Effect of a deviation written in the decision rule. |
| OP-11.8 | B | Gate 4 (V2-M4) | Export surface defined in the design addendum. |
| OP-12.1 | B | Gate 2 (V2-M2) | Minimum feature size value and unit recorded in the V2-M2 Pre-registration. |
| OP-12.2 | closed by this review | Gate 2 (V2-M2) | 7.8 limits the mask to three regions, so the Central_Void is outside it. 7.4 separately forbids printed modules in the void. |
| OP-12.3 | C | Gate 2 (V2-M2) | Wording. The design table says FRAME_ONLY is used if GO-WITH-REDESIGN takes that form. |
| OP-12.4 | B | Gate 2 (V2-M2) | Maps to NO-GO for decoration. Recorded in the Pre-registration. |
| OP-12.5 | A | before any artwork or trace is stored (O-5) | Whether a SIMPLIFIED render is a derived trace is a rights question. Part of O-5. |
| OP-13.1 | B | Gate 5 (V2-M5) | Per condition or aggregate fixed in the Pre-registration. |
| OP-13.2 | B | Gate 5 (V2-M5) | Definitions fixed in the Pre-registration. |
| OP-13.3 | B | Gate 5 (V2-M5) | "Complete and valid" defined in the Pre-registration (13.9). |
| OP-13.4 | B | Gate 5 (V2-M5) | Pairing scheme fixed in the Pre-registration. |
| OP-13.5 | B | Gate 5 (V2-M5) | Choice rule between remove and simplify fixed in the Pre-registration. |
| OP-13.6 | closed by this review | Gate 5 (V2-M5) | Gate 5 records keep, simplify or remove (13.10, 19.11). Go_No_Go_Outcome applies to Gate 2 only. |
| OP-14.1 | B | Gate 6 (V2-M6) | Levels, trial counts and seeds written in the V2-M6 Pre-registration (14.1). |
| OP-14.2 | B | Gate 6 (V2-M6) | Deduplication rule recorded (14.2). |
| OP-14.3 | C | Gate 6 (V2-M6) | Answered by the metric definitions of `design.md`: a correct reject is REJECTED. |
| OP-14.4 | B | Gate 6 (V2-M6) | Latency statistic and environment fields written in the Pre-registration. |
| OP-14.5 | closed by this review | Gate 6 (V2-M6) | 14.9 reworded. The Baseline_V1 arm still runs when V2-M5 is skipped. |
| OP-14.6 | C | Gate 6 (V2-M6) | Answered by 1.7: the three regression gates do not depend on V1 Task 7.2. |
| OP-15.1 | C | before the optional test | Defined in the test Pre-registration if the owner approves the test. |
| OP-15.2 | C | before the optional test | Confidence level written in the Pre-registration. |
| OP-15.3 | C | before the optional test | Blinding of the administrator written in the Pre-registration. |
| OP-15.4 | C | before the optional test | Wording. |
| OP-15.5 | C | before the optional test | O-4 covers the numeric target. Approval of the test itself is the condition of 15.1. |
| OP-16.1 | A | before the first capture (V2-M7) | Part of O-4: "normal condition" and "end to end" belong to the threshold approval. |
| OP-16.2 | B | V2-M7 protocol | Outcome classes for physical trials defined in the physical protocol. |
| OP-16.3 | B | V2-M7 protocol | Mapping of "wrong card acceptance" to the two Wrong_Accept classes recorded in the protocol. |
| OP-16.4 | B | V2-M7 protocol | Minimum change that counts as re-framing or re-lighting recorded in the protocol. |
| OP-16.5 | A | before the first capture (V2-M7) | Part of O-4: sample sizes belong to the threshold approval. |
| OP-16.6 | B | V2-M7 protocol | Equivalence rule for the flip comparison recorded in the protocol. |
| OP-16.7 | B | V2-M7 protocol | Physical scenes for the other negative kinds listed in the protocol. |
| OP-17.1 | C | Gate 7 (before V2-M8) | V2-M8 detail. Same record as OP-6.7. |
| OP-17.2 | C | Gate 7 (V2-M8) | V2-M8 detail. |
| OP-17.3 | C | Gate 7 (V2-M8) | V2-M8 detail. |
| OP-17.4 | closed by this review | Gate 7 (V2-M8) | References 10.7 and 10.9 were checked again and resolve. |
| OP-17.5 | C | Gate 7 (V2-M8) | V2-M8 detail. |
| OP-17.6 | C | Gate 7 (V2-M8) | V2-M8 detail. |
| OP-17.7 | C | Gate 7 (V2-M8) | V2-M8 detail. |
| OP-17.8 | C | Gate 7 (V2-M8) | V2-M8 detail. Wording. |
| OP-18.1 | C | Gate 1 (V2-M1) | Wording. Define "item" in the V2-M1 provenance record. |
| OP-18.2 | B | Gate 1 (V2-M1) | Meaning of "independently of the artifact under test" recorded in the V2-M1 provenance record. |
| OP-18.3 | B | Gate 1 (V2-M1) | Counts a re-run must reproduce listed in the Result_Record format. |
| OP-18.4 | B | Gate 1 (V2-M1) | Handling of a Result_Record without a seed fixed in the Result_Record format. |
| OP-18.5 | C | Gate 1 (V2-M1) | Answered by 18.4: the producer field then reads "unattributed". |
| OP-18.6 | C | Gate 1 (V2-M1) | Wording. Name the V2 documents in the V2-M1 provenance record. |
| OP-18.7 | C | Gate 1 (V2-M1) | Wording of 18.7. |
| OP-19.1 | closed by this review | Gate 1 (V2-M1) | 19.2 lists the continuing outcomes, now including Gate 7 and Gate 8. |
| OP-19.2 | B | Gate 1 (V2-M1) | Locations of authorizations, Gate decisions and route choices recorded in the V2-M1 provenance record. |
| OP-19.3 | C | Gate 1 (V2-M1) | Wording of 19.7. |
| OP-19.4 | C | Gate 1 (V2-M1) | Wording of 19.9. |
| OP-19.5 | C | Gate 1 (V2-M1) | Wording of 19.12. |
| OP-19.6 | closed by this review | Gate 1 (V2-M1) | EC labels re-checked. Criteria 13 to 15 carry `[EC 1]`. |
| OP-20.1 | C | Gate 1 (V2-M1) | Wording. Name the V2 documentation in the V2-M1 provenance record. |
| OP-20.2 | C | Gate 1 (V2-M1) | Appendix B stays in this document until the owner moves it. |
| OP-20.3 | C | Gate 1 (V2-M1) | Default: the person who records the entry. The owner may veto. Non-blocking. |
| OP-20.4 | C | Gate 1 (V2-M1) | Answered by 1.3: the codebook hash is recorded at the Baseline_V1 pin. |

### E.3 Counts

The table of E.2 has 140 rows, one per open point. It was compared with the list of D.2 by reading both: no identifier is missing, none is duplicated, and the order is the same.

| Class or marker | Open points |
|---|---|
| A (owner decision required) | 6 |
| B (technical, Kiro may resolve and record) | 83 |
| C (deferred, optional or non-blocking) | 44 |
| closed by this review | 7 |
| Total | 140 |

Class A points are OP-5.5, OP-8.6, OP-8.7, OP-12.5, OP-16.1 and OP-16.5. Four of them belong to existing decisions (OP-8.6 and OP-8.7 to O-6, OP-12.5 to O-5, OP-16.1 and OP-16.5 to O-4), and OP-5.5 is a decision of its own. Points closed by this review: OP-7.4, OP-12.2, OP-13.6, OP-14.5, OP-17.4, OP-19.1, OP-19.6.

Counts per requirement:

| Requirement | Points | A | B | C | closed |
|---|---|---|---|---|---|
| 1 | 3 | 0 | 0 | 3 | 0 |
| 2 | 7 | 0 | 6 | 1 | 0 |
| 3 | 8 | 0 | 8 | 0 | 0 |
| 4 | 8 | 0 | 8 | 0 | 0 |
| 5 | 7 | 1 | 5 | 1 | 0 |
| 6 | 9 | 0 | 5 | 4 | 0 |
| 7 | 7 | 0 | 6 | 0 | 1 |
| 8 | 11 | 2 | 7 | 2 | 0 |
| 9 | 10 | 0 | 7 | 3 | 0 |
| 10 | 8 | 0 | 5 | 3 | 0 |
| 11 | 8 | 0 | 7 | 1 | 0 |
| 12 | 5 | 1 | 2 | 1 | 1 |
| 13 | 6 | 0 | 5 | 0 | 1 |
| 14 | 6 | 0 | 3 | 2 | 1 |
| 15 | 5 | 0 | 0 | 5 | 0 |
| 16 | 7 | 2 | 5 | 0 | 0 |
| 17 | 8 | 0 | 0 | 7 | 1 |
| 18 | 7 | 0 | 3 | 4 | 0 |
| 19 | 6 | 0 | 1 | 3 | 2 |
| 20 | 4 | 0 | 0 | 4 | 0 |
| Total | 140 | 6 | 83 | 44 | 7 |

### E.4 Prioritized owner decisions

Before ANY implementation only O-1 and O-2 must be decided. The per-milestone written authorization of Requirement 19.3 is also required. It is a process rule and not an O-decision. Every other decision below is needed later, and none blocks V2-M1.

Recommended defaults are proposals of this review, not decisions. The project owner may veto every item and may reclassify any point.

| Priority | Decision | Needed by | Blocks | Recommended default | Who may veto |
|---|---|---|---|---|---|
| P0 | O-1 which V1 baseline | Gate 1 | V2-M2 (1.2) | Pin `main` (merged, no unmerged stack), unless the owner wants the PR #14 detector as the baseline. | Owner |
| P0 | O-2 finish V1 first, or run V2 in parallel | Gate 1 | V2-M2 (1.2, 1.12) | Run V2 in parallel against an unevaluated baseline, labelled "unevaluated V1 baseline (synthetic)" (1.6). | Owner |
| P1 | O-3 redesign or frame-only decoration acceptable (OP-2.1, 2.2, 2.6, 12.4 stay class B) | Gate 2, only if the outcome needs a redesign | V2-M3 start after GO-WITH-REDESIGN (2.11) | If the supplied artwork fails, continue with Decoration_Mode OFF (NO-GO for decoration) and make no redesign. | Owner |
| P1 | O-8 constraint on S and sharing card area with the front-face index (the numeric S is class B) | Gate 2 | V2-M3 start (3.6) | Do not share card area unless the V2-M2 study shows a conflict that sharing would solve. | Owner |
| P1 | OP-5.5 decider of design conflict C4 | Gate 2, before V2-M3 | V2-M3 start (5.5) | Follow the design proposal: decoration is part of the mirrored optical layer. | Owner |
| P2 | O-6 hint in INCOMPLETE_GROUP, with OP-8.6 and OP-8.7 | Before the V2-M4 API freeze | Result schema of V2-M4 | No hint (8.14). | Owner |
| P3 | O-5 rights and publication of the artwork, with OP-12.5 | Before any artwork or trace is stored or published, and before V2-M5 starts | V2-M5 start, any commit of artwork (12.8, 12.10) | Keep the original and any trace private and untracked. | Owner |
| P4 | O-4 PR #18 thresholds, with OP-16.1 and OP-16.5 | Before the first real capture (V2-M7) | Any pass or fail statement against a threshold (16.1, 16.2) | Keep the PR #18 values `proposed, pending owner approval (O-4)`. Report raw counts as `unevaluated, threshold not approved`. | Owner |
| Deferred (class C unless an earlier gate changes it) | O-9 retirement or coexistence rule | Gate 7, before V2-M8 | Nothing before V2-M8 | Record "not yet decided" in the compatibility policy (6.4). | Owner |
| Deferred | Approval of V2-M8 itself (OP-6.7, OP-17.1) | Gate 7 | V2-M8 (17.1, 19.14) | No approval until the owner states one. V2 then ends at Gate 7 as `validated for print, integration not approved`. | Owner |
| Closed by default | O-7 wording "inside the assembled marker" | Confirmation may be recorded at Gate 2, non-blocking | Nothing | The owner's wording is adopted. PR #18's wording is superseded. Requirement 12.11 is met by recording that default or the confirmation. | Owner |
