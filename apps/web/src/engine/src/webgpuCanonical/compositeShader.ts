import { CANONICAL_NOISE_WGSL } from './noise'
export const CANONICAL_COMPOSITE_WGSL = `
struct U { a:vec4f,b:vec4f,c:vec4f,d:vec4f,e:vec4f,f:vec4f,g:vec4f }
@group(0) @binding(0) var<uniform> u:U;
@group(0) @binding(1) var originalTex:texture_2d<f32>;
@group(0) @binding(2) var coverageTex:texture_2d<f32>;
@group(0) @binding(3) var pigmentTex:texture_2d<f32>;
@group(0) @binding(4) var colorTex:texture_2d<f32>;
@group(0) @binding(5) var paperTex:texture_2d<f32>;
@group(0) @binding(6) var noiseTex:texture_2d<f32>;
@group(0) @binding(7) var linearClamp:sampler;
@group(0) @binding(8) var linearRepeat:sampler;
${CANONICAL_NOISE_WGSL}
const WC_DEPTH_SCALE:f32=4.0;
fn field(tex:texture_2d<f32>,uv:vec2f)->vec4f{return textureSampleLevel(tex,linearClamp,vec2f(uv.x,1.0-uv.y),0);}
fn paperSample(uv:vec2f)->vec4f{return textureSampleLevel(paperTex,linearRepeat,uv,0);}
struct V { @builtin(position) p:vec4f }
@vertex fn vs(@builtin(vertex_index) n:u32)->V {let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));var o:V;o.p=vec4f(p[n],0,1);return o;}
  const WC_DENSITY_K:f32 = 0.54;
  const WC_TINT_DARK:f32 = 1.2;
  const WC_DRY_TOOTH_PX:f32 = 9.0;
  const WC_DRY_COARSE:f32 = 0.65;
  const WC_DRY_LIFT:f32 = 0.42;
  const WC_DRY_WATER_LO:f32 = 0.15;
  const WC_DRY_WATER_HI:f32 = 0.5;
  const WC_DRY_CONTACT_W:f32 = 0.12;
  const WC_WET_PUSH:f32 = 0.50;
  const WC_WET_GRAN:f32 = 0.35;
  const WC_PUSH_DRY:f32 = 0.45;
  const WC_WET_PAPER:f32 = 1.3;
  const C30:f32 = 0.8660254;
  const C15:f32 = 0.9659258;
  const S15:f32 = 0.2588190;
  fn wcInkAvg(uv:vec2f, texel:vec2f, rPx:f32)->vec4f {
    var s:vec4f = field(pigmentTex, uv) * 2.0;
    s += field(pigmentTex, uv + vec2f( rPx,        0.0      ) * texel);
    s += field(pigmentTex, uv + vec2f(-rPx,        0.0      ) * texel);
    s += field(pigmentTex, uv + vec2f( 0.0,        rPx      ) * texel);
    s += field(pigmentTex, uv + vec2f( 0.0,       -rPx      ) * texel);
    s += field(pigmentTex, uv + vec2f( rPx * C30,  rPx * 0.5) * texel);
    s += field(pigmentTex, uv + vec2f(-rPx * C30,  rPx * 0.5) * texel);
    s += field(pigmentTex, uv + vec2f( rPx * C30, -rPx * 0.5) * texel);
    s += field(pigmentTex, uv + vec2f(-rPx * C30, -rPx * 0.5) * texel);
    s += field(pigmentTex, uv + vec2f( rPx * 0.5,  rPx * C30) * texel);
    s += field(pigmentTex, uv + vec2f(-rPx * 0.5,  rPx * C30) * texel);
    s += field(pigmentTex, uv + vec2f( rPx * 0.5, -rPx * C30) * texel);
    s += field(pigmentTex, uv + vec2f(-rPx * 0.5, -rPx * C30) * texel);
    return (s * 0.0714286) * 2.0;
  }
  fn wcRingAvg(uv:vec2f, texel:vec2f, rPx:f32, stagger:f32)->f32 {
    var bx:vec2f=vec2f(1.0,0.0);if(stagger>0.5){bx=vec2f(C15,S15);}
    var by:vec2f = vec2f(-bx.y, bx.x);
    var s:f32 = 0.0;
    s += field(coverageTex, uv + (bx *  rPx) * texel).a;
    s += field(coverageTex, uv + (bx * -rPx) * texel).a;
    s += field(coverageTex, uv + (by *  rPx) * texel).a;
    s += field(coverageTex, uv + (by * -rPx) * texel).a;
    s += field(coverageTex, uv + (bx *  rPx * C30 + by *  rPx * 0.5) * texel).a;
    s += field(coverageTex, uv + (bx * -rPx * C30 + by *  rPx * 0.5) * texel).a;
    s += field(coverageTex, uv + (bx *  rPx * C30 + by * -rPx * 0.5) * texel).a;
    s += field(coverageTex, uv + (bx * -rPx * C30 + by * -rPx * 0.5) * texel).a;
    s += field(coverageTex, uv + (bx *  rPx * 0.5 + by *  rPx * C30) * texel).a;
    s += field(coverageTex, uv + (bx * -rPx * 0.5 + by *  rPx * C30) * texel).a;
    s += field(coverageTex, uv + (bx *  rPx * 0.5 + by * -rPx * C30) * texel).a;
    s += field(coverageTex, uv + (bx * -rPx * 0.5 + by * -rPx * C30) * texel).a;
    return s * 0.0833333;
  }
@fragment fn fs(v:V)->@location(0) vec4f {let glPx=vec2f(v.p.x,u.a.y-v.p.y);let paperUV=(glPx+u.a.zw)/u.b.xy*u.b.zw;let paperCatch=paperSample(paperUV).a;

      var tileUV:vec2f = glPx / u.a.xy;
      var texel:vec2f = 1.0 / u.a.xy;
      var wp:vec2f = glPx + u.a.zw + u.c.xy;
      var rawCoverage:f32 = field(coverageTex, tileUV).a;
      var ink:vec4f = field(pigmentTex, tileUV) * 2.0;
if(u.c.z>0.0){ink=wcInkAvg(tileUV,texel,u.c.z*.5);}
      var depth:vec4f = field(colorTex, tileUV) * 2.0;
      const WC_DEPTH_PRIOR:f32 = 0.0;
      const WC_DEPTH_THIN:f32 = 0.12;
      var thinPrior:f32 = WC_DEPTH_PRIOR + WC_DEPTH_THIN * (1.0 - smoothstep(0.0, WC_DEPTH_THIN, depth.a));
      var tauPrior:vec3f = vec3f(0.0);
      if (thinPrior > 0.0) {
        var stepUV:vec2f = 2.0 / u.a.xy;
        var localDepth:vec4f = depth + 2.0 * (
          field(colorTex, tileUV + vec2f(stepUV.x, 0.0)) +
          field(colorTex, tileUV - vec2f(stepUV.x, 0.0)) +
          field(colorTex, tileUV + vec2f(0.0, stepUV.y)) +
          field(colorTex, tileUV - vec2f(0.0, stepUV.y)));
        tauPrior = localDepth.rgb * WC_DEPTH_SCALE / max(localDepth.a, 5e-5);
      }
      var tauHere:vec3f = (depth.rgb * WC_DEPTH_SCALE + tauPrior * thinPrior) / (depth.a + thinPrior);
      var paint:vec3f = exp(-tauHere);
      var waterHere:f32=u.c.w;if(ink.a>0.004){waterHere=clamp(ink.r/ink.a,0.0,1.0);}
      var standingHere:f32 = field(coverageTex, tileUV).b;
      var paperWetHere:f32 = max(waterHere, standingHere);
      var strengthHere:f32=u.d.x;if(ink.a>0.004){strengthHere=clamp(ink.b/ink.a,0.0,1.0);}
      var transportHere:f32 = max(waterHere, paperWetHere);
      var coverage:f32 = rawCoverage;
      var blurred:f32 = rawCoverage;
      var push:f32 = 0.0;
      if (u.d.y > 0.0) {
        var reach:f32 = u.d.y * mix(0.25, 1.0, transportHere);
        blurred =
            0.20 * rawCoverage
          + 0.45 * wcRingAvg(tileUV, texel, reach * 0.55, 1.0)
          + 0.35 * wcRingAvg(tileUV, texel, reach, 0.0);
        var wetGain:f32 = mix(1.0, 1.7, paperWetHere);
        push = WC_WET_PUSH * paperWetHere * mix(WC_PUSH_DRY, 1.0, waterHere);
        var thr:f32 = 0.5
          - push
          + WC_WET_PAPER * push * (paperCatch - 0.5)
          + u.d.z * wetGain * (wcFbm(wp * 0.030) - 0.5);
        var soft:f32 = max(u.d.w, 0.03) * wetGain * mix(0.75, 1.25, wcFbm(wp * 0.017 + vec2f(53.0, 11.0)));
        coverage = smoothstep(thr, min(thr + soft, 1.0), blurred);
      }
      var acrossN:f32=0.0;if(rawCoverage>0.004){acrossN=clamp(field(coverageTex,tileUV).r/rawCoverage,0.0,1.0)*2.0-1.0;}
      var bristle:f32 = wcHairField(acrossN, u.e.x, wp);
      var dryness:f32 = u.e.y * (1.0 - smoothstep(WC_DRY_WATER_LO, WC_DRY_WATER_HI, max(max(waterHere, paperWetHere), standingHere)));
      if (dryness > 0.0) {
        var dTex:vec2f = (WC_DRY_TOOTH_PX / 3.0) / u.b.xy * u.b.zw;
        var coarse:f32 = 0.0;
        for(var j=-1;j<=1;j++){for(var i=-1;i<=1;i++){coarse+=paperSample(paperUV+vec2f(f32(i),f32(j))*dTex).r;}}
        coarse /= 9.0;
        var catchTooth:f32 = mix(paperSample( paperUV).r, coarse, WC_DRY_COARSE);
        var reach:f32 = catchTooth * (1.0 + 0.08 * (bristle - 1.0));
        var lift:f32 = mix(-0.05, WC_DRY_LIFT, dryness);
        var contact:f32 = smoothstep(lift, lift + WC_DRY_CONTACT_W, reach);
        coverage *= mix(1.0, contact, dryness);
      }
      if (coverage < 0.004) {
        if (u.g.w > 0.5) {
          return field(originalTex,tileUV);
        }
        discard;
      }
      var dst:vec4f = field(originalTex, tileUV);
      var effectiveBase:vec3f=vec3f(1.0);if(dst.a>0.004){effectiveBase=clamp(dst.rgb/dst.a,vec3f(0.0),vec3f(1.0));}
      var deposit:f32 = ink.a;
      var migrateGate:f32 = 0.0;
      var pigmentMass:f32 = strengthHere * deposit;
      var darkness:f32 = 1.0 - dot(paint, vec3f(0.2126, 0.7152, 0.0722));
      var tint:f32 = 1.0 + WC_TINT_DARK * pow(darkness, 4.0);
      var linearThickness:f32 = pigmentMass * 0.55 / WC_DENSITY_K;
      var effectiveThickness:f32=linearThickness;if(linearThickness>1.0){effectiveThickness=1.0+0.6*(1.0-exp(-(linearThickness-1.0)/0.6));}
      var transmittance:vec3f = exp(-tauHere * effectiveThickness);
      var density:f32 = 1.0 - min(transmittance.r, min(transmittance.g, transmittance.b));
      paint=vec3f(1.0);if(density>0.0001){paint=clamp((transmittance-vec3f(1.0-density))/density,vec3f(0.0),vec3f(1.0));}
      var granHere:f32 = u.e.z * (0.2 + 0.8 * density * density)
        + WC_WET_GRAN * paperWetHere * (1.0 - density);
      var gran:f32 = 1.0 + granHere * (1.0 - 2.0 * paperCatch) * 0.5;
      var cloud:f32 = 1.0;
      var wet:f32 = 0.0;
      if (u.e.w > 0.0) {
        var tideExp:f32 = max(1.0, (u.d.y * mix(0.25, 1.0, waterHere)) / max(u.f.x, 1.0));
        var outside:f32 = pow(max(1.0 - blurred, 0.0), tideExp);
        var tide:f32 = smoothstep(u.f.y, u.f.z, wcFbm(wp * 0.025 + vec2f(7.0, 61.0)));
        wet = u.e.w * outside * tide * (1.0 - 0.35 * min(migrateGate, 1.0));
      }
      var edgeness:f32 = 1.0 - coverage;
      var paperMod:f32 = 1.0 - u.f.w * edgeness * (1.0 - paperCatch);
      var pigment:f32 = clamp(coverage * u.g.x * density * gran * cloud * paperMod * (1.0 + wet), 0.0, 1.0);
      if (u.g.z > 0.5) {
        var rawInk:vec4f = field(pigmentTex, tileUV) * 2.0;
        var rawCov:vec4f = field(coverageTex, tileUV);
        var nominalDbg:f32=0.0;if(rawCov.a>0.002){nominalDbg=rawCov.b/rawCov.a;}
        var recordedDbg:f32=0.0;if(rawInk.a>0.002){recordedDbg=rawInk.g/rawInk.a;}
        var gateDbg:f32 = rawCov.a * clamp(max(nominalDbg, recordedDbg), 0.0, 1.0);
        var dbg:f32=gateDbg;if(u.g.z<1.5){dbg=coverage;}else if(u.g.z<2.5){dbg=density;}else if(u.g.z<3.5){dbg=ink.b*3.0;}pigment=clamp(dbg,0.0,1.0);
      }
      var newAlpha:f32 = mix(dst.a, 1.0, pigment);
      var transmitted:vec3f = effectiveBase * paint;
      var covered:vec3f = mix(effectiveBase, paint, pigment);
      var overPaint:vec3f = mix(transmitted, covered, u.g.y);
      var premultResult:vec3f =
          pigment * (1.0 - dst.a) * paint
        + pigment * dst.a * overPaint
        + (1.0 - pigment) * dst.a * effectiveBase;
      return vec4f(premultResult,newAlpha);
    
}
`;
