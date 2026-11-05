// src/lib/csv.ts
// Cards in and out of CSV — handy for bulk edits in a spreadsheet. Two layouts, told apart
// by their columns (header names aren't case-sensitive):
//
// One row per link — suits categories of projects or bookmarks:
//   category (or card), url   required
//   name, tag                  the tile's name and its short tag
//   column                     optional: puts the tile in one of the page's columns (e.g. "DEV")
//   description, group         for the card, taken from its first row that has them
//
// One row per card — suits a launch page, with a tile per column:
//   name              required
//   description, group, badge
//   link:<Label>      a link button, e.g. "link:Docs"
//   anything else     a page column, by its label (e.g. "DEV"); unknown ones are added
import type { CardConfig, ColumnDef, GroupDef, LaunchpadConfig, LinkItem, TileConfig } from '../config';
import { NEW_COLUMN_COLORS, isHttpUrl, slug } from '../config';

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

export type CardsImport = {
  layout: 'cards' | 'links';
  cards: CardConfig[];
  tileCount: number;
  newColumns: ColumnDef[];
  newGroups: GroupDef[];
  columnLabels: string[];
  linkLabels: string[];
  warnings: string[];
};

/** Columns and groups that an import refers to, creating any it doesn't know yet. */
function lookups(current: LaunchpadConfig) {
  const columnIds = new Set(current.columns.map(e => e.id));
  const usedColors = new Set(current.columns.map(e => e.color));
  const newColumns: ColumnDef[] = [];
  const columnFor = (name: string) => {
    const known = [...current.columns, ...newColumns]
      .find(e => e.label.toLowerCase() === name.toLowerCase() || e.id === name.toLowerCase());
    if (known) return known;
    const color = NEW_COLUMN_COLORS.find(c => !usedColors.has(c)) ?? '#888888';
    usedColors.add(color);
    const column: ColumnDef = { id: uniqueId(slug(name, 'column'), columnIds), label: name.toUpperCase().slice(0, 12), color };
    newColumns.push(column);
    return column;
  };

  const groupIds = new Set(current.groups.map(g => g.id));
  const newGroups: GroupDef[] = [];
  const groupFor = (name: string) => {
    if (!name) return undefined;
    const known = [...current.groups, ...newGroups].find(g => g.name.toLowerCase() === name.toLowerCase());
    if (known) return known.id;
    const group = { id: uniqueId(slug(name, 'group'), groupIds), name };
    newGroups.push(group);
    return group.id;
  };

  return { columnFor, groupFor, newColumns, newGroups, cardIds: new Set(current.cards.map(c => c.id)) };
}

export function readCardsCsv(text: string, current: LaunchpadConfig): CardsImport {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('add a header row and at least one row of data');
  const header = rows[0].map(h => h.toLowerCase());
  const col = (...names: string[]) => header.findIndex(h => names.includes(h));
  const cardCol = col('category', 'card');
  const urlCol = col('url');
  return cardCol >= 0 && urlCol >= 0
    ? readLinkRows(rows, current, cardCol, urlCol, col)
    : readCardRows(rows, current, col);
}

function readCardRows(rows: string[][], current: LaunchpadConfig, col: (...n: string[]) => number): CardsImport {
  const nameCol = col('name');
  if (nameCol < 0) throw new Error('there\'s no "name" column (or, for one row per link, "category" and "url")');
  const descCol = col('description'), groupCol = col('group'), badgeCol = col('badge');
  const reserved = new Set([nameCol, descCol, groupCol, badgeCol]);
  const { columnFor, groupFor, newColumns, newGroups, cardIds } = lookups(current);

  const pageCols: { col: number; column: ColumnDef }[] = [];
  const linkCols: { col: number; label: string }[] = [];
  rows[0].forEach((h, i) => {
    if (reserved.has(i) || !h) return;
    if (/^link:/i.test(h)) linkCols.push({ col: i, label: h.slice(5).trim() || 'Link' });
    else pageCols.push({ col: i, column: columnFor(h) });
  });

  let badUrls = 0, unnamed = 0, tileCount = 0;
  const cards = rows.slice(1).flatMap((r): CardConfig[] => {
    const name = r[nameCol] ?? '';
    if (!name) { unnamed++; return []; }
    const card = { id: uniqueId(slug(name, 'card'), cardIds), name } as CardConfig;
    if (r[descCol]) card.description = r[descCol];
    if (r[badgeCol]) card.badge = r[badgeCol].slice(0, 4);
    const group = groupFor(r[groupCol] ?? '');
    if (group) card.group = group;
    card.links = linkCols.flatMap(({ col: c, label }): LinkItem[] => (r[c] ? [{ label, url: r[c] }] : []));
    card.tiles = pageCols.flatMap(({ col: c, column }): TileConfig[] => {
      const url = r[c];
      if (!url) return [];
      if (!isHttpUrl(url)) { badUrls++; return []; }
      return [{ column: column.id, url }];
    });
    tileCount += card.tiles.length;
    return [card];
  });

  return {
    layout: 'cards', cards, tileCount, newColumns, newGroups,
    warnings: warningsFor(unnamed, badUrls),
    columnLabels: pageCols.map(c => c.column.label),
    linkLabels: linkCols.map(c => c.label),
  };
}

