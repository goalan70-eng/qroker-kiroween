/** Offline photo evaluation only. A manifest's capture provenance is user-declared, never verified here. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { decodeGroup, type GroupDecodeResult } from '../src/optical/decode-group';
import { compareWithReference, referenceHiddenSum } from '../src/optical/reference-check';
import type { GrayImage } from '../src/optical/render';

const MAX_PIXELS = 16_000_000;
const MAX_HEADER_BYTES = 65_536;
const whitespace = (byte: number | undefined) => byte === 9 || byte === 10 || byte === 11 || byte === 12 || byte === 13 || byte === 32;

/** P5, one 8-bit sample per pixel, maxval exactly 255; exactly one raster, no trailing bytes. */
export function parsePgm(bytes: Uint8Array): GrayImage {
  let offset = 0;
  const token = (): string => {
    while (offset < bytes.length) {
      if (offset >= MAX_HEADER_BYTES) throw new Error('PGM header too large');
      if (whitespace(bytes[offset])) { offset++; continue; }
      if (bytes[offset] === 35) {
        while (offset < bytes.length && bytes[offset] !== 10 && bytes[offset] !== 13) {
          if (++offset >= MAX_HEADER_BYTES) throw new Error('PGM header too large');
        }
        continue;
      }
      break;
    }
    const start = offset;
    while (offset < bytes.length && !whitespace(bytes[offset]) && bytes[offset] !== 35) {
      if (++offset >= MAX_HEADER_BYTES) throw new Error('PGM header too large');
    }
    if (start === offset) throw new Error('Missing PGM header token');
    return Buffer.from(bytes.subarray(start, offset)).toString('latin1');
  };
  if (token() !== 'P5') throw new Error('Only binary P5 PGM is supported');
  const dimension = () => {
    const value = token();
    if (!/^[0-9]+$/.test(value)) throw new Error('Invalid PGM dimension');
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n <= 0) throw new Error('Invalid PGM dimension');
    return n;
  };
  const width = dimension(), height = dimension();
  if (width > MAX_PIXELS || height > MAX_PIXELS || width * height > MAX_PIXELS) throw new Error('PGM exceeds 16,000,000 pixel limit');
  if (token() !== '255') throw new Error('PGM maxval must be 255');
  // Do NOT skip arbitrary whitespace/comments here: the first pixel may itself be whitespace or '#'.
  if (!whitespace(bytes[offset])) throw new Error('Missing PGM raster separator');
  // CRLF is treated as one line ending, never guessed from the expected raster length.
  if (bytes[offset] === 13 && bytes[offset + 1] === 10) offset += 2;
  else offset++;
  if (bytes.length - offset !== width * height) throw new Error('PGM raster length differs from dimensions (truncated or extra bytes)');
  return { width, height, data: new Uint8Array(bytes.subarray(offset)) };
}

