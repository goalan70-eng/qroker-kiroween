/**
 * Reference comparison for the Scoring Companion (design.md, Optical Marker System, section 7 step 8, and
 * the `ReferenceCheck` interface; task 5.2; requirements 5.7, 13.2, 13.3, 13.9).
 *
 * SCOPE. This module is logically separate from optical decoding. `decodeGroup()` never sees a reference
 * and does not import this file; this file imports only TYPES from './decode-group'. The reference card set
 * may come from a board record kept by the caller, but this module takes no board object, only the four
 * card identities in the parameter `referenceCards`. It compares card SETS and nothing else. It does not
 * decide gameplay consequences: whether to ask for a re-scan, switch to manual entry or keep the previous
 * state belongs to the caller. It performs no I/O, holds no state and never mutates its inputs (deeply
 * frozen inputs are accepted).
 *
 * NO SUBSTITUTION (Property 25). The reference never replaces what was decoded. On a mismatch the returned
 * object carries the ORIGINAL decoder result untouched in `decoded`, the decoder's own identities in
 * `decodedCards`, and the reference identities only in `referenceCards` / `onlyInReference`.
 *
 * RETURN CONVENTION (extension relative to design.md, which returns an OpticalDecodeResult). The function
 * returns:
 *  - the SAME result object (identity-equal, not a copy) when the result is IDENTIFIED and the reference
 *    matches, and also when the result is not IDENTIFIED at all (nothing to compare; no success is
 *    manufactured and no reference identity is injected);
 *  - `{ kind: 'REFERENCE_MISMATCH', ... }` when an IDENTIFIED result disagrees with a valid reference;
 *  - `{ kind: 'INVALID_REFERENCE', ... }` when the reference itself is unusable (extension kind).
 * INVARIANT: `compare(result, reference).kind === 'IDENTIFIED'` holds exactly when the result was
 * IDENTIFIED, the reference was valid, and the reference card set equals the decoded card set, the decoded
 * result is structurally sound, and its hiddenSum equals the sum recomputed from its cards.
 *
 * PRECEDENCE.
 *  0. `result` that is not an object (null, undefined, primitive) is a programming error: TypeError.
 *  1. The reference is validated first, for every result kind. It must be an array of exactly 4 DISTINCT
 *     cards of the standard 52-card deck. A card is the codebook-style string `H-A` .. `S-K` (suit H, D, C
 *     or S; rank A, 2..10, J, Q, K; strict and case-sensitive, e.g. `S-10`) or an object with exactly the
 *     own keys `suit` and `rank`, both strings of the same domains (rank `'10'`, not the number 10). The
 *     object is normalised to the string form. Jokers (any joker-like string or key), unknown suits or ranks,
 *     lowercase, other types, wrong length and duplicates (also across string/object spellings) make the
 *     reference invalid -> INVALID_REFERENCE carrying the original result. Bad data never throws.
 *     Problem reasons: NOT_AN_ARRAY (index null); WRONG_LENGTH (index null); NOT_A_CARD (entry has the
 *     wrong type or shape); UNKNOWN_CARD (card-shaped but not in the deck, e.g. `H-11`, `h-a`, `X-A`);
 *     DUPLICATE_CARD (reported at the later index); JOKER.
 *  2. A result whose kind is not 'IDENTIFIED' is returned unchanged.
 *  3. An IDENTIFIED result is validated structurally (cards = 4 distinct valid card ids, hiddenSum = finite
 *     integer). A malformed one gives REFERENCE_MISMATCH with reason DECODED_RESULT_MALFORMED (no throw).
 *     Otherwise the decoded set is compared with the reference as a SET (order independent). Different
 *     sets give CARD_SET_DIFFERS even when the sums are equal: sums are never compared alone. The decoded sum
 *     is recomputed from the decoded cards with this module's own lookup; if the reported hiddenSum differs,
 *     DECODED_SUM_INCONSISTENT is added (an internal inconsistency of the decoder output, never accepted).
 *     All applicable reasons are listed, in the order CARD_SET_DIFFERS, DECODED_SUM_INCONSISTENT,
 *     DECODED_RESULT_MALFORMED.
 *  4. Match: the original IDENTIFIED object is returned.
 *
 * Card_Value lookup (A=1, 2..10 face value, J=11, Q=12, K=13) is this module's own table. It is not imported
 * from the decoder or any other module and is not derived from decoder output.
 *
 * LIMITS. Only the card set and the sum are compared. Slot assignment, reflection, orientation and the
 * quality of the reading are not compared. Tested on synthetic images only.
 */
