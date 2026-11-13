import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_CARDS, type Orientation } from '../src/optical/fragments';
import { renderCardLayer } from '../src/optical/render';
import { encodePng } from './png';

const outDir = fileURLToPath(new URL('../docs/optical/samples/', import.meta.url));
mkdirSync(outDir, { recursive: true });

interface Entry {
  file: string;
  width: number;
  height: number;
  card: string | null;
  orientation: Orientation | null;
  modulePx: number;
  sha256: string;
}
const entries: Entry[] = [];

function emit(file: string, w: number, h: number, data: Uint8Array, card: string | null, o: Orientation | null, modulePx: number): void {
  const png = encodePng(w, h, data);
  writeFileSync(join(outDir, file), png);
  entries.push({ file, width: w, height: h, card, orientation: o, modulePx, sha256: createHash('sha256').update(png).digest('hex') });
}

for (const card of ['H-A', 'D-K', 'C-7', 'S-Q']) {
  for (const o of [0, 180] as const) {
    const img = renderCardLayer(card, o, { modulePx: 8 });
    emit(`${card}-${o}.png`, img.width, img.height, img.data, card, o, 8);
  }
}

// Contact sheet: 13 columns x 4 rows, codebook order, modulePx 2, 4px gaps.
const PX = 2;
const GAP = 4;
const first = renderCardLayer(ALL_CARDS[0] as string, 0, { modulePx: PX });
const cw = first.width;
const ch = first.height;
const W = GAP + 13 * (cw + GAP);
const H = GAP + 4 * (ch + GAP);
const sheet = new Uint8Array(W * H).fill(200);
ALL_CARDS.forEach((card, i) => {
  const img = renderCardLayer(card, 0, { modulePx: PX });
  const x0 = GAP + (i % 13) * (cw + GAP);
  const y0 = GAP + Math.floor(i / 13) * (ch + GAP);
  for (let y = 0; y < ch; y++) sheet.set(img.data.subarray(y * cw, (y + 1) * cw), (y0 + y) * W + x0);
});
emit('contact-sheet-0deg.png', W, H, sheet, null, 0, PX);

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({ files: entries }, null, 2) + '\n');
writeFileSync(
  join(outDir, 'README.md'),
  `# Optical marker samples

Synthetic renders for visual inspection only, produced by \`npm run render:samples\`
(\`scripts/render-samples.ts\`, \`src/optical/render.ts\`).

- The card size in modules (40x56) is a prototype layout. The physical card size and print quality are unverified.
- Output is deterministic: no timestamps, fixed PNG encoder parameters. Hashes are in \`manifest.json\`.
- \`contact-sheet-0deg.png\` shows all 52 cards at 0 degrees, 13 columns by 4 rows, in codebook order.
`,
);
console.log(`wrote ${entries.length} PNGs to ${outDir}`);
