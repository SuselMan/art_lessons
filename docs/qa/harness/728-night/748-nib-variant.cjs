// QA-only program source variant. Baseline is untouched unless explicitly selected.
// 'pixel-uv' is deliberately restricted to the original zero-angle test input.
module.exports=function installNibVariant(mode){
 if(!['baseline','uniform-scalars','pixel-uv'].includes(mode))throw Error('Unknown nib variant');
 window.__qaNibVariant={mode,patched:0};if(mode==='baseline')return;
 const patch=prototype=>{if(!prototype)return;const source=prototype.shaderSource;prototype.shaderSource=function(shader,text){
  const nib=/const float u_inkMode = [67]\.0;/.test(text);
  if(nib){
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
 }};
 patch(WebGLRenderingContext.prototype);if(typeof WebGL2RenderingContext!=='undefined')patch(WebGL2RenderingContext.prototype);
};
