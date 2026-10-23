(async function(input) {
 const {PencilEngine}=await import('/src/engine/index.ts');
 const {AccumulationBuffer}=await import('/src/engine/src/buffers/AccumulationBuffer.ts');
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;document.body.append(canvas);
 const result={source:input.source,scope:'isolated primitive diagnostic, no Room/native/fullsolver/performance claim',comparisons:0,cases:[],errors:[]};let e;const owned=[];
 try {
  e=new PencilEngine(canvas,{pageWidth:128,pageHeight:128,paper:'flat'});await e.paperReady();
  const gl=e.gl,p=e._watercolorPasses,make=(w,h)=>{const b=new AccumulationBuffer(gl,w,h,'linear');owned.push(b);return b};
  const put=(b,data)=>{gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,b.texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,b.width,b.height,gl.RGBA,gl.UNSIGNED_BYTE,data)};
  const read=b=>{const a=new Uint8Array(b.width*b.height*4);gl.bindFramebuffer(gl.FRAMEBUFFER,b.fbo);gl.readPixels(0,0,b.width,b.height,gl.RGBA,gl.UNSIGNED_BYTE,a);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return a};
  const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
  const w=129,h=5,N=w*h,cost=make(w,h),a=make(w,h),b=make(w,h),dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  let seed=84729;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)>>>24);
  for(let trial=0;trial<40;trial++) {
   // Exactly the independent CPU oracle's RNG order, including discarded V bytes.
   for(let i=0;i<N;i++)random();const bytes=Uint8Array.from({length:N},()=>random()),bandByte=random(),rgba=new Uint8Array(N*4);
   for(let i=0;i<N;i++)rgba[4*i]=bytes[i];put(cost,rgba);
   p.costDomainStep(a,cost,[0,0,w,h],bandByte/255,0);let src=a,dst=b;
   for(let stride=1;stride<=64;stride*=2){
    if(stride>1){p.costDomainStep(dst,src,[0,0,w,h],bandByte/255,stride/2);const swap=src;src=dst;dst=swap;}
    const actual=read(src);
    for(let i=0;i<N;i++)for(let k=0;k<4;k++) {
     let expected=255;for(let n=0;n<=stride;n++){const x=i%w+dirs[k][0]*n,y=Math.floor(i/w)+dirs[k][1]*n;if(x<0||x>=w||y<0||y>=h||bytes[y*w+x]>bandByte){expected=0;break}}
     result.comparisons++;if(actual[4*i+k]!==expected)throw Error(`binary mask mismatch trial${trial} stride${stride} cell${i} channel${k}: ${actual[4*i+k]} != ${expected}`);
    }
   }
   if(!same(read(cost),rgba))throw Error('Immutable cost mutated');
  }
  // Offset support rect, blocked endpoints, one-pixel wall and coarse transport.
  const W=129,H=8,rect=[1,1,128,7],gap=65,C=make(W,H),P=make(W,H),V=make(W,H),fixed=make(W,H),M=make(W,H),Mnext=make(W,H),out=make(W,H);
  const c=new Uint8Array(W*H*4),ink=new Uint8Array(c.length),v=new Uint8Array(c.length);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=4*(y*W+x);c[i]=x===gap?255:x>gap?26:0;v[i+3]=x===gap?0:255;if(x<gap)ink.fill(100,i,i+4)}
  put(C,c);put(P,ink);put(V,v);fixed.clear();p.costDomainStep(M,C,rect,.8,0);let current=M,next=Mnext;
  for(let d=1;d<64;d*=2){p.costDomainStep(next,current,rect,.8,d);const t=current;current=next;next=t;}
  const mask=read(current);for(let y=0;y<H;y++)for(let x=0;x<W;x++)for(let k=0;k<4;k++){let expected=255;for(let n=0;n<=64;n++){const xx=x+dirs[k][0]*n,yy=y+dirs[k][1]*n;if(xx<rect[0]||yy<rect[1]||xx>=rect[2]||yy>=rect[3]||c[4*(yy*W+xx)]/255>.8){expected=0;break}}if(mask[4*(y*W+x)+k]!==expected)throw Error('Offset/drygap mask mismatch');}
  for(const enabled of [false,true]) {
   const opts={d:C,e:V,path:enabled?current:undefined,dir:[64,64],origin:[64,.35],size:[3,100],band:[.8,1],tau:[.45,.7,0]};
   p.fieldOp(out,P,fixed,15,.5,opts);const actual=read(out);let right=0,total=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const mass=actual[4*(y*W+x)+3];total+=mass;if(x>gap)right+=mass}
   result.cases.push({enabled,stride:64,rate:.5,travel:.35,rightPigment:right,total});
  }
  if(result.cases[0].rightPigment===0||result.cases[1].rightPigment!==0)throw Error('Coarsejump OFFpositive/ONzero guard');
  if(!same(read(C),c)||!same(read(P),ink)||!same(read(V),v))throw Error('Immutable C/P/V source modified');
  const timingCost=make(128,128),timingMask=make(128,128),timingNext=make(128,128);
  const timingBytes=new Uint8Array(128*128*4);put(timingCost,timingBytes);
  result.primitiveWarmCost={size:128,scope:'one mask seed plus six dyadic growth draws; 1x1 readback sync, not solver/performance benchmark',samples:[]};
  for(let iteration=0;iteration<8;iteration++) {
   const started=performance.now();p.costDomainStep(timingMask,timingCost,[0,0,128,128],.8,0);let src=timingMask,dst=timingNext;
   for(let distance=1;distance<64;distance*=2){p.costDomainStep(dst,src,[0,0,128,128],.8,distance);const swap=src;src=dst;dst=swap;}
   gl.bindFramebuffer(gl.FRAMEBUFFER,src.fbo);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));gl.bindFramebuffer(gl.FRAMEBUFFER,null);
   if(iteration>=3)result.primitiveWarmCost.samples.push(performance.now()-started);
  }
  result.immutableInputs=true;result.gl=gl.getError();result.lost=gl.isContextLost();result.renderer=gl.getParameter(gl.RENDERER);result.completed=true;
 }catch(error){result.error=String(error)}finally{for(const b of owned.reverse())b.destroy();if(e)e.destroy();canvas.remove();result.engineClosed=true}
 return result;
})
