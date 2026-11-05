// src/components/tile-gallery.ts
// A card's row of tiles when there are more than fit: it scrolls sideways, snapping tile by tile,
// with arrow buttons and faded edges only on the side where there's more to see.
// Rows of column tiles share a sync group and scroll together, so their columns stay lined up.
//
// Markup (rendered by the card, so the tiles stay part of its template):
//   <tile-gallery data-sync="columns">
//     <button class="gallery-btn" data-gallery-step="-1">…</button>
//     <ul class="gallery-track">…tiles…</ul>
//     <button class="gallery-btn" data-gallery-step="1">…</button>
//   </tile-gallery>

/** More tiles than this in a row and it becomes a gallery. */
export const GALLERY_AFTER = 4;

const SLACK = 2; // px of rounding to ignore at either end
const groups = new Map<string, Set<TileGallery>>();

export class TileGallery extends HTMLElement {
  #resize = new ResizeObserver(() => this.#update());
  #children = new MutationObserver(() => this.#update());
  #following = false;
  #release = 0;

  get #track() { return this.querySelector<HTMLElement>(':scope > .gallery-track'); }
  get #group() { return this.dataset.sync ? groups.get(this.dataset.sync) : undefined; }

  connectedCallback() {
    // scroll doesn't bubble, so listen in the capture phase for the track's
    this.addEventListener('scroll', this.#onScroll, true);
    this.addEventListener('click', this.#onClick);
    const sync = this.dataset.sync;
    if (sync) {
      if (!groups.has(sync)) groups.set(sync, new Set());
      groups.get(sync)!.add(this);
    }
    // the card's template fills in the tiles as it's inserted, so look once it's settled
    queueMicrotask(() => {
      const track = this.#track;
      if (!track || !this.isConnected) return;
      this.#resize.observe(track);
      this.#children.observe(track, { childList: true });
      // join a group that's already scrolled
      const leader = [...(this.#group ?? [])].find(g => g !== this && g.#track?.scrollLeft);
      if (leader) this.#follow(leader.#track!.scrollLeft);
      this.#update();
    });
  }

  disconnectedCallback() {
    this.removeEventListener('scroll', this.#onScroll, true);
    this.removeEventListener('click', this.#onClick);
    this.#resize.disconnect();
    this.#children.disconnect();
    this.#group?.delete(this);
    clearTimeout(this.#release);
  }

  /** Flag which ends have more to see; the CSS shows the arrows and fades from that. */
  #update() {
    const track = this.#track;
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    this.toggleAttribute('data-more-start', track.scrollLeft > SLACK);
    this.toggleAttribute('data-more-end', track.scrollLeft < max - SLACK);
  }

  #onScroll = (e: Event) => {
    const track = this.#track;
    if (!track || e.target !== track) return;
    this.#update();
    if (this.#following) return;
    for (const other of this.#group ?? []) if (other !== this) other.#follow(track.scrollLeft);
  };

  /** Mirror another row's position. Snapping is paused meanwhile, so the two don't tug at each other. */
  #follow(left: number) {
    const track = this.#track;
    if (!track) return;
    this.#following = true;
    track.style.scrollSnapType = 'none';
    track.style.scrollBehavior = 'auto';
    track.scrollLeft = left;
    clearTimeout(this.#release);
    this.#release = window.setTimeout(() => {
      track.style.scrollSnapType = '';
      track.style.scrollBehavior = '';
      this.#following = false;
    }, 150);
  }

  // a page at a time; snapping lines the result up with a tile's edge
  #onClick = (e: MouseEvent) => {
    const button = (e.target as Element).closest<HTMLElement>('[data-gallery-step]');
    const track = this.#track;
    if (!button || !track || !this.contains(button)) return;
    track.scrollBy({ left: Number(button.dataset.galleryStep) * track.clientWidth });
  };
}

if (!customElements.get('tile-gallery')) customElements.define('tile-gallery', TileGallery);

declare global {
  interface HTMLElementTagNameMap { 'tile-gallery': TileGallery }
}
