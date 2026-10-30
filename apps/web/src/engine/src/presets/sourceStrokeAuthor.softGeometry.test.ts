import {describe,expect,it} from 'vitest'
import {isSourceStampData,type BrushDescriptor} from '@grafetto/shared'
import soft from '../../../../../../packages/shared/src/fixtures/sourceSoftAutoData/stock.native'
import gaussian from '../../../../../../packages/shared/src/fixtures/sourceGaussianAutoData/stock.native'
import whole from './fixtures/sourceSoftCircle/whole.native.json'
import {SourceStrokeMaterialAdapter} from './sourceStrokeMaterialAdapter'
import {sourceStrokeAuthorDescriptor} from './sourceStrokeAuthorDescriptor'
import {SourceStrokeAuthor,type SourceStrokeAuthorProgram,type SourceAuthorPacket,type SourceStrokeAuthorStep} from './sourceStrokeAuthor'
import {sourceDabGeometryEqual,sourceDabMaskExtent} from './sourceDabCache'

function program(index:number):SourceStrokeAuthorProgram {
  const data:unknown=soft.rows.find(r=>r.index===index)!.sourceStamp
  if(!isSourceStampData(data)||data.version!==2||data.source.kind!=='softAuto')throw Error('Invalid original soft data')
  const result=sourceStrokeAuthorDescriptor(gaussian.rows.find(r=>r.index===5)!.descriptor as unknown as BrushDescriptor,
    {colorIdentity:'native-black',lodScale:1,coverageProfile:'neon64-f32-fma-v1'})
  if(!result.supported)throw Error(result.reasons.join(','))
  // Existing pressure programs isolate geometry/cache scheduling; this is NOT
  // an oracle for original soft option programs or mask-master composition.
  const role=result.program.roles[0]
  return {id:'soft-geometry:'+index,roles:[{...role,brush:data.brush,
    geometry:{kind:'softAuto',source:data.source,coverageProfile:'neon64-f32-fma-v1'},materialPolicy:'soft-auto-fixed1-rng-free',
    material:{...role.material,brushIdentity:'soft-geometry:'+index}}]}
}
function packet(i:number):SourceAuthorPacket {return {x:-8+i*.8,y:-4+Math.sin(i/4)*5,t:i*17,pressure:.15+.8*(i%9)/8,
  tiltX:0,tiltY:0,speed:0,rotation:0,tangentialPressure:0,perspective:1,canvasRotation:0,mirroredH:i>=12,mirroredV:false,tiltDirectionOffset:0,hover:false}}
function run(p:SourceStrokeAuthorProgram,resume:boolean) {
  let author=new SourceStrokeAuthor(p),state=author.createState(4321,7654,.3)
  const steps:SourceStrokeAuthorStep[]=[]
  for(let i=0;i<20;i++) {
    let iterator=author.plan(state,packet(i))
    while(true) {
      const next=iterator.next();if(next.done){state=next.value;break}
      steps.push(next.value)
      if(resume) {const saved=structuredClone(next.value.state);iterator.return(saved)
        if(!saved.cursor){state=saved;break}
        author=new SourceStrokeAuthor(structuredClone(p));iterator=author.resume(saved)}
    }
  }
  return {steps,state}
}
describe('soft source in the same author geometry/cache owner',()=>{
  it('matches every-yield structured-clone resume for all10 retained role geometries',()=>{
    for(const row of soft.rows) {
      const p=program(row.index),whole=run(p,false),resumed=run(p,true)
      expect(resumed,row.name).toEqual(whole)
      expect(whole.state.inputOrdinal).toBe(20)
      const saved=whole.steps.flatMap(s=>s.result?.material?[s.result.material.resolvedSource]:[])
      expect(saved.length).toBeGreaterThan(0)
      for(const material of saved) {
        expect(material.geometry?.kind).toBe('softAuto')
        if(material.geometry?.kind!=='softAuto')throw Error('Missing soft geometry')
        expect(Object.isFrozen(material.geometry.source.softnessCurve.points)).toBe(true)
        expect(sourceDabGeometryEqual(material.geometry,structuredClone(material.geometry))).toBe(true)
      }
    }
  })
  it('matches original native40 mask extents from retained source geometry',()=>{
    for(const row of whole.cases) {
      const base=program(row.index).roles[0]
      const brush={...base.brush,scale:row.storedScale,angle:row.storedAngle}
      expect(sourceDabMaskExtent(brush,row.shape,row.subpixelX,row.subpixelY,base.geometry)).toEqual([row.width,row.height])
    }
  })
  it('keeps soft material out of existing image/auto wire contexts until supported',()=>{
    const p=program(72),owner=new SourceStrokeAuthor(p),state=owner.createState(1,2,0)
    let reads=0
    expect(()=>new SourceStrokeMaterialAdapter(p,{get assets(){reads++;return []},primaryAsset:'fake',
      budget:{workUnits:100000,outputBytes:100000,drawPixels:100000}},state)).toThrow('Soft auto requires a supported canonical material context')
    expect(reads).toBe(0)
  })
  it('rejects checkpoint curve rebinding and unsupported geometry before planning',()=>{
    const p=program(72),g=p.roles[0].geometry
    if(g?.kind!=='softAuto')throw Error('Missing soft geometry')
    const changed=structuredClone(g)
    Object.assign(changed.source.softnessCurve,{text:'0,1;1,0;',points:[{x:0,y:1,corner:false},{x:1,y:0,corner:false}]})
    expect(sourceDabGeometryEqual(g,changed)).toBe(false)
    const result=run(p,false),saved=structuredClone(result.state)
    if(!saved.roles[0].cache.saved)throw Error('Missing saved material')
    Object.assign(saved.roles[0].cache.saved,{geometry:changed})
    const owner=new SourceStrokeAuthor(p)
    expect(()=>owner.plan(saved,packet(21)).next()).toThrow()
    const invalid=structuredClone(p)
    Object.assign(invalid.roles[0],{geometry:{...g,source:{...g.source,antialias:true}}})
    expect(()=>new SourceStrokeAuthor(invalid)).toThrow('Unsupported source auto geometry')
  })
})
