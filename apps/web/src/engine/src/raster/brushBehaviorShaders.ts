/** Shared separable blend equations; used by grain, dual tips and final paint. */
export const BRUSH_BLEND_GLSL = `
vec3 brushLinear(vec3 c) { return mix(c/12.92,pow(max((c+0.055)/1.055,vec3(0.0)),vec3(2.4)),step(vec3(0.04045),c)); }
vec3 brushEncoded(vec3 c) { c=max(c,vec3(0.0));return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c)); }
float brushLum(vec3 v) { return dot(v,vec3(0.3,0.59,0.11)); }
float brushSat(vec3 v) { return max(v.r,max(v.g,v.b))-min(v.r,min(v.g,v.b)); }
vec3 brushSetLum(vec3 v, float lum) {
 v+=lum-brushLum(v);
 float l=brushLum(v), mn=min(v.r,min(v.g,v.b)), mx=max(v.r,max(v.g,v.b));
 if(mn<0.0) v=vec3(l)+(v-vec3(l))*l/max(l-mn,0.00001);
 if(mx>1.0) v=vec3(l)+(v-vec3(l))*(1.0-l)/max(mx-l,0.00001);
 return clamp(v,0.0,1.0);
}
vec3 brushSetSat(vec3 v,float sat) {
 float mn=min(v.r,min(v.g,v.b)), mx=max(v.r,max(v.g,v.b));
 return (v-vec3(mn))*sat/max(mx-mn,0.00001);
}
float brushSoft(float b,float s) {
 float d=b<=0.25 ? ((16.0*b-12.0)*b+4.0)*b : sqrt(b);
 return s<=0.5 ? b-(1.0-2.0*s)*b*(1.0-b) : b+(2.0*s-1.0)*(d-b);
}

vec3 brushBlend(vec3 b, vec3 s, float mode) {
  if (mode < 0.5) return s;
  if (mode < 1.5) return b*s;
  if (mode < 2.5) return b+s-b*s;
  if (mode < 3.5) return mix(2.0*b*s,1.0-2.0*(1.0-b)*(1.0-s),step(vec3(0.5),b));
  if (mode < 4.5) return min(b,s);
  if (mode < 5.5) return max(b,s);
  if (mode < 6.5) return 1.0-min(vec3(1.0),(1.0-b)/max(s,vec3(0.00392157)));
  if (mode < 7.5) return max(vec3(0.0),b+s-1.0);
  if (mode < 8.5) return min(vec3(1.0),b/max(1.0-s,vec3(0.00392157)));
  if (mode < 9.5) return min(vec3(1.0),b+s);
  if (mode < 10.5) return max(vec3(0.0),b-s);
  if (mode < 11.5) return abs(b-s);
  if (mode < 12.5) return b+s-2.0*b*s;
  if (mode < 13.5) return vec3(brushSoft(b.r,s.r),brushSoft(b.g,s.g),brushSoft(b.b,s.b));
  if (mode < 14.5) return mix(2.0*b*s,1.0-2.0*(1.0-b)*(1.0-s),step(vec3(0.5),s));
  if (mode < 15.5) return min(vec3(1.0),b/max(s,vec3(0.00392157)));
  if (mode < 16.5) return clamp(b+2.0*s-1.0,0.0,1.0);
  vec3 vivid=mix(1.0-min(vec3(1.0),(1.0-b)/max(2.0*s,vec3(0.00392157))),min(vec3(1.0),b/max(2.0*(1.0-s),vec3(0.00392157))),step(vec3(0.5),s));
  if (mode < 17.5) return vivid;
  if (mode < 18.5) return mix(min(b,2.0*s),max(b,2.0*s-1.0),step(vec3(0.5),s));
  if (mode < 19.5) return step(vec3(0.5),vivid);
  if (mode < 20.5) return brushLum(b)<brushLum(s)?b:s;
  if (mode < 21.5) return brushLum(b)>brushLum(s)?b:s;
  if (mode < 22.5) return brushSetLum(brushSetSat(s,brushSat(b)),brushLum(b));
  if (mode < 23.5) return brushSetLum(brushSetSat(b,brushSat(s)),brushLum(b));
  if (mode < 24.5) return brushSetLum(s,brushLum(b));
  return brushSetLum(b,brushLum(s));
}
`
/** Bounded shape-only diffusion shared by stamp and carried-pigment transfer.
 * The geometry includes a 15% pad at full bleed; no canvas colour is sampled. */
