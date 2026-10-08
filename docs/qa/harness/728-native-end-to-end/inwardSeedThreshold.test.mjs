import{test}from'node:test'
import assert from'node:assert/strict'
/** CPU algebra only; not a shader oracle or evidence of actual pressure mismatch. */
const seed=(costByte,earlierByte,k)=>[k>=costByte/255?255:0,0,earlierByte,255]
test('actual mode12 threshold can amplify one Q8 R byte while zero prior deposit stays zero',()=>{
 const k=.9617441184796373
 assert.ok(245/255<k&&246/255>k)
 const a=seed(245,0,k),b=seed(246,0,k)
 assert.deepEqual(a,[255,0,0,255]);assert.deepEqual(b,[0,0,0,255])
 assert.equal(Math.abs(a[0]-b[0]),255);assert.equal(a[2]+b[2],0)
})
test('threshold equality follows GLSL step and WGSL greater-equal, preserving nonzero prior B',()=>{
 assert.deepEqual(seed(128,37,128/255),[255,0,37,255])
 assert.deepEqual(seed(129,37,128/255),[0,0,37,255])
})
