import './centreFixture'
import {runWetPresentationSnapshot} from '../728-native-wet-presentation/run'
import {runEndToEnd} from '../728-native-end-to-end/run'
import type {Operation} from '@grafetto/shared'
/** Exact supplied packed operations; no synthetic dabs, no ID/wet/time rewrite.
 * Sequential GPU owners preserve bounded allocation. PNGs accompany raw-byte metrics. */
export async function runCapturedTape(tape:readonly Operation[],{stages=false,wetSnapshots=false}:{stages?:boolean|'prediffuse';wetSnapshots?:boolean}={}){
 const result=await runEndToEnd({size:100,suppliedTape:tape,exportImages:true,stages,exportWetSnapshots:wetSnapshots})
 const wetPresentation=[];if(wetSnapshots&&'wetSnapshots' in result)for(const snapshot of result.wetSnapshots??[])wetPresentation.push(await runWetPresentationSnapshot(snapshot))
 return{...result,wetPresentation}
}
Object.assign(window,{runCapturedTape})