function readLinkRows(rows: string[][], current: LaunchpadConfig, cardCol: number, urlCol: number, col: (...n: string[]) => number): CardsImport {
  const nameCol = col('name'), tagCol = col('tag', 'label'), columnCol = col('column', 'env', 'environment');
  const descCol = col('description'), groupCol = col('group');
  const { columnFor, groupFor, newColumns, newGroups, cardIds } = lookups(current);

  const byName = new Map<string, CardConfig>();
  const columnLabels = new Set<string>();
  let badUrls = 0, unnamed = 0, tileCount = 0;
  for (const r of rows.slice(1)) {
    const cardName = r[cardCol] ?? '';
    if (!cardName) { unnamed++; continue; }
    let card = byName.get(cardName.toLowerCase());
    if (!card) {
      card = { id: uniqueId(slug(cardName, 'card'), cardIds), name: cardName, links: [], tiles: [] };
      byName.set(cardName.toLowerCase(), card);
    }
    if (r[descCol] && !card.description) card.description = r[descCol];
    const group = groupFor(r[groupCol] ?? '');
    if (group && !card.group) card.group = group;

    const url = r[urlCol] ?? '';
    if (!url) continue;
    if (!isHttpUrl(url)) { badUrls++; continue; }
    const tile: TileConfig = { url };
    if (r[nameCol]) tile.name = r[nameCol];
    if (r[columnCol]) {
      const column = columnFor(r[columnCol]);
      tile.column = column.id;
      columnLabels.add(column.label);
    } else if (r[tagCol]) {
      tile.label = r[tagCol];
    }
    card.tiles.push(tile);
    tileCount++;
  }

  return {
    layout: 'links', cards: [...byName.values()], tileCount, newColumns, newGroups,
    warnings: warningsFor(unnamed, badUrls),
    columnLabels: [...columnLabels], linkLabels: [],
  };
}

function warningsFor(unnamed: number, badUrls: number) {
  const warnings: string[] = [];
  if (unnamed) warnings.push(`${unnamed} row${unnamed === 1 ? ' has' : 's have'} no name and will be skipped.`);
  if (badUrls) warnings.push(`${badUrls} address${badUrls === 1 ? ' isn\'t' : 'es aren\'t'} a full https:// link and will be left out.`);
  return warnings;
}

/** Merge an import into a draft config: matching card names are updated, the rest added (or everything replaced). */
export function applyCardsImport(draft: LaunchpadConfig, imp: CardsImport, replace: boolean) {
  draft.columns.push(...imp.newColumns);
  draft.groups.push(...imp.newGroups);
  if (replace) {
    draft.cards = imp.cards;
  } else {
    const lower = (s?: string) => (s ?? '').toLowerCase();
    for (const card of imp.cards) {
      const existing = draft.cards.find(c => lower(c.name) === lower(card.name));
      if (!existing) {
        draft.cards.push(card);
        continue;
      }
      if (card.description) existing.description = card.description;
      if (card.badge) existing.badge = card.badge;
      if (card.group) existing.group = card.group;
      for (const tile of card.tiles) {
        // the same column, or another tile with the same name or address, is updated in place
        const same = tile.column
          ? existing.tiles.find(t => t.column === tile.column)
          : existing.tiles.find(t => !t.column && ((tile.name && lower(t.name) === lower(tile.name)) || t.url === tile.url));
        if (same) Object.assign(same, tile); else existing.tiles.push(tile);
      }
      for (const link of card.links) {
        const same = existing.links.find(l => lower(l.label) === lower(link.label));
        if (same) same.url = link.url; else existing.links.push(link);
      }
    }
  }
  // a page made of column tiles alone is a launch page — line them up
  const tiles = draft.cards.flatMap(c => c.tiles);
  if (tiles.length && tiles.every(t => t.column)) draft.useColumns = true;
}

/** Export: one row per card when every tile sits in a column, otherwise one row per link. */
export function cardsToCsv(config: LaunchpadConfig) {
  const groupName = (id?: string) => config.groups.find(g => g.id === id)?.name ?? '';
  const columnLabel = (id?: string) => config.columns.find(e => e.id === id)?.label ?? '';
  const ownTiles = config.cards.some(c => c.tiles.some(t => !t.column));

  if (!ownTiles) {
    const linkLabels = [...new Set(config.cards.flatMap(c => c.links.map(l => l.label)))];
    return toCsv([
      ['name', 'description', 'group', 'badge', ...config.columns.map(e => e.label), ...linkLabels.map(l => `link:${l}`)],
      ...config.cards.map(c => [
        c.name, c.description ?? '', groupName(c.group), c.badge ?? '',
        ...config.columns.map(e => c.tiles.find(t => t.column === e.id)?.url ?? ''),
        ...linkLabels.map(l => c.links.find(x => x.label === l)?.url ?? ''),
      ]),
    ]);
  }

  // a card without tiles still gets a row (with no address), so it survives the round trip
  return toCsv([
    ['category', 'description', 'group', 'name', 'url', 'tag', 'column'],
    ...config.cards.flatMap(c => (c.tiles.length ? c.tiles : [undefined]).map((t, i) => [
      c.name, i ? '' : c.description ?? '', i ? '' : groupName(c.group),
      t?.name ?? '', t?.url ?? '', t?.column ? '' : t?.label ?? '', columnLabel(t?.column),
    ])),
  ]);
}

export function csvTemplate(config: LaunchpadConfig) {
  const columns = config.useColumns ? config.columns : [];
  if (columns.length) {
    return toCsv([
      ['name', 'description', 'group', ...columns.map(e => e.label), 'link:Docs'],
      ['Example app', 'What it does', 'Team A', ...columns.map(e => `https://${e.id}.example.com`), 'https://docs.example.com'],
    ]);
  }
  return toCsv([
    ['category', 'name', 'url', 'tag', 'description'],
    ['Side projects', 'Recipe box', 'https://recipes.example.com', 'WEB', 'Things I tinker with'],
    ['Side projects', 'Pixel editor', 'https://pixels.example.com', 'APP', ''],
    ['Reading', 'A good blog', 'https://blog.example.com', '', 'Bookmarks'],
  ]);
}
