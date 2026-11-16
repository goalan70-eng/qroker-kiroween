// Run after `npm run build`. Publishes nothing; prepare only the local static directory.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (!metadata.license || metadata.license === 'UNLICENSED') {
  throw new Error('Owner-approved package.json license and root LICENSE are required before packaging.');
}
// Read every prerequisite before changing the build directory.
for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  const contents = await readFile(path.join(root, name), 'utf8');
  if (!contents.trim()) throw new Error(`${name} is empty`);
}
await stat(path.join(dist, 'index.html'));
for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  await copyFile(path.join(root, name), path.join(dist, name));
}

const files = [];
async function inventory(directory, prefix = '') {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const relative = prefix + entry.name;
    if (relative === 'build-info.json') continue;
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink in static build: ${relative}`);
    if (entry.isDirectory()) await inventory(path.join(directory, entry.name), relative + '/');
    else if (entry.isFile()) {
      const data = await readFile(path.join(directory, entry.name));
      files.push({ path: relative, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
    }
  }
}
await inventory(dist);
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const report = {
  schemaVersion: 1,
  commit: git('rev-parse', 'HEAD'),
  workingTreeDirty: git('status', '--porcelain', '--untracked-files=normal') !== '',
  license: metadata.license,
  node: process.version,
  files,
  note: 'Local build metadata; not proof of public deployment. Dirty builds may differ from the named commit.',
};
await writeFile(path.join(dist, 'build-info.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Prepared dist/ with ${files.length} inventoried files, license and notices. Nothing deployed.`);
