import type{Dab}from '@grafetto/shared'
import{createCanonicalStrokeChunkState,prepareCanonicalStrokeChunk,type CanonicalDrawCommand}from '../../../../apps/web/src/engine/src/dabs/canonicalStrokeChunk'
import{presetForTool}from '../../../../apps/web/src/engine/src/presets/resolvePreset'
import{ribbonProfileFor}from '../../../../apps/web/src/engine/src/dabs/ribbonProfile'
/** Explicit controlled canonical input, not newly recorded user author input.
 * Actual CPU delivery/geometry algorithms; fixed radius permits factor isolation. */
export const MOVING_CONTACT_DABS:readonly Dab[]=[
 [300,400,.7],[340,400,.7],[380,400,.7],[420,420,.7],[460,440,.7],[500,440,.1],[540,440,.02],[560,440,0],
].map(([x,y,pressure],i)=>({x:x!,y:y!,pressure:pressure!,size:400,aspectRatio:1,angle:0,opacity:.3593669231992319,tiltX:0,tiltY:0,t:i*30}))
const options={diagnosticWaterPolicy:'bottomless',diagnosticSharedFluid:true,diagnosticLandingReservoir:true,diagnosticLandingPolicy:'fluid',diagnosticCanonicalSettleRadius:true,diagnosticSolventField:true,diagnosticPigmentRecord:true}as const
export function movingContactCommands(partitioned:boolean):CanonicalDrawCommand[]{
 const state=createCanonicalStrokeChunkState(),name='normal:100:100:PB29:round',preset=presetForTool('watercolor',name),profile=ribbonProfileFor('watercolor',name,0)
 const input={preset,presetName:name,profile,color:[.2,0,.6]as[number,number,number],wetProfile:'00000000',strokeSeed:[76.17525773195877,164.67415730337078]as[number,number],tile:{originX:0,originY:0,buffer:{width:1024,height:1024}},film:true,segmentMode:'combined' as const,options}
 if(!partitioned)return prepareCanonicalStrokeChunk(state,{...input,dabs:[...MOVING_CONTACT_DABS]}).commands
 const commands:CanonicalDrawCommand[]=[]
 for(const dab of MOVING_CONTACT_DABS)commands.push(...prepareCanonicalStrokeChunk(state,{...input,dabs:[dab],previous:state.lastKept,wetProfile:'0',segmented:true}).commands)
 return commands
}
export function commandFingerprint(commands:readonly CanonicalDrawCommand[]):string{
 return JSON.stringify(commands.map(c=>c.kind==='stamp'?c:{...c,batch:{...c.batch,vertices:Array.from(c.batch.vertices)}}))
}
