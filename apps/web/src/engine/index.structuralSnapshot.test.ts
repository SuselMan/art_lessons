import {expect,it} from 'vitest'
import type {LayerState,Operation} from '@grafetto/shared'
import {createTestEngine,dab,makeLayerAdd,makeLayerDelete,makeLayerMerge,makeLayerDuplicate,makeStroke,readLayerPixels} from './testing/engineTestUtils'
import {replayLayerState} from '../lib/layers/layers'
import {decodeLayerTiles} from './snapshots'
import {makeInitialLayerState} from '../stores/slices/layerSlice'

const empty:LayerState=makeInitialLayerState()

it.each(['delete','merge','duplicate'] as const)('restores covered structural %s undo from original implicit base and prefix',async kind=>{
 const source=createTestEngine({userId:'A'},{width:8,height:8}).engine
 source.setBaseLayers(Object.keys(empty.items))
 const add=makeLayerAdd('A','S','S',{id:'add1',seq:1})
 const stroke=makeStroke('A','S',[dab(4,4,{size:5,opacity:.7})],{id:'stroke2',seq:2})
 const structural=kind==='delete'?makeLayerDelete('A',['S'],{id:'target3',seq:3}):kind==='merge'?makeLayerMerge('A','R',[{id:'S',opacity:1}],{id:'target3',seq:3}):makeLayerDuplicate('A','R','S',{id:'target3',seq:3})
 const dry:Operation={id:'dry4',type:'paper_dry',userId:'A',timestamp:4,seq:4}
 const prefix:Operation[]=[add,stroke,structural,dry]
 for(const op of prefix)source.appendOperation(op,'remote')

 const restored=createTestEngine({userId:'reader'},{width:8,height:8}).engine
 restored.setBaseLayers(Object.keys(empty.items));restored.suspendDisplay()
 await restored.restoreHistoricalOperations(prefix, true)
 const undo:Operation={id:'undo6',type:'operation_undo',userId:'A',timestamp:6,seq:6,targetOpId:'target3'}
 source.appendOperation(undo,'remote');restored.appendOperation(undo,'remote');restored.resumeDisplay()
 const expectedUI=replayLayerState(empty,source.getOperations())
 const actualUI=replayLayerState(empty,restored.getOperationsSinceRestore())
 const expectedBuffers=[...source['_layers'].keys()].sort(),actualBuffers=[...restored['_layers'].keys()].sort()

 expect(Object.keys(actualUI.items).sort()).toEqual(Object.keys(expectedUI.items).sort())
 expect(actualBuffers).toEqual(expectedBuffers)
 for (const id of Object.keys(expectedUI.items)) expect(readLayerPixels(restored,id)).toEqual(readLayerPixels(source,id))
 const redo: Operation = {id:'redo7',type:'operation_redo',userId:'A',timestamp:7,seq:7,targetOpId:'target3'}
 source.appendOperation(redo,'remote');restored.appendOperation(redo,'remote')
 const redoneUI=replayLayerState(empty,source.getOperations())
 expect(replayLayerState(empty,restored.getOperationsSinceRestore())).toEqual(redoneUI)
 expect([...restored['_layers'].keys()].sort()).toEqual([...source['_layers'].keys()].sort())
 for (const id of Object.keys(redoneUI.items)) expect(readLayerPixels(restored,id)).toEqual(readLayerPixels(source,id))
 source.destroy();restored.destroy()
})


it('reconciles post-watermark source pixels after applying a retained earlier safe snapshot',async()=>{
 const source=createTestEngine({userId:'A'},{width:8,height:8}).engine
 source.setBaseLayers(Object.keys(empty.items))
 const add=makeLayerAdd('A','S','S',{id:'add1',seq:1})
 const first=makeStroke('A','S',[dab(2,2,{size:3,opacity:.7})],{id:'paint2',seq:2})
 source.appendOperation(add,'remote');source.appendOperation(first,'remote')
 const tiles=decodeLayerTiles(source.bakeNetworkSnapshot('S')!,0).tiles
 const rename:Operation={id:'rename3',seq:3,timestamp:3,userId:'A',type:'layer_rename',layerId:'S',name:'renamed'}
 const second=makeStroke('A','S',[dab(6,6,{size:3,opacity:.7})],{id:'paint4',seq:4})
 const prefix=[add,first,rename,second]
 source.appendOperation(rename,'remote');source.appendOperation(second,'remote')
 const restored=createTestEngine({userId:'reader'},{width:8,height:8}).engine
 restored.setBaseLayers(Object.keys(empty.items));restored.suspendDisplay()
 await restored.restoreHistoricalOperations(prefix,true)
 restored.restoreLayerFromSnapshot('S',tiles,2)
 expect(readLayerPixels(restored,'S')).not.toEqual(readLayerPixels(source,'S'))
 await restored.restoreHistoricalOperations(prefix)
 expect(readLayerPixels(restored,'S')).toEqual(readLayerPixels(source,'S'))
 const undo:Operation={id:'undo6',seq:6,timestamp:6,userId:'A',type:'operation_undo',targetOpId:'rename3'}
 source.appendOperation(undo,'remote');restored.appendOperation(undo,'remote');restored.resumeDisplay()
 expect(replayLayerState(empty,restored.getOperationsSinceRestore())).toEqual(replayLayerState(empty,source.getOperations()))
 expect(readLayerPixels(restored,'S')).toEqual(readLayerPixels(source,'S'))
 source.destroy();restored.destroy()
})
