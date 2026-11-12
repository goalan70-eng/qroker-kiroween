import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateCodebook, serializeCodebook } from '../src/optical/codebook';

const target = fileURLToPath(new URL('../src/optical/codebook.v1.json', import.meta.url));
const args = process.argv.slice(2);
const check = args.includes('--check');
const force = args.includes('--force');

const fresh = Buffer.from(serializeCodebook(generateCodebook()), 'utf8');

if (check) {
  if (!existsSync(target)) {
    console.error(`check failed: frozen file missing: ${target}`);
    process.exit(1);
  }
  if (!fresh.equals(readFileSync(target))) {
    console.error('check failed: regenerated codebook differs from the frozen file (not overwritten).');
    process.exit(1);
  }
  console.log('check ok: regenerated codebook is byte-identical to codebook.v1.json');
} else {
  if (existsSync(target) && !force) {
    console.error(`Refusing to overwrite frozen codebook ${target}. Use --force to override.`);
    process.exit(1);
  }
  writeFileSync(target, fresh);
  console.log(`wrote ${target}`);
}
