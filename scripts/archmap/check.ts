/**
 * The thing that keeps the map from rotting.
 *
 * A picture of the architecture is worth nothing three commits later unless something fails
 * when the code and the picture disagree. This does exactly that and nothing else:
 *
 *   - a source file no module claims  → the map has not caught up with the code
 *   - a file two modules claim        → the map contradicts itself
 *   - a glob that matches nothing     → the code moved out from under the map
 *   - a file over its line budget     → it grew again after being cut down (#493)
 *
 * Run it in CI next to typecheck/lint/test. Adding a folder then costs one paragraph of prose,
 * which is the whole point: the paragraph is the part a reader actually needs.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

import { assign, listSourceFiles, loadMap, REPO_ROOT, type ArchMap } from './model';
import { checkRuntime, loadRuntime, type RuntimeMap } from './runtime';

const STATUSES = ['не отмечено', 'слышал', 'понимаю', 'объясню сам'];

interface Topic {
  id: string;
  modules?: string[];
  links?: string[];
  flows?: string[];
  adr?: string[];
}

/** understanding.yaml: every topic must point at things that still exist on the map. */
function checkUnderstanding(map: ArchMap, runtime: RuntimeMap | undefined): string[] {
  const path = join(REPO_ROOT, 'docs/architecture/understanding.yaml');
  if (!existsSync(path)) return [];
  const doc = parse(readFileSync(path, 'utf8')) as {
    topics: Topic[];
    people?: Record<string, Record<string, string>>;
  };
  const out: string[] = [];
  const modules = new Set(map.modules.map((m) => m.id));
  const flows = new Set(map.flows.map((f) => f.id));
  const links = new Set(runtime?.links.map((l) => l.id) ?? []);
  const topics = new Set(doc.topics.map((t) => t.id));
  for (const t of doc.topics) {
    for (const m of t.modules ?? []) if (!modules.has(m)) out.push(`understanding ${t.id}: нет модуля ${m}`);
    for (const f of t.flows ?? []) if (!flows.has(f)) out.push(`understanding ${t.id}: нет потока ${f}`);
    for (const l of t.links ?? []) if (!links.has(l)) out.push(`understanding ${t.id}: нет канала ${l}`);
    for (const d of t.adr ?? []) {
      if (!existsSync(join(REPO_ROOT, 'docs/adr', `${d}.md`))) out.push(`understanding ${t.id}: нет ADR ${d}`);
    }
  }
  for (const [who, marks] of Object.entries(doc.people ?? {})) {
    for (const [topic, status] of Object.entries(marks)) {
      if (!topics.has(topic)) out.push(`understanding ${who}: нет темы ${topic}`);
      if (!STATUSES.includes(status)) out.push(`understanding ${who}/${topic}: статус «${status}» не из ${STATUSES.join(' / ')}`);
    }
  }
  return out;
}

function main(): void {
  const map = loadMap();
  const files = listSourceFiles();
  const a = assign(map, files);

  const problems: string[] = [];

  if (a.unclaimed.length) {
    problems.push(
      `${a.unclaimed.length} файл(ов) не описаны ни одним модулем в docs/architecture/map.yaml:`,
    );
    for (const p of a.unclaimed.slice(0, 40)) problems.push(`    ${p}`);
    if (a.unclaimed.length > 40) problems.push(`    … и ещё ${a.unclaimed.length - 40}`);
    problems.push('  Добавь их в существующий модуль или заведи новый — с описанием, что он делает.');
  }

  if (a.contested.length) {
    problems.push(`${a.contested.length} файл(ов) claimed более чем одним модулем:`);
    for (const c of a.contested.slice(0, 20)) {
      problems.push(`    ${c.path}  ←  ${c.modules.join(', ')}`);
    }
    problems.push('  Один файл — один владелец. Сузь globs.');
  }

  if (a.emptyGlobs.length) {
    problems.push(`${a.emptyGlobs.length} glob(ов) больше ничего не находят:`);
    for (const g of a.emptyGlobs.slice(0, 20)) problems.push(`    ${g.module}: ${g.glob}`);
    problems.push('  Код переехал — поправь или удали запись.');
  }

  // (#493) Budgets. Room/index.tsx grew by about as much as a month of
  // decomposition took out of it — every new feature landed in the one file —
  // so cutting it down without a ceiling was a treadmill. The ceiling is what
  // makes each extraction stick.
  const notes: string[] = [];
  const loc = new Map(files.map((f) => [f.path, f.loc]));
  for (const b of map.budgets ?? []) {
    const n = loc.get(b.file);
    if (n === undefined) {
      problems.push(`бюджет указывает на файл, которого нет: ${b.file}`);
      continue;
    }
    if (n > b.maxLines) {
      problems.push(
        `${b.file}: ${n} строк при бюджете ${b.maxLines} (+${n - b.maxLines}).`,
        `  ${b.why}`,
        '  Новое — рядом, хуком или модулем, а не в этот файл. Если без этого никак — подними',
        '  бюджет в map.yaml отдельной строкой и напиши в коммите, почему.',
      );
    } else if (b.maxLines - n >= 100) {
      notes.push(`  ${b.file}: ${n} строк, бюджет ${b.maxLines} — можно ужать.`);
    }
  }

  // (#624) The runtime cut: every socket event, REST route and type on its arrows must
  // still exist in the code — and nothing the code has may be missing from it.
  const runtime = loadRuntime(new Set(map.modules.map((m) => m.id)));
  if (runtime) {
    const drift = checkRuntime(runtime);
    if (drift.length) {
      problems.push('Разрез «Исполнение» (docs/architecture/runtime.yaml) разошёлся с кодом:');
      for (const d of drift) problems.push(`    ${d}`);
    }
  }

  problems.push(...checkUnderstanding(map, runtime));

  const covered = files.length - a.unclaimed.length;
  if (!problems.length) {
    console.log(
      `map:check ok — ${map.modules.length} модулей описывают все ${files.length} файлов ` +
        `(${map.layers.length} слоёв, ${map.flows.length} потока).`,
    );
    for (const line of notes) console.log(line);
    return;
  }

  console.error(`map:check FAILED — покрыто ${covered}/${files.length} файлов\n`);
  for (const line of problems) console.error(line);
  console.error('\nПочинить: docs/architecture/map.yaml, затем `npm run map`.');
  process.exit(1);
}

main();
