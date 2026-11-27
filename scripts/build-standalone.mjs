import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

// The local marked faces are optional for development, but required for the camera-readable game.
const root = new URL('../', import.meta.url);
const faceDir = new URL('prototypes/screen-playtest/inputs/cards/', root);
const faces = new Set(await readdir(faceDir).catch(error => {
  if (error.code === 'ENOENT') return [];
  throw error;
}));
for (const suit of ['H', 'D', 'C', 'S']) {
  for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']) {
    if (!faces.has(rank + suit + '.svg')) throw new Error('Stage the 52 marked card faces before building QRoker.html.');
  }
}

const result = await build({
  configFile: fileURLToPath(new URL('vite.config.ts', root)),
  build: { write: false, modulePreload: false, assetsInlineLimit: () => true },
});
const files = result.output;
const script = files.find(file => file.type === 'chunk' && file.isEntry);
const style = files.find(file => file.fileName.endsWith('.css'));
const page = files.find(file => file.fileName === 'index.html');
if (files.length !== 3 || !script || !style || !page) throw new Error('Expected one HTML page, one script and one stylesheet.');
const html = String(page.source);
const scriptTag = /<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/;
const styleTag = /<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/;
if (html.match(scriptTag)?.[1] !== './' + script.fileName || html.match(styleTag)?.[1] !== './' + style.fileName) {
  throw new Error('The generated HTML does not reference the expected script and stylesheet.');
}
const standalone = html
  .replace(styleTag, () => '<style>' + style.source + '</style>')
  .replace(scriptTag, () => '<script type="module">' + script.code.replace(/<\/script/gi, '<\\/script') + '</script>');
await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/QRoker.html', root), standalone);
console.log('Built dist/QRoker.html');
