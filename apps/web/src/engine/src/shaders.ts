// Per-dab varying parameters (pressure/tilt/opacity/aspect ratio) are
// forwarded from vertex to fragment stage as `varying`s rather than read
// directly as fragment-stage uniforms, so DAB_FRAG below is shared
// unmodified by both the per-dab-uniform path (DAB_VERT, one draw call per
// dab — kept as a fallback for a WebGL1 context without
// ANGLE_instanced_arrays) and the batched path (DAB_VERT_INSTANCED, #123 —
// one instanced draw call per _paintDabs invocation). A varying holding the
// same value at all 3 corners of a triangle (as it does here — DAB_VERT
// assigns it from a uniform, DAB_VERT_INSTANCED from a per-instance
// attribute, neither varies across a_position) interpolates back to that
// exact constant at every fragment; WebGL1/GLSL ES 1.0 has no `flat`
// qualifier, so this is the standard, correct way to carry a per-primitive
// constant into the fragment shader.
export const DAB_VERT = `
  attribute vec2 a_position;

  uniform vec2 u_dabCenter;
  uniform float u_dabRadius;
  uniform float u_angle;
  uniform float u_aspectRatio; // width / height, >1 means wider than tall (tilt effect)
  uniform vec2 u_resolution;
  uniform float u_pressure;
  uniform float u_tiltX;
  uniform float u_tiltY;
  uniform float u_opacity;

  varying vec2 v_localUV;
  varying float v_pressure;
  varying float v_tiltX;
  varying float v_tiltY;
  varying float v_opacity;
  varying float v_aspectRatio;

  void main() {
    v_localUV = a_position * 2.0;
    v_pressure = u_pressure;
    v_tiltX = u_tiltX;
    v_tiltY = u_tiltY;
    v_opacity = u_opacity;
    v_aspectRatio = u_aspectRatio;

    float c = cos(u_angle);
    float s = sin(u_angle);

    // Apply aspect ratio along local X axis (tilt makes pencil mark wider)
    vec2 scaled = vec2(a_position.x * u_aspectRatio, a_position.y);

    vec2 rotated = vec2(
      scaled.x * c - scaled.y * s,
      scaled.x * s + scaled.y * c
    );

    vec2 screenPos = rotated * u_dabRadius * 2.0 + u_dabCenter;
    vec2 clip = (screenPos / u_resolution) * 2.0 - 1.0;
    clip.y = -clip.y;

    gl_Position = vec4(clip, 0.0, 1.0);
  }
`;

// Batched dab vertex shader (#123): identical geometry/math to DAB_VERT,
// but the per-dab parameters that used to be one gl.uniform* call each
// (PER dab, in engine/index.ts's old _paintDabs loop) now arrive as
// per-instance vertex attributes, advanced once per instance via
// ANGLE_instanced_arrays' vertexAttribDivisorANGLE(loc, 1) instead of once
// per vertex — so one drawArraysInstancedANGLE call renders every dab in a
// stroke segment. Packed into 2 vec4 + 1 float (rather than 8 separate
// scalar/vec2 attributes) to stay comfortably within WebGL1's guaranteed
// minimum of 8 vertex attributes (a_position takes one of the 4 used here).
// See engine/index.ts's _paintDabsInstanced for the buffer layout this
// expects (interleaved, stride 9 floats: cx,cy,radius,angle,aspect,
// pressure,tiltX,tiltY,opacity) and for why this preserves the exact
// sequential per-dab blend order the old per-dab loop relied on.
export const DAB_VERT_INSTANCED = `
  attribute vec2 a_position;
  attribute vec4 a_instA; // xy = dabCenter, z = dabRadius, w = angle
  attribute vec4 a_instB; // x = aspectRatio, y = pressure, z = tiltX, w = tiltY
  attribute float a_opacity;

  uniform vec2 u_resolution;

  varying vec2 v_localUV;
  varying float v_pressure;
  varying float v_tiltX;
  varying float v_tiltY;
  varying float v_opacity;
  varying float v_aspectRatio;

  void main() {
    vec2 dabCenter    = a_instA.xy;
    float dabRadius   = a_instA.z;
    float angle       = a_instA.w;
    float aspectRatio = a_instB.x;

    v_localUV = a_position * 2.0;
    v_pressure = a_instB.y;
    v_tiltX = a_instB.z;
    v_tiltY = a_instB.w;
    v_opacity = a_opacity;
    v_aspectRatio = aspectRatio;

    float c = cos(angle);
    float s = sin(angle);

    // Apply aspect ratio along local X axis (tilt makes pencil mark wider)
    vec2 scaled = vec2(a_position.x * aspectRatio, a_position.y);

    vec2 rotated = vec2(
      scaled.x * c - scaled.y * s,
      scaled.x * s + scaled.y * c
    );

    vec2 screenPos = rotated * dabRadius * 2.0 + dabCenter;
    vec2 clip = (screenPos / u_resolution) * 2.0 - 1.0;
    clip.y = -clip.y;

    gl_Position = vec4(clip, 0.0, 1.0);
  }
`;

