/**
 * dependency-cruiser config — the skeleton of the architecture map.
 *
 * Two jobs:
 *   1. `npm run map`       — dumps the real import graph as JSON for scripts/archmap.
 *   2. `npm run map:rules` — fails when a documented architectural boundary is crossed.
 *
 * The rules here are not style preferences: each one is a boundary that CLAUDE.md or an
 * ADR already states in prose. Writing it down here is what makes it survive. The layer rules
 * (`layer-*`) are not written here at all — see layerRules() below.
 */
// The map's model is TypeScript; tsx's require hook lets this config load it synchronously,
// so the rules are always generated from the READMEs as they are right now — never a stale copy.
const { require: tsxRequire } = require('tsx/cjs/api');

function layerRules() {
  const model = tsxRequire('./scripts/archmap/model.ts', __filename);
  return model.layerRules(model.loadMap());
}

module.exports = {
  forbidden: [
    {
      name: 'engine-public-api-only',
      comment:
        "Engine internals are private. Outside apps/web/src/engine, import from " +
        "'engine' (index.ts) only — see CLAUDE.md → Coding Conventions → Engine.",
      severity: 'error',
      from: { pathNot: '^apps/web/src/engine/' },
      to: { path: '^apps/web/src/engine/src/' },
    },
    // (#642) Layer rules — one per layer, generated from docs/architecture/map.yaml (layer
    // order and parts) and each module's README.md header (its layer). They replaced the
    // hand-written engine-knows-no-app, store-holds-no-ui, server-has-no-client and
    // shared-is-a-leaf, which were four special cases of the same order.
    ...layerRules(),
    {
      name: 'no-circular',
      comment: 'A cycle means two modules are really one — name it or split it.',
      severity: 'warn',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment: 'Reachable from nothing: either dead code or a missing entry point.',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          '[.]d[.]ts$',
          '(^|/)[.][^/]+[.](js|cjs|mjs|ts|cts|mts|json)$',
          '(^|/)(babel|webpack|vite|vitest|playwright)[.]config[.](js|cjs|mjs|ts)$',
        ],
      },
      to: {},
    },
    {
      name: 'no-dev-dep-in-src',
      comment: 'Application code importing a devDependency breaks the production build.',
      severity: 'error',
      from: { path: '^(apps|packages)/', pathNot: '[.](test|spec)[.](ts|tsx)$' },
      to: { dependencyTypes: ['npm-dev'] },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: {
      path: [
        'node_modules',
        '/dist/',
        '/coverage/',
        '[.](test|spec)[.](ts|tsx)$',
        '[.]css$',
        '^apps/web/src/engine/testing/',
      ],
    },
    includeOnly: '^(apps|packages)/',
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      dot: { collapsePattern: 'node_modules/(@[^/]+/[^/]+|[^/]+)' },
    },
  },
};
