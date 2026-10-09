import {test} from 'node:test'
import assert from 'node:assert/strict'
import {installInteractiveMarkers,assertInteractiveMarkers} from './interactive-markers.mjs'
test('markers preserve return/throw/arguments and original promise; restore removes listeners',()=>{
 class Executor{emitPrepared(v){if(v==='fail')throw Error('original');return v}}
 const promise=Promise.resolve('same');class BufferClass{restoreCanvasPixels(){return promise}}
 const listeners=new Map(),target={addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)},original=Executor.prototype.emitPrepared;let tick=0
 const probe=installInteractiveMarkers({engine:{_wcCanonical:{pending:true}},Executor,BufferClass,eventTarget:target,now:()=>++tick})
 probe.setLabel('first');listeners.get('pointerdown')({pointerType:'pen'});assert.equal(new Executor().emitPrepared(123),123);assert.equal(new BufferClass().restoreCanvasPixels(),promise);assert.throws(()=>new Executor().emitPrepared('fail'),/original/);probe.restore();assert.equal(Executor.prototype.emitPrepared,original);assert.equal(listeners.size,0);assert.ok(probe.rows.every(x=>x.pending===true))
})
test('READY/order/labels/overflow fail closed without readbacks',()=>{
 const rows=['first','next'].flatMap((label,i)=>[{label,phase:'pointerdown',at:10+i*20,pending:i>0},{label,phase:'source:entry',strokeId:'id'+i,at:11+i*20},{label,phase:'canvasPublication:entry',at:12+i*20},{label,phase:'pointerup',strokeId:'id'+i,at:13+i*20}]),config={rows,overflow:false,readyAt:9,labels:['first','next']}
 assert.equal(assertInteractiveMarkers(config)[1].nextPendingAtDown,true);assert.throws(()=>assertInteractiveMarkers({...config,readyAt:11}));assert.throws(()=>assertInteractiveMarkers({...config,overflow:true}));assert.throws(()=>assertInteractiveMarkers({...config,rows:rows.filter(x=>x.phase!=='canvasPublication:entry')}))
})
test('queued previous source remains attached to its stroke instead of next DOWN',()=>{
 class Executor{emitPrepared(chunk){return chunk}};class BufferClass{restoreCanvasPixels(){}}
 const engine={_strokeId:'old',_wcCanonical:{pending:true}},listeners=new Map(),target={addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)}
 const probe=installInteractiveMarkers({engine,Executor,BufferClass,eventTarget:target});try{probe.setLabel('first');new Executor().emitPrepared({strokeId:'old'});listeners.get('pointerup')({pointerType:'pen'});probe.setLabel('next');engine._strokeId='new';listeners.get('pointerdown')({pointerType:'pen'});new Executor().emitPrepared({strokeId:'old'});new Executor().emitPrepared({strokeId:'new'});const old=probe.rows.filter(x=>x.phase==='source:entry'&&x.strokeId==='old');assert.ok(old.every(x=>x.label==='first'));assert.equal(probe.rows.find(x=>x.phase==='source:entry'&&x.strokeId==='new').label,'next')}finally{probe.restore()}
})
