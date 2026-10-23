import fs from 'node:fs'
import {strokeDabs} from '../../packages/shared/src/index'
import {createCanonicalStrokeChunkState,prepareCanonicalStrokeChunk} from '../../apps/web/src/engine/src/dabs/canonicalStrokeChunk'
import {presetForTool} from '../../apps/web/src/engine/src/presets/resolvePreset'
import {ribbonProfileFor} from '../../apps/web/src/engine/src/dabs/ribbonProfile'
import {sourceCommandManifest} from '../../docs/qa/harness/728-native-end-to-end/sourceManifest'
const report=JSON.parse(fs.readFileSync('temp/device-runs/native-literal-surface/actual/report.json','utf8')).rows[0].report
const options={diagnosticWaterPolicy:'bottomless',diagnosticSharedFluid:true,diagnosticLandingReservoir:true,diagnosticLandingPolicy:'fluid',diagnosticCanonicalSettleRadius:true,diagnosticSolventField:true,diagnosticPigmentRecord:true} as const
const commands:any[]=[]
for(const op of report.tape){if(op.type!=='stroke')continue;const state=createCanonicalStrokeChunkState(),preset=presetForTool('watercolor',op.preset),profile=ribbonProfileFor('watercolor',op.preset,0),dabs=strokeDabs(op)
for(let i=0;i<dabs.length;i++){const prepared=prepareCanonicalStrokeChunk(state,{dabs:[dabs[i]],previous:state.lastKept,preset,presetName:op.preset,profile,color:op.color,wetProfile:op.wet?.slice(i,i+1)??'0',strokeSeed:[0,0],tile:{originX:0,originY:0,buffer:{width:1024,height:1024}},film:true,segmentMode:'combined',segmented:true,options});commands.push(...prepared.commands.filter(c=>c.phase==='coverage'))}}
const manifest=sourceCommandManifest(commands),selected=report.sequenceOracle.rows.at(-1),match=JSON.stringify(manifest[9]?.stamp)===JSON.stringify(selected.stamp),sites=[[572.5,435.5],[565.5,436.5],[566.5,436.5]]
const near=manifest.filter(c=>sites.some(([x,y])=>x>=c.bounds[0]&&x<=c.bounds[2]&&y>=c.bounds[1]&&y<=c.bounds[3]));const result={scope:'CPU-only exact helper reconstruction from frozen packed tape, no GPU/artist tuning',tapeSha256:report.tapeSha256,paperSha256:report.paperSha256,commands:manifest.length,selected9ExactUniformObject:match,worldSites:sites,relevantCommands:near}
fs.writeFileSync('temp/native-source-offline/source-command-localization.json',JSON.stringify(result,null,2));console.log(JSON.stringify({commands:manifest.length,selected9Exact:match,relevant:near.map(c=>({index:c.index,kind:c.kind,bounds:c.bounds,center:c.stamp?.center}))}))
