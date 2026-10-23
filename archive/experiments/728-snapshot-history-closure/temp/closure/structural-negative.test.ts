import {expect,it} from 'vitest'
import type {LayerState,Operation} from '@grafetto/shared'
import {createTestEngine,dab,makeLayerAdd,makeLayerDelete,makeLayerMerge,makeLayerDuplicate,makeStroke,readLayerPixels} from '../../apps/web/src/engine/testing/engineTestUtils'
import {replayLayerState} from '../../apps/web/src/lib/layers/layers'
import {makeInitialLayerState} from '../../apps/web/src/stores/slices/layerSlice'
import {writeFileSync,mkdirSync} from 'node:fs'
const empty:LayerState=makeInitialLayerState()
const results:unknown[]=[]
it.each(['delete','merge','duplicate'] as const)('diagnoses covered structural %s undo relative to a full-history engine/UI',async kind=>{
 const source=createTestEngine({userId:'A'},{width:8,height:8}).engine
 source.setBaseLayers(Object.keys(empty.items))
 const add=makeLayerAdd('A','S','S',{id:'add1',seq:1})
 const stroke=makeStroke('A','S',[dab(4,4,{size:5,opacity:.7})],{id:'stroke2',seq:2})
 const structural=kind==='delete'?makeLayerDelete('A',['S'],{id:'target3',seq:3}):kind==='merge'?makeLayerMerge('A','R',[{id:'S',opacity:1}],{id:'target3',seq:3}):makeLayerDuplicate('A','R','S',{id:'target3',seq:3})
 const dry:Operation={id:'dry4',type:'paper_dry',userId:'A',timestamp:4,seq:4}
 const prefix:Operation[]=[add,stroke,structural,dry]
 for(const op of prefix)source.appendOperation(op,'remote')
 const snapshotState=replayLayerState(empty,source.getOperations())
 const restored=createTestEngine({userId:'reader'},{width:8,height:8}).engine
 restored.setBaseLayers(Object.keys(snapshotState.items));restored.suspendDisplay()
 await restored.restoreHistoricalOperations(prefix)
 const undo:Operation={id:'undo6',type:'operation_undo',userId:'A',timestamp:6,seq:6,targetOpId:'target3'}
 source.appendOperation(undo,'remote');restored.appendOperation(undo,'remote');restored.resumeDisplay()
 const expectedUI=replayLayerState(empty,source.getOperations())
 const actualUI=replayLayerState(snapshotState,restored.getOperationsSinceRestore())
 const expectedBuffers=[...source['_layers'].keys()].sort(),actualBuffers=[...restored['_layers'].keys()].sort()
 const pixels=Object.keys(expectedUI.items).map(id=>({id,expected:readLayerPixels(source,id)?.some(v=>v>0)??false,actual:readLayerPixels(restored,id)?.some(v=>v>0)??false}))
 results.push({kind,expectedUI:Object.keys(expectedUI.items).sort(),actualUI:Object.keys(actualUI.items).sort(),expectedBuffers,actualBuffers,pixels})
 // This is an explicit negative diagnostic, not a desired regression PASS.
 expect(Object.keys(actualUI.items).sort()).not.toEqual(Object.keys(expectedUI.items).sort())
 mkdirSync('temp/closure/structural-negative',{recursive:true});writeFileSync('temp/closure/structural-negative/report.json',JSON.stringify(results,null,2))
 source.destroy();restored.destroy()
})
