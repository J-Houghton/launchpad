// src/lib/template.ts
// Templates for data widgets: a small part of Mustache, plus a few formatters.
//
//   {{name}}                 a value, by its path: user.name, items.0.title
//   {{.}}                    the current value (inside a section)
//   {{#items}}…{{/items}}    for each item of a list; once, for a value that's there and true
//   {{^items}}…{{/items}}    only when the list is empty, or the value missing or false
//   {{when | ago}}           formatted: number, date, time, ago, upper, lower
//
// Values are escaped. The result keeps only a few harmless tags (and their class names, for custom
// CSS), so a template — or the data it shows — can't add scripts, styles or frames to the page.

type Part =
  | { kind: 'text'; text: string }
  | { kind: 'value'; path: string; format?: string }
  | { kind: 'section'; path: string; inverted: boolean; parts: Part[] };

const TAG = /\{\{\s*([#^/]?)\s*([^}|]*?)\s*(?:\|\s*([\w-]+)\s*)?\}\}/g;

/** Turns a template into parts. Throws (with a readable message) when its sections don't match up. */
export function parseTemplate(template: string): Part[] {
  const root: Part[] = [];
  const stack: { path: string; parts: Part[] }[] = [{ path: '', parts: root }];
  let at = 0;
  for (const m of template.matchAll(TAG)) {
    const [whole, sigil, path, format] = m;
    const top = stack[stack.length - 1];
    if (m.index > at) top.parts.push({ kind: 'text', text: template.slice(at, m.index) });
    at = m.index + whole.length;
    if (sigil === '#' || sigil === '^') {
      const section: Part = { kind: 'section', path, inverted: sigil === '^', parts: [] };
      top.parts.push(section);
      stack.push({ path, parts: section.parts });
    } else if (sigil === '/') {
      if (stack.length === 1 || top.path !== path) throw new Error(`{{/${path}}} doesn't close an open {{#${path}}}`);
      stack.pop();
    } else {
      top.parts.push({ kind: 'value', path, format });
    }
  }
  if (stack.length > 1) throw new Error(`{{#${stack[stack.length - 1].path}}} is never closed`);
  if (at < template.length) root.push({ kind: 'text', text: template.slice(at) });
  return root;
}

/** Looks a path up in the innermost context that has its first step, as Mustache does. */
function lookup(contexts: unknown[], path: string): unknown {
  if (path === '.' || path === '') return contexts[contexts.length - 1];
  const [first, ...rest] = path.split('.');
  for (let i = contexts.length - 1; i >= 0; i--) {
    const c = contexts[i];
    if (c !== null && typeof c === 'object' && first in c) {
      return rest.reduce<unknown>((v, key) => (v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined),
        (c as Record<string, unknown>)[first]);
    }
  }
  return undefined;
}

const escape = (s: string) => s.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);

function ago(date: Date) {
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  const units: [number, Intl.RelativeTimeFormatUnit][] = [[60, 'second'], [60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month']];
  let value = -s;
  for (const [size, unit] of units) {
    if (Math.abs(value) < size) return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(Math.round(value), unit);
    value /= size;
  }
  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(Math.round(value), 'year');
}

/** Dates arrive as ISO strings, or as seconds or milliseconds since 1970. */
function toDate(v: unknown) {
  const d = typeof v === 'number' ? new Date(v < 1e11 ? v * 1000 : v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function format(v: unknown, how?: string): string {
  if (v === undefined || v === null) return '';
  if (how === 'number' && Number.isFinite(Number(v))) return Number(v).toLocaleString();
  if (how === 'date' || how === 'time' || how === 'ago') {
    const d = toDate(v);
    if (!d) return String(v);
    if (how === 'ago') return ago(d);
    return how === 'date' ? d.toLocaleDateString(undefined, { dateStyle: 'medium' }) : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }
  const text = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return how === 'upper' ? text.toUpperCase() : how === 'lower' ? text.toLowerCase() : text;
}

const empty = (v: unknown) => !v || (Array.isArray(v) && !v.length);

function renderParts(parts: Part[], contexts: unknown[]): string {
  return parts.map(part => {
    if (part.kind === 'text') return part.text;
    const v = lookup(contexts, part.path);
    if (part.kind === 'value') return escape(format(v, part.format));
    if (part.inverted) return empty(v) ? renderParts(part.parts, contexts) : '';
    if (empty(v)) return '';
    if (Array.isArray(v)) return v.map(item => renderParts(part.parts, [...contexts, item])).join('');
    return renderParts(part.parts, typeof v === 'object' ? [...contexts, v] : contexts);
  }).join('');
}

/** The template filled in with `data`, as HTML that still needs cleaning (see clean). */
export const renderTemplate = (template: string, data: unknown) => renderParts(parseTemplate(template), [data]);

// ---- keeping only harmless markup ----

const ALLOWED = new Set(['a', 'b', 'strong', 'i', 'em', 'u', 's', 'small', 'code', 'pre', 'br', 'hr', 'p', 'span', 'div',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'h4', 'h5', 'img', 'time', 'mark', 'table', 'thead', 'tbody', 'tr', 'th', 'td']);
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math', 'form', 'link', 'meta']);
const safeUrl = (v: string | null) => !!v && /^https?:\/\//i.test(v.trim());

/**
 * Rebuilds `html` from the allowed tags only: their text, class names, and http(s) links and images.
 * Anything else is unwrapped (its text kept) or, for scripts and the like, dropped with its contents.
 */
export function clean(html: string): DocumentFragment {
  const source = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  const out = document.createDocumentFragment();
  const copy = (from: Node, into: Node) => {
    for (const node of from.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) { into.appendChild(document.createTextNode(node.textContent ?? '')); continue; }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const el = node as Element;
      const tag = el.tagName.toLowerCase();
      if (DROP.has(tag)) continue;
      if (!ALLOWED.has(tag)) { copy(el, into); continue; }
      const made = document.createElement(tag);
      const cls = el.getAttribute('class')?.replace(/[^\w\s-]/g, '').trim();
      if (cls) made.className = cls;
      if (tag === 'a' && safeUrl(el.getAttribute('href'))) {
        made.setAttribute('href', el.getAttribute('href')!.trim());
        made.setAttribute('target', '_blank');
        made.setAttribute('rel', 'noopener noreferrer');
      }
      if (tag === 'img') {
        if (!safeUrl(el.getAttribute('src'))) continue;
        made.setAttribute('src', el.getAttribute('src')!.trim());
        made.setAttribute('alt', el.getAttribute('alt') ?? '');
        made.setAttribute('loading', 'lazy');
        made.setAttribute('referrerpolicy', 'no-referrer');
      }
      if (tag === 'time' && el.getAttribute('datetime')) made.setAttribute('datetime', el.getAttribute('datetime')!);
      if ((tag === 'td' || tag === 'th') && /^\d+$/.test(el.getAttribute('colspan') ?? '')) made.setAttribute('colspan', el.getAttribute('colspan')!);
      copy(el, made);
      into.appendChild(made);
    }
  };
  copy(source, out);
  return out;
}
