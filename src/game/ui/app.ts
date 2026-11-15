// App composition (task 21.1): the production wiring of the composition host and the controller, with every service
// injected. `main.ts` calls it with the real services; the DOM tests (`testing/mount.ts`) call it with fakes, so both run
// the same composition and there is no parallel implementation. This module uses no timer, `navigator`, `crypto`,
// `localStorage` or `Date`: everything comes from `deps`.
import type { KeyValueStore } from '../persistence/storage';
import { mountApp } from './controller';
import type { AppHandle, MountDeps, Schedule } from './controller';
import { createGameScreen } from './screens/game';
import type { GameScreen } from './screens/game';

export interface StartAppDeps {
  readonly doc: Document;
  /** `navigator.languages` in production. */
  readonly languages: readonly string[] | string | null | undefined;
  readonly schedule: Schedule;
  readonly randomSeed: () => number;
  readonly store: KeyValueStore;
  readonly nowIso: () => string;
  readonly strategyFor?: MountDeps['strategyFor'];
}

export interface StartedApp {
  readonly controller: AppHandle['controller'];
  readonly host: GameScreen;
  /** Disposes the app and the host. Idempotent: the second call does nothing. */
  dispose(): void;
}

/** Creates the host (before `mountApp`, as `main.ts` always did), mounts the app into `root` and returns the handles. */
export function startApp(root: HTMLElement, deps: StartAppDeps): StartedApp {
  const host = createGameScreen({ doc: deps.doc, root, randomSeedText: () => String(deps.randomSeed()) });
  const app = mountApp(root, {
    doc: deps.doc,
    languages: deps.languages,
    schedule: deps.schedule,
    randomSeed: deps.randomSeed,
    store: deps.store,
    nowIso: deps.nowIso,
    ...(deps.strategyFor === undefined ? {} : { strategyFor: deps.strategyFor }),
    renderer: host.render,
  });
  let disposed = false;
  return {
    controller: app.controller,
    host,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      app.dispose();
      host.dispose();
    },
  };
}
