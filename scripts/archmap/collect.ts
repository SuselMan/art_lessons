/**
 * The generated half of the architecture map: everything measured from the repo itself.
 *
 * Nothing here is hand-maintained, so nothing here can go stale — the import graph, the
 * clone report, the churn counts and the rule violations are re-derived on every run.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, type ArchMap, type Assignment } from './model';

const TMP = join(REPO_ROOT, 'temp', 'archmap');
const ISSUE_CACHE = join(REPO_ROOT, 'docs', 'architecture', 'issue-titles.json');

export interface CruiseDep {
  resolved: string;
  dependencyTypes: string[];
  circular?: boolean;
  cycle?: { name: string }[];
}
export interface CruiseModule {
  source: string;
  dependencies: CruiseDep[];
  dependents?: string[];
  orphan?: boolean;
}
export interface CruiseResult {
  modules: CruiseModule[];
  summary: {
    violations: {
      from: string;
      to: string;
      rule: { name: string; severity: string };
      cycle?: { name: string }[];
    }[];
  };
}

function run(cmd: string, args: string[], allowFail = false): string {
  try {
    return execFileSync(cmd, args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      // npx/gh are .cmd shims on Windows and need a shell; git is a real binary, and running
      // it through cmd would split `--since=6 months ago` on the spaces.
      shell: process.platform === 'win32' && cmd !== 'git',
    });
  } catch (err) {
    const e = err as { stdout?: string; message?: string };
    if (allowFail) return e.stdout ?? '';
    throw new Error(`${cmd} failed: ${e.message}`);
  }
}

export function cruise(): CruiseResult {
  mkdirSync(TMP, { recursive: true });
  // depcruise exits non-zero when rules are violated; we want the report either way.
  const out = run('npx', ['depcruise', 'apps', 'packages', '--output-type', 'json'], true);
  return JSON.parse(out) as CruiseResult;
}

export interface Clone {
  a: { path: string; startLine: number; endLine: number };
  b: { path: string; startLine: number; endLine: number };
  lines: number;
  tokens: number;
}

export function clones(minTokens = 60): Clone[] {
  mkdirSync(TMP, { recursive: true });
  run(
    'npx',
    [
      'jscpd',
      'apps',
      'packages',
      '--reporters',
      'json',
      '--output',
      'temp/archmap/jscpd',
      '--min-tokens',
      String(minTokens),
      '--format',
      'typescript,tsx',
      '--ignore',
      '**/node_modules/**,**/dist/**,**/coverage/**',
      // Without this jscpd reports paths relative to the common base of the scanned roots,
      // so `apps/server/src/disk.ts` comes back as `server/src/disk.ts` and matches nothing.
      '--absolute',
      '--silent',
    ],
    true,
  );
  const reportPath = join(TMP, 'jscpd', 'jscpd-report.json');
  if (!existsSync(reportPath)) return [];
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
    duplicates?: {
      firstFile: { name: string; start: number; end: number };
      secondFile: { name: string; start: number; end: number };
      lines: number;
      tokens: number;
    }[];
  };
  // Windows hands these back as extended-length paths (\\?\C:\...); strip that prefix, the
  // separators and the repo root so a clone path is the same string as everywhere else.
  const prefix = `${REPO_ROOT.toLowerCase()}/`;
  const norm = (p: string) => {
    const abs = p.replace(/^\\\\\?\\/, '').replace(/\\/g, '/');
    return abs.toLowerCase().startsWith(prefix) ? abs.slice(prefix.length) : abs;
  };
  return (report.duplicates ?? [])
    .map((d) => ({
      a: { path: norm(d.firstFile.name), startLine: d.firstFile.start, endLine: d.firstFile.end },
      b: { path: norm(d.secondFile.name), startLine: d.secondFile.start, endLine: d.secondFile.end },
      lines: d.lines,
      tokens: d.tokens,
    }))
    .sort((x, y) => y.tokens - x.tokens);
}

/** Commits touching each file in the given window — the "how hot is this" axis. */
export function churn(since = '6.months.ago'): Map<string, number> {
  const out = run('git', ['log', `--since=${since}`, '--name-only', '--pretty=tformat:'], true);
  const counts = new Map<string, number>();
  for (const line of out.split('\n')) {
    const p = line.trim();
    if (!p) continue;
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return counts;
}

export function adrTitles(): Record<string, string> {
  const dir = join(REPO_ROOT, 'docs', 'adr');
  const out: Record<string, string> = {};
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.md')) continue;
    const first = readFileSync(join(dir, name), 'utf8')
      .split('\n')
      .find((l) => l.startsWith('#'));
    out[name.replace(/\.md$/, '')] = (first ?? name).replace(/^#+\s*/, '').trim();
  }
  return out;
}

/**
 * Issue numbers are useless to a human without a title (see .claude/rules.md), so we resolve
 * them once via `gh` and commit the cache — the map still renders titles offline.
 */
export function issueTitles(numbers: number[]): Record<string, string> {
  let cache: Record<string, string> = {};
  if (existsSync(ISSUE_CACHE)) cache = JSON.parse(readFileSync(ISSUE_CACHE, 'utf8'));
  const missing = numbers.filter((n) => !cache[String(n)]);
  for (const n of missing) {
    const out = run('gh', ['issue', 'view', String(n), '--json', 'title', '-q', '.title'], true);
    const title = out.trim();
    if (title) cache[String(n)] = title;
  }
  if (missing.length) {
    const sorted = Object.fromEntries(
      Object.entries(cache).sort((a, b) => Number(a[0]) - Number(b[0])),
    );
    writeFileSync(ISSUE_CACHE, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
    return sorted;
  }
  return cache;
}

/** path → module id, for folding the file-level graph up to the module level. */
export function moduleOf(assignment: Assignment): Map<string, string> {
  const index = new Map<string, string>();
  for (const [id, files] of assignment.byModule) for (const f of files) index.set(f.path, id);
  return index;
}

export interface Dataset {
  generatedAt: string;
  commit: string;
  branch: string;
  groups: ArchMap['groups'];
  layers: ArchMap['layers'];
  modules: DatasetModule[];
  edges: DatasetEdge[];
  flows: ArchMap['flows'];
  adr: Record<string, string>;
  issues: Record<string, string>;
  health: {
    violations: {
      rule: string;
      severity: string;
      from: string;
      to: string;
      fromModule?: string;
      toModule?: string;
      cycle?: string[];
    }[];
    orphans: string[];
    clones: (Clone & { aModule?: string; bModule?: string; crossModule: boolean })[];
  };
}

export interface DatasetFile {
  path: string;
  loc: number;
  kind: 'code' | 'test' | 'style';
  in: number;
  out: number;
  churn: number;
}

export interface DatasetModule {
  id: string;
  title: string;
  layer: string;
  owns: string;
  adr: string[];
  issues: number[];
  notes: string[];
  tags: string[];
  loc: number;
  testLoc: number;
  styleLoc: number;
  fileCount: number;
  testCount: number;
  churn: number;
  files: DatasetFile[];
}

export interface DatasetEdge {
  from: string;
  to: string;
  weight: number;
  typeOnly: boolean;
  /** Up to a handful of concrete file→file pairs, so "why does A need B?" is answerable. */
  samples: [string, string][];
}

export function build(map: ArchMap, assignment: Assignment): Dataset {
  const graph = cruise();
  const churnCounts = churn();
  const index = moduleOf(assignment);
  const cloneList = clones();

  const degIn = new Map<string, number>();
  const degOut = new Map<string, number>();
  for (const m of graph.modules) {
    degOut.set(m.source, m.dependencies.length);
    for (const d of m.dependencies) degIn.set(d.resolved, (degIn.get(d.resolved) ?? 0) + 1);
  }

  const modules: DatasetModule[] = map.modules.map((def) => {
    const own = assignment.byModule.get(def.id) ?? [];
    const dsFiles: DatasetFile[] = own
      .map((f) => ({
        path: f.path,
        loc: f.loc,
        kind: f.isTest ? ('test' as const) : f.isStyle ? ('style' as const) : ('code' as const),
        in: degIn.get(f.path) ?? 0,
        out: degOut.get(f.path) ?? 0,
        churn: churnCounts.get(f.path) ?? 0,
      }))
      .sort((a, b) => b.loc - a.loc);
    const code = dsFiles.filter((f) => f.kind === 'code');
    return {
      id: def.id,
      title: def.title,
      layer: def.layer,
      owns: def.owns.trim(),
      adr: def.adr ?? [],
      issues: def.issues ?? [],
      notes: def.notes ?? [],
      tags: def.tags ?? [],
      loc: code.reduce((a, f) => a + f.loc, 0),
      testLoc: dsFiles.filter((f) => f.kind === 'test').reduce((a, f) => a + f.loc, 0),
      styleLoc: dsFiles.filter((f) => f.kind === 'style').reduce((a, f) => a + f.loc, 0),
      fileCount: code.length,
      testCount: dsFiles.filter((f) => f.kind === 'test').length,
      churn: dsFiles.reduce((a, f) => a + f.churn, 0),
      files: dsFiles,
    };
  });

  const edgeMap = new Map<string, DatasetEdge>();
  for (const m of graph.modules) {
    const from = index.get(m.source);
    if (!from) continue;
    for (const d of m.dependencies) {
      const to = index.get(d.resolved);
      if (!to || to === from) continue;
      const key = `${from}::${to}`;
      let edge = edgeMap.get(key);
      if (!edge) {
        edge = { from, to, weight: 0, typeOnly: true, samples: [] };
        edgeMap.set(key, edge);
      }
      edge.weight += 1;
      if (!d.dependencyTypes.includes('type-only')) edge.typeOnly = false;
      if (edge.samples.length < 6) edge.samples.push([m.source, d.resolved]);
    }
  }

  const violations = graph.summary.violations.map((v) => ({
    rule: v.rule.name,
    severity: v.rule.severity,
    from: v.from,
    to: v.to,
    fromModule: index.get(v.from),
    toModule: index.get(v.to),
    cycle: v.cycle?.map((c) => c.name),
  }));

  const allIssues = [...new Set(map.modules.flatMap((m) => m.issues ?? []))].sort((a, b) => a - b);

  return {
    generatedAt: new Date().toISOString(),
    commit: run('git', ['rev-parse', '--short', 'HEAD'], true).trim(),
    branch: run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], true).trim(),
    groups: map.groups,
    layers: map.layers,
    modules,
    edges: [...edgeMap.values()].sort((a, b) => b.weight - a.weight),
    flows: map.flows ?? [],
    adr: adrTitles(),
    issues: issueTitles(allIssues),
    health: {
      violations,
      orphans: graph.modules.filter((m) => m.orphan).map((m) => m.source),
      clones: cloneList.map((c) => {
        const aModule = index.get(c.a.path);
        const bModule = index.get(c.b.path);
        return { ...c, aModule, bModule, crossModule: !!aModule && !!bModule && aModule !== bModule };
      }),
    },
  };
}