export const BRUSH_EDGE_BLEED_GLSL = `
uniform vec4 u_tipBounds;
float brushEdgeSample(sampler2D tip,vec2 p,float kind,float hardness,vec2 flip,float alphaChannel,float aa) {
  if(max(abs(p.x),abs(p.y))>=1.0) return 0.0;
  if(kind<0.5) {
    float dist=length(p);
    if(dist>=1.0) return 0.0;
    float stamp=1.0-smoothstep(min(hardness,1.0-aa),1.0,dist);
    float wet=(1.0-smoothstep(hardness*0.85,1.0,dist))*(1.0-exp(-8.0*(1.0-dist)));
    return mix(stamp,wet,alphaChannel);
  }
  vec4 sampleValue=texture2D(tip,u_tipBounds.xy+(p*flip*0.5+0.5)*u_tipBounds.zw);
  return mix(sampleValue.r,sampleValue.a,alphaChannel);
}
float brushEdgeBleed(sampler2D tip,vec2 uv,float kind,float hardness,vec2 flip,float alphaChannel,float bleed,float aa) {
  vec2 p=uv*(1.0+bleed*0.15);
  float r=bleed*0.12, d=r*0.70710678;
  float center=brushEdgeSample(tip,p,kind,hardness,flip,alphaChannel,aa);
  // Uniform fast path: an inactive edge filter needs one mask lookup, not nine.
  if(bleed<=0.0) return center;
  float axial=brushEdgeSample(tip,p+vec2(r,0.0),kind,hardness,flip,alphaChannel,aa)+brushEdgeSample(tip,p-vec2(r,0.0),kind,hardness,flip,alphaChannel,aa)+brushEdgeSample(tip,p+vec2(0.0,r),kind,hardness,flip,alphaChannel,aa)+brushEdgeSample(tip,p-vec2(0.0,r),kind,hardness,flip,alphaChannel,aa);
  float diag=brushEdgeSample(tip,p+vec2(d,d),kind,hardness,flip,alphaChannel,aa)+brushEdgeSample(tip,p-vec2(d,d),kind,hardness,flip,alphaChannel,aa)+brushEdgeSample(tip,p+vec2(d,-d),kind,hardness,flip,alphaChannel,aa)+brushEdgeSample(tip,p+vec2(-d,d),kind,hardness,flip,alphaChannel,aa);
  return mix(center,center*0.5+axial/12.0+diag/24.0,bleed);
}
`

/** Explicit mask application. Old descriptors keep their original grain path. */
export const BRUSH_TEXTURE_APPLICATION_GLSL = `
float brushTextureAlpha(float a,float t,float strength,vec4 application) {
 float s=clamp(strength,0.0,1.0);
 if(application.x<1.5) return application.y>0.5 ? a*(1.0-s+s*t) : a*t*s;
 return application.y>0.5 ? max(0.0,a-t*s) : max(0.0,a-t-(1.0-s));
}
float brushTextureGrid(sampler2D tex,vec2 local,vec4 application,vec4 mapping,float alphaChannel) {
 vec2 grid=application.zw;
 vec2 period=vec2(mapping.x,mapping.x*grid.y/grid.x);
 vec2 cell=floor(fract((local+mapping.zw)/period)*grid);
 vec4 value=texture2D(tex,(cell+0.5)/mapping.y);
 return mix(value.r,value.a,alphaChannel);
}
`

