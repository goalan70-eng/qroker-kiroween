// Placement controls (task 17.3). Source: .kiro/specs/qroker-playable-game/design.md, "Placement interaction"
// (Placement_Draft state machine, Rotation capability metadata, Board and Hand DOM contract, keyboard path);
// requirements 13.3 to 13.6, 13.11 to 13.14, 16.6, 17.2, 17.7.
//
// Two parts:
//   * `controlsModel(view, draft, rotationInfo, displayError)`: a PURE function that decides which controls exist,
//     which are enabled, and which status text applies. Everything comes from the viewer's `PlayerView`, the UI-only
//     draft, the controller's `rotationInfo` (booleans for the viewer's OWN Hand cards) and the already localized
//     error. No hidden card, no GameState.
//   * `renderPlacementControls(h | doc, model, t, handlers)`: builds the buttons with `h`.
//
// Rules (checked in placement-controls.test.ts)
//   * Rotation control: present ONLY while previewing a card of the viewer's own Hand for which
//     `rotationInfo[card].rotationChangesCorners === true` (clubs and spades), and only on the viewer's placement
//     turn. It is absent from the DOM for hearts, diamonds, a missing or unknown card, no card, another Seat's card
//     (the view has none) and any committed card. It is a
//     `<button aria-pressed>`; pressing it sends `draftEvent({ type: 'toggleRotation' })` and nothing else.
//   * Confirm ("Confirm placement"): enabled only in the PREVIEW state (card and target) on the viewer's turn. It is
//     the only control that calls `confirmPlacement()`, which is the only path that sends `PLACE`.
//   * Cancel: enabled when the draft is not empty (and it is the viewer's turn); sends `draftEvent({ type: 'cancel' })`.
//   * Off turn (an AI Seat or another human Seat acts, or the phase is not PLACEMENT) every control is disabled, the
//     rotation control is absent, and the status text names the acting Seat ("AI 2 is playing").
//   * Every control is a real `<button type="button">`, at least 44 px high and wide by CSS (`--touch-min`), so the
//     keyboard path (Tab, Enter, Space) needs no special code. A disabled button is not activatable; the handlers
//     also check the model, so a stale element cannot send anything.
//
// Imports: ui/, i18n/, core/view and core/types only (screen-class module of boundaries.test.ts).

import type { PlayerId } from '../../core/types';
import type { PlayerView } from '../../core/view';
import { createH } from '../dom';
import type { CreateDoc, HFunction } from '../dom';
import { draftState } from '../placement-draft';
import type { DraftEvent, DraftResult, DraftState, PlacementDraft, RotationInfoMap } from '../placement-draft';
import type { Translate } from './card-face';

export type PlacementStatusKey =
  | 'hand.hint.idle'
  | 'hand.hint.target'
  | 'hand.hint.card'
  | 'hand.hint.preview'
  | 'hand.status.ai'
  | 'hand.status.other'
  | 'hand.status.phase';

/** The Seat that the status text names: an AI Seat by its AI number, a human Seat by its seat number. */
export interface SeatRef {
  readonly kind: 'ai' | 'player';
  /** 1-based. For an AI Seat the ordinal among the AI Seats (as in the default names "AI 1" to "AI 3"). */
  readonly n: number;
}

export interface ControlsModel {
  readonly state: DraftState;
  /** The viewer's PLACEMENT turn: the controls can be used. */
  readonly active: boolean;
  readonly statusKey: PlacementStatusKey;
  /** The Seat named by `hand.status.ai` and `hand.status.other`, else `null`. */
  readonly seat: SeatRef | null;
  /** The rotation control exists. */
  readonly showRotation: boolean;
  /** The draft orientation is 180 (the `aria-pressed` state of the rotation control). */
  readonly rotated: boolean;
  readonly canConfirm: boolean;
  readonly canCancel: boolean;
  /** The localized message of the controller's `displayError`, or `null`. */
  readonly errorText: string | null;
}

/** The part of the controller's `DisplayError` that the controls use. */
export interface DisplayErrorLike {
  readonly message: string;
}

function seatRef(view: PlayerView, seat: PlayerId): SeatRef {
  const seats = view.rules.seats;
  if (seats.find((s) => s.id === seat)?.kind === 'AI') {
    const ais = seats.filter((s) => s.kind === 'AI');
    return { kind: 'ai', n: ais.findIndex((s) => s.id === seat) + 1 };
  }
  return { kind: 'player', n: Number(seat.slice(1)) + 1 };
}

const HINT_BY_STATE: Readonly<Record<DraftState, PlacementStatusKey>> = {
  IDLE: 'hand.hint.idle',
  TARGET_SELECTED: 'hand.hint.target',
  CARD_SELECTED: 'hand.hint.card',
  PREVIEW: 'hand.hint.preview',
};

