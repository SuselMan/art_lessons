import {canonicalSourceRoleTexturesInput,sourceRoleTextureInputsFromPins,type CanonicalSourceRoleTexturesInput} from '@grafetto/shared'
import {canonicalSourceColorFields,type CanonicalSourceColorFields} from '@grafetto/shared'
import {canonicalTextureGradientRGBA,type CanonicalTextureGradientRGBA} from '@grafetto/shared'
import {canonicalAuthorImageMaterialSource,type CanonicalAuthorImageMaterialSource} from '@grafetto/shared'
import {canonicalSourceStrokeSnapshotV2,canonicalSourceMaterialContext,canonicalAuthorPixelMaskedSource,type CanonicalMaterialContextV2,type CanonicalAuthorPixelMaskedSource} from '@grafetto/shared'
import {canonicalAuthorPlainAutoGeometrySource,type CanonicalAuthorPlainAutoGeometrySource} from '@grafetto/shared'
import {canonicalAuthorPrimaryGrainSource,canonicalPrimaryGrainMaterialContext,canonicalStandaloneStrokeSnapshotV8,type CanonicalAuthorPrimaryGrainSource,type CanonicalMaterialContextV8,type CanonicalStandaloneStrokeSnapshotV8} from '@grafetto/shared'
import {canonicalAuthorPlainTiltSource,type CanonicalAuthorPlainTiltSource} from '@grafetto/shared'
import {canonicalTexturedAutoMaterialContext,canonicalResolvedTexturePhase,canonicalStrokeSnapshotV7,type CanonicalStrokeSnapshotV7,type CanonicalMaterialContextV7,type CanonicalResolvedTexturePhase} from '@grafetto/shared'
import {canonicalAuthorTexturedAutoSource,canonicalAuthorSoftPressureTexturedSource,canonicalAuthorPressureTexturedSource,type CanonicalAuthorPressureTexturedSource,type CanonicalAuthorTexturedAutoSource,type CanonicalAuthorSoftPressureTexturedSource,canonicalStrokeSnapshotV6,type CanonicalStrokeSnapshotV6,canonicalStrokeSnapshotV5,type CanonicalStrokeSnapshotV5,canonicalAuthorTexturedSource,type CanonicalAuthorTexturedSource,canonicalStrokeSnapshotV4,type CanonicalStrokeSnapshotV4,canonicalStrokeSnapshotV3,canonicalStrokeSnapshotV2,canonicalRecordedRasterProfiles,CANONICAL_STROKE_RASTER_PROFILE,type CanonicalStrokeRasterProfile,type CanonicalStrokeBegin,type CanonicalStrokeBeginResult,type CanonicalStrokeSnapshotV2,type CanonicalStrokeSnapshotV3} from '@grafetto/shared'

