// Перенос файлов с переписыванием импортов языковым сервисом TypeScript
// (getEditsForFileRename — то же, что делает «переименовать файл» в VS Code).
//
//   node temp/modmove/move.mjs <repoRoot> <moves.json> [--dry]
//
// moves.json: [["apps/server/src/a.ts", "apps/server/src/rooms/a.ts"], ...] — пути от корня.
// Переносы идут по одному: правки для переноса N считаются от состояния после N-1, иначе
// два переезжающих файла, импортирующих друг друга, получат пути от старых мест.
// Сверх языкового сервиса переписываются строковые пути в vi.mock / vi.doMock /
// vi.importActual / vi.importMock / import.meta.glob-free `import('...')` уже покрыт сервисом.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const [root, movesFile, ...flags] = process.argv.slice(2)
const dry = flags.includes('--dry')
const require = createRequire(path.join(path.resolve(root), 'package.json'))
const ts = require('typescript')

const ROOT = path.resolve(root)
const abs = (p) => path.resolve(ROOT, p)
const moves = JSON.parse(fs.readFileSync(movesFile, 'utf8')).map(([a, b]) => [abs(a), abs(b)])

const projArg = flags.find((f) => f.startsWith('--projects='))
const PROJECTS = projArg ? projArg.slice('--projects='.length).split(',').map(abs) : [
  'apps/web/tsconfig.app.json',
  'apps/web/tsconfig.sw.json',
  'apps/web/tsconfig.node.json',
  'apps/server/tsconfig.json',
  'packages/shared/tsconfig.json',
  'tsconfig.e2e.json',
  'tsconfig.scripts.json',
].map(abs)
for (const p of PROJECTS) if (!fs.existsSync(p)) throw new Error(`no project ${p}`)

// Общий оверлей текстов: все проекты видят одни и те же правки.
const resolved = new Map()
const R = (f) => {
  let r = resolved.get(f)
  if (r === undefined) resolved.set(f, (r = path.resolve(f)))
  return r
}
const overlay = new Map() // abs -> text
const versions = new Map()
const readText = (f) => (overlay.has(f) ? overlay.get(f) : fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : undefined)
const exists = (f) => overlay.has(f) || (fs.existsSync(f) && !deleted.has(f))
const deleted = new Set()

function makeService(configPath) {
  const cfg = ts.getParsedCommandLineOfConfigFile(configPath, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} })
  const files = new Set(cfg.fileNames.map((f) => path.resolve(f)))
  const host = {
    getScriptFileNames: () => [...files],
    getScriptVersion: (f) => String(versions.get(R(f)) ?? 0),
    getScriptSnapshot: (f) => {
      const t = readTextChecked(R(f))
      return t === undefined ? undefined : ts.ScriptSnapshot.fromString(t)
    },
    getCurrentDirectory: () => path.dirname(configPath),
    getCompilationSettings: () => cfg.options,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: (f) => exists(R(f)),
    readFile: (f) => readTextChecked(R(f)),
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    useCaseSensitiveFileNames: () => true,
  }
  return { configPath, files, ls: ts.createLanguageService(host, ts.createDocumentRegistry()) }
}
function readTextChecked(f) {
  if (deleted.has(f)) return undefined
  return readText(f)
}

const services = PROJECTS.map(makeService)
const touched = new Set()

function applyEdits(fileTextChanges) {
  // fileName -> sorted unique edits
  const byFile = new Map()
  for (const fc of fileTextChanges) {
    const f = path.resolve(fc.fileName)
    if (!byFile.has(f)) byFile.set(f, new Map())
    const m = byFile.get(f)
    for (const tc of fc.textChanges) {
      const key = `${tc.span.start}:${tc.span.length}`
      if (m.has(key) && m.get(key).newText !== tc.newText) {
        throw new Error(`conflicting edits in ${f} at ${key}: ${m.get(key).newText} vs ${tc.newText}`)
      }
      m.set(key, tc)
    }
  }
  for (const [f, m] of byFile) {
    let text = readText(f)
    const edits = [...m.values()].sort((a, b) => b.span.start - a.span.start)
    for (const e of edits) text = text.slice(0, e.span.start) + e.newText + text.slice(e.span.start + e.span.length)
    overlay.set(f, text)
    versions.set(f, (versions.get(f) ?? 0) + 1)
    touched.add(f)
  }
}

