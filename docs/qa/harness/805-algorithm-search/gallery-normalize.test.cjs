'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{normalizeScene}=require('./gallery-normalize.cjs');
const scenes=require('../../runs/805-night-20261017/gallery-scenes-source.json').scenes;
test('whole-scene normalization preserves every packed bit except XY and size',()=>{
 for(const scene of scenes){const result=normalizeScene(scene);for(let j=0;j<scene.operations.length;j++){
  const op=scene.operations[j],out=result.operations[j],a=Buffer.from(op.dabsPacked.slice(2),'base64'),b=Buffer.from(out.dabsPacked.slice(2),'base64');
  assert.deepEqual({...out,dabsPacked:null},{...op,dabsPacked:null});
  for(let i=0;i<a.length;i+=40)for(let k=0;k<10;k++)if(![0,1,5].includes(k))assert.equal(a.readUInt32LE(i+k*4),b.readUInt32LE(i+k*4));
 }
 }
});
test('all strokes share one explicit uniform transform centered on1024',()=>{
 for(const scene of scenes){const r=normalizeScene(scene),t=r.transform;assert.ok(t.scale>0);assert.equal(Math.max(t.sourceBounds[2]-t.sourceBounds[0],t.sourceBounds[3]-t.sourceBounds[1])*t.scale,700);for(let j=0;j<scene.operations.length;j++){
 const a=Buffer.from(scene.operations[j].dabsPacked.slice(2),'base64'),b=Buffer.from(r.operations[j].dabsPacked.slice(2),'base64');for(let i=0;i<a.length;i+=40){assert.ok(Math.abs(b.readFloatLE(i)-((a.readFloatLE(i)-t.sourceCenter[0])*t.scale+512))<.001);assert.ok(Math.abs(b.readFloatLE(i+20)-a.readFloatLE(i+20)*t.scale)<.001)}
 }
 }
});
