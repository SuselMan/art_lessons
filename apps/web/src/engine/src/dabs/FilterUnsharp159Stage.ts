import{createProgram}from'../raster/utils'
import{FUNCTIONAL_LAB152_GLSL}from'./functionalLab152GLSL'
import type{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import type{WorldRect}from'../buffers/tileMath'
interface StageSettings159{kind:'gaussian'|'unsharp';amount:number;threshold:number;lightnessOnly:boolean}
const VERT=`attribute vec2 a_position;uniform vec2 u_resolution;uniform vec4 u_rect;void main(){vec2 p=(u_rect.xy+(a_position*.5+.5)*u_rect.zw)/u_resolution*2.-1.;gl_Position=vec4(p.x,-p.y,0.,1.);}`
const FRAG=`precision highp float;uniform sampler2D u_original;uniform sampler2D u_blur;uniform vec2 u_resolution;uniform vec3 u_unsharp;
${FUNCTIONAL_LAB152_GLSL}
float tr(float v){return sign(v)*floor(abs(v));}
vec4 native8(vec4 c){return vec4(floor(clamp(c.a>0.?c.rgb/c.a:vec3(0.),0.,1.)*255.+.5),floor(c.a*255.+.5));}
vec3 labNative(vec4 n){return lab16(vec4(n.rgb/255.*n.a/255.,n.a/255.));}
float difference159(vec4 a,vec4 b,vec3 la,vec3 lb,bool alpha){if(a.a==0.||b.a==0.)return alpha?floor(abs(a.a-b.a)*100./255.+.5):(a.a==b.a?0.:255.);vec3 d=(la-lb)*vec3(100.,255.,255.)/65535.;float da=alpha?(a.a-b.a)*100./255.:0.;return floor(min(255.,sqrt(dot(d,d)+da*da)));}
void main(){vec2 uv=gl_FragCoord.xy/u_resolution;vec4 original=texture2D(u_original,uv),blur=texture2D(u_blur,uv),a=native8(original),b=native8(blur);vec3 la=labNative(a),lb=labNative(b);bool light=u_unsharp.z>.5;float amount=u_unsharp.x,threshold=u_unsharp.y;bool samePixel=all(equal(a,b));float diff=(!light&&threshold==1.)?(samePixel?1.:0.):difference159(a,b,la,lb,light);if(diff<threshold){gl_FragColor=original;return;}
 if(light){float L=floor(clamp((1.+amount)*la.x-amount*lb.x,0.,65535.)),alpha=floor(clamp(((1.+amount)*a.a-amount*b.a)*257.,0.,65535.))/65535.;gl_FragColor=vec4(fromLab16(vec3(L,la.yz))*alpha,alpha);return;}
 float wa=1.+amount,wb=-amount,transparent=(a.a==0.?wa:0.)+(b.a==0.?wb:0.);vec4 sum=(a.a==0.?vec4(0.):a*wa)+(b.a==0.?vec4(0.):b*wb);if(transparent==1.){gl_FragColor=blur;return;}float alphaByte=floor(clamp(sum.a,0.,255.));if(alphaByte==0.){gl_FragColor=vec4(0.);return;}float den=tr(128.*(1.-transparent));vec3 rgb=floor(clamp(transparent==0.?sum.rgb:sum.rgb*128./den,0.,255.));float alpha=alphaByte/255.;gl_FragColor=vec4(rgb/255.*alpha,alpha);
}`
/** Only a preparedprogram; allfour pixelstages and persistentT remain147-owned. */
export class FilterUnsharp159Stage{
 private program?:WebGLProgram
 constructor(privateGl:WebGLRenderingContext,draw:(p:WebGLProgram,t:AccumulationBuffer,r:WorldRect)=>void){this.gl=privateGl;this.draw=draw}
 private readonly gl:WebGLRenderingContext
 private readonly draw:(p:WebGLProgram,t:AccumulationBuffer,r:WorldRect)=>void
 prepare():void{if(this.program)return;const precision=this.gl.getShaderPrecisionFormat(this.gl.FRAGMENT_SHADER,this.gl.HIGH_FLOAT);if(!precision||precision.precision<23||precision.rangeMax<16)throw Error('Unsharp159 requires highp');this.program=createProgram(this.gl,VERT,FRAG)}
 prepared():boolean{return!!this.program}
 forget():void{this.program=undefined}
 destroy():void{if(this.program)this.gl.deleteProgram(this.program);this.forget()}
 paint(original:AccumulationBuffer,blur:AccumulationBuffer,output:AccumulationBuffer,rect:WorldRect,filter:StageSettings159):void{
  if(!this.program||filter.kind!=='unsharp'||!Number.isFinite(filter.amount)||filter.amount<0||filter.amount>5||!Number.isInteger(filter.threshold)||filter.threshold<0||filter.threshold>255)throw Error('Unsharp159 program/scope')
  if(original.width!==blur.width||original.height!==blur.height||output.width!==original.width||output.height!==original.height||new Set([original.texture,blur.texture,output.texture]).size!==3)throw Error('Unsharp159 stage dimensions/alias')
  const gl=this.gl,p=this.program;output.beginReplaceDraw();try{gl.useProgram(p);for(const[unit,buffer,name]of[[0,original,'u_original'],[1,blur,'u_blur']]as const){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,buffer.texture);gl.uniform1i(gl.getUniformLocation(p,name),unit)}gl.uniform3f(gl.getUniformLocation(p,'u_unsharp'),filter.amount,filter.threshold,filter.lightnessOnly?1:0);this.draw(p,output,rect)}finally{output.endDraw()}
 }
}
