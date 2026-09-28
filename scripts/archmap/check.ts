/**
 * The thing that keeps the map from rotting.
 *
 * A picture of the architecture is worth nothing three commits later unless something fails
 * when the code and the picture disagree. This does exactly that and nothing else:
 *
 *   - a source file in no module folder → a new top-level folder has no README.md yet
 *   - a README.md with a bad header     → no layer, unknown layer, no summary, no paragraph
 *   - a file two map groups claim       → the map contradicts itself
 *   - a group glob that matches nothing → the code moved out from under the map
 *   - a reference to a module or group that does not exist (flows, runtime, understanding)
 *   - a file over its line budget       → it grew again after being cut down (#493)
 *
 * Run it in CI next to typecheck/lint/test. The layer rule itself — who may import whom — is
 * `npm run map:rules`: dependency-cruiser checks it with rules generated from the same model.
 */
import { assign, listSourceFiles, loadMap, refIds } from './model';
import { checkRuntime, loadRuntime } from './runtime';
import { checkUnderstanding, coverage, loadUnderstanding, summarise, unitFacts } from './understanding';

function main(): void {
  const map = loadMap();
  const files = listSourceFiles();
  const a = assign(map, files);

  const problems: string[] = [];

  if (map.errors.length) {
    problems.push(`${map.errors.length} ошиб(ок) в описании модулей:`);
    for (const e of map.errors) problems.push(`    ${e}`);
    problems.push('  Формат шапки README и список слоёв — docs/architecture/README.md → «Как завести модуль».');
  }

  if (a.unclaimed.length) {
    problems.push(`${a.unclaimed.length} файл(ов) лежат вне любого модуля — ни в их папке, ни выше нет README.md:`);
    for (const p of a.unclaimed.slice(0, 40)) problems.push(`    ${p}`);
    if (a.unclaimed.length > 40) problems.push(`    … и ещё ${a.unclaimed.length - 40}`);
    problems.push('  Положи в папку README.md с шапкой (layer, summary) и абзацем о том, за что она отвечает.');
  }

  if (a.contested.length) {
    problems.push(`${a.contested.length} файл(ов) попали в несколько групп карты сразу:`);
    for (const c of a.contested.slice(0, 20)) problems.push(`    ${c.path}  ←  ${c.groups.join(', ')}`);
    problems.push('  Один файл — одна группа. Сузь globs в map.yaml → groupings.');
  }

  if (a.emptyGlobs.length) {
    problems.push(`${a.emptyGlobs.length} glob(ов) в группах карты больше ничего не находят:`);
    for (const g of a.emptyGlobs.slice(0, 20)) problems.push(`    ${g.group}: ${g.glob}`);
    problems.push('  Код переехал — поправь или удали запись в map.yaml → groupings.');
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
  if (a.ungrouped.length) {
    notes.push(
      `  ${a.ungrouped.length} файл(ов) в модулях с группами не попали ни в одну группу — на карте они «вне групп».`,
    );
  }

  // (#624) The runtime cut: every socket event, REST route and type on its arrows must
  // still exist in the code — and nothing the code has may be missing from it.
  let runtime: ReturnType<typeof loadRuntime>;
  try {
    runtime = loadRuntime(refIds(map));
  } catch (err) {
    problems.push(`docs/architecture/runtime.yaml: ${(err as Error).message}`);
  }
  if (runtime) {
    const drift = checkRuntime(runtime);
    if (drift.length) {
      problems.push('Разрез «Исполнение» (docs/architecture/runtime.yaml) разошёлся с кодом:');
      for (const d of drift) problems.push(`    ${d}`);
    }
  }

  // (#628) The understanding map: broken references fail, the coverage numbers only print.
  const understanding = loadUnderstanding();
  if (understanding) problems.push(...checkUnderstanding(understanding, map, runtime));

  const covered = files.length - a.unclaimed.length;
  if (!problems.length) {
    const groups = map.modules.reduce((n, m) => n + m.groupings.length, 0);
    console.log(
      `map:check ok — ${map.modules.length} модулей (папок с README) покрывают все ${files.length} файлов; ` +
        `${groups} групп карты, ${map.layers.length} слоёв, ${map.flows.length} потока.`,
    );
    for (const line of notes) console.log(line);
    if (understanding) {
      const units = unitFacts(map, a, () => 0);
      for (const person of Object.keys(understanding.people ?? {})) {
        for (const line of summarise(coverage(understanding, person, units))) console.log(line);
      }
    }
    return;
  }

  console.error(`map:check FAILED — покрыто ${covered}/${files.length} файлов\n`);
  for (const line of problems) console.error(line);
  console.error('\nКак чинить — docs/architecture/README.md → «Что делать, когда CI ругается». Потом `npm run map`.');
  process.exit(1);
}

main();
