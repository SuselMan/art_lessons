/**
 * (#624) The runtime cut of the map: processes and stores, and what they send each other.
 *
 * `docs/architecture/runtime.yaml` is hand-written — nothing in the import graph says that the
 * client and the server talk at all, since neither imports the other. So, like the rest of the
 * hand-written half, it is only worth drawing if something fails when it drifts from the code.
 * `checkRuntime` is that something:
 *
 *   - every socket event in ServerToClientEvents / ClientToServerEvents is on the map, and
 *     nothing on the map claims an event the protocol does not have;
 *   - the same for REST routes, against what the server actually registers;
 *   - every type named on an arrow exists — in @grafetto/shared, the Prisma schema, or the
 *     files the message points at with `decl`.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

import { REPO_ROOT } from './model';

export type Contract = 'bound' | 'named' | 'one-side' | 'opaque';
const CONTRACTS: readonly Contract[] = ['bound', 'named', 'one-side', 'opaque'];

export interface RuntimeZone {
  id: string;
  title: string;
  /** Zones sharing a column stack vertically. */
  col?: number;
  note?: string;
}

export interface RuntimeNode {
  id: string;
  title: string;
  zone: string;
  /** [column, row] inside the node's zone. */
  at: [number, number];
  kind: 'process' | 'store' | 'external';
  owns: string;
  /** Module ids from the structure cut this node is built from. */
  modules?: string[];
}

export interface RuntimeMessage {
  /** `→` travels from the link's `from` to its `to`, `←` the other way. */
  dir: '→' | '←';
  name: string;
  /** What travels. Every Capitalised identifier in it must be a declared type. */
  type: string;
  /** Files declaring the types in `type` that are not in @grafetto/shared. */
  decl?: string[];
  note?: string;
  /** What, if anything, checks the payload's shape on arrival. */
  runtime?: string;
}

export interface RuntimeLink {
  id: string;
  from: string;
  to: string;
  channel: string;
  contract: Contract;
  /** The few words drawn on the arrow itself. */
  summary: string;
  note?: string;
  /** Hand-tuned curve offset in px, to route the line around other nodes. */
  bend?: number;
  /** `socket` / `rest` — reconcile this link's messages against the code. */
  checks?: 'socket' | 'rest';
  messages: RuntimeMessage[];
}

export interface RuntimeMap {
  zones: RuntimeZone[];
  nodes: RuntimeNode[];
  links: RuntimeLink[];
}

const RUNTIME_YAML = join(REPO_ROOT, 'docs/architecture/runtime.yaml');

export function loadRuntime(moduleIds: Set<string>): RuntimeMap | undefined {
  if (!existsSync(RUNTIME_YAML)) return undefined;
  const rt = parse(readFileSync(RUNTIME_YAML, 'utf8')) as RuntimeMap;

  const zoneIds = new Set(rt.zones.map((z) => z.id));
  const nodeIds = new Set<string>();
  const cells = new Set<string>();
  for (const n of rt.nodes) {
    if (nodeIds.has(n.id)) throw new Error(`runtime: duplicate node "${n.id}"`);
    nodeIds.add(n.id);
    if (!zoneIds.has(n.zone)) throw new Error(`runtime node "${n.id}": unknown zone "${n.zone}"`);
    const cell = `${n.zone}:${n.at.join(',')}`;
    if (cells.has(cell)) throw new Error(`runtime node "${n.id}": cell ${cell} is taken`);
    cells.add(cell);
    for (const m of n.modules ?? []) {
      if (!moduleIds.has(m)) throw new Error(`runtime node "${n.id}": unknown module "${m}"`);
    }
  }
  const linkIds = new Set<string>();
  for (const l of rt.links) {
    if (linkIds.has(l.id)) throw new Error(`runtime: duplicate link "${l.id}"`);
    linkIds.add(l.id);
    for (const end of [l.from, l.to]) {
      if (!nodeIds.has(end)) throw new Error(`runtime link "${l.id}": unknown node "${end}"`);
    }
    if (!CONTRACTS.includes(l.contract)) {
      throw new Error(`runtime link "${l.id}": contract must be one of ${CONTRACTS.join(', ')}`);
    }
    for (const m of l.messages) {
      if (m.dir !== '→' && m.dir !== '←') throw new Error(`runtime link "${l.id}" / ${m.name}: dir must be → or ←`);
    }
  }
  return rt;
}

/* ------------------------------------------------------------------ reconciliation with code */

