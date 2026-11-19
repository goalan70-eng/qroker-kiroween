import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { ALL_CARDS, type Corner } from '../src/optical/fragments';
import { detectMarkers } from '../src/optical/detect';
import { decodeFragment } from '../src/optical/decode-fragment';
import { renderMarker, type GrayImage } from '../src/optical/render';
import { applyTransform } from '../src/optical/transforms';
import { markerContainment, markerSlotsMm, physicalGeometry, printLayers, MIRROR_LEFT_RIGHT, type CardFace } from '../src/optical/testing/physical-card';
import { crc32, encodePng } from './png';

export interface PrintOptions {
  moduleMm?: number;
  dpi?: number;
  cutOutlines?: boolean;
  cornerRadiusMm?: number;
}

const PAPER = { widthMm: 210, heightMm: 297 } as const;
const CARD = { widthMm: 63.5, heightMm: 88.9 } as const;
const GRID = { rows: 3, columns: 3, xMm: 9.75, yMm: 15.15 } as const;
const CODEBOOK = new URL('../src/optical/codebook.v1.json', import.meta.url);
const CORNERS: Corner[] = ['TL', 'TR', 'BL', 'BR'];
type Rect = { kind: 'rect'; x: number; y: number; w: number; h: number; gray: number };
type Line = { kind: 'line'; x: number; y: number; x2: number; y2: number; width: number; gray: number };
type Shape = Rect | Line;
export interface PrintSlot { card: string; row: number; column: number; xMm: number; yMm: number }

function settings(options: PrintOptions) {
  const moduleMm = options.moduleMm ?? 1.5875;
  const dpi = options.dpi ?? 300;
  const cornerRadiusMm = options.cornerRadiusMm ?? 3.175;
  if (!Number.isFinite(dpi) || dpi < 72 || dpi > 600) throw new RangeError('dpi must be between 72 and 600');
  if (options.cutOutlines !== undefined && typeof options.cutOutlines !== 'boolean') throw new RangeError('cutOutlines must be boolean');
  const geometry = physicalGeometry({ moduleMm, cornerRadiusMm });
  const containment = markerContainment(geometry);
  if (!containment.valid) throw new RangeError(containment.reason);
  if (moduleMm * dpi / 25.4 < 3) throw new RangeError('module must span at least 3 raster pixels');
  return { moduleMm, dpi, cornerRadiusMm, cutOutlines: options.cutOutlines ?? true, geometry, containment };
}

/** Portrait A4, long-edge duplex: reverse page columns, never mirror individual face-local cards. */
export function printSlots(page: number, face: CardFace): PrintSlot[] {
  if (!Number.isInteger(page) || page < 0 || page >= 6) throw new RangeError('page must be 0..5');
  if (face !== 'FRONT' && face !== 'BACK') throw new RangeError('face must be FRONT or BACK');
  return ALL_CARDS.slice(page * 9, (page + 1) * 9).map((card, i) => {
    const row = Math.floor(i / 3);
    const column = face === 'FRONT' ? i % 3 : 2 - (i % 3);
    return { card, row, column, xMm: GRID.xMm + column * CARD.widthMm, yMm: GRID.yMm + row * CARD.heightMm };
  });
}

/** Back Body_Frame -> back Face_Local_Frame. Two mirrors cancel: B(W-u,y) = F(u,y). */
export function faceLocalPatterns(card: string, face: CardFace): Partial<Record<Corner, number>> {
  const layers = printLayers(card);
  if (face === 'FRONT') return { ...layers.front.patterns };
  if (face !== 'BACK') throw new RangeError('face must be FRONT or BACK');
  const local: Partial<Record<Corner, number>> = {};
  for (const c of CORNERS) {
    const bits = layers.back.patterns[c];
    if (bits !== undefined) local[MIRROR_LEFT_RIGHT[c]] = applyTransform('Fv', bits);
  }
  return local;
}