export const DAB_FRAG = `
  precision highp float;

  uniform sampler2D u_paperHeightMap;
  uniform float u_hardness;
  uniform vec2 u_paperScale;
  // #141: world-space paper sampling. This dab's own local-buffer
  // gl_FragCoord is translated into world space by u_paperOrigin before
  // ever touching the paper texture — (0,0) for a bounded room (world
  // space == canvas-pixel space there, see tileMath.ts) or a tile's own
  // world origin for an infinite room (Y pre-negated by the caller — see
  // _paintDabsUniform/_paintDabsInstanced in engine/index.ts) — so two
  // dabs at the same true world position sample the exact same paper
  // texel regardless of which tile either one happens to land in. Before
  // this, paperUV came from raw gl_FragCoord/u_resolution alone: every
  // tile independently sampled the same [0,1) sub-range of a texture
  // sized to the *screen*, so the grain pattern discontinuously repeated
  // at every tile boundary — the actual bug #141 fixes (a separate,
  // already-fixed compositing rounding bug was #140).
  // u_paperTexSize is the world-space size the paper texture repeats
  // over: for a bounded room this is the canvas's own pixel size, which
  // also happens to be the texture's own resolution (see _initPaper) —
  // with u_paperOrigin always (0,0) there, the formula below reduces to
  // exactly the old screen-space one. For an infinite room this is a
  // fixed world constant (INFINITE_PAPER_WORLD_SIZE) — deliberately not
  // the texture's own pixel resolution; see that constant's comment.
  uniform vec2 u_paperOrigin;
  uniform vec2 u_paperTexSize;
  uniform float u_eraseMode; // 1.0 = eraser, 0.0 = pencil
  // Baked into the accumulation buffer per dab (premultiplied below) so each
  // stroke keeps the color it was drawn with — see u_graphiteColor's removal
  // from DISPLAY_FRAG for why color can no longer live at composite time.
  uniform vec3 u_color;
  // Dev-only graphite-grain A/B (see SettingsPanel's "Graphite grain
  // variant" control, featureFlags.ts's getGraphiteGrainVariant,
  // engine/index.ts's grainMode option): 0 is the real shipped default
  // (computeGrain's own fallback), 1-10 select an experimental candidate.
  // First prototyped as a throwaway HTML canvas comparison — see
  // computeGrain's own comment for what changed porting it in here.
  uniform int u_grainMode;
  // Live-tunable (see PencilEngineAPI.setPaperFillThreshold's own comment)
  // — the pressure smoothstep() lower bound below which a single dab never
  // crushes graphite into the paper's own low spots at all. See its use
  // further down for the full reasoning/tuning history.
  uniform float u_paperFillThreshold;
  // Live-tunable (see PencilEngineAPI.setPaperFillCap) — hard ceiling on
  // how far toward 1.0 (fully flat) a *single* dab's own fill term can ever
  // push paperCatch, regardless of pressure. See u_paperFillThreshold's own
  // comment for why this exists at all.
  uniform float u_paperFillCap;

  varying vec2 v_localUV;
  varying float v_pressure;
  varying float v_tiltX;
  varying float v_tiltY;
  varying float v_opacity;
  varying float v_aspectRatio;

  // Per-fragment dither for the 'grain' term below. Deliberately NOT the
  // classic sin()-based hash (fract(sin(dot(p, big-constants)) * big-
  // constant)) this used to be: 'precision highp float' is a *request* in a
  // WebGL1/GLSL-ES-1.0 fragment shader, not a guarantee — many mobile GPUs
  // silently fall back to mediump there, which lacks the mantissa bits to
  // accurately range-reduce sin()'s argument once dot(p, (127.1,311.7))
  // reaches into the hundreds of thousands (any canvas more than ~1000px
  // wide gets gl_FragCoord values that large). The result on affected
  // hardware wasn't subtle: real cross-device comparison showed this
  // desaturating to salt-and-pepper noise (many pixels jumping all the way
  // to zero deposit) on a tablet GPU while looking fine on desktop, at the
  // exact same stroke. Same fix as paperNoise.ts's own hash — Inigo
  // Quilez's artifact-free hash, built from fract/floor/multiply only, no
  // transcendental functions to lose precision under mediump.
  float hash(vec2 p) {
    p = 17.0 * fract(p * 0.3183099 + vec2(0.11, 0.17));
    return fract(p.x * p.y * (p.x + p.y));
  }

  // Interpolated value noise built on the same portable hash() above — only
  // needed by the experimental grain candidates below (u_grainMode>0); the
  // real shipped default (mode 0) never calls this. No seamless/tiling wrap
  // (unlike paperNoise.ts's own vnoise) — this is live per-fragment, per-
  // dab noise, never baked into a texture that has to repeat.
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // Ten experimental candidates for the mark's own graphite texture —
  // ported from a throwaway HTML canvas comparison (see chat), ranked and
  // picked by eye there before landing here. p is gl_FragCoord.xy (same
  // basis the original mode-0 dither already used); dir is this dab's own
  // tilt direction (falls back to (1,0) when there's no tilt signal, e.g. a
  // mouse) — used only by mode 3's stroke-aligned streaks.
  float computeGrain(vec2 p, float shape, vec2 dir) {
    if (u_grainMode == 1) {
      // Stronger fine noise — same shape as the default, turned up.
      return hash(p * 0.5) * 0.28 - 0.14;
    } else if (u_grainMode == 2) {
      // Blotchy (low-freq): smooth mottled clumps instead of per-pixel speckle.
      return vnoise(p * 0.08) * 0.34 - 0.17;
    } else if (u_grainMode == 3) {
      // Streaky: noise stretched along this dab's own tilt direction.
      float along  =  p.x * dir.x + p.y * dir.y;
      float across = -p.x * dir.y + p.y * dir.x;
      return vnoise(vec2(along * 0.045, across * 0.4)) * 0.3 - 0.15;
    } else if (u_grainMode == 4) {
      // Stipple: jittered dot grid, discrete flecks instead of continuous noise.
      float cell = 3.2;
      vec2 c = floor(p / cell);
      vec2 f = (p / cell) - c - 0.5;
      float r = 0.28 + 0.22 * hash(c);
      return length(f) < r ? 0.22 : -0.05;
    } else if (u_grainMode == 5) {
      // Two-octave layered: blotch + fine dither combined.
      return (vnoise(p * 0.08) * 0.22 - 0.11) + (hash(p * 0.5) * 0.14 - 0.07);
    } else if (u_grainMode == 6) {
      // Edge-emphasized: grain strongest at the dab's own rim, fades toward center.
      float base = hash(p * 0.5) * 0.24 - 0.12;
      return base * (0.4 + 1.2 * (1.0 - shape));
    } else if (u_grainMode == 7) {
      // Posterized speckle: hard on/off flecks, not a smooth dither.
      float h = hash(p * 0.6);
      if (h > 0.85) return -0.32;
      if (h < 0.12) return 0.14;
      return 0.0;
    } else if (u_grainMode == 8) {
      // Fixed-tilt chatter: streaks at a constant ~30 degrees regardless of
      // this dab's own direction — a fixed "wood-grain" bias.
      float a = 0.5235988; // pi/6
      float ca = cos(a), sa = sin(a);
      float along  =  p.x * ca + p.y * sa;
      float across = -p.x * sa + p.y * ca;
      return vnoise(vec2(along * 0.035, across * 0.42)) * 0.32 - 0.16;
    } else if (u_grainMode == 9) {
      // Kitchen sink: blotch + fine dither, edge-emphasis-scaled.
      float blotch = vnoise(p * 0.09) * 0.2 - 0.1;
      float fine = hash(p * 0.5) * 0.14 - 0.07;
      return (blotch + fine) * (0.55 + 1.0 * (1.0 - shape));
    } else if (u_grainMode == 10) {
      // Solid: no stroke-side grain at all — deposit is purely paperCatch-driven.
      return 0.0;
    }
    // 0 (default): the real shipped formula, unchanged.
    return hash(p * 0.5) * 0.12 - 0.06;
  }

  void main() {
    vec2 uv = vec2(v_localUV.x / max(v_aspectRatio, 1.0), v_localUV.y);
    float dist = length(uv);
    if (dist > 1.0) discard;

    float innerEdge = u_hardness * 0.85;
    float shape = 1.0 - smoothstep(innerEdge, 1.0, dist);
    shape *= 1.0 - exp(-8.0 * (1.0 - dist));

    // Eraser: output alpha that drives ZERO,ONE_MINUS_SRC_ALPHA blend to clear graphite
    if (u_eraseMode > 0.5) {
      float eraseAmount = clamp(v_pressure * v_opacity * shape, 0.0, 1.0);
      gl_FragColor = vec4(0.0, 0.0, 0.0, eraseAmount);
      return;
    }

    vec2 paperUV = (gl_FragCoord.xy + u_paperOrigin) / u_paperTexSize * u_paperScale;

    // paperCatch: how much graphite this surface point receives, from the
    // paper's own surface normal. Precomputed at bake time (see
    // paperNoise.ts's paperCatchValue), not derived here from a live
    // texture2D finite-difference the way it used to be — that computation
    // (h - hDx, amplified by up to ~30x total gain before a hard
    // directional threshold) turned out to be exactly the kind of thing
    // GPU floating-point precision differences ruin: a real cross-device
    // comparison (same room, same paper bytes — confirmed byte-identical)
    // showed the stroke's own deposit diverging wildly between a desktop
    // and a tablet GPU, most likely 'precision highp float' silently
    // falling back to mediump on the tablet (an allowed WebGL1/GLSL-ES-1.0
    // fragment-shader fallback) and losing precision in exactly the
    // subtraction this amplification cared about most. Baking the final
    // result once, in plain JS double precision, and reading it back here
    // via a single texture2D removes the GPU from that computation's
    // critical path entirely — see paperCatchValue's own comment for the
    // full reasoning. u_paperHeightMap is LUMINANCE_ALPHA now: .r is the
    // raw height (still used by DISPLAY_FRAG/PAPER_BLEND_FRAG for the
    // blank-paper tint), .a is this precomputed catch value.
    float paperCatch = texture2D(u_paperHeightMap, paperUV).a;

    // Heavy pressure crushes graphite into the paper's own low spots (real
    // pencils do this — press hard enough and the tooth starts filling in)
    // — without this, paperCatch acted as a hard per-pixel ceiling on
    // deposit no amount of pressure/opacity could ever push past, so even a
    // maxed-out stroke left the paper's valleys visibly lighter than its
    // peaks forever.
    //
    // Chasing a single "right" threshold value alone turned out to be the
    // wrong axis to tune: smoothstep(0.9,...) with no ceiling still let one
    // enough-pressure pass go fully flat, and pushing the threshold toward
    // 1.0 to stop that just swung to the opposite failure (0.99 still too
    // easy, 1.0 itself literally unreachable — smoothstep's edges must not
    // be equal). The real fix is u_paperFillCap: a hard ceiling on how far
    // a *single* dab's fill term can ever push effectiveCatch, independent
    // of threshold or pressure — real graphite doesn't fill paper's tooth
    // completely in one stroke no matter how hard you press either; it
    // takes repeated working of the same area. Capped well under 1.0, even
    // pressure pinned at max for an entire pass leaves paperCatch's texture
    // still partially showing through — only the normal "over" accumulation
    // below, across *multiple* overlapping passes, can still get an area
    // genuinely flat over time.
    //
    // With that ceiling in place as the actual safety net, the threshold
    // itself settled (by feel, live-tuned via the debug-overlay sliders —
    // see PencilEngineAPI.setPaperFillThreshold/setPaperFillCap) at 0: not
    // "a pressure gate," just smoothstep(0, 1, pressure) == pressure — the
    // fill term scales continuously with pressure from the very first touch
    // instead of only kicking in past some cutoff, with u_paperFillCap
    // (tuned to 0.25) alone doing the work of keeping any single pass from
    // ever fully flattening the texture. mix(paperCatch, 1.0, fill) -->
    // paperCatch itself, unaffected, at fill=0 (pressure=0).
    float fill = smoothstep(u_paperFillThreshold, 1.0, v_pressure) * u_paperFillCap;
    float effectiveCatch = mix(paperCatch, 1.0, fill);

    float tiltLen = length(vec2(v_tiltX, v_tiltY));
    vec2 dir = tiltLen > 0.001 ? vec2(v_tiltX, v_tiltY) / tiltLen : vec2(1.0, 0.0);
    float grain = computeGrain(gl_FragCoord.xy, shape, dir);
    float deposit = clamp(v_pressure * v_opacity * effectiveCatch * shape + grain * shape, 0.0, 1.0);
    // Premultiplied by deposit, matching the ONE,ONE_MINUS_SRC_ALPHA "over"
    // blend AccumulationBuffer.beginDraw() sets up — this is what lets dabs of
    // different colors composite correctly over each other and over earlier
    // strokes instead of one uniform tint being reapplied to everything.
    gl_FragColor = vec4(u_color * deposit, deposit);
  }
`;

