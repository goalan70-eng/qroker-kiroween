// Entry point (task 16.2, 19.4, 20.4, 21.1): the composition root. It creates the real services and hands them to
// `startApp` (`app.ts`), which wires the composition host of the game screens and `mountApp`:
//   * the scheduler is the only place where `setTimeout` is used (the controller never touches timers);
//   * the language comes from the browser (`navigator.languages`) unless the stored preferences name one (the controller
//     reads them through the store and `mountApp` applies it through the shell);
//   * the seed source is `crypto`, the only place that reads it: it feeds the controller (rematch) and, as text, the setup
//     screen's default seed. No game starts automatically;
//   * storage and clock (task 20.4): `browserStore()` is the only access to `localStorage`, and `new Date().toISOString()`
//     (ISO text with milliseconds and `Z`) is the only clock. The controller does the saving and the resume offer.
// This file is the only place that uses `setTimeout`, `navigator`, `crypto`, `localStorage` and `Date`.
import { browserStore } from '../persistence/storage';
import { startApp } from './app';
import { createGameAudio } from './game-audio';

const root = document.getElementById('app');
if (root === null) throw new Error('index.html has no #app element');

const audio = createGameAudio();
root.addEventListener('click', audio.activate, { capture: true });
startApp(root, {
  playSound: audio.play,
  timerClock: {
    now: () => performance.now(),
    repeat: callback => {
      const timer = window.setInterval(callback, 200);
      return () => window.clearInterval(timer);
    },
  },
  doc: document,
  languages: navigator.languages,
  schedule: (fn, ms) => {
    const id = setTimeout(fn, ms);
    return { cancel: () => clearTimeout(id) };
  },
  randomSeed: (): number => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0,
  store: browserStore(),
  nowIso: () => new Date().toISOString(),
});
