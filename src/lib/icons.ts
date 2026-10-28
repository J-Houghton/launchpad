// src/lib/icons.ts
// Lucide icons rendered as inline SVG inside Lit templates.
import { html } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import {
  ArrowUpRight, BookOpen, ChartLine, Database, GitBranch, Link, MessageSquare, Shield, SquareTerminal, Ticket,
  type IconNode,
} from 'lucide';
import type { LinkIcon, LinkItem } from '../config';

export {
  AppWindow, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronDown, ChevronUp, ClipboardPaste,
  Clock, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Copy,
  Download, Ellipsis, ExternalLink, Eye, EyeOff, FileCode, FileSpreadsheet, FolderOpen, FolderPlus, Globe,
  GripVertical, Layers, Link, Link2, MapPin, Monitor, Moon, Palette, Pencil, Pin, PinOff, Plus, RefreshCw,
  Rocket, RotateCcw, Save, Search, Settings, SlidersHorizontal, Sparkles, Sun, Trash, TriangleAlert, Type,
  Unlink, Upload, User, X,
} from 'lucide';
export type { IconNode };

const markup = new WeakMap<IconNode, string>();

const toMarkup = (node: IconNode) =>
  node.map(([tag, attrs]) =>
    `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');

export function icon(node: IconNode, className = '') {
  let inner = markup.get(node);
  if (!inner) markup.set(node, (inner = toMarkup(node)));
  return html`<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${unsafeSVG(inner)}</svg>`;
}

// ---- app link icons ----

export const LINK_ICON_NODES: Record<Exclude<LinkIcon, 'auto'>, IconNode> = {
  book: BookOpen, link: Link, git: GitBranch, chart: ChartLine, ticket: Ticket,
  terminal: SquareTerminal, database: Database, shield: Shield, chat: MessageSquare,
};

const GUESSES: [RegExp, IconNode][] = [
  [/doc|wiki|confluence|guide|manual|readme|runbook/, BookOpen],
  [/git|repo|bitbucket|source/, GitBranch],
  [/grafana|dashboard|metric|monitor|kibana|splunk|datadog|chart|report/, ChartLine],
  [/jira|ticket|issue|servicenow|board|backlog/, Ticket],
  [/ssh|console|terminal|shell|cli|admin/, SquareTerminal],
  [/\bdb\b|database|sql|oracle|postgres|mongo/, Database],
  [/vault|secret|security|auth|sso/, Shield],
  [/slack|teams|chat|channel/, MessageSquare],
];

/** The chosen icon, or a guess from the link's label and address. */
export function linkIcon(link: LinkItem) {
  if (link.icon && link.icon !== 'auto') return LINK_ICON_NODES[link.icon];
  const text = `${link.label} ${link.url}`.toLowerCase();
  return GUESSES.find(([re]) => re.test(text))?.[1] ?? ArrowUpRight;
}
