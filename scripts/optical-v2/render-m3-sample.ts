import { writeFileSync } from 'node:fs';
import { generateCard } from '../../src/optical-v2/fragment';
import { renderSquare, type Placements } from '../../src/optical-v2/renderer';

const [, , output, mode = 'nominal'] = process.argv;
if (!output?.toLowerCase().endsWith('.pgm') || (mode !== 'nominal' && mode !== 'perturbed')) {
  throw new Error('Usage: tsx scripts/optical-v2/render-m3-sample.ts <output.pgm> [nominal|perturbed]');
}

const placements: Placements = {
  TL: { card: generateCard('H-5'), orientation: 0 },
  TR: { card: generateCard('D-9'), orientation: 0 },
  BL: { card: generateCard('C-J'), orientation: 0 },
  BR: { card: generateCard('S-2'), orientation: 0 },
};
if (mode === 'perturbed') {
  placements.TL.printOffset = [0, 0.125];
  placements.TL.cutOffset = [-0.125, 0];
}

const { formatVersion, decoration, width, gray, seams } = renderSquare(placements, {
  gapModules: mode === 'perturbed' ? 0.25 : 0,
});
const header = Buffer.from(`P5\n# QRoker ${formatVersion} ${decoration} ${mode}\n${width} ${width}\n255\n`);
writeFileSync(output, Buffer.concat([header, gray]), { flag: 'wx' });
console.log(JSON.stringify({ formatVersion, decoration, mode, width, seams }, null, 2));
