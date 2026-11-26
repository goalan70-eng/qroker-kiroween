/**
 * INTERMEDIATE strategy for the EXPERIMENTAL copies only (src/game/ai/intermediate.ts inside the experiment folders).
 * Not part of the shipped game. The scripts copy this file into `ai/` of the experimental copies.
 *
 * Placement: uses only the viewer's PlayerView and the decision seed.
 *   1. certain completion: a candidate that fills the fourth cell of a 2x2 whose other three cells are all visible
 *      and valid for their slots, and whose card is valid for its slot and orientation;
 *   2. otherwise plausible attempt: a candidate that fills the fourth cell of a 2x2 where all four cells would be
 *      occupied, the played card is valid, every VISIBLE existing member is valid, and at least one member is hidden;
 *   3. otherwise any legal candidate.
 * Ties inside the selected class are broken uniformly with the decision seed (one draw).
 *
 * Guesses: for each pending Quad_Key, the sum of the visible card values plus 7 for each hidden member.
 * No lookahead, no unseen-card model.
 */
import { cardValue } from '../core/cards';
import { isValidMember } from '../core/fragment-layout';
import { candidateQuads, fromNotation, quadCells, quadKey, slotOf } from '../core/geometry';
import type { CellView, PlayerView } from '../core/view';
import type { GridPosition, QuadKey } from '../core/types';
import { chooseSeeded, decisionRng, enumeratePlacements, toPlaceAction } from './strategy';
import type { AIStrategy, AiContext, PlaceAction, SubmitGuessesAction } from './strategy';

/** Value used for a hidden member when summing a Guess (the middle card value). */
export const HIDDEN_MEMBER_VALUE = 7;

type Candidate = ReturnType<typeof enumeratePlacements>[number];

export type CandidateClass = 'certain' | 'plausible' | 'neither';

export interface ClassifiedCandidate {
  readonly candidate: Candidate;
  readonly cls: CandidateClass;
  /** Quad_Keys this candidate would complete with every member visible and valid. */
  readonly certainQuads: readonly QuadKey[];
  /** Quad_Keys this candidate would complete if the hidden members are valid (at least one member hidden). */
  readonly plausibleQuads: readonly QuadKey[];
}

function sideOf(view: PlayerView): number {
  return Math.round(Math.sqrt(view.board.length));
}

function cellAtView(view: PlayerView, p: GridPosition): CellView | null {
  return view.board[p.row * sideOf(view) + p.col] ?? null;
}

/** Classifies one legal candidate from the view only (see the module comment). */
export function classifyCandidate(view: PlayerView, candidate: Candidate): ClassifiedCandidate {
  const certainQuads: QuadKey[] = [];
  const plausibleQuads: QuadKey[] = [];
  for (const topLeft of candidateQuads(candidate.pos)) {
    const slot = slotOf(topLeft, candidate.pos);
    if (!isValidMember(candidate.card, candidate.orientation, slot)) continue;
    let usable = true;
    let hidden = 0;
    for (const q of quadCells(topLeft)) {
      if (q.row === candidate.pos.row && q.col === candidate.pos.col) continue;
      const cell = cellAtView(view, q);
      if (cell === null) {
        usable = false;
        break;
      }
      if (cell.card === null) {
        hidden++;
        continue;
      }
      if (!isValidMember(cell.card, cell.orientation, slotOf(topLeft, q))) {
        usable = false;
        break;
      }
    }
    if (!usable) continue;
    (hidden === 0 ? certainQuads : plausibleQuads).push(quadKey(topLeft));
  }
  const cls: CandidateClass = certainQuads.length > 0 ? 'certain' : plausibleQuads.length > 0 ? 'plausible' : 'neither';
  return { candidate, cls, certainQuads, plausibleQuads };
}

function choosePlacement(view: PlayerView, ctx: AiContext): PlaceAction {
  const candidates = enumeratePlacements(view);
  if (candidates.length === 0) {
    throw new RangeError(`INTERMEDIATE.choosePlacement: no legal placement for ${view.viewer}`);
  }
  const classified = candidates.map((c) => classifyCandidate(view, c));
  const rng = decisionRng(ctx);
  for (const cls of ['certain', 'plausible'] as const) {
    const pool = classified.filter((x) => x.cls === cls).map((x) => x.candidate);
    if (pool.length > 0) return toPlaceAction(view, chooseSeeded(pool, rng));
  }
  return toPlaceAction(view, chooseSeeded(candidates, rng));
}

function chooseGuesses(view: PlayerView, _ctx: AiContext): SubmitGuessesAction {
  if (view.phase !== 'GUESS_COLLECT') {
    throw new RangeError(`INTERMEDIATE.chooseGuesses: phase is ${view.phase}`);
  }
  if (view.pendingQuadKeys.length === 0) throw new RangeError('INTERMEDIATE.chooseGuesses: no pending Quad_Key');
  if (view.guessSubmitted[view.viewer]) throw new RangeError(`INTERMEDIATE.chooseGuesses: ${view.viewer} already submitted`);
  const guesses: Record<string, number> = {};
  for (const key of view.pendingQuadKeys) {
    const parsed = fromNotation(key);
    if (!parsed.ok) throw new RangeError(`INTERMEDIATE.chooseGuesses: bad key ${key}`);
    let sum = 0;
    for (const q of quadCells(parsed.value)) {
      const cell = cellAtView(view, q);
      if (cell === null) throw new RangeError(`INTERMEDIATE.chooseGuesses: empty cell in pending ${key}`);
      sum += cell.card === null ? HIDDEN_MEMBER_VALUE : cardValue(cell.card);
    }
    guesses[key] = sum;
  }
  return { type: 'SUBMIT_GUESSES', player: view.viewer, guesses };
}

export const INTERMEDIATE_STRATEGY: AIStrategy = Object.freeze({
  id: 'INTERMEDIATE' as AIStrategy['id'],
  choosePlacement,
  chooseGuesses,
});