export interface TargetRegion { xMin: number; yMin: number; xMax: number; yMax: number }
export interface PhotoTrial {
  id: string; file: string; condition: string; expectedCards: string[]; targetRegion: TargetRegion;
}
export interface PhotoManifest {
  schemaVersion: 1;
  evidence: 'real-camera' | 'synthetic';
  session: { id: string; capturedAt: string; device: string; printer: string; paper: string; moduleMm: number };
  plan: { trialsPerCondition: number; conditions: string[] };
  trials: PhotoTrial[];
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function nonempty(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a nonempty string`);
}
function localFile(value: unknown): asserts value is string {
  nonempty(value, 'trial.file');
  if (isAbsolute(value) || /^[\\/]/.test(value) || /[:\0?#]/.test(value) || value.split(/[\\/]/).some(p => p === '..' || p === '' || p === '.')) {
    throw new Error('trial.file must be a local relative path without traversal or URL syntax');
  }
  if (!/\.pgm$/i.test(value)) throw new Error('trial.file must name a PGM file');
}
function validCaptureTime(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]! && Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 && Number(value.slice(17, 19)) < 60;
}
export function validateManifest(value: unknown): PhotoManifest {
  const m = object(value, 'manifest');
  if (m.schemaVersion !== 1) throw new Error('schemaVersion must be 1');
  if (m.evidence !== 'real-camera' && m.evidence !== 'synthetic') throw new Error('evidence must be real-camera or synthetic');
  const session = object(m.session, 'session');
  for (const key of ['id', 'capturedAt', 'device', 'printer', 'paper']) nonempty(session[key], `session.${key}`);
  if (!validCaptureTime(session.capturedAt)) throw new Error('session.capturedAt must be a valid ISO 8601 timestamp with timezone');
  if (typeof session.moduleMm !== 'number' || !Number.isFinite(session.moduleMm) || session.moduleMm <= 0) throw new Error('session.moduleMm must be positive');
  const plan = object(m.plan, 'plan');
  if (!Number.isSafeInteger(plan.trialsPerCondition) || (plan.trialsPerCondition as number) < 1) throw new Error('plan.trialsPerCondition must be a positive integer');
  if (!Array.isArray(plan.conditions) || plan.conditions.length === 0) throw new Error('plan.conditions must be nonempty');
  for (const condition of plan.conditions) nonempty(condition, 'condition');
  if (new Set(plan.conditions).size !== plan.conditions.length) throw new Error('plan.conditions must be unique');
  if (!Number.isSafeInteger((plan.trialsPerCondition as number) * plan.conditions.length)) throw new Error('Planned trial count exceeds safe integer range');
  if (!Array.isArray(m.trials)) throw new Error('trials must be an array');
  const ids = new Set<string>();
  for (const value of m.trials) {
    const trial = object(value, 'trial');
    nonempty(trial.id, 'trial.id');
    if (ids.has(trial.id)) throw new Error('trial IDs must be unique');
    ids.add(trial.id);
    localFile(trial.file);
    if (!plan.conditions.includes(trial.condition)) throw new Error('trial.condition must be declared in plan.conditions');
    if (!Array.isArray(trial.expectedCards) || ![0, 4].includes(trial.expectedCards.length)) throw new Error('expectedCards must be [] for negative/incomplete targets or four distinct standard cards');
    if (trial.expectedCards.length === 4) {
      if (new Set(trial.expectedCards).size !== 4 || trial.expectedCards.some(c => typeof c !== 'string')) throw new Error('expectedCards must contain four distinct standard card strings');
      referenceHiddenSum(trial.expectedCards as string[]);
    }
    const rect = object(trial.targetRegion, 'targetRegion');
    for (const key of ['xMin', 'yMin', 'xMax', 'yMax']) {
      if (typeof rect[key] !== 'number' || !Number.isFinite(rect[key]) || (rect[key] as number) < 0) throw new Error('targetRegion coordinates must be finite nonnegative numbers');
    }
    if ((rect.xMin as number) >= (rect.xMax as number) || (rect.yMin as number) >= (rect.yMax as number)) throw new Error('targetRegion must have positive area');
  }
  return m as unknown as PhotoManifest;
}

type RawSummary = { kind: GroupDecodeResult['kind']; cards: string[] | null; hiddenSum: number | null; vertex: { x: number; y: number } | null; reflection: string | null };
export interface PhotoTrialResult {
  id: string; file: string; condition: string;
  inputSHA256: string; width: number; height: number;
  expectedCards: string[]; expectedHiddenSum: number | null; targetRegion: TargetRegion;
  raw: RawSummary;
  rawOutcome: 'CORRECT' | 'REJECTED' | 'FALSE_ACCEPT';
  rawClassification: 'RAW_CORRECT' | 'RAW_REJECTED' | 'RAW_FALSE_ACCEPT';
  groundTruthMatch: boolean | null;
  referenceCheck: string;
  targetCheck: 'IN_TARGET' | 'OUTSIDE_TARGET' | 'NOT_LOCATED';
  postcheckOutcome: 'ACCEPTED' | 'REFERENCE_MISMATCH' | 'TARGET_MISMATCH' | 'NO_COMPLETE_GROUP_EXPECTED' | 'DECODER_REJECTED';
  desktopNodeDecodeMs: number;
}
function inside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(rel);
}
function imagePath(root: string, file: string): string {
  const candidate = resolve(root, ...file.split(/[\\/]/));
  if (!inside(root, candidate)) throw new Error(`Image path escapes manifest directory: ${file}`);
  const actual = realpathSync(candidate);
  if (!inside(realpathSync(root), actual)) throw new Error(`Image symlink escapes manifest directory: ${file}`);
  if (!statSync(actual).isFile()) throw new Error(`Image path must be a regular file: ${file}`);
  if (statSync(actual).size > MAX_PIXELS + MAX_HEADER_BYTES) throw new Error(`Image file exceeds PGM size limit: ${file}`);
  return actual;
}
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function evaluateTrial(trial: PhotoTrial, root: string): PhotoTrialResult {
  const bytes = readFileSync(imagePath(root, trial.file));
  const image = parsePgm(bytes);
  const r = trial.targetRegion;
  // Rectangle is half-open: xMin <= x < xMax and yMin <= y < yMax.
  if (r.xMax > image.width || r.yMax > image.height) throw new Error(`${trial.id}: targetRegion is outside image bounds`);
  const started = performance.now();
  const decoded = decodeGroup(image, { radius: 1 }); // Only pixels and fixed production radius; NEVER expected identities or target hints.
  const desktopNodeDecodeMs = performance.now() - started;
  // All ground truth access/scoring occurs AFTER the decoder returned.
  const positive = trial.expectedCards.length === 4;
  const located = 'vertex' in decoded ? decoded.vertex : null;
  const targetCheck = located ? (located.x >= r.xMin && located.x < r.xMax && located.y >= r.yMin && located.y < r.yMax ? 'IN_TARGET' : 'OUTSIDE_TARGET') : 'NOT_LOCATED';
  const comparison = positive ? compareWithReference(decoded, trial.expectedCards) : null;
  const identified = decoded.kind === 'IDENTIFIED';
  const groundTruthMatch = identified ? positive && comparison?.kind === 'IDENTIFIED' : null;
  const rawOutcome = !identified ? 'REJECTED' : groundTruthMatch && targetCheck === 'IN_TARGET' ? 'CORRECT' : 'FALSE_ACCEPT';
  const postcheckOutcome = !identified ? 'DECODER_REJECTED'
    : targetCheck !== 'IN_TARGET' ? 'TARGET_MISMATCH'
      : !positive ? 'NO_COMPLETE_GROUP_EXPECTED'
        : comparison?.kind !== 'IDENTIFIED' ? 'REFERENCE_MISMATCH' : 'ACCEPTED';
  return {
    id: trial.id, file: trial.file, condition: trial.condition, inputSHA256: sha256(bytes), width: image.width, height: image.height,
    expectedCards: [...trial.expectedCards], expectedHiddenSum: positive ? referenceHiddenSum(trial.expectedCards) : null, targetRegion: { ...r },
    raw: { kind: decoded.kind, cards: identified ? [...decoded.cards] : null, hiddenSum: identified ? decoded.hiddenSum : null, vertex: located ? { ...located } : null, reflection: identified ? decoded.reflection : null },
    rawOutcome, rawClassification: rawOutcome === 'FALSE_ACCEPT' ? 'RAW_FALSE_ACCEPT' : rawOutcome === 'CORRECT' ? 'RAW_CORRECT' : 'RAW_REJECTED',
    groundTruthMatch, referenceCheck: comparison?.kind ?? 'NOT_APPLICABLE_NEGATIVE_TARGET', targetCheck, postcheckOutcome, desktopNodeDecodeMs,
  };
}
function summarize(trials: PhotoTrialResult[], planned: number) {
  const completed = trials.length;
  const correct = trials.filter(t => t.rawOutcome === 'CORRECT').length;
  const rejected = trials.filter(t => t.rawOutcome === 'REJECTED').length;
  const falseAccepts = trials.filter(t => t.rawOutcome === 'FALSE_ACCEPT').length;
  const positiveTrials = trials.filter(t => t.expectedCards.length === 4).length;
  const negativeTrials = completed - positiveTrials;
  const correctRejections = trials.filter(t => t.expectedCards.length === 0 && t.rawOutcome === 'REJECTED').length;
  const positiveMisses = trials.filter(t => t.expectedCards.length === 4 && t.rawOutcome === 'REJECTED').length;
  return {
    planned, completed, remaining: Math.max(0, planned - completed), status: completed >= planned ? 'COMPLETE' as const : 'INCOMPLETE' as const,
    positiveTrials, negativeTrials, correct, rejected, falseAccepts, correctRejections, positiveMisses,
    rawCorrectRate: completed ? correct / completed : null,
    positiveCorrectRate: positiveTrials ? correct / positiveTrials : null,
    rawRejectionRate: completed ? rejected / completed : null,
    rawFalseAcceptRate: completed ? falseAccepts / completed : null,
    correctNegativeRejectionRate: negativeTrials ? correctRejections / negativeTrials : null,
    zeroFalseAcceptUpperBound95: completed > 0 && falseAccepts === 0 ? -Math.expm1(Math.log(0.05) / completed) : null,
  };
}
export function evaluateManifest(manifestPath: string) {
  const path = resolve(manifestPath), bytes = readFileSync(path);
  const manifest = validateManifest(JSON.parse(bytes.toString('utf8')) as unknown);
  const trials = manifest.trials.map(trial => evaluateTrial(trial, dirname(path)));
  const conditions = manifest.plan.conditions.map(condition => ({ condition, ...summarize(trials.filter(t => t.condition === condition), manifest.plan.trialsPerCondition) }));
  const status = conditions.every(c => c.status === 'COMPLETE') ? 'COMPLETE' as const : 'INCOMPLETE' as const;
  const totals = { ...summarize(trials, manifest.plan.trialsPerCondition * manifest.plan.conditions.length), status };
  return {
    schemaVersion: 1, evidence: manifest.evidence, evidenceVerification: 'USER-DECLARED; not independently verified',
    session: manifest.session, plan: manifest.plan, manifestSHA256: sha256(bytes),
    status,
    assessment: 'DESCRIPTIVE_ONLY',
    decoder: { function: 'decodeGroup', radius: 1, geometry: 'production defaults; no target crop or identity hint' },
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    notes: [
      'No phone-camera performance PASS is asserted. COMPLETE means declared sample counts reached only.',
      'Capture evidence and session metadata are USER-DECLARED; this tool does not verify a real camera, printer, paper or capture time.',
      'Raw outcomes score the unmodified decoder result against independent card/sum reference and the intended target region. Downstream guards never erase RAW_FALSE_ACCEPT.',
      'Target regions are half-open pixel rectangles; no target region or expected card enters decodeGroup.',
      'desktopNodeDecodeMs measures only synchronous desktop Node decoding; excludes camera capture, transfer, PGM parsing and reference/target scoring. Timing varies between runs.',
      'Zero-event one-sided exact 95% upper bound is 1 - 0.05^(1/n), only when n > 0 and raw false accepts = 0. It assumes independent trials; adjacent frames and repeated photos can be correlated.',
      'Rates use completed trials only. rawCorrectRate excludes correct negative rejections; positiveCorrectRate uses positive trials only. Negative trials include incomplete targets.',
      'Raw rejection is recorded unchanged, including expected negative rejections and positive misses separately.',
    ],
    uniqueInputHashes: new Set(trials.map(t => t.inputSHA256)).size,
    totals, conditions, trials,
  };
}
export type PhotoReport = ReturnType<typeof evaluateManifest>;
const cell = (value: unknown) => String(value ?? '—').replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ');
const percent = (value: number | null) => value === null ? '—' : `${(100 * value).toFixed(2)}%`;
export function renderMarkdown(report: PhotoReport): string {
  const lines = [
    '# Offline optical photo evaluation', '',
    `Evidence: **${report.evidence} — ${report.evidenceVerification}**`, '',
    `Session: ${cell(report.session.id)}; status: **${report.status}**; assessment: **DESCRIPTIVE_ONLY**.`, '',
    `Planned: ${report.totals.planned}; completed: ${report.totals.completed}; unique input hashes: ${report.uniqueInputHashes}.`, '',
    `Manifest SHA256: \`${report.manifestSHA256}\``, '',
    ...report.notes.map(note => `- ${note}`), '',
    '| Condition | Planned | Completed | Raw correct | Raw rejected | Raw false accepts | Correct negative rejections | Positive misses | Raw FA rate | Zero-FA 95% bound | Status |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...[...report.conditions, { condition: 'TOTAL', ...report.totals }].map(c => `| ${cell(c.condition)} | ${c.planned} | ${c.completed} | ${c.correct} | ${c.rejected} | ${c.falseAccepts} | ${c.correctRejections} | ${c.positiveMisses} | ${percent(c.rawFalseAcceptRate)} | ${percent(c.zeroFalseAcceptUpperBound95)} | ${c.status} |`), '',
    '| Trial | Condition | Dimensions | Raw kind | Raw cards | Raw sum | Vertex | Raw classification | Reference | Target | Postcheck | Desktop decode ms |',
    '| --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | ---: |',
    ...report.trials.map(t => `| ${cell(t.id)} | ${cell(t.condition)} | ${t.width}×${t.height} | ${t.raw.kind} | ${cell(t.raw.cards?.join(', '))} | ${cell(t.raw.hiddenSum)} | ${cell(t.raw.vertex ? `${t.raw.vertex.x}, ${t.raw.vertex.y}` : null)} | ${t.rawClassification} | ${t.referenceCheck} | ${t.targetCheck} | ${t.postcheckOutcome} | ${t.desktopNodeDecodeMs.toFixed(3)} |`), '',
    '## Input SHA256', '', ...report.trials.map(t => `- ${cell(t.id)} (${cell(t.file)}): \`${t.inputSHA256}\``), '',
    'Full expected card sets, sums, target rectangles, per-condition rates and declared session metadata are preserved in the JSON report.', '',
  ];
  return lines.join('\n');
}
export function writeReports(report: PhotoReport, outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'optical-photos.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(resolve(outDir, 'optical-photos.md'), renderMarkdown(report));
}
export function main(args = process.argv.slice(2)): void {
  if (args.includes('--help')) {
    console.log('Usage: tsx scripts/validate-optical-photos.ts --manifest FILE --out DIR');
    return;
  }
  if (args.length !== 4 || args.filter(a => a === '--manifest').length !== 1 || args.filter(a => a === '--out').length !== 1) throw new Error('Usage: --manifest FILE --out DIR');
  const manifestIndex = args.indexOf('--manifest'), outIndex = args.indexOf('--out');
  if (![0, 2].includes(manifestIndex) || ![0, 2].includes(outIndex) || !args[manifestIndex + 1] || !args[outIndex + 1]) throw new Error('Usage: --manifest FILE --out DIR');
  const report = evaluateManifest(args[manifestIndex + 1]!);
  writeReports(report, args[outIndex + 1]!);
  console.log(`${report.status}: ${report.totals.completed}/${report.totals.planned} declared trials; ${report.totals.falseAccepts} RAW_FALSE_ACCEPT. DESCRIPTIVE_ONLY, no camera performance PASS.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
