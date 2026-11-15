import{describe,it,expect}from'vitest'
import{hasSketch194Scope,hasSpray194Scope,isBrushLibrary,type BrushDescriptor,type BrushLibrary}from'./brushes.js'
import{sketch173}from'./sketchProcedural173.testFixture.js'
import{sprayRectangle155}from'./brushSprayRectangle155.testFixture.js'
import{hasValidRecordedPenOperation,packDabs}from'./dabCodec.js'
import{dab173}from'./sketchProcedural173.testFixture.js'
const library=(d:BrushDescriptor):BrushLibrary=>({schemaVersion:1,brushes:[{name:'Native consumer',source:'own194.kpp',warnings:[],descriptor:d}],assets:[],skipped:[]})
function sketch():BrushDescriptor{const d=sketch173();d.version=194;d.sketch={...d.sketch!,maskSignal:'native-dab-v1',composite:'copy'};return d}
function spray():BrushDescriptor{const d=sprayRectangle155();d.version=194;d.spray={...d.spray!,composite:'grainExtract'};return d}
describe('whole native Sketch/Spray194 contract',()=>{
 it('admits native noise, spikes, intrinsic aspect, Wash and captured BEGIN source together',()=>{
  const d=spray();d.tip.aspect=2;d.tip.autoShape={version:1,spikes:7};d.behavior!.rendering!.accumulation='alphaDarken';d.spray!.color={...d.spray!.color,sampleInput:true,mixBackground:true,sourcePolicy:'canonical-begin-v1'}
  expect(hasSpray194Scope(d)).toBe(true);expect(isBrushLibrary(library(d))).toBe(true)
 })
 it('admits prepared Sketch Gaussian/noise selection without Pixel pigment semantics',()=>{
  const d=sketch();d.tip.profile={kind:'gaussian2D',shape:'ellipse',horizontalFade:.3,verticalFade:.7,antialias:true};d.tip.aspect=2;d.tip.autoNoise={version:1,density:.4,randomness:.6};d.behavior!.rendering!.accumulation='alphaDarken'
  expect(hasSketch194Scope(d)).toBe(true);expect(isBrushLibrary(library(d))).toBe(true)
 })
 it('keeps composition explicit, rejecting unknown and contradictory native operations',()=>{
  const d=sketch();delete d.sketch!.composite;expect(isBrushLibrary(library(d))).toBe(false)
  d.sketch!.composite='copy';d.behavior!.erase=true;expect(isBrushLibrary(library(d))).toBe(false)
  d.sketch!.composite='normal';expect(isBrushLibrary(library(d))).toBe(true)
  d.behavior!.rendering!.blendMode='multiply';expect(isBrushLibrary(library(d))).toBe(false)
 })
 it('cannot smuggle a second engine or unsupported Pixel-only resource stage into native scope',()=>{
  const d=sketch();d.spray=spray().spray;expect(isBrushLibrary(library(d))).toBe(false);delete d.spray
  d.behavior!.modulations={flow:[{control:'pressure',minimum:0,jitter:0}]};expect(isBrushLibrary(library(d))).toBe(false)
  delete d.behavior!.modulations;d.behavior!.timing={version:1,rate:20,ignoreDistanceSpacing:false};expect(isBrushLibrary(library(d))).toBe(false)
 })
 it('does not grant historical tokens the new mask/composite contract',()=>{
  const d=sketch();d.version=173;expect(isBrushLibrary(library(d))).toBe(false)
  expect(isBrushLibrary(library(sketch173()))).toBe(true);expect(isBrushLibrary(library(sprayRectangle155()))).toBe(true)
 })
 it('requires all five canonical source channels before operation permission shortcuts',()=>{
  const dab={...dab173,sourceSize:8,sourceScale:1,sourceAngle:.25,sourceTwist:0,sourceTangentialPressure:.5};const op={type:'stroke',preset:'brush:own194@194',dabs:[dab]}
  expect(hasValidRecordedPenOperation(op)).toBe(true);expect(hasValidRecordedPenOperation({...op,dabs:undefined,dabsPacked:packDabs([dab])})).toBe(true)
  for(const key of ['sourceSize','sourceScale','sourceAngle','sourceTwist','sourceTangentialPressure']as const){const bad={...dab};delete bad[key];expect(hasValidRecordedPenOperation({...op,dabs:[bad]})).toBe(false)}
 })
})
