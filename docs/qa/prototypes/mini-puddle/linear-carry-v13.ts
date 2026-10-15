import {DISPLAY_VERT,WC_FIELD_OP_CARRY_FRAG} from '../../../../apps/web/src/engine/src/raster/shaders'
import {createProgram,getUniforms} from '../../../../apps/web/src/engine/src/raster/utils'
import {createUnblockedBrush} from './unblocked-brush-v11'
/** Shared linear transport of every P/C channel, driven only by water and paper. */
export function createLinearCarry(gl:WebGLRenderingContext,passes:any){
 const start=WC_FIELD_OP_CARRY_FRAG.indexOf('      float Ti = trav * m.a / capI;')
 const end=WC_FIELD_OP_CARRY_FRAG.indexOf('      return;',start)
 if(start<0||end<0)throw Error('M13 carry source changed')
 let source=WC_FIELD_OP_CARRY_FRAG.slice(0,start)+`
      if(ci<=u_band.x)for(int k=0;k<4;k++){
        vec2 uvj=v_uv+wcCarryDir(k)*u_dir;
        if(min(min(uvj.x,uvj.y),min(1.-uvj.x,1.-uvj.y))<0.)continue;
        float cj=texture2D(u_d,uvj).r;
        if(cj>u_band.x)continue;
        float capJ=wcCapillary(uvj)*(1.-WC_CARRY_TAIL*smoothstep(0.,u_band.x,cj));
        float path=u_origin.x<=32.?1.:0.;
        for(int j=1;j<32;j++){if(float(j)<u_origin.x){vec2 q=mix(v_uv,uvj,float(j)/u_origin.x);if(texture2D(u_d,q).r>u_band.x)path=0.;}}
        float rate=.22*min(2.*u_k,1.)*trav*path;
        out4+=rate*(texture2D(u_a,uvj)*capI-a*capJ)/max(capI,capJ);
      }
      gl_FragColor=clamp(out4,0.,1.);
`+WC_FIELD_OP_CARRY_FRAG.slice(end)
 const capStart=source.indexOf('  float wcCapillary(vec2 uv) {'),capEnd=source.indexOf('\n  vec2 wcCarryDir',capStart)
 if(capStart<0||capEnd<0)throw Error('M13 capacity source changed')
 source=source.slice(0,capStart)+`  float wcCapillary(vec2 uv){
   vec2 p=uv*1024.;
   float n=.7*wcRimNoise(p*vec2(.025,.06))+.3*wcRimNoise(p*.1+vec2(7.,11.));
   return .35+.65*smoothstep(.44,.56,n);
  }
`+source.slice(capEnd)
 const program=createProgram(gl,DISPLAY_VERT,source)
 const uniformNames=Object.keys(passes._fieldOpCarryUni)
 const uniforms=getUniforms(gl,program,uniformNames),pos=gl.getAttribLocation(program,'a_position')
 const seedProgram=createProgram(gl,DISPLAY_VERT,'precision highp float;varying vec2 v_uv;uniform sampler2D water;void main(){float wet=smoothstep(.003,.012,texture2D(water,v_uv).a);gl_FragColor=vec4(1.-wet,0.,0.,1.);}')
 const quad=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW)
 const seed=(out:any,water:any)=>{out.beginReplaceDraw();gl.disable(gl.SCISSOR_TEST);gl.useProgram(seedProgram);gl.bindBuffer(gl.ARRAY_BUFFER,quad);const p=gl.getAttribLocation(seedProgram,'a_position');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,water.texture);gl.uniform1i(gl.getUniformLocation(seedProgram,'water'),0);gl.drawArrays(gl.TRIANGLES,0,6);out.endDraw()}
 const brush=createUnblockedBrush(gl)
 const stats:{carryCalls:number;frontCalls:number}={carryCalls:0,frontCalls:0}
 return{stats,run<T>(fn:()=>T):T{
  const saved=new Map<string,any>();for(const name of ['_fieldOpCarryProg','_fieldOpCarryUni','_fieldOpCarryPosLoc','_fieldOpCarryColourProg','_fieldOpCarryColourUni','_fieldOpCarryColourPosLoc','fieldOp','brushPass'])saved.set(name,passes[name])
  for(const prefix of ['_fieldOpCarry','_fieldOpCarryColour']){passes[prefix+'Prog']=program;passes[prefix+'Uni']=uniforms;passes[prefix+'PosLoc']=pos}
  const original=saved.get('fieldOp');passes.fieldOp=function(out:any,a:any,b:any,mode:number,k:number,opts:any={}){if(mode===15||mode===16)stats.carryCalls++;if(mode===10){stats.frontCalls++;return seed(out,b)}const r=original.call(this,out,a,b,mode,k,{...opts,additiveZeroFaces:false});return r}
  passes.brushPass=brush.draw
  try{return fn()}finally{for(const[name,value]of saved)passes[name]=value}
 },destroy(){brush.destroy();gl.deleteProgram(program);gl.deleteProgram(seedProgram);gl.deleteBuffer(quad)}}
}
