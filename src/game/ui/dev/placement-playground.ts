// DEVELOPMENT ONLY, NOT THE GAME (task 17.3 verification). A composition root that renders the placement panel against
// the real controller: human P0 + three AI seats on a real `setTimeout` scheduler. It never submits Guesses: when a
// placement forms a code the playground stops (Guess entry is task 18). Nothing is stored on `window` or `globalThis`.
// The CSS files are linked from the HTML page. URL parameters: `?lang=ko|en` (default en), `?seed=<n>` (default 1), `?vis=OWNER_ONLY|FACE_UP`.
import { t } from '../../i18n';
import type { IdentityVisibility } from '../../core/types';
import { renderPlacementPanel } from '../components/placement-panel';
import type { PlacementPanelHandle } from '../components/placement-panel';
import { createController } from '../controller';

const root = document.getElementById('app');
if (root === null) throw new Error('placement-playground.html has no #app element');

const params = new URLSearchParams(location.search);
const lang = params.get('lang') === 'ko' ? 'ko' : 'en';
const seedParam = Number(params.get('seed') ?? '1');
const seed = Number.isInteger(seedParam) && seedParam >= 0 && seedParam <= 4294967295 ? seedParam : 1;
const vis: IdentityVisibility = params.get('vis') === 'FACE_UP' ? 'FACE_UP' : 'OWNER_ONLY';
document.documentElement.lang = lang;

const heading = document.createElement('p');
heading.className = 'dev-heading';
heading.textContent = 'Placement playground (development only, not the game)';
const status = document.createElement('p');
status.className = 'dev-status';
const note = document.createElement('p');
note.className = 'dev-note';
root.append(heading, status, note);

let panel: PlacementPanelHandle | null = null;
const controller = createController({
  schedule: (fn, ms) => {
    const id = setTimeout(fn, ms);
    return { cancel: () => clearTimeout(id) };
  },
  randomSeed: () => seed,
  language: () => lang,
  renderer: (input) => {
    if (panel === null) panel = renderPlacementPanel(document, root, input, t);
    else panel.update(input);
    const view = input.view;
    status.textContent =
      view === null
        ? 'no game'
        : `phase ${view.phase}, turn ${view.turn}, hand ${view.myHand.length}, deck ${view.deckCount}`;
    note.textContent =
      view !== null && view.phase === 'GUESS_COLLECT'
        ? 'Guess entry is not implemented yet (Task 18); the playground stops here'
        : '';
  },
});
controller.startPracticeGame({ seed, identityVisibility: vis });
