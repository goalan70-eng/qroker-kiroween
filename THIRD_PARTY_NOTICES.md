# Third-party notices

Audit snapshot: 2026-11-16. Paths below are repository-relative and refer to files supplied by the installed packages.

## Scope and distribution

QRoker uses the development, build, and test dependencies listed below. There are no declared npm runtime dependencies. The inspected production browser bundle contains QRoker application modules plus Vite's generated modulepreload polyfill and Rolldown's generated runtime. Vite 8 delegates the modulepreload implementation to a Rolldown built-in plugin. The MIT notices supplied by these two build packages are retained below for the generated browser code.

Include this file with the published game web files. A web release does not need to ship the development tools or the `node_modules` directory. Preserve upstream license and notice files if those packages, package tarballs, test browsers, or their code are redistributed separately. The package notices may describe additional bundled components; the table's SPDX declaration does not replace those notices.

The machine-readable inventory in `docs/submission/dependency-license-inventory.json` records all locked packages, installed versions, license declarations, existing license/notice paths, and content hashes. Optional packages absent on the audited platform are marked as metadata-only. Two installed native packages (`@esbuild/win32-x64` and `@rolldown/binding-win32-x64-msvc`) supply no top-level license file; their package metadata declares MIT. They are build tools and are not shipped in the game web release.

This inventory is not legal advice or an assertion that every copyright right has been verified. The project license applies to project material as specified by its owner; it does not relicense third-party dependencies.

## Direct development dependencies

| Package | Locked and installed version | Declared SPDX | Supplied license / notice files |
| --- | --- | --- | --- |
| `@types/node` | 26.6.6 | MIT | `node_modules/@types/node/LICENSE` |
| `fast-check` | 4.10.2 | MIT | `node_modules/fast-check/LICENSE` |
| `happy-dom` | 21.0.4 | MIT | `node_modules/happy-dom/LICENSE` |
| `tsx` | 4.23.15 | MIT | `node_modules/tsx/LICENSE` |
| `typescript` | 7.0.2 | Apache-2.0 | `node_modules/typescript/LICENSE`, `node_modules/typescript/NOTICE.txt` |
| `vite` | 8.3.8 | MIT | `node_modules/vite/LICENSE.md` |
| `vitest` | 5.1.0 | MIT | `node_modules/vitest/LICENSE.md` |
| `@playwright/test` | 1.65.1 | Apache-2.0 | `node_modules/@playwright/test/LICENSE`, `node_modules/@playwright/test/NOTICE` |

Installed transitive dependencies also declare licenses including MPL-2.0, BSD-2-Clause, BSD-3-Clause, and ISC. Platform-specific lockfile entries additionally include 0BSD. They must retain their respective terms; they are not relabeled with QRoker's project license. This document does not copy every development dependency's license because those packages are not part of the intended web distribution.

## Vite generated browser helper — MIT

Source package: `vite@8.3.8`. License source: `node_modules/vite/LICENSE.md`, Vite core section. Generated module: `vite/modulepreload-polyfill.js`.

MIT License

Copyright (c) 2019-present, VoidZero Inc. and Vite contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Rolldown generated browser runtime and preload implementation — MIT

Source package: `rolldown@1.2.19`. License source: `node_modules/rolldown/LICENSE`. Generated module: `rolldown/runtime.js`; Vite's preload plugin is implemented by Rolldown.

MIT License

Copyright (c) 2024-present VoidZero Inc. & Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

end of terms and conditions

The licenses of externally maintained libraries from which parts of the Software is derived are listed [here](https://github.com/rolldown/rolldown/blob/main/THIRD-PARTY-LICENSE).

### Additional notices supplied with Rolldown

The following text is retained from `node_modules/rolldown/THIRD-PARTY-LICENSE` for the generated helper provenance. Retention does not imply that all of Rolldown's build-time dependencies are bundled into the game.

The MIT License (MIT)

Copyright (c) 2017 [these people](https://github.com/rollup/rollup/graphs/contributors)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

MIT License

Copyright (c) 2020 Evan Wallace

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Application assets and ownership limits

Inspection of `src/game` found no bundled image, font, music, audio, or video files and no external runtime asset URLs. The UI renders cards and board shapes with DOM/CSS and uses Unicode suit characters as text. Its CSS font stack names system/local fallback fonts; those font files are neither embedded nor downloaded by the application. The empty favicon is a `data:,` URL. The inspected in-memory Vite production output consists of local JavaScript, CSS, and HTML; no external HTTP(S) URL was found. The generated modulepreload polyfill includes a fetch for module links, so this observation does not mean the bundle contains no networking code.

The nine PNG files under `docs/optical/samples` are deterministic synthetic marker renders generated by `scripts/render-samples.ts`, `src/optical/render.ts`, and the repository's frozen optical patterns. All nine files match the SHA-256 hashes in their manifest. They are documentation/research fixtures, not third-party photography or current runtime game artwork.

No separate third-party artwork attribution was identified in the inspected game source. This is evidence about the current files, not proof of authorship. The project owner must confirm the project's copyright holder, contributor permissions, and authority to publish the source and generated patterns. Recheck this inventory when dependencies, runtime imports, assets, build settings, or the distribution contents change.
