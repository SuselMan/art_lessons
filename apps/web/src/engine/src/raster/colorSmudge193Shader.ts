import {BRUSH_BLEND_MODES} from '@grafetto/shared'
import {BRUSH_BLEND_GLSL,createBrushBlendGLSL,createBrushStampFragment} from './brushBehaviorShaders'
import {BRUSH_AUTO_RECTANGLE_GLSL} from './autoRectangle'
import {BRUSH_AUTO_SPIKES_GLSL} from './autoSpikes'
import {BRUSH_AUTO_MASK_NOISE_GLSL} from './autoMaskNoise'
import {GIH_FRAME_SAMPLING_GLSL} from './gihFrameGeometry'
import {BRUSH_RADIAL_SOFTNESS_GLSL} from './radialSoftness'
import {wetTransferFragment,withColorSmudgeTextureAlpha} from './wetMixShaders'

/** Foreground operation only. Final legacy/modern transfer is independent. */
export function colorSmudge193CompositeCode(value:unknown):number {
 if(value===undefined)return 0
 if(value==='dodge')value='colorDodge'
 if(value==='burn')value='colorBurn'
 const index=BRUSH_BLEND_MODES.indexOf(value as typeof BRUSH_BLEND_MODES[number])
 if(index>=0)return index
 switch(value){case'grainMerge':return 28;case'grainExtract':return 29;case'negation':return 30;case'erase':return 31;case'parallel':return 32;default:throw Error('Unknown Color Smudge193 foreground composite')}
}
function replace(source:string,before:string,after:string):string {
 if(source.split(before).length!==2)throw Error('Color Smudge193 shader anchor changed')
 return source.replace(before,after)
}
/** Share the existing procedural algorithms verbatim. This extraction runs at
 * program preparation, never at a dab/pixel boundary; it fails closed if the
 * canonical factory's function ABI changes. Historical shader strings stay put. */
function canonicalFunction(source:string,name:string):string {
 const matches=[...source.matchAll(new RegExp('(?:float|vec[234]|mat[234]) '+name+'\\(','g'))]
 const start=matches[0]?.index??-1
 if(matches.length!==1)throw Error('Ambiguous procedural function '+name)
 const line=source.lastIndexOf('\n',start)+1,open=source.indexOf('{',start)
 let depth=1,end=open+1
 for(;end<source.length&&depth;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--}
 if(depth)throw Error('Unterminated procedural function '+name)
 return source.slice(line,end)
}
function procedural193GLSL():string {
 const stamp=createBrushStampFragment(true,true,true,true)
 return BRUSH_RADIAL_SOFTNESS_GLSL+BRUSH_AUTO_SPIKES_GLSL+BRUSH_AUTO_RECTANGLE_GLSL+`
 uniform vec4 u_tipSoftnessBasis;
 uniform float u_autoSpikes193;uniform float u_generatorAngle193;uniform vec2 u_generatorCenter193;
 uniform vec4 u_rectangleCoefficients;
 uniform vec4 u_rectangleGeometry;
 `+['brushProceduralMaskWithSoftness','brushAutoSpikeAlpha','brushProceduralMaskWithSpikes','brushEffectsTransparency','brushEffectsMask'].map(name=>canonicalFunction(stamp,name)).join('\n')
}
export const COLOR_SMUDGE193_UNIFORMS=['u_colorSmudgeComposite','u_colorSmudgePhotoshop','u_projectionCanvas','u_colorSmudgeHeight','u_tipProcedural','u_dualProcedural','u_tipProceduralGeometry','u_dualProceduralGeometry','u_dualProceduralAngle','u_wickPx','u_wickCap','u_tipImageEnabled','u_dualImageEnabled','u_tipImageUVShift','u_dualImageUVShift','u_tipImageDomain','u_dualImageDomain','u_tipSoftnessBasis','u_generatorAngle193','u_generatorCenter193','u_autoSpikes193','u_rectangleCoefficients','u_rectangleGeometry','u_gihFrame','u_gihSampleX','u_gihSampleY','u_autoNoiseConfig','u_autoNoiseKey','u_autoNoiseGridX','u_autoNoiseGridY']
/** One new compiler input per native strategy, with scalar texture optional.
 * Both forms compose foreground before final mask transfer, never after it. */
