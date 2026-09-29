// (#494) CameraFrame: where the composite puts world space on its target, as a
// value. The composite used to read this from three mutable engine fields
// (_compositeCenterX/Y, _compositeScale) plus the live camera, which _runComposite
// set at the top of every frame — so the export, which composes the same layers
// into a different target at a different camera, had to overwrite all four and
// put them back afterwards. Now every composite draw is handed its frame, and
// the export simply builds its own (seam С10 of the survey, the half С21 needs).

import type { WorldRect } from '../buffers/tileMath'

/** One composite pass's world -> target-pixel mapping. Immutable: built once
 *  per pass and passed down to every tile draw in it. */
export interface CameraFrame {
  /** The world point the frame is centred on — the camera's own position. */
  readonly wx: number
  readonly wy: number
  /** The target pixel that (wx, wy) lands on.
   *
   *  #134-follow-up: for the on-screen assembly buffer this is NOT the target's
   *  own half-size (ext/2). ext/2 - canvas.width/2 is only an integer by luck
   *  (ext and canvas.width rarely share parity), so the final rotate blit
   *  translated by a fractional pixel at every zoom and angle, even angle 0 —
   *  a constant bilinear softening of the whole image. Centring at
   *  canvas.width/2 plus the assembly's *rounded* padding keeps the offset an
   *  exact integer, so an unrotated frame is a lossless pixel copy. For a plain
   *  1:1 target (the export) it is simply the target's width/2, height/2. */
  readonly centerX: number
  readonly centerY: number
  /** Target pixels per world unit.
   *
   *  (#301) NOT the camera's zoom on screen: it is min(1, zoom), and whatever
   *  is left over is applied by the single screen pass at the end. Above zoom 1
   *  that is the difference between one resample and two — magnifying tiles
   *  into the assembly buffer and then rotating that visibly mushes pencil
   *  texture. Capped at 1 because strokes live in world-space tiles: there is
   *  no information above world resolution to preserve. The export is 1 by
   *  construction. Also decides whether tiles are being minified (mip sampling,
   *  #365) and which coarse level to draw. */
  readonly scale: number
  /** The camera's rotation. The tile draws never apply it — the target is
   *  always unrotated and the rotation is baked in by one pass afterwards (see
   *  the engine's _finishInfiniteComposite) — but an unrotated frame is what
   *  lets a partial frame scissor to the live stroke's rect (§17.46). */
  readonly angle: number
  /** The world rect worth reading tiles for: resolveVisible()/resolveCoarse()
   *  skip every tile entirely outside it. Generous is fine, never wrong — an
   *  extra tile only costs a redundant draw. */
  readonly view: WorldRect
}

/** A 1:1, unrotated frame covering exactly `bounds` — the export's camera: a
 *  target of bounds.width x bounds.height pixels, world unit = pixel. Bounds
 *  are integers (content bounds, or the sheet), so every tile edge lands on an
 *  exact pixel with zero rounding. */
export function exactFrame(bounds: { x: number; y: number; width: number; height: number }): CameraFrame {
  const { x, y, width, height } = bounds
  return {
    wx: x + width / 2,
    wy: y + height / 2,
    centerX: width / 2,
    centerY: height / 2,
    scale: 1,
    angle: 0,
    view: { minX: x, minY: y, maxX: x + width, maxY: y + height },
  }
}

/** The target pixel column a world x lands on — rounded per EDGE, not per
 *  position-and-size: two tiles sharing a world edge (origins are exactly
 *  TILE_SIZE apart) compute that edge from the same formula and so get the
 *  same pixel, however the zoom fraction falls. `round(pos) + round(size)`
 *  and `round(pos + size)` disagree for plenty of real zoom/pan pairs (e.g.
 *  zoom 1.01 a few hundred units from a tile boundary), which was a 1px gap
 *  or overlap at the seam — see index.tiledDisplay.test.ts's fractional-zoom
 *  case. */
export function frameEdgeX(frame: CameraFrame, worldX: number): number {
  return Math.round((worldX - frame.wx) * frame.scale + frame.centerX)
}

/** frameEdgeX for rows — top-down target pixels, like every buffer-pixel
 *  value in the engine (gl.viewport's bottom-up y is the caller's business). */
export function frameEdgeY(frame: CameraFrame, worldY: number): number {
  return Math.round((worldY - frame.wy) * frame.scale + frame.centerY)
}
