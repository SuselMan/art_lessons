import{describe,it,expect}from'vitest'
import{carryMrt300}from'./carryMrt'
import{WC_FIELD_OP_FRAG}from'./shaders'
const literal=WC_FIELD_OP_FRAG.slice(WC_FIELD_OP_FRAG.indexOf('      float ci = texture2D(u_d, v_uv).r;'),WC_FIELD_OP_FRAG.indexOf('      gl_FragColor = WC_FIELD_FIT(max(out4, vec4(0.0)));'))
describe('carry MRT preserves literal original equations',()=>{
 it('retains donor/order/capacity expressions twice, with only static colour and sampler mapping',()=>{
  const result=carryMrt300()
  for(const line of literal.split('\n').filter(x=>x.includes('float Ti =')||x.includes('float Tj =')||x.includes('float capIJ =')))expect(result.split(line).length-1).toBe(1)
  for(const scalar of ['(u_k * ws[k] / wsum * min(max(Ti - Tj, 0.0) * capIJ, trav * m.a) / max(m.a, 5e-5))','(u_k * wme / wj * min(max(Tj - Ti, 0.0) * capIJ, trav * mj.a) / max(mj.a, 5e-5))'])expect(result.split(scalar).length-1).toBe(2)
  expect(result).toContain('vec4 ajColour=texture(u_colour,uvj);')
  expect(result).toContain('vec4 aj = texture(u_a, uvj);')
  expect(result).toContain('vec4 m = a;')
  expect(result).toContain('vec4 mj = aj;')
  expect(result).toContain('outColour=WC_FIELD_FIT(max(colourOut,vec4(0.0)));')
  expect(result).not.toContain('gl_FragColor')
  expect(result).toContain('layout(location=1) out highp vec4 outColour;')
 })
 it('rejects a changed source signature rather than silently emitting a partial operator',()=>{
  expect(()=>carryMrt300(WC_FIELD_OP_FRAG.replace('float ci = texture2D(u_d, v_uv).r;','float ci = 0.0;'))).toThrow('signature')
  expect(()=>carryMrt300(WC_FIELD_OP_FRAG.replace('const bool colour = true;','const bool colour = false;'))).toThrow('signature')
 })
})
