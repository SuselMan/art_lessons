import { AccumulationBuffer } from "/src/engine/src/buffers/AccumulationBuffer.ts";
/** Parked state is zero-padded in full, regardless of a display's scissor. */
function clearParkedBuffer(buffer) {
	const gl = buffer.gl, scissor = gl.isEnabled(gl.SCISSOR_TEST);
	if (scissor) gl.disable(gl.SCISSOR_TEST);
	buffer.clear();
	if (scissor) gl.enable(gl.SCISSOR_TEST);
}
export class RibbonStrokeScratch {
	// #702: every rectangle written to the non-original buffers, including
	// diffusion's halo. Undefined means an older carried state has no proof
	// of its empty exterior and must be kept whole.
	_storageBounds = null;
	noteStorageBounds(bounds) {
		const old = this._storageBounds;
		if (old === undefined) return;
		this._storageBounds = old ? {
			minX: Math.min(old.minX, bounds.minX),
			minY: Math.min(old.minY, bounds.minY),
			maxX: Math.max(old.maxX, bounds.maxX),
			maxY: Math.max(old.maxY, bounds.maxY)
		} : { ...bounds };
	}
	_tiles = new Map();
	pool;
	/** (#536, §17.19) Whether tiles carry inkColor — watercolor only. */
	needsColor;
	/** (#536, §17.20) Every paint laid into this wash, as colour keys. While it
	*  is one paint, the colour record is the deposit times one absorption and
	*  the diffusion need not carry it — see _diffuseWash. */
	paints = new Set();
	/** (#536, §17.21) What each dab of the batch just painted left standing on
	*  the sheet (watercolorStandingWater) — the ribbon build writes it, and
	*  whoever feeds the live wetness field reads it, so the field and the
	*  wash's coverage .b are fed one number. Cleared per batch; the keys are
	*  the batch's own dab objects. */
	standing = new Map();
	/** (#536, §17.22) Live batches no longer composite one by one: each adds
	*  its rect here, and the engine composites the union once per displayed
	*  frame (_flushLiveComposite). Keyed by tile buffer. */
	pendingComposite = new Map();
	needsInk;
	/** (#468 v3) How much of the brush's load this gesture has spent so far,
	*  measured in brush radii of travel (ADR 011 §3.8).
	*
	*  Lives on the scratch rather than on the engine because that is the one
	*  object all three paths already share for the length of exactly one
	*  gesture: a live stroke's batches, a one-shot replay's single call, and a
	*  chunked replay's several operations. Put it on the engine and replay would
	*  either carry it between unrelated strokes or reset it at every chunk
	*  boundary — and a seam in the depletion is a visible band across the mark. */
	_wcNominalCapacity = null;
	_waterUsed = 0;
	/** (#536, ADR 011 §17.11) Whether deposit has been laid since the wash's
	*  pigment was last diffused. The diffusion is the one pass in this tool
	*  that is *not* idempotent — every run is N more steps — so it may run
	*  exactly once per operation, on every path alike: a live chunk flush, the
	*  pen-up, a replayed chunk, a peer's operation. This flag is what makes
	*  that true whichever path calls _finishRibbonStroke and however often. */
	diffusePending = false;
	/** (#536) The same clock for pigment, and the reason it is a second number
	*  rather than the same one is the brush drinking from wet paper.
	*
	*  Picking up water rewinds the water clock (watercolorWaterClock). Pigment
	*  must not come back with it: dragging a brush through a puddle of clean
	*  water does not reload it with paint, it dilutes what is left. So travel
	*  advances both, and only water is ever given back.
	*
	*  On dry paper the two are the same number to the last bit, which is what
	*  keeps every stroke that never meets water behaving exactly as it did. */
	_pigmentUsed = 0;
	/** (#468 v6) The composite's scalar uniforms, fixed for the whole gesture.
	*
	*  They cannot be per batch. The composite is a *recomputation* over a whole
	*  rect, so whichever batch wrote a pixel last decides its scalars — and with
	*  per-batch values that showed up immediately as rectangular tone blocks
	*  along a live stroke, one per pointer event, which is precisely what
	*  "штрих постоянно странно меняется" was.
	*
	*  Derived from the gesture's *first* dab, which is the one thing a live
	*  stroke and a replay of it are guaranteed to agree on: live sees it as the
	*  first dab of its first batch, a one-shot replay as the first dab of the
	*  only batch. Anything averaged over a batch would differ between the two. */
	_composite = null;
	compositeScalars(make) {
		if (!this._composite) this._composite = make();
		return this._composite;
	}
	/** (#468 v6) The gesture's dab spacing, cached the first time two consecutive
	*  dabs are actually available.
	*
	*  Measured rather than derived, because what it has to match is
	*  DabSystem's `baseSize * spacingFactor` — and `baseSize` is the tool's
	*  *nominal* size, which no operation records: dabs carry their post-pressure,
	*  post-taper sizes instead. The distance between the stroke's own first two
	*  dabs is that spacing, and it is the same pair of dabs whether they arrive
	*  in one replayed batch or across two live ones (the second case reaches
	*  them through prevDab), so both paths measure the identical number.
	*
	*  Zero until a pair exists — a first batch of exactly one dab covers a few
	*  px at the stroke's start, and the next batch's padded rect recomposites it
	*  anyway. */
	_dabSpacing = 0;
	/** (#468 v6) Everything the gesture's final recomposite needs, plus the union
	*  of every batch's bounds.
	*
	*  It exists because reasoning about whether the incremental per-batch
	*  composites are *sufficient* turned out to be a trap: three plausible
	*  arguments that they were, and a measured 26% of the mark still differing
	*  between a live stroke and a replay of it. So the last thing a gesture does
	*  is now exactly what a replay does — one composite over the whole mark with
	*  the finished buffers — and the two agree by construction rather than by
	*  argument.
	*
	*  This is not the old settle pass. That one *introduced* terms the live
	*  batches had switched off, and re-read scalars from the first batch, which
	*  is why the mark jumped at pen-up. Every scalar here is already a constant
	*  of the gesture, so the final pass recomputes the same values the batches
	*  did — it only fixes pixels that were composited before all their ink had
	*  arrived. */
	_finish = null;
	/** (#536, §17.42) What the group tide needs when the wash dries as one
	*  component (watercolorDryWash): the composite's constants from the LAST
	*  settled operation, the widest radius and the wettest standing level
	*  of any, and the union of every settle's bounds. Set by the settle. */
	dryCtx = null;
	noteFinish(ctx) {
		this.noteStorageBounds(ctx.bounds);
		const prev = this._finish;
		if (!prev) {
			this._finish = ctx;
			return;
		}
		prev.dwellMs = Math.max(prev.dwellMs, ctx.dwellMs);
		prev.bounds = {
			minX: Math.min(prev.bounds.minX, ctx.bounds.minX),
			minY: Math.min(prev.bounds.minY, ctx.bounds.minY),
			maxX: Math.max(prev.bounds.maxX, ctx.bounds.maxX),
			maxY: Math.max(prev.bounds.maxY, ctx.bounds.maxY)
		};
		prev.radiusPx = Math.max(prev.radiusPx, ctx.radiusPx);
		// A stroke can enter a puddle after its first live batch. Retain the
		// wettest landing across every batch, just as a single-batch replay does.
		prev.wetPeak = Math.max(prev.wetPeak, ctx.wetPeak);
	}
	get finishContext() {
		return this._finish;
	}
	/** The scratch this tile already has, or null — deliberately not getOrCreate:
	*  a tile inside the gesture's bounding box that its dabs never reached has
	*  nothing to recomposite, and snapshotting one would spend three pooled
	*  buffers writing it back unchanged. */
	peek(tile) {
		return this._tiles.get(tile) ?? null;
	}
	/** (#579) The digital watercolor's wet-edge reach, fixed by the gesture's
	*  first dab — the same "first dab is what live and replay agree on" rule
	*  as the spacing below. A per-batch value would draw a rim of a different
	*  width across every batch boundary. */
	_brushEdgePx = 0;
	noteBrushEdgePx(px) {
		if (this._brushEdgePx === 0 && px > 0) this._brushEdgePx = px;
		return this._brushEdgePx;
	}
	noteDabSpacing(gap) {
		if (this._dabSpacing === 0 && gap > .01) this._dabSpacing = gap;
		return this._dabSpacing;
	}
	/** (#468 v8) The gesture's opening direction, cached the first time a real
	*  segment exists. Same first-two-dabs rule the spacing follows, and for the
	*  same reason: it is the one measurement a live stroke and a replay of it
	*  are guaranteed to agree on. */
	_dir = [1, 0];
	_dirSet = false;
	noteDirection(dx, dy) {
		if (!this._dirSet) {
			const len = Math.hypot(dx, dy);
			if (len > .01) {
				this._dir = [dx / len, dy / len];
				this._dirSet = true;
			}
		}
		return this._dir;
	}
	get waterUsed() {
		return this._waterUsed;
	}
	get pigmentUsed() {
		return this._pigmentUsed;
	}
	advanceWater(water, pigment) {
		this._waterUsed = water;
		this._pigmentUsed = pigment;
	}
	/** (#468 v7) A new stroke joins this wash. Only the brush's own load resets —
	*  lifting the brush and putting it back down means a freshly charged brush,
	*  but the paint already on the paper is still there and still wet.
	*
	*  Everything else deliberately survives: the frozen pre-wash content, the
	*  accumulated coverage and deposit, the noise field's seed and the composite
	*  scalars. That is what makes a second band laid beside the first merge with
	*  it instead of arriving as another mark on top — the two share one
	*  silhouette, so there is no boundary between them to draw, and only the
	*  outer perimeter of the whole wash gets a tideline. */
	/** (§17.28) The last dab that deposited — the anchor the travel quantum
	*  measures from (watercolorTravelQuantum). Per gesture. */
	lastKept = undefined;
	/** (§17.28) Counts the gestures of this wash; the film buffers of a tile
	*  are refreshed when a batch arrives from a gesture they were not made for. */
	gesture = 0;
	/** (#536, §17.37) The gesture's landing: where the nib came down and its
	*  radius there, and how long it stood within WC_DWELL_RADIUS of it before
	*  moving on (the dabs' own clock, Dab.t). Frozen once a dab leaves. Per
	*  gesture, and a pure function of the operation's dabs, so a replay
	*  counts the same dwell to the millisecond. */
	landing = null;
	dwellMs = 0;
	dwellDone = false;
	/** (#680, §17.74) The gesture's recent kept dabs (oldest first, at most
	*  WC_TRAIL_LEN), the dwell at every dab is read back over; and the brush's
	*  surplus the slowdowns left - pigment and water - with the pigment clock
	*  it was last carried to. Per gesture, a pure function of its dabs. */
	turnOffset = [0, 0];
	turnDirection = null;
	brushTravel = [];
	foreignSources = null;
	wetContacts = [];
	trail = [];
	/** (#680) The pen's smoothed speed (px/ms) and its recent peak. */
	speed = 0;
	speedPeak = 0;
	speedAt = -1;
	speedTravel = 0;
	brakePigment = 0;
	surplusPigment = 0;
	surplusWater = 0;
	surplusAt = 0;
	/** (#536, §17.43) Ends the gesture's FILM without ending the gesture: the
	*  next batch starts a fresh film over the wash as the settle just left
	*  it. Called at a chunk boundary, live and on replay alike, right after
	*  the chunk's settle has landed — the film's base is refreshed from
	*  inkLoad on the next batch (filmBuffers), so the settled chunk is what
	*  the rest of the stroke paints over. Without this the next batch rebuilt
	*  inkLoad as the PRE-gesture base plus the whole film and threw the
	*  chunk's settle away — live only sometimes, by frame timing, so a long
	*  stroke came back different after a reload. */
	newFilm() {
		this.brushTravel = [];
		this.gesture++;
	}
	/** (#536, §17.43) Gives the film buffers back once a settle has landed:
	*  four tile-sized textures per tile that are only read between the first
	*  batch of a gesture and its settle, and were held for the life of the
	*  wash - with the replay cache's four washes that was 384 MB of scratch
	*  on a two-tile layer, and the rebuild behind an undo on top of it. The
	*  next gesture (or chunk) acquires them again from the pool. */
	releaseFilm(gesture = this.gesture) {
		for (const entry of this._tiles.values()) {
			// Only the film the landed settle consumed: a chunk's settle lands
			// while the next chunk's film is being painted.
			if (entry.filmGesture !== gesture) continue;
			for (const b of [
				entry.strokeInk,
				entry.inkBase,
				entry.strokeColor,
				entry.colorBase
			]) if (b) this.pool.release(b);
			entry.strokeInk = null;
			entry.inkBase = null;
			entry.strokeColor = null;
			entry.colorBase = null;
			entry.filmGesture = -1;
		}
	}
	beginStroke() {
		this.lastKept = undefined;
		this.gesture++;
		this.turnOffset = [0, 0];
		this.turnDirection = null;
		this.landing = null;
		this.dwellMs = 0;
		this.dwellDone = false;
		this.trail = [];
		this.speed = 0;
		this.speedPeak = 0;
		this.speedAt = -1;
		this.speedTravel = 0;
		this.brushTravel = [];
		this.foreignSources = null;
		this.wetContacts = [];
		this.brakePigment = 0;
		this.surplusPigment = 0;
		this.surplusWater = 0;
		this.surplusAt = 0;
		this._wcNominalCapacity = null;
		this._waterUsed = 0;
		// (#536) Including everything the brush drank from the paper last stroke.
		// The exchange is intra-stroke by decision — see watercolorWaterClock's own
		// note on why the brush is not allowed hidden state that outlives a mark.
		this._pigmentUsed = 0;
		// (#536, §17.23) The finish context is the GESTURE's: its bounds, its
		// landing wetness, its radius. It used to outlive the stroke, so every
		// pen-up of a wash recomposited the union of every stroke so far and
		// read the first stroke's landing for the bloom of the last.
		this._finish = null;
	}
	/** `needsInk` false skips the third buffer entirely (#454): a covering,
	*  source-over ink has no per-pixel pigment quantity for the composite to
	*  read, so allocating and clearing one per tile would be a buffer and two
	*  draw calls spent on a value nothing samples. See RibbonProfile.ink. */
	constructor(pool, needsInk = true, needsColor = false) {
		this.pool = pool;
		this.needsInk = needsInk;
		this.needsColor = needsColor;
	}
	/** Keyed by the tile's own AccumulationBuffer identity — stable across
	*  repeated resolveForPaint calls for the same resident tile (see
	*  TiledLayerBuffer.getOrCreateTile), so no tile-coordinate bookkeeping is
	*  needed here. 'nearest' filtering: all three buffers are always sampled
	*  1:1 (same size and pixel alignment as the tile they mirror — see
	*  DAB_FRAG's own u_original/u_strokeCoverage/u_inkLoad comment), so
	*  'linear' would buy nothing and 'nearest' keeps this deterministic
	*  across GPU vendors, same reasoning every other scratch-texture pool in
	*  this file already follows (paper grain's own hard-won lesson — see
	*  .claude/rules.md).
	*
	*  v1 accepted gap: if this tile gets evicted (TiledLayerBuffer's memory
	*  budget) mid-stroke and later recovered as a *new* AccumulationBuffer
	*  instance, this map won't recognize it as the same tile and will
	*  silently re-snapshot — a fresh (still correct, just not maximally
	*  "original") base rather than a crash or a wrong result. Not worth
	*  guarding against for v1: a single marker gesture spans very few tiles,
	*  nowhere near what it'd take to force an eviction on its own. */
	/** (§17.28) The gesture's film buffers for a tile, made or refreshed for
	*  the current gesture: the base is the deposit as it stands now, the film
	*  starts empty. */
	filmBuffers(tile) {
		const entry = this.getOrCreate(tile);
		if (!entry.inkLoad) return null;
		if (entry.filmGesture !== this.gesture) {
			entry.strokeInk ??= this.pool.acquire(tile.width, tile.height);
			entry.inkBase ??= this.pool.acquire(tile.width, tile.height);
			entry.strokeInk.clear();
			entry.inkLoad.copyTo(entry.inkBase);
			if (entry.inkColor) {
				entry.strokeColor ??= this.pool.acquire(tile.width, tile.height);
				entry.colorBase ??= this.pool.acquire(tile.width, tile.height);
				entry.strokeColor.clear();
				entry.inkColor.copyTo(entry.colorBase);
			}
			entry.filmGesture = this.gesture;
		}
		return {
			strokeInk: entry.strokeInk,
			inkBase: entry.inkBase,
			strokeColor: entry.strokeColor,
			colorBase: entry.colorBase
		};
	}
	getOrCreate(tile) {
		let entry = this._tiles.get(tile);
		if (!entry) {
			// (#385) From the pool, and every one of them is fully written before it
			// is read — copyTo overwrites `original` outright, the others are
			// cleared — so a reused buffer carries nothing of whatever gesture had
			// it last.
			const original = this.pool.acquire(tile.width, tile.height);
			tile.copyTo(original);
			const coverage = this.pool.acquire(tile.width, tile.height);
			coverage.clear();
			let inkLoad = null;
			let inkColor = null;
			if (this.needsInk) {
				inkLoad = this.pool.acquire(tile.width, tile.height);
				inkLoad.clear();
				if (this.needsColor) {
					inkColor = this.pool.acquire(tile.width, tile.height);
					inkColor.clear();
				}
			}
			// The settled pair is taken on the first settle, by the pass that needs
			// it — a marker gesture never does, and three buffers a tile was already
			// the churn #385 is about.
			entry = {
				original,
				coverage,
				inkLoad,
				inkSettled: null,
				inkColor,
				colorSettled: null,
				strokeInk: null,
				inkBase: null,
				strokeColor: null,
				colorBase: null,
				filmGesture: -1,
				inkDry: null,
				colorDry: null
			};
			this._tiles.set(tile, entry);
		}
		return entry;
	}
	/** Ends this gesture's use of its buffers. Named as it always was, and it
	*  still means "this scratch is finished with" — what changed (#385) is that
	*  the buffers go back to the pool instead of to the driver. */
	destroy() {
		this._storageBounds = null;
		this._wcNominalCapacity = null;
		this._waterUsed = 0;
		this._pigmentUsed = 0;
		this.diffusePending = false;
		this.pendingComposite.clear();
		this._composite = null;
		this._dabSpacing = 0;
		this._brushEdgePx = 0;
		this._dirSet = false;
		this._dir = [1, 0];
		this._finish = null;
		for (const { original, coverage, inkLoad, inkSettled, inkColor, colorSettled, strokeInk, inkBase, strokeColor, colorBase, inkDry, colorDry } of this._tiles.values()) {
			for (const b of [
				strokeInk,
				inkBase,
				strokeColor,
				colorBase,
				inkDry,
				colorDry
			]) if (b) this.pool.release(b);
			this.pool.release(original);
			this.pool.release(coverage);
			if (inkLoad) this.pool.release(inkLoad);
			if (inkSettled) this.pool.release(inkSettled);
			if (inkColor) this.pool.release(inkColor);
			if (colorSettled) this.pool.release(colorSettled);
		}
		this._tiles.clear();
	}
	/** Context loss: the GL objects are already dead, so neither release nor
	*  destroy is meaningful — just let go of them. */
	forget() {
		this._tiles.clear();
		this.pendingComposite.clear();
	}
	/** (#536, §17.22) Whether this scratch still holds its tiles — false once
	*  destroyed or forgotten, which is how a settle in flight learns that the
	*  wash it was settling is gone. */
	get live() {
		return this._tiles.size > 0;
	}
	/** (#536, §17.56) The wash as the next operation of it will find it, at an
	*  operation boundary: every texture that outlives a gesture's film, copied
	*  into buffers of its own (the checkpoint keeps them; this scratch goes on
	*  being painted), and every number the next operation reads. The film is
	*  not taken — at a boundary it is released or about to be refreshed for a
	*  new gesture (filmBuffers), so the restored tile starts without one.
	*  `originOf` names each tile by its place on the sheet: the replay that
	*  restores this paints into another buffer. */
	snapshot(gl, originOf) {
		const tiles = [];
		for (const [tile, entry] of this._tiles) {
			const at = originOf(tile);
			if (!at) return null;
			const bufs = {};
			for (const k of SNAPSHOT_TILE_BUFFERS) {
				const b = entry[k];
				if (!b) continue;
				const copy = new AccumulationBuffer(gl, b.width, b.height, "nearest");
				b.copyTo(copy);
				bufs[k] = copy;
			}
			tiles.push({
				...at,
				width: tile.width,
				height: tile.height,
				bufs
			});
		}
		return {
			...this._scalars(),
			tiles
		};
	}
	/** Every number the next operation of this wash reads - see snapshot. */
	_scalars() {
		return {
			needsInk: this.needsInk,
			needsColor: this.needsColor,
			storageBounds: this._storageBounds ? { ...this._storageBounds } : this._storageBounds,
			paints: [...this.paints],
			waterUsed: this._waterUsed, wcNominalCapacity: this._wcNominalCapacity,
			pigmentUsed: this._pigmentUsed,
			composite: this._composite ? {
				...this._composite,
				fieldSeed: [...this._composite.fieldSeed]
			} : null,
			dabSpacing: this._dabSpacing,
			brushEdgePx: this._brushEdgePx,
			dir: [...this._dir],
			dirSet: this._dirSet,
			finish: this._finish ? {
				...this._finish,
				bounds: { ...this._finish.bounds },
				fieldSeed: [...this._finish.fieldSeed]
			} : null,
			dryCtx: this.dryCtx ? {
				...this.dryCtx,
				bounds: { ...this.dryCtx.bounds },
				fieldSeed: [...this.dryCtx.fieldSeed]
			} : null,
			lastKept: this.lastKept ? { ...this.lastKept } : undefined,
			gesture: this.gesture,
			landing: this.landing ? { ...this.landing } : null,
			dwellMs: this.dwellMs,
			dwellDone: this.dwellDone,
			turnOffset: [...this.turnOffset],
			turnDirection: this.turnDirection ? [...this.turnDirection] : null,
			brushTravel: this.brushTravel.map((d) => ({ ...d })),
			foreignSources: this.foreignSources,
			wetContacts: this.wetContacts.map((d) => ({ ...d })),
			trail: this.trail.map((d) => ({ ...d })),
			speed: this.speed,
			speedPeak: this.speedPeak,
			speedAt: this.speedAt,
			speedTravel: this.speedTravel,
			brakePigment: this.brakePigment,
			surplusPigment: this.surplusPigment,
			surplusWater: this.surplusWater,
			surplusAt: this.surplusAt
		};
	}
	_applyScalars(snap, target) {
		this._storageBounds = snap.storageBounds ? { ...snap.storageBounds } : snap.storageBounds;
		for (const p of snap.paints) this.paints.add(p);
		this._waterUsed = snap.waterUsed; this._wcNominalCapacity = snap.wcNominalCapacity ?? 0;
		this._pigmentUsed = snap.pigmentUsed;
		this._composite = snap.composite ? {
			...snap.composite,
			fieldSeed: [...snap.composite.fieldSeed]
		} : null;
		this._dabSpacing = snap.dabSpacing;
		this._brushEdgePx = snap.brushEdgePx;
		this._dir = [snap.dir[0], snap.dir[1]];
		this._dirSet = snap.dirSet;
		this._finish = snap.finish ? {
			...snap.finish,
			target,
			bounds: { ...snap.finish.bounds },
			fieldSeed: [...snap.finish.fieldSeed]
		} : null;
		this.dryCtx = snap.dryCtx ? {
			...snap.dryCtx,
			target,
			bounds: { ...snap.dryCtx.bounds },
			fieldSeed: [...snap.dryCtx.fieldSeed]
		} : null;
		this.lastKept = snap.lastKept ? { ...snap.lastKept } : undefined;
		this.gesture = snap.gesture;
		this.landing = snap.landing ? { ...snap.landing } : null;
		this.dwellMs = snap.dwellMs;
		this.dwellDone = snap.dwellDone;
		this.turnOffset = [...snap.turnOffset];
		this.turnDirection = snap.turnDirection ? [...snap.turnDirection] : null;
		this.brushTravel = snap.brushTravel.map((d) => ({ ...d }));
		this.foreignSources = snap.foreignSources;
		this.wetContacts = snap.wetContacts.map((d) => ({ ...d }));
		this.trail = snap.trail.map((d) => ({ ...d }));
		this.speed = snap.speed;
		this.speedPeak = snap.speedPeak;
		this.speedAt = snap.speedAt;
		this.speedTravel = snap.speedTravel;
		this.brakePigment = snap.brakePigment;
		this.surplusPigment = snap.surplusPigment;
		this.surplusWater = snap.surplusWater;
		this.surplusAt = snap.surplusAt;
	}
	/** #702: park a resting wash in compact GPU buffers. CPU readback waits
	* for the whole context's queue, even for 1x1, so it cannot be a background
	* memory operation. Keep original whole: a continuation may enter a new
	* area whose pre-wash picture must still be the same. Other buffers start
	* clear and only receive writes inside storageBounds. GPU sub-rect copies
	* preserve every byte; unpark clears the missing exterior. */
	spill(originOf) {
		const work = this.spillWork(originOf);
		let r = work.next();
		while (!r.done) r = work.next();
		return r.value;
	}
	*spillWork(originOf) {
		if (this.diffusePending || this.pendingComposite.size) return null;
		const tiles = [];
		const owned = new Set(), moved = new Set();
		let bytes = 0, committed = false;
		const takeBuffer = (b) => {
			owned.delete(b);
		};
		const releaseBuffer = (b) => {
			if (owned.delete(b)) this.pool.release(b);
		};
		const dispose = () => {
			for (const b of owned) this.pool.release(b);
			owned.clear();
		};
		try {
			for (const [tile, entry] of this._tiles) {
				if (entry.strokeInk || entry.inkBase || entry.strokeColor || entry.colorBase) return null;
				const at = originOf(tile);
				if (!at) return null;
				const bufs = {};
				const whole = (b) => {
					moved.add(b);
					bytes += b.width * b.height * 4;
					return {
						buffer: b,
						glX: 0,
						glY: 0,
						srcX: 0,
						srcY: 0,
						w: b.width,
						h: b.height,
						whole: true
					};
				};
				bufs.original = whole(entry.original);
				const parts = SPILL_TILE_BUFFERS.filter((k) => k !== "original" && entry[k]);
				const bounds = this._storageBounds;
				const x0 = bounds ? Math.max(0, Math.floor(bounds.minX - at.originX)) : 0;
				const y0 = bounds ? Math.max(0, Math.floor(bounds.minY - at.originY)) : 0;
				const x1 = bounds ? Math.min(tile.width, Math.ceil(bounds.maxX - at.originX)) : tile.width;
				const y1 = bounds ? Math.min(tile.height, Math.ceil(bounds.maxY - at.originY)) : tile.height;
				const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
				const columns = Math.max(1, Math.floor(tile.width / w)), rows = Math.max(1, Math.floor(tile.height / h));
				const capacity = columns * rows;
				const atlasCount = Math.ceil(parts.length / capacity);
				// Tile-sized atlases reuse the film's released buffers. Arbitrarily
				// sized small textures were themselves 100ms allocations on Safari.
				// When packing saves no memory, move the original buffers instead.
				if (atlasCount >= parts.length) {
					for (const k of parts) bufs[k] = whole(entry[k]);
				} else {
					let atlas;
					for (const [i, k] of parts.entries()) {
						if (i % capacity === 0) {
							atlas = this.pool.acquire(tile.width, tile.height);
							owned.add(atlas);
							bytes += tile.width * tile.height * 4;
						}
						const srcX = i % capacity % columns * w, srcY = Math.floor(i % capacity / columns) * h;
						const glX = Math.min(tile.width - 1, x0), glY = Math.min(tile.height - 1, Math.max(0, tile.height - y1));
						if (x1 > x0 && y1 > y0) entry[k].copyRegionInto(atlas, glX, glY, srcX, srcY, w, h);
						else {
							// A present-but-empty field must remain present after restore.
							// Empty intersects are rare, so a full clear is safe and cheap.
							clearParkedBuffer(atlas);
						}
						bufs[k] = {
							buffer: atlas,
							glX,
							glY,
							srcX,
							srcY,
							w,
							h,
							whole: false
						};
						yield;
					}
				}
				tiles.push({
					...at,
					width: tile.width,
					height: tile.height,
					bufs
				});
			}
			const result = {
				...this._scalars(),
				tiles,
				bytes,
				dispose,
				takeBuffer,
				releaseBuffer
			};
			// Ownership moves only on successful completion. Until now the active
			// scratch was untouched and cancellation can simply release its copies.
			for (const b of moved) owned.add(b);
			for (const entry of this._tiles.values()) for (const k of SPILL_TILE_BUFFERS) {
				const b = entry[k];
				if (b && !moved.has(b)) this.pool.release(b);
			}
			this._tiles.clear();
			committed = true;
			return result;
		} finally {
			if (!committed) dispose();
		}
	}
	/** A parked wash back in full-sized, zero-padded scratch buffers. */
	static unspill(pool, sp, target) {
		const s = new RibbonStrokeScratch(pool, sp.needsInk, sp.needsColor);
		s._applyScalars(sp, target);
		const references = new Map();
		for (const t of sp.tiles) for (const p of Object.values(t.bufs)) if (p) {
			references.set(p.buffer, (references.get(p.buffer) ?? 0) + 1);
		}
		try {
			for (const t of sp.tiles) {
				const rect = {
					minX: t.originX,
					minY: t.originY,
					maxX: t.originX + t.width,
					maxY: t.originY + t.height
				};
				const tile = target.resolveForPaint(rect).find((r) => r.originX === t.originX && r.originY === t.originY)?.buffer;
				if (!tile) {
					s.destroy();
					return null;
				}
				const take = (p) => {
					if (!p) return null;
					if (p.whole) {
						sp.takeBuffer(p.buffer);
						return p.buffer;
					}
					const own = pool.acquire(t.width, t.height);
					clearParkedBuffer(own);
					p.buffer.copyRegionInto(own, p.srcX, p.srcY, p.glX, p.glY, p.w, p.h);
					const left = references.get(p.buffer) - 1;
					references.set(p.buffer, left);
					// Reuse a consumed atlas for later full-sized fields rather than
					// allocating a texture while continuing the wash.
					if (left === 0) sp.releaseBuffer(p.buffer);
					return own;
				};
				const original = take(t.bufs.original), coverage = take(t.bufs.coverage);
				if (!original || !coverage) {
					if (original) pool.release(original);
					if (coverage) pool.release(coverage);
					s.destroy();
					return null;
				}
				s._tiles.set(tile, {
					original,
					coverage,
					inkLoad: take(t.bufs.inkLoad),
					inkSettled: take(t.bufs.inkSettled),
					inkColor: take(t.bufs.inkColor),
					colorSettled: take(t.bufs.colorSettled),
					strokeInk: null,
					inkBase: null,
					strokeColor: null,
					colorBase: null,
					filmGesture: -1,
					inkDry: take(t.bufs.inkDry),
					colorDry: take(t.bufs.colorDry)
				});
			}
			return s;
		} finally {
			sp.dispose();
		}
	}
	/** (#536, §17.56) A scratch as `snap` describes it, its tiles copied into
	*  pooled buffers and keyed by `target`'s own tiles at the same places. */
	static restore(pool, snap, target) {
		const s = new RibbonStrokeScratch(pool, snap.needsInk, snap.needsColor);
		s._applyScalars(snap, target);
		for (const t of snap.tiles) {
			const rect = {
				minX: t.originX,
				minY: t.originY,
				maxX: t.originX + t.width,
				maxY: t.originY + t.height
			};
			const tile = target.resolveForPaint(rect).find((r) => r.originX === t.originX && r.originY === t.originY)?.buffer;
			if (!tile) continue;
			const take = (b) => {
				if (!b) return null;
				const own = pool.acquire(b.width, b.height);
				b.copyTo(own);
				return own;
			};
			const original = take(t.bufs.original), coverage = take(t.bufs.coverage);
			if (!original || !coverage) continue;
			s._tiles.set(tile, {
				original,
				coverage,
				inkLoad: take(t.bufs.inkLoad),
				inkSettled: take(t.bufs.inkSettled),
				inkColor: take(t.bufs.inkColor),
				colorSettled: take(t.bufs.colorSettled),
				strokeInk: null,
				inkBase: null,
				strokeColor: null,
				colorBase: null,
				filmGesture: -1,
				inkDry: null,
				colorDry: null
			});
		}
		return s;
	}
}
/** (#536, §17.56) The tile textures of a wash that outlive a gesture. Not
*  the provisional dry picture (inkDry/colorDry): the next operation's settle
*  lays it again before the composite reads it, and leaving it out was the
*  same to a level on the devices and a quarter less memory (80 MB of
*  carried washes on the iPad instead of 96). */
const SNAPSHOT_TILE_BUFFERS = [
	"original",
	"coverage",
	"inkLoad",
	"inkSettled",
	"inkColor",
	"colorSettled"
];
export function scratchSnapshotBytes(snap) {
	let n = 0;
	for (const t of snap.tiles) for (const b of Object.values(t.bufs)) if (b) n += b.width * b.height * 4;
	return n;
}
export function freeScratchSnapshot(snap) {
	for (const t of snap.tiles) for (const b of Object.values(t.bufs)) b?.destroy();
}
/** (#536, §17.68) Every tile buffer of an open wash at rest. */
const SPILL_TILE_BUFFERS = [
	"original",
	"coverage",
	"inkLoad",
	"inkSettled",
	"inkColor",
	"colorSettled",
	"inkDry",
	"colorDry"
];

