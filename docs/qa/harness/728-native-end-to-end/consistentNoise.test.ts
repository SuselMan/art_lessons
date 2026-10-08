import test from 'node:test'
import assert from 'node:assert/strict'
import {consistentNoiseShader} from './consistentNoise'
test('noise diagnostic default preserves exact shader, variants change one fractional evaluation only',()=>{
 const shader='vec2 i = floor(p); vec2 f = fract(p); return mix(a,b,f.x);'
 assert.equal(consistentNoiseShader(shader),shader)
 assert.equal(consistentNoiseShader(shader,'subtract'),'vec2 i = floor(p); vec2 f = p - i; return mix(a,b,f.x);')
 assert.equal(consistentNoiseShader(shader,'clamped-subtract'),'vec2 i = floor(p); vec2 f = clamp(p - i, 0.0, 1.0); return mix(a,b,f.x);')
 assert.throws(()=>consistentNoiseShader('missing','subtract'),/anchor/)
})
