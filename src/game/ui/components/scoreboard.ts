// Scoreboard component (task 18.2; design.md "Task 18 interaction contracts", "Reveal screen and scoreboard";
// requirements 14.7, 14.8, 16.2). Shown on every game screen, built from a `PlayerView` only.
//
//   * `buildScoreboardModel(view)`: PURE; a frozen plain model of the public numbers: per Seat the public name, the
//     Seat kind (public in `rules.seats`), the cumulative score, the current Hand count and the active flag, plus the
//     remaining deck count and the provisional flag. No Guess, no pending Hidden_Sum, no action log, no raw state.
//   * `renderScoreboard(doc, root, view, t)`: mounts the model and returns a handle (`element`, `update`, `dispose`).
//
// Active Seat: the turn Seat during `PLACEMENT`; no Seat in every other phase. Only `PLACEMENT` has a single acting
// Seat that is public (a Guess is collected from every Seat and the reveal is a public pause), so no other phase
// marks a Seat. The active row is told by a text marker ("current turn" with a glyph) AND the class `is-active`,
// never by colour alone.
//
// DOM
//   section.scoreboard
//     p.scoreboard-banner[role=note]           only while `rules.scoreConfig.provisional` (text: common.provisionalScoring)
//     table.scoreboard-table
//       caption
//       thead > tr > th[scope=col] x 3         Seat, Score, Cards in hand
//       tbody > tr(.is-active)* > th[scope=row] (name, kind, active marker), td score, td hand count
//     p.scoreboard-deck                         the remaining deck count
//
// Imports: ui/, i18n/, core/types and core/view only (screen-class module of boundaries.test.ts).

import type { PlayerId, SeatConfig } from '../../core/types';
import type { PlayerView } from '../../core/view';
import { backStyle } from '../back-art';
import type { TableBacks } from '../back-art';
import { createH } from '../dom';
import type { CreateDoc } from '../dom';
import type { Translate } from './card-face';
import { createSeatTimers, type SeatTiming, type TimerClock } from './seat-timers';

export interface ScoreboardRow {
  readonly id: PlayerId;
  readonly name: string;
  readonly kind: SeatConfig['kind'];
  readonly score: number;
  readonly handCount: number;
  readonly active: boolean;
}

export interface ScoreboardModel {
  readonly rows: readonly ScoreboardRow[];
  readonly deckCount: number;
  /** `rules.scoreConfig.provisional`. A flag only: it carries no point value. */
  readonly provisional: boolean;
}

/** Every string key this component passes to `t`. */
export const SCOREBOARD_STRING_KEYS = [
  'scoreboard.caption',
  'scoreboard.col.seat',
  'scoreboard.col.score',
  'scoreboard.col.hand',
  'scoreboard.active',
  'scoreboard.kind.HUMAN',
  'scoreboard.kind.AI',
  'scoreboard.deck',
  'common.provisionalScoring',
  'common.seat.human',
] as const;

/** The glyph in front of the active marker text. It is decoration (`aria-hidden`); the text carries the meaning. */
export const ACTIVE_GLYPH = '▶';

/** The model of `view`. Pure and deterministic; the result is frozen. */
export function buildScoreboardModel(view: PlayerView): ScoreboardModel {
  const rows = view.rules.seats.map((seat): ScoreboardRow =>
    Object.freeze({
      id: seat.id,
      name: seat.name,
      kind: seat.kind,
      score: view.scores[seat.id],
      handCount: view.handCounts[seat.id],
      active: view.phase === 'PLACEMENT' && view.turn === seat.id,
    }),
  );
  return Object.freeze({
    rows: Object.freeze(rows),
    deckCount: view.deckCount,
    provisional: view.rules.scoreConfig.provisional,
  });
}

export interface ScoreboardHandle {
  readonly element: HTMLElement;
  /** Renders the latest view into the same element. After `dispose` it does nothing. */
  update(view: PlayerView, options?: ScoreboardOptions): void;
  /** Removes the element. Idempotent. */
  dispose(): void;
}

export interface ScoreboardOptions {
  readonly timing?: SeatTiming;
  readonly formCountdown?: HTMLElement;
  readonly clock?: TimerClock;
  /** Draw the provisional banner inside the scoreboard. Default `true`; a host that mounts components/banner.ts passes `false`. */
  readonly banner?: boolean;
  /** A private placement panel displays this seat’s playable hand. */
  readonly openHandSeat?: PlayerId;
  readonly backs?: TableBacks;
}

