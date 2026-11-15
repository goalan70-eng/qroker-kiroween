# QRoker development automation

These tools automate verification, not game decisions. They are optional development
helpers and do not modify the game engine, source of truth, or frozen optical codebook.

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