function scene(page: number, face: CardFace, cfg: ReturnType<typeof settings>): Shape[] {
  const shapes: Shape[] = [];
  // Keep thin annotations visible even at the lowest supported DPI. SVG receives the same width.
  const line = (x: number, y: number, x2: number, y2: number, gray = 0, width = 0.2) => shapes.push({ kind: 'line', x, y, x2, y2, width: Math.max(width, 25.4 / cfg.dpi), gray });
  // All page annotations stay outside the 190.5 x 266.7 mm card block.
  for (const x of [5, 205]) for (const y of [8, 289]) {
    line(x - 2, y, x + 2, y); line(x, y - 2, x, y + 2);
  }
  // Asymmetric page-top arrow (same face-local orientation on each side).
  line(105, 12, 105, 5); line(105, 5, 103, 7); line(105, 5, 107, 7);
  // Exactly 50 mm between the centres of the two end ticks.
  line(80, 291, 130, 291); line(80, 289, 80, 293); line(130, 289, 130, 293);
  const slots = markerSlotsMm(cfg.geometry);
  for (const slot of printSlots(page, face)) {
    if (cfg.cutOutlines) {
      // Rounded cut overlay, also showing the central void between four zero-gap cards.
      const r = cfg.cornerRadiusMm;
      const points: Array<[number, number]> = [];
      for (const [cx, cy, start] of [[CARD.widthMm - r, r, -90], [CARD.widthMm - r, CARD.heightMm - r, 0], [r, CARD.heightMm - r, 90], [r, r, 180]]) {
        for (let i = 0; i <= 16; i++) {
          const a = ((start! + i * 90 / 16) * Math.PI) / 180;
          points.push([slot.xMm + cx! + r * Math.cos(a), slot.yMm + cy! + r * Math.sin(a)]);
        }
      }
      points.forEach(([x, y], i) => { const next = points[(i + 1) % points.length]!; line(x, y, next[0], next[1], 160, 0.12); });
    }
    const patterns = faceLocalPatterns(slot.card, face);
    for (const c of CORNERS) {
      const bits = patterns[c];
      if (bits === undefined) continue;
      const origin = slots[c].footprint;
      const marker = renderMarker(bits, 1);
      for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
        if (marker.data[y * 9 + x] === 0) shapes.push({ kind: 'rect', x: slot.xMm + origin.x0 + x * cfg.moduleMm, y: slot.yMm + origin.y0 + y * cfg.moduleMm, w: cfg.moduleMm, h: cfg.moduleMm, gray: 0 });
      }
    }
  }
  return shapes;
}

function raster(shapes: Shape[], dpi: number): GrayImage {
  const scale = dpi / 25.4;
  const width = Math.round(PAPER.widthMm * scale), height = Math.round(PAPER.heightMm * scale);
  const data = new Uint8Array(width * height).fill(255);
  for (const s of shapes) {
    const pad = s.kind === 'line' ? s.width / 2 : 0;
    const x1 = s.kind === 'rect' ? s.x + s.w : s.x2, y1 = s.kind === 'rect' ? s.y + s.h : s.y2;
    const minX = Math.max(0, Math.ceil((Math.min(s.x, x1) - pad) * scale - 0.5));
    const maxX = Math.min(width - 1, Math.floor((Math.max(s.x, x1) + pad) * scale - 0.5));
    const minY = Math.max(0, Math.ceil((Math.min(s.y, y1) - pad) * scale - 0.5));
    const maxY = Math.min(height - 1, Math.floor((Math.max(s.y, y1) + pad) * scale - 0.5));
    for (let py = minY; py <= maxY; py++) {
      if (s.kind === 'rect') { data.fill(s.gray, py * width + minX, py * width + maxX + 1); continue; }
      for (let px = minX; px <= maxX; px++) {
        const x = (px + 0.5) / scale, y = (py + 0.5) / scale;
        const dx = x1 - s.x, dy = y1 - s.y;
        const t = dx * dx + dy * dy === 0 ? 0 : Math.max(0, Math.min(1, ((x - s.x) * dx + (y - s.y) * dy) / (dx * dx + dy * dy)));
        if (Math.hypot(x - s.x - t * dx, y - s.y - t * dy) <= pad) data[py * width + px] = s.gray;
      }
    }
  }
  return { width, height, data };
}

function svg(shapes: Shape[], page: number, face: CardFace): string {
  const n = (v: number) => Number(v.toFixed(6));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297">\n<title>QRoker page ${page + 1} ${face} - face-local, long-edge duplex</title>\n<rect width="210" height="297" fill="white"/>\n` + shapes.map(s => s.kind === 'rect'
    ? `<rect x="${n(s.x)}" y="${n(s.y)}" width="${n(s.w)}" height="${n(s.h)}" fill="rgb(${s.gray},${s.gray},${s.gray})"/>`
    : `<line x1="${n(s.x)}" y1="${n(s.y)}" x2="${n(s.x2)}" y2="${n(s.y2)}" stroke="rgb(${s.gray},${s.gray},${s.gray})" stroke-width="${s.width}" stroke-linecap="round"/>`).join('\n') + '\n</svg>\n';
}

function pngWithDpi(image: GrayImage, dpi: number): Buffer {
  const png = encodePng(image.width, image.height, image.data);
  const chunk = Buffer.alloc(21);
  chunk.writeUInt32BE(9, 0); chunk.write('pHYs', 4);
  chunk.writeUInt32BE(Math.round(dpi / 0.0254), 8); chunk.writeUInt32BE(Math.round(dpi / 0.0254), 12); chunk[16] = 1;
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 17)), 17);
  return Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]);
}