/** Captured typed socket; disconnect invalidates this one request. */
export interface CanonicalBeginEmitter {
 emit(event:'canonical_stroke_begin',input:CanonicalStrokeBegin,ack:(result:CanonicalStrokeBeginResult)=>void):unknown
 on(event:'disconnect',listener:()=>void):unknown
 off(event:'disconnect',listener:()=>void):unknown
}
export interface CanonicalBeginLifetime {
 /** Captured original descriptor SHA; mandatory for a material3 response. */
 readonly authorImageMaterialSource?:CanonicalAuthorImageMaterialSource
 readonly authorPixelMaskedSource?:CanonicalAuthorPixelMaskedSource
 readonly expectedSourceMaterialContext2?:CanonicalMaterialContextV2
 readonly expectedDescriptorSha256?:string
 /** Prepared caller-owned context; captured before any asynchronous BEGIN work. */
 readonly expectedMaterialContext7?:CanonicalMaterialContextV7
 /** Captured ORIGINAL server author permission; replay4 support is independent. */
 readonly authorPrimaryGrainSource?:CanonicalAuthorPrimaryGrainSource
 readonly expectedMaterialContext8?:CanonicalMaterialContextV8
 readonly authorPlainAutoGeometrySource?:CanonicalAuthorPlainAutoGeometrySource
 readonly authorPlainTiltSource?:CanonicalAuthorPlainTiltSource
 readonly authorTexturedAutoSource?:CanonicalAuthorTexturedAutoSource
 readonly authorSoftPressureTexturedSource?:CanonicalAuthorSoftPressureTexturedSource
 readonly authorPressureTexturedSource?:CanonicalAuthorPressureTexturedSource
 readonly authorTexturedSource?:CanonicalAuthorTexturedSource
 /** Captured SAME socket cleanup. Never confers an author grant. */
 readonly discardEmpty?:()=>void
 readonly onBeginAccepted?:()=>void
 readonly boardEpoch:number
 /** Captured caller execution policy; never selected from received ACK data. */
 readonly rasterProfile?:CanonicalStrokeRasterProfile
 /** Separate captured server author default and explicit resume response policy. */
 readonly authorRasterProfile?:CanonicalStrokeRasterProfile
 readonly responseRasterProfiles?:readonly CanonicalStrokeRasterProfile[]
 /** Caller compares captured socket/room/user/layer/context generations. */
 readonly isCurrent:()=>boolean
 readonly signal?:AbortSignal
 readonly timeoutMs?:number
}
export type AcceptedCanonicalBegin = {readonly ok:true;readonly snapshot:CanonicalStrokeSnapshotV2|CanonicalStrokeSnapshotV3|CanonicalStrokeSnapshotV4|CanonicalStrokeSnapshotV5|CanonicalStrokeSnapshotV6|CanonicalStrokeSnapshotV7|CanonicalStandaloneStrokeSnapshotV8;readonly recordedNext:number;readonly liveNext:number;readonly ended:boolean}
export type CanonicalBeginOutcome = AcceptedCanonicalBegin | Extract<CanonicalStrokeBeginResult,{ok:false}>
const closed=(v:object,keys:readonly string[])=>Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
const integer=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<Number.MAX_SAFE_INTEGER
function freeze<T>(v:T):T{if(v&&typeof v==='object'){Object.freeze(v);for(const c of Object.values(v))if(c&&typeof c==='object'&&!Object.isFrozen(c))freeze(c)}return v}
function validate(result:CanonicalStrokeBeginResult,input:CanonicalStrokeBegin,epoch:number,profiles:readonly CanonicalStrokeRasterProfile[],expectedDescriptorSha256:string|undefined,authorTexturedSource:CanonicalAuthorTexturedSource|undefined,authorPressureTexturedSource:CanonicalAuthorPressureTexturedSource|undefined,authorSoftPressureTexturedSource:CanonicalAuthorSoftPressureTexturedSource|undefined,authorTexturedAutoSource:CanonicalAuthorTexturedAutoSource|undefined,expectedMaterialContext7:CanonicalMaterialContextV7|undefined,authorPrimaryGrainSource:CanonicalAuthorPrimaryGrainSource|undefined,expectedMaterialContext8:CanonicalMaterialContextV8|undefined,expectedSourceMaterialContext2:CanonicalMaterialContextV2|undefined):CanonicalBeginOutcome {
 if(!result||typeof result!=='object')throw Error('Invalid canonical BEGIN verdict')
 if(result.ok===false){
  if(!closed(result,['ok','reason']))throw Error('Invalid canonical BEGIN verdict fields')
  if(!['invalid_operation','not_joined','server_error','canonical_repair_required'].includes(result.reason))throw Error('Invalid canonical BEGIN rejection')
  return Object.freeze({ok:false,reason:result.reason})
 }
 if(!closed(result,['ok','snapshot','recordedNext','liveNext','ended']))throw Error('Invalid canonical BEGIN verdict fields')
 // Admission retains at most eight speculative live frames; recorded-only
 // reconnect prefixes may legitimately be ahead of the live cursor.
 if(result.ok!==true||!integer(result.recordedNext)||!integer(result.liveNext)||result.liveNext>result.recordedNext+8||typeof result.ended!=='boolean')throw Error('Invalid canonical BEGIN cursor')
 const s=result.snapshot
 const selector=s&&Object.getOwnPropertyDescriptor(s,'materialVersion')
 if(!s||!('materialVersion'in s)||!selector||!Object.hasOwn(selector,'value')||![2,3,4,5,6,7,8].includes(selector.value))throw Error('Unsupported canonical BEGIN snapshot V1')
 if(!closed(s,['layerId','brush','strokeId','boardEpoch','descriptorSha256','rasterProfile','pigmentRgb8','composition','assets','materialVersion','material']))throw Error('Invalid canonical BEGIN snapshot fields')
 if(expectedMaterialContext8&&selector.value!==8)throw Error('Canonical BEGIN8 material downgrade')
 if(selector.value===8&&authorPrimaryGrainSource!=='primary-grain-image-v1')throw Error('Canonical BEGIN8 author policy unavailable')
 if(expectedMaterialContext7&&selector.value!==7)throw Error('Canonical BEGIN7 material downgrade')
 if(selector.value===7&&authorTexturedAutoSource!=='textured-auto-material-v7')throw Error('Canonical BEGIN7 original author policy unavailable')
 if(selector.value===6&&authorSoftPressureTexturedSource!=='pressure-soft-auto-texture-v6')throw Error('Canonical BEGIN6 original author policy unavailable')
 if(selector.value===5&&authorPressureTexturedSource!=='pressure-default-auto-texture-v5')throw Error('Canonical BEGIN5 original author policy unavailable')
 if(selector.value===4&&authorTexturedSource!=='fixed-default-auto-texture-v4')throw Error('Canonical BEGIN4 original author policy unavailable')
 const profileField=Object.getOwnPropertyDescriptor(s,'rasterProfile')
 if((selector.value===3||selector.value===4||selector.value===5||selector.value===6||selector.value===7||selector.value===8)&&(!profileField||!Object.hasOwn(profileField,'value')))throw Error('Invalid canonical BEGIN snapshot profile')
 const textureSnapshot=selector.value===8?canonicalStandaloneStrokeSnapshotV8(s,epoch,profileField!.value):selector.value===7?canonicalStrokeSnapshotV7(s,epoch,profileField!.value):selector.value===6?canonicalStrokeSnapshotV6(s,epoch,profileField!.value):selector.value===5?canonicalStrokeSnapshotV5(s,epoch,profileField!.value):selector.value===4?canonicalStrokeSnapshotV4(s,epoch,profileField!.value):selector.value===3?canonicalStrokeSnapshotV3(s,epoch,profileField!.value):undefined
 const capturedSnapshot=textureSnapshot??s
 const rasterProfile=capturedSnapshot.rasterProfile
 if(!profiles.includes(rasterProfile))throw Error('Canonical BEGIN resource mismatch')
 if(capturedSnapshot.layerId!==input.layerId||capturedSnapshot.brush!==input.brush||capturedSnapshot.strokeId!==input.strokeId||capturedSnapshot.boardEpoch!==epoch
  ||!Array.isArray(capturedSnapshot.pigmentRgb8)||capturedSnapshot.pigmentRgb8.length!==3||capturedSnapshot.pigmentRgb8.some((v,i)=>v!==input.pigmentRgb8[i])
  ||capturedSnapshot.composition?.outerResourceOpacity!==input.outerResourceOpacity||capturedSnapshot.composition?.alphaDarken!==input.alphaDarken
  ||!capturedSnapshot.material||capturedSnapshot.material.version!==selector.value||('maskSource'in capturedSnapshot.material&&capturedSnapshot.material.maskSource!==undefined))throw Error('Canonical BEGIN resource mismatch')
 const accepted=textureSnapshot??(expectedSourceMaterialContext2?canonicalSourceStrokeSnapshotV2(capturedSnapshot,epoch,rasterProfile):canonicalStrokeSnapshotV2(capturedSnapshot,epoch,rasterProfile))
 if((selector.value===3||selector.value===4||selector.value===5||selector.value===6||selector.value===7||selector.value===8)&&expectedDescriptorSha256===undefined||expectedDescriptorSha256!==undefined&&accepted.descriptorSha256!==expectedDescriptorSha256)throw Error('Canonical BEGIN descriptor identity mismatch')
 if(selector.value===7){
  if(!expectedMaterialContext7||accepted.materialVersion!==7
   ||JSON.stringify(accepted.material)!==JSON.stringify(expectedMaterialContext7))throw Error('Canonical BEGIN7 prepared context mismatch')
  const phase=canonicalResolvedTexturePhase(input.texturePhase,expectedMaterialContext7.primaryTexture.width,expectedMaterialContext7.primaryTexture.height)
  if(phase.x!==expectedMaterialContext7.primaryTexture.phase.x||phase.y!==expectedMaterialContext7.primaryTexture.phase.y)throw Error('Canonical BEGIN7 phase mismatch')
 }
 if(selector.value===8){
  if(!expectedMaterialContext8||accepted.materialVersion!==8||JSON.stringify(accepted.material)!==JSON.stringify(expectedMaterialContext8))throw Error('Canonical BEGIN8 prepared context mismatch')
  const phase=canonicalResolvedTexturePhase(input.texturePhase,expectedMaterialContext8.primaryTexture.width,expectedMaterialContext8.primaryTexture.height)
  if(phase.x!==expectedMaterialContext8.primaryTexture.phase.x||phase.y!==expectedMaterialContext8.primaryTexture.phase.y)throw Error('Canonical BEGIN8 phase mismatch')
 }
 if(expectedSourceMaterialContext2){if(accepted.materialVersion!==2||JSON.stringify(canonicalSourceMaterialContext(accepted.material))!==JSON.stringify(expectedSourceMaterialContext2))throw Error('Canonical BEGIN original source2 context mismatch')}
 else if(accepted.materialVersion===2&&(accepted.material.maskingBlend!==undefined||accepted.material.materialParams!==undefined||accepted.material.colorParams!==undefined||accepted.material.scaledSource!==undefined||accepted.material.imageFrameIndices!==undefined||accepted.material.sourceColorFields!==undefined||accepted.material.roleTextures!==undefined||accepted.material.outerCompositionLaw!==undefined||accepted.material.primarySource.kind==='image'&&accepted.material.primarySource.imageMaterial))throw Error('Canonical BEGIN source2 without original preparation')
 const scale=Object.getOwnPropertyDescriptor(input,'sourceScale')
 if(scale){if(accepted.materialVersion!==2&&accepted.materialVersion!==8||accepted.material.scaledSource!=='source-scale-v1'||accepted.material.primarySource.brushScale!==scale.value)throw Error('Canonical BEGIN source scale ACK mismatch')}
 else if((accepted.materialVersion===2||accepted.materialVersion===8)&&accepted.material.scaledSource!==undefined)throw Error('Unexpected canonical BEGIN scaled source')
 const copy=structuredClone(accepted)
 return freeze({ok:true,snapshot:copy,recordedNext:result.recordedNext,liveNext:result.liveNext,ended:result.ended})
}
/** One BEGIN attempt. No retry, queue, outbox or author/session ownership. */
export function sendCanonicalStrokeBegin(socket:CanonicalBeginEmitter|null,input:CanonicalStrokeBegin,lifetime:CanonicalBeginLifetime):Promise<CanonicalBeginOutcome>{
 return new Promise((resolve,reject)=>{
  if(!socket){reject(Error('canonical BEGIN: no active socket'));return}
  const {boardEpoch,isCurrent,signal}=lifetime
  const expectedDescriptorSha256=lifetime.expectedDescriptorSha256
  if(expectedDescriptorSha256!==undefined&&(typeof expectedDescriptorSha256!=='string'||!/^[a-f0-9]{64}$/.test(expectedDescriptorSha256))){reject(Error('Invalid canonical BEGIN descriptor identity'));return}
  let authorPixelMaskedSource:CanonicalAuthorPixelMaskedSource|undefined,expectedSourceMaterialContext2:CanonicalMaterialContextV2|undefined
  let authorPrimaryGrainSource:CanonicalAuthorPrimaryGrainSource|undefined,expectedMaterialContext8:CanonicalMaterialContextV8|undefined
  let sourceScale:number|undefined,textureGradient:CanonicalTextureGradientRGBA|undefined,sourceColorFields:CanonicalSourceColorFields|undefined,sourceRoleTextureInputs:CanonicalSourceRoleTexturesInput|undefined
  let profiles:readonly CanonicalStrokeRasterProfile[],authorTexturedSource:CanonicalAuthorTexturedSource|undefined,authorPressureTexturedSource:CanonicalAuthorPressureTexturedSource|undefined,authorSoftPressureTexturedSource:CanonicalAuthorSoftPressureTexturedSource|undefined,authorTexturedAutoSource:CanonicalAuthorTexturedAutoSource|undefined,expectedMaterialContext7:CanonicalMaterialContextV7|undefined,texturePhase:CanonicalResolvedTexturePhase|undefined
  try{
   if(lifetime.rasterProfile!==undefined&&(lifetime.authorRasterProfile!==undefined||lifetime.responseRasterProfiles!==undefined))throw Error('Ambiguous canonical BEGIN raster profile')
   const author=lifetime.authorRasterProfile!==undefined?lifetime.authorRasterProfile:lifetime.rasterProfile===undefined?CANONICAL_STROKE_RASTER_PROFILE:lifetime.rasterProfile
   profiles=canonicalRecordedRasterProfiles({allowedRasterProfiles:lifetime.responseRasterProfiles===undefined?[author]:lifetime.responseRasterProfiles})
   if(!profiles.includes(author))throw Error('Canonical BEGIN author profile unavailable')
   // Validate original captured author metadata before async emission; material2
   // remains unchanged and ACKs cannot establish plain geometry eligibility.
   authorPixelMaskedSource=canonicalAuthorPixelMaskedSource(lifetime,'authorPixelMaskedSource',author)
   const masked=Object.getOwnPropertyDescriptor(lifetime,'expectedSourceMaterialContext2')
   if(!masked&&'expectedSourceMaterialContext2'in lifetime||masked&&!Object.hasOwn(masked,'value'))throw Error('Invalid canonical masked prepared context')
   if(masked){if(expectedDescriptorSha256===undefined||Object.getOwnPropertyDescriptor(lifetime,'expectedMaterialContext7')||Object.getOwnPropertyDescriptor(lifetime,'expectedMaterialContext8'))throw Error('Canonical source2 original preparation unavailable');const context=canonicalSourceMaterialContext(masked.value);if(context.maskSource?authorPixelMaskedSource!=='pixel-masked-v1':context.primarySource.kind==='image'?canonicalAuthorImageMaterialSource(lifetime,'authorImageMaterialSource',author)!=='pixel-image-material-v1':canonicalAuthorPlainAutoGeometrySource(lifetime,'authorPlainAutoGeometrySource',author)!=='dynamic-auto-geometry-v1')throw Error('Canonical source2 original author unavailable');expectedSourceMaterialContext2=context}
   canonicalAuthorPlainTiltSource(lifetime,'authorPlainTiltSource',author)
   canonicalAuthorPlainAutoGeometrySource(lifetime,'authorPlainAutoGeometrySource',author)
   authorPrimaryGrainSource=canonicalAuthorPrimaryGrainSource(lifetime,'authorPrimaryGrainSource',author)
   authorTexturedAutoSource=canonicalAuthorTexturedAutoSource(lifetime,'authorTexturedAutoSource',author)
   const context8=Object.getOwnPropertyDescriptor(lifetime,'expectedMaterialContext8')
   if(!context8&&'expectedMaterialContext8'in lifetime||context8&&!Object.hasOwn(context8,'value'))throw Error('Invalid canonical BEGIN8 prepared context')
   if(context8){
    if(authorPrimaryGrainSource!=='primary-grain-image-v1'||expectedDescriptorSha256===undefined||Object.getOwnPropertyDescriptor(lifetime,'expectedMaterialContext7'))throw Error('Canonical BEGIN8 original preparation unavailable')
    expectedMaterialContext8=canonicalPrimaryGrainMaterialContext(context8.value)
    const phase=Object.getOwnPropertyDescriptor(input,'texturePhase');if(!phase||!Object.hasOwn(phase,'value'))throw Error('Canonical BEGIN8 own phase required')
    texturePhase=canonicalResolvedTexturePhase(phase.value,expectedMaterialContext8.primaryTexture.width,expectedMaterialContext8.primaryTexture.height)
    if(texturePhase.x!==expectedMaterialContext8.primaryTexture.phase.x||texturePhase.y!==expectedMaterialContext8.primaryTexture.phase.y)throw Error('Canonical BEGIN8 request phase mismatch')
    const pin=expectedMaterialContext8.primaryTexture,table=Object.getOwnPropertyDescriptor(input,'textureGradient')
    if(pin.law==='pixel-color-texture-v1'&&pin.mode==='gradient'){if(!table||!Object.hasOwn(table,'value'))throw Error('Canonical BEGIN texture gradient missing');textureGradient=canonicalTextureGradientRGBA(table.value);if(JSON.stringify(textureGradient)!==JSON.stringify(pin.gradient))throw Error('Canonical BEGIN texture gradient differs')}
    else if(table||'textureGradient'in input)throw Error('Unexpected canonical BEGIN texture gradient')
   }
   if(!expectedMaterialContext8&&('textureGradient'in input||Object.getOwnPropertyDescriptor(input,'textureGradient')))throw Error('Canonical BEGIN gradient without original preparation')
   const contextField=Object.getOwnPropertyDescriptor(lifetime,'expectedMaterialContext7')
   if(!contextField&&'expectedMaterialContext7'in lifetime||contextField&&!Object.hasOwn(contextField,'value'))throw Error('Invalid canonical BEGIN7 prepared context')
   if(contextField){
    if(authorTexturedAutoSource!=='textured-auto-material-v7'||expectedDescriptorSha256===undefined)throw Error('Canonical BEGIN7 original preparation unavailable')
    expectedMaterialContext7=canonicalTexturedAutoMaterialContext(contextField.value)
    const phaseField=Object.getOwnPropertyDescriptor(input,'texturePhase')
    if(!phaseField||!Object.hasOwn(phaseField,'value'))throw Error('Canonical BEGIN7 own phase required')
    texturePhase=canonicalResolvedTexturePhase(phaseField.value,expectedMaterialContext7.primaryTexture.width,expectedMaterialContext7.primaryTexture.height)
    if(texturePhase.x!==expectedMaterialContext7.primaryTexture.phase.x||texturePhase.y!==expectedMaterialContext7.primaryTexture.phase.y)throw Error('Canonical BEGIN7 request phase mismatch')
   }else if(!expectedMaterialContext8&&(Object.getOwnPropertyDescriptor(input,'texturePhase')||'texturePhase'in input))throw Error('Canonical BEGIN phase without preparation')
   const roleInputs=Object.getOwnPropertyDescriptor(input,'sourceRoleTextureInputs'),expectedRoles=expectedSourceMaterialContext2?.roleTextures
   if(roleInputs||'sourceRoleTextureInputs'in input){
    if(!roleInputs||!Object.hasOwn(roleInputs,'value')||!expectedRoles)throw Error('Canonical BEGIN role texture preparation missing')
    sourceRoleTextureInputs=canonicalSourceRoleTexturesInput(roleInputs.value)
    if(JSON.stringify(sourceRoleTextureInputs)!==JSON.stringify(sourceRoleTextureInputsFromPins(expectedRoles)))throw Error('Canonical BEGIN role texture inputs differ')
   }else if(expectedRoles)throw Error('Canonical BEGIN role texture inputs missing')
   const spatialField=Object.getOwnPropertyDescriptor(input,'sourceColorFields'),expectedFields=(expectedSourceMaterialContext2??expectedMaterialContext8)?.sourceColorFields
   if(spatialField||'sourceColorFields'in input){
    if(!spatialField||!Object.hasOwn(spatialField,'value')||!expectedFields)throw Error('Canonical BEGIN spatial paint preparation missing')
    sourceColorFields=canonicalSourceColorFields(spatialField.value)
    if(JSON.stringify(sourceColorFields)!==JSON.stringify(expectedFields))throw Error('Canonical BEGIN spatial paint resource differs')
   }else if(expectedFields)throw Error('Canonical BEGIN spatial paint resource missing')
   const scaleField=Object.getOwnPropertyDescriptor(input,'sourceScale')
   if(scaleField||'sourceScale'in input){
    if(!scaleField||!Object.hasOwn(scaleField,'value')||typeof scaleField.value!=='number'||!Number.isFinite(scaleField.value)||scaleField.value<=0||scaleField.value>1e6)throw Error('Invalid canonical BEGIN source scale')
    const expected=expectedSourceMaterialContext2??expectedMaterialContext8
    if(!expected||expected.scaledSource!=='source-scale-v1'||expected.primarySource.brushScale!==scaleField.value)throw Error('Canonical BEGIN source scale differs from prepared source')
    sourceScale=scaleField.value
   }else if((expectedSourceMaterialContext2??expectedMaterialContext8)?.scaledSource==='source-scale-v1')throw Error('Canonical BEGIN prepared source scale missing')
   authorSoftPressureTexturedSource=canonicalAuthorSoftPressureTexturedSource(lifetime,'authorSoftPressureTexturedSource',author)
   authorPressureTexturedSource=canonicalAuthorPressureTexturedSource(lifetime,'authorPressureTexturedSource',author)
   authorTexturedSource=canonicalAuthorTexturedSource(lifetime,'authorTexturedSource',author)
  }catch{reject(Error('Invalid canonical BEGIN raster profile policy'));return}
  const timeout=lifetime.timeoutMs??5000
  if(!integer(boardEpoch)||!Number.isSafeInteger(timeout)||timeout<=0||timeout>2147483647){reject(Error('Invalid canonical BEGIN lifetime'));return}
  const nonce=Object.getOwnPropertyDescriptor(input,'emptyDiscardNonce')
  if('emptyDiscardNonce'in input&&(!nonce||!Object.hasOwn(nonce,'value')||typeof nonce.value!=='string'||!/^[A-Za-z0-9_-]{10,64}$/.test(nonce.value))){reject(Error('Invalid canonical BEGIN empty control'));return}
  const request=freeze({...sourceRoleTextureInputs?{sourceRoleTextureInputs}:{},...sourceColorFields?{sourceColorFields}:{},...textureGradient?{textureGradient}:{},...sourceScale!==undefined?{sourceScale}:{},...nonce?{emptyDiscardNonce:nonce.value}:{},...texturePhase?{texturePhase}:{},layerId:input.layerId,brush:input.brush,strokeId:input.strokeId,pigmentRgb8:[...input.pigmentRgb8] as [number,number,number],outerResourceOpacity:input.outerResourceOpacity,alphaDarken:input.alphaDarken})
  let emitted=false,discarded=false
  const discard=()=>{if(discarded||!emitted||!request.emptyDiscardNonce)return;discarded=true;try{lifetime.discardEmpty?.()}catch(error){console.error('Canonical empty discard cleanup failed',error)}}
  let settled=false,timer:ReturnType<typeof setTimeout>|undefined,registered=false,abortRegistered=false
  const finish=(error?:unknown,value?:CanonicalBeginOutcome)=>{
   if(settled)return;settled=true
   if(timer!==undefined)clearTimeout(timer)
   let cleanupError:unknown
   try{if(registered)socket.off('disconnect',disconnected)}catch(e){cleanupError=e}
   try{if(abortRegistered)signal!.removeEventListener('abort',aborted)}catch(e){cleanupError??=e}
   if(error!==undefined||cleanupError!==undefined)reject(error??cleanupError);else resolve(value!)
  }
  const disconnected=()=>finish(Error('Canonical BEGIN socket disconnected'))
  const aborted=()=>{discard();finish(Error('Canonical BEGIN aborted'))}
  try{
   if(signal?.aborted||!isCurrent()){finish(Error('Stale canonical BEGIN lifetime'));return}
   registered=true;socket.on('disconnect',disconnected)
   if(settled)return
   if(signal){abortRegistered=true;signal.addEventListener('abort',aborted,{once:true})}
   if(settled)return
   if(signal?.aborted){aborted();return}
   timer=setTimeout(()=>{discard();finish(Error('Canonical BEGIN timed out'))},timeout)
   emitted=true
   socket.emit('canonical_stroke_begin',request,result=>{
    if(settled)return
    try{if(signal?.aborted||!isCurrent())throw Error('Stale canonical BEGIN lifetime');const value=validate(result,request,boardEpoch,profiles,expectedDescriptorSha256,authorTexturedSource,authorPressureTexturedSource,authorSoftPressureTexturedSource,authorTexturedAutoSource,expectedMaterialContext7,authorPrimaryGrainSource,expectedMaterialContext8,expectedSourceMaterialContext2);if(value.ok)lifetime.onBeginAccepted?.();finish(undefined,value)}catch(e){discard();finish(e)}
   })
  }catch(e){discard();finish(e)}
 })
}
