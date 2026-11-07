import {bristleSaturationProfileBytes,type BrushBristle} from '@grafetto/shared'
import {importedAssetPixels} from './importedBrushes'
import type {BristleInkProfile} from './brushBristleInk'
import {loadBristleSaturationTable,retireBristleSaturationTable,createBristleSaturationTableBinding,acquireBristleSaturationTableBinding,type BristleSaturationTableBinding,type BristleSaturationTable} from './brushBristleSaturationTable'

type SaturatingBristle=Extract<BrushBristle,{version:2}>
interface Ready {readonly raw:WeakRef<Uint8Array>;readonly profile:BristleInkProfile;readonly binding:BristleSaturationTableBinding;readonly signature:string}
const ready=new WeakMap<SaturatingBristle,Ready>()
const pending=new WeakMap<SaturatingBristle,Promise<void>>()
const signature=(b:SaturatingBristle)=>{
 const ref=b.saturationLookup
 if(!ref||!b.ink.useSaturation)throw Error('Bristle saturation lookup is required')
 return `${ref.version}:${ref.encoding}:${ref.asset}:${ref.profileSha256}:${ref.byteLength}`
}
export function bristleSaturationLookupReady(b:BrushBristle):boolean {
 if(b.version!==2||!b.ink.useSaturation)return true
 const old=ready.get(b)
 if(!old||old.signature!==signature(b))return false
 try{return old.raw.deref()===importedAssetPixels(b.saturationLookup!.asset)}catch{return false}
}
/** Runs only in the existing asynchronous asset preparation boundary. No GL,
 * compiler, quality screen, decoded-byte copy, or persistent source-byte bank. */
export function prepareBristleSaturationLookup(b:BrushBristle):Promise<void>|null {
 if(b.version!==2||!b.ink.useSaturation||bristleSaturationLookupReady(b))return null
 const existing=pending.get(b);if(existing)return existing
 const work=(async()=>{
  if(!Object.isFrozen(b)||!Object.isFrozen(b.ink)||!Object.isFrozen(b.ink.depletion))throw Error('Expected immutable Bristle descriptor')
  const ref=b.saturationLookup!,key=signature(b),raw=importedAssetPixels(ref.asset)
  const bytes=bristleSaturationProfileBytes(b.ink)
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))
  const hex=Array.from(digest,x=>x.toString(16).padStart(2,'0')).join('')
  if(hex!==ref.profileSha256)throw Error('Bristle saturation profile checksum mismatch')
  if(signature(b)!==key||importedAssetPixels(ref.asset)!==raw)throw Error('Bristle saturation source changed during preparation')
  // Canonical93 borrows the already F32-normalized immutable descriptor curve.
  const profile:BristleInkProfile=Object.freeze({...b.ink,amount:b.ink.depletion.length})
  const table=loadBristleSaturationTable(profile,raw,ref.byteLength)
  const binding=createBristleSaturationTableBinding(table)
  retireBristleSaturationTable(table)
  ready.set(b,Object.freeze({raw:new WeakRef(raw),profile,binding,signature:key}))
 })().finally(()=>{if(pending.get(b)===work)pending.delete(b)})
 pending.set(b,work);return work
}
/** Paint consumes only a binding established before the operation. Its opaque
 * table borrows room-owned raw bytes until the Batch drops it on replacement. */
export function acquireBristleSaturationLookup(b:BrushBristle):Readonly<{profile:BristleInkProfile;table:BristleSaturationTable}> {
 if(b.version!==2||!b.ink.useSaturation||!bristleSaturationLookupReady(b))throw Error('Bristle saturation lookup is not prepared')
 const binding=ready.get(b)!,ref=b.saturationLookup!
 return Object.freeze({profile:binding.profile,table:acquireBristleSaturationTableBinding(binding.binding,importedAssetPixels(ref.asset))})
}
