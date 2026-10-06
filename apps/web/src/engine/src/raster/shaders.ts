// PAPER_WORLD_SIZE is imported rather than restated as a GLSL literal
// because the charcoal dropout period below is derived from it: a hand-copied
// number here would drift the moment that constant is retuned, which is
// exactly how DAB_FRAG's finite-difference step went wrong once before (it
// read a world-space size where it needed a texel count). paperNoise is a
// leaf module — no engine internals come with it.
import { PAPER_WORLD_SIZE } from '../paper/paperConstants'
import { PAPER_TONE_AMPLITUDE } from '../paper/paperTone'

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
// #452 (ADR 003 §4): how much bigger than its nominal radius a dab's quad has
// to be drawn so the ink absorbed into the paper *past* the mark's edge has
// somewhere to land. Shared verbatim by both vertex shaders — the two are
// deliberately identical geometry (see DAB_VERT_INSTANCED's own comment), and
// a hand-copied second version of this is exactly the kind of drift that
// makes the batched and fallback paths render differently on the one device
// that lacks ANGLE_instanced_arrays.
//
// The cap is applied here rather than on the CPU because it needs the dab's
// own radius, which the batched path only ever hands over as a per-instance
// attribute — capping against a batch-wide radius instead would over-spread
// every dab in a stroke that varies its width. See linerWickPx() in
// linerPresets.ts for the same rule stated CPU-side (it drives the dirty-rect
// padding, and the two must agree or the halo gets clipped at a tile edge).
const WICK_EXPAND_GLSL = `
  float wickExpand(float radius, float wickPx, float wickCap) {
    float wick = min(wickPx, radius * wickCap);
    return 1.0 + wick / max(radius, 1e-4);
  }
`;

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
  // #452 — see LINER_WICK's own block comment in linerPresets.ts and
  // wickExpand() below. Zero for every tool but the liner, which makes
  // wickExpand() return exactly 1.0 and this whole path a no-op.
  uniform float u_wickPx;
  uniform float u_wickCap;

  varying vec2 v_localUV;
  varying float v_pressure;
  varying float v_tiltX;
  varying float v_tiltY;
  varying float v_opacity;
  varying float v_aspectRatio;
  // #330: the dab's own radius in canvas px, forwarded so the fragment stage
  // can express a distance in *pixels* rather than in normalized dab space.
  // Only the marker's nib-coverage branch reads it.
  varying float v_radius;
  // #452: this dab's wick band, as a fraction of its own radius — so the
  // fragment stage knows where the mark's edge (dist == 1.0) ends and where
  // the absorbed band around it runs out (dist == 1.0 + v_wick). Zero for
  // every tool but the liner.
  varying float v_wick;

