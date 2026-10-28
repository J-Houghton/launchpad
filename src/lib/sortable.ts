// src/lib/sortable.ts
// Drag-to-reorder with the pointer, plus the arrow keys on the same handle.
//
// Markup: a list element with data-sort-list="<id>", whose direct children marked
// [data-sort-item] can be moved, each with a [data-sort-handle] button. Lists that share
// data-sort-group="<name>" accept each other's items (e.g. apps moving between groups).
// Wire the handle's pointerdown to dragToReorder() and its keydown to keyboardReorder();
// both report the move, and the caller updates its data.

export type SortMove = { from: { list: string; index: number }; to: { list: string; index: number } };

const EDGE = 48; // px from a scroll container's edge where dragging starts to scroll it

const itemsOf = (list: Element, except?: Element) =>
  [...list.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.hasAttribute('data-sort-item') && c !== except);

function locateItem(handle: Element) {
  const item = handle.closest<HTMLElement>('[data-sort-item]');
  const list = item?.parentElement;
  if (!item || !list?.dataset.sortList) return undefined;
  const group = list.dataset.sortGroup;
  const lists = group ? [...document.querySelectorAll<HTMLElement>(`[data-sort-group="${CSS.escape(group)}"]`)] : [list];
  return { item, list, lists, index: itemsOf(list).indexOf(item) };
}

function scrollParent(el: HTMLElement) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight) return p;
  }
  return undefined;
}

// after the caller re-renders, put focus back on the moved item's handle
function refocus(listId: string, index: number) {
  setTimeout(() => {
    const list = document.querySelector(`[data-sort-list="${CSS.escape(listId)}"]`);
    if (list) itemsOf(list)[index]?.querySelector<HTMLElement>('[data-sort-handle]')?.focus();
  });
}

export function dragToReorder(e: PointerEvent, onMove: (move: SortMove) => void) {
  if (e.button !== 0) return;
  const found = locateItem(e.currentTarget as Element);
  if (!found) return;
  e.preventDefault();

  const { item, list, lists } = found;
  const handle = e.currentTarget as HTMLElement;
  const from = { list: list.dataset.sortList!, index: found.index };
  const scroller = scrollParent(item);
  const startY = e.clientY;
  const startScroll = scroller?.scrollTop ?? 0;
  let pointerY = e.clientY;
  let target: { list: HTMLElement; index: number } | undefined;
  let marked: Element[] = [];
  let raf = 0;

  const unmark = () => {
    for (const el of marked) el.classList.remove('drop-before', 'drop-after', 'drop-into');
    marked = [];
  };
  const mark = (el: Element, cls: string) => { el.classList.add(cls); marked.push(el); };

  // the list under the pointer (or the nearest one), and the slot in it
  const locate = () => {
    const boxes = lists.map(l => ({ l, r: l.getBoundingClientRect() }));
    const gap = ({ r }: { r: DOMRect }) => (pointerY < r.top ? r.top - pointerY : pointerY > r.bottom ? pointerY - r.bottom : 0);
    const hit = boxes.reduce((best, cur) => (gap(cur) < gap(best) ? cur : best));
    const others = itemsOf(hit.l, item);
    let index = others.findIndex(o => {
      const r = o.getBoundingClientRect();
      return pointerY < r.top + r.height / 2;
    });
    if (index < 0) index = others.length;

    unmark();
    if (!others.length) mark(hit.l, 'drop-into');
    else if (index < others.length) mark(others[index], 'drop-before');
    else mark(others[others.length - 1], 'drop-after');
    target = { list: hit.l, index };
  };

  const frame = () => {
    if (scroller) {
      const r = scroller.getBoundingClientRect();
      if (pointerY < r.top + EDGE) scroller.scrollTop -= Math.ceil((r.top + EDGE - pointerY) / 4);
      else if (pointerY > r.bottom - EDGE) scroller.scrollTop += Math.ceil((pointerY - (r.bottom - EDGE)) / 4);
    }
    const scrolled = (scroller?.scrollTop ?? 0) - startScroll;
    item.style.translate = `0 ${pointerY - startY + scrolled}px`;
    locate();
    raf = requestAnimationFrame(frame);
  };

  const onPointerMove = (ev: PointerEvent) => { pointerY = ev.clientY; };

  const finish = (commit: boolean) => {
    cancelAnimationFrame(raf);
    handle.removeEventListener('pointermove', onPointerMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onCancel);
    item.classList.remove('is-dragging');
    item.style.translate = '';
    document.documentElement.classList.remove('is-sorting');
    unmark();
    if (!commit || !target) return;
    const to = { list: target.list.dataset.sortList!, index: target.index };
    if (to.list !== from.list || to.index !== from.index) {
      onMove({ from, to });
      refocus(to.list, to.index);
    }
  };
  const onUp = () => finish(true);
  const onCancel = () => finish(false);

  handle.setPointerCapture(e.pointerId);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onCancel);
  item.classList.add('is-dragging');
  document.documentElement.classList.add('is-sorting');
  raf = requestAnimationFrame(frame);
}

/** ArrowUp / ArrowDown on a handle; in grouped lists, items step across into the neighbouring list. */
export function keyboardReorder(e: KeyboardEvent, onMove: (move: SortMove) => void) {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  const found = locateItem(e.currentTarget as Element);
  if (!found) return;
  e.preventDefault();

  const { list, lists, index } = found;
  const dir = e.key === 'ArrowUp' ? -1 : 1;
  const from = { list: list.dataset.sortList!, index };
  const count = itemsOf(list).length;
  let to = { list: from.list, index: index + dir };

  if (to.index < 0 || to.index >= count) {
    const neighbour = lists[lists.indexOf(list) + dir];
    if (!neighbour) return;
    to = { list: neighbour.dataset.sortList!, index: dir < 0 ? itemsOf(neighbour).length : 0 };
  }
  onMove({ from, to });
  refocus(to.list, to.index);
}
