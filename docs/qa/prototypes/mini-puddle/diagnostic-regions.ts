import {AccumulationBuffer} from '../../../../apps/web/src/engine/src/buffers/AccumulationBuffer'
import {createProgram} from '../../../../apps/web/src/engine/src/raster/utils'
import {invertMatrix} from '../../../../apps/web/src/engine/src/raster/matrix'
import {createContrastPhase} from './contrast-phase-v55'

/** Read the actual M67 phase split, not an independent contrast detector.
 * Orange: mobile pigment >= 2%; cyan: eligible background mixing >= 5%.
 * The outline samples a 256² diagnostic map; the solver still uses its own full fields. */
export function createDiagnosticRegions(engine:any,size:number){
 const gl:WebGLRenderingContext=engine.gl, n=256
 const phase=createContrastPhase(gl)
 const referenceP=new AccumulationBuffer(gl,size,size,'nearest'),referenceC=new AccumulationBuffer(gl,size,size,'nearest')
 const water=new AccumulationBuffer(gl,size,size,'nearest'),mask=new AccumulationBuffer(gl,n,n)
 const program=createProgram(gl,'attribute vec2 pos;varying vec2 uv;void main(){uv=pos*.5+.5;gl_Position=vec4(pos,0.,1.);}',
 'precision highp float;varying vec2 uv;uniform sampler2D raw,reference,coverage,water;uniform vec2 margin,sourceSize;uniform float strength;void main(){vec2 here=(floor(uv*sourceSize)+.5)/sourceSize;vec4 a=texture2D(raw,here),b=texture2D(reference,here),cov=texture2D(coverage,here);float q=a.a>.004?clamp(1.-b.a/a.a,0.,1.):0.;float peak=0.;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 p=here+vec2(float(x),float(y))*margin;float v=texture2D(raw,p).a,r=texture2D(reference,p).a;if(v>.004)peak=max(peak,clamp(1.-r/v,0.,1.));}float wet=smoothstep(0.,.03,4.*texture2D(water,here).a);float bg=(1.-smoothstep(.03,.12,peak))*cov.a*step(.002,cov.b)*wet*strength;gl_FragColor=vec4(q,bg,0.,1.);}')
 const quad=gl.createBuffer()!
 gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)
 const canvas=document.createElement('canvas');canvas.id='regionOverlay';canvas.setAttribute('aria-hidden','true')
 Object.assign(canvas.style,{position:'fixed',pointerEvents:'none',background:'transparent',boxShadow:'none',zIndex:'5',maxHeight:'none'})
 document.body.append(canvas)
 const ctx=canvas.getContext('2d')!
 let pixels:Uint8Array|null=null,hidden=false,revision=0,selected=0,background=0,lastUpdateMs=0
 let paths:Array<{path:Path2D;color:string}>=[]
 function draw(){
  const source=gl.canvas as HTMLCanvasElement,r=source.getBoundingClientRect()
  Object.assign(canvas.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'})
  if(canvas.width!==source.width||canvas.height!==source.height){canvas.width=source.width;canvas.height=source.height}
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height)
  if(hidden||!pixels)return
  const m=invertMatrix(engine._camera.screenToWorldMatrix())
  ctx.setTransform(m[0],m[1],m[3],m[4],m[6],m[7])
  ctx.lineWidth=1.15*(canvas.width/Math.max(1,r.width))/Math.max(.0001,Math.hypot(m[0],m[1]))
  for(const item of paths){ctx.strokeStyle=item.color;ctx.stroke(item.path)}
 }
 function rebuildPaths(){
  paths=[];if(!pixels)return
  const edge=(a:number[],b:number[],level:number)=>{
   const t=(level-a[2])/(b[2]-a[2]);return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]
  }
  for(const[channel,level,color]of [[1,.05,'#28cbdc'],[0,.02,'#ff843b']] as const){
   const path=new Path2D()
   for(let y=0;y<n-1;y++)for(let x=0;x<n-1;x++){
    const i=(y*n+x)*4+channel
    const a=pixels[i]/255,b=pixels[i+4]/255,c=pixels[i+(n+1)*4]/255,d=pixels[i+n*4]/255
    if((a<level&&b<level&&c<level&&d<level)||(a>=level&&b>=level&&c>=level&&d>=level))continue
    const points=[[x+.5,n-y-.5,a],[x+1.5,n-y-.5,b],[x+1.5,n-y-1.5,c],[x+.5,n-y-1.5,d]]
    for(const ids of [[0,1,2],[0,2,3]]){
     const cuts:number[][]=[]
     for(let k=0;k<3;k++){const a=points[ids[k]],b=points[ids[(k+1)%3]];if((a[2]>=level)!==(b[2]>=level))cuts.push(edge(a,b,level))}
     if(cuts.length===2){path.moveTo(cuts[0][0]*size/n,cuts[0][1]*size/n);path.lineTo(cuts[1][0]*size/n,cuts[1][1]*size/n)}
    }
   }
   paths.push({path,color})
  }
 }
 return{
  update(entry:any){
   const started=performance.now();water.clear()
   const own=entry.solventLoad,foreign=entry.foreignSolventLoad
   if(own&&foreign)engine._watercolorPasses.fieldOp(water,own,foreign,1,1)
   else if(own||foreign)(own??foreign).copyTo(water)
   phase.prepare(entry.inkLoad,entry.inkColor,water,true,referenceP,referenceC)
   mask.beginReplaceDraw();gl.disable(gl.SCISSOR_TEST);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,quad)
   const pos=gl.getAttribLocation(program,'pos');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0)
   for(const[unit,name,b]of [[0,'raw',entry.inkLoad],[1,'reference',referenceP],[2,'coverage',entry.coverage],[3,'water',water]]as const){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,b.texture);gl.uniform1i(gl.getUniformLocation(program,name),unit)}
   gl.uniform2f(gl.getUniformLocation(program,'sourceSize'),size,size);gl.uniform2f(gl.getUniformLocation(program,'margin'),12/size,12/size)
   gl.uniform1f(gl.getUniformLocation(program,'strength'),(globalThis as any).__miniTuning?.backgroundStrength??.8)
   gl.drawArrays(gl.TRIANGLES,0,6);mask.endDraw();gl.activeTexture(gl.TEXTURE0)
   pixels=mask.readPixels();revision++;selected=background=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i]>=6)selected++;if(pixels[i+1]>=13)background++}rebuildPaths();draw();lastUpdateMs=performance.now()-started
  },
  draw,show(value:boolean){hidden=!value;draw()},
  get state(){return{revision,selected,background,resolution:n,lastUpdateMs}},
  readback:()=>pixels?.slice()??new Uint8Array(),
  destroy(){canvas.remove();phase.destroy();for(const b of [referenceP,referenceC,water,mask])b.destroy();gl.useProgram(null);gl.deleteProgram(program);gl.deleteBuffer(quad)}
 }
}