// vi.mock('./x.js') и родня: сервис эти строки не видит.
const MOCK_RE = /\b(vi\.(?:mock|doMock|unmock|doUnmock|importActual|importMock))\(\s*(['"])(\.{1,2}\/[^'"]+)\2/g
function resolveSpec(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec)
  const cands = [base, base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx'), base + '.ts', base + '.tsx', base + '.js', path.join(base, 'index.ts'), path.join(base, 'index.tsx')]
  return cands.find((c) => exists(c))
}
function relSpec(fromFile, target, originalSpec) {
  let rel = path.relative(path.dirname(fromFile), target).split(path.sep).join('/')
  if (!rel.startsWith('.')) rel = './' + rel
  // Сохраняем стиль исходного спецификатора: .js / без расширения / /index
  const ext = path.extname(target)
  if (originalSpec.endsWith('.js') && (ext === '.ts' || ext === '.tsx')) rel = rel.slice(0, -ext.length) + '.js'
  else if (!/\.[cm]?[jt]sx?$/.test(originalSpec)) {
    rel = rel.slice(0, -ext.length)
    if (!/\/index$/.test(originalSpec) && rel.endsWith('/index')) rel = rel.slice(0, -'/index'.length)
  }
  return rel
}
function allKnownFiles() {
  const s = new Set()
  for (const svc of services) for (const f of svc.files) s.add(f)
  return s
}
function fixMockSpecs(oldPath, newPath) {
  for (const f of allKnownFiles()) {
    if (!/\.(test|spec)\.[jt]sx?$|\/testing\//.test(f) && !f.includes('__mocks__')) {
      // моки встречаются и вне тестов редко, но проверим всё
    }
    const fileNow = f
    const text = readText(fileNow)
    if (text === undefined || !text.includes('vi.')) continue
    // Для самого переезжающего файла пути считаются от старого места (он ещё там).
    let changed = false
    const out = text.replace(MOCK_RE, (m, call, q, spec) => {
      const target = resolveSpec(fileNow, spec)
      const effectiveFrom = fileNow === oldPath ? newPath : fileNow
      const effectiveTarget = target === oldPath ? newPath : target
      if (!target) return m
      const next = relSpec(effectiveFrom, effectiveTarget, spec)
      if (next === spec) return m
      changed = true
      return `${call}(${q}${next}${q}`
    })
    if (changed) {
      overlay.set(fileNow, out)
      versions.set(fileNow, (versions.get(fileNow) ?? 0) + 1)
      touched.add(fileNow)
    }
  }
}

const prefs = { importModuleSpecifierPreference: 'relative', importModuleSpecifierEnding: 'auto', allowTextChangesInNewFiles: true }
const fmt = ts.getDefaultFormatCodeSettings()

for (const [from, to] of moves) {
  if (!exists(from)) throw new Error(`missing ${from}`)
  if (exists(to)) throw new Error(`target exists ${to}`)
  const changes = []
  for (const svc of services) {
    const t0 = Date.now()
    changes.push(...svc.ls.getEditsForFileRename(from, to, fmt, prefs))
    if (process.env.MODMOVE_TIMING) console.log(`  ${path.relative(ROOT, svc.configPath)}: ${Date.now() - t0} ms`)
  }
  applyEdits(changes)
  fixMockSpecs(from, to)
  // Переезд в оверлее
  const text = readText(from)
  overlay.set(to, text)
  overlay.delete(from)
  deleted.add(from)
  deleted.delete(to)
  versions.set(to, (versions.get(from) ?? 0) + 1)
  touched.delete(from)
  touched.add(to)
  for (const svc of services) {
    if (svc.files.delete(from)) svc.files.add(to)
  }
  console.log(`moved ${path.relative(ROOT, from)} -> ${path.relative(ROOT, to)}`)
}

if (dry) {
  console.log('dry run; touched:', [...touched].map((f) => path.relative(ROOT, f)).join('\n  '))
  process.exit(0)
}

// На диск: сначала git mv (история), потом содержимое.
for (const [from, to] of moves) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  execFileSync('git', ['-C', ROOT, 'mv', path.relative(ROOT, from), path.relative(ROOT, to)])
}
for (const f of touched) {
  if (deleted.has(f)) continue
  fs.writeFileSync(f, overlay.get(f))
}
console.log(`done: ${moves.length} moves, ${touched.size} files written`)
