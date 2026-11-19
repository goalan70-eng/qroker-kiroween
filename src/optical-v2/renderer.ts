import {
  corners, criticalFrame, darkFrame, dataCells, format, mirrorX, noData, opposite,
  type Corner, type Offset, type Orientation, type Rect,
} from './format';
import { mirrorPiece, type GeneratedCard, type Piece } from './fragment';

export interface Placement {
  card: GeneratedCard;
  orientation: Orientation;
  face?: 'front' | 'back'; // Back observed after a physical left-right flip.
  printOffset?: Offset;
  cutOffset?: Offset;
}

export type Placements = Record<Corner, Placement>;

export interface RenderOptions {
  pixelsPerModule?: number;
  gapModules?: number;
}

interface Seam {
  readonly between: readonly [Corner, Corner];
  readonly gapModules: number;
  readonly frameStepModules: number;
}

export interface SquareRaster {
  readonly formatVersion: typeof format.version;
  readonly decoration: 'OFF';
  readonly width: number;
  readonly pixelsPerModule: number;
  readonly gray: Uint8Array;
  readonly shared: Uint8Array;
  readonly data: Int8Array;
  readonly keepOut: Uint8Array;
  readonly centralVoid: Uint8Array;
  readonly seams: readonly Seam[];
}

const zero = [0, 0] as const;
const dataRects: readonly Rect[] = dataCells.map(([u, v]) => [u, v, u + 1, v + 1]);
const protectedRects = [...dataRects, ...criticalFrame];
const radius = format.radiusMm / format.moduleMm;
const vertex = format.quiet + format.piece;

function cutAway(u: number, v: number): boolean {
  return u < 0 || v < 0 || (u < radius && v < radius &&
    (radius - u) ** 2 + (radius - v) ** 2 > radius ** 2);
}

function validateOffset(offset: Offset, gap: number): void {
  if (offset.some((value) => !Number.isFinite(value) || Math.abs(value) + gap / 2 > format.quiet)) {
    throw new RangeError('Offsets must fit within the rendered viewport');
  }
}

function observedPiece(slot: Corner, placement: Placement): Piece {
  const { card, orientation, face = 'front' } = placement;
  if (orientation !== 0 && orientation !== 180) throw new RangeError('Expected 0° or 180° orientation');
  const inward = opposite[slot];
  const body = orientation === 0 ? inward : opposite[inward];
  const printedCorner = face === 'front' ? body : mirrorX[body];
  const piece = card[face].find((p) => p.corner === printedCorner);
  if (!piece) throw new RangeError(`${slot} has no inward optical piece for ${card.id}`);
  return face === 'front' ? piece : mirrorPiece(piece);
}

function seamsOf(placements: Placements, gap: number): Seam[] {
  const joins = [
    ['TL', 'TR', 0], ['BL', 'BR', 0], ['TL', 'BL', 1], ['TR', 'BR', 1],
  ] as const;
  return joins.map(([a, b, axis]) => {
    const ap = placements[a].printOffset ?? zero;
    const ac = placements[a].cutOffset ?? zero;
    const bp = placements[b].printOffset ?? zero;
    const bc = placements[b].cutOffset ?? zero;
    return {
      between: [a, b],
      gapModules: Math.max(0, gap + Math.max(bp[axis], bc[axis]) - Math.min(ap[axis], ac[axis])),
      frameStepModules: Math.abs(bp[1 - axis]! - ap[1 - axis]!),
    };
  });
}

export function renderSquare(placements: Placements, options: RenderOptions = {}): SquareRaster {
  const { pixelsPerModule = 16, gapModules = 0 } = options;
  if (!Number.isInteger(pixelsPerModule) || pixelsPerModule < 1 || pixelsPerModule > 64) {
    throw new RangeError('Expected 1 to 64 pixels per module');
  }
  if (!Number.isFinite(gapModules) || gapModules < 0 || gapModules > 2 * format.quiet) {
    throw new RangeError('Gap must fit within the rendered viewport');
  }
  if (new Set(corners.map((slot) => placements[slot].card.id)).size !== 4) {
    throw new RangeError('Expected four distinct cards');
  }

  const width = (format.square + 2 * format.quiet) * pixelsPerModule;
  const length = width * width;
  const gray = new Uint8Array(length).fill(255);
  const shared = new Uint8Array(length);
  const data = new Int8Array(length).fill(noData);
  const keepOut = new Uint8Array(length);
  const centralVoid = new Uint8Array(length);
  const coordinate = (pixel: number) => (pixel + 0.5) / pixelsPerModule;
  for (let y = 0; y < width; y++) {
    const v = Math.abs(coordinate(y) - vertex);
    for (let x = 0; x < width; x++) {
      const u = Math.abs(coordinate(x) - vertex);
      const exterior = u >= format.piece || v >= format.piece;
      const i = y * width + x;
      centralVoid[i] = Number(!exterior && cutAway(u, v));
      keepOut[i] = Number(exterior || protectedRects.some(([l, t, r, b]) => u >= l && u < r && v >= t && v < b));
    }
  }

  for (const slot of corners) {
    const placement = placements[slot];
    const piece = observedPiece(slot, placement);
    const print = placement.printOffset ?? zero;
    const cut = placement.cutOffset ?? zero;
    validateOffset(print, gapModules);
    validateOffset(cut, gapModules);
    const sx = slot.endsWith('L') ? -1 : 1;
    const sy = slot.startsWith('T') ? -1 : 1;
    const projectionX = vertex + sx * gapModules / 2;
    const projectionY = vertex + sy * gapModules / 2;
    const left = projectionX - (sx < 0 ? format.piece : 0) + print[0];
    const top = projectionY - (sy < 0 ? format.piece : 0) + print[1];
    const cutX = projectionX + cut[0];
    const cutY = projectionY + cut[1];
    const reverse = placement.orientation === 180;

    for (let y = 0; y < width; y++) {
      const my = Math.floor(coordinate(y) - top);
      if (my < 0 || my >= format.piece) continue;
      const v = sy * (coordinate(y) - cutY);
      for (let x = 0; x < width; x++) {
        const mx = Math.floor(coordinate(x) - left);
        if (mx < 0 || mx >= format.piece || cutAway(sx * (coordinate(x) - cutX), v)) continue;
        const tx = reverse ? format.piece - 1 - mx : mx;
        const ty = reverse ? format.piece - 1 - my : my;
        const source = ty * format.piece + tx;
        const target = y * width + x;
        if (shared[target]) throw new RangeError('Projected optical pieces overlap');
        shared[target] = piece.shared[source]!;
        data[target] = piece.data[source]!;
        if (shared[target] === darkFrame || data[target] === 1) gray[target] = 0;
      }
    }
  }

  return {
    formatVersion: format.version, decoration: 'OFF', width, pixelsPerModule,
    gray, shared, data, keepOut, centralVoid, seams: seamsOf(placements, gapModules),
  };
}
