// UI-only application model and a tiny observable store (task 16.2).
//
// `AppModel` holds what the screens need to draw and nothing of the game itself: the sealed `GameState` lives
// inside `controller.ts` and never appears here (design: "sealed state stays inside the controller; screens
// receive views"). This file imports only types of `core/types`, `i18n` and the pure `./placement-draft`, so a
// screen module may import it.

import type { ErrorStringKey, Lang } from '../i18n';
import type { ErrorCode, PlayerId } from '../core/types';
import { EMPTY_DRAFT } from './placement-draft';
import type { PlacementDraft } from './placement-draft';
import type { GatePurpose } from './screens/privacy-gate';

/**
 * The last error shown to the player. It stores the code and the string KEY, never the text: the text is looked
 * up with `t(messageKey)` when it is rendered, so a language switch re-localizes the same stored error. The raw
 * engine `detail` is not kept at all (it may name cards or cells of the position and is not meant for people).
 */
export interface DisplayErrorRecord {
  readonly code: ErrorCode;
  readonly messageKey: ErrorStringKey;
}

/**
 * The screens of the design (`'SETUP' | 'GAME' | 'END'`). Until the setup screen exists (task 19.1) `'SETUP'` is the
 * idle screen: no game is running and the app shell is shown.
 */
export type ScreenName = 'SETUP' | 'GAME' | 'END';

/** UI-only state. Every value is plain data and the whole object is frozen when it is stored. */
export interface AppModel {
  readonly language: Lang;
  readonly screen: ScreenName;
  /**
   * The seat whose private view the screens render, or `null` when none is shown. One human seat: that seat always.
   * Two to four human seats (task 19.4): the seat to show per the controller's table, `null` during a gate, an AI
   * turn, `REVEAL` and `ENDED`. No game or only AI seats: `null`.
   */
  readonly viewer: PlayerId | null;
  /**
   * The Pass_Device_Gate that is due before the next private view (task 19.4), or `null`. Public data only (the
   * fields of `GateModel`: seat id, public name, purpose). While it is not `null`, `viewer` is `null`.
   */
  readonly gate: { readonly forSeat: PlayerId; readonly name: string; readonly purpose: GatePurpose } | null;
  /**
   * The placement draft of the viewer (task 17.4; supersedes the 16.2 `UiSelection`). UI state only: it never
   * changes the game and holds a CardId of the viewer's OWN Hand, which must not be rendered into attributes.
   * The controller clears it when the viewer, screen, game epoch, `actionCount`, phase or turn changes, or when
   * the drafted card leaves the Hand.
   */
  readonly draft: PlacementDraft;
  /**
   * Incremented whenever the controller invalidates the draft (and so must also cancel an active drag gesture).
   * A render host cancels its gesture when the value it last saw has changed.
   */
  readonly gestureEpoch: number;
  readonly lastError: DisplayErrorRecord | null;
  /**
   * Number of accepted Actions of the running game (0 when idle). It changes on every accepted Action, which is
   * how an unchanged-looking model still signals "the view changed". It is public information (the history).
   */
  readonly actionCount: number;
  /** True when an AI seat could not play (illegal Action or a failing strategy); the AI loop is stopped. */
  readonly aiStalled: boolean;
}

export function initialModel(language: Lang): AppModel {
  return Object.freeze({
    language,
    screen: 'SETUP',
    viewer: null,
    gate: null,
    draft: EMPTY_DRAFT,
    gestureEpoch: 0,
    lastError: null,
    actionCount: 0,
    aiStalled: false,
  });
}

export type Listener<T> = (value: T) => void;

export interface Store<T> {
  get(): T;
  /** Replaces the value and notifies the subscribers (also when the value is deeply equal). */
  set(next: T): void;
  update(change: (current: T) => T): void;
  /** Returns the unsubscribe function. Subscribing the same function twice registers it twice. */
  subscribe(listener: Listener<T>): () => void;
}

/**
 * A synchronous observable cell. Listeners run in subscription order after the value is stored. A listener that
 * is unsubscribed while a notification is running does not receive that notification if it had not run yet.
 */
export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners: Listener<T>[] = [];
  const set = (next: T): void => {
    value = next;
    for (const listener of [...listeners]) {
      if (listeners.includes(listener)) listener(value);
    }
  };
  return {
    get: () => value,
    set,
    update: (change) => set(change(value)),
    subscribe(listener) {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
  };
}
