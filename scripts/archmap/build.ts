/** `npm run map` — regenerates docs/architecture/map.html from the repo as it is right now. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { build, churn } from './collect';
import { assign, listSourceFiles, loadMap, refIds, REPO_ROOT } from './model';
import { render } from './render';
import { loadRuntime } from './runtime';
import { indexSymbols, mentioned, strings } from './symbols';
import { coverage, loadUnderstanding, unitFacts } from './understanding';

const OUT = join(REPO_ROOT, 'docs', 'architecture', 'map.html');

function main(): void {
  const map = loadMap();
  const files = listSourceFiles();
  const assignment = assign(map, files);

  if (map.errors.length || assignment.unclaimed.length) {
    console.warn(
      `⚠ карта расходится с кодом (${map.errors.length} ошибок описания, ` +
        `${assignment.unclaimed.length} файл(ов) вне модулей) — рисую что могу. ` +
        'Запусти `npm run map:check`, чтобы увидеть что именно.',
    );
  }

  console.log('· снимаю граф импортов, дубли и историю правок…');
  const churnCounts = churn();
  const base = build(map, assignment, churnCounts);
  // (#628) Coverage is computed here rather than in the page: it needs the same loc and churn
  // numbers the structure tab shows, and the page should only draw.
  const doc = loadUnderstanding();
  const units = unitFacts(map, assignment, (p) => churnCounts.get(p) ?? 0);
  const understanding = doc && {
    levels: doc.levels,
    topics: doc.topics,
    names: doc.names ?? {},
    units,
    people: Object.keys(doc.people ?? {}).map((person) => coverage(doc, person, units)),
  };
  const runtime = loadRuntime(refIds(map));
  // (#632) Declarations of every type and function the map's prose mentions.
  const decls = runtime?.links.flatMap((l) => l.messages.flatMap((m) => m.decl ?? [])) ?? [];
  const prose = map.modules.map((m) => [m.owns, m.notes, m.groupings]);
  const symbols = mentioned(indexSymbols(decls), strings([prose, map.flows, runtime, doc]));
  const data = { ...base, runtime, understanding, symbols };

  let remote = '';
  try {
    remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
  } catch {
    /* no remote — links degrade to a bogus base, the map still renders */
  }

  mkdirSync(join(REPO_ROOT, 'docs', 'architecture'), { recursive: true });
  writeFileSync(OUT, render(data, remote), 'utf8');

  const clones = data.health.clones.filter((c) => c.crossModule).length;
  const groups = data.modules.reduce((n, m) => n + m.groupings.length, 0);
  console.log(
    `✓ docs/architecture/map.html — ${data.modules.length} модулей (и ${groups} групп карты внутри них), ` +
      `${data.edges.length} связей, ${data.health.violations.length} нарушений правил, ` +
      `${clones} межмодульных повторов.`,
  );
}

main();
