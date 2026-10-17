import {PuddleRoomController} from './src/watercolor/puddle/PuddleRoomController'
import {afterEach,expect,it,vi} from 'vitest'
import type {Operation} from '@grafetto/shared'
import {createTestEngine,dab,makeLayerAdd,makeStroke,paperReady,readLayerPixels} from './testing/engineTestUtils'
const preset='normal:95:34:PB29:round:wc@m70-r2-v1'
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks()})
const at=1700000000000
function mark(id:string,x:number,color:[number,number,number],extra:Partial<Operation>={}){
 return makeStroke('A','L',[dab(x,20),dab(x+8,20)],{id,strokeId:id,tool:'watercolor',preset,color,timestamp:at,...extra} as Parameters<typeof makeStroke>[3])
}
const base=[mark('left',8,[0,0,1]),mark('right',42,[1,0,0]),mark('water',24,[0,0,0],{preset:'normal:100:0:PB29:round:wc@m70-r2-v1'}),makeStroke('B','L',[dab(8,20),dab(50,20)],{id:'bridge',strokeId:'bridge',tool:'watercolor',preset,color:[0,1,0],timestamp:at+10})]
async function replay(ops:Operation[],hidden:boolean){
 const {engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1',pageWidth:64,pageHeight:64},{width:64,height:64})
 await paperReady(engine);vi.useFakeTimers();Object.defineProperty(engine['gl'],'colorMask',{value:vi.fn(),configurable:true})
 engine.diagnosticM70HiddenReplay=hidden
 engine.appendOperation(makeLayerAdd('A','L'),'remote')
 for(const op of ops)engine['_log'].append(op)
 const target=engine['_layers'].get('L')!,puddle=engine['_puddleFor']()
 if(!(puddle instanceof PuddleRoomController))throw Error('Small-page test requires monolithic controller')
 const host=puddle['host'],render=vi.spyOn(host,'render'),solver=puddle['solver'],reset=solver.resetFromScratch.bind(solver)
 const material:Array<Record<string,Uint8Array|null>>=[]
 vi.spyOn(solver,'resetFromScratch').mockImplementation((scratch,tile,epoch)=>{
  const entry=scratch.peek(tile.buffer)!,snapshot:Record<string,Uint8Array|null>={}
  for(const name of ['original','inkLoad','inkColor','coverage','solventLoad','foreignSolventLoad'] as const)snapshot[name]=entry[name]?.readPixels().slice()??null
  material.push(snapshot);return reset(scratch,tile,epoch)
 })
 try{
  engine['_replayInto'](target,'L',engine['_log'].layerPixelOps('L'),false)
  const deferredRenderCalls=render.mock.calls.length
  puddle.canonicalTiles(target)
  return {pixels:readLayerPixels(engine,'L'),material,deferralCleared:engine['_hiddenM70Replay'].size===0,renderCalls:deferredRenderCalls}
 }finally{engine.destroy()}
}
for(const[name,ops]of [
 ['mixed-water-bridge',base],
 ['dry-boundary',[...base,{id:'dry',type:'paper_dry',userId:'B',layerId:'L',timestamp:at+20},mark('after',26,[1,1,0],{timestamp:at+21})]],
 ['undone-dry',[...base,{id:'dry',type:'paper_dry',userId:'B',layerId:'L',timestamp:at+20},{id:'undoDry',type:'operation_undo',userId:'B',targetOpId:'dry',timestamp:at+21},mark('after',26,[1,1,0],{timestamp:at+22})]],
 ['ordinary-pixel-boundary',[...base,makeStroke('B','L',[dab(20,30)],{id:'pencil',tool:'pencil',timestamp:at+20}),mark('after',26,[1,1,0],{timestamp:at+21})]],
 ['clear-boundary',[...base,{id:'clear',type:'layer_clear',userId:'B',layerId:'L',timestamp:at+20},mark('after',26,[1,1,0],{timestamp:at+21})]],
] as Array<[string,Operation[]]>)it(`retains canonical source bytes with hidden presentation on ${name}`,async()=>{
 const old=await replay(ops,false),next=await replay(ops,true)
 // MockGL is not a watercolor raster oracle. These compare actual source
 // uploads/copy geometry and the same native call path, never artistic pixels.
 expect(old.material.length).toBeGreaterThan(0)
 expect(old.material.some(snapshot=>Object.values(snapshot).some(bytes=>bytes?.some(value=>value!==0)))).toBe(true)
 expect(next.material.length).toBe(old.material.length)
 for(let i=0;i<old.material.length;i++)for(const key of Object.keys(old.material[i]))expect(next.material[i][key]).toEqual(old.material[i][key])
 expect(next.pixels).toEqual(old.pixels);expect(next.deferralCleared).toBe(true)
 expect(next.renderCalls).toBeLessThan(old.renderCalls)
})
it('clears the target-local guard in finally when synchronous replay fails',async()=>{
 const {engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1'},{width:64,height:64});await paperReady(engine);vi.useFakeTimers()
 engine.diagnosticM70HiddenReplay=true;engine.appendOperation(makeLayerAdd('A','L'),'remote')
 const target=engine['_layers'].get('L')!,failure=Error('cancelled replay')
 vi.spyOn(engine as unknown as {_applyPixelOp():void},'_applyPixelOp').mockImplementation(()=>{throw failure})
 try{expect(()=>engine['_replayInto'](target,'L',[base[0]],false)).toThrow(failure);expect(engine['_hiddenM70Replay'].size).toBe(0)}finally{engine.destroy()}
})
it('returns the suspended source generator and clears only its hidden rebuild target on cancel',async()=>{
 const {engine}=createTestEngine({userId:'A',watercolorModel:'m70-r2-v1'},{width:64,height:64});await paperReady(engine);vi.useFakeTimers();engine.diagnosticM70HiddenReplay=true
 engine.appendOperation(makeLayerAdd('A','L'),'remote');engine['_log'].append(base[0]);engine['_startRebuildJob']('L')
 const job=engine['_rebuildJobs'].get('L')!,finalized=vi.fn();const work=(function*():Generator<number,undefined,void>{try{yield 1}finally{finalized()}return undefined})();work.next()
 job.part={opId:'left',dabs:[],work}
 try{expect(engine['_hiddenM70Replay'].has(job.fresh)).toBe(true);engine['_cancelRebuildJob']('L');expect(finalized).toHaveBeenCalledOnce();expect(engine['_hiddenM70Replay'].size).toBe(0)}finally{engine.destroy()}
})