function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const entry of readdirSync(join(REPO_ROOT, rel), { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== 'scripts' && entry.name !== 'node_modules') walk(child);
      } else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) out.push(child);
    }
  };
  walk(dir);
  return out;
}

/** Keys of `export type <name> = { … }` — the socket protocol's event tables. */
function eventTable(src: string, name: string): Set<string> {
  const start = src.indexOf(`export type ${name} = {`);
  if (start < 0) throw new Error(`runtime: ${name} not found in packages/shared/src/protocol.ts`);
  const events = new Set<string>();
  for (const line of src.slice(start).split('\n').slice(1)) {
    if (/^\}/.test(line)) break;
    const m = line.match(/^ {2}([a-z_]+):/);
    if (m) events.add(m[1]);
  }
  return events;
}

/** `METHOD /path` for every route the server registers; template tails normalised to `*`. */
function serverRoutes(): Set<string> {
  const routes = new Set<string>();
  const re = /\.(get|post|put|patch|delete)\s*(?:<[\s\S]*?>)?\s*\(\s*['"`](\/[^'"`]*)['"`]/g;
  for (const file of sourceFiles('apps/server/src')) {
    for (const m of read(file).matchAll(re)) routes.add(`${m[1].toUpperCase()} ${normaliseRoute(m[2])}`);
  }
  return routes;
}

function normaliseRoute(path: string): string {
  return path.replace(/\$\{[^}]*\}|…/g, '*');
}

/** Every name a message may cite: shared exports, Prisma models, and declarations in `decl`. */
function knownTypes(): Set<string> {
  const known = new Set(['Uint8Array', 'Float32Array', 'WebGLTexture']);
  const exported = /export\s+(?:declare\s+)?(?:type|interface|class|enum|const|function)\s+(\w+)/g;
  for (const file of sourceFiles('packages/shared/src')) {
    for (const m of read(file).matchAll(exported)) known.add(m[1]);
  }
  for (const m of read('apps/server/prisma/schema.prisma').matchAll(/^model (\w+)/gm)) known.add(m[1]);
  return known;
}

function declaredIn(files: string[]): Set<string> {
  const names = new Set<string>();
  for (const f of files) {
    if (!existsSync(join(REPO_ROOT, f))) continue;
    for (const m of read(f).matchAll(/(?:type|interface|class|enum)\s+(\w+)/g)) names.add(m[1]);
  }
  return names;
}

function diff(label: string, onMap: Set<string>, inCode: Set<string>, problems: string[]): void {
  const missing = [...inCode].filter((x) => !onMap.has(x)).sort();
  const stale = [...onMap].filter((x) => !inCode.has(x)).sort();
  if (missing.length) {
    problems.push(`${label}: есть в коде, нет на карте — ${missing.join(', ')}`);
  }
  if (stale.length) {
    problems.push(`${label}: есть на карте, нет в коде — ${stale.join(', ')}`);
  }
}

export function checkRuntime(rt: RuntimeMap): string[] {
  const problems: string[] = [];

  const protocol = read('packages/shared/src/protocol.ts');
  const socket = rt.links.filter((l) => l.checks === 'socket');
  const names = (dir: '→' | '←', links: RuntimeLink[]): Set<string> =>
    new Set(links.flatMap((l) => l.messages.filter((m) => m.dir === dir).map((m) => m.name)));
  diff('события клиент → сервер', names('→', socket), eventTable(protocol, 'ClientToServerEvents'), problems);
  diff('события сервер → клиент', names('←', socket), eventTable(protocol, 'ServerToClientEvents'), problems);

  const rest = new Set(
    rt.links
      .filter((l) => l.checks === 'rest')
      .flatMap((l) => l.messages)
      .map((m) => m.name.match(/^(GET|POST|PUT|PATCH|DELETE) (\/\S*)$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => `${m[1]} ${normaliseRoute(m[2])}`),
  );
  diff('REST-ручки', rest, serverRoutes(), problems);

  const known = knownTypes();
  for (const l of rt.links) {
    for (const m of l.messages) {
      const local = declaredIn(m.decl ?? []);
      for (const [name] of m.type.matchAll(/\b[A-Z][a-z]+[A-Za-z0-9]*\b/g)) {
        if (!known.has(name) && !local.has(name)) {
          problems.push(
            `runtime ${l.id} / ${m.name}: тип ${name} не найден ни в @grafetto/shared, ни в Prisma` +
              (m.decl?.length ? `, ни в ${m.decl.join(', ')}` : ' — укажи файл в decl'),
          );
        }
      }
    }
  }
  return problems;
}