import type { GroupDecodeResult } from './decode-group';

// ---------------------------------------------------------------------------------------------
// Own deck and Card_Value table
// ---------------------------------------------------------------------------------------------

const SUITS: readonly string[] = ['H', 'D', 'C', 'S'];
const RANKS: readonly string[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const CARD_VALUE_BY_RANK: Readonly<Record<string, number>> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13,
};
const DECK: ReadonlySet<string> = new Set(SUITS.flatMap((s) => RANKS.map((r) => `${s}-${r}`)));

const JOKER_LIKE = /joker|^jk$/i;
const CARD_SHAPED = /^[A-Za-z0-9]{1,6}-[A-Za-z0-9]{1,6}$/;

function cardValue(card: string): number {
  return CARD_VALUE_BY_RANK[card.slice(2)] as number;
}

/** Canonical order: suit H, D, C, S, then rank A..K. Invalid strings sort last, lexicographically. */
function canonicalCompare(a: string, b: string): number {
  const va = DECK.has(a);
  const vb = DECK.has(b);
  if (va && vb) {
    return SUITS.indexOf(a.charAt(0)) - SUITS.indexOf(b.charAt(0)) || cardValue(a) - cardValue(b);
  }
  if (va !== vb) return va ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Independent Card_Value sum of card ids such as `H-A`, `S-10`. Throws RangeError for a string that is not
 * one of the 52 deck ids (programming error; `compareWithReference` validates before calling it).
 */
export function referenceHiddenSum(cards: readonly string[]): number {
  let total = 0;
  for (const c of cards) {
    if (typeof c !== 'string' || !DECK.has(c)) throw new RangeError(`not a deck card id: ${String(c)}`);
    total += cardValue(c);
  }
  return total;
}

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export type ReferenceProblemReason =
  | 'NOT_AN_ARRAY'
  | 'WRONG_LENGTH'
  | 'NOT_A_CARD'
  | 'UNKNOWN_CARD'
  | 'DUPLICATE_CARD'
  | 'JOKER';

export interface ReferenceProblem {
  index: number | null;
  value: unknown;
  reason: ReferenceProblemReason;
}

export type MismatchReason = 'CARD_SET_DIFFERS' | 'DECODED_SUM_INCONSISTENT' | 'DECODED_RESULT_MALFORMED';

export interface ReferenceMismatch {
  kind: 'REFERENCE_MISMATCH';
  reasons: MismatchReason[];
  /** The original decoder result object, untouched. */
  decoded: GroupDecodeResult;
  /** Decoded identities (canonical sorted copy), for diagnostics. Never reference identities. */
  decodedCards: string[];
  /** Reference identities, canonical sorted. */
  referenceCards: string[];
  onlyInDecoded: string[];
  onlyInReference: string[];
  decodedSumReported: number | null;
  decodedSumRecomputed: number | null;
  referenceSum: number;
}

export interface InvalidReference {
  kind: 'INVALID_REFERENCE';
  problems: ReferenceProblem[];
  /** The original decoder result object, untouched. */
  decoded: GroupDecodeResult;
}

export type ReferenceCheckResult = GroupDecodeResult | ReferenceMismatch | InvalidReference;

// ---------------------------------------------------------------------------------------------
// Reference validation
// ---------------------------------------------------------------------------------------------

type CardRead = { card: string } | { reason: ReferenceProblemReason };

function readCard(value: unknown): CardRead {
  try {
    if (typeof value === 'string') {
      if (JOKER_LIKE.test(value)) return { reason: 'JOKER' };
      if (DECK.has(value)) return { card: value };
      return { reason: CARD_SHAPED.test(value) ? 'UNKNOWN_CARD' : 'NOT_A_CARD' };
    }
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const keys = Object.keys(value);
      if (keys.some((k) => JOKER_LIKE.test(k))) return { reason: 'JOKER' };
      if (keys.length !== 2 || !keys.includes('suit') || !keys.includes('rank')) return { reason: 'NOT_A_CARD' };
      const { suit, rank } = value as { suit: unknown; rank: unknown };
      if (typeof suit !== 'string' || typeof rank !== 'string') return { reason: 'NOT_A_CARD' };
      if (JOKER_LIKE.test(suit) || JOKER_LIKE.test(rank)) return { reason: 'JOKER' };
      if (!SUITS.includes(suit) || !RANKS.includes(rank)) return { reason: 'UNKNOWN_CARD' };
      return { card: `${suit}-${rank}` };
    }
  } catch {
    return { reason: 'NOT_A_CARD' };
  }
  return { reason: 'NOT_A_CARD' };
}

