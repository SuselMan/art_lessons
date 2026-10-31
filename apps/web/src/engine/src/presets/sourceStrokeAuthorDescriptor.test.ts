import { describe, expect, it } from 'vitest'
import { isBrushLibrary, isSourceStampData, sourceStampDataBudget, MAX_SOURCE_STAMP_BUDGET, type BrushDescriptor, type SourceStampData } from '@grafetto/shared'
import fixture from './fixtures/sourceStrokeAuthorDescriptor.imported.json'
import compiledFixture from './fixtures/sourceStrokeAuthorDescriptor.compiled.json'
import { sourceStrokeAuthorDescriptor, type SourceAuthorDescriptorContext } from './sourceStrokeAuthorDescriptor'
import { SourceStrokeAuthor, type SourceAuthorPacket } from './sourceStrokeAuthor'

type Mutable<T>={-readonly[P in keyof T]:Mutable<T[P]>}
const descriptor=()=>structuredClone(fixture.descriptor) as unknown as Mutable<BrushDescriptor>
const context:SourceAuthorDescriptorContext={colorIdentity:'native-rgba8:0,0,0,255',lodScale:1,asset:fixture.asset}
function identity(){
  const d=descriptor()
  for(const option of d.sourceStamp!.options){
    const curve={text:'0,0;1,1;',points:[{x:0,y:0,corner:false},{x:1,y:1,corner:false}]}
    option.commonCurve=curve
    for(const sensor of option.sensors)Object.assign(sensor,{curve})
  }
  return d
}
const packet=(t:number,x=0):SourceAuthorPacket=>({x,y:0,t,pressure:.5,tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:false,mirroredV:false,tiltDirectionOffset:0,hover:false})

