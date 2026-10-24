import { BRUSH_BLEND_GLSL, BRUSH_EDGE_BLEED_GLSL } from './brushBehaviorShaders'

/** Shared pickup/transfer programs for the stump and all mixer brushes. */
export const WET_PICKUP_FRAG = `
  precision highp float;

  uniform float u_gatherEnabled;
  uniform vec2 u_gatherRect;
  uniform vec4 u_gatherTile;
  uniform float u_gatherScale;
  uniform sampler2D u_patch;    // canvas patch under this dab (premultiplied)
  uniform sampler2D u_carried;  // the imprint as of the previous dab, same normalized square
  uniform float u_wetRetention; uniform float u_wetBlur; uniform vec2 u_wetTexel; uniform float u_rate;         // 0..1 — how much of the imprint this dab refreshes (1 = prime it outright)
  // (#573) The digital brush's mixer: its own colour (premultiplied, opaque)
  // folded into the imprint after the pickup, by u_paintLoad. 0 for the smudge
  // tool itself, where mix(x, paint, 0.0) is x exactly — the stump carries no
  // paint of its own.
  uniform vec4 u_paint;
  uniform float u_paintLoad;
  // (#573) 1 for the mixer: the pickup is weighted by how much paint is
  // actually under the brush. A loaded brush dragged over bare paper does not
  // pick the paper's transparency up into itself — that is what made the
  // mixer lay a pale 40% film on an empty sheet. 0 for smudge, whose stump
  // carries nothing of its own and must be free to go clean.
  uniform float u_alphaPickup;

  varying vec2 v_uv;

  void main() {
    if(u_gatherEnabled>0.5) {
      vec2 world=u_gatherRect+vec2(gl_FragCoord.x,-gl_FragCoord.y)*u_gatherScale;
      vec2 p=world-u_gatherTile.xy;
      if(p.x<0.0 || p.y<0.0 || p.x>=u_gatherTile.z || p.y>=u_gatherTile.w) discard;
      gl_FragColor=texture2D(u_patch,vec2(p.x/u_gatherTile.z,1.0-p.y/u_gatherTile.w));
      return;
    }
    // Straight per-texel refresh, blending disabled by the caller: this
    // writes the imprint's new value outright, it does not accumulate onto
    // the previous one (the previous one is an input here, u_carried).
    // Not named "patch": that is a keyword in desktop GLSL 4, which is what
    // ANGLE translates this shader into on some platforms.
    vec4 under = texture2D(u_patch, v_uv);
    float rate = u_rate * mix(1.0, under.a, u_alphaPickup);

 vec4 carried = texture2D(u_carried, v_uv);
 if (u_wetBlur > 0.0) {
   vec2 d = u_wetTexel * u_wetBlur * 3.0;
   carried = (carried * 4.0 + texture2D(u_carried,v_uv+vec2(d.x,0.0)) + texture2D(u_carried,v_uv-vec2(d.x,0.0)) + texture2D(u_carried,v_uv+vec2(0.0,d.y)) + texture2D(u_carried,v_uv-vec2(0.0,d.y))) / 8.0;
 }
 vec4 picked = mix(carried * u_wetRetention, under, rate);
    gl_FragColor = mix(picked, u_paint, u_paintLoad);
  }
`

