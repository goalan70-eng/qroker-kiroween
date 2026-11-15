import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  destructiveReason, gameFileRelativePath, savedFilePath,
  toolCommands
} from './automation-hooks.mjs';
import { saveCheckDue } from './hook-support.mjs';

test('detects risky commands without executing them', () => {
  assert.equal(destructiveReason('git reset --hard'), 'git-hard-reset');
  assert.equal(destructiveReason('cd repo && git reset --hard HEAD'), 'git-hard-reset');
  assert.equal(destructiveReason('git clean -fdx'), 'git-force-clean');
  assert.equal(destructiveReason('git push --force origin main'), 'git-force-push');
  assert.equal(destructiveReason('git checkout -- .'), 'git-discard-worktree');
  assert.equal(destructiveReason('git restore .'), 'git-discard-worktree');
  assert.equal(destructiveReason('rm -rf .kiro'), 'delete-protected-directory');
  assert.equal(destructiveReason('Remove-Item .kiro -Recurse -Force'), 'delete-protected-directory');
});

test('does not block normal development operations', () => {
  for (const s of [
    'git status', 'git pull --ff-only origin main',
    'git push origin main', 'npm run test:game', 'npm run build',
    'echo "git reset --hard"', 'git clean -n', 'git push --force-with-lease origin main'
  ]) assert.equal(destructiveReason(s), null, s);
});

test('extracts shell tool inputs, never shells out to them', () => {
  assert.deepEqual(toolCommands({ tool_input: { command: 'git status' } }), ['git status']);
  assert.deepEqual(toolCommands({ tool_input: { commands: ['npm test', { command: 'git status' }] } }),
    ['npm test', 'git status']);
  assert.deepEqual(toolCommands({}), []);
  assert.deepEqual(toolCommands({ tool_input: { arguments: { script: 'npm run build' } } }),
    ['npm run build']);
});

test('targets only game TypeScript paths', () => {
  assert.equal(gameFileRelativePath('src/game/ui/main.ts'), 'src/game/ui/main.ts');
  assert.equal(gameFileRelativePath('src/game/ui/new.tsx'), 'src/game/ui/new.tsx');
  assert.equal(gameFileRelativePath('src/optical/decode-group.ts'), null);
  assert.equal(gameFileRelativePath('../../secrets.ts'), null);
  assert.equal(gameFileRelativePath('.kiro/hooks/test.ts'), null);
  assert.equal(savedFilePath({ file_path: 'src/game/ui/main.ts' }), 'src/game/ui/main.ts');
  assert.equal(savedFilePath({ filePath: 'src/game/ui/main.ts' }), 'src/game/ui/main.ts');
  assert.equal(savedFilePath({}), null);
});

test('on-save typecheck throttle limits frequency', () => {
  assert.equal(saveCheckDue(100000, NaN), true);
  assert.equal(saveCheckDue(100000, 99999), false);
  assert.equal(saveCheckDue(100000, 40000), true);
  assert.equal(saveCheckDue(100000, 200000), true);
});


test('actual PreToolUse entrypoint returns deny for simulated destructive input', () => {
  // The shell operation is a STRING inside JSON; it is never executed.
  const temp = mkdtempSync(join(tmpdir(), 'qroker-guard-test-'));
  const script = fileURLToPath(new URL('./automation-hooks.mjs', import.meta.url));
  try {
    const env = { ...process.env, LOCALAPPDATA: temp, QROKER_NTFY_TOPIC: '' };
    const blocked = spawnSync(process.execPath, [script, 'guard-shell'], {
      input: JSON.stringify({ tool_input: { command: 'git reset --hard HEAD' } }),
      encoding: 'utf8', timeout: 5000, env
    });
    assert.equal(blocked.status, 2, blocked.stderr);
    assert.match(blocked.stderr, /blocked recognized destructive/);
    assert.doesNotMatch(blocked.stderr, /HEAD/);

    const allowed = spawnSync(process.execPath, [script, 'guard-shell'], {
      input: JSON.stringify({ tool_input: { command: 'git status' } }),
      encoding: 'utf8', timeout: 5000, env
    });
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.equal(allowed.stdout, '');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
