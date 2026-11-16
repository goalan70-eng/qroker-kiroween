# Static deployment handoff

No site was deployed during submission preparation. Public app URL: **unavailable**.
GitHub Pages is a proposed host; selecting it and publishing require the owner's authorization.

## Review locally

After the owner approves the project license and its complete root `LICENSE` is present:

```sh
npm ci
npm run build:submission
npm run preview -- --host 127.0.0.1
```

The local `dist/` contains only browser assets, project license, third-party notices
and a SHA-256 build inventory. `build-info.json` identifies the source commit and
whether the worktree had uncommitted changes. It does not establish deployment.
The build uses relative asset paths, including for a project subdirectory.

## Publish after authorization

1. Review and integrate the intended stacked PRs. Run the existing verification
   workflow against the final integrated revision. Confirm the public source includes
   `LICENSE`, `THIRD_PARTY_NOTICES.md`, the root `.kiro/` and these instructions.
2. If GitHub Pages is approved, an administrator selects **Settings → Pages →
   Build and deployment → GitHub Actions**. Review the `github-pages` environment
   and restrict deployment to `main`; configure a required reviewer if available.
3. Run **Publish reviewed QRoker to GitHub Pages** on `main` and deliberately
   enable its `publish` input. The workflow has no push/PR/schedule trigger and
   refuses publication from another branch. It builds and tests locally before
   uploading **only `dist/`** to the deployment job.
4. Use the URL returned by the deployment step. Do not copy a guessed hostname
   into Devpost. In a fresh anonymous browser, verify setup in English, placement,
   Guess/reveal, a complete game and ranking, reload/Continue, and no console errors.
   Verify `LICENSE`, `THIRD_PARTY_NOTICES.md` and `build-info.json` at that same URL.
5. Record the public URL, exact deployed commit, workflow run and actual checks in
   the development log. Keep the game free and accessible throughout judging.

The workflow and repository Pages settings have not been executed/changed during
preparation. Passing a local preview does not verify public hosting, HTTPS,
anonymous access, mobile hardware or optical-camera functionality.

## Video and Devpost handoff

Review the [actual recording evidence](recording-evidence.md) and [script](video-script.md).
After approval, upload the final reviewed video to YouTube as **public**, verify
its measured duration is under three minutes and anonymous playback works, and
then replace the unavailable link in the [Devpost draft](devpost-draft.md).
Review Kiro history and category wording before submitting. No external publication
or contest submission is performed by this handoff.

References: [GitHub custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages),
[creating a Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site),
[Kiroween rules](https://kiroween.devpost.com/rules).
