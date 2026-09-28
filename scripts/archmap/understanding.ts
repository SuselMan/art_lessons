/**
 * (#628) The understanding map: which parts of the architecture a developer can explain.
 *
 * `docs/architecture/understanding.yaml` is a tree of topics, general to specific, each
 * pointing at things already on the map. Two numbers come out of it, both starting at zero:
 *
 *   - per level of the tree — kept apart on purpose: 80 % of the details on top of 0 % of
 *     the overview is a bad place to be, and a single total would hide it;
 *   - per line of code — how much of the project sits in modules an understood topic covers,
 *     plain and weighted by churn. The hottest modules nobody understands are what to learn
 *     next.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

import { REPO_ROOT, refIds, type ArchMap, type Assignment } from './model';
import type { RuntimeMap } from './runtime';

export const STATUSES = ['не отмечено', 'слышал', 'понимаю', 'объясню сам'] as const;
export type Status = (typeof STATUSES)[number];
const SCORE: Record<Status, number> = { 'не отмечено': 0, слышал: 0, понимаю: 0.5, 'объясню сам': 1 };
/** Knowing a subsystem in outline is not knowing each of its modules. */
const LAYER_WEIGHT = 0.5;

export interface Topic {
  id: string;
  level: number;
  parent?: string;
  title: string;
  why?: string;
  issue?: number;
  layers?: string[];
  modules?: string[];
  links?: string[];
  flows?: string[];
  adr?: string[];
}

export interface UnderstandingDoc {
  levels: string[];
  topics: Topic[];
  people?: Record<string, Record<string, Status>>;
  /** Display names for `people` keys. */
  names?: Record<string, string>;
}

/**
 * (#642) What coverage is counted over: each map-only group of a module is a unit of its own,
 * and whatever of a module no group claims is a unit named after the module. A module without
 * groups is one unit. So a topic pointing at `room-net` credits the net files, not all of
 * pages/Room, and a topic pointing at pages/Room credits all of it.
 */
export interface UnitFacts {
  id: string;
  module: string;
  layer: string;
  loc: number;
  churn: number;
}

export function unitFacts(map: ArchMap, a: Assignment, churnOf: (path: string) => number): UnitFacts[] {
  const out = new Map<string, UnitFacts>();
  for (const m of map.modules) {
    for (const f of a.byModule.get(m.id) ?? []) {
      const id = a.grouping.get(f.path) ?? m.id;
      let u = out.get(id);
      if (!u) out.set(id, (u = { id, module: m.id, layer: m.layer, loc: 0, churn: 0 }));
      // Lines count code only, like the cards; churn counts every file, tests included.
      if (!f.isTest && !f.isStyle) u.loc += f.loc;
      u.churn += churnOf(f.path);
    }
  }
  return [...out.values()];
}

export interface Coverage {
  person: string;
  status: Record<string, Status>;
  levels: { title: string; topics: number; score: number }[];
  code: { loc: number; total: number; churn: number; churnTotal: number };
  /** Unit id (group, or module) → best score any topic gives it. */
  unitScore: Record<string, number>;
  /** Module id → its units' scores weighted by lines — what tints a card. */
  moduleScore: Record<string, number>;
  /** Units no topic reaches at all — the topic list itself has a gap there. */
  unreached: string[];
  /** Hot units below «понимаю», by churn. */
  hotspots: string[];
  /** Topics below «понимаю» whose parent is at «понимаю» or better — the frontier. */
  next: string[];
}

const PATH = join(REPO_ROOT, 'docs/architecture/understanding.yaml');

export function loadUnderstanding(): UnderstandingDoc | undefined {
  if (!existsSync(PATH)) return undefined;
  return parse(readFileSync(PATH, 'utf8')) as UnderstandingDoc;
}