export const BRUSH_STAMP_FRAG = `
  precision highp float;

  uniform sampler2D u_paperHeightMap;
  uniform sampler2D u_tip;
  uniform vec2 u_paperScale;
  uniform vec2 u_paperOrigin;
  uniform vec2 u_paperTexSize;
  // 0 = the round procedural ramp, 1 = the bitmap mask in u_tip.
  uniform float u_tipKind;
  uniform float u_hardness;
  // Antialiasing floor for the round ramp, canvas px.
  uniform float u_aaPx;
  // This stamp's opacity ceiling (digitalBrushCeiling), 1 with the switch off.
  uniform float u_ceiling;
  // How strongly the paper's tooth breaks this brush's contact (0..1), and the
  // pressure pushing it into the tooth.
  uniform float u_paper;
  uniform float u_paperPressure;
  // The brush's own canvas-anchored texture (tipMasks.ts, BrushTextureId):
  // how strongly it breaks the mark, the world size of one tile, and this
  // tile's world origin already reduced modulo that size on the CPU — so the
  // numbers stay small enough for a mediump fallback not to shift the grain.
  uniform vec4 u_textureApplication; uniform vec4 u_textureMapping;
  uniform vec4 u_dualTextureApplication; uniform vec4 u_dualTextureMapping;
  uniform sampler2D u_texture;
  uniform float u_texStrength;
  uniform float u_texPeriod;
  uniform vec2 u_texOrigin;
  uniform vec2 u_resolution;

  varying vec2 v_localUV;
  varying float v_opacity;
  varying float v_radius;


  uniform float u_edgeBleed;
  uniform float u_ceilingPass;
  uniform float u_ceilingFallback;
  uniform sampler2D u_previousCeiling;
  uniform vec3 u_color;
  uniform vec2 u_flip;
  uniform vec4 u_grainTransform;
  uniform vec2 u_grainTone;
  uniform float u_grainBlend;
  uniform vec4 u_dualBounds;
  uniform sampler2D u_dual;
  uniform float u_dualKind;
  uniform float u_dualBlend;
  uniform float u_dualHardness;
  uniform float u_dualStrength;
  uniform sampler2D u_dualTexture;
  uniform vec2 u_dualTexOrigin;
  uniform float u_dualTexPeriod;
  uniform float u_dualTexStrength;
  uniform vec4 u_dualTransform;
  ${BRUSH_BLEND_GLSL}
  ${BRUSH_EDGE_BLEED_GLSL}
  ${BRUSH_TEXTURE_APPLICATION_GLSL}
  void main() {
    float shape;
    if (u_tipKind < 0.5) {
      // Normalized radius: v_localUV is the dab's own frame, 1.0 at the
      // boundary, so this is scale-free and an ellipse comes out as one.
      float d = length(v_localUV);
      if (d >= 1.0 && u_edgeBleed<=0.0) discard;
      // The ramp is a fraction of the *mark*, not an absolute width: a soft
      // 200px brush has to have a 200px-scale falloff. u_aaPx enters only as
      // the floor, so the hardest brush still antialiases.
      float aaNorm = clamp(u_aaPx / max(v_radius, 1e-4), 0.004, 0.9);
      float inner = min(u_hardness, 1.0 - aaNorm);
      shape = 1.0 - smoothstep(inner, 1.0, d);
    } else {
      // The quad spans -1..1 in the stamp's own (rotated) frame, and the mask
      // is stored with row 0 on top — see tipMasks.ts on orientation.
      shape = texture2D(u_tip, u_tipBounds.xy+(v_localUV * u_flip * 0.5 + 0.5)*u_tipBounds.zw).r;
    }

    if(u_edgeBleed>0.0) shape=brushEdgeBleed(u_tip,v_localUV,u_tipKind,u_hardness,u_flip,0.0,u_edgeBleed,clamp(u_aaPx*(1.0+u_edgeBleed*0.15)/max(v_radius,0.0001),0.004,0.9));
    if (u_dualKind > 0.5) {
      vec2 dualUV = v_localUV * u_dualTransform.xy;
      dualUV = mat2(u_dualTransform.z,-u_dualTransform.w,u_dualTransform.w,u_dualTransform.z)*dualUV;
      float secondary = u_dualKind > 1.5 ? texture2D(u_dual,u_dualBounds.xy+(dualUV*0.5+0.5)*u_dualBounds.zw).r : 1.0-smoothstep(min(u_dualHardness,0.99),1.0,length(dualUV));
      if (abs(dualUV.x)>1.0 || abs(dualUV.y)>1.0) secondary=0.0;
      if(u_dualTextureApplication.x>0.5) {
        vec2 local=vec2(gl_FragCoord.x,u_resolution.y-gl_FragCoord.y);
        secondary=brushTextureAlpha(secondary,brushTextureGrid(u_dualTexture,local,u_dualTextureApplication,u_dualTextureMapping,0.0),u_dualTexStrength,u_dualTextureApplication);
        secondary*=u_dualStrength;
      } else {
      secondary *= u_dualStrength;
      if(u_dualTexStrength>0.0) {
        vec2 dw=u_dualTexOrigin+vec2(gl_FragCoord.x,u_resolution.y-gl_FragCoord.y);
        secondary *= mix(1.0,texture2D(u_dualTexture,dw/u_dualTexPeriod).r,u_dualTexStrength);
      }
      }
      shape = brushBlend(vec3(shape),vec3(secondary),u_dualBlend).r;
    }
    if (shape <= 0.0) discard;

    if(u_textureApplication.x>0.5) {
      vec2 local=vec2(gl_FragCoord.x,u_resolution.y-gl_FragCoord.y);
      shape=brushTextureAlpha(shape,brushTextureGrid(u_texture,local,u_textureApplication,u_textureMapping,0.0),u_texStrength,u_textureApplication);
    }

    // v_opacity carries this stamp's *flow* (per-pass normalized, jittered).
    float amount = shape * v_opacity;

    if (u_paper > 0.0) {
      // World-space paper, the same sampling DAB_FRAG uses (#141): the same
      // world point reads the same texel whichever tile it lands in.
      vec2 paperUV = (gl_FragCoord.xy + u_paperOrigin) / u_paperTexSize * u_paperScale;
      float paperCatch = texture2D(u_paperHeightMap, paperUV).a;
      // Pressure pushes the stick down into the valleys: at a light touch only
      // the ridges take pigment, at full weight most of the sheet does. One
      // sample of a value baked offline in double precision, a smoothstep and
      // a mix — nothing amplified, so every GPU agrees (.claude/rules.md).
      float reach = mix(0.62, 0.12, u_paperPressure);
      float tooth = smoothstep(reach, reach + 0.3, paperCatch);
      amount *= mix(1.0, tooth, u_paper);
    }
    if (u_textureApplication.x<0.5 && u_texStrength > 0.0) {
      // World position, top-down like every Dab.x/y; tiles draw with GL's
      // bottom-up rows, so y is measured back from the tile's top.
      vec2 w = vec2(u_texOrigin.x + gl_FragCoord.x,
                    u_texOrigin.y + (u_resolution.y - gl_FragCoord.y));

      w = mat2(u_grainTransform.z,-u_grainTransform.w,u_grainTransform.w,u_grainTransform.z)*(w-u_texOrigin)+u_grainTransform.xy;
      float g = texture2D(u_texture, w / u_texPeriod).r;
      g = clamp((g-0.5)*max(0.0,1.0+u_grainTone.y*2.0)+0.5+u_grainTone.x,0.0,1.0);
      // Same pressure-into-tooth rule as the paper above, on the brush's own
      // grain: a light touch catches only the high points.
      // Stays well above the bottom of the range even at full weight: a real
      // dry brush breaks up however hard it is pressed, which is the point.
      float reach = mix(0.7, 0.34, u_paperPressure);

      float tooth=smoothstep(reach-0.1,reach+0.14,g);
      amount *= mix(1.0,brushBlend(vec3(1.0),vec3(tooth),u_grainBlend).r,u_texStrength);
    }
    if (amount <= 0.0) discard;

    // The ceiling follows the stamp's silhouette only as far as needed to stay
    // continuous: a hard step at the stamp's rim would draw a visible circle
    // wherever a firm stamp's edge crosses a lighter part of the same stroke.
    float ceiling = u_ceiling * smoothstep(0.0, 0.3, shape);
    if (u_ceilingFallback > 0.5) ceiling = max(ceiling,texture2D(u_previousCeiling,gl_FragCoord.xy/u_resolution).r); gl_FragColor = u_ceilingPass > 0.5 ? vec4(ceiling) : vec4(u_color * amount, amount);
  }
`

