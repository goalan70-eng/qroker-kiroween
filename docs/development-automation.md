# QRoker development automation

These tools automate verification, not game decisions. They are optional development
helpers and do not modify the game engine, source of truth, or frozen optical codebook.

## Workspace Steering (minimal token use)

- `.kiro/steering/project.md` is a short **always-included** context for QRoker's actual rules, source-of-truth Specs, frozen V1 optics, privacy and verification boundaries. Keep it concise to avoid unnecessary Kiro context/credit use.
- `.kiro/steering/optical-v2.md` is **manual**: include it only when intentionally working on the proposed square V2 code, using `#optical-v2`. The proposal is not an approved Kiro Spec and is tracked in Issue #16.
- Use local Kiro **Steering** UI to verify the files are detected after checkout. An independent GitHub CI run cannot establish that the local Kiro session loaded them. Custom agents may require an explicit steering resource declaration.
- Steering contains **instructions, not executable automation**. Do not store API keys or local secrets there.

## Safe default Hook policy

| Hook | Repository default | Why |
| --- | --- | --- |
| PreTaskExec evidence | enabled | Small local verification breadcrumb, no AI prompt |
| PostTaskExec verification | enabled | Local typecheck + game tests, no AI model |
| PostFileSave TypeScript check | enabled, 60-second throttle | Runs only for `src/game/**/*.ts[x]` on save; new matcher handles relative/absolute Windows paths |
| AgentStop notification | enabled but inert without valid `QROKER_NTFY_TOPIC` | Optional local generic ntfy message; no automatic permission-approval notification |
| PreToolUse shell guard | **disabled** | Tool context and false-positive behavior require a local trial before enablement |
| PostTaskExec external OpenAI review | **disabled** | Paid API; requires both explicit Hook activation and `QROKER_OPENAI_REVIEW_AUTOMATION=1`, a valid key and tracked diff |

The two disabled Hooks are intentionally **not** activated merely because a helper script or environment variable exists. Do not commit a local opt-in as a shared default. The Hook configuration validator deliberately fails CI if either is enabled in a committed copy.

**Local verification from the repository root:**

```powershell
node scripts/validate-hook-config.mjs
node --test scripts/automation-hooks.test.mjs
node --test scripts/openai-review.test.mjs
```

These checks validate syntax, matches and isolated behavior but **not** actual Kiro event delivery, Windows notifications, or external API operation. On the user's PC, open Kiro Agent Hooks, check the active states, test an ordinary Spec task and inspect the locally stored verification record. To test the shell guard, enable it only in the local workspace, try a benign tool call and a non-destructive simulated input, then disable it if any unexpected block occurs.

## Cloud CI (GitHub Actions)

The workflow `.github/workflows/verify.yml` runs on:
- Pull requests (including feature branches)
- Pushes to `main`
- Manual `workflow_dispatch` runs (after the workflow is available on main)

It uses a standard Ubuntu GitHub-hosted runner and Node.js 24.
The jobs execute the project's existing commands:

```sh
npm ci
npm run typecheck
npm run typecheck:game
npm run check:codebook
npm run test:ci
npm run build
```

The workflow uses read-only repository permissions, SHA-pinned official GitHub
actions, and no AI model, external notification destination, or repository secret.
It does not commit, deploy, publish, or mark spec tasks complete.

The full suite includes synthetic optical tests. Passing it **does not** establish
real printed-card or real phone-camera performance. Some CPU-heavy tests have
previously timed out under contention; distinguish such timeouts from assertion
failures instead of hiding failures or weakening assertions.

## Local Kiro task verification

`.kiro/hooks/verify-after-task.json` uses the official standalone v1 Kiro Hook
format with `PostTaskExec` and a **command** action, not an AI prompt.
It invokes `node scripts/verify-task.mjs` in the repository root.

Run the same checker manually:

```sh
npm ci
node scripts/verify-task.mjs
```

The checker executes these existing npm commands, sequentially:

```sh
npm run typecheck:game
npm run test:game -- --maxWorkers=2
```

For Kiro, it prints only a short pass/fail summary. On failure it exits nonzero
and asks for a local manual diagnostic run; it does not auto-fix, retry, mark a
task finished, write a commit, or upload logs.

The hook runs **after a Kiro Spec task execution**, not after every chat turn,
and a passing hook does not prove every acceptance criterion is met. Kiro IDE
and CLI V3 support the trigger; it is not a mobile or Web-triggered hook.
If your Kiro installation does not recognize the hook, update Kiro and
check the Agent Hooks panel. Validate its behavior on the PC before relying on it.

## Optional ntfy mobile notification (local PC only)

The checker has no mandatory network access. To enable notifications, set
`QROKER_NTFY_TOPIC` as a **user-level environment variable on your PC**
to the same high-entropy topic already subscribed to by the Android ntfy app.
Use Windows "Edit environment variables for your account" and add the variable
there. Restart Kiro afterwards so it inherits the new environment.

Do **not** commit the topic to this repository, paste it into a public Hook
definition, or add it to a GitHub Actions secret. The script only connects to
`https://ntfy.sh`, and sends exactly one of these generic strings:

- `QRoker verification passed. Check Kiro on your PC.`
- `QRoker verification failed. Check Kiro on your PC.`

