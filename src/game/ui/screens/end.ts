// Final screen (task 19.2; design.md "Practice UI" End screen, "Task 18 interaction contracts"; requirements 9.4, 9.7,
// 15.3, 15.4, 16.2). One PUBLIC screen for a game in phase `ENDED`: the final ranking with shared ranks, the final
// scores, every reveal record with its Hidden_Sum, and three controls (rematch, replay same seed, new setup).
//
// Use (wiring into the page is task 19.4):
//   let screen: EndHandle | null = null;
//   renderer: (input) => { if (screen === null) screen = renderEnd(doc, root, input, t); else screen.update(input); }
// A handle belongs to ONE final screen: it captures `model.actionCount` when it is shown. Once a control returned `ok`,
// or when the view, the phase or the action count moved on, the handle is stale and sends nothing; the host disposes
// it. The controller renders the next screen synchronously inside the handler call, so the host may dispose the handle
// from inside `rematch()`; the handle then touches nothing after the handler returned.
//
// Model (`buildEndModel`)
//   Built ONLY from `view.ranking`, `view.scores`, `view.history`, `view.rules` (seat names and kinds, provisional flag)
//   and `view.handCounts`. It has no Guess field of any kind (type-level test end.test-d.ts, runtime scans in
//   end.test.ts), no hand card, no deck data. `null` unless `view.phase === 'ENDED'` and `view.ranking !== null`.
//
// Ranking and ties
//   Rows come in the ENGINE's ranking order with the `rank` of each `RankEntry` AS SUPPLIED (competition ranking, equal
//   scores share a rank: 1,1,3,4). Nothing is recomputed. A row whose rank is shared shows the rank number AND the text
//   cue "tied" (class `is-tied` too), so a tie is never told by colour alone.
//   `view.ranking` and `view.scores` must agree for every seat. If they do not, `buildEndModel` throws a `RangeError`
//   (no silent pick of one of them); the screen catches it, shows an alert and keeps the controls (mode `invalid`).
//
// Score accounting (nothing is calculated by the rules here)
//   The headline "final score" is exactly the engine's number. `view.scores` ALREADY contains the hand-empty bonus;
//   a record's `cumulative` is before it. For transparency the table also shows, per seat, "points from reveals" (the sum
//   of `earned` over `view.history`) and "end bonus (difference)" = final score minus that sum. The difference is the
//   subtraction of two public numbers, is never added to anything, and no `ScoreConfig` value is read: the screen never
//   applies, reads or states a bonus rule.
//
// History
//   ALL records of `view.history` in order: reveal number, placer, per code the Quad_Key, the board cells of its 2x2
//   region (`regionCells`, positions only), the revealed cards exactly as the record supplies them, the Hidden_Sum, and
//   a small table of the batch's earned and cumulative points per seat. OPEN PRODUCT POLICY: the engine contract is
//   FOUR revealed cards per code; this screen renders what the record supplies and decides nothing about it. Card faces
//   are the same public faces as the reveal screen (`revealCardFace`: rank and suit only, no owner or orientation).
//
// DOM
//   section.end[aria-labelledby=end-title]
//     h2#end-title[tabindex=-1]
//     div.end-content                  rebuilt on every render
//       p.end-banner[role=note]        only while `rules.scoreConfig.provisional` (common.provisionalScoring)
//       table.end-ranking > caption, thead th[scope=col], tbody tr[data-seat][data-rank] > th[scope=row], td...
//       p.end-note
//       section.end-history > h3, section.end-batch > h4, section.end-code > h5, p, p, ul > li > span.card-face, table
//       or p.end-empty / p.end-inconsistent[role=alert]
//     div.end-actions
//       p.end-engine-error[role=alert]
//       div.end-controls[role=group] > button#end-rematch, #end-replay, #end-new-setup (+ p.end-hint each)
//       or p#end-status[role=status]
//
// Controls: native buttons (>= 44 px in end.css). `rematch()` calls `handlers.restart()` (same seats and options, a NEW
// seed drawn by the controller), `replay()` calls `handlers.replaySameSeed()` (same seed and options, identical initial
// deal), `newSetup()` calls `handlers.abandon()` (back to the setup screen; no confirmation, the game is over).
// Single flight across all three: while one call runs, and after one returned `ok`, every control does nothing.
// A refused call: `ENGINE` shows the localized engine message and keeps the controls; `BUSY` shows nothing and keeps
// them; `NO_GAME` and `DISPOSED` make the handle stale (nothing left to do, the control would only be refused again).
// Enter and Space on a button act once per press (the keydown handler prevents the native click).
//
// Focus: every control has `data-focus-key`, so `renderWithFocus` keeps the focus through a re-render; `options.autoFocus`
// (default true) focuses the first control (or the heading when there is none) when the screen is shown.
//
// Imports: ui/, i18n/, core/types and core/view only.

