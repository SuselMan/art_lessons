import type {MaterialRect} from './MaterialFieldPages'
export type IndependentTileGroup={field:MaterialRect;cores:MaterialRect[]}
/** Deliberately incorrect numerical experiment: ZERO outside each1536 tile,
 * without the model's backward dependency halo. Never a production planner. */
export function independentM70TilesQA(page:{width:number;height:number}):IndependentTileGroup[]{
 if(!Number.isSafeInteger(page.width)||!Number.isSafeInteger(page.height)||page.width<=0||page.height<=0)throw Error('Invalid independent QA page')
 const groups:IndependentTileGroup[]=[]
 for(let y=0;y<page.height;y+=1536)for(let x=0;x<page.width;x+=1536)groups.push({field:{x,y,width:1536,height:1536},cores:[{x,y,width:Math.min(1536,page.width-x),height:Math.min(1536,page.height-y)}]})
 return groups
}
export type IndependentTimingPhase='restoreHostMs'|'allocationHostMs'|'resetHostMs'|'stepHostMs'|'readbackScatterHostMs'|'cleanupHostMs'
export type IndependentWindowEvent={kind:'window';epoch:number;supportRadius:32|612;independentTiles:boolean;field:MaterialRect;corePixels:number;kept:boolean;completed:boolean;activeHostMs:number;elapsedHostMs:number}&Record<IndependentTimingPhase,number>
export type PagedDiagnosticStage='capture-start'|'capture-done'|'solve-admitted'|'reference-done'|'windows-done'|'postphase-done'|'output-ready'
export type IndependentTileDiagnosticEvent={kind:'stage';epoch:number;stage:PagedDiagnosticStage;atHostMs:number}|{kind:'plan';epoch:number;supportRadius:32|612;independentTiles:boolean;usesProductionWindowPolicy:boolean;plannedWindows:number;plannedFieldPixels:number;plannedCorePixels:number}|IndependentWindowEvent
/** Host wall time includes driver stalls/nested eviction. Not pure GPU time.
 * elapsed additionally includes scheduling waits between generator yields. */
export function createIndependentWindowTiming(independentTiles:boolean,window:IndependentTileGroup,kept:boolean,epoch:number,supportRadius:32|612){
 const started=performance.now(),times:Record<IndependentTimingPhase,number>={restoreHostMs:0,allocationHostMs:0,resetHostMs:0,stepHostMs:0,readbackScatterHostMs:0,cleanupHostMs:0}
 return{
  measure<T>(phase:IndependentTimingPhase,work:()=>T):T{const start=performance.now();try{return work()}finally{times[phase]+=performance.now()-start}},
  finish(completed:boolean):IndependentWindowEvent{return{kind:'window',epoch,supportRadius,independentTiles,field:{...window.field},corePixels:window.cores.reduce((n,c)=>n+c.width*c.height,0),kept,completed,...times,activeHostMs:Object.values(times).reduce((n,t)=>n+t,0),elapsedHostMs:performance.now()-started}},
 }
}