//# sourceMappingURL=data:application/json;base64,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QUFRLEdBQUcsV0FBVyxLQUFLLEVBQUUsS0FBSyxRQUFRO0dBQ3ZFLElBQUksQ0FBQyxZQUFZLENBQUMsVUFBVTtHQUM1QixFQUFFLE9BQU8sSUFBSSxNQUFNO0lBQ2pCO0lBQVU7SUFBVSxTQUFTLEtBQUssRUFBRSxLQUFLLE9BQU87SUFBRyxZQUFZLEtBQUssRUFBRSxLQUFLLFVBQVU7SUFDckYsVUFBVSxLQUFLLEVBQUUsS0FBSyxRQUFRO0lBQUcsY0FBYyxLQUFLLEVBQUUsS0FBSyxZQUFZO0lBQ3ZFLFdBQVc7SUFBTSxTQUFTO0lBQU0sYUFBYTtJQUFNLFdBQVc7SUFBTSxhQUFhLENBQUM7SUFDbEYsUUFBUTtJQUFNLFVBQVU7R0FDMUIsQ0FBQztFQUNIO0VBQ0EsT0FBTztDQUNUO0FBQ0Y7Ozs7OztBQU9BLE1BQU0sd0JBQXdCO0NBQUM7Q0FBWTtDQUFZO0NBQVc7Q0FBYztDQUFZO0FBQWM7QUFFMUcsT0FBTyxTQUFTLHFCQUFxQixNQUErQjtDQUNsRSxJQUFJLElBQUk7Q0FDUixLQUFLLE1BQU0sS0FBSyxLQUFLLE9BQU8sS0FBSyxNQUFNLEtBQUssT0FBTyxPQUFPLEVBQUUsSUFBSSxHQUFHLElBQUksR0FBRyxLQUFLLEVBQUUsUUFBUSxFQUFFLFNBQVM7Q0FDcEcsT0FBTztBQUNUO0FBRUEsT0FBTyxTQUFTLG9CQUFvQixNQUE2QjtDQUMvRCxLQUFLLE1BQU0sS0FBSyxLQUFLLE9BQU8sS0FBSyxNQUFNLEtBQUssT0FBTyxPQUFPLEVBQUUsSUFBSSxHQUFHLEdBQUcsUUFBUTtBQUNoRjs7QUF3QkEsTUFBTSxxQkFBcUI7Q0FBQztDQUFZO0NBQVk7Q0FBVztDQUFjO0NBQVk7Q0FBZ0I7Q0FBVTtBQUFVIiwibmFtZXMiOltdLCJzb3VyY2VzIjpbIlJpYmJvblN0cm9rZVNjcmF0Y2gudHMiXSwidmVyc2lvbiI6Mywic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBEYWIgfSBmcm9tICdAZ3JhZmV0dG8vc2hhcmVkJ1xuXG5pbXBvcnQgeyBBY2N1bXVsYXRpb25CdWZmZXIgfSBmcm9tICcuL0FjY3VtdWxhdGlvbkJ1ZmZlcidcbmltcG9ydCB0eXBlIHsgSUxheWVyQnVmZmVyLCBQYWludFRhcmdldCB9IGZyb20gJy4vSUxheWVyQnVmZmVyJ1xuaW1wb3J0IHR5cGUgeyBSaWJib25TY3JhdGNoUG9vbCB9IGZyb20gJy4vUmliYm9uU2NyYXRjaFBvb2wnXG5pbXBvcnQgdHlwZSB7IFBlbmNpbFByZXNldCB9IGZyb20gJy4uL3ByZXNldHMvcGVuY2lsUHJlc2V0cydcbmltcG9ydCB0eXBlIHsgUmliYm9uUHJvZmlsZSB9IGZyb20gJy4uL2RhYnMvcmliYm9uUHJvZmlsZSdcbmltcG9ydCB0eXBlIHsgV2NUcmFpbERhYiB9IGZyb20gJy4uL3ByZXNldHMvd2F0ZXJjb2xvclByZXNldHMnXG5pbXBvcnQgdHlwZSB7IEJydXNoVHJhdmVsIH0gZnJvbSAnLi4vd2F0ZXJjb2xvci9icnVzaERyYWcnXG5pbXBvcnQgdHlwZSB7IFdhdGVyRm9vdHByaW50LCBXYXRlclNvdXJjZSB9IGZyb20gJy4uL3dhdGVyY29sb3IvZm9yZWlnbldhdGVyJ1xuXG4vKiogUGVyLW1hcmtlci1zdHJva2UsIHBlci10aWxlIHNjcmF0Y2ggc3RhdGUgKGZvbGxvdy11cCB0byAjMjUwOiB0aGVcbiAqICBvcmlnaW5hbCBwZXItZGFiIHBhdGNoLWNvcHktdGhlbi1tdWx0aXBseSBkZXNpZ24gY29tcG91bmRlZCBkYXJrZXIgYXRcbiAqICBldmVyeSBkYWIgb3ZlcmxhcCwgc2luY2UgaXQgbXVsdGlwbGllZCB3aGF0ZXZlciB0aGUgKnByZXZpb3VzIGRhYiBvZlxuICogIHRoaXMgc2FtZSBzdHJva2UqIGhhZCBhbHJlYWR5IHdyaXR0ZW4g4oCUIGFuZCBtdWx0aXBseSBoYXMgbm8gbmF0dXJhbFxuICogIGNlaWxpbmcgdGhlIHdheSBub3JtYWwgXCJvdmVyXCIgYWNjdW11bGF0aW9uIGRvZXMsIHNvIGEgZGVuc2UsIGhlYXZpbHktXG4gKiAgb3ZlcmxhcHBpbmcgc3Ryb2tlIHNob3dlZCByZWd1bGFyIGRhcmsgYmFuZGluZy9jaGV2cm9ucyBhdCB0aGUgZGFiLVxuICogIHNwYWNpbmcgaW50ZXJ2YWwsIHdvcnN0IG9uIHRoZSBlbG9uZ2F0ZWQgY2hpc2VsIG5pYi4gU2VlICMyNTEvUUEg4oCUIHJlYWxcbiAqICByZXByb2R1Y3Rpb24gb24gYm90aCBkZXNrdG9wIGFuZCBhIHRhYmxldCkuIEZpeGVkIGJ5IHNlcGFyYXRpbmcgdHdvXG4gKiAgY29uY2VybnMgdGhhdCB1c2VkIHRvIGJlIGNvbmZsYXRlZCBpbnRvIG9uZSBcInJlYWQgdGhlIGxpdmUgbGF5ZXJcIiBzdGVwOlxuICpcbiAqICAtIGBvcmlnaW5hbGA6IHRoaXMgdGlsZSdzIGNvbnRlbnQgZXhhY3RseSBhcyBpdCB3YXMgKmJlZm9yZSogdGhpcyBzdHJva2VcbiAqICAgIHRvdWNoZWQgaXQsIGZyb3plbiB0aGUgZmlyc3QgdGltZSB0aGUgc3Ryb2tlIHJlYWNoZXMgdGhpcyB0aWxlIGFuZFxuICogICAgbmV2ZXIgdXBkYXRlZCBhZ2FpbiBmb3IgdGhlIHJlc3Qgb2YgdGhlIHN0cm9rZS5cbiAqICAtIGBjb3ZlcmFnZWA6IHRoaXMgc3Ryb2tlJ3Mgc2lsaG91ZXR0ZS9hbHBoYSBvbmx5IOKAlCBob3cgbXVjaCBvZiB0aGUgdGlsZVxuICogICAgdGhpcyBzdHJva2UgaGFzIHZpc3VhbGx5IHRvdWNoZWQgc28gZmFyLCBhIHBlcmZlY3RseSBvcmRpbmFyeVxuICogICAgc2F0dXJhdGluZyBcIm92ZXJcIiBzcGxhdCAoREFCX0ZSQUcncyB1X2lua01vZGU+Mi41IGJyYW5jaCksIHNvIGRlbnNlbHlcbiAqICAgIG92ZXJsYXBwaW5nIGRhYnMgY29udmVyZ2UgdG8gb25lIHNtb290aCBmbGF0IHZhbHVlIGluc3RlYWQgb2ZcbiAqICAgIGNvbXBvdW5kaW5nLlxuICogIC0gYGlua0xvYWRgIChBRFIgMDA0IFwi0KDQtdCy0LjQt9C40Y8gdjEuNVwiKTogaG93IG11Y2ggaW5rIHRoaXMgc3Ryb2tlIGhhc1xuICogICAgYWN0dWFsbHkgKmRlcG9zaXRlZCogc28gZmFyIOKAlCBhY2N1bXVsYXRlZCAqYWRkaXRpdmVseSpcbiAqICAgIChBY2N1bXVsYXRpb25CdWZmZXIuYmVnaW5BZGRpdGl2ZURyYXcsIG5vIHBlci1zcGxhdCBjZWlsaW5nKSwgYnlcbiAqICAgIGBkYWIub3BhY2l0eSAqIHNlZ21lbnRMZW5ndGhgIHBlciBkYWIgKGRpc3RhbmNlLW5vcm1hbGl6ZWQg4oCUIHNlZVxuICogICAgX3JpYmJvblN0cm9rZVdvcmspLCBub3QgYSBmbGF0IHBlci1kYWIgYW1vdW50LiBEZWxpYmVyYXRlbHkgc2VwYXJhdGVcbiAqICAgIGZyb20gYGNvdmVyYWdlYDogY29uZmxhdGluZyB0aGUgdHdvIGludG8gb25lIHNhdHVyYXRpbmcgdmFsdWUgKHYxJ3NcbiAqICAgIG93biBkZXNpZ24pIG1lYW50IGEgc3BvdCB0aGF0IGhhZCBhbHJlYWR5IHJlYWNoZWQgZnVsbCBjb3ZlcmFnZVxuICogICAgc3RvcHBlZCBkYXJrZW5pbmcgb24gZnVydGhlciBvdmVybGFwcGluZyBwYXNzZXMgd2l0aGluIHRoZSBzYW1lXG4gKiAgICBzdHJva2Ug4oCUIHdyb25nLCBhIHJlYWwgbWFya2VyIGtlZXBzIGRhcmtlbmluZyAodG93YXJkIGl0cyBvd25cbiAqICAgIGFzeW1wdG90ZSkgaWYgeW91IHNjcmliYmxlIGJhY2sgb3ZlciB0aGUgc2FtZSBzcG90IHdpdGhvdXQgbGlmdGluZy5cbiAqXG4gKiAgREFCX0ZSQUcncyB1X2lua01vZGU+MS41IGJyYW5jaCBtdWx0aXBsaWVzIGBvcmlnaW5hbGAgYnkgYSBkYXJrbmVzc1xuICogIGRlcml2ZWQgZnJvbSB0aGUgKnRvdGFsKiBhY2N1bXVsYXRlZCBgaW5rTG9hZGAgKHNhdHVyYXRpbmcgb25seSBhdCByZWFkXG4gKiAgdGltZSwgYDEgLSBleHAoLWlua0xvYWQqcmF0ZSlgKSBldmVyeSB0aW1lIGl0IHJlZHJhd3MgYSBkYWIncyBmb290cHJpbnQsXG4gKiAgYW5kIHNlcGFyYXRlbHkgYmxlbmRzIGFscGhhIHRvd2FyZCAxIGJ5IGBjb3ZlcmFnZWAg4oCUIGFsd2F5cyBhZ2FpbnN0IHRoZVxuICogIHNhbWUgZnJvemVuIGJhc2UsIG5ldmVyIHRoZSBwcmV2aW91cyBkYWIncyBvd24gYWxyZWFkeS1tdWx0aXBsaWVkXG4gKiAgb3V0cHV0LlxuICpcbiAqICBMaXZlcyBmb3IgZXhhY3RseSBvbmUgc3Ryb2tlLCBuZXZlciByZXVzZWQgYWNyb3NzIHN0cm9rZXMgKHVubGlrZVxuICogIHNtdWRnZSdzIG93biBwZXItdXNlciByZXNlcnZvaXIsIGEgcmVhbCBjYXJyaWVkIHBoeXNpY2FsIHJlc291cmNlKSDigJRcbiAqICBzZWUgZW5naW5lLl9vblN0YXJ0L19vbkVuZCBmb3IgdGhlIGxpdmUtZHJhd2luZyBsaWZlY3ljbGUsIGFuZFxuICogIF9wYWludFJpYmJvbkRhYnMnIG93biBkb2MgY29tbWVudCBmb3IgdGhlIG9uZS1zaG90LXJlcGxheSBjYXNlICh3aGljaFxuICogIGp1c3QgY3JlYXRlcyBhbmQgZGVzdHJveXMgaXRzIG93biB0aHJvd2F3YXkgaW5zdGFuY2Ugd2l0aGluIG9uZSBjYWxsLFxuICogIG5lZWRpbmcgbm8gY3Jvc3MtY2FsbCBsaWZlY3ljbGUgYXQgYWxsKS4gKi9cbi8qKiBPbmUgdGlsZSdzIHdvcnRoIG9mIGEgcmliYm9uIHN0cm9rZSdzIHNjcmF0Y2ggc3RhdGUuIGBpbmtMb2FkYCBpcyBudWxsIGZvciBhXG4gKiAgdG9vbCB3aG9zZSBjb21wb3NpdGUgZG9lc24ndCByZWFkIG9uZSDigJQgc2VlIFJpYmJvblN0cm9rZVNjcmF0Y2gncyBjdG9yLiAqL1xuZXhwb3J0IGludGVyZmFjZSBSaWJib25UaWxlU2NyYXRjaCB7XG4gIG9yaWdpbmFsOiBBY2N1bXVsYXRpb25CdWZmZXJcbiAgY292ZXJhZ2U6IEFjY3VtdWxhdGlvbkJ1ZmZlclxuICBpbmtMb2FkOiBBY2N1bXVsYXRpb25CdWZmZXIgfCBudWxsXG4gIC8qKiAoIzUzNiwgwqcxNy4xNykgVGhlIGRlcG9zaXQgYXMgaXQgc3Rvb2QgYWZ0ZXIgdGhlIHdhc2gncyBsYXN0IHNldHRsZSDigJRcbiAgICogIHRoZSBGSVhFRCBwYWludC4gV2hhdCB0aGUgZGlmZnVzaW9uIG1vdmVzIGlzIGlua0xvYWQgbWludXMgdGhpczogdGhlXG4gICAqICBwYWludCBsYWlkIHNpbmNlLCBhbmQgb25seSB0aGF0LiBOdWxsIHdoZW4gaW5rTG9hZCBpcy4gKi9cbiAgaW5rU2V0dGxlZDogQWNjdW11bGF0aW9uQnVmZmVyIHwgbnVsbFxuICAvKiogKCM1MzYsIMKnMTcuMTkpIFRoZSBvcHRpY2FsIGRlcHRoIG9mIHRoZSBwYWludCBwZXIgdGV4ZWwsIC5yZ2IsIGFuZCBpdHNcbiAgICogIG1hc3MgaW4gLmEg4oCUIHRoZSB3YXNoJ3MgY29sb3VyIHJlY29yZCAocGlnbWVudE9wdGljcy50cykuIFdyaXR0ZW4gYnkgdGhlXG4gICAqICBpbmsgcGFzcyBiZXNpZGUgaW5rTG9hZCwgbW92ZWQgYnkgdGhlIGRpZmZ1c2lvbiBieSB0aGUgc2FtZSBmcmFjdGlvbnMuICovXG4gIGlua0NvbG9yOiBBY2N1bXVsYXRpb25CdWZmZXIgfCBudWxsXG4gIC8qKiBJdHMgc2V0dGxlZCBjb3VudGVycGFydCwgYXMgaW5rU2V0dGxlZCBpcyB0byBpbmtMb2FkLiAqL1xuICBjb2xvclNldHRsZWQ6IEFjY3VtdWxhdGlvbkJ1ZmZlciB8IG51bGxcbiAgLyoqICgjNTM2LCBzMTcuMjgpIFRoZSBnZXN0dXJlJ3MgRklMTTogaXRzIHN0YW1wcyBhbmQgYmFuZHMgdW5kZXIgTUFYLCBzbyBhXG4gICAqICB0ZXhlbCBob2xkcyB0aGUgdGhpY2tlc3QgdGhpbmcgdGhlIGJydXNoIGxlZnQgdGhlcmUgYW5kIG5ldmVyIHRoZVxuICAgKiAgY291bnQgb2Ygb3ZlcmxhcHBpbmcgc3RhbXBzLiBpbmtMb2FkIGlzIHJlYnVpbHQgcGVyIGJhdGNoIGFzXG4gICAqICBpbmtCYXNlICsgc3Ryb2tlSW5rLCBpbmtCYXNlIGJlaW5nIHRoZSB3YXNoIGFzIGl0IHN0b29kIHdoZW4gdGhpc1xuICAgKiAgZ2VzdHVyZSBiZWdhbiAocmVmcmVzaGVkIG9uIHRoZSBmaXJzdCBiYXRjaCBvZiBlYWNoIGdlc3R1cmUpLiBUaGVcbiAgICogIGNvbG91ciByZWNvcmQgaGFzIHRoZSBzYW1lIHBhaXIuIE51bGwgdW50aWwgYSBnZXN0dXJlIHdpdGggZmlsbSBkcmF3cy4gKi9cbiAgc3Ryb2tlSW5rOiBBY2N1bXVsYXRpb25CdWZmZXIgfCBudWxsXG4gIGlua0Jhc2U6IEFjY3VtdWxhdGlvbkJ1ZmZlciB8IG51bGxcbiAgc3Ryb2tlQ29sb3I6IEFjY3VtdWxhdGlvbkJ1ZmZlciB8IG51bGxcbiAgY29sb3JCYXNlOiBBY2N1bXVsYXRpb25CdWZmZXIgfCBudWxsXG4gIC8qKiBXaGljaCBnZXN0dXJlIHRoZSBmaWxtIGJ1ZmZlcnMgYmVsb25nIHRvIChSaWJib25TdHJva2VTY3JhdGNoLmdlc3R1cmUpLiAqL1xuICBmaWxtR2VzdHVyZTogbnVtYmVyXG4gIC8qKiAoIzUzNiwgwqcxNy40MikgVGhlIHdhc2gncyBQUk9WSVNJT05BTCBEUlkgVEFSR0VUOiBpbmtMb2FkIC0gdGhlIHdldFxuICAgKiAgc3RhdGUsIHdoaWNoIGlzIHdoYXQgdGhlIG5leHQgb3BlcmF0aW9uIG9mIHRoZSB3YXNoIHN0YXJ0cyBmcm9tIC0gd2l0aFxuICAgKiAgdGhlIG9uZSB0aWRlIGxhaWQgYWxvbmcgdGhlIG91dGVyIGNvbnRvdXIgb2YgdGhlIHdhc2gncyB3aG9sZSBjb3ZlcmFnZSxcbiAgICogIHJlY29tcHV0ZWQgYXQgZXZlcnkgcGVuLXVwLiBUaGUgY29tcG9zaXRlIHJlYWRzIHRoaXMsIG5ldmVyIGlua0xvYWQsXG4gICAqICBvbmNlIGl0IGV4aXN0czsgdGhlIGxpdmUgYmF0Y2hlcyBjb21wb3NpdGUgaW5rTG9hZCAod2V0IHBsdXMgZmlsbSksIHNvXG4gICAqICBhIGJydXNoIHRvdWNoaW5nIHRoZSB3YXNoIHNob3dzIGl0IHdldCBhZ2FpbiB1bnRpbCB0aGUgcGVuIGxpZnRzLiBOdWxsXG4gICAqICB1bmRlciB0aGUgcGVyLW9wZXJhdGlvbiBkcnlpbmcgQS9CICh3Y09wRHJ5KS4gKi9cbiAgaW5rRHJ5OiBBY2N1bXVsYXRpb25CdWZmZXIgfCBudWxsXG4gIGNvbG9yRHJ5OiBBY2N1bXVsYXRpb25CdWZmZXIgfCBudWxsXG59XG5cbi8qKiBQYXJrZWQgc3RhdGUgaXMgemVyby1wYWRkZWQgaW4gZnVsbCwgcmVnYXJkbGVzcyBvZiBhIGRpc3BsYXkncyBzY2lzc29yLiAqL1xuZnVuY3Rpb24gY2xlYXJQYXJrZWRCdWZmZXIoYnVmZmVyOiBBY2N1bXVsYXRpb25CdWZmZXIpOiB2b2lkIHtcbiAgY29uc3QgZ2wgPSBidWZmZXIuZ2wsIHNjaXNzb3IgPSBnbC5pc0VuYWJsZWQoZ2wuU0NJU1NPUl9URVNUKVxuICBpZiAoc2Npc3NvcikgZ2wuZGlzYWJsZShnbC5TQ0lTU09SX1RFU1QpXG4gIGJ1ZmZlci5jbGVhcigpXG4gIGlmIChzY2lzc29yKSBnbC5lbmFibGUoZ2wuU0NJU1NPUl9URVNUKVxufVxuXG50eXBlIFNjcmF0Y2hCb3VuZHMgPSB7IG1pblg6IG51bWJlcjsgbWluWTogbnVtYmVyOyBtYXhYOiBudW1iZXI7IG1heFk6IG51bWJlciB9XG5cbmV4cG9ydCBjbGFzcyBSaWJib25TdHJva2VTY3JhdGNoIHtcbiAgLy8gIzcwMjogZXZlcnkgcmVjdGFuZ2xlIHdyaXR0ZW4gdG8gdGhlIG5vbi1vcmlnaW5hbCBidWZmZXJzLCBpbmNsdWRpbmdcbiAgLy8gZGlmZnVzaW9uJ3MgaGFsby4gVW5kZWZpbmVkIG1lYW5zIGFuIG9sZGVyIGNhcnJpZWQgc3RhdGUgaGFzIG5vIHByb29mXG4gIC8vIG9mIGl0cyBlbXB0eSBleHRlcmlvciBhbmQgbXVzdCBiZSBrZXB0IHdob2xlLlxuICBwcml2YXRlIF9zdG9yYWdlQm91bmRzOiBTY3JhdGNoQm91bmRzIHwgbnVsbCB8IHVuZGVmaW5lZCA9IG51bGxcblxuICBub3RlU3RvcmFnZUJvdW5kcyhib3VuZHM6IFNjcmF0Y2hCb3VuZHMpOiB2b2lkIHtcbiAgICBjb25zdCBvbGQgPSB0aGlzLl9zdG9yYWdlQm91bmRzXG4gICAgaWYgKG9sZCA9PT0gdW5kZWZpbmVkKSByZXR1cm5cbiAgICB0aGlzLl9zdG9yYWdlQm91bmRzID0gb2xkID8ge1xuICAgICAgbWluWDogTWF0aC5taW4ob2xkLm1pblgsIGJvdW5kcy5taW5YKSwgbWluWTogTWF0aC5taW4ob2xkLm1pblksIGJvdW5kcy5taW5ZKSxcbiAgICAgIG1heFg6IE1hdGgubWF4KG9sZC5tYXhYLCBib3VuZHMubWF4WCksIG1heFk6IE1hdGgubWF4KG9sZC5tYXhZLCBib3VuZHMubWF4WSksXG4gICAgfSA6IHsgLi4uYm91bmRzIH1cbiAgfVxuICBwcml2YXRlIF90aWxlcyA9IG5ldyBNYXA8QWNjdW11bGF0aW9uQnVmZmVyLCBSaWJib25UaWxlU2NyYXRjaD4oKVxuICBwcml2YXRlIHJlYWRvbmx5IHBvb2w6IFJpYmJvblNjcmF0Y2hQb29sXG4gIC8qKiAoIzUzNiwgwqcxNy4xOSkgV2hldGhlciB0aWxlcyBjYXJyeSBpbmtDb2xvciDigJQgd2F0ZXJjb2xvciBvbmx5LiAqL1xuICBwcml2YXRlIHJlYWRvbmx5IG5lZWRzQ29sb3I6IGJvb2xlYW5cbiAgLyoqICgjNTM2LCDCpzE3LjIwKSBFdmVyeSBwYWludCBsYWlkIGludG8gdGhpcyB3YXNoLCBhcyBjb2xvdXIga2V5cy4gV2hpbGUgaXRcbiAgICogIGlzIG9uZSBwYWludCwgdGhlIGNvbG91ciByZWNvcmQgaXMgdGhlIGRlcG9zaXQgdGltZXMgb25lIGFic29ycHRpb24gYW5kXG4gICAqICB0aGUgZGlmZnVzaW9uIG5lZWQgbm90IGNhcnJ5IGl0IOKAlCBzZWUgX2RpZmZ1c2VXYXNoLiAqL1xuICByZWFkb25seSBwYWludHMgPSBuZXcgU2V0PHN0cmluZz4oKVxuICAvKiogKCM1MzYsIMKnMTcuMjEpIFdoYXQgZWFjaCBkYWIgb2YgdGhlIGJhdGNoIGp1c3QgcGFpbnRlZCBsZWZ0IHN0YW5kaW5nIG9uXG4gICAqICB0aGUgc2hlZXQgKHdhdGVyY29sb3JTdGFuZGluZ1dhdGVyKSDigJQgdGhlIHJpYmJvbiBidWlsZCB3cml0ZXMgaXQsIGFuZFxuICAgKiAgd2hvZXZlciBmZWVkcyB0aGUgbGl2ZSB3ZXRuZXNzIGZpZWxkIHJlYWRzIGl0LCBzbyB0aGUgZmllbGQgYW5kIHRoZVxuICAgKiAgd2FzaCdzIGNvdmVyYWdlIC5iIGFyZSBmZWQgb25lIG51bWJlci4gQ2xlYXJlZCBwZXIgYmF0Y2g7IHRoZSBrZXlzIGFyZVxuICAgKiAgdGhlIGJhdGNoJ3Mgb3duIGRhYiBvYmplY3RzLiAqL1xuICByZWFkb25seSBzdGFuZGluZyA9IG5ldyBNYXA8RGFiLCBudW1iZXI+KClcbiAgLyoqICgjNTM2LCDCpzE3LjIyKSBMaXZlIGJhdGNoZXMgbm8gbG9uZ2VyIGNvbXBvc2l0ZSBvbmUgYnkgb25lOiBlYWNoIGFkZHNcbiAgICogIGl0cyByZWN0IGhlcmUsIGFuZCB0aGUgZW5naW5lIGNvbXBvc2l0ZXMgdGhlIHVuaW9uIG9uY2UgcGVyIGRpc3BsYXllZFxuICAgKiAgZnJhbWUgKF9mbHVzaExpdmVDb21wb3NpdGUpLiBLZXllZCBieSB0aWxlIGJ1ZmZlci4gKi9cbiAgcmVhZG9ubHkgcGVuZGluZ0NvbXBvc2l0ZSA9IG5ldyBNYXA8QWNjdW11bGF0aW9uQnVmZmVyLCB7IHRpbGU6IFBhaW50VGFyZ2V0OyBib3VuZHM6IHsgbWluWDogbnVtYmVyOyBtaW5ZOiBudW1iZXI7IG1heFg6IG51bWJlcjsgbWF4WTogbnVtYmVyIH0gfT4oKVxuICBwcml2YXRlIHJlYWRvbmx5IG5lZWRzSW5rOiBib29sZWFuXG4gIC8qKiAoIzQ2OCB2MykgSG93IG11Y2ggb2YgdGhlIGJydXNoJ3MgbG9hZCB0aGlzIGdlc3R1cmUgaGFzIHNwZW50IHNvIGZhcixcbiAgICogIG1lYXN1cmVkIGluIGJydXNoIHJhZGlpIG9mIHRyYXZlbCAoQURSIDAxMSDCpzMuOCkuXG4gICAqXG4gICAqICBMaXZlcyBvbiB0aGUgc2NyYXRjaCByYXRoZXIgdGhhbiBvbiB0aGUgZW5naW5lIGJlY2F1c2UgdGhhdCBpcyB0aGUgb25lXG4gICAqICBvYmplY3QgYWxsIHRocmVlIHBhdGhzIGFscmVhZHkgc2hhcmUgZm9yIHRoZSBsZW5ndGggb2YgZXhhY3RseSBvbmVcbiAgICogIGdlc3R1cmU6IGEgbGl2ZSBzdHJva2UncyBiYXRjaGVzLCBhIG9uZS1zaG90IHJlcGxheSdzIHNpbmdsZSBjYWxsLCBhbmQgYVxuICAgKiAgY2h1bmtlZCByZXBsYXkncyBzZXZlcmFsIG9wZXJhdGlvbnMuIFB1dCBpdCBvbiB0aGUgZW5naW5lIGFuZCByZXBsYXkgd291bGRcbiAgICogIGVpdGhlciBjYXJyeSBpdCBiZXR3ZWVuIHVucmVsYXRlZCBzdHJva2VzIG9yIHJlc2V0IGl0IGF0IGV2ZXJ5IGNodW5rXG4gICAqICBib3VuZGFyeSDigJQgYW5kIGEgc2VhbSBpbiB0aGUgZGVwbGV0aW9uIGlzIGEgdmlzaWJsZSBiYW5kIGFjcm9zcyB0aGUgbWFyay4gKi9cbiAgcHJpdmF0ZSBfd2F0ZXJVc2VkID0gMFxuICAvKiogKCM1MzYsIEFEUiAwMTEgwqcxNy4xMSkgV2hldGhlciBkZXBvc2l0IGhhcyBiZWVuIGxhaWQgc2luY2UgdGhlIHdhc2gnc1xuICAgKiAgcGlnbWVudCB3YXMgbGFzdCBkaWZmdXNlZC4gVGhlIGRpZmZ1c2lvbiBpcyB0aGUgb25lIHBhc3MgaW4gdGhpcyB0b29sXG4gICAqICB0aGF0IGlzICpub3QqIGlkZW1wb3RlbnQg4oCUIGV2ZXJ5IHJ1biBpcyBOIG1vcmUgc3RlcHMg4oCUIHNvIGl0IG1heSBydW5cbiAgICogIGV4YWN0bHkgb25jZSBwZXIgb3BlcmF0aW9uLCBvbiBldmVyeSBwYXRoIGFsaWtlOiBhIGxpdmUgY2h1bmsgZmx1c2gsIHRoZVxuICAgKiAgcGVuLXVwLCBhIHJlcGxheWVkIGNodW5rLCBhIHBlZXIncyBvcGVyYXRpb24uIFRoaXMgZmxhZyBpcyB3aGF0IG1ha2VzXG4gICAqICB0aGF0IHRydWUgd2hpY2hldmVyIHBhdGggY2FsbHMgX2ZpbmlzaFJpYmJvblN0cm9rZSBhbmQgaG93ZXZlciBvZnRlbi4gKi9cbiAgZGlmZnVzZVBlbmRpbmcgPSBmYWxzZVxuICAvKiogKCM1MzYpIFRoZSBzYW1lIGNsb2NrIGZvciBwaWdtZW50LCBhbmQgdGhlIHJlYXNvbiBpdCBpcyBhIHNlY29uZCBudW1iZXJcbiAgICogIHJhdGhlciB0aGFuIHRoZSBzYW1lIG9uZSBpcyB0aGUgYnJ1c2ggZHJpbmtpbmcgZnJvbSB3ZXQgcGFwZXIuXG4gICAqXG4gICAqICBQaWNraW5nIHVwIHdhdGVyIHJld2luZHMgdGhlIHdhdGVyIGNsb2NrICh3YXRlcmNvbG9yV2F0ZXJDbG9jaykuIFBpZ21lbnRcbiAgICogIG11c3Qgbm90IGNvbWUgYmFjayB3aXRoIGl0OiBkcmFnZ2luZyBhIGJydXNoIHRocm91Z2ggYSBwdWRkbGUgb2YgY2xlYW5cbiAgICogIHdhdGVyIGRvZXMgbm90IHJlbG9hZCBpdCB3aXRoIHBhaW50LCBpdCBkaWx1dGVzIHdoYXQgaXMgbGVmdC4gU28gdHJhdmVsXG4gICAqICBhZHZhbmNlcyBib3RoLCBhbmQgb25seSB3YXRlciBpcyBldmVyIGdpdmVuIGJhY2suXG4gICAqXG4gICAqICBPbiBkcnkgcGFwZXIgdGhlIHR3byBhcmUgdGhlIHNhbWUgbnVtYmVyIHRvIHRoZSBsYXN0IGJpdCwgd2hpY2ggaXMgd2hhdFxuICAgKiAga2VlcHMgZXZlcnkgc3Ryb2tlIHRoYXQgbmV2ZXIgbWVldHMgd2F0ZXIgYmVoYXZpbmcgZXhhY3RseSBhcyBpdCBkaWQuICovXG4gIHByaXZhdGUgX3BpZ21lbnRVc2VkID0gMFxuXG4gIC8qKiAoIzQ2OCB2NikgVGhlIGNvbXBvc2l0ZSdzIHNjYWxhciB1bmlmb3JtcywgZml4ZWQgZm9yIHRoZSB3aG9sZSBnZXN0dXJlLlxuICAgKlxuICAgKiAgVGhleSBjYW5ub3QgYmUgcGVyIGJhdGNoLiBUaGUgY29tcG9zaXRlIGlzIGEgKnJlY29tcHV0YXRpb24qIG92ZXIgYSB3aG9sZVxuICAgKiAgcmVjdCwgc28gd2hpY2hldmVyIGJhdGNoIHdyb3RlIGEgcGl4ZWwgbGFzdCBkZWNpZGVzIGl0cyBzY2FsYXJzIOKAlCBhbmQgd2l0aFxuICAgKiAgcGVyLWJhdGNoIHZhbHVlcyB0aGF0IHNob3dlZCB1cCBpbW1lZGlhdGVseSBhcyByZWN0YW5ndWxhciB0b25lIGJsb2Nrc1xuICAgKiAgYWxvbmcgYSBsaXZlIHN0cm9rZSwgb25lIHBlciBwb2ludGVyIGV2ZW50LCB3aGljaCBpcyBwcmVjaXNlbHkgd2hhdFxuICAgKiAgXCLRiNGC0YDQuNGFINC/0L7RgdGC0L7Rj9C90L3QviDRgdGC0YDQsNC90L3QviDQvNC10L3Rj9C10YLRgdGPXCIgd2FzLlxuICAgKlxuICAgKiAgRGVyaXZlZCBmcm9tIHRoZSBnZXN0dXJlJ3MgKmZpcnN0KiBkYWIsIHdoaWNoIGlzIHRoZSBvbmUgdGhpbmcgYSBsaXZlXG4gICAqICBzdHJva2UgYW5kIGEgcmVwbGF5IG9mIGl0IGFyZSBndWFyYW50ZWVkIHRvIGFncmVlIG9uOiBsaXZlIHNlZXMgaXQgYXMgdGhlXG4gICAqICBmaXJzdCBkYWIgb2YgaXRzIGZpcnN0IGJhdGNoLCBhIG9uZS1zaG90IHJlcGxheSBhcyB0aGUgZmlyc3QgZGFiIG9mIHRoZVxuICAgKiAgb25seSBiYXRjaC4gQW55dGhpbmcgYXZlcmFnZWQgb3ZlciBhIGJhdGNoIHdvdWxkIGRpZmZlciBiZXR3ZWVuIHRoZSB0d28uICovXG4gIHByaXZhdGUgX2NvbXBvc2l0ZToge1xuICAgIHNwcmVhZFB4OiBudW1iZXI7IGlua1Ntb290aFB4OiBudW1iZXI7IHdhdGVyOiBudW1iZXI7IG1pZ3JhdGVQeDogbnVtYmVyOyBicmlzdGxlUmFkaXVzUHg6IG51bWJlclxuICAgIC8qKiAoIzQ2OCB2MTApIFdoZXJlIHRoZSBub2lzZSBmaWVsZHMgYXJlIGFuY2hvcmVkLlxuICAgICAqXG4gICAgICogIEEgY29uc3RhbnQgb2YgdGhlIGdlc3R1cmUsIGFuZCB0aGF0IGlzIGEgYnVnIGZpeCByYXRoZXIgdGhhbiB0aWRpbmVzcy5cbiAgICAgKiAgSXQgdXNlZCB0byBiZSAqdGhpcyBiYXRjaCdzKiBmaXJzdCBkYWIsIHNvIHRoZSB3aG9sZSB0ZXh0dXJlIHNoaWZ0ZWQgYnlcbiAgICAgKiAgYSBmZXcgcGl4ZWxzIG9uIGV2ZXJ5IHBvaW50ZXIgZXZlbnQg4oCUIHRoZSBtYXJrJ3MgZ3JhaW4gdmlzaWJseSBjcmF3bGVkXG4gICAgICogIGJhY2t3YXJkcyB1bmRlciB0aGUgcGVuIGFzIGl0IHdhcyBkcmF3biwgYW5kIHRoZW4gbGFuZGVkIHNvbWV3aGVyZSBlbHNlXG4gICAgICogIGFnYWluIGF0IHBlbi11cCwgYmVjYXVzZSB0aGUgZmluYWwgcGFzcyBhbmNob3JlZCBvbiB0aGUgZ2VzdHVyZSdzIGZpcnN0XG4gICAgICogIGRhYiBpbnN0ZWFkLiBPbiBhIGxvbmcgc3RyYWlnaHQgc3Ryb2tlIHRoZSBzYW1lIHNoaWZ0aW5nIHNob3dlZCB1cCBhcyBhXG4gICAgICogIHJvdyBvZiBkaXNjcyBhdCB0aGUgYmF0Y2ggcGl0Y2guICovXG4gICAgZmllbGRTZWVkOiBbbnVtYmVyLCBudW1iZXJdXG4gIH0gfCBudWxsID0gbnVsbFxuXG4gIGNvbXBvc2l0ZVNjYWxhcnMobWFrZTogKCkgPT4geyBzcHJlYWRQeDogbnVtYmVyOyBpbmtTbW9vdGhQeDogbnVtYmVyOyB3YXRlcjogbnVtYmVyOyBtaWdyYXRlUHg6IG51bWJlcjsgZmllbGRTZWVkOiBbbnVtYmVyLCBudW1iZXJdOyBicmlzdGxlUmFkaXVzUHg6IG51bWJlciB9KTogeyBzcHJlYWRQeDogbnVtYmVyOyBpbmtTbW9vdGhQeDogbnVtYmVyOyB3YXRlcjogbnVtYmVyOyBtaWdyYXRlUHg6IG51bWJlcjsgZmllbGRTZWVkOiBbbnVtYmVyLCBudW1iZXJdOyBicmlzdGxlUmFkaXVzUHg6IG51bWJlciB9IHtcbiAgICBpZiAoIXRoaXMuX2NvbXBvc2l0ZSkgdGhpcy5fY29tcG9zaXRlID0gbWFrZSgpXG4gICAgcmV0dXJuIHRoaXMuX2NvbXBvc2l0ZVxuICB9XG5cbiAgLyoqICgjNDY4IHY2KSBUaGUgZ2VzdHVyZSdzIGRhYiBzcGFjaW5nLCBjYWNoZWQgdGhlIGZpcnN0IHRpbWUgdHdvIGNvbnNlY3V0aXZlXG4gICAqICBkYWJzIGFyZSBhY3R1YWxseSBhdmFpbGFibGUuXG4gICAqXG4gICAqICBNZWFzdXJlZCByYXRoZXIgdGhhbiBkZXJpdmVkLCBiZWNhdXNlIHdoYXQgaXQgaGFzIHRvIG1hdGNoIGlzXG4gICAqICBEYWJTeXN0ZW0ncyBgYmFzZVNpemUgKiBzcGFjaW5nRmFjdG9yYCDigJQgYW5kIGBiYXNlU2l6ZWAgaXMgdGhlIHRvb2wnc1xuICAgKiAgKm5vbWluYWwqIHNpemUsIHdoaWNoIG5vIG9wZXJhdGlvbiByZWNvcmRzOiBkYWJzIGNhcnJ5IHRoZWlyIHBvc3QtcHJlc3N1cmUsXG4gICAqICBwb3N0LXRhcGVyIHNpemVzIGluc3RlYWQuIFRoZSBkaXN0YW5jZSBiZXR3ZWVuIHRoZSBzdHJva2UncyBvd24gZmlyc3QgdHdvXG4gICAqICBkYWJzIGlzIHRoYXQgc3BhY2luZywgYW5kIGl0IGlzIHRoZSBzYW1lIHBhaXIgb2YgZGFicyB3aGV0aGVyIHRoZXkgYXJyaXZlXG4gICAqICBpbiBvbmUgcmVwbGF5ZWQgYmF0Y2ggb3IgYWNyb3NzIHR3byBsaXZlIG9uZXMgKHRoZSBzZWNvbmQgY2FzZSByZWFjaGVzXG4gICAqICB0aGVtIHRocm91Z2ggcHJldkRhYiksIHNvIGJvdGggcGF0aHMgbWVhc3VyZSB0aGUgaWRlbnRpY2FsIG51bWJlci5cbiAgICpcbiAgICogIFplcm8gdW50aWwgYSBwYWlyIGV4aXN0cyDigJQgYSBmaXJzdCBiYXRjaCBvZiBleGFjdGx5IG9uZSBkYWIgY292ZXJzIGEgZmV3XG4gICAqICBweCBhdCB0aGUgc3Ryb2tlJ3Mgc3RhcnQsIGFuZCB0aGUgbmV4dCBiYXRjaCdzIHBhZGRlZCByZWN0IHJlY29tcG9zaXRlcyBpdFxuICAgKiAgYW55d2F5LiAqL1xuICBwcml2YXRlIF9kYWJTcGFjaW5nID0gMFxuICAvKiogKCM0NjggdjYpIEV2ZXJ5dGhpbmcgdGhlIGdlc3R1cmUncyBmaW5hbCByZWNvbXBvc2l0ZSBuZWVkcywgcGx1cyB0aGUgdW5pb25cbiAgICogIG9mIGV2ZXJ5IGJhdGNoJ3MgYm91bmRzLlxuICAgKlxuICAgKiAgSXQgZXhpc3RzIGJlY2F1c2UgcmVhc29uaW5nIGFib3V0IHdoZXRoZXIgdGhlIGluY3JlbWVudGFsIHBlci1iYXRjaFxuICAgKiAgY29tcG9zaXRlcyBhcmUgKnN1ZmZpY2llbnQqIHR1cm5lZCBvdXQgdG8gYmUgYSB0cmFwOiB0aHJlZSBwbGF1c2libGVcbiAgICogIGFyZ3VtZW50cyB0aGF0IHRoZXkgd2VyZSwgYW5kIGEgbWVhc3VyZWQgMjYlIG9mIHRoZSBtYXJrIHN0aWxsIGRpZmZlcmluZ1xuICAgKiAgYmV0d2VlbiBhIGxpdmUgc3Ryb2tlIGFuZCBhIHJlcGxheSBvZiBpdC4gU28gdGhlIGxhc3QgdGhpbmcgYSBnZXN0dXJlIGRvZXNcbiAgICogIGlzIG5vdyBleGFjdGx5IHdoYXQgYSByZXBsYXkgZG9lcyDigJQgb25lIGNvbXBvc2l0ZSBvdmVyIHRoZSB3aG9sZSBtYXJrIHdpdGhcbiAgICogIHRoZSBmaW5pc2hlZCBidWZmZXJzIOKAlCBhbmQgdGhlIHR3byBhZ3JlZSBieSBjb25zdHJ1Y3Rpb24gcmF0aGVyIHRoYW4gYnlcbiAgICogIGFyZ3VtZW50LlxuICAgKlxuICAgKiAgVGhpcyBpcyBub3QgdGhlIG9sZCBzZXR0bGUgcGFzcy4gVGhhdCBvbmUgKmludHJvZHVjZWQqIHRlcm1zIHRoZSBsaXZlXG4gICAqICBiYXRjaGVzIGhhZCBzd2l0Y2hlZCBvZmYsIGFuZCByZS1yZWFkIHNjYWxhcnMgZnJvbSB0aGUgZmlyc3QgYmF0Y2gsIHdoaWNoXG4gICAqICBpcyB3aHkgdGhlIG1hcmsganVtcGVkIGF0IHBlbi11cC4gRXZlcnkgc2NhbGFyIGhlcmUgaXMgYWxyZWFkeSBhIGNvbnN0YW50XG4gICAqICBvZiB0aGUgZ2VzdHVyZSwgc28gdGhlIGZpbmFsIHBhc3MgcmVjb21wdXRlcyB0aGUgc2FtZSB2YWx1ZXMgdGhlIGJhdGNoZXNcbiAgICogIGRpZCDigJQgaXQgb25seSBmaXhlcyBwaXhlbHMgdGhhdCB3ZXJlIGNvbXBvc2l0ZWQgYmVmb3JlIGFsbCB0aGVpciBpbmsgaGFkXG4gICAqICBhcnJpdmVkLiAqL1xuICBwcml2YXRlIF9maW5pc2g6IHtcbiAgICB0YXJnZXQ6IElMYXllckJ1ZmZlcjsgcHJlc2V0OiBQZW5jaWxQcmVzZXQ7IHByb2ZpbGU6IFJpYmJvblByb2ZpbGVcbiAgICBjb2xvcjogW251bWJlciwgbnVtYmVyLCBudW1iZXJdOyBvcGFjaXR5OiBudW1iZXJcbiAgICBib3VuZHM6IHsgbWluWDogbnVtYmVyOyBtaW5ZOiBudW1iZXI7IG1heFg6IG51bWJlcjsgbWF4WTogbnVtYmVyIH1cbiAgICBmaWVsZFNlZWQ6IFtudW1iZXIsIG51bWJlcl1cbiAgICAvKiogKCM1MzYsIMKnMTcuMjMpIFRoZSByZWNvcmRlZCB3ZXRuZXNzIG9mIHRoZSBwYXBlciB3aGVyZSB0aGlzIG9wZXJhdGlvblxuICAgICAqICBMQU5ERUQg4oCUIGl0cyBmaXJzdCBkYWIncyBkaWdpdCDigJQgc28gdGhlIHNldHRsZSBjYW4gdGVsbCBhIGRyb3AgaW50byBhXG4gICAgICogIGRhbXAgd2FzaCAoYSBibG9vbSkgZnJvbSBvbmUgaW50byBhIHdldCBvciBhIGRyeSBvbmUuIFRoZSBmaXJzdCBkYWIsXG4gICAgICogIGFzIGV2ZXJ5dGhpbmcgZWxzZSB0aGUgZ2VzdHVyZSBkZWNpZGVzIG9uY2UgKHNlZSBfcGFpbnRSaWJib25EYWJzKTpcbiAgICAgKiAgaXQgaXMgdGhlIG9uZSBzYW1wbGUgYSBsaXZlIHN0cm9rZSBhbmQgaXRzIHJlcGxheSBhcmUgc3VyZSB0byBzaGFyZSxcbiAgICAgKiAgYW5kIHRoZSBwcm9maWxlIGFmdGVyIGl0IGlzIHN0cmlkZWQgYW5kIHRyaW1tZWQuICovXG4gICAgbGFuZGVkV2V0OiBudW1iZXJcbiAgICAvKiogKCM1MzYsIMKnMTcuMjUpIFRoZSB3ZXR0ZXN0IHBhcGVyIHRoZSBvcGVyYXRpb24gcmFuIG92ZXIgKHdldFBlYWspOlxuICAgICAqICB3aGV0aGVyIGl0cyB3YXRlciBqb2luZWQgYSBwdWRkbGUgYWxyZWFkeSB0aGVyZS4gKi9cbiAgICB3ZXRQZWFrOiBudW1iZXJcbiAgICAvKiogKCM1MzYsIMKnMTcuMjMpIFRoZSB3aWRlc3QgZGFiIHJhZGl1cyBvZiB0aGUgb3BlcmF0aW9uLCBweC4gKi9cbiAgICByYWRpdXNQeDogbnVtYmVyXG4gICAgLyoqICgjNTM2LCDCpzE3LjM3KSBIb3cgbG9uZyB0aGUgYnJ1c2ggc3Rvb2Qgb24gbGFuZGluZywgbXMuICovXG4gICAgZHdlbGxNczogbnVtYmVyXG4gIH0gfCBudWxsID0gbnVsbFxuXG4gIC8qKiAoIzUzNiwgwqcxNy40MikgV2hhdCB0aGUgZ3JvdXAgdGlkZSBuZWVkcyB3aGVuIHRoZSB3YXNoIGRyaWVzIGFzIG9uZVxuICAgKiAgY29tcG9uZW50ICh3YXRlcmNvbG9yRHJ5V2FzaCk6IHRoZSBjb21wb3NpdGUncyBjb25zdGFudHMgZnJvbSB0aGUgTEFTVFxuICAgKiAgc2V0dGxlZCBvcGVyYXRpb24sIHRoZSB3aWRlc3QgcmFkaXVzIGFuZCB0aGUgd2V0dGVzdCBzdGFuZGluZyBsZXZlbFxuICAgKiAgb2YgYW55LCBhbmQgdGhlIHVuaW9uIG9mIGV2ZXJ5IHNldHRsZSdzIGJvdW5kcy4gU2V0IGJ5IHRoZSBzZXR0bGUuICovXG4gIGRyeUN0eDoge1xuICAgIHRhcmdldDogSUxheWVyQnVmZmVyOyBwcmVzZXQ6IFBlbmNpbFByZXNldDsgcHJvZmlsZTogUmliYm9uUHJvZmlsZVxuICAgIGNvbG9yOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl07IG9wYWNpdHk6IG51bWJlcjsgZmllbGRTZWVkOiBbbnVtYmVyLCBudW1iZXJdXG4gICAgYm91bmRzOiB7IG1pblg6IG51bWJlcjsgbWluWTogbnVtYmVyOyBtYXhYOiBudW1iZXI7IG1heFk6IG51bWJlciB9XG4gICAgcmFkaXVzUHg6IG51bWJlcjsgc3RhbmRpbmc6IG51bWJlclxuICB9IHwgbnVsbCA9IG51bGxcblxuICBub3RlRmluaXNoKGN0eDogTm9uTnVsbGFibGU8UmliYm9uU3Ryb2tlU2NyYXRjaFsnX2ZpbmlzaCddPik6IHZvaWQge1xuICAgIHRoaXMubm90ZVN0b3JhZ2VCb3VuZHMoY3R4LmJvdW5kcylcbiAgICBjb25zdCBwcmV2ID0gdGhpcy5fZmluaXNoXG4gICAgaWYgKCFwcmV2KSB7IHRoaXMuX2ZpbmlzaCA9IGN0eDsgcmV0dXJuIH1cbiAgICBwcmV2LmR3ZWxsTXMgPSBNYXRoLm1heChwcmV2LmR3ZWxsTXMsIGN0eC5kd2VsbE1zKVxuICAgIHByZXYuYm91bmRzID0ge1xuICAgICAgbWluWDogTWF0aC5taW4ocHJldi5ib3VuZHMubWluWCwgY3R4LmJvdW5kcy5taW5YKSxcbiAgICAgIG1pblk6IE1hdGgubWluKHByZXYuYm91bmRzLm1pblksIGN0eC5ib3VuZHMubWluWSksXG4gICAgICBtYXhYOiBNYXRoLm1heChwcmV2LmJvdW5kcy5tYXhYLCBjdHguYm91bmRzLm1heFgpLFxuICAgICAgbWF4WTogTWF0aC5tYXgocHJldi5ib3VuZHMubWF4WSwgY3R4LmJvdW5kcy5tYXhZKSxcbiAgICB9XG4gICAgcHJldi5yYWRpdXNQeCA9IE1hdGgubWF4KHByZXYucmFkaXVzUHgsIGN0eC5yYWRpdXNQeClcbiAgICAvLyBBIHN0cm9rZSBjYW4gZW50ZXIgYSBwdWRkbGUgYWZ0ZXIgaXRzIGZpcnN0IGxpdmUgYmF0Y2guIFJldGFpbiB0aGVcbiAgICAvLyB3ZXR0ZXN0IGxhbmRpbmcgYWNyb3NzIGV2ZXJ5IGJhdGNoLCBqdXN0IGFzIGEgc2luZ2xlLWJhdGNoIHJlcGxheSBkb2VzLlxuICAgIHByZXYud2V0UGVhayA9IE1hdGgubWF4KHByZXYud2V0UGVhaywgY3R4LndldFBlYWspXG4gIH1cblxuICBnZXQgZmluaXNoQ29udGV4dCgpOiBSaWJib25TdHJva2VTY3JhdGNoWydfZmluaXNoJ10ge1xuICAgIHJldHVybiB0aGlzLl9maW5pc2hcbiAgfVxuXG4gIC8qKiBUaGUgc2NyYXRjaCB0aGlzIHRpbGUgYWxyZWFkeSBoYXMsIG9yIG51bGwg4oCUIGRlbGliZXJhdGVseSBub3QgZ2V0T3JDcmVhdGU6XG4gICAqICBhIHRpbGUgaW5zaWRlIHRoZSBnZXN0dXJlJ3MgYm91bmRpbmcgYm94IHRoYXQgaXRzIGRhYnMgbmV2ZXIgcmVhY2hlZCBoYXNcbiAgICogIG5vdGhpbmcgdG8gcmVjb21wb3NpdGUsIGFuZCBzbmFwc2hvdHRpbmcgb25lIHdvdWxkIHNwZW5kIHRocmVlIHBvb2xlZFxuICAgKiAgYnVmZmVycyB3cml0aW5nIGl0IGJhY2sgdW5jaGFuZ2VkLiAqL1xuICBwZWVrKHRpbGU6IEFjY3VtdWxhdGlvbkJ1ZmZlcik6IFJpYmJvblRpbGVTY3JhdGNoIHwgbnVsbCB7XG4gICAgcmV0dXJuIHRoaXMuX3RpbGVzLmdldCh0aWxlKSA/PyBudWxsXG4gIH1cblxuICAvKiogKCM1NzkpIFRoZSBkaWdpdGFsIHdhdGVyY29sb3IncyB3ZXQtZWRnZSByZWFjaCwgZml4ZWQgYnkgdGhlIGdlc3R1cmUnc1xuICAgKiAgZmlyc3QgZGFiIOKAlCB0aGUgc2FtZSBcImZpcnN0IGRhYiBpcyB3aGF0IGxpdmUgYW5kIHJlcGxheSBhZ3JlZSBvblwiIHJ1bGVcbiAgICogIGFzIHRoZSBzcGFjaW5nIGJlbG93LiBBIHBlci1iYXRjaCB2YWx1ZSB3b3VsZCBkcmF3IGEgcmltIG9mIGEgZGlmZmVyZW50XG4gICAqICB3aWR0aCBhY3Jvc3MgZXZlcnkgYmF0Y2ggYm91bmRhcnkuICovXG4gIHByaXZhdGUgX2JydXNoRWRnZVB4ID0gMFxuXG4gIG5vdGVCcnVzaEVkZ2VQeChweDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAodGhpcy5fYnJ1c2hFZGdlUHggPT09IDAgJiYgcHggPiAwKSB0aGlzLl9icnVzaEVkZ2VQeCA9IHB4XG4gICAgcmV0dXJuIHRoaXMuX2JydXNoRWRnZVB4XG4gIH1cblxuICBub3RlRGFiU3BhY2luZyhnYXA6IG51bWJlcik6IG51bWJlciB7XG4gICAgaWYgKHRoaXMuX2RhYlNwYWNpbmcgPT09IDAgJiYgZ2FwID4gMC4wMSkgdGhpcy5fZGFiU3BhY2luZyA9IGdhcFxuICAgIHJldHVybiB0aGlzLl9kYWJTcGFjaW5nXG4gIH1cblxuICAvKiogKCM0NjggdjgpIFRoZSBnZXN0dXJlJ3Mgb3BlbmluZyBkaXJlY3Rpb24sIGNhY2hlZCB0aGUgZmlyc3QgdGltZSBhIHJlYWxcbiAgICogIHNlZ21lbnQgZXhpc3RzLiBTYW1lIGZpcnN0LXR3by1kYWJzIHJ1bGUgdGhlIHNwYWNpbmcgZm9sbG93cywgYW5kIGZvciB0aGVcbiAgICogIHNhbWUgcmVhc29uOiBpdCBpcyB0aGUgb25lIG1lYXN1cmVtZW50IGEgbGl2ZSBzdHJva2UgYW5kIGEgcmVwbGF5IG9mIGl0XG4gICAqICBhcmUgZ3VhcmFudGVlZCB0byBhZ3JlZSBvbi4gKi9cbiAgcHJpdmF0ZSBfZGlyOiBbbnVtYmVyLCBudW1iZXJdID0gWzEsIDBdXG4gIHByaXZhdGUgX2RpclNldCA9IGZhbHNlXG5cbiAgbm90ZURpcmVjdGlvbihkeDogbnVtYmVyLCBkeTogbnVtYmVyKTogW251bWJlciwgbnVtYmVyXSB7XG4gICAgaWYgKCF0aGlzLl9kaXJTZXQpIHtcbiAgICAgIGNvbnN0IGxlbiA9IE1hdGguaHlwb3QoZHgsIGR5KVxuICAgICAgaWYgKGxlbiA+IDAuMDEpIHsgdGhpcy5fZGlyID0gW2R4IC8gbGVuLCBkeSAvIGxlbl07IHRoaXMuX2RpclNldCA9IHRydWUgfVxuICAgIH1cbiAgICByZXR1cm4gdGhpcy5fZGlyXG4gIH1cblxuICBnZXQgd2F0ZXJVc2VkKCk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuX3dhdGVyVXNlZFxuICB9XG5cbiAgZ2V0IHBpZ21lbnRVc2VkKCk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuX3BpZ21lbnRVc2VkXG4gIH1cblxuICBhZHZhbmNlV2F0ZXIod2F0ZXI6IG51bWJlciwgcGlnbWVudDogbnVtYmVyKTogdm9pZCB7XG4gICAgdGhpcy5fd2F0ZXJVc2VkID0gd2F0ZXJcbiAgICB0aGlzLl9waWdtZW50VXNlZCA9IHBpZ21lbnRcbiAgfVxuXG4gIC8qKiAoIzQ2OCB2NykgQSBuZXcgc3Ryb2tlIGpvaW5zIHRoaXMgd2FzaC4gT25seSB0aGUgYnJ1c2gncyBvd24gbG9hZCByZXNldHMg4oCUXG4gICAqICBsaWZ0aW5nIHRoZSBicnVzaCBhbmQgcHV0dGluZyBpdCBiYWNrIGRvd24gbWVhbnMgYSBmcmVzaGx5IGNoYXJnZWQgYnJ1c2gsXG4gICAqICBidXQgdGhlIHBhaW50IGFscmVhZHkgb24gdGhlIHBhcGVyIGlzIHN0aWxsIHRoZXJlIGFuZCBzdGlsbCB3ZXQuXG4gICAqXG4gICAqICBFdmVyeXRoaW5nIGVsc2UgZGVsaWJlcmF0ZWx5IHN1cnZpdmVzOiB0aGUgZnJvemVuIHByZS13YXNoIGNvbnRlbnQsIHRoZVxuICAgKiAgYWNjdW11bGF0ZWQgY292ZXJhZ2UgYW5kIGRlcG9zaXQsIHRoZSBub2lzZSBmaWVsZCdzIHNlZWQgYW5kIHRoZSBjb21wb3NpdGVcbiAgICogIHNjYWxhcnMuIFRoYXQgaXMgd2hhdCBtYWtlcyBhIHNlY29uZCBiYW5kIGxhaWQgYmVzaWRlIHRoZSBmaXJzdCBtZXJnZSB3aXRoXG4gICAqICBpdCBpbnN0ZWFkIG9mIGFycml2aW5nIGFzIGFub3RoZXIgbWFyayBvbiB0b3Ag4oCUIHRoZSB0d28gc2hhcmUgb25lXG4gICAqICBzaWxob3VldHRlLCBzbyB0aGVyZSBpcyBubyBib3VuZGFyeSBiZXR3ZWVuIHRoZW0gdG8gZHJhdywgYW5kIG9ubHkgdGhlXG4gICAqICBvdXRlciBwZXJpbWV0ZXIgb2YgdGhlIHdob2xlIHdhc2ggZ2V0cyBhIHRpZGVsaW5lLiAqL1xuICAvKiogKMKnMTcuMjgpIFRoZSBsYXN0IGRhYiB0aGF0IGRlcG9zaXRlZCDigJQgdGhlIGFuY2hvciB0aGUgdHJhdmVsIHF1YW50dW1cbiAgICogIG1lYXN1cmVzIGZyb20gKHdhdGVyY29sb3JUcmF2ZWxRdWFudHVtKS4gUGVyIGdlc3R1cmUuICovXG4gIGxhc3RLZXB0OiBEYWIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWRcbiAgLyoqICjCpzE3LjI4KSBDb3VudHMgdGhlIGdlc3R1cmVzIG9mIHRoaXMgd2FzaDsgdGhlIGZpbG0gYnVmZmVycyBvZiBhIHRpbGVcbiAgICogIGFyZSByZWZyZXNoZWQgd2hlbiBhIGJhdGNoIGFycml2ZXMgZnJvbSBhIGdlc3R1cmUgdGhleSB3ZXJlIG5vdCBtYWRlIGZvci4gKi9cbiAgZ2VzdHVyZSA9IDBcbiAgLyoqICgjNTM2LCDCpzE3LjM3KSBUaGUgZ2VzdHVyZSdzIGxhbmRpbmc6IHdoZXJlIHRoZSBuaWIgY2FtZSBkb3duIGFuZCBpdHNcbiAgICogIHJhZGl1cyB0aGVyZSwgYW5kIGhvdyBsb25nIGl0IHN0b29kIHdpdGhpbiBXQ19EV0VMTF9SQURJVVMgb2YgaXQgYmVmb3JlXG4gICAqICBtb3Zpbmcgb24gKHRoZSBkYWJzJyBvd24gY2xvY2ssIERhYi50KS4gRnJvemVuIG9uY2UgYSBkYWIgbGVhdmVzLiBQZXJcbiAgICogIGdlc3R1cmUsIGFuZCBhIHB1cmUgZnVuY3Rpb24gb2YgdGhlIG9wZXJhdGlvbidzIGRhYnMsIHNvIGEgcmVwbGF5XG4gICAqICBjb3VudHMgdGhlIHNhbWUgZHdlbGwgdG8gdGhlIG1pbGxpc2Vjb25kLiAqL1xuICBsYW5kaW5nOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyByOiBudW1iZXI7IHQ6IG51bWJlciB9IHwgbnVsbCA9IG51bGxcbiAgZHdlbGxNcyA9IDBcbiAgZHdlbGxEb25lID0gZmFsc2VcbiAgLyoqICgjNjgwLCDCpzE3Ljc0KSBUaGUgZ2VzdHVyZSdzIHJlY2VudCBrZXB0IGRhYnMgKG9sZGVzdCBmaXJzdCwgYXQgbW9zdFxuICAgKiAgV0NfVFJBSUxfTEVOKSwgdGhlIGR3ZWxsIGF0IGV2ZXJ5IGRhYiBpcyByZWFkIGJhY2sgb3ZlcjsgYW5kIHRoZSBicnVzaCdzXG4gICAqICBzdXJwbHVzIHRoZSBzbG93ZG93bnMgbGVmdCAtIHBpZ21lbnQgYW5kIHdhdGVyIC0gd2l0aCB0aGUgcGlnbWVudCBjbG9ja1xuICAgKiAgaXQgd2FzIGxhc3QgY2FycmllZCB0by4gUGVyIGdlc3R1cmUsIGEgcHVyZSBmdW5jdGlvbiBvZiBpdHMgZGFicy4gKi9cbiAgdHVybk9mZnNldDogW251bWJlciwgbnVtYmVyXSA9IFswLCAwXVxuICB0dXJuRGlyZWN0aW9uOiBbbnVtYmVyLCBudW1iZXJdIHwgbnVsbCA9IG51bGxcbiAgYnJ1c2hUcmF2ZWw6IEJydXNoVHJhdmVsW10gPSBbXVxuICBmb3JlaWduU291cmNlczogV2F0ZXJTb3VyY2VbXSB8IG51bGwgPSBudWxsXG4gIHdldENvbnRhY3RzOiBXYXRlckZvb3RwcmludFtdID0gW11cbiAgdHJhaWw6IFdjVHJhaWxEYWJbXSA9IFtdXG4gIC8qKiAoIzY4MCkgVGhlIHBlbidzIHNtb290aGVkIHNwZWVkIChweC9tcykgYW5kIGl0cyByZWNlbnQgcGVhay4gKi9cbiAgc3BlZWQgPSAwXG4gIHNwZWVkUGVhayA9IDBcbiAgc3BlZWRBdCA9IC0xXG4gIHNwZWVkVHJhdmVsID0gMFxuICBicmFrZVBpZ21lbnQgPSAwXG4gIHN1cnBsdXNQaWdtZW50ID0gMFxuICBzdXJwbHVzV2F0ZXIgPSAwXG4gIHN1cnBsdXNBdCA9IDBcbiAgLyoqICgjNTM2LCDCpzE3LjQzKSBFbmRzIHRoZSBnZXN0dXJlJ3MgRklMTSB3aXRob3V0IGVuZGluZyB0aGUgZ2VzdHVyZTogdGhlXG4gICAqICBuZXh0IGJhdGNoIHN0YXJ0cyBhIGZyZXNoIGZpbG0gb3ZlciB0aGUgd2FzaCBhcyB0aGUgc2V0dGxlIGp1c3QgbGVmdFxuICAgKiAgaXQuIENhbGxlZCBhdCBhIGNodW5rIGJvdW5kYXJ5LCBsaXZlIGFuZCBvbiByZXBsYXkgYWxpa2UsIHJpZ2h0IGFmdGVyXG4gICAqICB0aGUgY2h1bmsncyBzZXR0bGUgaGFzIGxhbmRlZCDigJQgdGhlIGZpbG0ncyBiYXNlIGlzIHJlZnJlc2hlZCBmcm9tXG4gICAqICBpbmtMb2FkIG9uIHRoZSBuZXh0IGJhdGNoIChmaWxtQnVmZmVycyksIHNvIHRoZSBzZXR0bGVkIGNodW5rIGlzIHdoYXRcbiAgICogIHRoZSByZXN0IG9mIHRoZSBzdHJva2UgcGFpbnRzIG92ZXIuIFdpdGhvdXQgdGhpcyB0aGUgbmV4dCBiYXRjaCByZWJ1aWx0XG4gICAqICBpbmtMb2FkIGFzIHRoZSBQUkUtZ2VzdHVyZSBiYXNlIHBsdXMgdGhlIHdob2xlIGZpbG0gYW5kIHRocmV3IHRoZVxuICAgKiAgY2h1bmsncyBzZXR0bGUgYXdheSDigJQgbGl2ZSBvbmx5IHNvbWV0aW1lcywgYnkgZnJhbWUgdGltaW5nLCBzbyBhIGxvbmdcbiAgICogIHN0cm9rZSBjYW1lIGJhY2sgZGlmZmVyZW50IGFmdGVyIGEgcmVsb2FkLiAqL1xuICBuZXdGaWxtKCk6IHZvaWQge1xuICAgIHRoaXMuYnJ1c2hUcmF2ZWwgPSBbXVxuICAgIHRoaXMuZ2VzdHVyZSsrXG4gIH1cblxuICAvKiogKCM1MzYsIMKnMTcuNDMpIEdpdmVzIHRoZSBmaWxtIGJ1ZmZlcnMgYmFjayBvbmNlIGEgc2V0dGxlIGhhcyBsYW5kZWQ6XG4gICAqICBmb3VyIHRpbGUtc2l6ZWQgdGV4dHVyZXMgcGVyIHRpbGUgdGhhdCBhcmUgb25seSByZWFkIGJldHdlZW4gdGhlIGZpcnN0XG4gICAqICBiYXRjaCBvZiBhIGdlc3R1cmUgYW5kIGl0cyBzZXR0bGUsIGFuZCB3ZXJlIGhlbGQgZm9yIHRoZSBsaWZlIG9mIHRoZVxuICAgKiAgd2FzaCAtIHdpdGggdGhlIHJlcGxheSBjYWNoZSdzIGZvdXIgd2FzaGVzIHRoYXQgd2FzIDM4NCBNQiBvZiBzY3JhdGNoXG4gICAqICBvbiBhIHR3by10aWxlIGxheWVyLCBhbmQgdGhlIHJlYnVpbGQgYmVoaW5kIGFuIHVuZG8gb24gdG9wIG9mIGl0LiBUaGVcbiAgICogIG5leHQgZ2VzdHVyZSAob3IgY2h1bmspIGFjcXVpcmVzIHRoZW0gYWdhaW4gZnJvbSB0aGUgcG9vbC4gKi9cbiAgcmVsZWFzZUZpbG0oZ2VzdHVyZSA9IHRoaXMuZ2VzdHVyZSk6IHZvaWQge1xuICAgIGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5fdGlsZXMudmFsdWVzKCkpIHtcbiAgICAgIC8vIE9ubHkgdGhlIGZpbG0gdGhlIGxhbmRlZCBzZXR0bGUgY29uc3VtZWQ6IGEgY2h1bmsncyBzZXR0bGUgbGFuZHNcbiAgICAgIC8vIHdoaWxlIHRoZSBuZXh0IGNodW5rJ3MgZmlsbSBpcyBiZWluZyBwYWludGVkLlxuICAgICAgaWYgKGVudHJ5LmZpbG1HZXN0dXJlICE9PSBnZXN0dXJlKSBjb250aW51ZVxuICAgICAgZm9yIChjb25zdCBiIG9mIFtlbnRyeS5zdHJva2VJbmssIGVudHJ5Lmlua0Jhc2UsIGVudHJ5LnN0cm9rZUNvbG9yLCBlbnRyeS5jb2xvckJhc2VdKSBpZiAoYikgdGhpcy5wb29sLnJlbGVhc2UoYilcbiAgICAgIGVudHJ5LnN0cm9rZUluayA9IG51bGw7IGVudHJ5Lmlua0Jhc2UgPSBudWxsOyBlbnRyeS5zdHJva2VDb2xvciA9IG51bGw7IGVudHJ5LmNvbG9yQmFzZSA9IG51bGxcbiAgICAgIGVudHJ5LmZpbG1HZXN0dXJlID0gLTFcbiAgICB9XG4gIH1cblxuICBiZWdpblN0cm9rZSgpOiB2b2lkIHtcbiAgICB0aGlzLmxhc3RLZXB0ID0gdW5kZWZpbmVkXG4gICAgdGhpcy5nZXN0dXJlKytcbiAgICB0aGlzLnR1cm5PZmZzZXQgPSBbMCwgMF1cbiAgICB0aGlzLnR1cm5EaXJlY3Rpb24gPSBudWxsXG4gICAgdGhpcy5sYW5kaW5nID0gbnVsbFxuICAgIHRoaXMuZHdlbGxNcyA9IDBcbiAgICB0aGlzLmR3ZWxsRG9uZSA9IGZhbHNlXG4gICAgdGhpcy50cmFpbCA9IFtdXG4gICAgdGhpcy5zcGVlZCA9IDBcbiAgICB0aGlzLnNwZWVkUGVhayA9IDBcbiAgICB0aGlzLnNwZWVkQXQgPSAtMVxuICAgIHRoaXMuc3BlZWRUcmF2ZWwgPSAwXG4gICAgdGhpcy5icnVzaFRyYXZlbCA9IFtdXG4gICAgdGhpcy5mb3JlaWduU291cmNlcyA9IG51bGxcbiAgICB0aGlzLndldENvbnRhY3RzID0gW11cbiAgICB0aGlzLmJyYWtlUGlnbWVudCA9IDBcbiAgICB0aGlzLnN1cnBsdXNQaWdtZW50ID0gMFxuICAgIHRoaXMuc3VycGx1c1dhdGVyID0gMFxuICAgIHRoaXMuc3VycGx1c0F0ID0gMFxuICAgIHRoaXMuX3dhdGVyVXNlZCA9IDBcbiAgICAvLyAoIzUzNikgSW5jbHVkaW5nIGV2ZXJ5dGhpbmcgdGhlIGJydXNoIGRyYW5rIGZyb20gdGhlIHBhcGVyIGxhc3Qgc3Ryb2tlLlxuICAgIC8vIFRoZSBleGNoYW5nZSBpcyBpbnRyYS1zdHJva2UgYnkgZGVjaXNpb24g4oCUIHNlZSB3YXRlcmNvbG9yV2F0ZXJDbG9jaydzIG93blxuICAgIC8vIG5vdGUgb24gd2h5IHRoZSBicnVzaCBpcyBub3QgYWxsb3dlZCBoaWRkZW4gc3RhdGUgdGhhdCBvdXRsaXZlcyBhIG1hcmsuXG4gICAgdGhpcy5fcGlnbWVudFVzZWQgPSAwXG4gICAgLy8gKCM1MzYsIMKnMTcuMjMpIFRoZSBmaW5pc2ggY29udGV4dCBpcyB0aGUgR0VTVFVSRSdzOiBpdHMgYm91bmRzLCBpdHNcbiAgICAvLyBsYW5kaW5nIHdldG5lc3MsIGl0cyByYWRpdXMuIEl0IHVzZWQgdG8gb3V0bGl2ZSB0aGUgc3Ryb2tlLCBzbyBldmVyeVxuICAgIC8vIHBlbi11cCBvZiBhIHdhc2ggcmVjb21wb3NpdGVkIHRoZSB1bmlvbiBvZiBldmVyeSBzdHJva2Ugc28gZmFyIGFuZFxuICAgIC8vIHJlYWQgdGhlIGZpcnN0IHN0cm9rZSdzIGxhbmRpbmcgZm9yIHRoZSBibG9vbSBvZiB0aGUgbGFzdC5cbiAgICB0aGlzLl9maW5pc2ggPSBudWxsXG4gIH1cblxuICAvKiogYG5lZWRzSW5rYCBmYWxzZSBza2lwcyB0aGUgdGhpcmQgYnVmZmVyIGVudGlyZWx5ICgjNDU0KTogYSBjb3ZlcmluZyxcbiAgICogIHNvdXJjZS1vdmVyIGluayBoYXMgbm8gcGVyLXBpeGVsIHBpZ21lbnQgcXVhbnRpdHkgZm9yIHRoZSBjb21wb3NpdGUgdG9cbiAgICogIHJlYWQsIHNvIGFsbG9jYXRpbmcgYW5kIGNsZWFyaW5nIG9uZSBwZXIgdGlsZSB3b3VsZCBiZSBhIGJ1ZmZlciBhbmQgdHdvXG4gICAqICBkcmF3IGNhbGxzIHNwZW50IG9uIGEgdmFsdWUgbm90aGluZyBzYW1wbGVzLiBTZWUgUmliYm9uUHJvZmlsZS5pbmsuICovXG4gIGNvbnN0cnVjdG9yKHBvb2w6IFJpYmJvblNjcmF0Y2hQb29sLCBuZWVkc0luayA9IHRydWUsIG5lZWRzQ29sb3IgPSBmYWxzZSkge1xuICAgIHRoaXMucG9vbCA9IHBvb2xcbiAgICB0aGlzLm5lZWRzSW5rID0gbmVlZHNJbmtcbiAgICB0aGlzLm5lZWRzQ29sb3IgPSBuZWVkc0NvbG9yXG4gIH1cblxuICAvKiogS2V5ZWQgYnkgdGhlIHRpbGUncyBvd24gQWNjdW11bGF0aW9uQnVmZmVyIGlkZW50aXR5IOKAlCBzdGFibGUgYWNyb3NzXG4gICAqICByZXBlYXRlZCByZXNvbHZlRm9yUGFpbnQgY2FsbHMgZm9yIHRoZSBzYW1lIHJlc2lkZW50IHRpbGUgKHNlZVxuICAgKiAgVGlsZWRMYXllckJ1ZmZlci5nZXRPckNyZWF0ZVRpbGUpLCBzbyBubyB0aWxlLWNvb3JkaW5hdGUgYm9va2tlZXBpbmcgaXNcbiAgICogIG5lZWRlZCBoZXJlLiAnbmVhcmVzdCcgZmlsdGVyaW5nOiBhbGwgdGhyZWUgYnVmZmVycyBhcmUgYWx3YXlzIHNhbXBsZWRcbiAgICogIDE6MSAoc2FtZSBzaXplIGFuZCBwaXhlbCBhbGlnbm1lbnQgYXMgdGhlIHRpbGUgdGhleSBtaXJyb3Ig4oCUIHNlZVxuICAgKiAgREFCX0ZSQUcncyBvd24gdV9vcmlnaW5hbC91X3N0cm9rZUNvdmVyYWdlL3VfaW5rTG9hZCBjb21tZW50KSwgc29cbiAgICogICdsaW5lYXInIHdvdWxkIGJ1eSBub3RoaW5nIGFuZCAnbmVhcmVzdCcga2VlcHMgdGhpcyBkZXRlcm1pbmlzdGljXG4gICAqICBhY3Jvc3MgR1BVIHZlbmRvcnMsIHNhbWUgcmVhc29uaW5nIGV2ZXJ5IG90aGVyIHNjcmF0Y2gtdGV4dHVyZSBwb29sIGluXG4gICAqICB0aGlzIGZpbGUgYWxyZWFkeSBmb2xsb3dzIChwYXBlciBncmFpbidzIG93biBoYXJkLXdvbiBsZXNzb24g4oCUIHNlZVxuICAgKiAgLmNsYXVkZS9ydWxlcy5tZCkuXG4gICAqXG4gICAqICB2MSBhY2NlcHRlZCBnYXA6IGlmIHRoaXMgdGlsZSBnZXRzIGV2aWN0ZWQgKFRpbGVkTGF5ZXJCdWZmZXIncyBtZW1vcnlcbiAgICogIGJ1ZGdldCkgbWlkLXN0cm9rZSBhbmQgbGF0ZXIgcmVjb3ZlcmVkIGFzIGEgKm5ldyogQWNjdW11bGF0aW9uQnVmZmVyXG4gICAqICBpbnN0YW5jZSwgdGhpcyBtYXAgd29uJ3QgcmVjb2duaXplIGl0IGFzIHRoZSBzYW1lIHRpbGUgYW5kIHdpbGxcbiAgICogIHNpbGVudGx5IHJlLXNuYXBzaG90IOKAlCBhIGZyZXNoIChzdGlsbCBjb3JyZWN0LCBqdXN0IG5vdCBtYXhpbWFsbHlcbiAgICogIFwib3JpZ2luYWxcIikgYmFzZSByYXRoZXIgdGhhbiBhIGNyYXNoIG9yIGEgd3JvbmcgcmVzdWx0LiBOb3Qgd29ydGhcbiAgICogIGd1YXJkaW5nIGFnYWluc3QgZm9yIHYxOiBhIHNpbmdsZSBtYXJrZXIgZ2VzdHVyZSBzcGFucyB2ZXJ5IGZldyB0aWxlcyxcbiAgICogIG5vd2hlcmUgbmVhciB3aGF0IGl0J2QgdGFrZSB0byBmb3JjZSBhbiBldmljdGlvbiBvbiBpdHMgb3duLiAqL1xuICAvKiogKMKnMTcuMjgpIFRoZSBnZXN0dXJlJ3MgZmlsbSBidWZmZXJzIGZvciBhIHRpbGUsIG1hZGUgb3IgcmVmcmVzaGVkIGZvclxuICAgKiAgdGhlIGN1cnJlbnQgZ2VzdHVyZTogdGhlIGJhc2UgaXMgdGhlIGRlcG9zaXQgYXMgaXQgc3RhbmRzIG5vdywgdGhlIGZpbG1cbiAgICogIHN0YXJ0cyBlbXB0eS4gKi9cbiAgZmlsbUJ1ZmZlcnModGlsZTogQWNjdW11bGF0aW9uQnVmZmVyKTogeyBzdHJva2VJbms6IEFjY3VtdWxhdGlvbkJ1ZmZlcjsgaW5rQmFzZTogQWNjdW11bGF0aW9uQnVmZmVyOyBzdHJva2VDb2xvcjogQWNjdW11bGF0aW9uQnVmZmVyIHwgbnVsbDsgY29sb3JCYXNlOiBBY2N1bXVsYXRpb25CdWZmZXIgfCBudWxsIH0gfCBudWxsIHtcbiAgICBjb25zdCBlbnRyeSA9IHRoaXMuZ2V0T3JDcmVhdGUodGlsZSlcbiAgICBpZiAoIWVudHJ5Lmlua0xvYWQpIHJldHVybiBudWxsXG4gICAgaWYgKGVudHJ5LmZpbG1HZXN0dXJlICE9PSB0aGlzLmdlc3R1cmUpIHtcbiAgICAgIGVudHJ5LnN0cm9rZUluayA/Pz0gdGhpcy5wb29sLmFjcXVpcmUodGlsZS53aWR0aCwgdGlsZS5oZWlnaHQpXG4gICAgICBlbnRyeS5pbmtCYXNlID8/PSB0aGlzLnBvb2wuYWNxdWlyZSh0aWxlLndpZHRoLCB0aWxlLmhlaWdodClcbiAgICAgIGVudHJ5LnN0cm9rZUluay5jbGVhcigpXG4gICAgICBlbnRyeS5pbmtMb2FkLmNvcHlUbyhlbnRyeS5pbmtCYXNlKVxuICAgICAgaWYgKGVudHJ5Lmlua0NvbG9yKSB7XG4gICAgICAgIGVudHJ5LnN0cm9rZUNvbG9yID8/PSB0aGlzLnBvb2wuYWNxdWlyZSh0aWxlLndpZHRoLCB0aWxlLmhlaWdodClcbiAgICAgICAgZW50cnkuY29sb3JCYXNlID8/PSB0aGlzLnBvb2wuYWNxdWlyZSh0aWxlLndpZHRoLCB0aWxlLmhlaWdodClcbiAgICAgICAgZW50cnkuc3Ryb2tlQ29sb3IuY2xlYXIoKVxuICAgICAgICBlbnRyeS5pbmtDb2xvci5jb3B5VG8oZW50cnkuY29sb3JCYXNlKVxuICAgICAgfVxuICAgICAgZW50cnkuZmlsbUdlc3R1cmUgPSB0aGlzLmdlc3R1cmVcbiAgICB9XG4gICAgcmV0dXJuIHsgc3Ryb2tlSW5rOiBlbnRyeS5zdHJva2VJbmshLCBpbmtCYXNlOiBlbnRyeS5pbmtCYXNlISwgc3Ryb2tlQ29sb3I6IGVudHJ5LnN0cm9rZUNvbG9yLCBjb2xvckJhc2U6IGVudHJ5LmNvbG9yQmFzZSB9XG4gIH1cblxuICBnZXRPckNyZWF0ZSh0aWxlOiBBY2N1bXVsYXRpb25CdWZmZXIpOiBSaWJib25UaWxlU2NyYXRjaCB7XG4gICAgbGV0IGVudHJ5ID0gdGhpcy5fdGlsZXMuZ2V0KHRpbGUpXG4gICAgaWYgKCFlbnRyeSkge1xuICAgICAgLy8gKCMzODUpIEZyb20gdGhlIHBvb2wsIGFuZCBldmVyeSBvbmUgb2YgdGhlbSBpcyBmdWxseSB3cml0dGVuIGJlZm9yZSBpdFxuICAgICAgLy8gaXMgcmVhZCDigJQgY29weVRvIG92ZXJ3cml0ZXMgYG9yaWdpbmFsYCBvdXRyaWdodCwgdGhlIG90aGVycyBhcmVcbiAgICAgIC8vIGNsZWFyZWQg4oCUIHNvIGEgcmV1c2VkIGJ1ZmZlciBjYXJyaWVzIG5vdGhpbmcgb2Ygd2hhdGV2ZXIgZ2VzdHVyZSBoYWRcbiAgICAgIC8vIGl0IGxhc3QuXG4gICAgICBjb25zdCBvcmlnaW5hbCA9IHRoaXMucG9vbC5hY3F1aXJlKHRpbGUud2lkdGgsIHRpbGUuaGVpZ2h0KVxuICAgICAgdGlsZS5jb3B5VG8ob3JpZ2luYWwpXG4gICAgICBjb25zdCBjb3ZlcmFnZSA9IHRoaXMucG9vbC5hY3F1aXJlKHRpbGUud2lkdGgsIHRpbGUuaGVpZ2h0KVxuICAgICAgY292ZXJhZ2UuY2xlYXIoKVxuICAgICAgbGV0IGlua0xvYWQ6IEFjY3VtdWxhdGlvbkJ1ZmZlciB8IG51bGwgPSBudWxsXG4gICAgICBsZXQgaW5rQ29sb3I6IEFjY3VtdWxhdGlvbkJ1ZmZlciB8IG51bGwgPSBudWxsXG4gICAgICBpZiAodGhpcy5uZWVkc0luaykge1xuICAgICAgICBpbmtMb2FkID0gdGhpcy5wb29sLmFjcXVpcmUodGlsZS53aWR0aCwgdGlsZS5oZWlnaHQpXG4gICAgICAgIGlua0xvYWQuY2xlYXIoKVxuICAgICAgICBpZiAodGhpcy5uZWVkc0NvbG9yKSB7XG4gICAgICAgICAgaW5rQ29sb3IgPSB0aGlzLnBvb2wuYWNxdWlyZSh0aWxlLndpZHRoLCB0aWxlLmhlaWdodClcbiAgICAgICAgICBpbmtDb2xvci5jbGVhcigpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIFRoZSBzZXR0bGVkIHBhaXIgaXMgdGFrZW4gb24gdGhlIGZpcnN0IHNldHRsZSwgYnkgdGhlIHBhc3MgdGhhdCBuZWVkc1xuICAgICAgLy8gaXQg4oCUIGEgbWFya2VyIGdlc3R1cmUgbmV2ZXIgZG9lcywgYW5kIHRocmVlIGJ1ZmZlcnMgYSB0aWxlIHdhcyBhbHJlYWR5XG4gICAgICAvLyB0aGUgY2h1cm4gIzM4NSBpcyBhYm91dC5cbiAgICAgIGVudHJ5ID0geyBvcmlnaW5hbCwgY292ZXJhZ2UsIGlua0xvYWQsIGlua1NldHRsZWQ6IG51bGwsIGlua0NvbG9yLCBjb2xvclNldHRsZWQ6IG51bGwsIHN0cm9rZUluazogbnVsbCwgaW5rQmFzZTogbnVsbCwgc3Ryb2tlQ29sb3I6IG51bGwsIGNvbG9yQmFzZTogbnVsbCwgZmlsbUdlc3R1cmU6IC0xLCBpbmtEcnk6IG51bGwsIGNvbG9yRHJ5OiBudWxsIH1cbiAgICAgIHRoaXMuX3RpbGVzLnNldCh0aWxlLCBlbnRyeSlcbiAgICB9XG4gICAgcmV0dXJuIGVudHJ5XG4gIH1cblxuICAvKiogRW5kcyB0aGlzIGdlc3R1cmUncyB1c2Ugb2YgaXRzIGJ1ZmZlcnMuIE5hbWVkIGFzIGl0IGFsd2F5cyB3YXMsIGFuZCBpdFxuICAgKiAgc3RpbGwgbWVhbnMgXCJ0aGlzIHNjcmF0Y2ggaXMgZmluaXNoZWQgd2l0aFwiIOKAlCB3aGF0IGNoYW5nZWQgKCMzODUpIGlzIHRoYXRcbiAgICogIHRoZSBidWZmZXJzIGdvIGJhY2sgdG8gdGhlIHBvb2wgaW5zdGVhZCBvZiB0byB0aGUgZHJpdmVyLiAqL1xuICBkZXN0cm95KCk6IHZvaWQge1xuICAgIHRoaXMuX3N0b3JhZ2VCb3VuZHMgPSBudWxsXG4gICAgdGhpcy5fd2F0ZXJVc2VkID0gMFxuICAgIHRoaXMuX3BpZ21lbnRVc2VkID0gMFxuICAgIHRoaXMuZGlmZnVzZVBlbmRpbmcgPSBmYWxzZVxuICAgIHRoaXMucGVuZGluZ0NvbXBvc2l0ZS5jbGVhcigpXG4gICAgdGhpcy5fY29tcG9zaXRlID0gbnVsbFxuICAgIHRoaXMuX2RhYlNwYWNpbmcgPSAwXG4gICAgdGhpcy5fYnJ1c2hFZGdlUHggPSAwXG4gICAgdGhpcy5fZGlyU2V0ID0gZmFsc2VcbiAgICB0aGlzLl9kaXIgPSBbMSwgMF1cbiAgICB0aGlzLl9maW5pc2ggPSBudWxsXG4gICAgZm9yIChjb25zdCB7IG9yaWdpbmFsLCBjb3ZlcmFnZSwgaW5rTG9hZCwgaW5rU2V0dGxlZCwgaW5rQ29sb3IsIGNvbG9yU2V0dGxlZCwgc3Ryb2tlSW5rLCBpbmtCYXNlLCBzdHJva2VDb2xvciwgY29sb3JCYXNlLCBpbmtEcnksIGNvbG9yRHJ5IH0gb2YgdGhpcy5fdGlsZXMudmFsdWVzKCkpIHtcbiAgICAgIGZvciAoY29uc3QgYiBvZiBbc3Ryb2tlSW5rLCBpbmtCYXNlLCBzdHJva2VDb2xvciwgY29sb3JCYXNlLCBpbmtEcnksIGNvbG9yRHJ5XSkgaWYgKGIpIHRoaXMucG9vbC5yZWxlYXNlKGIpXG4gICAgICB0aGlzLnBvb2wucmVsZWFzZShvcmlnaW5hbCk7IHRoaXMucG9vbC5yZWxlYXNlKGNvdmVyYWdlKVxuICAgICAgaWYgKGlua0xvYWQpIHRoaXMucG9vbC5yZWxlYXNlKGlua0xvYWQpXG4gICAgICBpZiAoaW5rU2V0dGxlZCkgdGhpcy5wb29sLnJlbGVhc2UoaW5rU2V0dGxlZClcbiAgICAgIGlmIChpbmtDb2xvcikgdGhpcy5wb29sLnJlbGVhc2UoaW5rQ29sb3IpXG4gICAgICBpZiAoY29sb3JTZXR0bGVkKSB0aGlzLnBvb2wucmVsZWFzZShjb2xvclNldHRsZWQpXG4gICAgfVxuICAgIHRoaXMuX3RpbGVzLmNsZWFyKClcbiAgfVxuXG4gIC8qKiBDb250ZXh0IGxvc3M6IHRoZSBHTCBvYmplY3RzIGFyZSBhbHJlYWR5IGRlYWQsIHNvIG5laXRoZXIgcmVsZWFzZSBub3JcbiAgICogIGRlc3Ryb3kgaXMgbWVhbmluZ2Z1bCDigJQganVzdCBsZXQgZ28gb2YgdGhlbS4gKi9cbiAgZm9yZ2V0KCk6IHZvaWQge1xuICAgIHRoaXMuX3RpbGVzLmNsZWFyKClcbiAgICB0aGlzLnBlbmRpbmdDb21wb3NpdGUuY2xlYXIoKVxuICB9XG5cbiAgLyoqICgjNTM2LCDCpzE3LjIyKSBXaGV0aGVyIHRoaXMgc2NyYXRjaCBzdGlsbCBob2xkcyBpdHMgdGlsZXMg4oCUIGZhbHNlIG9uY2VcbiAgICogIGRlc3Ryb3llZCBvciBmb3Jnb3R0ZW4sIHdoaWNoIGlzIGhvdyBhIHNldHRsZSBpbiBmbGlnaHQgbGVhcm5zIHRoYXQgdGhlXG4gICAqICB3YXNoIGl0IHdhcyBzZXR0bGluZyBpcyBnb25lLiAqL1xuICBnZXQgbGl2ZSgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5fdGlsZXMuc2l6ZSA+IDBcbiAgfVxuXG4gIC8qKiAoIzUzNiwgwqcxNy41NikgVGhlIHdhc2ggYXMgdGhlIG5leHQgb3BlcmF0aW9uIG9mIGl0IHdpbGwgZmluZCBpdCwgYXQgYW5cbiAgICogIG9wZXJhdGlvbiBib3VuZGFyeTogZXZlcnkgdGV4dHVyZSB0aGF0IG91dGxpdmVzIGEgZ2VzdHVyZSdzIGZpbG0sIGNvcGllZFxuICAgKiAgaW50byBidWZmZXJzIG9mIGl0cyBvd24gKHRoZSBjaGVja3BvaW50IGtlZXBzIHRoZW07IHRoaXMgc2NyYXRjaCBnb2VzIG9uXG4gICAqICBiZWluZyBwYWludGVkKSwgYW5kIGV2ZXJ5IG51bWJlciB0aGUgbmV4dCBvcGVyYXRpb24gcmVhZHMuIFRoZSBmaWxtIGlzXG4gICAqICBub3QgdGFrZW4g4oCUIGF0IGEgYm91bmRhcnkgaXQgaXMgcmVsZWFzZWQgb3IgYWJvdXQgdG8gYmUgcmVmcmVzaGVkIGZvciBhXG4gICAqICBuZXcgZ2VzdHVyZSAoZmlsbUJ1ZmZlcnMpLCBzbyB0aGUgcmVzdG9yZWQgdGlsZSBzdGFydHMgd2l0aG91dCBvbmUuXG4gICAqICBgb3JpZ2luT2ZgIG5hbWVzIGVhY2ggdGlsZSBieSBpdHMgcGxhY2Ugb24gdGhlIHNoZWV0OiB0aGUgcmVwbGF5IHRoYXRcbiAgICogIHJlc3RvcmVzIHRoaXMgcGFpbnRzIGludG8gYW5vdGhlciBidWZmZXIuICovXG4gIHNuYXBzaG90KGdsOiBXZWJHTFJlbmRlcmluZ0NvbnRleHQsIG9yaWdpbk9mOiAodGlsZTogQWNjdW11bGF0aW9uQnVmZmVyKSA9PiB7IG9yaWdpblg6IG51bWJlcjsgb3JpZ2luWTogbnVtYmVyIH0gfCBudWxsKTogU2NyYXRjaFNuYXBzaG90IHwgbnVsbCB7XG4gICAgY29uc3QgdGlsZXM6IFNjcmF0Y2hTbmFwc2hvdFsndGlsZXMnXSA9IFtdXG4gICAgZm9yIChjb25zdCBbdGlsZSwgZW50cnldIG9mIHRoaXMuX3RpbGVzKSB7XG4gICAgICBjb25zdCBhdCA9IG9yaWdpbk9mKHRpbGUpXG4gICAgICBpZiAoIWF0KSByZXR1cm4gbnVsbFxuICAgICAgY29uc3QgYnVmczogU2NyYXRjaFNuYXBzaG90Wyd0aWxlcyddW251bWJlcl1bJ2J1ZnMnXSA9IHt9XG4gICAgICBmb3IgKGNvbnN0IGsgb2YgU05BUFNIT1RfVElMRV9CVUZGRVJTKSB7XG4gICAgICAgIGNvbnN0IGIgPSBlbnRyeVtrXVxuICAgICAgICBpZiAoIWIpIGNvbnRpbnVlXG4gICAgICAgIGNvbnN0IGNvcHkgPSBuZXcgQWNjdW11bGF0aW9uQnVmZmVyKGdsLCBiLndpZHRoLCBiLmhlaWdodCwgJ25lYXJlc3QnKVxuICAgICAgICBiLmNvcHlUbyhjb3B5KVxuICAgICAgICBidWZzW2tdID0gY29weVxuICAgICAgfVxuICAgICAgdGlsZXMucHVzaCh7IC4uLmF0LCB3aWR0aDogdGlsZS53aWR0aCwgaGVpZ2h0OiB0aWxlLmhlaWdodCwgYnVmcyB9KVxuICAgIH1cbiAgICByZXR1cm4geyAuLi50aGlzLl9zY2FsYXJzKCksIHRpbGVzIH1cbiAgfVxuXG4gIC8qKiBFdmVyeSBudW1iZXIgdGhlIG5leHQgb3BlcmF0aW9uIG9mIHRoaXMgd2FzaCByZWFkcyAtIHNlZSBzbmFwc2hvdC4gKi9cbiAgcHJpdmF0ZSBfc2NhbGFycygpOiBTY3JhdGNoU2NhbGFycyB7XG4gICAgcmV0dXJuIHtcbiAgICAgIG5lZWRzSW5rOiB0aGlzLm5lZWRzSW5rLCBuZWVkc0NvbG9yOiB0aGlzLm5lZWRzQ29sb3IsXG4gICAgICBzdG9yYWdlQm91bmRzOiB0aGlzLl9zdG9yYWdlQm91bmRzID8geyAuLi50aGlzLl9zdG9yYWdlQm91bmRzIH0gOiB0aGlzLl9zdG9yYWdlQm91bmRzLFxuICAgICAgcGFpbnRzOiBbLi4udGhpcy5wYWludHNdLCB3YXRlclVzZWQ6IHRoaXMuX3dhdGVyVXNlZCwgcGlnbWVudFVzZWQ6IHRoaXMuX3BpZ21lbnRVc2VkLFxuICAgICAgY29tcG9zaXRlOiB0aGlzLl9jb21wb3NpdGUgPyB7IC4uLnRoaXMuX2NvbXBvc2l0ZSwgZmllbGRTZWVkOiBbLi4udGhpcy5fY29tcG9zaXRlLmZpZWxkU2VlZF0gfSA6IG51bGwsXG4gICAgICBkYWJTcGFjaW5nOiB0aGlzLl9kYWJTcGFjaW5nLCBicnVzaEVkZ2VQeDogdGhpcy5fYnJ1c2hFZGdlUHgsIGRpcjogWy4uLnRoaXMuX2Rpcl0sIGRpclNldDogdGhpcy5fZGlyU2V0LFxuICAgICAgZmluaXNoOiB0aGlzLl9maW5pc2ggPyB7IC4uLnRoaXMuX2ZpbmlzaCwgYm91bmRzOiB7IC4uLnRoaXMuX2ZpbmlzaC5ib3VuZHMgfSwgZmllbGRTZWVkOiBbLi4udGhpcy5fZmluaXNoLmZpZWxkU2VlZF0gfSA6IG51bGwsXG4gICAgICBkcnlDdHg6IHRoaXMuZHJ5Q3R4ID8geyAuLi50aGlzLmRyeUN0eCwgYm91bmRzOiB7IC4uLnRoaXMuZHJ5Q3R4LmJvdW5kcyB9LCBmaWVsZFNlZWQ6IFsuLi50aGlzLmRyeUN0eC5maWVsZFNlZWRdIH0gOiBudWxsLFxuICAgICAgbGFzdEtlcHQ6IHRoaXMubGFzdEtlcHQgPyB7IC4uLnRoaXMubGFzdEtlcHQgfSA6IHVuZGVmaW5lZCwgZ2VzdHVyZTogdGhpcy5nZXN0dXJlLFxuICAgICAgbGFuZGluZzogdGhpcy5sYW5kaW5nID8geyAuLi50aGlzLmxhbmRpbmcgfSA6IG51bGwsIGR3ZWxsTXM6IHRoaXMuZHdlbGxNcywgZHdlbGxEb25lOiB0aGlzLmR3ZWxsRG9uZSxcbiAgICAgIHR1cm5PZmZzZXQ6IFsuLi50aGlzLnR1cm5PZmZzZXRdLCB0dXJuRGlyZWN0aW9uOiB0aGlzLnR1cm5EaXJlY3Rpb24gPyBbLi4udGhpcy50dXJuRGlyZWN0aW9uXSA6IG51bGwsIGJydXNoVHJhdmVsOiB0aGlzLmJydXNoVHJhdmVsLm1hcChkID0+ICh7IC4uLmQgfSkpLCBmb3JlaWduU291cmNlczogdGhpcy5mb3JlaWduU291cmNlcywgd2V0Q29udGFjdHM6IHRoaXMud2V0Q29udGFjdHMubWFwKGQgPT4gKHsgLi4uZCB9KSksXG4gICAgICB0cmFpbDogdGhpcy50cmFpbC5tYXAoZCA9PiAoeyAuLi5kIH0pKSwgc3BlZWQ6IHRoaXMuc3BlZWQsIHNwZWVkUGVhazogdGhpcy5zcGVlZFBlYWssIHNwZWVkQXQ6IHRoaXMuc3BlZWRBdCwgc3BlZWRUcmF2ZWw6IHRoaXMuc3BlZWRUcmF2ZWwsIGJyYWtlUGlnbWVudDogdGhpcy5icmFrZVBpZ21lbnQsIHN1cnBsdXNQaWdtZW50OiB0aGlzLnN1cnBsdXNQaWdtZW50LCBzdXJwbHVzV2F0ZXI6IHRoaXMuc3VycGx1c1dhdGVyLCBzdXJwbHVzQXQ6IHRoaXMuc3VycGx1c0F0LFxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgX2FwcGx5U2NhbGFycyhzbmFwOiBTY3JhdGNoU2NhbGFycywgdGFyZ2V0OiBJTGF5ZXJCdWZmZXIpOiB2b2lkIHtcbiAgICB0aGlzLl9zdG9yYWdlQm91bmRzID0gc25hcC5zdG9yYWdlQm91bmRzID8geyAuLi5zbmFwLnN0b3JhZ2VCb3VuZHMgfSA6IHNuYXAuc3RvcmFnZUJvdW5kc1xuICAgIGZvciAoY29uc3QgcCBvZiBzbmFwLnBhaW50cykgdGhpcy5wYWludHMuYWRkKHApXG4gICAgdGhpcy5fd2F0ZXJVc2VkID0gc25hcC53YXRlclVzZWRcbiAgICB0aGlzLl9waWdtZW50VXNlZCA9IHNuYXAucGlnbWVudFVzZWRcbiAgICB0aGlzLl9jb21wb3NpdGUgPSBzbmFwLmNvbXBvc2l0ZSA/IHsgLi4uc25hcC5jb21wb3NpdGUsIGZpZWxkU2VlZDogWy4uLnNuYXAuY29tcG9zaXRlLmZpZWxkU2VlZF0gfSA6IG51bGxcbiAgICB0aGlzLl9kYWJTcGFjaW5nID0gc25hcC5kYWJTcGFjaW5nXG4gICAgdGhpcy5fYnJ1c2hFZGdlUHggPSBzbmFwLmJydXNoRWRnZVB4XG4gICAgdGhpcy5fZGlyID0gW3NuYXAuZGlyWzBdLCBzbmFwLmRpclsxXV1cbiAgICB0aGlzLl9kaXJTZXQgPSBzbmFwLmRpclNldFxuICAgIHRoaXMuX2ZpbmlzaCA9IHNuYXAuZmluaXNoID8geyAuLi5zbmFwLmZpbmlzaCwgdGFyZ2V0LCBib3VuZHM6IHsgLi4uc25hcC5maW5pc2guYm91bmRzIH0sIGZpZWxkU2VlZDogWy4uLnNuYXAuZmluaXNoLmZpZWxkU2VlZF0gfSA6IG51bGxcbiAgICB0aGlzLmRyeUN0eCA9IHNuYXAuZHJ5Q3R4ID8geyAuLi5zbmFwLmRyeUN0eCwgdGFyZ2V0LCBib3VuZHM6IHsgLi4uc25hcC5kcnlDdHguYm91bmRzIH0sIGZpZWxkU2VlZDogWy4uLnNuYXAuZHJ5Q3R4LmZpZWxkU2VlZF0gfSA6IG51bGxcbiAgICB0aGlzLmxhc3RLZXB0ID0gc25hcC5sYXN0S2VwdCA/IHsgLi4uc25hcC5sYXN0S2VwdCB9IDogdW5kZWZpbmVkXG4gICAgdGhpcy5nZXN0dXJlID0gc25hcC5nZXN0dXJlXG4gICAgdGhpcy5sYW5kaW5nID0gc25hcC5sYW5kaW5nID8geyAuLi5zbmFwLmxhbmRpbmcgfSA6IG51bGxcbiAgICB0aGlzLmR3ZWxsTXMgPSBzbmFwLmR3ZWxsTXNcbiAgICB0aGlzLmR3ZWxsRG9uZSA9IHNuYXAuZHdlbGxEb25lXG4gICAgdGhpcy50dXJuT2Zmc2V0ID0gWy4uLnNuYXAudHVybk9mZnNldF1cbiAgICB0aGlzLnR1cm5EaXJlY3Rpb24gPSBzbmFwLnR1cm5EaXJlY3Rpb24gPyBbLi4uc25hcC50dXJuRGlyZWN0aW9uXSA6IG51bGxcbiAgICB0aGlzLmJydXNoVHJhdmVsID0gc25hcC5icnVzaFRyYXZlbC5tYXAoZCA9PiAoeyAuLi5kIH0pKVxuICAgIHRoaXMuZm9yZWlnblNvdXJjZXMgPSBzbmFwLmZvcmVpZ25Tb3VyY2VzXG4gICAgdGhpcy53ZXRDb250YWN0cyA9IHNuYXAud2V0Q29udGFjdHMubWFwKGQgPT4gKHsgLi4uZCB9KSlcbiAgICB0aGlzLnRyYWlsID0gc25hcC50cmFpbC5tYXAoZCA9PiAoeyAuLi5kIH0pKVxuICAgIHRoaXMuc3BlZWQgPSBzbmFwLnNwZWVkXG4gICAgdGhpcy5zcGVlZFBlYWsgPSBzbmFwLnNwZWVkUGVha1xuICAgIHRoaXMuc3BlZWRBdCA9IHNuYXAuc3BlZWRBdFxuICAgIHRoaXMuc3BlZWRUcmF2ZWwgPSBzbmFwLnNwZWVkVHJhdmVsXG4gICAgdGhpcy5icmFrZVBpZ21lbnQgPSBzbmFwLmJyYWtlUGlnbWVudFxuICAgIHRoaXMuc3VycGx1c1BpZ21lbnQgPSBzbmFwLnN1cnBsdXNQaWdtZW50XG4gICAgdGhpcy5zdXJwbHVzV2F0ZXIgPSBzbmFwLnN1cnBsdXNXYXRlclxuICAgIHRoaXMuc3VycGx1c0F0ID0gc25hcC5zdXJwbHVzQXRcbiAgfVxuXG4gIC8qKiAjNzAyOiBwYXJrIGEgcmVzdGluZyB3YXNoIGluIGNvbXBhY3QgR1BVIGJ1ZmZlcnMuIENQVSByZWFkYmFjayB3YWl0c1xuICAgKiBmb3IgdGhlIHdob2xlIGNvbnRleHQncyBxdWV1ZSwgZXZlbiBmb3IgMXgxLCBzbyBpdCBjYW5ub3QgYmUgYSBiYWNrZ3JvdW5kXG4gICAqIG1lbW9yeSBvcGVyYXRpb24uIEtlZXAgb3JpZ2luYWwgd2hvbGU6IGEgY29udGludWF0aW9uIG1heSBlbnRlciBhIG5ld1xuICAgKiBhcmVhIHdob3NlIHByZS13YXNoIHBpY3R1cmUgbXVzdCBzdGlsbCBiZSB0aGUgc2FtZS4gT3RoZXIgYnVmZmVycyBzdGFydFxuICAgKiBjbGVhciBhbmQgb25seSByZWNlaXZlIHdyaXRlcyBpbnNpZGUgc3RvcmFnZUJvdW5kcy4gR1BVIHN1Yi1yZWN0IGNvcGllc1xuICAgKiBwcmVzZXJ2ZSBldmVyeSBieXRlOyB1bnBhcmsgY2xlYXJzIHRoZSBtaXNzaW5nIGV4dGVyaW9yLiAqL1xuICBzcGlsbChvcmlnaW5PZjogKHRpbGU6IEFjY3VtdWxhdGlvbkJ1ZmZlcikgPT4geyBvcmlnaW5YOiBudW1iZXI7IG9yaWdpblk6IG51bWJlciB9IHwgbnVsbCk6IFNwaWxsZWRTY3JhdGNoIHwgbnVsbCB7XG4gICAgY29uc3Qgd29yayA9IHRoaXMuc3BpbGxXb3JrKG9yaWdpbk9mKVxuICAgIGxldCByID0gd29yay5uZXh0KClcbiAgICB3aGlsZSAoIXIuZG9uZSkgciA9IHdvcmsubmV4dCgpXG4gICAgcmV0dXJuIHIudmFsdWVcbiAgfVxuXG4gICpzcGlsbFdvcmsob3JpZ2luT2Y6ICh0aWxlOiBBY2N1bXVsYXRpb25CdWZmZXIpID0+IHsgb3JpZ2luWDogbnVtYmVyOyBvcmlnaW5ZOiBudW1iZXIgfSB8IG51bGwpOiBHZW5lcmF0b3I8dm9pZCwgU3BpbGxlZFNjcmF0Y2ggfCBudWxsLCB2b2lkPiB7XG4gICAgaWYgKHRoaXMuZGlmZnVzZVBlbmRpbmcgfHwgdGhpcy5wZW5kaW5nQ29tcG9zaXRlLnNpemUpIHJldHVybiBudWxsXG4gICAgY29uc3QgdGlsZXM6IFNwaWxsZWRTY3JhdGNoWyd0aWxlcyddID0gW11cbiAgICBjb25zdCBvd25lZCA9IG5ldyBTZXQ8QWNjdW11bGF0aW9uQnVmZmVyPigpLCBtb3ZlZCA9IG5ldyBTZXQ8QWNjdW11bGF0aW9uQnVmZmVyPigpXG4gICAgbGV0IGJ5dGVzID0gMCwgY29tbWl0dGVkID0gZmFsc2VcbiAgICBjb25zdCB0YWtlQnVmZmVyID0gKGI6IEFjY3VtdWxhdGlvbkJ1ZmZlcik6IHZvaWQgPT4geyBvd25lZC5kZWxldGUoYikgfVxuICAgIGNvbnN0IHJlbGVhc2VCdWZmZXIgPSAoYjogQWNjdW11bGF0aW9uQnVmZmVyKTogdm9pZCA9PiB7IGlmIChvd25lZC5kZWxldGUoYikpIHRoaXMucG9vbC5yZWxlYXNlKGIpIH1cbiAgICBjb25zdCBkaXNwb3NlID0gKCk6IHZvaWQgPT4geyBmb3IgKGNvbnN0IGIgb2Ygb3duZWQpIHRoaXMucG9vbC5yZWxlYXNlKGIpOyBvd25lZC5jbGVhcigpIH1cbiAgICB0cnkge1xuICAgICAgZm9yIChjb25zdCBbdGlsZSwgZW50cnldIG9mIHRoaXMuX3RpbGVzKSB7XG4gICAgICAgIGlmIChlbnRyeS5zdHJva2VJbmsgfHwgZW50cnkuaW5rQmFzZSB8fCBlbnRyeS5zdHJva2VDb2xvciB8fCBlbnRyeS5jb2xvckJhc2UpIHJldHVybiBudWxsXG4gICAgICAgIGNvbnN0IGF0ID0gb3JpZ2luT2YodGlsZSlcbiAgICAgICAgaWYgKCFhdCkgcmV0dXJuIG51bGxcbiAgICAgICAgY29uc3QgYnVmczogU3BpbGxlZFNjcmF0Y2hbJ3RpbGVzJ11bbnVtYmVyXVsnYnVmcyddID0ge31cbiAgICAgICAgY29uc3Qgd2hvbGUgPSAoYjogQWNjdW11bGF0aW9uQnVmZmVyKTogUGFya2VkU2NyYXRjaEJ1ZmZlciA9PiB7XG4gICAgICAgICAgbW92ZWQuYWRkKGIpOyBieXRlcyArPSBiLndpZHRoICogYi5oZWlnaHQgKiA0XG4gICAgICAgICAgcmV0dXJuIHsgYnVmZmVyOiBiLCBnbFg6IDAsIGdsWTogMCwgc3JjWDogMCwgc3JjWTogMCwgdzogYi53aWR0aCwgaDogYi5oZWlnaHQsIHdob2xlOiB0cnVlIH1cbiAgICAgICAgfVxuICAgICAgICBidWZzLm9yaWdpbmFsID0gd2hvbGUoZW50cnkub3JpZ2luYWwpXG4gICAgICAgIGNvbnN0IHBhcnRzID0gU1BJTExfVElMRV9CVUZGRVJTLmZpbHRlcihrID0+IGsgIT09ICdvcmlnaW5hbCcgJiYgZW50cnlba10pXG4gICAgICAgIGNvbnN0IGJvdW5kcyA9IHRoaXMuX3N0b3JhZ2VCb3VuZHNcbiAgICAgICAgY29uc3QgeDAgPSBib3VuZHMgPyBNYXRoLm1heCgwLCBNYXRoLmZsb29yKGJvdW5kcy5taW5YIC0gYXQub3JpZ2luWCkpIDogMFxuICAgICAgICBjb25zdCB5MCA9IGJvdW5kcyA/IE1hdGgubWF4KDAsIE1hdGguZmxvb3IoYm91bmRzLm1pblkgLSBhdC5vcmlnaW5ZKSkgOiAwXG4gICAgICAgIGNvbnN0IHgxID0gYm91bmRzID8gTWF0aC5taW4odGlsZS53aWR0aCwgTWF0aC5jZWlsKGJvdW5kcy5tYXhYIC0gYXQub3JpZ2luWCkpIDogdGlsZS53aWR0aFxuICAgICAgICBjb25zdCB5MSA9IGJvdW5kcyA/IE1hdGgubWluKHRpbGUuaGVpZ2h0LCBNYXRoLmNlaWwoYm91bmRzLm1heFkgLSBhdC5vcmlnaW5ZKSkgOiB0aWxlLmhlaWdodFxuICAgICAgICBjb25zdCB3ID0gTWF0aC5tYXgoMSwgeDEgLSB4MCksIGggPSBNYXRoLm1heCgxLCB5MSAtIHkwKVxuICAgICAgICBjb25zdCBjb2x1bW5zID0gTWF0aC5tYXgoMSwgTWF0aC5mbG9vcih0aWxlLndpZHRoIC8gdykpLCByb3dzID0gTWF0aC5tYXgoMSwgTWF0aC5mbG9vcih0aWxlLmhlaWdodCAvIGgpKVxuICAgICAgICBjb25zdCBjYXBhY2l0eSA9IGNvbHVtbnMgKiByb3dzXG4gICAgICAgIGNvbnN0IGF0bGFzQ291bnQgPSBNYXRoLmNlaWwocGFydHMubGVuZ3RoIC8gY2FwYWNpdHkpXG4gICAgICAgIC8vIFRpbGUtc2l6ZWQgYXRsYXNlcyByZXVzZSB0aGUgZmlsbSdzIHJlbGVhc2VkIGJ1ZmZlcnMuIEFyYml0cmFyaWx5XG4gICAgICAgIC8vIHNpemVkIHNtYWxsIHRleHR1cmVzIHdlcmUgdGhlbXNlbHZlcyAxMDBtcyBhbGxvY2F0aW9ucyBvbiBTYWZhcmkuXG4gICAgICAgIC8vIFdoZW4gcGFja2luZyBzYXZlcyBubyBtZW1vcnksIG1vdmUgdGhlIG9yaWdpbmFsIGJ1ZmZlcnMgaW5zdGVhZC5cbiAgICAgICAgaWYgKGF0bGFzQ291bnQgPj0gcGFydHMubGVuZ3RoKSB7XG4gICAgICAgICAgZm9yIChjb25zdCBrIG9mIHBhcnRzKSBidWZzW2tdID0gd2hvbGUoZW50cnlba10hKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGxldCBhdGxhczogQWNjdW11bGF0aW9uQnVmZmVyIHwgdW5kZWZpbmVkXG4gICAgICAgICAgZm9yIChjb25zdCBbaSwga10gb2YgcGFydHMuZW50cmllcygpKSB7XG4gICAgICAgICAgICBpZiAoaSAlIGNhcGFjaXR5ID09PSAwKSB7XG4gICAgICAgICAgICAgIGF0bGFzID0gdGhpcy5wb29sLmFjcXVpcmUodGlsZS53aWR0aCwgdGlsZS5oZWlnaHQpXG4gICAgICAgICAgICAgIG93bmVkLmFkZChhdGxhcyk7IGJ5dGVzICs9IHRpbGUud2lkdGggKiB0aWxlLmhlaWdodCAqIDRcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHNyY1ggPSAoaSAlIGNhcGFjaXR5ICUgY29sdW1ucykgKiB3LCBzcmNZID0gTWF0aC5mbG9vcihpICUgY2FwYWNpdHkgLyBjb2x1bW5zKSAqIGhcbiAgICAgICAgICAgIGNvbnN0IGdsWCA9IE1hdGgubWluKHRpbGUud2lkdGggLSAxLCB4MCksIGdsWSA9IE1hdGgubWluKHRpbGUuaGVpZ2h0IC0gMSwgTWF0aC5tYXgoMCwgdGlsZS5oZWlnaHQgLSB5MSkpXG4gICAgICAgICAgICBpZiAoeDEgPiB4MCAmJiB5MSA+IHkwKSBlbnRyeVtrXSEuY29weVJlZ2lvbkludG8oYXRsYXMhLCBnbFgsIGdsWSwgc3JjWCwgc3JjWSwgdywgaClcbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAvLyBBIHByZXNlbnQtYnV0LWVtcHR5IGZpZWxkIG11c3QgcmVtYWluIHByZXNlbnQgYWZ0ZXIgcmVzdG9yZS5cbiAgICAgICAgICAgICAgLy8gRW1wdHkgaW50ZXJzZWN0cyBhcmUgcmFyZSwgc28gYSBmdWxsIGNsZWFyIGlzIHNhZmUgYW5kIGNoZWFwLlxuICAgICAgICAgICAgICBjbGVhclBhcmtlZEJ1ZmZlcihhdGxhcyEpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBidWZzW2tdID0geyBidWZmZXI6IGF0bGFzISwgZ2xYLCBnbFksIHNyY1gsIHNyY1ksIHcsIGgsIHdob2xlOiBmYWxzZSB9XG4gICAgICAgICAgICB5aWVsZFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aWxlcy5wdXNoKHsgLi4uYXQsIHdpZHRoOiB0aWxlLndpZHRoLCBoZWlnaHQ6IHRpbGUuaGVpZ2h0LCBidWZzIH0pXG4gICAgICB9XG4gICAgICBjb25zdCByZXN1bHQgPSB7IC4uLnRoaXMuX3NjYWxhcnMoKSwgdGlsZXMsIGJ5dGVzLCBkaXNwb3NlLCB0YWtlQnVmZmVyLCByZWxlYXNlQnVmZmVyIH1cbiAgICAgIC8vIE93bmVyc2hpcCBtb3ZlcyBvbmx5IG9uIHN1Y2Nlc3NmdWwgY29tcGxldGlvbi4gVW50aWwgbm93IHRoZSBhY3RpdmVcbiAgICAgIC8vIHNjcmF0Y2ggd2FzIHVudG91Y2hlZCBhbmQgY2FuY2VsbGF0aW9uIGNhbiBzaW1wbHkgcmVsZWFzZSBpdHMgY29waWVzLlxuICAgICAgZm9yIChjb25zdCBiIG9mIG1vdmVkKSBvd25lZC5hZGQoYilcbiAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5fdGlsZXMudmFsdWVzKCkpIGZvciAoY29uc3QgayBvZiBTUElMTF9USUxFX0JVRkZFUlMpIHtcbiAgICAgICAgY29uc3QgYiA9IGVudHJ5W2tdXG4gICAgICAgIGlmIChiICYmICFtb3ZlZC5oYXMoYikpIHRoaXMucG9vbC5yZWxlYXNlKGIpXG4gICAgICB9XG4gICAgICB0aGlzLl90aWxlcy5jbGVhcigpXG4gICAgICBjb21taXR0ZWQgPSB0cnVlXG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfSBmaW5hbGx5IHsgaWYgKCFjb21taXR0ZWQpIGRpc3Bvc2UoKSB9XG4gIH1cblxuICAvKiogQSBwYXJrZWQgd2FzaCBiYWNrIGluIGZ1bGwtc2l6ZWQsIHplcm8tcGFkZGVkIHNjcmF0Y2ggYnVmZmVycy4gKi9cbiAgc3RhdGljIHVuc3BpbGwocG9vbDogUmliYm9uU2NyYXRjaFBvb2wsIHNwOiBTcGlsbGVkU2NyYXRjaCwgdGFyZ2V0OiBJTGF5ZXJCdWZmZXIpOiBSaWJib25TdHJva2VTY3JhdGNoIHwgbnVsbCB7XG4gICAgY29uc3QgcyA9IG5ldyBSaWJib25TdHJva2VTY3JhdGNoKHBvb2wsIHNwLm5lZWRzSW5rLCBzcC5uZWVkc0NvbG9yKVxuICAgIHMuX2FwcGx5U2NhbGFycyhzcCwgdGFyZ2V0KVxuICAgIGNvbnN0IHJlZmVyZW5jZXMgPSBuZXcgTWFwPEFjY3VtdWxhdGlvbkJ1ZmZlciwgbnVtYmVyPigpXG4gICAgZm9yIChjb25zdCB0IG9mIHNwLnRpbGVzKSBmb3IgKGNvbnN0IHAgb2YgT2JqZWN0LnZhbHVlcyh0LmJ1ZnMpKSBpZiAocCkge1xuICAgICAgcmVmZXJlbmNlcy5zZXQocC5idWZmZXIsIChyZWZlcmVuY2VzLmdldChwLmJ1ZmZlcikgPz8gMCkgKyAxKVxuICAgIH1cbiAgICB0cnkge1xuICAgICAgZm9yIChjb25zdCB0IG9mIHNwLnRpbGVzKSB7XG4gICAgICAgIGNvbnN0IHJlY3QgPSB7IG1pblg6IHQub3JpZ2luWCwgbWluWTogdC5vcmlnaW5ZLCBtYXhYOiB0Lm9yaWdpblggKyB0LndpZHRoLCBtYXhZOiB0Lm9yaWdpblkgKyB0LmhlaWdodCB9XG4gICAgICAgIGNvbnN0IHRpbGUgPSB0YXJnZXQucmVzb2x2ZUZvclBhaW50KHJlY3QpLmZpbmQociA9PiByLm9yaWdpblggPT09IHQub3JpZ2luWCAmJiByLm9yaWdpblkgPT09IHQub3JpZ2luWSk/LmJ1ZmZlclxuICAgICAgICBpZiAoIXRpbGUpIHsgcy5kZXN0cm95KCk7IHJldHVybiBudWxsIH1cbiAgICAgICAgY29uc3QgdGFrZSA9IChwOiBQYXJrZWRTY3JhdGNoQnVmZmVyIHwgdW5kZWZpbmVkKTogQWNjdW11bGF0aW9uQnVmZmVyIHwgbnVsbCA9PiB7XG4gICAgICAgICAgaWYgKCFwKSByZXR1cm4gbnVsbFxuICAgICAgICAgIGlmIChwLndob2xlKSB7IHNwLnRha2VCdWZmZXIocC5idWZmZXIpOyByZXR1cm4gcC5idWZmZXIgfVxuICAgICAgICAgIGNvbnN0IG93biA9IHBvb2wuYWNxdWlyZSh0LndpZHRoLCB0LmhlaWdodClcbiAgICAgICAgICBjbGVhclBhcmtlZEJ1ZmZlcihvd24pXG4gICAgICAgICAgcC5idWZmZXIuY29weVJlZ2lvbkludG8ob3duLCBwLnNyY1gsIHAuc3JjWSwgcC5nbFgsIHAuZ2xZLCBwLncsIHAuaClcbiAgICAgICAgICBjb25zdCBsZWZ0ID0gcmVmZXJlbmNlcy5nZXQocC5idWZmZXIpISAtIDFcbiAgICAgICAgICByZWZlcmVuY2VzLnNldChwLmJ1ZmZlciwgbGVmdClcbiAgICAgICAgICAvLyBSZXVzZSBhIGNvbnN1bWVkIGF0bGFzIGZvciBsYXRlciBmdWxsLXNpemVkIGZpZWxkcyByYXRoZXIgdGhhblxuICAgICAgICAgIC8vIGFsbG9jYXRpbmcgYSB0ZXh0dXJlIHdoaWxlIGNvbnRpbnVpbmcgdGhlIHdhc2guXG4gICAgICAgICAgaWYgKGxlZnQgPT09IDApIHNwLnJlbGVhc2VCdWZmZXIocC5idWZmZXIpXG4gICAgICAgICAgcmV0dXJuIG93blxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IG9yaWdpbmFsID0gdGFrZSh0LmJ1ZnMub3JpZ2luYWwpLCBjb3ZlcmFnZSA9IHRha2UodC5idWZzLmNvdmVyYWdlKVxuICAgICAgICBpZiAoIW9yaWdpbmFsIHx8ICFjb3ZlcmFnZSkgeyBpZiAob3JpZ2luYWwpIHBvb2wucmVsZWFzZShvcmlnaW5hbCk7IGlmIChjb3ZlcmFnZSkgcG9vbC5yZWxlYXNlKGNvdmVyYWdlKTsgcy5kZXN0cm95KCk7IHJldHVybiBudWxsIH1cbiAgICAgICAgcy5fdGlsZXMuc2V0KHRpbGUsIHtcbiAgICAgICAgICBvcmlnaW5hbCwgY292ZXJhZ2UsIGlua0xvYWQ6IHRha2UodC5idWZzLmlua0xvYWQpLCBpbmtTZXR0bGVkOiB0YWtlKHQuYnVmcy5pbmtTZXR0bGVkKSxcbiAgICAgICAgICBpbmtDb2xvcjogdGFrZSh0LmJ1ZnMuaW5rQ29sb3IpLCBjb2xvclNldHRsZWQ6IHRha2UodC5idWZzLmNvbG9yU2V0dGxlZCksXG4gICAgICAgICAgc3Ryb2tlSW5rOiBudWxsLCBpbmtCYXNlOiBudWxsLCBzdHJva2VDb2xvcjogbnVsbCwgY29sb3JCYXNlOiBudWxsLCBmaWxtR2VzdHVyZTogLTEsXG4gICAgICAgICAgaW5rRHJ5OiB0YWtlKHQuYnVmcy5pbmtEcnkpLCBjb2xvckRyeTogdGFrZSh0LmJ1ZnMuY29sb3JEcnkpLFxuICAgICAgICB9KVxuICAgICAgfVxuICAgICAgcmV0dXJuIHNcbiAgICB9IGZpbmFsbHkgeyBzcC5kaXNwb3NlKCkgfVxuICB9XG5cbiAgLyoqICgjNTM2LCDCpzE3LjU2KSBBIHNjcmF0Y2ggYXMgYHNuYXBgIGRlc2NyaWJlcyBpdCwgaXRzIHRpbGVzIGNvcGllZCBpbnRvXG4gICAqICBwb29sZWQgYnVmZmVycyBhbmQga2V5ZWQgYnkgYHRhcmdldGAncyBvd24gdGlsZXMgYXQgdGhlIHNhbWUgcGxhY2VzLiAqL1xuICBzdGF0aWMgcmVzdG9yZShwb29sOiBSaWJib25TY3JhdGNoUG9vbCwgc25hcDogU2NyYXRjaFNuYXBzaG90LCB0YXJnZXQ6IElMYXllckJ1ZmZlcik6IFJpYmJvblN0cm9rZVNjcmF0Y2gge1xuICAgIGNvbnN0IHMgPSBuZXcgUmliYm9uU3Ryb2tlU2NyYXRjaChwb29sLCBzbmFwLm5lZWRzSW5rLCBzbmFwLm5lZWRzQ29sb3IpXG4gICAgcy5fYXBwbHlTY2FsYXJzKHNuYXAsIHRhcmdldClcbiAgICBmb3IgKGNvbnN0IHQgb2Ygc25hcC50aWxlcykge1xuICAgICAgY29uc3QgcmVjdCA9IHsgbWluWDogdC5vcmlnaW5YLCBtaW5ZOiB0Lm9yaWdpblksIG1heFg6IHQub3JpZ2luWCArIHQud2lkdGgsIG1heFk6IHQub3JpZ2luWSArIHQuaGVpZ2h0IH1cbiAgICAgIGNvbnN0IHRpbGUgPSB0YXJnZXQucmVzb2x2ZUZvclBhaW50KHJlY3QpLmZpbmQociA9PiByLm9yaWdpblggPT09IHQub3JpZ2luWCAmJiByLm9yaWdpblkgPT09IHQub3JpZ2luWSk/LmJ1ZmZlclxuICAgICAgaWYgKCF0aWxlKSBjb250aW51ZVxuICAgICAgY29uc3QgdGFrZSA9IChiOiBBY2N1bXVsYXRpb25CdWZmZXIgfCB1bmRlZmluZWQpOiBBY2N1bXVsYXRpb25CdWZmZXIgfCBudWxsID0+IHtcbiAgICAgICAgaWYgKCFiKSByZXR1cm4gbnVsbFxuICAgICAgICBjb25zdCBvd24gPSBwb29sLmFjcXVpcmUoYi53aWR0aCwgYi5oZWlnaHQpXG4gICAgICAgIGIuY29weVRvKG93bilcbiAgICAgICAgcmV0dXJuIG93blxuICAgICAgfVxuICAgICAgY29uc3Qgb3JpZ2luYWwgPSB0YWtlKHQuYnVmcy5vcmlnaW5hbCksIGNvdmVyYWdlID0gdGFrZSh0LmJ1ZnMuY292ZXJhZ2UpXG4gICAgICBpZiAoIW9yaWdpbmFsIHx8ICFjb3ZlcmFnZSkgY29udGludWVcbiAgICAgIHMuX3RpbGVzLnNldCh0aWxlLCB7XG4gICAgICAgIG9yaWdpbmFsLCBjb3ZlcmFnZSwgaW5rTG9hZDogdGFrZSh0LmJ1ZnMuaW5rTG9hZCksIGlua1NldHRsZWQ6IHRha2UodC5idWZzLmlua1NldHRsZWQpLFxuICAgICAgICBpbmtDb2xvcjogdGFrZSh0LmJ1ZnMuaW5rQ29sb3IpLCBjb2xvclNldHRsZWQ6IHRha2UodC5idWZzLmNvbG9yU2V0dGxlZCksXG4gICAgICAgIHN0cm9rZUluazogbnVsbCwgaW5rQmFzZTogbnVsbCwgc3Ryb2tlQ29sb3I6IG51bGwsIGNvbG9yQmFzZTogbnVsbCwgZmlsbUdlc3R1cmU6IC0xLFxuICAgICAgICBpbmtEcnk6IG51bGwsIGNvbG9yRHJ5OiBudWxsLFxuICAgICAgfSlcbiAgICB9XG4gICAgcmV0dXJuIHNcbiAgfVxufVxuXG4vKiogKCM1MzYsIMKnMTcuNTYpIFRoZSB0aWxlIHRleHR1cmVzIG9mIGEgd2FzaCB0aGF0IG91dGxpdmUgYSBnZXN0dXJlLiBOb3RcbiAqICB0aGUgcHJvdmlzaW9uYWwgZHJ5IHBpY3R1cmUgKGlua0RyeS9jb2xvckRyeSk6IHRoZSBuZXh0IG9wZXJhdGlvbidzIHNldHRsZVxuICogIGxheXMgaXQgYWdhaW4gYmVmb3JlIHRoZSBjb21wb3NpdGUgcmVhZHMgaXQsIGFuZCBsZWF2aW5nIGl0IG91dCB3YXMgdGhlXG4gKiAgc2FtZSB0byBhIGxldmVsIG9uIHRoZSBkZXZpY2VzIGFuZCBhIHF1YXJ0ZXIgbGVzcyBtZW1vcnkgKDgwIE1CIG9mXG4gKiAgY2FycmllZCB3YXNoZXMgb24gdGhlIGlQYWQgaW5zdGVhZCBvZiA5NikuICovXG5jb25zdCBTTkFQU0hPVF9USUxFX0JVRkZFUlMgPSBbJ29yaWdpbmFsJywgJ2NvdmVyYWdlJywgJ2lua0xvYWQnLCAnaW5rU2V0dGxlZCcsICdpbmtDb2xvcicsICdjb2xvclNldHRsZWQnXSBhcyBjb25zdFxuXG5leHBvcnQgZnVuY3Rpb24gc2NyYXRjaFNuYXBzaG90Qnl0ZXMoc25hcDogU2NyYXRjaFNuYXBzaG90KTogbnVtYmVyIHtcbiAgbGV0IG4gPSAwXG4gIGZvciAoY29uc3QgdCBvZiBzbmFwLnRpbGVzKSBmb3IgKGNvbnN0IGIgb2YgT2JqZWN0LnZhbHVlcyh0LmJ1ZnMpKSBpZiAoYikgbiArPSBiLndpZHRoICogYi5oZWlnaHQgKiA0XG4gIHJldHVybiBuXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmcmVlU2NyYXRjaFNuYXBzaG90KHNuYXA6IFNjcmF0Y2hTbmFwc2hvdCk6IHZvaWQge1xuICBmb3IgKGNvbnN0IHQgb2Ygc25hcC50aWxlcykgZm9yIChjb25zdCBiIG9mIE9iamVjdC52YWx1ZXModC5idWZzKSkgYj8uZGVzdHJveSgpXG59XG5cbi8qKiAoIzUzNiwgwqcxNy41NikgRXZlcnkgbnVtYmVyIG9mIGEgUmliYm9uU3Ryb2tlU2NyYXRjaCB0aGUgbmV4dCBvcGVyYXRpb25cbiAqICBvZiBpdHMgd2FzaCByZWFkcy4gKi9cbmludGVyZmFjZSBTY3JhdGNoU2NhbGFycyB7XG4gIHN0b3JhZ2VCb3VuZHM/OiBTY3JhdGNoQm91bmRzIHwgbnVsbFxuICBuZWVkc0luazogYm9vbGVhbjsgbmVlZHNDb2xvcjogYm9vbGVhblxuICBwYWludHM6IHN0cmluZ1tdOyB3YXRlclVzZWQ6IG51bWJlcjsgcGlnbWVudFVzZWQ6IG51bWJlclxuICBjb21wb3NpdGU6IHsgc3ByZWFkUHg6IG51bWJlcjsgaW5rU21vb3RoUHg6IG51bWJlcjsgd2F0ZXI6IG51bWJlcjsgbWlncmF0ZVB4OiBudW1iZXI7IGJyaXN0bGVSYWRpdXNQeDogbnVtYmVyOyBmaWVsZFNlZWQ6IFtudW1iZXIsIG51bWJlcl0gfSB8IG51bGxcbiAgZGFiU3BhY2luZzogbnVtYmVyOyBicnVzaEVkZ2VQeDogbnVtYmVyOyBkaXI6IFtudW1iZXIsIG51bWJlcl07IGRpclNldDogYm9vbGVhblxuICBmaW5pc2g6IE9taXQ8Tm9uTnVsbGFibGU8UmliYm9uU3Ryb2tlU2NyYXRjaFsnZmluaXNoQ29udGV4dCddPiwgJ3RhcmdldCc+IHwgbnVsbFxuICBkcnlDdHg6IE9taXQ8Tm9uTnVsbGFibGU8UmliYm9uU3Ryb2tlU2NyYXRjaFsnZHJ5Q3R4J10+LCAndGFyZ2V0Jz4gfCBudWxsXG4gIGxhc3RLZXB0OiBEYWIgfCB1bmRlZmluZWQ7IGdlc3R1cmU6IG51bWJlclxuICBsYW5kaW5nOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyByOiBudW1iZXI7IHQ6IG51bWJlciB9IHwgbnVsbDsgZHdlbGxNczogbnVtYmVyOyBkd2VsbERvbmU6IGJvb2xlYW5cbiAgdHVybk9mZnNldDogW251bWJlciwgbnVtYmVyXTsgdHVybkRpcmVjdGlvbjogW251bWJlciwgbnVtYmVyXSB8IG51bGw7IGJydXNoVHJhdmVsOiBCcnVzaFRyYXZlbFtdOyBmb3JlaWduU291cmNlczogV2F0ZXJTb3VyY2VbXSB8IG51bGw7IHdldENvbnRhY3RzOiBXYXRlckZvb3RwcmludFtdXG4gIHRyYWlsOiBXY1RyYWlsRGFiW107IHNwZWVkOiBudW1iZXI7IHNwZWVkUGVhazogbnVtYmVyOyBzcGVlZEF0OiBudW1iZXI7IHNwZWVkVHJhdmVsOiBudW1iZXI7IGJyYWtlUGlnbWVudDogbnVtYmVyOyBzdXJwbHVzUGlnbWVudDogbnVtYmVyOyBzdXJwbHVzV2F0ZXI6IG51bWJlcjsgc3VycGx1c0F0OiBudW1iZXJcbn1cblxuLyoqICgjNTM2LCDCpzE3LjU2KSBTZWUgUmliYm9uU3Ryb2tlU2NyYXRjaC5zbmFwc2hvdC4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgU2NyYXRjaFNuYXBzaG90IGV4dGVuZHMgU2NyYXRjaFNjYWxhcnMge1xuICB0aWxlczogQXJyYXk8eyBvcmlnaW5YOiBudW1iZXI7IG9yaWdpblk6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IGJ1ZnM6IFBhcnRpYWw8UmVjb3JkPHR5cGVvZiBTTkFQU0hPVF9USUxFX0JVRkZFUlNbbnVtYmVyXSwgQWNjdW11bGF0aW9uQnVmZmVyPj4gfT5cbn1cblxuLyoqICgjNTM2LCDCpzE3LjY4KSBFdmVyeSB0aWxlIGJ1ZmZlciBvZiBhbiBvcGVuIHdhc2ggYXQgcmVzdC4gKi9cbmNvbnN0IFNQSUxMX1RJTEVfQlVGRkVSUyA9IFsnb3JpZ2luYWwnLCAnY292ZXJhZ2UnLCAnaW5rTG9hZCcsICdpbmtTZXR0bGVkJywgJ2lua0NvbG9yJywgJ2NvbG9yU2V0dGxlZCcsICdpbmtEcnknLCAnY29sb3JEcnknXSBhcyBjb25zdFxuXG4vKiogKMKnMTcuNjgpIFNlZSBSaWJib25TdHJva2VTY3JhdGNoLnNwaWxsLiAqL1xuaW50ZXJmYWNlIFBhcmtlZFNjcmF0Y2hCdWZmZXIgeyBidWZmZXI6IEFjY3VtdWxhdGlvbkJ1ZmZlcjsgZ2xYOiBudW1iZXI7IGdsWTogbnVtYmVyOyBzcmNYOiBudW1iZXI7IHNyY1k6IG51bWJlcjsgdzogbnVtYmVyOyBoOiBudW1iZXI7IHdob2xlOiBib29sZWFuIH1cbmV4cG9ydCBpbnRlcmZhY2UgU3BpbGxlZFNjcmF0Y2ggZXh0ZW5kcyBTY3JhdGNoU2NhbGFycyB7XG4gIHRpbGVzOiBBcnJheTx7IG9yaWdpblg6IG51bWJlcjsgb3JpZ2luWTogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlcjsgYnVmczogUGFydGlhbDxSZWNvcmQ8dHlwZW9mIFNQSUxMX1RJTEVfQlVGRkVSU1tudW1iZXJdLCBQYXJrZWRTY3JhdGNoQnVmZmVyPj4gfT5cbiAgYnl0ZXM6IG51bWJlclxuICBkaXNwb3NlKCk6IHZvaWRcbiAgdGFrZUJ1ZmZlcihidWZmZXI6IEFjY3VtdWxhdGlvbkJ1ZmZlcik6IHZvaWRcbiAgcmVsZWFzZUJ1ZmZlcihidWZmZXI6IEFjY3VtdWxhdGlvbkJ1ZmZlcik6IHZvaWRcbn1cblxuIl19