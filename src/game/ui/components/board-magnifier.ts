import type { HFunction } from '../dom';

const MAGNIFICATION = 2.5;

/** Only the mouse position survives a placement redraw. Tiles always come from the new view. */
export interface LensHover {
  point: { x: number; y: number } | null;
  restore?: () => void;
}

/** Magnifies only the faces already visible on this board. All listeners and copies belong to this render. */
export function boardMagnifier(
  h: HFunction,
  grid: HTMLElement,
  buttons: readonly HTMLElement[],
  cells: readonly { readonly notation: string }[],
  label: string,
  idleHint: string,
  hover: LensHover = { point: null },
): HTMLElement {
  const coordinate = h('span', { class: 'lens-coordinate' });
  const detail = h('div', { class: 'lens-detail' });
  const viewport = h('div', { class: 'lens-viewport' }, detail, h('span', { class: 'lens-idle' }, idleHint));
  const panel = h('aside', { class: 'board-lens', attrs: { inert: true }, aria: { hidden: 'true' } },
    h('div', { class: 'lens-header' }, h('span', null, label), coordinate, h('span', null, `${MAGNIFICATION}×`)),
    viewport,
  );
  let patchIndex = -1;

  function close(): void {
    hover.point = null;
    if (patchIndex === -1) return;
    patchIndex = -1;
    coordinate.textContent = '';
    panel.classList.remove('is-open');
    detail.replaceChildren();
  }

  function tile(row: number, col: number, side: number): HTMLElement {
    const source = buttons[row * side + col]!;
    const copy = h('span', { class: 'lens-tile' });
    if (source.classList.contains('is-legal')) copy.classList.add('lens-tile--legal');
    if (source.classList.contains('is-target')) copy.classList.add('lens-tile--target');
    const face = source.querySelector('.card-face');
    if (face) copy.appendChild(face.cloneNode(true));
    const code = source.nextElementSibling;
    if (code?.classList.contains('board-code-junction')) {
      copy.appendChild(h('span', { class: code.classList.contains('board-code-junction--open')
        ? 'lens-code lens-code--open' : 'lens-code' }));
    }
    return copy;
  }

  function show(clientX: number, clientY: number): void {
    if (!panel.offsetWidth) {
      close();
      return;
    }
    const rect = grid.getBoundingClientRect();
    const side = grid.children.length;
    const scale = rect.width / grid.offsetWidth;
    const width = grid.offsetWidth / side;
    const height = rect.height / scale / side;
    const x = (clientX - rect.left) / scale;
    const y = (clientY - rect.top) / scale;
    const row = Math.floor(y / height);
    const col = Math.floor(x / width);
    if (row < 0 || col < 0 || row >= side || col >= side) {
      close();
      return;
    }
    hover.point = { x: clientX, y: clientY };
    const halfWidth = viewport.clientWidth / (2 * MAGNIFICATION);
    const halfHeight = viewport.clientHeight / (2 * MAGNIFICATION);
    const centerX = Math.max(halfWidth, Math.min(x, width * side - halfWidth));
    const centerY = Math.max(halfHeight, Math.min(y, height * side - halfHeight));
    const left = Math.max(0, Math.min(side - 3, Math.floor(centerX / width) - 1));
    const top = Math.max(0, Math.min(side - 3, Math.floor(centerY / height) - 1));
    const index = top * side + left;
    if (patchIndex !== index) {
      const tiles: HTMLElement[] = [];
      for (let r = top; r < top + 3; r++) {
        for (let c = left; c < left + 3; c++) tiles.push(tile(r, c, side));
      }
      detail.replaceChildren(...tiles);
      panel.classList.add('is-open');
      patchIndex = index;
    }
    const notation = cells[row * side + col]!.notation;
    if (coordinate.textContent !== notation) coordinate.textContent = notation;
    const dx = left * width - centerX;
    const dy = top * height - centerY;
    detail.style.transform = `scale(${MAGNIFICATION}) translate(${dx}px, ${dy}px)`;
  }

  hover.restore = () => {
    const point = hover.point;
    if (!point) return;
    if (grid.contains(grid.ownerDocument.elementFromPoint(point.x, point.y))) show(point.x, point.y);
    else close();
  };
  const track = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && !event.buttons) show(event.clientX, event.clientY);
    else close();
  };
  grid.addEventListener('pointermove', track);
  grid.addEventListener('pointerup', track);
  grid.addEventListener('pointerleave', close);
  grid.addEventListener('pointercancel', close);
  return panel;
}
