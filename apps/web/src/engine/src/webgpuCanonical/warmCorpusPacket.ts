import type {Dab} from '@grafetto/shared'
import {presetForTool} from '../presets/resolvePreset'
import {ribbonProfileFor} from '../dabs/ribbonProfile'
import {createCanonicalStrokeChunkState,prepareCanonicalStrokeChunk} from '../dabs/canonicalStrokeChunk'
import type {PreparedSourceSegment} from './sourcePhaseExecutor'
/** Explicit QA synthetic corpus input, derived by the unchanged production CPU
 * preparer in a NEW detached state. Not a captured user's operation or a claim
 * about the eventual live packet. It warms source shader shapes only. */
export function createWarmCorpusPacket():PreparedSourceSegment{
 const presetName='normal:100:70:PB29:round',profile=ribbonProfileFor('watercolor',presetName,0)
 const dabs:Dab[]=Array.from({length:4},(_,i)=>({x:450+i*25,y:512,size:400,pressure:.7,aspectRatio:1,angle:.7,opacity:1,tiltX:0,tiltY:0,t:i*40}))
 const {commands}=prepareCanonicalStrokeChunk(createCanonicalStrokeChunkState(),{dabs,preset:presetForTool('watercolor',presetName),presetName,profile,color:[.2,0,.6],wetProfile:'0000',strokeSeed:[1,2],tile:{originX:0,originY:0,buffer:{width:1024,height:1024}},film:true,segmentMode:false,options:{diagnosticWaterPolicy:'bottomless',diagnosticSharedFluid:true,diagnosticLandingReservoir:true,diagnosticLandingPolicy:'fluid',diagnosticCanonicalSettleRadius:true,diagnosticSolventField:true,diagnosticPigmentRecord:true}})
 return {commands,rect:[0,0,1024,1024],film:true,waterOnly:false}
}
