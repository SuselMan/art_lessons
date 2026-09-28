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
import { assign, listSourceFiles, loadMap } from './model';
import { checkRuntime, loadRuntime } from './runtime';

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
