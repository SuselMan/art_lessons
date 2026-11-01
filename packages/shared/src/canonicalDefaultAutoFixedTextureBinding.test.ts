/// <reference types="node" />
import {expect,it} from 'vitest'
import {createHash} from 'node:crypto'
import {canonicalBrushDescriptorJSON} from './canonicalBrushDescriptor.js'
import actual from './fixtures/sourceDefaultAutoData/screentonesRegular.texture.native.json' with {type:'json'}
import type {BrushDescriptor} from './brushes.js'
import {CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE,CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as B,CANONICAL_BROWSER_NUMBER_COVERAGE_PROFILE as browser,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,CANONICAL_STROKE_RASTER_PROFILE as old} from './canonicalStrokeFrame.js'
import {canonicalDefaultAutoFixedTextureSourceBinding,canonicalDefaultAutoSourceBinding} from './canonicalDefaultAutoMaterial.js'
it('binds genuine original fixed texture DefaultAuto without a normalized descriptor clone or oldbinding bypass',()=>{
 const d=structuredClone(actual.descriptor) as unknown as BrushDescriptor,before=structuredClone(d),sha=createHash('sha256').update(canonicalBrushDescriptorJSON(d)).digest('hex'),pattern=actual.patternAsset
 const pin=canonicalDefaultAutoFixedTextureSourceBinding(d,sha,'neon64-f32-fma-v1',pattern,G)
 expect(pin).toMatchObject({kind:'defaultAuto',descriptorId:d.id,descriptorVersion:d.version,descriptorSha256:sha,coverageProfile:'neon64-f32-fma-v1'})
 expect(pin.source).toEqual(d.sourceStamp?.version===2?d.sourceStamp.source:undefined);expect(Object.isFrozen(pin)).toBe(true);expect(d).toEqual(before)
 expect(canonicalDefaultAutoFixedTextureSourceBinding(d,sha,browser,pattern,B).coverageProfile).toBe(browser)
 expect(()=>canonicalDefaultAutoFixedTextureSourceBinding(d,sha,browser,pattern,G)).toThrow()
 expect(()=>canonicalDefaultAutoFixedTextureSourceBinding(d,sha,'neon64-f32-fma-v1',pattern,B)).toThrow()
 expect(()=>canonicalDefaultAutoSourceBinding(d,sha,'neon64-f32-fma-v1',G)).toThrow()
 for(const digest of ['', 'A'.repeat(64),'x'.repeat(64)])expect(()=>canonicalDefaultAutoFixedTextureSourceBinding(d,digest,'neon64-f32-fma-v1',pattern,G)).toThrow()
 expect(()=>canonicalDefaultAutoFixedTextureSourceBinding(d,sha,'neon64-f32-fma-v1',pattern,old)).toThrow()
 expect(canonicalDefaultAutoFixedTextureSourceBinding(d,sha,'scalar-f64-fma-v1',pattern,G).coverageProfile).toBe('scalar-f64-fma-v1')
 expect(()=>canonicalDefaultAutoFixedTextureSourceBinding(d,sha,CANONICAL_SEEDED_DENSITY_COVERAGE_PROFILE,pattern,G)).toThrow()
 expect(()=>canonicalDefaultAutoFixedTextureSourceBinding(d,sha,'neon64-f32-fma-v1',{...pattern,id:'asset:'+'b'.repeat(64)},G)).toThrow()
})
