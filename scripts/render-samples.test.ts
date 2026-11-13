import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../src/optical/fragments';
import { CARD_H_MOD, CARD_W_MOD, FOOTPRINT_MOD, renderCardLayer } from '../src/optical/render';
import { crc32, encodePng } from './png';

// NOTE: scripts/render-samples.ts writes into docs/optical/samples on import and has no output-dir
// argument, so it is never imported here. Expectations are recomputed with the exported encoder.
const SAMPLES = fileURLToPath(new URL('../docs/optical/samples/', import.meta.url));
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

interface Entry {
  file: string;
  width: number;
  height: number;
  card: string | null;
  orientation: number | null;
  modulePx: number;
  sha256: string;
}
const manifest = JSON.parse(readFileSync(SAMPLES + 'manifest.json', 'utf8')) as { files: Entry[] };

describe('PNG encoder', () => {
  const w = 7;
  const h = 5;
  const data = Uint8Array.from({ length: w * h }, (_, i) => (i * 37) % 256);
  const png = encodePng(w, h, data);

  it('has signature and IHDR matching the input', () => {
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(w);
    expect(png.readUInt32BE(20)).toBe(h);
    expect(png[24]).toBe(8);
    expect(png[25]).toBe(0);
  });

  it('CRC32 of "123456789" is 0xCBF43926', () => {
    expect(crc32(Buffer.from('123456789', 'ascii'))).toBe(0xcbf43926);
  });

  it('IDAT inflates to filter-0 rows reproducing the raster; encoding is deterministic', () => {
    // locate IDAT: signature(8) + IHDR chunk(4+4+13+4=25) => first chunk after at offset 33
    const len = png.readUInt32BE(33);
    expect(png.subarray(37, 41).toString('ascii')).toBe('IDAT');
    const raw = inflateSync(png.subarray(41, 41 + len));
    expect(raw.length).toBe((w + 1) * h);
    for (let y = 0; y < h; y++) {
      expect(raw[y * (w + 1)]).toBe(0);
      expect([...raw.subarray(y * (w + 1) + 1, (y + 1) * (w + 1))]).toEqual([...data.subarray(y * w, (y + 1) * w)]);
    }
    expect(encodePng(w, h, data).equals(png)).toBe(true);
  });
});

describe('committed samples manifest', () => {
  it('lists the 8 samples plus contact sheet, no timestamps, files exist', () => {
    const names = manifest.files.map((f) => f.file).sort();
    const expected = [
      ...['H-A', 'D-K', 'C-7', 'S-Q'].flatMap((c) => [`${c}-0.png`, `${c}-180.png`]),
      'contact-sheet-0deg.png',
    ].sort();
    expect(names).toEqual(expected);
    expect(readFileSync(SAMPLES + 'manifest.json', 'utf8')).not.toMatch(/time|date|\d{4}-\d{2}-\d{2}T/i);
    for (const f of manifest.files) expect(existsSync(SAMPLES + f.file), f.file).toBe(true);
  });

  it('disk bytes, manifest hash and freshly encoded bytes agree for the card samples', () => {
    for (const f of manifest.files.filter((e) => e.card !== null)) {
      const img = renderCardLayer(f.card as string, f.orientation as 0 | 180, { modulePx: f.modulePx });
      expect(img.width).toBe(f.width);
      expect(img.height).toBe(f.height);
      const fresh = encodePng(img.width, img.height, img.data);
      const disk = readFileSync(SAMPLES + f.file);
      expect(sha(disk), f.file).toBe(f.sha256);
      expect(sha(fresh), f.file).toBe(f.sha256);
    }
  });

  // Contact sheet recomputed using the layout documented in the README (13x4, modulePx 2, 4px gaps, bg 200).
  const PX = 2;
  const GAP = 4;
  const cw = CARD_W_MOD * PX;
  const ch = CARD_H_MOD * PX;
  const W = GAP + 13 * (cw + GAP);
  const H = GAP + 4 * (ch + GAP);
  const sheet = new Uint8Array(W * H).fill(200);
  ALL_CARDS.forEach((card, i) => {
    const img = renderCardLayer(card, 0, { modulePx: PX });
    const x0 = GAP + (i % 13) * (cw + GAP);
    const y0 = GAP + Math.floor(i / 13) * (ch + GAP);
    for (let y = 0; y < ch; y++) sheet.set(img.data.subarray(y * cw, (y + 1) * cw), (y0 + y) * W + x0);
  });

  it('contact sheet: hash matches manifest and disk', () => {
    const e = manifest.files.find((f) => f.file === 'contact-sheet-0deg.png') as Entry;
    expect(e.width).toBe(W);
    expect(e.height).toBe(H);
    const fresh = encodePng(W, H, sheet);
    expect(sha(fresh)).toBe(e.sha256);
    expect(sha(readFileSync(SAMPLES + e.file))).toBe(e.sha256);
  });

  it('contact sheet: each of the 52 cells has exactly two non-white marker footprints', () => {
    const fp = FOOTPRINT_MOD * PX;
    for (let i = 0; i < 52; i++) {
      const x0 = GAP + (i % 13) * (cw + GAP);
      const y0 = GAP + Math.floor(i / 13) * (ch + GAP);
      let footprints = 0;
      let outside = 0;
      const corners = [
        [1, 1],
        [30, 1],
        [1, 46],
        [30, 46],
      ];
      const inside = new Set<number>();
      for (const [xm, ym] of corners as [number, number][]) {
        let dark = 0;
        for (let j = 0; j < fp; j++)
          for (let k = 0; k < fp; k++) {
            const x = x0 + xm * PX + k;
            const y = y0 + ym * PX + j;
            inside.add(y * W + x);
            if (sheet[y * W + x] !== 255) dark++;
          }
        if (dark > 0) footprints++;
      }
      for (let y = 0; y < ch; y++)
        for (let x = 0; x < cw; x++) {
          const idx = (y0 + y) * W + x0 + x;
          if (!inside.has(idx) && sheet[idx] !== 255) outside++;
        }
      expect(footprints, `cell ${i}`).toBe(2);
      expect(outside, `cell ${i}`).toBe(0);
    }
  });
});
