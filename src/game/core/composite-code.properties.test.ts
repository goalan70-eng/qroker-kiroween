// Property tests for member validity and Composite_Code detection (task 5.2): Properties 9, 10 and 11 of
// .kiro/specs/qroker-playable-game/design.md. Requirements 4.1, 4.4, 4.5, 5.1, 5.2, 5.3, 5.5, 5.6, 5.8.
//
// Each property is ONE test with ONE fc.assert, a fixed seed and at least 200 runs, so a run is reproducible.
// On failure fast-check prints the seed, the shrunk counterexample and the replay path.
//
// All oracles are written here, independent of the modules under test:
// - Property 9 uses literal tables of the printed corners and of the corner that faces the quad centre. It does
//   not read fragment-layout.ts.
// - Property 10 uses a brute-force reference detector: it scans the up to 4 quads that contain the cell with its
//   own row/column arithmetic (no geometry.ts or board.ts helper), its own validity oracle, its own rank table,
//   its own sorted-id string and its own quad key. It never calls composite-code.ts, cards.ts, board.ts helpers
//   or fragment-layout.ts.
// - Property 11 compares `detect` with itself under extended records; the expected values follow from the
//   Property 10 reference.
//
// Generator (testing/code-generators.ts): 67% "planted" boards (one or two of the quads around the cell are built
// from valid members, sometimes with one spoiled member, plus noise) and 33% legal-play boards from `arbBoard`.
// Without the planted branch the legal boards alone give far too few two-code placements. Coverage assertions at
// the end of each test fail the run if a case class was not reached, so a property cannot pass vacuously.
//
// Observed hit rates are stated in the HIT-RATES comments above the coverage assertions of Properties 10 and 11.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { detect } from "./composite-code";
import type { Board } from "./board";
import { isValidMember } from "./fragment-layout";
import { candidateQuads } from "./geometry";
import type { CardId, Orientation, Slot } from "./types";
import { arbCodeScenario } from "./testing/code-generators";
import { arbCard } from "./testing/card-generators";

const SEED_P9 = 20260509;
const SEED_P10 = 20260510;
const SEED_P11 = 20260511;
const RUNS_P9 = 300;
const RUNS_P10 = 400;
const RUNS_P11 = 300;

const SLOTS: readonly Slot[] = ["TL", "TR", "BL", "BR"];

// ---------------------------------------------------------------------------------------------------------
// Independent oracles
// ---------------------------------------------------------------------------------------------------------

type SuitLetter = "H" | "D" | "C" | "S";

/** Printed (visible) corners per suit and orientation, written out from the rule of the requirements. */
const PRINTED: Record<SuitLetter, Record<Orientation, readonly string[]>> = {
  H: { 0: ["TL", "BR"], 180: ["TL", "BR"] },
  D: { 0: ["TR", "BL"], 180: ["TR", "BL"] },
  C: { 0: ["TR", "BR"], 180: ["TL", "BL"] },
  S: { 0: ["TL", "BL"], 180: ["TR", "BR"] },
};

/** The corner of a card that faces the centre of the quad, by the slot of the card in the quad. */
const FACING: Record<Slot, string> = { TL: "BR", TR: "BL", BL: "TR", BR: "TL" };

/** Validity from the literal rule. The suit is the first character of the card id. */
function oracleValid(card: CardId, orientation: Orientation, slot: Slot): boolean {
  const suit = card.charAt(0) as SuitLetter;
  return PRINTED[suit][orientation].includes(FACING[slot]);
}

const RANK_VALUE: Record<string, number> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13,
};

function oracleValue(card: CardId): number {
  return RANK_VALUE[card.slice(2)] as number;
}

/** Sorted ids joined by "|", from a copy (default string sort). */
function oracleGroupId(cards: readonly CardId[]): string {
  return cards.slice().sort().join("|");
}

const COLUMNS = "ABCDEFGH";

/** Quad key of a top-left cell: column letter then row digit. */
function oracleKey(row: number, col: number): string {
  return `${COLUMNS.charAt(col)}${row + 1}`;
}

