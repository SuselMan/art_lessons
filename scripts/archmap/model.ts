/**
 * The hand-written half of the architecture map.
 *
 * `docs/architecture/map.yaml` says what each module is *for*; the import graph says what it
 * actually touches. This file loads the former, walks the tree, and hands both halves to the
 * generator — and, crucially, reports every source file that no module claims. That report is
 * what keeps the map honest: an unclaimed file is a failed `npm run map:check`.
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

export interface LayerDef {
  id: string;
  title: string;
  group: string;
  note?: string;
}

export interface GroupDef {
  id: string;
  title: string;
  note?: string;
}

export interface ModuleDef {
  id: string;
  title: string;
  layer: string;
  /** One or two sentences: what this module is responsible for. The point of the whole map. */
  owns: string;
  /** Globs, repo-relative, POSIX separators. Every source file must be claimed by exactly one. */
  files: string[];
  /** ADR filenames without extension, e.g. "003-liner-tool". */
  adr?: string[];
  /** GitHub issue numbers this module's open questions live in. */
  issues?: number[];
  /** Free-form notes: known debt, gotchas, "read this first" pointers. */
  notes?: string[];
  tags?: string[];
}

export interface FlowStep {
  id: string;
  title: string;
  detail: string;
  /** Module id this step happens in — clicking the step jumps to it on the structure map. */
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

export interface ArchMap {
  groups: GroupDef[];
  layers: LayerDef[];
  modules: ModuleDef[];
  flows: FlowDef[];
}

export interface FileFacts {
  path: string;
  loc: number;
  isTest: boolean;
  isStyle: boolean;
}

export interface Assignment {
  byModule: Map<string, FileFacts[]>;
  /** Files no glob claimed — the map has drifted behind the code. */
  unclaimed: string[];
  /** Files claimed by more than one module — the map contradicts itself. */
  contested: { path: string; modules: string[] }[];
  /** Globs that match nothing — the code moved out from under the map. */
  emptyGlobs: { module: string; glob: string }[];
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

function walk(dir: string, acc: string[]): void {
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
    if (st.isDirectory()) walk(full, acc);
    else if (CODE_EXT.test(name)) acc.push(relative(REPO_ROOT, full).split(sep).join('/'));
  }
}

export function listSourceFiles(): FileFacts[] {
  const paths: string[] = [];
  for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), paths);
  paths.sort();
  return paths.map((path) => ({
    path,
    loc: readFileSync(join(REPO_ROOT, path), 'utf8').split('\n').length,
    isTest: TEST_FILE.test(path),
    isStyle: path.endsWith('.css'),
  }));
}

export function loadMap(): ArchMap {
  const raw = readFileSync(join(REPO_ROOT, 'docs/architecture/map.yaml'), 'utf8');
  const map = parse(raw) as ArchMap;
  const layerIds = new Set(map.layers.map((l) => l.id));
  const groupIds = new Set(map.groups.map((g) => g.id));
  const seen = new Set<string>();
  for (const l of map.layers) {
    if (!groupIds.has(l.group)) throw new Error(`layer "${l.id}": unknown group "${l.group}"`);
  }
  for (const m of map.modules) {
    if (seen.has(m.id)) throw new Error(`duplicate module id "${m.id}"`);
    seen.add(m.id);
    if (!layerIds.has(m.layer)) throw new Error(`module "${m.id}": unknown layer "${m.layer}"`);
    if (!m.owns?.trim()) throw new Error(`module "${m.id}": empty "owns" — say what it is for`);
  }
  const moduleIds = seen;
  for (const f of map.flows ?? []) {
    for (const s of f.steps) {
      if (s.module && !moduleIds.has(s.module)) {
        throw new Error(`flow "${f.id}" step "${s.id}": unknown module "${s.module}"`);
      }
    }
  }
  return map;
}

export function assign(map: ArchMap, files: FileFacts[]): Assignment {
  const compiled = map.modules.map((m) => ({
    id: m.id,
    globs: m.files.map((g) => ({ glob: g, re: globToRegExp(g) })),
  }));
  const byModule = new Map<string, FileFacts[]>(map.modules.map((m) => [m.id, []]));
  const used = new Set<string>();
  const unclaimed: string[] = [];
  const contested: Assignment['contested'] = [];

  for (const file of files) {
    const owners: string[] = [];
    for (const mod of compiled) {
      for (const g of mod.globs) {
        if (g.re.test(file.path)) {
          used.add(`${mod.id}::${g.glob}`);
          if (!owners.includes(mod.id)) owners.push(mod.id);
        }
      }
    }
    if (owners.length === 0) unclaimed.push(file.path);
    else {
      if (owners.length > 1) contested.push({ path: file.path, modules: owners });
      byModule.get(owners[0])!.push(file);
    }
  }

  const emptyGlobs: Assignment['emptyGlobs'] = [];
  for (const mod of compiled) {
    for (const g of mod.globs) {
      if (!used.has(`${mod.id}::${g.glob}`)) emptyGlobs.push({ module: mod.id, glob: g.glob });
    }
  }
  return { byModule, unclaimed, contested, emptyGlobs };
}
