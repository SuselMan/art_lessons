/** Distinct cross-host cohort; never weakens the two-Surface2200 admission gate. */
export function singleSurfaceSenderGuard(ownership,next){
 if(!['Surface','VPS-sender'].includes(next)||ownership.length>=2||ownership.includes(next)||ownership.some(x=>!['Surface','VPS-sender'].includes(x)))throw Error('Exactly one Surface and one VPS sender permitted');
 if(ownership.length===0&&next!=='Surface')throw Error('Surface admission must precede sender creation');
 if(ownership.length===1&&next!=='VPS-sender')throw Error('Second context must be VPS sender');
}