describe('real descriptor to source author, explicit capability boundary',()=>{
  it('does not reinterpret retained soft source as an image author even with a valid asset',()=>{
    const d=identity()
    Object.assign(d.sourceStamp!,{version:2,source:{kind:'softAuto',generator:'soft',shape:'circle',diameter:3,ratio:5/3,horizontalFade:0,verticalFade:0,antialias:false,spikes:2,randomness:0,density:1,softnessCurve:{text:'0,1;1,0',points:[{x:0,y:1,corner:false},{x:1,y:0,corner:false}]}}})
    Object.assign(d.sourceStamp!.brush,{scale:1})
    expect(isSourceStampData(d.sourceStamp)).toBe(true)
    expect(sourceStrokeAuthorDescriptor(d,context)).toEqual({supported:false,reasons:['unsupported-soft-auto-material-consumer']})
  })

  it('passes the production shared library boundary with source data and rejects a corrupt retained slot',()=>{
    const d=descriptor(),library={schemaVersion:1,assets:[{...fixture.asset,file:fixture.asset.id.slice(6)+'.bin'}],skipped:[],brushes:[{name:'Authored',source:'authored.kpp',warnings:[],descriptor:d}]}
    expect(isBrushLibrary(library)).toBe(true)
    d.sourceStamp!.options[0].sensors[0].sourceSlot=16
    expect(isBrushLibrary(library)).toBe(false)
    delete d.sourceStamp
    expect(isBrushLibrary(library)).toBe(true)
  })

  it('bounds repeated normalized curves and aggregate library data before detailed validation',()=>{
    const d=identity(),curve={text:' '.repeat(64000)+'0,0;1,1;',points:[{x:0,y:0,corner:false},{x:1,y:1,corner:false}]}
    for(const option of d.sourceStamp!.options){option.commonCurve=curve;for(const sensor of option.sensors)sensor.curve=curve}
    expect(sourceStampDataBudget(d.sourceStamp)).toBeGreaterThan(MAX_SOURCE_STAMP_BUDGET)
    expect(isSourceStampData(d.sourceStamp)).toBe(false)
    const many=identity()
    for(let i=0;i<16;i++)many.sourceStamp!.settings['PressureUnused'+i]='x'.repeat(60000)
    expect(isSourceStampData(many.sourceStamp)).toBe(true)
    const library={schemaVersion:1,assets:[],skipped:[],brushes:Array.from({length:18},()=>({name:'B',source:'self',warnings:[],descriptor:many}))}
    expect(isBrushLibrary(library)).toBe(false)
  })
  it('rejects hexadecimal/underscore/nonfinite curve text with the same decimal grammar as the importer',()=>{
    for(const x of ['0x1','1_0','NaN']) {
      const d=identity(),curve={text:'0,0;'+x+',1;',points:[{x:0,y:0,corner:false},{x:1,y:1,corner:false}]}
      d.sourceStamp!.options[0].commonCurve=curve;d.sourceStamp!.options[0].sensors[0].curve=curve
      expect(isSourceStampData(d.sourceStamp)).toBe(false)
    }
  })
  it('retains raw nonlinear source data but cannot silently substitute the legacy uniform curve',()=>{
    const d=descriptor();d.sourceStamp!.options[0].checked=true
    const before=structuredClone(d)
    expect(isSourceStampData(d.sourceStamp)).toBe(true)
    expect(d.sourceStamp!.options[0].commonCurve.text).toBe('0,0;0.5,0.2;1,1;')
    expect(sourceStrokeAuthorDescriptor(d,context)).toEqual({supported:false,reasons:['native-curve-compiler-unavailable:Size:0']})
    expect(d).toEqual(before)
  })
  it('constructs the existing owner from identity native programs, saved scale/angle/spacing/precision and exact CAS grid',()=>{
    const d=identity(),result=sourceStrokeAuthorDescriptor(d,context)
    expect(result.supported).toBe(true)
    if(!result.supported)throw Error('unreachable')
    const role=result.program.roles[0]
    expect(role.brush).toEqual({width:3,height:5,scale:.7,angle:.25})
    expect(role.spacing).toEqual({value:.375,automatic:false,coefficient:1,isotropic:false})
    expect(role.material.precisionLevel).toBe(5)
    const author=new SourceStrokeAuthor(result.program)
    let state=author.createState(0,0,0)
    for(const p of [packet(0),packet(60),packet(61,30)]){
      const stream=author.plan(state,p)
      while(true){const next=stream.next();if(next.done){state=next.value;break}}
    }
    expect(state.inputOrdinal).toBe(3)
    expect(state.roles[0].sequence).toBeGreaterThan(1)
  })
  it('accepts only explicit versioned polynomial capability with raw corner flags; no stock lookup',()=>{
    const d=descriptor();d.sourceStamp!.options[0].checked=true;Object.assign(d.sourceStamp!.options[0].sensors[0],{curve:{text:'0,0;1,0.5;',points:[{x:0,y:0,corner:true},{x:1,y:.5,corner:false}]}})
    // Fix the textual corner flag as an untrusted descriptor must retain exact text/points.
    Object.assign(d.sourceStamp!.options[0].sensors[0].curve,{text:'0,0,is_corner;1,0.5;'})
    d.sourceStamp!.options[0].commonCurve=d.sourceStamp!.options[0].sensors[0].curve
    const seen:string[]=[]
    const result=sourceStrokeAuthorDescriptor(d,{...context,compileCurve:curve=>{
      seen.push(curve.text);expect(curve.points[0].corner).toBe(true)
      return {version:'native-sparselu-v1',coefficients:[[0,0,.5,0]]}
    }})
    expect(result.supported).toBe(true);expect(seen).toEqual(['0,0,is_corner;1,0.5;'])
    expect(sourceStrokeAuthorDescriptor(d,{...context,compileCurve:()=>({version:'native-sparselu-v1',coefficients:[]})}).supported).toBe(false)
  })
  it('consumes the production-imported pinned dictionary without a client compiler or fixture lookup',()=>{
    const d=structuredClone(compiledFixture.descriptor) as unknown as Mutable<BrushDescriptor>
    expect(isSourceStampData(d.sourceStamp)).toBe(true)
    expect(d.sourceStamp!.compiled!.curves).toHaveLength(1)
    const result=sourceStrokeAuthorDescriptor(d,context)
    expect(result.supported).toBe(true)
    if(!result.supported)throw Error('unreachable')
    const expected=sourceStrokeAuthorDescriptor(d,{...context,compileCurve:curve=>({version:'native-sparselu-v1',coefficients:d.sourceStamp!.compiled!.curves.find(c=>c.source.text===curve.text)!.coefficients})})
    expect(result).toEqual(expected)
    const author=new SourceStrokeAuthor(result.program),stream=author.plan(author.createState(0,0,0),packet(0))
    expect(stream.next().value).toBeDefined();stream.return(author.createState(0,0,0))
    for(const edit of [(x:Mutable<NonNullable<BrushDescriptor['sourceStamp']>>)=>x.compiled!.curves.push(x.compiled!.curves[0]),
      (x:Mutable<NonNullable<BrushDescriptor['sourceStamp']>>)=>{x.compiled!.curves[0].source.points[1].corner=true},
      (x:Mutable<NonNullable<BrushDescriptor['sourceStamp']>>)=>Object.assign(x.compiled!,{profile:'fake'}),
      (x:Mutable<NonNullable<BrushDescriptor['sourceStamp']>>)=>{x.options[0].checked=false}]) {
      const invalid=structuredClone(d.sourceStamp!);edit(invalid);expect(isSourceStampData(invalid)).toBe(false)
    }
  })
  it('never compiles or draws RNG for disabled saved nonlinear curves',()=>{
    for(const guard of ['checked','useCurve'] as const) {
      const d=identity(),option=d.sourceStamp!.options[0]
      option.checked=true;option.useCurve=true;option[guard]=false
      option.commonCurve={text:'0,0;1,0.5;',points:[{x:0,y:0,corner:false},{x:1,y:.5,corner:false}]}
      option.sensors=[{id:'fuzzyPerDab',sourceId:'fuzzy',sourceSlot:9,curve:option.commonCurve}]
      const result=sourceStrokeAuthorDescriptor(d,{...context,compileCurve:()=>{throw Error('disabled curve compiler called')}})
      expect(result.supported).toBe(true)
      if(!result.supported)throw Error('unreachable')
      const author=new SourceStrokeAuthor(result.program)
      const stream=author.plan(author.createState(0,0,0),packet(0))
      while(true){const step=stream.next();if(step.done){expect(step.value.random.draws).toBe(0);break}}
      expect(option.sensors[0].curve.text).toBe('0,0;1,0.5;')
    }
  })
  it('keeps old descriptors on the old path and rejects material/child/CAS capabilities before execution',()=>{
    const legacy=identity();delete legacy.sourceStamp
    expect(sourceStrokeAuthorDescriptor(legacy,context)).toEqual({supported:false,reasons:['legacy-descriptor-no-source-data']})
    for(const edit of [(d:Mutable<BrushDescriptor>)=>{d.sourceStamp!.unsupported.push('unknown-reader-law')},(d:Mutable<BrushDescriptor>)=>{delete d.tip.imageSampling},(d:Mutable<BrushDescriptor>)=>{d.sourceStamp!.flags.textureEnabled=true},(d:Mutable<BrushDescriptor>)=>{d.sourceStamp!.role='mask'}]){
      const d=identity();edit(d);expect(sourceStrokeAuthorDescriptor(d,context).supported).toBe(false)
    }
    expect(sourceStrokeAuthorDescriptor(identity(),{...context,asset:{...context.asset!,size:2}}).supported).toBe(false)
  })
  it('rejects malformed source slots, duplicate sensors, nonfinite data, mismatched text/corners and future schema',()=>{
    for(const edit of [(d:Mutable<SourceStampData>)=>Object.assign(d,{version:2}),(d:Mutable<SourceStampData>)=>d.options[0].sensors[0].sourceSlot=16,(d:Mutable<SourceStampData>)=>d.options[0].sensors.push(d.options[0].sensors[0]),(d:Mutable<SourceStampData>)=>d.brush.scale=NaN,(d:Mutable<SourceStampData>)=>d.options[0].sensors[0].curve.points[0].corner=true,(d:Mutable<SourceStampData>)=>d.options[0].sensors[0].sourceId='fuzzy',(d:Mutable<SourceStampData>)=>Object.assign(d.options[0],{extra:true})]){
      const d=structuredClone(identity().sourceStamp!);edit(d);expect(isSourceStampData(d)).toBe(false)
    }
  })
})
