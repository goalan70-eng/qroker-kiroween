// Vite config for the Practice Mode app (task 16.1, decision D3 of the qroker-playable-game design).
// Vitest does NOT read this file: when both exist, `vitest.config.ts` wins, so `npm test` is unchanged.
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/game/ui',
  base: './',
  build: {
    outDir: '../../../dist',
    // outDir is outside `root`, so Vite does not empty it by default; this makes a rebuild remove stale hashed files.
    emptyOutDir: true,
    target: 'es2022',
  },
});
