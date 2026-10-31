import {describe,it,expect}from'vitest'
import {CANONICAL_MATERIAL_LIMITS,type BrushDescriptor}from'@grafetto/shared'
import fixture from'./fixtures/sourcePngWholePath/bristlesFlowGui.native.json'
import {sourceStrokeAuthorDescriptor}from'./sourceStrokeAuthorDescriptor'
import {SourceStrokeAuthor,type SourceStrokeAuthorProgram,type SourceStrokeAuthorState,type SourceStrokeAuthorStep}from'./sourceStrokeAuthor'
import {KritaRandomSource}from'./nativeRandom'
import {SourceStrokeMaterialAdapter}from'./sourceStrokeMaterialAdapter'
const frames=['a','b','c','d'].map(c=>'asset:'+c.repeat(64))
function program(orderedFrames=frames):SourceStrokeAuthorProgram{
 const out=sourceStrokeAuthorDescriptor(fixture.descriptor as unknown as BrushDescriptor,{asset:fixture.asset,colorIdentity:'black',lodScale:1})
 if(!out.supported)throw Error(out.reasons.join(','))
 const r=out.program.roles[0]
 return{...out.program,id:'incremental-four-frame-test',roles:[{...r,imagePipe:{mode:'incremental',frames:orderedFrames},material:{...r.material,brushIdentity:orderedFrames[0]},spacing:{...r.spacing,value:.08}}]}
}
const packet=(x:number,t:number)=>({x,y:40,t,pressure:1,tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false})
function run(resume=false,random=false,orderedFrames=frames){
 const base=program(orderedFrames),p=random?{...base,roles:[{...base.roles[0],imagePipe:{mode:'random' as const,frames:orderedFrames}}]}:base,author=new SourceStrokeAuthor(p);let state=author.createState(1,2,0)
 const assets=[...new Set(orderedFrames)].map(id=>({id,size:fixture.asset.size,x:fixture.asset.x,y:fixture.asset.y,width:fixture.asset.width,height:fixture.asset.height})),adapter=new SourceStrokeMaterialAdapter(p,{assets,primaryAsset:frames[0],primaryImageFrames:orderedFrames,budget:CANONICAL_MATERIAL_LIMITS},state)
 const steps:SourceStrokeAuthorStep[]=[],recipes:unknown[]=[]
 const accept=(chunks:ReturnType<typeof adapter.finish>)=>{for(const c of chunks)for(const d of c.frame.draws)recipes.push(c.frame.definitions[d.definition])}
 const consume=(iter:Generator<SourceStrokeAuthorStep,SourceStrokeAuthorState>)=>{while(true){const n=iter.next();if(n.done){state=n.value;return}steps.push(n.value);accept(adapter.accept(n.value));const c=adapter.flush();if(c)accept([c]);if(resume){const saved=structuredClone(n.value.state);iter.return(saved);if(!saved.cursor){state=saved;return}iter=new SourceStrokeAuthor(structuredClone(p)).resume(saved)}}}
 for(const input of[packet(40,0),packet(40,60),packet(100,90)]){accept(adapter.beginInput(state));consume(author.plan(state,input))}
 accept(adapter.finish(state));return{state,steps,recipes}
}
describe('incremental image-pipe addDab selection',()=>{
 it('cycles four frames only on material dabs, keeps cache frame identity and resumes every yield',()=>{
  const whole=run();expect(run(true)).toEqual(whole)
  const materials=whole.steps.filter(s=>s.kind==='material')
  expect(materials.length).toBeGreaterThan(8)
  expect(whole.steps.some(s=>s.kind==='query'&&s.query==='spacing')).toBe(true)
  materials.forEach((s,i)=>{expect(s.result!.material!.key.index).toBe(i%4);expect(s.result!.material!.resolvedSource.brushIdentity).toBe(frames[i%4]);expect(s.result!.material!.type).toBe('Dab')})
  expect(whole.recipes.map(r=>(r as {asset:string}).asset)).toEqual(materials.map((_,i)=>frames[i%4]))
  expect(run().recipes).toEqual(whole.recipes)
 })
 it('uses the SAME RNG once per random material and never reselects during resume or replay',()=>{
  const whole=run(false,true);expect(run(true,true)).toEqual(whole)
  const material=whole.steps.filter(s=>s.kind==='material'),rng=new KritaRandomSource(1)
  const indices=material.map(()=>rng.generate(0,3))
  expect(material.map(s=>s.result!.material!.key.index)).toEqual(indices)
  expect(whole.recipes.map(r=>(r as {asset:string}).asset)).toEqual(indices.map(i=>frames[i]))
  expect(whole.state.random.draws).toBe(material.length)
  expect(run(false,true).recipes).toEqual(whole.recipes)
 })
 it('selects the random frame after Opacity/Flow and before material/spacing Mirror in the unified stream',()=>{
  const base=program(),r=base.roles[0],fuzzy={sensors:[{id:'fuzzyPerDab' as const,curve:{points:[{x:0,y:0},{x:1,y:1}]}}],checked:true,useCurve:true},p={...base,roles:[{...r,imagePipe:{mode:'random' as const,frames},mirrorX:true,options:{...r.options,Opacity:{...r.options.Opacity,...fuzzy},Flow:{...r.options.Flow,...fuzzy},Mirror:{...r.options.Mirror,...fuzzy}}}]},a=new SourceStrokeAuthor(p),it=a.plan(a.createState(1,2,0),packet(40,0)),steps:SourceStrokeAuthorStep[]=[]
  while(true){const n=it.next();if(n.done)break;steps.push(n.value)}
  const material=steps.find(s=>s.kind==='material')!,rng=new KritaRandomSource(1)
  rng.generate();rng.generate();const index=rng.generate(0,3)
  expect(material.result!.material!.key.index).toBe(index)
  const opacity=material.result!.events.find(e=>e.option==='Opacity')!,flow=material.result!.events.find(e=>e.option==='Flow')!,mirror=material.result!.events.filter(e=>e.option==='Mirror')
  expect([opacity.drawsBefore,opacity.drawsAfter,flow.drawsBefore,flow.drawsAfter]).toEqual([0,1,1,2])
  expect(mirror.map(e=>[e.stage,e.drawsBefore,e.drawsAfter])).toEqual([['material',3,4],['spacing',4,5]])
  expect(material.state.random.draws).toBe(5)
 })
 it('consumes one random choice even when a repeated frame is served from the dab cache',()=>{
  const base=program(),r=base.roles[0],p={...base,roles:[{...r,imagePipe:{mode:'random' as const,frames},timing:{...r.timing,enabled:true,rate:20,ignoreDistance:true}}]},a=new SourceStrokeAuthor(p)
  let state=a.createState(1,2,0);const steps:SourceStrokeAuthorStep[]=[]
  for(const input of[packet(40,0),packet(40,1000)]){const it=a.plan(state,input);while(true){const n=it.next();if(n.done){state=n.value;break}steps.push(n.value)}}
  const materials=steps.filter(s=>s.kind==='material')
  expect(materials.length).toBeGreaterThan(10)
  expect(materials.some(s=>s.result!.material!.type==='Copy')).toBe(true)
  expect(state.random.draws).toBe(materials.length)
 })
 it('retains repeated ordered frames with unique CAS metadata and frame-index cache separation',()=>{
  const ordered=[frames[0],frames[1],frames[0]],whole=run(false,false,ordered)
  expect(run(true,false,ordered)).toEqual(whole)
  const material=whole.steps.filter(s=>s.kind==='material')
  expect(whole.recipes.map(r=>(r as {asset:string}).asset)).toEqual(material.map((_,i)=>ordered[i%3]))
  expect(material.map(s=>s.result!.material!.key.index)).toEqual(material.map((_,i)=>i%3))
 })
 it('does not consume a pipe frame when size rejects painting before addDab',()=>{
  const base=program(),r=base.roles[0],size={...r.options.Size,useCurve:true,strength:1,sensors:[{id:'pressure' as const,curve:{points:[{x:0,y:0},{x:1,y:1}]}}]},p={...base,roles:[{...r,options:{...r.options,Size:size}}]},a=new SourceStrokeAuthor(p)
  let state=a.createState(1,2,0);const steps:SourceStrokeAuthorStep[]=[]
  for(const input of[{...packet(40,0),pressure:0},packet(100,80)]){const it=a.plan(state,input);while(true){const n=it.next();if(n.done){state=n.value;break}steps.push(n.value)}}
  expect(steps.some(s=>s.query==='paint'&&s.kind==='query')).toBe(true)
  const materials=steps.filter(s=>s.kind==='material')
  expect(materials.length).toBeGreaterThan(0)
  materials.forEach((s,i)=>expect(s.result!.material!.key.index).toBe(i%4))
  expect(state.roles[0].cache.nextSequence).toBe(materials.length)
 })
 it('rejects missing frame assets and malformed pipe declarations before consumption',()=>{
  const p=program(),a=new SourceStrokeAuthor(p),state=a.createState(1,2,0)
  expect(()=>new SourceStrokeMaterialAdapter(p,{assets:[{...fixture.asset,id:frames[0]}],primaryAsset:frames[0],budget:CANONICAL_MATERIAL_LIMITS},state)).toThrow()
  expect(()=>new SourceStrokeAuthor({...p,roles:[{...p.roles[0],imagePipe:{mode:'incremental',frames:[]}}]})).toThrow()
 })
})