${WICK_EXPAND_GLSL}
  void main() {
    float expand = wickExpand(u_dabRadius, u_wickPx, u_wickCap);
    // Scaled by the same expand the geometry below is, so dist == 1.0 keeps
    // meaning "exactly the dab's nominal radius" no matter how far the quad
    // was grown past it — every existing branch of DAB_FRAG reads dist against
    // that meaning.
    v_localUV = a_position * 2.0 * expand;
    v_wick = expand - 1.0;
    v_pressure = u_pressure;
    v_tiltX = u_tiltX;
    v_tiltY = u_tiltY;
    v_opacity = u_opacity;
    v_aspectRatio = u_aspectRatio;
    v_radius = u_dabRadius;

    float c = cos(u_angle);
    float s = sin(u_angle);

    // Apply aspect ratio along local X axis (tilt makes pencil mark wider)
    vec2 scaled = vec2(a_position.x * u_aspectRatio, a_position.y);

    vec2 rotated = vec2(
      scaled.x * c - scaled.y * s,
      scaled.x * s + scaled.y * c
    );

    vec2 screenPos = rotated * u_dabRadius * 2.0 * expand + u_dabCenter;
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
// See dabs/StampPainter.ts's paintInstanced for the buffer layout this
// expects (interleaved, stride 9 floats: cx,cy,radius,angle,aspect,
// pressure,tiltX,tiltY,opacity) and for why this preserves the exact
// sequential per-dab blend order the old per-dab loop relied on.
export const DAB_VERT_INSTANCED = `
  attribute vec2 a_position;
  attribute vec4 a_instA; // xy = dabCenter, z = dabRadius, w = angle
  attribute vec4 a_instB; // x = aspectRatio, y = pressure, z = tiltX, w = tiltY
  attribute float a_opacity;

  uniform vec2 u_resolution;
  uniform float u_wickPx; // #452 — see DAB_VERT's own comment
  uniform float u_wickCap;

  varying vec2 v_localUV;
  varying float v_pressure;
  varying float v_tiltX;
  varying float v_tiltY;
  varying float v_opacity;
  varying float v_aspectRatio;
  varying float v_radius; // #330 — see DAB_VERT's own comment
  varying float v_wick;   // #452 — see DAB_VERT's own comment

${WICK_EXPAND_GLSL}
  void main() {
    vec2 dabCenter    = a_instA.xy;
    float dabRadius   = a_instA.z;
    float angle       = a_instA.w;
    float aspectRatio = a_instB.x;

    float expand = wickExpand(dabRadius, u_wickPx, u_wickCap);

    v_radius = dabRadius;
    v_localUV = a_position * 2.0 * expand;
    v_wick = expand - 1.0;
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

    vec2 screenPos = rotated * dabRadius * 2.0 * expand + dabCenter;
    vec2 clip = (screenPos / u_resolution) * 2.0 - 1.0;
    clip.y = -clip.y;

    gl_Position = vec4(clip, 0.0, 1.0);
  }
`;

// #330 stage 2: the marker ribbon's band geometry (markerRibbon.ts's
// buildRibbonBands). Positions arrive already in tile-local pixels — unlike
// DAB_VERT, there is no centre/radius/angle to apply here, the CPU already
// placed every vertex — and each one carries its own distance to the ribbon's
// nearest outer boundary, in canvas pixels.
//
// That attribute is the whole point of the exercise: coverage comes out of a
// distance measured in *pixels*, so the edge stays the same width whatever the
// brush size, instead of the old normalized-space falloff whose width was a
// fixed fraction of the dab (36-40% of the mark's half-width at any size — see
// docs/marker-edge-problem.md).
/** (#536, #691) The shared noise family, emitted into every shader that needs it.
 *
 *  Extracted because the deposit is written by *two* shaders — the nib stamps
 *  in DAB_FRAG and the ribbon bands in RIBBON_FRAG — and moving the wash's
 *  mottling out of the composite and into the deposit (ADR 011 §17.4) means
 *  both of them have to evaluate the identical field. Two hand-synced copies
 *  would disagree somewhere, and where a stamp and a band disagree the seam
 *  appears at the dab pitch, which is the artifact class this tool has fought
 *  twice already. GLSL ES 1.0 has no #include, so one string and two
 *  interpolations is the enforcement — the same trick paperToneGLSL uses for
 *  the paper tone. */
const WC_NOISE_GLSL = `
  // ── Watercolor fields (#468 v2, ADR 011 §3.5-3.7) ────────────────────────
  //
  // Everything below exists to answer one criticism of v1: the wash was a
  // swept brush footprint filled with an even tone, which is the definition of
  // a marker. v1 had exactly one spatial scale of its own - paper grain, at
  // 1-3px - so the eye read "textured digital brush". These helpers add the
  // two coarser scales a real wash has, and make the mark's own boundary stop
  // coinciding with the brush's path.
  //
  // Value noise interpolates four identical, offline lattice values. The
  // old fract/floor hash diverged across GPUs despite avoiding sin().

  uniform sampler2D u_wcNoiseTex;
  // #691: float fract hashes differ across GPU compilers (including FMA).
  // The lattice itself is baked; only its smooth interpolation remains here.
  float wcLattice(vec2 p) {
    return texture2D(u_wcNoiseTex, (mod(p, 251.0) + 0.5) / 251.0).r;
  }

  // #691: charcoal amplifies the same float-hash error in its grain and
  // dust. A quarter-unit lattice preserves fine per-pixel variation while
  // fetching identical baked values on every GPU.
  float hash(vec2 p) {
    return wcLattice(floor(p * 4.0));
  }

  /** Value noise, one lattice cell per unit of p. */
  float wcNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    // Smoothstep interpolant, so the field has no visible lattice creases.
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = wcLattice(i);
    float b = wcLattice(i + vec2(1.0, 0.0));
    float c = wcLattice(i + vec2(0.0, 1.0));
    float d = wcLattice(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  /** Two octaves, roughly 0..1. The second sits at ~2.7x the frequency and a
   *  deliberately irrational-looking offset, so the two never line up into a
   *  grid. This is what gives one call both the coarse water clouds and the
   *  pigment clumping inside them. */
  float wcFbm(vec2 p) {
    return 0.63 * wcNoise(p) + 0.37 * wcNoise(p * 2.7 + vec2(31.4, 17.9));
  }

  // (#680, s17.79) A pool is not the brush's print made darker. Where the
  // brush left its surplus (the stamp's and band's puddle depth over the
  // film's level - watercolorPuddleFromSurplus: landing, stop, braking), the
  // surplus paint lies in blots: the dose there is multiplied by a coarse
  // field that averages about one statistically (not normalized per mark),
  // so the pool loses the
  // nib's shape - Ilya's "повторяет форму кисти, выглядит стерильно". Off
  // on wet paper, where the puddle depth is the paper's water, not a pool.
  // (#680, s17.84) The pool share a coverage pass records in its .g (over
  // .a): where the brush left its surplus - the same gate as wcPoolBlot's.
  // The settle combs the paint there along the travel (field-op mode 1).
  float wcPoolness(float puddle, float paperWet, float on) {
    return on * smoothstep(0.5, 0.95, puddle) * (1.0 - clamp(paperWet, 0.0, 1.0));
  }
  float wcPoolBlot(vec2 wp, vec2 seed, float puddle, float paperWet, float on) {
    // puddle carries the surplus fraction on ink/depth draws, independent
    // of standing water; multiplying the full dose preserves its body.
    float pool = on * clamp(puddle, 0.0, 1.0);
    if (pool <= 0.0) return 1.0;
    float n = wcFbm(wp * 0.03 + seed * 1.7 + vec2(13.0, 5.0));
    return mix(1.0, 0.4 + 1.2 * smoothstep(0.3, 0.7, n), pool);
  }
float wcFilmBlot(vec2 wp, vec2 seed, float puddle, float paperWet, float on, float brushWater, float pigmentOn) {
    if (pigmentOn < 0.5) return wcPoolBlot(wp, seed, puddle, paperWet, on);
    float pool = on * clamp(max(puddle, 0.0 * clamp(brushWater, 0.0, 1.0) * (1.0 - clamp(paperWet, 0.0, 1.0))), 0.0, 1.0);
    if (pool <= 0.0) return 1.0;
    float n = wcFbm(wp * 0.055 + seed * 1.7 + vec2(13.0, 5.0));
    return 1.0 + pool * 0.85 * (2.0 * smoothstep(0.3, 0.7, n) - 1.0);
}


  // (#536, ADR 011 §17.4) The wash's own coarse unevenness — where the water
  // pooled, where the brush unloaded — applied where the paint is **laid**
  // rather than where it is shown.
  //
  // This is the whole of the fix Ilya's verdict forced: "эта текстура
  // независимо ни от чего лежит на холсте, сколько сверху ни крась, она всё
  // равно остаётся". As a multiplier in the composite it could not be
  // otherwise, because the composite *recomputes* the mark from position — the
  // field at a place is the same number forever, so no amount of painting can
  // change it, and it is not the paint's texture at all but the paper's.
  //
  // Written into the deposit, it becomes a property of the paint that is
  // actually there. A second pass brings its own field and the two add, and
  // the sum of two independent unevennesses is flatter than either — which is
  // "выровнять тон повторным проходом", arriving by itself rather than as a
  // separate levelling mechanism. It is also the only form in which the field
  // *can* be per-stroke: the composite is one pass over a whole wash, so a
  // per-stroke seed is inexpressible there.
  //
  // The seed is derived from the stroke's own recorded id, so the live mark and
  // its replay draw the identical field, and two strokes over one spot draw
  // different ones.
  float wcCloud(vec2 wp, vec2 seed, float amount) {
    if (amount <= 0.0) return 1.0;
    return 1.0 + amount * (wcFbm(wp * 0.018 + seed) - 0.5) * 2.0;
  }

  // (#536) The pigment settling out of *this* pass, at the scale a wash grains
  // at. Split from the paper's own preference, which stays in the composite:
  // the pits are where they are and every pass finds the same ones, but how
  // much of a given suspension happens to settle into them is an event, not a
  // property of the sheet.
  //
  // Getting that split wrong is what produced the sheet Ilya photographed —
  // white blotches over the whole page, identical however many passes went
  // over them, because the whole field was a function of position evaluated at
  // display time, and with the wash window at twenty-five seconds the whole
  // page was one wash and therefore one field.
  //
  // The hard split (halve below the threshold, amplify above) is kept: it is
  // what makes the mark break into patches that grain and patches that do not,
  // rather than an even dither, and it is the part borrowed from Writing on
  // Water.
  float wcSettling(vec2 wp, vec2 seed, float amount) {
    if (amount <= 0.0) return 1.0;
    float n = wcFbm(wp * 0.11 + seed + vec2(19.0, 71.0)) - 0.5;
    n = n < 0.05 ? n * 0.5 : n * 1.6;
    return max(1.0 + amount * n * 2.0, 0.0);
  }

  // (#536, ADR 011 s17.13) How much the brush's hairs swing the delivery per
  // hair, from the brush's CURRENT water - after the clocks and after
  // whatever it drank from the paper, so a dry brush enters a puddle with
  // its hairs showing and is smooth a few dabs in, and a loaded one lays an
  // even film from the first dab. Not paper wetness directly: the paper does
  // not wet the hairs until they have picked it up (see watercolorWaterClock).
  // Was the other way round in the composite - hairs strongest on a WET mark,
  // gated off by dryness - which is what drew the crayon rings over a
  // dissolved dot and left a dry brush with none.
  //
  // The shape is a COMB with gaps, not a ripple: at a dry brush the hairs are
  // separate tracks with bare paper between them ("на бумаге реально видно
  // линии щетинок"), so the field is thresholded to tracks and gaps and the
  // amount goes to nothing between hairs. Doubled so the mean delivery is
  // unchanged - the comb redistributes the dose across the hairs, it does
  // not add or remove any. wcHairAmp is how far toward that comb the brush
  // is; wet, none at all.
  // (#536, s17.21) How much of a dab's delivered water stands on the sheet,
  // by the brush's LOAD - its water at the dab over the nominal mix: the
  // whole film above HI, none at the floor. The CPU twin,
  // watercolorStandingGate, feeds the live wetness field the same number.
  const float WC_STANDING_LO = 0.04;
  const float WC_STANDING_HI = 0.35;
  float wcStandingGate(float brushWater, float washWater) {
    return smoothstep(WC_STANDING_LO, WC_STANDING_HI, brushWater / max(washWater, 1e-4));
  }
  const float WC_HAIR_WET_LO = 0.25;
  const float WC_HAIR_WET_HI = 0.75;
  float wcHairAmp(float bristleInk, float brushWater) {
    return min(1.0, bristleInk * 1.6) * (1.0 - smoothstep(WC_HAIR_WET_LO, WC_HAIR_WET_HI, brushWater));
  }
  float wcHairComb(float hair, float amp) {
    return mix(1.0, 2.0 * smoothstep(0.3, 0.7, hair), amp);
  }
  // (#536, s17.20) WHICH hair is under this texel: a field over the across-
  // brush coordinate (scaled to the bundle count, so a hair is a fixed place
  // in the brush) and a slow drift with world position, so the hairs gather
  // and separate as a real brush's do rather than staying a rigid comb.
  // Slow: the drift used to move through three full periods every 125 world
  // px, so the pattern re-dealt itself every forty pixels and thick hairs
  // popped in and out along a long line - "как будто в процессе кисть
  // меняется". One place for the ink pass and the composite's contact break,
  // so both count the same hair.
  const float WC_HAIR_DRIFT_SCALE = 0.0012;
  const float WC_HAIR_DRIFT_GAIN = 0.9;
  float wcHairField(float across, float combs, vec2 wp) {
    float drift = wcFbm(wp * WC_HAIR_DRIFT_SCALE + vec2(71.0, 13.0));
    return wcFbm(vec2(across * combs, drift * WC_HAIR_DRIFT_GAIN) + vec2(3.0, 29.0));
  }
  // #680: sparse openings in the loaded tip; less pressure separates bundles.
  // Same contact for water, pigment and silhouette, in stamps and bands.
  float wcTipPressure(float pressure, float radius) {
    // Same resolution floor as markerRibbon.ts, without changing real pressure.
    if (pressure <= 0.0) return 0.0;
    return max(pressure, 0.06 * (1.0 - smoothstep(1.0, 2.0, radius)));
  }
  float wcTipContact(float across, float combs, vec2 wp, float pressure) {
    if (combs <= 0.0) return 1.0;
    float hair = wcHairField(across, combs, wp);
    float light = 1.0 - smoothstep(0.12, 0.70, pressure);
    float release = 1.0 - smoothstep(0.012, 0.060, pressure);
    float threshold = mix(mix(0.34, 0.39, light), 0.62, release);
    float opening = smoothstep(0.55, 0.72, wcNoise(wp * 0.009 + vec2(37.0, 91.0)));
    float contact = mix(1.0, smoothstep(threshold - 0.02, threshold + 0.02, hair), max(opening, release));
    return contact * smoothstep(0.0, 0.012, pressure);
  }

`;

export const RIBBON_VERT = `
  attribute vec2 a_position;
  attribute float a_edge;
  // How much ink the segment this vertex belongs to deposits — already
  // distance-normalized by the CPU (dab.opacity * segmentLength). Ignored by
  // the coverage pass.
  attribute float a_ink;
  // (#468 v6) The same deposit, weighted by how wet the brush was over *this
  // segment*. Per vertex and not a uniform — see markerRibbon.ts's
  // FLOATS_PER_VERTEX for the bug that forced it there. 0 for every tool
  // without a water model, which leaves the channel it feeds unread.
  attribute float a_inkWater;
  // (#536) Where across the brush this vertex is: -1 at one tangent line, 0 on
  // the centre line, +1 at the other. A *hair* lives at a fixed value of this
  // for the whole gesture, which is what separates a brush with hair from a
  // noise field the brush drives over — see markerRibbon.ts's own note.
  attribute float a_across;
  // (#536) The same deposit weighted by how wet the paper under this segment
  // already was — the brush's water and the paper's are two quantities, and
  // the composite has to be able to tell them apart per pixel.
  attribute float a_inkWet;
  attribute float a_inkStrength;
  attribute vec3 a_contact; // water pool, pressure, pigment pool (one slot)

  uniform vec2 u_resolution;

  varying float v_edge;
  varying float v_ink;
  varying float v_inkWater;
  varying float v_across;
  varying float v_inkWet;
  varying float v_puddle;
  varying float v_tipPressure;
  varying float v_pigmentPool;
  varying float v_inkStrength;

  void main() {
    v_edge = a_edge;
    v_ink = a_ink;
    v_inkWater = a_inkWater;
    v_across = a_across;
    v_inkWet = a_inkWet;
    v_inkStrength = a_inkStrength;
    v_puddle = a_contact.x;
    v_tipPressure = a_contact.y;
    v_pigmentPool = a_contact.z;
    // #691: skinny ribbon triangles may straddle a hardware subpixel tie.
    // Use the same binary grid before the GPU's own rasterization. The
    // maximum displacement is 1/128px, below the existing 1px AA ramp.
    vec2 position = floor(a_position * 64.0 + 0.5) / 64.0;
    vec2 clip = (position / u_resolution) * 2.0 - 1.0;
    clip.y = -clip.y;
    gl_Position = vec4(clip, 0.0, 1.0);
  }
`;

export const RIBBON_FRAG = `
  precision highp float;

  uniform float u_aaPx;
  // 0 = silhouette (coverage), 1 = ink deposit. The ribbon is drawn twice with
  // identical geometry, which is the whole point (#330 follow-up): the mark's
  // shape and its pigment must come from the same figure. Depositing ink only
  // at the sample stamps while the silhouette came from the ribbon left the
  // regions between stamps fully opaque but *unpainted* — the composite
  // multiplies an ink load of zero, i.e. leaves the paper showing through, so a
  // turn came out bitten by rounded white notches.
  uniform float u_mode;
  uniform vec2 u_resolution;
  uniform sampler2D u_availableWater;
  uniform float u_useAvailableWater;
  /** Available water into coverage .b, premultiplied by contact coverage.
   *  Brush water and preceding paper water use the same scale. Poolness
   *  remains in .g; it must not reduce the solvent that pigment can enter. */
  uniform float u_washWater;
  uniform float u_waterRetain;
  /** (#536, s17.13) The brush's hairs, laid into the DEPOSIT. Bundles across
   *  the mark (the count DAB_FRAG's composite also uses for the contact
   *  break) and the delivery swing per hair at a dry brush. See wcHairAmp. */
  uniform float u_bristleCombs;
  uniform float u_bristleInk;
  /** (#536, s17.19) Ink mode, second target: write the OPTICAL DEPTH of the
   *  paint this band lays rather than its deposit - mass x u_tau per channel,
   *  scaled by WC_DEPTH_SCALE into eight bits, mass itself in .a. The same
   *  amount as the deposit pass, so depth and deposit agree texel by texel;
   *  see pigmentOptics.ts. */
  uniform float u_depthWrite;
  uniform vec3 u_tau;
  const float WC_DEPTH_SCALE = 4.0;

  varying float v_edge;
  varying float v_ink;
  varying float v_inkWater;
  varying float v_across;
  varying float v_inkWet;
  varying float v_puddle;
  varying float v_tipPressure;
  varying float v_pigmentPool;
  varying float v_inkStrength;

  // (#536) The band half of the deposited mottling. The world origin has to be
  // handed in because a band is drawn into a tile-sized scratch buffer and
  // gl_FragCoord alone says nothing about where on the sheet that is — the same
  // reason DAB_FRAG carries u_paperOrigin (#141).
  uniform vec2 u_worldOrigin;
  uniform vec2 u_mottleSeed;
  uniform float u_cloudDeposit;
  uniform float u_granDeposit;
  // (#680, s17.79) 1 for the watercolor's ink passes only - see wcPoolBlot.
  uniform float u_poolBlot;

${WC_NOISE_GLSL}

  void main() {
    // Inset ramp: coverage reaches 0 exactly *at* the geometric boundary and
    // 1.0 one u_aaPx inside it, rather than straddling the boundary. Keeps
    // every fragment this shader needs inside the geometry the CPU emitted (a
    // centred ramp would need the band widened by half a pixel on each side),
    // and matches the identical convention in DAB_FRAG's own nib branch so the
    // two primitives agree where they meet.
    float cov = clamp(v_edge / u_aaPx, 0.0, 1.0);
    if (cov <= 0.0) discard;
    // (#536) Ink only: the mottling is a property of how much paint landed, not
    // of where the mark's silhouette is.
    vec2 mottleWp = gl_FragCoord.xy + u_worldOrigin;
    vec4 available = texture2D(u_availableWater, gl_FragCoord.xy / u_resolution);
    float availableWet = u_useAvailableWater > 0.5
      ? clamp(available.b / max(available.a, 0.002), 0.0, 1.0)
      : (v_ink > 5e-7 ? v_inkWet / v_ink : 0.0);
    float mottle = u_mode > 0.5
      ? wcCloud(mottleWp, u_mottleSeed, u_cloudDeposit)
        * wcSettling(mottleWp, u_mottleSeed, u_granDeposit)
        * wcFilmBlot(mottleWp, u_mottleSeed, v_pigmentPool, availableWet, u_poolBlot, v_ink > 5e-7 ? clamp(v_inkWater / v_ink, 0.0, 1.0) : 0.0, step(5e-7, abs(v_inkStrength)))
      : 1.0;
    float tip = wcTipContact(v_across, u_bristleCombs, mottleWp, v_tipPressure);
    float amount = (u_mode > 0.5 ? cov * v_ink * mottle : cov) * tip;
    // (#468 v4) Same two-channel deposit the nib stamps write: .a is how much
    // paint landed, .rgb the same amount weighted by how wet the brush was, so
    // the composite can recover a per-pixel water level. One value for the
    // whole batch here rather than per band - a batch is a handful of dabs and
    // water barely moves across it, while the stamps carry their own per-dab
    // values and overlap the bands almost everywhere.
    // .a is how much paint landed; .rgb the same amount weighted by how wet the
    // brush was over *this particular segment*, so the composite can recover a
    // per-pixel water level. As a uniform this made the finished mark depend on
    // how the stroke happened to be cut into pointer events — a live stroke and
    // a replay of it disagreed over a quarter of the mark, and a reload
    // visibly redrew it.
    // (#536) The coverage buffer's .r now carries the brush's across-coordinate,
    // remapped to 0..1 and premultiplied by coverage the same way "over"
    // blending expects, so the composite recovers it as .r/.a. It is free real
    // estate: in coverage mode all three colour channels held a copy of alpha
    // and nothing ever read them. .g keeps that copy so anything that did is
    // unaffected; .b (#536, s17.11) is the standing water here - the free
    // water of a clean pass, or the wetness a pigment pass recorded under
    // itself - the record the diffusion pass gates on. See u_washWater.
    //
    // Premultiplied "over" means overlapping passes blend toward whichever drew
    // last where it covered fully, which is the physically right answer: the
    // last pass of the brush over a spot is the one whose hairs you see.
    float acrossEncoded = v_across * 0.5 + 0.5;
    // (#536, s17.20) v_inkWater and v_inkWet are the band's dose WEIGHTED by
    // its water and by the paper's wetness (markerRibbon.ts packs ink*water,
    // so that the ink pass can lay deposit-weighted sums); the plain values
    // are those over the dose. Used as if they were plain, they were a
    // hundredth of themselves: the standing water a band recorded was nothing,
    // so a stroke's own puddle existed only in the caps its stamps left
    // uncovered - a row of crescents, "зубья в лужах" - and the hair comb
    // read every band as bone dry.
    float bandWater = v_ink > 5e-7 ? clamp(v_inkWater / v_ink, 0.0, 1.0) : 0.0;
    float bandWet = clamp(availableWet, 0.0, 1.0);
    // (#536, s17.13) The hairs vary the delivery, here, into the deposit -
    // see wcHairAmp. The across coordinate is this band's own, so a hair is
    // a fixed place in the brush and its streak follows the brush round a
    // curve, exactly as the composite's contact break indexes it.
    if (u_mode > 0.5 && u_bristleInk > 0.0) {
      float hair = wcHairField(v_across, u_bristleCombs, mottleWp);
      amount *= wcHairComb(hair, wcHairAmp(u_bristleInk, bandWater));
    }
    // Ink: .r brush water, .g paper wetness, both deposit-weighted so the
    // composite recovers a per-pixel mean of each by dividing by .a.
    gl_FragColor = u_mode > 0.5
      ? (u_depthWrite > 0.5
          ? vec4(amount * (abs(v_inkStrength) / max(v_ink, 5e-7)) * u_tau / WC_DEPTH_SCALE, amount * (abs(v_inkStrength) / max(v_ink, 5e-7)))
          : vec4(amount * bandWater, amount * bandWet, amount * (abs(v_inkStrength) / max(v_ink, 5e-7)), amount))
      : vec4(acrossEncoded * amount, amount * wcPoolness(v_puddle, bandWet, u_poolBlot) * step(0.0, v_inkStrength), amount * max(bandWet, u_washWater * mix(u_waterRetain, 1.0, bandWet) * wcStandingGate(bandWater, u_washWater)), amount);
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
  // StampPainter's paintUniform/paintInstanced) — so two
  // dabs at the same true world position sample the exact same paper
  // texel regardless of which tile either one happens to land in. Before
  // this, paperUV came from raw gl_FragCoord/u_resolution alone: every
  // tile independently sampled the same [0,1) sub-range of a texture
  // sized to the *screen*, so the grain pattern discontinuously repeated
  // at every tile boundary — the actual bug #141 fixes (a separate,
  // already-fixed compositing rounding bug was #140).
  // u_paperTexSize is the world-space size the paper texture repeats
  // over: for a bounded room this is the canvas's own pixel size, which
  // also happens to be the texture's own resolution (see PaperState.load) —
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
  // 1.0 = fineliner (#241/#242, ADR 003), 2.0 = marker composite (#250, ADR
  // 004 §3), 3.0 = marker coverage-splat, 4.0 = marker inkLoad-splat
  // ("Ревизия v1.5" — see u_inkLoad's own comment), 5.0 = charcoal (#304,
  // ADR 005), 0.0 = every other tool (unchanged graphite path below). A
  // separate mode flag rather than
  // folding into u_eraseMode/u_grainMode: those two are about *how much*
  // deposit or *which* dither variant, this is a completely different
  // deposit formula per value — see the branches below, right after the
  // erase branch. Each branch checks a "> threshold" band (not "==") for
  // the same float-equality-is-fragile reason every other threshold in
  // this shader is a smoothstep/comparison band, not an exact match —
  // ordered highest-value-first since these are independent if/return
  // checks, not an else-if chain.
  uniform float u_inkMode;
  // (#536, ADR 011 §17.62) 1 while a ribbon composite draws its rect: the quad
  // is the whole rect, and the dab ellipse below must not cut its corners.
  // Every other draw through this program leaves it 0.
  uniform float u_rectComposite;
  // Charcoal only (#304, ADR 005 §4-6) — the per-type fields graphite
  // has no equivalent for, straight off CHARCOAL_PRESETS (charcoalPresets.ts).
  // Plain uniforms rather than per-instance attributes: they're properties of
  // the *preset*, constant for a whole stroke, so they don't need to ride the
  // instance buffer the way per-dab pressure/opacity do. Left at 0 by every
  // non-charcoal draw, and never read outside the u_inkMode>4.5 branch.
  uniform float u_charcoalTooth;
  uniform float u_charcoalCrumble;
  uniform float u_charcoalDust;
  // #305: the tilt curve's own top aspect (CHARCOAL_FEEL.aspectMax, the ladder's
  // broadAspect before #403 flattened the plateaus into one curve) and how
  // much extra grain the broad side shows. Together with v_aspectRatio — which
  // every dab already carries — these let this branch recover "how far onto its
  // broad side is the stick right now" without a new per-dab attribute, and
  // without duplicating the response's own parameters in GLSL where a live
  // slider change could no longer reach them.
  uniform float u_charcoalBroadAspect;
  uniform float u_charcoalBroadGrain;
  // Charcoal's own pressure response (CHARCOAL_FEEL.pressureFloor/Gamma) —
  // charcoal transfers far more readily than graphite, so its deposit must not
  // be linear in pressure the way the graphite branch below is.
  uniform float u_charcoalPressFloor;
  uniform float u_charcoalPressGamma;
  // Smallest share of deposit a skipped/dropped-out spot still receives
  // (CHARCOAL_FEEL.skipFloor). Above 0 by design — see the presence term below
  // for why a hard zero made whole-sheet coverage impossible.
  uniform float u_charcoalSkipFloor;
  // How strongly pressure closes the dropout gaps (CHARCOAL_FEEL.gateRelief).
  // 0 = pressure has no effect on skipping; 1 = a full-pressure pass never
  // skips at all.
  uniform float u_charcoalGateRelief;
  // Depth of the mark-grain modulation (CHARCOAL_FEEL.grainDepth). Deep enough
  // that the selected variant's structure reads as real breaks in the stroke,
  // rather than as a faint dither — see the grainMul term below.
  uniform float u_charcoalGrainDepth;
  // Marker only, redesigned in a follow-up to #250 (see engine/index.ts's
  // RibbonStrokeScratch for the full story of *why*): this tile's own
  // content exactly as it was before this stroke started touching it,
  // frozen once and never updated again for the rest of the stroke —
  // reading it here instead of the tile's *current* (already partly
  // marker-modified) content is what stops overlapping dabs within one
  // stroke from re-multiplying an already-darkened result over and over
  // (multiply has no natural ceiling the way normal "over" accumulation
  // does, so that used to compound into visible banding/chevrons at every
  // dab overlap). Same size and 1:1 pixel alignment as the tile this draws
  // into (see u_resolution below), so no patch-relative origin/size
  // uniforms are needed the way an earlier version of this needed for a
  // small per-dab copy — plain gl_FragCoord/u_resolution mapping.
  uniform sampler2D u_original;
  // This stroke's own accumulated coverage at each pixel so far — a plain
  // saturating "over" splat (u_inkMode>2.5 branch below), painted by
  // engine/index.ts's _drawRibbonCompositeDab *before* this draw call, using
  // the exact same dab quad this draw call itself uses. Reading the
  // *accumulated* value here (rather than recomputing this one dab's own
  // shape*opacity) is what makes densely-overlapping dabs converge to one
  // smooth flat coverage instead of compounding — see u_original's own
  // comment above for the full story.
  uniform sampler2D u_strokeCoverage;
  // ADR 004 "Ревизия v1.5": how much ink this stroke has actually deposited
  // at each pixel, distance-normalized (engine/index.ts computes each dab's
  // own contribution as dab.opacity * segmentLength, not a flat per-dab
  // amount — see _ribbonStrokeWork) and accumulated *additively*
  // (AccumulationBuffer.beginAdditiveDraw — no per-accumulation ceiling,
  // unlike u_strokeCoverage's saturating splat). Separating this from
  // u_strokeCoverage is what lets scribbling back and forth over an
  // already-fully-covered spot keep darkening it instead of the coverage
  // ceiling silently capping darkness too (u_strokeCoverage still governs
  // the stroke's silhouette/alpha; this governs how dark the color mix
  // goes — see the composite branch below).
  uniform sampler2D u_inkLoad;
  /** (#536, s17.19) The wash's optical depth per texel - see RIBBON_FRAG's
   *  u_depthWrite. Read by the composite for the paint's own colour. */
  uniform sampler2D u_inkColor;
  uniform float u_depthWrite;
  uniform vec3 u_tau;
  const float WC_DEPTH_SCALE = 4.0;
  // Every _dabProg draw already sets this (see engine/index.ts's own
  // _drawRibbonCompositeDab/_drawRibbonCompositeDab and every other caller)
  // — declared here too so this fragment shader can read it back for the
  // u_original/u_strokeCoverage/u_inkLoad gl_FragCoord mapping above.
  uniform vec2 u_resolution;
  // #330 stage 2: width of the marker's edge ramp, in canvas pixels. Shared
  // with RIBBON_FRAG so the nib stamps and the bands between them resolve their
  // shared boundary identically.
  uniform float u_aaPx;
  // #330 stage 3 — 0 = elliptical nib (bullet), 1 = rounded rectangle (chisel),
  // with u_nibCorner the corner radius in canvas px. Only the marker's two
  // geometric branches read either.
  uniform float u_nibShape;
  uniform float u_nibCorner;
  // (#536) The direction across the brush's travel, expressed in this nib's own
  // local axes and unit length. Per dab, because a stroke turns: the stamps
  // have to agree with the bands about which way "across" points, or the comb
  // would soften at every stamp and read as a ripple at the dab pitch — the
  // exact artifact class the cone deposit was introduced to kill (u_inkMode=6's
  // own note). (0,1) for anything that does not set it, which for a round nib
  // whose angle follows the path is already the right answer.
  uniform vec2 u_acrossLocal;
  // (#536) How wet the paper under this dab already was, 0..1 — read from what
  // the stroke recorded, never from a live field, so replay reproduces it.
  uniform float u_paperWet;
  /** (#536, s17.11/13) See RIBBON_FRAG's u_washWater and u_waterRetain -
   *  the coverage stamp's .b, from these and u_paperWet the same way. */
  uniform float u_washWater;
  // (s17.27) How deep the water stands under this stamp - see markerRibbon.ts.
  uniform float u_puddle;
  // (#680, s17.79) 1 for the watercolor's ink stamps only - see wcPoolBlot.
  uniform float u_poolBlot;
  uniform float u_waterRetain;
  // (#536) How strong the paint in the brush was for this dab — the pigment
  // slider, resolved per stroke. Rides the deposit for the reason
  // markerRibbon.ts's FLOATS_PER_VERTEX spells out: one wash, several strokes,
  // and they are allowed to disagree about it.
  uniform float u_inkStrength;
  // (#536) The wash's coarse mottling, now laid down with the paint rather than
  // multiplied over it at display time — see wcCloud. Seed per stroke.
  uniform float u_cloudDeposit;
  uniform float u_granDeposit;
  uniform vec2 u_mottleSeed;
  // (#536) The hair comb: how many bundles lie across the brush, and how
  // unevenly they deliver pigment as a fraction either side of the mean.
  //
  // Uniforms rather than constants because the count is resolved from the
  // brush being held, not from a shipping number: a hair is a fixed few pixels
  // wide, so a wider brush carries more of them (WATERCOLOR_BRISTLE_BUNDLE_PX).
  // The depth is on the profile (RibbonProfile.bristleInk).
  //
  // There was a dev flag here that replaced the count with a fixed caricature
  // of about thirty bundles, to settle whether the *spatial organisation* read
  // as hair at all before anyone touched the amplitude again. It answered its
  // question and was then removed, because a size-blind override of the very
  // number that has to scale with the brush is a trap: left on, it put fifty-six
  // half-pixel bundles across a 30 px mark and looked exactly like the bug it
  // was meant to diagnose.
  uniform float u_bristleCombs;
  uniform float u_bristleInk;
  // (#536) 0 = paint normally; 1 = show the silhouette; 2 = show the density.
  uniform float u_wcDebugView;
  // #330 stage 3 — how much less ink lands at the nib's rim than at its centre
  // (MARKER_INK_EDGE_FALLOFF). Read only by the ribbon's ink pass.
  uniform float u_inkEdge;
  /** (#536) 1 = this ink stamp lands only where the wash already has coverage,
   *  scaled by that coverage. The halo of a wet-in-wet dab: pigment carried by
   *  standing water goes as far as the water and no further, and the water is
   *  the wash's own silhouette - so a halo can never leave the puddle. Read with
   *  u_strokeCoverage bound to the wash's coverage buffer (see
   *  _drawRibbonNibPass's clipTo); 0 for every ordinary stamp. */
  uniform float u_inkClip;
  // #454 (ADR 009 §8) — how strongly the paper's grain acts on a ribbon tool's
  // *rim*, as a fraction of the edge ramp. 0 for every draw that isn't one of
  // the two branches below, which makes their terms vanish identically.
  //
  // Read in opposite directions by the two, on purpose and not by accident:
  // the brush pen (u_inkMode=8) wicks ink *outward* into the absorbent low
  // spots, watercolor (u_inkMode=9) lets them eat *inward*. See
  // RibbonProfile.paperRim for why they disagree and which one is newer.
  uniform float u_paperRim;
  // Watercolor only (#468, ADR 011 §3). All four are read by the u_inkMode=9
  // branch alone and left at 0 by every other draw through this program, so
  // each term below vanishes identically rather than merely rounding away.
  //
  // u_wetEdge doubles as this tool's settle flag, and that is deliberate rather
  // than a saved uniform: the wet edge is a property of the *finished* wash
  // silhouette, so it must not be baked by a batch painted while the stroke is
  // still growing. The engine passes 0 for every live batch composite and the
  // profile's real gain only for the one deferred pass that runs over the whole
  // stroke's bounds at pen-up (see _settleRibbonStroke). A branch reading 0
  // therefore *is* the "still wet" state, not an approximation of it.
  uniform float u_wetEdge;
  uniform float u_wetEdgeRadiusPx;
  uniform float u_granulation;
  uniform float u_saturateInk;
  // #468 v2 — how far, in canvas px, the wash may travel past the place the
  // brush actually touched, before the per-place irregularity below is applied
  // (ADR 011 §3.5). Like u_wetEdge this is nonzero only on the deferred settle
  // pass, and for the same reason: it rewrites the mark's silhouette, which is
  // not known until the stroke is finished.
  uniform float u_spreadPx;
  // #468 v2 — depth of the low-frequency pigment/water field (ADR 011 §3.6).
  // Unlike the two above this runs on every batch: it is a per-place value
  // that owes nothing to the finished silhouette, so deferring it would only
  // make the wash visibly change tone at pen-up for no gain.
  uniform float u_cloud;
  // #468 v2 — per-stroke decorrelation offset for every field in this branch,
  // derived from the gesture's own first dab (engine's _settleRibbonStroke).
  // Without it two washes laid over the same patch of canvas would get
  // identical mottling and their overlap would look stamped rather than
  // stacked. Derived from the operation's own data, so every participant
  // computes the same offset — never a random seed.
  uniform vec2 u_fieldOffset;
  // Watercolor v4 (#468, ADR 011 §4). u_inkWater is written by the ink pass,
  // not read by it: the deposit texture's .a carries how much paint landed and
  // its .rgb carry that same amount weighted by how wet the brush was at the
  // time, so the composite recovers a per-pixel water level as r/a — a proper
  // deposit-weighted average over every dab that touched the spot. That is what
  // lets a single stroke start wet and end dry *within one mark*, which no
  // per-batch uniform could express.
  uniform float u_inkWater;
  // Nominal water for this batch, used where there is no deposit to divide by
  // (the spread fringe lies outside the mark, so its inkLoad is ~0).
  uniform float u_water;
  // How hard the paper's relief breaks the contact at zero water, and the band
  // the tideline's gating field is thresholded against. See RibbonProfile.
  uniform float u_dryContact;
  // #468 v8, ADR 011 §8 — how softly the boundary resolves, and how far it may
  // wander off the brush's own outline. Both are water's numbers, and both used
  // to be picked by noise out of a fixed wide range regardless of the mix.
  //
  // That was the single biggest reason the tool read as "very good stylisation"
  // rather than as a material: the hand set where the brush went, and a field
  // decided what the mark then looked like. A hard edge and a lost edge are
  // *techniques*, chosen deliberately and repeated on purpose; noise can wobble
  // them, it cannot be the thing that picks.
  uniform float u_edgeSoft;
  uniform float u_edgeWander;
  // #468 v8 — the direction the stroke set off in, unit length. Read only by
  // the dry-brush term. See u_dryContact.
  uniform vec2 u_strokeDir;
  uniform float u_tideLo;
  uniform float u_tideHi;
  // #468 v5 — how covering the *paint* is (watercolorPigments.ts). Chooses
  // between the composite's two halves below; 0 reproduces the pure multiply
  // v1-v4 always did.
  uniform float u_pigmentOpacity;
  // #468 v11, ADR 011 §11 — pigment transport. Zero on every other tool's
  // composite, and zero disables the whole block rather than merely scaling it
  // to nothing, so nobody pays 52 texture reads for a term that cannot fire.
  //
  // u_migrate    how much of the pigment lying at a place one exchange with its
  //              neighbourhood may move. A rate, not an amount: what actually
  //              moves is this times the pigment that is already there, which
  //              is what makes the operation conserve paint rather than invent
  //              it.
  // u_migratePx  how far it moves. Resolved from the brush's own radius by the
  //              engine, exactly as u_spreadPx is.
  // u_migrateLo  the wetness gate, and it is high and steep on purpose. See the
  // u_migrateHi  block that reads it.
  uniform float u_migrate;
  uniform float u_migratePx;
  uniform float u_migrateLo;
  uniform float u_migrateHi;
  // #468 v6 - the stroke's own dab spacing, in canvas px, and the period of a
  // ripple the deposit passes cannot avoid leaving.
  //
  // Ink is laid twice over the same figure: a stamp at every sample and a band
  // between consecutive samples, each carrying half a dose so their overlap
  // sums to one (markerRibbon.ts). But the overlap is not uniform - at a stamp
  // both passes land, between stamps only the band does - so the accumulated
  // deposit oscillates with the dab spacing. The marker never saw it: its
  // unnormalized deposit saturated the 8-bit buffer everywhere. Once v3
  // normalized the deposit into the responsive part of the saturation curve the
  // ripple came straight through, as a visible chain of circles along every
  // stroke - which is exactly how it was reported.
  //
  // Read the deposit back averaged over one spacing and the ripple integrates
  // away, while what the buffer is actually for - how the load varies over the
  // *length* of a stroke - survives untouched, because that varies over tens of
  // dabs rather than one. 0 disables, which is what every tool still on the
  // legacy deposit scale wants.
  uniform float u_inkSmoothPx;

  varying vec2 v_localUV;
  varying float v_pressure;
  varying float v_tiltX;
  varying float v_tiltY;
  varying float v_opacity;
  varying float v_aspectRatio;
  varying float v_radius;
  // #452: width of this dab's absorbed band, as a fraction of its own radius
  // (0 for every tool but the liner — see DAB_VERT's own comment). The mark's
  // edge is still at dist == 1.0; the band runs from there out to
  // dist == 1.0 + v_wick.
  varying float v_wick;

  // #330: signed distance from this fragment to the marker nib's own boundary,
  // in canvas pixels — negative inside, positive outside. The one place the
  // marker's geometry is defined, shared by the coverage pass (u_inkMode=6) and
  // the ink pass (u_inkMode=7) so the mark's silhouette and its pigment can
  // never disagree about where the nib ends.
  //
  // Pixels, not normalized dab space, is the entire point: the profile this
  // replaced spent a fixed *fraction* of the dab on its falloff, so the edge
  // widened with the brush (36-40% of the mark's half-width at every size) and
  // a big marker read as an airbrush.
  float markerNibDistPx() {
    float bAxis = max(v_radius, 1e-4);
    float aAxis = bAxis * max(v_aspectRatio, 1.0);
    if (u_nibShape > 0.5) {
      // Exact SDF of a rounded box, in local pixels.
      vec2 lp = vec2(v_localUV.x * aAxis, v_localUV.y * bAxis);
      float r = min(u_nibCorner, min(aAxis, bAxis));
      vec2 q = abs(lp) - vec2(aAxis, bAxis) + r;
      return min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - r;
    }
    // Ellipse: first-order estimate d = (f - 1) / |grad f| for the implicit
    // f = (x/a)² + (y/b)² = 1. Exact in the limit at the boundary, which is the
    // only place it is ever used, and free of the iteration a true ellipse
    // distance would need.
    float f = dot(v_localUV, v_localUV);
    vec2 gradPx = 2.0 * vec2(v_localUV.x / aAxis, v_localUV.y / bAxis);
    return (f - 1.0) / max(length(gradPx), 1e-6);
  }

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


  // (#536) How much deposit one e-folding of transmission costs. Picked so an
  // ordinary single pass lands around 0.78 rather than pinned at 1: that is
  // what leaves room above for a second pass to darken, and room below for a
  // brush running out of paint to lighten. u_saturateInk is *not* this — it
  // stays the migration pass's reference for a full film and is left alone,
  // because coupling the two is how one retune silently becomes two.
  //
  // #536 — 0.54, from 1.8, and it moves with WATERCOLOR_CONE_DEPOSIT_GAIN
  // rather than on its own: the gain came down by the same factor so that an
  // ordinary pass stops clipping the 8-bit deposit buffer, and this keeps the
  // tone of that pass exactly where it was (density 0.43 before and after).
  // What changes is what lies above it — a second glaze now reads 0.67 and a
  // third 0.81, where before every one of them read the same clipped value.
  const float WC_DENSITY_K = 0.54;
  // (s17.43) How much more a black covers than a white per unit of mass, on
  // the fourth power of darkness so a mid blue (Y 0.25) gains a third and a
  // mid tone a tenth while a black gains the whole of it: at the square the
  // blue's body went up by 70 % with the black's.
  const float WC_TINT_DARK = 1.2;
  // (#536, s17.26) The dry brush reads the paper's catch over this many px.
  // (s17.29) 6, from 2.5: Ilya's series 6 - the gaps a dry brush leaves are
  // islands a millimetre or two across (10-20 px at the room's scale), not
  // a speckle at the grain; at 2.5 px the mark read as a solid film with a
  // fine roughness over it.
  const float WC_DRY_TOOTH_PX = 9.0;
  // (#680) Most contact follows smoothed height crests; retain some local
  // relief so neighbouring paper pits do not become a regular soft grid.
  const float WC_DRY_COARSE = 0.65;
  const float WC_DRY_LIFT = 0.42;
  // (s17.29) The water at which the contact starts breaking - 0.6, from
  // 0.45: the series' strokes at 0.21-0.36 water are all broken in the
  // photograph, and at 0.45 the gate had them nearly closed.
  const float WC_DRY_WATER_LO = 0.15;
  const float WC_DRY_WATER_HI = 0.5;
  const float WC_DRY_CONTACT_W = 0.12;
  // (#536, s17.26) The ink stamp's profile: 1 = a cone to the centre, 3 = a
  // plateau with a ramp over the outer half of the nib.
  const float WC_STAMP_PLATEAU = 2.0;
  /** (#536) How far below the blur's half point the wash's re-threshold sits on
   *  fully wet paper — the tool's only term that makes a mark genuinely bigger
   *  rather than merely softer or more irregular. See its use, under u_spreadPx.
   *
   *  Declared here rather than beside the other WC_WET_* constants, which live
   *  in PAPER_COMPOSE_FRAG: GLSL ES 1.0 has no include, these are two separate
   *  programs, and a constant declared in the wrong one is a compile error that
   *  takes the whole engine down with it. */
  const float WC_WET_PUSH = 0.50;
  /** How strongly the paper's pits mottle a thin film on wet paper - the halo
   *  of a wet-in-wet mark. See granHere. */
  // (#536) 0.35, from 1.1. The term scales with (1 - density), and once the
  // diffusion spreads a mark thin across a puddle that factor is large
  // everywhere in it - a wet line through a puddle came out grainy, "в
  // области лужи кисть становится как сухая". Ilya asked for the wet-paper
  // grain to be barely visible; this is barely visible.
  const float WC_WET_GRAN = 0.35;
  /** What is left of the push for a brush with no water in it. A floor rather
   *  than a gate: a nearly dry brush dragged through standing water still
   *  bleeds plainly, it simply does not flood. */
  const float WC_PUSH_DRY = 0.45;
  /** How strongly the paper's own grain steers the advancing front. */
  const float WC_WET_PAPER = 1.3;
  /** Where the pigment's own spread samples for paint, as a fraction of the
   *  boundary's reach. Above 1: this ring is what decides how far the blot
   *  gets, so it has to reach about a brush radius — the growth Ilya measured
   *  on paper is roughly 1.7x across, and a ring that stops short of the mark's
   *  own radius cannot produce it. */
  /** How much of the neighbouring deposit arrives here at full push. Above 1
   *  because a ring average outside a mark is mostly empty taps: at one radius
   *  out perhaps three of twelve land on paint, so the mean understates what is
   *  actually available to travel by about that factor. */
  /** How much arrived pigment counts as the wash being present at all, and how
   *  much counts as fully present. Both small: out at the margin only two or
   *  three of twelve taps land on paint, so what arrives is a small fraction of
   *  a core deposit however strong the mark is. */

  // (#536) How wide the transport's own view of the concentration is, in px.
  // Wider than a hair bundle on purpose — see its use.
  const float WC_TRANSPORT_SMOOTH_PX = 7.0;

${WC_NOISE_GLSL}

  // (#468 v10) Twelve directions per ring, not eight, and the two rings of one
  // blur offset by half a step. NEAREST-filtered source sampled at fixed
  // offsets, so no bilinear interpolation enters the result on any vendor.
  //
  // Eight showed up as *spikes*. The blur these feed decides where the mark's
  // boundary sits, and with only eight sample directions its iso-contour is an
  // octagon — so a round mark grew hard radial rays at the eight compass
  // points, which is exactly how it was reported. Twelve, staggered by fifteen
  // degrees, puts twenty-four distinct directions into the pair and the octagon
  // stops resolving.
  //
  // Written as constants rather than a loop with trig: cos and sin at thirty-
  // and fifteen-degree steps are three literals, and a runtime trig call in a
  // shader whose output must match across GPUs is the thing .claude/rules.md
  // warns about.
  //
  // Shader scope, not function scope: three helpers need them now (v11's
  // transport reads the same twelve directions), and a copy per function is a
  // copy that can drift.
  const float C30 = 0.8660254;
  const float C15 = 0.9659258;
  const float S15 = 0.2588190;

  /** (#468 v6) The deposit texture, averaged over a ring of radius rPx, so one
   *  dab spacing of ripple integrates out whichever way the stroke happened to
   *  be travelling. Returns the deposit in .a and its water-weighted partner in
   *  .r, the pair the composite divides. */
  vec4 wcInkAvg(vec2 uv, vec2 texel, float rPx) {
    vec4 s = texture2D(u_inkLoad, uv) * 2.0;
    s += texture2D(u_inkLoad, uv + vec2( rPx,        0.0      ) * texel);
    s += texture2D(u_inkLoad, uv + vec2(-rPx,        0.0      ) * texel);
    s += texture2D(u_inkLoad, uv + vec2( 0.0,        rPx      ) * texel);
    s += texture2D(u_inkLoad, uv + vec2( 0.0,       -rPx      ) * texel);
    s += texture2D(u_inkLoad, uv + vec2( rPx * C30,  rPx * 0.5) * texel);
    s += texture2D(u_inkLoad, uv + vec2(-rPx * C30,  rPx * 0.5) * texel);
    s += texture2D(u_inkLoad, uv + vec2( rPx * C30, -rPx * 0.5) * texel);
    s += texture2D(u_inkLoad, uv + vec2(-rPx * C30, -rPx * 0.5) * texel);
    s += texture2D(u_inkLoad, uv + vec2( rPx * 0.5,  rPx * C30) * texel);
    s += texture2D(u_inkLoad, uv + vec2(-rPx * 0.5,  rPx * C30) * texel);
    s += texture2D(u_inkLoad, uv + vec2( rPx * 0.5, -rPx * C30) * texel);
    s += texture2D(u_inkLoad, uv + vec2(-rPx * 0.5, -rPx * C30) * texel);
    return (s * 0.0714286) * 2.0;
  }

  /** Mean stroke coverage on a ring of radius rPx, twelve taps. A stagger above
   *  0.5 rotates the whole ring by fifteen degrees, which is what lets the two
   *  rings of one blur cover twenty-four directions between them. */
  float wcRingAvg(vec2 uv, vec2 texel, float rPx, float stagger) {
    vec2 bx = stagger > 0.5 ? vec2(C15, S15) : vec2(1.0, 0.0);
    vec2 by = vec2(-bx.y, bx.x);
    float s = 0.0;
    s += texture2D(u_strokeCoverage, uv + (bx *  rPx) * texel).a;
    s += texture2D(u_strokeCoverage, uv + (bx * -rPx) * texel).a;
    s += texture2D(u_strokeCoverage, uv + (by *  rPx) * texel).a;
    s += texture2D(u_strokeCoverage, uv + (by * -rPx) * texel).a;
    s += texture2D(u_strokeCoverage, uv + (bx *  rPx * C30 + by *  rPx * 0.5) * texel).a;
    s += texture2D(u_strokeCoverage, uv + (bx * -rPx * C30 + by *  rPx * 0.5) * texel).a;
    s += texture2D(u_strokeCoverage, uv + (bx *  rPx * C30 + by * -rPx * 0.5) * texel).a;
    s += texture2D(u_strokeCoverage, uv + (bx * -rPx * C30 + by * -rPx * 0.5) * texel).a;
    s += texture2D(u_strokeCoverage, uv + (bx *  rPx * 0.5 + by *  rPx * C30) * texel).a;
    s += texture2D(u_strokeCoverage, uv + (bx * -rPx * 0.5 + by *  rPx * C30) * texel).a;
    s += texture2D(u_strokeCoverage, uv + (bx *  rPx * 0.5 + by * -rPx * C30) * texel).a;
    s += texture2D(u_strokeCoverage, uv + (bx * -rPx * 0.5 + by * -rPx * C30) * texel).a;
    return s * 0.0833333;
  }

  // #468 v11, ADR 011 §11 — how much of the wetness gate is decided by the
  // water still in the brush at this exact spot rather than by the mix the
  // stroke was made with.
  //
  // Deliberately the smaller share. Water depletes fast (twenty radii of travel
  // and a flooded brush is merely damp), so a gate reading the local value
  // alone would put edge deposition in the first inch of every band and nowhere
  // else — and since a wash is laid in alternating directions, that lands as a
  // zigzag across the finished wash rather than as a rim around it. The setting
  // decides whether this wash is wet enough to move paint at all; the local
  // value only lets a tail that ran dry pool less than the head did.
  const float WC_MIGRATE_LOCAL = 0.35;
  // How much harder pigment runs at the very top of the water range.
  //
  // A second, much steeper stage on top of the gate, and it exists because the
  // gate alone cannot express "a little more, but only when it is very wet":
  // raising the gain raises it everywhere the gate is open, and lifting
  // u_migrateLo would cut the low end off rather than lift the high one. This
  // starts at nothing at 0.90 and reaches half again by the top of the slider,
  // so 0.78..0.88 is left exactly where it was and a flooded brush gets the
  // extra.
  //
  // The high edge sits above 1 on purpose: the slider's own maximum is 1.0, and
  // an edge at 1.0 would put the whole of this stage's travel inside the last
  // tenth and reach its full value only at a setting nobody can hold steady.
  const float WC_MIGRATE_FLOOD = 0.6;
  const float WC_MIGRATE_FLOOD_LO = 0.90;
  const float WC_MIGRATE_FLOOD_HI = 1.02;
  // The deposit at which the standing film stops deepening, as a fraction of
  // u_saturateInk. Sits at the level the deposit buffer itself tops out at, so
  // the depth reads as flat right across the inside of a wash and slopes only
  // through the margin the brush feathered — which is the one place a real film
  // is genuinely shallower, and the only place pigment has anywhere to run to.
  const float WC_MIGRATE_FULL = 0.74;
  // Hard limits on one step, as a multiple of the pigment already present.
  // A transport step that needs its clamp is a step that has stopped
  // conserving, so these exist to bound a mistake rather than to shape the
  // result: at the settings shipped they are never reached.
  // Where the wash stops, read off the *silhouette* rather than off the
  // deposit, and both halves of that are measured rather than tidy.
  //
  // A mask, not a depth. Water runs downhill, so every destination worth moving
  // to is shallower than where the pigment started; masking by depth scales the
  // flow by how shallow the destination is and cancels the term it is meant to
  // carry. The first attempt did that and moved about two percent of the paint.
  //
  // And the silhouette rather than the deposit, because the two end in
  // different places. The nib stamps are cones, so the deposit fades out over
  // most of a brush radius *inside* the mark, while the silhouette runs flat to
  // the edge and stops. Masked by the deposit, pigment kept going after it had
  // run out of mark: on a broad blob it left the margin and landed where the
  // coverage was already fading, so the ring it should have built was thrown
  // away instead - measured as a margin nine tone units lighter with under two
  // units arriving anywhere.
  const float WC_MIGRATE_EDGE_LO = 0.02;
  const float WC_MIGRATE_EDGE_HI = 0.30;

  /** (#468 v11) Everything one place contributes to pigment transport, read in
   *  one go so that two neighbouring fragments compute identical numbers for
   *  each other.
   *
   *  That identity is the entire reason this takes a position and nothing else
   *  — no direction argument, and no reuse of the centre's own wider average.
   *  The exchange between two places is computed twice, once at each end, and
   *  it conserves pigment only if both ends agree to the bit. An estimator that
   *  leaned on which way it happened to be looking would create paint on one
   *  side of every pair and destroy it on the other, which is precisely the
   *  fault the painted-on tideline has and this revision exists to remove.
   *
   *  Four taps in a plus at the deposit's own ripple radius, so that whatever
   *  is left of the per-dab modulation does not come back as flux noise.
   *
   *  .x  how much pigment lies here
   *  .y  how deep the water standing over it is
   *  .z  whether there is wet paint here at all - the mask
   *  .w  how freely this place lets pigment go: the wetness gate */
  vec4 wcTransportField(vec2 uv, vec2 texel, float s, float full) {
    vec4 a = texture2D(u_inkLoad, uv + vec2(  s, 0.0) * texel)
           + texture2D(u_inkLoad, uv + vec2( -s, 0.0) * texel)
           + texture2D(u_inkLoad, uv + vec2(0.0,   s) * texel)
           + texture2D(u_inkLoad, uv + vec2(0.0,  -s) * texel);
    a *= 0.5; // four-tap average then headroom record decode x2
    float dep = a.a;
    float wat = dep > 0.004 ? clamp(a.r / dep, 0.0, 1.0) : 0.0;
    // (#536) …and how wet the *paper* under it already was, which this pass did
    // not consult at all. That omission is why painting into a puddle looked no
    // different from painting on dry paper: the machinery for moving pigment
    // was here, gated on the brush alone, and therefore blind to the one thing
    // wet-in-wet is about.
    float pap = dep > 0.004 ? clamp(a.g / dep, 0.0, 1.0) : 0.0;
    float cov = texture2D(u_strokeCoverage, uv).a;
    // How wet this place counts as: mostly the mix the stroke was made with,
    // nudged by the water actually left in the brush here — and never less than
    // what was already lying on the paper. Same rule the profile draws between
    // contact and transport: the brush decides how the paint is laid, the paper
    // decides what becomes of it afterwards.
    float wetness = max(mix(u_water, wat, WC_MIGRATE_LOCAL), pap);
    // Can exceed 1 — see WC_MIGRATE_FLOOD. Only the flux reads it that way; the
    // tideline's own retreat clamps it back (search for min(migrateGate, 1.0)).
    float gate = smoothstep(u_migrateLo, u_migrateHi, wetness)
      * (1.0 + WC_MIGRATE_FLOOD * smoothstep(WC_MIGRATE_FLOOD_LO, WC_MIGRATE_FLOOD_HI, wetness));
    return vec4(
      dep,
      wat * min(dep / full, 1.0),
      smoothstep(WC_MIGRATE_EDGE_LO, WC_MIGRATE_EDGE_HI, cov),
      gate
    );
  }

  /** One direction's exchange, as (arriving, leaving).
   *
   *  Upwind and one-sided: pigment goes from the wetter place to the drier one
   *  and never the other way, because what carries it is water leaving. Both
   *  halves are written from the *source* place's own numbers, which is what
   *  makes the pair cancel exactly when the neighbour computes it. */
  vec2 wcFlux(vec4 c, vec2 uv, vec2 texel, vec2 dir, float h, float s, float full) {
    vec4 n = wcTransportField(uv + dir * h * texel, texel, s, full);
    float leaving  = c.w * c.x * max(c.y - n.y, 0.0) * n.z;
    float arriving = n.w * n.x * max(n.y - c.y, 0.0) * c.z;
    return vec2(arriving, leaving);
  }

  // Interpolated value noise built on the same baked hash() above — only
  // needed by the experimental grain candidates below (u_grainMode>0); the
  // real shipped default (mode 0) never calls this. No seamless/tiling wrap
  // (unlike paperNoise.ts's own vnoise) — this is live per-fragment, per-
  // dab noise. The lattice wraps; its interpolant remains continuous.
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

  // Ten experimental candidates for the mark's own texture — ported from a
  // throwaway HTML canvas comparison (see chat), ranked and picked by eye
  // there before landing here. Shared by graphite and charcoal (#304): the
  // graphite path passes p = gl_FragCoord.xy (the basis the original mode-0
  // dither used), charcoal passes the world-space gl_FragCoord + u_paperOrigin
  // instead so its much stronger texture doesn't shift at tile boundaries —
  // every mode here is a pure function of p, so either basis is valid. dir is
  // this dab's own tilt direction (falls back to (1,0) when there's no tilt
  // signal, e.g. a mouse) — used only by mode 3's stroke-aligned streaks.
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
    // #330: v_localUV is ALREADY the dab's own normalized space — both vertex
    // shaders stretch the quad by u_aspectRatio along local X *before* this,
    // while v_localUV stays a_position*2, i.e. -1..1 across the stretched quad
    // whatever the aspect. So length(v_localUV) <= 1.0 is exactly the ellipse
    // inscribed in that quad, and no further normalization belongs here.
    //
    // This used to divide v_localUV.x by max(aspectRatio, 1.0) a second time,
    // which pushed the falloff contour out to aspect² * radius while the
    // geometry still ended at aspect * radius — so along the long axis the
    // falloff never happened at all and the quad's own edge cut the dab dead.
    // A 5:1 chisel nib rendered as a hard-edged 10R x 2R *rectangle* with alpha
    // 1.00 right up to the boundary (and a tilted pencil dab as a smaller one),
    // which is what made a wide marker stroke read as a row of stamped
    // rectangles no amount of compositing work could smooth out.
    //
    // Unchanged for aspect <= 1: max(aspect, 1.0) was 1.0 there, so this only
    // ever differed for an elongated dab — marker's chisel nib, a tilted
    // pencil, and charcoal's tilt ladder.
    // #330 — the marker's two geometric passes come first, and deliberately
    // *before* the ellipse discard below: a rounded-box chisel nib has corners
    // outside the unit circle, and that discard would clip them off.
    //
    // u_inkMode=6 — the ribbon's nib stamp: one is drawn at every sample, and
    // markerRibbon.ts's bands fill between them. Their union is exact; for a
    // convex nib, sweeping it along a segment is precisely the convex hull of
    // its two endpoint copies.
    if (u_inkMode > 5.5 && u_inkMode < 6.5) {
      // Inset ramp: 0 exactly at the boundary, 1 one u_aaPx inside. Matches
      // RIBBON_FRAG's convention so a stamp and a band agree where they meet —
      // see its own comment for why the ramp is one-sided.
      float cov = clamp(-markerNibDistPx() / u_aaPx, 0.0, 1.0);
      if (cov <= 0.0) discard;
      // (#536) .r carries where across the brush this fragment sits, on the
      // same -1..+1 scale RIBBON_FRAG writes and remapped the same way. The
      // support value of an ellipse in local direction u is
      // sqrt((a*u.x)^2 + (b*u.y)^2), so dividing the projection by it lands
      // exactly +/-1 at the tangent points the bands' own tangent vertices sit
      // on — the two primitives therefore agree wherever they overlap.
      float bAx = max(v_radius, 1e-4);
      float aAx = bAx * max(v_aspectRatio, 1.0);
      vec2 localPx = vec2(v_localUV.x * aAx, v_localUV.y * bAx);
      float reach = max(length(vec2(aAx * u_acrossLocal.x, bAx * u_acrossLocal.y)), 1e-4);
      float acrossN = clamp(dot(localPx, u_acrossLocal) / reach, -1.0, 1.0);
      cov *= wcTipContact(acrossN, u_bristleCombs, gl_FragCoord.xy + u_paperOrigin, wcTipPressure(v_pressure, v_radius));
      gl_FragColor = vec4((acrossN * 0.5 + 0.5) * cov, cov * wcPoolness(u_puddle, u_paperWet, u_poolBlot), cov * max(u_paperWet, u_washWater * mix(u_waterRetain, 1.0, u_paperWet) * wcStandingGate(u_inkWater, u_washWater)), cov);
      return;
    }

    // u_inkMode=7 — the ribbon's ink deposit. Same geometry as the coverage
    // pass, so pigment lands exactly where the silhouette says the nib was,
    // eased off slightly toward the rim by u_inkEdge so the mark doesn't read
    // as mechanically flat. The superseded per-dab splat instead tapered all
    // the way to zero across a soft profile — which is what made a light marker
    // touch look like an airbrush rather than a marker pressed less hard.
    // Bounded above, not an open ">" like it used to be: #454 added mode 8
    // (the brush pen's composite), and this check would otherwise swallow it
    // and deposit ink where a finished pixel was meant to be written. Same
    // band form the coverage branch right above already uses.
    if (u_inkMode > 6.5 && u_inkMode < 7.5) {
      float dPx = markerNibDistPx();
      float cov = clamp(-dPx / u_aaPx, 0.0, 1.0);
      if (cov <= 0.0) discard;
      // (#536, s17.26) A plateau with a ramp over the outer half of the
      // nib, not a cone to the centre: the cone summed along a stroke gave a
      // cross-section that fell off over the whole radius - a soft film with
      // no edge, and a tideline sitting in the trough beyond it ("печенька").
      // A wet stroke's film is flat and ends where the water ends. The sum
      // still meets stamps entering and leaving smoothly enough; the
      // diffusion pass (s17.11) levels what ripple is left. Mean over the
      // disc 0.58 against the cone's 0.33: WATERCOLOR_CONE_DEPOSIT_GAIN
      // carries the conversion.
      float depth = clamp(-dPx / max(v_radius, 1e-4) * WC_STAMP_PLATEAU, 0.0, 1.0);
      float amount = cov * mix(u_inkEdge, 1.0, depth) * v_opacity;
      // (#536, s17.13) The hairs, into the deposit - the stamp's half of what
      // RIBBON_FRAG's ink mode does, on the same across coordinate the
      // coverage stamp writes (mode 6 above) so stamp and band agree about
      // which hair is which. See wcHairAmp.
      if (u_bristleInk > 0.0) {
        float bAx = max(v_radius, 1e-4);
        float aAx = bAx * max(v_aspectRatio, 1.0);
        vec2 localPx = vec2(v_localUV.x * aAx, v_localUV.y * bAx);
        float reach = max(length(vec2(aAx * u_acrossLocal.x, bAx * u_acrossLocal.y)), 1e-4);
        float acrossN = clamp(dot(localPx, u_acrossLocal) / reach, -1.0, 1.0);
        vec2 hairWp = gl_FragCoord.xy + u_paperOrigin;
        float hair = wcHairField(acrossN, u_bristleCombs, hairWp);
        amount *= wcHairComb(hair, wcHairAmp(u_bristleInk, u_inkWater));
      }
      {
        float bAx = max(v_radius, 1e-4);
        float aAx = bAx * max(v_aspectRatio, 1.0);
        vec2 localPx = vec2(v_localUV.x * aAx, v_localUV.y * bAx);
        float reach = max(length(vec2(aAx * u_acrossLocal.x, bAx * u_acrossLocal.y)), 1e-4);
        float acrossN = clamp(dot(localPx, u_acrossLocal) / reach, -1.0, 1.0);
        amount *= wcTipContact(acrossN, u_bristleCombs, gl_FragCoord.xy + u_paperOrigin, wcTipPressure(v_pressure, v_radius));
      }
      if (u_inkClip > 0.5 && u_inkClip < 1.5) {
        // A branch on a uniform, which GLSL ES 1.0 allows a texture fetch
        // inside (the composite's own note is about non-uniform flow).
        float washCov = texture2D(u_strokeCoverage, gl_FragCoord.xy / u_resolution).a;
        amount *= washCov;
      }
      // (#536) …unevenly, and the unevenness is deposited with the paint. Same
      // world mapping the paper sampling uses, so a stamp and a band cannot
      // disagree about where the field is.
      vec2 mottleWp = gl_FragCoord.xy + u_paperOrigin;
      vec4 available = texture2D(u_strokeCoverage, gl_FragCoord.xy / u_resolution);
      float depositWet = u_inkClip > 1.5
        ? clamp(available.b / max(available.a, 0.002), 0.0, 1.0) : u_paperWet;
      amount *= wcCloud(mottleWp, u_mottleSeed, u_cloudDeposit)
              * wcSettling(mottleWp, u_mottleSeed, u_granDeposit)
              * wcFilmBlot(mottleWp, u_mottleSeed, u_puddle, depositWet, u_poolBlot, u_inkWater, step(5e-7, abs(u_inkStrength)));
      // .a is the deposit; .rgb the same deposit weighted by how wet the brush
      // was for this dab. Both accumulate additively, so the composite's r/a is
      // the deposit-weighted mean water over everything that landed here — see
      // u_inkWater. Zero for every tool that does not set it, which leaves the
      // ratio undefined and unread.
      if (u_depthWrite > 0.5) {
        // (#536, s17.19) Into the depth buffer instead: see RIBBON_FRAG.
        gl_FragColor = vec4(amount * u_inkStrength * u_tau / WC_DEPTH_SCALE, amount * u_inkStrength);
        return;
      }
      gl_FragColor = vec4(amount * u_inkWater, amount * depositWet, amount * u_inkStrength, amount);
      return;
    }

    // u_inkMode=10 (#547, ADR 013 §4) — the digital brush's coverage stamp.
    //
    // The one genuinely new piece of rendering this tool needed. Mode 6 above
    // draws the ribbon's *rigid nib*: a flat disc with a fixed one-pixel ramp,
    // which is right for a felt tip and useless as a brush, because the whole
    // difference between a soft brush and a hard one lives in that ramp.
    //
    // Two things this deliberately does not do:
    //
    //  - it does not touch mode 6, so the marker, the brush pen and watercolor
    //    cannot regress by side effect. A shared branch "with a hardness term"
    //    would have been smaller and would have put three shipped tools at the
    //    mercy of this one's tuning;
    //  - it reads no paper. This mark is not ink soaking into a sheet and not
    //    graphite catching on tooth (ADR 013 §8) — its texture is the brush's
    //    own, and in v1 there is none.
    //
    // Bounded band rather than an open ">" like the composite branches below:
    // 10.0 would satisfy both "> 8.5" (watercolor) and "> 7.5" (brush pen), and
    // a stamp that fell through into a composite would write finished pixels
    // into the coverage buffer.
    if (u_inkMode > 9.5 && u_inkMode < 10.5) {
      // Normalized radius: v_localUV is the dab's own frame, 1.0 at the
      // boundary, so this is scale-free and an ellipse comes out as one.
      float d = length(v_localUV);
      if (d >= 1.0) discard;

      // The ramp is a fraction of the *mark*, not an absolute width, which is
      // the difference between an edge that belongs to a tip and one that
      // belongs to a brush: a soft 200px brush has to have a 200px-scale
      // falloff. u_aaPx enters only as the floor, so the hardest brush in the
      // set still antialiases rather than drawing a jagged disc — see
      // DIGITAL_BRUSH_MIN_AA_PX.
      float aaNorm = clamp(u_aaPx / max(v_radius, 1e-4), 0.004, 0.9);
      float inner = min(u_hardness, 1.0 - aaNorm);
      float mask = 1.0 - smoothstep(inner, 1.0, d);

      // v_opacity carries this dab's **flow**, not the stroke's opacity — the
      // engine passes digitalBrushFlow() here (ADR 013 §3). The two must not be
      // collapsed: flow accumulates through this buffer's own source-over blend
      // and saturates, while opacity is applied once, later, by the composite
      // over the frozen pre-stroke layer. Collapse them and every place a
      // stroke crosses itself comes out darker than the rest of it, which is
      // the single most recognisable flaw of a hand-rolled digital brush.
      float amount = mask * v_opacity;
      if (amount <= 0.0) discard;
      // Premultiplied, against ONE/ONE_MINUS_SRC_ALPHA (AccumulationBuffer's
      // beginDraw) — so repeated stamps accumulate as textbook "over" and
      // approach 1.0 without ever passing it. No clamp needed anywhere, which
      // is why this needs no additive pass of its own.
      gl_FragColor = vec4(vec3(amount), amount);
      return;
    }

    float dist = length(v_localUV);
    // #452: v_wick is 0 for every tool but the liner, so this is the exact
    // "dist > 1.0" cutoff it has always been everywhere else. Only the liner
    // grows its quad past the mark's own edge, and only its branch below reads
    // anything out of the band that opens up: shape is exactly 0 out there
    // (smoothstep clamps to 1 at dist >= 1.0), so graphite/charcoal/eraser
    // deposit nothing there even if some future draw did widen their quads.
    // (#536, §17.62) Not for a composite rect: its quad is the rect, and the
    // ellipse inscribed in it left every corner un-recomposited - the ends of
    // a V-shaped wash kept their wet live picture, and a replay dropped them.
    // The composite branches (u_inkMode 2, 8, 9) read no dab geometry.
    if (dist > 1.0 + v_wick && u_rectComposite < 0.5) discard;

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

    // Watercolor composite (#468, ADR 011 §3): a transparent glaze.
    //
    // Placed **above** the brush pen's own check immediately below, and that
    // placement is load-bearing for the same reason ADR 009 spells out one
    // branch down: these are independent "> threshold" if/return checks ordered
    // highest-value-first, not an else-if chain, so 9.0 satisfies "u_inkMode >
    // 7.5" just as readily as 8.0 does. Put this after it and every watercolor
    // stroke silently renders as a brush-pen stroke.
    //
    // Structurally this is the marker's pipeline - accumulate the stroke's
    // silhouette and its pigment quantity in scratch buffers, then recompute
    // the finished pixel from the frozen pre-stroke content on every batch -
    // and it is here for the marker's reason too: a translucent film applied
    // twice is not the same as applied once, so a pixel the stroke revisits
    // must be recomputed rather than added to.
    //
    // What it is NOT is a fluid simulation. Nothing here models water, drying,
    // or flow between strokes; ADR 011 §2 records why that is a deliberate
    // architectural refusal rather than a shortcut, and what it would cost to
    // change. Every quantity below comes from *this* stroke's own dabs plus the
    // paper, which is what keeps a stroke a pure function of its Operation and
    // therefore replayable, undoable, and identical on every participant.
    if (u_inkMode > 8.5) {
      vec2 tileUV = gl_FragCoord.xy / u_resolution;
      vec2 texel = 1.0 / u_resolution;
      // World-space basis for every field below - same tile-seam reasoning as
      // paperUV's own u_paperOrigin term (#141), so the mottling does not jump
      // at a tile boundary on an infinite canvas. Offset per stroke so two
      // washes over the same patch do not get identical structure.
      vec2 wp = gl_FragCoord.xy + u_paperOrigin + u_fieldOffset;

      float rawCoverage = texture2D(u_strokeCoverage, tileUV).a;
      // Averaged over one dab spacing rather than sampled raw - see
      // u_inkSmoothPx for the ripple this removes and why v3 made it visible.
      vec4 ink = u_inkSmoothPx > 0.0
        ? wcInkAvg(tileUV, texel, u_inkSmoothPx * 0.5)
        : texture2D(u_inkLoad, tileUV) * 2.0;
      // (#536, s17.19) What colour the paint HERE is: the mass-weighted
      // geometric mean of the transmittances of everything laid on this
      // texel, exp(-D / m), read off the depth buffer - so two paints in one
      // puddle mix as paints do (blue and yellow to a dull green), and one
      // paint comes out exactly the colour it carries.
      // Read as a ratio with a small prior on the nearby deposited paint: at a
      // thin fringe the mass is a code or two and the depth rounds to none,
      // and a bare ratio there is exp(0) - WHITE paint, which is what the
      // "светлые артефакты, после высыхания остались" were. With the prior
      // the fringe uses nearby paint's colour and the body is the mixture.
      vec4 depth = texture2D(u_inkColor, tileUV) * 2.0;
      // (s17.26) …and the prior grows where the mass is thin: the front's
      // extension and a relocated rim's fringe hold a few codes of mass with
      // a depth rounded per channel, and a bare ratio there swung the hue
      // texel by texel - red, cyan and blue specks along a yellow mark's
      // edge in the replay. Under WC_DEPTH_THIN of mass the nearby depth
      // record stabilises colour; a body's mass is ten times that.
      // (s17.43) 0.03 -> 0: the constant part of the prior blended the BATCH's
      // colour into every texel the composite touched, whatever the record
      // held - 13 % of purple into a yellow body of 0.2 mass - and the
      // composite touches its rect, so the second stroke's rect edge was a
      // crisp line of colour change across the first paint ("чёткая линия
      // смены цвета", "вот эта линия"). Hunted through the carry, the bloom,
      // the halo and the dry contact first: none of the wash's buffers had
      // the edge, only the composite's output did. The thin-mass term below
      // keeps the fringe fix this prior was added for.
      const float WC_DEPTH_PRIOR = 0.0;
      const float WC_DEPTH_THIN = 0.12;
      float thinPrior = WC_DEPTH_PRIOR + WC_DEPTH_THIN * (1.0 - smoothstep(0.0, WC_DEPTH_THIN, depth.a));
      // #680: this prior stabilises eight-bit colour, not pigment delivery.
      // Read its colour from the local deposit: the current brush may be
      // clear water of another colour, and its composite rect can reach an
      // older, separate puddle. A batch-colour prior repaints that puddle
      // without changing any of its pigment or depth records.
      vec3 tauPrior = vec3(0.0);
      if (thinPrior > 0.0) {
        vec2 stepUV = 2.0 / u_resolution;
        vec4 localDepth = depth + 2.0 * (
          texture2D(u_inkColor, tileUV + vec2(stepUV.x, 0.0)) +
          texture2D(u_inkColor, tileUV - vec2(stepUV.x, 0.0)) +
          texture2D(u_inkColor, tileUV + vec2(0.0, stepUV.y)) +
          texture2D(u_inkColor, tileUV - vec2(0.0, stepUV.y)));
        tauPrior = localDepth.rgb * WC_DEPTH_SCALE / max(localDepth.a, 5e-5);
      }
      vec3 tauHere = (depth.rgb * WC_DEPTH_SCALE + tauPrior * thinPrior) / (depth.a + thinPrior);
      vec3 paint = exp(-tauHere);

      // §4.1 - how wet the brush was *here*, recovered from the deposit's own
      // weighted sum (see u_inkWater). Outside the mark there is no deposit to
      // divide by, so the batch's nominal water stands in; that region is the
      // spread fringe, which is about to be decided by exactly this value.
      float waterHere = ink.a > 0.004 ? clamp(ink.r / ink.a, 0.0, 1.0) : u_water;
      // #680: post-deposition rendering reads available fluid, not the
      // historical prewet tag ink.g. Coverage.b records standing water from
      // all contacts in the wash; waterHere preserves the deposited carrier
      // in transported fringe pixels outside that standing record.
      // Pickup and brush delivery still read prior wetness separately.
      float standingHere = texture2D(u_strokeCoverage, tileUV).b;
      float paperWetHere = max(waterHere, standingHere);
      // (#536) …and how strong the paint that landed here was. Per pixel, not
      // per batch, because a wash is several strokes and they may carry
      // different amounts of paint — that is the whole of "lay clean water,
      // then take colour into it". Outside the mark there is no deposit to
      // divide by, so the batch's own setting stands in.
      float strengthHere = ink.a > 0.004 ? clamp(ink.b / ink.a, 0.0, 1.0) : u_inkStrength;
      // Recomputed after the migration pass below, which moves paint as well as
      // mass — see its own note.
      float transportHere = max(waterHere, paperWetHere);

      // §3.5 - the wash leaves the brush's footprint.
      //
      // This is the change v1 most needed. A marker's mark *is* the swept
      // outline of its tip; a wash is where the water ended up, which is only
      // loosely where the brush went. Modelled as a blur of the stroke's own
      // silhouette re-thresholded at a threshold that varies from place to
      // place: below the threshold the boundary pushes outward, above it the
      // boundary pulls in, so the mark both spreads *and* becomes irregular
      // rather than uniformly fattened. A second field varies how sharply the
      // re-threshold resolves, which is what gives one mark a soft edge on one
      // side and a crisp one on the other.
      //
      // Deliberately not a dilation (a max over a disc): dilation only ever
      // grows, and a boundary that has grown everywhere by a wobbling amount
      // still reads as an outline offset. Blur-and-rethreshold can also eat
      // *into* the mark, which is what a wash starved of water actually does.
      float coverage = rawCoverage;
      float blurred = rawCoverage;
      // (#536) Both are wanted below, by the pigment's own spread — see the
      // deposit further down.
      float push = 0.0;
      if (u_spreadPx > 0.0) {
        // Reach scales with the water actually left here, not just with the
        // stroke's nominal setting. A stroke that starts flooded and runs dry
        // therefore spreads far at its beginning and hardly at all by its end,
        // inside one mark.
        // (#536) How far the blur reaches, and this is deliberately NOT where
        // the wet-in-wet bloom lives any more.
        //
        // It was, and putting it here was the reason four rounds of "растекание
        // должно быть сильнее" changed nothing on screen. The bloom multiplied
        // the radius, so a 30 px dot in standing water asked for a blur of
        // about eighty pixels — and wcRingAvg is twelve taps on a ring. Twelve
        // point samples at eighty pixels are not a blur of a thirty-pixel dot;
        // every one of them lands on bare paper, the blurred value collapses to
        // the centre tap's share, and the re-threshold has nothing left to push
        // outward. Making the bloom bigger made the sampler worse, which is
        // exactly the shape of the reports.
        //
        // So the radius stays near the mark's own scale, where the ring is a
        // fair approximation of a disc average, and the *growth* is carried by
        // how far below the blur's half point the threshold sits — see
        // WC_WET_PUSH. Displacement is roughly 2*reach*push either way; this
        // way the blur it displaces is real.
        float reach = u_spreadPx * mix(0.25, 1.0, transportHere);
        blurred =
            0.20 * rawCoverage
          + 0.45 * wcRingAvg(tileUV, texel, reach * 0.55, 1.0)
          + 0.35 * wcRingAvg(tileUV, texel, reach, 0.0);
        // Wide threshold range on purpose: the boundary's displacement is
        // (range of thr) / (slope of blurred across the edge), so a timid range
        // buys a wobble of a pixel or two that nothing can see. This spends
        // most of the blur radius in both directions.
        // §8 - the boundary sits where the brush put it, and wanders from
        // there by however much water there is to carry it. 0.5 is the neutral:
        // thresholding the blur at its half point reproduces the swept outline
        // exactly, so a dry mark with u_edgeWander near zero goes where the hand
        // went. Every earlier version spent a fixed 0.10..0.62 here whatever the
        // mix, which is why even a nearly dry brush drew a shape of its own.
        // Widen and vary the edge where fluid is available after deposition.
        // Own carrier and standing water share the same response; the
        // historical prewet tag must not style an otherwise identical field.
        float wetGain = mix(1.0, 1.7, paperWetHere);
        push = WC_WET_PUSH * paperWetHere * mix(WC_PUSH_DRY, 1.0, waterHere);
        // …and the front follows the sheet. In the photographs the spread half
        // of a mark is not a smooth gradient at all: it is granular, and the
        // grain is the paper's own. Steering the threshold by paperCatch makes
        // the advancing boundary run further in the sheet's valleys than over
        // its crests, so the spread arrives *as* texture rather than as a blur
        // with texture drawn over it. Scaled by push, so a mark that is not
        // spreading is not roughened either.
        // Sign matters, and it was wrong: paperCatch is HIGH on a fibre crest
        // and low in a pit, and this used to lower the threshold on crests, so
        // the front ran furthest over the tops of the paper. Ilya, with the
        // real thing in front of him: pigment in standing water runs along the
        // valleys and settles in the pits, a web with the crests left paler.
        // A crest now raises the threshold, a pit lowers it.
        float thr = 0.5
          - push
          + WC_WET_PAPER * push * (paperCatch - 0.5)
          + u_edgeWander * wetGain * (wcFbm(wp * 0.030) - 0.5);
        // §4.1 - how sharply the boundary resolves, and the range is water's
        // to set. A flood has edges running from nearly lost to fairly crisp
        // within one mark; a dry brush has only crisp ones, because there is no
        // liquid to feather them.
        float soft = max(u_edgeSoft, 0.03) * wetGain * mix(0.75, 1.25, wcFbm(wp * 0.017 + vec2(53.0, 11.0)));
        // (#536) The upper end of the ramp is clamped to 1, and that one
        // change is what stops a wash being blotchy.
        //
        // This block exists to make the mark's *boundary* wander off the
        // brush's own outline (§3.5). But thr + soft could exceed 1 — at a
        // wet setting it reached about 1.2 — and smoothstep(0.7, 1.2, 1.0) is
        // 0.66, not 1. So the field was cutting a third of the coverage away
        // in places where the blur is saturated, i.e. deep *inside* a solid
        // wash, where there is no boundary for it to act on at all.
        //
        // That was the blotching: a swing of about a third in alpha, at the
        // 30-60 px scale of these two noise fields, anchored to the paper and
        // therefore identical however many times it was painted over. It read
        // as "a texture that lies on the sheet no matter what", which is
        // exactly what it was — and it was never pigment, which is why it never
        // looked like pigment. Ilya's two exports settled it in one look: the
        // density view is smooth and the silhouette view is the artifact.
        //
        // Clamping keeps the whole intended behaviour. Where the blur is
        // saturated the fragment is at least a blur radius from any edge and
        // now reads full; near the boundary the ramp still moves with thr and
        // still eats into a starved wash, which §3.5 asks for deliberately.
        coverage = smoothstep(thr, min(thr + soft, 1.0), blurred);
      }

      // §4.2 - dry brush, as *geometry* rather than as texture.
      //
      // A loaded brush floods the paper's valleys and touches everything. As it
      // runs dry it rides higher and higher on the crests until the mark is a
      // scatter of contact points with bare paper between them. So this
      // multiplies coverage itself: the silhouette genuinely breaks up, and the
      // gaps are paper rather than pale paint.
      //
      // That distinction is the whole reason the term exists. A grain
      // multiplier laid over a continuous mark reads as a textured brush, which
      // is the criticism every version of this tool has attracted so far.
      //
      // paperCatch is high on a fibre crest and low in a pit, and it is baked
      // offline in double precision - so this adds a smoothstep and a multiply
      // and nothing that cross-device determinism has ever been broken by.
      // §8, #536 - the brush's own hairs. ONE field, TWO outputs.
      //
      // Until #536 this lived entirely inside the dryness > 0.0 branch, and
      // u_dryContact is identically zero above 0.62 water while the "wet"
      // preset sits at 0.92 - so the wettest brush in the tool was the one
      // guaranteed to have no hair structure at all. That is backwards against
      // a real brush, where the hairs are visible loaded as well as dry; they
      // simply stop *breaking the contact* and start *varying the delivery*.
      // So the gate is gone and the field now has two ends:
      //
      //   dry   the hairs ride the paper's crests and the silhouette genuinely
      //         breaks up - gaps of bare paper, not pale paint;
      //   wet   contact is continuous and the hairs instead lay down more
      //         pigment along some lines than others, inside a solid mark.
      //
      // Both are mixed by dryness rather than switched, so nothing steps.
      //
      // Where the field is indexed is the other half of the fix. It used to be
      // world position rotated onto the stroke's direction, which makes it a
      // field the brush drives *over*: turn the stroke or lay a second pass and
      // the streaks do not stay on the same hairs, because they were never
      // attached to any. Now the across-brush axis comes from the rasterizer
      // (RIBBON_FRAG writes it into coverage's .r), so a hair is a fixed place
      // in the brush and its streak follows the brush round a curve.
      //
      // The second axis is a slow *isotropic* world field rather than distance
      // along u_strokeDir, and that is deliberate twice over: a perfectly rigid
      // comb reads as a rake or a fan brush rather than a round one - real
      // hairs gather and separate as the brush travels - and u_strokeDir is a
      // per-batch value, so indexing by it made the pattern jump wherever a
      // live stroke happened to be cut into pointer events.
      float acrossN = rawCoverage > 0.004
        ? clamp(texture2D(u_strokeCoverage, tileUV).r / rawCoverage, 0.0, 1.0) * 2.0 - 1.0
        : 0.0;
      float bristle = wcHairField(acrossN, u_bristleCombs, wp);

      // (#536) …and the paper's water counts here as much as the brush's.
      //
      // "Кажется, что сухой кисти вообще пофиг на лужу" — it was, and this line
      // is the whole of it: the break-up read the brush's own load and nothing
      // else, so a dry brush skipped across standing water exactly as it skips
      // across a dry sheet.
      //
      // Standing water bridges the gaps. A dry brush riding the crests of the
      // paper still touches every crest, and the film lying in the valleys
      // between them joins those touches into a continuous mark. What it does
      // NOT do is make the brush loaded: the pigment it carries is still its
      // own, so the mark comes out continuous and pale rather than broken and
      // strong. Which is what dry-on-wet looks like.
      //
      // That distinction is why this is a change here rather than on the
      // profile. RibbonProfile.dryContact stays a property of the mix alone —
      // "how the brush meets the paper is the brush's business", and there is a
      // test on it — and what the paper is allowed to decide is whether the
      // contact it makes is bridged, which is this.
      //
      // The hair does not disappear with the gaps, it changes register: the
      // deposit modulation below is faded in by exactly what fades this out, so
      // the bundles stop breaking the silhouette and start delivering unevenly
      // inside a solid mark. Still readable, and weaker, which is what a real
      // one does under water.
      // (s17.28) A gate, not a line: the photographs show a full film at
      // half water and the tooth breaking through only near dry.
      // Contact still breaks only when both deposited carrier and standing
      // water are low. Historical prewet metadata is no longer consulted.
      float dryness = u_dryContact * (1.0 - smoothstep(WC_DRY_WATER_LO, WC_DRY_WATER_HI, max(max(waterHere, paperWetHere), standingHere)));
      if (dryness > 0.0) {
        // Where a bundle sits, the brush reaches further down into the paper;
        // between bundles it barely touches even a crest. So the bristles
        // modulate the paper's own catch rather than being laid over the result.
        // (s17.26) At the sheet's tooth, not its grain: the catch averaged
        // over a few pixels, so a dry brush skips pits the size of the
        // paper's texture and leaves crests as blobs (dry_wa_effect), not a
        // pixel speckle. Four taps rather than a mip: a mip chain is the
        // driver's filter, and the composite must agree across devices.
        // (s17.29) A 3x3 box at the tooth's scale, not four diagonal taps
        // at it: four taps that far apart aliased the sheet's own period
        // into a maze of straight corridors (series 6 read as a printed
        // pattern); nine taps a third of the scale apart are a low-pass.
        vec2 dTex = (WC_DRY_TOOTH_PX / 3.0) / u_paperTexSize * u_paperScale;
        float coarse = 0.0;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) coarse += texture2D(u_paperHeightMap, paperUV + vec2(float(i), float(j)) * dTex).r;
        coarse /= 9.0;
        // Dry hairs touch height crests, not the graphite catch channel:
        // catch is an amplified directional slope, which printed a woven
        // hatch instead of islands of contact on the paper's actual relief.
        float catchTooth = mix(texture2D(u_paperHeightMap, paperUV).r, coarse, WC_DRY_COARSE);
        // (#680) Bristles perturb crest contact only slightly. A strong
        // modulation made the across field dominate the photographed relief.
        float reach = catchTooth * (1.0 + 0.08 * (bristle - 1.0));
        // The threshold climbs with dryness: at 0 it sits below every catch
        // value and nothing is cut, at 1 only the highest crests under a bundle
        // survive.
        // (s17.26) 0.72 kept only the highest crests: a dry stroke was a
        // thin sparse speckle where the photographs (dry_wa_effect) show
        // half the tooth taking paint at the start and thinning along.
        float lift = mix(-0.05, WC_DRY_LIFT, dryness);
        float contact = smoothstep(lift, lift + WC_DRY_CONTACT_W, reach);
        coverage *= mix(1.0, contact, dryness);
      }

      // The wet end of the same field. Zero-mean on purpose: a loaded brush
      // does not put down *less* paint for having hair, it puts it down
      // unevenly, so the mark's overall tone must not move as this fades in.
      // Faded out by dryness so the two ends never both act - once the contact
      // is genuinely breaking up, modulating the dose as well would double-
      // count the same hair.
      // (#536, s17.13) The delivery swing used to be applied here, on top of
      // the deposit - which is why it survived the wet diffusion pass as if
      // by magic and drew crayon rings over a dissolved dot: a composite
      // knows nothing about how the paint was delivered and re-imposed the
      // comb on whatever lay under it. It now lives in the ink pass, where a
      // delivery belongs; only the contact break above, which is about the
      // paper and the hairs riding it dry, is still decided here.

      // Untouched by this stroke - leave the layer exactly as it is. With
      // coverage 0 everything below reproduces dst identically, so this is a
      // pure work saving, and it is what makes compositing over a whole
      // bounding rect rather than per dab affordable. 1/255 is the smallest
      // alpha an 8-bit-backed buffer can represent as nonzero.
      //
      // Tested against the *spread* coverage, not the raw one: the fringe the
      // block above just created lies outside the brush's own footprint, and
      // discarding on rawCoverage would throw away exactly the pixels that
      // make this tool stop looking like a marker. The settle pass pads its
      // bounds by u_spreadPx so those pixels are inside the drawn rect at all
      // (see _settleRibbonStroke).
      if (coverage < 0.004) discard;

      vec4 dst = texture2D(u_original, tileUV);
      // Recover the pigment's own colour from premultiplied storage before
      // multiplying against it - same reasoning, same guard value and same
      // flat vec3(1.0) fallback as the marker's branch below (#439). Paper is
      // assumed white where nothing has been painted; this layer cannot see
      // what is composited beneath it.
      vec3 effectiveBase = dst.a > 0.004 ? clamp(dst.rgb / dst.a, 0.0, 1.0) : vec3(1.0);

      // §3.2 - one wet layer, saturating fast, and no second stage. The marker
      // has two discrete Beer-Lambert layers because you really can lay a
      // second film of alcohol dye over a dry first one within a single
      // stroke. Wet paint does not work that way: brushing back over a wash
      // that has not dried redistributes the pigment already there. So this
      // saturates once and stops, and depth comes from glazing - lifting the
      // stylus, which starts a new scratch, freezes this result as the new
      // pre-stroke original, and multiplies over it afresh.
      // §11 - pigment transport, and the first thing in this tool that moves
      // paint rather than deciding how much of it to lay down.
      //
      // Everything above is a per-place formula: a pixel's tone is a function
      // of what the brush did over that pixel and nothing else. That is what an
      // Operation-Log tool can normally afford, and it is why the tideline below
      // had to be *painted on* - the model had no pigment that came from
      // anywhere, so it made a rim out of extra darkness instead, and a wash
      // could gain an edge without its middle ever going lighter. Real washes
      // do the opposite. Water evaporates fastest where the film is thinnest,
      // capillary flow carries pigment there to replace it, and the pigment
      // stays behind when the water leaves: the centre pays for the edge.
      //
      // What makes it affordable is §7. A wash is one object with one set of
      // buffers and one final recomposite, so a redistribution can be computed
      // inside it without any state crossing a stroke boundary - and therefore
      // without touching the rule that a stroke replays as a pure function of
      // its own Operation.
      //
      // It is still not a fluid simulation: no velocity carried between frames,
      // no pressure solve, no iteration count. One conservative exchange between
      // each place and a ring around it, evaluated in the composite. Twelve
      // directions rather than eight for the reason wcRingAvg documents - eight
      // resolves as an octagon, and an octagon around every wet mark would be
      // worse than no transport at all.
      float deposit = ink.a;
      float migrateGate = 0.0;
      if (u_migrate > 0.0) {
        // The standing film, as a field rather than a per-place number: how
        // much water lies here, flat right across the inside of a wash and
        // sloping away only through the margin the brush feathered.
        //
        // Read off the deposit and not off the silhouette, which is a measured
        // choice rather than a convenience. The silhouette saturates within a
        // pixel or two of the boundary, so it carries no shape for a gradient
        // to be taken of; the deposit fades out over most of a brush radius,
        // because the nib stamps are cones, and that fade is the margin.
        // (#536) The field that decides *where* and *how hard* pigment moves is
        // read off a deliberately blurred concentration, and the mass is then
        // taken out of the unblurred deposit.
        //
        // Without that the transport sees the hair as real concentration
        // unevenness and pumps it flat — the bristle structure vanished from
        // the tool the moment the gate came down and this pass started running
        // in ordinary cases. Blurring wider than a bundle leaves the large
        // water/pigment differences to move mass, which is what wet-in-wet is,
        // and leaves the hair alone, which is what a brush is.
        float s = max(u_inkSmoothPx * 0.5, WC_TRANSPORT_SMOOTH_PX);
        float R = u_migratePx;
        float full = max(u_saturateInk * WC_MIGRATE_FULL, 0.0001);
        vec4 c = wcTransportField(tileUV, texel, s, full);
        migrateGate = c.w;
        vec2 f = vec2(0.0);
        f += wcFlux(c, tileUV, texel, vec2( 1.0,  0.0), R, s, full);
        f += wcFlux(c, tileUV, texel, vec2(-1.0,  0.0), R, s, full);
        f += wcFlux(c, tileUV, texel, vec2( 0.0,  1.0), R, s, full);
        f += wcFlux(c, tileUV, texel, vec2( 0.0, -1.0), R, s, full);
        f += wcFlux(c, tileUV, texel, vec2( C30,  0.5), R, s, full);
        f += wcFlux(c, tileUV, texel, vec2(-C30,  0.5), R, s, full);
        f += wcFlux(c, tileUV, texel, vec2( C30, -0.5), R, s, full);
        f += wcFlux(c, tileUV, texel, vec2(-C30, -0.5), R, s, full);
        f += wcFlux(c, tileUV, texel, vec2( 0.5,  C30), R, s, full);
        f += wcFlux(c, tileUV, texel, vec2(-0.5,  C30), R, s, full);
        f += wcFlux(c, tileUV, texel, vec2( 0.5, -C30), R, s, full);
        f += wcFlux(c, tileUV, texel, vec2(-0.5, -C30), R, s, full);
        float moved = u_migrate * (f.x - f.y) * 0.0833333;
        deposit = max(ink.a + moved, 0.0);
        // (#536) …and the *paint* moves with it, not just the amount.
        //
        // Until now this pass moved ink.a alone. Where it carried mass into a
        // patch of clean water — which is the whole of wet-in-wet — the paint's
        // own strength there stayed zero, so the arriving pigment showed up as
        // nothing at all. Worse than nothing: strengthHere is a ratio, so more
        // deposit under an unchanged strength channel reads *paler*. That is
        // why "the pigment does not spread into the puddle" survived every
        // attempt to widen the reach — the reach was not the problem, the paint
        // was not travelling with it.
        //
        // Arriving paint carries this stroke's own strength and what leaves
        // takes the local strength with it, so the ratio stays meaningful at
        // both ends. A simplification while a wash holds one paint at a time —
        // when it can hold several (ADR 011 §17.4's multi-pigment step) the
        // arriving strength has to come from the neighbour instead.
        float strengthWas = ink.a > 0.004 ? clamp(ink.b / ink.a, 0.0, 1.0) : 0.0;
        strengthHere = deposit > 0.004
          ? clamp((ink.b + max(moved, 0.0) * u_inkStrength + min(moved, 0.0) * strengthWas) / deposit, 0.0, 1.0)
          : strengthHere;
      }

      // (#536) Beer-Lambert, not smoothstep, and this is a correction rather
      // than a preference.
      //
      // smoothstep has a derivative of exactly zero at both ends by
      // construction. The deposit was deliberately calibrated to land about
      // twice the ceiling on an ordinary pass (WATERCOLOR_CONE_DEPOSIT_GAIN's
      // own note), so every wash was sitting on the flat top of that curve —
      // and therefore *nothing that modulates the deposit could be seen*.
      // Pigment running out along a stroke, the hairs delivering unevenly, the
      // surplus a brush dumps as it lands, a second pass levelling a first:
      // all of them multiply the deposit, all of them were being multiplied
      // into a number that was then clipped. The tool was unresponsive by
      // construction, and every one of those was reported as missing.
      //
      // A transparent film's transmission is exponential in how much pigment
      // is in it, which is the law this should have been all along: it never
      // reaches 1, so more paint always reads as more paint, and it still
      // flattens across the inside of a stroke — the flat cross-section the
      // gain was raised for survives, because exp saturates gradually where
      // smoothstep saturates absolutely.
      // (#536, s17.25) ...of how much PIGMENT is in it, not how much paint.
      // The film's tone used to be strength x (1 - exp(-amount / K)), with
      // strength the pigment's share of the amount: clean water laid over a
      // settled wash raised the amount, lowered the share, and the wash read
      // paler - an optical act with no pigment moved, which is not what water
      // on dry pigment does. Now the deposit's pigment mass alone sets the
      // tone (Beer-Lambert in the mass), and the front's relocation (s17.24)
      // is the only thing that lightens a centre or darkens a rim. The mass
      // is strength x deposit: ink.b, or its migration-consistent recount.
      float pigmentMass = strengthHere * deposit;
      // (s17.43) ...weighed by the paint's own darkness: a dark pigment covers
      // more per unit of mass than a light one (tinting strength - ivory
      // black or indigo against a lemon yellow), and with one density curve
      // for every paint a full-strength black dried to a mid grey (143 of 255
      // against paper 246; Ilya: "должно быть явно чернее"). The luminance is
      // the record's own colour, so a mixture darkens as it should.
      float darkness = 1.0 - dot(paint, vec3(0.2126, 0.7152, 0.0722));
      float tint = 1.0 + WC_TINT_DARK * pow(darkness, 4.0);
      float linearThickness = pigmentMass * 0.55 / WC_DENSITY_K;
      float effectiveThickness = linearThickness <= 1.0 ? linearThickness : 1.0 + 0.6 * (1.0 - exp(-(linearThickness - 1.0) / 0.6));
      vec3 transmittance = exp(-tauHere * effectiveThickness);
      float density = 1.0 - min(transmittance.r, min(transmittance.g, transmittance.b));
      paint = density > 0.0001 ? clamp((transmittance - vec3(1.0 - density)) / density, 0.0, 1.0) : vec3(1.0);

      // §3.3 granulation - heavier pigment settles into the paper's pits while
      // the wash is still liquid and dries there. paperCatch is high on a fibre
      // crest and low in a pit, so this adds pigment exactly where water pools.
      // Centred on 1.0 so the term redistributes density rather than inflating
      // it: a granulating wash is mottled, not darker overall.
      //
      // Deliberately weak now (v2). v1 ran this at three times the depth and
      // it was the *only* structure a wash had, which made the pigment track
      // the paper's microrelief so literally that the tool read as a textured
      // digital brush rather than as paint. Granulation is the finest of three
      // scales here, not the whole texture.
      // §5 - granulation that *clumps* rather than dithers, adapted from
      // Writing on Water (MIT, see watercolorPigments.ts).
      //
      // v1-v4 multiplied straight by the paper's relief, which put a grain of
      // the paper's own frequency everywhere paint was and read as a textured
      // brush. Two changes fix the character:
      //
      //  - a low-frequency field with a hard split. Below the threshold it is
      //    halved, above it is amplified, so instead of an even dither the
      //    field breaks into patches that grain and patches that do not. That
      //    split is the whole trick, and it is theirs.
      //  - it only appears where paint is actually dense. A thin passage of a
      //    granulating paint is smooth; the clumps show up where enough
      //    pigment collected to have something to clump.
      // (#536) Only the paper's own half survives here. The noise half — which
      // was the larger of the two by a long way — moved into the deposit
      // (wcSettling), because it is what a *pass* leaves rather than what a
      // *place* is, and a field evaluated at display time cannot be changed by
      // painting over it. The pits, on the other hand, genuinely are where they
      // are, and every pass finds the same ones; that stays.
      // (#536) ...plus the water's own settling. The term above fades with
      // density on purpose (a thin passage is smooth), which left the halo of a
      // wet-in-wet mark - low density by construction - perfectly even:
      // "slishkom rovno, bez vliyaniya tekstury". Pigment carried by standing
      // water is the one case where a thin film IS granular: it is the water
      // draining into the sheet's pits that puts it there. So on wet paper the
      // paper's catch acts in proportion to how thin the film is, not how thick.
      float granHere = u_granulation * (0.2 + 0.8 * density * density)
        + WC_WET_GRAN * paperWetHere * (1.0 - density);
      float gran = 1.0 + granHere * (1.0 - 2.0 * paperCatch) * 0.5;

      // §3.6 - the wash's own coarse structure, the scale v1 had nothing at.
      //
      // A real wash is uneven long before the paper's tooth gets involved:
      // water pools, the brush unloads unevenly, absorbency varies over
      // centimetres rather than fibres. wcFbm's two octaves put clouds at
      // roughly 55px and clumping at roughly 20px; with paper grain at 1-3px
      // that gives the mark the three scales it needs. Centred on 1.0 for the
      // same reason granulation is - this redistributes tone, it does not
      // darken the wash.
      // (#536) Gone from here — see wcCloud. It used to be computed at this
      // point from world position, which is precisely why no amount of painting
      // could change it. The deposit carries it now.
      float cloud = 1.0;

      // §3.1 wet edge - the tideline. As a wash dries, water evaporates fastest
      // at the perimeter and capillary flow carries pigment there to replace
      // it; the pigment stays behind when the water leaves. A watercolor wash
      // is therefore *darker at its boundary than in its middle*, which is the
      // exact opposite of every other tool in this engine and the single cue
      // that makes the material recognisable.
      //
      // Zero while the stroke is still being drawn - see u_wetEdge's own
      // comment on why the whole term is deferred to the settle pass rather
      // than computed from a silhouette that is still growing. That deferral is
      // also why the mark visibly gains its rim at pen-up, which is not a
      // glitch: it is the closest this model gets to the paint drying.
      //
      // v2: **partial**, not a closed ring. v1 applied this evenly around the
      // whole silhouette, which produced precisely a stroke-width outline -
      // the more so because the silhouette was itself geometrically perfect.
      // A real tideline stands where the pool of water happened to retreat
      // last: strong along part of the boundary, absent along the rest. So the
      // term is gated by a low-frequency field along the perimeter, and its
      // base gain is *lower* than v1's rather than higher. Strengthening an
      // even rim would only have made the outline more emphatic.
      //
      // The outside term is measured on the raw brush silhouette rather than on the
      // spread one above, which places the band up to a few px off the final
      // boundary. Accepted for now: the gating field breaks the rim into
      // patches anyway, so exact placement buys little, and re-blurring the
      // spread result would need a second scratch buffer.
      float wet = 0.0;
      if (u_wetEdge > 0.0) {
        // Read off the same blur the spread block above already computed, not
        // off a ring on the raw silhouette. Two reasons, and the first is a
        // correctness one: after §3.5 the mark's boundary is no longer where
        // the brush went, so a band measured against the brush's own outline
        // would sit somewhere inside the finished wash. blurred falls from 1
        // to 0 across the *final* edge, so 1 - blurred peaks exactly there.
        // The second is that it costs no extra taps.
        //
        // Raised to a power so the band stays about as wide as
        // u_wetEdgeRadiusPx asks for even when the blur radius is much larger:
        // the blur has to be wide to displace the boundary at all, but a rim
        // that wide would be a vignette rather than a tideline.
        float tideExp = max(1.0, (u_spreadPx * mix(0.25, 1.0, waterHere)) / max(u_wetEdgeRadiusPx, 1.0));
        float outside = pow(max(1.0 - blurred, 0.0), tideExp);
        // ~40px patches, and the band is wide enough that a good part of any
        // given perimeter gets no rim whatever - which is the point (§3.7).
        // §4.1 — how much of the perimeter carries a rim at all is water's
        // call: a dry mark never had a pool to retreat, a flood leaves one
        // almost everywhere it stopped.
        float tide = smoothstep(u_tideLo, u_tideHi, wcFbm(wp * 0.025 + vec2(7.0, 61.0)));
        // §11 - and it stands down where transport is doing the work. Two
        // rims at once is one too many, and the wrong one would be the louder:
        // this term multiplies brightness, so it darkens an edge without ever
        // taking that darkness from anywhere. Left in at low water on purpose -
        // a merely damp wash does still leave a faint line where it stopped,
        // and transport is gated off down there and has nothing to say.
        // Clamped: above the flood threshold the gate deliberately runs past
        // 1 to drive the flux harder, and that must not turn a retreat of a
        // third into one of a half. How much the painted rim stands down is a
        // separate question from how hard the paint runs.
        wet = u_wetEdge * outside * tide * (1.0 - 0.35 * min(migrateGate, 1.0));
      }

      // §3.4 - paper bites the rim only. edgeness is identically 0 wherever the
      // wash is solid, so no value of u_paperRim can put holes or grain
      // *inside* it; at the boundary, absorbent pits take a bite out of the
      // coverage and the wash picks up the fibre-scale irregularity a real one
      // has. Same construction as the brush pen's, at a stronger setting: water
      // creeps along fibres considerably further than ink does.
      float edgeness = 1.0 - coverage;
      float paperMod = 1.0 - u_paperRim * edgeness * (1.0 - paperCatch);

      // How much pigment ends up sitting here, 0..1. v_opacity - the varying,
      // not the uniform, exactly as the brush pen's branch below reads it:
      // this pass draws one quad over the batch's bounding rect, so the value
      // arrives through the same per-dab attribute path every other draw uses.
      // It carries both the preset's own transparency (WATERCOLOR_PRESET.opacity)
      // and the user's slider, and every dab of a watercolor stroke shares it
      // (pressure drives width, never alpha), which is what makes a single
      // scalar describe the whole batch correctly.
      float pigment = clamp(coverage * v_opacity * density * gran * cloud * paperMod * (1.0 + wet), 0.0, 1.0);

      // (#536) Diagnostic view, dev-only. The mark's tone becomes one term of
      // the product above instead of the product, so "which of these carries
      // the blotches" is answered by looking rather than by arithmetic about
      // amplitudes — which has now been wrong three times running. 1 = the
      // silhouette after the spread and its re-threshold, 2 = the film's
      // density, i.e. everything the deposit carries, 3 = the deposit's own
      // pigment channel, x3, 4 = the standing water WC_DIFFUSE_FRAG gates on
      // (s17.11) - so "did it move, and could it" are answered by looking at
      // the buffers rather than at the tone. View 4 found the first gate shut
      // over most of a puddle; no amount of staring at the tone had.
      if (u_wcDebugView > 0.5) {
        // 4 = standing water as WC_DIFFUSE_FRAG gates on it; keep in step
        // with wcWaterAt there.
        vec4 rawInk = texture2D(u_inkLoad, tileUV) * 2.0;
        vec4 rawCov = texture2D(u_strokeCoverage, tileUV);
        float nominalDbg = rawCov.a > 0.002 ? rawCov.b / rawCov.a : 0.0;
        float recordedDbg = rawInk.a > 0.002 ? rawInk.g / rawInk.a : 0.0;
        float gateDbg = rawCov.a * clamp(max(nominalDbg, recordedDbg), 0.0, 1.0);
        pigment = clamp(u_wcDebugView < 1.5 ? coverage : u_wcDebugView < 2.5 ? density : u_wcDebugView < 3.5 ? ink.b * 3.0 : gateDbg, 0.0, 1.0);
      }

      // The composite. Still the three-term separable blend the marker's branch
      // below uses (#439) - on bare paper, over existing pigment, and what this
      // stroke does not cover - but the middle term is no longer a plain
      // multiply.
      //
      // §5, adapted from Writing on Water (MIT, (c) 2012 Antonio R. - see
      // watercolorPigments.ts for the full notice): a paint laid over another
      // does two things at once, and which dominates is a property of the
      // paint. A transparent one *transmits*: light goes down through the film,
      // off what is underneath, and back up, which is a multiply. An opaque one
      // *scatters*: light comes back off the film itself before it ever reaches
      // what is underneath, which is an over. Real watercolours are all near
      // the transparent end, but the difference between 0.02 and 0.20 is
      // exactly what stops two glazes reading as two flat digital layers - the
      // criticism v1-v4 kept attracting, and the one thing a pure multiply can
      // never answer, because a multiply has no way to *hide* anything.
      //
      // Alpha is unchanged: how much of the pixel this wash covers is still the
      // pigment quantity, so a pale wash still lets a pencil line on a layer
      // underneath show through rather than merely tinting it.
      //
      // On bare paper the two halves are identical (mix(1, colour, load) is
      // exactly the transmitted film), which is correct - transparent and
      // opaque paint of the same colour and load look the same on white - so
      // only the middle term needs the choice.
      float newAlpha = mix(dst.a, 1.0, pigment);
      vec3 transmitted = effectiveBase * paint;
      vec3 covered = mix(effectiveBase, paint, pigment);
      vec3 overPaint = mix(transmitted, covered, u_pigmentOpacity);
      vec3 premultResult =
          pigment * (1.0 - dst.a) * paint
        + pigment * dst.a * overPaint
        + (1.0 - pigment) * dst.a * effectiveBase;
      // Premultiplied, and written with blending *off*
      // (AccumulationBuffer.beginReplaceDraw) - this pass recomputes the
      // finished pixel rather than contributing an increment.
      gl_FragColor = vec4(premultResult, newAlpha);
      return;
    }

    // Brush pen composite (#454, ADR 009 §9): plain source-over of a covering
    // ink, and it must stay **first** of the deposit branches below.
    //
    // These are independent "> threshold" checks, not an else-if chain, so a
    // branch only ever sees the modes above its own threshold — which means a
    // new mode has to be inserted by *value*, not wherever it reads nicely.
    // Getting that wrong is not a subtle miss: 8.0 satisfies charcoal's own
    // "> 4.5" just as it satisfies the marker's "> 1.5", so this branch first
    // sat below charcoal's and every brush-pen composite was drawn as a
    // charcoal dab over the whole batch's bounding quad — a round blob per
    // pointer event, which is what the tool looked like until this moved.
    //
    // Structurally this is the marker's pipeline — accumulate the stroke's
    // silhouette in a scratch buffer, then recompute the finished pixel from
    // the frozen pre-stroke content on every batch — and it is here for the
    // same reason: "over" applied twice with the same alpha darkens (0.97 ->
    // 0.999), so a pixel a stroke revisits must be recomputed, not added to.
    // That is also exactly what makes a second pass over an already-saturated
    // line leave it alone, which ADR 009 §9 requires.
    //
    // What it is *not* is the marker's ink model: no inkLoad texture, no
    // Beer-Lambert film, no per-pixel dye quantity. Ink covers rather than
    // transmits, so the silhouette says everything the composite needs, and the
    // ribbon profile switches that whole pass off for this tool.
    if (u_inkMode > 7.5) {
      vec2 tileUV = gl_FragCoord.xy / u_resolution;
      float coverage = texture2D(u_strokeCoverage, tileUV).a;
      // Nothing of this stroke here — leave whatever is on the layer exactly
      // as it is, which is what makes drawing the composite over a whole
      // bounding rect (rather than per dab) free.
      if (coverage <= 0.0) discard;

      // ADR 009 §8. Paper acts on the rim only: edgeness is identically 0
      // wherever the mark is solid, so no value of u_paperRim can put grain
      // or holes *inside* the stroke — that would read as a dry brush, which
      // is the one thing this tool must not look like.
      //
      // At the rim, ink **wicks into** the absorbent paper: a pit between
      // fibres (low paperCatch) pulls ink further out by capillary action, a
      // high fibre holds it back, and the boundary picks up the fibre-scale
      // irregularity real ink has and a vector-like edge doesn't.
      //
      // This used to run the other way — pits *removed* coverage — and that
      // was simply wrong (#472 review). Taking a bite out of the low spots is
      // the model of a dry tip that failed to reach into them, which is right
      // for graphite and backwards for a liquid. It also put this tool in
      // direct contradiction with the liner, whose own wick (#452) reads the
      // identical paper value as (1.0 - paperCatch) absorbency and spreads ink
      // into it. Two ink tools cannot disagree about which way paper works.
      // (No backticks anywhere in this file's GLSL: the whole shader is a JS
      // template literal, and one of them ends the string.)
      //
      // Additive rather than a multiplier, and only in the outward direction:
      // the ramp is one-sided and runs inward from the geometric boundary, so
      // raising coverage inside it pushes the *visible* edge outward exactly
      // where the paper is absorbent, up to but never past where the nib
      // actually was. That keeps the silhouette an upper bound on the ink and
      // leaves the ribbon's geometry the only thing that decides where the
      // mark can reach — no second boundary to disagree with the first, which
      // is the whole of ADR 009 §7.
      //
      // paperCatch is a single sample of a value baked offline in double
      // precision (see its own comment above), and this adds only a multiply
      // and an add on top — no new hash, no finite difference. That is what
      // keeps the mark identical on every participant's GPU
      // (.claude/rules.md).
      float edgeness = 1.0 - coverage;
      float wick = u_paperRim * edgeness * (1.0 - paperCatch);

      // v_opacity, not a per-dab quantity smuggled through coverage: every dab
      // of a brush-pen stroke carries the same opacity (engine's own
      // bakeDabOpacity branch — pressure drives width, never alpha, ADR 009
      // §9), so one uniform value describes the whole batch exactly. A tool
      // whose opacity varied per dab could not be composited from a coverage
      // buffer this way at all.
      float alpha = clamp((coverage + wick) * v_opacity, 0.0, 1.0);
      vec4 dst = texture2D(u_original, tileUV);
      // Textbook premultiplied "over". dst is already premultiplied, so there
      // is nothing to recover first — unlike the marker's branch, which has to
      // un-premultiply because it multiplies against the pigment's own colour.
      gl_FragColor = vec4(alpha * u_color + (1.0 - alpha) * dst.rgb,
                          alpha + (1.0 - alpha) * dst.a);
      return;
    }

    // Charcoal (#304, ADR 005 §4-7). Graphite's own accumulating "over"
    // deposit — identical premultiplied output, so charcoal composites with
    // graphite/ink/marker exactly as graphite already does, with no special
    // overlap handling anywhere — but with three terms graphite has none of:
    // a contrast-expanded paper tooth, a crumbling/breaking mark, and a faint
    // dust ring.
    //
    // Checked before every marker branch below because their own bands
    // ("u_inkMode > 3.5" etc.) would match charcoal's 5.0 too — these are
    // independent if/return checks ordered highest-value-first, not an else-if
    // chain (see u_inkMode's own comment above).
    if (u_inkMode > 4.5) {
      // #305: how far onto its broad side the stick is, recovered from this
      // dab's own baked aspect. Matches charcoalBroadness() in charcoalFeel.ts
      // exactly — the JS side derives it the same way, from the same baked
      // value, so opacity baking and this branch can't disagree about how far
      // along the response a given dab sits. Unchanged by #403: it was already
      // the inverse of the aspect mapping, and flattening the ladder into a
      // curve kept that inverse identical.
      float broadness = u_charcoalBroadAspect > 1.0
        ? clamp((v_aspectRatio - 1.0) / (u_charcoalBroadAspect - 1.0), 0.0, 1.0)
        : 0.0;

      // Charcoal transfers far more readily than graphite: a friable carbon
      // stick leaves a real mark from little more than contact, where a hard
      // lead has to be pushed into the sheet. Graphite's linear-in-pressure
      // deposit therefore makes a light charcoal touch read as almost nothing,
      // which is wrong. Mirrors charcoalPressureResponse() in charcoalFeel.ts
      // exactly — kept in both places rather than baked into the Dab because
      // the graphite fill term below deliberately needs the *raw* pressure.
      float pressCharcoal = u_charcoalPressFloor
        + (1.0 - u_charcoalPressFloor) * pow(clamp(v_pressure, 0.0, 1.0), u_charcoalPressGamma);

      // §4 Tooth: the same baked paperCatch, contrast-expanded around its own
      // 0.5 midpoint. u_charcoalTooth > 1 pulls the paper's peaks toward full
      // deposit and its valleys toward none, so the stick visibly rides the
      // tooth instead of filling it evenly the way graphite does.
      float tooth = clamp((paperCatch - 0.5) * u_charcoalTooth + 0.5, 0.0, 1.0);
      // Pressure crushes material down into the tooth — physically the same
      // mechanism as graphite's own fill below, so the same two uniforms. Fed
      // the *raw* pressure on purpose, not pressCharcoal: "the material comes
      // off easily" and "the tooth gets flattened" are different mechanisms,
      // and flattening genuinely does take force. Routing the lifted pressure
      // here too would fill the paper's valleys at a feather touch and erase
      // exactly the grain that makes the mark read as charcoal.
      float fill = smoothstep(u_paperFillThreshold, 1.0, v_pressure) * u_paperFillCap;
      float effectiveCatch = mix(tooth, 1.0, fill);

      // §5 Dropouts — where the stick simply didn't touch the paper. Read out
      // of the *already-baked* paper texture at a coarser UV rather than
      // generated live (no vnoise here, unlike computeGrain's experimental
      // modes): this value gates deposit to a hard zero, and a gate is exactly
      // where a cross-device floating-point difference stops being a subtle
      // shade change and becomes "this pixel is present on my screen and
      // absent on yours" — a real problem here, since a room's pixels are
      // re-derived by replaying the op log on every participant's own GPU (see
      // .claude/rules.md's cross-device-determinism rules and ADR 005 §5).
      // Sampling a baked asset is deterministic and physically truer (charcoal
      // really does skip where the paper dips), and the UV below carries
      // u_paperOrigin — so unlike computeGrain's raw gl_FragCoord basis this
      // doesn't shift at an infinite canvas's tile boundaries.
      //
      // Deliberately NOT derived from paperUV, though it used to be (as
      // paperUV * 0.17, back when paperUV repeated every PAPER_WORLD_SIZE in
      // every room). #333 made paperUV span a bounded sheet exactly once so
      // deposit would bite the grain the tint actually draws — which silently
      // rescaled this too, stretching a sixth of the tile across a whole page:
      // stick-scale blotches became page-scale blobs, and their gaps became
      // holes no amount of scrubbing could close. Blotch size is a property of
      // the stick, not of the sheet's dimensions, so it keeps its own fixed
      // period. Still built on gl_FragCoord + u_paperOrigin, so it stays
      // world-space and doesn't shift at an infinite canvas's tile boundaries.
      const float CHARCOAL_BLOTCH_PERIOD = ${(PAPER_WORLD_SIZE / 0.17).toFixed(1)}; // = PAPER_WORLD_SIZE / the old 0.17 magnification
      const float CHARCOAL_GATE_BAND = 0.14;    // deliberately wide, so a tiny numeric drift moves an edge rather than flipping a pixel
      vec2 blotchUV = (gl_FragCoord.xy + u_paperOrigin) / CHARCOAL_BLOTCH_PERIOD * u_paperScale;
      float blotch = texture2D(u_paperHeightMap, blotchUV).r;
      // Threshold is highest at the rim (shape -> 0) and lowest in the core
      // (shape -> 1), so gaps concentrate along the mark's edges while still
      // occasionally breaking its body outright.
      //
      // Pressure is what closes the gaps: bear down and the stick reaches into
      // the paper dips it would otherwise skip. This is the term that makes
      // covering a sheet solid possible *without flattening the material's
      // character* — a feather-light pass still breaks up exactly as before,
      // while a firm one lays down continuously. Leaning on the skip floor
      // below for that job instead muted the gaps at every pressure, which is
      // what a first attempt at this fix did, and it visibly killed the
      // texture of the broad-side stroke.
      float gateRelief = 1.0 - clamp(v_pressure, 0.0, 1.0) * u_charcoalGateRelief;
      float gate = mix(0.10, 0.40, u_charcoalCrumble) * (1.0 - shape * 0.6) * gateRelief;
      // Floored, never a hard zero. blotch is a fixed function of world
      // position, so a pixel gated to exactly 0 is a hole that NO number of
      // passes can ever fill — charcoal couldn't cover a sheet solid the way
      // graphite can (measured: 0.61% of a heavily scrubbed patch still pure
      // paper after 45 full-pressure passes, against graphite's 0%). This is
      // the same failure the graphite branch below already learned about its
      // own paperCatch ceiling ("no amount of pressure/opacity could ever push
      // past"), reintroduced here in a harsher form — an absolute veto rather
      // than a ceiling. A dropout must *reduce* deposit, not forbid it: one
      // pass still reads as broken and crumbling, while repeated working
      // closes the gaps, which is exactly what charcoal does on real paper.
      float presence = mix(u_charcoalSkipFloor, 1.0, smoothstep(gate, gate + CHARCOAL_GATE_BAND, blotch));

      // World-space basis for the two live hashes below — same tile-seam
      // reasoning as paperUV's own u_paperOrigin term (#141).
      vec2 wp = gl_FragCoord.xy + u_paperOrigin;

      float core = pressCharcoal * v_opacity * effectiveCatch * shape * presence;
      // §5.1 Grain: the mark's own texture, taken from the *same* computeGrain
      // variant set graphite uses (u_grainMode) rather than a charcoal-only
      // dither — so the dev grain-variant selector can audition all eleven for
      // charcoal, and whichever wins becomes CHARCOAL_PRESETS' own grain field
      // (see charcoalPresets.ts, and resolveGrainMode in presets/resolvePreset.ts for
      // how a preset default and a live override combine).
      //
      // Two charcoal-specific differences from how the graphite path below
      // calls the same function:
      //  - p is the world-space wp, not the raw gl_FragCoord graphite passes,
      //    so the texture doesn't shift across an infinite canvas's tile
      //    boundaries (graphite's own call still has that pre-existing seam).
      //  - amplified by CHARCOAL_GRAIN_GAIN * crumble: every variant's own
      //    amplitude was tuned for graphite, and a coarse crumbling stick
      //    should read stronger than a pencil on the same variant — while
      //    still letting crumble keep vine rougher than compressed whichever
      //    variant is selected.
      // Additive (like graphite's own grain term), never a gate, so this
      // carries no cross-device risk beyond what the graphite path already
      // ships — see the dropout comment above for why that distinction is the
      // one that matters here.
      // #305 adds the broadness term: on its broad side the stick presses far
      // less firmly per unit area, so it rides the paper's grain instead of
      // being crushed into it — the mark comes out visibly coarser, not just
      // wider and lighter. Note v_tiltX/v_tiltY are the *filtered* tilt (see
      // DabSystem._filterTilt), which matters here because charcoal's default
      // grain variant is tilt-aligned: an unfiltered direction would make the
      // streaks shimmer while the outline stayed put.
      float tiltLenC = length(vec2(v_tiltX, v_tiltY));
      vec2 dirC = tiltLenC > 0.001 ? vec2(v_tiltX, v_tiltY) / tiltLenC : vec2(1.0, 0.0);
      float grainAmp = (u_charcoalGrainDepth + u_charcoalCrumble) * (1.0 + u_charcoalBroadGrain * broadness);
      // A bounded *multiplier* on the deposit, not an additive term the way
      // graphite's own grain is. Two reasons, and the first is a real bug this
      // fixes: charcoal amplifies computeGrain far beyond graphite's ±0.06
      // (up to roughly ±0.4 here), enough for a negative excursion to cancel
      // core outright and clamp deposit to exactly 0 — and since the grain is
      // a fixed function of world position, that too was a permanent hole no
      // repetition could fill. Second, it's simply more honest: a spot that
      // catches less material shows more contrast, it doesn't receive nothing.
      // The floor guarantees deposit stays positive wherever core is — and it
      // is what lets the depth above be pushed hard enough for the variant's
      // streaks to read as genuine breaks in the stroke without any of them
      // ever becoming a permanent hole.
      const float CHARCOAL_GRAIN_MUL_FLOOR = 0.08;
      float grainMul = max(CHARCOAL_GRAIN_MUL_FLOOR, 1.0 + computeGrain(wp, shape, dirC) * grainAmp * shape);
      // §6 Dust: a faint speckled ring of loose particles that didn't stick.
      // (1.0 - dist) is load-bearing, not decoration — without it the ring
      // would end in a hard circle right at dist == 1.0, where the discard at
      // the top of main() cuts the dab off (liner's own wick term has exactly
      // that shape and gets away with it only because its amplitude is tiny;
      // this one's isn't). Scaled by tooth so the dust settles on the paper's
      // grain, and by hash so it reads as loose particles rather than a smooth
      // glow.
      float rim = (1.0 - shape) * (1.0 - dist);
      float dust = rim * u_charcoalDust * v_opacity * tooth * hash(wp * 0.9);

      float deposit = clamp(core * grainMul + dust, 0.0, 1.0);
      gl_FragColor = vec4(u_color * deposit, deposit);
      return;
    }

    // The paper-edge bleed that used to live in the superseded coverage
    // splat is gone with it (#330). It was a soft outer halo scaled by the
    // paper's own absorbency, and it belongs back here eventually as a small
    // separate term over the crisp geometric edge — 0.3-0.8px of it on smooth
    // paper, 0.8-2.0px on coarse. Deliberately not reinstated blind: the whole
    // reason the rasterizer was rewritten is that the mark's edge was too soft,
    // and softness is exactly what this adds back.

    // Marker composite (#250, ADR 004 §3, redesigned in "Ревизия v1.5" —
    // see u_original/u_strokeCoverage/u_inkLoad's own comments above):
    // multiply-with-coverage compositing, not a single-pass "over" the way
    // every mode above/below writes. Checked before the liner branch
    // (u_inkMode>0.5 would also be true for marker's own 2.0) since the two
    // modes are mutually exclusive deposit formulas, not layered on top of
    // each other.
    if (u_inkMode > 1.5) {
      // u_original/u_strokeCoverage/u_inkLoad are always exactly the same
      // size and pixel-aligned with the tile this draws into (see
      // RibbonStrokeScratch's own doc comment) — a plain 0..1 UV, no
      // patch-relative origin/size math needed.
      vec2 tileUV = gl_FragCoord.xy / u_resolution;
      vec4 dst = texture2D(u_original, tileUV);
      // Un-premultiply what was already on the layer under this dab
      // *before* this stroke touched it, so the multiply below works
      // against a real color, not one pre-scaled by whatever alpha
      // happened to be there. This recovers the *pigment's own* color at
      // full strength — how much of the pixel that pigment actually covers
      // lives in dst.a, and is applied separately in the composite below
      // (#439: it used to be dropped, which is what made a barely-visible
      // pencil stroke read as solid graphite the moment a marker crossed
      // it). An alpha near zero has no real color to recover (and would
      // blow up dividing by it), so a flat vec3(1.0) stands in; it is
      // multiplied by that same near-zero dst.a below, so the value itself
      // never reaches the output. 1/255 is the smallest alpha an
      // 8-bit-backed accumulation buffer can even represent as nonzero, so
      // anything at or below that is indistinguishable from untouched.
      vec3 effectiveBase = dst.a > 0.004 ? clamp(dst.rgb / dst.a, 0.0, 1.0) : vec3(1.0);
      // Coverage still governs the stroke's silhouette/alpha only (fast-
      // saturating — see u_strokeCoverage's own comment).
      float coverage = texture2D(u_strokeCoverage, tileUV).a;
      // #330 stage 2: the ribbon rasterizer runs this pass once over the whole
      // dirty rect of a batch instead of once per dab quad, so most fragments
      // it now sees were never touched by the stroke at all. With zero coverage
      // and zero inkLoad the maths below reproduces dst exactly — a no-op
      // worth skipping outright, both to save the work and to keep the pass
      // from round-tripping untouched pixels through un-premultiply and back
      // (which can shift them by a least-significant bit on an 8-bit buffer).
      // 1/255 is the smallest alpha this buffer can represent as nonzero.
      if (coverage < 0.004) discard;
      // ADR 004 "Ревизия v1.5" §1 (revised again — Ilya: exactly two
      // *discrete* layers, not a soft asymptote that a single continuous
      // stroke can keep inching up forever): the first pass over a spot
      // should read back as *exactly*
      // the picked color (bare-paper case: film=color at layer1); a second
      // pass over the same spot should read as one further Beer-Lambert
      // layer of the identical translucent film (color*color — physically
      // exact for two stacked layers of one dye); a third and every later
      // pass must leave it there, hard-capped, not still creeping toward
      // black. Modeled as two sequential, independently-saturating stages
      // driven by the same inkLoad — the first stage's own darkness must
      // reach its own ceiling before the second stage starts moving at all
      // (clamp(), not exp(), specifically because exp() never actually
      // reaches 1.0 — it would leave the tiniest continuing drift forever,
      // exactly what this revision exists to remove). MARKER_LAYER1_INK/
      // MARKER_LAYER2_INK (how much inkLoad each stage needs to fully
      // resolve) are first-pass, uncalibrated numbers — verify by eye and
      // retune, same status every other first-pass constant here carries.
      //
      // SCOPE, decided 2026-07-28 (Ilya): this ceiling is **per stroke**, not
      // global. Each stroke gets its own RibbonStrokeScratch, so u_original is
      // whatever the previous stroke already darkened and inkLoad restarts at
      // zero — lift the stylus, go over the same spot again, and the multiply
      // applies afresh (color^2 after one stroke, color^4 after two). Making it
      // global would mean carrying a persistent per-pixel pigment load on the
      // layer, at real memory cost per tile; weighed against how rarely anyone
      // stacks marker passes deliberately, it isn't worth it. A deliberate
      // limitation, not an oversight — don't "fix" it without reopening that
      // trade.
      float inkLoad = texture2D(u_inkLoad, tileUV).a;
      const float MARKER_LAYER1_INK = 0.6;
      const float MARKER_LAYER2_INK = 1.2;
      float layer1 = smoothstep(0.0, MARKER_LAYER1_INK, inkLoad);
      float layer2 = smoothstep(0.0, MARKER_LAYER2_INK, max(inkLoad - MARKER_LAYER1_INK, 0.0));
      // Beer-Lambert-style multiply for a translucent marker film (ADR 004
      // "Контекст" — physically correct for overlapping translucent dye,
      // unlike graphite/ink's saturating "over" coverage below) — two
      // sequential stages, one per capped layer. Both stages are pure
      // multiplies, so the whole film collapses to a single transmittance
      // factor that can be applied to any base: mix(1,C,l) applied twice is
      // just base * F1 * F2. Written that way because the composite below
      // needs the same film over *two* different bases.
      vec3 film = mix(vec3(1.0), u_color, layer1) * mix(vec3(1.0), u_color, layer2);
      // Alpha bookkeeping: blend the *original* dst.a toward 1.0 by
      // *coverage* (silhouette, not darkness) — mirrors how graphite/
      // liner's own deposit already approaches full coverage under
      // repeated overlapping passes rather than stacking past it, and
      // keeps alpha independent of how dark the color mix above ends up.
      // This is exactly the Porter-Duff union a_s + a_d - a_s*a_d with the
      // stroke's coverage as a_s, which is why the colour term below is the
      // matching separable-blend formula and not something ad hoc.
      float newAlpha = mix(dst.a, 1.0, coverage);
      // #439: the standard separable-blend composite (the PDF/CSS
      // mix-blend-mode formula), weighted by how much of the pixel the
      // destination pigment actually covers. Three parts, and *all three*
      // matter — the old code kept only the middle one and then forced its
      // weight to 1, which is what conflated "faint" with "pale-coloured":
      //   1. where the film lands on bare paper (1-dst.a) it reads as the
      //      picked swatch colour, exactly as ADR 004 "Ревизия v1.5" §1
      //      requires (paper assumed white — same standing approximation as
      //      effectiveBase's fallback above, and same reason: this layer
      //      cannot see what is composited beneath it);
      //   2. where it lands on existing pigment (dst.a) it multiplies that
      //      pigment, which is the Beer-Lambert behaviour marker exists for;
      //   3. what the stroke's own silhouette does not cover (1-coverage)
      //      passes through untouched.
      // Each term already carries its own alpha weight, so the sum is
      // premultiplied by construction — no divide, and componentwise it
      // cannot exceed newAlpha. With coverage=0 it reproduces dst exactly,
      // which is what makes the discard above a true no-op skip.
      vec3 premultResult =
          coverage * (1.0 - dst.a) * film
        + coverage * dst.a * (effectiveBase * film)
        + (1.0 - coverage) * dst.a * effectiveBase;
      // Premultiplied output. Unlike every other writer in this shader this
      // pass is drawn with blending *off* (AccumulationBuffer.
      // beginReplaceDraw) — it recomputes the finished pixel rather than
      // contributing an increment, so what is written here is the result,
      // not something still to be composited.
      gl_FragColor = vec4(premultResult, newAlpha);
      return;
    }

    // Fineliner (#242/#245, ADR 003 sections 4/6/8): a different deposit
    // formula from graphite's below - no computeGrain dither (liner's own
    // "micropores" come from the paper-contact term itself, not a separate
    // noise function), and its own pressure-dependent paper-contact term
    // instead of graphite's fill/effectiveCatch. paperCatch and shape above
    // are already safe, portable, deterministic values (a single texture2D
    // sample of a value baked once offline, and pure smoothstep/exp
    // arithmetic) - see paperCatch's own comment on why that matters for a
    // shared canvas. This branch only adds equally-safe multiply/mix/clamp
    // on top, no new hash or noise function and no finite-difference of a
    // texture sample.
    if (u_inkMode > 0.5) {
      // ADR section 6 deposit-pressure floor: DabShapingProfile used to bake
      // this into the *stored* Dab.pressure at record time, which collapsed
      // v_pressure's whole range down to [0.94, 1.08] here - fine for the
      // floor itself, but it also fed into the paper-contact term below and
      // made every touch (light or firm) look identical, which is wrong (a
      // real fineliner should show much more paper grain at a genuinely
      // light touch - #245). Computed here instead, straight from the real,
      // unmapped per-fragment pressure, so both this floor and the contact
      // term below see the true touch weight.
      float depositPressure = mix(0.94, 1.08, v_pressure);

      // ADR section 8 paper contact (revised #245): pressure now genuinely
      // controls how much of the paper's own texture shows through - same
      // fill/effectiveCatch mechanism graphite uses below, just with a much
      // gentler cap so paper never fully disappears even at full pressure.
      // At near-zero pressure this reduces to raw paperCatch (grain clearly
      // visible); LINER_FILL_CAP is a first-pass constant, not yet
      // calibrated against a real device.
      const float LINER_FILL_CAP = 0.55;
      float linerFill = smoothstep(0.0, 1.0, v_pressure) * LINER_FILL_CAP;
      float paperContact = mix(paperCatch, 1.0, linerFill);
      float core = depositPressure * v_opacity * shape * paperContact;

      // Wick/halo (ADR section 4): a soft absorption ring reusing the same
      // edge falloff 'shape' already computes (1-shape rises from 0 in the
      // solid interior to 1 right at the rim) instead of a second edge mask
      // - stronger on absorbent paper (paperCatch low) and on a slow/
      // dwelling stroke. v_opacity already bakes in the speed/dwell
      // response deterministically at record time (bakeDabOpacity's liner
      // branch and _paintDwellDab, both in engine/index.ts) - no new
      // per-viewer-nondeterministic input here, and no fiber-direction bias
      // in v1 (ADR's own 'Потом' follow-up list - deliberately isotropic,
      // this is a first pass, not final tuning).
      //
      // #452 continues that same profile *past* the mark's own edge, where the
      // ink actually goes: inside (dist <= 1.0) this is unchanged, and outside
      // it decays across the band the vertex stage opened up (v_wick wide, see
      // DAB_VERT). One amplitude for both halves on purpose - the two meet at
      // dist == 1.0 with (1.0 - shape) == 1.0 and decay == 1.0, so there is no
      // step at the mark's edge to read as a drawn outline.
      //
      // The decay is exponential (LINER_WICK_FALLOFF), not linear, because
      // this term accumulates: dabs are laid down a fraction of a radius apart
      // and blended saturating "over", so a pixel just outside the edge is
      // written by a dozen dabs in one pass and reaches near-full ink no
      // matter how small each single contribution was. A flat-ish profile
      // would therefore not read as a soft spread at all - it would just be a
      // wider line with a hard edge one band further out (the whole trap this
      // approach had to be tuned around; the alternative was giving the liner
      // its own stroke-coverage buffer, as the marker needed in #330). An
      // exponential puts the saturating part in the first fraction of the band
      // and leaves the rest a real gradient - which is also how ink behaves on
      // paper. Measured at this value: 0.85 core / 0.40 / 0.15 / 0.013 across
      // successive rows outward (see LINER_WICK_PX's own note).
      //
      // Normalized to hit exactly 0.0 at the band's outer rim rather than
      // being cut off at exp(-K): the quad ends there, and a term with any
      // amplitude left at that boundary draws a hard circle around every
      // single dab (see the charcoal branch's own dust-ring comment, which
      // gets away with the shape only because its amplitude is tiny).
      const float LINER_WICK_FALLOFF = 2.5;
      const float LINER_WICK_AMP = 0.4;
      float bandT = clamp((dist - 1.0) / max(v_wick, 1e-4), 0.0, 1.0);
      float decay = (exp(-LINER_WICK_FALLOFF * bandT) - exp(-LINER_WICK_FALLOFF))
                  / (1.0 - exp(-LINER_WICK_FALLOFF));
      float wickProfile = dist <= 1.0 ? (1.0 - shape) : decay;
      float paperAbsorbency = 1.0 - paperCatch;
      float wick = wickProfile * paperAbsorbency * v_opacity * LINER_WICK_AMP;
      float deposit = clamp(core + wick, 0.0, 1.0);
      gl_FragColor = vec4(u_color * deposit, deposit);
      return;
    }

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

// Растушёвка/smudge (#14, reworked four times; #416 is this round — the
// carried reservoir became a *raster imprint* instead of one scalar).
//
// Every earlier round carried one number per user (how much graphite the
// stump holds) plus one color, and decided per dab — from the *average* of
// the patch under it — whether that whole dab picked up or laid down. That
// shape is what #416 reported as a white halo: a dab straddling a dark line
// always averages darker than the reservoir, so the entire disc went into
// pickup (erase) mode, including the blank paper beside the line where the
// previous pass had just deposited. Deposit only switched on once the line
// had left the patch entirely — a full brush radius away — so a band that
// wide around every line was permanently scrubbed clean while graphite piled
// up beyond it. A single scalar cannot pick up on one side of a dab and lay
// down on the other, which is exactly what smearing across an edge is.
//
// So the reservoir is now a texture the size of the copied patch, holding
// premultiplied RGBA — the imprint the stump carries, in the dab's own
// normalized square (uv (0,0)..(1,1) spans the patch). Per dab, in order:
//
//   1. The patch of canvas under the dab is copied out — since #514, out of
//      every tile the dab overlaps rather than only out of a dab that fit
//      inside one (see SmudgePainter.gatherPatch).
//   2. SMUDGE_PICKUP_FRAG (below) refreshes the imprint toward that patch:
//      `carried' = mix(carried, patch, rate)`, per texel. Because both are
//      addressed in the dab's own normalized square and the imprint is
//      re-anchored to wherever the dab now is, the imprint travels with the
//      brush on its own — the offset between consecutive dabs *is* the
//      smear, with no explicit "pick up behind / lay down ahead" contacts
//      to tune (round 3 needed three of those; this needs none).
//   3. SMUDGE_TRANSFER_FRAG (below) lays it down per pixel as
//      `dst' = dst*(1-a) + carried*a*tooth`, split across the two draws the
//      engine already issued: an erase-blend pass writing alpha `a`
//      (dst *= 1-a) and an additive pass writing `carried*a*tooth`. Both
//      passes run this same shader with the same uniforms and compute `a`
//      with the same expression — that identity is what keeps the pair one
//      transfer rather than two loosely-related ones, so it must survive any
//      future edit to how `a` is weighted.
//
// What that buys beyond killing the halo: a pixel next to a line receives
// its share of `carried` in the very same dab that takes from the line, so
// there is no "graphite arrives later" lag at all; and holding the brush
// still is self-limiting rather than destructive, since the imprint
// converges to whatever sits under it and the transfer degenerates to
// identity (round 3 needed a headroom correction bolted onto the reservoir
// drain to approximate that).
//
// `tooth` is the one term that deliberately breaks the exact-lerp symmetry,
// and only on the deposit side (smudgeGrain.ts): it redistributes the
// material across the paper's grain — ridges first, pressure driving it
// into the valleys — around a mean of 1, so the amount laid down is
// unchanged while the texture is re-created. At relief 0 it is exactly 1 and
// the pair is the plain lerp again.
//
// Both passes also weight `a` itself by the paper's own catch. That alone
// does not preserve grain and was never enough to (it only makes the
// flattening slower in the valleys, since the material laid down is a
// flat average either way) — it is `tooth` that puts texture back.
export const SMUDGE_PICKUP_FRAG = `
  precision highp float;

  uniform sampler2D u_patch;    // canvas patch under this dab (premultiplied)
  uniform sampler2D u_carried;  // the imprint as of the previous dab, same normalized square
  uniform float u_rate;         // 0..1 — how much of the imprint this dab refreshes (1 = prime it outright)
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
    // Straight per-texel refresh, blending disabled by the caller: this
    // writes the imprint's new value outright, it does not accumulate onto
    // the previous one (the previous one is an input here, u_carried).
    // Not named "patch": that is a keyword in desktop GLSL 4, which is what
    // ANGLE translates this shader into on some platforms.
    vec4 under = texture2D(u_patch, v_uv);
    float rate = u_rate * mix(1.0, under.a, u_alphaPickup);
    vec4 picked = mix(texture2D(u_carried, v_uv), under, rate);
    gl_FragColor = mix(picked, u_paint, u_paintLoad);
  }
`;

export const SMUDGE_TRANSFER_FRAG = `
  precision highp float;

  uniform sampler2D u_paperHeightMap;
  uniform vec2 u_paperScale;
  uniform vec2 u_paperOrigin;
  uniform vec2 u_paperTexSize;
  uniform float u_hardness;
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

  void main() {
    // Circular only (v1) — DAB_VERT always sets u_aspectRatio=1/u_angle=0
    // for a smudge dab (see SmudgePainter.paintOneDab), so v_localUV is already
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
    float a = clamp(u_strength * shape * effectiveCatch, 0.0, 1.0);

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
`;

export const DISPLAY_VERT = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

/** (#536, §17.46) The screen cache onto the canvas, texel for texel. */
export const SCREEN_BLIT_FRAG = `
  precision mediump float;
  uniform sampler2D u_tex;
  varying vec2 v_uv;
  void main() { gl_FragColor = texture2D(u_tex, v_uv); }
`;

// Composites one layer onto the composite FBO with opacity.
// Blend mode: ONE, ONE_MINUS_SRC_ALPHA  →  Porter-Duff "over"
// Passes the layer's own premultiplied color through (scaled by opacity)
// rather than discarding it — each layer's accumulation buffer already
// carries the real per-stroke colors baked in by DAB_FRAG.
/** (#536, ADR 011 s17.12) A layer tile while a wash on it is still
 *  "running": the tile's canonical pixels (u_after) with what the screen
 *  showed before the settle (u_before) mixed back in by u_hold, which the
 *  engine eases from 1 to 0 over WC_REVEAL_MS. Presentation only - the tile
 *  itself already holds the dry target - so what the eye sees after pen-up
 *  is the paint converging on where the settle put it, rather than the
 *  settle arriving all at once. Both textures are premultiplied, so a
 *  linear mix is a valid blend; the result is scaled by the layer's opacity
 *  exactly as LAYER_COMPOSITE_FRAG scales a plain tile. */
export const WASH_REVEAL_FRAG = `
  precision highp float;
  uniform sampler2D u_after;
  uniform sampler2D u_before;
  uniform sampler2D u_wetMask;
  uniform float u_hold;
  uniform float u_opacity;
  uniform float u_motionGain;
  uniform float u_motionAge;
  uniform vec2 u_texel;
  uniform vec2 u_motionOrigin;
  varying vec2 v_uv;
  float ink(vec4 c) { return max(0.0, c.a - dot(c.rgb, vec3(0.3333333))); }
  float wet(vec2 uv) {
    vec4 m = texture2D(u_wetMask, uv);
    return m.a * smoothstep(0.025, 0.18, m.b);
  }
  float pairInk(vec2 uv) {
    return 0.5 * (ink(texture2D(u_before, uv)) + ink(texture2D(u_after, uv)));
  }
  void main() {
    vec4 after = texture2D(u_after, v_uv);
    vec4 before = texture2D(u_before, v_uv);
    if (u_motionGain > 0.0 && u_hold > 0.0) {
      // Local brightness correspondence to the actual intermediate target.
      // Bounded by two texels; not an offline particle or global flow solve.
      vec2 d = 2.0 * u_texel;
      vec2 gradient = vec2(
        pairInk(v_uv + vec2(d.x, 0.0)) - pairInk(v_uv - vec2(d.x, 0.0)),
        pairInk(v_uv + vec2(0.0, d.y)) - pairInk(v_uv - vec2(0.0, d.y))
      ) * 0.25;
      float change = ink(after) - ink(before);
      vec2 flow = -change * gradient / (dot(gradient, gradient) + 0.002);
      flow *= min(1.0, 2.0 / max(length(flow), 0.0001));
      // Presentation circulation, explicitly artistic, not water velocity.
      // World coordinates keep the phase continuous across layer tiles.
      vec2 world = u_motionOrigin + vec2(v_uv.x, 1.0 - v_uv.y) / u_texel;
      float phase = u_motionAge * 0.00055;
      vec2 stir = vec2(cos(world.y * 0.035 + phase) * sin(world.x * 0.03 + phase),
        -0.8571429 * cos(world.x * 0.03 + phase) * sin(world.y * 0.035 + phase));
      vec2 edgePx = min(v_uv, 1.0 - v_uv) / u_texel;
      float edgeGate = smoothstep(0.0, 4.0, min(edgePx.x, edgePx.y));
      vec2 shift = (flow + 2.5 * stir) * u_texel * u_motionGain * edgeGate;
      // Both sides and the midpoint must be wet: cannot drag through paper.
      float gate = min(wet(v_uv), min(wet(v_uv - shift), wet(v_uv - shift * 0.5)));
      vec2 uv = clamp(v_uv - shift * gate, 0.5 * u_texel, 1.0 - 0.5 * u_texel);
      before = texture2D(u_before, uv);
    }
    vec4 c = mix(after, before, u_hold);
    gl_FragColor = vec4(c.rgb * u_opacity, c.a * u_opacity);
  }
`;

/** (#536, s17.17) One arithmetic step between two same-sized fields, for
 *  the wet diffusion's bookkeeping: mode 0 is the MOBILE share of what a
 *  settle has to move, u_k * max(a - b, 0) - the deposit less what was
 *  already settled, never negative because deposits only add; mode 1 is
 *  a + u_k * b, which puts the fixed part aside (k = -1) and adds the moved
 *  part back (k = 1). Blend off; whole quad. */
export const WC_FIELD_OP_FRAG = `
  precision highp float;
  uniform sampler2D u_a;
  uniform sampler2D u_b;
  uniform float u_k;
  uniform float u_mode;
  /** Mode 2: the colour record of a ONE-paint wash from its deposit - the
   *  mass in a's .b (amount x strength) times u_tau, scaled as the ink pass
   *  scales it. What the diffusion would have produced for a single paint,
   *  in one pass instead of the schedule. */
  uniform vec3 u_tau;
  /** Mode 3: a + b - c, three fields - the reveal's kept picture plus what a
   *  live batch just changed (s17.12): the tile after the batch less the
   *  tile before it. */
  uniform sampler2D u_c;
  /** (s17.23) Mode 4: a mask, rising from u_k to 4 u_k of a.a. Mode 5: a 3x3
   *  binomial blur of a at u_dir texels of stride.
   *
   *  The rim (s17.23, s17.24): paint inside a footprint goes to the edge of
   *  the WATER it sits in. u_d is the water front's cost texture
   *  (WC_WATER_FRONT_FRAG), u_band = (budget, band width) over its costMax.
   *  Mode 6 writes the BAND texture - r the band, the last width cells
   *  inside the budget, g inside, the domain the water wets, each soft over
   *  one cell. Mode 7 is the paint to move, u_k * a * inside; mode 8 puts it
   *  back: a * (1 - u_k * inside) + band * b / c, with b the moved paint
   *  gathered and c the band gathered by the same kernel, so what the
   *  interior lost lands on the band around it, mass kept to the kernel's
   *  approximation. Mode 10 seeds the cost from a deposit: 0 where a.a is
   *  above u_k, 1 (unreached) elsewhere. Mode 11 extends a coverage record
   *  (a) over the domain (u_d.g): the silhouette and the standing-water
   *  record (u_k) reach as far as the water did. */
  uniform vec2 u_dir;
  uniform sampler2D u_d;
  uniform sampler2D u_e;
  uniform vec2 u_origin;
  uniform vec2 u_size;
  uniform vec2 u_band;
  // (s17.26) Fit a record into its 8 bits WITHOUT changing its channel
  // ratios: a rim gathers three times a body's mass, and for a yellow the
  // depth's blue channel overflowed alone - a per-channel clamp turned the
  // rim magenta and cyan, texel by texel. Scaling the whole vec4 keeps the
  // colour (and water, paper, strength ratios) and loses only the mass
  // past the ceiling.
  // (#680, s17.80) The field's corner and scale in world px: x, y in field
  // texels as the paper maps them, z world px per texel (0: no world, the
  // tideline's patches off).
  uniform vec3 u_world;
  float wcRimHash(vec2 p) {
    p = 17.0 * fract(p * 0.3183099 + vec2(0.11, 0.17));
    return fract(p.x * p.y * (p.x + p.y));
  }
  float wcRimNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 w = f * f * (3.0 - 2.0 * f);
    return mix(mix(wcRimHash(i), wcRimHash(i + vec2(1.0, 0.0)), w.x), mix(wcRimHash(i + vec2(0.0, 1.0)), wcRimHash(i + vec2(1.0, 1.0)), w.x), w.y);
  }
  // (#680, s17.87) Sample fixed world-space fibre fields. Rotating wp by
  // the local dome gradient warped the noise into concentric arcs inside
  // merged washes. The gradient now only weights three fixed orientations;
  // it never changes their sampling coordinates.
  float wcFibre(vec2 wp, vec2 radial) {
    vec2 d0 = vec2(1.0, 0.0);
    vec2 d1 = vec2(0.5, 0.8660254);
    vec2 d2 = vec2(-0.5, 0.8660254);
    vec3 n = vec3(
      wcRimNoise(vec2(dot(wp, d0) * 0.03, dot(wp, vec2(-d0.y, d0.x)) * 0.35)),
      wcRimNoise(vec2(dot(wp, d1) * 0.03, dot(wp, vec2(-d1.y, d1.x)) * 0.35) + vec2(5.0, 9.0)),
      wcRimNoise(vec2(dot(wp, d2) * 0.03, dot(wp, vec2(-d2.y, d2.x)) * 0.35) + vec2(17.0, 3.0)));
    float r = length(radial);
    vec2 direction = radial / max(r, 1e-6);
    vec3 weights = vec3(dot(direction, d0), dot(direction, d1), dot(direction, d2));
    weights *= weights;
    weights *= weights;
    weights = mix(vec3(1.0), weights, smoothstep(0.004, 0.02, r));
    vec3 fibres = vec3(0.4) + 1.9 * smoothstep(vec3(0.58), vec3(0.85), n);
    return dot(fibres, weights) / max(dot(weights, vec3(1.0)), 1e-6);
  }
  #define WC_FIELD_FIT(v) ((v) / max(1.0, max(max((v).r, (v).g), max((v).b, (v).a))))
  // (s17.25) The rim's deposition profile: the tail's weight against the
  // sharp peak, its floor on a paper crest, and the height window that
  // counts as a valley (paper height ~0.5 +/- 0.19).
  const float WC_RIM_TAIL = 0.6;
  const float WC_RIM_TAIL_TIDE = 0.0;
  const float WC_RIM_TAIL_FLOOR = 0.25;
  const float WC_RIM_VALLEY_LO = 0.35;
  const float WC_RIM_VALLEY_HI = 0.6;
  // (s17.26) How much rim a texel keeps where the record says no water stood.
  const float WC_RIM_DRY_FLOOR = 0.15;
  // (s17.37) The landing puddle's edge against the stroke's contour, per length.
  const float WC_BACKRUN_GAIN = 2.5;
  // (#680, s17.76) The tideline gathers at the CONVEX stretches of the edge -
  // a stroke's ends, the outside of a turn - where evaporation runs fastest
  // and the capillary flow carries the paint; along a straight side it is
  // faint (the archive's photographs; "не по всему контуру"). Convexity is
  // the share of the domain in a ring around the texel: half on a straight
  // side, less at a cap. The side keeps WC_TIDE_SIDE of the weight; the
  // relocation is normalised by the gathered profile, so the mass a side
  // gives lands on the nearest cap within the kernel's reach.
  const float WC_TIDE_SIDE = 0.3;
  const float WC_TIDE_RING_TX = 10.0;
  // (#680, s17.80) The tideline in patches, not all round: a coarse field of
  // the sheet (world px, u_world) opens it over a minority of the contour
  // and leaves WC_RIM_PATCH_FLOOR of it elsewhere. On the band's take (.g)
  // AND its profile (.b): the landing is normalised by the gathered profile,
  // so a weaker profile alone came back as the same rim - scaling what is
  // taken leaves the paint in the body where there is no rim.
  const float WC_RIM_PATCH_SCALE = 0.012;
  const float WC_RIM_PATCH_LO = 0.45;
  const float WC_RIM_PATCH_HI = 0.6;
  const float WC_RIM_PATCH_FLOOR = 0.1;
  // (s17.27) The share of the mark's standing level below which its water
  // did not stand: the front's seed ends there.
  const float WC_SEED_FILM_LO = 0.15;
  const float WC_SEED_FILM_HI = 0.3;
  // A near step: the puddle's edge is where the RELAXATION starts, not a
  // ramp of preset cost - a ramp gave the backrun a smooth arc, the
  // relief-run front gives it the photographs' fingers.
  const float WC_SEED_DEEP_LO = 0.78;
  const float WC_SEED_DEEP_HI = 0.84;
  varying vec2 v_uv;
  // (s17.29) Mode 15, the carry: how much of a texel's paint goes to the
  // neighbour at uvj, before normalisation - zero unless the neighbour is
  // in the domain (cost at most u_band.x) and further along the cost than
  // the texel (the water runs outward), else the CONDUCTANCE of the step
  // (its length over its cost in cells) to the power u_size.x. u_size.y is
  // costMax, u_origin.x the stride's length in texels.
  const float WC_CARRY_TAPER = 1.6;
  // (s17.43) How much of the sheet's capacity for carried paint is gone at
  // the front: the balance the flow settles to is paint proportional to
  // capacity, so this is the density at the front against the source's.
  const float WC_CARRY_TAIL = 0.85;
  // 1.0 = OFF, measured (s17.38): at 0.3 the balance drew the sheet's
  // tooth as a net over the invasion zone, at 0.6 a blotch over every
  // flat wash - and no fingers at either, because this sheet's relief has
  // no 60-90 px channels to carry them (the spectrum of s17.25). Kept as
  // the operator's shape for a sheet that has them.
  const float WC_CARRY_RIDGE = 1.0;
  const float WC_CARRY_VALLEY_HI = 0.46;
  const float WC_CARRY_CREST_LO = 0.54;
  float wcCarryWeight(float ci, vec2 uvi, vec2 uvj) {
    if (uvj.x < 0.0 || uvj.y < 0.0 || uvj.x > 1.0 || uvj.y > 1.0) return 0.0;
    float cj = texture2D(u_d, uvj).r;
    if (cj > u_band.x) return 0.0;
    float d = (cj - ci) * u_size.y;
    if (d <= 1e-3) {
      // A wet source's interior must supply its draining edge. The positive
      // cost-gradient formula tends to 4^POW as the gradient tends to zero.
      // Keep this exchange inside the source plateau; every intervening
      // texel must belong to it, so a stride cannot jump a dry gap.
      if (u_tau.z <= 0.0 || u_band.y <= 0.0 || ci > 1e-5 || cj > 1e-5 || u_origin.x > 8.0) return 0.0;
      if (u_tau.y <= u_tau.x) return 0.0;
      float minV = 4.0 * min(texture2D(u_e, uvi).a, texture2D(u_e, uvj).a);
      if (minV <= 0.0) return 0.0;
      for (int p = 1; p < 8; p++) {
        if (float(p) < u_origin.x) {
          vec2 uvp = mix(uvi, uvj, float(p) / u_origin.x);
          float vp = 4.0 * texture2D(u_e, uvp).a;
          if (texture2D(u_d, uvp).r > 1e-5 || vp <= 0.0) return 0.0;
          minV = min(minV, vp);
        }
      }
      // V-phase is an experimental closure, not the PaperWetness clock.
      // The path's weakest fluid node limits a coarse exchange too.
      return pow(4.0, u_size.x) * smoothstep(u_tau.x, u_tau.y, minV);
    }
    // (s17.35) ...fading with how far along the front the RECEIVER lies:
    // the flux weakens toward the horizon, so the moved paint lies along the
    // way, dense near the footprint and thin at the tips, instead of piling
    // in a band at the horizon - the ring twice the footprint's density that
    // read as "пустое место, потом линия растекания". The sheet filters the
    // pigment as the water goes on (the design thread's immobilisation, in
    // its cheapest form).
    // (s17.43) ...all the way to nothing at the front, on a curve: at 0.75
    // the flow still filled the domain to a level and stopped, and the
    // domain's edge inside a wet wash was a crisp line of colour change
    // (Ilya's two annotations, "чёткая линия смены цвета", "вот эта линия"
    // - the lighter band of the second paint ending in a line inside the
    // first). The pigment lags the water it rides in; its density falls
    // toward the front and the edge is a fade, not a step.
    float fade = pow(1.0 - smoothstep(0.0, u_band.x, cj), WC_CARRY_TAPER);
    // (s17.38) ...and by the sheet's relief at the receiver: a valley takes
    // the flow freely, a crest with a penalty - not a wall, or the domain
    // would come apart into islands. The front's cost already prefers the
    // valleys; this is what keeps the moved paint IN them instead of
    // filling the domain evenly (the design thread: capillary
    // conductivity, not a higher power on the gradient). The height is the
    // cost texture's .g, written by the front's relaxation.
    return pow(min(u_origin.x / d, 4.0), u_size.x) * fade;
  }
  // (s17.38) The sheet's capillary conductance at a texel: a valley takes
  // the flow freely, a crest with a penalty - not a wall, or the domain
  // would come apart into islands. Applied to the AMOUNT that crosses into
  // the receiver, not to the split between neighbours (there it cancelled
  // in the normalisation and changed nothing). The front's cost already
  // prefers the valleys; this keeps the moved paint IN them instead of
  // filling the domain evenly - the design thread's "attenuate the
  // outgoing flux", the cheapest form of settling on the way. The height
  // is the cost texture's .g, written by the front's relaxation.
  // At the sheet's TOOTH, not its grain: a 3x3 box of the height at three
  // texels' stride (the dry contact's scale, s17.29). At the grain the
  // balance came out as a speckle over the invasion zone; the
  // photographs' fingers are the valley network a few texels wide.
  float wcCapillary(vec2 uv) {
    float h = 0.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) h += texture2D(u_d, uv + vec2(float(i), float(j)) * u_dir * (3.0 / max(u_origin.x, 1.0))).g;
    h /= 9.0;
    return mix(WC_CARRY_RIDGE, 1.0, 1.0 - smoothstep(WC_CARRY_VALLEY_HI, WC_CARRY_CREST_LO, h));
  }

  vec2 wcCarryDir(int k) {
    return k == 0 ? vec2(1.0, 0.0) : k == 1 ? vec2(-1.0, 0.0) : k == 2 ? vec2(0.0, 1.0) : vec2(0.0, -1.0);
  }
  void main() {
    vec4 a = texture2D(u_a, v_uv);
    vec4 b = texture2D(u_b, v_uv);
#ifdef FIELD_OP_HIGH
#ifndef FIELD_OP_CARRY
    if (u_mode > 19.5) {
      // (s17.44) max(a, b) per channel: the settle's extended coverage merged
      // into a tile's coverage that the gesture may have gone on stamping
      // while the settle ran, instead of overwriting it.
      gl_FragColor = max(a, b);
      return;
    }
    if (u_mode > 18.5) {
      // (s17.42) The group tide's seeds, from the wash's COVERAGE (a.a, the
      // union of every operation's domain) instead of one operation's cost:
      // with u_dir.x set, the inward pass's seed (inside unreached at 1,
      // outside the source at 0 - mode 12's convention, .b empty: no
      // "earlier mark" in one component); without it, a stand-in for the
      // outward cost, 0 inside and 1 outside, so mode 6 reads the whole
      // union as the domain with the dome full everywhere.
      float m = smoothstep(u_k, u_k * 4.0, a.a);
      gl_FragColor = u_dir.x > 0.0 ? vec4(m, 0.0, 0.0, 1.0) : vec4(1.0 - m, 0.0, 0.0, 1.0);
      return;
    }
    if (u_mode > 17.5) {
      // (s17.41) Mode 13 over the DOME (u_d.a) instead of the footprint: a
      // wet landing re-mobilises the earlier paint across the puddle its
      // water joined, most under the brush and less toward the front, so
      // the two paints mix both ways within the puddle - not only the new
      // one into the old. Under the footprint alone the earlier mark kept
      // its own contour through the new one, and the mixing ran one way
      // ("одна линия растеклась, а другая нет"). The share: the new water's
      // where the new paint lies, at least WC_REMOB_DOME of the dome
      // elsewhere.
      // (s17.42) The floor comes in as u_origin.x: WC_REMOB_DOME as a rule,
      // 1.0 under the group-dry oracle, where the earlier paint never dried
      // and all of it under the dome is one liquid with the new.
      float dome = texture2D(u_d, v_uv).a;
      if (u_origin.y > 0.5) {
        vec4 physicalMobile=texture2D(u_c,v_uv), physicalFixed=texture2D(u_e,v_uv);
        float physicalShare=max(physicalMobile.a/max(physicalMobile.a+physicalFixed.a,5e-5),u_origin.x*dome);
        vec4 physicalAdd=u_k*physicalShare*dome*physicalFixed;
        float physicalRoom=max(1.0-max(max(physicalMobile.r,physicalMobile.g),max(physicalMobile.b,physicalMobile.a)),0.0);
        float physicalPeak=max(max(physicalAdd.r,physicalAdd.g),max(physicalAdd.b,physicalAdd.a));
        gl_FragColor=a+(u_k*physicalShare*dome*b)*min(1.0,physicalRoom/max(physicalPeak,5e-5));
        return;
      }
      float share = max(a.a / max(a.a + b.a, 5e-5), u_origin.x * dome);
      vec4 add = u_k * share * dome * b;
      float room = max(1.0 - max(max(a.r, a.g), max(a.b, a.a)), 0.0);
      float peak = max(max(add.r, add.g), max(add.b, add.a));
      gl_FragColor = a + add * min(1.0, room / max(peak, 5e-5));
      return;
    }
    if (u_mode > 16.5) {
      // (s17.40) The puddle's mixing gate: the coverage with its standing
      // water (.b) scaled by the dome over the footprint (u_d.a).
      gl_FragColor = vec4(a.r, a.g, a.b * texture2D(u_d, v_uv).a, a.a);
      return;
    }
#else
    {
      // (s17.29) One carry step. What moves is the mobile paint (a, all
      // four channels, in the texel's own proportions); what the flow
      // EQUALISES is the total pigment, mobile plus fixed (a.a + b.a): a
      // texel in the domain hands its four axis neighbours a stride away,
      // split by wcCarryWeight, u_k of its excess of total over theirs -
      // never more than its mobile amount - and receives what each
      // neighbour's own split sends this way: donor form, the field is
      // conserved to the eight-bit write. The flow fills the domain to
      // the source's concentration and stops, as water carrying paint
      // into a wet wash does (the photographs' fingers are the body's
      // density, not a line at their tips): moving a fixed share piled it
      // all in single texels at the front, and equalising the mobile
      // amount alone sent a mark's paint and the re-mobilised wash under
      // it into fingers denser than its body, because the wash's settled
      // paint in the domain did not count.
      // Mode 16 is the same step for the COLOUR record (a): the fractions
      // come from the deposit's mobile (u_c) and fixed (u_b) fields, so
      // the two records move by identical fractions.
      // (s17.35) ...and only u_origin.y of the mobile paint TRAVELS at all:
      // the rest stays as if fixed, and the balance the flow equalises is
      // the travelling share against the neighbour's. Equalising the whole
      // mobile field drained a loaded stroke's footprint over a wet wash
      // into the ring around it - the stroke read paler than its own
      // surroundings ("пересекаются, потом пустое место, потом линия
      // растекания"). The photographs keep the body; the sheet filters
      // the pigment while the water goes on (the design thread's
      // immobilisation), and this is its cheapest form: a share that never
      // leaves, no second output buffer.
      // (s17.38) ...and what it equalises is the paint per unit of the
      // sheet's CAPACITY (wcCapillary): a valley holds a full measure, a
      // crest a fraction, so the balance the flow settles to is paint in
      // the valleys, not an even fill of the domain. Weighting the rate
      // alone (the first try) left the equilibrium even - valleys 1.27x
      // the crests before the smoothing, 1.12x after. The photographs'
      // fingers are the balance, not the rate.
      float ci = texture2D(u_d, v_uv).r;
      vec4 out4 = a;
#ifdef FIELD_OP_COLOUR
      const bool colour = true;
#else
      const bool colour = false;
#endif
      vec4 m = colour ? texture2D(u_c, v_uv) : a;
      float trav = u_origin.y;
      // (s17.43) The sheet's capacity for the carried paint falls toward the
      // front: the water that has travelled furthest holds the least pigment
      // (the sheet filters it on the way - the design thread's immobilisation
      // in its balance form). The flow settles to a density proportional to
      // the capacity, so the paint fades out toward the front instead of
      // filling the domain to one level and stopping at a line. Weighting the
      // flux alone (WC_CARRY_TAPER) could not do this: it slows the fill, the
      // balance is the same. Measured on Ilya's yellow/purple pair: the band
      // was a flat tone with a six-texel step at the domain's edge.
      float capI = wcCapillary(v_uv) * (1.0 - WC_CARRY_TAIL * smoothstep(0.0, u_band.x, ci));
      // (s17.43) The NEW paint's own concentration, not the total: a pigment
      // in water spreads whatever other pigment already lies there, and
      // equalising the total kept a stroke's paint inside its footprint
      // wherever the wash under it was dense - and, with the earlier paint
      // re-mobilised before the carry, swept that paint out to the new
      // front and piled it in a line ("чёткая линия смены цвета"). The
      // earlier paint is re-mobilised AFTER the carry now and mixes by
      // diffusion alone, both ways; the fixed field is still read for the
      // colour record's fractions (u_b in mode 16) and nothing else.
      float Ti = trav * m.a / capI;
      if (ci <= u_band.x) {
        float ws[4];
        float wsum = 0.0;
        for (int k = 0; k < 4; k++) { ws[k] = wcCarryWeight(ci, v_uv, v_uv + wcCarryDir(k) * u_dir); wsum += ws[k]; }
        for (int k = 0; k < 4; k++) {
          vec2 uvj = v_uv + wcCarryDir(k) * u_dir;
          if (uvj.x < 0.0 || uvj.y < 0.0 || uvj.x > 1.0 || uvj.y > 1.0) continue;
          vec4 aj = texture2D(u_a, uvj);
          vec4 mj = colour ? texture2D(u_c, uvj) : aj;
          float cj = texture2D(u_d, uvj).r;
          float capJ = wcCapillary(uvj) * (1.0 - WC_CARRY_TAIL * smoothstep(0.0, u_band.x, cj));
          float Tj = trav * mj.a / capJ;
          // Moving d from i to j lowers Ti by d/capI and raises Tj by
          // d/capJ: the step toward balance is (Ti - Tj) times the pair's
          // series capacity. Both sides evaluate the same expression.
          // The harmonic mean: 1 between two full measures, so the rate of
          // the plain balance is unchanged (the series capacity alone halved
          // it and the drop in a clean puddle lost two thirds of its reach).
          float capIJ = 2.0 * capI * capJ / (capI + capJ);
          // Reuse the path phase already contained in the plateau weight.
          // Applying it to capacity as well keeps weight normalisation from
          // cancelling a thin bridge's conductance. No extra V reads here.
          if (ci <= 1e-5 && cj <= 1e-5) capIJ *= ws[k] / pow(4.0, u_size.x);
          // Give: my share toward j, of my excess over j, capped at what
          // travels here.
          if (ws[k] > 0.0) out4 -= a * (u_k * ws[k] / wsum * min(max(Ti - Tj, 0.0) * capIJ, trav * m.a) / max(m.a, 5e-5));
          // Take: j's share toward me, of its excess over me - the same
          // expression j evaluates on its side.
          if (cj > u_band.x) continue;
          // The incoming flux is exactly zero unless the donor's travelling
          // concentration exceeds ours. Avoid its four path queries then;
          // this changes neither a positive flux nor its normalisation.
          if (Tj > Ti) {
            int back = k == 0 ? 1 : k == 1 ? 0 : k == 2 ? 3 : 2;
            float wj = 0.0, wme = 0.0;
            for (int mm = 0; mm < 4; mm++) {
              float w = wcCarryWeight(cj, uvj, uvj + wcCarryDir(mm) * u_dir);
              wj += w;
              if (mm == back) wme = w;
            }
            if (wme > 0.0) out4 += aj * (u_k * wme / wj * min(max(Tj - Ti, 0.0) * capIJ, trav * mj.a) / max(mj.a, 5e-5));
          }
        }
      }
      gl_FragColor = WC_FIELD_FIT(max(out4, vec4(0.0)));
      return;
    }
#endif
#ifndef FIELD_OP_CARRY
    if (u_mode > 13.5) {
      // Mode 8 for the tide: the band is the texture's .b, its gather c.b.
      vec4 bd = texture2D(u_d, v_uv);
      vec4 c = texture2D(u_c, v_uv);
      gl_FragColor = WC_FIELD_FIT(a * (1.0 - u_k * bd.g) + bd.b * b / max(c.b, 1e-3));
      return;
    }
    if (u_mode > 12.5) {
      // a + u_k * b where u_d says (its .r): the earlier paint under a
      // footprint re-mobilised by a wet landing (s17.25). As much of it as
      // fits: a clean puddle's amount is most of a byte, and scaling the
      // SUM down to fit took the new paint's pigment with it - a stroke into
      // a puddle came out nearly white. The added part shrinks instead, in
      // its own proportions, so the new paint is never touched.
      // (s17.30) ...and only the share the NEW water can take up: the new
      // mobile amount over the new plus the settled - a clean-water stroke
      // over an equal wash lifts half the wash under it, a light touch a
      // little. All of it (the design thread's "invisible pressure") made
      // a water stroke over a wet wash push nearly every grain of the wash
      // out from under itself: a white band with dark ragged edges.
      float share = a.a / max(a.a + b.a, 5e-5);
      vec4 add = u_k * share * b * texture2D(u_d, v_uv).r;
      float room = max(1.0 - max(max(a.r, a.g), max(a.b, a.a)), 0.0);
      float peak = max(max(add.r, add.g), max(add.b, add.a));
      gl_FragColor = a + add * min(1.0, room / max(peak, 5e-5));
      return;
    }
    if (u_mode > 11.5) {
      // Seed of the inward pass: the outward cost in a.r; everything past
      // the budget (u_k, over costMax) is the source at 0, the domain is
      // unreached at 1.
      float m = step(a.r, u_k);
      // .b: where an EARLIER mark's deposit already lies (u_d), carried
      // through the inward relaxation for the merge below.
      gl_FragColor = vec4(m, 0.0, texture2D(u_d, v_uv).r, 1.0);
      return;
    }
    if (u_mode > 10.5) {
      // The domain straight from the outward cost (u_d, budget u_band.x,
      // cell u_size.x), so the coverage can be extended BEFORE the band is
      // built and the band can read the standing water it records.
      float inside = 1.0 - smoothstep(u_band.x, u_band.x + u_size.x, texture2D(u_d, v_uv).r);
      float r = a.a > 0.002 ? a.r : 0.5 * inside;
      // (#680, s17.84) .g is the pool share now (premultiplied like .r):
      // the texels the front reaches past the coverage carry none.
      // #680: preserve the brush's uneven water within its footprint.
      // Only newly reached paper receives the front's standing level.
      float standing = a.a > 0.002 ? a.b : inside * u_k;
      gl_FragColor = vec4(r, a.a > 0.002 ? a.g : 0.0, standing, max(a.a, inside));
      return;
    }
    if (u_mode > 9.5) {
      // Seed of the outward pass: the footprint (a.a past u_k) at cost 0,
      // everything else unreached at 1 - except the footprint's fringe, which
      // is a RAMP of cost over u_k..4 u_k (u_band.x is one cell of cost),
      // not a step: a live stroke's batches and a replay's one pass round
      // the fringe a code or two apart, and a step there flips whole texels
      // of the domain and its band between the two, where a ramp moves the
      // front by a fraction of a cell.
      // (s17.27) ...and only where the mark's water STOOD (the coverage's
      // record, b.b, against the mark's own standing level u_band.y): a
      // stroke that ran dry along its length seeds its front at its wet
      // start, and the front - the backrun of the photographs - lies inside
      // the stroke where the puddle met the drier body.
      // Two depths of water in the record: the FILM the brush lays along
      // its path (WC_FILM_STAND of the mark's level) seeds at u_size.x, one
      // cell short of the budget, so its front is its own contour; the
      // PUDDLE - where the brush landed, or a wet wash - seeds at zero, and
      // its front runs out INTO the film by the paper's relief and stops a
      // cell short of the film's own cost: the ragged backrun inside a
      // stroke. Where no water stood, unreached.
      float m = 1.0 - smoothstep(u_k, u_k * 4.0, a.a * 2.0);
      float rel = b.b / max(u_band.y, 1e-4);
      float film = smoothstep(WC_SEED_FILM_LO, WC_SEED_FILM_HI, rel);
      float deep = smoothstep(WC_SEED_DEEP_LO, WC_SEED_DEEP_HI, rel);
      // (s17.41) The film seeds wherever the mark laid paint, whatever its
      // standing water: gating it by the standing record (s17.27) put the
      // domain's edge INSIDE a stroke wherever the brush's water ran out or
      // rose over its own film, and the tide's line ran along that inner
      // edge ("подтёк внутри одного мазка"). The dwell test settled where
      // a hard line inside a stroke comes from: the landing puddle (deep
      // seed, backrun by dwell), not a drier stretch of film.
      float cost = a.a * 2.0 > u_k ? mix(u_size.x, m * u_band.x, deep) : 1.0;
      gl_FragColor = vec4(cost, 0.0, 0.0, 1.0);
      return;
    }
    gl_FragColor = vec4(0.0);
#endif
#else
    if (u_mode > 5.5) {
      if (u_mode > 8.5) {
        // (s17.30) The bloom's lift: by the dome (band .a), not the domain.
        gl_FragColor = u_k * a * texture2D(u_d, v_uv).a;
        return;
      }
      if (u_mode > 7.5) {
        vec4 bd = texture2D(u_d, v_uv);
        vec4 c = texture2D(u_c, v_uv);
        gl_FragColor = WC_FIELD_FIT(a * (1.0 - u_k * bd.a) + bd.r * b / max(c.r, 1e-3));
        return;
      }
      if (u_mode > 6.5) {
        gl_FragColor = u_k * a * texture2D(u_d, v_uv).g;
        return;
      }
      // The domain from the outward cost (u_d, budget u_band.x, one cell of
      // cost u_size.x the softness of its edge); the band from the INWARD
      // cost (u_c: how far a texel is from the front, over the paper): the
      // last u_band.y cells inside it, cell u_size.y.
      // (s17.25) The band is a deposition PROFILE, not a mask: a sharp peak
      // in the last cell or two before the front plus a weaker tail over the
      // band's width that only the paper's valleys carry. One relocation
      // lands its mass on this profile (normalised by the gathered profile,
      // mode 8), so the peak can be several times the tail without the
      // total changing: a line of stoppage with structure behind it, which
      // is what the photographs have, rather than a uniform dark strip.
      vec4 inward = texture2D(u_c, v_uv);
      float costOut = texture2D(u_d, v_uv).r;
      float costIn = inward.r;
      float inside = 1.0 - smoothstep(u_band.x, u_band.x + u_size.x, costOut);
      // The line sits on the second ring in from the front, not the first:
      // the first is the stroke's antialiased fringe, where the standing
      // record is fractional and the line came out as a row of dots.
      float sharp = 1.0 - smoothstep(1.5 * u_size.y, 3.0 * u_size.y, costIn);
      float valley = 1.0 - smoothstep(WC_RIM_VALLEY_LO, WC_RIM_VALLEY_HI, inward.g);
      float tail = (1.0 - smoothstep(u_band.y, u_band.y + u_size.y, costIn)) * (WC_RIM_TAIL_FLOOR + (1.0 - WC_RIM_TAIL_FLOOR) * valley);
      // (s17.25) One puddle, one front: where this mark landed wet and its
      // front runs over an earlier mark (inward.b), the two waters merged
      // and there is no line of stoppage - u_k is how wet it landed.
      // The bloom's ring is deep with fingers (the photo's); a stroke's
      // tideline is the line itself with a short tail - a deep tail with
      // valley fingers on every stroke read as a lobed outline.
      float profileBloom = inside * min(sharp + WC_RIM_TAIL * tail, 1.0);
      // (s17.27) ...and the puddle's front inside the film: the last cells
      // the puddle's cost reached before the film's own (u_band.x less one
      // cell, see the seed). The film's texels sit exactly at that cost and
      // are left out by the half-cell margin.
      // u_band.y is the band's width in the INWARD pass's units; the same
      // width in the outward cost's units is u_band.y * u_size.x / u_size.y
      // (one cell of each). Mixed up, the band covered the whole puddle.
      // (s17.31) The backrun LINE at the puddle's front inside the film is
      // gone: on Ilya's layer of single strokes every wet loaded stroke
      // started with a hard dark arc ("кайма в начале, неприятно"), and a
      // stroke crossing its own wet film drew the same arc round the
      // crossing - one puddle has no line inside it. The puddle's front
      // still runs (the seed is unchanged) and the carry still moves its
      // paint, so a landing reads darker with a soft edge, which is what
      // the photographs of a loaded wet stroke show (series 1); the hard
      // dark start of a thin wash (series 2) waits for the dwell test.
      // (s17.37) ...and back, by the landing DWELL (u_tau.x, 0..1): the
      // dwell test showed the hard edge is the front of a puddle the
      // standing brush left, growing with the pause, and absent without
      // one - not a rim of every landing. The seed is the puddle
      // (watercolorPuddleDepth by dwell), the line its front in the film.
      float filmCost = u_band.x - u_size.x;
      float wOut = u_band.y * u_size.x / u_size.y;
      float backrun = u_tau.x * inside * smoothstep(filmCost - wOut, filmCost - 0.4 * wOut, costOut) * (1.0 - smoothstep(filmCost - 0.6 * u_size.x, filmCost - 0.3 * u_size.x, costOut));
      // The puddle's edge weighs WC_BACKRUN_GAIN times the contour per unit
      // of length: the puddle holds the reservoir's dose and its rim dries
      // against the film, the photograph's edge is darker than any contour.
      float profileTide = inside * min(sharp + WC_RIM_TAIL_TIDE * tail, 1.0) + WC_BACKRUN_GAIN * backrun;
      // (s17.26) Where water actually stood, from the coverage's record
      // (b, extended over the domain): a rim forms where a puddle dried,
      // not along a stroke that ran dry. u_origin.x is the mark's own
      // standing level, so the record reads 0..1 against it.
      // ...and the record is read as the most any of the 3x3 around holds,
      // for the same reason: one texel of fringe must not break the line.
      float bb = b.b;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) bb = max(bb, texture2D(u_b, v_uv + vec2(float(i), float(j)) * u_dir).b);
      float stood = clamp(bb / max(u_origin.x, 1e-3), 0.0, 1.0);
      float stoodW = mix(WC_RIM_DRY_FLOOR, 1.0, stood);
      float ring = 0.0;
      for (int k = 0; k < 8; k++) {
        float ang = float(k) * 0.7853982;
        vec2 o = vec2(cos(ang), sin(ang)) * WC_TIDE_RING_TX * u_dir;
        ring += 1.0 - smoothstep(u_band.x, u_band.x + u_size.x, texture2D(u_d, v_uv + o).r);
      }
      float convexW = mix(WC_TIDE_SIDE, 1.0, smoothstep(0.5, 0.25, ring / 8.0));
      // The bloom's band (.r): the wash's paint the drop pushed lands here,
      // wherever the water reached. The tide's band (.b): this mark's own
      // line of stoppage - none where the mark lies over an earlier mark
      // that was still damp or wet (u_origin.y): no dry paper there to stop
      // at, the bloom is the only edge. A merge (u_k) is the wet extreme.
      float over = inward.b * max(u_k, u_origin.y);
      // .a: the DOME over the drop - how much of the wash's paint the bloom
      // lifts here: all of it under the centre, falling to none at the
      // front (s17.30). A uniform lift over the domain left a hard-edged
      // hole; the photographs' light patch is soft-edged with the paint
      // piling at the ring.
      float dome = inside * (1.0 - smoothstep(0.35 * u_band.x, u_band.x, costOut));
      // .g: what the TIDE may take from - the domain less where an earlier
      // mark's paint lies under a wet landing (s17.30). The tide took its
      // share of everything mobile inside, the re-mobilised earlier paint
      // included, and landed it on a band that is zero over the earlier
      // mark: the mass left the overlap for the outer contour, and at the
      // new pass's fringe, where no new paint made up for it, a flat wash
      // showed a light seam along every pass (band 43 against 60 of the
      // earlier pass alone, two-pass rig).
      float rimPatch = 1.0;
      if (u_world.z > 0.0) {
        vec2 wp = (gl_FragCoord.xy + u_world.xy) * u_world.z * WC_RIM_PATCH_SCALE;
        float n = 0.63 * wcRimNoise(wp) + 0.37 * wcRimNoise(wp * 2.7 + vec2(31.4, 17.9));
        rimPatch = mix(WC_RIM_PATCH_FLOOR, 1.0, smoothstep(WC_RIM_PATCH_LO, WC_RIM_PATCH_HI, n));
      }
      gl_FragColor = vec4(profileBloom * stoodW, inside * (1.0 - over) * rimPatch, profileTide * stoodW * convexW * (1.0 - over) * rimPatch, dome);
      return;
    }
    if (u_mode > 4.5) {
      // All four channels: the moved paint is a whole deposit texel.
      vec4 s = vec4(0.0);
      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          float w = (i == 0 ? 2.0 : 1.0) * (j == 0 ? 2.0 : 1.0);
          s += w * texture2D(u_a, v_uv + vec2(float(i), float(j)) * u_dir);
        }
      }
      gl_FragColor = s / 16.0;
      return;
    }
    if (u_mode > 3.5) {
      // Soft, not a step: the deposit's fringe is a code or two, and a live
      // stroke's batches round it differently from a replay's one pass; a
      // step there flips whole texels of the band between the two, a ramp
      // moves them by a fraction.
      float m = smoothstep(u_k, u_k * 4.0, a.a * 2.0);
      gl_FragColor = vec4(m, 0.0, 0.0, 1.0);
      return;
    }
    if (u_mode > 2.5) {
      gl_FragColor = clamp(a + b - texture2D(u_c, v_uv), 0.0, 1.0);
      return;
    }
    if (u_mode > 1.5) {
      gl_FragColor = vec4(a.b * u_tau / 4.0, a.b);
      return;
    }
    // (#680, s17.82) Mode 1 with a world (u_world.z > 0): the added field
    // through the paper's fibres - the puddle settle's far slices.
    // (#680, s17.84) Mode 1 with a world and u_origin.x > 0: the settled
    // paint combed by the hairs where the brush left its surplus - streaks
    // along the travel ("щетинка утащила пигмент за собой"). After the
    // settle, not in the dose: the settle smooths anything finer than about
    // ten px out of the dose (s17.28, s17.82). From the coverage record only
    // (u_c: .r the across-brush coordinate, .g the pool share, both over
    // .a), so the deposit and its colour record take the same factor. The
    // comb averages about one: the pool's paint is regrouped, not added.
    // u_size.x is the hair bundles across the half-width (as the composite
    // counts them), u_origin.x the strength; a = b = the paint, u_k = 1.
    if (u_mode > 0.5 && u_world.z > 0.0 && u_origin.x > 0.0) {
      vec4 cv = texture2D(u_c, v_uv);
      float across = cv.a > 0.004 ? clamp(cv.r / cv.a, 0.0, 1.0) * 2.0 - 1.0 : 0.0;
      float poolHere = cv.a > 0.004 ? clamp(cv.g / cv.a, 0.0, 1.0) : 0.0;
      vec2 wp = (gl_FragCoord.xy + u_world.xy) * u_world.z;
      float drift = wcRimNoise(wp * 0.0012 + vec2(71.0, 13.0));
      vec2 hq = vec2(across * u_size.x, drift * 3.0) + vec2(3.0, 29.0);
      float hair = 0.63 * wcRimNoise(hq) + 0.37 * wcRimNoise(hq * 2.7 + vec2(31.4, 17.9));
      // Only where the across coordinate runs smoothly: at a stop the brush
      // lays stamp over stamp, each with its own centre, the last one wins
      // per texel, and the comb broke into arcs along every seam ("отпечаток
      // пальца"). A jump of the coordinate between neighbours two texels
      // apart, far over what a mark's own width gives, turns the comb off.
      float jump = 0.0;
      for (int k = 0; k < 4; k++) {
        vec2 o = k == 0 ? vec2(2.0, 0.0) : k == 1 ? vec2(-2.0, 0.0) : k == 2 ? vec2(0.0, 2.0) : vec2(0.0, -2.0);
        vec4 cn = texture2D(u_c, v_uv + o * u_dir);
        float an = cn.a > 0.004 ? clamp(cn.r / cn.a, 0.0, 1.0) * 2.0 - 1.0 : across;
        jump = max(jump, abs(an - across));
      }
      float smoothAcross = 1.0 - smoothstep(0.08, 0.2, jump);
      float comb = mix(1.0, 2.0 * smoothstep(0.3, 0.7, hair), u_origin.x * smoothstep(0.08, 0.4, poolHere) * smoothAcross);
      gl_FragColor = WC_FIELD_FIT(a + b * u_k * (comb - 1.0));
      return;
    }
    float fibre = 1.0;
    if (u_mode > 0.5 && u_world.z > 0.0) {
      vec2 radial = vec2(
        texture2D(u_d, v_uv - vec2(3.0 * u_dir.x, 0.0)).a - texture2D(u_d, v_uv + vec2(3.0 * u_dir.x, 0.0)).a,
        texture2D(u_d, v_uv - vec2(0.0, 3.0 * u_dir.y)).a - texture2D(u_d, v_uv + vec2(0.0, 3.0 * u_dir.y)).a);
      // Late slices also contain remobilised core paint in merged washes.
      // Fibre texture belongs to the far halo, outside the core dome.
      float halo = 1.0 - smoothstep(0.02, 0.20, texture2D(u_d, v_uv).a);
      fibre = mix(1.0, wcFibre((gl_FragCoord.xy + u_world.xy) * u_world.z, radial), halo);
    }
    gl_FragColor = u_mode < 0.5 ? max(a - b, vec4(0.0)) * u_k : WC_FIELD_FIT(a + b * u_k * fibre);
#endif
  }
`;

/** (#536, #685) Field bookkeeping without the carry's nested neighbour loops.
 *  The Adreno compiler still crashed on the high half when modes 15/16 shared
 *  a program with modes 10-20. Compile each carry record separately as well:
 *  its deposit/colour choice is static, keeping the linked program small.
 *  The arithmetic and input uniforms are identical to the original modes. */
export const WC_FIELD_OP_HIGH_FRAG = `#define FIELD_OP_HIGH
${WC_FIELD_OP_FRAG}`

export const WC_FIELD_OP_CARRY_FRAG = `#define FIELD_OP_HIGH
#define FIELD_OP_CARRY
${WC_FIELD_OP_FRAG}`

export const WC_FIELD_OP_CARRY_COLOUR_FRAG = `#define FIELD_OP_COLOUR
${WC_FIELD_OP_CARRY_FRAG}`

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

// Blits a raster into a layer's accumulation buffer at a given rect —
// a reference image (#88), fit-centered or placed at a world position, and
// since #446 a pasted selection too. u_imageRect is precomputed in JS (buffer-
// pixel offset/size), so this only has to test whether the current buffer
// pixel falls inside that rect and sample accordingly. Uses DISPLAY_VERT (same
// fullscreen-quad convention as composite/display). Outputs premultiplied
// color, matching every other accumulation-buffer writer (DAB_FRAG) so it
// composites correctly via the same ONE, ONE_MINUS_SRC_ALPHA blend
// AccumulationBuffer.beginDraw() sets up.
//
// (#446) Both y axes are handled explicitly here now, and neither was before.
//
// `v_uv` runs bottom-up (GL's window convention) while u_imageRect — like
// every other buffer-pixel value in this engine — is app-space top-down, so
// the position has to be flipped exactly the way TRANSFORM_BLIT_FRAG flips it
// (read its comment: this is the same gap, and that comment already predicted
// this one, "which is why IMAGE_BLIT_FRAG's centered image-import blit never
// surfaced it"). A fit-centered rect is symmetric about the buffer's middle,
// so the flip changed nothing for it; the first caller to place a raster
// anywhere else — paste — got it mirrored about the canvas's horizontal
// centre-line, landing correctly in x and nowhere near right in y.
//
// The sampling flip is the second half: the texture is uploaded with
// UNPACK_FLIP_Y_WEBGL, so the image's first (top) row sits at t=1, and a
// top-down v has to be turned around to reach it. The two flips are separate
// facts about two different spaces, and cancelling them against each other
// would only work back in the symmetric case this is fixing.
/** (#536, ADR 011 s17.11) One step of pigment diffusion in standing water,
 *  over a wash's deposit buffer. The GPU twin of wetDiffusion.ts, and it has
 *  to stay a twin: same stencil, same pair formula, same constants, so the
 *  oracle's four invariants (mass, confinement, valley bias, symmetry) are
 *  what this computes rather than what it is hoped to compute.
 *
 *  Reads the deposit (u_ink) and the wash's coverage (u_coverage), writes the
 *  deposit one step later. The whole vec4 travels together: whatever fraction
 *  of a pixel's pigment moves takes that pixel's water/paper/strength channels
 *  along in the same proportion, so the ratios the composite divides out
 *  stay meaningful in the moved paint.
 *
 *  Each unordered pair (i, j) is evaluated from both ends, once per fragment,
 *  and the two evaluations are exact negatives of each other in IEEE
 *  arithmetic - a difference negated, a max pair swapped - so what i gives j
 *  gets, to the bit, before the 8-bit write. The write quantises per pixel and
 *  that is the one known leak; it is measured (divergence(N)), not argued.
 *
 *  No clamp anywhere in the flux. With K(D + B) <= 1 a pixel cannot give more
 *  than it holds in one step, so the result is non-negative by construction,
 *  and a clamp is exactly what would have broken the antisymmetry. */
export const WC_DIFFUSE_FRAG = `
  precision highp float;
  uniform sampler2D u_ink;
  // Both pigment and absorption records read the same pre-step mobile
  // pigment here. Never derive mobility from the colour record itself.
  uniform sampler2D u_density;
  uniform sampler2D u_solvent;
  uniform float u_useSolvent;
  uniform sampler2D u_coverage;
  uniform sampler2D u_paperHeightMap;
  uniform vec2 u_resolution;
  uniform vec2 u_paperOrigin;
  uniform vec2 u_paperTexSize;
  uniform vec2 u_paperScale;
  uniform float u_d;
  uniform float u_b;
  /** Stencil radius for this step, texels, and which ring: 0 the axes and
   *  diagonals, 1 the knight's ring (2,1) - see WET_DIFFUSE_SCHEDULE. */
  uniform float u_radius;
  uniform float u_stencil;
  varying vec2 v_uv;

  // Standing water at a texel: the wash's silhouette, times the wetter of two
  // records - what the last pass that covered it wrote into coverage .b (the
  // free water of a clean pass, or the wetness a pigment pass recorded under
  // itself; see u_washWater) and the paper wetness the paint here was laid
  // into, deposit-weighted (ink .g, the same digits).
  //
  // Not the brush's depleted load (ink .r). That was the first version, and
  // measured on a replay of Ilya's puddle it gated the pass shut: a puddle
  // laid by one long stroke has its load run down over most of its area, so
  // the water read 0.15 in patches and 0 in between, and the pigment dropped
  // into it stayed where it was. How wet a patch of paper is barely cares
  // which end of the stroke wetted it - the same argument that feeds the
  // live field the mix rather than the load (see _paintDabs).
  // (#536, s17.19) From the coverage alone, on purpose: the pass now runs
  // over two fields - the deposit and its optical depth - and both must move
  // by the same fractions, so the gate may not read the field it moves. The
  // Accepted covered-film mobility uses the connected coverage .a domain;
  // higher pre-step pigment density slows the same pairwise transfer for
  // both records. Standing-water appearance remains a separate record.
  float wcWaterAt(vec4 cov) {
    if (cov.a <= 0.002) return 0.0;
    return clamp(cov.a, 0.0, 1.0);
  }

  float wcHeightAt(vec2 px) {
    vec2 paperUV = (px + u_paperOrigin) / u_paperTexSize * u_paperScale;
    return texture2D(u_paperHeightMap, paperUV).r;
  }

  void main() {
    vec2 texel = 1.0 / u_resolution;
    vec2 px = v_uv * u_resolution;
    vec4 ink = texture2D(u_ink, v_uv);
    vec4 cov = texture2D(u_coverage, v_uv);
    float wi = wcWaterAt(cov);
    // What moves is the deposit, all four channels of it, and each pair's
    // exchange is written as two DONOR terms: i hands j a fraction of its own
    // vec4, j hands i a fraction of its own. On .a the two sum to exactly the
    // oracle's flux, D (ci - cj) plus the downhill terms; on .r .g .b each
    // donor's share travels in that donor's own proportions, so the ratios
    // the composite divides out (water, paper, strength) stay meaningful in
    // the moved paint, and every channel is conserved by the same argument
    // as .a. Moving the pigment channel alone was tried: in a texel the
    // puddle laid thinly the composite reads strength = .b/.a and clamps it,
    // so pigment arriving there capped instead of showing.
    float hi = wcHeightAt(px);
    vec4 out4 = ink;
    if (wi > 0.0) {
      // The eight neighbours, the same eight and in the same order as the
      // oracle's stencil.
      for (int k = 0; k < 8; k++) {
        vec2 o;
        if (u_stencil < 0.5) {
          if (k == 0) o = vec2( 1.0,  0.0);
          else if (k == 1) o = vec2(-1.0,  0.0);
          else if (k == 2) o = vec2( 0.0,  1.0);
          else if (k == 3) o = vec2( 0.0, -1.0);
          else if (k == 4) o = vec2( 1.0,  1.0);
          else if (k == 5) o = vec2(-1.0,  1.0);
          else if (k == 6) o = vec2( 1.0, -1.0);
          else o = vec2(-1.0, -1.0);
        } else {
          if (k == 0) o = vec2( 2.0,  1.0);
          else if (k == 1) o = vec2(-2.0, -1.0);
          else if (k == 2) o = vec2( 1.0,  2.0);
          else if (k == 3) o = vec2(-1.0, -2.0);
          else if (k == 4) o = vec2(-1.0,  2.0);
          else if (k == 5) o = vec2( 1.0, -2.0);
          else if (k == 6) o = vec2(-2.0,  1.0);
          else o = vec2( 2.0, -1.0);
        }
        o *= u_radius;
        vec2 uvj = v_uv + o * texel;
        // Off the buffer's edge is dry paper: nothing crosses it.
        if (uvj.x < 0.0 || uvj.y < 0.0 || uvj.x > 1.0 || uvj.y > 1.0) continue;
        vec4 inkj = texture2D(u_ink, uvj);
        vec4 covj = texture2D(u_coverage, uvj);
        float wj = wcWaterAt(covj);
        float density = max((2.0 * texture2D(u_density, v_uv).a) / max(cov.a, 0.002), (2.0 * texture2D(u_density, uvj).a) / max(covj.a, 0.002));
        if (u_useSolvent > 0.5) {
          // Independent diagnostic thickness V/4. Pigment mass P comes from
          // .b, never from the solvent's representational headroom.
          float vi = 4.0 * texture2D(u_solvent, v_uv).a;
          float vj = 4.0 * texture2D(u_solvent, uvj).a;
          density = max(2.0 * texture2D(u_density, v_uv).b / max(vi, 0.002),
                        2.0 * texture2D(u_density, uvj).b / max(vj, 0.002));
        }
        float gate = min(wi, wj) / (1.0 + 8.0 * density * density);
        if (gate <= 0.0) continue;
        float dh = hi - wcHeightAt(px + o);
        // On .a, give * ink.a - take * inkj.a is gate * (D (ci - cj)
        // + B max(dh,0) ci - B max(-dh,0) cj): the oracle's flux. From j's
        // side the same two products appear with the roles swapped -
        // bit-identical, so what i gives j gets.
        float give = gate * (u_d + u_b * max(dh, 0.0));
        float take = gate * (u_d + u_b * max(-dh, 0.0));
        out4 -= give * ink;
        out4 += take * inkj;
      }
    }
    gl_FragColor = max(out4, vec4(0.0));
  }
`;

/** (#536, ADR 011 §17.24) One relaxation step of the WATER FRONT — the
 *  GPU twin of wettingCost in waterFront.ts. u_cost.r is the cost of
 *  reaching a texel from the operation's footprint, in cells over
 *  u_costMax (1.0 = not reached); a step takes the least over the eight
 *  neighbours of their cost plus the edge's, and the edge is dearer uphill
 *  on the paper and never cheaper than u_floor. Repeated ~1.4 x budget
 *  times, the texels within the budget are the domain the water wets: its
 *  edge runs ahead in the paper's valleys and stalls on its ridges — the
 *  drying front the rims are built on. min and add only, so live and
 *  replay agree to the bit. */
/** (#536, ADR 011 §17.44) Moving a region between a tile (full resolution)
 *  and the settle's field at 1/u_ratio of it, for the big brushes whose
 *  settle runs at half resolution. Drawn over the destination with a scissor
 *  on the region; gl_FragCoord is the destination pixel, u_dstOrigin the
 *  region's corner there, u_srcOrigin the matching corner in the source, in
 *  source texels, u_ratio source texels per destination pixel.
 *  Mode 0: the 2x2 mean of the source (tile -> field).
 *  Mode 1: base + up(new) - up(old), bilinear - the field's CHANGE brought
 *          back onto the full-resolution record, so its grain and the
 *          brush's texture survive and only the movement is coarse.
 *  Mode 2: max(base, up(new)) - the coverage the water front extended. */
export const WC_RESAMPLE_FRAG = `
  precision highp float;
  uniform sampler2D u_src;
  uniform sampler2D u_old;
  uniform sampler2D u_base;
  uniform vec2 u_srcSize;
  uniform vec2 u_baseSize;
  uniform vec2 u_dstOrigin;
  uniform vec2 u_srcOrigin;
  uniform float u_ratio;
  uniform float u_mode;
  // (s17.44) The source rect the interpolation may read, in source texels:
  // the settle field's own rect. Past it the field holds nothing of this
  // settle, and a bilinear tap there halved the change on the rect's last
  // half cell - a thin line along every settle window's edge.
  uniform vec4 u_clamp;
  varying vec2 v_uv;
  vec4 wcTexel(sampler2D t, vec2 q) { return texture2D(t, (clamp(floor(q), u_clamp.xy, u_clamp.zw - 1.0) + 0.5) / u_srcSize); }
  vec4 wcBilerp(sampler2D t, vec2 q) {
    vec2 g = q - 0.5;
    vec2 i = floor(g);
    vec2 f = g - i;
    vec4 a = wcTexel(t, i), b = wcTexel(t, i + vec2(1.0, 0.0));
    vec4 c = wcTexel(t, i + vec2(0.0, 1.0)), d = wcTexel(t, i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  void main() {
    vec2 q = u_srcOrigin + (gl_FragCoord.xy - u_dstOrigin) * u_ratio;
    if (u_mode < 0.5) {
      gl_FragColor = 0.25 * (wcTexel(u_src, q + vec2(-0.5, -0.5)) + wcTexel(u_src, q + vec2(0.5, -0.5))
        + wcTexel(u_src, q + vec2(-0.5, 0.5)) + wcTexel(u_src, q + vec2(0.5, 0.5)));
      return;
    }
    vec4 base = texture2D(u_base, gl_FragCoord.xy / u_baseSize);
    if (u_mode < 1.5) {
      // The change fades out over the last cells of the settle's rect: the
      // rect is padded past anything the settle can move, so what reaches
      // its edge is the half-resolution round trip's own residue, and
      // applied up to the edge and not past it, that residue drew a line
      // along every window's edge on a flat wash.
      float edge = min(min(q.x - u_clamp.x, u_clamp.z - q.x), min(q.y - u_clamp.y, u_clamp.w - q.y));
      float keep = smoothstep(1.0, 6.0, edge);
      gl_FragColor = clamp(base + keep * (wcBilerp(u_src, q) - wcBilerp(u_old, q)), 0.0, 1.0);
      return;
    }
    gl_FragColor = max(base, wcBilerp(u_src, q));
  }
`;

export const WC_WATER_FRONT_FRAG = `
  precision highp float;
  uniform sampler2D u_cost;
  uniform sampler2D u_paperHeightMap;
  uniform vec2 u_resolution;
  uniform vec2 u_paperOrigin;
  uniform vec2 u_paperTexSize;
  uniform vec2 u_paperScale;
  uniform float u_climb;
  uniform float u_floor;
  uniform float u_costMax;
  // (s17.27) The wash's film (its stitched coverage, .a): a front runs over
  // a wet film by the paper's relief, and onto DRY paper at u_dryCost times
  // the price - the sheet's sizing holds a film's edge where the brush left
  // it. Ilya's photographs: a stroke on dry paper has the brush's own
  // smooth contour whatever its water; the ragged fronts are inside the
  // stroke where its puddle met its drier body, and in a wet wash.
  uniform sampler2D u_film;
  uniform float u_dryCost;
  uniform sampler2D u_foreignFilm;
  uniform float u_foreignWet;
  // (s17.44) The step's length in texels. 1 is the plain relaxation; a
  // longer one is a JUMP of that many cells in one pass, costed as the sum
  // of the single steps it stands for - the climb terms telescope along a
  // straight path (sum of h_i - h_{i+1} is h_here - h_far), the floor holds
  // per cell. A dyadic schedule of jumps then a few unit passes reaches a
  // front of hundreds of cells in ~16 passes instead of hundreds.
  uniform float u_stride;
  varying vec2 v_uv;
  const float WC_FILM_LO = 0.02;
  const float WC_FILM_HI = 0.15;
  // (#680, s17.78) Where the front runs into the fibres: coarse patches of
  // the sheet (cycles per field texel, an fbm band that opens a minority of
  // it) in which climbing the relief costs WC_FRONT_FEATHER times more, so
  // the front stalls on the ridges there and runs on along the valleys in
  // threads - Ilya's "паутинки", "не всегда". Elsewhere the front is as
  // before. A price, not a mask: the front stays a min-plus relaxation,
  // live and replay agree to the bit, and the hash is the portable one.
  const float WC_FRONT_FEATHER = 4.0;
  const float WC_FRONT_FEATHER_SCALE = 0.025;
  const float WC_FRONT_FEATHER_LO = 0.5;
  const float WC_FRONT_FEATHER_HI = 0.64;
${WC_NOISE_GLSL}

  float wcFrontHeightAt(vec2 px) {
    vec2 paperUV = (px + u_paperOrigin) / u_paperTexSize * u_paperScale;
    return texture2D(u_paperHeightMap, paperUV).r;
  }

  void main() {
    vec2 texel = 1.0 / u_resolution;
    vec2 px = v_uv * u_resolution;
    float best = texture2D(u_cost, v_uv).r * u_costMax;
    float hj = wcFrontHeightAt(px);
    float climb = u_climb * (1.0 + WC_FRONT_FEATHER * smoothstep(WC_FRONT_FEATHER_LO, WC_FRONT_FEATHER_HI,
      wcFbm((px + u_paperOrigin) * WC_FRONT_FEATHER_SCALE + vec2(41.0, 7.0))));
    for (int k = 0; k < 8; k++) {
      vec2 o;
      if (k == 0) o = vec2( 1.0,  0.0);
      else if (k == 1) o = vec2(-1.0,  0.0);
      else if (k == 2) o = vec2( 0.0,  1.0);
      else if (k == 3) o = vec2( 0.0, -1.0);
      else if (k == 4) o = vec2( 1.0,  1.0);
      else if (k == 5) o = vec2(-1.0,  1.0);
      else if (k == 6) o = vec2( 1.0, -1.0);
      else o = vec2(-1.0, -1.0);
      vec2 uvj = v_uv + o * u_stride * texel;
      if (uvj.x < 0.0 || uvj.y < 0.0 || uvj.x > 1.0 || uvj.y > 1.0) continue;
      float ci = texture2D(u_cost, uvj).r;
      if (ci >= 0.999) continue;
      float len = k < 4 ? 1.0 : 1.41421356;
      // (s17.26) The first WC_FRONT_SMOOTH cells of run are flat: a stroke's
      // 2-3 px of spread on dry paper gave a lobed edge on every stroke
      // ("печенька"); the sheet's sizing holds a thin film's edge, and the
      // relief bends only a front that runs on past it (a drop's).
      // Two cells, or half the budget on a mark whose water runs further
      // (u_costMax is the budget plus four): a big wet blob's lobes stay at
      // half its spread, a drop's front keeps its fingers.
      float relief = max(u_floor * u_stride, u_stride + climb * (hj - wcFrontHeightAt(px + o * u_stride)));
      // Thresholded: the silhouette's antialiased ramp is two or three
      // texels wide, and read raw it priced the film's own edge like dry
      // paper - the inward pass could not enter, and the tideline was gone.
      float film = smoothstep(WC_FILM_LO, WC_FILM_HI, max(texture2D(u_film, v_uv).a, u_foreignWet * texture2D(u_foreignFilm, v_uv).r));
      float edge = len * relief * mix(u_dryCost, 1.0, film);
      best = min(best, ci * u_costMax + edge);
    }
    // .g: the paper's height here, for the band's valley term (mode 6 of
    // the field op reads it off the inward pass, which is the one that
    // carries the paper's uniforms).
    gl_FragColor = vec4(min(best, u_costMax) / u_costMax, hj, texture2D(u_cost, v_uv).b, 1.0);
  }
`;

export const IMAGE_BLIT_FRAG = `
  precision highp float;
  uniform sampler2D u_image;
  uniform vec2 u_bufferSize;
  uniform vec4 u_imageRect; // offsetX, offsetY, width, height — buffer-pixel space, app-space top-down
  varying vec2 v_uv;
  void main() {
    vec2 bufferPx = vec2(v_uv.x, 1.0 - v_uv.y) * u_bufferSize;
    vec2 imgUV = (bufferPx - u_imageRect.xy) / u_imageRect.zw;
    if (imgUV.x < 0.0 || imgUV.x > 1.0 || imgUV.y < 0.0 || imgUV.y > 1.0) {
      gl_FragColor = vec4(0.0);
      return;
    }
    vec4 texColor = texture2D(u_image, vec2(imgUV.x, 1.0 - imgUV.y));
    gl_FragColor = vec4(texColor.rgb * texColor.a, texColor.a);
  }
`;

// Bakes a transform (#120) into a layer buffer — used both for a
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
//
// (#392) The homogeneous divide by srcPx.z is what makes Distort work, and it
// costs nothing when there is no Distort: an affine matrix has bottom row
// [0 0 1], so z is identically 1 and the divide is a no-op. One shader serves
// both, with no branch and no second program — the reason the protocol widens
// six numbers to nine at the read boundary instead of keeping two kinds of
// transform (see LayerTransformMatrix in packages/shared).
//
// The z <= 0 discard is not defensive tidiness. A homography's denominator is
// zero along a line and negative past it, where the projection turns points
// back through the origin: without this, a hard Distort would paint a mirrored
// ghost of the layer across the far half of the buffer, sampled from UVs that
// happen to land in [0,1]. Discarding matches what an out-of-tile tap
// below already does for content that simply isn't there — nothing is drawn.
// Room refuses to build such a matrix in the first place (isFrameInFront), so
// in practice this catches the tile margins around a legal gesture rather than
// the gesture itself.
//
// (#507) `sampleSource` below, shared verbatim by this shader and its masked
// twin, is the piece that makes a *tiled* layer resample without seams.
//
// A layer is stored as a grid of separate tile textures, and one destination
// tile is stitched from every source tile that overlaps it — one pass each
// (see previewLayerTransform/AreaOps.bakeLayerTransform). The obvious implementation, a
// single `texture2D(u_source, srcUV)` guarded by an in-[0,1] test, is subtly
// wrong at every tile boundary and was: hardware bilinear needs the four
// texels around the sample point, and at a tile's edge two of them live in
// the *next* tile, which this texture does not contain. CLAMP_TO_EDGE hands
// back the edge texel instead, so a one-texel-wide column (row) along every
// source-tile boundary came out as its nearest texel rather than the blend of
// two — full contrast where a half-pixel blend belonged, i.e. a visible
// hairline dragged along with the content, baked permanently into the layer
// on commit. It only showed for a transform that actually resamples: an
// exactly-integer translation lands on texel centres, where nearest and
// bilinear agree, which is why this looked intermittent.
//
// The fix is to do the bilinear by hand and let a tap that falls outside this
// tile contribute *nothing* instead of a clamped stand-in. The missing texel
// is not missing from the layer — it belongs to the neighbouring tile, whose
// own pass covers the very same destination fragment and contributes exactly
// that tap with exactly its weight. Summed over the passes, the four weights
// add back to one and the result is the same bilinear filter a single
// untiled buffer would have produced. That summing is why the tiled callers
// blend additively (`BlitPasses.transform`'s 'add' mode) rather than "over":
// Porter-Duff would scale the second pass's contribution by the first's
// coverage and lose part of it.
//
// Taps are read at exact texel centres, so the sampler's own filter never
// interpolates anything — `BlitPasses.transform` puts the source on NEAREST for
// the draw, which also keeps a stale mip filter (setMipSampling, #365) from
// quietly turning these taps into blurred coarse-level reads.
//
// The four fetches cost more than one hardware tap. That is the price of a
// tiled layer resampling as one image, and it is paid on a gizmo drag and a
// commit, not on the every-frame display path (#301's _composePaperToScreen
// has its own shader).
const TILE_BILINEAR = `
  vec4 tapSource(vec2 texel) {
    if (texel.x < 0.0 || texel.y < 0.0 || texel.x > u_srcSize.x - 1.0 || texel.y > u_srcSize.y - 1.0)
      return vec4(0.0);
    vec2 uv = vec2((texel.x + 0.5) / u_srcSize.x, 1.0 - (texel.y + 0.5) / u_srcSize.y);
    return texture2D(u_source, uv);
  }
  vec4 sampleSource(vec2 srcXY) {
    vec2 p = srcXY - 0.5;
    vec2 base = floor(p);
    vec2 f = p - base;
    return mix(
      mix(tapSource(base),                     tapSource(base + vec2(1.0, 0.0)), f.x),
      mix(tapSource(base + vec2(0.0, 1.0)),    tapSource(base + vec2(1.0, 1.0)), f.x),
      f.y);
  }
`;

export const TRANSFORM_BLIT_FRAG = `
  precision highp float;
  uniform sampler2D u_source;
  uniform vec2 u_dstSize;
  uniform vec2 u_srcSize;
  uniform mat3 u_matrixInv; // maps destination buffer-px -> source buffer-px, both app-space top-down
  varying vec2 v_uv;
  ${TILE_BILINEAR}
  void main() {
    vec2 dstPx = vec2(v_uv.x, 1.0 - v_uv.y) * u_dstSize;
    vec3 srcPx = u_matrixInv * vec3(dstPx, 1.0);
    if (srcPx.z <= 0.0) {
      gl_FragColor = vec4(0.0);
      return;
    }
    gl_FragColor = sampleSource(srcPx.xy / srcPx.z);
  }
`;

// (#446) The masked twin of TRANSFORM_BLIT_FRAG — the transform half of an
// `area_transform`. Identical backward sampling (destination pixel -> source
// pixel through u_matrixInv), with the source's coverage multiplied by the
// selection mask *evaluated at the source pixel*, which is where the user
// drew the lasso. Sampling the mask at the destination instead would drag the
// hole around with the piece and mask the moved content against its new
// position — the shape would deform as you drag.
//
// The mask lookup needs world coordinates, and u_matrixInv lands in *source
// tile* coordinates, so u_srcOrigin (that tile's world origin) bridges the
// two. u_maskRect is the mask's own world rect (origin, size); uv is
// normalized against it, so a mask rasterized at reduced resolution for a
// huge selection (see MASK_MAX_DIM) needs no change here.
//
// (#507) Reads the source through the same bounded four-tap sampleSource as
// TRANSFORM_BLIT_FRAG, for the same reason and with the same requirement on
// the caller: a selection that spans more than one tile is stitched from one
// pass per source tile, and those passes have to *sum* (see AreaOps.composeAreaTiles,
// which accumulates the lifted piece additively into its own buffer before
// compositing it over the tile's remaining content).
//
// Mask uv has no y-flip, unlike the source taps: selectionMask.ts writes rows top-down
// and texImage2D maps data row 0 to t=0, so app-space y and mask t already
// run the same way. Reaching for the flip "for symmetry" mirrors every
// selection about its own middle, which for a lasso is subtle enough to look
// like a rasterizer bug.
export const AREA_TRANSFORM_FRAG = `
  precision highp float;
  uniform sampler2D u_source;
  uniform sampler2D u_mask;
  uniform vec2 u_dstSize;
  uniform vec2 u_srcSize;
  uniform vec2 u_srcOrigin;  // source tile's world-space (0,0) texel
  uniform vec4 u_maskRect;   // world-space originX, originY, width, height
  uniform mat3 u_matrixInv;  // destination buffer-px -> source buffer-px, app-space top-down
  varying vec2 v_uv;
  ${TILE_BILINEAR}
  void main() {
    vec2 dstPx = vec2(v_uv.x, 1.0 - v_uv.y) * u_dstSize;
    vec3 srcPx = u_matrixInv * vec3(dstPx, 1.0);
    if (srcPx.z <= 0.0) {
      gl_FragColor = vec4(0.0);
      return;
    }
    vec2 srcXY = srcPx.xy / srcPx.z;
    vec2 maskUV = (srcXY + u_srcOrigin - u_maskRect.xy) / u_maskRect.zw;
    if (maskUV.x < 0.0 || maskUV.x > 1.0 || maskUV.y < 0.0 || maskUV.y > 1.0) {
      gl_FragColor = vec4(0.0);
      return;
    }
    gl_FragColor = sampleSource(srcXY) * texture2D(u_mask, maskUV).a;
  }
`;

// (#446) Writes nothing but the selection's own coverage into alpha, over a
// tile-sized quad. What it *does* is decided by the blend function the caller
// sets, which is the entire reason one shader serves both halves:
//
//   ZERO, ONE_MINUS_SRC_ALPHA  ->  dst *= (1 - coverage)   erase inside
//   ZERO, SRC_ALPHA            ->  dst *= coverage         keep only inside
//
// The first is `area_clear` (and the hole an `area_transform` leaves behind);
// the second is how a copy is cut out of a flattened patch before it becomes
// a PNG. Both multiply a premultiplied buffer by a scalar, which is exactly
// right for premultiplied color — rgb and a scale together, so no
// intermediate un-premultiply is needed anywhere in this path.
//
// u_dstOrigin is the target buffer's world origin, so the same quad works for
// a real tile, a scratch tile or a copy patch without the caller translating
// the mask.
export const AREA_MASK_FRAG = `
  precision highp float;
  uniform sampler2D u_mask;
  uniform vec2 u_dstSize;
  uniform vec2 u_dstOrigin;
  uniform vec4 u_maskRect;
  varying vec2 v_uv;
  void main() {
    vec2 worldPx = vec2(v_uv.x, 1.0 - v_uv.y) * u_dstSize + u_dstOrigin;
    vec2 maskUV = (worldPx - u_maskRect.xy) / u_maskRect.zw;
    if (maskUV.x < 0.0 || maskUV.x > 1.0 || maskUV.y < 0.0 || maskUV.y > 1.0) {
      gl_FragColor = vec4(0.0);
      return;
    }
    gl_FragColor = vec4(0.0, 0.0, 0.0, texture2D(u_mask, maskUV).a);
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

// (#595, ADR 015 §5) One step of bakePreview's GPU downscale chain — see
// previewChain.ts for the step sizes and why it is a chain at all.
//
// Four hardware-bilinear taps at +-u_tapOffset around the destination pixel's
// centre, where u_tapOffset is a quarter of a *destination* pixel in uv units
// (0.25 / dstSize). For an exact 2x step that lands each tap on a source texel
// centre, so the four taps are exactly the 2x2 block and the result is a plain
// box average. For the one shorter, non-integer final step (factor 1..2) the
// taps spread over the destination pixel's footprint and bilinear weighting
// fills in between — still every source texel under the footprint contributes.
//
// highp on purpose: at mediump a uv over a 1754-texel source is only good to
// a texel or two, which would smear exactly the grain this exists to keep.
// Input is the opaque paper-composed image (alpha 1 everywhere), so averaging
// straight colour is correct — there is no premultiplication to respect.
// Uniform names are unique to this program (u_src, u_tapOffset): the test
// MockGL tags programs by the uniforms their source declares, and this one
// must read as an unrasterized 'other' pass.
export const DOWNSAMPLE_FRAG = `
  precision highp float;

  uniform sampler2D u_src;
  uniform vec2 u_tapOffset;

  varying vec2 v_uv;

  void main() {
    vec4 sum = texture2D(u_src, v_uv + vec2(-u_tapOffset.x, -u_tapOffset.y));
    sum += texture2D(u_src, v_uv + vec2( u_tapOffset.x, -u_tapOffset.y));
    sum += texture2D(u_src, v_uv + vec2(-u_tapOffset.x,  u_tapOffset.y));
    sum += texture2D(u_src, v_uv + vec2( u_tapOffset.x,  u_tapOffset.y));
    gl_FragColor = sum * 0.25;
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
// (#300) The tone swing itself is PAPER_TONE_AMPLITUDE in paper/paperTone.ts,
// shared with the paper picker's miniatures (#663).

/** Shared GLSL turning `u_paperColor` + a height sample into rendered tone.
 *  Emitted from one place because DISPLAY_FRAG (bounded rooms, screen-locked
 *  UV) and the infinite-room path must agree, and GLSL ES 1.0 has no
 *  #include to enforce it. */
const paperToneGLSL = (heightExpr: string) => `
    float toneSigned = (${heightExpr}) * 2.0 - 1.0;
    vec3 toneCenter = clamp(u_paperColor, ${PAPER_TONE_AMPLITUDE.toFixed(3)}, 1.0 - ${PAPER_TONE_AMPLITUDE.toFixed(3)});
    vec3 paperTone = toneCenter + ${PAPER_TONE_AMPLITUDE.toFixed(3)} * toneSigned;
`

// Display-time only: this shades what's on screen, never what's stored.
// Layer buffers (and therefore snapshots, which bake from them) hold
// accumulation output, so changing these numbers can't diverge stored
// content between devices — unlike the paper *catch* map, which does feed
// real dab math.


// #141: infinite-canvas counterpart to DISPLAY_FRAG's "paper peeking
// through" blend, kept in sync with it by hand (see DISPLAY_FRAG's own
// comment). Reuses DISPLAY_VERT (same fullscreen-quad convention as every
// other composite/display pass).
//
// (#301) This is the *whole* infinite display pass now — the camera's
// rotation included. It used to be two passes: blend paper into a second
// assembly-sized buffer, then rotate that result down to the screen. That
// ordering is what made a rotated infinite canvas look soft: paper grain is
// the highest-frequency content on screen (per-pixel noise, by
// construction), it was rasterized crisp at assembly resolution, and then
// the whole image — grain and all — went through a bilinear rotate. A
// bilinear resample at ~1:1 is the maximum-blur case (every destination
// pixel lands between source texels), and it turned the grain to mush.
//
// Sampling paper here, *after* the rotation, fixes that structurally: the
// grain is generated at exactly one sample per screen pixel and is never
// resampled at all. Only the accumulation buffer (strokes) still goes
// through the rotate, which is unavoidable — it's a rasterized image, not a
// function of position the way paper is. Costs nothing extra: this pass
// does the rotate blit that _finishPaperBlend was doing anyway, so the
// whole separate paper-blend pass and its assembly-sized FBO are simply
// gone.
//
// u_matrixInv (destination px -> accumulation px) is the same convention
// TRANSFORM_BLIT_FRAG uses, and u_screenToWorld (destination px -> world)
// is the rest of that same inverse camera chain, carried through to world
// space instead of stopping at the assembly buffer. Both are plain
// destination-driven inverse mappings, so both reduce to the identity/
// translate-only case the flat export path needs without a second shader:
// see _renderPaperComposeInto's callers in engine/index.ts.
export const PAPER_COMPOSE_FRAG = `
  precision highp float;

  uniform sampler2D u_accumulation;
  uniform sampler2D u_paperMap;
  uniform vec3 u_paperColor;
  uniform vec2 u_paperScale;
  uniform vec2 u_paperTexSize;   // world units per paper repeat period — see DAB_FRAG's own comment
  uniform vec2 u_dstSize;        // destination (screen / export target) size, px
  uniform vec2 u_srcSize;        // accumulation source size, px
  uniform mat3 u_matrixInv;      // destination px -> accumulation px, both app-space top-down
  uniform mat3 u_screenToWorld;  // destination px -> world units
  uniform float u_sharpResample; // 1.0 = Catmull-Rom, 0.0 = plain bilinear — see below
  // (#470) The page, in world units: minX, minY, maxX, maxY. A bounded room is
  // now drawn through the camera like an infinite one, so for the first time
  // there are screen pixels *outside* the sheet — the canvas element used to
  // be the sheet and there was no such place. Everything outside this rect is
  // the desk the sheet lies on. maxX <= minX means "no page at all" (an
  // infinite room), and then paper covers the screen exactly as before.
  uniform vec4 u_pageRect;
  uniform vec3 u_deskColor;
  // (#536) Where the paper is still wet — display only, and that is the whole
  // point of it living here rather than anywhere near the accumulation.
  //
  // Nothing about this reaches stored content, a snapshot, an export or a peer.
  // It is a local, ephemeral read of a local, ephemeral field: the author
  // watches their own paper dry, a peer watches theirs, a late joiner sees a
  // dry sheet, and every one of them is looking at the identical pixels
  // underneath. That is why no clock had to be written down for it.
  //
  // A coarse world-space map, one texel per wetness cell, over u_wetRect —
  // minX, minY, maxX, maxY in world units, with maxX <= minX meaning "nothing
  // is wet" and switching the whole term off.
  uniform sampler2D u_wetMap;
  uniform vec4 u_wetRect;
  /** Texels of u_wetMap, so its slope can be read a texel at a time. */
  /** (#536) How wet the wettest paper on the sheet is right now, 0..1. The rim
   *  bands are placed as fractions of this rather than at absolute wetness —
   *  see WC_DARK_MID. 1.0 when nothing needs normalising. */
  uniform float u_wetPeak;

  // (#536) Where the light comes from, how far inside the rim the line sits,
  // and how bright it is. The width is the offset: a couple of world pixels is
  // the thin bead a real puddle shows, and it stays that width at any zoom
  // because it is measured in the world the water lives in.
  const vec2 WC_WET_LIGHT_DIR = vec2(-0.6, -0.8);
  const float WC_WET_RIM_PX = 5.0;
  const float WC_WET_RIM_GAIN = 6.0;
  const float WC_WET_GLOSS = 0.34;
  const float WC_WET_SHADE = 0.11;
  /** (s17.33) The fresh-water shade: how much darker the wettest paper reads
   *  than merely damp paper, and the wetness it starts rising from. */
  const float WC_FRESH_SHADE = 0.07;
  // (#680) Presentation only: water stays visible on bare paper and reads
  // much more gently over paint. Neither share enters the deposited pigment.
  const float WC_WET_PAPER_TONE_SHARE = 0.35;
  const float WC_WET_PAINT_TONE_SHARE = 0.12;
  // (s17.43) The power applied to a painted colour under fresh water, at
  // full freshness: 1.35 takes a mid blue (0.45) to 0.34, a near-white
  // nowhere - deeper and more saturated, never greyer.
  const float WC_FRESH_DEEPEN = 0.35;
  const float WC_FRESH_LO = 0.45;
  /** The cast shadow on the far side. Softer than the meniscus: it is the drop
   *  sitting on the paper, not the surface of the drop.
   *
   *  #536 — OFF, at zero, and deliberately as a *bisection* rather than as a
   *  decision about the effect. Something reads as a halo round the puddle and
   *  four attempts to place this band correctly have each moved the halo
   *  without removing it. The band is the only term that lives outside the
   *  meniscus, so switching it off answers in one look which of two things is
   *  true: either the halo goes, and it was always this, or it stays, and it is
   *  the damp tint or the sheen and the shadow was never involved.
   *
   *  Kept as a constant rather than deleted so the answer can be acted on
   *  either way — restoring it is one number. Everything that computes rimCast
   *  is untouched, and multiplying by zero costs nothing a driver will not fold
   *  away.
   *
   *  The same reasoning as the bristle caricature (§17.5): after three wrong
   *  guesses, stop guessing amplitudes and take a measurement that can only
   *  come back one of two ways. */
  const float WC_WET_CAST = 0.0;
  // (#536) THREE windows on the wetness value, and which of them is gated by
  // the light is the whole of what makes a puddle read as a puddle.
  //
  //   rim     a bright arc just inside the edge  -- lit side only
  //   ring    a thin dark line at the edge       -- ALL THE WAY ROUND
  //   cast    a soft shadow just outside it      -- far side only
  //
  // The ring not being gated is the correction. It used to be, so the far side
  // of a puddle had nothing on it at all and the near side had a highlight with
  // one dark edge -- "тёмная часть должна быть и за бликом, и с другой стороны
  // лужи тоже". Look at any photograph of water on paper: the meniscus is a
  // continuous dark line round the whole perimeter, because the edge bends the
  // view of what is underneath whichever way the light comes from. Only the
  // specular arc and the cast shadow know where the light is.
  //
  // All three are much tighter than the first version, and packed close
  // together rather than spread with a gap: these are shallow puddles soaking
  // into paper, not the domed beads on a waxed surface in the reference photo.
  // The window's width in wetness is its band's width on screen, so narrowing
  // it is literally flattening the drop.
  // (#536, s17.12) The bead - rim, its dark ring and the cast - needs standing
  // water, in ABSOLUTE terms. Every band below is placed on t, the field
  // normalised to its own peak, which is right for where the edge is and
  // wrong for whether there is a bead at all: a stroke at 35% water was the
  // wettest thing on the sheet and got a full meniscus ("лужа рисуется как
  // обычно"), while its sheen (gated on raw) was already nil. One absolute
  // wetness, two response curves: the sheen from moderate, the bead only from
  // high. Damp paper is tinted and still gates the diffusion of the next
  // stroke; it just has no valley of water to catch the light.
  const float WC_BEAD_LO = 0.45;
  // (#680, s17.83) The glossy bead - blik, meniscus ring, cast - is OFF:
  // Ilya, "как щас мне не нравится" and, before, "каёмку лужи рисовать так
  // же, как серую зону при намокании". A pool is drawn as the wet paper
  // is, a deeper wet tone (WC_POOL_SHADE, WC_POOL_DEEPEN) with the same
  // soft edge. 1.0 brings the rings back.
  const float WC_BEAD_ON = 0.0;
  const float WC_POOL_SHADE = 0.08;
  const float WC_POOL_DEEPEN = 0.45;
  const float WC_BEAD_HI = 0.70;
  const float WC_RIM_LO  = 0.158;
  const float WC_RIM_MID = 0.177;
  const float WC_RIM_HI  = 0.196;
  /** Centre of the meniscus ring, and its half-width on the *unlit* side. On
   *  the lit side it is squeezed to a fraction of this: the specular arc is
   *  already telling the eye where that edge is, and a full-weight dark line
   *  crowded up against it was read as part of a double outline rather than as
   *  the same ring continuing round. */
  const float WC_DARK_MID  = 0.128;
  const float WC_DARK_HALF = 0.026;
  const float WC_DARK_LIT  = 0.40;
  // …and all of them are read as fractions of how wet the wettest paper on the
  // sheet currently is, not as absolute wetness. That is a bug fix, and the bug
  // it fixes is the one that made a drying puddle turn into a dark grey blob.
  //
  // A window on the absolute value only works while the puddle's own plateau is
  // above it. As the paper dries the plateau descends, and it descends *through*
  // every window in turn -- so at some point the whole interior of the puddle
  // satisfies "is this the ring?" at once, and a moment later "is this the
  // shadow?". The rings are not at the edge at all by then; the edge is simply
  // where the value happened to be. Scaling by the peak pins each band to a
  // fixed place on the edge's ramp for the puddle's whole life, and as a bonus
  // keeps its width in pixels constant too, because the ramp and the window
  // shrink together.
  /** The cast shadow: wider than the ring and softer, sitting just outside it.
   *
   *  It reads as a shadow rather than as a second outline because it is about
   *  twice the ring's width and has no gap from it — an equally narrow band a
   *  gap away is simply another line, which is what "непонятная двойная
   *  обводка" was.
   *
   *  The correction after that one went the other way and was worse: giving it
   *  an inner edge and no outer one at all made it hold right out to the limit
   *  of the wetness field, which is the "серый ореол" round the whole puddle.
   *  A shadow does need to end. */
  //  #536 — pushed up against the ring (which spans DARK_MID +/- DARK_HALF,
  //  i.e. 0.102..0.154) instead of sitting out at 0.016..0.070, and that is the
  //  halo. The window was narrow in *wetness* and enormous in *pixels*, because
  //  down near zero the field is almost flat — the wider smoothing kernel that
  //  fixed the octagon flattened that tail further still. A band placed on the
  //  tail covers half the sheet however tight its numbers look. Sitting
  //  directly outside the ring with no gap it is instead what it should be: the
  //  far edge simply reads a little thicker and softer than the near one.
  const float WC_CAST_IN  = 0.102;
  const float WC_CAST_MID = 0.077;
  const float WC_CAST_OUT = 0.052;
  /** The single outside limit of everything the overlay draws, on the shared
   *  edge coordinate. Sits just under the outermost band (the cast shadow's own
   *  outer edge) so nothing has room to leak past it onto the field's tail, and
   *  it is a hard step rather than a ramp on purpose: a soft cut-off is another
   *  gradient for the eye to find, which is the thing being removed. */
  const float WC_EDGE_OUT = 0.048;
  // For scale: the wetness map is one texel per 16 px cell, linearly filtered
  // and then smoothed over a texel again, so raw falls from 1 to 0 across
  // roughly 32 world px. A window that many hundredths wide is therefore that
  // many thirty-seconds of a world pixel -- the three bands above come out at
  // about 1.2, 1.7 and 1.9 world px, with the highlight sitting 1.6 px inside
  // the ring. Measured in the world the water is in, not on screen, so they
  // shrink when the canvas is zoomed out. That is right for a physical bead and
  // it does mean a puddle seen at 45% shows the ring and little else.

  // (#536, ADR 011 §17.6) How far the paint is held back from where it will end
  // up, at full flood. The stored pixels are the *dry* result — already carrying
  // whatever spread the wetness the author recorded bought them — and this is a
  // presentation-only correction that pulls the mark back in while the water is
  // still there and lets go of it as the paper dries. Zero wetness, zero
  // correction, so the picture converges on what is stored no matter what the
  // clock does.
  //  #536 — how far the paint is held back from where it will end up at the
  //  instant it is laid into standing water, and it is a *shape* question as
  //  much as a size one.
  //
  //  Ilya, describing the real thing: touch a brush to a wet surface and the
  //  paint runs out hard at first, then slows, then very nearly stops. That is
  //  not what a linear release looks like and it is not what a smoothstep
  //  release looks like either — a smoothstep starts slow, which reads as the
  //  mark sitting still and then thinking about it, and was behind "начало
  //  рисовать как сухая кисть". WC_RELAX_EASE puts the motion at the front:
  //  most of the travel happens in the first seconds after the pen leaves, and
  //  the tail of it is a long slow crawl to a stop.
  //
  //  Two terms make up the total spread and they are easy to confuse. This one
  //  is transient and decides *when* the paint gets there; WC_WET_PUSH is
  //  permanent and decides *where* it ends up. Turning this up does not make a
  //  dried mark any bigger.
  // (#536, s17.12) Zero: retired. It held the thin tones under wet paper
  // back while the halo was a composite-time guess, so the halo could seem to
  // grow out of the core as the sheet dried. With the halo and the diffusion
  // in the deposit and the reveal easing the settle in (s17.12), it had
  // nothing left to hide and one thing left to break: it masked EVERY thin
  // tone under standing water, old dry strokes included - "водой поверх
  // старых высохших штрихов - они странно исчезают, пока не высохнут лужи".
  // Kept as a constant so the plumbing reads, not as a knob.
  const float WC_WET_RELAX = 0.0;
  /** Alpha below which a pixel is taken to be the halo, and above which the
   *  core. Between the two the reveal ramps. */
  const float WC_HALO_A = 0.22;
  const float WC_CORE_A = 0.55;
  /** Exponent on the release. Above 1 fronts the motion — see WC_WET_RELAX. */
  //  5, from 7: with the reveal doing real work the seventh power spent the
  //  whole halo in the first second, which reads as a jump rather than as
  //  paint running. Still front-loaded - most of the travel is in the first
  //  few seconds and the tail is a slow crawl.
  const float WC_RELAX_EASE = 5.0;
  /** The wetness a freshly laid flood carries, which is what the release is
   *  measured against. Reading the raw value rather than the normalised edge
   *  coordinate is deliberate: this has to run down as the patch dries, and a
   *  lone puddle decays in step with the peak, so the normalised ratio between
   *  them would never move at all. */
  const float WC_RELAX_REF = 0.90;
  // The window over which it lets go. Far wider than the sheen's: the sheen
  // must vanish the moment a patch is merely damp, or every mark drags a grey
  // halo, whereas the paint has to still be creeping when the shine has long
  // gone — that is most of what "watching it dry" is.
  // #536 - 0.50..0.95, from 0.04..0.45: "растекание должно быть интенсивней,
  // быстрее, больше". The window is what decides *when* in the drying the paint
  // moves, and down at 0.04 the release was spread across almost the entire
  // minute, so at any moment almost nothing was happening. Up here it is spent
  // inside the first half of the drying - the paint creeps out over the first
  // twenty-odd seconds and is settled well before the sheen goes, which is also
  // the right way round physically.
  // The release runs on the shared edge coordinate rather than on raw wetness,
  // so it means the same thing however wet the brush was: 1 the moment the
  // water goes down, 0 when that patch is dry.

  /** The wetness map, smoothed over its own texels so the grid it is built on
   *  does not show as facets.
   *
   *  A full 3x3 binomial tent at one texel, not the four half-texel taps this
   *  started as. Four taps at half a texel average within a single texel's
   *  neighbourhood and so cannot round off a *texel-sized* corner at all --
   *  which is what a puddle edge is made of, and why the meniscus came out
   *  visibly octagonal. Nine taps of a separable 1-2-1 is the smallest kernel
   *  whose support actually spans the staircase, and it is separable enough to
   *  stay isotropic, which a wider box would not be. */
  /** (#536, s17.18) The body level of the puddle THIS texel belongs to: the
   *  maximum over the five-by-five cells around it (two cells is the whole
   *  of the tent's edge ramp, so from anywhere on an edge the body is in
   *  reach). Everything placed on the edge's ramp is normalised by it rather
   *  than by the sheet's peak. Normalising by the sheet's peak was right
   *  only while there was one puddle: lay a fresh one beside an old one at
   *  a fifth of its level and the old puddle's whole BODY lands at the t of
   *  the new one's edge, where the rim and its dark ring are drawn - "рядом
   *  возвращается уже высохшая лужа и заново сохнет"; and touching a pen
   *  into a wash lifted the peak back to one, so every band in it moved. */
  // (#536, s17.22) Both come precomputed in the map itself - the 5x5 max in
  // .a, the 3x3 tent in .r - see _updateWetTexture. They were 25 and 9 taps
  // here, per screen pixel, per frame, of a field that changes eight times a
  // second.
  float wcWetBodyAt(vec2 uv) {
    return texture2D(u_wetMap, uv).a;
  }

  float wcWetAt(vec2 uv) {
    return texture2D(u_wetMap, uv).r;
  }

  varying vec2 v_uv;

  // (#301) Catmull-Rom resample of the accumulation buffer, in 9 bilinear
  // taps rather than the naive 16 point taps (the standard trick: within
  // each pair of adjacent taps, one hardware-bilinear fetch positioned at
  // the pair's own weight ratio returns exactly their weighted sum, and the
  // source is LINEAR/CLAMP_TO_EDGE filtered — see AccumulationBuffer).
  //
  // Why not just bilinear: rotating the canvas resamples at roughly 1:1,
  // which is bilinear's worst case — every destination pixel lands between
  // source texels and comes back as a blend of four, so the whole image
  // softens the moment the canvas is turned. That's the "мыло" this exists
  // to kill. Catmull-Rom's negative lobes reconstruct the detail bilinear
  // averages away, at the cost of slight overshoot at hard edges — clamped
  // by the caller below, since the accumulation buffer is premultiplied and
  // a negative or >1 sample there is not a representable color.
  //
  // Only worth its 9 taps when the mapping actually resamples: an unrotated,
  // unscaled camera is an exact integer translation, where this reduces to
  // a single unit-weight tap anyway (f=0 makes w1 the only nonzero weight)
  // and a plain texture2D is the same result for 1/9th of the bandwidth.
  // u_sharpResample is what the engine uses to say which case this is.
  vec4 sampleCatmullRom(vec2 uv) {
    vec2 samplePos = uv * u_srcSize;
    vec2 texPos1 = floor(samplePos - 0.5) + 0.5;
    vec2 f = samplePos - texPos1;

    vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
    vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
    vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
    vec2 w3 = f * f * (-0.5 + 0.5 * f);

    vec2 w12 = w1 + w2;
    vec2 offset12 = w2 / w12;

    vec2 texPos0  = (texPos1 - 1.0) / u_srcSize;
    vec2 texPos3  = (texPos1 + 2.0) / u_srcSize;
    vec2 texPos12 = (texPos1 + offset12) / u_srcSize;

    vec4 result = vec4(0.0);
    result += texture2D(u_accumulation, vec2(texPos0.x,  texPos0.y))  * w0.x  * w0.y;
    result += texture2D(u_accumulation, vec2(texPos12.x, texPos0.y))  * w12.x * w0.y;
    result += texture2D(u_accumulation, vec2(texPos3.x,  texPos0.y))  * w3.x  * w0.y;

    result += texture2D(u_accumulation, vec2(texPos0.x,  texPos12.y)) * w0.x  * w12.y;
    result += texture2D(u_accumulation, vec2(texPos12.x, texPos12.y)) * w12.x * w12.y;
    result += texture2D(u_accumulation, vec2(texPos3.x,  texPos12.y)) * w3.x  * w12.y;

    result += texture2D(u_accumulation, vec2(texPos0.x,  texPos3.y))  * w0.x  * w3.y;
    result += texture2D(u_accumulation, vec2(texPos12.x, texPos3.y))  * w12.x * w3.y;
    result += texture2D(u_accumulation, vec2(texPos3.x,  texPos3.y))  * w3.x  * w3.y;

    return result;
  }

  void main() {
    vec2 dstPx = vec2(v_uv.x, 1.0 - v_uv.y) * u_dstSize;

    vec3 srcPx = u_matrixInv * vec3(dstPx, 1.0);
    vec2 srcUV = vec2(srcPx.x / u_srcSize.x, 1.0 - srcPx.y / u_srcSize.y);
    // Outside the accumulation buffer reads as "no strokes here", not as a
    // transparent hole: the assembly buffer is sized so any rotation still
    // covers the screen (see Camera.renderBufferExtent), but if that ever fails
    // at a corner the honest fallback is bare paper, not a punched-out gap.
    bool inside = srcUV.x >= 0.0 && srcUV.x <= 1.0 && srcUV.y >= 0.0 && srcUV.y <= 1.0;
    vec4 acc = vec4(0.0);
    if (inside) {
      // Branch on a uniform, so it's uniform control flow across the whole
      // draw — every fragment takes the same side, no divergence cost.
      acc = u_sharpResample > 0.5 ? sampleCatmullRom(srcUV) : texture2D(u_accumulation, srcUV);
    }
    // Catmull-Rom overshoot clamp (see sampleCatmullRom's own comment): the
    // accumulation buffer holds premultiplied color in .rgb and coverage in
    // .a, so every valid sample is within [0,1] and anything outside is
    // ringing, not signal. Harmless for the bilinear path, which can't
    // leave that range to begin with.
    acc = clamp(acc, 0.0, 1.0);

    float graphite = acc.a;
    // Clamped for the same reason: un-premultiplying a slightly-overshot
    // color by a small alpha can land well outside [0,1], which the mix()es
    // below would happily extrapolate into a bright fringe.
    vec3 strokeColor = graphite > 0.001 ? clamp(acc.rgb / graphite, 0.0, 1.0) : vec3(0.0);

    vec2 worldPos = (u_screenToWorld * vec3(dstPx, 1.0)).xy;
    vec2 paperUV = worldPos / u_paperTexSize * u_paperScale;
    float paperHeight = texture2D(u_paperMap, paperUV).r;

    // (#536) What water does to paper, and it is one mechanism rather than two
    // effects: water fills the pits between the fibres, so the surface stops
    // being rough and starts being smooth. The grain flattening *is* the sheen.
    //
    // Deliberately not a specular highlight from a fixed virtual light. That
    // would read as lacquer, and worse, it would put a stable pattern of
    // reflections on the sheet that the eye starts taking for part of the
    // drawing — a real wet wash reflects its own room, and a canvas has no
    // room. Suppressing the paper's own micro-contrast is what the eye
    // actually reads as "this patch is still wet", and it costs one lerp.
    float wet = 0.0;
    // (#536) The rim highlight, the meniscus ring, and the cast shadow.
    float rim = 0.0;
    float rimDark = 0.0;
    float rimCast = 0.0;
    // (#536) How much of the paint's spread has not happened yet — see
    // WC_WET_RELAX and the block below graphite.
    float held = 0.0;
    // (#536) The faint all-over tint of damp paper — see its use below.
    float damp = 0.0;
    float fresh = 0.0;
    float pool = 0.0;
    if (u_wetRect.z > u_wetRect.x) {
      vec2 wetSpan = max(u_wetRect.zw - u_wetRect.xy, vec2(1e-4));
      vec2 wetUV = (worldPos - u_wetRect.xy) / wetSpan;
      if (wetUV.x >= 0.0 && wetUV.x <= 1.0 && wetUV.y >= 0.0 && wetUV.y <= 1.0) {
        // (#536) Thresholded, not used raw. The field is what the *model*
        // reads to decide how paint behaves, and it is deliberately generous
        // there — a trace of damp still matters to a brush. On screen a trace
        // of damp must show nothing at all, or every mark drags a soft grey
        // halo behind it, which is exactly what the first version did.
        float raw = wcWetAt(wetUV);
        // (#536) One edge for the whole overlay, and everything below is
        // expressed on it. This replaces four independent thresholds on the
        // raw value, which is where the halo kept coming back from.
        //
        // The field is deliberately *wider than the water*: a cell counts as
        // wet if its centre falls under the dab at all, the home cell always
        // counts, the display map is padded with a border texel of zero, and
        // the 3x3 tent that rounded off the octagon spreads the step another
        // texel each way. So the value does not stop at the mark: it trails off
        // down a long shallow ramp outside it, and any term with a low enough
        // threshold paints that ramp as a soft wide band. Which is the halo,
        // and it is not a depiction of anything: it is the tail of a model
        // field showing through. Moving one threshold in only handed the tail
        // to whichever term had the next lowest one, three times over.
        //
        // The shared coordinate is 1 in the body of the water and 0 outside
        // it, normalised by the wettest paper on the sheet so that it means the
        // same thing at every stage of drying (see WC_DARK_MID). WC_EDGE_OUT is
        // then the single outside
        // limit of everything the overlay draws: past it the sheet is painted
        // exactly as dry paper, whatever the field still holds out there for
        // the *model* to read.
        float body = max(wcWetBodyAt(wetUV), 0.05);
        float t = clamp(raw / body, 0.0, 1.0);
        float inWater = step(WC_EDGE_OUT, t);
        // Which of these read the shared coordinate and which read the raw
        // value is not a detail — it is the difference between "where is the
        // edge" and "how wet is it", and they must not be swapped.
        //
        // The bands below are geometry: the ring belongs at a fixed place on
        // the edge's ramp whatever stage of drying the sheet is at, so they are
        // normalised. The two below are physical quantities that have to *fade*
        // as the paper dries — and normalising those would freeze them, because
        // a single puddle drying on its own decays in step with the peak, so
        // the ratio between them never moves. A sheen that never dulls and
        // paint that never relaxes is what that costs.
        //
        // So: extent from the coordinate, amount from the value.
        wet = inWater * smoothstep(0.35, 0.95, raw);
        held = WC_WET_RELAX * pow(clamp(raw / WC_RELAX_REF, 0.0, 1.0), WC_RELAX_EASE);
        damp = inWater * smoothstep(WC_EDGE_OUT, 0.42, t) * smoothstep(0.04, 0.30, raw);
        fresh = inWater * smoothstep(WC_FRESH_LO, 1.0, raw);
        // (#680, s17.83) Where a pool stands (the map's .g, the brush's
        // surplus over the film - landing, stop, braking), fading with the
        // water under it.
        pool = inWater * smoothstep(0.08, 0.45, texture2D(u_wetMap, wetUV).g) * smoothstep(0.1, 0.5, raw);
        wet = max(wet, pool);
        // The rim, as a *window on the wetness value* rather than as a
        // derivative of it.
        //
        // Two earlier attempts read the map's slope — first as a surface normal
        // under a specular, then as a difference along the light — and both
        // faceted on curves and came out too thick. Both faults are the same
        // fault: the map is a coarse grid with a linear filter, so anything
        // built from its rate of change is piecewise constant and shows the
        // grid, and its width is whatever the filter happens to give.
        //
        // The wetness value itself is smooth and rises monotonically across the
        // rim, so a narrow window on it is a narrow ring *in the world*, with
        // no reference to the grid at all. Two windows: a bright one just
        // inside the water's edge, and a darker one a little further out, which
        // is the surface turning back down — the thing Ilya asked for and the
        // reason a real bead reads as a bead rather than as a glow.
        //
        // The side term keeps both on the lit half only: a rim that shines all the way
        // round is a ring of light, not a lit puddle.
        float ahead = wcWetAt(wetUV + (WC_WET_LIGHT_DIR * WC_WET_RIM_PX) / wetSpan);
        // Normalised by the peak like the windows are, and for the same
        // reason: without it the lit/unlit split fades out as the sheet dries,
        // taking the highlight and the cast shadow with it and leaving a bare
        // ring long before the water is gone.
        float side = clamp((ahead - raw) * WC_WET_RIM_GAIN / body, 0.0, 1.0);
        rim = side * inWater
          * smoothstep(WC_RIM_LO, WC_RIM_MID, t)
          * (1.0 - smoothstep(WC_RIM_MID, WC_RIM_HI, t));
        // No side term: the meniscus goes right round. Only its width knows
        // where the light is - thinner under the highlight, full weight on the
        // far side.
        float ringHalf = WC_DARK_HALF * mix(1.0, WC_DARK_LIT, side);
        rimDark = inWater
          * smoothstep(WC_DARK_MID - ringHalf, WC_DARK_MID, t)
          * (1.0 - smoothstep(WC_DARK_MID, WC_DARK_MID + ringHalf, t));
        rimCast = (1.0 - side) * inWater
          * smoothstep(WC_CAST_OUT, WC_CAST_MID, t)
          * (1.0 - smoothstep(WC_CAST_MID, WC_CAST_IN, t));
        // The bead is a thing standing water does - see WC_BEAD_LO. Gated on
        // the puddle's BODY level, not on raw here: the bands sit on the edge
        // ramp, where raw is a fifth of the body by construction (t =
        // 0.16..0.20), so gating on the local value switched every bead off -
        // "ты лужу сломал, где блик".
        // (#680, s17.81) ...and only where a POOL stands (.g, the brush's
        // surplus over the film: landing, stop, braking - the places that
        // dry to the dark patch), not wherever the paper is wet: the bead
        // stood beside the stroke at no size of its own. The grey of wet
        // paper is unchanged.
        float bead = WC_BEAD_ON * smoothstep(WC_BEAD_LO, WC_BEAD_HI, body) * smoothstep(0.15, 0.45, texture2D(u_wetMap, wetUV).g);
        rim *= bead;
        rimDark *= bead;
        rimCast *= bead;
      }
    }
    // (#536, ADR 011 §17.6) The paint relaxing outward as the water goes.
    //
    // The model is inverted from the obvious one, and that inversion is the
    // whole reason this is safe. The obvious version lets a mark start tight
    // and *mutate* toward its spread state, which means a snapshot taken
    // mid-drying freezes a half-finished mark and a later stroke can glaze over
    // one — clocks in the content, which §2 does not allow. Here the stored
    // pixels are the finished, fully spread mark from the instant the pen came
    // up, and what is transient is a correction *held against* them, which goes
    // to zero. Nothing downstream of the frame buffer can ever see it.
    //
    // An S-curve on coverage rather than a blur, and it needs no extra taps
    // because it needs no neighbours: pulling the soft margin of a mark down
    // while leaving its core alone *is* "the paint has not reached out there
    // yet". Letting go of it fills the margin back in, and the mark visibly
    // creeps into the water over the drying window. The core coming up very
    // slightly at the same time is the other half of the same observation, and
    // it runs the right way round — watercolour dries lighter, so while it is
    // wet it is a shade deeper in the middle than it will end up.
    // Two S-curves rather than one, and the reason is Ilya's own measurement:
    // "кажется растекание есть, просто оно слишком слабое — я два скрина
    // сравнил, штрих в луже и вправду отличается". One smoothstep moves a
    // half-covered fringe pixel by about a tenth; the eye does not read a tenth
    // as movement over thirty seconds, it reads it as nothing. Composed, the
    // same guarantees hold — still exactly 0 at 0 and 1 at 1, still monotone,
    // so the picture still converges on the stored pixels — while the margin
    // now loses about half of itself at full flood and visibly fills back in.
    // (#536) ...and it is a REVEAL, not a mild tightening. What is stored is
    // the finished mark, halo and all (ADR 011 s17.10). While the paper is wet
    // the halo is held back - the thin film (alpha under WC_CORE_A) is masked
    // out in proportion to held, the dense core is left alone - and as the
    // water goes the mask lifts and the halo comes up out of the core, fast at
    // first and then slowing. That is the drying Ilya described, and it is the
    // part the earlier S-curve could not do: it pulled a fringe down by a
    // fraction, which hid nothing, so a wet-in-wet mark arrived already spread.
    //
    // Fixed alpha thresholds rather than a per-pixel "is this halo" flag: the
    // display has no such flag and would need a second layer-sized transient to
    // carry one. The halo is thin by construction (its dose is a quarter of the
    // core's), so alpha separates the two well enough, and the mask only ever
    // acts where the paper is wet.
    float core = smoothstep(WC_HALO_A, WC_CORE_A, graphite);
    graphite *= mix(1.0, core, held);
    // Well under 1: even a flooded sheet is not a mirror, and leaving most of
    // the grain is what keeps a wet patch reading as paper rather than as a
    // hole in the paper.
    float shownHeight = mix(paperHeight, 0.5, wet * 0.5);
    float gloss = rim * WC_WET_GLOSS;
    float shade = rimDark * WC_WET_SHADE + rimCast * WC_WET_CAST;

    ${paperToneGLSL('shownHeight')}
    float graphiteTexture = mix(1.0, shownHeight * 0.5 + 0.2, graphite * 0.25);
    vec3 graphiteTone = mix(paperTone, strokeColor, graphiteTexture);
    vec3 color = mix(paperTone, graphiteTone, graphite);
    // And the smaller half of it: wet paper is a shade deeper than dry, which
    // is the same fact as "watercolour dries lighter" seen from the other side.
    // Three per cent at full flood — under what anyone would call a change of
    // colour, and enough to see a puddle.
    // (#536) …and it is read off a much softer, wider gate than the sheen.
    //
    // "Серое пятно исчезло совсем, хотя оно давало эффект влажной бумаги — оно
    // просто должно быть едва видным." Riding the sheen's own 0.35..0.95
    // threshold, it was a hard-edged patch that appeared and vanished with it;
    // damp paper is not a patch with an edge. This gate opens far earlier and
    // saturates far sooner, so the whole wetted area carries the tint and it
    // fades out smoothly at the margin instead of stopping at a line. Which is
    // also the difference between this and a halo: an area, not a ring.
    // 1.2 per cent: "она должна быть едва заметная". Twice this read as a grey
    // patch rather than as damp paper.
    float onPaint = smoothstep(0.02, 0.25, graphite);
    float wetToneShare = mix(WC_WET_PAPER_TONE_SHARE, WC_WET_PAINT_TONE_SHARE, onPaint);
    color *= 1.0 - 0.012 * damp * wetToneShare;
    // (s17.33) ...and FRESH water on top of that: the tint above saturates at
    // 0.3 of wetness, so a drop of clean water into a wash that is still wet
    // showed nothing at all ("рисование водой ничего не рисует, пятно
    // проявляется потом") - the wash and the drop were both past the gate.
    // A second, deeper shade that keeps rising to full wetness reads a
    // fresh mark darker than the older wet around it and fades with the
    // same clock; it is a picture of the water, not of any paint (the
    // design thread: show the water, never a bloom the model has not made).
    // (s17.43) ...on bare paper. Over PAINT the same neutral shade read as
    // dirt: darkening every channel alike is what a grey wash over a colour
    // does, and Ilya painted with it - "пока не высохло, цвет грязный". Wet
    // paint is not greyer than dry, it is DEEPER: the film is thicker and
    // more saturated, and dries lighter and duller. So over paint the fresh
    // water deepens the tone instead (a power on the colour: whites stay
    // white, a colour gains chroma as it darkens), and the neutral shade is
    // kept for the paper between the marks, where a drop of clean water
    // still has to show. Both fade with the same clock.
    color *= mix(1.0, 1.0 - WC_FRESH_SHADE, fresh * (1.0 - onPaint) * wetToneShare);
    color = pow(max(color, vec3(0.0)), vec3(1.0 + WC_FRESH_DEEPEN * fresh * onPaint * wetToneShare));
    // (#680, s17.83) ...and a pool one step deeper again, the same two ways.
    color *= mix(1.0, 1.0 - WC_POOL_SHADE, pool * (1.0 - onPaint) * wetToneShare);
    color = pow(max(color, vec3(0.0)), vec3(1.0 + WC_POOL_DEEPEN * pool * onPaint * wetToneShare));
    color += vec3(gloss);
    color *= 1.0 - shade;

    // Antialiased page edge. A hard test leaves the sheet's border crawling
    // with jaggies at any camera angle, and the border is a straight line the
    // eye follows — the one place stair-stepping is impossible to miss.
    // fwidth() would be the usual tool and is not available in WebGL1 without
    // an extension, so the ramp is one world unit wide: at zoom 1 that is a
    // pixel, and at any other zoom it stays a fixed, small fraction of the
    // sheet rather than growing into a visible smear.
    float onPage = 1.0;
    if (u_pageRect.z > u_pageRect.x) {
      vec2 lo = smoothstep(u_pageRect.xy - 1.0, u_pageRect.xy, worldPos);
      vec2 hi = 1.0 - smoothstep(u_pageRect.zw, u_pageRect.zw + 1.0, worldPos);
      onPage = lo.x * lo.y * hi.x * hi.y;
    }

    gl_FragColor = vec4(mix(u_deskColor, color, onPage), 1.0);
  }
`;

// (#527) Rasterizes one shape — rectangle, ellipse, star or line — into a
// layer tile. Runs once per tile the shape touches, on commit and on every
// frame of the editing session's preview.
//
// Reuses DISPLAY_VERT's fullscreen quad and AREA_MASK_FRAG's trick of turning
// the quad's uv into a world position through the tile's own size and origin,
// so the same shader draws into a real tile, a scratch tile or a preview
// without anything upstream translating coordinates.
//
// **What it deliberately does not use.** No fwidth/dFdx: the antialiased rim
// is one layer unit, which is one pixel of a tile buffer by construction, so
// the ramp is a constant rather than a screen-space derivative — and
// derivatives are the family `.claude/rules.md` singles out as having broken
// cross-device agreement three times. No trigonometry for placement, sectors
// or stroke geometry either: every cos/sin/atan those would need is computed
// once in JavaScript (shapeGeometry.ts) and arrives as a uniform. What is left
// is one `atan` in the star's angular fold, which has no cheaper form and
// whose error moves an edge by a small fraction of a pixel rather than
// changing what is drawn.
//
// **The distance fields.** Rectangle and line are exact. The ellipse is a
// first-order estimate — F/|grad F| — which is exact on the contour itself and
// only approximate away from it, i.e. correct exactly where the antialiased
// edge and the stroke band read it. The star folds space into one sector and
// measures against a single edge, which is exact for the contour and needs its
// normal for one more reason: a star's frame need not be square, so it is
// defined in a normalized space and the distance has to be converted back
// through the local gradient, or a stroke on a wide star would be thicker
// along one axis than the other.
export const SHAPE_FRAG = `
  precision highp float;

  uniform vec2 u_dstSize;
  uniform vec2 u_dstOrigin;

  uniform vec2 u_center;
  uniform vec2 u_rotCS;
  uniform vec2 u_half;

  uniform int u_kind;
  uniform vec3 u_base;
  uniform vec3 u_outer;
  uniform vec3 u_inner;
  uniform float u_hasInner;
  uniform float u_strokeContours;
  uniform vec2 u_band;

  uniform float u_ringRatio;
  uniform float u_closePath;
  uniform float u_sectorMode;
  uniform vec2 u_sectorDir;
  uniform vec2 u_sectorCS;

  uniform float u_starPoints;
  uniform vec2 u_starRot;

  uniform vec2 u_lineDir;
  uniform float u_lineHalfLen;
  uniform float u_lineCap;

  uniform vec3 u_fillColor;
  uniform float u_hasFill;
  uniform vec3 u_strokeColor;
  uniform float u_hasStroke;

  varying vec2 v_uv;

  const float PI = 3.141592653589793;

  // Coverage from a signed distance, over a one-unit ramp centred on the
  // contour. Linear rather than smoothstep: a shape's edge is a straight cut
  // through the pixel, and the fraction of the pixel it covers is linear in
  // the distance to it.
  float cov(float d) {
    return clamp(0.5 - d, 0.0, 1.0);
  }

  float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  }

  float sdEllipse(vec2 p, vec2 ab) {
    vec2 q = p / ab;
    float k = length(q);
    if (k < 1e-6) return -min(ab.x, ab.y);
    // grad of length(p/ab) with respect to p, so (k - 1) / |grad| is the
    // first-order distance to the k = 1 contour.
    vec2 g = vec2(q.x / ab.x, q.y / ab.y) / k;
    return (k - 1.0) / max(length(g), 1e-9);
  }

  // The sector, as a wedge test built from two half-planes. u_sectorDir is the
  // bisector and u_sectorCS the half aperture's (cos, sin); mode 2 is the
  // reflex case, which is the complement of the opposite wedge.
  float sdWedge(vec2 p) {
    if (u_sectorMode < 0.5) return -1e9;
    vec2 d = u_sectorDir;
    vec2 n1 = vec2(d.x * u_sectorCS.y + d.y * u_sectorCS.x, d.y * u_sectorCS.y - d.x * u_sectorCS.x);
    vec2 n2 = vec2(d.x * u_sectorCS.y - d.y * u_sectorCS.x, d.y * u_sectorCS.y + d.x * u_sectorCS.x);
    float w = max(-dot(p, n1), -dot(p, n2));
    return u_sectorMode > 1.5 ? -w : w;
  }

  // The ellipse without its sector cut: a ring or a full ellipse. Kept
  // separate because an *open* sector's stroke follows only this contour —
  // the arcs — while its fill is still the closed region (see below).
  float sdEllipseBody(vec2 p, vec3 prm) {
    float d = sdEllipse(p, prm.xy);
    if (u_ringRatio > 0.0) d = max(d, -sdEllipse(p, prm.xy * u_ringRatio));
    return d;
  }

  // The wedge arrives as a value rather than being called for here, and that
  // is not a micro-optimisation: calling sdWedge from more than one place makes
  // this program fail to *link* on ANGLE/D3D11, with an empty info log and a
  // lost context (found by bisection, #527). Computing it once in main and
  // passing it down is both the fix and the cheaper shape — the sector does not
  // depend on which contour is being measured.
  float sdEllipseShape(vec2 p, vec3 prm, float wedge) {
    float d = sdEllipseBody(p, prm);
    if (u_sectorMode > 0.5) d = max(d, wedge);
    return d;
  }

  // Distance to a star, in the normalized space where its frame is a unit
  // circle. Writes the contour normal in that same space, which the caller
  // needs to convert the distance back to layer units.
  float sdStarN(vec2 q, float R, float r, out vec2 nrm) {
    vec2 p = vec2(q.x * u_starRot.x + q.y * u_starRot.y, -q.x * u_starRot.y + q.y * u_starRot.x);
    float an = PI / u_starPoints;
    float a = atan(p.y, p.x);
    float k = mod(a + an, 2.0 * an) - an;
    float L = length(p);
    float cs = cos(k);
    float sn = sin(k);
    vec2 f = L * vec2(cs, abs(sn));

    vec2 A = vec2(R, 0.0);
    vec2 B = vec2(r * cos(an), r * sin(an));
    vec2 e = B - A;
    vec2 w = f - A;
    float h = clamp(dot(w, e) / max(dot(e, e), 1e-12), 0.0, 1.0);
    vec2 dv = w - e * h;
    float len = length(dv);
    float sgn = (e.x * w.y - e.y * w.x) > 0.0 ? -1.0 : 1.0;

    vec2 nf = len > 1e-9 ? dv / len * sgn : vec2(1.0, 0.0);
    if (sn < 0.0) nf.y = -nf.y;
    float fa = a - k;
    vec2 rr = vec2(cos(fa), sin(fa));
    vec2 nr = vec2(nf.x * rr.x - nf.y * rr.y, nf.x * rr.y + nf.y * rr.x);
    nrm = vec2(nr.x * u_starRot.x - nr.y * u_starRot.y, nr.x * u_starRot.y + nr.y * u_starRot.x);
    return len * sgn;
  }

  float sdStarShape(vec2 p, vec3 prm) {
    vec2 q = p / u_half;
    vec2 nrm;
    float dn = sdStarN(q, prm.x, prm.y, nrm);
    // Back to layer units: the normalized-space gradient of this field, seen
    // in layer space, is the normal divided by the half-extents.
    float scale = length(vec2(nrm.x / u_half.x, nrm.y / u_half.y));
    return dn / max(scale, 1e-9);
  }

  // A line has no interior, so this returns the distance to the *stroked*
  // band directly: the cap decides whether the ends are rounded, cut flush or
  // extended by half the width.
  float sdLineBand(vec2 p) {
    float halfW = max(u_band.y, 0.0);
    float t = dot(p, u_lineDir);
    float s = dot(p, vec2(-u_lineDir.y, u_lineDir.x));
    if (u_lineCap > 0.5 && u_lineCap < 1.5) {
      return length(vec2(max(abs(t) - u_lineHalfLen, 0.0), s)) - halfW;
    }
    float ext = u_lineCap > 1.5 ? halfW : 0.0;
    return max(abs(t) - (u_lineHalfLen + ext), abs(s) - halfW);
  }

  float shapeDist(vec2 p, vec3 prm, float wedge) {
    if (u_kind == 0) return sdRoundBox(p, prm.xy, prm.z);
    if (u_kind == 1) return sdEllipseShape(p, prm, wedge);
    return sdStarShape(p, prm);
  }

  void main() {
    vec2 worldPx = vec2(v_uv.x, 1.0 - v_uv.y) * u_dstSize + u_dstOrigin;
    vec2 rel = worldPx - u_center;
    vec2 p = vec2(rel.x * u_rotCS.x + rel.y * u_rotCS.y, -rel.x * u_rotCS.y + rel.y * u_rotCS.x);

    // Exactly one call, for the linker's sake — see sdEllipseShape.
    float wedge = sdWedge(p);
    float fillA = 0.0;
    float strokeA = 0.0;

    if (u_kind == 3) {
      strokeA = u_hasStroke * cov(sdLineBand(p));
    } else {
      float dBase = shapeDist(p, u_base, wedge);
      // A fill is always the closed region: an open contour has no inside
      // anyone would predict, so closePath governs the stroke alone.
      fillA = u_hasFill * cov(dBase);
      if (u_hasStroke > 0.5) {
        if (u_kind == 1 && u_sectorMode > 0.5 && u_closePath < 0.5) {
          // Open sector: stroke the arcs only, clipped to the sector, instead
          // of running the band around the straight sides as well.
          float band = abs(sdEllipseBody(p, u_base) - u_band.x) - u_band.y;
          strokeA = cov(max(band, wedge));
        } else if (u_strokeContours > 0.5) {
          float dOut = shapeDist(p, u_outer, wedge);
          float d = dOut;
          if (u_hasInner > 0.5) d = max(dOut, -shapeDist(p, u_inner, wedge));
          strokeA = cov(d);
        } else {
          strokeA = cov(abs(dBase - u_band.x) - u_band.y);
        }
      }
    }

    // Stroke over fill, both premultiplied — the layer buffer stores
    // premultiplied colour in .rgb and coverage in .a, and beginDraw()'s
    // (ONE, ONE_MINUS_SRC_ALPHA) expects exactly this.
    float a = strokeA + fillA * (1.0 - strokeA);
    vec3 rgb = u_strokeColor * strokeA + u_fillColor * fillA * (1.0 - strokeA);
    gl_FragColor = vec4(rgb, a);
  }
`;

// ─── Digital brush, stamp model (#573, ADR 013 §11) ─────────────────────────
//
// The digital brush's own two programs. Until #573 the brush borrowed DAB_FRAG:
// its stamp was u_inkMode=10 and its composite the brush pen's u_inkMode=8.
// That was right for one round tip and stops being right the moment the tip is
// a picture — a new sampler in DAB_FRAG would have to be bound, validly, by
// every one of the dozen draw paths that share that program (the 1282 lesson
// in engine's _drawRibbonNibPass), and three shipped tools would sit one typo
// away from regressing. A program of its own costs one compile.
//
// The coverage buffer this writes has two meanings in two channels, which is
// the whole of the new model:
//
//   .rgb  flow, accumulated as textbook "over" — `c' = f + c * (1 - f)`,
//         through blendFunc(ONE, ONE_MINUS_SRC_COLOR). Approaches 1, never
//         passes it, exactly as before.
//   .a    the stroke's opacity *ceiling*, the highest any stamp so far has
//         allowed here — through blendEquation MAX (EXT_blend_minmax).
//
// The composite multiplies the two. That is Photoshop's and Krita's meaning
// of pressure→opacity, and the thing a flow curve cannot do: scrubbing back
// and forth at a light pressure inside one stroke saturates the flow, and the
// ceiling holds the tone where the light pressure put it. With the switch off
// every stamp's ceiling is 1 and the composite reads flow alone.
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
  uniform sampler2D u_texture;
  uniform float u_texStrength;
  uniform float u_texPeriod;
  uniform vec2 u_texOrigin;
  uniform vec2 u_resolution;

  varying vec2 v_localUV;
  varying float v_opacity;
  varying float v_radius;

  void main() {
    float shape;
    if (u_tipKind < 0.5) {
      // Normalized radius: v_localUV is the dab's own frame, 1.0 at the
      // boundary, so this is scale-free and an ellipse comes out as one.
      float d = length(v_localUV);
      if (d >= 1.0) discard;
      // The ramp is a fraction of the *mark*, not an absolute width: a soft
      // 200px brush has to have a 200px-scale falloff. u_aaPx enters only as
      // the floor, so the hardest brush still antialiases.
      float aaNorm = clamp(u_aaPx / max(v_radius, 1e-4), 0.004, 0.9);
      float inner = min(u_hardness, 1.0 - aaNorm);
      shape = 1.0 - smoothstep(inner, 1.0, d);
    } else {
      // The quad spans -1..1 in the stamp's own (rotated) frame, and the mask
      // is stored with row 0 on top — see tipMasks.ts on orientation.
      shape = texture2D(u_tip, v_localUV * 0.5 + 0.5).r;
    }
    if (shape <= 0.0) discard;

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
    if (u_texStrength > 0.0) {
      // World position, top-down like every Dab.x/y; tiles draw with GL's
      // bottom-up rows, so y is measured back from the tile's top.
      vec2 w = vec2(u_texOrigin.x + gl_FragCoord.x,
                    u_texOrigin.y + (u_resolution.y - gl_FragCoord.y));
      float g = texture2D(u_texture, w / u_texPeriod).r;
      // Same pressure-into-tooth rule as the paper above, on the brush's own
      // grain: a light touch catches only the high points.
      // Stays well above the bottom of the range even at full weight: a real
      // dry brush breaks up however hard it is pressed, which is the point.
      float reach = mix(0.7, 0.34, u_paperPressure);
      amount *= mix(1.0, smoothstep(reach - 0.1, reach + 0.14, g), u_texStrength);
    }
    if (amount <= 0.0) discard;

    // The ceiling follows the stamp's silhouette only as far as needed to stay
    // continuous: a hard step at the stamp's rim would draw a visible circle
    // wherever a firm stamp's edge crosses a lighter part of the same stroke.
    float ceiling = u_ceiling * smoothstep(0.0, 0.3, shape);
    gl_FragColor = vec4(vec3(amount), ceiling);
  }
`;

// The finished pixel, recomputed from the layer as it was before the stroke
// and the stroke's own coverage — the same "freeze, accumulate, recompute"
// the marker established (RibbonStrokeScratch), so a pixel the stroke revisits
// is recomputed rather than painted over again.
export const BRUSH_COMPOSITE_FRAG = `
  precision highp float;

  uniform sampler2D u_original;
  uniform sampler2D u_strokeCoverage;
  uniform vec2 u_resolution;
  uniform vec3 u_color;
  // The stroke's opacity — the user's slider, applied once to the finished
  // silhouette (ADR 013 §3).
  uniform float u_opacity;
  // 1 = multiply flow by the stored ceiling (the pressure→opacity switch on).
  uniform float u_useCeiling;
  // Screentone pitch in world px, 0 = continuous tone.
  uniform float u_screentone;
  // This tile's world origin, already reduced modulo the screen's own period
  // on the CPU — see BrushPainter.drawComposite. Keeps every number this shader
  // handles small, so a mediump fallback cannot shift the dots.
  uniform vec2 u_screenOrigin;
  // (#579) Digital watercolor — see BrushDescriptor.wet. u_wetEdgePx is a
  // constant of the gesture (the first dab's size), so a live stroke and a
  // replay of it read the same neighbourhood.
  uniform float u_wetEdge;
  uniform float u_wetEdgePx;
  uniform float u_mottle;
  uniform float u_granulation;
  uniform float u_glaze;
  // Canvas-anchored tone textures, each with its origin reduced modulo its own
  // period on the CPU (same reason as u_screenOrigin).
  uniform sampler2D u_cloudTex;
  uniform sampler2D u_grainTex;
  uniform float u_cloudPeriod;
  uniform vec2 u_cloudOrigin;
  uniform float u_grainPeriod;
  uniform vec2 u_grainOrigin;
  // (#581) Which wet model: 1 = #579's (tone by coverage, kept so strokes
  // recorded with those brushes replay unchanged), 2 = density through a
  // power on the colour's transmittance. 0 for brushes that are not wet.
  uniform float u_wetModel;
  uniform float u_bloom;
  uniform float u_feather;
  // The room's paper, for granulation: pigment settles in its valleys.
  uniform sampler2D u_paperHeightMap;
  uniform vec2 u_paperScale;
  uniform vec2 u_paperOrigin;
  uniform vec2 u_paperTexSize;

  void main() {
    vec2 tileUV = gl_FragCoord.xy / u_resolution;
    vec4 c = texture2D(u_strokeCoverage, tileUV);
    if (c.r <= 0.0) discard;
    float cov = c.r;
    if (u_useCeiling > 0.5) cov *= c.a;

    // ── (#581) Wet model 2 ──────────────────────────────────────────────────
    //
    // Everything below is taken from the watercolor NPR literature rather
    // than tuned from scratch — Bousseau et al. 2006, Curtis et al. 1997,
    // Montesdeoca et al. 2017 (MNPR) — and it hangs on one idea from all three:
    // pigment concentration is a *density* applied to the colour's
    // transmittance, T' = T^d, not a blend toward paper. That is what makes a
    // concentrated patch darker and more saturated at once, as real pigment
    // is; blending toward paper makes it darker and greyer, which was the main
    // thing that read as fake in model 1.
    if (u_wetModel > 1.5) {
      vec2 w = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
      vec2 cw = u_cloudOrigin + w;

      // Wet-in-wet edge: the rim dissolves into a feathered, uneven fringe
      // instead of a line. Fine noise pushes the soft outer ramp in and out.
      // Only the outer fringe moves (fringe falls to 0 by half coverage): the
      // body of the stroke is not the edge, and modulating it too printed the
      // noise's tile as a row of blocks. Two scales, so the fringe has both
      // lobes and fine fibres and neither repeats visibly.
      if (u_feather > 0.0) {
        float lobes = texture2D(u_cloudTex, cw / (u_cloudPeriod * 0.5)).r;
        float fibres = texture2D(u_grainTex, (u_grainOrigin + w) / u_grainPeriod).r;
        float fringe = 1.0 - smoothstep(0.0, 0.55, cov);
        float n = mix(lobes, fibres, 0.35) - 0.5;
        cov = clamp(cov * (1.0 + u_feather * n * 2.4 * fringe), 0.0, 1.0);
        if (cov <= 0.002) discard;
      }

      // Edge darkening at two scales (a difference of box rings, the DoG of
      // MNPR): a narrow ring for the sharp outer front of the tideline, a
      // wide one for its falloff inward. Sixteen fixed directions and no
      // helper function, for the reasons the model-1 block below gives.
      float edge = 0.0;
      if (u_wetEdge > 0.0) {
        vec2 rN = vec2(max(u_wetEdgePx * 0.3, 1.0)) / u_resolution;
        vec2 rW = vec2(u_wetEdgePx) / u_resolution;
        vec4 q;
        float nearSum = 0.0;
        q = texture2D(u_strokeCoverage, tileUV + rN * vec2(1.0, 0.0));        nearSum += smoothstep(0.0, 0.55, u_useCeiling > 0.5 ? q.r * q.a : q.r);
        q = texture2D(u_strokeCoverage, tileUV + rN * vec2(-1.0, 0.0));       nearSum += smoothstep(0.0, 0.55, u_useCeiling > 0.5 ? q.r * q.a : q.r);
        q = texture2D(u_strokeCoverage, tileUV + rN * vec2(0.0, 1.0));        nearSum += smoothstep(0.0, 0.55, u_useCeiling > 0.5 ? q.r * q.a : q.r);
        q = texture2D(u_strokeCoverage, tileUV + rN * vec2(0.0, -1.0));       nearSum += smoothstep(0.0, 0.55, u_useCeiling > 0.5 ? q.r * q.a : q.r);
        q = texture2D(u_strokeCoverage, tileUV + rN * vec2(0.7071, 0.7071));   nearSum += smoothstep(0.0, 0.55, u_useCeiling > 0.5 ? q.r * q.a : q.r);
        q = texture2D(u_strokeCoverage, tileUV + rN * vec2(-0.7071, 0.7071));  nearSum += smoothstep(0.0, 0.55, u_useCeiling > 0.5 ? q.r * q.a : q.r);
        q = texture2D(u_strokeCoverage, tileUV + rN * vec2(0.7071, -0.7071));  nearSum += smoothstep(0.0, 0.55, u_useCeiling > 0.5 ? q.r * q.a : q.r);
        q = texture2D(u_strokeCoverage, tileUV + rN * vec2(-0.7071, -0.7071)); nearSum += smoothstep(0.0, 0.55, u_useCeiling > 0.5 ? q.r * q.a : q.r);
        float wideSum = 0.0;
        q = texture2D(u_strokeCoverage, tileUV + rW * vec2(0.9239, 0.3827));   wideSum += smoothstep(0.0, 0.55, u_useCeiling > 0.5 ? q.r * q.a : q.r);
        q = texture2D(u_strokeCoverage, tileUV + rW * vec2(-0.9239, 0.3827));  wideSum += smoothstep(0.0, 0.55, u_useCeiling > 0.5 ? q.r * q.a : q.r);
        q = texture2D(u_strokeCoverage, tileUV + rW * vec2(0.9239, -0.3827));  wideSum += smoothstep(0.0, 0.55, u_useCeiling > 0.5 ? q.r * q.a : q.r);
        q = texture2D(u_strokeCoverage, tileUV + rW * vec2(-0.9239, -0.3827)); wideSum += smoothstep(0.0, 0.55, u_useCeiling > 0.5 ? q.r * q.a : q.r);
        q = texture2D(u_strokeCoverage, tileUV + rW * vec2(0.3827, 0.9239));   wideSum += smoothstep(0.0, 0.55, u_useCeiling > 0.5 ? q.r * q.a : q.r);
        q = texture2D(u_strokeCoverage, tileUV + rW * vec2(-0.3827, 0.9239));  wideSum += smoothstep(0.0, 0.55, u_useCeiling > 0.5 ? q.r * q.a : q.r);
        q = texture2D(u_strokeCoverage, tileUV + rW * vec2(0.3827, -0.9239));  wideSum += smoothstep(0.0, 0.55, u_useCeiling > 0.5 ? q.r * q.a : q.r);
        q = texture2D(u_strokeCoverage, tileUV + rW * vec2(-0.3827, -0.9239)); wideSum += smoothstep(0.0, 0.55, u_useCeiling > 0.5 ? q.r * q.a : q.r);
        // Read on coverage saturated at half: what makes a tideline is the
        // boundary of the wet area, not the terraces where one more stamp
        // overlapped — at a stroke's round start those terraces are a set of
        // concentric arcs, and the sharp ring drew every one of them.
        float covS = smoothstep(0.0, 0.55, cov);
        float sharp = clamp((covS - nearSum / 8.0) * 5.0, 0.0, 1.0);
        float wide = clamp((covS - wideSum / 8.0) * 2.2, 0.0, 1.0);
        edge = max(sharp, wide * 0.5);
      }

      // Low-frequency turbulence — Bousseau's d = 1 + beta(T - 0.5).
      float cloud = texture2D(u_cloudTex, cw / u_cloudPeriod).r;

      // Blooms / backruns: where water crept back into a drying wash it pushed
      // the pigment outward — a lighter patch with a dark, branching border.
      // The border is a threshold of domain-warped noise, which is what gives
      // it the cauliflower fingers; the band around the threshold is the dark
      // line. Only in the stroke's body: a bloom does not start at the rim.
      float bloomIn = 0.0;
      float bloomRim = 0.0;
      if (u_bloom > 0.0) {
        vec2 warp = vec2(texture2D(u_cloudTex, cw / (u_cloudPeriod * 0.9)).r,
                         texture2D(u_cloudTex, (cw + vec2(173.0, 91.0)) / (u_cloudPeriod * 0.9)).r) - 0.5;
        // A second, fine warp crinkles the border into the cauliflower fringe
        // a real backrun has; without it the border is a smooth blob.
        float crinkle = texture2D(u_grainTex, (u_grainOrigin + w) / u_grainPeriod).r - 0.5;
        float b = texture2D(u_cloudTex, (cw + warp * 110.0) / (u_cloudPeriod * 1.5)).r + crinkle * 0.05;
        // Rare and large rather than a scatter of pale islands: only the top
        // of the noise blooms, and each bloom spans a good part of the stroke.
        // Uniform pale patches with a neat outline everywhere read as a skin
        // condition, not as paint ("витилиго" — Ilya).
        //
        // Biased toward the stroke's edge: a backrun is water creeping back
        // in from the wetter rim into a drying wash, so it starts there.
        float nearEdge = 1.0 - smoothstep(0.55, 0.98, cov);
        float th = 1.0 - u_bloom * 0.2 - 0.12 * nearEdge;
        float body = smoothstep(0.3, 0.7, cov);
        // Barely lighter inside, fading in over a wide band: the eye should
        // find the rim, not a hole.
        bloomIn = smoothstep(th, th + 0.16, b) * body;
        // The pigment piles up on the outside of the front, and fades outward
        // — a soft dark band, not an ink outline.
        bloomRim = smoothstep(th - 0.1, th - 0.006, b) * (1.0 - smoothstep(th - 0.006, th + 0.01, b)) * body;
      }

      // Granulation: pigment settles in the paper's valleys, the *opposite*
      // sign to dry brush, and shows most in a pale wash (MNPR). The canvas
      // grit stands in where the paper is smooth.
      float grain = 0.5;
      if (u_granulation > 0.0) {
        vec2 paperUV = (gl_FragCoord.xy + u_paperOrigin) / u_paperTexSize * u_paperScale;
        float h = texture2D(u_paperHeightMap, paperUV).r;
        float g = texture2D(u_grainTex, (u_grainOrigin + w) / u_grainPeriod).r;
        grain = mix(g, h, 0.7);
      }

      float d = 1.0;
      d += u_wetEdge * (1.5 * edge - 0.35 * (1.0 - edge));
      d *= 1.0 + u_mottle * (cloud - 0.5) * 1.1;
      d += u_granulation * (0.5 - grain) * 1.3 * (1.0 + 1.5 * (1.0 - cov));
      d *= 1.0 - 0.3 * bloomIn;
      d += u_bloom * 0.9 * bloomRim;
      d = max(d, 0.05);

      // The stroke as a transmittance filter at its base concentration, then
      // concentrated by d.
      float a0 = clamp(cov * u_opacity, 0.0, 1.0);
      vec3 T = pow(max(mix(vec3(1.0), u_color, a0), vec3(0.002)), vec3(d));
      // Back to a premultiplied layer colour: the darkest channel sets the
      // alpha, and the colour follows so that over white it reproduces T
      // exactly (cs + 1 - aE == T).
      float aE = clamp(1.0 - min(T.r, min(T.g, T.b)), 0.0, 1.0);
      vec3 cs = T - vec3(1.0 - aE);
      vec4 dst0 = texture2D(u_original, tileUV);
      if (u_glaze > 0.5) {
        // Over paint: Cd * T exactly — the subtractive layering of a glaze.
        gl_FragColor = vec4(cs * dst0.rgb + cs * (1.0 - dst0.a) + dst0.rgb * (1.0 - aE),
                            aE + (1.0 - aE) * dst0.a);
      } else {
        gl_FragColor = vec4(cs + (1.0 - aE) * dst0.rgb, aE + (1.0 - aE) * dst0.a);
      }
      return;
    }

    if (u_wetEdge > 0.0) {
      // Mean coverage on two rings around this pixel. Where the stroke's own
      // coverage stands above its surroundings the pixel is at the rim, where
      // it matches them it is inside. Sixteen fixed directions written out
      // rather than a loop over sin/cos: no transcendental per pixel, and no
      // helper function called from several places — the ANGLE link failure
      // with an empty log that pattern produced once already.
      //
      // Clamped at the tile's border like every coverage read here, so within
      // one ring's width of a tile seam the rim is read a little softer. A
      // bounded room's seams sit at x=1024/y=1024.
      vec2 r1 = vec2(u_wetEdgePx) / u_resolution;
      vec2 r2 = r1 * 0.5;
      float ring = 0.0;
      vec4 s;
      s = texture2D(u_strokeCoverage, tileUV + r1 * vec2(1.0, 0.0));        ring += u_useCeiling > 0.5 ? s.r * s.a : s.r;
      s = texture2D(u_strokeCoverage, tileUV + r1 * vec2(-1.0, 0.0));       ring += u_useCeiling > 0.5 ? s.r * s.a : s.r;
      s = texture2D(u_strokeCoverage, tileUV + r1 * vec2(0.0, 1.0));        ring += u_useCeiling > 0.5 ? s.r * s.a : s.r;
      s = texture2D(u_strokeCoverage, tileUV + r1 * vec2(0.0, -1.0));       ring += u_useCeiling > 0.5 ? s.r * s.a : s.r;
      s = texture2D(u_strokeCoverage, tileUV + r1 * vec2(0.7071, 0.7071));   ring += u_useCeiling > 0.5 ? s.r * s.a : s.r;
      s = texture2D(u_strokeCoverage, tileUV + r1 * vec2(-0.7071, 0.7071));  ring += u_useCeiling > 0.5 ? s.r * s.a : s.r;
      s = texture2D(u_strokeCoverage, tileUV + r1 * vec2(0.7071, -0.7071));  ring += u_useCeiling > 0.5 ? s.r * s.a : s.r;
      s = texture2D(u_strokeCoverage, tileUV + r1 * vec2(-0.7071, -0.7071)); ring += u_useCeiling > 0.5 ? s.r * s.a : s.r;
      s = texture2D(u_strokeCoverage, tileUV + r2 * vec2(0.9239, 0.3827));   ring += u_useCeiling > 0.5 ? s.r * s.a : s.r;
      s = texture2D(u_strokeCoverage, tileUV + r2 * vec2(-0.9239, 0.3827));  ring += u_useCeiling > 0.5 ? s.r * s.a : s.r;
      s = texture2D(u_strokeCoverage, tileUV + r2 * vec2(0.9239, -0.3827));  ring += u_useCeiling > 0.5 ? s.r * s.a : s.r;
      s = texture2D(u_strokeCoverage, tileUV + r2 * vec2(-0.9239, -0.3827)); ring += u_useCeiling > 0.5 ? s.r * s.a : s.r;
      s = texture2D(u_strokeCoverage, tileUV + r2 * vec2(0.3827, 0.9239));   ring += u_useCeiling > 0.5 ? s.r * s.a : s.r;
      s = texture2D(u_strokeCoverage, tileUV + r2 * vec2(-0.3827, 0.9239));  ring += u_useCeiling > 0.5 ? s.r * s.a : s.r;
      s = texture2D(u_strokeCoverage, tileUV + r2 * vec2(0.3827, -0.9239));  ring += u_useCeiling > 0.5 ? s.r * s.a : s.r;
      s = texture2D(u_strokeCoverage, tileUV + r2 * vec2(-0.3827, -0.9239)); ring += u_useCeiling > 0.5 ? s.r * s.a : s.r;
      float around = ring / 16.0;
      float rim = clamp((cov - around) * 3.0, 0.0, 1.0);
      // The interior gives up pigment to the rim: lighter inside, full tone at
      // the edge, a touch darker than full right on it.
      cov *= (1.0 - u_wetEdge * 0.45 * (1.0 - rim)) + u_wetEdge * 0.3 * rim;
    }

    if (u_mottle > 0.0 || u_granulation > 0.0) {
      vec2 w = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
      // Both have a mean of ~0.5, so each factor averages to 1: the stroke
      // keeps its overall tone and only its distribution changes.
      float cloud = texture2D(u_cloudTex, (u_cloudOrigin + w) / u_cloudPeriod).r;
      float grain = texture2D(u_grainTex, (u_grainOrigin + w) / u_grainPeriod).r;
      cov *= mix(1.0, 0.5 + cloud, u_mottle);
      cov *= mix(1.0, 0.35 + 1.3 * grain, u_granulation);
      cov = clamp(cov, 0.0, 1.0);
    }

    if (u_screentone > 0.0) {
      // World position, top-down like every Dab.x/y: tiles are drawn with GL's
      // bottom-up rows, so y is measured back from the tile's top.
      vec2 w = vec2(u_screenOrigin.x + gl_FragCoord.x,
                    u_screenOrigin.y + (u_resolution.y - gl_FragCoord.y));
      // A 45-degree lattice whose period along both world axes is exactly
      // 2 * pitch, which is what lets the CPU reduce the origin exactly.
      vec2 lat = vec2(w.x + w.y, w.y - w.x) / (2.0 * u_screentone);
      vec2 f = fract(lat) - 0.5;
      // Cell side in world px is pitch * sqrt(2); the distance to the dot's
      // centre follows.
      float d = length(f) * u_screentone * 1.41421356;
      // Dot radius whose area is the tone (cov * cell area = pi r^2), eased
      // up to a full cover as the tone approaches solid — at 1.0 the area rule
      // alone leaves a lattice of gaps.
      float areaR = sqrt(cov * 2.0 / 3.14159265) * u_screentone;
      float r = mix(areaR, u_screentone * 1.05, smoothstep(0.7, 1.0, cov));
      cov = clamp(r - d + 0.5, 0.0, 1.0);
    }

    float alpha = clamp(cov * u_opacity, 0.0, 1.0);
    vec4 dst = texture2D(u_original, tileUV);
    if (u_glaze > 0.5) {
      // (#579) Premultiplied "multiply": Cs*Cd + Cs*(1 - ad) + Cd*(1 - as).
      // Over paint it darkens what is there by the stroke's colour, over an
      // empty part of the layer it is plain "over" — so a glaze on a blank
      // sheet looks exactly like any other stroke until it crosses another.
      vec3 cs = alpha * u_color;
      gl_FragColor = vec4(cs * dst.rgb + cs * (1.0 - dst.a) + dst.rgb * (1.0 - alpha),
                          alpha + (1.0 - alpha) * dst.a);
      return;
    }
    // Textbook premultiplied "over" onto the frozen pre-stroke pixel.
    gl_FragColor = vec4(alpha * u_color + (1.0 - alpha) * dst.rgb,
                        alpha + (1.0 - alpha) * dst.a);
  }
`;

/** #680: donor-form brush advection. The same fractions move optical depth.
 * Separate small program: never grow the Adreno bookkeeping shader. */
export const WC_BRUSH_DRAG_FRAG = `
  precision highp float;
  varying vec2 v_uv;
  uniform sampler2D u_paint, u_flow, u_water, u_pigment;
  uniform vec2 u_step;
  uniform vec4 u_flowRect;
  vec3 flowAt(vec2 uv) {
    vec2 local = (uv - u_flowRect.xy) / u_flowRect.zw;
    if (min(min(local.x, local.y), min(1.0-local.x, 1.0-local.y)) < 0.0) return vec3(0.5, 0.5, 0.0);
    return texture2D(u_flow, local).rgb;
  }
  vec2 axis(int k) {
    if (k == 0) return vec2(1.0, 0.0);
    if (k == 1) return vec2(-1.0, 0.0);
    if (k == 2) return vec2(0.0, 1.0);
    return vec2(0.0, -1.0);
  }
  uniform sampler2D u_color;
  uniform vec2 u_texel;
  uniform float u_contactGain;
  vec2 snapUV(vec2 uv){return (floor(uv/u_texel)+0.5)*u_texel;}
  float rawFraction(vec2 from, vec2 to, vec2 direction) {
    from=snapUV(from);to=snapUV(to);
    if (min(min(to.x, to.y), min(1.0-to.x, 1.0-to.y)) < 0.0 || min(min(from.x, from.y), min(1.0-from.x, 1.0-from.y)) < 0.0) return 0.0;
    vec3 flow = flowAt(from);
    vec2 velocity = flow.rg * 2.0 - 1.0;
    // Keep directional confidence: opposite passes can cancel. Normalising
    // a tiny residual amplified byte rounding into a full-strength flow.
    float contact = smoothstep(0.015, 0.15, min(texture2D(u_water, from).a, texture2D(u_water, to).a));
    contact *= step(0.015, texture2D(u_water, (from + to) * 0.5).a);
    float donor = texture2D(u_pigment, from).a;
    // Move wet material, with a conservative exchange down concentration.
    // Symmetric face exposure preserves a uniform field instead of
    // compressing paint along each elliptical contact boundary. The
    // calibrated pulses bound exchange by 0.84 and mixing by 0.08.
    float neighbour = texture2D(u_pigment, to).a;
    float mixFraction = 0.02 * max(donor - neighbour, 0.0) / max(donor, 5e-5);
    float doseB = min(flow.b, flowAt(to).b);
    float contactClock = -log(max(1.0 - clamp(doseB, 0.0, 1.0), 1.0 / 255.0));
    float amount = (0.3535533905932738 * u_contactGain * abs(dot(0.5 * (velocity + (flowAt(to).rg * 2.0 - 1.0)), direction)) * contactClock + mixFraction * doseB) * contact;
    return amount;
  }

  float channelLimit(float q, float cap, float raw) {
    if(q<0.5 || raw<=0.0)return 1.0;
    return min(1.0,cap/(q*raw));
  }
  float integerFraction(vec2 from,vec2 to,vec2 direction) {
    from=snapUV(from);to=snapUV(to);
    float raw=rawFraction(from,to,direction);if(raw<=0.0)return 0.0;
    vec4 P=floor(texture2D(u_pigment,from)*255.0+0.5), C=floor(texture2D(u_color,from)*255.0+0.5);
    vec4 roomP=floor((255.0-floor(texture2D(u_pigment,to)*255.0+0.5))/4.0);
    vec4 roomC=floor((255.0-floor(texture2D(u_color,to)*255.0+0.5))/4.0);
    float limit=1.0;
    limit=min(limit,channelLimit(P.r,roomP.r,raw));limit=min(limit,channelLimit(P.g,roomP.g,raw));
    limit=min(limit,channelLimit(P.b,roomP.b,raw));limit=min(limit,channelLimit(P.a,roomP.a,raw));
    limit=min(limit,channelLimit(C.r,roomC.r,raw));limit=min(limit,channelLimit(C.g,roomC.g,raw));
    limit=min(limit,channelLimit(C.b,roomC.b,raw));limit=min(limit,channelLimit(C.a,roomC.a,raw));
    return raw*limit;
  }
  void main() {
    vec2 center=snapUV(v_uv);
    vec4 own=floor(texture2D(u_paint,center)*255.0+0.5), result=own;
    for(int k=0;k<4;k++) {
      vec2 dir=axis(k), neighbour=snapUV(center+dir*u_step);
      result-=floor(own*integerFraction(center,neighbour,dir));
      result+=floor(floor(texture2D(u_paint,neighbour)*255.0+0.5)*integerFraction(neighbour,center,-dir));
    }
    gl_FragColor=result/255.0;
  }
`;
