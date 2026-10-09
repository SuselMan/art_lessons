/** Fixed world-space path, separate from canvas/device resolution. */
export const continuous400Points=Object.freeze([[300,300],[600,300],[600,500],[300,500],[300,700],[600,700],[600,500]].map(Object.freeze));
export function continuousPenSamples(points,elapsedMs,frameDeltaMs,{legMs=300,perFrame=2}={}){
 if(points.length!==7||legMs!==300||perFrame!==2||!Number.isFinite(elapsedMs)||!Number.isFinite(frameDeltaMs)||frameDeltaMs<0)throw Error('Fixed six-leg bounded recipe required');
 return Array.from({length:perFrame},(_,index)=>{
  const t=Math.max(0,Math.min(legMs*6,elapsedMs-frameDeltaMs+frameDeltaMs*(index+1)/perFrame));
  const leg=Math.min(5,Math.floor(t/legMs)),fraction=(t-leg*legMs)/legMs;
  return {elapsedMs:t,worldX:points[leg][0]+(points[leg+1][0]-points[leg][0])*fraction,worldY:points[leg][1]+(points[leg+1][1]-points[leg][1])*fraction};
 });
}
export function validateContinuous400Bounds(points=continuous400Points){
 if(points.some(([x,y])=>x-200<0||y-200<0||x+200>1024||y+200>1024))throw Error('400px brush outside bounded world');
 return true;
}
