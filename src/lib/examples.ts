// src/lib/examples.ts
// Ready-made pages to start from, or just to look around: a personal home page and a team's launch page.
// The setup guide and Settings → Edit page → File offer them. (The home page is also the sample
// public/launchpad.config.js that ships with the build, less the two example extensions the sample turns on:
// an example loaded in Settings can't count on the extensions folder being there.)
import { normalize, type LaunchpadConfig } from '../config.js';
import { Briefcase, House, type IconNode } from './icons.js';

export type Example = { id: string; name: string; description: string; glyph: IconNode; config: () => LaunchpadConfig };

const HOME: LaunchpadConfig = {
  version: 4,
  site: { title: 'Launchpad', heading: 'Projects', footer: 'Example setup · make it yours in Settings (Ctrl + ,)' },
  statusChecks: false,
  useColumns: false,
  columns: [],
  groups: [],
  links: [
    { label: 'Mail', url: 'https://mail.example.com' },
    { label: 'Calendar', url: 'https://calendar.example.com' },
    { label: 'Notes', url: 'https://notes.example.com' },
  ],
  cards: [
    {
      id: 'side-projects', name: 'Side projects', description: 'Things I\'m building',
      links: [{ label: 'All repos', url: 'https://git.example.com/me', icon: 'git' }],
      tiles: [
        { name: 'Recipe box', url: 'https://recipes.example.com', label: 'WEB' },
        { name: 'Pixel editor', url: 'https://pixels.example.com', label: 'APP' },
        { name: 'Habit tracker', url: 'https://habits.example.com', label: 'APP' },
        { name: 'Blog', url: 'https://blog.example.com', label: 'WEB' },
        { name: 'Trail map', url: 'https://trails.example.com', label: 'WEB' },
        { name: 'Dotfiles', url: 'https://git.example.com/me/dotfiles', label: 'REPO' },
        { name: 'Home lab', url: 'https://git.example.com/me/homelab', label: 'REPO' },
      ],
    },
    {
      id: 'making', name: 'Making', description: 'Tools for design and drawing', links: [],
      tiles: [
        { name: 'Sketchbook', url: 'https://sketch.example.com' },
        { name: 'Colour palettes', url: 'https://palettes.example.com' },
        { name: 'Icon library', url: 'https://icons.example.com' },
        { name: 'Font finder', url: 'https://fonts.example.com' },
      ],
    },
    {
      id: 'learning', name: 'Learning', description: 'Courses, notes and reading', links: [],
      tiles: [
        { name: 'Systems course', url: 'https://learn.example.com/systems', label: 'COURSE' },
        { name: 'Reading list', url: 'https://reading.example.com', label: 'LIST' },
        { name: 'Language practice', url: 'https://lingo.example.com', label: 'DAILY' },
      ],
    },
    {
      id: 'reading', name: 'Reading', description: 'Blogs and newsletters', newRow: false, links: [],
      tiles: [
        { name: 'Tech weekly', url: 'https://weekly.example.com', label: 'NEWS' },
        { name: 'A good blog', url: 'https://goodblog.example.com' },
      ],
    },
  ],
  widgets: {
    greeting: { title: 'Ready for liftoff', subtitle: 'Where to today?', typing: true },
    clock: { zones: [{ label: 'Local time', timeZone: 'local' }, { label: 'UTC', timeZone: 'UTC' }] },
    weather: { place: 'London, England', latitude: 51.5085, longitude: -0.1257, units: 'celsius' },
    added: [],
  },
  layout: {
    density: 'comfortable',
    sections: [
      { id: 'greeting' }, { id: 'clock', span: 3, newRow: false }, { id: 'weather', span: 3, newRow: false },
      { id: 'pinned' }, { id: 'recent', span: 5, newRow: false }, { id: 'cards' },
    ],
  },
  look: { theme: 'system', style: 'aurora', background: 'particles', css: '' },
  extensions: [],
};