// Растушёвка/smudge (#14, reworked): models the tool as carrying its own
// small graphite reservoir (engine/index.ts's this._smudgeToolLoad) that
// exchanges with the paper at two separate contact points per dab — see
// _paintOneSmudgeDab's own doc comment for the full two-step exchange this
// shader is one half of (the other half is a plain JS scalar, no shader
// involved). This one shader paints EITHER step, picked per draw call by
// u_mode:
//   - pickup (u_mode 0): the tool is drier than the paper at the *source*
//     contact (behind the dab) — lift some graphite off the paper there.
//     Rendered with AccumulationBuffer.beginErase()'s (ZERO, ONE_MINUS_SRC_
//     ALPHA) blend, same as a real eraser dab.
//   - deposit (u_mode 1): the tool is wetter than the paper at a contact
//     point (usually the *destination*, dab.x/y — but also used back at the
//     source when the exchange runs the other way, see _paintOneSmudgeDab)
//     — lay some carried graphite down. Rendered with beginDraw()'s (ONE,
//     ONE_MINUS_SRC_ALPHA) "over" blend, same as a real pencil dab — this is
//     what makes densely-overlapping smudge dabs blend into a continuous
//     stroke instead of a chain of visible circles the way the old mix()-
//     based version did (mix() doesn't accumulate across overlapping dabs
//     the way "over" does).
//
// u_amount is a single JS-computed scalar per draw call (already folding in
// pressure, the configured transfer/deposit rate, and how much the tool's
// own reservoir differed from the paper) — this shader only ever spends it
// through the *same* per-fragment shape/paperCatch weighting DAB_FRAG's own
// pencil dabs use.
//
// paperCatch as a plain multiplier on *pickup* turned out not to be enough
// of a floor by itself: it only slows how fast a spot empties, it doesn't
// stop it — this._smudgeToolLoad resets to empty at the start of every
// stroke (see that field's own comment), so a *fresh* stroke dragged across
// an already-heavily-smudged spot still finds a nonzero difference and
// dutifully picks more of it up, however slowly. Given enough separate
// strokes (not even that many), the whole spot still asymptotes toward
// fully clear — reported after the first round of this redesign shipped: a
// real pencil's dark areas barely lighten under a real blending stump, but
// this tool could still smudge a mark into invisibility.
// u_pickupFloor turns that per-dab *rate* penalty into a per-pixel *ceiling*
// specifically for pickup: paperCatch below the floor contributes ~zero
// pickup no matter how many times or how hard the spot is worked (smoothstep,
// not a hard cliff, so the cutoff itself isn't a visible edge in the
// paper's own grain). Since paperCatch varies texel-to-texel with the
// paper's own grain, this leaves a fixed, position-locked *pattern* of
// never-fully-erasable texels behind a heavily-smudged area, rather than a
// spot fading to nothing — closer to how a real page's tooth keeps a faint
// trace of a mark no amount of blending fully lifts. Deposit keeps plain
// paperCatch (no floor) — the "can't remove everything" problem is specific
// to *removal*, laying graphite into a paper's low spots is already exactly
// what pencil's own effectiveCatch/fill mechanism handles.
export const SMUDGE_TRANSFER_FRAG = `
  precision highp float;

  uniform sampler2D u_paperHeightMap;
  uniform vec2 u_paperScale;
  uniform vec2 u_paperOrigin;
  uniform vec2 u_paperTexSize;
  uniform float u_hardness;
  uniform float u_amount; // JS-computed transfer strength for this contact, 0..1-ish before shape/catch weighting
  uniform float u_mode;   // 0 = pickup (erase-style), 1 = deposit (over-style) — see file comment above
  uniform vec3 u_color;   // carried graphite color, used only when u_mode==1 (see this._smudgeCarriedColor)
  // Pickup-only floor on paperCatch — see this file's own comment above.
  uniform float u_pickupFloor;

  varying vec2 v_localUV;

  void main() {
    // Circular only (v1) — DAB_VERT always sets u_aspectRatio=1/u_angle=0
    // for a smudge dab (see _paintOneSmudgeDab), so v_localUV is already
    // exactly the unit-circle-space DAB_FRAG's own uv would be for a
    // circular dab; no aspect-ratio divide needed here.
    float dist = length(v_localUV);
    if (dist > 1.0) discard;

    float innerEdge = u_hardness * 0.85;
    float shape = 1.0 - smoothstep(innerEdge, 1.0, dist);
    shape *= 1.0 - exp(-8.0 * (1.0 - dist));

    // Same world-space paper sampling DAB_FRAG uses (see its own #141
    // comment) — two dabs at the same true world position must sample the
    // same paper texel regardless of which tile either lands in.
    vec2 paperUV = (gl_FragCoord.xy + u_paperOrigin) / u_paperTexSize * u_paperScale;
    float paperCatch = texture2D(u_paperHeightMap, paperUV).a;

    if (u_mode > 0.5) {
      float amount = clamp(u_amount * shape * paperCatch, 0.0, 1.0);
      // Deposit: premultiplied "over" output, matches DAB_FRAG's own pencil
      // branch exactly (gl_FragColor = vec4(color*deposit, deposit)) so
      // dense overlapping smudge dabs blend the same way overlapping pencil
      // dabs already do.
      gl_FragColor = vec4(u_color * amount, amount);
    } else {
      // Pickup: erase-style output, matches DAB_FRAG's own eraser branch —
      // only the alpha channel is read under the (ZERO, ONE_MINUS_SRC_ALPHA)
      // blend beginErase() sets up. pickupWeight (not plain paperCatch) is
      // what turns this into a real per-pixel ceiling — see this file's own
      // comment above u_pickupFloor.
      float pickupWeight = smoothstep(u_pickupFloor, u_pickupFloor + 0.3, paperCatch);
      float amount = clamp(u_amount * shape * pickupWeight, 0.0, 1.0);
      gl_FragColor = vec4(0.0, 0.0, 0.0, amount);
    }
  }
`;

