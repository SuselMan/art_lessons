/** Diagnostic-only: pauses NEXT gesture, never solver; screenshots are outside latency timing. */
export function installWetVisualCheckpoint({ordinal=1,delays=[0,500,1500],deadlineMs=10000}={}){
 if(window.__physicalWetObserver)throw Error('Wet observer already owned');
 const frames=[],wait=()=>new Promise(requestAnimationFrame);let disposed=false;
 const hook=async input=>{if(input.ordinal!==ordinal)return;const up=input.upEnd;for(const delay of delays){while(performance.now()-up<delay){if(disposed)throw Error('Wet observer disposed');await wait()}const ticket={index:frames.length,ordinal,requestedDelay:delay,upEnd:up,requestedAt:performance.now(),ack:false};window.__physicalWetCheckpoint=ticket;frames.push(ticket);const deadline=performance.now()+deadlineMs;while(!ticket.ack){if(disposed||performance.now()>deadline)throw Error('Wet screenshot ACK deadline');await wait()}ticket.completedAt=performance.now()} };
 window.__physicalWetObserver=hook;return{frames,dispose(){disposed=true;if(window.__physicalWetObserver===hook)delete window.__physicalWetObserver;delete window.__physicalWetCheckpoint}};
}
