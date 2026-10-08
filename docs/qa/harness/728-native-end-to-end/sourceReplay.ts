import {strokeDabs,type StrokeOperation} from '@grafetto/shared'
import {createCanonicalStrokeChunkState,prepareCanonicalStrokeChunk,type CanonicalStrokeChunkInput} from '../../../../apps/web/src/engine/src/dabs/canonicalStrokeChunk'
import {presetForTool} from '../../../../apps/web/src/engine/src/presets/resolvePreset'
import {ribbonProfileFor} from '../../../../apps/web/src/engine/src/dabs/ribbonProfile'
/** Narrow source-only fixture: same per-dab shared CPU recipe as bounded runner, no GPU/model/settle. */
export function replaySourceCoverage(operation:StrokeOperation,options:CanonicalStrokeChunkInput['options']){
 if(operation.tool!=='watercolor'||operation.preset!=='normal:100:100:PB29:round')throw new Error('Source oracle requires original fixed100 PB29 round fixture')
 if(operation.wet&&/[^0]/.test(operation.wet))throw new Error('Source oracle only supports original dry-landing fixture')
 const state=createCanonicalStrokeChunkState(),preset=presetForTool('watercolor',operation.preset),profile=ribbonProfileFor('watercolor',operation.preset,0),dabs=strokeDabs(operation)
 if(!dabs.length||dabs.length>200)throw new Error('Source fixture must contain1..200 packed dabs')
 const commands=[]
 for(let i=0;i<dabs.length;i++){
  const result=prepareCanonicalStrokeChunk(state,{dabs:[dabs[i]],previous:state.lastKept,preset,presetName:operation.preset,profile,color:operation.color,wetProfile:operation.wet?.slice(i,i+1)??'0',strokeSeed:[0,0],tile:{originX:0,originY:0,buffer:{width:1024,height:1024}},film:true,segmentMode:'combined',segmented:true,options})
  commands.push(...result.commands.filter(c=>c.phase==='coverage'))
 }
 return commands
}