export const DISPLAY_VERT = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

// Composites one layer onto the composite FBO with opacity.
// Blend mode: ONE, ONE_MINUS_SRC_ALPHA  →  Porter-Duff "over"
// Passes the layer's own premultiplied color through (scaled by opacity)
// rather than discarding it — each layer's accumulation buffer already
// carries the real per-stroke colors baked in by DAB_FRAG.
export const LAYER_COMPOSITE_FRAG = `
  precision mediump float;
  uniform sampler2D u_layer;
  uniform float u_opacity;
  varying vec2 v_uv;
  void main() {
    vec4 c = texture2D(u_layer, v_uv);
    gl_FragColor = vec4(c.rgb * u_opacity, c.a * u_opacity);
  }
`;

// Blits a reference image (#88) into a layer's accumulation buffer, fit-
// centered ("contain") within it — u_imageRect is precomputed in JS (buffer-
// pixel offset/size of the fitted image), so this only has to test whether
// the current buffer pixel falls inside that rect and sample accordingly.
// Uses DISPLAY_VERT (same fullscreen-quad convention as composite/display).
// Outputs premultiplied color, matching every other accumulation-buffer
// writer (DAB_FRAG) so it composites correctly via the same ONE,
// ONE_MINUS_SRC_ALPHA blend AccumulationBuffer.beginDraw() sets up.
export const IMAGE_BLIT_FRAG = `
  precision highp float;
  uniform sampler2D u_image;
  uniform vec2 u_bufferSize;
  uniform vec4 u_imageRect; // offsetX, offsetY, width, height — buffer-pixel space
  varying vec2 v_uv;
  void main() {
    vec2 bufferPx = v_uv * u_bufferSize;
    vec2 imgUV = (bufferPx - u_imageRect.xy) / u_imageRect.zw;
    if (imgUV.x < 0.0 || imgUV.x > 1.0 || imgUV.y < 0.0 || imgUV.y > 1.0) {
      gl_FragColor = vec4(0.0);
      return;
    }
    vec4 texColor = texture2D(u_image, imgUV);
    gl_FragColor = vec4(texColor.rgb * texColor.a, texColor.a);
  }
`;