import type { CardId, ErrorCode, PlayerId, QuadKey, SeatConfig } from '../../core/types';
import type { PlayerView } from '../../core/view';
import { errorMessageKey } from '../../i18n';
import type { StringKey } from '../../i18n';
import type { Translate } from '../components/card-face';
import { createH, renderWithFocus } from '../dom';
import type { CreateDoc, FocusDoc } from '../dom';
import { regionCells } from '../guess-model';
import { revealCardFace } from './reveal';

// ---------------------------------------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------------------------------------

/** One row of the final ranking. */
export interface EndSeat {
  readonly id: PlayerId;
  readonly name: string;
  readonly kind: SeatConfig['kind'];
  /** The engine's rank, as supplied (competition ranking). */
  readonly rank: number;
  /** Another seat has the same rank. */
  readonly tied: boolean;
  /** The engine's final score (`view.scores`, includes any end-of-game bonus). */
  readonly finalScore: number;
  /** Sum of `earned` over `view.history`. */
  readonly revealPoints: number;
  /** `finalScore - revealPoints`: a subtraction of two public numbers, never added to anything. */
  readonly endBonusDifference: number;
  /** Cards left in the seat's hand (public count). */
  readonly handCount: number;
}

export interface EndHistoryCode {
  readonly quadKey: QuadKey;
  /** Board cells of the 2x2 region of the code (positions only). */
  readonly cells: readonly string[];
  /** The card identities the record supplies (public once revealed). */
  readonly cards: readonly CardId[];
  readonly hiddenSum: number | null;
}

export interface EndHistorySeat {
  readonly id: PlayerId;
  readonly name: string;
  readonly earned: number;
  /** After this batch, before any hand-empty bonus. */
  readonly cumulative: number;
}

export interface EndHistoryEntry {
  /** 1-based number of the reveal (`batchIndex + 1`). */
  readonly number: number;
  readonly placer: { readonly id: PlayerId; readonly name: string };
  readonly codes: readonly EndHistoryCode[];
  readonly seats: readonly EndHistorySeat[];
}

/** Everything the final screen shows. No Guess field of any kind (type-level test in end.test-d.ts). */
export interface EndViewModel {
  /** One entry per seat, in the engine's ranking order. */
  readonly ranking: readonly EndSeat[];
  /** All reveal records, in order. */
  readonly history: readonly EndHistoryEntry[];
  /** `rules.scoreConfig.provisional`. A flag only: it carries no point value. */
  readonly provisional: boolean;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * The model of the final screen of `view`, or `null` unless the phase is `ENDED` and the view has a ranking. Pure and
 * deterministic; frozen.
 * @throws RangeError when `view.ranking` and `view.scores` (or the seat list) disagree: neither is picked silently.
 */
export function buildEndModel(view: PlayerView): EndViewModel | null {
  const ranked = view.ranking;
  if (view.phase !== 'ENDED' || ranked === null) return null;
  const seats = view.rules.seats;
  const seatOf = (id: PlayerId): SeatConfig | undefined => seats.find((seat) => seat.id === id);
  const seen = new Set<PlayerId>();
  for (const entry of ranked) {
    if (seatOf(entry.player) === undefined || seen.has(entry.player)) {
      throw new RangeError(`end: ranking names seat ${String(entry.player)} that is unknown or listed twice`);
    }
    if (view.scores[entry.player] !== entry.score) {
      throw new RangeError(`end: ranking score ${entry.score} and view score ${view.scores[entry.player]} differ for ${entry.player}`);
    }
    seen.add(entry.player);
  }
  if (seen.size !== seats.length) throw new RangeError('end: the ranking does not list every seat exactly once');

  const nameOf = (id: PlayerId): string => seatOf(id)?.name ?? id;
  const ranking = ranked.map((entry): EndSeat => {
    let revealPoints = 0;
    for (const record of view.history) for (const line of record.perPlayer) if (line.player === entry.player) revealPoints += line.earned;
    return {
      id: entry.player,
      name: nameOf(entry.player),
      kind: (seatOf(entry.player) as SeatConfig).kind,
      rank: entry.rank,
      tied: ranked.filter((other) => other.rank === entry.rank).length > 1,
      finalScore: entry.score,
      revealPoints,
      endBonusDifference: entry.score - revealPoints,
      handCount: view.handCounts[entry.player],
    };
  });
  const history = view.history.map(
    (record): EndHistoryEntry => ({
      number: record.batchIndex + 1,
      placer: { id: record.placer, name: nameOf(record.placer) },
      codes: record.codes.map((code) => ({
        quadKey: code.quadKey,
        cells: [...regionCells(code.quadKey)],
        cards: [...code.cards],
        hiddenSum: code.hiddenSum,
      })),
      seats: record.perPlayer.map((line) => ({ id: line.player, name: nameOf(line.player), earned: line.earned, cumulative: line.cumulative })),
    }),
  );
  return deepFreeze({ ranking, history, provisional: view.rules.scoreConfig.provisional });
}

// ---------------------------------------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------------------------------------

/** The part of the controller's `OpResult` the screen reads. */
export interface EndOpResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly code?: ErrorCode;
}

