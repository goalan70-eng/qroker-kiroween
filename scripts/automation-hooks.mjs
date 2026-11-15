/**
 * Token-free Kiro event Hooks: Spec baseline, shell guard,
 * saved TypeScript syntax, and generic agent-stop notification.
 *
 * IMPORTANT: PreToolUse guard is disabled in JSON until locally tested.
 * It is defense in depth, not a full security policy.
 */
import { statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROJECT_ROOT, claimSaveCheckInterval, currentRevision, notifyMobile,
  readHookEvent, recordEvidence
} from './hook-support.mjs';

export function toolCommands(event) {
  const input = event?.tool_input;
  if (!input || typeof input !== 'object') return [];
  const nested = [input, input.parameters, input.arguments, input.input]
    .filter(item => item && typeof item === 'object');
  const commands = [];
  for (const obj of nested) {
    for (const key of ['command', 'cmd', 'script', 'command_line', 'shell_command']) {
      const value = obj[key];
      if (typeof value === 'string') commands.push(value);
    }
    if (Array.isArray(obj.commands)) {
      for (const item of obj.commands) {
        if (typeof item === 'string') commands.push(item);
        else if (typeof item?.command === 'string') commands.push(item.command);
      }
    }
  }
  return commands;
}

export function destructiveReason(command) {
  if (typeof command !== 'string' || command.length > 32768) return null;
  // Match explicit shell segments to avoid matching an 'echo' or normal comment.
  const parts = command.split(/(?:&&|\|\||;|\r?\n)/).map(s => s.trim());
  for (const part of parts) {
    const s = part.replace(/^(?:\$\s*)/, '');
    if (/^git\s+reset\s+--hard(?:\s|$)/i.test(s)) return 'git-hard-reset';
    if (/^git\s+clean\b.*(?:^|\s)(?:-[a-z]*f[a-z]*|--force)(?:\s|$)/i.test(s)) return 'git-force-clean';
    if (/^git\s+push\b.*(?:^|\s)(?:--force(?:=\S+)?|-f)(?:\s|$)/i.test(s)) return 'git-force-push';
    if (/^git\s+checkout\s+--\s+\.(?:\s|$)/i.test(s)) return 'git-discard-worktree';
    if (/^git\s+restore\s+\.(?:\s|$)/i.test(s)) return 'git-discard-worktree';
    if (/^(?:rm|rmdir)\s+-(?:rf|fr)\s+(?:\.\/)?(?:\.kiro|src|\.git)(?:[\/\\]|\s|$)/i.test(s))
      return 'delete-protected-directory';
    if (/^Remove-Item\b(?=.*(?:\.kiro|src|\.git))(?=.*-Recurse)(?=.*-Force)/i.test(s))
      return 'delete-protected-directory';
  }
  return null;
}

export function savedFilePath(event) {
  if (!event || typeof event !== 'object') return null;
  const candidates = [
    event.file_path, event.filePath, event.filepath, event.path,
    event.file?.path, event.file?.file_path,
    event.tool_input?.path, event.tool_input?.file_path
  ];
  return candidates.find(s => typeof s === 'string' && s.length > 0) || null;
}

export function gameFileRelativePath(file) {
  if (typeof file !== 'string' || file.includes('\0')) return null;
  const absolute = isAbsolute(file) ? resolve(file) : resolve(PROJECT_ROOT, file);
  const rel = relative(PROJECT_ROOT, absolute).replace(/\\/g, '/');
  return /^src\/game\/[^.].*\.tsx?$/.test(rel) ? rel : null;
}


async function main() {
  const mode = process.argv[2];
  if (mode === 'task-start') {
    recordEvidence('spec-start', { revision: currentRevision() });
    return;
  }

  if (mode === 'agent-stop') {
    await notifyMobile('agent-stop');
    return;
  }

  const event = await readHookEvent();
  if (mode === 'guard-shell') {
    for (const cmd of toolCommands(event)) {
      const reason = destructiveReason(cmd);
      if (reason) {
        recordEvidence('guard-match', { reason, revision: currentRevision() });
        // The JSON Hook is deliberately disabled until tested in Kiro.
        console.error('QRoker protection: blocked recognized destructive shell action (' + reason + ').');
        process.exitCode = 2;
        return;
      }
    }
    return;
  }

  if (mode === 'check-file') {
    const filename = savedFilePath(event);
    const rel = gameFileRelativePath(filename);
    if (!rel) return; // Unsupported/missing event path: no false positive.
    try {
      const abs = resolve(PROJECT_ROOT, rel);
      if (statSync(abs).size > 2_000_000) return;
      if (!claimSaveCheckInterval()) return;
      const started = Date.now();
      const result = spawnSync('npm', ['run', 'typecheck:game'], {
        cwd: PROJECT_ROOT,
        shell: process.platform === 'win32',
        windowsHide: true,
        stdio: 'ignore',
        timeout: 20000
      });
      const passed = result.status === 0 && !result.error;
      recordEvidence('save-typecheck', {
        revision: currentRevision(),
        passed,
        durationMs: Date.now() - started
      });
      if (!passed) {
        console.error('QRoker: a saved game file triggered a TypeScript check failure. Run npm run typecheck:game for details.');
        process.exitCode = 1;
      }
    } catch {
      // May be an atomic file replacement in progress; no false claim.
    }
    return;
  }
  console.error('QRoker: unrecognized hook mode.');
  process.exitCode = 1;
}

// When imported by node:test, expose pure functions without executing a Hook.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
