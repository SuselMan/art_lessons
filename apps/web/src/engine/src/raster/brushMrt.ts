import { shaderTo300 } from './diagnosticWebgl2'

/** Same source transformation as the independently measured #728 MRT probe.
 * Donor fractions use unchanged pre-contact P/C; both RGBA8 records round at
 * the same pulse boundary. No texture readback or cross-context copy. */
export function brushMrt300(fragment: string): string {
  if (!fragment.includes('gl_FragColor=result/255.0;')) throw new Error('Brush MRT source signature changed')
  const common = shaderTo300(fragment, false)
    .replace('layout(location=0) out highp vec4 diagnosticRecord;', 'layout(location=0) out highp vec4 outPigment;\nlayout(location=1) out highp vec4 outColor;')
  const mainStart = common.indexOf('  void main() {')
  if (mainStart < 0) throw new Error('Brush MRT main signature changed')
  return common.slice(0, mainStart) + `  void main() {
    vec2 center=snapUV(v_uv);
    vec4 ownP=floor(texture(u_pigment,center)*255.0+0.5), resultP=ownP;
    vec4 ownC=floor(texture(u_color,center)*255.0+0.5), resultC=ownC;
    for(int k=0;k<4;k++) {
      vec2 dir=axis(k), neighbour=snapUV(center+dir*u_step);
      float outgoing=integerFraction(center,neighbour,dir);
      float incoming=integerFraction(neighbour,center,-dir);
      resultP-=floor(ownP*outgoing);
      resultP+=floor(floor(texture(u_pigment,neighbour)*255.0+0.5)*incoming);
      resultC-=floor(ownC*outgoing);
      resultC+=floor(floor(texture(u_color,neighbour)*255.0+0.5)*incoming);
    }
    outPigment=resultP/255.0;
    outColor=resultC/255.0;
  }
`
}
