import type { CardId, PlayerId } from '../core/types';
import stems from './back-marks/index.json';

const files = import.meta.glob<string>('./back-marks/*.svg', {
  eager: true, import: 'default', query: '?url',
});

/** Each overlay contains the original pair of 15 mm fragments in board coordinates. */
export function backArt(card: CardId): string {
  return files[`./back-marks/${stems[card]}.svg`]!;
}

export interface TableBacks {
  readonly board: readonly (string | null)[];
  readonly seatMarks: Readonly<Record<PlayerId, readonly string[]>>;
  readonly deckTop?: string;
}

export function backStyle(url?: string | null): { style?: string } {
  return url ? { style: `--card-marks: url("${url}")` } : {};
}
