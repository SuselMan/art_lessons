import{expect,it,vi}from'vitest'
const shared=vi.hoisted(()=>({current:null as any,calls:[]as string[]}))
vi.mock('../../../../temp/owner-fifo-runtime/OwnerRibbonStrokePainter.ts',()=>({RibbonStrokePainter:class{diagnosticSegmented='combined';*paint(...args:any[]){const scratch=args[6],mode=args[12];mode.deferMaterial({metadata:{gesture:scratch.gesture},typedSource:{foreignImport:{enabled:false,dabs:[]},commands:[],rect:[0,0,1,1],composite:{bounds:{minX:0,minY:0,maxX:1,maxY:1},profile:{normalizeDeposit:true},preset:{hardness:1}}},cancel:()=>{}})}}}))
vi.mock('./PrewarmedGlOwnerPool.ts',()=>({PrewarmedGlOwnerPool:class{bytes=156*1024*1024;free=3;next=0;take(){if(!this.free)return null;this.free--;const fields=Object.fromEntries(['presentation','original','coverage','coverageFilm','pigmentLoad','pigmentBase','pigmentFilm','colourLoad','colourBase','colourFilm','solventLoad','solventBase','solventFilm'].map(role=>[role,{width:1024,height:1024,texture:{id:++this.next},copyTo(){}}]));let used=false;return{fields,bytes:52*1024*1024,resources:Object.entries(fields).map(([role,f]:any)=>({identity:f.texture,role:role==='presentation'?'presentation':'canonical-source',width:1024,height:1024})),release:()=>{if(!used){used=true;this.free++}}}}disposeAfterFence(){if(this.free!==3)throw Error('active leases')}}}))
vi.mock('./OwnedGlPreparedSource.ts',()=>({OwnedGlPreparedSource:class{private lease:any;constructor(input:any){this.lease=input.lease}paint(){shared.calls.push('visible-source')}retire(){this.lease.release()}}}))
vi.mock('./TypedGlSourceReplayPrototype.ts',()=>({TypedGlSourceReplayPrototype:class{constructor(private input:any){}execute(port:any){const binding=port.bindCurrentCanonical();expect(binding.landedVersion).toBe(this.input.expectedPredecessorVersion);shared.calls.push('canonical-base:'+binding.fields.pigmentLoad.version)}}}))
vi.mock('./PreparedGlSourceDraw.ts',()=>({createPreparedGlSourcePort:(input:any)=>({bindCurrentCanonical:input.bindCurrentCanonical})}))
import{installOwnerFifo}from'./owner-fifo-install.mjs'
import{watercolorWashSignature}from'../../../../apps/web/src/engine/src/presets/watercolorPresets'
function fixture(){
 const field=()=>({width:1024,height:1024,texture:{},version:0}),target={buffer:field(),originX:0,originY:0},entry={original:field(),coverage:field(),inkLoad:field(),inkColor:field()};const requests:any[]=[]
 const scratch:any={gesture:0,tileEntries:()=>[][Symbol.iterator](),captureCanonicalFinish:()=>({gesture:scratch.gesture}),activateMaterialFilm(){},getOrCreate:()=>entry,filmBuffers:()=>({strokeInk:field(),inkBase:field(),strokeColor:field(),colorBase:field()}),runningCoverage(){},solventFilm:()=>({load:field(),base:field(),film:field()})};
 const e:any={gl:{isContextLost:()=>false,finish:vi.fn()},_pageSize:()=>({w:1024,h:1024}),_opts:{tool:'watercolor',pencilType:'normal:100:100',graphiteColor:[.2,.3,.4]},_activeId:'layer',_layers:new Map([['layer',{}]]),_ribbonStrokeScratch:scratch,_ribbonPainter:{},_ribbonPainterContext:{resolveWithinSheet:()=>[target]},_minmaxExt:{},_wcCanonical:{ctx:{blocked:()=>false},get pending(){return false},enqueue(request:any){requests.push(request)},cancel(lost:boolean){for(const r of requests)r.cancel(lost);requests.length=0}},_asyncLocalPreviewTiles:()=>new Map(),_holdAsyncScratch(){},_releaseAsyncScratch(){},_markPaperDamage(){},_invalidateSplitCache(){},_scheduleDisplay(){},_drawRibbonCompositeRect(){shared.calls.push('canonical-composite')},_ribbonStrokeWork(){throw Error('unexpected fallback')},_onStart(){scratch.gesture++;e._strokeLayerId='layer';e._wash={scratch,layerId:'layer',signature:watercolorWashSignature(e._opts.pencilType,e._opts.graphiteColor),endedAt:performance.now()};const work=e._ribbonStrokeWork({},[],{},'normal',{},[],scratch,undefined,undefined,undefined,true);while(!work.next().done){}},_finishRibbonStroke(){e._wcCanonical.enqueue({execute:function*(){entry.inkLoad.version++;yield 0},cancel(){}})}};
 const status=vi.fn(),owner=installOwnerFifo(e,{status});return{e,owner,scratch,requests,status}
}
it('admits three without draining and old FIFO land keeps newest overlay; late base changes are observed',()=>{
 shared.calls=[];const {e,owner,scratch,requests,status}=fixture();
 for(let n=0;n<3;n++){e._onStart({});e._finishRibbonStroke(scratch);e._strokeLayerId=null}
 expect(owner.snapshot().owners).toHaveLength(3);expect(shared.calls.filter(x=>x==='visible-source')).toHaveLength(3);e._onStart({});expect(scratch.gesture).toBe(3);expect(status).toHaveBeenLastCalledWith(expect.stringContaining('заполнена'))
 const latest=e._asyncLocalPreviewTiles().get('layer')[0].buffer;
 for(let n=0;n<2;n++){const work=requests.shift().execute();while(!work.next().done){}}
 expect(owner.snapshot().owners).toHaveLength(2);expect(e._asyncLocalPreviewTiles().get('layer')[0].buffer).toBe(latest)
 while(requests.length){const work=requests.shift().execute();while(!work.next().done){}}
 expect(shared.calls.filter(x=>x.startsWith('canonical-base:'))).toEqual(['canonical-base:0','canonical-base:1','canonical-base:2']);expect(owner.snapshot().owners).toHaveLength(0);owner.dispose()
})
it('cross-wash rejection precedes original pointer mutation and keeps existing overlay',()=>{
 const {e,owner,scratch,status}=fixture();e._onStart({});e._finishRibbonStroke(scratch);e._strokeLayerId=null;const before=e._asyncLocalPreviewTiles().get('layer')[0].buffer;e._activeId='different';e._onStart({});expect(scratch.gesture).toBe(1);expect(status).toHaveBeenLastCalledWith(expect.stringContaining('сменой'));expect(e._asyncLocalPreviewTiles().get('layer')[0].buffer).toBe(before);owner.dispose()
})
it('dispose cancels pending canonical work and fences active lease before restoring the ordinary renderer',()=>{
 const {e,owner,scratch,requests}=fixture();e._onStart({});e._finishRibbonStroke(scratch);const work=requests[0].execute();work.next();expect(owner.snapshot().active).not.toBeNull();owner.dispose();expect(e.gl.finish).toHaveBeenCalled();expect(owner.snapshot().active).toBeNull();expect(owner.snapshot().bytes).toBe(0);expect(e._wcAsyncFinish).toBeUndefined();owner.dispose()
})
