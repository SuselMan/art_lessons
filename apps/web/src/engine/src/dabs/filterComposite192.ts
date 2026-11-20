import { BRUSH_BLEND_MODES, type BrushDescriptor } from '@grafetto/shared'
import { createBrushBlendGLSL } from '../raster/brushBehaviorShaders'
/** Values belong to validated descriptor192; old fixed-selection COPY is -1. */
export function filterComposite192Code(brush:BrushDescriptor):number {
 const filter=brush.filter
 if(brush.version!==192||!filter||!('composite'in filter))return -1
 if(filter.composite==='copy')return -1
 if(filter.composite==='erase')return -2
 const code=BRUSH_BLEND_MODES.indexOf(filter.composite)
 if(code<0)throw Error('Invalid Filter192 destination composite')
 return code
}
export function filterSourceOver192(brush:BrushDescriptor):number {
 return brush.version===192&&brush.filter&&'smudgeMode'in brush.filter&&!brush.filter.smudgeMode?0:1
}
export const FILTER_COMPOSITE192_GLSL=`uniform float u_filterComposite;
${createBrushBlendGLSL()}
vec4 filterSelection(vec4 current,vec4 filtered,float mask){
 if(u_filterComposite< -1.5)return current*(1.-filtered.a*mask);
 if(u_filterComposite< -.5)return mix(current,filtered,mask);
 float alpha=filtered.a*mask;vec3 pigment=filtered.a>0.?filtered.rgb/filtered.a:vec3(0.);
 vec3 base=current.a>0.?current.rgb/current.a:vec3(0.);
 vec3 source=mix(pigment,brushBlend(base,pigment,u_filterComposite),current.a);
 return vec4(source*alpha+current.rgb*(1.-alpha),alpha+current.a*(1.-alpha));
}`