/** Every reference must still exist on the map, and the tree must be a tree. */
export function checkUnderstanding(doc: UnderstandingDoc, map: ArchMap, runtime: RuntimeMap | undefined): string[] {
  const out: string[] = [];
  const modules = refIds(map);
  const layers = new Set(map.layers.map((l) => l.id));
  const flows = new Set(map.flows.map((f) => f.id));
  const links = new Set(runtime?.links.map((l) => l.id) ?? []);
  const byId = new Map<string, Topic>();
  for (const t of doc.topics) {
    if (byId.has(t.id)) out.push(`understanding: тема ${t.id} объявлена дважды`);
    byId.set(t.id, t);
  }
  for (const t of doc.topics) {
    const where = `understanding ${t.id}`;
    if (!(t.level >= 0 && t.level < doc.levels.length)) out.push(`${where}: уровень ${t.level} не из levels`);
    if (t.parent !== undefined) {
      const p = byId.get(t.parent);
      if (!p) out.push(`${where}: нет родителя ${t.parent}`);
      else if (p.level >= t.level) out.push(`${where}: родитель ${p.id} не выше по уровню`);
    } else if (t.level !== 0) out.push(`${where}: у темы уровня ${t.level} должен быть родитель`);
    for (const x of t.layers ?? []) if (!layers.has(x)) out.push(`${where}: нет слоя ${x}`);
    for (const x of t.modules ?? []) if (!modules.has(x)) out.push(`${where}: нет модуля или группы ${x}`);
    for (const x of t.flows ?? []) if (!flows.has(x)) out.push(`${where}: нет потока ${x}`);
    for (const x of t.links ?? []) if (!links.has(x)) out.push(`${where}: нет канала ${x}`);
    for (const x of t.adr ?? []) {
      if (!existsSync(join(REPO_ROOT, 'docs/adr', `${x}.md`))) out.push(`${where}: нет ADR ${x}`);
    }
  }
  for (const [who, marks] of Object.entries(doc.people ?? {})) {
    for (const [topic, status] of Object.entries(marks)) {
      if (!byId.has(topic)) out.push(`understanding ${who}: нет темы ${topic}`);
      if (!STATUSES.includes(status)) {
        out.push(`understanding ${who}/${topic}: статус «${status}» не из ${STATUSES.join(' / ')}`);
      }
    }
  }
  return out;
}

export function coverage(doc: UnderstandingDoc, person: string, modules: UnitFacts[]): Coverage {
  const marks = doc.people?.[person] ?? {};
  const status: Record<string, Status> = {};
  for (const t of doc.topics) status[t.id] = marks[t.id] ?? 'не отмечено';
  const score = (id: string): number => SCORE[status[id]];

  const levels = doc.levels.map((title, level) => {
    const here = doc.topics.filter((t) => t.level === level);
    return { title, topics: here.length, score: here.reduce((s, t) => s + score(t.id), 0) };
  });

  const unitScore: Record<string, number> = {};
  const reached = new Set<string>();
  const credit = (id: string, v: number): void => {
    reached.add(id);
    unitScore[id] = Math.max(unitScore[id] ?? 0, v);
  };
  for (const t of doc.topics) {
    for (const ref of t.modules ?? []) {
      // A module ref covers every unit of the module; a group ref covers that group.
      for (const u of modules) if (u.id === ref || u.module === ref) credit(u.id, score(t.id));
    }
    for (const layer of t.layers ?? []) {
      for (const m of modules) if (m.layer === layer) credit(m.id, score(t.id) * LAYER_WEIGHT);
    }
  }
  const moduleScore: Record<string, number> = {};
  const moduleLoc: Record<string, number> = {};
  for (const u of modules) {
    moduleLoc[u.module] = (moduleLoc[u.module] ?? 0) + u.loc;
    moduleScore[u.module] = (moduleScore[u.module] ?? 0) + u.loc * (unitScore[u.id] ?? 0);
  }
  for (const id of Object.keys(moduleScore)) moduleScore[id] = moduleLoc[id] ? moduleScore[id] / moduleLoc[id] : 0;

  const code = { loc: 0, total: 0, churn: 0, churnTotal: 0 };
  for (const m of modules) {
    const s = unitScore[m.id] ?? 0;
    code.total += m.loc;
    code.loc += m.loc * s;
    code.churnTotal += m.churn;
    code.churn += m.churn * s;
  }

  const hotspots = modules
    .filter((m) => (unitScore[m.id] ?? 0) < SCORE['понимаю'] && m.churn > 0)
    .sort((a, b) => b.churn - a.churn)
    .slice(0, 10)
    .map((m) => m.id);

  const byId = new Map(doc.topics.map((t) => [t.id, t]));
  const next = doc.topics
    .filter((t) => score(t.id) < SCORE['понимаю'])
    .filter((t) => !t.parent || score(byId.get(t.parent)!.id) >= SCORE['понимаю'])
    .sort((a, b) => a.level - b.level)
    .map((t) => t.id);

  return {
    person,
    status,
    levels,
    code,
    unitScore,
    moduleScore,
    unreached: modules.filter((m) => !reached.has(m.id)).map((m) => m.id),
    hotspots,
    next,
  };
}

/** One line per level plus the code numbers — printed by map:check, never fails it. */
export function summarise(c: Coverage): string[] {
  const pct = (a: number, b: number): string => `${b ? Math.round((a / b) * 100) : 0} %`;
  return [
    `понимание (${c.person}): ` +
      c.levels.map((l) => `${l.title.toLowerCase()} ${pct(l.score, l.topics)}`).join(' · ') +
      ` · код ${pct(c.code.loc, c.code.total)}` +
      (c.code.churnTotal ? `, по правкам ${pct(c.code.churn, c.code.churnTotal)}` : ''),
  ];
}
