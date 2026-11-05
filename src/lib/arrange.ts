// src/lib/arrange.ts
// Arrange mode: rearranging the page on the page itself. It works on a copy of the config that
// the page shows as a live preview (config.preview); Save keeps it, Cancel goes back.
import { config, type LaunchpadConfig } from '../config.js';
import { linkedFileName, writeConfigFile } from './config-file.js';
import { transition } from './transition.js';
import { toast } from './util.js';

class ArrangeStore extends EventTarget {
  #draft?: LaunchpadConfig;
  #changed = false;

  get active() { return !!this.#draft; }
  /** The config being arranged — only while active. */
  get draft() { return this.#draft!; }

  /** Start arranging the saved page, or carry on from Settings' unsaved changes. */
  start(from: LaunchpadConfig = config.raw, changed = false) {
    this.#draft = structuredClone(from);
    this.#changed = changed;
    document.documentElement.classList.add('is-arranging');
    this.#show(this.#draft);
  }

  /** Change the copy and show it. Dropping something in place skips the animation — it's already where it goes. */
  edit(change: (draft: LaunchpadConfig) => void, animate = true) {
    if (!this.#draft) return;
    change(this.#draft);
    this.#changed = true;
    this.#show(this.#draft, animate);
  }

  cancel = () => {
    if (this.#changed && !confirm('Discard your layout changes?')) return;
    this.#end();
    this.#show(undefined);
  };

  save = () => {
    const next = this.#draft;
    if (!next) return;
    this.#end();
    transition(() => {
      config.save(next);
      this.#emit();
      toast(config.customized ? 'Saved in this browser' : 'Saved');
    });
  };

  saveToFile = async () => {
    const next = this.#draft;
    if (!next) return;
    try {
      const result = await writeConfigFile(next);
      if (result === 'cancelled') return;
      this.#end();
      if (result === 'written') {
        const name = (await linkedFileName()) ?? 'launchpad.config.js';
        transition(() => { config.fileWritten(next); this.#emit(); });
        toast(`Saved to ${name}`);
      } else {
        transition(() => { config.save(next); this.#emit(); });
        toast('Downloaded launchpad.config.js — put it next to index.html in place of the old one');
      }
    } catch (err) {
      toast(`Couldn't save the file: ${(err as Error).message}`, 'error');
    }
  };

  #show(data: LaunchpadConfig | undefined, animate = true) {
    const update = () => { config.preview(data); this.#emit(); };
    if (animate) transition(update); else update();
  }

  #end() {
    this.#draft = undefined;
    this.#changed = false;
    document.documentElement.classList.remove('is-arranging');
  }

  #emit() { this.dispatchEvent(new Event('change')); }
}

export const arrange = new ArrangeStore();
