// src/lib/csv.ts
// Applications in and out of CSV — handy for bulk edits in a spreadsheet.
//
// Columns (header names aren't case-sensitive):
//   name              required
//   description, group, badge
//   link:<Label>      a link button, e.g. "link:Docs"
//   anything else     an environment, by its label (e.g. "DEV"); unknown ones are added
import type { AppConfig, AppEnv, EnvDef, GroupDef, LaunchpadConfig, LinkItem } from '../config';
import { isHttpUrl } from '../config';

const NEW_ENV_COLORS = ['#10b981', '#8b5cf6', '#f97316', '#64748b', '#0ea5e9', '#d946ef'];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';

function uniqueId(base: string, taken: Set<string>) {
  let id = base, n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  taken.add(id);
  return id;
}

/** Spreadsheet pastes are tab-separated; some locales use semicolons. */
function delimiterOf(text: string) {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  if (first.includes('\t')) return '\t';
  return first.split(';').length > first.split(',').length ? ';' : ',';
}

export function parseCsv(text: string): string[][] {
  const delim = delimiterOf(text);
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else quoted = false;
    } else if (ch === '"' && !field) {
      quoted = true;
    } else if (ch === delim) {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else {
      field += ch;
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.map(r => r.map(c => c.trim())).filter(r => r.some(Boolean));
}

export function toCsv(rows: string[][]) {
  return rows.map(r => r.map(c => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\r\n') + '\r\n';
}

export type AppsImport = {
  apps: AppConfig[];
  newEnvs: EnvDef[];
  newGroups: GroupDef[];
  envLabels: string[];
  linkLabels: string[];
  warnings: string[];
};

export function readAppsCsv(text: string, current: LaunchpadConfig): AppsImport {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('add a header row and at least one application');
  const header = rows[0];
  const col = (name: string) => header.findIndex(h => h.toLowerCase() === name);
  const nameCol = col('name');
  if (nameCol < 0) throw new Error('there\'s no "name" column');
  const descCol = col('description'), groupCol = col('group'), badgeCol = col('badge');
  const reserved = new Set([nameCol, descCol, groupCol, badgeCol]);

  const envIds = new Set(current.environments.map(e => e.id));
  const usedColors = new Set(current.environments.map(e => e.color));
  const newEnvs: EnvDef[] = [];
  const envCols: { col: number; env: EnvDef }[] = [];
  const linkCols: { col: number; label: string }[] = [];

  header.forEach((h, i) => {
    if (reserved.has(i) || !h) return;
    if (/^link:/i.test(h)) {
      linkCols.push({ col: i, label: h.slice(5).trim() || 'Link' });
      return;
    }
    const known = [...current.environments, ...newEnvs]
      .find(e => e.label.toLowerCase() === h.toLowerCase() || e.id === h.toLowerCase());
    if (known) {
      envCols.push({ col: i, env: known });
      return;
    }
    const color = NEW_ENV_COLORS.find(c => !usedColors.has(c)) ?? '#888888';
    usedColors.add(color);
    const env: EnvDef = { id: uniqueId(slug(h), envIds), label: h.toUpperCase().slice(0, 12), color };
    newEnvs.push(env);
    envCols.push({ col: i, env });
  });

  const groupIds = new Set(current.groups.map(g => g.id));
  const newGroups: GroupDef[] = [];
  const groupFor = (name: string) => {
    if (!name) return undefined;
    const known = [...current.groups, ...newGroups].find(g => g.name.toLowerCase() === name.toLowerCase());
    if (known) return known.id;
    const group = { id: uniqueId(slug(name), groupIds), name };
    newGroups.push(group);
    return group.id;
  };

  const warnings: string[] = [];
  const appIds = new Set(current.apps.map(a => a.id));
  let badUrls = 0, unnamed = 0;
  const apps = rows.slice(1).flatMap((r): AppConfig[] => {
    const name = r[nameCol] ?? '';
    if (!name) { unnamed++; return []; }
    const app = { id: uniqueId(slug(name), appIds), name } as AppConfig;
    if (r[descCol]) app.description = r[descCol];
    if (r[badgeCol]) app.badge = r[badgeCol].slice(0, 4);
    const group = groupFor(r[groupCol] ?? '');
    if (group) app.group = group;
    app.links = linkCols.flatMap(({ col, label }): LinkItem[] => (r[col] ? [{ label, url: r[col] }] : []));
    app.envs = envCols.flatMap(({ col, env }): AppEnv[] => {
      const url = r[col];
      if (!url) return [];
      if (!isHttpUrl(url)) { badUrls++; return []; }
      return [{ env: env.id, url }];
    });
    return [app];
  });

  if (unnamed) warnings.push(`${unnamed} row${unnamed === 1 ? ' has' : 's have'} no name and will be skipped.`);
  if (badUrls) warnings.push(`${badUrls} address${badUrls === 1 ? ' isn\'t' : 'es aren\'t'} a full https:// link and will be left out.`);

  return {
    apps, newEnvs, newGroups, warnings,
    envLabels: envCols.map(c => c.env.label),
    linkLabels: linkCols.map(c => c.label),
  };
}

/** Merge an import into a draft config: matching names are updated, the rest added (or everything replaced). */
export function applyAppsImport(draft: LaunchpadConfig, imp: AppsImport, replace: boolean) {
  draft.environments.push(...imp.newEnvs);
  draft.groups.push(...imp.newGroups);
  if (replace) {
    draft.apps = imp.apps;
    return;
  }
  for (const app of imp.apps) {
    const existing = draft.apps.find(a => a.name.toLowerCase() === app.name.toLowerCase());
    if (!existing) {
      draft.apps.push(app);
      continue;
    }
    if (app.description) existing.description = app.description;
    if (app.badge) existing.badge = app.badge;
    if (app.group) existing.group = app.group;
    for (const env of app.envs) {
      const same = existing.envs.find(e => e.env === env.env);
      if (same) same.url = env.url; else existing.envs.push(env);
    }
    for (const link of app.links) {
      const same = existing.links.find(l => l.label.toLowerCase() === link.label.toLowerCase());
      if (same) same.url = link.url; else existing.links.push(link);
    }
  }
}

export function appsToCsv(config: LaunchpadConfig) {
  const linkLabels = [...new Set(config.apps.flatMap(a => a.links.map(l => l.label)))];
  const groupName = (id?: string) => config.groups.find(g => g.id === id)?.name ?? '';
  const rows = [
    ['name', 'description', 'group', 'badge', ...config.environments.map(e => e.label), ...linkLabels.map(l => `link:${l}`)],
    ...config.apps.map(a => [
      a.name, a.description ?? '', groupName(a.group), a.badge ?? '',
      ...config.environments.map(e => a.envs.find(x => x.env === e.id)?.url ?? ''),
      ...linkLabels.map(l => a.links.find(x => x.label === l)?.url ?? ''),
    ]),
  ];
  return toCsv(rows);
}

export function csvTemplate(config: LaunchpadConfig) {
  const envs = config.environments;
  return toCsv([
    ['name', 'description', 'group', ...envs.map(e => e.label), 'link:Docs'],
    ['Example app', 'What it does', 'Team A', ...envs.map(e => `https://${e.id}.example.com`), 'https://docs.example.com'],
  ]);
}
