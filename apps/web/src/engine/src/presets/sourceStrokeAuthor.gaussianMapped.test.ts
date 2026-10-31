import {describe,expect,it} from 'vitest'
import {extractGaussianAutoSourceDataCapability,type BrushDescriptor} from '@grafetto/shared'
import stock from '../../../../../../packages/shared/src/fixtures/sourceGaussianAutoData/stock.mapped.native'
import historical from '../../../../../../packages/shared/src/fixtures/sourceGaussianAutoData/stock.native'
import native from './fixtures/sourceCurveSensorFused.native.json'
import packets from './fixtures/sourceSensors.native.json'
import {sourceStrokeAuthorDescriptor} from './sourceStrokeAuthorDescriptor'
import {sourceCurveTransfer,type SourceCurvePolynomial} from './sourceCurve'
import {compileSourceOptionProgram} from './sourceOptionProgram'

const ready=[2,5,6,7,10,11,22]
const oracle=(points:readonly {x:number;y:number;corner?:boolean}[])=>native.curves.find(c=>JSON.stringify(c.points)===JSON.stringify(points))!
describe('actual Gaussian imports with mapped installed sensor coefficients',()=>{
 it('keeps new descriptor identities and all original raw source inputs separate from the old compiler',()=>{
  let coefficients=0,oldDifferences=0;const curves=new Set<string>()
  for(const row of stock.rows){
   const old=historical.rows.find(r=>r.index===row.index)!,data=row.descriptor.sourceStamp
   expect(row.kppSHA256).toBe(old.kppSHA256);expect(row.descriptor.id).not.toBe(old.descriptor.id)
   const {compiled,...raw}=data,{compiled:oldCompiled,...oldRaw}=old.descriptor.sourceStamp
   expect(raw).toEqual(oldRaw);expect(compiled.version).toBe(2);expect(oldCompiled.version).toBe(1)
   expect(compiled.buildId).toBe(stock.provider.buildId)
   for(const entry of compiled.curves){
    const expected=oracle(entry.source.points);expect(expected).toBeDefined();curves.add(expected.id)
    const previous=oldCompiled.curves.find(c=>c.source.text===entry.source.text)!
    for(let i=0;i<entry.coefficients.length;i++)for(let j=0;j<4;j++){
     expect(Object.is(entry.coefficients[i][j],expected.coefficients[i][j])).toBe(true)
     oldDifferences+=Number(!Object.is(previous.coefficients[i][j],expected.coefficients[i][j]));coefficients++
    }
   }
  }
  expect(curves.size).toBe(15);expect(coefficients).toBe(200);expect(oldDifferences).toBe(88)
 })
 it('matches original installed native sensor tables from every reimported nonlinear curve',()=>{
  let values=0
  for(const row of stock.rows)for(const entry of row.descriptor.sourceStamp.compiled.curves){
   const expected=oracle(entry.source.points)
   const curve:SourceCurvePolynomial={points:entry.source.points,coefficients:entry.coefficients.map(c=>[c[0],c[1],c[2],c[3]] as const)}
   const table=sourceCurveTransfer(curve,{layout:'sensor',arithmetic:'installed-arm64-fused-v1'})
   for(let i=0;i<table.length;i++){expect(Object.is(table[i],expected.samples[i]),row.index+'/'+expected.id+'/'+i).toBe(true);values++}
  }
  expect(values).toBe(6400)
 })
 it('selects mapped arithmetic through the real seven ready data-author programs without granting rejected material domains',()=>{
  let transfers=0
  for(const row of stock.rows){
   const descriptor=row.descriptor as unknown as BrushDescriptor
   const result=sourceStrokeAuthorDescriptor(descriptor,{colorIdentity:'opaque-native-black',lodScale:1,coverageProfile:'neon64-f32-fma-v1'})
   expect(extractGaussianAutoSourceDataCapability(descriptor).supported).toBe(ready.includes(row.index))
   expect(result.supported).toBe(ready.includes(row.index))
   if(!result.supported)continue
   for(const option of Object.values(result.program.roles[0].options)){
    if(!option.checked||!option.useCurve)continue
    const compiled=compileSourceOptionProgram(option).bind(packets.cases[0].input)
    for(let i=0;i<option.sensors.length;i++){
     const sensor=option.sensors[i]
     if(!compiled.sensors[i]?.transfer)continue
     expect(sensor.curve.arithmetic).toBe('installed-arm64-fused-v1')
     expect(compiled.sensors[i].transfer).toEqual(oracle(sensor.curve.points).samples);transfers++
    }
   }
  }
  expect(transfers).toBeGreaterThan(0)
 })
})
