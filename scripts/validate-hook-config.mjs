/**
 * CI audit of all QRoker Kiro Hook definitions.
 * Defends against accidental introduction of AI-powered or remote-execution Hooks.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const expected = new Map([
  ['QRoker post-task verification', 'PostTaskExec'],
  ['QRoker Spec start evidence', 'PreTaskExec'],
  ['QRoker destructive shell guard', 'PreToolUse'],
  ['QRoker fast TypeScript syntax check', 'PostFileSave'],
  ['QRoker agent turn mobile notification', 'AgentStop'],
  ['QRoker optional OpenAI independent review', 'PostTaskExec']
]);
const files = [
  '.kiro/hooks/verify-after-task.json',
  '.kiro/hooks/development-automation.json',
  '.kiro/hooks/optional-openai-review.json'
];
const seen = new Map();
for (const file of files) {
  const obj = JSON.parse(readFileSync(join(process.cwd(), file), 'utf8'));
  assert.equal(obj.version, 'v1');
  assert.ok(Array.isArray(obj.hooks) && obj.hooks.length >= 1);
  for (const hook of obj.hooks) {
    assert.equal(hook.trigger, expected.get(hook.name), hook.name);
    assert.equal(hook.action?.type, 'command', hook.name);
    assert.match(hook.action.command, /^node scripts\/[a-z0-9-]+\.mjs(?: (?:--[a-z-]+|[a-z-]+))*$/i);
    assert.equal(typeof hook.timeout, 'number');
    assert.ok(hook.timeout >= 1 && hook.timeout <= 360);
    assert.ok(typeof hook.enabled === 'boolean');
    assert.ok(!seen.has(hook.name), 'duplicate Hook: ' + hook.name);
    seen.set(hook.name, hook.trigger);
  }
}
assert.equal(seen.size, expected.size);
const guard = JSON.parse(readFileSync('.kiro/hooks/development-automation.json', 'utf8'))
  .hooks.find(hook => hook.trigger === 'PreToolUse');
// Repository defaults are safe. Local operator opt-in must not be committed.
assert.equal(guard.enabled, false, 'destructive shell guard must ship disabled');
assert.equal(guard.matcher, 'shell');

const devHooks = JSON.parse(readFileSync('.kiro/hooks/development-automation.json', 'utf8')).hooks;
const save = devHooks.find(hook => hook.trigger === 'PostFileSave');
assert.equal(save.enabled, true, 'local on-save typecheck should remain enabled');
const savePathPattern = new RegExp(save.matcher);
for (const path of [
  'src/game/ui/main.ts',
  'src/game/ui/main.tsx',
  'src\\game\\ui\\main.ts',
  'D:\\Project\\QRoker\\qroker-kiroween\\src\\game\\ui\\main.tsx'
]) assert.ok(savePathPattern.test(path), 'must match game TypeScript: ' + path);
for (const path of [
  'src/optical/detect.ts',
  'src/game/notes.js',
  'src/game/folder/readme.md',
  'xsrc/game/ui/main.ts'
]) assert.ok(!savePathPattern.test(path), 'must not match unrelated path: ' + path);

const external = JSON.parse(readFileSync('.kiro/hooks/optional-openai-review.json', 'utf8'))
  .hooks.find(hook => hook.name === 'QRoker optional OpenAI independent review');
assert.equal(external.enabled, false, 'billable API review must ship disabled');
assert.equal(external.action.command, 'node scripts/openai-review.mjs --send --hook');
console.log('QRoker Hook definitions passed: ' + seen.size +
  ' command-only Hooks; safe defaults and on-save path matcher verified.');