/** What the screen reads from a render input. The controller's `RenderInput` satisfies this structurally. */
export interface EndInput {
  readonly view: PlayerView | null;
  readonly model: { readonly actionCount: number };
  readonly handlers: {
    /** Same seats and options, a new seed. */
    readonly restart: () => EndOpResult;
    /** Same seats, options and seed. */
    readonly replaySameSeed: () => EndOpResult;
    /** Back to the setup screen. */
    readonly abandon: () => EndOpResult;
  };
}

export interface EndOptions {
  /** Move the focus to the first control (or the heading) when the screen is shown. Default `true`. */
  readonly autoFocus?: boolean;
  /** Draw the provisional banner inside the screen. Default `true`; a host that mounts components/banner.ts passes `false`. */
  readonly banner?: boolean;
}

export type EndDocument = CreateDoc & Partial<FocusDoc>;

/**
 * `active`: the controls work; `sent`: one of them succeeded; `stale`: the game moved on; `empty`: the view is not an
 * ended game; `invalid`: ranking and scores disagree (an alert is shown, the controls still work).
 */
export type EndMode = 'active' | 'sent' | 'stale' | 'empty' | 'invalid';

export interface EndHandle {
  /** The screen root (a child of `root` until `dispose`). */
  readonly element: HTMLElement;
  readonly mode: EndMode;
  /** Renders `input` into the screen. After `dispose` it does nothing. */
  update(input: EndInput): void;
  /** Activates "Rematch", exactly like the button. */
  rematch(): void;
  /** Activates "Replay same seed", exactly like the button. */
  replay(): void;
  /** Activates "New setup", exactly like the button. */
  newSetup(): void;
  /** Focuses the first control, else the status text, else the heading. */
  focusFirst(): void;
  /** Removes the screen. Idempotent. */
  dispose(): void;
}

/** Every string key this module passes to `t`, apart from the engine's `error.<code>` messages. */
export const END_STRING_KEYS = [
  'end.title',
  'end.empty',
  'end.ranking.caption',
  'end.col.rank',
  'end.col.final',
  'end.col.reveals',
  'end.col.bonus',
  'end.tied',
  'end.note',
  'end.history.title',
  'end.history.empty',
  'end.history.cells',
  'end.history.points',
  'end.controls.label',
  'end.rematch',
  'end.rematch.hint',
  'end.replay',
  'end.replay.hint',
  'end.newSetup',
  'end.newSetup.hint',
  'end.status.sent',
  'end.status.stale',
  'end.error.inconsistent',
  // reused from other areas
  'reveal.placer',
  'reveal.code.title',
  'reveal.code.cards',
  'reveal.code.sum',
  'reveal.card.name',
  'reveal.points.seat',
  'reveal.points.earned',
  'reveal.points.total',
  'scoreboard.col.hand',
  'scoreboard.kind.HUMAN',
  'scoreboard.kind.AI',
  'common.provisionalScoring',
] as const satisfies readonly StringKey[];

type ControlName = 'rematch' | 'replay' | 'newSetup';

