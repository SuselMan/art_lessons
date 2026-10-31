import fs from 'node:fs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import ts from 'typescript'
import {instrumentColdModule} from './cold-allocation-profile-transform.mts'
const prefix='temp/device-runs/krita-stroke-20261024/fixes-v52/', paths=['apps/web/src/engine/src/buffers/AccumulationBuffer.ts','apps/web/src/engine/src/dabs/BrushGlState.ts']
const hash=(s:string)=>createHash('sha256').update(s).digest('hex')
function inspect(file:string,source:string){const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),calls:string[]=[],classes:string[]=[],constructors:string[]=[];function visit(n:ts.Node){if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&/(?:^|\.)gl$/i.test(n.expression.expression.getText(ast)))calls.push(n.getText(ast).replace(/\s+/g,' '));if(ts.isClassDeclaration(n)){classes.push(n.name?.text??'');for(const m of n.members)if(ts.isConstructorDeclaration(m))constructors.push(m.parameters.map(p=>p.getText(ast)).join(','))}ts.forEachChild(n,visit)}visit(ast);return{calls,classes,constructors}}
const rows=paths.map(file=>{const source=fs.readFileSync(file,'utf8'),changed=instrumentColdModule(file,source);assert(changed);const before=inspect(file,source),after=inspect(file,changed.contents);assert.deepEqual(after,before);assert(before.calls.length>0);return{file,originalSHA256:hash(source),transformedSHA256:hash(changed.contents),glCallExpressions:before.calls.length,classNames:before.classes,constructorSignaturesUnchanged:true,glCallsAndOrderUnchanged:true,patches:changed.patches}})
fs.writeFileSync(prefix+'cold-allocation-transform-integrity.json',JSON.stringify({scope:'Static original/transformed AST comparison, not device performance proof',rows},null,2)+'\n');console.log(JSON.stringify({pass:true,rows}))
