// Unit tests for the turn order (task 7.1). Requirement 6.1 (OQ-5).
import { describe, expect, it } from "vitest";
import { SEATS, isPlayerId, nextSeat } from "./turn";
import type { PlayerId } from "./types";

describe("nextSeat: the four transitions", () => {
  it("P0 -> P1", () => expect(nextSeat("P0")).toBe("P1"));
  it("P1 -> P2", () => expect(nextSeat("P1")).toBe("P2"));
  it("P2 -> P3", () => expect(nextSeat("P2")).toBe("P3"));
  it("P3 -> P0 (wraps around)", () => expect(nextSeat("P3")).toBe("P0"));
});

describe("nextSeat: cycles", () => {
  it("four steps return to the start, from every seat", () => {
    for (const start of ["P0", "P1", "P2", "P3"] as const) {
      expect(nextSeat(nextSeat(nextSeat(nextSeat(start))))).toBe(start);
    }
  });

  it("one cycle from P0 visits P0, P1, P2, P3 in order with no skip and no duplicate", () => {
    const visited: PlayerId[] = [];
    let seat: PlayerId = "P0";
    for (let i = 0; i < 4; i++) {
      visited.push(seat);
      seat = nextSeat(seat);
    }
    expect(visited).toEqual(["P0", "P1", "P2", "P3"]);
    expect(new Set(visited).size).toBe(4);
    expect(seat).toBe("P0");
  });

  it("12 steps are three cycles and give each seat exactly 3 turns", () => {
    const counts: Record<PlayerId, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
    const sequence: PlayerId[] = [];
    let seat: PlayerId = "P0";
    for (let i = 0; i < 12; i++) {
      sequence.push(seat);
      counts[seat] += 1;
      seat = nextSeat(seat);
    }
    expect(counts).toEqual({ P0: 3, P1: 3, P2: 3, P3: 3 });
    expect(sequence).toEqual(["P0", "P1", "P2", "P3", "P0", "P1", "P2", "P3", "P0", "P1", "P2", "P3"]);
    expect(seat).toBe("P0");
  });

  it("never returns the seat it was given", () => {
    for (const seat of ["P0", "P1", "P2", "P3"] as const) expect(nextSeat(seat)).not.toBe(seat);
  });

  it("is deterministic: repeated calls give the same seat", () => {
    for (const seat of ["P0", "P1", "P2", "P3"] as const) {
      expect(nextSeat(seat)).toBe(nextSeat(seat));
    }
  });
});

describe("SEATS and isPlayerId", () => {
  it("SEATS lists exactly the four seats in turn order and is frozen", () => {
    expect([...SEATS]).toEqual(["P0", "P1", "P2", "P3"]);
    expect(Object.isFrozen(SEATS)).toBe(true);
  });

  it("isPlayerId accepts the four seat ids only", () => {
    for (const seat of ["P0", "P1", "P2", "P3"]) expect(isPlayerId(seat)).toBe(true);
    for (const bad of ["P4", "p0", "", " P0", "NEUTRAL", null, undefined, 0, 1, {}, []]) {
      expect(isPlayerId(bad)).toBe(false);
    }
  });
});

describe("nextSeat: invalid runtime input throws RangeError", () => {
  const bad: readonly unknown[] = ["P4", "P-1", "p0", "", "NEUTRAL", null, undefined, 0, 1, 3, NaN, {}, ["P0"], true];
  it("rejects values that are not one of the four seat ids", () => {
    for (const value of bad) {
      expect(() => nextSeat(value as PlayerId), String(value)).toThrow(RangeError);
    }
  });

  it("does not coerce: a String object or a number does not stand for a seat", () => {
    expect(() => nextSeat(new String("P0") as unknown as PlayerId)).toThrow(RangeError);
    expect(() => nextSeat(0 as unknown as PlayerId)).toThrow(RangeError);
  });
});
