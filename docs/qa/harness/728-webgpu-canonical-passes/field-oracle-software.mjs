/** Component oracle only: software GL versus software native WebGPU, no timing claims. */
import {build} from 'esbuild';import {chromium} from 'playwright';import fs from 'node:fs';import http from 'node:http';
const dir='temp/canonical-passes';fs.mkdirSync(dir,{recursive:true});
await build({entryPoints:['apps/web/src/engine/src/webgpuCanonical/passes/fieldOps.ts','apps/web/src/engine/src/raster/shaders.ts','apps/web/src/engine/src/watercolor/gradientFibres.ts'],outdir:dir,entryNames:'[name]',bundle:true,format:'esm',platform:'browser'});
const {withGradientFibres}=await import('../../../../temp/canonical-passes/gradientFibres.js');
const legacy=await import('../../../../temp/canonical-passes/shaders.js');
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1);if(name==='fieldOps.js'){res.setHeader('Content-Type','application/javascript');res.end(fs.readFileSync(dir+'/fieldOps.js'));}else res.end('<html/>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan','--disable-vulkan-surface']});
try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 const report=await page.evaluate(async sources=>{
  const {CanonicalFieldOps}=await import('/fieldOps.js');const adapter=await navigator.gpu.requestAdapter();const device=await adapter.requestDevice();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=16;const gl=canvas.getContext('webgl',{preserveDrawingBuffer:true});gl.disable(gl.DITHER);gl.disable(gl.BLEND);const W=16,H=16;
  const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const makeProgram=source=>{const p=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,sources.vert));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,source));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;};
  const programs=[makeProgram(sources.low),makeProgram(sources.high),makeProgram(sources.carry),makeProgram(sources.colour),makeProgram(sources.gradient),makeProgram(sources.additive),makeProgram(sources.additiveColour)];
  const payloads=Array.from({length:7},(_,j)=>{const out=new Uint8Array(W*H*4);for(let i=0;i<out.length;i++)out[i]=(i*17+j*31+(i>>4)*3)%190+20;return out;});
  const gltextures=payloads.map(data=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,W,H,0,gl.RGBA,gl.UNSIGNED_BYTE,data);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;});
  const makeField=(bytes,w=W,h=H,raw=false)=>{const texture=device.createTexture({size:[w,h],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST});if(bytes){const flipped=new Uint8Array(bytes.length);for(let y=0;y<h;y++)flipped.set(bytes.subarray(y*w*4,(y+1)*w*4),(h-1-y)*w*4);device.queue.writeTexture({texture},raw?bytes:flipped,{bytesPerRow:w*4},{width:w,height:h});}return{texture,view:texture.createView(),width:w,height:h,format:'rgba8unorm',label:'oracle'};};
  const fields=payloads.map(x=>makeField(x));const out=makeField();const ops=new CanonicalFieldOps(device);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const noiseBytes=new Uint8Array(251*251*4);for(let i=0;i<251*251;i++)noiseBytes.set([(i*73+Math.floor(i/251)*29)%256,0,0,255],i*4);const noise=makeField(noiseBytes,251,251,true);const noiseGl=gl.createTexture();gl.activeTexture(gl.TEXTURE0+6);gl.bindTexture(gl.TEXTURE_2D,noiseGl);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,251,251,0,gl.RGBA,gl.UNSIGNED_BYTE,noiseBytes);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const rows=[];
  const cases=[...Array.from({length:21},(_,mode)=>({mode,label:String(mode)})),{mode:1,label:'1gradient',gradient:true,originX:0},{mode:1,label:'1plain',worldZ:0},{mode:18,label:'18physical',originY:1},{mode:15,label:'15packed',path:true},{mode:16,label:'16packed',path:true,k:.8},{mode:15,label:'15additive',additive:true},{mode:16,label:'16additive',additive:true}];
  for(const test of cases){
   const mode=test.mode;const origin=[test.originX??1,test.originY??.35],world=[13,-29,test.worldZ??1];
   // Exercise smooth across-brush comb and a nonuniform mobile-colour plateau.
   if(mode===1||mode===15||mode===16||test.originY===1){
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
     const i=(y*W+x)*4;
     if(test.originY===1){payloads[2].set([30,40,50,80],i);payloads[3].set([0,128,0,128],i);payloads[4].set([15,20,25,128],i);}
     else if(mode===1){payloads[2].set([120+x,200,100,255],i);if(test.gradient)payloads[3].set([0,128,0,0],i);}
     else{payloads[2].set([80,100,120,240-x*12],i);payloads[3].set([test.path?x*8:0,128,0,128],i);payloads[4].set([0,0,0,255],i);}
    }
    if(test.path)payloads[5].fill(15);
    for(const n of test.path?[2,3,4,5]:mode===1?(test.gradient?[2,3]:[2]):[2,3,4]){
     gl.activeTexture(gl.TEXTURE0+n);gl.bindTexture(gl.TEXTURE_2D,gltextures[n]);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,payloads[n]);
     const flipped=new Uint8Array(payloads[n].length);for(let y=0;y<H;y++)flipped.set(payloads[n].subarray(y*W*4,(y+1)*W*4),(H-1-y)*W*4);device.queue.writeTexture({texture:fields[n].texture},flipped,{bytesPerRow:W*4},{width:W,height:H});
    }
   }

   const program=programs[test.gradient?4:test.additive?(mode===15?5:6):mode===15?2:mode===16?3:mode>=10?1:0];gl.useProgram(program);const pos=gl.getAttribLocation(program,'a_position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
   for(let n=0;n<6;n++){gl.activeTexture(gl.TEXTURE0+n);gl.bindTexture(gl.TEXTURE_2D,gltextures[n]);gl.uniform1i(gl.getUniformLocation(program,['u_a','u_b','u_c','u_d','u_e','u_path'][n]),n);}
   for(const [name,value]of Object.entries({u_k:test.k??.2,u_mode:mode,u_pathEnabled:test.path?2:0}))gl.uniform1f(gl.getUniformLocation(program,name),value);
   for(const [name,value]of Object.entries({u_dir:[1/W,1/H],u_origin:origin,u_size:[1.3,20],u_band:[.6,.2]}))gl.uniform2fv(gl.getUniformLocation(program,name),value);
   gl.uniform3fv(gl.getUniformLocation(program,'u_tau'),[.025,.1,1]);gl.uniform3fv(gl.getUniformLocation(program,'u_world'),world);gl.activeTexture(gl.TEXTURE0+6);gl.bindTexture(gl.TEXTURE_2D,noiseGl);gl.uniform1i(gl.getUniformLocation(program,'u_wcFibreNoiseTex'),6);gl.drawArrays(gl.TRIANGLES,0,6);const expected=new Uint8Array(W*H*4);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,expected);
   device.pushErrorScope('validation');const encoder=device.createCommandEncoder();const uniform=ops.run({device,encoder}, {a:fields[0],b:fields[1],c:fields[2],coverage:fields[1],paper:{field:fields[2],origin:[0,0],texSize:[256,256],scale:1},out,world:{x:0,y:0,width:16,height:16}},mode,test.k??.2,{d:fields[3],e:fields[4],dir:[1,1],origin,size:[1.3,20],band:[.6,.2],tau:[.025,.1,1],world,gradientFibres:!!test.gradient,noise,path:test.path?fields[5]:undefined,pathPacked:!!test.path,additiveZeroFaces:!!test.additive});
   const read=device.createBuffer({size:256*H,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});encoder.copyTextureToBuffer({texture:out.texture},{buffer:read,bytesPerRow:256},{width:W,height:H});device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);const raw=new Uint8Array(read.getMappedRange());let different=0,max=0;for(let y=0;y<H;y++)for(let x=0;x<W*4;x++){const diff=Math.abs(raw[y*256+x]-expected[(H-1-y)*W*4+x]);if(diff)different++;max=Math.max(max,diff);}read.unmap();read.destroy();uniform.destroy();const validation=await device.popErrorScope();rows.push({mode,label:test.label,different,maxByteDifference:max,nonzero:expected.reduce((n,v)=>n+(v!==0),0),changedFromInput:expected.reduce((n,v,i)=>n+(v!==payloads[0][i]),0),validation:validation?.message??null,glError:gl.getError()});
  }
  device.destroy();return{softwareOnly:true,dither:false,pass:rows.every(r=>r.different===0&&r.validation===null&&r.glError===0&&r.nonzero>0&&r.changedFromInput>0),rows};
 },{vert:legacy.DISPLAY_VERT,low:legacy.WC_FIELD_OP_FRAG,high:legacy.WC_FIELD_OP_HIGH_FRAG,carry:legacy.WC_FIELD_OP_CARRY_FRAG,colour:legacy.WC_FIELD_OP_CARRY_COLOUR_FRAG,gradient:withGradientFibres(legacy.WC_FIELD_OP_FRAG),additive:legacy.WC_FIELD_OP_ADDITIVE_ZERO_FACE_CARRY_FRAG,additiveColour:legacy.WC_FIELD_OP_ADDITIVE_ZERO_FACE_CARRY_COLOUR_FRAG});fs.writeFileSync(dir+'/field-oracle.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.pass)process.exitCode=1;
}finally{await browser.close();server.close();}
