// src/lib/store-controller.ts
import type { ReactiveController, ReactiveControllerHost } from 'lit';

const hosts = new Set<ReactiveControllerHost>();

/** Re-renders its host whenever one of the given stores dispatches `change`. */
export class StoreController implements ReactiveController {
  #host: ReactiveControllerHost;
  #stores: EventTarget[];
  #onChange = () => this.#host.requestUpdate();

  constructor(host: ReactiveControllerHost, ...stores: EventTarget[]) {
    this.#host = host;
    this.#stores = stores;
    host.addController(this);
  }

  hostConnected() {
    hosts.add(this.#host);
    for (const store of this.#stores) store.addEventListener('change', this.#onChange);
  }

  hostDisconnected() {
    hosts.delete(this.#host);
    for (const store of this.#stores) store.removeEventListener('change', this.#onChange);
  }

  /** Resolves once every subscribed component has finished re-rendering. */
  static settled() {
    return Promise.all([...hosts].map(host => host.updateComplete));
  }
}
