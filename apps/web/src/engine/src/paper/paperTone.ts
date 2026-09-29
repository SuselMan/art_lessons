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
//
// Also what the paper picker paints its miniatures with (PaperPreview), so a
// card cannot drift from the canvas — which is why it lives here, reachable
// through engine/paper.ts, rather than in shaders.ts (#663). Its own file and
// not paperConstants.ts: that one keys the CI paper-bake cache, and the tone
// is a render-time choice the bake never sees.
export const PAPER_TONE_AMPLITUDE = 0.035
