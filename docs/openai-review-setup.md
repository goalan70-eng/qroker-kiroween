# OpenAI API reviewer — QRoker (Windows)

The reviewer is an optional second opinion on code changed under src/game/. Kiro remains the main development tool. It never edits project sources, approves actions, or commits code.

## 1. API project and key

1. Create/select a dedicated project in https://platform.openai.com/ .
2. Under project Limits, set a small monthly spend limit, spend alerts and Enforce a hard limit when available. Enforcement may lag.
3. Create a project-scoped API key. Never paste it into ChatGPT, Kiro prompts, or GitHub.
4. Open Windows 'Edit environment variables for your account' and add OPENAI_API_KEY as a user variable. Restart Kiro and the terminal.

API usage is billed separately from Kiro credits. Models are selectable with --model. Approved models are gpt-6-luna (default, low cost) and gpt-6.1-terra (stronger review). Model access and prices depend on your Platform project.

## 2. Preview before any billable request

From the QRoker repository:

```powershell
npm run review:openai
npm run review:openai -- --base HEAD~1
```

These commands only inspect tracked code diffs under src/game/. They send NOTHING to OpenAI and do not require an API key. Untracked files are excluded. Review the patch yourself first: git diff HEAD~1 -- src/game/

To explicitly send a limited patch:

```powershell
npm run review:openai -- --send --base HEAD~1
npm run review:openai -- --send --base HEAD~1 --model gpt-6.1-terra
```

The default base is a recent local Spec-start revision if one exists, otherwise HEAD. Set --base HEAD~1 when reviewing the latest commit. When no tracked changes exist the request is skipped.

## 3. Cost limits and privacy

- Dry run by default. Real API call requires --send.
- Maximum 12,000 changed characters and 900 output tokens per request.
- Maximum 3 attempted requests per UTC day per local PC; no automatic retries.
- Only patches under src/game/ are selected. No .kiro/, .env, local journal, or private key files are included.
- Basic credential detection blocks suspicious patches, but does NOT guarantee that no sensitive information is present. Review the patch manually.
- Responses API uses store: false. This does not imply a universal zero-retention guarantee.
- Model output is advisory and unverified. Neither the patch nor findings are automatically forwarded to Kiro or GitHub.
- Reports are stored outside Git under %LOCALAPPDATA%\QRokerOpenAIReviews\ . They can contain code excerpts.
- The local rate limit does not constrain other computers or tools. Configure a hard project limit in OpenAI Platform.

## 4. Optional Kiro task Hook (OFF by default)

File: .kiro/hooks/optional-openai-review.json

The disabled PostTaskExec Hook can call the reviewer after a Kiro Spec task. It only sends when BOTH conditions are met:

The repository's `enabled: false` value is intentional. Do not commit a local enabled override; it would cause the repository Hook safety validator to fail. Neither a configured key nor the environment variable alone activates this Hook.

1. The Hook is explicitly enabled in the Kiro Agent Hooks UI.
2. Windows user environment variable QROKER_OPENAI_REVIEW_AUTOMATION equals 1 (and OPENAI_API_KEY is configured).

Recommended: use manual --send first. Every automatic review is billable. For immediate shutdown, disable the Hook, remove the opt-in environment variable, and revoke the key if compromised.

## 5. Verification and Kiroween

Run node --test scripts/openai-review.test.mjs for an offline test. CI tests code paths without an API key and never calls a model.

Kiro should remain substantially involved in Specs, code implementation, corrections and tests. Treat any external reviewer finding as a hypothesis until validated by local tests and independent GitHub Actions. Do not present OpenAI reviewer output as a Kiro-produced test result.
