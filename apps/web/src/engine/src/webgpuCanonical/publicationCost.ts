export type PublicationCostPhase='canvasSubmit'|'queuePrefixAck'|'glCanvasImport'|'glStateRead'
export interface PublicationCost {phase:PublicationCostPhase;wallMs:number;ok:boolean}
/** Scalar observer only; original calls and their existing ACK remain authoritative. */
export function publicationCostMarker(report:(cost:PublicationCost)=>void,now:()=>number=()=>performance.now()){
 return(phase:PublicationCostPhase)=>{
  let start:number|null=null;try{const value=now();if(Number.isFinite(value))start=value}catch{}
  return(ok:boolean)=>{try{const elapsed=start===null?NaN:now()-start;const valid=Number.isFinite(elapsed)&&elapsed>=0;report({phase,wallMs:valid?elapsed:0,ok:ok&&valid})}catch{/* Diagnostic callback cannot change publication. */}}
 }
}
