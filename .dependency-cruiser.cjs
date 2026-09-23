/**
 * dependency-cruiser config — the skeleton of the architecture map.
 *
 * Two jobs:
 *   1. `npm run map`       — dumps the real import graph as JSON for scripts/archmap.
 *   2. `npm run map:rules` — fails when a documented architectural boundary is crossed.
 *
 * The rules here are not style preferences: each one is a boundary that CLAUDE.md or an
 * ADR already states in prose. Writing it down here is what makes it survive.
 */
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
    {
      name: 'engine-knows-no-app',
      comment:
        'The WebGL engine is a standalone library: it must not reach into the store, the ' +
        'React components, the pages or the i18n layer. Store state is a reflection of the ' +
        'engine, never the other way round (CLAUDE.md → State).',
      severity: 'error',
      from: { path: '^apps/web/src/engine/' },
      to: { path: '^apps/web/src/(stores|components|pages|i18n)/' },
    },
    {
      name: 'shared-is-a-leaf',
      comment: 'packages/shared is imported by everyone and imports nothing of ours.',
      severity: 'error',
      from: { path: '^packages/shared/' },
      to: { path: '^apps/' },
    },
    {
      name: 'server-has-no-client',
      comment: 'The server never renders (CLAUDE.md → Rendering): it retransmits operations.',
      severity: 'error',
      from: { path: '^apps/server/' },
      to: { path: '^apps/web/' },
    },
    {
      name: 'store-holds-no-ui',
      comment: 'The store holds state, not React. Components read it, it does not read them.',
      severity: 'error',
      from: { path: '^apps/web/src/stores/' },
      to: { path: '^apps/web/src/(components|pages)/' },
    },
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
