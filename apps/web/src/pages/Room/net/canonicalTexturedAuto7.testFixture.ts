/// <reference types="node" />
import {createHash} from 'node:crypto'
import actual from '../../../../../../packages/shared/src/fixtures/sourceDefaultAutoData/textureReptile.pressure.compiled3.metadata.json' with {type:'json'}
import {canonicalBrushDescriptorJSON,canonicalTexturedAutoProgramBinding,canonicalTexturedAutoMaterialContext,canonicalStrokeSnapshotV7,resolveCanonicalTexturePhase,buildCanonicalTexturedAutoMaterial,CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G,type BrushDescriptor,type CanonicalStrokeOperation,type CanonicalRecordedAttachmentV1} from '@grafetto/shared'
/** Genuine unchanged normal Reptile metadata. Controlled socket DATA, not a server grant. */
export function texturedAuto7Fixture(){
 const descriptor=actual.descriptor as unknown as BrushDescriptor
 const sha=createHash('sha256').update(canonicalBrushDescriptorJSON(descriptor)).digest('hex')
 const binding=canonicalTexturedAutoProgramBinding(descriptor,sha,'neon64-f32-fma-v1',actual.patternAsset,G)
 const phase=resolveCanonicalTexturePhase(binding.phasePolicy,()=>0)
 const material=canonicalTexturedAutoMaterialContext({version:7,assets:[binding.patternAsset],primarySource:binding.source,primaryTexture:{...binding.textureGeometry,phase,strength:'recorded-grain-v1'},budget:{workUnits:64*1048576,outputBytes:16*1048576,drawPixels:16*1048576}})
 const snapshot=canonicalStrokeSnapshotV7({materialVersion:7,material,assets:material.assets,boardEpoch:2,layerId:'L',brush:'brush:'+descriptor.id+'@'+descriptor.version,strokeId:'auto7',descriptorSha256:sha,rasterProfile:G,pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:1,outerBlend:'over'}},2,G)
 const input={layerId:snapshot.layerId,brush:snapshot.brush,strokeId:snapshot.strokeId,pigmentRgb8:snapshot.pigmentRgb8,outerResourceOpacity:1,alphaDarken:'hard' as const,texturePhase:phase}
 const operation:CanonicalStrokeOperation={id:'auto7-frame',userId:'actor',timestamp:0,seq:1,type:'canonical_stroke',layerId:'L',frame:{version:2,rasterProfile:G,brush:snapshot.brush,strokeId:snapshot.strokeId,frameOrdinal:0,pigmentRgb8:snapshot.pigmentRgb8,composition:snapshot.composition,texturePhase:phase,materialPacked:buildCanonicalTexturedAutoMaterial({masked:false,entry:{phase:'between'},draws:[],fences:[{kind:'gestureEnd',at:0}]},material).packed}}
 const attachment:CanonicalRecordedAttachmentV1={version:1,roomId:'room',boardEpoch:2,capabilities:[{originalUserId:'actor',snapshot}],bindings:[{operationId:operation.id,sequence:1,originalUserId:'actor',capability:0}]}
 return {descriptor,sha,binding,material,snapshot,input,operation,attachment}
}
