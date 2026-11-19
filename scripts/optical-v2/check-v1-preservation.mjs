import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const codebook = 'src/optical/codebook.v1.json';
const expectedSha256 = '515eceb318648c14a47574496788236a2b1bbdfc7062387db09303cb717cc2d4';
// PR #18 added these two V2 planning paths in the old V1 documentation folder.
const v2PlanningPaths = new Set([
  'docs/optical/COMPOSITE-V2-PLAN.md',
  'docs/optical/assets/joker-four-piece-reference.svg',
]);

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, windowsHide: true });
}

function resolveCommit(cwd, ref) {
  return git(cwd, 'rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`).toString('utf8').trim();
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function isProtected(path) {
  return path.startsWith('src/optical/') ||
    (path.startsWith('docs/optical/') && !v2PlanningPaths.has(path)) ||
    (path.startsWith('scripts/') && !path.startsWith('scripts/optical-v2/')) ||
    path.startsWith('e2e/optical-') ||
    ['package.json', 'package-lock.json', 'tsconfig.json', 'vitest.config.ts'].includes(path);
}

function evaluate(cwd, pinRef, candidateRef, expected) {
  const pin = resolveCommit(cwd, pinRef);
  const candidate = resolveCommit(cwd, candidateRef);
  const hashAt = (commit) => sha256(git(cwd, 'cat-file', 'blob', `${commit}:${codebook}`));
  const pinHash = hashAt(pin);
  const changedEntries = git(cwd, 'diff', '--no-ext-diff', '--no-renames', '--name-status', '-z', pin, candidate, '--')
    .toString('utf8').split('\0');
  const protectedDiff = [];
  for (let i = 0; i + 1 < changedEntries.length; i += 2) {
    const path = changedEntries[i + 1];
    if (isProtected(path)) protectedDiff.push({ status: changedEntries[i], path });
  }
  // A missing or replaced-with-directory codebook is also captured in the diff.
  const candidateHash = git(cwd, 'ls-tree', candidate, '--', codebook).toString('utf8').includes(' blob ')
    ? hashAt(candidate) : null;
  const pinMatch = pinHash.toLowerCase() === expected.toLowerCase();
  const candidateMatch = candidateHash === pinHash;
  return {
    pin, candidate, codebook, expectedSha256: expected,
    pinSha256: pinHash, candidateSha256: candidateHash, pinMatch, candidateMatch,
    protectedDiff, passed: pinMatch && candidateMatch && protectedDiff.length === 0,
  };
}

function selfTest() {
  const parent = realpathSync(tmpdir());
  const dir = realpathSync(mkdtempSync(join(parent, 'qroker-m1-gate-')));
  try {
    git(dir, 'init', '--quiet');
    mkdirSync(join(dir, 'src', 'optical'), { recursive: true });
    mkdirSync(join(dir, 'docs', 'optical', 'results'), { recursive: true });
    const original = Buffer.from('fixture-a');
    const fixtureHash = sha256(original);
    const putBook = (bytes) => writeFileSync(join(dir, codebook), bytes);
    const commit = (message) => {
      git(dir, '-c', 'core.autocrlf=false', 'add', '--all');
      git(dir, '-c', 'user.name=M1 fixture', '-c', 'user.email=fixture@example.invalid',
        '-c', 'core.hooksPath=.git/m1-disabled-hooks', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', message);
      return resolveCommit(dir, 'HEAD');
    };
    putBook(original);
    const baseline = commit('fixture baseline');
    assert.equal(evaluate(dir, baseline, baseline, fixtureHash.toUpperCase()).passed, true);

    putBook(Buffer.from('fixture-b'));
    const corrupt = commit('fixture one-byte change');
    const changed = evaluate(dir, baseline, corrupt, fixtureHash);
    assert.equal(changed.passed, false);
    assert.equal(changed.candidateMatch, false);
    assert.equal(evaluate(dir, corrupt, corrupt, fixtureHash).pinMatch, false);
    assert.deepEqual(changed.protectedDiff, [{ status: 'M', path: codebook }]);

    putBook(original);
    const reportPath = 'docs/optical/results/unexpected.md';
    writeFileSync(join(dir, reportPath), 'fixture report');
    const added = evaluate(dir, baseline, commit('fixture added V1 report'), fixtureHash);
    assert.equal(added.passed, false);
    assert.equal(added.candidateMatch, true);
    assert.deepEqual(added.protectedDiff, [{ status: 'A', path: reportPath }]);
    console.log('Positive control, one-byte negative control and added-path negative control passed.');
  } finally {
    if (dirname(dir) !== parent || !basename(dir).startsWith('qroker-m1-gate-')) {
      throw new Error(`Refusing to remove unexpected fixture path: ${dir}`);
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--self-test') {
  selfTest();
} else if (args.length === 2) {
  const result = evaluate(process.cwd(), args[0], args[1], expectedSha256);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.passed ? 0 : 1;
} else {
  console.error('Usage: node scripts/optical-v2/check-v1-preservation.mjs <V1-pin> <evaluated-commit> | --self-test');
  process.exitCode = 2;
}
