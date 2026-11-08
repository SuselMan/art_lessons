/** Private opt-in Color Smudge programs. Historical compiler inputs unchanged. */
export function colorSmudgeCompositeCode(value:unknown):0|1|2|3|4|5|6|7 {
  switch(value){case'grainMerge':return 1;case'grainExtract':return 2;case'negation':return 3;case'multiply':return 4;case'screen':return 5;case'erase':return 6;case'overlay':return 7;default:return 0}
}
function replace(source:string,before:string,after:string):string {
  if(source.split(before).length!==2)throw new Error('Color Smudge strategy shader anchor changed')
  return source.replace(before,after)
}
const COMPOSITE_GLSL=`
 uniform float u_colorSmudgeComposite;
 vec3 colorSmudgeChannel(vec3 destination,vec3 source) {
   vec3 d=floor(clamp(destination,0.0,1.0)*255.0+0.5),s=floor(clamp(source,0.0,1.0)*255.0+0.5);
   if(u_colorSmudgeComposite<1.5)return clamp(d+s-127.0,0.0,255.0)/255.0;
   if(u_colorSmudgeComposite<2.5)return clamp(d-s+127.0,0.0,255.0)/255.0;
   if(u_colorSmudgeComposite<3.5)return (255.0-abs(255.0-s-d))/255.0;
   if(u_colorSmudgeComposite<4.5)return destination*source;
   return destination+source-destination*source;
 }
`
export function colorSmudgeForegroundFragment(source:string):string {
  source=replace(source,' vec4 colorSmudgePaint(vec4 destination,vec4 pigment) {',COMPOSITE_GLSL+' vec4 colorSmudgePaint(vec4 destination,vec4 pigment) {\n   if(u_colorSmudgeComposite>5.5)return destination*(1.0-pigment.a);')
  // Both ordinary OVER shortcut and fused dulling must yield to the new op.
  source=source.replaceAll('u_colorSmudgePhotoshop<0.5','u_colorSmudgeComposite<0.5 && u_colorSmudgePhotoshop<0.5')
  return replace(source,'vec3 blended=u_colorSmudgePhotoshop>0.5','vec3 blended=u_colorSmudgeComposite>0.5 ? colorSmudgeChannel(dst,src) : u_colorSmudgePhotoshop>0.5')
}
export function colorSmudgeLegacyFragment(source:string,overlay154=false):string {
  if(overlay154){
    const extended=COMPOSITE_GLSL.replace('   vec3 d=floor','   if(u_colorSmudgeComposite>6.5)return mix(2.0*destination*source,vec3(1.0)-2.0*(vec3(1.0)-destination)*(vec3(1.0)-source),step(vec3(0.5),destination));\n   vec3 d=floor')
    source=replace(source,' void main() {',extended+' void main() {')
    return replace(source,'source=vec4(u_previousCanvasForeground.rgb*b,b)+source*(1.0-b);',`if(u_colorSmudgeComposite>5.5&&u_colorSmudgeComposite<6.5){source*=1.0-b;}else{vec3 destination=source.rgb/max(source.a,0.000001);
        vec3 blended=colorSmudgeChannel(destination,u_previousCanvasForeground.rgb);
        source=vec4(source.rgb*(1.0-b)+u_previousCanvasForeground.rgb*b*(1.0-source.a)+blended*source.a*b,b+source.a*(1.0-b));}`)
  }
  source=replace(source,' void main() {',COMPOSITE_GLSL+' void main() {')
  return replace(source,'source=vec4(u_previousCanvasForeground.rgb*b,b)+source*(1.0-b);',`if(u_colorSmudgeComposite>5.5){source*=1.0-b;}else{vec3 destination=source.rgb/max(source.a,0.000001);
        vec3 blended=colorSmudgeChannel(destination,u_previousCanvasForeground.rgb);
        source=vec4(source.rgb*(1.0-b)+u_previousCanvasForeground.rgb*b*(1.0-source.a)+blended*source.a*b,b+source.a*(1.0-b));}`)
}
