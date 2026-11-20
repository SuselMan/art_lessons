/**
 * The architecture map's model: which modules exist, which layer each one sits in, which
 * file belongs to which module.
 *
 * (#642) A module is a real folder: any folder under the scanned roots that has a `README.md`
 * with a frontmatter header. The header carries the tags (`layer`, `summary`, `adr`, …), the
 * body says what the module is for. A folder without a README belongs to its nearest ancestor
 * module; a nested folder with its own README is a submodule. So the map shows the project as
 * it is — the module's name on the map is its path, and it can be found by that name.
 *
 * `docs/architecture/map.yaml` keeps only what belongs to no single module: the layers and
 * the rule of who may import whom, the map-only file groups inside the big flat folders,
 * flows and budgets.
 *
 * Errors in the hand-written half are collected, not thrown: `map:check` prints all of them
 * at once, `map` warns and draws what it can.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parse } from 'yaml';

/** npm scripts always run from the workspace root, and every path in the map is relative to it. */
export const REPO_ROOT = process.cwd().split(sep).join('/');

/** Roots we consider "the project". Everything else is tooling noise. */
const SCAN_ROOTS = ['apps', 'packages', 'scripts', 'e2e'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.tmp', 'test-results', 'build']);
const CODE_EXT = /\.(tsx?|mts|cts|m?js|cjs|css|prisma|glsl|frag|vert)$/;
const TEST_FILE = /\.(test|spec)\.(tsx?|mts)$/;
const README = 'README.md';
const MAP_YAML = 'docs/architecture/map.yaml';

/** A large part of the system — the bands over the columns (client, engine, server…). */
export interface PartDef {
  id: string;
  title: string;
  /** Other parts this part's modules may import. Its own part is always allowed. */
  uses?: string[];
  note?: string;
}

export interface LayerDef {
  id: string;
  title: string;
  part: string;
  note?: string;
}

/**
 * (#642) A map-only group of files inside one module — the hand-made split of a big flat
 * folder. It exists on the map and nowhere in the code, and the page says so; when the folder
 * is really split into subfolders, the group's prose moves into the new folder's README.
 */
export interface GroupingDef {
  id: string;
  title: string;
  owns: string;
  /** Globs, repo-relative, POSIX separators, all inside the module's folder. */
  files: string[];
  adr?: string[];
  issues?: number[];
  notes?: string[];
  tags?: string[];
}

export interface ModuleDef {
  /** The folder, repo-relative — also the module's stable id: `apps/web/src/pages/Room`. */
  id: string;
  /** The folder as the map shows it: `pages/Room`. */
  label: string;
  /** Two or three words from the README header, shown in parentheses. */
  summary: string;
  layer: string;
  /** The README's first paragraph: what this module is responsible for. */
  owns: string;
  notes: string[];
  adr: string[];
  issues: number[];
  tags: string[];
  /** Nearest ancestor module, if any. */
  parent?: string;
  children: string[];
  groupings: GroupingDef[];
}

export interface FlowStep {
  id: string;
  title: string;
  detail: string;
  /** Module or group this step happens in — clicking the step jumps to it on the structure map. */
  module?: string;
  next?: string[];
  /** "client" | "wire" | "server" — colours the step. */
  side?: string;
}

export interface FlowDef {
  id: string;
  title: string;
  intro?: string;
  steps: FlowStep[];
}

/** (#493) A ceiling on one file's length — a ratchet, not an aspiration.
 *  `map:check` fails when the file outgrows it; when code is moved out, the
 *  ceiling is lowered to match in the same change, and it never goes back up
 *  without someone writing down why. */
export interface BudgetDef {
  file: string;
  maxLines: number;
  why: string;
}

export interface ArchMap {
  parts: PartDef[];
  layers: LayerDef[];
  modules: ModuleDef[];
  flows: FlowDef[];
  budgets?: BudgetDef[];
  /** Everything wrong with the hand-written half: bad README headers, unknown refs. */
  errors: string[];
}

export interface FileFacts {
  path: string;
  loc: number;
  isTest: boolean;
  isStyle: boolean;
}

export interface Assignment {
  byModule: Map<string, FileFacts[]>;
  /** path → grouping id, for files a module's map-only group claims. */
  grouping: Map<string, string>;
  /** Files outside every module folder — the map has not caught up with the code. */
  unclaimed: string[];
  /** Files claimed by more than one group of their module — the map contradicts itself. */
  contested: { path: string; groups: string[] }[];
  /** Group globs that match nothing — the code moved out from under the map. */
  emptyGlobs: { group: string; glob: string }[];
  /** Files in a grouped module that no group claims. Not an error: the folder is the module. */
  ungrouped: string[];
}

/** Minimal glob → RegExp. Supports `**`, `*`, `?` and `{a,b}` — enough for path patterns. */
export function globToRegExp(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**/` swallows any number of directories, including none.
        if (glob[i + 2] === '/') {
          out += '(?:[^/]+/)*';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') out += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      const alts = glob.slice(i + 1, end).split(',');
      out += `(?:${alts.map((a) => a.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|')})`;
      i = end;
    } else if ('.+^$()|[]\\'.includes(c)) out += `\\${c}`;
    else out += c;
  }
  return new RegExp(`^${out}$`);
}

function walk(dir: string, code: string[], readmes: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    const rel = relative(REPO_ROOT, full).split(sep).join('/');
    if (st.isDirectory()) walk(full, code, readmes);
    else if (name === README) readmes.push(rel);
    else if (CODE_EXT.test(name)) code.push(rel);
  }
}

function scan(): { code: string[]; readmes: string[] } {
  const code: string[] = [];
  const readmes: string[] = [];
  for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), code, readmes);
  code.sort();
  readmes.sort();
  return { code, readmes };
}

