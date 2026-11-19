import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cardIds, generateCard, type Piece } from '../fragment';
import type { Corner } from '../format';
import { renderSquare, type Placements } from '../renderer';

const fixture = JSON.parse(readFileSync(new URL(
  '../../../docs/optical-v2/results/m2-feasibility.json', import.meta.url,
), 'utf8')) as {
  placement: { pieces: { uses: { suit: string; bodyCorner: Corner; orientation: 0 | 180; slot: Corner }[] }[] };
  geometry: { models: { square: number; quiet: number; elements: { id: string; rect: number[] }[];
    keepOut: { protectedElementIds: string[] } }[] };
};
const corners = ['TL', 'TR', 'BL', 'BR'] as const;
const observedCells = [2, 3, 4, 5].flatMap((v) => [2, 3, 4, 5].map((u) => [u, v] as const)).slice(1);
const nominal = (): Placements => ({
  TL: { card: generateCard('H-5'), orientation: 0 },
  TR: { card: generateCard('D-9'), orientation: 0 },
  BL: { card: generateCard('C-J'), orientation: 0 },
  BR: { card: generateCard('S-2'), orientation: 0 },
});

const readCell = (raster: ReturnType<typeof renderSquare>, slot: Corner, u: number, v: number): number => {
  const n = raster.pixelsPerModule;
  const x = Math.floor((9 + (slot.endsWith('L') ? -1 : 1) * (u + 0.5)) * n);
  const y = Math.floor((9 + (slot.startsWith('T') ? -1 : 1) * (v + 0.5)) * n);
  return raster.data[y * raster.width + x] ?? -1;
};

function readPrint(piece: Piece): number[] {
  return observedCells.map(([u, v]) => {
    const x = piece.corner.endsWith('L') ? u : 7 - u;
    const y = piece.corner.startsWith('T') ? v : 7 - v;
    return piece.data[y * 8 + x]!;
  });
}