/** Mounts the scoreboard of `view` into `root`. */
export function renderScoreboard(doc: CreateDoc, root: HTMLElement, view: PlayerView, t: Translate, options: ScoreboardOptions = {}): ScoreboardHandle {
  const h = createH(doc);
  const slot = h('section', { class: 'scoreboard' });
  const timers = createSeatTimers(h, t, options.clock);
  let disposed = false;

  function paint(next: PlayerView, settings: ScoreboardOptions): void {
    timers.update(settings.timing, settings.formCountdown);
    const model = buildScoreboardModel(next);
    const seated = next.phase !== 'ENDED';
    slot.setAttribute('class', seated ? 'scoreboard scoreboard--seated' : 'scoreboard');
    while (slot.firstChild !== null) slot.removeChild(slot.firstChild);
    if (model.provisional && settings.banner !== false) {
      slot.appendChild(h('p', { class: 'scoreboard-banner', attrs: { role: 'note' } }, t('common.provisionalScoring')));
    }
    const head = h(
      'tr',
      null,
      h('th', { attrs: { scope: 'col' } }, t('scoreboard.col.seat')),
      h('th', { attrs: { scope: 'col' } }, t('scoreboard.col.score')),
      h('th', { attrs: { scope: 'col' } }, t('scoreboard.col.hand')),
    );
    const humans = model.rows.filter(row => row.kind === 'HUMAN');
    const defaultSoloSeat = humans.length === 1 && humans[0]?.id === 'P0' && humans[0].name === 'You' ? 'P0' : null;
    const body = model.rows.map((row) =>
      h(
        'tr',
        { class: ['scoreboard-row', row.active && 'is-active', row.active && row.id === settings.openHandSeat && 'has-open-hand']
          .filter(Boolean).join(' '), attrs: { 'data-seat': row.id } },
        h(
          'th',
          { attrs: { scope: 'row' } },
          seated ? h('span', { class: 'seat-cards', aria: { hidden: 'true' } },
            ...Array.from({ length: row.id === settings.openHandSeat ? 0 : row.handCount },
              (_, i) => h('span', { class: 'table-card-back seat-card-back', attrs: backStyle(settings.backs?.seatMarks[row.id][i]) })),
          ) : null,
          h('span', { class: 'scoreboard-name' }, row.id === defaultSoloSeat ? t('common.seat.human') : row.name),
          h('span', { class: 'scoreboard-kind' }, ` (${t(row.kind === 'HUMAN' ? 'scoreboard.kind.HUMAN' : 'scoreboard.kind.AI')})`),
          row.active
            ? h(
                'span',
                { class: 'scoreboard-active' },
                h('span', { aria: { hidden: 'true' } }, ` ${ACTIVE_GLYPH} `),
                h('span', { class: 'scoreboard-active-text' }, t('scoreboard.active')),
              )
            : null,
          timers.row(row.id),
        ),
        h('td', { class: 'scoreboard-score', attrs: { 'data-label': t('scoreboard.col.score') } }, row.score),
        h('td', { class: 'scoreboard-hand' }, row.handCount),
      ),
    );
    slot.appendChild(
      h(
        'table',
        { class: 'scoreboard-table' },
        h('caption', null, t('scoreboard.caption')),
        h('thead', null, head),
        h('tbody', null, ...body),
      ),
    );
    slot.appendChild(h('p', { class: 'scoreboard-deck' },
      seated ? h('span', {
        class: 'deck-stack', aria: { hidden: 'true' },
        attrs: { style: `--deck-count: ${model.deckCount}` },
      },
        model.deckCount > 0 ? h('span', { class: 'table-card-back', attrs: backStyle(settings.backs?.deckTop) }) : null,
        h('span', { class: 'deck-number' }, model.deckCount),
      ) : null,
      h('span', { class: 'deck-count' }, t('scoreboard.deck', { count: model.deckCount })),
    ));
    timers.startTicking();
  }

  paint(view, options);
  root.appendChild(slot);
  return {
    element: slot,
    update(next, settings = options) {
      if (!disposed) paint(next, settings);
    },
    dispose() {
      if (disposed) return;
      timers.dispose();
      disposed = true;
      if (slot.parentNode !== null) slot.parentNode.removeChild(slot);
    },
  };
}
