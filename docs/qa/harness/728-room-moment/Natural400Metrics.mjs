/** Read-only analysis after timed input. rAF/display submission never implies visible pixels. */
export function natural400Metrics(row){
 const second=row.markers.filter(m=>m.ordinal===1),down=second.find(m=>m.kind==='down'),up=second.find(m=>m.kind==='up');
 if(!down||!up)throw Error('Actual second DOWN/UP required');
 for(const m of row.markers)if(!Number.isFinite(m.at)||!Number.isFinite(m.end)||m.end<m.at)throw Error('Invalid marker clocks');
 const source=second.find(m=>m.kind==='pigment-source'&&m.at>=down.at&&m.end<=up.end),display=second.find(m=>m.kind==='display-submission'&&source&&m.at>=source.end),frame=row.markers.find(m=>m.kind==='post-up-raf'&&m.at>=up.end),hover=row.markers.find(m=>m.kind==='next-hover'&&m.at>=up.end);
 if(!source||!display||!frame||!hover)throw Error('Actual source/display/post-UP availability required');
 const gaps=row.rows.flatMap(r=>r.frames.map((at,i)=>at-(i?r.frames[i-1]:r.start))).filter(n=>Number.isFinite(n)&&n>=0).sort((a,b)=>a-b),pick=q=>gaps.length?gaps[Math.min(gaps.length-1,Math.floor((gaps.length-1)*q))]:null;
 return{downHandlerMs:down.end-down.at,downToSourceBeginMs:source.at-down.at,downToSourceEndMs:source.end-down.at,downToDisplayBeginMs:display.at-down.at,downToDisplayEndMs:display.end-down.at,upHandlerMs:up.end-up.at,upBeginToFirstRafCallbackMs:frame.at-up.at,upReturnToFirstRafCallbackMs:frame.at-up.end,upReturnToScheduledHoverMs:hover.at-up.end,hoverHandlerMs:hover.end-hover.at,completeSettle:second.filter(m=>m.kind==='completeSettle').map(m=>({phase:m.phase,ms:m.end-m.at})),frameGaps:{count:gaps.length,medianMs:pick(.5),p95Ms:pick(.95),maxMs:gaps.at(-1)??null},scope:'CPU submission and synthetic rAF/hover availability; hover deliberately after3frames; not physical visible latency'};
}
