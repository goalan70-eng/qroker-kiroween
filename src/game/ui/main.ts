// Entry point (task 16.2): the composition root. It creates the real services and hands them to `mountApp`:
//   * the scheduler is the only place where `setTimeout` is used (the controller never touches timers);
//   * the language comes from the browser (`navigator.languages`, persistence is task 20);
//   * the seed provider is used only when a game is started by a future screen. No game starts automatically.
import { mountApp } from './controller';

const root = document.getElementById('app');
if (root === null) throw new Error('index.html has no #app element');

mountApp(root, {
  doc: document,
  languages: navigator.languages,
  schedule: (fn, ms) => {
    const id = setTimeout(fn, ms);
    return { cancel: () => clearTimeout(id) };
  },
  randomSeed: () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0,
});