import {retainedComponents} from './retainedComponents'
import {puddleLowDimensions,type PuddleSize} from './PuddleDimensions'
import type {ReadPuddleParameters} from './PuddleParameters'
import {createProgram} from '../../raster/utils'
import {AccumulationBuffer} from '../../buffers/AccumulationBuffer'
/** M69: optical excess independent of water amount; shared component filter for solver and diagnostic. */
export function createContrastPhase(gl:WebGLRenderingContext, readParameters: ReadPuddleParameters, size: PuddleSize = 256){
 const {width:nx,height:ny}=puddleLowDimensions(size)
 const vertex='attribute vec2 pos;varying vec2 uv;void main(){uv=pos*.5+.5;gl_Position=vec4(pos,0.,1.);}'
 const common='precision highp float;varying vec2 uv;uniform sampler2D color,water;uniform float volume;float V(vec2 p){vec4 w=texture2D(water,p);return volume>.5?4.*w.a:w.b;}'
 const bg=createProgram(gl,vertex,common+`uniform vec2 stride;void main(){vec4 c=vec4(0.);float v=0.;for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){vec2 p=uv+vec2(float(x),float(y))*stride;if(min(min(p.x,p.y),min(1.-p.x,1.-p.y))<0.)continue;float weight=(3.-abs(float(x)))*(3.-abs(float(y)));c+=texture2D(color,p)*weight;v+=weight;}vec4 concentration=c/max(v,.004);gl_FragColor=concentration/(1.+concentration);}`)
 const split=createProgram(gl,vertex,common+`uniform sampler2D pigment,background,regionKeep;uniform float optical,massThreshold,compositionThreshold,hueThreshold,hueStrength;void main(){vec4 c=texture2D(color,uv),b=texture2D(background,uv);b=b/max(1.-b,vec4(1./255.));vec3 excess=max(c.rgb-b.rgb,0.);float mass=max(c.a-b.a,0.)/max(c.a,.004);float composition=dot(excess,vec3(1.))/max(dot(c.rgb,vec3(1.)),.004);float q=clamp(max(mass,composition),0.,1.);float gate=max(smoothstep(massThreshold,massThreshold+.115,mass),smoothstep(compositionThreshold,compositionThreshold+.115,composition));q*=gate;float ownSum=dot(c.rgb,vec3(1.)),bgSum=dot(b.rgb,vec3(1.));float hueDistance=.5*dot(abs(c.rgb/max(ownSum,.004)-b.rgb/max(bgSum,.004)),vec3(1.));float colorShare=hueStrength*smoothstep(hueThreshold,hueThreshold+.185,hueDistance)*step(.004,ownSum)*step(.004,bgSum);q=max(q,colorShare);vec3 mobile=max(excess*gate,c.rgb*colorShare);float wet=smoothstep(0.,.03,V(uv));q*=wet;mobile*=wet;if(optical>1.5){gl_FragColor=vec4(q);return;}float retained=texture2D(regionKeep,uv).r;mobile*=retained/max(q,.004);q=retained;gl_FragColor=optical>.5?vec4(max(c.rgb-mobile,0.),c.a*(1.-q)):texture2D(pigment,uv)*(1.-q);}`)
 const background=new AccumulationBuffer(gl,nx,ny,'linear'),selection=new AccumulationBuffer(gl,nx,ny,'nearest'),regionKeep=new AccumulationBuffer(gl,nx,ny,'nearest'),quad=gl.createBuffer()!
 gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)
 function begin(program:WebGLProgram,out:AccumulationBuffer,textures:Record<string,AccumulationBuffer>,volume:boolean){out.beginReplaceDraw();gl.disable(gl.SCISSOR_TEST);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,quad);const a=gl.getAttribLocation(program,'pos');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);Object.entries(textures).forEach(([name,t],i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t.texture);gl.uniform1i(gl.getUniformLocation(program,name),i)});gl.uniform1f(gl.getUniformLocation(program,'volume'),volume?1:0)}
 function end(out:AccumulationBuffer){gl.drawArrays(gl.TRIANGLES,0,6);out.endDraw();gl.activeTexture(gl.TEXTURE0)}
 return{selection:regionKeep,prepare(p:AccumulationBuffer,c:AccumulationBuffer,w:AccumulationBuffer,volume:boolean,referenceP:AccumulationBuffer,referenceC:AccumulationBuffer){begin(bg,background,{color:c,water:w},volume);gl.uniform2f(gl.getUniformLocation(bg,'stride'),24/p.width,24/p.height);end(background);const t=readParameters();
 const run=(optical:number,out:AccumulationBuffer)=>{begin(split,out,{color:c,water:w,pigment:p,background,regionKeep},volume);gl.uniform1f(gl.getUniformLocation(split,'optical'),optical);for(const [key,value]of Object.entries({massThreshold:.035,compositionThreshold:.035,hueThreshold:.035,hueStrength:.55}))gl.uniform1f(gl.getUniformLocation(split,key),t[key as keyof typeof t]??value);end(out)};
 // Q is sampled once on a fixed grid. The same retained components drive both reference buffers.
 run(2,selection);const bytes=selection.readPixels()
 const minCells=Math.ceil((t.minimumRegionArea??128)/((p.width/nx)*(p.height/ny)))
 const keep=retainedComponents(bytes,nx,ny,minCells)
 gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,regionKeep.texture);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,nx,ny,gl.RGBA,gl.UNSIGNED_BYTE,keep);
 run(0,referenceP);run(1,referenceC);
},destroy(){gl.useProgram(null);gl.deleteProgram(bg);gl.deleteProgram(split);gl.deleteBuffer(quad);background.destroy();selection.destroy();regionKeep.destroy()}}
}
