import {continuous400Points} from './ContinuousPenRecipe.mjs';
/** Authored timeline, not a scheduler clock. Exactly two samples per real RAF. */
export function fixed400Tape(){
 const strokes=[['QAwater001',[.3,.15,.55]],['QApigmt002',[.15,.5,.3]]].map(([strokeId,color])=>{
  const frames=Array.from({length:108},(_,frame)=>Object.freeze(Array.from({length:2},(_,i)=>{
   const t=(frame*2+i+1)*1800/216,leg=Math.min(5,Math.floor(t/300)),u=(t-leg*300)/300;
   return Object.freeze({elapsedMs:t,worldX:continuous400Points[leg][0]+(continuous400Points[leg+1][0]-continuous400Points[leg][0])*u,worldY:continuous400Points[leg][1]+(continuous400Points[leg+1][1]-continuous400Points[leg][1])*u,pressure:.8});
  })));
  return Object.freeze({strokeId,color:Object.freeze(color),size:400,preset:'normal:100:100:PB29:round',frames:Object.freeze(frames)});
 });
 return Object.freeze(strokes);
}
/** Slow RAF extends wall duration; it never skips or catches up authored samples. */
export async function deliverFixedFrames(stroke,{raf,deliver,deadline,now=()=>performance.now()}){
 for(let index=0;index<stroke.frames.length;index++){
  const at=await raf();if(now()>deadline)throw Error('Fixed tape deadline');
  deliver(stroke.frames[index],{index,realRaf:at,realNow:now()});
 }
}
