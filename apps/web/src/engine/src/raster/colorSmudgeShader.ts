/** Opt-in modern Color Smudge program. Legacy compiler input is unchanged. */
export function colorSmudgeTransferFragment(source: string): string {
  const replace = (before: string, after: string): void => {
    if (source.split(before).length !== 2) throw new Error('Color Smudge shader anchor changed')
    source = source.replace(before, after)
  }
  replace("  uniform float u_previousCanvas; //",
`  uniform vec2 u_colorSmudgeHeight; uniform float u_colorSmudgeTip; uniform vec4 u_colorSmudge; // new mask strategy, smear amount, fused dulling, mask-only pass
  uniform float u_previousCanvas; //`)
  replace(" float wetGrainBlend(float b,float s,float m)",
` vec4 colorSmudgePaint(vec4 destination,vec4 pigment) {
   if(u_wetBlend<0.5)return pigment+destination*(1.0-pigment.a);
   vec3 blended=brushBlend(destination.rgb/max(destination.a,0.000001),pigment.rgb/max(pigment.a,0.000001),u_wetBlend);
   return vec4(destination.rgb*(1.0-pigment.a)+pigment.rgb*(1.0-destination.a)+blended*destination.a*pigment.a,pigment.a+destination.a*(1.0-pigment.a));
 }
 float wetGrainBlend(float b,float s,float m)`)
  replace("    if (u_previousCanvas > 0.5) {",
`    if(u_colorSmudge.w>1.5){
      vec4 tip=texture2D(u_tip,u_tipBounds.xy+(v_localUV*u_flip*0.5+0.5)*u_tipBounds.zw);
      float gray=floor(tip.r/max(tip.a,0.000001)*255.0+0.5)-127.0;
      gray=sign(gray)*floor((abs(gray)*floor(u_colorSmudgeHeight.x*255.0+0.5)+127.0)/255.0);
      gray=clamp(gray+127.0,0.0,255.0)/255.0;
      float a=clamp(shape*u_colorSmudgeHeight.y,0.0,1.0);
      gl_FragColor=vec4(vec3(gray*a),a);return;
    }
    if(u_colorSmudge.w>0.5){gl_FragColor=vec4(shape);return;}
    if (u_previousCanvas > 0.5) {`)
  replace("      if(u_previousCanvasForeground.a>0.0) {",
`      if(u_colorSmudge.x>0.5) {
        vec4 destination=texture2D(u_wetOriginal,uv);
        float a=u_colorSmudge.y;
        vec4 pigment=vec4(u_previousCanvasForeground.rgb*u_previousCanvasForeground.a,u_previousCanvasForeground.a);
        if(u_colorSmudgeTip>0.5) pigment=texture2D(u_tip, u_tipBounds.xy + (v_localUV*u_flip*0.5+0.5)*u_tipBounds.zw)*u_previousCanvasForeground.a;
        vec4 mixed;
        // Native fuses foreground into the sampled mean for OVER dulling.
        if(u_colorSmudge.z>0.5 && pigment.a>0.0 && u_wetBlend<0.5) {
          source=pigment+source*(1.0-pigment.a);
          mixed=source*a+destination*(1.0-source.a*a);
        } else {
          mixed=u_previousCanvas<1.5 ? mix(destination,source,a) : source*a+destination*(1.0-source.a*a);
          mixed=colorSmudgePaint(mixed,pigment);
        }
        gl_FragColor=mix(destination,mixed,clamp(shape,0.0,1.0));
        return;
      }
      if(u_previousCanvasForeground.a>0.0) {`)
  return source
}
