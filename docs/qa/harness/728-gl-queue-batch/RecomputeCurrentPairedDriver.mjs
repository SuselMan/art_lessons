import{actual128DonorFractions,liftActual128Fractions}from'./Actual128PairedDriverAdapter.mjs';
/** Mirror shipped wcResample mode0 four-centre taps, not area mean. */
export function reduceCurrentPairedP({moments,origin,side=128,oldP}){
 if(side!==128||moments?.length!==16384*8||oldP?.length!==65536||origin?.length!==2||origin.some(v=>!Number.isInteger(v)||v%8||v<0||v+128>1024))throw Error('Aligned current128 four-tap reduction');
 const result=Float64Array.from(oldP);for(let y=0;y<16;y++)for(let x=0;x<16;x++)for(let c=0;c<4;c++){
  let value=0;for(const dy of [3,4])for(const dx of [3,4]){const v=moments[((y*8+dy)*128+x*8+dx)*8+c];if(!Number.isFinite(v)||v<0)throw Error('Positive current paired moments');value+=v*.25;}
  result[((origin[1]/8+y)*128+origin[0]/8+x)*4+c]=value;
 }
 return result;
}
export function recomputeCurrentPairedDriver({moments,origin,side=128,highWet,driver}){
 const oldP=reduceCurrentPairedP({moments,origin,side,oldP:driver.oldP});const next=actual128DonorFractions({...driver,oldP});const lift=liftActual128Fractions({driver:next,origin,side,highWet});return{driver:next,lift};
}
