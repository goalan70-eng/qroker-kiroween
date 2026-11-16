# Local English browser demonstration evidence

Recorded and inspected on **2026-11-16**. This is a local preparation artifact, not a public YouTube video or a public deployment. Both public URL fields remain unavailable. No Kiro session, real phone, printed card or physical-camera result is depicted.

## Final export

| Item | Verified value |
| --- | --- |
| Local file, ignored by Git | `.submission/recording/qroker-browser-demo-en.webm` |
| Measured container duration | **153.84 seconds (2:33.84)**, below three minutes |
| Format | VP9 WebM, 1280×960, 25 fps; English UI and readable English caption overlays; no audio track |
| Size | 19,249,074 bytes |
| SHA-256 | `ae5f86acde5fe38b9750fe4ae69b500abbd2fbf9fbee96a310b79548c196aa56` |
| Browser | Chromium 159.0.8154.6, desktop viewport; not a real device |
| Working-tree HEAD | `a2d3bf3b93b0f62cfb43ef01869f1b2e2e241eca`; submission preparation changes were uncommitted during capture |
| Main merge base | `3ca08b98ce15a876cf4c7480f465e8892ce1a136` |
| Setup | Seed entered through UI: `20240601`; one human, three `BEGINNER` AI |

The recorder logs source revision, dirty status, its own checksum and every served `dist/` file checksum in the ignored `.submission/recording/recording-evidence.json`. The served JavaScript was `dist/assets/index-WvsJNiFS.js`, SHA-256 `2e0cad44546fd4b2455a423015673063104b78a8dd55669f50e4730b541812b9`. Captured build hashes, not the later submission commit alone, identify the runtime used here.

## Executed behavior and checks

The [recorder](../../scripts/record-submission-demo.mjs) drove the existing built production app through real DOM controls: English setup, typed seed, actual mouse drag, preview, meaningful rotation, confirmation, Guess entry, public reveal, actual browser reload, Continue and final ranking. It completed 15 public-control steps. The Board labels, own Hand labels and scoreboard matched before reload and after Continue. The actual final ranking had four rows and its bounding box was checked above the caption area.

The app clock, seeded RNG, game state and AI pacing were not stubbed. Inputs were automated and captioned as such; there are no cuts or speed changes. The closing disclosure is held on the real results screen. The repository segment displays actual file text in a clearly labelled viewer: **"Repository artifacts — not a recorded Kiro session."** This supports artifact existence, not historical Kiro execution.

The final recorder run exited **0**. `pageerror` and `console.error` collections were empty. Its route guard recorded no external request attempt; it allowed only its own loopback preview origin. No paid model API or upload was used.

Commands executed:

```sh
node --check scripts/record-submission-demo.mjs
node --import tsx scripts/record-submission-demo.mjs
```

The recorder served the already built `dist/` with its own Vite preview, exported the WebM, inspected it with the cached Playwright ffmpeg and enforced a duration below 180 seconds. ffmpeg's inspection reports only a video stream, not audio. Its input-inspection command intentionally has no output argument; the expected ffmpeg diagnostic is preserved in `.submission/recording/ffmpeg-inspection.txt` and is not treated as a successful decode command.

Nine PNG frames were successfully extracted from the **final export** at 3, 12, 33, 40, 51, 61, 73, 82 and 145 seconds; all nine were visually inspected. They show setup, placement, Guess, reveal, Continue, visible ranking, spec/design text, hook text and closing limits. English captions are readable in these samples. The actual-app [preview screenshot](assets/practice-mode.png), captured without recording overlays, was also visually inspected. This is sampled frame inspection, not a claim of human playback of every frame.

## Earlier attempts and limits

The sandbox could not reach its loopback preview, so the browser recording was run natively in the same authorized workspace. Two short failed attempts then exposed a `tsx`-transformed nested helper (`__name` unavailable inside browser evaluation). The recorder now uses native `.mjs` step detection with the same public selectors; app and existing tests were not changed. Those partial files remain ignored locally and are not the final export.

A first complete export passed its interaction assertions, but frame inspection found that prior input left the ranking above the viewport. The recorder was corrected to scroll the actual ranking into view and assert visibility; the final export above was then recorded and inspected afresh. No game state was fabricated to repair the footage.

This single-seed desktop recording does not establish game balance, AI strength, cross-browser behavior, real-device input, offline operation, physical concealment or camera accuracy. Original Kiro platforms/sessions, final contest category, license choice and public app/video access still require the owner checks listed in [readiness](README.md). Nothing was merged, deployed, uploaded or submitted by this recording task.
