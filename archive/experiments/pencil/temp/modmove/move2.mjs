// Однопроходный перенос с переписыванием импортов.
//
//   node temp/modmove/move2.mjs <repoRoot> <moves.json> [--dry] [--no-git]
//
// Для каждого .ts/.tsx/.mts/.js/.mjs файла под apps/, packages/, scripts/, e2e/ и корневых
// конфигов: находит относительные спецификаторы (import/export from, import(), import x = require,
// vi.mock и родня, `/// <reference path>` не трогаем), разрешает их резолвером TypeScript с
// настройками ближайшего tsconfig, отображает цель через таблицу переносов и пересчитывает путь
// от нового места самого файла. Стиль спецификатора (.js / без расширения / .ts / /index)
// сохраняется. Спецификатор, который резолвер не разрешил, но который до переноса был
// относительным и указывал внутрь затронутых мест, — ошибка: такое чинится руками осознанно.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const [root, movesFile, ...flags] = process.argv.slice(2)
const dry = flags.includes('--dry')
const noGit = flags.includes('--no-git')
const ROOT = path.resolve(root)
const require = createRequire(import.meta.url)
const ts = require('typescript')
const abs = (p) => path.resolve(ROOT, p)

const moveList = JSON.parse(fs.readFileSync(movesFile, 'utf8')).map(([a, b]) => [abs(a), abs(b)])
const moveMap = new Map(moveList)
for (const [a, b] of moveList) {
  if (!fs.existsSync(a)) throw new Error(`missing ${a}`)
  if (fs.existsSync(b)) throw new Error(`target exists ${b}`)
}
const mapped = (f) => moveMap.get(f) ?? f

// Все файлы-кандидаты из git (отслеживаемые), чтобы не бродить по node_modules/dist.
const tracked = execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 1 << 28 })
  .split('\0')
  .filter((f) => /\.(ts|tsx|mts|cts|js|mjs|cjs|jsx)$/.test(f) && !f.endsWith('.d.ts'))
  .map(abs)

// Настройки резолвера: ближайший tsconfig; для apps/web — tsconfig.app.json.
const cfgCache = new Map()
function optionsFor(file) {
  let dir = path.dirname(file)
  while (dir.startsWith(ROOT)) {
    for (const name of ['tsconfig.app.json', 'tsconfig.json']) {
      const p = path.join(dir, name)
      if (fs.existsSync(p)) {
        if (!cfgCache.has(p)) {
          const cfg = ts.getParsedCommandLineOfConfigFile(p, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} })
          cfgCache.set(p, cfg.options)
        }
        return cfgCache.get(p)
      }
    }
    if (dir === ROOT) break
    dir = path.dirname(dir)
  }
  return { moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, allowJs: true, allowImportingTsExtensions: true }
}

const resolutionHost = { fileExists: ts.sys.fileExists, readFile: ts.sys.readFile, directoryExists: ts.sys.directoryExists, realpath: ts.sys.realpath, getCurrentDirectory: () => ROOT }

function resolve(spec, fromFile) {
  const opts = { ...optionsFor(fromFile), allowJs: true }
  const r = ts.resolveModuleName(spec, fromFile, opts, resolutionHost)
  if (r.resolvedModule && !r.resolvedModule.isExternalLibraryImport) return path.resolve(r.resolvedModule.resolvedFileName)
  // Не-TS цели: .css, .json, ?raw/?url, картинки — буквальный путь.
  const bare = spec.replace(/\?.*$/, '')
  const p = path.resolve(path.dirname(fromFile), bare)
  if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
  return undefined
}

