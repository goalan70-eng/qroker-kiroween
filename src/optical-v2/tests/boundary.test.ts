import { mkdtempSync, readdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const v2 = join(root, 'src', 'optical-v2');
const game = join(root, 'src', 'game');
const v1 = join(root, 'src', 'optical');
const opticalResults = join(root, 'docs', 'optical', 'results');

function filesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : [path];
  });
}

function hasBlockedImport(file: string, blocked: readonly string[]): boolean {
  const content = readFileSync(file, 'utf8');
  const imports = content.matchAll(/\b(?:from\s*|(?:import|require)\s*\(?\s*)(['"])([^'"\r\n]+)\1/g);
  for (const [, , name] of imports) {
    if (!name?.startsWith('.')) continue;
    const target = resolve(dirname(file), name).toLowerCase();
    if (blocked.some((folder) => target === folder.toLowerCase() || target.startsWith(folder.toLowerCase() + sep))) return true;
  }
  return false;
}

const isRuntime = (file: string) => /\.[jt]sx?$/.test(file) && !/\.test\.[jt]sx?$/.test(file);

it('keeps V2 runtime, historical V1 and game imports isolated, with results in their own tree', () => {
  const runtime = filesIn(v2).filter(isRuntime);
  expect(runtime.length).toBeGreaterThan(0);
  expect(runtime.filter((file) => hasBlockedImport(file, [game, v1]))).toEqual([]);
  expect(filesIn(game).filter(isRuntime).filter((file) => hasBlockedImport(file, [v2]))).toEqual([]);
  expect(filesIn(v1).filter(isRuntime).filter((file) => hasBlockedImport(file, [v2]))).toEqual([]);
  expect(filesIn(opticalResults).filter((file) => /(?:^|[\\/])(?:v2|m[123]-gate-r)/i.test(file))).toEqual([]);
  expect(filesIn(join(v2, 'tests')).some((file) => file.endsWith('.test.ts'))).toBe(true);
});

it('detects planted static, re-export and dynamic boundary violations in a temporary file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qroker-m3-boundary-'));
  const fixture = join(dir, 'probe.ts');
  try {
    writeFileSync(fixture, 'export { decode } from "./optical/decode";');
    expect(hasBlockedImport(fixture, [join(dir, 'optical')])).toBe(true);
    writeFileSync(fixture, 'import type { Board } from "./game/core/types";');
    expect(hasBlockedImport(fixture, [join(dir, 'game')])).toBe(true);
    writeFileSync(fixture, 'const future = import("./optical-v2/renderer");');
    expect(hasBlockedImport(fixture, [join(dir, 'optical-v2')])).toBe(true);
    expect(hasBlockedImport(fixture, [join(dir, 'optical')])).toBe(false);
  } finally {
    unlinkSync(fixture);
    rmdirSync(dir);
  }
});
