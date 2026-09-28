import type { OperationBase } from './operationBase.js'

/** (#613) The stroke: which tool, which dabs. Reading a stroke's dabs
 *  whichever way it carries them is dabCodec.ts's `strokeDabs` (#366). */

export type ToolType =
  | 'pencil' | 'eraser' | 'smudge' | 'liner' | 'marker' | 'charcoal' | 'brushPen'
  // #468, ADR 011 — an experiment, and deliberately not in docs/TOOLSET.md
  // until it earns a place there. Sits in the union rather than behind a flag
  // because the Operation Log is permanent: the moment one watercolor stroke
  // is recorded in a real room, every client must keep replaying it forever,
  // so the wire type has to know the tool from the first stroke onward.
  | 'watercolor'
  // #547, ADR 013 — the digital brush. In the union from the first stroke for
  // exactly the reason watercolor is, stated directly above: the Operation Log
  // is permanent, so the wire type has to know the tool the moment one stroke
  // is recorded in a real room.
  //
  // Unlike every other member here, this one does not name a material. What
  // varies between its brushes rides the `preset` slot as `brush:<id>@<version>`
  // — versioned, because a brush that is retuned must not repaint the strokes
  // already drawn with it (ADR 013 §7).
  | 'digitalBrush'

export type Dab = {
  x: number
  y: number
  pressure: number
  tiltX: number
  tiltY: number
  size: number
  aspectRatio: number
  angle: number
  // Final dab opacity, baked at record time (preset × user opacity × stroke
  // speed). Replay has no live pointer speed, so it must not recompute this.
  opacity: number
  // Milliseconds since the stroke's first dab (always 0 for that first dab).
  // Undo/redo/checkpoint replay ignore it (paints the whole array at once),
  // but a peer's live-stroke reveal (#37 follow-up v2) uses it to play the
  // recorded dabs back at the original pacing instead of all at once.
  t: number
}

export type StrokeOperation = OperationBase & {
  type: 'stroke'
  layerId: string
  tool: ToolType
  // 'HB'/'2B' etc for pencil, the liner's own size label, `${nib}:${size}`
  // for marker, 'vine'/'willow'/'compressed' for charcoal (ADR 005 §1 — the
  // three charcoal types ride this existing field rather than needing one of
  // their own, exactly as pencil's hardness grades already do).
  preset: string
  color: [number, number, number] // baked at record time, so replay/undo never repaints with today's live color
  // (#366) Exactly one of these two carries the stroke's dabs — read them
  // through `strokeDabs(op)` rather than either field directly.
  //
  // `dabsPacked` is what every newly recorded stroke uses (see packDabs for
  // why: a dab is ~250 bytes as JSON and ~53 packed, and the count scales
  // with a stroke's *world* length, so low zoom makes single strokes
  // megabytes). `dabs` is the original plain form, kept because the
  // Operation Log is permanent — every stroke recorded before this existed
  // is still in Postgres and in every room's history, and must keep
  // replaying. Neither field is going away; this is a format that gained a
  // second encoding, not one that migrated.
  dabs?: Dab[]
  dabsPacked?: string
  // Smudge only (#14), legacy since #416 — neither written nor read by the
  // engine anymore, kept because the Operation Log is permanent and rooms in
  // production hold strokes carrying them.
  //
  // They recorded this user's own carried-graphite level (0..1) immediately
  // before/after the op's dabs. That was needed while the smudge tool
  // carried a single scalar that persisted across strokes: replay had to
  // reproduce pickup/deposit amounts that depended on state living *outside*
  // any single dab, so each op had to state it. #416 replaced the scalar
  // with a raster imprint that resets at every gesture (see
  // engine/index.ts's _smudgeImprints) — a smudge operation reproduces from
  // its own dabs alone again, and there is nothing left for these to carry.
  // A stroke recorded with them simply replays under the new model, ignoring
  // them.
  smudgeLoadAtStart?: number
  smudgeLoadAtEnd?: number
  /** Which gesture this operation belongs to. A stroke longer than
   *  STROKE_DAB_CHUNK_LIMIT dabs is recorded as several operations (see the
   *  engine's _flushStrokeChunk and that constant's own comment for why the
   *  log can't hold one unbounded op); every chunk of one pen-down-to-pen-up
   *  gesture carries the same value here, and a stroke short enough to fit in
   *  one op carries it too.
   *
   *  Needed because a marker stroke is not the sum of its dabs: it composites
   *  by multiplying the layer's *pre-stroke* content, frozen once per gesture
   *  (see MarkerStrokeScratch). Replay a gesture's chunks as unrelated
   *  operations and the second one multiplies over the first one's output
   *  instead — a nib-shaped dark band across the stroke at every boundary,
   *  which is what a long marker line looked like after an undo.
   *
   *  Absent on strokes recorded before this existed; they replay as they
   *  always did, each chunk standing alone. */
  strokeId?: string
  /** (#468 v7) Which *wash* this stroke belongs to — watercolor only.
   *
   *  A wash is several strokes laid in quick succession with the same paint on
   *  the same layer, and the point of grouping them is that they must not
   *  behave like separate marks laid on top of one another. Real paint does not
   *  work that way: lay a second band beside a wet first one and the two become
   *  one pool, the boundary between them disappears, and only the outer
   *  perimeter of the whole thing gets a tideline. Without this, a flat wash —
   *  the very first exercise anyone is set — is impossible to paint, because
   *  every band arrives with its own edge, its own pooling and its own dried
   *  rim.
   *
   *  Decided live and *recorded*, exactly as `strokeId` is, and for the same
   *  reason: the grouping rule wants wall-clock timing, which replay must never
   *  have. Writing down the answer keeps replay a pure function of the log
   *  while letting the decision use whatever the live client knows.
   *
   *  Absent on every stroke of every other tool, and on watercolor strokes
   *  recorded before this existed — those replay exactly as they always did,
   *  each standing alone. */
  washId?: string

  /** (#536) How wet the paper already was where this stroke landed — one hex
   *  digit per dab, in order, `'0'` dry and `'f'` flooded.
   *
   *  This is the field that makes "lay clean water, then take paint into it"
   *  expressible, and the shape of it is the whole architectural argument.
   *  Wetness itself is a live, ephemeral, client-side thing that decays on a
   *  wall clock, and it must stay that way: a replayable thirty-second physical
   *  model of water on paper would be enormous and would put clocks back into
   *  replay. What gets written down instead is not the environment but the
   *  **interaction with it** — what this stroke saw at the moment it was made.
   *  Live resolves clock -> wetness field -> stroke parameters -> serialize;
   *  replay reads the serialized parameters straight back and reproduces the
   *  identical mark. Clocks stay entirely on the decision side, exactly as they
   *  already do for `washId`.
   *
   *  Quantized, and quantized *before* the live stroke uses it rather than
   *  after: both paths must read the same piecewise-constant profile, or a
   *  stroke would visibly redraw itself the moment the room reloaded — the
   *  failure a per-batch water uniform caused once already.
   *
   *  One digit per dab rather than one per group of them, and the reason is
   *  slicing rather than fidelity: a long gesture is cut into chunk operations
   *  and into live packets at arbitrary dab boundaries, and each piece has to
   *  carry exactly its own dabs' profile. Per-dab makes that a substring; any
   *  coarser stride makes it an off-by-something waiting to happen. A hex digit
   *  against a packed dab's ~53 bytes is under two per cent, and it is highly
   *  compressible — long runs of a single digit are the normal case.
   *
   *  Absent when the stroke landed on dry paper, which is most strokes, and
   *  absent from every stroke recorded before this existed. Both read as dry. */
  wet?: string
}
