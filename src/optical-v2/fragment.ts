import {
  darkFrame, dataCells, format, lightField, mirrorX, noData, printedCorners,
  type Corner, type Suit,
} from './format';

const suits = ['H', 'D', 'C', 'S'] as const;
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
export const cardIds: readonly string[] = Object.freeze(suits.flatMap((suit) => ranks.map((rank) => `${suit}-${rank}`)));

export interface Piece {
  readonly formatVersion: typeof format.version;
  readonly corner: Corner;
  readonly shared: Uint8Array;
  readonly data: Int8Array;
}

export interface GeneratedCard {
  readonly formatVersion: typeof format.version;
  readonly id: string;
  readonly front: readonly [Piece, Piece];
  readonly back: readonly [Piece, Piece];
}

function encodeOrdinal(ordinal: number): number {
  const polynomial = 0b111010001; // x^8 + x^7 + x^6 + x^4 + 1
  const message = ordinal << 8;
  let remainder = message;
  for (let bit = 14; bit >= 8; bit--) {
    if (remainder & (1 << bit)) remainder ^= polynomial << (bit - 8);
  }
  return message | remainder;
}

// The target has square symmetry. Assign at most one ID to an x/y transpose pair.
const transposedBits = dataCells.map(([u, v]) => dataCells.findIndex(([x, y]) => x === v && y === u));
const transpose = (word: number): number =>
  transposedBits.reduce((result, sourceBit, targetBit) => result | (((word >>> sourceBit) & 1) << targetBit), 0);
const codewords = Array.from({ length: 127 }, (_, i) => encodeOrdinal(i + 1))
  .filter((word) => word <= transpose(word))
  .slice(0, cardIds.length);

function moduleIndex(corner: Corner, u: number, v: number): number {
  const x = corner.endsWith('L') ? u : format.piece - 1 - u;
  const y = corner.startsWith('T') ? v : format.piece - 1 - v;
  return y * format.piece + x;
}

function printPiece(corner: Corner, word: number): Piece {
  const n = format.piece;
  const shared = new Uint8Array(n * n).fill(lightField);
  const data = new Int8Array(n * n).fill(noData);
  for (let i = 0; i < n; i++) {
    shared[moduleIndex(corner, n - 1, i)] = darkFrame;
    shared[moduleIndex(corner, i, n - 1)] = darkFrame;
  }
  for (const [bit, [u, v]] of dataCells.entries()) data[moduleIndex(corner, u, v)] = (word >>> bit) & 1;
  return { formatVersion: format.version, corner, shared, data };
}

export function mirrorPiece(piece: Piece): Piece {
  const n = format.piece;
  const shared = new Uint8Array(n * n);
  const data = new Int8Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const source = y * n + n - 1 - x;
      const target = y * n + x;
      shared[target] = piece.shared[source]!;
      data[target] = piece.data[source]!;
    }
  }
  return { formatVersion: format.version, corner: mirrorX[piece.corner], shared, data };
}

export function generateCard(id: string): GeneratedCard {
  const word = codewords[cardIds.indexOf(id)];
  if (word === undefined) throw new RangeError(`Unknown card: ${id}`);
  const [first, second] = printedCorners[id[0] as Suit];
  const front = [printPiece(first, word), printPiece(second, word)] as const;
  return { formatVersion: format.version, id, front, back: [mirrorPiece(front[0]), mirrorPiece(front[1])] };
}
