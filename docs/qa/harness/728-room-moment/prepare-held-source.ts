/** Offline CPU recipe candidates. Recorded geometry/seed/wet are real; actual
 * production wash profile anchoring must be matched to observer metadata first. */
import fs from 'node:fs'
import {strokeDabs,type StrokeOperation} from '@grafetto/shared'
import {createCanonicalStrokeChunkState,prepareCanonicalStrokeChunk} from '../../../../apps/web/src/engine/src/dabs/canonicalStrokeChunk'
import {presetForTool} from '../../../../apps/web/src/engine/src/presets/resolvePreset'
import {ribbonProfileFor} from '../../../../apps/web/src/engine/src/dabs/ribbonProfile'
import {mottleSeedFromStrokeId} from '../../../../apps/web/src/engine/src/presets/watercolorPresets'
import {wetAt} from '../../../../apps/web/src/engine/src/paper/paperWetness'
const tape=JSON.parse(fs.readFileSync(process.argv[2],'utf8')) as StrokeOperation[]
if(tape.length!==3)throw Error('Exactly three held original strokes required')
const options={diagnosticWaterPolicy:'bottomless',diagnosticSharedFluid:true,diagnosticLandingReservoir:true,diagnosticLandingPolicy:'fluid',diagnosticCanonicalSettleRadius:true,diagnosticSolventField:true,diagnosticPigmentRecord:true} as const
const records=[]
for(const operation of tape){
 const dabs=strokeDabs(operation)
 if(dabs.length!==1||operation.tool!=='watercolor')throw Error('Held one-dab watercolor only')
 for(const anchoring of ['wash-first','operation-first'] as const){
  const landing=anchoring==='wash-first'?wetAt(tape[0].wet,0):wetAt(operation.wet,0),state=createCanonicalStrokeChunkState()
  const result=prepareCanonicalStrokeChunk(state,{dabs,preset:presetForTool('watercolor',operation.preset),presetName:operation.preset,profile:ribbonProfileFor('watercolor',operation.preset,landing),color:operation.color,wetProfile:operation.wet??'0',strokeSeed:mottleSeedFromStrokeId(operation.strokeId),tile:{originX:0,originY:0,buffer:{width:1024,height:1024}},film:true,segmentMode:'combined',segmented:true,waterOnly:operation.preset.includes(':100:0:'),options})
  records.push({operationId:operation.id,anchoring,landing,scope:'CPU candidate until actual prepared command observer match; not hardware pixels',commands:result.commands.map(c=>c.kind==='stamp'?c:{kind:c.kind,phase:c.phase,vertices:c.batch.vertices.length,uniforms:c.batch.uniforms})})
 }
}
fs.writeFileSync(process.argv[3],JSON.stringify(records,null,2))