/** Reads our filter-0 grayscale print PNG, so verification uses the exact emitted print-file pixels. */
export function readPrintPng(png: Uint8Array): GrayImage {
  const b = Buffer.from(png);
  const width = b.readUInt32BE(16), height = b.readUInt32BE(20);
  const parts: Buffer[] = [];
  for (let i = 8; i < b.length;) {
    const len = b.readUInt32BE(i), type = b.toString('ascii', i + 4, i + 8);
    if (type === 'IDAT') parts.push(b.subarray(i + 8, i + 8 + len));
    i += len + 12;
  }
  const raw = inflateSync(Buffer.concat(parts));
  if (raw.length !== (width + 1) * height || b[24] !== 8 || b[25] !== 0) throw new Error('unsupported print PNG');
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    if (raw[y * (width + 1)] !== 0) throw new Error('unsupported PNG filter');
    data.set(raw.subarray(y * (width + 1) + 1, (y + 1) * (width + 1)), y * width);
  }
  return { width, height, data };
}

/** Cropping only limits detector memory; no card identity, expected bits or marker positions enter detection. */
export function cropPrintCard(image: GrayImage, slot: PrintSlot, dpi: number): GrayImage {
  const scale = dpi / 25.4;
  const x = Math.round(slot.xMm * scale), y = Math.round(slot.yMm * scale);
  const width = Math.round((slot.xMm + CARD.widthMm) * scale) - x;
  const height = Math.round((slot.yMm + CARD.heightMm) * scale) - y;
  const data = new Uint8Array(width * height);
  for (let row = 0; row < height; row++) data.set(image.data.subarray((y + row) * image.width + x, (y + row) * image.width + x + width), row * width);
  return { width, height, data };
}

function verify(image: GrayImage, slots: PrintSlot[], face: CardFace, dpi: number): number {
  let count = 0;
  for (const slot of slots) {
    const detection = detectMarkers(cropPrintCard(image, slot, dpi));
    if (detection.kind !== 'DETECTED' || detection.markers.length !== 2) throw new Error(`print raster detection failed: ${face} ${slot.card}`);
    const expected = Object.values(faceLocalPatterns(slot.card, face)).sort((a, b) => a - b);
    const actual = detection.markers.map(marker => {
      const decoded = decodeFragment(marker);
      if (decoded.status !== 'IDENTIFIED' || decoded.card !== slot.card || decoded.distance !== 0) throw new Error(`print raster decode failed: ${face} ${slot.card}`);
      return marker.bits;
    }).sort((a, b) => a - b);
    if (actual.some((bits, i) => bits !== expected[i])) throw new Error(`print raster bits changed: ${face} ${slot.card}`);
    count += actual.length;
  }
  return count;
}

