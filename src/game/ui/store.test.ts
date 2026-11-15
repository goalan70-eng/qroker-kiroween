// Tests of the observable store and the initial model (task 16.2).
import { describe, expect, it } from 'vitest';
import { createStore, EMPTY_SELECTION, initialModel } from './store';

describe('createStore', () => {
  it('gets, sets, updates and notifies in subscription order', () => {
    const store = createStore(1);
    const seen: string[] = [];
    store.subscribe((v) => seen.push(`a${v}`));
    store.subscribe((v) => seen.push(`b${v}`));
    store.set(2);
    store.update((v) => v + 1);
    expect(store.get()).toBe(3);
    expect(seen).toEqual(['a2', 'b2', 'a3', 'b3']);
  });

  it('unsubscribe stops notifications, also from inside a notification', () => {
    const store = createStore(0);
    const seen: string[] = [];
    let offB = (): void => undefined;
    const offA = store.subscribe((v) => {
      seen.push(`a${v}`);
      offB();
    });
    offB = store.subscribe((v) => seen.push(`b${v}`));
    store.set(1);
    expect(seen).toEqual(['a1']); // b was removed before its turn
    offA();
    offA(); // idempotent
    store.set(2);
    expect(seen).toEqual(['a1']);
  });
});

describe('initialModel', () => {
  it('is idle, frozen, and holds no game data', () => {
    const model = initialModel('ko');
    expect(model).toEqual({ language: 'ko', screen: 'SETUP', viewer: null, selection: EMPTY_SELECTION, lastError: null, actionCount: 0, aiStalled: false });
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(EMPTY_SELECTION)).toBe(true);
  });
});
