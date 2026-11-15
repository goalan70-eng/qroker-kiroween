/**
 * QRoker local verification adapter for Kiro PostTaskExecution.
 * It intentionally sends NO source code, logs, or prompts to ntfy.
 * Kiro receives only one generic success/failure line.
 *
 * Opt-in to mobile notifications by setting QROKER_NTFY_TOPIC outside the repository.
 * The topic is not authentication: public ntfy.sh topics are unprotected.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const steps = [
  { label: 'typecheck:game', args: ['run', 'typecheck:game'] },
  { label: 'test:game', args: ['run', 'test:game', '--', '--maxWorkers=2'] },
];

function runStep(step) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok, reason) => {
      if (settled) return;
      settled = true;
      resolve({ ok, reason });
    };
    const child = spawn('npm', step.args, {
      cwd: root,
      shell: process.platform === 'win32',
      windowsHide: true,
      stdio: 'ignore',
    });
    child.once('error', () => finish(false, 'could not start npm'));
    child.once('close', (code, signal) => {
      finish(code === 0, signal ? 'terminated' : 'exit ' + String(code));
    });
  });
}

async function notify(result) {
  const topic = process.env.QROKER_NTFY_TOPIC;
  if (!topic) return;
  if (!/^[a-zA-Z0-9_-]{24,100}$/.test(topic)) {
    console.error('QRoker: invalid QROKER_NTFY_TOPIC; notification skipped.');
    return;
  }

  // Never send paths, command output, source, prompts, or credentials.
  const ok = result.ok;
  const message = ok
    ? 'QRoker verification passed. Check Kiro on your PC.'
    : 'QRoker verification failed. Check Kiro on your PC.';
  try {
    const response = await fetch('https://ntfy.sh/' + topic, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        Title: 'QRoker verification',
        Priority: ok ? '3' : '4',
      },
      body: message,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.error('QRoker: mobile notification was not delivered.');
    }
  } catch {
    console.error('QRoker: mobile notification was not delivered.');
  }
}

async function main() {
  let result = { ok: true };
  for (const step of steps) {
    const outcome = await runStep(step);
    if (!outcome.ok) {
      result = { ok: false, label: step.label, reason: outcome.reason };
      break;
    }
  }
  await notify(result);
  if (result.ok) {
    console.log('QRoker verification passed (typecheck:game, test:game).');
  } else {
    console.error(
      'QRoker verification failed at ' + result.label +
      ' (' + result.reason + '). Run npm run ' + result.label +
      ' locally to view the full diagnostics.'
    );
    process.exitCode = 1;
  }
}

await main();
