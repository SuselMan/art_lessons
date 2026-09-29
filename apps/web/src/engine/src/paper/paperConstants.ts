// The two numbers that fix how paper is sampled. Everything else about the
// grain — its shape, its contrast, how hard the pencil bites it — is decided
// offline now and arrives as bytes (see ../../../scripts/bakePaperTextures.ts
// and paperLoader.ts). This file is what remains of paperNoise.ts, whose
// procedural fBm generator produced every shipped paper until #333 replaced
// it with bakes of a photographed sheet; nothing at runtime ever needed the
// generator itself, only these two constants.

// The baked texture's own pixel resolution — deliberately unrelated to
// PAPER_WORLD_SIZE below (see that constant's comment); this one only
// needs to be a WebGL1-legal power-of-two (REPEAT requires POT) and high
// enough that a texel stays sub-pixel at realistic zoom levels.
export const PAPER_BAKE_RESOLUTION = 2048

// World-space size the baked tile repeats over in an *infinite* room (a
// bounded one spans its sheet exactly once instead — see engine/index.ts's
// _paperWorldSize, and #333 for why the two rooms answer this differently).
// Deliberately NOT a multiple or divisor of TILE_SIZE (1024, see
// tileMath.ts): if it were, every infinite-room tile's origin (always an
// exact multiple of TILE_SIZE) would land on an exact multiple of this too,
// making u_paperOrigin's threading in DAB_FRAG a no-op under REPEAT — every
// tile would silently re-sample the same [0,1) sub-range. 157 shares no
// common factor with 1024 (1024 is a power of 2, 157 is odd — prime, in
// fact) — tuned from real-use feedback testing on a Surface, in two rounds:
// first from 900 to 315 (a measured 100%-vs-35% ratio), then a further /2 by
// feel (315 still read coarser than wanted) — 315/2 = 157.5, rounded down to
// the nearest odd.
//
// Also the period of charcoal's dropout blotches, which divide it by their
// own magnification rather than riding the room-dependent paper UV — see
// DAB_FRAG's CHARCOAL_BLOTCH_PERIOD.
export const PAPER_WORLD_SIZE = 157
