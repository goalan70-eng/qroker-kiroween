# Group decoder at radius 2: corrupted-fragment outcomes beyond the guaranteed range (task 6.1)

**SYNTHETIC images and a synthetic independent-bit-flip model, not real cameras. Radius 2 has no guaranteed rejection interval.**

Codebook SHA-256: 515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4. Minimum Hamming distance between templates of different cards (d_id): 5. Seed: 20251201.

8 seeded valid groups (seed 20251201 + i, drawArrangement 'any', modulePx 4); for each of the 4 slots exactly one fragment gets k flipped data modules (pixel inversion), decodeGroup(image, { radius: 2 }) sees only the image. Weights 3 and 4: every mask (2,300 and 12,650) is classified at bit level; weights 5..8: 300 seeded masks per (group, slot). Every bit-level accepted word and a seeded sample of at most 6 rejected words per (group, slot, weight) are decoded from real pixels.

Nothing below is an assertion about a guaranteed rejection. At radius 2 a word that is 3 or more flips from its source can lie within radius 2 of ANOTHER card, and the decoder then accepts it as that card. These are the measured counts, not a bound on arbitrary corruption.

## Exact bit-level counts over all 416 templates (equal to the m4-2 enumeration)

| flips k | events | accepted as the source card | falsely accepted as another card | rejected (CORRUPTED_FRAGMENT) |
|---|---|---|---|---|
| 3 | 956,800 | 0 | 2,720 | 954,080 |
| 4 | 5,262,400 | 3,360 | 13,360 | 5,245,680 |

## Per flip weight, for the corrupted fragments of the seeded groups

Bit level = decodeFragment semantics (lookup). Group level = decodeGroup on real pixels. "Pixel runs" are all bit-level accepted words plus a small seeded sample of rejected words.

| k | coverage | bit events | bit: source card | bit: other card (false accept) | bit: rejected | pixel runs (accepted / total) | group: IDENTIFIED correct | group: IDENTIFIED WRONG cards | group: CORRUPTED_FRAGMENT | group: DUPLICATE_CARD | group: INVALID_ARRANGEMENT | group: other | prediction mismatches |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | exact | 73,600 | 0 | 180 | 73,420 | 180 / 372 | 0 | 20 | 192 | 20 | 140 | 0 | 0 |
| 4 | exact | 404,800 | 210 | 1,050 | 403,540 | 1260 / 1452 | 0 | 10 | 192 | 70 | 1180 | 0 | 0 |
| 5 | sampled | 9,600 | 0 | 43 | 9,557 | 43 / 235 | 0 | 2 | 192 | 0 | 41 | 0 | 0 |
| 6 | sampled | 9,600 | 6 | 20 | 9,574 | 26 / 218 | 0 | 2 | 192 | 1 | 23 | 0 | 0 |
| 7 | sampled | 9,600 | 0 | 41 | 9,559 | 41 / 233 | 0 | 1 | 192 | 1 | 39 | 0 | 0 |
| 8 | sampled | 9,600 | 1 | 42 | 9,557 | 43 / 235 | 0 | 5 | 192 | 4 | 34 | 0 | 0 |

Total pixel runs: 2,745. Group-level silent wrong identifications (IDENTIFIED with a different card set): 40. Listed below: 40 (smallest weight first).

A group-level false acceptance needs the falsely accepted word to be a transform that the slot table allows for the other card, and the other card must not already be in the group; most fragment-level false acceptances are therefore still rejected by the duplicate or arrangement check.

## Concrete group-level counterexamples (IDENTIFIED with wrong cards)

