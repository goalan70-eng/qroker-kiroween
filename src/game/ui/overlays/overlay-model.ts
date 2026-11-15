// Overlay state model (task 19.3; design.md "Practice UI", AppModel `overlay: 'NONE' | 'HELP' | 'ABANDON_CONFIRM'`).
//
// DEVIATION FROM THE DESIGN SKETCH: `AppModel` and the controller have NO `overlay` field. This task adds the pure rules
// only; task 19.4 decides where the host keeps the value (its own variable, or a field of the model). Nothing here is
// wired into the controller, the store or `main.ts`.
//
// Rules
//   * One overlay at a time. An open request while ANY overlay is open is refused (the state is returned unchanged): the
//     abandon confirmation does not replace the help, and the help does not replace the confirmation. The person closes
//     the one that is open first.
//   * HELP opens from every screen (`SETUP`, `GAME`, `END`). Whether a Pass_Device_Gate is showing is the host's concern:
//     it simply does not send `OPEN_HELP` while a gate must stay alone on screen.
//   * ABANDON_CONFIRM opens only for an active game: `screen === 'GAME'` and the phase is not `ENDED`. SETUP and END have
//     nothing to abandon (the final screen's "new setup" control of task 19.2 stays unconfirmed).
//   * `CLOSE` and `ESCAPE` return to NONE (from NONE they change nothing).
//   * `CONTEXT` is the stale-closing event: the host sends the current screen and phase whenever they change. An open
//     ABANDON_CONFIRM whose game is no longer active returns to NONE. HELP does not depend on the game and stays.
//
// Pure: no DOM, no clock. Imports types only.

import type { PlayerView } from '../../core/view';
import type { ScreenName } from '../store';

export type OverlayState = 'NONE' | 'HELP' | 'ABANDON_CONFIRM';

/** The public facts the rules need. `phase` is `null` when the host has no view (for example an all-AI game). */
export interface OverlayContext {
  readonly screen: ScreenName;
  readonly phase: PlayerView['phase'] | null;
}

export type OverlayEvent =
  | { readonly type: 'OPEN_HELP' }
  | ({ readonly type: 'OPEN_ABANDON' } & OverlayContext)
  | { readonly type: 'CLOSE' }
  | { readonly type: 'ESCAPE' }
  | ({ readonly type: 'CONTEXT' } & OverlayContext);

/** True when there is a running game to abandon: the GAME screen and a phase other than `ENDED`. */
export function isAbandonable(context: OverlayContext): boolean {
  return context.screen === 'GAME' && context.phase !== 'ENDED';
}

/** The next overlay state. Pure; a refused event returns `state` itself. */
export function reduceOverlay(state: OverlayState, event: OverlayEvent): OverlayState {
  switch (event.type) {
    case 'OPEN_HELP':
      return state === 'NONE' ? 'HELP' : state;
    case 'OPEN_ABANDON':
      return state === 'NONE' && isAbandonable(event) ? 'ABANDON_CONFIRM' : state;
    case 'CLOSE':
    case 'ESCAPE':
      return 'NONE';
    case 'CONTEXT':
      return state === 'ABANDON_CONFIRM' && !isAbandonable(event) ? 'NONE' : state;
  }
}
