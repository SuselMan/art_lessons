import {expect,it} from 'vitest'
import {createTestEngine,makeLayerAdd,paperReady,simulateStrokeStart,simulateStrokeMove,simulateStrokeEnd,readTilePixels} from './testing/engineTestUtils'

it.fails('an ordinary held pencil remains visible when a live snapshot arrives, until its operation can repair',async()=>{
 const {engine}=createTestEngine({userId:'A',pageWidth:32,pageHeight:32,size:5},{width:32,height:32})
 await paperReady(engine)
 try{
  engine.appendOperation({...makeLayerAdd('B','L'),seq:1},'remote');engine.setActiveLayer('L');engine.setTool('pencil')
  simulateStrokeStart(engine,4,8);simulateStrokeMove(engine,10,8)
  const before=readTilePixels(engine,'L',0,0,32,32)!.slice()
  expect(before.some(value=>value>0)).toBe(true)
  engine.restoreLayerFromSnapshot('L',[{originX:0,originY:0,width:32,height:32,pixels:new Uint8Array(4096)}],1)
  expect(readTilePixels(engine,'L',0,0,32,32)).toEqual(before)
  simulateStrokeMove(engine,20,8);simulateStrokeEnd(engine,24,8)
 }finally{engine.destroy()}
})
