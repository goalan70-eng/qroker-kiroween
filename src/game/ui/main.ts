// Entry point (task 16.2, 19.4, 20.4): the composition root. It creates the real services and hands them to `mountApp` and to
// the composition host of the game screens:
//   * the scheduler is the only place where `setTimeout` is used (the controller never touches timers);
//   * the language comes from the browser (`navigator.languages`) unless the stored preferences name one (the controller
//     reads them through the store and `mountApp` applies it through the shell);
//   * the seed source is `crypto`, the only place that reads it: it feeds the controller (rematch) and, as text, the setup
//     screen's default seed. No game starts automatically;
//   * storage and clock (task 20.4): `browserStore()` is the only access to `localStorage`, and `new Date().toISOString()`
//     (ISO text with milliseconds and `Z`) is the only clock. The controller does the saving and the resume offer.
import { browserStore } from '../persistence/storage';
import { mountApp } from './controller';
import { createGameScreen } from './screens/game';

const root = document.getElementById('app');
if (root === null) throw new Error('index.html has no #app element');

const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
const host = createGameScreen({ doc: document, root, randomSeedText: () => String(randomSeed()) });

mountApp(root, {
  doc: document,
  languages: navigator.languages,
  schedule: (fn, ms) => {
    const id = setTimeout(fn, ms);
    return { cancel: () => clearTimeout(id) };
  },
  randomSeed,
  store: browserStore(),
  nowIso: () => new Date().toISOString(),
  renderer: host.render,
});