/** V2 coverage holds premultiplied pigment and flow, keeping colour dynamics
 * independent from the original layer and from the user's stroke opacity. */
export const BRUSH_COMPOSITE_FRAG = `
precision highp float;
uniform sampler2D u_original;
uniform sampler2D u_strokeCoverage;
uniform sampler2D u_ceiling;
uniform vec2 u_resolution;
uniform float u_opacity;
uniform float u_blend;
uniform float u_mode;
uniform float u_burntEdge;
uniform float u_burntBlend;
uniform float u_edgePx;
uniform float u_luminance;
uniform float u_gammaCorrect;
uniform sampler2D u_surfaceCloud;
uniform sampler2D u_surfaceGrain;
uniform vec4 u_surface;
uniform vec4 u_surfaceOrigin;
uniform vec2 u_screenOrigin;
uniform float u_screentone;
uniform float u_erase;
uniform sampler2D u_secondaryCoverage;
uniform float u_secondaryMode;
uniform float u_secondaryEnabled;
${BRUSH_BLEND_GLSL}
void main() {
 vec2 uv=gl_FragCoord.xy/u_resolution;
 vec4 ink=texture2D(u_strokeCoverage,uv);

 vec4 base=texture2D(u_original,uv);
 vec3 pigment=ink.rgb/max(ink.a,0.00392157);
 float coverage=ink.a;
 if(u_secondaryEnabled>0.5 && coverage>0.0) coverage=clamp(brushBlend(vec3(coverage),vec3(texture2D(u_secondaryCoverage,uv).a),u_secondaryMode).r,0.0,1.0);
 // Modes differ in optical density / accumulation, not in frame count.
 if(u_mode<0.5) coverage=1.0-pow(1.0-coverage,0.5);
 else if(u_mode<1.5) coverage=min(coverage,0.5)*2.0;
 else if(u_mode<2.5) coverage=1.0-pow(1.0-coverage,1.5);
 else if(u_mode<3.5) coverage=1.0-pow(1.0-coverage,2.5);
 else if(u_mode<4.5) coverage=smoothstep(0.0,0.8,coverage);
 else if(u_mode<5.5) coverage=1.0-pow(1.0-coverage,2.0);
 vec2 world=vec2(gl_FragCoord.x,u_resolution.y-gl_FragCoord.y);
 if(u_surface.y+u_surface.z>0.0) {
   float cloud=texture2D(u_surfaceCloud,(world+u_surfaceOrigin.xy)/640.0).r;
   coverage*=mix(1.0,0.55+cloud*0.65,u_surface.y);
   float bloom=smoothstep(0.45,0.75,cloud)*u_surface.z;
   pigment=mix(pigment,vec3(1.0),bloom*0.35);
 }
 if(u_surface.x>0.0) {
   float grain=texture2D(u_surfaceGrain,(world+u_surfaceOrigin.zw)/224.0).r;
   pigment*=mix(1.0,0.65+grain*0.5,u_surface.x);
 }
 if(u_surface.w>0.0) {
   vec2 px=vec2(1.0)/u_resolution;
   float neighbor=(texture2D(u_strokeCoverage,uv+vec2(px.x,0.0)).a+texture2D(u_strokeCoverage,uv-vec2(px.x,0.0)).a+texture2D(u_strokeCoverage,uv+vec2(0.0,px.y)).a+texture2D(u_strokeCoverage,uv-vec2(0.0,px.y)).a)*0.25;
   coverage=mix(coverage,neighbor,u_surface.w*0.5);
 }
 if(u_screentone>0.0) {
   vec2 cell=mod(world+u_screenOrigin,u_screentone*2.0)/u_screentone-1.0;
   float tone=1.0-dot(pigment,vec3(0.3,0.59,0.11));
   float dotMask=1.0-smoothstep(sqrt(max(0.0,tone))-0.06,sqrt(max(0.0,tone))+0.06,length(cell));
   coverage*=dotMask; pigment=vec3(0.0);
 }
 float edge=0.0;
 if(u_burntEdge>0.0) {
   vec2 e=vec2(u_edgePx)/u_resolution;
   float ring=texture2D(u_strokeCoverage,uv+vec2(e.x,0.0)).a+texture2D(u_strokeCoverage,uv-vec2(e.x,0.0)).a
     +texture2D(u_strokeCoverage,uv+vec2(0.0,e.y)).a+texture2D(u_strokeCoverage,uv-vec2(0.0,e.y)).a;
   edge=clamp((ink.a-ring*0.25)*3.0,0.0,1.0);
   pigment=mix(pigment,brushBlend(pigment,pigment*0.5,u_burntBlend),u_burntEdge*edge);
 }
 if(u_luminance>0.5) coverage*=1.0-dot(pigment,vec3(0.2126,0.7152,0.0722));
 float ceiling=texture2D(u_ceiling,uv).r;
 float alpha=clamp(coverage*u_opacity*ceiling,0.0,1.0);
 if(u_erase>0.5){gl_FragColor=base*(1.0-alpha);return;}
 vec3 b=base.rgb/max(base.a,0.00392157);
 if(u_gammaCorrect>0.5) {
   vec3 bl=brushLinear(b), sl=brushLinear(pigment);
   vec3 source=mix(sl,brushBlend(bl,sl,u_blend),base.a);
   float a=alpha+base.a*(1.0-alpha);
   gl_FragColor=vec4(brushEncoded((source*alpha+bl*base.a*(1.0-alpha))/max(a,0.00001))*a,a);
   return;
 }
 vec3 blend=brushBlend(b,pigment,u_blend);
 vec3 source=mix(pigment,blend,base.a);
 gl_FragColor=vec4(source*alpha+base.rgb*(1.0-alpha),alpha+base.a*(1.0-alpha));
}
`
