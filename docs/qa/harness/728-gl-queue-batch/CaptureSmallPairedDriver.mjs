/** OFF capture existing FBOs only, no GL targets/programs. AFTER input, one epoch/pass. */
export function captureSmallPairedDriver(gl,{enabled=false,ownerSequence,epoch,passStep,passStride,origin,side=128,fields,options,packedSha,paperSha}={}){
 if(!enabled)return null;if(ownerSequence!==2||!Number.isInteger(epoch)||!Number.isInteger(passStep)||![1,2,4,8,16].includes(passStride)||side!==128||origin?.length!==2||origin.some(v=>!Number.isInteger(v)||v<0||v%8||v+side>1024)||!/^[a-f0-9]{64}$/.test(packedSha)||!/^[a-f0-9]{64}$/.test(paperSha))throw Error('One128 aligned snapshot current passport');
 const keys=['sourceP','sourceC','fluid','pressure','path','oldP'];if(keys.some(k=>!fields?.[k]?.fbo||!fields[k]?.texture)||new Set(keys.map(k=>fields[k].texture)).size!==6)throw Error('Readonly snapshot input roles/aliases');for(const k of keys){const expected=['pressure','path','oldP'].includes(k)?128:1024;if(fields[k].width!==expected||fields[k].height!==expected)throw Error('Actualfielddimensions')}
 const bytes=2*65536+65536+2*65536+262144;if(bytes>600000)throw Error('Bounded snapshot byte budget');const previous=gl.getParameter(gl.FRAMEBUFFER_BINDING),raw={};try{for(const k of keys){const low=['pressure','path','oldP'].includes(k),type=k==='oldP'?gl.FLOAT:gl.UNSIGNED_BYTE,buffer=k==='oldP'?new Float32Array(65536):new Uint8Array(65536);gl.bindFramebuffer(gl.FRAMEBUFFER,fields[k].fbo);gl.readPixels(low?0:origin[0],low?0:origin[1],128,128,gl.RGBA,type,buffer);if(gl.getError()!==gl.NO_ERROR)throw Error('Snapshot read '+k);raw[k]=buffer}}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,previous)}
 const source=new Float64Array(128*128*8),fluid128=new Float64Array(16384),highWet=new Uint8Array(16384);for(let i=0;i<16384;i++){for(let k=0;k<4;k++){source[i*8+k]=raw.sourceP[i*4+k]/255;source[i*8+4+k]=raw.sourceC[i*4+k]/255}highWet[i]=raw.fluid[i*4+3]>0?1:0;}for(let y=0;y<16;y++)for(let x=0;x<16;x++){const hx=x*8+4,hy=y*8+4,i=(origin[1]/8+y)*128+origin[0]/8+x;fluid128[i]=raw.fluid[(hy*128+hx)*4+3]/255}
 return{raw,source,highWet,driver:{pressure:Float64Array.from(raw.pressure,v=>v/255),path:Float64Array.from(raw.path,v=>v/255),oldP:Float64Array.from(raw.oldP),fluid:fluid128,passStep,passStride,epoch,options:{...options},worldSize:1024},passport:{ownerSequence,epoch,passStep,passStride,origin:origin.slice(),side,packedSha,paperSha,bytes},limitations:['Raw binary SHA must be added by controller before cleanup','Fluid driver values captured only inside ROI; outside zero, not whole-world actual solver equivalence','readback synchronous and diagnostic; not60fps/onsetbenchmark','No newGPUresources and source never written']};
}

/** Hash exact retained readback bytes, not normalized JS numbers. */
export async function hashSmallPairedSnapshot(snapshot,subtle=globalThis.crypto?.subtle){
 if(!snapshot?.raw||!subtle)throw Error('Snapshot and SHA256 provider required');
 const hashes={};for(const [role,a]of Object.entries(snapshot.raw)){
  const bytes=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
  hashes[role]=Array.from(new Uint8Array(await subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 }
 return {...snapshot.passport,rawSha256:hashes};
}