/** A code as the test expects it, with the position of its top-left cell. */
interface RefCode {
  readonly quadKey: string;
  readonly row: number;
  readonly col: number;
  readonly cards: readonly CardId[]; // TL, TR, BL, BR
  readonly orientations: readonly number[];
  readonly hiddenSum: number;
  readonly groupId: string;
}

interface RefScan {
  /** Quads that contain the cell, are fully on the board and have 4 occupied cells but are not a code. */
  readonly completeButNotCode: number;
  /** Codes (valid members, distinct cards), before the scored-groups record is applied, sorted by quad key. */
  readonly codes: RefCode[];
}

function inRange(v: number): boolean {
  return Number.isInteger(v) && v >= 0 && v <= 7;
}

/** Brute-force reference: scan the 4 quads whose 2x2 area could contain (row, col). */
function refScan(board: Board, row: number, col: number): RefScan {
  const codes: RefCode[] = [];
  let completeButNotCode = 0;
  if (!inRange(row) || !inRange(col) || (board[row * 8 + col] ?? null) === null) return { completeButNotCode, codes };

  for (let tlRow = row - 1; tlRow <= row; tlRow++) {
    for (let tlCol = col - 1; tlCol <= col; tlCol++) {
      if (tlRow < 0 || tlCol < 0 || tlRow > 6 || tlCol > 6) continue; // quad would leave the board
      const spots: readonly (readonly [number, number, Slot])[] = [
        [tlRow, tlCol, "TL"],
        [tlRow, tlCol + 1, "TR"],
        [tlRow + 1, tlCol, "BL"],
        [tlRow + 1, tlCol + 1, "BR"],
      ];
      const placed = spots.map(([r, c]) => board[r * 8 + c] ?? null);
      if (placed.some((p) => p === null)) continue;
      const cards = placed.map((p) => (p as NonNullable<typeof p>).card);
      const orientations = placed.map((p) => (p as NonNullable<typeof p>).orientation);
      const allValid = spots.every(([, , slot], i) => oracleValid(cards[i] as CardId, orientations[i] as Orientation, slot));
      const distinct = new Set(cards).size === 4;
      if (!allValid || !distinct) {
        completeButNotCode++;
        continue;
      }
      codes.push({
        quadKey: oracleKey(tlRow, tlCol),
        row: tlRow,
        col: tlCol,
        cards,
        orientations,
        hiddenSum: cards.reduce((sum, c) => sum + oracleValue(c), 0),
        groupId: oracleGroupId(cards),
      });
    }
  }
  codes.sort((a, b) => (a.quadKey < b.quadKey ? -1 : a.quadKey > b.quadKey ? 1 : 0));
  return { completeButNotCode, codes };
}

/** The projection of a result that is compared with the reference. */
function project(c: { quadKey: string; cards: readonly CardId[]; orientations: readonly number[]; hiddenSum: number; groupId: string }) {
  return { quadKey: c.quadKey, cards: [...c.cards], orientations: [...c.orientations], hiddenSum: c.hiddenSum, groupId: c.groupId };
}

const arbJunkIds: fc.Arbitrary<string[]> = fc
  .array(fc.uniqueArray(arbCard, { minLength: 4, maxLength: 4 }), { maxLength: 3 })
  .map((groups) => groups.map((g) => oracleGroupId(g)));

/** Per-code decision "is this group already recorded": about 20% yes. */
const arbRecordMask: fc.Arbitrary<number[]> = fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 4, maxLength: 4 });

function recordOf(junk: readonly string[], codes: readonly RefCode[], mask: readonly number[]): Set<string> {
  const record = new Set<string>(junk);
  codes.forEach((c, i) => {
    if ((mask[i] ?? 9) < 2) record.add(c.groupId);
  });
  return record;
}