function newSpec(spec, fromNew, targetNew, targetOld) {
  const query = spec.match(/\?.*$/)?.[0] ?? ''
  const bare = spec.slice(0, spec.length - query.length)
  let rel = path.relative(path.dirname(fromNew), targetNew).split(path.sep).join('/')
  if (!rel.startsWith('.')) rel = './' + rel
  const extT = path.extname(targetNew)
  const isCode = /^\.(ts|tsx|mts|cts|js|mjs|jsx)$/.test(extT)
  if (isCode) {
    const oldBase = path.basename(targetOld, path.extname(targetOld))
    const specLast = bare.split('/').pop()
    if (/\.(js|mjs|cjs|jsx)$/.test(bare) && /^\.(ts|tsx|mts)$/.test(extT)) {
      rel = rel.slice(0, -extT.length) + (extT === '.mts' ? '.mjs' : '.js')
    } else if (/\.(ts|tsx|mts)$/.test(bare)) {
      // .ts в спецификаторе — оставляем как есть
    } else if (oldBase === 'index' && specLast !== 'index' && !bare.endsWith('/index')) {
      // импорт папки ('./engine') — указываем на папку
      rel = rel.slice(0, -('/index' + extT).length) || '.'
      if (rel === '.') rel = './'
    } else {
      rel = rel.slice(0, -extT.length)
    }
  }
  return rel + query
}

const SPEC_RES = [
  /\b(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?(['"])(\.{1,2}\/[^'"\n]*)\1/g,
  /\bimport\(\s*(['"])(\.{1,2}\/[^'"\n]*)\1\s*\)/g,
  /\brequire\(\s*(['"])(\.{1,2}\/[^'"\n]*)\1\s*\)/g,
  /\bvi\.(?:mock|doMock|unmock|doUnmock|importActual|importMock)(?:<[^>]*>)?\(\s*(['"])(\.{1,2}\/[^'"\n]*)\1/g,
  /\bnew URL\(\s*(['"])(\.{1,2}\/[^'"\n]*)\1\s*,\s*import\.meta\.url/g,
]

const writes = new Map()
const problems = []
const suspicious = []
let edits = 0
for (const file of tracked) {
  if (!fs.existsSync(file)) continue
  const fromNew = mapped(file)
  const moved = fromNew !== file
  const text = fs.readFileSync(file, 'utf8')
  const repl = []
  const handled = new Set()
  for (const re of SPEC_RES) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text))) {
      const spec = m[2]
      const specStart = m.index + m[0].indexOf(m[1] + spec + m[1]) + 1
      handled.add(specStart)
      const target = resolve(spec, file)
      if (!target) {
        if (moved) problems.push(`${path.relative(ROOT, file)}: unresolved ${spec}`)
        continue
      }
      const targetNew = mapped(target)
      if (!moved && targetNew === target) continue
      const ns = newSpec(spec, fromNew, targetNew, target)
      if (ns !== spec) repl.push({ start: specStart, end: specStart + spec.length, text: ns })
    }
  }
  if (moved) {
    // Относительные пути, которые не импорт: import.meta.glob, join(dirname(...), '../x'),
    // префиксы строк. Резолвер их не видит — каждый надо проверить руками.
    const LIT = /(['"`])(\.{1,2}\/[^'"`\n]*)\1/g
    let m
    while ((m = LIT.exec(text))) {
      if (handled.has(m.index + 1)) continue
      const line = text.slice(0, m.index).split('\n').length
      suspicious.push(`${path.relative(ROOT, file)}:${line} ${m[2]}`)
    }
  }
  if (repl.length) {
    const uniq = [...new Map(repl.map((r) => [r.start, r])).values()].sort((a, b) => b.start - a.start)
    let out = text
    for (const r of uniq) out = out.slice(0, r.start) + r.text + out.slice(r.end)
    writes.set(fromNew, out)
    edits += uniq.length
  }
}

if (problems.length) {
  console.log('UNRESOLVED in moved files:\n  ' + problems.join('\n  '))
}
if (suspicious.length) console.log('CHECK BY HAND (relative literals that are not imports):\n  ' + suspicious.join('\n  '))
console.log(`${moveList.length} moves, ${writes.size} files rewritten, ${edits} specifiers`)
if (dry) {
  for (const f of writes.keys()) console.log('  ' + path.relative(ROOT, f))
  process.exit(0)
}
for (const [a, b] of moveList) {
  fs.mkdirSync(path.dirname(b), { recursive: true })
  if (noGit) fs.renameSync(a, b)
  else execFileSync('git', ['-C', ROOT, 'mv', path.relative(ROOT, a), path.relative(ROOT, b)])
}
for (const [f, t] of writes) fs.writeFileSync(f, t)
console.log('done')
