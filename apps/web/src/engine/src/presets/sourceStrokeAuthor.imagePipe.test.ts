import {describe,it,expect}from'vitest'
import {CANONICAL_MATERIAL_LIMITS,type BrushDescriptor}from'@grafetto/shared'
import fixture from'./fixtures/sourcePngWholePath/bristlesFlowGui.native.json'
import {sourceStrokeAuthorDescriptor}from'./sourceStrokeAuthorDescriptor'
import {SourceStrokeAuthor,type SourceStrokeAuthorProgram,type SourceStrokeAuthorState,type SourceStrokeAuthorStep}from'./sourceStrokeAuthor'
import {SourceStrokeMaterialAdapter}from'./sourceStrokeMaterialAdapter'
const frames=['a','b','c','d'].map(c=>'asset:'+c.repeat(64))
function program():SourceStrokeAuthorProgram{
 const out=sourceStrokeAuthorDescriptor(fixture.descriptor as unknown as BrushDescriptor,{asset:fixture.asset,colorIdentity:'black',lodScale:1})
 if(!out.supported)throw Error(out.reasons.join(','))
 const r=out.program.roles[0]
 return{...out.program,id:'incremental-four-frame-test',roles:[{...r,imagePipe:{mode:'incremental',frames},material:{...r.material,brushIdentity:frames[0]},spacing:{...r.spacing,value:.08}}]}
}
const packet=(x:number,t:number)=>({x,y:40,t,pressure:1,tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false})
function run(resume=false){
 const p=program(),author=new SourceStrokeAuthor(p);let state=author.createState(1,2,0)
 const assets=frames.map(id=>({id,size:fixture.asset.size,x:fixture.asset.x,y:fixture.asset.y,width:fixture.asset.width,height:fixture.asset.height})),adapter=new SourceStrokeMaterialAdapter(p,{assets,primaryAsset:frames[0],primaryImageFrames:frames,budget:CANONICAL_MATERIAL_LIMITS},state)
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