/** An app's tile in each column, at the usual sort of addresses. */
const envs = (app: string, only = ['dev', 'test', 'prod']) => only.map(column => ({
  column, url: column === 'prod' ? `https://${app}.example.com` : `https://${column}.${app}.example.com`,
}));

const docs = (app: string) => [
  { label: 'Docs', url: `https://wiki.example.com/${app}` },
  { label: 'Repo', url: `https://git.example.com/team/${app}` },
];

const LAUNCH: LaunchpadConfig = {
  version: 4,
  site: { title: 'Team Launchpad', heading: 'Applications', footer: 'Example launch page · make it yours in Settings (Ctrl + ,)' },
  statusChecks: false,
  useColumns: true,
  columns: [
    { id: 'dev', label: 'DEV', color: '#0b95da' },
    { id: 'test', label: 'TEST', color: '#da950b' },
    { id: 'prod', label: 'PROD', color: '#e61a5e', caution: true },
  ],
  groups: [
    { id: 'customer', name: 'Customer apps' },
    { id: 'internal', name: 'Internal tools' },
  ],
  links: [
    { label: 'Wiki', url: 'https://wiki.example.com' },
    { label: 'Service desk', url: 'https://help.example.com' },
    { label: 'Status', url: 'https://status.example.com' },
  ],
  cards: [
    {
      id: 'billing', name: 'Billing', description: 'Invoices, payments and refunds', group: 'customer',
      links: [...docs('billing'), { label: 'Dashboard', url: 'https://metrics.example.com/billing' }], tiles: envs('billing'),
    },
    {
      id: 'storefront', name: 'Storefront', description: 'The online shop', group: 'customer',
      links: docs('storefront'), tiles: envs('shop'),
    },
    {
      id: 'accounts', name: 'Accounts', description: 'Sign-in and customer profiles', badge: 'ID', group: 'customer',
      links: docs('accounts'), tiles: envs('accounts'),
    },
    {
      id: 'admin', name: 'Admin console', description: 'Users, roles and feature flags', group: 'internal',
      links: docs('admin'), tiles: envs('admin'),
    },
    {
      id: 'reports', name: 'Reporting', description: 'Nightly reports and exports — no test copy', group: 'internal',
      links: docs('reports'), tiles: envs('reports', ['dev', 'prod']),
    },
  ],
  widgets: {
    greeting: { title: 'Ship it', subtitle: 'Everything the team runs, in one place', typing: true },
    clock: { zones: [{ label: 'Local time', timeZone: 'local' }, { label: 'UTC', timeZone: 'UTC' }, { label: 'Sydney', timeZone: 'Australia/Sydney' }] },
    weather: { place: '', latitude: 0, longitude: 0, units: 'celsius' },
    // a data widget: a public project's latest releases, from GitHub's API (which lets any page read it)
    added: [{
      id: 'releases', type: 'data', title: 'Latest releases', url: 'https://api.github.com/repos/lit/lit/releases?per_page=4', refresh: 60,
      template: '<ul class="data-list">{{#.}}<li><a href="{{html_url}}">{{name}}</a> <small>{{published_at | ago}}</small></li>{{/.}}</ul>',
    }],
  },
  layout: {
    density: 'compact',
    sections: [
      { id: 'greeting' }, { id: 'clock', span: 4, newRow: false }, { id: 'weather', hidden: true },
      { id: 'pinned' }, { id: 'recent', span: 4, newRow: false }, { id: 'releases', span: 4, newRow: false }, { id: 'cards' },
    ],
  },
  look: { theme: 'system', style: 'blueprint', background: 'particles', css: '' },
  extensions: [],
};

export const EXAMPLES: Example[] = [
  {
    id: 'home', name: 'Home page', glyph: House,
    description: 'Projects, sites and reading, sorted into cards.', config: () => normalize(structuredClone(HOME)),
  },
  {
    id: 'launch', name: 'Launch page', glyph: Briefcase,
    description: 'A team\'s apps, each with a DEV, TEST and PROD tile lined up in columns.', config: () => normalize(structuredClone(LAUNCH)),
  },
];
