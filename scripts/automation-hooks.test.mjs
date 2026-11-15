import test from 'node:test';
import assert from 'node:assert/strict';
import {
  destructiveReason, gameFileRelativePath, savedFilePath,
  syntaxDiagnosticCount, toolCommands
} from './automation-hooks.mjs';

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

test('syntax check detects parse errors without needing a full test suite', async () => {
  assert.equal(await syntaxDiagnosticCount('export const x: number = 1;', 'x.ts'), 0);
  assert.ok(await syntaxDiagnosticCount('export const x = ;', 'x.ts') > 0);
  assert.equal(await syntaxDiagnosticCount('export const C = () => <div>OK</div>;', 'x.tsx'), 0);
});
