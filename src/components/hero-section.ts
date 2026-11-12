// src/components/hero-section.ts
// The greeting: the time of day, and a typed headline. The clock and weather are sections of their own.
import { LitElement, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { config, primaryTimeZone } from '../config.js';
import { controlGlass } from '../lib/glass-controls.js';
import { StoreController } from '../lib/store-controller.js';
import { reducedMotion } from '../lib/transition.js';

const hourIn = (timeZone: string) =>
  Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));

function greeting() {
  const h = hourIn(primaryTimeZone(config));
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Burning the midnight oil';
}

@customElement('hero-section')
export class HeroSection extends LitElement {
  protected createRenderRoot() { return this; }

  @state() private typedTitle = '';
  @state() private typedSub = '';
  @state() private phase: 'title' | 'subtitle' | 'done' = 'title';
  #timer = 0;
  #greetingTimer = 0;

  constructor() {
    super();
    new StoreController(this, config);
  }

  connectedCallback() {
    super.connectedCallback();
    if (!config.widgets.greeting.typing || reducedMotion()) {
      this.phase = 'done';
    } else {
      this.#schedule(650); // let the entrance animation land first
    }
    // keep the greeting honest if the page stays open all day
    this.#greetingTimer = window.setInterval(() => this.requestUpdate(), 5 * 60_000);
  }

  disconnectedCallback() {
    clearTimeout(this.#timer);
    clearInterval(this.#greetingTimer);
    super.disconnectedCallback();
  }

  // the greeting changed while it was being typed out (say, an example was loaded): just show it
  willUpdate() {
    const { title, subtitle } = config.widgets.greeting;
    if (this.phase !== 'done' && !(title.startsWith(this.typedTitle) && subtitle.startsWith(this.typedSub))) {
      clearTimeout(this.#timer);
      this.phase = 'done';
    }
  }

  #schedule(ms: number) {
    this.#timer = window.setTimeout(this.#tick, ms + Math.random() * 40);
  }

  #tick = () => {
    const { title, subtitle } = config.widgets.greeting;
    if (this.typedTitle.length < title.length) {
      this.typedTitle = title.slice(0, this.typedTitle.length + 1);
      this.#schedule(this.typedTitle.length === title.length ? 420 : 70);
    } else if (this.typedSub.length < subtitle.length) {
      this.phase = 'subtitle';
      this.typedSub = subtitle.slice(0, this.typedSub.length + 1);
      this.#schedule(55);
    } else {
      this.phase = 'done';
    }
  };

  render() {
    const { title, subtitle } = config.widgets.greeting;
    const done = this.phase === 'done'; // once typed, follow config edits directly
    // the invisible "ghost" copy reserves the final size so nothing shifts while typing
    return html`
      <section class="hero" aria-label="Welcome">
        <!-- outside the headline's wrapper, which blurs as the page scrolls: glass can't see the page from inside that -->
        <p class="eyebrow enter" style="--i:0" ${controlGlass('bar')}><span class="eyebrow-dot"></span>${greeting()}</p>
        <div class="hero-copy">
          <h1 class="hero-title type-stack enter" style="--i:1">
            <span class="visually-hidden">${title}</span>
            <span class="type-ghost" aria-hidden="true">${title}</span>
            <span class="type-live ${this.phase === 'title' ? 'has-caret' : ''}" aria-hidden="true">${done ? title : this.typedTitle}</span>
          </h1>
          ${subtitle ? html`
            <p class="hero-sub type-stack enter" style="--i:2">
              <span class="visually-hidden">${subtitle}</span>
              <span class="type-ghost" aria-hidden="true">${subtitle}</span>
              <span class="type-live ${this.phase === 'title' ? '' : 'has-caret'}" aria-hidden="true">${done ? subtitle : this.typedSub}</span>
            </p>` : nothing}
        </div>
      </section>
    `;
  }
}