export function colorSmudge193Fragment(modern:boolean):string {
 let source=wetTransferFragment(true,true,true,modern)
 source=replace(source,BRUSH_BLEND_GLSL,createBrushBlendGLSL())
 const bank=`
 uniform float u_colorSmudgeComposite;
 vec4 colorSmudge193Paint(vec4 d,vec4 s){
  if(u_colorSmudgeComposite>30.5 && u_colorSmudgeComposite<31.5)return d*(1.0-s.a);
  if(u_colorSmudgeComposite<0.5)return s+d*(1.0-s.a);
  vec3 dst=d.rgb/max(d.a,0.000001),src=s.rgb/max(s.a,0.000001);
  vec3 b;
  // Krita v6.0.4.1 KoCompositeOpFunctions.h, CFParallel: harmonic mean.
  // Float math approximates Krita's channel-type-specific rounding.
  if(u_colorSmudgeComposite>31.5){
   b=2.0*dst*src/max(dst+src,vec3(0.000001));
  }else if(u_colorSmudgeComposite>27.5){
   vec3 du=floor(clamp(dst,0.0,1.0)*255.0+0.5),su=floor(clamp(src,0.0,1.0)*255.0+0.5);
   b=u_colorSmudgeComposite<28.5?clamp(du+su-127.0,0.0,255.0)/255.0:u_colorSmudgeComposite<29.5?clamp(du-su+127.0,0.0,255.0)/255.0:(255.0-abs(255.0-su-du))/255.0;
  }else b=brushBlend(dst,src,u_colorSmudgeComposite);
  return vec4(d.rgb*(1.0-s.a)+s.rgb*(1.0-d.a)+b*d.a*s.a,s.a+d.a*(1.0-s.a));
 }
 `
 source=replace(source,' void main() {',bank+' void main() {')
 if(modern){
  const start=source.indexOf(' vec4 colorSmudgePaint('),end=source.indexOf(' float wetGrainBlend(',start)
  if(start<0||end<0)throw Error('Missing modern foreground stage')
  // The definition must precede its caller on GLSL ES1.
  source=source.slice(0,start)+bank+' vec4 colorSmudgePaint(vec4 d,vec4 s){return colorSmudge193Paint(d,s);}\n'+source.slice(end)
  source=source.replace(bank+' void main() {',' void main() {')
  source=replace(source,'u_colorSmudge.z>0.5 && pigment.a>0.0 && u_wetBlend<0.5 && u_colorSmudgePhotoshop<0.5','u_colorSmudge.z>0.5 && u_colorSmudgeTip<0.5 && pigment.a>0.0 && u_colorSmudgeComposite<0.5')
 }else source=replace(source,'source=vec4(u_previousCanvasForeground.rgb*b,b)+source*(1.0-b);',`vec4 pigment=vec4(u_previousCanvasForeground.rgb*b,b);
        if(u_colorSmudgeTip>0.5)pigment=texture2D(u_tip,u_tipBounds.xy+(v_localUV*u_flip*0.5+0.5)*u_tipBounds.zw)*b;
        source=colorSmudge193Paint(source,pigment);`)
 if(!modern)source=replace(source,' void main() {',' uniform float u_colorSmudgeTip;\n void main() {')
 source=replace(source,' float wetProceduralMask(',procedural193GLSL()+'\n float wetProceduralMask(')
 source=replace(source,'float c=cos(angle),s=sin(angle);','float c=cos(u_generatorAngle193),s=sin(u_generatorAngle193);')
 source=replace(source,'vec2 pixel=vec2(gl_FragCoord.x,u_resolution.y-gl_FragCoord.y)-u_dabCenter;\n   float c=cos(u_generatorAngle193)', 'vec2 pixel=vec2(gl_FragCoord.x,u_resolution.y-gl_FragCoord.y)-u_generatorCenter193;\n   float c=cos(u_generatorAngle193)')
 source=replace(source,'return brushProceduralMaskWithCurve(pixel,mat2(c,-s,s,c),geometry,profile,lookup);','return brushEffectsMask(pixel,u_autoSpikes193>2.5?mat2(c*u_flip.x,-s*u_flip.y,s*u_flip.x,c*u_flip.y):mat2(c,-s,s,c),geometry,profile,lookup,u_tipSoftnessBasis,1.0,u_autoSpikes193);')
 const gih=GIH_FRAME_SAMPLING_GLSL.replace('brushTipSample(tip,u_tipBounds.xy+squareUV*u_tipBounds.zw,u_tipPacking)','texture2D(tip,u_tipBounds.xy+squareUV*u_tipBounds.zw)')
 source=replace(source,' void main() {',gih+BRUSH_AUTO_MASK_NOISE_GLSL+`
 uniform vec4 u_autoNoiseConfig;uniform vec4 u_autoNoiseKey;uniform vec4 u_autoNoiseGridX;uniform vec4 u_autoNoiseGridY;
 void main() {`)
 const sample='integerImageSample(u_tip,u_tipBounds.xy+(v_localUV*u_flip*0.5+0.5)*u_tipBounds.zw,u_tipImageEnabled,u_tipImageDomain,u_tipImageUVShift)'
 const raw='texture2D(u_tip, u_tipBounds.xy + (v_localUV*u_flip*0.5+0.5)*u_tipBounds.zw)'
 source=source.replaceAll(raw,'(u_gihFrame.x>0.5?brushGihFrameSample(u_tip,v_localUV):'+raw+')')
 const compact='texture2D(u_tip,u_tipBounds.xy+(v_localUV*u_flip*0.5+0.5)*u_tipBounds.zw)'
 source=source.replaceAll(compact,'(u_gihFrame.x>0.5?brushGihFrameSample(u_tip,v_localUV):'+compact+')')
 source=source.replaceAll(sample,'(u_gihFrame.x>0.5?brushGihFrameSample(u_tip,v_localUV):'+sample+')')
 source=replace(source,'   shape=brushAlphaThreshold(shape,u_alphaThreshold);',`   vec4 nx=brushNoiseAddOffset(u_autoNoiseGridX,floor(gl_FragCoord.x)*u_autoNoiseConfig.z);
   vec4 ny=brushNoiseAddOffset(u_autoNoiseGridY,floor(gl_FragCoord.y)*u_autoNoiseConfig.w);
   shape=brushAutoMaskNoiseU8(floor(clamp(shape,0.0,1.0)*255.0+0.5),u_autoNoiseConfig.xy,u_autoNoiseKey,nx,ny)/255.0;
   shape=brushAlphaThreshold(shape,u_alphaThreshold);`)
 return withColorSmudgeTextureAlpha(source)
}
