/// <reference path="../../node_modules/vite/client.d.ts" />
import '../../src/game/ui/shell.css';
import '../../src/game/ui/styles/tokens.css';
import '../../src/game/ui/styles/card.css';
import '../../src/game/ui/styles/board.css';
import '../../src/game/ui/styles/hand.css';
import '../../src/game/ui/styles/placement.css';
import '../../src/game/ui/styles/setup.css';
import '../../src/game/ui/styles/reveal.css';
import '../../src/game/ui/styles/end.css';
import '../../src/game/ui/styles/overlay.css';
import '../../src/game/ui/styles/persistence.css';
import '../../src/game/ui/styles/layout.css';
import './screen.css';
import { browserStore } from '../../src/game/persistence/storage';
import { mountApp } from '../../src/game/ui/controller';
import type { RenderInput } from '../../src/game/ui/controller';
import { createGameScreen } from '../../src/game/ui/screens/game';
import type { PlayerView } from '../../src/game/core/view';
import { isBlindMode } from '../../src/game/core/types';
import type { Orientation } from '../../src/game/core/types';
import { BOARD_SIZE, fromNotation, quadCells } from '../../src/game/core/geometry';

const files = import.meta.glob<string>('./inputs/cards/*.svg', {
  eager: true, import: 'default', query: '?url',
});
const art = new Map(Object.entries(files).map(([path, url]) => [path.split('/').at(-1)!.slice(0, -4), url]));
if (art.size !== 52) throw new Error('Screen playtest requires exactly 52 card faces');
import supportingArt from './inputs/cards/support.png?url';

type VisibleCard = { readonly name: string; readonly rotation: Orientation };
const sample: readonly VisibleCard[] = ['5H', '9D', 'JC', '2S'].map(name => ({ name, rotation: 0 }));

function element<T extends HTMLElement = HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (node === null) throw new Error('Missing screen playtest element: ' + selector);
  return node;
}

const root = element('#app');
const tools = element('#screen-tools');
const dialog = element<HTMLDialogElement>('#scan-dialog');
const scanBoard = element('#scan-board');
const scanTitle = element('#scan-title');
const remove = element<HTMLButtonElement>('#scan-remove');
let selected: readonly VisibleCard[] = [];
let missing = false;
let activeReveal = '';

function makeImage(name: string, rotation: Orientation): HTMLImageElement {
  const img = document.createElement('img');
  img.src = art.get(name)!;
  img.alt = '';
  img.draggable = false;
  if (rotation === 180) img.classList.add('scan-turned');
  return img;
}

function sizeBoard(): void {
  // Each card is an exact integer 5:7 rectangle, so adjacent edges share a pixel boundary.
  const units = Math.max(1, Math.min(68, Math.floor((window.innerWidth - 30) / 10),
    Math.floor((window.innerHeight - 138) / 14)));
  scanBoard.style.setProperty('--scan-unit', String(units) + 'px');
}

function renderPhoto(): void {
  const support = document.createElement('img');
  support.src = supportingArt;
  support.alt = '';
  support.className = 'scan-support';
  const cards = selected.map(({ name, rotation }, index) => {
    const cell = document.createElement('div');
    cell.className = 'scan-card';
    if (!(missing && index === 3)) {
      const image = makeImage(name, rotation);
      image.dataset.scanFace = name;
      cell.append(image);
    }
    return cell;
  });
  scanBoard.replaceChildren(support, ...cards);
  remove.textContent = missing ? '한 장 다시 놓기' : '한 장 빼기';
  remove.setAttribute('aria-pressed', String(missing));
}

function show(cards: readonly VisibleCard[], title: string, reveal = ''): void {
  selected = cards;
  activeReveal = reveal;
  missing = false;
  scanTitle.textContent = title;
  sizeBoard();
  renderPhoto();
  if (!dialog.open) dialog.showModal();
}

function clearPhoto(): void {
  selected = [];
  activeReveal = '';
  missing = false;
  scanBoard.replaceChildren();
}

function closePhoto(): void {
  dialog.close();
  clearPhoto();
}

element('#scan-close').addEventListener('click', closePhoto);
element('#sample-open').addEventListener('click', () => show(sample, '카메라 판독 연습'));
remove.addEventListener('click', () => { missing = !missing; renderPhoto(); });
dialog.addEventListener('cancel', event => { event.preventDefault(); closePhoto(); });
window.addEventListener('resize', sizeBoard);

function releasedCards(view: PlayerView, quad: string, allowed: readonly string[]): VisibleCard[] | null {
  const corner = fromNotation(quad);
  if (!corner.ok || corner.value.row >= BOARD_SIZE - 1 || corner.value.col >= BOARD_SIZE - 1 ||
      allowed.length !== 4 || new Set(allowed).size !== 4) return null;
  const result: VisibleCard[] = [];
  const seen = new Set<string>();
  for (const position of quadCells(corner.value)) {
    const cell = view.board[position.row * BOARD_SIZE + position.col];
    if (!cell?.card || !allowed.includes(cell.card) || seen.has(cell.card)) return null;
    seen.add(cell.card);
    const [suit, rank] = cell.card.split('-');
    const name = rank + suit;
    if (!art.has(name)) return null;
    result.push({ name, rotation: cell.orientation });
  }
  return result;
}

const revealTools = document.createElement('div');
revealTools.className = 'screen-reveal-tools';
let buttonsKey = '';
function renderRevealTools(input: RenderInput): void {
  const view = input.publicView ?? input.view;
  tools.hidden = input.model.gate !== null || (view != null && isBlindMode(view.rules.identityVisibility));
  const permitted = !tools.hidden && (view?.phase === 'REVEAL' || view?.phase === 'ENDED');
  if (tools.hidden && dialog.open) closePhoto();
  const record = permitted ? view?.lastReveal : null;
  const candidates = record?.codes.flatMap(code => {
    const cards = releasedCards(view!, code.quadKey, code.cards);
    return cards === null ? [] : [{ quad: code.quadKey, cards }];
  }) ?? [];
  if (candidates.length === 0) {
    revealTools.remove();
    revealTools.replaceChildren();
    buttonsKey = '';
    if (activeReveal && dialog.open) closePhoto();
    return;
  }
  const key = JSON.stringify(candidates);
  if (key !== buttonsKey) {
    if (activeReveal && dialog.open) closePhoto();
    buttonsKey = key;
    revealTools.replaceChildren(...candidates.map(({ quad, cards }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '카메라로 코드 보기 · ' + quad;
      button.addEventListener('click', () => show(cards, '공개 코드 · ' + quad, key));
      return button;
    }));
  }
  const destination = root.querySelector('.game-main-slot');
  if (destination && revealTools.parentElement !== destination) destination.prepend(revealTools);
}

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
const host = createGameScreen({ doc: document, root, randomSeedText: () => String(randomSeed()) });
const stored = browserStore();
mountApp(root, {
  doc: document,
  languages: ['ko', ...navigator.languages],
  schedule: (fn, ms) => {
    const id = setTimeout(fn, ms);
    return { cancel: () => clearTimeout(id) };
  },
  randomSeed,
  store: {
    durable: stored.durable,
    getItem: key => stored.getItem('screen-playtest:' + key),
    setItem: (key, value) => stored.setItem('screen-playtest:' + key, value),
    removeItem: key => stored.removeItem('screen-playtest:' + key),
  },
  nowIso: () => new Date().toISOString(),
  renderer: input => { host.render(input); renderRevealTools(input); },
});
root.querySelector('.shell__language')?.before(tools);