/** The model of the placement controls for one view and one draft. Pure and deterministic. */
export function controlsModel(
  view: PlayerView,
  draft: PlacementDraft,
  rotationInfo: RotationInfoMap,
  displayError: DisplayErrorLike | null,
): ControlsModel {
  const state = draftState(draft);
  const active = view.phase === 'PLACEMENT' && view.turn === view.viewer;
  const errorText = displayError === null || displayError === undefined ? null : displayError.message;
  if (!active) {
    const seat = view.phase === 'PLACEMENT' ? seatRef(view, view.turn) : null;
    return {
      state,
      active,
      statusKey: seat === null ? 'hand.status.phase' : seat.kind === 'ai' ? 'hand.status.ai' : 'hand.status.other',
      seat,
      showRotation: false,
      rotated: draft.orientation === 180,
      canConfirm: false,
      canCancel: false,
      errorText,
    };
  }
  const card = draft.card;
  // A card that is not in the viewer's own Hand never gets a control (the draft is cleared by the controller then).
  const showRotation = state === 'PREVIEW' && card !== null && view.myHand.includes(card) && rotationInfo[card]?.rotationChangesCorners === true;
  return {
    state,
    active,
    statusKey: HINT_BY_STATE[state],
    seat: null,
    showRotation,
    rotated: showRotation && draft.orientation === 180,
    canConfirm: state === 'PREVIEW',
    canCancel: state !== 'IDLE',
    errorText,
  };
}

/** The localized status or hint text of `model`. */
export function controlsStatusText(model: ControlsModel, t: Translate): string {
  if (model.seat === null) return t(model.statusKey);
  const seat = t(model.seat.kind === 'ai' ? 'common.seat.ai' : 'common.seat.player', { n: model.seat.n });
  return t(model.statusKey, { seat });
}

/** The functions the controls may call: `draftEvent` and `confirmPlacement`. There is no `dispatch` here. */
export interface ControlsHandlers {
  /** The controls send `toggleRotation` and `cancel` only. */
  readonly draftEvent: (event: DraftEvent) => DraftResult | void;
  /** The ONLY path that sends a `PLACE` Action. Called once per activation of the confirm button. */
  readonly confirmPlacement: () => unknown;
}

/**
 * Builds the control group from `model`. `target` is an `h` function or a document. The rotation button exists only
 * while previewing a rotatable card. The optional board group holds the preview actions beside the target.
 */
export function renderPlacementControls(
  target: HFunction | CreateDoc,
  model: ControlsModel,
  t: Translate,
  handlers: ControlsHandlers,
  actionsRoot?: HTMLElement,
): HTMLElement {
  const h: HFunction = typeof target === 'function' ? target : createH(target);
  const buttons: HTMLElement[] = [];
  if (model.showRotation) {
    buttons.push(
      h(
        'button',
        {
          class: 'placement-button placement-button--rotate',
          focusKey: 'placement-rotate',
          attrs: { type: 'button' },
          aria: { pressed: model.rotated ? 'true' : 'false' },
          on: {
            click: () => {
              if (model.showRotation) handlers.draftEvent({ type: 'toggleRotation' });
            },
          },
        },
        t(model.rotated ? 'hand.restoreOrientation' : 'hand.rotate'),
      ),
    );
  }
  buttons.push(
    h(
      'button',
      {
        class: 'placement-button placement-button--confirm',
        focusKey: 'placement-confirm',
        attrs: { type: 'button', hidden: !model.canConfirm, disabled: !model.canConfirm },
        on: {
          click: () => {
            if (model.canConfirm) handlers.confirmPlacement();
          },
        },
      },
      t('hand.confirm'),
    ),
  );
  const group = h('div', { class: 'placement-controls', attrs: { role: 'group' }, aria: { label: t('hand.controls.label') } });
  for (const button of buttons) (actionsRoot ?? group).appendChild(button);
  group.appendChild(
    h(
      'button',
      {
        class: 'placement-button placement-button--cancel',
        focusKey: 'placement-cancel',
        attrs: { type: 'button', disabled: !model.canCancel },
        on: {
          click: () => {
            if (model.canCancel) handlers.draftEvent({ type: 'cancel' });
          },
        },
      },
      t('hand.cancel'),
    ),
  );
  return group;
}

/** Every string key this module passes to `t` (the status texts are keyed by `PlacementStatusKey`). */
export const CONTROLS_STRING_KEYS = [
  'hand.controls.label',
  'hand.confirm',
  'hand.cancel',
  'hand.rotate',
  'hand.restoreOrientation',
  'hand.hint.idle',
  'hand.hint.target',
  'hand.hint.card',
  'hand.hint.preview',
  'hand.status.ai',
  'hand.status.other',
  'hand.status.phase',
] as const;
