import ts from 'typescript'
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const before = execFileSync('git', ['show', 'b7d2b6a9:apps/web/src/engine/index.ts'], {encoding:'utf8'})
const parse = s => ts.createSourceFile('code.ts', s, ts.ScriptTarget.Latest, true)
const nodes = parse(before).statements
const out = []
for (const file of ['RibbonScratchPool', 'RibbonStrokeScratch']) {
  for (const n of parse(readFileSync(`apps/web/src/engine/src/buffers/${file}.ts`, 'utf8')).statements) {
    if (ts.isImportDeclaration(n)) continue
    const text = n.getText().replace(/^export /, '')
    if (!nodes.some(old => old.getText() === text)) throw new Error('Changed declaration: ' + text.slice(0,100))
    out.push(n.name?.getText() ?? text.split('\n')[0])
  }
}
writeFileSync('temp/494-ribbon-scratch/move-proof.json', JSON.stringify({identicalDeclarations: out}, null, 2))
console.log(`${out.length} moved declarations exactly match the baseline (export modifiers excluded)`)
const afterNodes = parse(readFileSync('temp/494-ribbon-scratch/index.after.ts','utf8')).statements.filter(n => !ts.isImportDeclaration(n)).map(n => n.getText())
const movedNames = new Set(out)
const keptBefore = nodes.filter(n => !ts.isImportDeclaration(n) && !movedNames.has(n.name?.getText() ?? n.getText().split('\n')[0])).map(n => n.getText())
if (JSON.stringify(keptBefore) !== JSON.stringify(afterNodes)) throw new Error('Engine declarations changed beyond the move')
console.log('Every remaining engine declaration is unchanged (imports excluded)')
