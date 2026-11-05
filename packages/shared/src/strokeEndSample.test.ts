import type {StrokeOperation} from './stroke.js'
import { expect,it } from 'vitest'
import { canonicalStrokeStorage,strokeEndSample,packStrokeEndSample,unpackStrokeEndSample,hasValidStrokeEndSample,isStrokeEndSample } from './strokeEndSample.js'
const sample={x:10,y:4,pressure:1,tiltX:0,tiltY:0,size:1,aspectRatio:1,angle:0,opacity:1,t:20,baseSize:1,normalizedSpeed:0}
const op={type:'stroke',tool:'digitalBrush',strokeId:'gesture',strokeEnd:true,strokeEndSample:sample,dabsPacked:''}
it('permits a bounded endpoint-only final record and preserves explicit speedzero',()=>{
 expect(isStrokeEndSample(sample)).toBe(true);expect(hasValidStrokeEndSample(op)).toBe(true)
 expect(hasValidStrokeEndSample({type:'stroke'})).toBe(true)
})
it('rejects malformed, unbounded or nonfinal samples before painting',()=>{
 for(const patch of [{x:NaN},{baseSize:0},{size:Infinity},{normalizedSpeed:2},{pressure:2},{extra:0}])expect(isStrokeEndSample({...sample,...patch})).toBe(false)
 for(const patch of [{strokeEnd:false},{tool:'pencil'},{strokeId:''},{type:'layer_clear'}])expect(hasValidStrokeEndSample({...op,...patch})).toBe(false)
})

it('preserves exact source angles and base size across an opaque JSON storage boundary',()=>{
 for(const sourceAngle of [3.1415927410125732,Math.PI,Math.PI/2,0,-0,Number.MIN_VALUE]){
  const input={...sample,sourceAngle,sourceSize:16,sourceScale:.123456789,baseSize:1+Number.EPSILON}
  const packed=packStrokeEndSample(input)
  const restored=unpackStrokeEndSample(JSON.parse(JSON.stringify(packed)))
  expect(Object.is(restored.sourceAngle,sourceAngle)).toBe(true)
  expect(Object.is(restored.baseSize,input.baseSize)).toBe(true)
  expect(restored.sourceScale).toBe(Math.fround(input.sourceScale))
  expect(strokeEndSample({strokeEndSamplePacked:packed})).toEqual(restored)
 }
})
it('rejects duplicate, malformed, truncated and nonfinite endpoint encodings',()=>{
 const packed=packStrokeEndSample({...sample,sourceAngle:Math.PI})
 for(const value of ['',packed.slice(0,-1),'2'+packed.slice(1),packed+'|extra','1|1:|AAAAAAAA8D8=']){
  expect(()=>unpackStrokeEndSample(value)).toThrow()
  expect(hasValidStrokeEndSample({...op,strokeEndSample:undefined,strokeEndSamplePacked:value})).toBe(false)
 }
 expect(hasValidStrokeEndSample({...op,strokeEndSamplePacked:packed})).toBe(false)
 for(const sourceAngle of [NaN,Infinity,-Infinity])expect(()=>packStrokeEndSample({...sample,sourceAngle})).toThrow()
})
it('normalizes only new F64 plain paths and never rewrites legacy operations',()=>{
 const legacy:StrokeOperation={...op,id:'a',userId:'u',layerId:'l',timestamp:1,preset:'ink-round',color:[0,0,0],type:'stroke',tool:'digitalBrush',strokeEnd:true}
 expect(canonicalStrokeStorage(legacy)).toBe(legacy)
 const {baseSize:_,...dab}=sample
 const fresh:StrokeOperation={...legacy,dabsPacked:undefined,dabs:[{...dab,sourceAngle:Math.PI}],strokeEndSample:{...sample,sourceAngle:Math.PI}}
 void _
 const normalized=canonicalStrokeStorage(fresh)
 expect('dabs' in normalized).toBe(false)
 expect('strokeEndSample' in normalized).toBe(false)
 expect(strokeEndSample(normalized as StrokeOperation)?.sourceAngle).toBe(Math.PI)
 expect(canonicalStrokeStorage(normalized)).toBe(normalized)
})

it('rejects nonfinite binary fields even when the container and record size are valid',()=>{
 const packed=packStrokeEndSample({...sample,sourceAngle:Math.PI}),parts=packed.split('|')
 for(const value of [NaN,Infinity,-Infinity]){
  const bytes=Uint8Array.from(atob(parts[1].slice(2)),c=>c.charCodeAt(0));new DataView(bytes.buffer).setFloat64(52,value,true)
  const corrupt=`1|4:${btoa(String.fromCharCode(...bytes))}|${parts[2]}`
  expect(()=>unpackStrokeEndSample(corrupt)).toThrow()
  const scalar=new Uint8Array(8);new DataView(scalar.buffer).setFloat64(0,value,true)
  expect(()=>unpackStrokeEndSample(`1|${parts[1]}|${btoa(String.fromCharCode(...scalar))}`)).toThrow()
 }
})
