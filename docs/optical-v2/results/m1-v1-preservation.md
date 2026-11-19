# V1 preservation records

Date 2026-11-19 KST. Producer Codex. Environment Windows x64, Git `2.54.0.windows.1`, Node `v24.20.0`. Top-level seed N/A. Sample identifiers are the two commit trees and the scratch commits created by the self-test. The codebook is in scope under OP-20.4. For OP-6.9, this gate covers all V1 optical reports and fixtures in `docs/optical/`, with the exact two known V2 planning paths excluded. The audit also protects all V1 source, tests, tooling outside `scripts/optical-v2/`, any `e2e/optical-*` tests, and the pinned package/TypeScript/Vitest configuration.

```console
node scripts/optical-v2/check-v1-preservation.mjs --self-test
node scripts/optical-v2/check-v1-preservation.mjs ddad4473f2a30d56e033d578c7bff8263ac4a864 095f70ed76cc776a46e056c6a98217adbca2aa5b
node scripts/optical-v2/check-v1-preservation.mjs ddad4473f2a30d56e033d578c7bff8263ac4a864 HEAD
```

## M1-V1-SHA256 (EC 1)

**Pass.** The expected hash in Requirement 1.3, the computed hash at the provisional `main` pin, and the computed hash at the milestone's spec-branch parent are all `515ECEB318648C14A47574496788236A2B1BBDFC7062387DB09303CB717CC2D4` (hex case ignored). The script reads the exact Git blob at each commit. Failed items: none for the blob check. Unrun: byte comparison against physical output is outside this check.

Supplementary checkout diagnostic: the initial Windows worktree applied `core.autocrlf=true`, giving the on-disk hash `C1917429BEE76E228D60CB09C754CEDF0D600ED34992D2D2AC75D513BD123EC9`. `npm run check:codebook` detected this and exited 1 before Vitest. A fresh checkout of the same pin with `git -c core.autocrlf=false worktree add --detach` had the expected on-disk hash. The same `check:codebook` command then passed byte-for-byte. Those outcomes refer to different worktree bytes. No tracked file or repository Git configuration was edited to obtain the second checkout.

## M1-V1-DIFF (EC 1)

**Pass.** Comparing the `main` pin to the spec-branch parent returned `protectedDiff: []`. `git diff --name-status` did show historical unrelated test/document differences and V2 planning files because the branches diverge at `3ca08b9`. Neither the original game production tree nor the V1 optical source, tests, or reports differ between the provisional pin and the spec parent. The milestone review uses a second, stricter comparison to its own parent, allowing only the new audit documents and the standalone gate script. The final command above checks the committed milestone tree itself.

The temporary Git fixture verified that identical trees pass, changing one codebook byte fails the hash and path checks, using a changed pin fails the expected-hash check, and adding a V1 report fails the path check while keeping the hash equal. The fixture was created outside the V1 tree. All control assertions and the script syntax check passed. Failed controls: none. As an additional comparison, passing `a2d3bf3b93b0f62cfb43ef01869f1b2e2e241eca` as the candidate preserved the hash and exited 1 with 17 protected path differences, including `src/optical/detect.ts` and its tests. This was the expected result against the `main` pin. No PR #14 runtime tests were rerun for M1.
