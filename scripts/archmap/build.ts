/** `npm run map` — regenerates docs/architecture/map.html from the repo as it is right now. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { build } from './collect';
import { assign, listSourceFiles, loadMap, REPO_ROOT } from './model';
import { render } from './render';

const OUT = join(REPO_ROOT, 'docs', 'architecture', 'map.html');

function main(): void {
  const map = loadMap();
  const files = listSourceFiles();
  const assignment = assign(map, files);

  if (assignment.unclaimed.length) {
    console.warn(
      `⚠ ${assignment.unclaimed.length} файл(ов) не описаны в map.yaml — они не попадут на карту. ` +
        'Запусти `npm run map:check`, чтобы увидеть какие.',
    );
  }

  console.log('· снимаю граф импортов, дубли и историю правок…');
  const data = build(map, assignment);

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
  console.log(
    `✓ docs/architecture/map.html — ${data.modules.length} модулей, ${data.edges.length} связей, ` +
      `${data.health.violations.length} нарушений правил, ${clones} межмодульных повторов.`,
  );
}

main();
