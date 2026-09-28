/**
 * (#632) Types and functions the map mentions, with their declarations lifted from the code.
 *
 * The map names `Operation`, `StrokeLiveData`, `appendOperation`… all over its prose. A name you
 * cannot open is a name you have to go and grep for, so every one that is declared somewhere we
 * index becomes clickable on the page, and the click shows the declaration itself.
 *
 * Only names the map actually mentions are shipped, so the page stays small. One name can have
 * several declarations — `Room` is both the wire type and a Prisma model — and all of them are
 * kept: that difference is often exactly the thing worth seeing.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT } from './model';

export interface SymbolDecl {
  path: string;
  /** 1-based line of the declaration itself (not of its doc comment). */
  line: number;
  kind: 'type' | 'interface' | 'function' | 'const' | 'class' | 'enum' | 'model' | 'method';
  /** Doc comment + declaration, as written. */
  snippet: string;
  truncated: boolean;
}

const MAX_LINES = 150;
const ENGINE = 'apps/web/src/engine/index.ts';

function read(path: string): string[] {
  return readFileSync(join(REPO_ROOT, path), 'utf8').split('\n');
}

function tsFiles(dir: string): string[] {
  return readdirSync(join(REPO_ROOT, dir))
    .filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f))
    .map((f) => `${dir}/${f}`);
}

/** Comment lines directly above `at`, so the popover shows the "why" next to the shape. */
function leadingComment(lines: string[], at: number): number {
  let start = at;
  while (start > 0) {
    const prev = lines[start - 1].trim();
    if (prev.startsWith('//') || prev.startsWith('*') || prev.startsWith('/**') || prev.endsWith('*/')) start--;
    else break;
  }
  return start;
}

/**
 * From `at` to the end of the declaration: brackets balanced and the statement not continuing
 * on the next line (`| 'a'`, `& {…}`). Good enough for declarations written the way this
 * repo writes them; a cap keeps a pathological one from swallowing the file.
 */
function declarationEnd(lines: string[], at: number): number {
  let depth = 0;
  for (let i = at; i < lines.length && i < at + 400; i++) {
    const code = lines[i].replace(/\/\/.*$/, '').replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '');
    for (const ch of code) {
      if ('{([<'.includes(ch)) depth++;
      else if ('})]>'.includes(ch)) depth--;
    }
    // `=>` inside a signature is not a closing bracket.
    depth += (code.match(/=>/g) ?? []).length;
    if (depth <= 0) {
      const next = (lines[i + 1] ?? '').trim();
      if (!/^[|&]/.test(next) && !/[=|&,(]$/.test(code.trim())) return i;
    }
  }
  return at;
}

function snippet(lines: string[], at: number, path: string, kind: SymbolDecl['kind']): SymbolDecl {
  const start = leadingComment(lines, at);
  const end = declarationEnd(lines, at);
  const body = lines.slice(start, end + 1);
  const truncated = body.length > MAX_LINES;
  return {
    path,
    line: at + 1,
    kind,
    snippet: (truncated ? body.slice(0, MAX_LINES) : body).join('\n').replace(/\s+$/, ''),
    truncated,
  };
}

/** Every declaration we know how to find, by name. */
export function indexSymbols(extraFiles: string[]): Map<string, SymbolDecl[]> {
  const index = new Map<string, SymbolDecl[]>();
  const add = (name: string, d: SymbolDecl): void => {
    const list = index.get(name) ?? [];
    if (!list.some((x) => x.path === d.path && x.line === d.line)) list.push(d);
    index.set(name, list);
  };

  const exported = /^export\s+(?:declare\s+)?(type|interface|function|const|class|enum)\s+(\w+)/;
  const declared = /^(?:export\s+)?(?:declare\s+)?(type|interface|class|enum)\s+(\w+)/;
  const sources = [
    ...tsFiles('packages/shared/src').map((p) => ({ p, re: exported })),
    ...[...new Set(extraFiles)].filter((p) => existsSync(join(REPO_ROOT, p))).map((p) => ({ p, re: declared })),
  ];
  for (const { p, re } of sources) {
    const lines = read(p);
    lines.forEach((l, i) => {
      const m = l.match(re);
      if (m) add(m[2], snippet(lines, i, p, m[1] as SymbolDecl['kind']));
    });
  }

  const prisma = 'apps/server/prisma/schema.prisma';
  const plines = read(prisma);
  plines.forEach((l, i) => {
    const m = l.match(/^(model|enum)\s+(\w+)\s*\{/);
    if (!m) return;
    let end = i;
    while (end < plines.length && !/^\}/.test(plines[end])) end++;
    const body = plines.slice(leadingComment(plines, i), end + 1);
    add(m[2], {
      path: prisma,
      line: i + 1,
      kind: m[1] === 'model' ? 'model' : 'enum',
      snippet: body.slice(0, MAX_LINES).join('\n'),
      truncated: body.length > MAX_LINES,
    });
  });

  // The engine's public surface: members of PencilEngineAPI. Short names (`on`) would match
  // ordinary words in prose, so only names of four letters or more are indexed.
  const elines = read(ENGINE);
  const open = elines.findIndex((l) => /^export interface PencilEngineAPI\b/.test(l));
  if (open >= 0) {
    add('PencilEngineAPI', snippet(elines, open, ENGINE, 'interface'));
    for (let i = open + 1; i < elines.length && !/^\}/.test(elines[i]); i++) {
      const m = elines[i].match(/^ {2}(\w{4,})\??\(/);
      if (m) add(m[1], snippet(elines, i, ENGINE, 'method'));
    }
  }
  return index;
}

/** Keep only the names that occur somewhere in the map's own text. */
export function mentioned(index: Map<string, SymbolDecl[]>, texts: string[]): Record<string, SymbolDecl[]> {
  const words = new Set<string>();
  for (const t of texts) for (const [w] of t.matchAll(/\b[A-Za-z_]\w{2,}\b/g)) words.add(w);
  const out: Record<string, SymbolDecl[]> = {};
  for (const w of [...words].sort()) {
    const d = index.get(w);
    if (d) out[w] = d;
  }
  return out;
}

/** Every string anywhere inside a parsed YAML document. */
export function strings(value: unknown, acc: string[] = []): string[] {
  if (typeof value === 'string') acc.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, acc));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, acc));
  return acc;
}