describe('V2-M3 format 2.0.0-m3.1, decoration OFF', () => {
  it('generates 52 distinct cards and deterministic optical layers for both faces', () => {
    expect(cardIds).toHaveLength(52);
    expect(new Set(cardIds).size).toBe(52);
    const cards = cardIds.map(generateCard);
    expect(cards).toEqual(cardIds.map(generateCard));
    expect(cards.flatMap(({ front }) => front)).toHaveLength(104);
    expect(cards.flatMap(({ back }) => back)).toHaveLength(104);
    expect(() => generateCard('JOKER')).toThrow(RangeError);
    for (const { front, back, formatVersion } of cards) {
      expect(formatVersion).toBe('2.0.0-m3.1');
      expect(back.map(({ corner }) => corner).some((corner) => front.some((piece) => piece.corner === corner))).toBe(false);
    }
    const words = cards.map(({ front: [piece] }) => readPrint(piece).join(''));
    expect(new Set(words).size).toBe(52);
    const base = cards[0]!;
    const saved = generateCard(base.id).back;
    cards[1]!.front[0].shared.fill(0);
    cards[1]!.front[0].data.fill(-1);
    expect(base.back).toEqual(saved);
    expect(generateCard(base.id).back).toEqual(saved);
  });

  it('keeps distinct IDs at least five bits apart in both aligned and swapped-axis readings', () => {
    const words = cardIds.map((id) => readPrint(generateCard(id).front[0]));
    const transpose = observedCells.map(([u, v]) => observedCells.findIndex(([x, y]) => x === v && y === u));
    for (const [i, a] of words.entries()) {
      expect(a).toHaveLength(15);
      expect(a.every((bit) => bit === 0 || bit === 1)).toBe(true);
      expect(a.some((bit) => bit === 1)).toBe(true);
      for (const b of words.slice(i + 1)) {
        expect(a.filter((bit, index) => bit !== b[index]).length).toBeGreaterThanOrEqual(5);
        expect(a.filter((bit, index) => bit !== b[transpose[index]!]).length).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('matches all independently recorded 16 classes with all 13 ranks in both observable faces', () => {
    const classes = fixture.placement.pieces.flatMap(({ uses }) => uses);
    expect(classes).toHaveLength(16);
    const canonical = renderSquare(nominal(), { pixelsPerModule: 4 }).shared;
    for (const { suit, bodyCorner, orientation, slot } of classes) {
      for (const id of cardIds.filter((card) => card.startsWith(suit + '-'))) {
        const card = generateCard(id);
        const placements = nominal();
        // Avoid a duplicate when the fixture's card also appears at another slot.
        for (const other of corners) {
          const existing = placements[other];
          if (existing.card.id === id) {
            existing.card = generateCard(id.endsWith('-A') ? suit + '-K' : suit + '-A');
          }
        }
        const reference = card.front.find((piece) => piece.corner === bodyCorner)!;
        expect(reference, id + ' ' + bodyCorner).toBeDefined();
        placements[slot] = { card, orientation };
        const front = renderSquare(placements, { pixelsPerModule: 4 });
        const context = id + ' ' + bodyCorner + ' ' + orientation + ' ' + slot;
        expect(Buffer.from(front.shared).equals(Buffer.from(canonical)), 'FRONT ' + context).toBe(true);
        expect(observedCells.map(([u, v]) => readCell(front, slot, u, v)), context).toEqual(readPrint(reference));
        placements[slot] = { card, orientation, face: 'back' };
        const back = renderSquare(placements, { pixelsPerModule: 4 });
        expect(Buffer.from(back.gray).equals(Buffer.from(front.gray)), 'BACK flip left-right ' + context).toBe(true);
      }
    }
  });

  it('mirrors the optical layer and preserves observed pixels after both ideal flip directions', () => {
    const { front, back } = generateCard('C-7');
    for (const [i, piece] of front.entries()) {
      const reverse = back[i]!;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        expect(reverse.shared[y * 8 + 7 - x]).toBe(piece.shared[y * 8 + x]);
        expect(reverse.data[y * 8 + 7 - x]).toBe(piece.data[y * 8 + x]);
        const topBottomSource = (7 - y) * 8 + x;
        const turnedSource = (7 - y) * 8 + 7 - x;
        expect(reverse.shared[topBottomSource]).toBe(piece.shared[turnedSource]);
        expect(reverse.data[topBottomSource]).toBe(piece.data[turnedSource]);
      }
    }
    const setup = nominal();
    const card = setup.TL.card;
    setup.TL = { card: { ...card, back: card.front }, orientation: 0, face: 'back' };
    expect(() => renderSquare(setup)).toThrow(/TL.*inward/);
  });

  it('renders deterministically with exact M2 keep-out agreement and no empty area outside the nominal void', () => {
    const a = renderSquare(nominal(), { pixelsPerModule: 16 });
    expect(a).toEqual(renderSquare(nominal(), { pixelsPerModule: 16 }));
    expect(a.formatVersion).toBe('2.0.0-m3.1');
    expect(a.decoration).toBe('OFF');
    const model = fixture.geometry.models.find(({ square, quiet }) => square === 16 && quiet === 1)!;
    const areas = model.elements.filter(({ id }) => model.keepOut.protectedElementIds.includes(id));
    const expected = new Uint8Array(a.width ** 2);
    for (let y = 0; y < a.width; y++) for (let x = 0; x < a.width; x++) {
      const u = Math.abs((x + 0.5) / 16 - 9);
      const v = Math.abs((y + 0.5) / 16 - 9);
      const quiet = u >= 8 || v >= 8;
      const voidAt = !quiet && u < 2 && v < 2 && Math.hypot(2 - u, 2 - v) > 2;
      const protectedAt = areas.some(({ rect: [l, t, r, b] }) => u >= l! && u < r! && v >= t! && v < b!);
      const i = y * a.width + x;
      expected[i] = Number(quiet || protectedAt);
      if (Boolean(a.centralVoid[i]) !== voidAt || (a.shared[i] === 0) !== (voidAt || quiet)) {
        throw new Error('Nominal coverage differs at sample ' + i);
      }
      if ((voidAt || quiet) && (a.data[i] !== -1 || a.gray[i] !== 255 || (voidAt && protectedAt))) {
        throw new Error('Ink or protected data at blank sample ' + i);
      }
    }
    expect(a.keepOut).toEqual(expected);
    expect(a.seams.every(({ gapModules, frameStepModules }) => gapModules === 0 && frameStepModules === 0)).toBe(true);
  });

  it('reports seam gaps and frame steps when print and cut positions differ', () => {
    const shifted = nominal();
    shifted.TL.printOffset = [0, 0.125];
    shifted.TL.cutOffset = [-0.125, 0];
    const rendered = renderSquare(shifted, { gapModules: 0.25, pixelsPerModule: 16 });
    expect(rendered.seams).toContainEqual({ between: ['TL', 'TR'], gapModules: 0.375, frameStepModules: 0.125 });
    expect(rendered.shared).not.toEqual(renderSquare(nominal(), { pixelsPerModule: 16 }).shared);
    expect(() => renderSquare(nominal(), { gapModules: -1 })).toThrow(RangeError);
    const duplicate = nominal();
    duplicate.BR = duplicate.TL;
    expect(() => renderSquare(duplicate)).toThrow(/distinct/);
  });
});