| # | group seed | arrangement | slot | true card | k | flipped modules (row,col) | observed bits | decoded as (transform, distance) | cards returned | true cards | sum returned | true sum |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 20251204 | TL:S-2@180 TR:S-3@0 BL:S-9@180 BR:S-Q@0 | BL | S-9 | 3 | (0,3) (0,4) (2,3) | 0x08242DE | S-4 (Fv, 2) | S-2 S-3 S-4 S-Q | S-2 S-3 S-9 S-Q | 21 | 26 |
| 2 | 20251204 | TL:S-2@180 TR:S-3@0 BL:S-9@180 BR:S-Q@0 | BL | S-9 | 3 | (0,3) (2,0) (2,3) | 0x08246CE | S-4 (Fv, 2) | S-2 S-3 S-4 S-Q | S-2 S-3 S-9 S-Q | 21 | 26 |
| 3 | 20251204 | TL:S-2@180 TR:S-3@0 BL:S-9@180 BR:S-Q@0 | BL | S-9 | 3 | (0,4) (2,0) (2,3) | 0x08246D6 | S-4 (Fv, 2) | S-2 S-3 S-4 S-Q | S-2 S-3 S-9 S-Q | 21 | 26 |
| 4 | 20251204 | TL:S-2@180 TR:S-3@0 BL:S-9@180 BR:S-Q@0 | BL | S-9 | 3 | (0,3) (0,4) (2,0) | 0x08266DE | S-4 (Fv, 2) | S-2 S-3 S-4 S-Q | S-2 S-3 S-9 S-Q | 21 | 26 |
| 5 | 20251204 | TL:S-2@180 TR:S-3@0 BL:S-9@180 BR:S-Q@0 | BL | S-9 | 3 | (0,3) (2,3) (3,1) | 0x08342CE | S-4 (Fv, 2) | S-2 S-3 S-4 S-Q | S-2 S-3 S-9 S-Q | 21 | 26 |
| 6 | 20251204 | TL:S-2@180 TR:S-3@0 BL:S-9@180 BR:S-Q@0 | BL | S-9 | 3 | (0,4) (2,3) (3,1) | 0x08342D6 | S-4 (Fv, 2) | S-2 S-3 S-4 S-Q | S-2 S-3 S-9 S-Q | 21 | 26 |
| 7 | 20251204 | TL:S-2@180 TR:S-3@0 BL:S-9@180 BR:S-Q@0 | BL | S-9 | 3 | (2,0) (2,3) (3,1) | 0x08346C6 | S-4 (Fv, 2) | S-2 S-3 S-4 S-Q | S-2 S-3 S-9 S-Q | 21 | 26 |
| 8 | 20251204 | TL:S-2@180 TR:S-3@0 BL:S-9@180 BR:S-Q@0 | BL | S-9 | 3 | (0,3) (0,4) (3,1) | 0x08362DE | S-4 (Fv, 2) | S-2 S-3 S-4 S-Q | S-2 S-3 S-9 S-Q | 21 | 26 |
| 9 | 20251204 | TL:S-2@180 TR:S-3@0 BL:S-9@180 BR:S-Q@0 | BL | S-9 | 3 | (0,3) (2,0) (3,1) | 0x08366CE | S-4 (Fv, 2) | S-2 S-3 S-4 S-Q | S-2 S-3 S-9 S-Q | 21 | 26 |
| 10 | 20251204 | TL:S-2@180 TR:S-3@0 BL:S-9@180 BR:S-Q@0 | BL | S-9 | 3 | (0,4) (2,0) (3,1) | 0x08366D6 | S-4 (Fv, 2) | S-2 S-3 S-4 S-Q | S-2 S-3 S-9 S-Q | 21 | 26 |
| 11 | 20251205 | TL:C-K@0 TR:D-5@0 BL:D-10@0 BR:C-3@180 | BL | D-10 | 3 | (0,4) (1,4) (3,3) | 0x040E15D | C-8 (I, 2) | D-5 C-3 C-8 C-K | C-3 C-K D-10 D-5 | 29 | 31 |
| 12 | 20251205 | TL:C-K@0 TR:D-5@0 BL:D-10@0 BR:C-3@180 | BL | D-10 | 3 | (1,4) (3,3) (4,1) | 0x060E14D | C-8 (I, 2) | D-5 C-3 C-8 C-K | C-3 C-K D-10 D-5 | 29 | 31 |
| 13 | 20251205 | TL:C-K@0 TR:D-5@0 BL:D-10@0 BR:C-3@180 | BL | D-10 | 3 | (0,4) (3,3) (4,1) | 0x060E35D | C-8 (I, 2) | D-5 C-3 C-8 C-K | C-3 C-K D-10 D-5 | 29 | 31 |
| 14 | 20251205 | TL:C-K@0 TR:D-5@0 BL:D-10@0 BR:C-3@180 | BL | D-10 | 3 | (0,4) (1,4) (4,1) | 0x064E15D | C-8 (I, 2) | D-5 C-3 C-8 C-K | C-3 C-K D-10 D-5 | 29 | 31 |
| 15 | 20251205 | TL:C-K@0 TR:D-5@0 BL:D-10@0 BR:C-3@180 | BL | D-10 | 3 | (1,4) (3,3) (4,4) | 0x140E14D | C-8 (I, 2) | D-5 C-3 C-8 C-K | C-3 C-K D-10 D-5 | 29 | 31 |
| 16 | 20251205 | TL:C-K@0 TR:D-5@0 BL:D-10@0 BR:C-3@180 | BL | D-10 | 3 | (0,4) (3,3) (4,4) | 0x140E35D | C-8 (I, 2) | D-5 C-3 C-8 C-K | C-3 C-K D-10 D-5 | 29 | 31 |
| 17 | 20251205 | TL:C-K@0 TR:D-5@0 BL:D-10@0 BR:C-3@180 | BL | D-10 | 3 | (0,4) (1,4) (4,4) | 0x144E15D | C-8 (I, 2) | D-5 C-3 C-8 C-K | C-3 C-K D-10 D-5 | 29 | 31 |
| 18 | 20251205 | TL:C-K@0 TR:D-5@0 BL:D-10@0 BR:C-3@180 | BL | D-10 | 3 | (3,3) (4,1) (4,4) | 0x160E34D | C-8 (I, 2) | D-5 C-3 C-8 C-K | C-3 C-K D-10 D-5 | 29 | 31 |
| 19 | 20251205 | TL:C-K@0 TR:D-5@0 BL:D-10@0 BR:C-3@180 | BL | D-10 | 3 | (1,4) (4,1) (4,4) | 0x164E14D | C-8 (I, 2) | D-5 C-3 C-8 C-K | C-3 C-K D-10 D-5 | 29 | 31 |
| 20 | 20251205 | TL:C-K@0 TR:D-5@0 BL:D-10@0 BR:C-3@180 | BL | D-10 | 3 | (0,4) (4,1) (4,4) | 0x164E35D | C-8 (I, 2) | D-5 C-3 C-8 C-K | C-3 C-K D-10 D-5 | 29 | 31 |
| 21 | 20251204 | TL:S-2@180 TR:S-3@0 BL:S-9@180 BR:S-Q@0 | BL | S-9 | 4 | (0,3) (0,4) (2,0) (2,3) | 0x08246DE | S-4 (Fv, 1) | S-2 S-3 S-4 S-Q | S-2 S-3 S-9 S-Q | 21 | 26 |
| 22 | 20251204 | TL:S-2@180 TR:S-3@0 BL:S-9@180 BR:S-Q@0 | BL | S-9 | 4 | (0,3) (0,4) (2,3) (3,1) | 0x08342DE | S-4 (Fv, 1) | S-2 S-3 S-4 S-Q | S-2 S-3 S-9 S-Q | 21 | 26 |
| 23 | 20251204 | TL:S-2@180 TR:S-3@0 BL:S-9@180 BR:S-Q@0 | BL | S-9 | 4 | (0,3) (2,0) (2,3) (3,1) | 0x08346CE | S-4 (Fv, 1) | S-2 S-3 S-4 S-Q | S-2 S-3 S-9 S-Q | 21 | 26 |
| 24 | 20251204 | TL:S-2@180 TR:S-3@0 BL:S-9@180 BR:S-Q@0 | BL | S-9 | 4 | (0,4) (2,0) (2,3) (3,1) | 0x08346D6 | S-4 (Fv, 1) | S-2 S-3 S-4 S-Q | S-2 S-3 S-9 S-Q | 21 | 26 |
| 25 | 20251204 | TL:S-2@180 TR:S-3@0 BL:S-9@180 BR:S-Q@0 | BL | S-9 | 4 | (0,3) (0,4) (2,0) (3,1) | 0x08366DE | S-4 (Fv, 1) | S-2 S-3 S-4 S-Q | S-2 S-3 S-9 S-Q | 21 | 26 |
| 26 | 20251205 | TL:C-K@0 TR:D-5@0 BL:D-10@0 BR:C-3@180 | BL | D-10 | 4 | (0,4) (1,4) (3,3) (4,1) | 0x060E15D | C-8 (I, 1) | D-5 C-3 C-8 C-K | C-3 C-K D-10 D-5 | 29 | 31 |
| 27 | 20251205 | TL:C-K@0 TR:D-5@0 BL:D-10@0 BR:C-3@180 | BL | D-10 | 4 | (0,4) (1,4) (3,3) (4,4) | 0x140E15D | C-8 (I, 1) | D-5 C-3 C-8 C-K | C-3 C-K D-10 D-5 | 29 | 31 |
| 28 | 20251205 | TL:C-K@0 TR:D-5@0 BL:D-10@0 BR:C-3@180 | BL | D-10 | 4 | (1,4) (3,3) (4,1) (4,4) | 0x160E14D | C-8 (I, 1) | D-5 C-3 C-8 C-K | C-3 C-K D-10 D-5 | 29 | 31 |
| 29 | 20251205 | TL:C-K@0 TR:D-5@0 BL:D-10@0 BR:C-3@180 | BL | D-10 | 4 | (0,4) (3,3) (4,1) (4,4) | 0x160E35D | C-8 (I, 1) | D-5 C-3 C-8 C-K | C-3 C-K D-10 D-5 | 29 | 31 |
| 30 | 20251205 | TL:C-K@0 TR:D-5@0 BL:D-10@0 BR:C-3@180 | BL | D-10 | 4 | (0,4) (1,4) (4,1) (4,4) | 0x164E15D | C-8 (I, 1) | D-5 C-3 C-8 C-K | C-3 C-K D-10 D-5 | 29 | 31 |
| 31 | 20251201 | TL:S-10@180 TR:C-7@180 BL:C-J@0 BR:H-J@0 | BL | C-J | 5 | (0,2) (1,0) (1,2) (1,3) (2,0) | 0x06533D3 | S-Q (Fv, 2) | H-J C-7 S-10 S-Q | C-7 C-J H-J S-10 | 40 | 39 |
| 32 | 20251207 | TL:S-J@180 TR:D-3@0 BL:C-J@0 BR:H-4@0 | BL | C-J | 5 | (1,0) (1,2) (1,3) (2,0) (3,2) | 0x06733D7 | S-Q (Fv, 2) | H-4 D-3 S-J S-Q | C-J D-3 H-4 S-J | 30 | 29 |
| 33 | 20251202 | TL:H-2@0 TR:D-8@0 BL:D-6@0 BR:H-8@0 | BR | H-8 | 6 | (0,2) (2,1) (2,2) (2,3) (3,4) (4,3) | 0x01D369B | H-J (I, 2) | H-2 H-J D-6 D-8 | D-6 D-8 H-2 H-8 | 27 | 24 |
| 34 | 20251207 | TL:S-J@180 TR:D-3@0 BL:C-J@0 BR:H-4@0 | BR | H-4 | 6 | (0,2) (1,4) (2,1) (2,2) (3,1) (4,4) | 0x0028DAC | S-9 (I, 2) | D-3 C-J S-9 S-J | C-J D-3 H-4 S-J | 34 | 29 |
| 35 | 20251208 | TL:H-10@0 TR:C-10@180 BL:D-Q@0 BR:S-10@0 | BL | D-Q | 7 | (0,0) (0,1) (0,3) (2,2) (3,2) (4,0) (4,1) | 0x1319F4D | D-8 (I, 2) | H-10 D-8 C-10 S-10 | C-10 D-Q H-10 S-10 | 38 | 42 |
| 36 | 20251201 | TL:S-10@180 TR:C-7@180 BL:C-J@0 BR:H-J@0 | TL | S-10 | 8 | (0,1) (0,4) (1,3) (1,4) (2,1) (2,2) (4,0) (4,4) | 0x08A534F | C-2 (Fh, 2) | H-J C-2 C-7 C-J | C-7 C-J H-J S-10 | 31 | 39 |
| 37 | 20251203 | TL:S-3@180 TR:C-J@180 BL:S-7@180 BR:C-5@180 | TR | C-J | 8 | (0,0) (1,2) (1,4) (2,1) (2,3) (3,4) (4,0) (4,2) | 0x184F3CD | H-6 (Fh, 2) | H-6 C-5 S-3 S-7 | C-5 C-J S-3 S-7 | 21 | 26 |
| 38 | 20251204 | TL:S-2@180 TR:S-3@0 BL:S-9@180 BR:S-Q@0 | TL | S-2 | 8 | (1,1) (1,3) (2,1) (3,2) (3,4) (4,1) (4,2) (4,4) | 0x0E4A7DB | C-Q (Fh, 2) | C-Q S-3 S-9 S-Q | S-2 S-3 S-9 S-Q | 36 | 26 |
| 39 | 20251205 | TL:C-K@0 TR:D-5@0 BL:D-10@0 BR:C-3@180 | BL | D-10 | 8 | (0,1) (1,1) (1,4) (2,1) (2,3) (3,1) (3,2) (4,3) | 0x0C7C90F | C-6 (I, 2) | D-5 C-3 C-6 C-K | C-3 C-K D-10 D-5 | 27 | 31 |
| 40 | 20251207 | TL:S-J@180 TR:D-3@0 BL:C-J@0 BR:H-4@0 | BL | C-J | 8 | (0,3) (1,1) (1,3) (2,1) (3,2) (3,3) (4,0) (4,4) | 0x1733F3F | D-J (I, 2) | H-4 D-3 D-J S-J | C-J D-3 H-4 S-J | 29 | 29 |
