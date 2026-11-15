// Entry point (task 16.2, 19.4): the composition root. It creates the real services and hands them to `mountApp` and to
// the composition host of the game screens:
//   * the scheduler is the only place where `setTimeout` is used (the controller never touches timers);
//   * the language comes from the browser (`navigator.languages`, persistence is task 20);
//   * the seed source is `crypto`, the only place that reads it: it feeds the controller (rematch) and, as text, the setup
//     screen's default seed. No game starts automatically.
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
  renderer: host.render,
});