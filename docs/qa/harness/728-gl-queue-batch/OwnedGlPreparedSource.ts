import type { CanonicalDrawCommand } from '../../../../apps/web/src/engine/src/dabs/canonicalStrokeChunk'
import type { PaintTarget } from '../../../../apps/web/src/engine/src/buffers/ILayerBuffer'
import type { RibbonPasses, RibbonPassesContext } from '../../../../apps/web/src/engine/src/raster/RibbonPasses'
import type { WatercolorPasses } from '../../../../apps/web/src/engine/src/raster/WatercolorPasses'
import type { PencilPreset } from '../../../../apps/web/src/engine/src/presets/pencilPresets'
import type { RibbonProfile } from '../../../../apps/web/src/engine/src/dabs/ribbonProfile'
import type { OwnedGlSourceFields } from './OwnedGlSourceFields'
import { createPreparedGlSourcePort } from './PreparedGlSourceDraw'
import { TypedGlSourceReplayPrototype } from './TypedGlSourceReplayPrototype'
export interface PreparedOwnedComposite {
 bounds:{minX:number;minY:number;maxX:number;maxY:number};preset:PencilPreset;profile:RibbonProfile
 color:[number,number,number];opacity:number;fieldSeed:[number,number];spreadPx:number;fringeWater:number;migratePx:number;dabSpacing:number;strokeDir:[number,number];bristleRadiusPx:number
}
/** Own physical visual/source fields only. Canonical FIFO must replay separately against current predecessor base. */
export class OwnedGlPreparedSource {
 private materialInitialized=false
 private solventInitialized=false
 private retired=false
 private readonly lease:OwnedGlSourceFields
 private readonly context:RibbonPassesContext
 private readonly ribbon:RibbonPasses
 private readonly watercolor:WatercolorPasses
 constructor(input:{lease:OwnedGlSourceFields;context:RibbonPassesContext;ribbon:RibbonPasses;watercolor:WatercolorPasses}){
  this.lease=input.lease;this.context=input.context;this.ribbon=input.ribbon;this.watercolor=input.watercolor
 }
 paint(input:{commands:readonly CanonicalDrawCommand[];rect:readonly[number,number,number,number]|null;film:boolean;waterOnly:boolean;composite:PreparedOwnedComposite}):PaintTarget{
  if(this.retired)throw Error('Retired presentation cannot receive source')
  const f=this.lease.fields,tile:PaintTarget={buffer:f.presentation,originX:0,originY:0,contentRect:{minX:0,minY:0,maxX:1024,maxY:1024}},c=input.composite
  const record=new TypedGlSourceReplayPrototype({segments:[{commands:input.commands,rect:input.rect,waterOnly:input.waterOnly}],expectedPredecessorVersion:0,film:input.film,captureRunningCoverage:!this.materialInitialized,initializeMaterialFilm:!this.materialInitialized,initializeSolventFilm:!this.solventInitialized})
  const port=createPreparedGlSourcePort({bindCurrentCanonical:()=>({landedVersion:0,fields:f}),tile,context:this.context,ribbon:this.ribbon,watercolor:this.watercolor,presetHardness:c.preset.hardness})
  record.execute(port)
  this.materialInitialized=true
  if(input.commands.some(command=>command.phase==='solvent'))this.solventInitialized=true
  this.ribbon.drawRibbonCompositeRect(tile,c.bounds,c.preset,c.profile,f.original,f.coverage,f.pigmentLoad,f.colourLoad,c.color,c.opacity,c.fieldSeed,c.spreadPx,c.fringeWater,c.migratePx,c.profile.normalizeDeposit?c.dabSpacing:0,c.strokeDir,c.bristleRadiusPx)
  return tile
 }
 /** Owner coordinator invokes only after normal land or explicit cancellation fence. */
 retire():void{if(this.retired)return;this.retired=true;this.lease.release()}
}
