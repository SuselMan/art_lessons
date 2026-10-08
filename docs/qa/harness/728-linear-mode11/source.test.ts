import test from 'node:test'
import assert from 'node:assert/strict'
import { CANONICAL_FIELD_OPS_WGSL, CANONICAL_FIELD_OPS_HARDWARE_LINEAR_WGSL } from '../../../../apps/web/src/engine/src/webgpuCanonical/passes/fieldOps'
test('diagnostic changes only LINEAR implementation and one binding',()=>{
 const restored=CANONICAL_FIELD_OPS_HARDWARE_LINEAR_WGSL.replace('\n@group(0) @binding(9) var diagnosticLinear:sampler;','').replace('return textureSampleLevel(t,diagnosticLinear,vec2f(uv.x,1.0-uv.y),0.0);','return mix(mix(texel(t,i),texel(t,i+vec2i(1,0)),f.x),mix(texel(t,i+vec2i(0,1)),texel(t,i+vec2i(1,1)),f.x),f.y);')
 assert.equal(restored,CANONICAL_FIELD_OPS_WGSL)
 assert.equal(CANONICAL_FIELD_OPS_HARDWARE_LINEAR_WGSL.match(/textureSampleLevel/g)?.length,1)
 assert.match(CANONICAL_FIELD_OPS_HARDWARE_LINEAR_WGSL,/return texel\(t,vec2i\(floor\(uv\*dims\)\)\)/)
})