// Bakes an affine transform (#120) into a layer buffer — used both for a
// committed layer_transform op and its live gizmo-drag preview. Samples
// backward (destination pixel -> source pixel via u_matrixInv, the inverse
// of the requested transform) rather than forward, which is what lets
// scale-up/rotate leave no gaps: every destination texel asks "where did
// this come from" instead of source texels asking "where do I go". Source
// is already premultiplied (every accumulation-buffer writer is — see
// DAB_FRAG/IMAGE_BLIT_FRAG), so this is a pure resample, no
// re-premultiplication. Uses DISPLAY_VERT (same fullscreen-quad convention
// as composite/display/image-blit).
//
// v_uv follows GL's own window-space convention (v_uv.y=0 is the *bottom*
// of the rendered image), but every other buffer-pixel value in this engine
// — Dab.x/y, LayerTransformOperation.matrix, TransformGizmo's bounds — is
// app-space top-down (y=0 at the top), matching clientToCanvas. DAB_VERT
// bridges the same gap the other direction with its `clip.y = -clip.y`
// when placing a dab at an app-space position; this shader needs the
// mirror-image fix since app-space is where u_matrixInv operates (Room
// builds it straight from clientToCanvas points). Skipping this flip
// reproduces correctly for a *symmetric* placement (which is why
// IMAGE_BLIT_FRAG's centered image-import blit never surfaced it) but
// inverts an asymmetric one like an arbitrary drag — exactly the bug
// reported after #120 shipped: horizontal drag looked right, vertical was
// mirrored.
// u_dstSize/u_srcSize (#134 — split from one shared u_bufferSize): the
// destination render target and the source texture aren't always the same
// size — the infinite-canvas final rotate blit reads the padded, bigger
// _assemblyFBO and writes the real, smaller canvas — so dstPx and srcUV
// each need their own buffer's own dimensions to normalize against.  Every
// other caller (gizmo preview, tile-aware transform bake) happens to pass
// matching sizes, which reduces to exactly the old single-u_bufferSize math.
export const TRANSFORM_BLIT_FRAG = `
  precision highp float;
  uniform sampler2D u_source;
  uniform vec2 u_dstSize;
  uniform vec2 u_srcSize;
  uniform mat3 u_matrixInv; // maps destination buffer-px -> source buffer-px, both app-space top-down
  varying vec2 v_uv;
  void main() {
    vec2 dstPx = vec2(v_uv.x, 1.0 - v_uv.y) * u_dstSize;
    vec3 srcPx = u_matrixInv * vec3(dstPx, 1.0);
    vec2 srcUV = vec2(srcPx.x / u_srcSize.x, 1.0 - srcPx.y / u_srcSize.y);
    if (srcUV.x < 0.0 || srcUV.x > 1.0 || srcUV.y < 0.0 || srcUV.y > 1.0) {
      gl_FragColor = vec4(0.0);
      return;
    }
    gl_FragColor = texture2D(u_source, srcUV);
  }
`;

