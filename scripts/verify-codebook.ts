// CLI: independently verifies the frozen codebook and writes deterministic
// reports. Reads the codebook read-only; never writes to src/.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recomputeSha256, verifyCodebook, type VerificationReport } from '../src/optical/verify-codebook';

export const VERIFIER_VERSION = 'verify-codebook.v1';
const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const DEFAULT_INPUT = resolve(ROOT, 'src/optical/codebook.v1.json');
const DEFAULT_OUT = resolve(ROOT, 'docs/optical/results');

const NOT_COVERED = [
  'Image decoding (rasterization, thresholding, grid sampling).',
  'Pixel-level symmetry of the suit layer (rasterized fragments).',
  'Real cameras, lighting, blur, and perspective distortion.',
];

export interface RunResult {
  report: VerificationReport;
  jsonText: string;
  mdText: string;
}

function agreement(stored: unknown, measured: unknown) {
  return { stored: stored ?? null, measured: measured ?? null, match: JSON.stringify(stored) === JSON.stringify(measured) };
}

export function runVerification(inputPath: string, outDir: string): RunResult {
  const bytes = readFileSync(inputPath); // read-only
  const fileSha = createHash('sha256').update(bytes).digest('hex');
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    parsed = undefined;
  }
  const report = verifyCodebook(parsed);
  const obj = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>;
  const metadataAgreement = {
    dId: agreement(obj.dId, report.stats.dId),
    dSelf: agreement(obj.dSelf, report.stats.dSelf),
    weightRange: agreement(obj.weightRange, report.stats.weightMin === null ? null : [9, 16]),
    sha256: agreement(obj.sha256, recomputeSha256(parsed)),
  };
  const relPath = relative(ROOT, resolve(inputPath)).split('\\').join('/');
  const out = {
    verifierVersion: VERIFIER_VERSION,
    inputPath: relPath,
    fileSha256: fileSha,
    report,
    metadataAgreement,
    notCovered: NOT_COVERED,
  };
  const jsonText = JSON.stringify(out, null, 2) + '\n';

  const s = report.stats;
  const lines: string[] = [];
  lines.push('# Codebook verification', '');
  lines.push(`- Verifier: \`${VERIFIER_VERSION}\``);
  lines.push(`- Input: \`${relPath}\``);
  lines.push(`- File SHA-256: \`${fileSha}\``);
  lines.push(`- Result: **${report.ok ? 'PASS' : 'FAIL'}**`, '');
  lines.push('## Measured', '');
  lines.push(`- Cards: ${s.cards ?? 'n/a'}, templates: ${s.templates ?? 'n/a'}, pairs: ${s.pairs ?? 'n/a'}`);
  lines.push(`- Minimum pair distance: ${s.minPairDistance ?? 'n/a'}`);
  lines.push(`- dId: ${s.dId ?? 'n/a'}, dSelf: ${s.dSelf ?? 'n/a'}`);
  lines.push(`- Base weight: min ${s.weightMin ?? 'n/a'}, max ${s.weightMax ?? 'n/a'}`, '');
  lines.push('## Checks', '', '| Check | Result | Detail |', '| --- | --- | --- |');
  for (const c of report.checks) lines.push(`| ${c.id} | ${c.ok ? 'ok' : 'fail'} | ${c.detail.replace(/\|/g, '\\|')} |`);
  lines.push('', '## Metadata agreement', '', '| Field | Stored | Measured | Match |', '| --- | --- | --- | --- |');
  for (const [k, v] of Object.entries(metadataAgreement))
    lines.push(`| ${k} | \`${JSON.stringify(v.stored)}\` | \`${JSON.stringify(v.measured)}\` | ${v.match ? 'yes' : 'no'} |`);
  lines.push('', '## Distance histogram (all pairs)', '', '| Distance | Pairs |', '| --- | --- |');
  for (const [d, n] of Object.entries(s.distanceHistogram ?? {})) lines.push(`| ${d} | ${n} |`);
  if (report.failures.length) {
    lines.push('', '## Failures', '');
    for (const f of report.failures) lines.push(`- ${f}`);
  }
  lines.push('', '## Not covered', '');
  for (const n of NOT_COVERED) lines.push(`- ${n}`);
  const mdText = lines.join('\n') + '\n';

  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'codebook-verification.json'), jsonText);
  writeFileSync(resolve(outDir, 'codebook-verification.md'), mdText);
  return { report, jsonText, mdText };
}

function main(): void {
  const args = process.argv.slice(2);
  let outDir = DEFAULT_OUT;
  let input = DEFAULT_INPUT;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out-dir') outDir = resolve(args[++i] ?? '');
    else input = resolve(args[i] ?? '');
  }
  const { report } = runVerification(input, outDir);
  if (report.ok) {
    console.log(`codebook verification PASS (dId=${report.stats.dId}, dSelf=${report.stats.dSelf}, minDistance=${report.stats.minPairDistance})`);
    process.exit(0);
  }
  console.error('codebook verification FAIL:');
  for (const f of report.failures) console.error(`- ${f}`);
  process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
