// QA-only program source variant. Baseline is untouched unless explicitly selected.
// 'pixel-uv' is deliberately restricted to the original zero-angle test input.
module.exports=function installNibVariant(mode){
 if(!['baseline','uniform-scalars','pixel-uv','highp-samplers','bg-pixel-uv'].includes(mode))throw Error('Unknown nib variant');
 window.__qaNibVariant={mode,patched:0};if(mode==='baseline')return;
 const bgOriginal="precision highp float;varying vec2 uv;uniform sampler2D color,water;uniform float volume;float V(vec2 p){vec4 w=texture2D(water,p);return volume>.5?4.*w.a:w.b;}uniform vec2 stride;void main(){vec4 c=vec4(0.);float v=0.;for(int y=-2;y<=2;y++)for(int x=-2;x<=2;x++){vec2 p=uv+vec2(float(x),float(y))*stride;if(min(min(p.x,p.y),min(1.-p.x,1.-p.y))<0.)continue;float weight=(3.-abs(float(x)))*(3.-abs(float(y)));c+=texture2D(color,p)*weight;v+=weight;}vec4 concentration=c/max(v,.004);gl_FragColor=concentration/(1.+concentration);}"; // SHA2569681c26f542b28f0df04d7927fbfa890f733cbb2b848550c80ea78dea17fd403
 const patch=prototype=>{if(!prototype)return;const source=prototype.shaderSource;prototype.shaderSource=function(shader,text){
  if(mode==='bg-pixel-uv'&&text===bgOriginal){text=text.replace('varying vec2 uv;','vec2 uv;uniform vec2 qaViewport;').replace('void main(){','void main(){uv=gl_FragCoord.xy/qaViewport;');window.__qaNibVariant.patched++;}
  if(mode==='highp-samplers'&&text.includes('sampler2D')){
   let inserted=false;text=text.replace(/precision\s+(?:lowp|mediump|highp)\s+float\s*;/,statement=>{inserted=true;return statement+'\nprecision highp sampler2D;'});
   if(!inserted)text='precision highp sampler2D;\n'+text;
   window.__qaNibVariant.patched++;
  }
  const nib=/const float u_inkMode = [67]\.0;/.test(text);
  if(nib&&(mode==='uniform-scalars'||mode==='pixel-uv')){
   for(const [varying,uniform]of [['v_radius','u_dabRadius'],['v_aspectRatio','u_aspectRatio'],['v_pressure','u_pressure'],['v_opacity','u_opacity'],['v_tiltX','u_tiltX'],['v_tiltY','u_tiltY']]){
    text=text.replace('varying float '+varying+';','uniform float '+uniform+';').replaceAll(varying,uniform);
   }
   if(mode==='pixel-uv'){
    text=text.replace('varying vec2 v_localUV;','vec2 qaLocalUV; uniform vec2 u_dabCenter;').replaceAll('v_localUV','qaLocalUV');
    text=text.replace('void main() {','void main() {\nqaLocalUV = vec2((gl_FragCoord.x-u_dabCenter.x)/(u_dabRadius*max(u_aspectRatio,1.0)),(u_resolution.y-gl_FragCoord.y-u_dabCenter.y)/u_dabRadius);');
   }
   window.__qaNibVariant.patched++;
  }
  return Reflect.apply(source,this,[shader,text]);
 };if(mode==='bg-pixel-uv'){const draw=prototype.drawArrays;prototype.drawArrays=function(...args){const program=this.getParameter(this.CURRENT_PROGRAM);if(program){const location=this.getUniformLocation(program,'qaViewport');if(location!==null){const viewport=this.getParameter(this.VIEWPORT);this.uniform2f(location,viewport[2],viewport[3]);}}return Reflect.apply(draw,this,args)}}};
 patch(WebGLRenderingContext.prototype);if(typeof WebGL2RenderingContext!=='undefined')patch(WebGL2RenderingContext.prototype);
};
