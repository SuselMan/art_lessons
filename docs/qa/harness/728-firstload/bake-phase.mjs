/** Stored restore has its own bitmap/paint0 proof; only replay stages require no new bakes. */
export function assertBakePhase(trace,stage){
 if(!trace||!Array.isArray(trace.bakes)||typeof trace.bakingEnabled!=='boolean')throw Error('Actual snapshot probe required');
 const suppressionRequired=stage!=='stored49';
 if(suppressionRequired&&(trace.bakingEnabled||trace.bakes.length))throw Error('Normal bakes must stay suppressed before ordinary47/semantic48');
 return{stage,suppressionRequired,bakingEnabled:trace.bakingEnabled,bakeCount:trace.bakes.length};
}