const CONTROLS: readonly {
  readonly name: ControlName;
  readonly id: string;
  readonly label: StringKey;
  readonly hint: StringKey;
}[] = [
  { name: 'rematch', id: 'end-rematch', label: 'end.rematch', hint: 'end.rematch.hint' },
  { name: 'replay', id: 'end-replay', label: 'end.replay', hint: 'end.replay.hint' },
  { name: 'newSetup', id: 'end-new-setup', label: 'end.newSetup', hint: 'end.newSetup.hint' },
];

function hasFocusApi(doc: EndDocument): doc is EndDocument & FocusDoc {
  return 'activeElement' in doc && typeof doc.getElementById === 'function' && typeof doc.querySelector === 'function';
}

function clear(el: HTMLElement): void {
  while (el.firstChild !== null) el.removeChild(el.firstChild);
}

/** Mounts the final screen for `input.view` into `root` and returns its handle. */
export function renderEnd(doc: EndDocument, root: HTMLElement, input: EndInput, t: Translate, options: EndOptions = {}): EndHandle {
  const h = createH(doc);
  let current: EndInput = input;
  let mode: EndMode;
  const actionCount = input.model.actionCount;
  let running = false;
  let disposed = false;
  let engineError: ErrorCode | null = null;
  let statusEl: HTMLElement | null = null;
  let controlsShown = false;
  /** The last model that could be built: a stale or finished screen keeps showing it. */
  let shown: EndViewModel | null = null;

  const titleEl = h('h2', { id: 'end-title', class: 'end-title', attrs: { tabindex: -1 } });
  const contentSlot = h('div', { class: 'end-content' });
  const engineEl = h('p', { class: 'end-engine-error', attrs: { role: 'alert' } });

  const buttons = new Map<ControlName, HTMLElement>();
  const hints = new Map<ControlName, HTMLElement>();
  const controlsEl = h('div', { class: 'end-controls', attrs: { role: 'group' } });
  for (const control of CONTROLS) {
    const hintId = `${control.id}-hint`;
    const button = h('button', {
      id: control.id,
      focusKey: control.id,
      class: 'end-button',
      attrs: { type: 'button' },
      aria: { describedby: hintId },
      on: {
        click: () => activate(control.name),
        keydown: (event) => {
          const e = event as KeyboardEvent;
          if (e.isComposing === true || e.altKey === true || e.metaKey === true || e.ctrlKey === true) return;
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault(); // no second, native click for the same key press
            if (e.repeat !== true) activate(control.name);
          }
        },
      },
    });
    const hint = h('p', { id: hintId, class: 'end-hint' });
    buttons.set(control.name, button);
    hints.set(control.name, hint);
    controlsEl.appendChild(h('div', { class: 'end-control' }, button, hint));
  }

  const actionSlot = h('div', { class: 'end-actions' }, engineEl);
  const panel = h('section', { class: 'end', aria: { labelledby: 'end-title' } }, titleEl, contentSlot, actionSlot);

  /** The mode of a freshly shown screen for `view`; also decides whether the model can be built at all. */
  function modeFor(view: PlayerView | null): EndMode {
    if (view === null || view.phase !== 'ENDED' || view.ranking === null) return 'empty';
    try {
      buildEndModel(view);
    } catch {
      return 'invalid';
    }
    return 'active';
  }

  function stale(): boolean {
    const view = current.view;
    return view === null || view.phase !== 'ENDED' || current.model.actionCount !== actionCount;
  }

  // ---- rendering ------------------------------------------------------------------------------------------

  function paintCard(card: CardId): HTMLElement {
    return h('li', { class: 'end-card' }, revealCardFace(h, card, t));
  }

  function paintRanking(model: EndViewModel): HTMLElement {
    const columns = [
      t('reveal.points.seat'),
      t('end.col.rank'),
      t('end.col.final'),
      t('end.col.reveals'),
      t('end.col.bonus'),
      t('scoreboard.col.hand'),
    ];
    return h(
      'table',
      { class: 'end-ranking' },
      h('caption', null, t('end.ranking.caption')),
      h('thead', null, h('tr', null, ...columns.map((text) => h('th', { attrs: { scope: 'col' } }, text)))),
      h(
        'tbody',
        null,
        ...model.ranking.map((seat) =>
          h(
            'tr',
            {
              class: seat.tied ? 'end-row is-tied' : 'end-row',
              attrs: { 'data-seat': seat.id, 'data-rank': seat.rank },
            },
            h(
              'th',
              { attrs: { scope: 'row' } },
              h('span', { class: 'end-name' }, seat.name),
              h('span', { class: 'end-kind' }, ` (${t(seat.kind === 'HUMAN' ? 'scoreboard.kind.HUMAN' : 'scoreboard.kind.AI')})`),
            ),
            h(
              'td',
              { class: 'end-rank' },
              String(seat.rank),
              seat.tied ? h('span', { class: 'end-tied' }, ` (${t('end.tied')})`) : null,
            ),
            h('td', { class: 'end-final' }, seat.finalScore),
            h('td', { class: 'end-reveal-points' }, seat.revealPoints),
            h('td', { class: 'end-bonus' }, seat.endBonusDifference),
            h('td', { class: 'end-hand' }, seat.handCount),
          ),
        ),
      ),
    );
  }

  function paintHistory(model: EndViewModel): HTMLElement {
    const section = h('section', { class: 'end-history', aria: { labelledby: 'end-history-title' } }, h('h3', { id: 'end-history-title' }, t('end.history.title')));
    if (model.history.length === 0) section.appendChild(h('p', { class: 'end-history-empty' }, t('end.history.empty')));
    for (const entry of model.history) {
      const batchTitleId = `end-batch-${entry.number}-title`;
      const batch = h(
        'section',
        { class: 'end-batch', attrs: { 'data-batch': entry.number }, aria: { labelledby: batchTitleId } },
        h('h4', { id: batchTitleId }, t('reveal.placer', { n: entry.number, name: entry.placer.name })),
      );
      for (const code of entry.codes) {
        const codeTitleId = `end-code-${entry.number}-${code.quadKey}-title`;
        batch.appendChild(
          h(
            'section',
            { class: 'end-code', attrs: { 'data-quad-key': code.quadKey }, aria: { labelledby: codeTitleId } },
            h('h5', { id: codeTitleId }, t('reveal.code.title', { key: code.quadKey })),
            h('p', { class: 'end-cells' }, t('end.history.cells', { cells: code.cells.join(', ') })),
            code.hiddenSum === null ? null : h('p', { class: 'end-sum' }, t('reveal.code.sum', { sum: code.hiddenSum })),
            code.cards.length === 0 ? null : h('ul', { class: 'end-cards', aria: { label: t('reveal.code.cards', { key: code.quadKey }) } }, ...code.cards.map(paintCard)),
          ),
        );
      }
      const columns = [t('reveal.points.seat'), t('reveal.points.earned'), t('reveal.points.total')];
      batch.appendChild(
        h(
          'table',
          { class: 'end-batch-points' },
          h('caption', null, t('end.history.points', { n: entry.number })),
          h('thead', null, h('tr', null, ...columns.map((text) => h('th', { attrs: { scope: 'col' } }, text)))),
          h(
            'tbody',
            null,
            ...entry.seats.map((seat) =>
              h(
                'tr',
                { attrs: { 'data-seat': seat.id } },
                h('th', { attrs: { scope: 'row' } }, seat.name),
                h('td', { class: 'end-earned' }, seat.earned),
                h('td', { class: 'end-total' }, seat.cumulative),
              ),
            ),
          ),
        ),
      );
      section.appendChild(batch);
    }
    return section;
  }

  function paintContent(): void {
    clear(contentSlot);
    const view = current.view;
    if (mode === 'empty') {
      contentSlot.appendChild(h('p', { class: 'end-empty' }, t('end.empty')));
      return;
    }
    let model: EndViewModel | null = null;
    if (view !== null) {
      try {
        model = buildEndModel(view);
      } catch {
        model = null;
        mode = mode === 'sent' || mode === 'stale' ? mode : 'invalid';
      }
    }
    if (model !== null) shown = model;
    else if (mode === 'stale' || mode === 'sent') model = shown;
    if (model === null) {
      if (mode === 'invalid') contentSlot.appendChild(h('p', { class: 'end-inconsistent', attrs: { role: 'alert' } }, t('end.error.inconsistent')));
      else contentSlot.appendChild(h('p', { class: 'end-empty' }, t('end.empty')));
      return;
    }
    if (model.provisional && options.banner !== false) {
      contentSlot.appendChild(h('p', { class: 'end-banner', attrs: { role: 'note' } }, t('common.provisionalScoring')));
    }
    contentSlot.appendChild(paintRanking(model));
    contentSlot.appendChild(h('p', { class: 'end-note' }, t('end.note')));
    contentSlot.appendChild(paintHistory(model));
  }

  function showStatus(text: StringKey): void {
    if (controlsShown) {
      actionSlot.removeChild(controlsEl);
      controlsShown = false;
    }
    if (statusEl === null) {
      statusEl = h('p', { id: 'end-status', focusKey: 'end-status', class: 'end-status', attrs: { role: 'status', tabindex: -1 } });
      actionSlot.appendChild(statusEl);
    }
    const message = t(text);
    if (statusEl.textContent !== message) statusEl.textContent = message;
  }

  function showControls(): void {
    if (statusEl !== null && statusEl.parentNode !== null) statusEl.parentNode.removeChild(statusEl);
    statusEl = null;
    if (!controlsShown) {
      actionSlot.appendChild(controlsEl);
      controlsShown = true;
    }
    controlsEl.setAttribute('aria-label', t('end.controls.label'));
    for (const control of CONTROLS) {
      const button = buttons.get(control.name) as HTMLElement;
      const hint = hints.get(control.name) as HTMLElement;
      if (button.textContent !== t(control.label)) button.textContent = t(control.label);
      if (hint.textContent !== t(control.hint)) hint.textContent = t(control.hint);
    }
  }

  function paint(): void {
    titleEl.textContent = t('end.title');
    paintContent();
    const message = engineError === null ? '' : t(errorMessageKey(engineError));
    if (engineEl.textContent !== message) engineEl.textContent = message; // an unchanged alert is not announced again
    if (mode === 'active' || mode === 'invalid') showControls();
    else if (mode === 'sent') showStatus('end.status.sent');
    else if (mode === 'stale') showStatus('end.status.stale');
    else {
      // empty: neutral message only, no control and no status
      if (controlsShown) {
        actionSlot.removeChild(controlsEl);
        controlsShown = false;
      }
      if (statusEl !== null && statusEl.parentNode !== null) statusEl.parentNode.removeChild(statusEl);
      statusEl = null;
    }
  }

  function repaint(): void {
    if (hasFocusApi(doc)) renderWithFocus(doc, paint);
    else paint();
  }

  // ---- behaviour ------------------------------------------------------------------------------------------

  function activate(name: ControlName): void {
    if (disposed || running || (mode !== 'active' && mode !== 'invalid')) return;
    if (stale()) {
      mode = 'stale';
      repaint();
      return;
    }
    const handlers = current.handlers;
    running = true;
    let result: EndOpResult;
    try {
      result = name === 'rematch' ? handlers.restart() : name === 'replay' ? handlers.replaySameSeed() : handlers.abandon();
    } finally {
      running = false;
    }
    if (disposed) return; // the host replaced this screen while the handler rendered the next one
    if (result.ok) {
      mode = 'sent';
      engineError = null;
    } else if (result.reason === 'ENGINE' && result.code !== undefined) {
      engineError = result.code;
      if (stale()) mode = 'stale';
    } else if (result.reason === 'NO_GAME' || result.reason === 'DISPOSED') {
      mode = 'stale';
    } // 'BUSY': nothing happened and the controls stay, so the person can try again
    repaint();
    if (mode !== 'active' && mode !== 'invalid') statusEl?.focus();
  }

  function update(next: EndInput): void {
    if (disposed) return;
    current = next;
    // A re-render inside a handler call (the controller renders synchronously) is judged after the call returns.
    if ((mode === 'active' || mode === 'invalid') && !running && stale()) mode = 'stale';
    repaint();
  }

  function focusFirst(): void {
    if (disposed) return;
    if (controlsShown) (buttons.get('rematch') as HTMLElement).focus();
    else if (statusEl !== null) statusEl.focus();
    else titleEl.focus();
  }

  // ---- initial state --------------------------------------------------------------------------------------

  mode = modeFor(input.view);
  root.appendChild(panel);
  paint();
  if (options.autoFocus !== false) focusFirst();

  return {
    element: panel,
    get mode() {
      return mode;
    },
    update,
    rematch: () => activate('rematch'),
    replay: () => activate('replay'),
    newSetup: () => activate('newSetup'),
    focusFirst,
    dispose() {
      if (disposed) return;
      disposed = true;
      statusEl = null;
      if (panel.parentNode !== null) panel.parentNode.removeChild(panel);
    },
  };
}