// Transparent-background export variant (#15): unlike DISPLAY_FRAG, this
// never blends toward the paper — it just un-premultiplies the composite
// FBO's stored color (see DISPLAY_FRAG's comment: "composite FBO stores
// premultiplied graphite color in .rgb, coverage in .a") and outputs that
// coverage as the alpha channel itself, so untouched canvas is fully
// transparent instead of opaque paper color. Reuses DISPLAY_VERT (same
// fullscreen-quad convention) and is fed the exact same u_accumulation
// texture (the already-composited _compositeFBO) as DISPLAY_FRAG — no dabs
// or layers are re-rendered for this variant.
export const DISPLAY_TRANSPARENT_FRAG = `
  precision highp float;

  uniform sampler2D u_accumulation;

  varying vec2 v_uv;

  void main() {
    vec4 acc = texture2D(u_accumulation, v_uv);
    float graphite = acc.a;
    vec3 strokeColor = graphite > 0.001 ? acc.rgb / graphite : vec3(0.0);
    gl_FragColor = vec4(strokeColor, graphite);
  }
`;

// #141: this samples the paper map via plain screen UV (v_uv) — fixed,
// screen-locked, so the paper grain neither pans nor zooms with the camera.
// That's exactly right for a bounded room (its whole canvas element is
// itself CSS-panned as one unit — see useViewport — so "screen-locked" and
// "world-locked" are the same thing there) but wrong for an infinite room,
// where the canvas element IS the viewport and never moves. Kept
// unchanged/bounded-only for that reason — infinite rooms use
// PAPER_BLEND_FRAG below instead (see engine/index.ts's _applyPaperBlend/
// _finishPaperBlend), which does the same "paper peeking through" math but
// samples paper via true world position, camera-relative. The two must be
// kept in sync by hand (no #include in GLSL ES1.0/WebGL1) whenever this
// blend's math changes.
export const DISPLAY_FRAG = `
  precision highp float;

  uniform sampler2D u_accumulation;
  uniform sampler2D u_paperMap;
  uniform vec3 u_paperColor;
  uniform vec2 u_paperScale;

  varying vec2 v_uv;

  void main() {
    // composite FBO stores premultiplied graphite color in .rgb, coverage in .a
    vec4 acc = texture2D(u_accumulation, v_uv);
    float graphite = acc.a;
    vec3 strokeColor = graphite > 0.001 ? acc.rgb / graphite : vec3(0.0);

    vec2 paperUV = v_uv * u_paperScale;
    float paperHeight = texture2D(u_paperMap, paperUV).r;

    // Paper color varies slightly with texture (highlights on raised areas).
    // Kept subtle (#95, further softened per follow-up feedback) — real
    // paper grain reads as a faint variation, not a visible bas-relief.
    vec3 paperTone = u_paperColor * (0.965 + 0.03 * paperHeight);

    // Graphite shows paper texture through it — in valleys paper peeks through even in dark areas.
    // Blending toward paperTone (rather than scaling strokeColor toward black) is what actually
    // models "paper peeking through" for any stroke color — a multiplicative darken only looked
    // right for the old fixed dark-graphite tone; on a light/white color it read as gray blotches.
    float graphiteTexture = mix(1.0, paperHeight * 0.5 + 0.2, graphite * 0.25);
    vec3 graphiteTone = mix(paperTone, strokeColor, graphiteTexture);

    // Final composite
    vec3 color = mix(paperTone, graphiteTone, graphite);

    gl_FragColor = vec4(color, 1.0);
  }
`;

