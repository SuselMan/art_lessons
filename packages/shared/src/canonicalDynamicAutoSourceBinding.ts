import {captureCanonicalSourceScaleOptions,type CanonicalSourceScaleOptions} from './canonicalSourceScale.js'
import type {BrushDescriptor} from './brushes.js'
import {extractCanonicalDynamicAutoGeometryData} from './canonicalBrushCapability.js'
import {canonicalDefaultAutoSourcePin,canonicalDefaultAutoStatic,canonicalGaussianAutoSourcePin,canonicalGaussianAutoStatic,type CanonicalAutoCoverageProfile,type CanonicalGaussianCoverageProfile} from './canonicalDefaultAutoMaterial.js'
import {canonicalSoftAutoSourcePin} from './canonicalSoftAutoMaterial.js'
import {CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE,canonicalStrokeCoverageMatches,type CanonicalStrokeRasterProfile} from './canonicalStrokeFrame.js'

/** Static source pin for the negotiated Pixel geometry/material consumer.
 * Descriptor SHA and CAS authority remain external. The historical source
 * binders keep their narrower capability contracts. */
export function canonicalDynamicAutoSourceBinding(descriptor:BrushDescriptor,descriptorSha256:string,coverageProfile:CanonicalAutoCoverageProfile|CanonicalGaussianCoverageProfile,rasterProfile:CanonicalStrokeRasterProfile,options?:CanonicalSourceScaleOptions,originalAssets?:readonly Readonly<{id:string;size:number}>[]){
  if(!/^[a-f0-9]{64}$/.test(descriptorSha256))throw new TypeError('Invalid dynamic Auto source profile')
  const result=extractCanonicalDynamicAutoGeometryData(descriptor,undefined,originalAssets,rasterProfile)
  if(!result.supported)throw new TypeError(result.reasons.join(','))
  const data=result.data
  const brushScale=captureCanonicalSourceScaleOptions(options).sourceScale??data.brush.scale
  if(data.version!==2||data.source.kind==='image')throw new TypeError('Expected original Auto source')
  if(data.source.randomness!==0||data.source.density!==1)coverageProfile=CANONICAL_SEEDED_AUTO_MASK_COVERAGE_PROFILE
  if(!canonicalStrokeCoverageMatches(rasterProfile,coverageProfile))throw new TypeError('Dynamic mask coverage profile unavailable')
  const identity={descriptorId:result.descriptor.id,descriptorVersion:result.descriptor.version,descriptorSha256}
  if(data.source.kind==='gaussianAuto'){
    if(coverageProfile==='scalar-f64-fma-v1'||coverageProfile==='neon64-f32-fma-seeded-density-v1')throw new TypeError('Invalid Gaussian source profile')
    return canonicalGaussianAutoSourcePin({kind:'gaussianAuto',...identity,...canonicalGaussianAutoStatic(data.source,brushScale,data.brush.angle,coverageProfile),coverageProfile})
  }
  if(coverageProfile==='scalar-bionic-f64-fma-v1'||coverageProfile==='neon64-f32-fma-seeded-density-v1')throw new TypeError('Invalid dynamic Auto source profile')
  if(data.source.kind==='defaultAuto')return canonicalDefaultAutoSourcePin({kind:'defaultAuto',...identity,...canonicalDefaultAutoStatic(data.source,brushScale,data.brush.angle,coverageProfile),coverageProfile})
  const compiled=data.compiled
  if(compiled?.version!==2||!compiled.radialCurve)throw new TypeError('Original Soft radial program unavailable')
  return canonicalSoftAutoSourcePin({kind:'softAuto',sourceSlot:0,...identity,source:data.source,brushScale,brushAngle:data.brush.angle,coverageProfile,reader:data.reader,compilerProfile:compiled.profile,buildId:compiled.buildId,radialCurve:compiled.radialCurve})
}