function pct(n: number, total: number): string {
  return `${((100 * n) / total).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------------------------------------
// Property 9
// ---------------------------------------------------------------------------------------------------------

describe("Property 9: Member validity equals fragment-corner membership", () => {
  it("isValidMember equals the literal corner rule for every suit, orientation and slot, with the H/D equivalence and the C/S side change", () => {
    // Feature: qroker-playable-game, Property 9: Member validity equals fragment-corner membership
    const seen = new Set<string>();
    let runs = 0;

    const arbOrientation = fc.constantFrom<Orientation>(0, 180);
    const arbSlot = fc.constantFrom<Slot>(...SLOTS);

    fc.assert(
      fc.property(arbCard, arbOrientation, arbSlot, (card, orientation, slot) => {
        runs++;
        const suit = card.charAt(0);
        const where = `card=${card} orientation=${orientation} slot=${slot}`;
        seen.add(`${suit}/${orientation}/${slot}`);

        // Equals the independent oracle.
        expect(isValidMember(card, orientation, slot), `${where}: oracle`).toBe(oracleValid(card, orientation, slot));

        // Hearts and Diamonds: orientation does not matter. Clubs and Spades: the turn changes the side, so the
        // verdict flips in every slot.
        const at0 = isValidMember(card, 0, slot);
        const at180 = isValidMember(card, 180, slot);
        if (suit === "H" || suit === "D") expect(at0, `${where}: H/D equivalence`).toBe(at180);
        else expect(at0, `${where}: C/S side change`).toBe(!at180);

        // A card is valid in exactly 2 of the 4 slots, at either orientation.
        const validSlots = SLOTS.filter((s) => isValidMember(card, orientation, s));
        expect(validSlots.length, `${where}: valid in exactly 2 slots (got ${validSlots.join(",")})`).toBe(2);
      }),
      { seed: SEED_P9, numRuns: RUNS_P9 },
    );

    // Every one of the 4 suits x 2 orientations x 4 slots combinations was drawn.
    expect(runs, "property executed numRuns times").toBe(RUNS_P9);
    expect(seen.size, "all 32 (suit, orientation, slot) combinations were drawn").toBe(32);

    // The same statement, exhaustively over the 52 x 2 x 4 inputs.
    for (const suit of ["H", "D", "C", "S"] as const) {
      for (const rank of ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]) {
        const card = `${suit}-${rank}` as CardId;
        for (const orientation of [0, 180] as const) {
          for (const slot of SLOTS) {
            expect(isValidMember(card, orientation, slot), `${card}/${orientation}/${slot}`).toBe(oracleValid(card, orientation, slot));
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
// Property 10
// ---------------------------------------------------------------------------------------------------------

function boardWith(entries: readonly (readonly [number, number, CardId, Orientation])[]): Board {
  const cells = new Array<Board[number]>(64).fill(null);
  for (const [row, col, card, orientation] of entries) {
    cells[row * 8 + col] = Object.freeze({ card, orientation, owner: "P0" as const });
  }
  return Object.freeze(cells);
}

describe("Property 10: Detection structure", () => {
  it("returns exactly the codes of an independent brute-force scan, each well-formed, sorted by quadKey, without touching its inputs", () => {
    // Feature: qroker-playable-game, Property 10: Detection structure
    const tally = {
      runs: 0,
      planted: 0,
      occupiedCell: 0,
      emptyOrOffBoard: 0,
      withValidQuad: 0, // reference finds >= 1 code before the record is applied
      twoValidQuads: 0,
      withCode: 0, // >= 1 code returned (after the record)
      twoCodes: 0, // 2 codes returned
      completeInvalid: 0, // a complete quad that is not a code
      skipped: 0, // >= 1 code skipped because its groupId is recorded
      codesChecked: 0,
    };

    fc.assert(
      fc.property(arbCodeScenario, arbJunkIds, arbRecordMask, ({ board, placedAt, kind }, junk, mask) => {
        const { row, col } = placedAt;
        const where = `kind=${kind} cell=(${row},${col})`;
        tally.runs++;
        if (kind === "planted") tally.planted++;

        const ref = refScan(board, row, col);
        const record = recordOf(junk, ref.codes, mask);
        const expected = ref.codes.filter((c) => !record.has(c.groupId));

        // Occupancy bookkeeping for the coverage statistics.
        if (inRange(row) && inRange(col) && (board[row * 8 + col] ?? null) !== null) tally.occupiedCell++;
        else tally.emptyOrOffBoard++;
        if (ref.codes.length >= 1) tally.withValidQuad++;
        if (ref.codes.length === 2) tally.twoValidQuads++;
        if (expected.length >= 1) tally.withCode++;
        if (expected.length === 2) tally.twoCodes++;
        if (ref.completeButNotCode >= 1) tally.completeInvalid++;
        if (expected.length < ref.codes.length) tally.skipped++;

        // Inputs are snapshotted before the call.
        const boardBefore = structuredClone(board) as Board;
        const refsBefore = [...board];
        const recordBefore = [...record];

        const result = detect(board, placedAt, record);

        // candidateQuads: at most 4 elements, each contains the cell, equal to the brute-force enumeration.
        if (inRange(row) && inRange(col)) {
          const quads = candidateQuads(placedAt);
          expect(quads.length, `${where}: at most 4 candidate quads`).toBeLessThanOrEqual(4);
          for (const q of quads) {
            const containsCell = row - q.row >= 0 && row - q.row <= 1 && col - q.col >= 0 && col - q.col <= 1;
            expect(containsCell, `${where}: quad (${q.row},${q.col}) contains the cell`).toBe(true);
          }
          const own: string[] = [];
          for (let r = row - 1; r <= row; r++) for (let c = col - 1; c <= col; c++) if (r >= 0 && c >= 0 && r <= 6 && c <= 6) own.push(`${r},${c}`);
          expect(quads.map((q) => `${q.row},${q.col}`).sort(), `${where}: candidate quads`).toEqual(own.sort());
        }

        // Completeness and exactness: the same set of codes (quadKeys, cards, orientations, sums), in the same order.
        expect(result.map(project), `${where}: codes`).toEqual(expected.map(project));
        tally.codesChecked += result.length;

        // Order: default string sort of the quad keys.
        const keys = result.map((c) => c.quadKey);
        expect(keys, `${where}: sorted by quadKey`).toEqual([...keys].sort());
        expect(new Set(keys).size, `${where}: quadKeys are distinct`).toBe(keys.length);

        // Structure of every returned code.
        for (const code of result) {
          const tag = `${where} code ${code.quadKey}`;
          const tl = { row: code.topLeft.row, col: code.topLeft.col };
          expect(code.quadKey, `${tag}: quadKey is the notation of the top-left cell`).toBe(oracleKey(tl.row, tl.col));
          // The quad contains the placed cell.
          expect(row - tl.row >= 0 && row - tl.row <= 1 && col - tl.col >= 0 && col - tl.col <= 1, `${tag}: contains the cell`).toBe(true);

          const spots: readonly (readonly [number, number, Slot])[] = [
            [tl.row, tl.col, "TL"],
            [tl.row, tl.col + 1, "TR"],
            [tl.row + 1, tl.col, "BL"],
            [tl.row + 1, tl.col + 1, "BR"],
          ];
          spots.forEach(([r, c, slot], i) => {
            const cell = board[r * 8 + c] ?? null;
            expect(cell, `${tag}: ${slot} cell is occupied`).not.toBeNull();
            const placed = cell as NonNullable<typeof cell>;
            expect(code.cards[i], `${tag}: ${slot} card is the board card`).toBe(placed.card);
            expect(code.orientations[i], `${tag}: ${slot} orientation is the board orientation`).toBe(placed.orientation);
            expect(oracleValid(placed.card, placed.orientation, slot), `${tag}: ${slot} member is valid`).toBe(true);
          });

          expect(new Set(code.cards).size, `${tag}: 4 pairwise distinct cards`).toBe(4);
          const sum = code.cards.reduce((s, c) => s + oracleValue(c), 0);
          expect(code.hiddenSum, `${tag}: hiddenSum equals the rank-table sum`).toBe(sum);
          expect(code.hiddenSum >= 4 && code.hiddenSum <= 52, `${tag}: hiddenSum in [4, 52]`).toBe(true);

          // groupId: sorted ids; the same for every order of the cards.
          expect(code.groupId, `${tag}: groupId`).toBe(oracleGroupId(code.cards));
          expect(oracleGroupId([...code.cards].reverse()), `${tag}: groupId is order independent`).toBe(code.groupId);
          expect(record.has(code.groupId), `${tag}: groupId is not recorded`).toBe(false);
        }

        // Inputs unchanged: deep equality with the snapshot, same entry references, same record.
        expect(board, `${where}: board unchanged`).toEqual(boardBefore);
        for (let i = 0; i < 64; i++) expect(board[i] === refsBefore[i], `${where}: board entry ${i} same reference`).toBe(true);
        expect([...record], `${where}: scored groups unchanged`).toEqual(recordBefore);
      }),
      { seed: SEED_P10, numRuns: RUNS_P10 },
    );

    // HIT-RATES (seed 20260510, 400 runs): planted 65.5%, occupied cell 88.5%, empty or off-board cell 11.5%,
    // reference finds >= 1 valid quad 51.0% and 2 valid quads 14.0% (before the record), >= 1 code returned 40.0%,
    // 2 codes returned 7.3%, a complete quad that is not a code 45.5%, a skipped scored group 16.5%.
    // The thresholds below are well under these values.
    const n = tally.runs;
    expect(n, "property executed numRuns times").toBe(RUNS_P10);
    // No vacuous pass: every case class was reached in a meaningful share of the runs.
    expect(tally.planted, `planted ${pct(tally.planted, n)}`).toBeGreaterThan(0.4 * n);
    expect(tally.occupiedCell, `occupied cell ${pct(tally.occupiedCell, n)}`).toBeGreaterThan(0.8 * n);
    expect(tally.emptyOrOffBoard, `empty or off-board cell ${pct(tally.emptyOrOffBoard, n)}`).toBeGreaterThan(0);
    expect(tally.withCode, `runs with >= 1 code ${pct(tally.withCode, n)}`).toBeGreaterThanOrEqual(0.25 * n);
    expect(tally.twoCodes, `runs with 2 codes ${pct(tally.twoCodes, n)}`).toBeGreaterThanOrEqual(0.05 * n);
    expect(tally.completeInvalid, `runs with a complete invalid quad ${pct(tally.completeInvalid, n)}`).toBeGreaterThanOrEqual(0.1 * n);
    expect(tally.skipped, `runs with a skipped scored group ${pct(tally.skipped, n)}`).toBeGreaterThanOrEqual(0.05 * n);
    expect(tally.codesChecked, "codes were compared field by field").toBeGreaterThanOrEqual(0.25 * n);

    // Examples outside the generator: a quad that holds the same card 4 times with valid orientations is complete,
    // valid in every slot, and still not a code (cards must be pairwise distinct); four distinct clubs placed the
    // same way are a code. Both agree with the reference.
    const orientationsBySlot: readonly Orientation[] = [0, 180, 0, 180]; // clubs: TL 0, TR 180, BL 0, BR 180
    const quadCells: readonly (readonly [number, number])[] = [
      [3, 3],
      [3, 4],
      [4, 3],
      [4, 4],
    ];
    const same = boardWith(quadCells.map(([r, c], i) => [r, c, "C-5", orientationsBySlot[i] as Orientation] as const));
    expect(refScan(same, 3, 3).codes, "reference: the same card four times is not a code").toEqual([]);
    expect(detect(same, { row: 3, col: 3 }, new Set()), "detect: the same card four times is not a code").toEqual([]);
    const clubs: readonly CardId[] = ["C-5", "C-6", "C-7", "C-8"];
    const distinct = boardWith(quadCells.map(([r, c], i) => [r, c, clubs[i] as CardId, orientationsBySlot[i] as Orientation] as const));
    const found = detect(distinct, { row: 4, col: 4 }, new Set());
    expect(found.map(project), "four distinct clubs make one code").toEqual(refScan(distinct, 4, 4).codes.map(project));
    expect(found).toHaveLength(1);
    expect(found[0]?.hiddenSum).toBe(26);
    expect(found[0]?.quadKey).toBe("D4");
  });
});

// ---------------------------------------------------------------------------------------------------------
// Property 11
// ---------------------------------------------------------------------------------------------------------

describe("Property 11: Detection idempotence", () => {
  it("gives equal results for equal inputs, nothing once the first result is recorded, and skips exactly a recorded subset", () => {
    // Feature: qroker-playable-game, Property 11: Detection idempotence
    const tally = {
      runs: 0,
      withCode: 0,
      twoCodes: 0,
      skippedByBase: 0, // base record already holds a code of the quad set
      properSubset: 0, // a non-empty proper subset of the first result was recorded
      codesChecked: 0,
    };

    fc.assert(
      fc.property(
        arbCodeScenario,
        arbJunkIds,
        arbRecordMask,
        fc.array(fc.boolean(), { minLength: 4, maxLength: 4 }),
        ({ board, placedAt, kind }, junk, mask, subsetMask) => {
          const { row, col } = placedAt;
          const where = `kind=${kind} cell=(${row},${col})`;
          tally.runs++;

          // The record of the call: junk ids plus some groups of the reference codes.
          const ref = refScan(board, row, col);
          const base = recordOf(junk, ref.codes, mask);
          const baseBefore = [...base];
          const boardBefore = structuredClone(board) as Board;

          const first = detect(board, placedAt, base);
          const second = detect(board, placedAt, base);
          expect(second, `${where}: same inputs, equal results`).toEqual(first);
          expect(first.map(project), `${where}: first result is the reference minus the record`).toEqual(
            ref.codes.filter((c) => !base.has(c.groupId)).map(project),
          );
          if (first.length >= 1) tally.withCode++;
          if (first.length === 2) tally.twoCodes++;
          if (first.length < ref.codes.length) tally.skippedByBase++;
          tally.codesChecked += first.length;

          // Extended with the groupIds of the first result: nothing is left.
          const extended = new Set<string>([...base, ...first.map((c) => c.groupId)]);
          const extendedBefore = [...extended];
          expect(detect(board, placedAt, extended), `${where}: nothing after recording the first result`).toEqual([]);
          expect([...extended], `${where}: extended record unchanged`).toEqual(extendedBefore);

          // Extended with only a subset: exactly the recorded codes are skipped, the others stay unchanged.
          const subset = first.filter((_, i) => subsetMask[i] === true);
          if (subset.length > 0 && subset.length < first.length) tally.properSubset++;
          const withSubset = new Set<string>([...base, ...subset.map((c) => c.groupId)]);
          const third = detect(board, placedAt, withSubset);
          const subsetIds = new Set(subset.map((c) => c.groupId));
          expect(third, `${where}: only the recorded subset is skipped`).toEqual(first.filter((c) => !subsetIds.has(c.groupId)));
          expect(third.length, `${where}: skipped count`).toBe(first.length - subset.length);

          // Inputs of all calls are unchanged.
          expect([...base], `${where}: base record unchanged`).toEqual(baseBefore);
          expect(board, `${where}: board unchanged`).toEqual(boardBefore);
        },
      ),
      { seed: SEED_P11, numRuns: RUNS_P11 },
    );

    // HIT-RATES (seed 20260511, 300 runs): >= 1 code returned 44.0%, 2 codes 11.3%, a skipped scored group 14.0%,
    // a non-empty proper subset recorded 4.0%. The thresholds below are well under these values.
    const n = tally.runs;
    expect(n, "property executed numRuns times").toBe(RUNS_P11);
    expect(tally.withCode, `runs with >= 1 code ${pct(tally.withCode, n)}`).toBeGreaterThanOrEqual(0.25 * n);
    expect(tally.twoCodes, `runs with 2 codes ${pct(tally.twoCodes, n)}`).toBeGreaterThanOrEqual(0.05 * n);
    expect(tally.skippedByBase, `runs with a skipped scored group ${pct(tally.skippedByBase, n)}`).toBeGreaterThanOrEqual(0.05 * n);
    expect(tally.properSubset, `runs with a proper non-empty subset ${pct(tally.properSubset, n)}`).toBeGreaterThanOrEqual(0.02 * n);
    expect(tally.codesChecked, "codes were compared").toBeGreaterThanOrEqual(0.25 * n);
  });
});
