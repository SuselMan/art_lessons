/**
 * The thing that keeps the map from rotting.
 *
 * A picture of the architecture is worth nothing three commits later unless something fails
 * when the code and the picture disagree. This does exactly that and nothing else:
 *
 *   - a source file no module claims  → the map has not caught up with the code
 *   - a file two modules claim        → the map contradicts itself
 *   - a glob that matches nothing     → the code moved out from under the map
 *
 * Run it in CI next to typecheck/lint/test. Adding a folder then costs one paragraph of prose,
 * which is the whole point: the paragraph is the part a reader actually needs.
 */
import { assign, listSourceFiles, loadMap } from './model';

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

  const covered = files.length - a.unclaimed.length;
  if (!problems.length) {
    console.log(
      `map:check ok — ${map.modules.length} модулей описывают все ${files.length} файлов ` +
        `(${map.layers.length} слоёв, ${map.flows.length} потока).`,
    );
    return;
  }

  console.error(`map:check FAILED — покрыто ${covered}/${files.length} файлов\n`);
  for (const line of problems) console.error(line);
  console.error('\nПочинить: docs/architecture/map.yaml, затем `npm run map`.');
  process.exit(1);
}

main();