// #141: infinite-canvas counterpart to DISPLAY_FRAG's "paper peeking
// through" blend, kept in sync with it by hand (see DISPLAY_FRAG's own
// comment). Runs once per frame, over the *pre-rotation* assembly buffer
// (engine/index.ts's _assemblyFBO — unrotated, zoom-applied, centered on
// the camera's world point) rather than the final rotated canvas-sized
// image DISPLAY_FRAG reads — so recovering this fragment's world position
// only ever needs a translate+scale (u_paperCamera/u_paperExtHalf/
// u_paperInvZoom below), never the camera's rotation: _finishPaperBlend
// applies that separately, afterwards, by rotating this pass's *output*
// down to the screen — mirroring exactly how _finishInfiniteComposite
// rotates the (never paper-blended) raw accumulation buffer
// _displayTransparent() still needs untouched. Reuses DISPLAY_VERT (same
// fullscreen-quad convention as every other composite/display pass).
export const PAPER_BLEND_FRAG = `
  precision highp float;

  uniform sampler2D u_accumulation;
  uniform sampler2D u_paperMap;
  uniform vec3 u_paperColor;
  uniform vec2 u_paperScale;
  uniform vec2 u_paperTexSize;  // world units per paper repeat period — see DAB_FRAG's own comment
  uniform vec2 u_paperCamera;   // world point (wx, wy) at the assembly buffer's center
  uniform vec2 u_paperExtHalf;  // assembly buffer half-size, in px (ext/2, ext/2)
  uniform float u_paperInvZoom; // 1 / camera zoom

  varying vec2 v_uv;

  void main() {
    vec4 acc = texture2D(u_accumulation, v_uv);
    float graphite = acc.a;
    vec3 strokeColor = graphite > 0.001 ? acc.rgb / graphite : vec3(0.0);

    // World position of this fragment — the assembly buffer is unrotated,
    // zoom-applied, and centered on u_paperCamera (see _worldToScreenEdgeX/Y
    // in engine/index.ts for the forward mapping this inverts).
    vec2 local = gl_FragCoord.xy - u_paperExtHalf;
    vec2 worldPos = u_paperCamera + vec2(local.x, -local.y) * u_paperInvZoom;
    vec2 paperUV = worldPos / u_paperTexSize * u_paperScale;
    float paperHeight = texture2D(u_paperMap, paperUV).r;

    vec3 paperTone = u_paperColor * (0.965 + 0.03 * paperHeight);
    float graphiteTexture = mix(1.0, paperHeight * 0.5 + 0.2, graphite * 0.25);
    vec3 graphiteTone = mix(paperTone, strokeColor, graphiteTexture);
    vec3 color = mix(paperTone, graphiteTone, graphite);

    gl_FragColor = vec4(color, 1.0);
  }
`;
