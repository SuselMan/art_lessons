import type {BrushDescriptor} from './brushes.js'
import {extractCanonicalDynamicAutoGeometryData} from './canonicalBrushCapability.js'
import {canonicalDefaultAutoSourcePin,canonicalDefaultAutoStatic,canonicalGaussianAutoSourcePin,canonicalGaussianAutoStatic,type CanonicalAutoCoverageProfile,type CanonicalGaussianCoverageProfile} from './canonicalDefaultAutoMaterial.js'
import {canonicalSoftAutoSourcePin} from './canonicalSoftAutoMaterial.js'
import {canonicalStrokeCoverageMatches,type CanonicalStrokeRasterProfile} from './canonicalStrokeFrame.js'

/** Static source pin for the negotiated Pixel geometry/material consumer.
 * Descriptor SHA and CAS authority remain external. The historical source
 * binders keep their narrower capability contracts. */
export function canonicalDynamicAutoSourceBinding(descriptor:BrushDescriptor,descriptorSha256:string,coverageProfile:CanonicalAutoCoverageProfile|CanonicalGaussianCoverageProfile,rasterProfile:CanonicalStrokeRasterProfile){
  if(!/^[a-f0-9]{64}$/.test(descriptorSha256)||!canonicalStrokeCoverageMatches(rasterProfile,coverageProfile))throw new TypeError('Invalid dynamic Auto source profile')
  const result=extractCanonicalDynamicAutoGeometryData(descriptor)
  if(!result.supported)throw new TypeError(result.reasons.join(','))
  const data=result.data
  if(data.version!==2||data.source.kind==='image')throw new TypeError('Expected original Auto source')
  const identity={descriptorId:result.descriptor.id,descriptorVersion:result.descriptor.version,descriptorSha256}
  if(data.source.kind==='gaussianAuto'){
    if(coverageProfile==='scalar-f64-fma-v1'||coverageProfile==='neon64-f32-fma-seeded-density-v1')throw new TypeError('Invalid Gaussian source profile')
    return canonicalGaussianAutoSourcePin({kind:'gaussianAuto',...identity,...canonicalGaussianAutoStatic(data.source,data.brush.scale,data.brush.angle),coverageProfile})
  }
  if(coverageProfile==='scalar-bionic-f64-fma-v1'||coverageProfile==='neon64-f32-fma-seeded-density-v1')throw new TypeError('Invalid dynamic Auto source profile')
  if(data.source.kind==='defaultAuto')return canonicalDefaultAutoSourcePin({kind:'defaultAuto',...identity,...canonicalDefaultAutoStatic(data.source,data.brush.scale,data.brush.angle,coverageProfile),coverageProfile})
  const compiled=data.compiled
  if(compiled?.version!==2||!compiled.radialCurve)throw new TypeError('Original Soft radial program unavailable')
  return canonicalSoftAutoSourcePin({kind:'softAuto',sourceSlot:0,...identity,source:data.source,brushScale:data.brush.scale,brushAngle:data.brush.angle,coverageProfile,reader:data.reader,compilerProfile:compiled.profile,buildId:compiled.buildId,radialCurve:compiled.radialCurve})
}
