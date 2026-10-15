import {AccumulationBuffer} from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import {RibbonStrokeScratch} from '../../../../apps/web/src/engine/src/buffers/RibbonStrokeScratch'
import {ribbonWaterDelivery} from '../../../../apps/web/src/engine/src/dabs/ribbonStrokeMath'
import {createNativePuddleTarget as createKernel, type NativePuddleTargetOptions} from './native-target'
import {createLocalGoal} from './local-goal-v04'
import {WetComponents,type WetComponent} from './components-draft'

/** One shared solver, queued per whole puddle. Unfinished remote puddles stay pending. */
export function createNativePuddleTarget(engine:any,size:number,options:NativePuddleTargetOptions={}){
 const gl:WebGLRenderingContext=engine.gl,pool=engine._ribbonScratchPool,topology=new WetComponents(size)
 const make=()=>new AccumulationBuffer(gl,size,size,'nearest')
 const raw={p:make(),c:make(),coverage:make(),solvent:make()},out={p:make(),c:make(),coverage:make()},original=make(),empty=make(),mask=createLocalGoal(gl,size)
 for(const b of [...Object.values(raw),...Object.values(out),original,empty])b.clear()
 type Record={component:WetComponent;ctx:any;sc:any;paints:string[];travel:any[];direction:[number,number]}
 const records=new Map<number,Record>()
 let active:Record|null=null,lastRevision=-1,initialized=false,destroyed=false
 const prepare=options.prepare??engine._settlePlan.prepare
 const core=createKernel(engine,size,{...options,prepare:function(...args:any[]){
  if(active){args[6]=Math.min(args[6],active.component.wet);args[7]=active.component.wet;args[8]=Math.min(args[8],active.component.wet);if(args[0].dryCtx)args[0].dryCtx.standing=active.component.wet}
  return prepare.apply(engine._settlePlan,args)
 }})
 const state={epoch:0,iterations:0,total:0,done:true,revision:0}
 let tile:any=null
 function publish(){const b=core.buffers();for(const k of ['p','c','coverage'] as const)mask.merge(out[k],b[k],out[k]);state.revision++}
 function start(){
  active=[...records.values()].find(r=>r.component.pending)??null
  if(!active){state.done=true;return}
  const r=active,s=new RibbonStrokeScratch(pool,true,true),entry=s.getOrCreate(tile.buffer)
  mask.reset(r.component.contacts)
  original.copyTo(entry.original)
  mask.merge(empty,raw.p,entry.inkLoad!);mask.merge(empty,raw.c,entry.inkColor!);mask.merge(empty,raw.coverage,entry.coverage)
  entry.solventLoad=pool.acquire(size,size);mask.merge(empty,raw.solvent,entry.solventLoad!)
  const bounds={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity}
  for(const d of r.component.contacts){const radius=d.radius*Math.max(1,d.aspect);bounds.minX=Math.min(bounds.minX,d.x-radius);bounds.maxX=Math.max(bounds.maxX,d.x+radius);bounds.minY=Math.min(bounds.minY,d.y-radius);bounds.maxY=Math.max(bounds.maxY,d.y+radius)}
  s.gesture=state.epoch
  for(const paint of r.paints)s.paints.add(paint)
  s.brushTravel=r.travel.map(d=>({...d}));s.wetContacts=r.component.contacts.map(d=>({...d}));s.foreignSources=null
  s.noteFinish({...r.ctx,bounds,landedWet:Math.min(r.ctx.landedWet,r.component.wet),wetPeak:Math.min(r.ctx.wetPeak,r.component.wet)})
  s.compositeScalars(()=>({...r.sc,fieldSeed:[...r.sc.fieldSeed]}));s.noteDirection(...r.direction)
  try{core.resetFromScratch(s,tile,state.epoch)}finally{s.destroy()}
  lastRevision=core.state.revision;state.total+=core.state.total
 }
 function cancel(){if(active)active.component.pending=true;core.cancel();active=null;state.done=true}
 return {
  state,
  resetFromScratch(source:RibbonStrokeScratch,nextTile:any,epoch:number){
   cancel();tile=nextTile;const e=source.peek(tile.buffer),ctx=source.finishContext
   if(!e?.inkLoad||!e.inkColor||!ctx)throw Error('Component target needs material and context')
   const contacts=source.wetContacts.length?source.wetContacts:source.brushTravel.length?source.brushTravel:[{x:(ctx.bounds.minX+ctx.bounds.maxX)/2,y:(ctx.bounds.minY+ctx.bounds.maxY)/2,radius:Math.max(.5,(ctx.bounds.maxY-ctx.bounds.minY)/2),aspect:Math.max(1,(ctx.bounds.maxX-ctx.bounds.minX)/Math.max(1,ctx.bounds.maxY-ctx.bounds.minY)),angle:0}]
   const delivery=ribbonWaterDelivery(ctx.profile)
   const dose=delivery.water*(delivery.retain+(1-delivery.retain)*Math.min(1,ctx.landedWet))
   const joined=topology.add(contacts,dose)
   for(const id of joined.joined)records.delete(id)
   const sc=source.compositeScalars(()=>({spreadPx:0,inkSmoothPx:0,water:0,migratePx:0,fieldSeed:[0,0],bristleRadiusPx:0}))
   records.set(joined.component.id,{component:joined.component,ctx:{...ctx,profile:{...ctx.profile}},sc:{...sc,fieldSeed:[...sc.fieldSeed]},paints:[...source.paints],travel:source.brushTravel.map(d=>({...d})),direction:source.noteDirection(0,0)})
   mask.reset(joined.component.contacts)
   for(const [k,b] of [['p',e.inkLoad],['c',e.inkColor],['coverage',e.coverage],['solvent',e.solventLoad??empty]] as const)mask.merge(raw[k],b,raw[k])
   e.original.copyTo(original)
   if(!initialized){for(const k of ['p','c','coverage'] as const)raw[k].copyTo(out[k]);initialized=true}
   else for(const k of ['p','c','coverage'] as const)mask.merge(out[k],raw[k],out[k])
   state.epoch=epoch;state.iterations=0;state.total=0;state.done=false;state.revision++
   start()
  },
  step(maxOps=1){
   if(destroyed||state.done)return state
   let remaining=Math.max(0,Math.floor(maxOps))
   while(active&&remaining>0){const before=core.state.iterations;core.step(remaining);const used=core.state.iterations-before;remaining-=Math.max(1,used);state.iterations+=used
    if(core.state.revision!==lastRevision){lastRevision=core.state.revision;publish()}
    if(core.state.done){active.component.pending=false;active=null;start()}else break
   }
   return state
  },
  buffers:()=>out,
  cancel,
  forget(){cancel();topology.reset();records.clear();initialized=false},
  dry(){if(!state.done)return false;out.coverage.copyTo(core.buffers().coverage);if(!core.dry())return false;core.buffers().coverage.copyTo(out.coverage);state.revision++;return true},
  diagnostic(){return topology.components.map(c=>({id:c.id,cells:c.cells.size,wet:c.wet,pending:c.pending}))},
  destroy(){if(destroyed)return;cancel();destroyed=true;core.destroy();mask.destroy();for(const b of [...Object.values(raw),...Object.values(out),original,empty])b.destroy();records.clear();topology.reset()},
 }
}