export const WET_TRANSFER_FRAG = `
  precision highp float;

  uniform sampler2D u_paperHeightMap;
  uniform vec2 u_paperScale;
  uniform vec2 u_paperOrigin;
  uniform vec2 u_paperTexSize;
  uniform float u_hardness;
 uniform vec4 u_dualBounds;
 uniform sampler2D u_dual; uniform float u_dualKind; uniform float u_dualBlend; uniform vec4 u_dualTransform;
 uniform sampler2D u_wetOriginal; uniform vec4 u_wetRender; uniform float u_wetBlend; uniform float u_burntBlend; uniform float u_wetGamma; uniform sampler2D u_secondaryCoverage; uniform float u_secondaryEnabled; uniform vec2 u_resolution;
 uniform vec2 u_wetRoundPhase; uniform float u_wetEnabled; uniform float u_tipKind; uniform sampler2D u_tip;
 uniform sampler2D u_wetGrain; uniform float u_grainStrength; uniform float u_grainPeriod;
 uniform float u_grainBlend; uniform vec4 u_grainTransform; uniform vec2 u_grainTone; uniform vec2 u_wetWorldOrigin; uniform vec2 u_flip;
  // The imprint this dab lays down (SMUDGE_PICKUP_FRAG's own output),
  // addressed in the patch's own normalized square — see u_patchOrigin.
  uniform sampler2D u_carried;
  // The copied patch's lower-left corner and side length, in this tile's
  // own GL pixel space, so a fragment can map itself back into the imprint
  // exactly. Derived from the same rounded world rect SmudgePainter.gatherPatch was
  // handed rather than from the dab's own center: half a pixel of
  // disagreement between the two would blur the canvas on every dab even when
  // the brush is standing still, because the lerp would be mixing a shifted
  // copy of the same content into itself.
  //
  // (#514) Negative on whichever side of a tile seam the patch started
  // outside of — one dab straddling a seam is drawn once per tile it
  // touches, each with the same patch expressed in that tile's own pixels.
  // Nothing here needs to know: the subtraction below is affine, and the dab
  // quad is contained in the patch, so every fragment this shader actually
  // reaches still samples inside it.
  uniform vec2 u_patchOrigin;
  uniform float u_patchSize;
  // 0 = the lerp's own "dst *= (1-a)" half, under beginErase()'s
  // (ZERO, ONE_MINUS_SRC_ALPHA); 1 = its "+ carried*a" half, under
  // beginAdditiveDraw()'s (ONE, ONE). See this file's header comment.
  uniform float u_mode;
  uniform float u_previousCanvas; // 0 reservoir; 1 spatial COPY; 2 spatial OVER
  // This dab's own share of the transfer, before the per-pixel weighting
  // below: SMUDGE_DEPOSIT_RATE * pressure * strength * travel (see
  // SmudgePainter.paintOneDab).
  uniform float u_strength;
  uniform float u_pressure;
  uniform float u_paperFillThreshold;
  uniform float u_paperFillCap;
  // How strongly the *deposited* material follows the paper's tooth at this
  // dab's own pressure (smudgeGrainRelief, live-tunable — see
  // smudgeGrain.ts). 0 lays the imprint down flat, which is exactly what
  // this shader did before the term existed.
  uniform float u_grainRelief;

  varying vec2 v_localUV;


 // Exact small integer Bayer ranks; no float hash, trig, time or frame state.
 float wetRank2(vec2 p) { return 2.0*p.x+3.0*p.y-4.0*p.x*p.y; }
 float wetThreshold(vec2 world) {
   vec2 p=mod(floor(world)+u_wetRoundPhase,8.0);
   float rank=16.0*wetRank2(mod(p,2.0))+4.0*wetRank2(mod(floor(p/2.0),2.0))+wetRank2(floor(p/4.0));
   return (rank+0.5)/64.0;
 }
 uniform float u_edgeBleed;
 ${BRUSH_BLEND_GLSL}
 ${BRUSH_EDGE_BLEED_GLSL}
 float wetGrainBlend(float b,float s,float m) { return brushBlend(vec3(b),vec3(s),m).r; }
 void main() {
    // Circular only (v1) — DAB_VERT always sets u_aspectRatio=1/u_angle=0
    // for a smudge dab (see SmudgePainter.paintOneDab), so v_localUV is already
    // exactly the unit-circle-space DAB_FRAG's own uv would be for a
    // circular dab; no aspect-ratio divide needed here.
    float dist = length(v_localUV);
    if ((u_wetEnabled < 0.5 || u_tipKind < 0.5) && dist > 1.0 && u_edgeBleed<=0.0) discard;

    float innerEdge = u_hardness * 0.85;
    float shape = 1.0 - smoothstep(innerEdge, 1.0, dist);
    shape *= 1.0 - exp(-8.0 * (1.0 - dist));
 if (u_wetEnabled > 0.5) {
   if (u_tipKind > 0.5) shape = texture2D(u_tip,u_tipBounds.xy+(v_localUV*u_flip*0.5+0.5)*u_tipBounds.zw).a;
   if(u_edgeBleed>0.0) shape=brushEdgeBleed(u_tip,v_localUV,u_tipKind,u_hardness,u_flip,1.0,u_edgeBleed,0.004);
   if (u_dualKind > 0.5) {
     vec2 uv=v_localUV*u_dualTransform.xy;
     uv=mat2(u_dualTransform.z,-u_dualTransform.w,u_dualTransform.w,u_dualTransform.z)*uv;
     float second=u_dualKind>1.5 ? texture2D(u_dual,u_dualBounds.xy+(uv*0.5+0.5)*u_dualBounds.zw).a : 1.0-smoothstep(0.7,1.0,length(uv));
     if (abs(uv.x)>1.0 || abs(uv.y)>1.0) second=0.0;
     shape=wetGrainBlend(shape,second,u_dualBlend);
   }
   if(u_secondaryEnabled>0.5) shape=brushBlend(vec3(shape),vec3(texture2D(u_secondaryCoverage,gl_FragCoord.xy/u_resolution).a),u_dualBlend).r;
   if (shape <= 0.0) discard;
   vec2 world = vec2(gl_FragCoord.x + u_wetWorldOrigin.x, u_wetWorldOrigin.y-gl_FragCoord.y);
   vec2 guv = (world + u_grainTransform.xy)/u_grainPeriod;
   guv = mat2(u_grainTransform.z,-u_grainTransform.w,u_grainTransform.w,u_grainTransform.z)*guv;
   float grain = texture2D(u_wetGrain,fract(guv)).a;
   grain = clamp((grain-0.5)*max(0.0,1.0+u_grainTone.y*3.0)+0.5+u_grainTone.x,0.0,1.0);
   shape = mix(shape,wetGrainBlend(shape,grain,u_grainBlend),u_grainStrength);
 }

    if (u_previousCanvas > 0.5) {
      vec2 uv=(gl_FragCoord.xy-u_patchOrigin)/u_patchSize;
      vec4 source=texture2D(u_carried,uv);
      vec4 destination=texture2D(u_wetOriginal,uv);
      float amount=clamp(u_strength*shape,0.0,1.0);
      // Premultiplied RGBA. No travel, paper catch, rendering density,
      // stochastic rounding or tooth modifies this independent component.
      gl_FragColor=u_previousCanvas<1.5 ? mix(destination,source,amount) : source*amount+destination*(1.0-source.a*amount);
      return;
    }

    // Same world-space paper sampling DAB_FRAG uses (see its own #141
    // comment) — two dabs at the same true world position must sample the
    // same paper texel regardless of which tile either lands in.
    vec2 paperUV = (gl_FragCoord.xy + u_paperOrigin) / u_paperTexSize * u_paperScale;
    float paperCatch = texture2D(u_paperHeightMap, paperUV).a;
    // Mirrors DAB_FRAG's own fill/effectiveCatch math exactly (the same
    // live-tunable setPaperFillThreshold/Cap knobs govern both): under
    // pressure the stump reaches into the paper's low spots instead of only
    // working its high ones. Left alone, paperCatch is what keeps grain
    // from being blended flat.
    float fill = smoothstep(u_paperFillThreshold, 1.0, u_pressure) * u_paperFillCap;
    // Sampled before the blend weight, and by *both* passes, because the fill
    // below reads its alpha — the two halves must still compute an identical
    // weight (see this file's header comment), so neither may branch before
    // this point.
    vec2 puv = (gl_FragCoord.xy - u_patchOrigin) / u_patchSize;
    vec4 c = texture2D(u_carried, puv);
    // A tooth already full of graphite offers the stump no relief to ride, so
    // the paper stops governing the transfer exactly where it has been filled
    // in — the imprint's own alpha joins pressure in flattening the catch.
    //
    // This is what makes working *inside* a dense area stable. Weighting only
    // the removal by the grain (which is all this did before) takes the most
    // from the pixels holding the most graphite — the ridges, since DAB_FRAG
    // laid the graphite down through this same catch — and hands them back
    // the patch average, so every pass bleaches the area a little. The
    // deposit's own tooth term below cancels that wherever there is headroom
    // to deposit into, and in dense graphite there is none by definition;
    // the only honest fix there is to stop the grain weighting the removal
    // either. Measured over ten heavy full-pressure passes inside a dense 8B
    // field, mean luminance of the interior: it drifted +1.98 levels with
    // neither term, +1.77 with the deposit's tooth alone, and +0.61 with
    // both. Not zero — a partially covered pixel still has some grain
    // weighting on both sides, by design — but a sixth of what it was.
    float effectiveCatch = mix(paperCatch, 1.0, max(fill, c.a));

    // The single per-pixel blend weight both passes share. Any change here
    // is a change to *both* halves of the lerp at once, which is the point
    // — see this file's header comment.

    float amount=u_strength*shape*effectiveCatch;
    if (u_wetEnabled > 0.5) {
      // Mixer has a sequential carried imprint rather than stroke coverage.
      // These density/edge equations approximate the same rendering controls.
      float edge=shape*(1.0-shape)*4.0;
      float density=u_wetRender.z<0.5?0.5:u_wetRender.z<1.5?0.8:u_wetRender.z<2.5?1.5:u_wetRender.z<3.5?2.5:u_wetRender.z<4.5?0.9:u_wetRender.z<5.5?1.8:1.0;
      amount=1.0-pow(1.0-clamp(amount,0.0,1.0),density);
      vec4 base=texture2D(u_wetOriginal,puv);
      vec3 pigment=c.rgb/max(c.a,0.00392157);
      pigment=u_wetGamma>0.5 ? brushEncoded(brushBlend(brushLinear(base.rgb/max(base.a,0.00392157)),brushLinear(pigment),u_wetBlend)) : brushBlend(base.rgb/max(base.a,0.00392157),pigment,u_wetBlend);
      vec3 burnt=brushBlend(pigment,pigment,u_burntBlend);
      pigment=mix(pigment,burnt,clamp(u_wetRender.y*edge,0.0,1.0));
      if(u_wetRender.w>0.5) {
        float lum=dot(pigment,vec3(0.2126,0.7152,0.0722));
        pigment=mix(pigment,vec3(lum),u_wetRender.w);
      }
      c=vec4(pigment*c.a,c.a);
    }
    float a=clamp(amount,0.0,1.0);


    if (u_wetEnabled > 0.5) {
      vec4 base=texture2D(u_wetOriginal,puv);
      float tooth=1.0+u_grainRelief*(1.0-c.a)*(paperCatch-0.5)*2.0;
      vec4 result=clamp(base*(1.0-a)+c*tooth*a,0.0,1.0);
      if(u_wetGamma>0.5) {
        vec3 lin=brushLinear(base.rgb/max(base.a,0.00392157))*base.a*(1.0-a)+brushLinear(c.rgb/max(c.a,0.00392157))*c.a*tooth*a;
        result.rgb=brushEncoded(lin/max(result.a,0.00392157))*result.a;
      }
      vec2 world=vec2(gl_FragCoord.x+u_wetWorldOrigin.x,u_wetWorldOrigin.y-gl_FragCoord.y);
      // Round once, after the complete lerp; two 8-bit clear/add passes lose
      // every sub-byte wet transfer before it has a chance to accumulate.
      result=floor(result*255.0+wetThreshold(world))/255.0;
      result.rgb=min(result.rgb,vec3(result.a));
      gl_FragColor=result;
      return;
    }
    if (u_mode > 0.5) {
      // How the imprint settles into the tooth (smudgeGrain.ts). The weight
      // a above only decides how much of this pixel is reworked; what gets
      // laid down is the imprint, a running average of patches collected
      // along the stroke, whose own grain has averaged out — depositing it
      // unmodulated is what wiped the paper's texture off a smudged area
      // (measured: local contrast halved at unchanged tone). So the stump
      // lays graphite on the ridges first, and pressure (already folded into
      // u_grainRelief) drives it deeper into the valleys until the mark
      // flattens.
      //
      // Centred on 0.5 = the catch channel's own mean by construction, so
      // this redistributes the deposit across the grain rather than changing
      // how much of it lands. Sampled from the same world-locked paperUV the
      // dab shader uses, so the re-imprinted tooth lands *on* the paper's own
      // grain — reinforcing what the pencil deposited rather than crossing it
      // with a second, misaligned pattern.
      //
      // Scaled by the imprint's own headroom (1 - its alpha), which is what
      // keeps this from *lightening* the very areas it is supposed to leave
      // alone. Texture is a deviation in both directions, and a saturated
      // black field has room in only one: nothing can be added above alpha 1,
      // so an unscaled modulation loses every valley and gains no ridge back,
      // and working dense graphite bleaches it a little more on every pass
      // (measured: +7.2 levels over ten passes at full pressure, against +2.0
      // with no grain term at all). Fading the amplitude out as the imprint
      // approaches opaque also says the right physical thing — a black 8B
      // smear has its tooth filled in and reads glossy and flat, not grainy —
      // and it is what makes the modulation exactly mean-preserving: with
      // relief <= 1 the product below can no longer clip at all, since
      // c.a + relief*c.a*(1 - c.a) <= 1 for every c.a in 0..1.
      float tooth = 1.0 + u_grainRelief * (1.0 - c.a) * (paperCatch - 0.5) * 2.0;
      gl_FragColor = c * tooth * a;
    } else {
      gl_FragColor = vec4(0.0, 0.0, 0.0, a);
    }
  }
`
