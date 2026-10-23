(async function(){
 const {PencilEngine}=await import('/src/engine/index.ts'),{AccumulationBuffer}=await import('/src/engine/src/buffers/AccumulationBuffer.ts'),{createProgram,getUniforms}=await import('/src/engine/src/raster/utils.ts');
 const old=await import('/src/engine/src/raster/oldE8Shaders.ts');
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;document.body.append(canvas);
 const r={comparisons:0,subrectComparisons:0,unormCodes:0,carryCases:0,packCases:0},owned=[];let e,programs=[];
 try{
 e=new PencilEngine(canvas,{pageWidth:128,pageHeight:128,paper:'flat'});await e.paperReady();const gl=e.gl,p=e._watercolorPasses;
 const make=(w,h)=>{const b=new AccumulationBuffer(gl,w,h,'nearest');owned.push(b);return b};
 const put=(b,a)=>{gl.bindTexture(gl.TEXTURE_2D,b.texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,b.width,b.height,gl.RGBA,gl.UNSIGNED_BYTE,a)};
 const read=b=>{const a=new Uint8Array(b.width*b.height*4);gl.bindFramebuffer(gl.FRAMEBUFFER,b.fbo);gl.readPixels(0,0,b.width,b.height,gl.RGBA,gl.UNSIGNED_BYTE,a);return a};
 const same=(a,b,label)=>{if(!a.every((v,i)=>v===b[i]))throw Error(label)};
 const w=129,h=5,N=w*h,dirs=[[1,0],[-1,0],[0,1],[0,-1]],cost=make(w,h),a=make(w,h),b=make(w,h);let seed=84729;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)>>>24);
 const build=(rect,band,packed)=>{p.costDomainStep(a,cost,rect,band,0,packed);let src=a,dst=b;for(let d=1;d<64;d*=2){p.costDomainStep(dst,src,rect,band,d,packed);const t=src;src=dst;dst=t;}return src};
 for(let trial=0;trial<40;trial++){
 for(let i=0;i<N;i++)random();const bytes=Uint8Array.from({length:N},random),band=random(),rgba=new Uint8Array(N*4);for(let i=0;i<N;i++)rgba[4*i]=bytes[i];put(cost,rgba);
 for(const rect of [[0,0,w,h],[1,1,w-1,h-1]]){const packed=read(build(rect,band/255,true));for(let stride=1;stride<=64;stride*=2)for(let i=0;i<N;i++)for(let k=0;k<4;k++){let expected=1;for(let n=0;n<=stride;n++){const x=i%w+dirs[k][0]*n,y=(i/w|0)+dirs[k][1]*n;if(x<rect[0]||y<rect[1]||x>=rect[2]||y>=rect[3]||bytes[y*w+x]>band){expected=0;break;}}const actual=(packed[4*i+k]/stride|0)%2;if(actual!==expected)throw Error('Packed path '+[trial,stride,i,k,rect]);if(rect[0])r.subrectComparisons++;else r.comparisons++;} }
 same(read(cost),rgba,'cost mutated');
 }
 const codes=new Uint8Array(N*4);for(let i=0;i<codes.length;i++)codes[i]=i%128;put(a,codes);const rect=[0,0,w,h];
 // Shader stride64 copies bits0..6 without setting another level; outside neighbours likewise retain codes.
 for(const dither of [false,true]){dither?gl.enable(gl.DITHER):gl.disable(gl.DITHER);p.costDomainStep(b,a,rect,.8,128,true);same(read(b),codes,'UNORM code');if(gl.isEnabled(gl.DITHER)!==dither)throw Error('DITHER restoration');r.unormCodes+=128;}
 const P=make(w,h),V=make(w,h),fixed=make(w,h),out=make(w,h),ink=new Uint8Array(N*4),v=new Uint8Array(N*4),c=new Uint8Array(N*4);for(let i=0;i<N;i++){const alpha=64+random()%160;ink[4*i]=alpha>>2;ink[4*i+1]=alpha>>1;ink[4*i+2]=alpha;ink[4*i+3]=alpha;v[4*i+3]=255;c[4*i]=(i%w)*2;}put(P,ink);put(V,v);put(cost,c);fixed.clear();
 const names=['u_a','u_b','u_c','u_k','u_mode','u_tau','u_dir','u_d','u_e','u_origin','u_size','u_band','u_world','u_path','u_pathEnabled'];
 const oldPrograms=[old.WC_FIELD_OP_CARRY_FRAG,old.WC_FIELD_OP_CARRY_COLOUR_FRAG].map(fragment=>{const program=createProgram(gl,old.DISPLAY_VERT,fragment);programs.push(program);return{program,uniforms:getUniforms(gl,program,names),position:gl.getAttribLocation(program,'a_position')}});
 for(const mode of [15,16])for(const stride of [1,2,4,8,16,32,64]){
 const opts={d:cost,e:V,c:P,dir:[stride,stride],origin:[stride,.35],size:[3,100],band:[.8,1],tau:[.45,.7,0]};p.fieldOp(out,P,fixed,mode,.5,opts);const current=read(out),prefix=mode===15?'_fieldOpCarry':'_fieldOpCarryColour',saved=[p[prefix+'Prog'],p[prefix+'Uni'],p[prefix+'PosLoc']],op=oldPrograms[mode-15];
 p[prefix+'Prog']=op.program;p[prefix+'Uni']=op.uniforms;p[prefix+'PosLoc']=op.position;p.fieldOp(out,P,fixed,mode,.5,opts);same(read(out),current,'OLD/OFF carry '+mode+'/'+stride);p[prefix+'Prog']=saved[0];p[prefix+'Uni']=saved[1];p[prefix+'PosLoc']=saved[2];r.carryCases++;
 const packedBytes=read(build(rect,.8,true));put(a,packedBytes); // retain final packed mask in a
 p.fieldOp(out,P,fixed,mode,.5,{...opts,path:a,pathPacked:true});const packedResult=read(out);
 p.costDomainStep(b,cost,rect,.8,0);let src=b,dst=a;for(let d=1;d<stride;d*=2){p.costDomainStep(dst,src,rect,.8,d);const t=src;src=dst;dst=t;}p.fieldOp(out,P,fixed,mode,.5,{...opts,path:src});same(read(out),packedResult,'binary/packed carry');r.packCases++;
 }
 same(read(P),ink,'P mutated');same(read(V),v,'V mutated');same(read(cost),c,'cost mutated');r.immutableInputs=true;
 r.timing=[];for(let n=0;n<8;n++){const start=performance.now(),mask=build(rect,.8,true);gl.bindFramebuffer(gl.FRAMEBUFFER,mask.fbo);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));if(n>=3)r.timing.push(performance.now()-start);}
 gl.bindTexture(gl.TEXTURE_2D,a.texture);r.filter=[gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER),gl.getTexParameter(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER)];r.gl=gl.getError();r.lost=gl.isContextLost();r.renderer=gl.getParameter(gl.RENDERER);r.completed=true;
 }catch(error){r.error=String(error)}finally{if(e){for(const program of programs)e.gl.deleteProgram(program);for(const b of owned.reverse())b.destroy();e.destroy();}canvas.remove();r.engineClosed=true;}return r;
})
