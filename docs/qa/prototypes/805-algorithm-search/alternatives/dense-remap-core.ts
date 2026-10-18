/** CPU-only integer transport oracle, not a GPU candidate. Static wet-domain control. */
export const REMAP_MAX_DISPLACEMENT=16,REMAP_MAX_DONORS=33*33,REMAP_MAX_REQUEST=REMAP_MAX_DONORS*65535
export interface RemapInput {size:number;rgba:Uint16Array;wet:Uint8Array;velocityQ8:Int32Array}
export function splitPackets(value:readonly number[],weights:readonly number[]){
 if(value.length!==4||value.some(x=>!Number.isInteger(x)||x<0||x>65535||x>value[3])||weights.length!==4||weights.some(x=>!Number.isInteger(x)||x<0)||weights.reduce((a,b)=>a+b,0)!==65536)throw Error('Invalid packet split')
 const a=value[3],out:number[][]=[];let cumulativeWeight=0,previousAlpha=0;const previous=[0,0,0]
 for(const w of weights){cumulativeWeight+=w;const end=Math.floor(a*cumulativeWeight/65536),packet=[0,0,0,end-previousAlpha];for(let k=0;k<3;k++){const endC=a?Math.floor(value[k]*end/a):0;packet[k]=endC-previous[k];previous[k]=endC}out.push(packet);previousAlpha=end}
 return out
}
/** Supercover: a diagonal corner requires BOTH adjacent side cells wet. */
export function wetPath(wet:Uint8Array,size:number,x:number,y:number,tx:number,ty:number){
 const open=(px:number,py:number)=>px>=0&&py>=0&&px<size&&py<size&&wet[py*size+px]!==0
 if(!open(x,y))return false
 const nx=Math.abs(tx-x),ny=Math.abs(ty-y),sx=Math.sign(tx-x),sy=Math.sign(ty-y);let ix=0,iy=0
 while(ix<nx||iy<ny){const a=(1+2*ix)*ny,b=(1+2*iy)*nx;if(a===b){if(!open(x+sx,y)||!open(x,y+sy))return false;x+=sx;y+=sy;ix++;iy++}else if(a<b){x+=sx;ix++}else{y+=sy;iy++}if(!open(x,y))return false}
 return true
}
function packets(input:RemapInput,i:number,visit:(destination:number,packet:number[])=>void){
 const {size,wet,rgba,velocityQ8}=input;if(!wet[i]||!rgba[i*4+3])return
 const x=i%size,y=Math.floor(i/size),dx=velocityQ8[i*2],dy=velocityQ8[i*2+1],px=x*256+dx,py=y*256+dy,bx=Math.floor(px/256),by=Math.floor(py/256),fx=px-bx*256,fy=py-by*256
 const weights=[(256-fx)*(256-fy),fx*(256-fy),(256-fx)*fy,fx*fy],parts=splitPackets(Array.from(rgba.subarray(i*4,i*4+4)),weights)
 for(let p=0;p<4;p++){const tx=Math.max(0,Math.min(size-1,bx+(p%2))),ty=Math.max(0,Math.min(size-1,by+(p>>1))),destination=ty*size+tx;if(destination!==i&&parts[p][3]&&wetPath(wet,size,x,y,tx,ty))visit(destination,parts[p])}
}
export function remapStep(input:RemapInput){
 const {size,rgba,wet,velocityQ8}=input,n=size*size
 if(!Number.isInteger(size)||size<2||size>128||rgba.length!==n*4||wet.length!==n||velocityQ8.length!==n*2)throw Error('Bounded CPU oracle requires2..128 square')
 for(let i=0;i<n;i++){for(let k=0;k<3;k++)if(rgba[i*4+k]>rgba[i*4+3])throw Error('Invalid input premul');for(let k=0;k<2;k++)if(Math.abs(velocityQ8[i*2+k])>4096)throw Error('Displacement exceeds16')}
 const requests=new Uint32Array(n),output=Uint32Array.from(rgba);let requestedAlpha=0,acceptedAlpha=0,maxRequest=0
 for(let i=0;i<n;i++)packets(input,i,(dst,packet)=>{const sum=requests[dst]+packet[3];if(sum>REMAP_MAX_REQUEST)throw Error('Proven request bound exceeded');requests[dst]=sum;requestedAlpha+=packet[3];maxRequest=Math.max(maxRequest,sum)})
 for(let i=0;i<n;i++)packets(input,i,(dst,packet)=>{const free=65535-rgba[dst*4+3],a=Math.floor(packet[3]*free/requests[dst]),take=Math.min(a,packet[3]);acceptedAlpha+=take;for(let k=0;k<4;k++){const amount=k===3?take:Math.floor(packet[k]*take/packet[3]);output[i*4+k]-=amount;output[dst*4+k]+=amount}})
 const sums=[0,0,0,0],before=[0,0,0,0];for(let i=0;i<n;i++)for(let k=0;k<4;k++){const v=output[i*4+k];if(v>65535||v>output[i*4+3])throw Error('Output capacity/premul failure');sums[k]+=v;before[k]+=rgba[i*4+k]}
 if(sums.some((v,k)=>v!==before[k]))throw Error('Four-channel mass loss')
 return{rgba:Uint16Array.from(output),ledger:{before,after:sums,requestedAlpha,acceptedAlpha,rejectedAlpha:requestedAlpha-acceptedAlpha,maxRequest,requestBound:REMAP_MAX_REQUEST}}
}
