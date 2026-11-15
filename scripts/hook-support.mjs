/**
 * Shared, dependency-free Kiro Hook helpers.
 * All state is local to the PC and OUTSIDE the Git repository.
 * Never log prompt, tool input, source, error trace, ntfy topic, or session IDs.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));

function localDir() {
  const base = process.env.LOCALAPPDATA || join(homedir(), '.local', 'state');
  return join(base, 'QRokerHookData');
}

function ensureLocalDir() {
  const p = localDir();
  mkdirSync(p, { recursive: true, mode: 0o700 });
  return p;
}

export function currentRevision() {
  try {
    const r = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 2000, windowsHide: true
    });
    const revision = (r.stdout || '').trim();
    return r.status === 0 && /^[a-f0-9]{7,40}$/i.test(revision) ? revision : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function recordEvidence(kind, fields = {}) {
  // Callers pass only fixed field names and sanitized values.
  try {
    const line = JSON.stringify({
      version: 1, at: new Date().toISOString(), kind, ...fields
    });
    appendFileSync(join(ensureLocalDir(), 'events.jsonl'), line + '\n',
      { encoding: 'utf8', mode: 0o600 });
  } catch {
    // Logging must never stop the developer's work or test verification.
  }
}

export async function readHookEvent() {
  if (process.stdin.isTTY) return null;
  try {
    let length = 0;
    const parts = [];
    for await (const part of process.stdin) {
      const buffer = Buffer.isBuffer(part) ? part : Buffer.from(part);
      length += buffer.length;
      if (length > 65536) return null;
      parts.push(buffer);
    }
    const raw = Buffer.concat(parts).toString('utf8').trim();
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readNotifyState() {
  try {
    const obj = JSON.parse(readFileSync(join(localDir(), 'notify-state.json'), 'utf8'));
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function writeNotifyState(state) {
  try {
    writeFileSync(join(ensureLocalDir(), 'notify-state.json'),
      JSON.stringify(state), { encoding: 'utf8', mode: 0o600 });
  } catch {
    // This file is a best-effort deduplication cache, not a security boundary.
  }
}

const MESSAGES = Object.freeze({
  'verification-pass': { title: 'QRoker verification', priority: '3',
    body: 'QRoker verification passed. Check Kiro on your PC.' },
  'verification-fail': { title: 'QRoker verification', priority: '4',
    body: 'QRoker verification failed. Check Kiro on your PC.' },
  'agent-stop': { title: 'Kiro agent stopped', priority: '3',
    body: 'Kiro finished a response. Check your PC.' }
});

export async function notifyMobile(kind) {
  const topic = process.env.QROKER_NTFY_TOPIC;
  const message = MESSAGES[kind];
  if (!topic || !message || !/^[A-Za-z0-9_-]{24,100}$/.test(topic)) return false;

  const now = Date.now();
  const state = readNotifyState();
  if (kind === 'agent-stop') {
    // Avoid notifying twice when a Spec verification just finished.
    if (now - (state.lastVerificationMs || 0) < 90000) return false;
    // Limit frequent chat-turn alerts (independent of Spec task completion).
    if (now - (state.lastStopMs || 0) < 45000) return false;
  }

  try {
    const response = await fetch('https://ntfy.sh/' + topic, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        Title: message.title,
        Priority: message.priority
      },
      body: message.body,
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return false;
    if (kind === 'agent-stop') state.lastStopMs = now;
    else state.lastVerificationMs = now;
    writeNotifyState(state);
    return true;
  } catch {
    return false;
  }
}