export function listSourceFiles(): FileFacts[] {
  return scan().code.map((path) => ({
    path,
    loc: readFileSync(join(REPO_ROOT, path), 'utf8').split('\n').length,
    isTest: TEST_FILE.test(path),
    isStyle: path.endsWith('.css'),
  }));
}

/** `apps/web/src/pages/Room` → `pages/Room`; `apps/server/src` → `server/src`. */
export function labelOf(dir: string): string {
  if (dir.startsWith('apps/web/src/')) return dir.slice('apps/web/src/'.length);
  return dir.replace(/^(apps|packages)\//, '');
}

/* ------------------------------------------------------------------ README headers */

const HEADER_KEYS = new Set(['layer', 'summary', 'adr', 'issues', 'tags']);
/** "Two or three words" — long enough for «сокет и outbox», short enough for a card. */
export const SUMMARY_MAX = 32;

interface Readme {
  header: Record<string, unknown>;
  owns: string;
  notes: string[];
}

/** The heading whose list becomes the module's notes on the map. */
const NOTES_HEADING = /^##\s+Заметки\s*$/;

/**
 * Header between `---` lines, then markdown. Two things are read from the body, the rest is
 * free-form documentation the map ignores:
 *   - the first paragraph that is not a heading — what the module is for;
 *   - the top-level items of the list under `## Заметки` — the module's notes.
 */
export function parseReadme(raw: string): Readme | string {
  const text = raw.replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return 'нет шапки: README модуля начинается с `---`, `layer: …`, `summary: …`, `---`';
  let header: unknown;
  try {
    header = parse(m[1]);
  } catch (err) {
    return `шапка не читается как YAML: ${(err as Error).message.split('\n')[0]}`;
  }
  if (!header || typeof header !== 'object' || Array.isArray(header)) return 'шапка пуста';

  const lines = m[2].split('\n');
  let owns = '';
  const para: string[] = [];
  let i = 0;
  for (; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) {
      if (para.length) break;
      continue;
    }
    if (/^#{1,6}\s/.test(l)) {
      if (para.length) break;
      continue;
    }
    para.push(l);
  }
  owns = para.join(' ');

  const notes: string[] = [];
  const start = lines.findIndex((l) => NOTES_HEADING.test(l.trim()));
  if (start >= 0) {
    let cur: string[] | null = null;
    for (const l of lines.slice(start + 1)) {
      if (/^#{1,6}\s/.test(l.trim())) break;
      if (/^[-*]\s/.test(l)) {
        if (cur) notes.push(cur.join(' '));
        cur = [l.replace(/^[-*]\s+/, '').trim()];
      } else if (cur && l.trim()) cur.push(l.trim());
    }
    if (cur) notes.push(cur.join(' '));
  }
  return { header: header as Record<string, unknown>, owns, notes };
}

function isStrings(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/* ------------------------------------------------------------------ loading */

interface MapYaml {
  parts: PartDef[];
  layers: LayerDef[];
  groupings?: Record<string, GroupingDef[]>;
  flows?: FlowDef[];
  budgets?: BudgetDef[];
}

export function loadMap(): ArchMap {
  const doc = parse(readFileSync(join(REPO_ROOT, MAP_YAML), 'utf8')) as MapYaml;
  const errors: string[] = [];
  const partIds = new Set(doc.parts.map((p) => p.id));
  const layerIds = new Set(doc.layers.map((l) => l.id));
  for (const p of doc.parts) {
    for (const u of p.uses ?? []) {
      if (!partIds.has(u)) errors.push(`map.yaml: часть ${p.id} ссылается на неизвестную часть ${u}`);
    }
  }
  for (const l of doc.layers) {
    if (!partIds.has(l.part)) errors.push(`map.yaml: слой ${l.id} — неизвестная часть ${l.part}`);
  }

  const modules: ModuleDef[] = [];
  for (const path of scan().readmes) {
    const dir = path.slice(0, -(README.length + 1));
    const r = parseReadme(readFileSync(join(REPO_ROOT, path), 'utf8'));
    if (typeof r === 'string') {
      errors.push(`${path}: ${r}`);
      continue;
    }
    const h = r.header;
    for (const k of Object.keys(h)) {
      if (!HEADER_KEYS.has(k)) errors.push(`${path}: неизвестное поле шапки «${k}» (можно: ${[...HEADER_KEYS].join(', ')})`);
    }
    const layer = typeof h.layer === 'string' ? h.layer : '';
    if (!layer) errors.push(`${path}: в шапке нет layer`);
    else if (!layerIds.has(layer)) {
      errors.push(`${path}: неизвестный слой «${layer}» (слои объявлены в ${MAP_YAML}: ${[...layerIds].join(', ')})`);
    }
    const summary = typeof h.summary === 'string' ? h.summary.trim() : '';
    if (!summary) errors.push(`${path}: в шапке нет summary — два-три слова о том, что это`);
    else if (summary.length > SUMMARY_MAX) {
      errors.push(`${path}: summary длиннее ${SUMMARY_MAX} символов — это подпись на карточке, а не описание`);
    }
    if (h.adr !== undefined && !isStrings(h.adr)) errors.push(`${path}: adr — список имён файлов docs/adr без .md`);
    if (h.tags !== undefined && !isStrings(h.tags)) errors.push(`${path}: tags — список строк`);
    const issues = h.issues;
    if (issues !== undefined && !(Array.isArray(issues) && issues.every((n) => Number.isInteger(n)))) {
      errors.push(`${path}: issues — список номеров`);
    }
    if (!r.owns) errors.push(`${path}: после шапки нет абзаца «за что отвечает»`);
    modules.push({
      id: dir,
      label: labelOf(dir),
      summary,
      layer: layerIds.has(layer) ? layer : doc.layers[0].id,
      owns: r.owns,
      notes: r.notes,
      adr: isStrings(h.adr) ? h.adr : [],
      issues: Array.isArray(issues) ? (issues as number[]) : [],
      tags: isStrings(h.tags) ? h.tags : [],
      children: [],
      groupings: [],
    });
  }

  // Hierarchy: the nearest ancestor folder that is itself a module.
  const byId = new Map(modules.map((m) => [m.id, m]));
  for (const m of modules) {
    for (let d = m.id; d.includes('/'); ) {
      d = d.slice(0, d.lastIndexOf('/'));
      const p = byId.get(d);
      if (p) {
        m.parent = p.id;
        p.children.push(m.id);
        break;
      }
    }
  }

  // Map-only groups, keyed by the module folder they split.
  const ids = new Set<string>(modules.map((m) => m.id));
  for (const [moduleId, groups] of Object.entries(doc.groupings ?? {})) {
    const m = byId.get(moduleId);
    if (!m) {
      errors.push(`map.yaml groupings: нет модуля ${moduleId} (нет папки с README.md)`);
      continue;
    }
    for (const g of groups) {
      if (ids.has(g.id)) errors.push(`map.yaml groupings: id ${g.id} уже занят`);
      ids.add(g.id);
      if (g.id.includes('/')) errors.push(`map.yaml groupings: id группы ${g.id} не должен содержать «/» — так пишутся модули`);
      if (!g.owns?.trim()) errors.push(`map.yaml groupings ${g.id}: пустой owns`);
      for (const glob of g.files ?? []) {
        if (!glob.startsWith(`${moduleId}/`)) errors.push(`map.yaml groupings ${g.id}: ${glob} лежит вне папки ${moduleId}`);
      }
      m.groupings.push({ ...g, owns: (g.owns ?? '').trim(), files: g.files ?? [] });
    }
  }

  const flows = doc.flows ?? [];
  for (const f of flows) {
    for (const s of f.steps) {
      if (s.module && !ids.has(s.module)) errors.push(`поток ${f.id}, шаг ${s.id}: нет модуля или группы ${s.module}`);
    }
  }

  modules.sort((a, b) => a.id.localeCompare(b.id));
  return { parts: doc.parts, layers: doc.layers, modules, flows, budgets: doc.budgets, errors };
}

/** Every id a flow, runtime node or understanding topic may point at: modules and groups. */
export function refIds(map: ArchMap): Set<string> {
  const ids = new Set<string>();
  for (const m of map.modules) {
    ids.add(m.id);
    for (const g of m.groupings) ids.add(g.id);
  }
  return ids;
}

/** The module owning a path: the deepest module folder that contains it. */
export function owningModule(map: ArchMap, path: string): ModuleDef | undefined {
  let best: ModuleDef | undefined;
  for (const m of map.modules) {
    if (path.startsWith(`${m.id}/`) && (!best || m.id.length > best.id.length)) best = m;
  }
  return best;
}

export function assign(map: ArchMap, files: FileFacts[]): Assignment {
  const byModule = new Map<string, FileFacts[]>(map.modules.map((m) => [m.id, []]));
  const grouping = new Map<string, string>();
  const unclaimed: string[] = [];
  const contested: Assignment['contested'] = [];
  const ungrouped: string[] = [];
  const used = new Set<string>();
  const compiled = new Map(
    map.modules.map((m) => [
      m.id,
      m.groupings.map((g) => ({ id: g.id, globs: g.files.map((glob) => ({ glob, re: globToRegExp(glob) })) })),
    ]),
  );

  const matchGroups = (moduleId: string, path: string): string[] => {
    const hits: string[] = [];
    for (const g of compiled.get(moduleId) ?? []) {
      for (const x of g.globs) {
        if (x.re.test(path)) {
          used.add(`${g.id}::${x.glob}`);
          if (!hits.includes(g.id)) hits.push(g.id);
        }
      }
    }
    return hits;
  };

  for (const file of files) {
    const m = owningModule(map, file.path);
    if (!m) {
      unclaimed.push(file.path);
      continue;
    }
    byModule.get(m.id)!.push(file);
    if (!m.groupings.length) continue;
    let hits = matchGroups(m.id, file.path);
    // A test goes where its subject went: a group lists `outbox.ts` and gets `outbox.test.ts`
    // with it, so no group needs a catch-all glob for tests.
    if (!hits.length && file.isTest) {
      const subject = file.path.replace(TEST_FILE, '.ts');
      hits = matchGroups(m.id, subject);
      if (!hits.length) hits = matchGroups(m.id, `${subject}x`);
    }
    if (!hits.length) ungrouped.push(file.path);
    else {
      if (hits.length > 1) contested.push({ path: file.path, groups: hits });
      grouping.set(file.path, hits[0]);
    }
  }

  const emptyGlobs: Assignment['emptyGlobs'] = [];
  for (const groups of compiled.values()) {
    for (const g of groups) {
      for (const x of g.globs) if (!used.has(`${g.id}::${x.glob}`)) emptyGlobs.push({ group: g.id, glob: x.glob });
    }
  }
  return { byModule, grouping, unclaimed, contested, emptyGlobs, ungrouped };
}

/* ------------------------------------------------------------------ layer rules (#642) */

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A regex matching exactly the files a module owns: its folder minus its submodules' folders. */
export function moduleRegex(m: ModuleDef): string {
  const kids = m.children.map((c) => `${escapeRe(c.slice(m.id.length + 1))}/`);
  return `^${escapeRe(m.id)}/${kids.length ? `(?!${kids.join('|')})` : ''}`;
}

/** May a module in layer `from` import a module in layer `to`? The one rule the map enforces. */
export function layerAllows(map: ArchMap, from: string, to: string): boolean {
  const rank = new Map(map.layers.map((l, i) => [l.id, i]));
  const lf = map.layers.find((l) => l.id === from);
  const lt = map.layers.find((l) => l.id === to);
  if (!lf || !lt) return true;
  if (rank.get(to)! < rank.get(from)!) return false;
  if (lf.part === lt.part) return true;
  const part = map.parts.find((p) => p.id === lf.part);
  return (part?.uses ?? []).includes(lt.part);
}

export interface CruiserRule {
  name: string;
  comment: string;
  severity: 'error';
  from: { path: string };
  to: { path: string };
}

/**
 * One dependency-cruiser rule per layer: its modules may not import modules of a layer to
 * their left, nor of a part their own part does not `use`. Generated from map.yaml and the
 * README headers on every run, so moving a module to another layer is one line.
 */
export function layerRules(map: ArchMap): CruiserRule[] {
  const rules: CruiserRule[] = [];
  for (const layer of map.layers) {
    const own = map.modules.filter((m) => m.layer === layer.id);
    if (!own.length) continue;
    const banned = map.modules.filter((m) => !layerAllows(map, layer.id, m.layer));
    if (!banned.length) continue;
    const allowed = map.layers.filter((l) => layerAllows(map, layer.id, l.id)).map((l) => l.id);
    rules.push({
      name: `layer-${layer.id}`,
      comment:
        `Layer "${layer.id}" may import only layers: ${allowed.join(', ')}. ` +
        'Layer order and parts: docs/architecture/map.yaml; a module\'s layer: its README.md header.',
      severity: 'error',
      from: { path: own.map(moduleRegex).join('|') },
      // Code only: a component importing an svg from src/assets is not a layer crossing.
      to: { path: `(?:${banned.map(moduleRegex).join('|')}).*\\.[cm]?[jt]sx?$` },
    });
  }
  return rules;
}