export function generatePrintSheets(outDir: string, options: PrintOptions = {}) {
  const cfg = settings(options);
  if (typeof outDir !== 'string' || !outDir.trim()) throw new RangeError('output directory is required');
  const frozenHash = createHash('sha256').update(readFileSync(CODEBOOK)).digest('hex');
  mkdirSync(outDir, { recursive: true });
  const sheets = [];
  for (let page = 0; page < 6; page++) for (const face of ['FRONT', 'BACK'] as const) {
    const shapes = scene(page, face, cfg), image = raster(shapes, cfg.dpi);
    const base = `sheet-${page + 1}-${face.toLowerCase()}`;
    const files = [{ file: `${base}.svg`, data: Buffer.from(svg(shapes, page, face)) }, { file: `${base}.png`, data: pngWithDpi(image, cfg.dpi) }];
    const slots = printSlots(page, face);
    const verifiedMarkers = verify(readPrintPng(files[1]!.data), slots, face, cfg.dpi);
    for (const file of files) writeFileSync(join(outDir, file.file), file.data);
    sheets.push({ page: page + 1, face, slots, raster: { width: image.width, height: image.height }, verifiedMarkers, files: files.map(f => ({ file: f.file, sha256: createHash('sha256').update(f.data).digest('hex') })) });
  }
  const manifest = {
    format: 'qroker-print-sheet-v1', validation: 'SYNTHETIC_PRINT_FILE_ONLY; real print/camera/duplex/show-through unverified',
    paper: PAPER, card: CARD, grid: { ...GRID, intendedGapMm: 0 },
    moduleMm: cfg.moduleMm, dpi: cfg.dpi, pngPixelsPerMetre: Math.round(cfg.dpi / 0.0254),
    cutOutlines: cfg.cutOutlines, cornerRadiusMm: cfg.cornerRadiusMm,
    insetModules: cfg.geometry.insetModules, quietMarginModules: cfg.geometry.quietMarginModules,
    containment: cfg.containment, frozenCodebookSha256: frozenHash,
    duplex: { mode: 'portrait-long-edge', backPageMapping: '(row,col) -> (row,2-col)', cardFaceLocalMapping: 'identity: back viewed directly equals front; Body_Frame back is left-right mirror', printerMirroring: 'none requested; verify real printer/vendor using physical flip test' },
    annotations: { scaleBar: { x0Mm: 80, x1Mm: 130, yMm: 291, lengthMm: 50 }, registrationCentersMm: [[5, 8], [205, 8], [5, 289], [205, 289]], outsideCardBlock: true },
    sheets,
  };
  if (createHash('sha256').update(readFileSync(CODEBOOK)).digest('hex') !== frozenHash) throw new Error('frozen codebook changed during generation');
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(join(outDir, 'PRINT-INSTRUCTIONS.md'), `# QRoker physical-test print files\n\nThese deterministic files prepare physical testing. No real print, camera, duplex registration, cutting accuracy or paper show-through has been validated.\n\n- A4 portrait, actual size / 100%, no fit-to-page, no borderless expansion. Fixed cards: 63.5 x 88.9 mm; module: ${cfg.moduleMm} mm; raster: ${cfg.dpi} DPI with PNG pHYs density. Prefer SVG for exact physical units; check the printed 50 mm bar (bottom ticks x=80 and x=130 mm) and card width/height with a ruler.\n- Pair sheet-N-front with sheet-N-back. Print portrait long-edge duplex, with page-top arrows upright when each face is viewed directly. Disable extra page/image mirroring. The BACK page reverses COLUMNS only: front (row,col) is paired with back (row,2-col). Individual card marker rasters are identical in their own face-local views. Do not mirror the whole back image again. This implements the approved mirrored BACK layer in Body_Frame; it does not put identical rasters in Body_Frame.\n- First print one pair, hold the registration crosses to light, and measure front/back and cut offsets. Cut a card, turn it left-right around its vertical axis, and verify marker positions and bits match its front; a top-bottom flip must equal the front rotated 180 degrees. Printer/vendor behavior remains unverified until this physical test is recorded. Do not assume short-edge duplex is equivalent.\n- The 3 x 3 card block has zero intended gap. Gray rounded cut outlines ${cfg.cutOutlines ? 'are included' : 'are omitted'}; configured radius ${cfg.cornerRadiusMm} mm is an overlay, not a recommendation to change the approved 3.175 mm baseline. Rounded seams expose the central void after cutting; the uncut white sheet cannot simulate the table visible there. Preserve all one-module quiet margins.\n- SVG and PNG contain the same annotation scene: cut outlines, page-top arrow, registration crosses and 50 mm bar. Generated PNGs (including annotations) are decoded through detectMarkers and decodeFragment using pixels only, with card-region crops for memory. Expected identities are compared after decoding. Exact bits and zero-distance identities are checked for all 208 fragments across both faces.\n- Both faces reveal card identity. Check opacity/show-through on intended stock, lighting, registration, cutting and real-device performance using docs/optical/physical-test-protocol.md before claiming physical validation.\n- manifest.json records positions in each face-local print frame, physical geometry, PNG dimensions, hashes, and the frozen codebook hash. No timestamps or randomness are used.\n`);
  return manifest;
}

export function parsePrintArgs(args: string[]): { outDir: string; options: PrintOptions } {
  const options: PrintOptions = {};
  let outDir = '';
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--no-cut-outlines') { options.cutOutlines = false; continue; }
    if (!['--out-dir', '--module-mm', '--dpi', '--corner-radius-mm'].includes(key!)) throw new Error(`unknown argument: ${key}`);
    const value = args[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`missing value for ${key}`);
    if (key === '--out-dir') outDir = value;
    else if (key === '--module-mm') options.moduleMm = Number(value);
    else if (key === '--dpi') options.dpi = Number(value);
    else options.cornerRadiusMm = Number(value);
  }
  if (!outDir.trim()) throw new Error('usage: tsx scripts/render-print-sheet.ts --out-dir DIR [--module-mm 1.5875] [--dpi 300] [--corner-radius-mm 3.175] [--no-cut-outlines]');
  return { outDir, options };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { outDir, options } = parsePrintArgs(process.argv.slice(2));
  const manifest = generatePrintSheets(outDir, options);
  console.log(`Wrote ${manifest.sheets.length} paired-face A4 SVG/PNG sheets to ${resolve(outDir)}; synthetic print-file checks only.`);
}
