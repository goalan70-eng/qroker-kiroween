import type { PlayerId } from '../../core/types';
import type { HFunction } from '../dom';
import type { Translate } from './card-face';

export interface SeatTiming {
  readonly phase: 'placement' | 'prediction';
  readonly seconds: number;
  readonly seats: readonly PlayerId[];
  readonly actionCount: number;
}

export interface TimerClock {
  now(): number;
  repeat(callback: () => void): () => void;
}

/** The scoreboard rebuilds its rows on a draft or language change. Keep the deadline outside those rows. */
export function createSeatTimers(h: HFunction, t: Translate, clock?: TimerClock) {
  let key = '';
  let deadline = 0;
  let formCountdown: HTMLElement | undefined;
  let cancel: (() => void) | undefined;
  let timing: SeatTiming | undefined;
  const active: { text: HTMLElement; gauge: HTMLElement }[] = [];

  function stopTicking(): void {
    cancel?.();
    cancel = undefined;
  }

  function update(next?: SeatTiming, mirror?: HTMLElement): void {
    formCountdown = mirror;
    active.length = 0;
    timing = next;
    const id = next ? [next.actionCount, next.phase, next.seconds, ...next.seats].join('|') : '';
    if (id === key) return;
    stopTicking();
    key = id;
    if (next) deadline = (clock?.now() ?? 0) + next.seconds * 1000;
  }

  function tick(): void {
    if (!timing) return;
    const remaining = Math.max(0, (deadline - (clock?.now() ?? 0)) / 1000);
    const seconds = Math.ceil(remaining);
    const label = seconds === 0 ? t('scoreboard.timer.expired') : t('scoreboard.timer.seconds', { count: seconds });
    if (formCountdown && formCountdown.textContent !== label) formCountdown.textContent = label;
    for (const { text, gauge } of active) {
      if (text.textContent !== label) text.textContent = label;
      gauge.setAttribute('value', String(Math.min(remaining, timing.seconds)));
    }
    if (seconds === 0) stopTicking();
  }

  function row(seat: PlayerId): HTMLElement | null {
    if (!timing) return null;
    const running = timing.seats.includes(seat);
    const label = running
      ? t(timing.phase === 'placement' ? 'scoreboard.timer.place' : 'scoreboard.timer.guess')
      : t('scoreboard.timer.wait');
    const text = h('span', { class: 'seat-time-left', attrs: { role: 'timer' } });
    const gauge = h('progress', { attrs: { max: timing.seconds, value: 0 }, aria: { hidden: 'true' } });
    if (running) active.push({ text, gauge });
    return h('span', { class: running ? 'seat-timer is-running' : 'seat-timer' },
      h('span', { class: 'seat-time-phase' }, label), gauge, text);
  }

  function startTicking(): void {
    tick();
    if (clock && active.length && !cancel && deadline > clock.now()) {
      cancel = clock.repeat(tick);
    }
  }

  return { update, row, startTicking, dispose: () => update() };
}
