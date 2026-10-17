/** Cell receiver factors have exact integer sum 16*16384, not independently rounded floats. */
export function receiverWeights(water:Uint8Array,paper:Uint8Array,paperGain=1){
 if(!Number.isFinite(paperGain)||paperGain<0||paperGain>1)throw Error('paperGain')
 if(water.length!==1024**2||paper.length!==water.length)throw Error('finite-volume input dimensions')
 const codes=new Uint16Array(water.length),domain=new Uint8Array(256**2*4)
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){
  const ids:number[]=[],weights:number[]=[];let total=0,wet=true
  for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++){const i=(4*y+dy)*1024+4*x+dx,w=paperGain===1?.75+.5*(1-paper[i]/255):1+paperGain*(.25-.5*paper[i]/255);ids.push(i);weights.push(w);total+=w;wet=wet&&water[i]>0}
  let sum=0;for(let j=0;j<16;j++){const c=Math.round(weights[j]/total*262144);codes[ids[j]]=c;sum+=c}codes[ids[15]]+=262144-sum
  domain[(y*256+x)*4]=wet?255:0;domain[(y*256+x)*4+3]=255
 }
 return{codes,domain}
}
