// PAPER_WORLD_SIZE is imported rather than restated as a GLSL literal
// because the charcoal dropout period below is derived from it: a hand-copied
// number here would drift the moment that constant is retuned, which is
// exactly how DAB_FRAG's finite-difference step went wrong once before (it
// read a world-space size where it needed a texel count). paperNoise is a
// leaf module — no engine internals come with it.
import { PAPER_WORLD_SIZE } from './paperConstants'

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

  uniform vec2 u_resolution;

  varying float v_edge;
  varying float v_ink;
  varying float v_inkWater;

  void main() {
    v_edge = a_edge;
    v_ink = a_ink;
    v_inkWater = a_inkWater;
    vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
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

  varying float v_edge;
  varying float v_ink;
  varying float v_inkWater;

  void main() {
    // Inset ramp: coverage reaches 0 exactly *at* the geometric boundary and
    // 1.0 one u_aaPx inside it, rather than straddling the boundary. Keeps
    // every fragment this shader needs inside the geometry the CPU emitted (a
    // centred ramp would need the band widened by half a pixel on each side),
    // and matches the identical convention in DAB_FRAG's own nib branch so the
    // two primitives agree where they meet.
    float cov = clamp(v_edge / u_aaPx, 0.0, 1.0);
    if (cov <= 0.0) discard;
    float amount = u_mode > 0.5 ? cov * v_ink : cov;
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
    gl_FragColor = vec4(vec3(u_mode > 0.5 ? cov * v_inkWater : amount), amount);
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
  // amount — see _paintRibbonStroke) and accumulated *additively*
  // (AccumulationBuffer.beginAdditiveDraw — no per-accumulation ceiling,
  // unlike u_strokeCoverage's saturating splat). Separating this from
  // u_strokeCoverage is what lets scribbling back and forth over an
  // already-fully-covered spot keep darkening it instead of the coverage
  // ceiling silently capping darkness too (u_strokeCoverage still governs
  // the stroke's silhouette/alpha; this governs how dark the color mix
  // goes — see the composite branch below).
  uniform sampler2D u_inkLoad;
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
  // #330 stage 3 — how much less ink lands at the nib's rim than at its centre
  // (MARKER_INK_EDGE_FALLOFF). Read only by the ribbon's ink pass.
  uniform float u_inkEdge;
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
  float hash(vec2 p) {
    p = 17.0 * fract(p * 0.3183099 + vec2(0.11, 0.17));
    return fract(p.x * p.y * (p.x + p.y));
  }

  // ── Watercolor fields (#468 v2, ADR 011 §3.5-3.7) ────────────────────────
  //
  // Everything below exists to answer one criticism of v1: the wash was a
  // swept brush footprint filled with an even tone, which is the definition of
  // a marker. v1 had exactly one spatial scale of its own - paper grain, at
  // 1-3px - so the eye read "textured digital brush". These helpers add the
  // two coarser scales a real wash has, and make the mark's own boundary stop
  // coinciding with the brush's path.
  //
  // All of it is built on hash() above, which is the project's portable
  // fract/floor hash - no sin(), no finite differences, nothing that has ever
  // diverged between a desktop and a tablet GPU (see paperCatch's comment and
  // .claude/rules.md). Value noise is an interpolation of four hash samples,
  // which is contractive: a per-GPU difference in one lattice value is damped,
  // never amplified.

  /** Value noise, one lattice cell per unit of p. */
  float wcNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    // Smoothstep interpolant, so the field has no visible lattice creases.
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  /** Two octaves, roughly 0..1. The second sits at ~2.7x the frequency and a
   *  deliberately irrational-looking offset, so the two never line up into a
   *  grid. This is what gives one call both the coarse water clouds and the
   *  pigment clumping inside them. */
  float wcFbm(vec2 p) {
    return 0.63 * wcNoise(p) + 0.37 * wcNoise(p * 2.7 + vec2(31.4, 17.9));
  }

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
    return s * 0.0714286;
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
    a *= 0.25;
    float dep = a.a;
    float wat = dep > 0.004 ? clamp(a.r / dep, 0.0, 1.0) : 0.0;
    float cov = texture2D(u_strokeCoverage, uv).a;
    // How wet this place counts as: mostly the mix the stroke was made with,
    // nudged by the water actually left in the brush here.
    float wetness = mix(u_water, wat, WC_MIGRATE_LOCAL);
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
      gl_FragColor = vec4(vec3(cov), cov);
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
      float depth = clamp(-dPx / max(v_radius, 1e-4), 0.0, 1.0);
      float amount = cov * mix(u_inkEdge, 1.0, depth) * v_opacity;
      // .a is the deposit; .rgb the same deposit weighted by how wet the brush
      // was for this dab. Both accumulate additively, so the composite's r/a is
      // the deposit-weighted mean water over everything that landed here — see
      // u_inkWater. Zero for every tool that does not set it, which leaves the
      // ratio undefined and unread.
      gl_FragColor = vec4(vec3(amount * u_inkWater), amount);
      return;
    }

    float dist = length(v_localUV);
    // #452: v_wick is 0 for every tool but the liner, so this is the exact
    // "dist > 1.0" cutoff it has always been everywhere else. Only the liner
    // grows its quad past the mark's own edge, and only its branch below reads
    // anything out of the band that opens up: shape is exactly 0 out there
    // (smoothstep clamps to 1 at dist >= 1.0), so graphite/charcoal/eraser
    // deposit nothing there even if some future draw did widen their quads.
    if (dist > 1.0 + v_wick) discard;

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
        : texture2D(u_inkLoad, tileUV);

      // §4.1 - how wet the brush was *here*, recovered from the deposit's own
      // weighted sum (see u_inkWater). Outside the mark there is no deposit to
      // divide by, so the batch's nominal water stands in; that region is the
      // spread fringe, which is about to be decided by exactly this value.
      float waterHere = ink.a > 0.004 ? clamp(ink.r / ink.a, 0.0, 1.0) : u_water;

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
      if (u_spreadPx > 0.0) {
        // Reach scales with the water actually left here, not just with the
        // stroke's nominal setting. A stroke that starts flooded and runs dry
        // therefore spreads far at its beginning and hardly at all by its end,
        // inside one mark.
        float reach = u_spreadPx * mix(0.25, 1.0, waterHere);
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
        float thr = 0.5 + u_edgeWander * (wcFbm(wp * 0.030) - 0.5);
        // §4.1 - how sharply the boundary resolves, and the range is water's
        // to set. A flood has edges running from nearly lost to fairly crisp
        // within one mark; a dry brush has only crisp ones, because there is no
        // liquid to feather them.
        float soft = max(u_edgeSoft, 0.03) * mix(0.75, 1.25, wcFbm(wp * 0.017 + vec2(53.0, 11.0)));
        coverage = smoothstep(thr, thr + soft, blurred);
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
      float dryness = u_dryContact * (1.0 - waterHere);
      if (dryness > 0.0) {
        // §8 - the brush's own hairs, not just the paper's relief.
        //
        // A nearly dry round brush does not present a clean disc to the paper:
        // its hairs group into bundles and separate, so the mark breaks into
        // *longitudinal* streaks running along the travel. A term that knows
        // only the paper's height threshold cannot produce those, and what it
        // produces instead reads as an aerosol or a pastel — which is exactly
        // how the dry brush was described.
        //
        // Modelled by sampling a field in a frame rotated onto the stroke's own
        // direction and stretched some fifteen times along it: fine across the
        // travel, long and smooth along it. That is the shape of a bundle of
        // hairs, and it costs one rotation and one fbm.
        vec2 along = u_strokeDir;
        vec2 across = vec2(-along.y, along.x);
        vec2 bristleUV = vec2(dot(wp, along) * 0.012, dot(wp, across) * 0.19);
        float bristle = wcFbm(bristleUV + vec2(3.0, 29.0));

        // Where a bundle sits, the brush reaches further down into the paper;
        // between bundles it barely touches even a crest. So the bristles
        // modulate the paper's own catch rather than being laid over the result.
        float reach = paperCatch * mix(0.55, 1.45, bristle);
        // The threshold climbs with dryness: at 0 it sits below every catch
        // value and nothing is cut, at 1 only the highest crests under a bundle
        // survive.
        float lift = mix(-0.05, 0.72, dryness);
        float contact = smoothstep(lift, lift + 0.22, reach);
        coverage *= mix(1.0, contact, dryness);
      }

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
        float s = max(u_inkSmoothPx * 0.5, 1.0);
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
        deposit = max(ink.a + u_migrate * (f.x - f.y) * 0.0833333, 0.0);
      }

      float density = smoothstep(0.0, u_saturateInk, deposit);

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
      float granNoise = wcFbm(wp * 0.11 + vec2(19.0, 71.0)) - 0.5;
      granNoise = granNoise < 0.05 ? granNoise * 0.5 : granNoise * 1.6;
      float granHere = u_granulation * (0.2 + 0.8 * density * density);
      float gran = 1.0 + granHere * (granNoise * 2.0 + (1.0 - 2.0 * paperCatch) * 0.5);

      // §3.6 - the wash's own coarse structure, the scale v1 had nothing at.
      //
      // A real wash is uneven long before the paper's tooth gets involved:
      // water pools, the brush unloads unevenly, absorbency varies over
      // centimetres rather than fibres. wcFbm's two octaves put clouds at
      // roughly 55px and clumping at roughly 20px; with paper grain at 1-3px
      // that gives the mark the three scales it needs. Centred on 1.0 for the
      // same reason granulation is - this redistributes tone, it does not
      // darken the wash.
      float cloud = 1.0 + u_cloud * (wcFbm(wp * 0.018) - 0.5) * 2.0;

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
      vec3 transmitted = effectiveBase * u_color;
      vec3 covered = mix(effectiveBase, u_color, pigment);
      vec3 overPaint = mix(transmitted, covered, u_pigmentOpacity);
      vec3 premultResult =
          pigment * (1.0 - dst.a) * u_color
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
      // _bakeDabOpacity branch — pressure drives width, never alpha, ADR 009
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
      // (see charcoalPresets.ts, and _resolveGrainMode in engine/index.ts for
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
      // response deterministically at record time (_bakeDabOpacity's liner
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
//   1. The patch of canvas under the dab is copied out (unchanged from
//      earlier rounds — same copyRegionTo, same single-tile restriction).
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

  varying vec2 v_uv;

  void main() {
    // Straight per-texel refresh, blending disabled by the caller: this
    // writes the imprint's new value outright, it does not accumulate onto
    // the previous one (the previous one is an input here, u_carried).
    gl_FragColor = mix(texture2D(u_carried, v_uv), texture2D(u_patch, v_uv), u_rate);
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
  // exactly. Derived from the same rounded rect copyRegionTo was handed
  // rather than from the dab's own center: half a pixel of disagreement
  // between the two would blur the canvas on every dab even when the brush
  // is standing still, because the lerp would be mixing a shifted copy of
  // the same content into itself.
  uniform vec2 u_patchOrigin;
  uniform float u_patchSize;
  // 0 = the lerp's own "dst *= (1-a)" half, under beginErase()'s
  // (ZERO, ONE_MINUS_SRC_ALPHA); 1 = its "+ carried*a" half, under
  // beginAdditiveDraw()'s (ONE, ONE). See this file's header comment.
  uniform float u_mode;
  // This dab's own share of the transfer, before the per-pixel weighting
  // below: SMUDGE_DEPOSIT_RATE * pressure * strength * travel (see
  // _paintOneSmudgeDab).
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
// (see previewLayerTransform/_bakeTransform). The obvious implementation, a
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
// blend additively (`_runTransformBlit`'s 'add' mode) rather than "over":
// Porter-Duff would scale the second pass's contribution by the first's
// coverage and lose part of it.
//
// Taps are read at exact texel centres, so the sampler's own filter never
// interpolates anything — `_runTransformBlit` puts the source on NEAREST for
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
// pass per source tile, and those passes have to *sum* (see _composeAreaTiles,
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
// (#300) How far the paper's height map pushes its base colour, as an
// absolute amount — deliberately NOT scaled by the colour itself.
//
// Two earlier shapes both failed, in opposite directions:
//
//   colour * (1 - r + r*h)   — proportional to brightness. Fine on white,
//                              weak on dark, exactly zero on black.
//   colour + r*signed*headroom — scaled by the room left in the direction
//                              it's heading. Better, but the height
//                              distribution leans to one side, so the
//                              dominant direction got the big headroom on
//                              light paper (too strong) and the crushed one
//                              on dark paper (invisible). Same number,
//                              opposite failure at each end.
//
// A fixed absolute swing is the only shape that reads the same on any paper
// colour, which is the actual requirement. The midpoint is clamped away from
// the ends so the full swing always fits: on near-black paper the texture
// sits just above black rather than half-clipped into it.
const PAPER_TONE_AMPLITUDE = 0.035

// Exported for the paper picker, which paints its miniatures with the same
// maths (see PaperPreview) so a card cannot drift from the canvas.
export const PAPER_TONE_AMPLITUDE_VALUE = PAPER_TONE_AMPLITUDE

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
    // covers the screen (see _renderBufferExtent), but if that ever fails
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

    ${paperToneGLSL('paperHeight')}
    float graphiteTexture = mix(1.0, paperHeight * 0.5 + 0.2, graphite * 0.25);
    vec3 graphiteTone = mix(paperTone, strokeColor, graphiteTexture);
    vec3 color = mix(paperTone, graphiteTone, graphite);

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
