import {runEndToEnd} from '../728-native-end-to-end/run'
import type {Operation} from '@grafetto/shared'
/** Exact supplied packed operations; no synthetic dabs, no ID/wet/time rewrite.
 * Sequential GPU owners preserve bounded allocation. PNGs accompany raw-byte metrics. */
export async function runCapturedTape(tape:readonly Operation[],{stages=false}:{stages?:boolean|'prediffuse'}={}){
 return runEndToEnd({size:100,suppliedTape:tape,exportImages:true,stages})
}
Object.assign(window,{runCapturedTape})
