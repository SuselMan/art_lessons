import {WC_FIELD_OP_FRAG} from './shaders'
import {shaderTo300} from './diagnosticWebgl2'
/** Shared scalar donor terms are literally the original carry expressions.
 * Independent P/C accumulators retain order and their own final RGBA8 fit.
 * Both consume OLD P; never fuse successive Q8 steps or contacts. */
export function carryMrt300(fragment=WC_FIELD_OP_FRAG):string{
 const main=fragment.indexOf('  void main() {'),start=fragment.indexOf('      float ci = texture2D(u_d, v_uv).r;',main)
 const endMarker='      gl_FragColor = WC_FIELD_FIT(max(out4, vec4(0.0)));\n      return;'
 const end=fragment.indexOf(endMarker,start)
 if(main<0||start<0||end<0)throw Error('Carry MRT source signature changed')
 const macro='#ifdef FIELD_OP_COLOUR\n      const bool colour = true;\n#else\n      const bool colour = false;\n#endif'
 let body=fragment.slice(start,end)
 if(!body.includes(macro))throw Error('Carry MRT static colour signature changed')
 const give='if (ws[k] > 0.0) out4 -= a * (u_k * ws[k] / wsum * min(max(Ti - Tj, 0.0) * capIJ, trav * m.a) / max(m.a, 5e-5));'
 const take='if (wme > 0.0) out4 += aj * (u_k * wme / wj * min(max(Tj - Ti, 0.0) * capIJ, trav * mj.a) / max(mj.a, 5e-5));'
 if(!body.includes(give)||!body.includes(take))throw Error('Carry MRT donor expression signature changed')
 body=body.replace(macro,'')
  .replace('vec4 out4 = a;','vec4 out4 = a;\n vec4 ownColour=texture2D(u_colour,v_uv), colourOut=ownColour;')
  .replace('vec4 m = colour ? texture2D(u_c, v_uv) : a;','vec4 m = a;')
  .replace('vec4 mj = colour ? texture2D(u_c, uvj) : aj;','vec4 mj = aj;\n vec4 ajColour=texture2D(u_colour,uvj);')
  .replace(give,`if (ws[k] > 0.0) { ${give.slice(give.indexOf('out4'))} ${give.slice(give.indexOf('out4')).replace('out4 -= a *','colourOut -= ownColour *')} }`)
  .replace(take,`if (wme > 0.0) { ${take.slice(take.indexOf('out4'))} ${take.slice(take.indexOf('out4')).replace('out4 += aj *','colourOut += ajColour *')} }`)
 const source=fragment.slice(0,main)+'\n uniform sampler2D u_colour;\nvoid main(){vec4 a=texture2D(u_a,v_uv);\n'+body+
  '\n outPigment=WC_FIELD_FIT(max(out4,vec4(0.0))); outColour=WC_FIELD_FIT(max(colourOut,vec4(0.0)));\n}'
 return shaderTo300(source,false).replace('layout(location=0) out highp vec4 diagnosticRecord;',
  'layout(location=0) out highp vec4 outPigment;\nlayout(location=1) out highp vec4 outColour;')
}
