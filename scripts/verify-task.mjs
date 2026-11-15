/**
 * QRoker token-free post-Spec verifier. Only generic results reach Kiro/ntfy.
 * Minimal non-sensitive verification evidence stays outside the Git worktree.
 */
import { spawn } from 'node:child_process';
import {
  PROJECT_ROOT, currentRevision, notifyMobile, recordEvidence
} from './hook-support.mjs';

const steps = [
  { label: 'typecheck:game', args: ['run', 'typecheck:game'] },
  { label: 'test:game', args: ['run', 'test:game', '--', '--maxWorkers=2'] },
];

function runStep(step) {
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    const finish = (ok, reason) => {
      if (settled) return;
      settled = true;
      resolve({ name: step.label, passed: ok, reason, durationMs: Date.now() - started });
    };
    const child = spawn('npm', step.args, {
      cwd: PROJECT_ROOT,
      shell: process.platform === 'win32',
      windowsHide: true,
      stdio: 'ignore'
    });
    child.once('error', () => finish(false, 'could not start npm'));
    child.once('close', (code, signal) =>
      finish(code === 0, signal ? 'terminated' : 'exit ' + String(code)));
  });
}

async function main() {
  const started = Date.now();
  const results = [];
  for (const step of steps) {
    const result = await runStep(step);
    results.push(result);
    if (!result.passed) break;
  }

  const passed = results.length === steps.length && results.every(r => r.passed);
  recordEvidence('spec-verification', {
    revision: currentRevision(),
    passed,
    durationMs: Date.now() - started,
    checks: results.map(({ name, passed, durationMs }) => ({
      name, passed, durationMs
    }))
  });
  await notifyMobile(passed ? 'verification-pass' : 'verification-fail');

  if (passed) {
    console.log('QRoker verification passed (typecheck:game, test:game).');
    return;
  }
  const failure = results.find(r => !r.passed);
  console.error('QRoker verification failed at ' + failure.name +
    ' (' + failure.reason + '). Run npm run ' + failure.name +
    ' locally to view full diagnostics.');
  process.exitCode = 1;
}

await main();