It sends no prompt, error log, test data, paths, or source code.
Delivery failure does not change the test result. With no environment variable
the script makes no outbound request.

Public ntfy.sh topics have no access control: anyone knowing the topic may
read/send messages. Even with an unguessable topic, do not use this for
confidential information. For access-controlled delivery, use an authenticated
notification service instead of this public endpoint.

To disable notification, remove the user-level environment variable and
restart Kiro. To disable verification, disable the Hook in Kiro's Agent Hooks
panel. GitHub CI is unaffected by local notification settings.

## User approval / choice-required alerts

Kiro's `Action Required` Windows notification is **not** the same as a
`PostTaskExec` Hook event. This change does not implement Windows
notification mirroring or automatic approval. A separate, permissions-scoped
Windows notification relay needs on-device testing if mobile approval alerts
are required. Never automatically grant Kiro permissions via a notification.

## Kiroween and repository safety

- `.kiro/specs/` and `.kiro/hooks/` remain in the submission repository.
- No application behavior, gameplay rules, scoring values or optical files change.
- No automatic Git push/commit and no additional AI agent prompts.
- Normal test failure reports are not equivalent to completed real-device tests.
- A manual reviewer should still confirm requirements and test evidence.


## Extended command-only Kiro Hooks

Shared file: .kiro/hooks/development-automation.json

| Trigger | Default | Behavior |
| --- | --- | --- |
| PreTaskExec | enabled | Record a minimal local timestamp and Git revision before Spec execution |
| PostTaskExec | enabled (existing) | Game typecheck, test:game, local verification record, optional ntfy |
| PostFileSave | enabled | Run typecheck:game at most every 60 seconds after game file saves |
| AgentStop | enabled | Optional generic mobile message when an agent response ends |
| PreToolUse | **disabled in shared config until locally verified** | Detect a limited set of destructive shell commands |

These are local IDE / supported CLI Hooks, not cloud validation. The independent
GitHub Actions workflow still runs the full suite after push/PR.

### Local evidence: no external upload

Task-start and task-verification events append small JSON-lines records to
%LOCALAPPDATA%\QRokerHookData\events.jsonl on Windows, or
~/.local/state/QRokerHookData/events.jsonl elsewhere.

Records contain only timestamps, event type, abbreviated Git revision, check
names, pass/fail and durations (or a fixed guard reason). They exclude prompts,
source code, card/guess values, tool input, file paths, stack traces, session
IDs, and ntfy topics. This journal is never uploaded or committed. A user must
review evidence before quoting results in a Kiroween submission. The journal
can be removed locally at any time.

### Throttled PostFileSave typecheck

Only TypeScript files under src/game/ are matched. The existing native
TypeScript 7 command npm run typecheck:game runs at most once per 60 seconds,
with a 20-second process timeout. This avoids depending on the removed
TypeScript 6 JavaScript compiler API. It does not modify code, run AI,
validate actual DOM privacy, or replace Spec-level/full tests.
Missing/unrecognized event paths cause a silent skip, not a false success
claim. Temporary typecheck errors while code is half-written are possible.

### Rate-limited AgentStop notifications

The optional QROKER_NTFY_TOPIC Windows user environment variable enables
generic ntfy messages; it must never appear in project files or public logs.
AgentStop sends only "Kiro finished a response. Check your PC."
It is suppressed for 90 seconds after a successful verification notification
and for 45 seconds after a prior AgentStop notification, to prevent duplicate
or excessive pushes. This is **not** an alert for permission/approval requests
and does not prove that work succeeded.

### Guard deployment

PreToolUse is installed but disabled in shared Hook JSON. This is intentional:
a false positive could prevent normal development, and command input visibility
must be confirmed in the installed Kiro version. It is not a sandbox.

On the user's PC:
1. Run node --test scripts/automation-hooks.test.mjs
2. Ensure the Kiro IDE displays the guard in Agent Hooks.
3. Test a harmless command and inspect Kiro Hook logs / event delivery.
4. Only after confirming accurate detection, enable the guard locally.
5. Disable again if it blocks normal workflows.

The guard checks explicit common forms of git reset --hard, force clean/push,
bulk worktree discard, and protected-directory deletion. It cannot catch
unknown tools, arbitrary shell escaping, manual terminal commands or all
destructive operations. Keep Kiro permission controls and backups enabled.

### CI verification

The workflow syntax-checks every Hook script, validates all five command-only
Hook definitions, runs isolated node:test tests for guard and syntax cases,
then runs the established TypeScript, codebook, Vitest and build checks.

All Hooks use command actions; they do not directly call a language model,
auto-commit, alter approved rules, or approve permissions. Hook output can
indirectly enter the Kiro agent context, so all output is deliberately short.

The separate Windows Action Required notification relay remains unimplemented
and requires local notification permissions and real-device testing.

## Optional OpenAI API code reviewer

A new PostTaskExec Hook is included but **disabled by default**. This is a paid
external API call, unlike the command-only local verifiers. Its CI tests do not
call OpenAI. For Windows key, billing, manual preview and opt-in instructions see
[OpenAI reviewer setup](openai-review-setup.md). Never commit an API key.
