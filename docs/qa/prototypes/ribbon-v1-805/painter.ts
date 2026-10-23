import {FootprintStream805,type FootprintPoint805} from './footprint'
import {ribbonProfileFor} from '../../../../apps/web/src/engine/src/dabs/ribbonProfile'
import {RIBBON_FLOATS_PER_VERTEX} from '../../../../apps/web/src/engine/src/dabs/markerRibbon'
import {pigmentAbsorption} from '../../../../apps/web/src/engine/src/watercolor/pigmentOptics'
import {WC_FILM_DOSE} from '../../../../apps/web/src/engine/src/presets/watercolorPresets'
import {createProgram,createFullscreenQuad,getUniforms} from '../../../../apps/web/src/engine/src/raster/utils'
import {bristleProfile805} from './profile'

const VERT=`attribute vec2 pos,local;attribute float ink,water,pressure,aa;uniform vec2 resolution,origin;varying vec2 q;varying float m,w,p,a;void main(){vec2 v=pos-origin;gl_Position=vec4(v.x/resolution.x*2.-1.,1.-v.y/resolution.y*2.,0.,1.);q=local;m=ink;w=water;p=pressure;a=aa;}`
const FRAG=`precision highp float;varying vec2 q;varying float m,w,p,a;uniform sampler2D hairs;uniform float mode,mean,lifted;uniform vec3 tau;
float strand(float x){float f=clamp(x,0.,1.)*255.,i=floor(f);return mix(texture2D(hairs,vec2((i+.5)/256.,.5)).r,texture2D(hairs,vec2((min(i+1.,255.)+.5)/256.,.5)).r,fract(f))*255./128./mean;}
void main(){float d=length(q),cov=1.-smoothstep(1.-max(a,.002),1.,d);if(cov<.001)discard;
float hair=strand(q.x*.5+.5);float release=lifted*(1.-smoothstep(.012,.060,p));
float threshold=mix(.39,.62,release),tipHair=clamp(hair*.45,0.,1.);
float contact=mix(1.,smoothstep(threshold-.02,threshold+.02,tipHair),release)*mix(1.,smoothstep(0.,.012,p),lifted);
float dose=m*(.55+.45*hair)*cov*contact;
if(mode<.5)gl_FragColor=vec4(vec3(0.),.25*clamp(w,0.,1.)*cov*contact);
else if(mode<1.5)gl_FragColor=vec4(.5*cov*contact,0.,0.,cov*contact);
else gl_FragColor=vec4(vec3(dose),dose);}`
const FULLVERT='attribute vec2 pos;varying vec2 uv;void main(){uv=pos*.5+.5;gl_Position=vec4(pos,0.,1.);}'
const COMBINE=`precision highp float;varying vec2 uv;uniform sampler2D base,film,wetMap;uniform float mode;uniform vec3 tau;void main(){float mass=texture2D(film,uv).a;vec4 c=texture2D(base,uv)+vec4(mass*tau/4.,mass);if(mode<.5)gl_FragColor=c;else gl_FragColor=vec4(c.a*clamp(texture2D(wetMap,uv).a*4.,0.,1.),0.,c.a,c.a);}`
const DISPLAY=`precision highp float;varying vec2 uv;uniform sampler2D original,color;void main(){vec4 b=texture2D(original,uv),c=texture2D(color,uv);float a=1.-exp(-c.a*2.2);vec3 rgb=exp(-c.rgb*4./max(c.a,1./255.));gl_FragColor=vec4(rgb*a,a)+b*(1.-a);}`
export function installRibbonV1(engine:any){
 const gl:WebGLRenderingContext=engine.gl,ext=gl.getExtension('EXT_blend_minmax');if(!ext)throw Error('New ribbon requires EXT_blend_minmax')
 const raster=createProgram(gl,VERT,FRAG),combine=createProgram(gl,FULLVERT,COMBINE),display=createProgram(gl,FULLVERT,DISPLAY),quad=createFullscreenQuad(gl),vbo=gl.createBuffer()!,hair=gl.createTexture()!
 const attrs=Object.fromEntries(['pos','local','ink','water','pressure','aa'].map(k=>[k,gl.getAttribLocation(raster,k)])),u=getUniforms(gl,raster,['resolution','origin','hairs','mode','mean','lifted','tau']),cu=getUniforms(gl,combine,['base','film','mode','wetMap','tau']),du=getUniforms(gl,display,['original','color'])
 const saved=new Map<string,any>(),wetSaved=new Map<string,any>();let alive=true,gesture=-1,activeScratch:any=null,along=0,mean=1,lifted=false,liftSize=0,points:FootprintPoint805[]=[],stream=new FootprintStream805()
 const stats={model:'ribbon-v1',revision:'fixed-footprint-v4',released:false,overlap:'incremental-wet-over',pastGeometryRebuilt:false,orientation:'fixed-per-gesture',batches:0,vertices:0,draws:0,geometryMs:0,deliveryMs:0,cpuWetReads:0,canonicalWaterMaps:1,seed:0}
 function replace(name:string,fn:any){saved.set(name,engine[name]);engine[name]=fn}
 // No CPU water state. These compatibility answers only retain the live layer source.
 for(const name of ['sampleUnderNib','sample','peak','anyWet','anyWetNear','deposit','drain','commitPending','dropPending','prune']){wetSaved.set(name,engine._paperWet[name]);engine._paperWet[name]=name==='anyWet'||name==='anyWetNear'?()=>!!engine._wash:()=>0}
 const oldEnd=engine._onEnd
 replace('_onEnd',function(...args:any[]){lifted=true;stats.released=true;liftSize=points.at(-1)?.dab.size??0;return oldEnd.apply(this,args)})
 const oldPaint=engine._paintRibbonDabs
 function full(program:WebGLProgram){gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,quad);const p=gl.getAttribLocation(program,'pos');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0)}
 function texture(unit:number,buffer:any,location:WebGLUniformLocation){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,buffer.texture??buffer);gl.uniform1i(location,unit)}
 function rect(tile:any,b:any){return[Math.max(0,Math.floor(b.minX-tile.originX)),Math.max(0,Math.floor(tile.buffer.height-(b.maxY-tile.originY))),Math.min(tile.buffer.width,Math.ceil(b.maxX-tile.originX))-Math.max(0,Math.floor(b.minX-tile.originX)),Math.min(tile.buffer.height,Math.ceil(tile.buffer.height-(b.minY-tile.originY)))-Math.max(0,Math.floor(tile.buffer.height-(b.maxY-tile.originY)))]}
 replace('_paintRibbonDabs',function(target:any,dabs:any[],tool:string,presetName:string,color:number[],scratch:any,prev:any,...rest:any[]){
  if(tool!=='watercolor'||!scratch)return oldPaint.call(this,target,dabs,tool,presetName,color,scratch,prev,...rest)
  if(!dabs.length)return new Map()
  const preset=this._resolvePreset(tool,presetName),profile={...ribbonProfileFor(tool as any,presetName),cloud:0,granulation:0,bristleInk:0}
  if(scratch!==activeScratch||scratch.gesture!==gesture){activeScratch=scratch;gesture=scratch.gesture;along=0;lifted=false;stats.released=false;liftSize=0;points=[];stream=new FootprintStream805();const id=String(this._strokeId??'ribbon-v1');let seed=2166136261;for(const c of id)seed=Math.imul(seed^c.charCodeAt(0),16777619);const p=bristleProfile805(seed);mean=p.mean;stats.seed=seed>>>0;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,hair);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,256,1,0,gl.LUMINANCE,gl.UNSIGNED_BYTE,p.bytes)}
  const t=performance.now(),painter=this._ribbonPainter,oldPolicy=painter.diagnosticWaterPolicy;painter.diagnosticWaterPolicy='bottomless';let delivery:any;try{delivery=painter.prepareDelivery(dabs,prev,preset,profile,scratch,()=>0,0,'combined',true,true)}finally{painter.diagnosticWaterPolicy=oldPolicy}stats.deliveryMs+=performance.now()-t
  const lengths=new Map<any,number>();let last=prev;for(const d of dabs){if(last)along+=Math.hypot(d.x-last.x,d.y-last.y)/Math.max(d.size*.5*preset.sizeMultiplier,1);lengths.set(d,along);last=d}
  const dose=(d:any)=>1.65*(profile.depositPerRadius*.5)*WC_FILM_DOSE*(delivery.pigmentByDab.get(d)??1)*(delivery.excessByDab.get(d)??1)*profile.pigmentStrength
  const geometryAt=performance.now(),batch:FootprintPoint805[]=dabs.map(d=>({dab:{...d,size:lifted?Math.max(d.size,liftSize*.82):d.size},dose:dose(d),water:profile.waterLevel,along:lengths.get(d)??along}));points=batch;const bands=stream.append(batch,preset.sizeMultiplier);stats.geometryMs+=performance.now()-geometryAt;stats.vertices+=bands.length/RIBBON_FLOATS_PER_VERTEX;stats.batches++
  if(!bands.length)return scratch.standing
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(let i=0;i<bands.length;i+=11){minX=Math.min(minX,bands[i]-2);minY=Math.min(minY,bands[i+1]-2);maxX=Math.max(maxX,bands[i]+2);maxY=Math.max(maxY,bands[i+1]+2)}const bounds={minX,minY,maxX,maxY},tau=pigmentAbsorption(color as [number,number,number])
  scratch.paints.add(color.join(','));scratch.foreignSources=[];scratch.noteFinish({target,preset,profile,color,opacity:dabs[0].opacity,fieldSeed:[stats.seed%997/997,0],bounds,landedWet:0,wetPeak:0,radiusPx:Math.max(...dabs.map(d=>d.size*.5*preset.sizeMultiplier)),dwellMs:scratch.dwellMs});scratch.compositeScalars(()=>({spreadPx:0,inkSmoothPx:0,water:0,migratePx:0,fieldSeed:[0,0],bristleRadiusPx:0}))
  gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,bands,gl.DYNAMIC_DRAW)
  for(const tile of this._resolveWithinSheet(target,bounds)){
   const e=scratch.getOrCreate(tile.buffer);if(!e.solventLoad){e.solventLoad=this._ribbonScratchPool.acquire(tile.buffer.width,tile.buffer.height);e.solventLoad.clear()}
   if(e.filmGesture!==scratch.materialGesture){e.strokeColor??=this._ribbonScratchPool.acquire(tile.buffer.width,tile.buffer.height);e.colorBase??=this._ribbonScratchPool.acquire(tile.buffer.width,tile.buffer.height);e.strokeColor.clear();e.inkColor.copyTo(e.colorBase);
    e.filmGesture=scratch.materialGesture}
   const r=rect(tile,bounds);if(r[2]<=0||r[3]<=0)continue;
   for(const [buffer,mode]of [[e.solventLoad,0],[e.coverage,1],[e.strokeColor,2]] as const){if(mode===2){buffer.beginDraw();gl.blendEquation(gl.FUNC_ADD)}else buffer.beginMaxDraw(ext);gl.useProgram(raster);gl.bindBuffer(gl.ARRAY_BUFFER,vbo);for(const[name,offset]of Object.entries({pos:0,local:2,ink:4,water:5,pressure:6,aa:7})){const loc=attrs[name];if(loc<0)continue;gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,name==='pos'||name==='local'?2:1,gl.FLOAT,false,44,offset*4)}gl.uniform2f(u.resolution,tile.buffer.width,tile.buffer.height);gl.uniform2f(u.origin,tile.originX,tile.originY);texture(0,hair,u.hairs);gl.uniform1f(u.mode,mode);gl.uniform1f(u.mean,mean);gl.uniform1f(u.lifted,lifted?1:0);gl.uniform3f(u.tau,...tau);gl.drawArrays(gl.TRIANGLES,0,bands.length/11);buffer.endDraw();stats.draws++}
   for(const [buffer,mode]of [[e.inkColor,0],[e.inkLoad,1]] as const){buffer.beginReplaceDraw();gl.enable(gl.SCISSOR_TEST);gl.scissor(r[0],r[1],r[2],r[3]);full(combine);texture(0,e.colorBase,cu.base);texture(1,e.strokeColor,cu.film);texture(2,e.solventLoad,cu.wetMap);gl.uniform1f(cu.mode,mode);gl.uniform3f(cu.tau,...tau);gl.drawArrays(gl.TRIANGLES,0,6);buffer.endDraw();gl.disable(gl.SCISSOR_TEST);stats.draws++}
   scratch.pendingComposite.set(tile.buffer,{tile,bounds});this._liveComposite={scratch,preset,profile,color,opacity:dabs[0].opacity,fieldSeed:[0,0],spreadPx:0,fringeWater:0,migratePx:0,inkSmoothPx:0,strokeDir:[1,0],bristleRadiusPx:0};target.markContentPainted(bounds)
  }
  gl.activeTexture(gl.TEXTURE0);return scratch.standing
 })
 replace('_drawRibbonCompositeRect',function(tile:any,bounds:any,_preset:any,_profile:any,original:any,_coverage:any,_p:any,c:any){if(!c)return;tile.buffer.beginReplaceDraw();const r=rect(tile,bounds);gl.enable(gl.SCISSOR_TEST);gl.scissor(r[0],r[1],Math.max(0,r[2]),Math.max(0,r[3]));full(display);texture(0,original,du.original);texture(1,c,du.color);gl.drawArrays(gl.TRIANGLES,0,6);tile.buffer.endDraw();gl.disable(gl.SCISSOR_TEST);gl.activeTexture(gl.TEXTURE0)})
 engine._qaRibbonV1=stats
 return{stats,proof(){const source=engine._ribbonStrokeScratch??engine._wash?.scratch;const entries=source?[...source.tileEntries()]:[];const fields:Record<string,any>={};for(const[,e]of entries)for(const name of ['inkLoad','inkColor','coverage','solventLoad']){const b=e[name];if(!b)continue;const bytes=b.readPixels();let nonzero=0,maximum=0,total=0;for(let i=3;i<bytes.length;i+=4){const v=bytes[i];if(v)nonzero++;maximum=Math.max(maximum,v);total+=v}fields[name]={nonzero,maximum,total,width:b.width,height:b.height}}return{model:'ribbon-v1',fields,glError:gl.getError(),stats:{...stats},cpuWetCells:engine._paperWet._layers?.size??0}},destroy(){if(!alive)return;alive=false;for(const[k,v]of saved)engine[k]=v;for(const[k,v]of wetSaved)engine._paperWet[k]=v;for(const p of [raster,combine,display])gl.deleteProgram(p);gl.deleteBuffer(quad);gl.deleteBuffer(vbo);gl.deleteTexture(hair);delete engine._qaRibbonV1}}
}
