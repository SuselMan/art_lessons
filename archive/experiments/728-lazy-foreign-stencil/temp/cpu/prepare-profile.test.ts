import { it, vi, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createTestEngine } from '../../apps/web/src/engine/testing/engineTestUtils'
import * as foreign from '../../apps/web/src/engine/src/watercolor/foreignWater'
import * as drag from '../../apps/web/src/engine/src/watercolor/brushDrag'

it('profiles original retained1396 packed operations without a new analogue', async () => {
 const path='/home/suselman/projects/pencil-agents/728-canonical-backlog-budget/temp/canonical-budget/retained1396-input.json'
 const raw=readFileSync(path), input=JSON.parse(raw.toString())
 const {engine}=createTestEngine({pageWidth:1754,pageHeight:2480,paper:'fine'},{width:512,height:512})
 engine.setBaseLayers(['layer-1']); engine.setActiveLayer('layer-1'); await engine.paperReady()
 const stages:any[]=[]; const geometry:any[]=[]; const callerStages:any[]=[]; let seq=0, current:any=null
 const spies:any[]=[]
 for(const [module,name] of [[foreign,'foreignWaterStencil'],[drag,'brushDragContactGroups'],[drag,'brushDragContacts'],[drag,'brushDragField']] as const){
  const fn=(module as any)[name]
  spies.push(vi.spyOn(module as any,name).mockImplementation((...args:any[])=>{const t=performance.now();const out=fn(...args);const elapsed=performance.now()-t; if(current)current.children.push({name,elapsed,counts:args[0]?.length,contacts:args[1]?.length,rect:args[name==='foreignWaterStencil'?2:1],output:out?.pixels?.byteLength??out?.length??0});return out}))
 }
 for(const [obj,key] of [[engine,'_finishRibbonStroke'],[engine,'_flushLiveComposite'],[engine,'_revealWash'],[engine,'_diffuseWashOps'],[engine['_settlePlan']['ctx'],'fieldFor'],[engine['_ribbonScratchPool'],'acquire']] as const){
  const fn=(obj as any)[key]
  spies.push(vi.spyOn(obj as any,key).mockImplementation((...args:any[])=>{const t=performance.now();try{return fn.apply(obj,args)}finally{callerStages.push({seq,name:key,elapsed:performance.now()-t})}}))
 }
 const original=engine['_settlePlan'].prepare.bind(engine['_settlePlan'])
 const prepare=vi.spyOn(engine['_settlePlan'],'prepare').mockImplementation((...args)=>{
  const t=performance.now();current={seq,children:[],travel:(args[12]??args[0]).brushTravel.length,foreign:(args[12]??args[0]).foreignSources?.map(s=>s.footprints.length),wetContacts:(args[12]??args[0]).wetContacts.length};
  const metadata=args[12]??args[0]
  geometry.push({seq,brushTravel:structuredClone(metadata.brushTravel),wetContacts:structuredClone(metadata.wetContacts),foreignSources:structuredClone(metadata.foreignSources),paints:[...metadata.paints]})
  try{return original(...args)}finally{current.elapsed=performance.now()-t;stages.push(current);current=null}
 })
 try{
  for(const op of input.ops){seq=op.seq;engine.appendOperation(op,'remote');engine['_completeSettle']()}
  expect(stages.length).toBeGreaterThan(0)
  writeFileSync('temp/cpu/prepare-profile-baseline.json',JSON.stringify({scope:'CPU MockGL, actual packed retained1396; no hardware/GL-duration claim',input:path,inputSHA:createHash('sha256').update(raw).digest('hex'),source:'ff5a8db6',stages,callerStages},null,2))
  writeFileSync('temp/cpu/prepare-geometry.json',JSON.stringify({inputSHA:createHash('sha256').update(raw).digest('hex'),geometry,rects:stages.map(s=>({seq:s.seq,rect:s.children.find(c=>c.name==='foreignWaterStencil').rect}))},null,2))
 }finally{prepare.mockRestore();spies.forEach(s=>s.mockRestore());engine.destroy()}
},120000)