/** Returns the four normalised card ids (canonical order) or the list of problems. */
function validateReference(reference: unknown): { cards: string[] } | { problems: ReferenceProblem[] } {
  if (!Array.isArray(reference)) {
    return { problems: [{ index: null, value: reference, reason: 'NOT_AN_ARRAY' }] };
  }
  const problems: ReferenceProblem[] = [];
  if (reference.length !== 4) problems.push({ index: null, value: reference, reason: 'WRONG_LENGTH' });
  const seen = new Set<string>();
  const cards: string[] = [];
  for (let i = 0; i < reference.length; i++) {
    let entry: unknown;
    try {
      entry = reference[i];
    } catch {
      entry = undefined;
    }
    const read = readCard(entry);
    if ('reason' in read) {
      problems.push({ index: i, value: entry, reason: read.reason });
      continue;
    }
    if (seen.has(read.card)) {
      problems.push({ index: i, value: entry, reason: 'DUPLICATE_CARD' });
      continue;
    }
    seen.add(read.card);
    cards.push(read.card);
  }
  if (problems.length > 0) return { problems };
  return { cards: cards.sort(canonicalCompare) };
}

// ---------------------------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------------------------

function isCardId(v: unknown): v is string {
  return typeof v === 'string' && DECK.has(v);
}

/**
 * Compares a decoder result with the reference card set. See the header for the full contract.
 * @throws TypeError when `result` is not an object (programming error). Bad `referenceCards` never throws.
 */
export function compareWithReference(result: GroupDecodeResult, referenceCards: unknown): ReferenceCheckResult {
  if (typeof result !== 'object' || result === null) {
    throw new TypeError('result must be a decoder result object');
  }

  const ref = validateReference(referenceCards);
  if ('problems' in ref) return { kind: 'INVALID_REFERENCE', problems: ref.problems, decoded: result };

  if (result.kind !== 'IDENTIFIED') return result;

  const rawCards: unknown = (result as { cards?: unknown }).cards;
  const rawSum: unknown = (result as { hiddenSum?: unknown }).hiddenSum;

  const cardList: unknown[] = Array.isArray(rawCards) ? [...rawCards] : [];
  const decodedCards = cardList.map((c) => (typeof c === 'string' ? c : '<invalid>')).sort(canonicalCompare);
  const cardsWellFormed =
    Array.isArray(rawCards) && cardList.length === 4 && cardList.every(isCardId) && new Set(cardList).size === 4;
  const sumWellFormed = typeof rawSum === 'number' && Number.isInteger(rawSum);
  const malformed = !cardsWellFormed || !sumWellFormed;

  const decodedSet = new Set(decodedCards);
  const referenceSet = new Set(ref.cards);
  const onlyInDecoded = decodedCards.filter((c) => !referenceSet.has(c));
  const onlyInReference = ref.cards.filter((c) => !decodedSet.has(c));
  const setDiffers = onlyInDecoded.length > 0 || onlyInReference.length > 0 || decodedSet.size !== referenceSet.size;

  const recomputed = cardsWellFormed ? referenceHiddenSum(cardList as string[]) : null;
  const sumInconsistent = cardsWellFormed && sumWellFormed && rawSum !== recomputed;

  const reasons: MismatchReason[] = [];
  if (setDiffers) reasons.push('CARD_SET_DIFFERS');
  if (sumInconsistent) reasons.push('DECODED_SUM_INCONSISTENT');
  if (malformed) reasons.push('DECODED_RESULT_MALFORMED');

  if (reasons.length === 0) return result;

  return {
    kind: 'REFERENCE_MISMATCH',
    reasons,
    decoded: result,
    decodedCards,
    referenceCards: [...ref.cards],
    onlyInDecoded,
    onlyInReference,
    decodedSumReported: typeof rawSum === 'number' && Number.isFinite(rawSum) ? rawSum : null,
    decodedSumRecomputed: recomputed,
    referenceSum: referenceHiddenSum(ref.cards),
  };
}

export const ReferenceCheck: {
  compare(result: GroupDecodeResult, referenceCards: unknown): ReferenceCheckResult;
} = { compare: compareWithReference };
