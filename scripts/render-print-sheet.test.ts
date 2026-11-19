import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ALL_CARDS, printedFragments, type Corner } from '../src/optical/fragments';
import { detectMarkers } from '../src/optical/detect';
import { decodeFragment } from '../src/optical/decode-fragment';
import { renderMarker, rotate180, type GrayImage } from '../src/optical/render';
import { flipCard, markerSlotsMm, observeFace, printLayers } from '../src/optical/testing/physical-card';
import { cropPrintCard, faceLocalPatterns, generatePrintSheets, parsePrintArgs, printSlots, readPrintPng, type PrintOptions } from './render-print-sheet';

const root = mkdtempSync(join(tmpdir(), 'qroker-print-test-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const codebookUrl = new URL('../src/optical/codebook.v1.json', import.meta.url);
const frozen = readFileSync(codebookUrl);
const beforeFragments = ALL_CARDS.map(card => printedFragments(card));
const fixtures = new Map<number, ReturnType<typeof generatePrintSheets>>();
function fixture(moduleMm: number) {
  let manifest = fixtures.get(moduleMm);
  if (!manifest) {
    manifest = generatePrintSheets(join(root, `size-${moduleMm}`), { moduleMm, dpi: 100 });
    fixtures.set(moduleMm, manifest);
  }
  return manifest;
}

function decoded(image: GrayImage) {
  const detection = detectMarkers(image);
  if (detection.kind !== 'DETECTED') throw new Error(`not detected: ${detection.kind}`);
  return detection.markers.map(marker => ({ marker, outcome: decodeFragment(marker) }));
}

function horizontalMirror(image: GrayImage): GrayImage {
  const data = new Uint8Array(image.data.length);
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) data[y * image.width + x] = image.data[y * image.width + image.width - x - 1]!;
  return { width: image.width, height: image.height, data };
}

function observedPatterns(image: GrayImage): Partial<Record<Corner, number>> {
  const patterns: Partial<Record<Corner, number>> = {};
  for (const { marker } of decoded(image)) {
    const corner: Corner = marker.center.y < image.height / 2
      ? (marker.center.x < image.width / 2 ? 'TL' : 'TR')
      : (marker.center.x < image.width / 2 ? 'BL' : 'BR');
    expect(patterns[corner]).toBeUndefined();
    patterns[corner] = marker.bits;
  }
  return patterns;
}

describe('physical-test print files (synthetic preparation only)', () => {
  it.each([1.5, 1.5875, 2])('emits all 52 frozen cards once per face at %s mm and decodes the actual annotated PNGs', moduleMm => {
    const dir = join(root, `size-${moduleMm}`);
    const manifest = fixture(moduleMm);
    expect(manifest.sheets).toHaveLength(12);
    expect(manifest.card).toEqual({ widthMm: 63.5, heightMm: 88.9 });
    expect(manifest.cornerRadiusMm).toBe(3.175);
    expect(manifest.insetModules).toBe(1);
    expect(manifest.quietMarginModules).toBe(1);
    expect(manifest.containment.valid).toBe(true);
    for (const face of ['FRONT', 'BACK'] as const) {
      expect(manifest.sheets.filter(s => s.face === face).flatMap(s => s.slots.map(slot => slot.card))).toEqual([...ALL_CARDS]);
    }
    let readMarkers = 0;
    for (const sheet of manifest.sheets) {
      const pngFile = sheet.files.find(file => file.file.endsWith('.png'))!;
      const png = readFileSync(join(dir, pngFile.file));
      expect(createHash('sha256').update(png).digest('hex')).toBe(pngFile.sha256);
      const image = readPrintPng(png);
      expect([image.width, image.height]).toEqual([Math.round(210 * 100 / 25.4), Math.round(297 * 100 / 25.4)]);
      // Whole-sheet detection includes registration crosses, scale bar and every cut outline.
      const readings = decoded(image);
      expect(readings).toHaveLength(sheet.slots.length * 2);
      expect(readings.map(r => r.outcome.status === 'IDENTIFIED' ? r.outcome.card : r.outcome.status).sort()).toEqual(sheet.slots.flatMap(slot => [slot.card, slot.card]).sort());
      for (const { outcome } of readings) { expect(outcome.status).toBe('IDENTIFIED'); if (outcome.status === 'IDENTIFIED') expect(outcome.distance).toBe(0); }
      readMarkers += readings.length;
      // Inspect every pixel-cell centre of all four corner footprints, including blank corners.
      // This also verifies annotations have not entered marker quiet margins.
      const slots = markerSlotsMm({ moduleMm });
      for (const slot of sheet.slots) {
        const patterns = printedFragments(slot.card);
        for (const c of ['TL', 'TR', 'BL', 'BR'] as Corner[]) {
          const marker = patterns[c] === undefined ? undefined : renderMarker(patterns[c], 1);
          for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
            const px = Math.floor((slot.xMm + slots[c].footprint.x0 + (x + 0.5) * moduleMm) * 100 / 25.4);
            const py = Math.floor((slot.yMm + slots[c].footprint.y0 + (y + 0.5) * moduleMm) * 100 / 25.4);
            expect(image.data[py * image.width + px]).toBe(marker?.data[y * 9 + x] ?? 255);
          }
        }
      }
      const svgFile = sheet.files.find(file => file.file.endsWith('.svg'))!;
      const svg = readFileSync(join(dir, svgFile.file), 'utf8');
      expect(svg).toContain('width="210mm" height="297mm" viewBox="0 0 210 297"');
      expect(svg).toContain('x1="80" y1="291" x2="130" y2="291"');
      const cutSegments = [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)" stroke="rgb\(160,160,160\)"/g)];
      expect(cutSegments).toHaveLength(sheet.slots.length * 68);
      for (let i = 0; i < sheet.slots.length; i++) {
        const segments = cutSegments.slice(i * 68, (i + 1) * 68);
        const xs = segments.flatMap(s => [Number(s[1]), Number(s[3])]);
        const ys = segments.flatMap(s => [Number(s[2]), Number(s[4])]);
        expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(63.5, 6);
        expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(88.9, 6);
      }
      // Density is carried by the actual PNG, not only its manifest.
      expect(png.toString('ascii', 37, 41)).toBe('pHYs');
      expect(png.readUInt32BE(41)).toBe(Math.round(100 / 0.0254));
      expect(png.readUInt32BE(45)).toBe(Math.round(100 / 0.0254));
      expect(png[49]).toBe(1);
      expect(Math.abs(image.width * 25.4 / 100 - 210)).toBeLessThanOrEqual(25.4 / 200);
      expect(Math.abs(image.height * 25.4 / 100 - 297)).toBeLessThanOrEqual(25.4 / 200);
    }
    expect(readMarkers).toBe(208);
    expect(readFileSync(codebookUrl)).toEqual(frozen);
    expect(ALL_CARDS.map(card => printedFragments(card))).toEqual(beforeFragments);
    expect(manifest.frozenCodebookSha256).toBe(createHash('sha256').update(frozen).digest('hex'));
  }, 120_000);

  it('is byte deterministic across directories, with the same annotations in SVG and PNG', () => {
    const options = { moduleMm: 1.5, dpi: 72, cutOutlines: false, cornerRadiusMm: 3.175 };
    const a = join(root, 'deterministic-a'), b = join(root, 'deterministic-b');
    generatePrintSheets(a, options); generatePrintSheets(b, options);
    expect(readdirSync(a).sort()).toEqual(readdirSync(b).sort());
    for (const name of readdirSync(a)) expect(readFileSync(join(a, name))).toEqual(readFileSync(join(b, name)));
    const instructions = readFileSync(join(a, 'PRINT-INSTRUCTIONS.md'), 'utf8');
    expect(instructions).toContain('long-edge');
    expect(instructions).toContain('No real print');
    const svg = readFileSync(join(a, 'sheet-1-front.svg'), 'utf8');
    expect(svg).not.toContain('rgb(160,160,160)');
    const png = readPrintPng(readFileSync(join(a, 'sheet-1-front.png')));
    expect([...png.data].some(gray => gray === 160)).toBe(false);
    // Both output forms retain the scale bar when outlines are disabled.
    expect(svg).toContain('x1="80" y1="291" x2="130" y2="291"');
    expect(png.data[Math.floor(291 * 72 / 25.4) * png.width + Math.floor(105 * 72 / 25.4)]).toBe(0);
  }, 120_000);

  it('independently checks long-edge page imposition and both card flip axes against the approved physical model', () => {
    fixture(1.5875);
    const dir = join(root, 'size-1.5875');
    for (let page = 0; page < 6; page++) {
      const front = readPrintPng(readFileSync(join(dir, `sheet-${page + 1}-front.png`)));
      const back = readPrintPng(readFileSync(join(dir, `sheet-${page + 1}-back.png`)));
      const frontSlots = printSlots(page, 'FRONT'), backSlots = printSlots(page, 'BACK');
      for (let i = 0; i < frontSlots.length; i++) {
        const f = frontSlots[i]!, b = backSlots[i]!;
        expect(b.card).toBe(f.card);
        expect(b.row).toBe(f.row);
        expect(b.column).toBe(2 - f.column);
        expect(f.xMm + b.xMm + 63.5).toBeCloseTo(210, 10);
        expect(b.yMm).toBe(f.yMm);
        const fImage = cropPrintCard(front, f, 100), bImage = cropPrintCard(back, b, 100);
        expect(observedPatterns(bImage)).toEqual(observedPatterns(fImage));
        // Viewed through the front, the back print is mirrored, including fragment bits.
        expect(observedPatterns(horizontalMirror(bImage))).toEqual(printLayers(f.card).back.patterns);
        for (const axis of ['VERTICAL', 'HORIZONTAL'] as const) {
          const observed = observeFace(f.card, 'BACK', 0, flipCard(axis));
          expect(observedPatterns(axis === 'VERTICAL' ? bImage : rotate180(bImage))).toEqual(observed.patterns);
        }
        expect(faceLocalPatterns(f.card, 'BACK')).toEqual(printedFragments(f.card));
      }
    }
    // This asymmetric suit exposes the wrong implementation (whole-back image mirrored twice).
    expect(printLayers('C-A').back.patterns).not.toEqual(printedFragments('C-A'));
  }, 120_000);

  it.each([
    { moduleMm: 0 }, { moduleMm: -1 }, { moduleMm: Number.NaN }, { moduleMm: Number.POSITIVE_INFINITY },
    { moduleMm: 4 }, { moduleMm: 0.2 }, { dpi: 0 }, { dpi: 71 }, { dpi: 601 }, { dpi: Number.NaN },
    { cornerRadiusMm: -1 }, { cornerRadiusMm: 6 }, { cornerRadiusMm: 100 },
    { cutOutlines: 'yes' } as unknown as PrintOptions,
  ])('rejects invalid geometry or raster options %j before writing output', options => {
    expect(() => generatePrintSheets(join(root, 'invalid'), options)).toThrow();
    expect(existsSync(join(root, 'invalid'))).toBe(false);
  });

  it('parses an explicit output directory and rejects malformed CLI input', () => {
    expect(parsePrintArgs(['--out-dir', 'out', '--module-mm', '2', '--dpi', '300', '--corner-radius-mm', '3.175', '--no-cut-outlines'])).toEqual({ outDir: 'out', options: { moduleMm: 2, dpi: 300, cornerRadiusMm: 3.175, cutOutlines: false } });
    for (const args of [[], ['--out-dir'], ['--unknown'], ['--out-dir', '--dpi', '300']]) expect(() => parsePrintArgs(args)).toThrow();
    expect(() => printSlots(-1, 'FRONT')).toThrow();
    expect(() => printSlots(6, 'FRONT')).toThrow();
  });
});
