import { AccumulationBuffer } from "/src/engine/src/buffers/AccumulationBuffer.ts";
import { RibbonStrokeScratch } from "/src/engine/src/buffers/RibbonStrokeScratch.ts";
import "/src/engine/src/presets/pencilPresets.ts";
import "/src/engine/src/presets/digitalBrushPresets.ts";
import { buildRibbonBands, nibGeometry } from "/src/engine/src/dabs/markerRibbon.ts";
import { markerThinNibInkGain } from "/src/engine/src/dabs/markerInkGain.ts";
import { wetAt, wetPeak } from "/src/engine/src/paper/paperWetness.ts";
import { pigmentAbsorption } from "/src/engine/src/watercolor/pigmentOptics.ts";
import { WATERCOLOR_MIGRATION, WATERCOLOR_SPREAD } from "/src/engine/src/dabs/ribbonProfile.ts";
import { watercolorFerrulePx, watercolorWaterLoad, watercolorStandingWater, watercolorBrushRunsDry, watercolorWetPull, watercolorPuddleDepth, watercolorTravelQuantum, WC_FILM_DOSE, watercolorDwellWater, watercolorDwellPigment, WC_DWELL_RADIUS, watercolorTrailDwell, WC_DWELL_FLOOR_MS, WC_TRAIL_LEN, watercolorSurplus, watercolorExcessFromSurplus, watercolorPuddleFromSurplus, watercolorSlowdown, watercolorBrakeSurplus, WC_SLOW_GAIN, WC_SPEED_TAU_MS, WC_PEAK_FADE_MS, WC_START_EXCESS_RADII, WC_PUDDLE_RADII, watercolorPigmentLoad, watercolorPigmentRate, watercolorWaterStep, watercolorWaterClock, watercolorHalo, WATERCOLOR_HALO_PAST_BLOOM, WATERCOLOR_HALO_DRAWN, watercolorTravelRadius, watercolorSpreadRadius } from "/src/engine/src/presets/watercolorPresets.ts";
import { EMPTY_BANDS, rectOnTile, ribbonBandPieceCost, ribbonBandPieces, ribbonBristleCombs, ribbonWaterDelivery } from "/src/engine/src/dabs/ribbonStrokeMath.ts";
/** Builds and deposits one ribbon batch; GPU draw primitives and frame scheduling
* are supplied by the engine without changing the order of rendering. */
export class RibbonStrokePainter {
	ctx;
	constructor(ctx) {
		this.ctx = ctx;
	}
	/** #330 — the marker's rasterizer: the stroke as one connected swept figure.
	*
	*  Three fields (coverage / inkLoad / composite, see RibbonStrokeScratch):
	*
	*  - **coverage** is plain geometry, not an accumulation of soft profiles: a
	*    nib stamp at every sample (DAB_FRAG's u_inkMode=6, an analytic in-pixel
	*    distance to the nib's outline) plus the bands between consecutive
	*    samples (markerRibbon.ts + RIBBON_FRAG). Both resolve their edge over a
	*    fixed ~1 canvas px ramp, so the mark's edge no longer widens with the
	*    brush — the complaint that started all of this. Their union is exact:
	*    for a convex nib, sweeping it along a segment is precisely the convex
	*    hull of its two endpoint copies, which stamp+band+stamp reproduces with
	*    nothing missing and nothing extra (see markerRibbon.ts, including what
	*    it does when the nib also turns between samples).
	*  - **inkLoad** rides the *same* geometry, both the stamps (u_inkMode=7) and
	*    the ribbon (RIBBON_FRAG's ink mode), each carrying half the deposit.
	*    Splatting it only at the stamps is what left rounded white notches on
	*    turns: between stamps the ribbon still made the mark opaque, but with no
	*    ink there the composite multiplied by nothing and the paper showed
	*    through.
	*  - **composite** runs *once per batch* over the batch's own dirty rect
	*    rather than once per dab. It was always a pure recomputation from
	*    (original, coverage, inkLoad); with coverage now coming from geometry
	*    that reaches between the dabs, a per-dab quad would no longer cover
	*    everything the other two passes just wrote.
	*
	*  Blending for coverage stays the ordinary saturating "over" rather than
	*  needing EXT_blend_minmax: interior coverage here is a flat 1.0, and
	*  over(x, 1) == 1, so a stamp's antialiased rim landing inside a band (or
	*  vice versa) resolves to solid either way. The two only ever meet at a
	*  tangent point, where both are ramping, and the difference between max and
	*  over there is a fraction of one pixel. */
	*paint(target, dabs, preset, presetName, profile, color, scratch, prevDab, wetProfile, strokeSeed, deferComposite = false, pieceTris = 0) {
		// Two different treatments of a dab too thin to resolve, and which one a
		// tool gets is the whole of RibbonProfile.minHalfWidthPx (#454). The
		// marker drops it: a sub-half-pixel marker dab is degenerate. The brush
		// pen widens it to the floor instead, because for a tool whose width
		// floor is 0.15 of a size the user may set to 3px, "drop it" means
		// deleting the thin end of every stroke — the first thing ADR 009 asks
		// the tool to be able to draw.
		//
		// Copies rather than mutating: these Dab objects are the ones recorded on
		// the StrokeOperation and streamed to peers, and a draw-time clamp must
		// not rewrite what the operation says. Being a pure function of dab.size,
		// it lands identically on every replay anyway.
		const floorPx = profile.minHalfWidthPx;
		// (#536, §17.64) Each dab's place in `dabs`, which is what the recorded
		// wet profile is indexed by - one digit per dab of the operation (or of
		// the live batch's slice). The filters below drop dabs, and reading the
		// profile by position in what is left shifted every digit after the first
		// one dropped - by how many were dropped before it in THIS call, so a live
		// stroke and its one-batch replay read different paper under the same dab.
		const wetIndex = new Map();
		let drawable = floorPx === null ? dabs.filter((d, i) => {
			wetIndex.set(d, i);
			return d.size * .5 * preset.sizeMultiplier >= .5;
		}) : dabs.map((d, i) => {
			const half = d.size * .5 * preset.sizeMultiplier;
			const out = half >= floorPx ? d : {
				...d,
				size: floorPx * 2 / preset.sizeMultiplier
			};
			wetIndex.set(out, i);
			return out;
		});
		// -1 for a dab not of this call (the bridging prevDab), as the loop below read it.
		const wetOf = (d) => wetAt(wetProfile, wetIndex.get(d) ?? -1);
		// (§17.28) The deposit as a FILM under MAX blending - see RibbonTileScratch.strokeInk.
		const film = profile.normalizeDeposit && !!this.ctx.minmaxExt() && !!scratch;
		// (§17.28) Only the dabs that MOVED deposit - see watercolorTravelQuantum.
		// The anchor is the last dab kept, carried on the scratch across the
		// gesture's batches so a live stroke and its replay keep the same dabs.
		if (profile.normalizeDeposit && scratch) {
			// …and the ribbon bridges from the last kept dab, never from a dropped
			// one, so the bands' geometry is the same set of dabs live and replayed.
			if (scratch.lastKept) prevDab = scratch.lastKept;
			const kept = [];
			let anchor = prevDab;
			for (const d of drawable) {
				const q = watercolorTravelQuantum(d.size * .5 * preset.sizeMultiplier);
				if (!anchor || Math.hypot(d.x - anchor.x, d.y - anchor.y) >= q) {
					kept.push(d);
					anchor = d;
				}
			}
			if (kept.length) scratch.lastKept = kept[kept.length - 1];
			drawable = kept;
		}
		if (!drawable.length) return;
		// #573 — a digital brush on the stamp model keeps this machinery's scratch
		// (the frozen layer, the stroke's coverage) and nothing else of it.
		if (profile.brushStamp) {
			this.ctx.paintBrushStroke(target, drawable, preset, profile.brushStamp, color, scratch, prevDab);
			return;
		}
		const { nibShape, cornerFraction } = profile;
		// One bounds box for the whole batch: the tiles to paint, and the rect the
		// single composite pass covers. Padded per dab by the same half-extents the
		// ordinary graphite path uses, so a chisel nib's 5x reach is accounted for.
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		// (#536) …and by the halo a wet-paper dab lays around itself, at the widest
		// it can be for that wetness — this is a bound, and erring outward is the
		// cheap direction. See watercolorHalo.
		const haloBound = (d) => profile.normalizeDeposit ? watercolorHalo(wetOf(d), 1).scale : 1;
		// …and the reach the halo is allowed past the bloom, at the cap: the
		// gesture's own spread is not resolved until further down, and this is a
		// bound, so the ceiling stands in.
		const haloPast = (d) => profile.normalizeDeposit && wetOf(d) > 0 ? WATERCOLOR_HALO_PAST_BLOOM * WATERCOLOR_SPREAD.cap : 0;
		// (§17.46) Two rects. The REACH (halo bound included) is what the gesture
		// hands its settle as the window the wet-in-wet may move paint in - cut
		// to the dabs, the settle's field ended at the brush's own footprint and
		// left hard straight edges through the wash (replay of HcpkzwNX). The
		// PAINT rect - tiles, film rebuild, live composite - only needs what is
		// actually laid, and with the halo stamp off (WATERCOLOR_HALO_DRAWN) that
		// is the dabs: the reach made a big brush in its own wet wash repaint and
		// recomposite three to four times the area every frame, the tablet's one
		// dropped frame in six.
		let rMinX = Infinity, rMinY = Infinity, rMaxX = -Infinity, rMaxY = -Infinity;
		// (#536, §17.65) A dab whose reach misses the sheet adds nothing to either
		// rect. Judged per dab, so how the gesture was cut into batches cannot
		// matter: a live batch off the sheet contributed nothing (it paints
		// nothing), while a replay's one batch stretched its rect - and the settle
		// window after it - over the whole off-sheet run. A tail drawn down past
		// the sheet's right edge pulled the window 900 px lower, past the field's
		// cap, and the crop left the wash's own top out of the dry tide.
		const sheet = profile.normalizeDeposit && !this.ctx.infinite() ? this.ctx.pageSize() : null;
		for (const d of prevDab ? [prevDab, ...drawable] : drawable) {
			const { hx, hy } = this.ctx.dabWorldHalfExtents(d, false, preset);
			const g = haloBound(d), past = haloPast(d);
			if (sheet && (d.x + hx * g + past <= 0 || d.y + hy * g + past <= 0 || d.x - hx * g - past >= sheet.w || d.y - hy * g - past >= sheet.h)) continue;
			rMinX = Math.min(rMinX, d.x - hx * g - past);
			rMaxX = Math.max(rMaxX, d.x + hx * g + past);
			rMinY = Math.min(rMinY, d.y - hy * g - past);
			rMaxY = Math.max(rMaxY, d.y + hy * g + past);
			const pg = WATERCOLOR_HALO_DRAWN ? g : 1, pp = WATERCOLOR_HALO_DRAWN ? past : 0;
			minX = Math.min(minX, d.x - hx * pg - pp);
			maxX = Math.max(maxX, d.x + hx * pg + pp);
			minY = Math.min(minY, d.y - hy * pg - pp);
			maxY = Math.max(maxY, d.y + hy * pg + pp);
		}
		const bounds = {
			minX,
			minY,
			maxX,
			maxY
		};
		// The tiles over the REACH, as before: a tile the settle is to spread
		// into needs its wash entry, and the paint rect alone left a drop across
		// the bounded room's x=1024 seam unable to run into the next tile. Per
		// tile, the film rebuild and composite are cut to the paint rect.
		const reachRect = {
			minX: rMinX,
			minY: rMinY,
			maxX: rMaxX,
			maxY: rMaxY
		};
		const targets = this.ctx.resolveWithinSheet(target, profile.normalizeDeposit ? this.ctx.wcSheetClamp(reachRect) : reachRect);
		// (#536, §17.63) Not yet: a batch with nothing on the sheet still spends
		// the gesture's brush - see the return after the deposit loop.
		// (#468 v2/v4, ADR 011 §3.5) The stroke's typical radius decides how far its
		// water carries. Mean rather than max: one heavy dab at the end of an
		// otherwise light stroke should not widen the whole mark's boundary
		// treatment.
		// (#468 v6) The deposit's ripple has exactly the dab spacing for a period,
		// so that is what it must be read back over. The first attempt guessed it
		// from the first dab's radius and landed at a quarter of the true value —
		// the ring came out 3.8px wide against a 15.4px period and cancelled
		// essentially nothing, which is why the circles survived the first fix.
		const firstGap = drawable.length >= 2 ? Math.hypot(drawable[1].x - drawable[0].x, drawable[1].y - drawable[0].y) : prevDab ? Math.hypot(drawable[0].x - prevDab.x, drawable[0].y - prevDab.y) : 0;
		const dabSpacing = scratch.noteDabSpacing(firstGap);
		const dirFrom = drawable.length >= 2 ? drawable[0] : prevDab;
		const dirTo = drawable.length >= 2 ? drawable[1] : drawable[0];
		const strokeDir = scratch.noteDirection(dirFrom ? dirTo.x - dirFrom.x : 0, dirFrom ? dirTo.y - dirFrom.y : 0);
		// (#536) How wet the paper was where this gesture came down. Read once,
		// above everything that needs it — the composite's cached scalars want it
		// as much as the deposit does.
		// Landing belongs to the gesture, not to the next pointer batch.
		const landedWet = scratch.finishContext?.landedWet ?? wetAt(wetProfile, 0);
		const wetPeakHere = wetPeak(wetProfile);
		for (const d of drawable) if (wetOf(d) >= .3) scratch.wetContacts.push({
			x: d.x,
			y: d.y,
			radius: d.size * .5 * preset.sizeMultiplier,
			aspect: Math.max(1, d.aspectRatio),
			angle: d.angle
		});
		const { spreadPx, water: fringeWater, migratePx, fieldSeed, bristleRadiusPx } = scratch.compositeScalars(() => {
			// #489: the bloom is isotropic, so a nib that is not round is measured by
			// the circle with its area rather than by either axis. Identical to the
			// old `size * 0.5` for a round nib.
			const first = drawable[0];
			const firstMinor = first.size * .5 * preset.sizeMultiplier;
			const firstRadius = Math.max(watercolorSpreadRadius(firstMinor * Math.max(first.aspectRatio, 1), firstMinor), .5);
			return {
				// (#536) No longer gated by the wetness under the landing point, and
				// that gate was the single worst thing about wet-in-wet.
				//
				// The bloom used to be baked into this gesture-wide number out of the
				// one digit under the first dab. So a brush set down *in* a puddle
				// spread three times as far for the whole of its travel, including the
				// dry paper it went on to cross, and a brush that started on dry paper
				// and ran through the puddle got no bloom anywhere — "если веду с
				// сухого через лужу на сухое, штрих ложится полностью сухим". Worse, at
				// a 16 px cell the first dab landing in a wet cell or a dry one near the
				// edge is close to a coin toss, which is the "иногда" in every one of
				// those reports.
				//
				// The bloom is now applied per pixel in the composite, off the deposit's
				// own record of what the paper under it was carrying (DAB_FRAG's
				// paperWetHere). This stays the *dry* reach, i.e. the ceiling the
				// shader scales up from where the paper was actually wet — so a stroke
				// blooms in the puddle and stays tight either side of it, inside one
				// mark.
				spreadPx: profile.spreadPx > 0 && profile.spreadOfRadius > 0 ? Math.min(profile.spreadPx, Math.max(WATERCOLOR_SPREAD.min, firstRadius * profile.spreadOfRadius)) : 0,
				inkSmoothPx: 0,
				// (#468 v11) How far one exchange moves pigment. A constant of the
				// gesture for exactly the reason every other scalar here is one: the
				// composite recomputes whole rects, so whichever batch wrote a pixel
				// last would otherwise decide how far its paint had travelled.
				migratePx: profile.migrate > 0 && profile.migrateOfRadius > 0 ? Math.min(WATERCOLOR_MIGRATION.maxPx, Math.max(WATERCOLOR_MIGRATION.minPx, firstRadius * profile.migrateOfRadius)) : 0,
				// The fallback the composite uses outside the mark, where there is no
				// deposit to read a per-pixel level from. The stroke's starting load,
				// not its current one, for the same no-seams reason.
				water: profile.waterLevel,
				fieldSeed: [drawable[0].x, drawable[0].y],
				// (#536) A constant of the gesture like every other scalar here, so
				// the hair does not change frequency between a live batch and the
				// final recomposite.
				// The nib's *long* axis, not the equal-area radius. A flat brush is a
				// row of hairs held in a ferrule, and the ferrule's width is the long
				// axis: measured by area it came out as a couple of bundles and read
				// as broad waves rather than as hair, which is what "на chisel не вижу
				// щетинки" was. For a round nib the two are the same number.
				//
				// (#536) …and the ferrule, not this footprint: the first dab of a
				// gesture carries both the pressure it was begun with and the head
				// taper, and on a small brush those two together cost most of the hair.
				// See watercolorFerrulePx.
				bristleRadiusPx: watercolorFerrulePx(firstMinor, first.aspectRatio, first.pressure, presetName)
			};
		});
		// (#468 v4, ADR 011 §4.4) The composite rect a *live* batch redraws, padded
		// past the dabs it just painted.
		//
		// v2 and v3 ran the spread and the tideline only at pen-up, because both
		// read a neighbourhood the moving brush front has not finished writing. The
		// cost was a visible jump: the artist drew one shape and watched it become
		// another the instant the stylus lifted. Correct by the model, and bad —
		// real paint keeps moving, it does not swap geometry in a single frame.
		//
		// The fix is that both terms are *local*: they reach at most spread +
		// tideline radius from any pixel. So a batch that recomposites its own
		// dabs plus that much margin fixes up everything the previous batch could
		// only guess at, and the only region still provisional is the margin around
		// the live front — which is where the brush is, and which the next batch
		// corrects. The settle pass at pen-up then has nothing left to do but the
		// final margin, so the mark barely changes when the pen comes up.
		//
		// Costs a larger rect per batch. Bounded by the padding, not by the stroke:
		// this stays proportional to what the batch painted, unlike recompositing
		// the whole stroke every event, which is what made deferral necessary in
		// the first place.
		// The pad has to cover *everything that can still change this pixel*, and
		// that is not just how far the composite reaches sideways — it is also how
		// long the brush keeps depositing into a pixel it has already passed.
		//
		// Ink and coverage keep arriving until the nib has travelled a full radius
		// beyond a spot. Pad by less than that and a live batch composites from an
		// inkLoad that is still missing the dabs behind the front, and no later
		// batch's rect ever reaches back to correct it. Replay, which composites
		// once with the whole stroke in the buffers, has no such gap — so the two
		// disagreed, and a reload silently redrew the stroke differently. Measured
		// at 26% of the mark's area before this, 9% of it strongly.
		//
		// That is a determinism bug, not a cosmetic one: two people in one room
		// were looking at different pictures.
		let maxRadius = 0;
		// #489: the nib's *reach*, not its short axis — this term is a bound, and a
		// flat nib deposits a long semi-axis past a spot rather than a short one.
		// Erring outward costs a slightly larger rect; erring inward composites
		// from buffers that are still filling, which is the determinism bug this
		// whole block exists to prevent.
		// (§17.23) …and the nib's own radius, without the halo's bound: what the
		// rim is scaled by.
		let nibRadius = 0;
		for (const d of drawable) {
			const minor = d.size * .5 * preset.sizeMultiplier;
			maxRadius = Math.max(maxRadius, minor * Math.max(d.aspectRatio, 1) * haloBound(d) + haloPast(d));
			nibRadius = Math.max(nibRadius, minor * Math.max(d.aspectRatio, 1));
		}
		// Everything that can still change this pixel, **summed** rather than
		// maxed — each term is a separate hop outward and they compose:
		//
		//   maxRadius   the nib keeps depositing into a spot until it has travelled
		//               its own radius past it;
		//   spreadPx    the boundary is decided from a blur of coverage that far away;
		//   wetEdge     the tideline reads the same blur;
		//   dabSpacing  the deposit is read back averaged over one spacing, so a
		//               pixel's value depends on its neighbours' deposits too;
		//   migratePx   (#468 v11) pigment is exchanged with a ring that far out,
		//               so a pixel's tone depends on deposits that far away — and
		//               unlike the terms above this one is symmetric, since paint
		//               arriving is as much a change as paint leaving.
		//
		// Getting this wrong does not merely blur something: a live batch then
		// composites from buffers that are still filling, no later batch's rect
		// reaches back to correct it, and the mark ends up different from what a
		// replay of the same operation produces.
		// (#536) Twice the reach, because the mark can end up that much wider than
		// the brush: the re-threshold displaces the boundary outward by about
		// 2 * reach * push, and push is capped at WC_WET_PUSH, which is 0.5. Under-
		// padding here does not soften a mark, it cuts it off square at the rect's
		// edge — so this is a bound, not an estimate.
		//
		// It used to pad for the bloom multiplied into the *radius*. That factor is
		// gone (see the reach's own note in DAB_FRAG: an eighty-pixel radius on a
		// twelve-tap ring is not a blur), and padding for it was costing two and a
		// half times the composite fill it needed.
		// (#536, §17.22) No maxRadius here any more: `bounds` is built from the
		// dabs' world half-extents (and the previous dab's), so the nib's own
		// radius is already inside it, and adding it again put a 400 px brush's
		// rect at 1136 px a side where 740 would do — 2.4 times the fill. The
		// pad is the composite's READ reach only, plus the stamps' edge AA.
		const compositePad = spreadPx > 0 ? Math.ceil(spreadPx * 2 + profile.wetEdgeRadiusPx + dabSpacing + migratePx + profile.aaPx) + 1 : 0;
		const compositeBounds = compositePad > 0 ? {
			minX: bounds.minX - compositePad,
			minY: bounds.minY - compositePad,
			maxX: bounds.maxX + compositePad,
			maxY: bounds.maxY + compositePad
		} : bounds;
		const reachBounds = {
			minX: rMinX - compositePad,
			minY: rMinY - compositePad,
			maxX: rMaxX + compositePad,
			maxY: rMaxY + compositePad
		};
		// (#468 v3, ADR 011 §3.8) Every dab's ink deposit, resolved once for the
		// batch — *before* the tile loop, because the depletion clock must advance
		// once per batch and not once per tile a batch happens to straddle.
		//
		// Two things happen here that did not before, both watercolor-only:
		//
		//  - the deposit is divided by the dab's own radius, turning it from a
		//    quantity per unit *length* into one per unit *area*. Unnormalized it
		//    scaled with brush size and saturated the 8-bit inkLoad buffer on the
		//    first dab of any real wash, which pinned the composite's saturation
		//    curve at 1 and made `density` dead code (see normalizeDeposit);
		//  - it decays as the brush unloads along the stroke, which is only
		//    expressible *because* of the normalization above.
		//
		// The marker takes neither and must not: its strokes are permanent and its
		// constants were calibrated against the old scale. What it does take
		// (#559) is a gain of >= 1 on that same legacy deposit wherever the nib is
		// too thin along the travel to have reached the film's knee at all — see
		// markerInkGain.ts. Exactly 1 for every nib that saturated already.
		// (#468 v4, ADR 011 §4) Water and pigment run down at *different* rates,
		// and that difference is the whole behaviour: water soaks away fast while
		// pigment stays on the hairs, so one long stroke walks itself from a wet
		// saturated start, through an ordinary middle, to a dry but still strongly
		// coloured end — and finally to a broken dry-brush tail. A single "wetness"
		// scalar cannot produce that arc at all.
		const deposits = [];
		const waterByDab = new Map();
		const pigmentByDab = new Map();
		const delivery = ribbonWaterDelivery(profile);
		scratch.standing.clear();
		// (#536) Which way "across the brush" points for each dab, in the nib's own
		// local axes — the stamps' half of the hair comb. Filled in the same loop
		// that already resolves each dab's travel direction, so there is exactly
		// one reading of it and the stamps cannot disagree with the bands.
		const acrossByDab = new Map();
		// (#680, s17.84) The dabs whose direction is the travel's - see below.
		const movingByDab = new Set();
		// (#536) …and how wet the paper under each dab already was. Straight out of
		// the recorded profile, indexed by position within this call's own dabs —
		// which is why the profile is one digit per dab and why every place a
		// gesture is cut takes its own substring (paperWetness.ts).
		const paperWetByDab = new Map();
		// (#536) The touch-down surplus, per dab — see watercolorStartExcess. Gated
		// by the wetness under the gesture's *landing point*, not per dab: a brush
		// dumps its load when it is set down, so what matters is what was under it
		// then, not what it has run over since.
		// (#536) How strong this stroke's paint is, on the deposit rather than on
		// the composite's single opacity — see _bakeDabOpacity's own note.
		const inkStrength = profile.normalizeDeposit ? profile.pigmentStrength : 1;
		const mottleSeed = strokeSeed ?? [0, 0];
		const pigmentPoolByDab = new Map();
		const excessByDab = new Map();
		const puddleByDab = new Map();
		// #559 — how much to raise this dab's deposit for being dragged thin-side
		// first. Shared by the stamps and the bands, which must agree: the two
		// overlap almost everywhere, and a band on a different scale from the
		// stamps it connects would show as a seam at every sample.
		const thinNibGain = (dab, fromX, fromY) => profile.thinNibInkRefPx > 0 ? markerThinNibInkGain(nibGeometry(dab, preset.sizeMultiplier, nibShape, cornerFraction), dab.x - fromX, dab.y - fromY, profile.thinNibInkRefPx) : 1;
		{
			let prev = prevDab;
			let used = scratch.waterUsed;
			let pigUsed = scratch.pigmentUsed;
			for (const dab of drawable) {
				const wetHere = wetOf(dab);
				paperWetByDab.set(dab, wetHere);
				// #489: travel measured in *this* nib's units, which for a flat one
				// depends on which way it is being dragged (watercolorTravelRadius).
				// `prev` is undefined on the stroke's first dab and sits at the same
				// point for a dwell tick — both are "no direction", and both are what
				// the null branch answers.
				const minor = dab.size * .5 * preset.sizeMultiplier;
				// (§17.37) The landing dwell: the time the nib has stayed within
				// WC_DWELL_RADIUS of where it came down, on the dabs' own clock.
				// Read per dab as it stands so far, so a live stroke's landing
				// dabs and a replay's see the same values in the same order.
				if (!scratch.landing) scratch.landing = {
					x: dab.x,
					y: dab.y,
					r: minor * Math.max(dab.aspectRatio, 1),
					t: dab.t
				};
				else if (!scratch.dwellDone) {
					const L = scratch.landing;
					if (Math.hypot(dab.x - L.x, dab.y - L.y) <= WC_DWELL_RADIUS * L.r) scratch.dwellMs = Math.max(scratch.dwellMs, dab.t - L.t);
					else scratch.dwellDone = true;
				}
				const dx = prev ? dab.x - prev.x : 0;
				const dy = prev ? dab.y - prev.y : 0;
				const travelAngle = Math.hypot(dx, dy) > .01 ? Math.atan2(dy, dx) : null;
				const radius = Math.max(watercolorTravelRadius(minor * Math.max(dab.aspectRatio, 1), minor, dab.angle, travelAngle), .5);
				// (#680, s17.84) A dab that really moved (a fifth of its radius): its
				// direction is the travel's. The last dabs before a lift move by a
				// pixel or less and their direction jitters - combed along it, the
				// pool's streaks came out as arcs and waves at every stroke's end.
				if (Math.hypot(dx, dy) > .2 * minor) movingByDab.add(dab);
				if (travelAngle !== null) {
					// Perpendicular of travel, rotated out of world space into the nib's
					// frame. Null travel is a tap or a dwell tick with no direction to
					// speak of; the minor axis is the isotropic answer and is what the
					// uniform already defaults to.
					const la = travelAngle + Math.PI / 2 - dab.angle;
					acrossByDab.set(dab, [Math.cos(la), Math.sin(la)]);
				}
				const seg = this.ctx.markerSegmentLength(dab, prev, radius);
				if (profile.waterDepletion) {
					const step = watercolorWaterStep(seg, radius);
					// (#536) Travel spends both clocks; only water is ever given back,
					// and only by paper this stroke *recorded* as wet. See
					// watercolorWaterClock, and RibbonStrokeScratch._pigmentUsed on why
					// the two are separate numbers at all.
					pigUsed += step;
					used = watercolorWaterClock(used, step, wetHere);
				}
				// The profile's levels are the *initial* load; the two curves say how
				// much of each is left after that much travel. depositPerRadius already
				// carries the nominal pigment setting, so only the remaining *fraction*
				// multiplies it here.
				// (#536, §17.21) …and a clean-water brush does not run down at all.
				const load = profile.waterDepletion && watercolorBrushRunsDry(profile.pigmentStrength) ? watercolorWaterLoad(used) : 1;
				const water = profile.waterDepletion ? profile.waterLevel * load : 1;
				// (#536, §17.14) …by the brush's water: a wet brush spends the same
				// finite budget further along the path. See PIGMENT_RUN_DRY_RADII.
				// (§17.26) …and a wet sheet pulls more of it out (watercolorWetPull).
				const pigmentLeft = profile.waterDepletion ? watercolorPigmentLoad(pigUsed, profile.waterLevel) * watercolorPigmentRate(profile.waterLevel) * watercolorWetPull(wetHere) : 1;
				// The gesture's own travel clock, carried on the scratch, so this decays
				// from the *stroke's* start rather than from each batch's. The pigment
				// one: a brush that drank from a puddle halfway along has not gone back
				// to being freshly set down, and the touch-down surplus is about the
				// moment of landing.
				// (#680, §17.74) The dwell at THIS dab, not only at the landing: a
				// stop, a sharp turn, a turn-back unload the reservoir the same way,
				// and the surplus is spent over the travel after it.
				const tau = Math.max(0, watercolorTrailDwell(scratch.trail, dab.x, dab.y, dab.t, WC_DWELL_RADIUS * minor * Math.max(dab.aspectRatio, 1)) - WC_DWELL_FLOOR_MS);
				const gateHere = 1 - Math.min(Math.max(wetHere, 0), 1);
				const pigmentGate = .45 + .55 * gateHere;
				// …and the slowdown relative to this stroke's own pace (watercolorSlowdown).
				const last = scratch.trail.length ? scratch.trail[scratch.trail.length - 1] : null;
				let slow = 0;
				let speedElapsed = 0;
				if (scratch.speedAt < 0) scratch.speedAt = dab.t;
				if (last) {
					scratch.speedTravel += Math.hypot(dab.x - last.x, dab.y - last.y);
					const dt = dab.t - scratch.speedAt;
					if (dt > 0) {
						// One pointer batch gives several dabs the same timestamp. Keep
						// their travel until the next real time interval; dt=1 invented
						// high speeds and a braking pool at the next batch boundary.
						const v = scratch.speedTravel / dt;
						const a = 1 - Math.exp(-dt / WC_SPEED_TAU_MS);
						scratch.speed += (v - scratch.speed) * a;
						scratch.speedPeak = Math.max(scratch.speed, scratch.speedPeak * Math.exp(-dt / WC_PEAK_FADE_MS));
						scratch.speedAt = dab.t;
						scratch.speedTravel = 0;
						speedElapsed = dt;
					}
					slow = watercolorSlowdown(scratch.speed, scratch.speedPeak);
				}
				const spent = pigUsed - scratch.surplusAt;
				// Two reservoirs, spent at their own lengths: a stop's (the dwell) lays
				// the landing's long pool, a braking's a compact one (WC_SLOW_RUN_RADII).
				scratch.surplusPigment = watercolorSurplus(scratch.surplusPigment, spent, watercolorDwellPigment(tau) * pigmentGate, WC_START_EXCESS_RADII);
				scratch.surplusWater = watercolorSurplus(scratch.surplusWater, spent, watercolorDwellWater(tau) * gateHere, WC_PUDDLE_RADII);
				scratch.brakePigment = watercolorBrakeSurplus(scratch.brakePigment, spent, WC_SLOW_GAIN * slow * pigmentGate, speedElapsed);
				scratch.turnOffset[0] += dx;
				scratch.turnOffset[1] += dy;
				if (Math.hypot(...scratch.turnOffset) >= Math.max(1.5, minor * .12)) {
					// A geometric corner changes direction, not the pigment supply.
					// Braking still unloads through its elapsed-time reservoir above.
					const direction = scratch.turnOffset;
					scratch.turnDirection = [...direction];
					scratch.turnOffset = [0, 0];
				}
				scratch.surplusAt = pigUsed;
				scratch.trail.push({
					x: dab.x,
					y: dab.y,
					t: dab.t
				});
				if (scratch.trail.length > WC_TRAIL_LEN) scratch.trail.shift();
				const excess = profile.waterDepletion ? watercolorExcessFromSurplus(pigUsed, landedWet, Math.max(scratch.surplusPigment, scratch.brakePigment)) : 1;
				excessByDab.set(dab, excess);
				// (#680, s17.79) ...and the landing's own surplus, which needs no dwell:
				// the touch-down's pool is a pool too, broken into blots like the others.
				const landingPool = (1 - Math.min(Math.max(landedWet, 0), 1)) * Math.exp(-pigUsed / WC_START_EXCESS_RADII);
				// Braking pigment is not extra water: a sharp turn must not invent a
				// deep visible puddle merely because it unloads a little more colour.
				// The pool multiplier affects only surplus pigment. Braking does
				// not add standing water or turn a corner into a deep puddle.
				pigmentPoolByDab.set(dab, Math.max(0, excess - 1) / Math.max(excess, 1));
				const waterPool = Math.max(scratch.surplusWater, landingPool);
				puddleByDab.set(dab, profile.waterDepletion ? watercolorPuddleFromSurplus(waterPool, wetHere) : watercolorPuddleDepth(pigUsed, landedWet, wetHere, scratch.dwellMs));
				if (profile.waterDepletion) this.ctx.dabPool().set(dab, Math.min(waterPool, 1));
				if (profile.normalizeDeposit && Math.hypot(dx, dy) > .01 && profile.waterLevel > 0) scratch.brushTravel.push({
					x: dab.x,
					y: dab.y,
					radius: minor,
					aspect: Math.max(1, dab.aspectRatio),
					angle: dab.angle,
					dx,
					dy,
					water: profile.waterLevel
				});
				waterByDab.set(dab, water);
				pigmentByDab.set(dab, pigmentLeft);
				if (profile.normalizeDeposit) scratch.standing.set(dab, watercolorStandingWater(delivery.water, delivery.retain, wetHere, load));
				// The stamps' share of the dose, doubled back up because the legacy
				// formula's 0.5 assumed an even split with the bands.
				const stampShare = profile.stampInkShare > 0 ? profile.stampInkShare * 2 : 1;
				// (§17.28) Under MAX the stamp's value IS the film: spacing-free.
				deposits.push(profile.normalizeDeposit ? film ? (profile.depositPerRadius * 0.5) * WC_FILM_DOSE * pigmentLeft * excess : (profile.depositPerRadius * 0.5) * (seg / radius) * .5 * stampShare * pigmentLeft * excess : dab.opacity * seg * .5 * thinNibGain(dab, prev?.x ?? dab.x, prev?.y ?? dab.y));
				prev = dab;
			}
			scratch.advanceWater(used, pigUsed);
		}
		// (#536, §17.63) Only now. Everything above is the gesture's bookkeeping -
		// the brush's water and pigment clocks, the landing and its dwell, the dab
		// spacing, the direction, the composite's scalars from the first dab - and
		// it has to advance per dab whether or not the batch lands on the sheet.
		// Returning before it made the result depend on how the gesture was cut
		// into batches: the author's live batches off the sheet spent nothing, and
		// the brush came onto the paper fully loaded; a replay paints the operation
		// as one batch that does reach the sheet, and it came on already spent -
		// 30-40 % lighter over the whole mark (a V begun off the page at 32 %).
		if (!targets.length) return;
		// (#536, ADR 011 §17.10) The halo: a second, wider, weaker stamp for every
		// dab that landed on wet paper, into the same coverage and deposit buffers.
		// This is where wet-in-wet growth lives now, and the reason it lives here
		// rather than in the composite is spelled out at watercolorHalo. Grown
		// copies carry over every per-dab reading of the original, so the bands
		// and stamps of the halo agree with the mark's own about water, hair
		// direction and paper.
		const haloDabs = [];
		const haloDoseByDab = new Map();
		/** What each ORIGINAL dab gave up to its halo, so the core is laid lighter
		*  by exactly that share — conservation, and the "dissolves in water" feel. */
		const haloShedByDab = new Map();
		let anyHalo = false;
		// A flat disc, not the tool's cone. The ink stamp is a cone that is zero at
		// the nib's rim (inkEdgeFalloff 0 — see the shader's mix(u_inkEdge, 1, depth)),
		// so a stamp merely made wider puts only the cone's outer slope over the
		// ring that is the halo: measured on a replay of Ilya's own stroke through
		// the density view, a halo 2.9x wider at nearly full dose registered at a
		// few per cent of the core. The halo is a plateau of migrated pigment, and
		// a plateau is what this profile lays.
		const haloProfile = {
			...profile,
			inkEdgeFalloff: 1
		};
		if (profile.normalizeDeposit) {
			for (const dab of drawable) {
				const { scale, shed, wet } = watercolorHalo(paperWetByDab.get(dab) ?? 0, waterByDab.get(dab) ?? 0);
				// Past the composite's bloom, not merely past the dab — see
				// WATERCOLOR_HALO_PAST_BLOOM. spreadPx is the gesture's reach in world
				// px and dab.size is a diameter, hence the factor of two.
				const grown = {
					...dab,
					size: dab.size * scale + 2 * WATERCOLOR_HALO_PAST_BLOOM * spreadPx * wet
				};
				haloDabs.push(grown);
				// The shed share as the halo stamp's dose, un-compensated for the wider
				// radius on purpose — see watercolorHalo on why per pixel it comes out
				// as shed / scale, a ring's worth rather than a disc's.
				haloDoseByDab.set(grown, shed);
				haloShedByDab.set(dab, shed);
				if (shed > 0) anyHalo = true;
				const across = acrossByDab.get(dab);
				if (across) acrossByDab.set(grown, across);
				waterByDab.set(grown, waterByDab.get(dab) ?? 0);
				pigmentByDab.set(grown, pigmentByDab.get(dab) ?? 1);
				pigmentPoolByDab.set(grown, pigmentPoolByDab.get(dab) ?? .5);
				excessByDab.set(grown, excessByDab.get(dab) ?? 1);
				puddleByDab.set(grown, puddleByDab.get(dab) ?? 1);
				paperWetByDab.set(grown, paperWetByDab.get(dab) ?? 0);
			}
		}
		// Bands share the stamps' scale, or they would swamp it: the two overlap
		// almost everywhere and each carries half a dose, so a band still on the
		// legacy scale would drown whatever the normalized stamps expressed.
		// Omitting the callback leaves buildRibbonBands' own formula untouched,
		// which is what the brush pen gets. The marker (#559) passes that same
		// formula back in with the thin-nib gain on it, so its bands and stamps
		// stay on one scale — a gain of 1 reproduces the omitted case exactly.
		const inkFor = profile.thinNibInkRefPx > 0 && !profile.normalizeDeposit ? (d0, d1, travel) => ({
			ink: d1.opacity * travel * .5 * thinNibGain(d1, d0.x, d0.y),
			water: 0,
			paperWet: 0,
			strength: 0,
			puddle: 1
		}) : profile.normalizeDeposit ? (d0, d1, travel) => {
			// #489: same measure the stamps use, and it has to be the same one —
			// the bands overlap the stamps almost everywhere, so two different
			// readings of "how far in nib units" would show up as a seam.
			const minor = d1.size * .5 * preset.sizeMultiplier;
			const bdx = d1.x - d0.x;
			const bdy = d1.y - d0.y;
			const bandAngle = Math.hypot(bdx, bdy) > .01 ? Math.atan2(bdy, bdx) : null;
			const radius = Math.max(watercolorTravelRadius(minor * Math.max(d1.aspectRatio, 1), minor, d1.angle, bandAngle), .5);
			// Per segment, not per batch: the water weighting rides the vertex now
			// (markerRibbon.ts's FLOATS_PER_VERTEX) precisely so that how the
			// stroke was cut into pointer events cannot change the result.
			return {
				ink: (film ? (profile.depositPerRadius * 0.5) * WC_FILM_DOSE * 2 : (profile.depositPerRadius * 0.5) * (travel / radius) * .5 * ((1 - profile.stampInkShare) * 2)) * (pigmentByDab.get(d1) ?? 1) * (excessByDab.get(d1) ?? 1) * (1 - (haloShedByDab.get(d1) ?? 0)),
				water: waterByDab.get(d1) ?? 0,
				paperWet: paperWetByDab.get(d1) ?? 0,
				// (#680, s17.84) Negative on a segment the brush barely moved
				// along: its direction jitters, and the coverage pass leaves the
				// pool mark (.g) off there - see movingByDab. The ink pass reads
				// the magnitude.
				strength: Math.hypot(bdx, bdy) > .2 * minor ? inkStrength : -inkStrength,
				puddle: puddleByDab.get(d1) ?? 1,
				pigmentPool: pigmentPoolByDab.get(d1) ?? .5
			};
		} : undefined;
		// #547 — not merely unused for a stamps-only tool but not built at all:
		// the band builder walks every consecutive pair and allocates a vertex
		// buffer per segment, which on a densely-spaced brush stroke is the larger
		// half of the CPU work in this method.
		const bands = profile.stampsOnly ? EMPTY_BANDS : buildRibbonBands(drawable, preset.sizeMultiplier, prevDab, nibShape, cornerFraction, profile.aaPx, inkFor, film);
		// (#536, s17.13) The hairs' bundle count, for the ink pass below and the
		// composite alike - see ribbonBristleCombs.
		const combs = ribbonBristleCombs(profile, bristleRadiusPx);
		// (#536, §17.19) This stroke's paint as absorption, for the colour record.
		const tau = pigmentAbsorption(color);
		scratch.paints.add(color.join(","));
		// #547 — flow, normalized against how far the brush travelled between
		// stamps, computed once for the batch rather than per tile.
		//
		// Why it has to be normalized at all, and this is the correction to the
		// first version: the coverage buffer accumulates as plain "over", and the
		// stamps of this tool are spaced a *twentieth* of the footprint apart. A
		// pixel is therefore under ~20 of them in a single pass, so even a flow of
		// 0.12 reaches 1 - 0.88^20 = 0.92 — and every brush, at every pressure, came
		// out at full density. The setting existed and could not be seen ("нажим
		// меняет плотность вообще не работает, всё время максимальная плотность").
		//
		// The fix makes `flow` mean what a painter means by it: **how much one full
		// pass of the brush lays down**, rather than how much one stamp does. Per
		// stamp that is
		//
		//     f' = 1 - (1 - f) ^ (travel / diameter)
		//
		// so that after travelling one diameter — i.e. after the ~diameter/travel
		// stamps that cover a given pixel — the accumulated coverage is exactly f,
		// whatever the spacing. Two consequences worth naming: the density stops
		// depending on how fast the stroke was drawn (fast strokes used to be
		// sparser and therefore paler), and it stops depending on the brush's
		// authored spacing, which is now free to be chosen for smoothness alone.
		const stampFlows = profile.stampFlow ? drawable.map((dab, i) => {
			const prevOne = i === 0 ? prevDab : drawable[i - 1];
			const diameter = Math.max(dab.size * preset.sizeMultiplier, .5);
			const travel = this.ctx.markerSegmentLength(dab, prevOne, diameter * .5);
			const full = profile.stampFlow(dab.pressure);
			if (full >= 1) return 1;
			return Math.max(0, Math.min(1, 1 - Math.pow(1 - full, Math.min(travel / diameter, 1))));
		}) : null;
		for (const tile of targets) {
			const { original, coverage, inkLoad, inkColor } = scratch.getOrCreate(tile.buffer);
			// #547, ADR 013 §3 — the stamp's own `opacity` argument is this dab's
			// **flow** for the digital brush, and a plain 0 for the three tools whose
			// coverage pass only needs a silhouette (their mode-6 branch ignores it).
			// (#536, s17.11) For the watercolor the recorded paper wetness rides
			// along into the coverage stamp too: its .b is the standing-water
			// record the diffusion pass gates on. See u_washWater.
			for (let i = 0; i < drawable.length; i++) {
				const dab = drawable[i];
				if (!this.ctx.nibTouchesTile(tile, dab, preset)) continue;
				this.ctx.drawRibbonNibPass(
					coverage,
					tile,
					dab,
					preset,
					profile,
					profile.coverageInkMode,
					stampFlows ? stampFlows[i] : 0,
					true,
					waterByDab.get(dab) ?? 0,
					acrossByDab.get(dab) ?? [0, 1],
					paperWetByDab.get(dab) ?? 0,
					1,
					[0, 0],
					null,
					combs,
					0,
					null,
					puddleByDab.get(dab) ?? 1,
					// (s17.84) ...and the pool share into the coverage's .g - where
					// the brush was moving: a standing dab has no direction to comb
					// along (its across is the default, not the travel's).
					profile.waterDepletion && movingByDab.has(dab) ? 1 : 0
				);
				yield pieceTris ? this.ctx.nibDrawCost(tile, dab, preset) : 0;
			}
			// #547 — a brush's mark is a repeated stamp, not a swept smear, so the
			// bands that fill between samples are switched off for it (ADR 013 §4).
			// The three older tools keep them: on a turn the bands reach places the
			// stamps miss, and with nothing there the composite paints bare paper.
			if (!profile.stampsOnly && bands.length) {
				for (const piece of ribbonBandPieces(bands, pieceTris)) {
					const px = pieceTris ? ribbonBandPieceCost(piece, tile) : 0;
					if (pieceTris && !px) continue;
					this.ctx.drawRibbonBands(coverage, tile, piece, "coverage", profile.aaPx, 0, 0, [0, 0], ribbonWaterDelivery(profile).water, ribbonWaterDelivery(profile).retain, combs, 0, null, profile.waterDepletion ? 1 : 0);
					yield px;
				}
			}
			// Ink follows the *same* figure as the silhouette. Depositing it only at
			// the sample stamps is what produced the rounded white notches on turns:
			// between stamps the ribbon still made the mark fully opaque, but with an
			// ink load of zero the composite multiplies by nothing and the paper
			// shows straight through. Both halves carry half a dose each (see
			// buildRibbonBands) so their overlap sums to the calibrated amount.
			//
			// Skipped entirely for a covering ink, which has no such quantity — see
			// RibbonProfile.ink.
			// (§17.28) With the film on, the stamps and bands go into the gesture's
			// own buffers under MAX and inkLoad/inkColor are rebuilt as base + film
			// over the batch's rect; without it, straight into inkLoad additively.
			const fb = film && inkLoad ? scratch.filmBuffers(tile.buffer) : null;
			const inkDest = fb ? fb.strokeInk : inkLoad;
			const colorDest = fb ? fb.strokeColor : inkColor;
			const beginInk = (buf) => {
				if (fb) buf.beginMaxDraw(this.ctx.minmaxExt());
				else buf.beginAdditiveDraw();
			};
			const bandMode = fb ? "ink-max" : "ink";
			// (#680, s17.79) The watercolor's surplus lies in blots — see wcPoolBlot.
			const poolBlot = profile.waterDepletion ? 1 : 0;
			if (inkDest) {
				for (let i = 0; i < drawable.length; i++) {
					if (!this.ctx.nibTouchesTile(tile, drawable[i], preset)) continue;
					beginInk(inkDest);
					this.ctx.drawRibbonNibPass(inkDest, tile, drawable[i], preset, profile, 7, deposits[i] * (1 - (haloShedByDab.get(drawable[i]) ?? 0)), false, waterByDab.get(drawable[i]) ?? 0, acrossByDab.get(drawable[i]) ?? [0, 1], paperWetByDab.get(drawable[i]) ?? 0, inkStrength, mottleSeed, null, combs, profile.bristleInk, null, pigmentPoolByDab.get(drawable[i]) ?? .5, poolBlot);
					inkDest.endDraw();
					yield pieceTris ? this.ctx.nibDrawCost(tile, drawable[i], preset) : 0;
				}
				if (bands.length) {
					for (const piece of ribbonBandPieces(bands, pieceTris)) {
						const px = pieceTris ? ribbonBandPieceCost(piece, tile) : 0;
						if (pieceTris && !px) continue;
						this.ctx.drawRibbonBands(inkDest, tile, piece, bandMode, profile.aaPx, profile.cloud, profile.granulation, mottleSeed, 0, 0, combs, profile.bristleInk, null, poolBlot);
						yield px;
					}
				}
				// (#536, §17.19) …and the same figure once more, into the colour
				// record: the paint's optical depth per texel. Same dose, same hairs,
				// same mottling, so depth and deposit agree to the texel.
				if (colorDest) {
					for (let i = 0; i < drawable.length; i++) {
						if (!this.ctx.nibTouchesTile(tile, drawable[i], preset)) continue;
						beginInk(colorDest);
						this.ctx.drawRibbonNibPass(colorDest, tile, drawable[i], preset, profile, 7, deposits[i] * (1 - (haloShedByDab.get(drawable[i]) ?? 0)), false, waterByDab.get(drawable[i]) ?? 0, acrossByDab.get(drawable[i]) ?? [0, 1], paperWetByDab.get(drawable[i]) ?? 0, inkStrength, mottleSeed, null, combs, profile.bristleInk, tau, pigmentPoolByDab.get(drawable[i]) ?? 0, poolBlot);
						colorDest.endDraw();
						yield pieceTris ? this.ctx.nibDrawCost(tile, drawable[i], preset) : 0;
					}
					if (bands.length) {
						for (const piece of ribbonBandPieces(bands, pieceTris)) {
							const px = pieceTris ? ribbonBandPieceCost(piece, tile) : 0;
							if (pieceTris && !px) continue;
							this.ctx.drawRibbonBands(colorDest, tile, piece, bandMode, profile.aaPx, profile.cloud, profile.granulation, mottleSeed, 0, 0, combs, profile.bristleInk, tau, poolBlot);
							yield px;
						}
					}
				}
			}
			if (inkLoad && profile.normalizeDeposit) scratch.diffusePending = true;
			// (#536, ADR 011 §17.10) The halo, after the mark itself: ink only, and
			// only where the wash already has coverage. The pigment a wet-in-wet dab
			// sheds travels as far as the standing water and no further, and the
			// water is this wash's own silhouette — the puddle is a stroke of the
			// same wash — so clipping the stamp by the coverage buffer is what keeps
			// a halo from ever leaving the puddle ("пигмент за пределы лужи может
			// уйти, такого быть не может"). No coverage stamp for the halo for the
			// same reason: it must not grow the silhouette. Skipped outright on dry
			// paper: no wet dab, no second pass, no cost.
			if (anyHalo && inkDest) {
				for (let i = 0; i < haloDabs.length; i++) {
					const dose = haloDoseByDab.get(haloDabs[i]) ?? 0;
					if (dose <= 0 || !this.ctx.nibTouchesTile(tile, haloDabs[i], preset)) continue;
					beginInk(inkDest);
					this.ctx.drawRibbonNibPass(inkDest, tile, haloDabs[i], preset, haloProfile, 7, deposits[i] * dose, false, waterByDab.get(haloDabs[i]) ?? 0, acrossByDab.get(haloDabs[i]) ?? [0, 1], paperWetByDab.get(haloDabs[i]) ?? 0, inkStrength, mottleSeed, coverage, combs, profile.bristleInk);
					inkDest.endDraw();
					yield pieceTris ? this.ctx.nibDrawCost(tile, haloDabs[i], preset) : 0;
				}
			}
			// (§17.28) The deposit the composite and the settle read: the wash as it
			// stood before this gesture plus the gesture's film, over this batch's
			// rect (the film outside it is unchanged since the last batch).
			if (fb && inkLoad) {
				const rect = this.ctx.revealRect(tile, compositeBounds);
				if (rect) {
					this.ctx.fieldOp(inkLoad, fb.inkBase, fb.strokeInk, 1, 1, { scissor: rect });
					if (inkColor && fb.strokeColor && fb.colorBase) this.ctx.fieldOp(inkColor, fb.colorBase, fb.strokeColor, 1, 1, { scissor: rect });
				}
			}
			// `drawable[0].opacity` rather than a per-dab value: only a tool whose
			// dabs all share one opacity can be composited from a coverage buffer at
			// all, which for the brush pen is guaranteed by _bakeDabOpacity (ADR 009
			// §9 — pressure drives width, never alpha). The marker's branch ignores
			// this argument entirely and reads its own inkLoad texture instead.
			if (deferComposite) {
				// (#536, §17.22) The live gesture: the rect joins this frame's union
				// and the composite runs once, in _display, before the frame is drawn.
				const pending = scratch.pendingComposite.get(tile.buffer);
				if (pending) {
					pending.bounds.minX = Math.min(pending.bounds.minX, compositeBounds.minX);
					pending.bounds.minY = Math.min(pending.bounds.minY, compositeBounds.minY);
					pending.bounds.maxX = Math.max(pending.bounds.maxX, compositeBounds.maxX);
					pending.bounds.maxY = Math.max(pending.bounds.maxY, compositeBounds.maxY);
				} else {
					scratch.pendingComposite.set(tile.buffer, {
						tile,
						bounds: { ...compositeBounds }
					});
				}
				// Every coalesced batch grows both the layer and paper damage, even
				// when this tile already has a pending composite for the frame.
				this.ctx.markPaperDamage(compositeBounds);
				this.ctx.setLiveComposite({
					scratch,
					preset,
					profile,
					color,
					opacity: drawable[0].opacity,
					fieldSeed,
					spreadPx,
					fringeWater,
					migratePx,
					inkSmoothPx: profile.normalizeDeposit ? dabSpacing : 0,
					strokeDir,
					bristleRadiusPx
				});
				continue;
			}
			const revealPrev = this.ctx.revealBeforeBatch(tile, compositeBounds);
			this.ctx.drawRibbonCompositeRect(tile, compositeBounds, preset, profile, original, coverage, inkLoad, inkColor, color, drawable[0].opacity, fieldSeed, spreadPx, fringeWater, migratePx, profile.normalizeDeposit ? dabSpacing : 0, strokeDir, bristleRadiusPx);
			this.ctx.revealAfterBatch(tile, compositeBounds, revealPrev);
			yield pieceTris ? rectOnTile(tile, compositeBounds) : 0;
		}
		scratch.noteFinish({
			target,
			preset,
			profile,
			color,
			opacity: drawable[0].opacity,
			bounds: reachBounds,
			fieldSeed,
			landedWet,
			wetPeak: wetPeakHere,
			radiusPx: nibRadius,
			dwellMs: scratch.dwellMs
		});
		target.markContentPainted(compositeBounds);
	}
}

//# sourceMappingURL=data:application/json;base64,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TSxnQkFBZ0IsSUFBSTtLQUN4RSxRQUFRLE9BQU8sT0FBTyxLQUFLLElBQUksUUFBUSxPQUFPLE1BQU0sZ0JBQWdCLElBQUk7S0FDeEUsUUFBUSxPQUFPLE9BQU8sS0FBSyxJQUFJLFFBQVEsT0FBTyxNQUFNLGdCQUFnQixJQUFJO0lBQzFFLE9BQU87S0FDTCxRQUFRLGlCQUFpQixJQUFJLEtBQUssUUFBUTtNQUFFO01BQU0sUUFBUSxFQUFFLEdBQUcsZ0JBQWdCO0tBQUUsQ0FBQztJQUNwRjs7O0lBR0EsS0FBSyxJQUFJLGdCQUFnQixlQUFlO0lBQ3hDLEtBQUssSUFBSSxpQkFBaUI7S0FDeEI7S0FBUztLQUFRO0tBQVM7S0FBTyxTQUFTLFNBQVMsRUFBRSxDQUFDO0tBQVM7S0FBVztLQUFVO0tBQWE7S0FDakcsYUFBYSxRQUFRLG1CQUFtQixhQUFhO0tBQUc7S0FBVztJQUNyRSxDQUFDO0lBQ0Q7R0FDRjtHQUNBLE1BQU0sYUFBYSxLQUFLLElBQUksa0JBQWtCLE1BQU0sZUFBZTtHQUNuRSxLQUFLLElBQUksd0JBQ1AsTUFBTSxpQkFBaUIsUUFBUSxTQUFTLFVBQVUsVUFBVSxTQUFTLFVBQVUsT0FBTyxTQUFTLEVBQUUsQ0FBQyxTQUNsRyxXQUFXLFVBQVUsYUFBYSxXQUNsQyxRQUFRLG1CQUFtQixhQUFhLEdBQUcsV0FBVyxlQUN4RDtHQUNBLEtBQUssSUFBSSxpQkFBaUIsTUFBTSxpQkFBaUIsVUFBVTtHQUMzRCxNQUFNLFlBQVksV0FBVyxNQUFNLGVBQWUsSUFBSTtFQUN4RDtFQUVBLFFBQVEsV0FBVztHQUNqQjtHQUFRO0dBQVE7R0FBUztHQUFPLFNBQVMsU0FBUyxFQUFFLENBQUM7R0FDckQsUUFBUTtHQUFhO0dBQVc7R0FBVyxTQUFTO0dBQWEsVUFBVTtHQUFXLFNBQVMsUUFBUTtFQUN6RyxDQUFDO0VBRUQsT0FBTyxtQkFBbUIsZUFBZTtDQUMzQztBQUNGIiwibmFtZXMiOltdLCJzb3VyY2VzIjpbIlJpYmJvblN0cm9rZVBhaW50ZXIudHMiXSwidmVyc2lvbiI6Mywic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBEYWIgfSBmcm9tICdAZ3JhZmV0dG8vc2hhcmVkJ1xuaW1wb3J0IHsgQWNjdW11bGF0aW9uQnVmZmVyIH0gZnJvbSAnLi4vYnVmZmVycy9BY2N1bXVsYXRpb25CdWZmZXInXG5pbXBvcnQgeyBSaWJib25TdHJva2VTY3JhdGNoIH0gZnJvbSAnLi4vYnVmZmVycy9SaWJib25TdHJva2VTY3JhdGNoJ1xuXG5pbXBvcnQgeyB0eXBlIFBlbmNpbFByZXNldCB9IGZyb20gJy4uL3ByZXNldHMvcGVuY2lsUHJlc2V0cydcbmltcG9ydCB7IHR5cGUgQnJ1c2hEZXNjcmlwdG9yLCB0eXBlIEJydXNoUHJlc3N1cmVTZXR0aW5ncyB9IGZyb20gJy4uL3ByZXNldHMvZGlnaXRhbEJydXNoUHJlc2V0cydcbmltcG9ydCB7IGJ1aWxkUmliYm9uQmFuZHMsIG5pYkdlb21ldHJ5IH0gZnJvbSAnLi4vZGFicy9tYXJrZXJSaWJib24nXG5pbXBvcnQgeyBtYXJrZXJUaGluTmliSW5rR2FpbiB9IGZyb20gJy4uL2RhYnMvbWFya2VySW5rR2FpbidcbmltcG9ydCB7IHdldEF0LCB3ZXRQZWFrIH0gZnJvbSAnLi4vcGFwZXIvcGFwZXJXZXRuZXNzJ1xuaW1wb3J0IHsgcGlnbWVudEFic29ycHRpb24gfSBmcm9tICcuLi93YXRlcmNvbG9yL3BpZ21lbnRPcHRpY3MnXG5pbXBvcnQgeyBXQVRFUkNPTE9SX01JR1JBVElPTiwgV0FURVJDT0xPUl9TUFJFQUQsIHR5cGUgUmliYm9uUHJvZmlsZSB9IGZyb20gJy4uL2RhYnMvcmliYm9uUHJvZmlsZSdcbmltcG9ydCB7IHdhdGVyY29sb3JGZXJydWxlUHgsIHdhdGVyY29sb3JXYXRlckxvYWQsIHdhdGVyY29sb3JTdGFuZGluZ1dhdGVyLCB3YXRlcmNvbG9yQnJ1c2hSdW5zRHJ5LCB3YXRlcmNvbG9yV2V0UHVsbCwgd2F0ZXJjb2xvclB1ZGRsZURlcHRoLCB3YXRlcmNvbG9yVHJhdmVsUXVhbnR1bSwgV0NfRklMTV9ET1NFLCB3YXRlcmNvbG9yRHdlbGxXYXRlciwgd2F0ZXJjb2xvckR3ZWxsUGlnbWVudCwgV0NfRFdFTExfUkFESVVTLCB3YXRlcmNvbG9yVHJhaWxEd2VsbCwgV0NfRFdFTExfRkxPT1JfTVMsIFdDX1RSQUlMX0xFTiwgd2F0ZXJjb2xvclN1cnBsdXMsIHdhdGVyY29sb3JFeGNlc3NGcm9tU3VycGx1cywgd2F0ZXJjb2xvclB1ZGRsZUZyb21TdXJwbHVzLCB3YXRlcmNvbG9yU2xvd2Rvd24sIHdhdGVyY29sb3JCcmFrZVN1cnBsdXMsIFdDX1NMT1dfR0FJTiwgV0NfU1BFRURfVEFVX01TLCBXQ19QRUFLX0ZBREVfTVMsIFdDX1NUQVJUX0VYQ0VTU19SQURJSSwgV0NfUFVERExFX1JBRElJLCB3YXRlcmNvbG9yUGlnbWVudExvYWQsIHdhdGVyY29sb3JQaWdtZW50UmF0ZSwgd2F0ZXJjb2xvcldhdGVyU3RlcCwgd2F0ZXJjb2xvcldhdGVyQ2xvY2ssIHdhdGVyY29sb3JIYWxvLCBXQVRFUkNPTE9SX0hBTE9fUEFTVF9CTE9PTSwgV0FURVJDT0xPUl9IQUxPX0RSQVdOLCB3YXRlcmNvbG9yVHJhdmVsUmFkaXVzLCB3YXRlcmNvbG9yU3ByZWFkUmFkaXVzIH0gZnJvbSAnLi4vcHJlc2V0cy93YXRlcmNvbG9yUHJlc2V0cydcbmltcG9ydCB0eXBlIHsgSUxheWVyQnVmZmVyLCBQYWludFRhcmdldCB9IGZyb20gJy4uL2J1ZmZlcnMvSUxheWVyQnVmZmVyJ1xuaW1wb3J0IHsgRU1QVFlfQkFORFMsIHJlY3RPblRpbGUsIHJpYmJvbkJhbmRQaWVjZUNvc3QsIHJpYmJvbkJhbmRQaWVjZXMsIHJpYmJvbkJyaXN0bGVDb21icywgcmliYm9uV2F0ZXJEZWxpdmVyeSB9IGZyb20gJy4vcmliYm9uU3Ryb2tlTWF0aCdcblxuZXhwb3J0IHR5cGUgUmliYm9uTGl2ZUNvbXBvc2l0ZSA9IHtcbiAgICBzY3JhdGNoOiBSaWJib25TdHJva2VTY3JhdGNoXG4gICAgcHJlc2V0OiBQZW5jaWxQcmVzZXRcbiAgICBwcm9maWxlOiBSaWJib25Qcm9maWxlXG4gICAgY29sb3I6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXVxuICAgIG9wYWNpdHk6IG51bWJlclxuICAgIGZpZWxkU2VlZDogW251bWJlciwgbnVtYmVyXVxuICAgIHNwcmVhZFB4OiBudW1iZXJcbiAgICBmcmluZ2VXYXRlcjogbnVtYmVyXG4gICAgbWlncmF0ZVB4OiBudW1iZXJcbiAgICBpbmtTbW9vdGhQeDogbnVtYmVyXG4gICAgc3Ryb2tlRGlyOiBbbnVtYmVyLCBudW1iZXJdXG4gICAgYnJpc3RsZVJhZGl1c1B4OiBudW1iZXJcbiAgfVxuXG5leHBvcnQgaW50ZXJmYWNlIFJpYmJvblN0cm9rZVBhaW50ZXJDb250ZXh0IHtcbiAgZGFiUG9vbCgpOiBXZWFrTWFwPERhYiwgbnVtYmVyPlxuICBpbmZpbml0ZSgpOiBib29sZWFuXG4gIG1pbm1heEV4dCgpOiB7IE1BWF9FWFQ6IG51bWJlciB9IHwgbnVsbFxuICBzZXRMaXZlQ29tcG9zaXRlKHZhbHVlOiBSaWJib25MaXZlQ29tcG9zaXRlIHwgbnVsbCk6IHZvaWRcbiAgZGFiV29ybGRIYWxmRXh0ZW50cyhkOiBEYWIsIGVyYXNpbmc6IGJvb2xlYW4sIHByZXNldDogUGVuY2lsUHJlc2V0LCB3aWNraW5nPzogYm9vbGVhbik6IHsgaHg6IG51bWJlcjsgaHk6IG51bWJlciB9XG4gIGRyYXdSaWJib25CYW5kcyhkZXN0OiBBY2N1bXVsYXRpb25CdWZmZXIsIHRpbGU6IFBhaW50VGFyZ2V0LCBiYW5kczogRmxvYXQzMkFycmF5LCBtb2RlOiAnY292ZXJhZ2UnIHwgJ2luaycgfCAnaW5rLW1heCcsIGFhUHg6IG51bWJlciwgY2xvdWQ/OiBudW1iZXIsIGdyYW4/OiBudW1iZXIsIG1vdHRsZVNlZWQ/OiBbbnVtYmVyLCBudW1iZXJdLCB3YXNoV2F0ZXI/OiBudW1iZXIsIHdhdGVyUmV0YWluPzogbnVtYmVyLCBicmlzdGxlQ29tYnM/OiBudW1iZXIsIGJyaXN0bGVJbms/OiBudW1iZXIsIGRlcHRoVGF1PzogcmVhZG9ubHkgW251bWJlciwgbnVtYmVyLCBudW1iZXJdIHwgbnVsbCwgcG9vbEJsb3Q/OiBudW1iZXIpOiB2b2lkXG4gIGRyYXdSaWJib25Db21wb3NpdGVSZWN0KHRpbGU6IFBhaW50VGFyZ2V0LCBib3VuZHM6IHsgbWluWDogbnVtYmVyOyBtaW5ZOiBudW1iZXI7IG1heFg6IG51bWJlcjsgbWF4WTogbnVtYmVyIH0sIHByZXNldDogUGVuY2lsUHJlc2V0LCBwcm9maWxlOiBSaWJib25Qcm9maWxlLCBvcmlnaW5hbDogQWNjdW11bGF0aW9uQnVmZmVyLCBjb3ZlcmFnZTogQWNjdW11bGF0aW9uQnVmZmVyLCBpbmtMb2FkOiBBY2N1bXVsYXRpb25CdWZmZXIgfCBudWxsLCBpbmtDb2xvcjogQWNjdW11bGF0aW9uQnVmZmVyIHwgbnVsbCwgY29sb3I6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSwgb3BhY2l0eTogbnVtYmVyLCBmaWVsZFNlZWQ6IFtudW1iZXIsIG51bWJlcl0sIHNwcmVhZFB4OiBudW1iZXIsIHdhdGVyOiBudW1iZXIsIG1pZ3JhdGVQeDogbnVtYmVyLCBpbmtTbW9vdGhQeDogbnVtYmVyLCBzdHJva2VEaXI6IFtudW1iZXIsIG51bWJlcl0sIGJyaXN0bGVSYWRpdXNQeD86IG51bWJlcik6IHZvaWRcbiAgZHJhd1JpYmJvbk5pYlBhc3MoZGVzdDogQWNjdW11bGF0aW9uQnVmZmVyLCB0aWxlOiBQYWludFRhcmdldCwgZGFiOiBEYWIsIHByZXNldDogUGVuY2lsUHJlc2V0LCBwcm9maWxlOiBSaWJib25Qcm9maWxlLCBpbmtNb2RlOiA2IHwgNyB8IDEwLCBvcGFjaXR5OiBudW1iZXIsIG93blRhcmdldD86IGJvb2xlYW4sIGlua1dhdGVyPzogbnVtYmVyLCBhY3Jvc3NMb2NhbD86IFtudW1iZXIsIG51bWJlcl0sIHBhcGVyV2V0PzogbnVtYmVyLCBpbmtTdHJlbmd0aD86IG51bWJlciwgbW90dGxlU2VlZD86IFtudW1iZXIsIG51bWJlcl0sIGNsaXBUbz86IEFjY3VtdWxhdGlvbkJ1ZmZlciB8IG51bGwsIGJyaXN0bGVDb21icz86IG51bWJlciwgYnJpc3RsZUluaz86IG51bWJlciwgZGVwdGhUYXU/OiByZWFkb25seSBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0gfCBudWxsLCBwdWRkbGU/OiBudW1iZXIsIHBvb2xCbG90PzogbnVtYmVyKTogdm9pZFxuICBmaWVsZE9wKG91dDogQWNjdW11bGF0aW9uQnVmZmVyLCBhOiBBY2N1bXVsYXRpb25CdWZmZXIsIGI6IEFjY3VtdWxhdGlvbkJ1ZmZlciwgbW9kZTogMCB8IDEgfCAyIHwgMyB8IDQgfCA1IHwgNiB8IDcgfCA4IHwgOSB8IDEwIHwgMTEgfCAxMiB8IDEzIHwgMTQgfCAxNSB8IDE2IHwgMTcgfCAxOCB8IDE5IHwgMjAsIGs6IG51bWJlciwgb3B0cz86IHsgYz86IEFjY3VtdWxhdGlvbkJ1ZmZlcjsgc2Npc3Nvcj86IFtudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXJdOyBkaXI/OiBbbnVtYmVyLCBudW1iZXJdOyBkPzogQWNjdW11bGF0aW9uQnVmZmVyOyBvcmlnaW4/OiBbbnVtYmVyLCBudW1iZXJdOyBiYW5kPzogW251bWJlciwgbnVtYmVyXTsgc2l6ZT86IFtudW1iZXIsIG51bWJlcl07IHRhdT86IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXTsgd29ybGQ/OiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0gfSk6IHZvaWRcbiAgbWFya1BhcGVyRGFtYWdlKGI6IHsgbWluWDogbnVtYmVyOyBtaW5ZOiBudW1iZXI7IG1heFg6IG51bWJlcjsgbWF4WTogbnVtYmVyIH0pOiB2b2lkXG4gIG1hcmtlclNlZ21lbnRMZW5ndGgoZGFiOiBEYWIsIHByZXZEYWI6IERhYiB8IHVuZGVmaW5lZCwgcmFkaXVzOiBudW1iZXIpOiBudW1iZXJcbiAgbmliRHJhd0Nvc3QodGlsZTogUGFpbnRUYXJnZXQsIGRhYjogRGFiLCBwcmVzZXQ6IFBlbmNpbFByZXNldCk6IG51bWJlclxuICBuaWJUb3VjaGVzVGlsZSh0aWxlOiBQYWludFRhcmdldCwgZGFiOiBEYWIsIHByZXNldDogUGVuY2lsUHJlc2V0KTogYm9vbGVhblxuICBwYWdlU2l6ZSgpOiB7IHc6IG51bWJlcjsgaDogbnVtYmVyIH1cbiAgcGFpbnRCcnVzaFN0cm9rZSh0YXJnZXQ6IElMYXllckJ1ZmZlciwgZGFiczogRGFiW10sIHByZXNldDogUGVuY2lsUHJlc2V0LCBzdGFtcDogeyBicnVzaDogQnJ1c2hEZXNjcmlwdG9yOyBwcmVzc3VyZTogQnJ1c2hQcmVzc3VyZVNldHRpbmdzIH0sIGNvbG9yOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0sIHNjcmF0Y2g6IFJpYmJvblN0cm9rZVNjcmF0Y2gsIHByZXZEYWI6IERhYiB8IHVuZGVmaW5lZCk6IHZvaWRcbiAgcmVzb2x2ZVdpdGhpblNoZWV0KHRhcmdldDogSUxheWVyQnVmZmVyLCByOiB7IG1pblg6IG51bWJlcjsgbWluWTogbnVtYmVyOyBtYXhYOiBudW1iZXI7IG1heFk6IG51bWJlciB9KTogUGFpbnRUYXJnZXRbXVxuICByZXZlYWxBZnRlckJhdGNoKHRpbGU6IFBhaW50VGFyZ2V0LCBib3VuZHM6IHsgbWluWDogbnVtYmVyOyBtaW5ZOiBudW1iZXI7IG1heFg6IG51bWJlcjsgbWF4WTogbnVtYmVyIH0sIHByZXY6IEFjY3VtdWxhdGlvbkJ1ZmZlciB8IG51bGwpOiB2b2lkXG4gIHJldmVhbEJlZm9yZUJhdGNoKHRpbGU6IFBhaW50VGFyZ2V0LCBib3VuZHM6IHsgbWluWDogbnVtYmVyOyBtaW5ZOiBudW1iZXI7IG1heFg6IG51bWJlcjsgbWF4WTogbnVtYmVyIH0pOiBBY2N1bXVsYXRpb25CdWZmZXIgfCBudWxsXG4gIHJldmVhbFJlY3QodGlsZTogUGFpbnRUYXJnZXQsIGJvdW5kczogeyBtaW5YOiBudW1iZXI7IG1pblk6IG51bWJlcjsgbWF4WDogbnVtYmVyOyBtYXhZOiBudW1iZXIgfSk6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXJdIHwgbnVsbFxuICB3Y1NoZWV0Q2xhbXAocjogeyBtaW5YOiBudW1iZXI7IG1pblk6IG51bWJlcjsgbWF4WDogbnVtYmVyOyBtYXhZOiBudW1iZXIgfSk6IHsgbWluWDogbnVtYmVyOyBtaW5ZOiBudW1iZXI7IG1heFg6IG51bWJlcjsgbWF4WTogbnVtYmVyIH1cbn1cblxuLyoqIEJ1aWxkcyBhbmQgZGVwb3NpdHMgb25lIHJpYmJvbiBiYXRjaDsgR1BVIGRyYXcgcHJpbWl0aXZlcyBhbmQgZnJhbWUgc2NoZWR1bGluZ1xuICogYXJlIHN1cHBsaWVkIGJ5IHRoZSBlbmdpbmUgd2l0aG91dCBjaGFuZ2luZyB0aGUgb3JkZXIgb2YgcmVuZGVyaW5nLiAqL1xuZXhwb3J0IGNsYXNzIFJpYmJvblN0cm9rZVBhaW50ZXIge1xuICBwcml2YXRlIHJlYWRvbmx5IGN0eDogUmliYm9uU3Ryb2tlUGFpbnRlckNvbnRleHRcbiAgY29uc3RydWN0b3IoY3R4OiBSaWJib25TdHJva2VQYWludGVyQ29udGV4dCkgeyB0aGlzLmN0eCA9IGN0eCB9XG5cblxuICAvKiogIzMzMCDigJQgdGhlIG1hcmtlcidzIHJhc3Rlcml6ZXI6IHRoZSBzdHJva2UgYXMgb25lIGNvbm5lY3RlZCBzd2VwdCBmaWd1cmUuXG4gICAqXG4gICAqICBUaHJlZSBmaWVsZHMgKGNvdmVyYWdlIC8gaW5rTG9hZCAvIGNvbXBvc2l0ZSwgc2VlIFJpYmJvblN0cm9rZVNjcmF0Y2gpOlxuICAgKlxuICAgKiAgLSAqKmNvdmVyYWdlKiogaXMgcGxhaW4gZ2VvbWV0cnksIG5vdCBhbiBhY2N1bXVsYXRpb24gb2Ygc29mdCBwcm9maWxlczogYVxuICAgKiAgICBuaWIgc3RhbXAgYXQgZXZlcnkgc2FtcGxlIChEQUJfRlJBRydzIHVfaW5rTW9kZT02LCBhbiBhbmFseXRpYyBpbi1waXhlbFxuICAgKiAgICBkaXN0YW5jZSB0byB0aGUgbmliJ3Mgb3V0bGluZSkgcGx1cyB0aGUgYmFuZHMgYmV0d2VlbiBjb25zZWN1dGl2ZVxuICAgKiAgICBzYW1wbGVzIChtYXJrZXJSaWJib24udHMgKyBSSUJCT05fRlJBRykuIEJvdGggcmVzb2x2ZSB0aGVpciBlZGdlIG92ZXIgYVxuICAgKiAgICBmaXhlZCB+MSBjYW52YXMgcHggcmFtcCwgc28gdGhlIG1hcmsncyBlZGdlIG5vIGxvbmdlciB3aWRlbnMgd2l0aCB0aGVcbiAgICogICAgYnJ1c2gg4oCUIHRoZSBjb21wbGFpbnQgdGhhdCBzdGFydGVkIGFsbCBvZiB0aGlzLiBUaGVpciB1bmlvbiBpcyBleGFjdDpcbiAgICogICAgZm9yIGEgY29udmV4IG5pYiwgc3dlZXBpbmcgaXQgYWxvbmcgYSBzZWdtZW50IGlzIHByZWNpc2VseSB0aGUgY29udmV4XG4gICAqICAgIGh1bGwgb2YgaXRzIHR3byBlbmRwb2ludCBjb3BpZXMsIHdoaWNoIHN0YW1wK2JhbmQrc3RhbXAgcmVwcm9kdWNlcyB3aXRoXG4gICAqICAgIG5vdGhpbmcgbWlzc2luZyBhbmQgbm90aGluZyBleHRyYSAoc2VlIG1hcmtlclJpYmJvbi50cywgaW5jbHVkaW5nIHdoYXRcbiAgICogICAgaXQgZG9lcyB3aGVuIHRoZSBuaWIgYWxzbyB0dXJucyBiZXR3ZWVuIHNhbXBsZXMpLlxuICAgKiAgLSAqKmlua0xvYWQqKiByaWRlcyB0aGUgKnNhbWUqIGdlb21ldHJ5LCBib3RoIHRoZSBzdGFtcHMgKHVfaW5rTW9kZT03KSBhbmRcbiAgICogICAgdGhlIHJpYmJvbiAoUklCQk9OX0ZSQUcncyBpbmsgbW9kZSksIGVhY2ggY2FycnlpbmcgaGFsZiB0aGUgZGVwb3NpdC5cbiAgICogICAgU3BsYXR0aW5nIGl0IG9ubHkgYXQgdGhlIHN0YW1wcyBpcyB3aGF0IGxlZnQgcm91bmRlZCB3aGl0ZSBub3RjaGVzIG9uXG4gICAqICAgIHR1cm5zOiBiZXR3ZWVuIHN0YW1wcyB0aGUgcmliYm9uIHN0aWxsIG1hZGUgdGhlIG1hcmsgb3BhcXVlLCBidXQgd2l0aCBub1xuICAgKiAgICBpbmsgdGhlcmUgdGhlIGNvbXBvc2l0ZSBtdWx0aXBsaWVkIGJ5IG5vdGhpbmcgYW5kIHRoZSBwYXBlciBzaG93ZWRcbiAgICogICAgdGhyb3VnaC5cbiAgICogIC0gKipjb21wb3NpdGUqKiBydW5zICpvbmNlIHBlciBiYXRjaCogb3ZlciB0aGUgYmF0Y2gncyBvd24gZGlydHkgcmVjdFxuICAgKiAgICByYXRoZXIgdGhhbiBvbmNlIHBlciBkYWIuIEl0IHdhcyBhbHdheXMgYSBwdXJlIHJlY29tcHV0YXRpb24gZnJvbVxuICAgKiAgICAob3JpZ2luYWwsIGNvdmVyYWdlLCBpbmtMb2FkKTsgd2l0aCBjb3ZlcmFnZSBub3cgY29taW5nIGZyb20gZ2VvbWV0cnlcbiAgICogICAgdGhhdCByZWFjaGVzIGJldHdlZW4gdGhlIGRhYnMsIGEgcGVyLWRhYiBxdWFkIHdvdWxkIG5vIGxvbmdlciBjb3ZlclxuICAgKiAgICBldmVyeXRoaW5nIHRoZSBvdGhlciB0d28gcGFzc2VzIGp1c3Qgd3JvdGUuXG4gICAqXG4gICAqICBCbGVuZGluZyBmb3IgY292ZXJhZ2Ugc3RheXMgdGhlIG9yZGluYXJ5IHNhdHVyYXRpbmcgXCJvdmVyXCIgcmF0aGVyIHRoYW5cbiAgICogIG5lZWRpbmcgRVhUX2JsZW5kX21pbm1heDogaW50ZXJpb3IgY292ZXJhZ2UgaGVyZSBpcyBhIGZsYXQgMS4wLCBhbmRcbiAgICogIG92ZXIoeCwgMSkgPT0gMSwgc28gYSBzdGFtcCdzIGFudGlhbGlhc2VkIHJpbSBsYW5kaW5nIGluc2lkZSBhIGJhbmQgKG9yXG4gICAqICB2aWNlIHZlcnNhKSByZXNvbHZlcyB0byBzb2xpZCBlaXRoZXIgd2F5LiBUaGUgdHdvIG9ubHkgZXZlciBtZWV0IGF0IGFcbiAgICogIHRhbmdlbnQgcG9pbnQsIHdoZXJlIGJvdGggYXJlIHJhbXBpbmcsIGFuZCB0aGUgZGlmZmVyZW5jZSBiZXR3ZWVuIG1heCBhbmRcbiAgICogIG92ZXIgdGhlcmUgaXMgYSBmcmFjdGlvbiBvZiBvbmUgcGl4ZWwuICovXG4gICpwYWludChcbiAgICB0YXJnZXQ6IElMYXllckJ1ZmZlciwgZGFiczogRGFiW10sIHByZXNldDogUGVuY2lsUHJlc2V0LCBwcmVzZXROYW1lOiBzdHJpbmcsIHByb2ZpbGU6IFJpYmJvblByb2ZpbGUsXG4gICAgY29sb3I6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSwgc2NyYXRjaDogUmliYm9uU3Ryb2tlU2NyYXRjaCwgcHJldkRhYjogRGFiIHwgdW5kZWZpbmVkLFxuICAgIC8qKiAoIzUzNikgT25lIGhleCBkaWdpdCBwZXIgZGFiIG9mIGBkYWJzYCwgc2F5aW5nIGhvdyB3ZXQgdGhlIHBhcGVyIGVhY2hcbiAgICAgKiAgbGFuZGVkIG9uIGFscmVhZHkgd2FzIOKAlCBzZWUgcGFwZXJXZXRuZXNzLnRzLiBTbGljZWQgdG8gdGhpcyBjYWxsJ3Mgb3duXG4gICAgICogIGRhYnMgYnkgdGhlIGNhbGxlciwgc28gaW5kZXggMCBpcyBkYWJzWzBdIG9uIGV2ZXJ5IHBhdGguICovXG4gICAgd2V0UHJvZmlsZT86IHN0cmluZyxcbiAgICBzdHJva2VTZWVkPzogW251bWJlciwgbnVtYmVyXSxcbiAgICAvKiogKCM1MzYsIMKnMTcuMjIpIFNlZSBfcGFpbnRSaWJib25EYWJzOiB0aGUgbGl2ZSBnZXN0dXJlJ3MgY29tcG9zaXRlIHdhaXRzIGZvciB0aGUgZnJhbWUuICovXG4gICAgZGVmZXJDb21wb3NpdGUgPSBmYWxzZSxcbiAgICAvKiogKMKnMTcuNzApIFNlZSBfcmliYm9uRGFic1dvcmsuICovXG4gICAgcGllY2VUcmlzID0gMCxcbiAgKTogR2VuZXJhdG9yPG51bWJlciwgdm9pZCwgdm9pZD4ge1xuICAgIC8vIFR3byBkaWZmZXJlbnQgdHJlYXRtZW50cyBvZiBhIGRhYiB0b28gdGhpbiB0byByZXNvbHZlLCBhbmQgd2hpY2ggb25lIGFcbiAgICAvLyB0b29sIGdldHMgaXMgdGhlIHdob2xlIG9mIFJpYmJvblByb2ZpbGUubWluSGFsZldpZHRoUHggKCM0NTQpLiBUaGVcbiAgICAvLyBtYXJrZXIgZHJvcHMgaXQ6IGEgc3ViLWhhbGYtcGl4ZWwgbWFya2VyIGRhYiBpcyBkZWdlbmVyYXRlLiBUaGUgYnJ1c2hcbiAgICAvLyBwZW4gd2lkZW5zIGl0IHRvIHRoZSBmbG9vciBpbnN0ZWFkLCBiZWNhdXNlIGZvciBhIHRvb2wgd2hvc2Ugd2lkdGhcbiAgICAvLyBmbG9vciBpcyAwLjE1IG9mIGEgc2l6ZSB0aGUgdXNlciBtYXkgc2V0IHRvIDNweCwgXCJkcm9wIGl0XCIgbWVhbnNcbiAgICAvLyBkZWxldGluZyB0aGUgdGhpbiBlbmQgb2YgZXZlcnkgc3Ryb2tlIOKAlCB0aGUgZmlyc3QgdGhpbmcgQURSIDAwOSBhc2tzXG4gICAgLy8gdGhlIHRvb2wgdG8gYmUgYWJsZSB0byBkcmF3LlxuICAgIC8vXG4gICAgLy8gQ29waWVzIHJhdGhlciB0aGFuIG11dGF0aW5nOiB0aGVzZSBEYWIgb2JqZWN0cyBhcmUgdGhlIG9uZXMgcmVjb3JkZWQgb25cbiAgICAvLyB0aGUgU3Ryb2tlT3BlcmF0aW9uIGFuZCBzdHJlYW1lZCB0byBwZWVycywgYW5kIGEgZHJhdy10aW1lIGNsYW1wIG11c3RcbiAgICAvLyBub3QgcmV3cml0ZSB3aGF0IHRoZSBvcGVyYXRpb24gc2F5cy4gQmVpbmcgYSBwdXJlIGZ1bmN0aW9uIG9mIGRhYi5zaXplLFxuICAgIC8vIGl0IGxhbmRzIGlkZW50aWNhbGx5IG9uIGV2ZXJ5IHJlcGxheSBhbnl3YXkuXG4gICAgY29uc3QgZmxvb3JQeCA9IHByb2ZpbGUubWluSGFsZldpZHRoUHhcbiAgICAvLyAoIzUzNiwgwqcxNy42NCkgRWFjaCBkYWIncyBwbGFjZSBpbiBgZGFic2AsIHdoaWNoIGlzIHdoYXQgdGhlIHJlY29yZGVkXG4gICAgLy8gd2V0IHByb2ZpbGUgaXMgaW5kZXhlZCBieSAtIG9uZSBkaWdpdCBwZXIgZGFiIG9mIHRoZSBvcGVyYXRpb24gKG9yIG9mXG4gICAgLy8gdGhlIGxpdmUgYmF0Y2gncyBzbGljZSkuIFRoZSBmaWx0ZXJzIGJlbG93IGRyb3AgZGFicywgYW5kIHJlYWRpbmcgdGhlXG4gICAgLy8gcHJvZmlsZSBieSBwb3NpdGlvbiBpbiB3aGF0IGlzIGxlZnQgc2hpZnRlZCBldmVyeSBkaWdpdCBhZnRlciB0aGUgZmlyc3RcbiAgICAvLyBvbmUgZHJvcHBlZCAtIGJ5IGhvdyBtYW55IHdlcmUgZHJvcHBlZCBiZWZvcmUgaXQgaW4gVEhJUyBjYWxsLCBzbyBhIGxpdmVcbiAgICAvLyBzdHJva2UgYW5kIGl0cyBvbmUtYmF0Y2ggcmVwbGF5IHJlYWQgZGlmZmVyZW50IHBhcGVyIHVuZGVyIHRoZSBzYW1lIGRhYi5cbiAgICBjb25zdCB3ZXRJbmRleCA9IG5ldyBNYXA8RGFiLCBudW1iZXI+KClcbiAgICBsZXQgZHJhd2FibGUgPSBmbG9vclB4ID09PSBudWxsXG4gICAgICA/IGRhYnMuZmlsdGVyKChkLCBpKSA9PiB7IHdldEluZGV4LnNldChkLCBpKTsgcmV0dXJuIGQuc2l6ZSAqIDAuNSAqIHByZXNldC5zaXplTXVsdGlwbGllciA+PSAwLjUgfSlcbiAgICAgIDogZGFicy5tYXAoKGQsIGkpID0+IHtcbiAgICAgICAgY29uc3QgaGFsZiA9IGQuc2l6ZSAqIDAuNSAqIHByZXNldC5zaXplTXVsdGlwbGllclxuICAgICAgICBjb25zdCBvdXQgPSBoYWxmID49IGZsb29yUHggPyBkIDogeyAuLi5kLCBzaXplOiAoZmxvb3JQeCAqIDIpIC8gcHJlc2V0LnNpemVNdWx0aXBsaWVyIH1cbiAgICAgICAgd2V0SW5kZXguc2V0KG91dCwgaSlcbiAgICAgICAgcmV0dXJuIG91dFxuICAgICAgfSlcbiAgICAvLyAtMSBmb3IgYSBkYWIgbm90IG9mIHRoaXMgY2FsbCAodGhlIGJyaWRnaW5nIHByZXZEYWIpLCBhcyB0aGUgbG9vcCBiZWxvdyByZWFkIGl0LlxuICAgIGNvbnN0IHdldE9mID0gKGQ6IERhYik6IG51bWJlciA9PiB3ZXRBdCh3ZXRQcm9maWxlLCB3ZXRJbmRleC5nZXQoZCkgPz8gLTEpXG4gICAgLy8gKMKnMTcuMjgpIFRoZSBkZXBvc2l0IGFzIGEgRklMTSB1bmRlciBNQVggYmxlbmRpbmcgLSBzZWUgUmliYm9uVGlsZVNjcmF0Y2guc3Ryb2tlSW5rLlxuICAgIGNvbnN0IGZpbG0gPSBwcm9maWxlLm5vcm1hbGl6ZURlcG9zaXQgJiYgISF0aGlzLmN0eC5taW5tYXhFeHQoKSAmJiAhIXNjcmF0Y2hcbiAgICAvLyAowqcxNy4yOCkgT25seSB0aGUgZGFicyB0aGF0IE1PVkVEIGRlcG9zaXQgLSBzZWUgd2F0ZXJjb2xvclRyYXZlbFF1YW50dW0uXG4gICAgLy8gVGhlIGFuY2hvciBpcyB0aGUgbGFzdCBkYWIga2VwdCwgY2FycmllZCBvbiB0aGUgc2NyYXRjaCBhY3Jvc3MgdGhlXG4gICAgLy8gZ2VzdHVyZSdzIGJhdGNoZXMgc28gYSBsaXZlIHN0cm9rZSBhbmQgaXRzIHJlcGxheSBrZWVwIHRoZSBzYW1lIGRhYnMuXG4gICAgaWYgKHByb2ZpbGUubm9ybWFsaXplRGVwb3NpdCAmJiBzY3JhdGNoKSB7XG4gICAgICAvLyDigKZhbmQgdGhlIHJpYmJvbiBicmlkZ2VzIGZyb20gdGhlIGxhc3Qga2VwdCBkYWIsIG5ldmVyIGZyb20gYSBkcm9wcGVkXG4gICAgICAvLyBvbmUsIHNvIHRoZSBiYW5kcycgZ2VvbWV0cnkgaXMgdGhlIHNhbWUgc2V0IG9mIGRhYnMgbGl2ZSBhbmQgcmVwbGF5ZWQuXG4gICAgICBpZiAoc2NyYXRjaC5sYXN0S2VwdCkgcHJldkRhYiA9IHNjcmF0Y2gubGFzdEtlcHRcbiAgICAgIGNvbnN0IGtlcHQ6IERhYltdID0gW11cbiAgICAgIGxldCBhbmNob3IgPSBwcmV2RGFiXG4gICAgICBmb3IgKGNvbnN0IGQgb2YgZHJhd2FibGUpIHtcbiAgICAgICAgY29uc3QgcSA9IHdhdGVyY29sb3JUcmF2ZWxRdWFudHVtKGQuc2l6ZSAqIDAuNSAqIHByZXNldC5zaXplTXVsdGlwbGllcilcbiAgICAgICAgaWYgKCFhbmNob3IgfHwgTWF0aC5oeXBvdChkLnggLSBhbmNob3IueCwgZC55IC0gYW5jaG9yLnkpID49IHEpIHsga2VwdC5wdXNoKGQpOyBhbmNob3IgPSBkIH1cbiAgICAgIH1cbiAgICAgIGlmIChrZXB0Lmxlbmd0aCkgc2NyYXRjaC5sYXN0S2VwdCA9IGtlcHRba2VwdC5sZW5ndGggLSAxXVxuICAgICAgZHJhd2FibGUgPSBrZXB0XG4gICAgfVxuICAgIGlmICghZHJhd2FibGUubGVuZ3RoKSByZXR1cm5cbiAgICAvLyAjNTczIOKAlCBhIGRpZ2l0YWwgYnJ1c2ggb24gdGhlIHN0YW1wIG1vZGVsIGtlZXBzIHRoaXMgbWFjaGluZXJ5J3Mgc2NyYXRjaFxuICAgIC8vICh0aGUgZnJvemVuIGxheWVyLCB0aGUgc3Ryb2tlJ3MgY292ZXJhZ2UpIGFuZCBub3RoaW5nIGVsc2Ugb2YgaXQuXG4gICAgaWYgKHByb2ZpbGUuYnJ1c2hTdGFtcCkge1xuICAgICAgdGhpcy5jdHgucGFpbnRCcnVzaFN0cm9rZSh0YXJnZXQsIGRyYXdhYmxlLCBwcmVzZXQsIHByb2ZpbGUuYnJ1c2hTdGFtcCwgY29sb3IsIHNjcmF0Y2gsIHByZXZEYWIpXG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCB7IG5pYlNoYXBlLCBjb3JuZXJGcmFjdGlvbiB9ID0gcHJvZmlsZVxuXG4gICAgLy8gT25lIGJvdW5kcyBib3ggZm9yIHRoZSB3aG9sZSBiYXRjaDogdGhlIHRpbGVzIHRvIHBhaW50LCBhbmQgdGhlIHJlY3QgdGhlXG4gICAgLy8gc2luZ2xlIGNvbXBvc2l0ZSBwYXNzIGNvdmVycy4gUGFkZGVkIHBlciBkYWIgYnkgdGhlIHNhbWUgaGFsZi1leHRlbnRzIHRoZVxuICAgIC8vIG9yZGluYXJ5IGdyYXBoaXRlIHBhdGggdXNlcywgc28gYSBjaGlzZWwgbmliJ3MgNXggcmVhY2ggaXMgYWNjb3VudGVkIGZvci5cbiAgICBsZXQgbWluWCA9IEluZmluaXR5LCBtaW5ZID0gSW5maW5pdHksIG1heFggPSAtSW5maW5pdHksIG1heFkgPSAtSW5maW5pdHlcbiAgICAvLyAoIzUzNikg4oCmYW5kIGJ5IHRoZSBoYWxvIGEgd2V0LXBhcGVyIGRhYiBsYXlzIGFyb3VuZCBpdHNlbGYsIGF0IHRoZSB3aWRlc3RcbiAgICAvLyBpdCBjYW4gYmUgZm9yIHRoYXQgd2V0bmVzcyDigJQgdGhpcyBpcyBhIGJvdW5kLCBhbmQgZXJyaW5nIG91dHdhcmQgaXMgdGhlXG4gICAgLy8gY2hlYXAgZGlyZWN0aW9uLiBTZWUgd2F0ZXJjb2xvckhhbG8uXG4gICAgY29uc3QgaGFsb0JvdW5kID0gKGQ6IERhYik6IG51bWJlciA9PlxuICAgICAgcHJvZmlsZS5ub3JtYWxpemVEZXBvc2l0ID8gd2F0ZXJjb2xvckhhbG8od2V0T2YoZCksIDEpLnNjYWxlIDogMVxuICAgIC8vIOKApmFuZCB0aGUgcmVhY2ggdGhlIGhhbG8gaXMgYWxsb3dlZCBwYXN0IHRoZSBibG9vbSwgYXQgdGhlIGNhcDogdGhlXG4gICAgLy8gZ2VzdHVyZSdzIG93biBzcHJlYWQgaXMgbm90IHJlc29sdmVkIHVudGlsIGZ1cnRoZXIgZG93biwgYW5kIHRoaXMgaXMgYVxuICAgIC8vIGJvdW5kLCBzbyB0aGUgY2VpbGluZyBzdGFuZHMgaW4uXG4gICAgY29uc3QgaGFsb1Bhc3QgPSAoZDogRGFiKTogbnVtYmVyID0+XG4gICAgICBwcm9maWxlLm5vcm1hbGl6ZURlcG9zaXQgJiYgd2V0T2YoZCkgPiAwXG4gICAgICAgID8gV0FURVJDT0xPUl9IQUxPX1BBU1RfQkxPT00gKiBXQVRFUkNPTE9SX1NQUkVBRC5jYXAgOiAwXG4gICAgLy8gKMKnMTcuNDYpIFR3byByZWN0cy4gVGhlIFJFQUNIIChoYWxvIGJvdW5kIGluY2x1ZGVkKSBpcyB3aGF0IHRoZSBnZXN0dXJlXG4gICAgLy8gaGFuZHMgaXRzIHNldHRsZSBhcyB0aGUgd2luZG93IHRoZSB3ZXQtaW4td2V0IG1heSBtb3ZlIHBhaW50IGluIC0gY3V0XG4gICAgLy8gdG8gdGhlIGRhYnMsIHRoZSBzZXR0bGUncyBmaWVsZCBlbmRlZCBhdCB0aGUgYnJ1c2gncyBvd24gZm9vdHByaW50IGFuZFxuICAgIC8vIGxlZnQgaGFyZCBzdHJhaWdodCBlZGdlcyB0aHJvdWdoIHRoZSB3YXNoIChyZXBsYXkgb2YgSGNwa3p3TlgpLiBUaGVcbiAgICAvLyBQQUlOVCByZWN0IC0gdGlsZXMsIGZpbG0gcmVidWlsZCwgbGl2ZSBjb21wb3NpdGUgLSBvbmx5IG5lZWRzIHdoYXQgaXNcbiAgICAvLyBhY3R1YWxseSBsYWlkLCBhbmQgd2l0aCB0aGUgaGFsbyBzdGFtcCBvZmYgKFdBVEVSQ09MT1JfSEFMT19EUkFXTikgdGhhdFxuICAgIC8vIGlzIHRoZSBkYWJzOiB0aGUgcmVhY2ggbWFkZSBhIGJpZyBicnVzaCBpbiBpdHMgb3duIHdldCB3YXNoIHJlcGFpbnQgYW5kXG4gICAgLy8gcmVjb21wb3NpdGUgdGhyZWUgdG8gZm91ciB0aW1lcyB0aGUgYXJlYSBldmVyeSBmcmFtZSwgdGhlIHRhYmxldCdzIG9uZVxuICAgIC8vIGRyb3BwZWQgZnJhbWUgaW4gc2l4LlxuICAgIGxldCByTWluWCA9IEluZmluaXR5LCByTWluWSA9IEluZmluaXR5LCByTWF4WCA9IC1JbmZpbml0eSwgck1heFkgPSAtSW5maW5pdHlcbiAgICAvLyAoIzUzNiwgwqcxNy42NSkgQSBkYWIgd2hvc2UgcmVhY2ggbWlzc2VzIHRoZSBzaGVldCBhZGRzIG5vdGhpbmcgdG8gZWl0aGVyXG4gICAgLy8gcmVjdC4gSnVkZ2VkIHBlciBkYWIsIHNvIGhvdyB0aGUgZ2VzdHVyZSB3YXMgY3V0IGludG8gYmF0Y2hlcyBjYW5ub3RcbiAgICAvLyBtYXR0ZXI6IGEgbGl2ZSBiYXRjaCBvZmYgdGhlIHNoZWV0IGNvbnRyaWJ1dGVkIG5vdGhpbmcgKGl0IHBhaW50c1xuICAgIC8vIG5vdGhpbmcpLCB3aGlsZSBhIHJlcGxheSdzIG9uZSBiYXRjaCBzdHJldGNoZWQgaXRzIHJlY3QgLSBhbmQgdGhlIHNldHRsZVxuICAgIC8vIHdpbmRvdyBhZnRlciBpdCAtIG92ZXIgdGhlIHdob2xlIG9mZi1zaGVldCBydW4uIEEgdGFpbCBkcmF3biBkb3duIHBhc3RcbiAgICAvLyB0aGUgc2hlZXQncyByaWdodCBlZGdlIHB1bGxlZCB0aGUgd2luZG93IDkwMCBweCBsb3dlciwgcGFzdCB0aGUgZmllbGQnc1xuICAgIC8vIGNhcCwgYW5kIHRoZSBjcm9wIGxlZnQgdGhlIHdhc2gncyBvd24gdG9wIG91dCBvZiB0aGUgZHJ5IHRpZGUuXG4gICAgY29uc3Qgc2hlZXQgPSBwcm9maWxlLm5vcm1hbGl6ZURlcG9zaXQgJiYgIXRoaXMuY3R4LmluZmluaXRlKCkgPyB0aGlzLmN0eC5wYWdlU2l6ZSgpIDogbnVsbFxuICAgIGZvciAoY29uc3QgZCBvZiBwcmV2RGFiID8gW3ByZXZEYWIsIC4uLmRyYXdhYmxlXSA6IGRyYXdhYmxlKSB7XG4gICAgICBjb25zdCB7IGh4LCBoeSB9ID0gdGhpcy5jdHguZGFiV29ybGRIYWxmRXh0ZW50cyhkLCBmYWxzZSwgcHJlc2V0KVxuICAgICAgY29uc3QgZyA9IGhhbG9Cb3VuZChkKSwgcGFzdCA9IGhhbG9QYXN0KGQpXG4gICAgICBpZiAoc2hlZXQgJiYgKGQueCArIGh4ICogZyArIHBhc3QgPD0gMCB8fCBkLnkgKyBoeSAqIGcgKyBwYXN0IDw9IDBcbiAgICAgICAgfHwgZC54IC0gaHggKiBnIC0gcGFzdCA+PSBzaGVldC53IHx8IGQueSAtIGh5ICogZyAtIHBhc3QgPj0gc2hlZXQuaCkpIGNvbnRpbnVlXG4gICAgICByTWluWCA9IE1hdGgubWluKHJNaW5YLCBkLnggLSBoeCAqIGcgLSBwYXN0KTsgck1heFggPSBNYXRoLm1heChyTWF4WCwgZC54ICsgaHggKiBnICsgcGFzdClcbiAgICAgIHJNaW5ZID0gTWF0aC5taW4ock1pblksIGQueSAtIGh5ICogZyAtIHBhc3QpOyByTWF4WSA9IE1hdGgubWF4KHJNYXhZLCBkLnkgKyBoeSAqIGcgKyBwYXN0KVxuICAgICAgY29uc3QgcGcgPSBXQVRFUkNPTE9SX0hBTE9fRFJBV04gPyBnIDogMSwgcHAgPSBXQVRFUkNPTE9SX0hBTE9fRFJBV04gPyBwYXN0IDogMFxuICAgICAgbWluWCA9IE1hdGgubWluKG1pblgsIGQueCAtIGh4ICogcGcgLSBwcCk7IG1heFggPSBNYXRoLm1heChtYXhYLCBkLnggKyBoeCAqIHBnICsgcHApXG4gICAgICBtaW5ZID0gTWF0aC5taW4obWluWSwgZC55IC0gaHkgKiBwZyAtIHBwKTsgbWF4WSA9IE1hdGgubWF4KG1heFksIGQueSArIGh5ICogcGcgKyBwcClcbiAgICB9XG4gICAgY29uc3QgYm91bmRzID0geyBtaW5YLCBtaW5ZLCBtYXhYLCBtYXhZIH1cbiAgICAvLyBUaGUgdGlsZXMgb3ZlciB0aGUgUkVBQ0gsIGFzIGJlZm9yZTogYSB0aWxlIHRoZSBzZXR0bGUgaXMgdG8gc3ByZWFkXG4gICAgLy8gaW50byBuZWVkcyBpdHMgd2FzaCBlbnRyeSwgYW5kIHRoZSBwYWludCByZWN0IGFsb25lIGxlZnQgYSBkcm9wIGFjcm9zc1xuICAgIC8vIHRoZSBib3VuZGVkIHJvb20ncyB4PTEwMjQgc2VhbSB1bmFibGUgdG8gcnVuIGludG8gdGhlIG5leHQgdGlsZS4gUGVyXG4gICAgLy8gdGlsZSwgdGhlIGZpbG0gcmVidWlsZCBhbmQgY29tcG9zaXRlIGFyZSBjdXQgdG8gdGhlIHBhaW50IHJlY3QuXG4gICAgY29uc3QgcmVhY2hSZWN0ID0geyBtaW5YOiByTWluWCwgbWluWTogck1pblksIG1heFg6IHJNYXhYLCBtYXhZOiByTWF4WSB9XG4gICAgY29uc3QgdGFyZ2V0cyA9IHRoaXMuY3R4LnJlc29sdmVXaXRoaW5TaGVldCh0YXJnZXQsIHByb2ZpbGUubm9ybWFsaXplRGVwb3NpdCA/IHRoaXMuY3R4LndjU2hlZXRDbGFtcChyZWFjaFJlY3QpIDogcmVhY2hSZWN0KVxuICAgIC8vICgjNTM2LCDCpzE3LjYzKSBOb3QgeWV0OiBhIGJhdGNoIHdpdGggbm90aGluZyBvbiB0aGUgc2hlZXQgc3RpbGwgc3BlbmRzXG4gICAgLy8gdGhlIGdlc3R1cmUncyBicnVzaCAtIHNlZSB0aGUgcmV0dXJuIGFmdGVyIHRoZSBkZXBvc2l0IGxvb3AuXG5cbiAgICAvLyAoIzQ2OCB2Mi92NCwgQURSIDAxMSDCpzMuNSkgVGhlIHN0cm9rZSdzIHR5cGljYWwgcmFkaXVzIGRlY2lkZXMgaG93IGZhciBpdHNcbiAgICAvLyB3YXRlciBjYXJyaWVzLiBNZWFuIHJhdGhlciB0aGFuIG1heDogb25lIGhlYXZ5IGRhYiBhdCB0aGUgZW5kIG9mIGFuXG4gICAgLy8gb3RoZXJ3aXNlIGxpZ2h0IHN0cm9rZSBzaG91bGQgbm90IHdpZGVuIHRoZSB3aG9sZSBtYXJrJ3MgYm91bmRhcnlcbiAgICAvLyB0cmVhdG1lbnQuXG4gICAgLy8gKCM0NjggdjYpIFRoZSBkZXBvc2l0J3MgcmlwcGxlIGhhcyBleGFjdGx5IHRoZSBkYWIgc3BhY2luZyBmb3IgYSBwZXJpb2QsXG4gICAgLy8gc28gdGhhdCBpcyB3aGF0IGl0IG11c3QgYmUgcmVhZCBiYWNrIG92ZXIuIFRoZSBmaXJzdCBhdHRlbXB0IGd1ZXNzZWQgaXRcbiAgICAvLyBmcm9tIHRoZSBmaXJzdCBkYWIncyByYWRpdXMgYW5kIGxhbmRlZCBhdCBhIHF1YXJ0ZXIgb2YgdGhlIHRydWUgdmFsdWUg4oCUXG4gICAgLy8gdGhlIHJpbmcgY2FtZSBvdXQgMy44cHggd2lkZSBhZ2FpbnN0IGEgMTUuNHB4IHBlcmlvZCBhbmQgY2FuY2VsbGVkXG4gICAgLy8gZXNzZW50aWFsbHkgbm90aGluZywgd2hpY2ggaXMgd2h5IHRoZSBjaXJjbGVzIHN1cnZpdmVkIHRoZSBmaXJzdCBmaXguXG4gICAgY29uc3QgZmlyc3RHYXAgPSBkcmF3YWJsZS5sZW5ndGggPj0gMlxuICAgICAgPyBNYXRoLmh5cG90KGRyYXdhYmxlWzFdLnggLSBkcmF3YWJsZVswXS54LCBkcmF3YWJsZVsxXS55IC0gZHJhd2FibGVbMF0ueSlcbiAgICAgIDogKHByZXZEYWIgPyBNYXRoLmh5cG90KGRyYXdhYmxlWzBdLnggLSBwcmV2RGFiLngsIGRyYXdhYmxlWzBdLnkgLSBwcmV2RGFiLnkpIDogMClcbiAgICBjb25zdCBkYWJTcGFjaW5nID0gc2NyYXRjaC5ub3RlRGFiU3BhY2luZyhmaXJzdEdhcClcbiAgICBjb25zdCBkaXJGcm9tID0gZHJhd2FibGUubGVuZ3RoID49IDIgPyBkcmF3YWJsZVswXSA6IHByZXZEYWJcbiAgICBjb25zdCBkaXJUbyA9IGRyYXdhYmxlLmxlbmd0aCA+PSAyID8gZHJhd2FibGVbMV0gOiBkcmF3YWJsZVswXVxuICAgIGNvbnN0IHN0cm9rZURpciA9IHNjcmF0Y2gubm90ZURpcmVjdGlvbihcbiAgICAgIGRpckZyb20gPyBkaXJUby54IC0gZGlyRnJvbS54IDogMCwgZGlyRnJvbSA/IGRpclRvLnkgLSBkaXJGcm9tLnkgOiAwLFxuICAgIClcbiAgICAvLyAoIzUzNikgSG93IHdldCB0aGUgcGFwZXIgd2FzIHdoZXJlIHRoaXMgZ2VzdHVyZSBjYW1lIGRvd24uIFJlYWQgb25jZSxcbiAgICAvLyBhYm92ZSBldmVyeXRoaW5nIHRoYXQgbmVlZHMgaXQg4oCUIHRoZSBjb21wb3NpdGUncyBjYWNoZWQgc2NhbGFycyB3YW50IGl0XG4gICAgLy8gYXMgbXVjaCBhcyB0aGUgZGVwb3NpdCBkb2VzLlxuICAgIC8vIExhbmRpbmcgYmVsb25ncyB0byB0aGUgZ2VzdHVyZSwgbm90IHRvIHRoZSBuZXh0IHBvaW50ZXIgYmF0Y2guXG4gICAgY29uc3QgbGFuZGVkV2V0ID0gc2NyYXRjaC5maW5pc2hDb250ZXh0Py5sYW5kZWRXZXQgPz8gd2V0QXQod2V0UHJvZmlsZSwgMClcbiAgICBjb25zdCB3ZXRQZWFrSGVyZSA9IHdldFBlYWsod2V0UHJvZmlsZSlcbiAgICBmb3IgKGNvbnN0IGQgb2YgZHJhd2FibGUpIGlmICh3ZXRPZihkKSA+PSAwLjMpIHNjcmF0Y2gud2V0Q29udGFjdHMucHVzaCh7XG4gICAgICB4OiBkLngsIHk6IGQueSwgcmFkaXVzOiBkLnNpemUgKiAwLjUgKiBwcmVzZXQuc2l6ZU11bHRpcGxpZXIsXG4gICAgICBhc3BlY3Q6IE1hdGgubWF4KDEsIGQuYXNwZWN0UmF0aW8pLCBhbmdsZTogZC5hbmdsZSxcbiAgICB9KVxuICAgIGNvbnN0IHsgc3ByZWFkUHgsIHdhdGVyOiBmcmluZ2VXYXRlciwgbWlncmF0ZVB4LCBmaWVsZFNlZWQsIGJyaXN0bGVSYWRpdXNQeCB9ID0gc2NyYXRjaC5jb21wb3NpdGVTY2FsYXJzKCgpID0+IHtcbiAgICAgIC8vICM0ODk6IHRoZSBibG9vbSBpcyBpc290cm9waWMsIHNvIGEgbmliIHRoYXQgaXMgbm90IHJvdW5kIGlzIG1lYXN1cmVkIGJ5XG4gICAgICAvLyB0aGUgY2lyY2xlIHdpdGggaXRzIGFyZWEgcmF0aGVyIHRoYW4gYnkgZWl0aGVyIGF4aXMuIElkZW50aWNhbCB0byB0aGVcbiAgICAgIC8vIG9sZCBgc2l6ZSAqIDAuNWAgZm9yIGEgcm91bmQgbmliLlxuICAgICAgY29uc3QgZmlyc3QgPSBkcmF3YWJsZVswXVxuICAgICAgY29uc3QgZmlyc3RNaW5vciA9IGZpcnN0LnNpemUgKiAwLjUgKiBwcmVzZXQuc2l6ZU11bHRpcGxpZXJcbiAgICAgIGNvbnN0IGZpcnN0UmFkaXVzID0gTWF0aC5tYXgoXG4gICAgICAgIHdhdGVyY29sb3JTcHJlYWRSYWRpdXMoZmlyc3RNaW5vciAqIE1hdGgubWF4KGZpcnN0LmFzcGVjdFJhdGlvLCAxKSwgZmlyc3RNaW5vciksIDAuNSxcbiAgICAgIClcbiAgICAgIHJldHVybiB7XG4gICAgICAgIC8vICgjNTM2KSBObyBsb25nZXIgZ2F0ZWQgYnkgdGhlIHdldG5lc3MgdW5kZXIgdGhlIGxhbmRpbmcgcG9pbnQsIGFuZFxuICAgICAgICAvLyB0aGF0IGdhdGUgd2FzIHRoZSBzaW5nbGUgd29yc3QgdGhpbmcgYWJvdXQgd2V0LWluLXdldC5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gVGhlIGJsb29tIHVzZWQgdG8gYmUgYmFrZWQgaW50byB0aGlzIGdlc3R1cmUtd2lkZSBudW1iZXIgb3V0IG9mIHRoZVxuICAgICAgICAvLyBvbmUgZGlnaXQgdW5kZXIgdGhlIGZpcnN0IGRhYi4gU28gYSBicnVzaCBzZXQgZG93biAqaW4qIGEgcHVkZGxlXG4gICAgICAgIC8vIHNwcmVhZCB0aHJlZSB0aW1lcyBhcyBmYXIgZm9yIHRoZSB3aG9sZSBvZiBpdHMgdHJhdmVsLCBpbmNsdWRpbmcgdGhlXG4gICAgICAgIC8vIGRyeSBwYXBlciBpdCB3ZW50IG9uIHRvIGNyb3NzLCBhbmQgYSBicnVzaCB0aGF0IHN0YXJ0ZWQgb24gZHJ5IHBhcGVyXG4gICAgICAgIC8vIGFuZCByYW4gdGhyb3VnaCB0aGUgcHVkZGxlIGdvdCBubyBibG9vbSBhbnl3aGVyZSDigJQgXCLQtdGB0LvQuCDQstC10LTRgyDRgVxuICAgICAgICAvLyDRgdGD0YXQvtCz0L4g0YfQtdGA0LXQtyDQu9GD0LbRgyDQvdCwINGB0YPRhdC+0LUsINGI0YLRgNC40YUg0LvQvtC20LjRgtGB0Y8g0L/QvtC70L3QvtGB0YLRjNGOINGB0YPRhdC40LxcIi4gV29yc2UsIGF0XG4gICAgICAgIC8vIGEgMTYgcHggY2VsbCB0aGUgZmlyc3QgZGFiIGxhbmRpbmcgaW4gYSB3ZXQgY2VsbCBvciBhIGRyeSBvbmUgbmVhciB0aGVcbiAgICAgICAgLy8gZWRnZSBpcyBjbG9zZSB0byBhIGNvaW4gdG9zcywgd2hpY2ggaXMgdGhlIFwi0LjQvdC+0LPQtNCwXCIgaW4gZXZlcnkgb25lIG9mXG4gICAgICAgIC8vIHRob3NlIHJlcG9ydHMuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIFRoZSBibG9vbSBpcyBub3cgYXBwbGllZCBwZXIgcGl4ZWwgaW4gdGhlIGNvbXBvc2l0ZSwgb2ZmIHRoZSBkZXBvc2l0J3NcbiAgICAgICAgLy8gb3duIHJlY29yZCBvZiB3aGF0IHRoZSBwYXBlciB1bmRlciBpdCB3YXMgY2FycnlpbmcgKERBQl9GUkFHJ3NcbiAgICAgICAgLy8gcGFwZXJXZXRIZXJlKS4gVGhpcyBzdGF5cyB0aGUgKmRyeSogcmVhY2gsIGkuZS4gdGhlIGNlaWxpbmcgdGhlXG4gICAgICAgIC8vIHNoYWRlciBzY2FsZXMgdXAgZnJvbSB3aGVyZSB0aGUgcGFwZXIgd2FzIGFjdHVhbGx5IHdldCDigJQgc28gYSBzdHJva2VcbiAgICAgICAgLy8gYmxvb21zIGluIHRoZSBwdWRkbGUgYW5kIHN0YXlzIHRpZ2h0IGVpdGhlciBzaWRlIG9mIGl0LCBpbnNpZGUgb25lXG4gICAgICAgIC8vIG1hcmsuXG4gICAgICAgIHNwcmVhZFB4OiBwcm9maWxlLnNwcmVhZFB4ID4gMCAmJiBwcm9maWxlLnNwcmVhZE9mUmFkaXVzID4gMFxuICAgICAgICAgID8gTWF0aC5taW4oXG4gICAgICAgICAgICBwcm9maWxlLnNwcmVhZFB4LFxuICAgICAgICAgICAgTWF0aC5tYXgoV0FURVJDT0xPUl9TUFJFQUQubWluLCBmaXJzdFJhZGl1cyAqIHByb2ZpbGUuc3ByZWFkT2ZSYWRpdXMpLFxuICAgICAgICAgIClcbiAgICAgICAgICA6IDAsXG4gICAgICAgIGlua1Ntb290aFB4OiAwLCAvLyByZXNvbHZlZCBzZXBhcmF0ZWx5LCBzZWUgbm90ZURhYlNwYWNpbmdcbiAgICAgICAgLy8gKCM0NjggdjExKSBIb3cgZmFyIG9uZSBleGNoYW5nZSBtb3ZlcyBwaWdtZW50LiBBIGNvbnN0YW50IG9mIHRoZVxuICAgICAgICAvLyBnZXN0dXJlIGZvciBleGFjdGx5IHRoZSByZWFzb24gZXZlcnkgb3RoZXIgc2NhbGFyIGhlcmUgaXMgb25lOiB0aGVcbiAgICAgICAgLy8gY29tcG9zaXRlIHJlY29tcHV0ZXMgd2hvbGUgcmVjdHMsIHNvIHdoaWNoZXZlciBiYXRjaCB3cm90ZSBhIHBpeGVsXG4gICAgICAgIC8vIGxhc3Qgd291bGQgb3RoZXJ3aXNlIGRlY2lkZSBob3cgZmFyIGl0cyBwYWludCBoYWQgdHJhdmVsbGVkLlxuICAgICAgICBtaWdyYXRlUHg6IHByb2ZpbGUubWlncmF0ZSA+IDAgJiYgcHJvZmlsZS5taWdyYXRlT2ZSYWRpdXMgPiAwXG4gICAgICAgICAgPyBNYXRoLm1pbihcbiAgICAgICAgICAgIFdBVEVSQ09MT1JfTUlHUkFUSU9OLm1heFB4LFxuICAgICAgICAgICAgTWF0aC5tYXgoV0FURVJDT0xPUl9NSUdSQVRJT04ubWluUHgsIGZpcnN0UmFkaXVzICogcHJvZmlsZS5taWdyYXRlT2ZSYWRpdXMpLFxuICAgICAgICAgIClcbiAgICAgICAgICA6IDAsXG4gICAgICAgIC8vIFRoZSBmYWxsYmFjayB0aGUgY29tcG9zaXRlIHVzZXMgb3V0c2lkZSB0aGUgbWFyaywgd2hlcmUgdGhlcmUgaXMgbm9cbiAgICAgICAgLy8gZGVwb3NpdCB0byByZWFkIGEgcGVyLXBpeGVsIGxldmVsIGZyb20uIFRoZSBzdHJva2UncyBzdGFydGluZyBsb2FkLFxuICAgICAgICAvLyBub3QgaXRzIGN1cnJlbnQgb25lLCBmb3IgdGhlIHNhbWUgbm8tc2VhbXMgcmVhc29uLlxuICAgICAgICB3YXRlcjogcHJvZmlsZS53YXRlckxldmVsLFxuICAgICAgICBmaWVsZFNlZWQ6IFtkcmF3YWJsZVswXS54LCBkcmF3YWJsZVswXS55XSxcbiAgICAgICAgLy8gKCM1MzYpIEEgY29uc3RhbnQgb2YgdGhlIGdlc3R1cmUgbGlrZSBldmVyeSBvdGhlciBzY2FsYXIgaGVyZSwgc29cbiAgICAgICAgLy8gdGhlIGhhaXIgZG9lcyBub3QgY2hhbmdlIGZyZXF1ZW5jeSBiZXR3ZWVuIGEgbGl2ZSBiYXRjaCBhbmQgdGhlXG4gICAgICAgIC8vIGZpbmFsIHJlY29tcG9zaXRlLlxuICAgICAgICAvLyBUaGUgbmliJ3MgKmxvbmcqIGF4aXMsIG5vdCB0aGUgZXF1YWwtYXJlYSByYWRpdXMuIEEgZmxhdCBicnVzaCBpcyBhXG4gICAgICAgIC8vIHJvdyBvZiBoYWlycyBoZWxkIGluIGEgZmVycnVsZSwgYW5kIHRoZSBmZXJydWxlJ3Mgd2lkdGggaXMgdGhlIGxvbmdcbiAgICAgICAgLy8gYXhpczogbWVhc3VyZWQgYnkgYXJlYSBpdCBjYW1lIG91dCBhcyBhIGNvdXBsZSBvZiBidW5kbGVzIGFuZCByZWFkXG4gICAgICAgIC8vIGFzIGJyb2FkIHdhdmVzIHJhdGhlciB0aGFuIGFzIGhhaXIsIHdoaWNoIGlzIHdoYXQgXCLQvdCwIGNoaXNlbCDQvdC1INCy0LjQttGDXG4gICAgICAgIC8vINGJ0LXRgtC40L3QutC4XCIgd2FzLiBGb3IgYSByb3VuZCBuaWIgdGhlIHR3byBhcmUgdGhlIHNhbWUgbnVtYmVyLlxuICAgICAgICAvL1xuICAgICAgICAvLyAoIzUzNikg4oCmYW5kIHRoZSBmZXJydWxlLCBub3QgdGhpcyBmb290cHJpbnQ6IHRoZSBmaXJzdCBkYWIgb2YgYVxuICAgICAgICAvLyBnZXN0dXJlIGNhcnJpZXMgYm90aCB0aGUgcHJlc3N1cmUgaXQgd2FzIGJlZ3VuIHdpdGggYW5kIHRoZSBoZWFkXG4gICAgICAgIC8vIHRhcGVyLCBhbmQgb24gYSBzbWFsbCBicnVzaCB0aG9zZSB0d28gdG9nZXRoZXIgY29zdCBtb3N0IG9mIHRoZSBoYWlyLlxuICAgICAgICAvLyBTZWUgd2F0ZXJjb2xvckZlcnJ1bGVQeC5cbiAgICAgICAgYnJpc3RsZVJhZGl1c1B4OiB3YXRlcmNvbG9yRmVycnVsZVB4KFxuICAgICAgICAgIGZpcnN0TWlub3IsIGZpcnN0LmFzcGVjdFJhdGlvLCBmaXJzdC5wcmVzc3VyZSwgcHJlc2V0TmFtZSxcbiAgICAgICAgKSxcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgLy8gKCM0NjggdjQsIEFEUiAwMTEgwqc0LjQpIFRoZSBjb21wb3NpdGUgcmVjdCBhICpsaXZlKiBiYXRjaCByZWRyYXdzLCBwYWRkZWRcbiAgICAvLyBwYXN0IHRoZSBkYWJzIGl0IGp1c3QgcGFpbnRlZC5cbiAgICAvL1xuICAgIC8vIHYyIGFuZCB2MyByYW4gdGhlIHNwcmVhZCBhbmQgdGhlIHRpZGVsaW5lIG9ubHkgYXQgcGVuLXVwLCBiZWNhdXNlIGJvdGhcbiAgICAvLyByZWFkIGEgbmVpZ2hib3VyaG9vZCB0aGUgbW92aW5nIGJydXNoIGZyb250IGhhcyBub3QgZmluaXNoZWQgd3JpdGluZy4gVGhlXG4gICAgLy8gY29zdCB3YXMgYSB2aXNpYmxlIGp1bXA6IHRoZSBhcnRpc3QgZHJldyBvbmUgc2hhcGUgYW5kIHdhdGNoZWQgaXQgYmVjb21lXG4gICAgLy8gYW5vdGhlciB0aGUgaW5zdGFudCB0aGUgc3R5bHVzIGxpZnRlZC4gQ29ycmVjdCBieSB0aGUgbW9kZWwsIGFuZCBiYWQg4oCUXG4gICAgLy8gcmVhbCBwYWludCBrZWVwcyBtb3ZpbmcsIGl0IGRvZXMgbm90IHN3YXAgZ2VvbWV0cnkgaW4gYSBzaW5nbGUgZnJhbWUuXG4gICAgLy9cbiAgICAvLyBUaGUgZml4IGlzIHRoYXQgYm90aCB0ZXJtcyBhcmUgKmxvY2FsKjogdGhleSByZWFjaCBhdCBtb3N0IHNwcmVhZCArXG4gICAgLy8gdGlkZWxpbmUgcmFkaXVzIGZyb20gYW55IHBpeGVsLiBTbyBhIGJhdGNoIHRoYXQgcmVjb21wb3NpdGVzIGl0cyBvd25cbiAgICAvLyBkYWJzIHBsdXMgdGhhdCBtdWNoIG1hcmdpbiBmaXhlcyB1cCBldmVyeXRoaW5nIHRoZSBwcmV2aW91cyBiYXRjaCBjb3VsZFxuICAgIC8vIG9ubHkgZ3Vlc3MgYXQsIGFuZCB0aGUgb25seSByZWdpb24gc3RpbGwgcHJvdmlzaW9uYWwgaXMgdGhlIG1hcmdpbiBhcm91bmRcbiAgICAvLyB0aGUgbGl2ZSBmcm9udCDigJQgd2hpY2ggaXMgd2hlcmUgdGhlIGJydXNoIGlzLCBhbmQgd2hpY2ggdGhlIG5leHQgYmF0Y2hcbiAgICAvLyBjb3JyZWN0cy4gVGhlIHNldHRsZSBwYXNzIGF0IHBlbi11cCB0aGVuIGhhcyBub3RoaW5nIGxlZnQgdG8gZG8gYnV0IHRoZVxuICAgIC8vIGZpbmFsIG1hcmdpbiwgc28gdGhlIG1hcmsgYmFyZWx5IGNoYW5nZXMgd2hlbiB0aGUgcGVuIGNvbWVzIHVwLlxuICAgIC8vXG4gICAgLy8gQ29zdHMgYSBsYXJnZXIgcmVjdCBwZXIgYmF0Y2guIEJvdW5kZWQgYnkgdGhlIHBhZGRpbmcsIG5vdCBieSB0aGUgc3Ryb2tlOlxuICAgIC8vIHRoaXMgc3RheXMgcHJvcG9ydGlvbmFsIHRvIHdoYXQgdGhlIGJhdGNoIHBhaW50ZWQsIHVubGlrZSByZWNvbXBvc2l0aW5nXG4gICAgLy8gdGhlIHdob2xlIHN0cm9rZSBldmVyeSBldmVudCwgd2hpY2ggaXMgd2hhdCBtYWRlIGRlZmVycmFsIG5lY2Vzc2FyeSBpblxuICAgIC8vIHRoZSBmaXJzdCBwbGFjZS5cbiAgICAvLyBUaGUgcGFkIGhhcyB0byBjb3ZlciAqZXZlcnl0aGluZyB0aGF0IGNhbiBzdGlsbCBjaGFuZ2UgdGhpcyBwaXhlbCosIGFuZFxuICAgIC8vIHRoYXQgaXMgbm90IGp1c3QgaG93IGZhciB0aGUgY29tcG9zaXRlIHJlYWNoZXMgc2lkZXdheXMg4oCUIGl0IGlzIGFsc28gaG93XG4gICAgLy8gbG9uZyB0aGUgYnJ1c2gga2VlcHMgZGVwb3NpdGluZyBpbnRvIGEgcGl4ZWwgaXQgaGFzIGFscmVhZHkgcGFzc2VkLlxuICAgIC8vXG4gICAgLy8gSW5rIGFuZCBjb3ZlcmFnZSBrZWVwIGFycml2aW5nIHVudGlsIHRoZSBuaWIgaGFzIHRyYXZlbGxlZCBhIGZ1bGwgcmFkaXVzXG4gICAgLy8gYmV5b25kIGEgc3BvdC4gUGFkIGJ5IGxlc3MgdGhhbiB0aGF0IGFuZCBhIGxpdmUgYmF0Y2ggY29tcG9zaXRlcyBmcm9tIGFuXG4gICAgLy8gaW5rTG9hZCB0aGF0IGlzIHN0aWxsIG1pc3NpbmcgdGhlIGRhYnMgYmVoaW5kIHRoZSBmcm9udCwgYW5kIG5vIGxhdGVyXG4gICAgLy8gYmF0Y2gncyByZWN0IGV2ZXIgcmVhY2hlcyBiYWNrIHRvIGNvcnJlY3QgaXQuIFJlcGxheSwgd2hpY2ggY29tcG9zaXRlc1xuICAgIC8vIG9uY2Ugd2l0aCB0aGUgd2hvbGUgc3Ryb2tlIGluIHRoZSBidWZmZXJzLCBoYXMgbm8gc3VjaCBnYXAg4oCUIHNvIHRoZSB0d29cbiAgICAvLyBkaXNhZ3JlZWQsIGFuZCBhIHJlbG9hZCBzaWxlbnRseSByZWRyZXcgdGhlIHN0cm9rZSBkaWZmZXJlbnRseS4gTWVhc3VyZWRcbiAgICAvLyBhdCAyNiUgb2YgdGhlIG1hcmsncyBhcmVhIGJlZm9yZSB0aGlzLCA5JSBvZiBpdCBzdHJvbmdseS5cbiAgICAvL1xuICAgIC8vIFRoYXQgaXMgYSBkZXRlcm1pbmlzbSBidWcsIG5vdCBhIGNvc21ldGljIG9uZTogdHdvIHBlb3BsZSBpbiBvbmUgcm9vbVxuICAgIC8vIHdlcmUgbG9va2luZyBhdCBkaWZmZXJlbnQgcGljdHVyZXMuXG4gICAgbGV0IG1heFJhZGl1cyA9IDBcbiAgICAvLyAjNDg5OiB0aGUgbmliJ3MgKnJlYWNoKiwgbm90IGl0cyBzaG9ydCBheGlzIOKAlCB0aGlzIHRlcm0gaXMgYSBib3VuZCwgYW5kIGFcbiAgICAvLyBmbGF0IG5pYiBkZXBvc2l0cyBhIGxvbmcgc2VtaS1heGlzIHBhc3QgYSBzcG90IHJhdGhlciB0aGFuIGEgc2hvcnQgb25lLlxuICAgIC8vIEVycmluZyBvdXR3YXJkIGNvc3RzIGEgc2xpZ2h0bHkgbGFyZ2VyIHJlY3Q7IGVycmluZyBpbndhcmQgY29tcG9zaXRlc1xuICAgIC8vIGZyb20gYnVmZmVycyB0aGF0IGFyZSBzdGlsbCBmaWxsaW5nLCB3aGljaCBpcyB0aGUgZGV0ZXJtaW5pc20gYnVnIHRoaXNcbiAgICAvLyB3aG9sZSBibG9jayBleGlzdHMgdG8gcHJldmVudC5cbiAgICAvLyAowqcxNy4yMykg4oCmYW5kIHRoZSBuaWIncyBvd24gcmFkaXVzLCB3aXRob3V0IHRoZSBoYWxvJ3MgYm91bmQ6IHdoYXQgdGhlXG4gICAgLy8gcmltIGlzIHNjYWxlZCBieS5cbiAgICBsZXQgbmliUmFkaXVzID0gMFxuICAgIGZvciAoY29uc3QgZCBvZiBkcmF3YWJsZSkge1xuICAgICAgY29uc3QgbWlub3IgPSBkLnNpemUgKiAwLjUgKiBwcmVzZXQuc2l6ZU11bHRpcGxpZXJcbiAgICAgIG1heFJhZGl1cyA9IE1hdGgubWF4KG1heFJhZGl1cywgbWlub3IgKiBNYXRoLm1heChkLmFzcGVjdFJhdGlvLCAxKSAqIGhhbG9Cb3VuZChkKSArIGhhbG9QYXN0KGQpKVxuICAgICAgbmliUmFkaXVzID0gTWF0aC5tYXgobmliUmFkaXVzLCBtaW5vciAqIE1hdGgubWF4KGQuYXNwZWN0UmF0aW8sIDEpKVxuICAgIH1cbiAgICAvLyBFdmVyeXRoaW5nIHRoYXQgY2FuIHN0aWxsIGNoYW5nZSB0aGlzIHBpeGVsLCAqKnN1bW1lZCoqIHJhdGhlciB0aGFuXG4gICAgLy8gbWF4ZWQg4oCUIGVhY2ggdGVybSBpcyBhIHNlcGFyYXRlIGhvcCBvdXR3YXJkIGFuZCB0aGV5IGNvbXBvc2U6XG4gICAgLy9cbiAgICAvLyAgIG1heFJhZGl1cyAgIHRoZSBuaWIga2VlcHMgZGVwb3NpdGluZyBpbnRvIGEgc3BvdCB1bnRpbCBpdCBoYXMgdHJhdmVsbGVkXG4gICAgLy8gICAgICAgICAgICAgICBpdHMgb3duIHJhZGl1cyBwYXN0IGl0O1xuICAgIC8vICAgc3ByZWFkUHggICAgdGhlIGJvdW5kYXJ5IGlzIGRlY2lkZWQgZnJvbSBhIGJsdXIgb2YgY292ZXJhZ2UgdGhhdCBmYXIgYXdheTtcbiAgICAvLyAgIHdldEVkZ2UgICAgIHRoZSB0aWRlbGluZSByZWFkcyB0aGUgc2FtZSBibHVyO1xuICAgIC8vICAgZGFiU3BhY2luZyAgdGhlIGRlcG9zaXQgaXMgcmVhZCBiYWNrIGF2ZXJhZ2VkIG92ZXIgb25lIHNwYWNpbmcsIHNvIGFcbiAgICAvLyAgICAgICAgICAgICAgIHBpeGVsJ3MgdmFsdWUgZGVwZW5kcyBvbiBpdHMgbmVpZ2hib3VycycgZGVwb3NpdHMgdG9vO1xuICAgIC8vICAgbWlncmF0ZVB4ICAgKCM0NjggdjExKSBwaWdtZW50IGlzIGV4Y2hhbmdlZCB3aXRoIGEgcmluZyB0aGF0IGZhciBvdXQsXG4gICAgLy8gICAgICAgICAgICAgICBzbyBhIHBpeGVsJ3MgdG9uZSBkZXBlbmRzIG9uIGRlcG9zaXRzIHRoYXQgZmFyIGF3YXkg4oCUIGFuZFxuICAgIC8vICAgICAgICAgICAgICAgdW5saWtlIHRoZSB0ZXJtcyBhYm92ZSB0aGlzIG9uZSBpcyBzeW1tZXRyaWMsIHNpbmNlIHBhaW50XG4gICAgLy8gICAgICAgICAgICAgICBhcnJpdmluZyBpcyBhcyBtdWNoIGEgY2hhbmdlIGFzIHBhaW50IGxlYXZpbmcuXG4gICAgLy9cbiAgICAvLyBHZXR0aW5nIHRoaXMgd3JvbmcgZG9lcyBub3QgbWVyZWx5IGJsdXIgc29tZXRoaW5nOiBhIGxpdmUgYmF0Y2ggdGhlblxuICAgIC8vIGNvbXBvc2l0ZXMgZnJvbSBidWZmZXJzIHRoYXQgYXJlIHN0aWxsIGZpbGxpbmcsIG5vIGxhdGVyIGJhdGNoJ3MgcmVjdFxuICAgIC8vIHJlYWNoZXMgYmFjayB0byBjb3JyZWN0IGl0LCBhbmQgdGhlIG1hcmsgZW5kcyB1cCBkaWZmZXJlbnQgZnJvbSB3aGF0IGFcbiAgICAvLyByZXBsYXkgb2YgdGhlIHNhbWUgb3BlcmF0aW9uIHByb2R1Y2VzLlxuICAgIC8vICgjNTM2KSBUd2ljZSB0aGUgcmVhY2gsIGJlY2F1c2UgdGhlIG1hcmsgY2FuIGVuZCB1cCB0aGF0IG11Y2ggd2lkZXIgdGhhblxuICAgIC8vIHRoZSBicnVzaDogdGhlIHJlLXRocmVzaG9sZCBkaXNwbGFjZXMgdGhlIGJvdW5kYXJ5IG91dHdhcmQgYnkgYWJvdXRcbiAgICAvLyAyICogcmVhY2ggKiBwdXNoLCBhbmQgcHVzaCBpcyBjYXBwZWQgYXQgV0NfV0VUX1BVU0gsIHdoaWNoIGlzIDAuNS4gVW5kZXItXG4gICAgLy8gcGFkZGluZyBoZXJlIGRvZXMgbm90IHNvZnRlbiBhIG1hcmssIGl0IGN1dHMgaXQgb2ZmIHNxdWFyZSBhdCB0aGUgcmVjdCdzXG4gICAgLy8gZWRnZSDigJQgc28gdGhpcyBpcyBhIGJvdW5kLCBub3QgYW4gZXN0aW1hdGUuXG4gICAgLy9cbiAgICAvLyBJdCB1c2VkIHRvIHBhZCBmb3IgdGhlIGJsb29tIG11bHRpcGxpZWQgaW50byB0aGUgKnJhZGl1cyouIFRoYXQgZmFjdG9yIGlzXG4gICAgLy8gZ29uZSAoc2VlIHRoZSByZWFjaCdzIG93biBub3RlIGluIERBQl9GUkFHOiBhbiBlaWdodHktcGl4ZWwgcmFkaXVzIG9uIGFcbiAgICAvLyB0d2VsdmUtdGFwIHJpbmcgaXMgbm90IGEgYmx1ciksIGFuZCBwYWRkaW5nIGZvciBpdCB3YXMgY29zdGluZyB0d28gYW5kIGFcbiAgICAvLyBoYWxmIHRpbWVzIHRoZSBjb21wb3NpdGUgZmlsbCBpdCBuZWVkZWQuXG4gICAgLy8gKCM1MzYsIMKnMTcuMjIpIE5vIG1heFJhZGl1cyBoZXJlIGFueSBtb3JlOiBgYm91bmRzYCBpcyBidWlsdCBmcm9tIHRoZVxuICAgIC8vIGRhYnMnIHdvcmxkIGhhbGYtZXh0ZW50cyAoYW5kIHRoZSBwcmV2aW91cyBkYWIncyksIHNvIHRoZSBuaWIncyBvd25cbiAgICAvLyByYWRpdXMgaXMgYWxyZWFkeSBpbnNpZGUgaXQsIGFuZCBhZGRpbmcgaXQgYWdhaW4gcHV0IGEgNDAwIHB4IGJydXNoJ3NcbiAgICAvLyByZWN0IGF0IDExMzYgcHggYSBzaWRlIHdoZXJlIDc0MCB3b3VsZCBkbyDigJQgMi40IHRpbWVzIHRoZSBmaWxsLiBUaGVcbiAgICAvLyBwYWQgaXMgdGhlIGNvbXBvc2l0ZSdzIFJFQUQgcmVhY2ggb25seSwgcGx1cyB0aGUgc3RhbXBzJyBlZGdlIEFBLlxuICAgIGNvbnN0IGNvbXBvc2l0ZVBhZCA9IHNwcmVhZFB4ID4gMFxuICAgICAgPyBNYXRoLmNlaWwoXG4gICAgICAgIHNwcmVhZFB4ICogMiArIHByb2ZpbGUud2V0RWRnZVJhZGl1c1B4ICsgZGFiU3BhY2luZyArIG1pZ3JhdGVQeCArIHByb2ZpbGUuYWFQeCxcbiAgICAgICkgKyAxXG4gICAgICA6IDBcbiAgICBjb25zdCBjb21wb3NpdGVCb3VuZHMgPSBjb21wb3NpdGVQYWQgPiAwXG4gICAgICA/IHtcbiAgICAgICAgbWluWDogYm91bmRzLm1pblggLSBjb21wb3NpdGVQYWQsIG1pblk6IGJvdW5kcy5taW5ZIC0gY29tcG9zaXRlUGFkLFxuICAgICAgICBtYXhYOiBib3VuZHMubWF4WCArIGNvbXBvc2l0ZVBhZCwgbWF4WTogYm91bmRzLm1heFkgKyBjb21wb3NpdGVQYWQsXG4gICAgICB9XG4gICAgICA6IGJvdW5kc1xuICAgIGNvbnN0IHJlYWNoQm91bmRzID0ge1xuICAgICAgbWluWDogck1pblggLSBjb21wb3NpdGVQYWQsIG1pblk6IHJNaW5ZIC0gY29tcG9zaXRlUGFkLFxuICAgICAgbWF4WDogck1heFggKyBjb21wb3NpdGVQYWQsIG1heFk6IHJNYXhZICsgY29tcG9zaXRlUGFkLFxuICAgIH1cblxuICAgIC8vICgjNDY4IHYzLCBBRFIgMDExIMKnMy44KSBFdmVyeSBkYWIncyBpbmsgZGVwb3NpdCwgcmVzb2x2ZWQgb25jZSBmb3IgdGhlXG4gICAgLy8gYmF0Y2gg4oCUICpiZWZvcmUqIHRoZSB0aWxlIGxvb3AsIGJlY2F1c2UgdGhlIGRlcGxldGlvbiBjbG9jayBtdXN0IGFkdmFuY2VcbiAgICAvLyBvbmNlIHBlciBiYXRjaCBhbmQgbm90IG9uY2UgcGVyIHRpbGUgYSBiYXRjaCBoYXBwZW5zIHRvIHN0cmFkZGxlLlxuICAgIC8vXG4gICAgLy8gVHdvIHRoaW5ncyBoYXBwZW4gaGVyZSB0aGF0IGRpZCBub3QgYmVmb3JlLCBib3RoIHdhdGVyY29sb3Itb25seTpcbiAgICAvL1xuICAgIC8vICAtIHRoZSBkZXBvc2l0IGlzIGRpdmlkZWQgYnkgdGhlIGRhYidzIG93biByYWRpdXMsIHR1cm5pbmcgaXQgZnJvbSBhXG4gICAgLy8gICAgcXVhbnRpdHkgcGVyIHVuaXQgKmxlbmd0aCogaW50byBvbmUgcGVyIHVuaXQgKmFyZWEqLiBVbm5vcm1hbGl6ZWQgaXRcbiAgICAvLyAgICBzY2FsZWQgd2l0aCBicnVzaCBzaXplIGFuZCBzYXR1cmF0ZWQgdGhlIDgtYml0IGlua0xvYWQgYnVmZmVyIG9uIHRoZVxuICAgIC8vICAgIGZpcnN0IGRhYiBvZiBhbnkgcmVhbCB3YXNoLCB3aGljaCBwaW5uZWQgdGhlIGNvbXBvc2l0ZSdzIHNhdHVyYXRpb25cbiAgICAvLyAgICBjdXJ2ZSBhdCAxIGFuZCBtYWRlIGBkZW5zaXR5YCBkZWFkIGNvZGUgKHNlZSBub3JtYWxpemVEZXBvc2l0KTtcbiAgICAvLyAgLSBpdCBkZWNheXMgYXMgdGhlIGJydXNoIHVubG9hZHMgYWxvbmcgdGhlIHN0cm9rZSwgd2hpY2ggaXMgb25seVxuICAgIC8vICAgIGV4cHJlc3NpYmxlICpiZWNhdXNlKiBvZiB0aGUgbm9ybWFsaXphdGlvbiBhYm92ZS5cbiAgICAvL1xuICAgIC8vIFRoZSBtYXJrZXIgdGFrZXMgbmVpdGhlciBhbmQgbXVzdCBub3Q6IGl0cyBzdHJva2VzIGFyZSBwZXJtYW5lbnQgYW5kIGl0c1xuICAgIC8vIGNvbnN0YW50cyB3ZXJlIGNhbGlicmF0ZWQgYWdhaW5zdCB0aGUgb2xkIHNjYWxlLiBXaGF0IGl0IGRvZXMgdGFrZVxuICAgIC8vICgjNTU5KSBpcyBhIGdhaW4gb2YgPj0gMSBvbiB0aGF0IHNhbWUgbGVnYWN5IGRlcG9zaXQgd2hlcmV2ZXIgdGhlIG5pYiBpc1xuICAgIC8vIHRvbyB0aGluIGFsb25nIHRoZSB0cmF2ZWwgdG8gaGF2ZSByZWFjaGVkIHRoZSBmaWxtJ3Mga25lZSBhdCBhbGwg4oCUIHNlZVxuICAgIC8vIG1hcmtlcklua0dhaW4udHMuIEV4YWN0bHkgMSBmb3IgZXZlcnkgbmliIHRoYXQgc2F0dXJhdGVkIGFscmVhZHkuXG4gICAgLy8gKCM0NjggdjQsIEFEUiAwMTEgwqc0KSBXYXRlciBhbmQgcGlnbWVudCBydW4gZG93biBhdCAqZGlmZmVyZW50KiByYXRlcyxcbiAgICAvLyBhbmQgdGhhdCBkaWZmZXJlbmNlIGlzIHRoZSB3aG9sZSBiZWhhdmlvdXI6IHdhdGVyIHNvYWtzIGF3YXkgZmFzdCB3aGlsZVxuICAgIC8vIHBpZ21lbnQgc3RheXMgb24gdGhlIGhhaXJzLCBzbyBvbmUgbG9uZyBzdHJva2Ugd2Fsa3MgaXRzZWxmIGZyb20gYSB3ZXRcbiAgICAvLyBzYXR1cmF0ZWQgc3RhcnQsIHRocm91Z2ggYW4gb3JkaW5hcnkgbWlkZGxlLCB0byBhIGRyeSBidXQgc3RpbGwgc3Ryb25nbHlcbiAgICAvLyBjb2xvdXJlZCBlbmQg4oCUIGFuZCBmaW5hbGx5IHRvIGEgYnJva2VuIGRyeS1icnVzaCB0YWlsLiBBIHNpbmdsZSBcIndldG5lc3NcIlxuICAgIC8vIHNjYWxhciBjYW5ub3QgcHJvZHVjZSB0aGF0IGFyYyBhdCBhbGwuXG4gICAgY29uc3QgZGVwb3NpdHM6IG51bWJlcltdID0gW11cbiAgICBjb25zdCB3YXRlckJ5RGFiID0gbmV3IE1hcDxEYWIsIG51bWJlcj4oKVxuICAgIGNvbnN0IHBpZ21lbnRCeURhYiA9IG5ldyBNYXA8RGFiLCBudW1iZXI+KClcbiAgICBjb25zdCBkZWxpdmVyeSA9IHJpYmJvbldhdGVyRGVsaXZlcnkocHJvZmlsZSlcbiAgICBzY3JhdGNoLnN0YW5kaW5nLmNsZWFyKClcbiAgICAvLyAoIzUzNikgV2hpY2ggd2F5IFwiYWNyb3NzIHRoZSBicnVzaFwiIHBvaW50cyBmb3IgZWFjaCBkYWIsIGluIHRoZSBuaWIncyBvd25cbiAgICAvLyBsb2NhbCBheGVzIOKAlCB0aGUgc3RhbXBzJyBoYWxmIG9mIHRoZSBoYWlyIGNvbWIuIEZpbGxlZCBpbiB0aGUgc2FtZSBsb29wXG4gICAgLy8gdGhhdCBhbHJlYWR5IHJlc29sdmVzIGVhY2ggZGFiJ3MgdHJhdmVsIGRpcmVjdGlvbiwgc28gdGhlcmUgaXMgZXhhY3RseVxuICAgIC8vIG9uZSByZWFkaW5nIG9mIGl0IGFuZCB0aGUgc3RhbXBzIGNhbm5vdCBkaXNhZ3JlZSB3aXRoIHRoZSBiYW5kcy5cbiAgICBjb25zdCBhY3Jvc3NCeURhYiA9IG5ldyBNYXA8RGFiLCBbbnVtYmVyLCBudW1iZXJdPigpXG4gICAgLy8gKCM2ODAsIHMxNy44NCkgVGhlIGRhYnMgd2hvc2UgZGlyZWN0aW9uIGlzIHRoZSB0cmF2ZWwncyAtIHNlZSBiZWxvdy5cbiAgICBjb25zdCBtb3ZpbmdCeURhYiA9IG5ldyBTZXQ8RGFiPigpXG4gICAgLy8gKCM1MzYpIOKApmFuZCBob3cgd2V0IHRoZSBwYXBlciB1bmRlciBlYWNoIGRhYiBhbHJlYWR5IHdhcy4gU3RyYWlnaHQgb3V0IG9mXG4gICAgLy8gdGhlIHJlY29yZGVkIHByb2ZpbGUsIGluZGV4ZWQgYnkgcG9zaXRpb24gd2l0aGluIHRoaXMgY2FsbCdzIG93biBkYWJzIOKAlFxuICAgIC8vIHdoaWNoIGlzIHdoeSB0aGUgcHJvZmlsZSBpcyBvbmUgZGlnaXQgcGVyIGRhYiBhbmQgd2h5IGV2ZXJ5IHBsYWNlIGFcbiAgICAvLyBnZXN0dXJlIGlzIGN1dCB0YWtlcyBpdHMgb3duIHN1YnN0cmluZyAocGFwZXJXZXRuZXNzLnRzKS5cbiAgICBjb25zdCBwYXBlcldldEJ5RGFiID0gbmV3IE1hcDxEYWIsIG51bWJlcj4oKVxuICAgIC8vICgjNTM2KSBUaGUgdG91Y2gtZG93biBzdXJwbHVzLCBwZXIgZGFiIOKAlCBzZWUgd2F0ZXJjb2xvclN0YXJ0RXhjZXNzLiBHYXRlZFxuICAgIC8vIGJ5IHRoZSB3ZXRuZXNzIHVuZGVyIHRoZSBnZXN0dXJlJ3MgKmxhbmRpbmcgcG9pbnQqLCBub3QgcGVyIGRhYjogYSBicnVzaFxuICAgIC8vIGR1bXBzIGl0cyBsb2FkIHdoZW4gaXQgaXMgc2V0IGRvd24sIHNvIHdoYXQgbWF0dGVycyBpcyB3aGF0IHdhcyB1bmRlciBpdFxuICAgIC8vIHRoZW4sIG5vdCB3aGF0IGl0IGhhcyBydW4gb3ZlciBzaW5jZS5cbiAgICAvLyAoIzUzNikgSG93IHN0cm9uZyB0aGlzIHN0cm9rZSdzIHBhaW50IGlzLCBvbiB0aGUgZGVwb3NpdCByYXRoZXIgdGhhbiBvblxuICAgIC8vIHRoZSBjb21wb3NpdGUncyBzaW5nbGUgb3BhY2l0eSDigJQgc2VlIF9iYWtlRGFiT3BhY2l0eSdzIG93biBub3RlLlxuICAgIGNvbnN0IGlua1N0cmVuZ3RoID0gcHJvZmlsZS5ub3JtYWxpemVEZXBvc2l0ID8gcHJvZmlsZS5waWdtZW50U3RyZW5ndGggOiAxXG4gICAgY29uc3QgbW90dGxlU2VlZCA9IHN0cm9rZVNlZWQgPz8gWzAsIDBdXG4gICAgY29uc3QgcGlnbWVudFBvb2xCeURhYiA9IG5ldyBNYXA8RGFiLCBudW1iZXI+KClcbiAgICBjb25zdCBleGNlc3NCeURhYiA9IG5ldyBNYXA8RGFiLCBudW1iZXI+KClcbiAgICBjb25zdCBwdWRkbGVCeURhYiA9IG5ldyBNYXA8RGFiLCBudW1iZXI+KClcbiAgICAvLyAjNTU5IOKAlCBob3cgbXVjaCB0byByYWlzZSB0aGlzIGRhYidzIGRlcG9zaXQgZm9yIGJlaW5nIGRyYWdnZWQgdGhpbi1zaWRlXG4gICAgLy8gZmlyc3QuIFNoYXJlZCBieSB0aGUgc3RhbXBzIGFuZCB0aGUgYmFuZHMsIHdoaWNoIG11c3QgYWdyZWU6IHRoZSB0d29cbiAgICAvLyBvdmVybGFwIGFsbW9zdCBldmVyeXdoZXJlLCBhbmQgYSBiYW5kIG9uIGEgZGlmZmVyZW50IHNjYWxlIGZyb20gdGhlXG4gICAgLy8gc3RhbXBzIGl0IGNvbm5lY3RzIHdvdWxkIHNob3cgYXMgYSBzZWFtIGF0IGV2ZXJ5IHNhbXBsZS5cbiAgICBjb25zdCB0aGluTmliR2FpbiA9IChkYWI6IERhYiwgZnJvbVg6IG51bWJlciwgZnJvbVk6IG51bWJlcik6IG51bWJlciA9PiBwcm9maWxlLnRoaW5OaWJJbmtSZWZQeCA+IDBcbiAgICAgID8gbWFya2VyVGhpbk5pYklua0dhaW4oXG4gICAgICAgIG5pYkdlb21ldHJ5KGRhYiwgcHJlc2V0LnNpemVNdWx0aXBsaWVyLCBuaWJTaGFwZSwgY29ybmVyRnJhY3Rpb24pLFxuICAgICAgICBkYWIueCAtIGZyb21YLCBkYWIueSAtIGZyb21ZLCBwcm9maWxlLnRoaW5OaWJJbmtSZWZQeCxcbiAgICAgIClcbiAgICAgIDogMVxuICAgIHtcbiAgICAgIGxldCBwcmV2ID0gcHJldkRhYlxuICAgICAgbGV0IHVzZWQgPSBzY3JhdGNoLndhdGVyVXNlZFxuICAgICAgbGV0IHBpZ1VzZWQgPSBzY3JhdGNoLnBpZ21lbnRVc2VkXG4gICAgICBmb3IgKGNvbnN0IGRhYiBvZiBkcmF3YWJsZSkge1xuICAgICAgICBjb25zdCB3ZXRIZXJlID0gd2V0T2YoZGFiKVxuICAgICAgICBwYXBlcldldEJ5RGFiLnNldChkYWIsIHdldEhlcmUpXG4gICAgICAgIC8vICM0ODk6IHRyYXZlbCBtZWFzdXJlZCBpbiAqdGhpcyogbmliJ3MgdW5pdHMsIHdoaWNoIGZvciBhIGZsYXQgb25lXG4gICAgICAgIC8vIGRlcGVuZHMgb24gd2hpY2ggd2F5IGl0IGlzIGJlaW5nIGRyYWdnZWQgKHdhdGVyY29sb3JUcmF2ZWxSYWRpdXMpLlxuICAgICAgICAvLyBgcHJldmAgaXMgdW5kZWZpbmVkIG9uIHRoZSBzdHJva2UncyBmaXJzdCBkYWIgYW5kIHNpdHMgYXQgdGhlIHNhbWVcbiAgICAgICAgLy8gcG9pbnQgZm9yIGEgZHdlbGwgdGljayDigJQgYm90aCBhcmUgXCJubyBkaXJlY3Rpb25cIiwgYW5kIGJvdGggYXJlIHdoYXRcbiAgICAgICAgLy8gdGhlIG51bGwgYnJhbmNoIGFuc3dlcnMuXG4gICAgICAgIGNvbnN0IG1pbm9yID0gZGFiLnNpemUgKiAwLjUgKiBwcmVzZXQuc2l6ZU11bHRpcGxpZXJcbiAgICAgICAgLy8gKMKnMTcuMzcpIFRoZSBsYW5kaW5nIGR3ZWxsOiB0aGUgdGltZSB0aGUgbmliIGhhcyBzdGF5ZWQgd2l0aGluXG4gICAgICAgIC8vIFdDX0RXRUxMX1JBRElVUyBvZiB3aGVyZSBpdCBjYW1lIGRvd24sIG9uIHRoZSBkYWJzJyBvd24gY2xvY2suXG4gICAgICAgIC8vIFJlYWQgcGVyIGRhYiBhcyBpdCBzdGFuZHMgc28gZmFyLCBzbyBhIGxpdmUgc3Ryb2tlJ3MgbGFuZGluZ1xuICAgICAgICAvLyBkYWJzIGFuZCBhIHJlcGxheSdzIHNlZSB0aGUgc2FtZSB2YWx1ZXMgaW4gdGhlIHNhbWUgb3JkZXIuXG4gICAgICAgIGlmICghc2NyYXRjaC5sYW5kaW5nKSBzY3JhdGNoLmxhbmRpbmcgPSB7IHg6IGRhYi54LCB5OiBkYWIueSwgcjogbWlub3IgKiBNYXRoLm1heChkYWIuYXNwZWN0UmF0aW8sIDEpLCB0OiBkYWIudCB9XG4gICAgICAgIGVsc2UgaWYgKCFzY3JhdGNoLmR3ZWxsRG9uZSkge1xuICAgICAgICAgIGNvbnN0IEwgPSBzY3JhdGNoLmxhbmRpbmdcbiAgICAgICAgICBpZiAoTWF0aC5oeXBvdChkYWIueCAtIEwueCwgZGFiLnkgLSBMLnkpIDw9IFdDX0RXRUxMX1JBRElVUyAqIEwucikgc2NyYXRjaC5kd2VsbE1zID0gTWF0aC5tYXgoc2NyYXRjaC5kd2VsbE1zLCBkYWIudCAtIEwudClcbiAgICAgICAgICBlbHNlIHNjcmF0Y2guZHdlbGxEb25lID0gdHJ1ZVxuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGR4ID0gcHJldiA/IGRhYi54IC0gcHJldi54IDogMFxuICAgICAgICBjb25zdCBkeSA9IHByZXYgPyBkYWIueSAtIHByZXYueSA6IDBcbiAgICAgICAgY29uc3QgdHJhdmVsQW5nbGUgPSBNYXRoLmh5cG90KGR4LCBkeSkgPiAwLjAxID8gTWF0aC5hdGFuMihkeSwgZHgpIDogbnVsbFxuICAgICAgICBjb25zdCByYWRpdXMgPSBNYXRoLm1heCh3YXRlcmNvbG9yVHJhdmVsUmFkaXVzKFxuICAgICAgICAgIG1pbm9yICogTWF0aC5tYXgoZGFiLmFzcGVjdFJhdGlvLCAxKSwgbWlub3IsIGRhYi5hbmdsZSwgdHJhdmVsQW5nbGUsXG4gICAgICAgICksIDAuNSlcbiAgICAgICAgLy8gKCM2ODAsIHMxNy44NCkgQSBkYWIgdGhhdCByZWFsbHkgbW92ZWQgKGEgZmlmdGggb2YgaXRzIHJhZGl1cyk6IGl0c1xuICAgICAgICAvLyBkaXJlY3Rpb24gaXMgdGhlIHRyYXZlbCdzLiBUaGUgbGFzdCBkYWJzIGJlZm9yZSBhIGxpZnQgbW92ZSBieSBhXG4gICAgICAgIC8vIHBpeGVsIG9yIGxlc3MgYW5kIHRoZWlyIGRpcmVjdGlvbiBqaXR0ZXJzIC0gY29tYmVkIGFsb25nIGl0LCB0aGVcbiAgICAgICAgLy8gcG9vbCdzIHN0cmVha3MgY2FtZSBvdXQgYXMgYXJjcyBhbmQgd2F2ZXMgYXQgZXZlcnkgc3Ryb2tlJ3MgZW5kLlxuICAgICAgICBpZiAoTWF0aC5oeXBvdChkeCwgZHkpID4gMC4yICogbWlub3IpIG1vdmluZ0J5RGFiLmFkZChkYWIpXG4gICAgICAgIGlmICh0cmF2ZWxBbmdsZSAhPT0gbnVsbCkge1xuICAgICAgICAgIC8vIFBlcnBlbmRpY3VsYXIgb2YgdHJhdmVsLCByb3RhdGVkIG91dCBvZiB3b3JsZCBzcGFjZSBpbnRvIHRoZSBuaWInc1xuICAgICAgICAgIC8vIGZyYW1lLiBOdWxsIHRyYXZlbCBpcyBhIHRhcCBvciBhIGR3ZWxsIHRpY2sgd2l0aCBubyBkaXJlY3Rpb24gdG9cbiAgICAgICAgICAvLyBzcGVhayBvZjsgdGhlIG1pbm9yIGF4aXMgaXMgdGhlIGlzb3Ryb3BpYyBhbnN3ZXIgYW5kIGlzIHdoYXQgdGhlXG4gICAgICAgICAgLy8gdW5pZm9ybSBhbHJlYWR5IGRlZmF1bHRzIHRvLlxuICAgICAgICAgIGNvbnN0IGxhID0gdHJhdmVsQW5nbGUgKyBNYXRoLlBJIC8gMiAtIGRhYi5hbmdsZVxuICAgICAgICAgIGFjcm9zc0J5RGFiLnNldChkYWIsIFtNYXRoLmNvcyhsYSksIE1hdGguc2luKGxhKV0pXG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc2VnID0gdGhpcy5jdHgubWFya2VyU2VnbWVudExlbmd0aChkYWIsIHByZXYsIHJhZGl1cylcbiAgICAgICAgaWYgKHByb2ZpbGUud2F0ZXJEZXBsZXRpb24pIHtcbiAgICAgICAgICBjb25zdCBzdGVwID0gd2F0ZXJjb2xvcldhdGVyU3RlcChzZWcsIHJhZGl1cylcbiAgICAgICAgICAvLyAoIzUzNikgVHJhdmVsIHNwZW5kcyBib3RoIGNsb2Nrczsgb25seSB3YXRlciBpcyBldmVyIGdpdmVuIGJhY2ssXG4gICAgICAgICAgLy8gYW5kIG9ubHkgYnkgcGFwZXIgdGhpcyBzdHJva2UgKnJlY29yZGVkKiBhcyB3ZXQuIFNlZVxuICAgICAgICAgIC8vIHdhdGVyY29sb3JXYXRlckNsb2NrLCBhbmQgUmliYm9uU3Ryb2tlU2NyYXRjaC5fcGlnbWVudFVzZWQgb24gd2h5XG4gICAgICAgICAgLy8gdGhlIHR3byBhcmUgc2VwYXJhdGUgbnVtYmVycyBhdCBhbGwuXG4gICAgICAgICAgcGlnVXNlZCArPSBzdGVwXG4gICAgICAgICAgdXNlZCA9IHdhdGVyY29sb3JXYXRlckNsb2NrKHVzZWQsIHN0ZXAsIHdldEhlcmUpXG4gICAgICAgIH1cbiAgICAgICAgLy8gVGhlIHByb2ZpbGUncyBsZXZlbHMgYXJlIHRoZSAqaW5pdGlhbCogbG9hZDsgdGhlIHR3byBjdXJ2ZXMgc2F5IGhvd1xuICAgICAgICAvLyBtdWNoIG9mIGVhY2ggaXMgbGVmdCBhZnRlciB0aGF0IG11Y2ggdHJhdmVsLiBkZXBvc2l0UGVyUmFkaXVzIGFscmVhZHlcbiAgICAgICAgLy8gY2FycmllcyB0aGUgbm9taW5hbCBwaWdtZW50IHNldHRpbmcsIHNvIG9ubHkgdGhlIHJlbWFpbmluZyAqZnJhY3Rpb24qXG4gICAgICAgIC8vIG11bHRpcGxpZXMgaXQgaGVyZS5cbiAgICAgICAgLy8gKCM1MzYsIMKnMTcuMjEpIOKApmFuZCBhIGNsZWFuLXdhdGVyIGJydXNoIGRvZXMgbm90IHJ1biBkb3duIGF0IGFsbC5cbiAgICAgICAgY29uc3QgbG9hZCA9IHByb2ZpbGUud2F0ZXJEZXBsZXRpb24gJiYgd2F0ZXJjb2xvckJydXNoUnVuc0RyeShwcm9maWxlLnBpZ21lbnRTdHJlbmd0aCkgPyB3YXRlcmNvbG9yV2F0ZXJMb2FkKHVzZWQpIDogMVxuICAgICAgICBjb25zdCB3YXRlciA9IHByb2ZpbGUud2F0ZXJEZXBsZXRpb24gPyBwcm9maWxlLndhdGVyTGV2ZWwgKiBsb2FkIDogMVxuICAgICAgICAvLyAoIzUzNiwgwqcxNy4xNCkg4oCmYnkgdGhlIGJydXNoJ3Mgd2F0ZXI6IGEgd2V0IGJydXNoIHNwZW5kcyB0aGUgc2FtZVxuICAgICAgICAvLyBmaW5pdGUgYnVkZ2V0IGZ1cnRoZXIgYWxvbmcgdGhlIHBhdGguIFNlZSBQSUdNRU5UX1JVTl9EUllfUkFESUkuXG4gICAgICAgIC8vICjCpzE3LjI2KSDigKZhbmQgYSB3ZXQgc2hlZXQgcHVsbHMgbW9yZSBvZiBpdCBvdXQgKHdhdGVyY29sb3JXZXRQdWxsKS5cbiAgICAgICAgY29uc3QgcGlnbWVudExlZnQgPSBwcm9maWxlLndhdGVyRGVwbGV0aW9uXG4gICAgICAgICAgPyB3YXRlcmNvbG9yUGlnbWVudExvYWQocGlnVXNlZCwgcHJvZmlsZS53YXRlckxldmVsKSAqIHdhdGVyY29sb3JQaWdtZW50UmF0ZShwcm9maWxlLndhdGVyTGV2ZWwpICogd2F0ZXJjb2xvcldldFB1bGwod2V0SGVyZSlcbiAgICAgICAgICA6IDFcbiAgICAgICAgLy8gVGhlIGdlc3R1cmUncyBvd24gdHJhdmVsIGNsb2NrLCBjYXJyaWVkIG9uIHRoZSBzY3JhdGNoLCBzbyB0aGlzIGRlY2F5c1xuICAgICAgICAvLyBmcm9tIHRoZSAqc3Ryb2tlJ3MqIHN0YXJ0IHJhdGhlciB0aGFuIGZyb20gZWFjaCBiYXRjaCdzLiBUaGUgcGlnbWVudFxuICAgICAgICAvLyBvbmU6IGEgYnJ1c2ggdGhhdCBkcmFuayBmcm9tIGEgcHVkZGxlIGhhbGZ3YXkgYWxvbmcgaGFzIG5vdCBnb25lIGJhY2tcbiAgICAgICAgLy8gdG8gYmVpbmcgZnJlc2hseSBzZXQgZG93biwgYW5kIHRoZSB0b3VjaC1kb3duIHN1cnBsdXMgaXMgYWJvdXQgdGhlXG4gICAgICAgIC8vIG1vbWVudCBvZiBsYW5kaW5nLlxuICAgICAgICAvLyAoIzY4MCwgwqcxNy43NCkgVGhlIGR3ZWxsIGF0IFRISVMgZGFiLCBub3Qgb25seSBhdCB0aGUgbGFuZGluZzogYVxuICAgICAgICAvLyBzdG9wLCBhIHNoYXJwIHR1cm4sIGEgdHVybi1iYWNrIHVubG9hZCB0aGUgcmVzZXJ2b2lyIHRoZSBzYW1lIHdheSxcbiAgICAgICAgLy8gYW5kIHRoZSBzdXJwbHVzIGlzIHNwZW50IG92ZXIgdGhlIHRyYXZlbCBhZnRlciBpdC5cbiAgICAgICAgY29uc3QgdGF1ID0gTWF0aC5tYXgoMCwgd2F0ZXJjb2xvclRyYWlsRHdlbGwoc2NyYXRjaC50cmFpbCwgZGFiLngsIGRhYi55LCBkYWIudCwgV0NfRFdFTExfUkFESVVTICogbWlub3IgKiBNYXRoLm1heChkYWIuYXNwZWN0UmF0aW8sIDEpKSAtIFdDX0RXRUxMX0ZMT09SX01TKVxuICAgICAgICBjb25zdCBnYXRlSGVyZSA9IDEgLSBNYXRoLm1pbihNYXRoLm1heCh3ZXRIZXJlLCAwKSwgMSlcbiAgICAgICAgY29uc3QgcGlnbWVudEdhdGUgPSAwLjQ1ICsgMC41NSAqIGdhdGVIZXJlXG4gICAgICAgIC8vIOKApmFuZCB0aGUgc2xvd2Rvd24gcmVsYXRpdmUgdG8gdGhpcyBzdHJva2UncyBvd24gcGFjZSAod2F0ZXJjb2xvclNsb3dkb3duKS5cbiAgICAgICAgY29uc3QgbGFzdCA9IHNjcmF0Y2gudHJhaWwubGVuZ3RoID8gc2NyYXRjaC50cmFpbFtzY3JhdGNoLnRyYWlsLmxlbmd0aCAtIDFdIDogbnVsbFxuICAgICAgICBsZXQgc2xvdyA9IDBcbiAgICAgICAgbGV0IHNwZWVkRWxhcHNlZCA9IDBcbiAgICAgICAgaWYgKHNjcmF0Y2guc3BlZWRBdCA8IDApIHNjcmF0Y2guc3BlZWRBdCA9IGRhYi50XG4gICAgICAgIGlmIChsYXN0KSB7XG4gICAgICAgICAgc2NyYXRjaC5zcGVlZFRyYXZlbCArPSBNYXRoLmh5cG90KGRhYi54IC0gbGFzdC54LCBkYWIueSAtIGxhc3QueSlcbiAgICAgICAgICBjb25zdCBkdCA9IGRhYi50IC0gc2NyYXRjaC5zcGVlZEF0XG4gICAgICAgICAgaWYgKGR0ID4gMCkge1xuICAgICAgICAgICAgLy8gT25lIHBvaW50ZXIgYmF0Y2ggZ2l2ZXMgc2V2ZXJhbCBkYWJzIHRoZSBzYW1lIHRpbWVzdGFtcC4gS2VlcFxuICAgICAgICAgICAgLy8gdGhlaXIgdHJhdmVsIHVudGlsIHRoZSBuZXh0IHJlYWwgdGltZSBpbnRlcnZhbDsgZHQ9MSBpbnZlbnRlZFxuICAgICAgICAgICAgLy8gaGlnaCBzcGVlZHMgYW5kIGEgYnJha2luZyBwb29sIGF0IHRoZSBuZXh0IGJhdGNoIGJvdW5kYXJ5LlxuICAgICAgICAgICAgY29uc3QgdiA9IHNjcmF0Y2guc3BlZWRUcmF2ZWwgLyBkdFxuICAgICAgICAgICAgY29uc3QgYSA9IDEgLSBNYXRoLmV4cCgtZHQgLyBXQ19TUEVFRF9UQVVfTVMpXG4gICAgICAgICAgICBzY3JhdGNoLnNwZWVkICs9ICh2IC0gc2NyYXRjaC5zcGVlZCkgKiBhXG4gICAgICAgICAgICBzY3JhdGNoLnNwZWVkUGVhayA9IE1hdGgubWF4KHNjcmF0Y2guc3BlZWQsIHNjcmF0Y2guc3BlZWRQZWFrICogTWF0aC5leHAoLWR0IC8gV0NfUEVBS19GQURFX01TKSlcbiAgICAgICAgICAgIHNjcmF0Y2guc3BlZWRBdCA9IGRhYi50XG4gICAgICAgICAgICBzY3JhdGNoLnNwZWVkVHJhdmVsID0gMFxuICAgICAgICAgICAgc3BlZWRFbGFwc2VkID0gZHRcbiAgICAgICAgICB9XG4gICAgICAgICAgc2xvdyA9IHdhdGVyY29sb3JTbG93ZG93bihzY3JhdGNoLnNwZWVkLCBzY3JhdGNoLnNwZWVkUGVhaylcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzcGVudCA9IHBpZ1VzZWQgLSBzY3JhdGNoLnN1cnBsdXNBdFxuICAgICAgICAvLyBUd28gcmVzZXJ2b2lycywgc3BlbnQgYXQgdGhlaXIgb3duIGxlbmd0aHM6IGEgc3RvcCdzICh0aGUgZHdlbGwpIGxheXNcbiAgICAgICAgLy8gdGhlIGxhbmRpbmcncyBsb25nIHBvb2wsIGEgYnJha2luZydzIGEgY29tcGFjdCBvbmUgKFdDX1NMT1dfUlVOX1JBRElJKS5cbiAgICAgICAgc2NyYXRjaC5zdXJwbHVzUGlnbWVudCA9IHdhdGVyY29sb3JTdXJwbHVzKHNjcmF0Y2guc3VycGx1c1BpZ21lbnQsIHNwZW50LCB3YXRlcmNvbG9yRHdlbGxQaWdtZW50KHRhdSkgKiBwaWdtZW50R2F0ZSwgV0NfU1RBUlRfRVhDRVNTX1JBRElJKVxuICAgICAgICBzY3JhdGNoLnN1cnBsdXNXYXRlciA9IHdhdGVyY29sb3JTdXJwbHVzKHNjcmF0Y2guc3VycGx1c1dhdGVyLCBzcGVudCwgd2F0ZXJjb2xvckR3ZWxsV2F0ZXIodGF1KSAqIGdhdGVIZXJlLCBXQ19QVURETEVfUkFESUkpXG4gICAgICAgIHNjcmF0Y2guYnJha2VQaWdtZW50ID0gd2F0ZXJjb2xvckJyYWtlU3VycGx1cyhzY3JhdGNoLmJyYWtlUGlnbWVudCwgc3BlbnQsIFdDX1NMT1dfR0FJTiAqIHNsb3cgKiBwaWdtZW50R2F0ZSwgc3BlZWRFbGFwc2VkKVxuICAgICAgICBzY3JhdGNoLnR1cm5PZmZzZXRbMF0gKz0gZHg7IHNjcmF0Y2gudHVybk9mZnNldFsxXSArPSBkeVxuICAgICAgICBpZiAoTWF0aC5oeXBvdCguLi5zY3JhdGNoLnR1cm5PZmZzZXQpID49IE1hdGgubWF4KDEuNSwgbWlub3IgKiAwLjEyKSkge1xuICAgICAgICAgIC8vIEEgZ2VvbWV0cmljIGNvcm5lciBjaGFuZ2VzIGRpcmVjdGlvbiwgbm90IHRoZSBwaWdtZW50IHN1cHBseS5cbiAgICAgICAgICAvLyBCcmFraW5nIHN0aWxsIHVubG9hZHMgdGhyb3VnaCBpdHMgZWxhcHNlZC10aW1lIHJlc2Vydm9pciBhYm92ZS5cbiAgICAgICAgICBjb25zdCBkaXJlY3Rpb24gPSBzY3JhdGNoLnR1cm5PZmZzZXRcbiAgICAgICAgICBzY3JhdGNoLnR1cm5EaXJlY3Rpb24gPSBbLi4uZGlyZWN0aW9uXVxuICAgICAgICAgIHNjcmF0Y2gudHVybk9mZnNldCA9IFswLCAwXVxuICAgICAgICB9XG4gICAgICAgIHNjcmF0Y2guc3VycGx1c0F0ID0gcGlnVXNlZFxuICAgICAgICBzY3JhdGNoLnRyYWlsLnB1c2goeyB4OiBkYWIueCwgeTogZGFiLnksIHQ6IGRhYi50IH0pXG4gICAgICAgIGlmIChzY3JhdGNoLnRyYWlsLmxlbmd0aCA+IFdDX1RSQUlMX0xFTikgc2NyYXRjaC50cmFpbC5zaGlmdCgpXG4gICAgICAgIGNvbnN0IGV4Y2VzcyA9IHByb2ZpbGUud2F0ZXJEZXBsZXRpb24gPyB3YXRlcmNvbG9yRXhjZXNzRnJvbVN1cnBsdXMocGlnVXNlZCwgbGFuZGVkV2V0LCBNYXRoLm1heChzY3JhdGNoLnN1cnBsdXNQaWdtZW50LCBzY3JhdGNoLmJyYWtlUGlnbWVudCkpIDogMVxuICAgICAgICBleGNlc3NCeURhYi5zZXQoZGFiLCBleGNlc3MpXG4gICAgICAgIC8vICgjNjgwLCBzMTcuNzkpIC4uLmFuZCB0aGUgbGFuZGluZydzIG93biBzdXJwbHVzLCB3aGljaCBuZWVkcyBubyBkd2VsbDpcbiAgICAgICAgLy8gdGhlIHRvdWNoLWRvd24ncyBwb29sIGlzIGEgcG9vbCB0b28sIGJyb2tlbiBpbnRvIGJsb3RzIGxpa2UgdGhlIG90aGVycy5cbiAgICAgICAgY29uc3QgbGFuZGluZ1Bvb2wgPSAoMSAtIE1hdGgubWluKE1hdGgubWF4KGxhbmRlZFdldCwgMCksIDEpKSAqIE1hdGguZXhwKC1waWdVc2VkIC8gV0NfU1RBUlRfRVhDRVNTX1JBRElJKVxuICAgICAgICAvLyBCcmFraW5nIHBpZ21lbnQgaXMgbm90IGV4dHJhIHdhdGVyOiBhIHNoYXJwIHR1cm4gbXVzdCBub3QgaW52ZW50IGFcbiAgICAgICAgLy8gZGVlcCB2aXNpYmxlIHB1ZGRsZSBtZXJlbHkgYmVjYXVzZSBpdCB1bmxvYWRzIGEgbGl0dGxlIG1vcmUgY29sb3VyLlxuICAgICAgICAvLyBUaGUgcG9vbCBtdWx0aXBsaWVyIGFmZmVjdHMgb25seSBzdXJwbHVzIHBpZ21lbnQuIEJyYWtpbmcgZG9lc1xuICAgICAgICAvLyBub3QgYWRkIHN0YW5kaW5nIHdhdGVyIG9yIHR1cm4gYSBjb3JuZXIgaW50byBhIGRlZXAgcHVkZGxlLlxuICAgICAgICBwaWdtZW50UG9vbEJ5RGFiLnNldChkYWIsIE1hdGgubWF4KDAsIGV4Y2VzcyAtIDEpIC8gTWF0aC5tYXgoZXhjZXNzLCAxKSlcbiAgICAgICAgY29uc3Qgd2F0ZXJQb29sID0gTWF0aC5tYXgoc2NyYXRjaC5zdXJwbHVzV2F0ZXIsIGxhbmRpbmdQb29sKVxuICAgICAgICBwdWRkbGVCeURhYi5zZXQoZGFiLCBwcm9maWxlLndhdGVyRGVwbGV0aW9uID8gd2F0ZXJjb2xvclB1ZGRsZUZyb21TdXJwbHVzKHdhdGVyUG9vbCwgd2V0SGVyZSkgOiB3YXRlcmNvbG9yUHVkZGxlRGVwdGgocGlnVXNlZCwgbGFuZGVkV2V0LCB3ZXRIZXJlLCBzY3JhdGNoLmR3ZWxsTXMpKVxuICAgICAgICBpZiAocHJvZmlsZS53YXRlckRlcGxldGlvbikgdGhpcy5jdHguZGFiUG9vbCgpLnNldChkYWIsIE1hdGgubWluKHdhdGVyUG9vbCwgMSkpXG4gICAgICAgIGlmIChwcm9maWxlLm5vcm1hbGl6ZURlcG9zaXQgJiYgTWF0aC5oeXBvdChkeCwgZHkpID4gMC4wMSAmJiBwcm9maWxlLndhdGVyTGV2ZWwgPiAwKSBzY3JhdGNoLmJydXNoVHJhdmVsLnB1c2goe1xuICAgICAgICAgIHg6IGRhYi54LCB5OiBkYWIueSwgcmFkaXVzOiBtaW5vciwgYXNwZWN0OiBNYXRoLm1heCgxLCBkYWIuYXNwZWN0UmF0aW8pLCBhbmdsZTogZGFiLmFuZ2xlLCBkeCwgZHksIHdhdGVyOiBwcm9maWxlLndhdGVyTGV2ZWwsXG4gICAgICAgIH0pXG4gICAgICAgIHdhdGVyQnlEYWIuc2V0KGRhYiwgd2F0ZXIpXG4gICAgICAgIHBpZ21lbnRCeURhYi5zZXQoZGFiLCBwaWdtZW50TGVmdClcbiAgICAgICAgaWYgKHByb2ZpbGUubm9ybWFsaXplRGVwb3NpdCkgc2NyYXRjaC5zdGFuZGluZy5zZXQoZGFiLCB3YXRlcmNvbG9yU3RhbmRpbmdXYXRlcihkZWxpdmVyeS53YXRlciwgZGVsaXZlcnkucmV0YWluLCB3ZXRIZXJlLCBsb2FkKSlcbiAgICAgICAgLy8gVGhlIHN0YW1wcycgc2hhcmUgb2YgdGhlIGRvc2UsIGRvdWJsZWQgYmFjayB1cCBiZWNhdXNlIHRoZSBsZWdhY3lcbiAgICAgICAgLy8gZm9ybXVsYSdzIDAuNSBhc3N1bWVkIGFuIGV2ZW4gc3BsaXQgd2l0aCB0aGUgYmFuZHMuXG4gICAgICAgIGNvbnN0IHN0YW1wU2hhcmUgPSBwcm9maWxlLnN0YW1wSW5rU2hhcmUgPiAwID8gcHJvZmlsZS5zdGFtcElua1NoYXJlICogMiA6IDFcbiAgICAgICAgLy8gKMKnMTcuMjgpIFVuZGVyIE1BWCB0aGUgc3RhbXAncyB2YWx1ZSBJUyB0aGUgZmlsbTogc3BhY2luZy1mcmVlLlxuICAgICAgICBkZXBvc2l0cy5wdXNoKHByb2ZpbGUubm9ybWFsaXplRGVwb3NpdFxuICAgICAgICAgID8gKGZpbG1cbiAgICAgICAgICAgID8gcHJvZmlsZS5kZXBvc2l0UGVyUmFkaXVzICogV0NfRklMTV9ET1NFICogcGlnbWVudExlZnQgKiBleGNlc3NcbiAgICAgICAgICAgIDogcHJvZmlsZS5kZXBvc2l0UGVyUmFkaXVzICogKHNlZyAvIHJhZGl1cykgKiAwLjUgKiBzdGFtcFNoYXJlICogcGlnbWVudExlZnQgKiBleGNlc3MpXG4gICAgICAgICAgOiBkYWIub3BhY2l0eSAqIHNlZyAqIDAuNSAqIHRoaW5OaWJHYWluKGRhYiwgcHJldj8ueCA/PyBkYWIueCwgcHJldj8ueSA/PyBkYWIueSkpXG4gICAgICAgIHByZXYgPSBkYWJcbiAgICAgIH1cbiAgICAgIHNjcmF0Y2guYWR2YW5jZVdhdGVyKHVzZWQsIHBpZ1VzZWQpXG4gICAgfVxuICAgIC8vICgjNTM2LCDCpzE3LjYzKSBPbmx5IG5vdy4gRXZlcnl0aGluZyBhYm92ZSBpcyB0aGUgZ2VzdHVyZSdzIGJvb2trZWVwaW5nIC1cbiAgICAvLyB0aGUgYnJ1c2gncyB3YXRlciBhbmQgcGlnbWVudCBjbG9ja3MsIHRoZSBsYW5kaW5nIGFuZCBpdHMgZHdlbGwsIHRoZSBkYWJcbiAgICAvLyBzcGFjaW5nLCB0aGUgZGlyZWN0aW9uLCB0aGUgY29tcG9zaXRlJ3Mgc2NhbGFycyBmcm9tIHRoZSBmaXJzdCBkYWIgLSBhbmRcbiAgICAvLyBpdCBoYXMgdG8gYWR2YW5jZSBwZXIgZGFiIHdoZXRoZXIgb3Igbm90IHRoZSBiYXRjaCBsYW5kcyBvbiB0aGUgc2hlZXQuXG4gICAgLy8gUmV0dXJuaW5nIGJlZm9yZSBpdCBtYWRlIHRoZSByZXN1bHQgZGVwZW5kIG9uIGhvdyB0aGUgZ2VzdHVyZSB3YXMgY3V0XG4gICAgLy8gaW50byBiYXRjaGVzOiB0aGUgYXV0aG9yJ3MgbGl2ZSBiYXRjaGVzIG9mZiB0aGUgc2hlZXQgc3BlbnQgbm90aGluZywgYW5kXG4gICAgLy8gdGhlIGJydXNoIGNhbWUgb250byB0aGUgcGFwZXIgZnVsbHkgbG9hZGVkOyBhIHJlcGxheSBwYWludHMgdGhlIG9wZXJhdGlvblxuICAgIC8vIGFzIG9uZSBiYXRjaCB0aGF0IGRvZXMgcmVhY2ggdGhlIHNoZWV0LCBhbmQgaXQgY2FtZSBvbiBhbHJlYWR5IHNwZW50IC1cbiAgICAvLyAzMC00MCAlIGxpZ2h0ZXIgb3ZlciB0aGUgd2hvbGUgbWFyayAoYSBWIGJlZ3VuIG9mZiB0aGUgcGFnZSBhdCAzMiAlKS5cbiAgICBpZiAoIXRhcmdldHMubGVuZ3RoKSByZXR1cm5cblxuICAgIC8vICgjNTM2LCBBRFIgMDExIMKnMTcuMTApIFRoZSBoYWxvOiBhIHNlY29uZCwgd2lkZXIsIHdlYWtlciBzdGFtcCBmb3IgZXZlcnlcbiAgICAvLyBkYWIgdGhhdCBsYW5kZWQgb24gd2V0IHBhcGVyLCBpbnRvIHRoZSBzYW1lIGNvdmVyYWdlIGFuZCBkZXBvc2l0IGJ1ZmZlcnMuXG4gICAgLy8gVGhpcyBpcyB3aGVyZSB3ZXQtaW4td2V0IGdyb3d0aCBsaXZlcyBub3csIGFuZCB0aGUgcmVhc29uIGl0IGxpdmVzIGhlcmVcbiAgICAvLyByYXRoZXIgdGhhbiBpbiB0aGUgY29tcG9zaXRlIGlzIHNwZWxsZWQgb3V0IGF0IHdhdGVyY29sb3JIYWxvLiBHcm93blxuICAgIC8vIGNvcGllcyBjYXJyeSBvdmVyIGV2ZXJ5IHBlci1kYWIgcmVhZGluZyBvZiB0aGUgb3JpZ2luYWwsIHNvIHRoZSBiYW5kc1xuICAgIC8vIGFuZCBzdGFtcHMgb2YgdGhlIGhhbG8gYWdyZWUgd2l0aCB0aGUgbWFyaydzIG93biBhYm91dCB3YXRlciwgaGFpclxuICAgIC8vIGRpcmVjdGlvbiBhbmQgcGFwZXIuXG4gICAgY29uc3QgaGFsb0RhYnM6IERhYltdID0gW11cbiAgICBjb25zdCBoYWxvRG9zZUJ5RGFiID0gbmV3IE1hcDxEYWIsIG51bWJlcj4oKVxuICAgIC8qKiBXaGF0IGVhY2ggT1JJR0lOQUwgZGFiIGdhdmUgdXAgdG8gaXRzIGhhbG8sIHNvIHRoZSBjb3JlIGlzIGxhaWQgbGlnaHRlclxuICAgICAqICBieSBleGFjdGx5IHRoYXQgc2hhcmUg4oCUIGNvbnNlcnZhdGlvbiwgYW5kIHRoZSBcImRpc3NvbHZlcyBpbiB3YXRlclwiIGZlZWwuICovXG4gICAgY29uc3QgaGFsb1NoZWRCeURhYiA9IG5ldyBNYXA8RGFiLCBudW1iZXI+KClcbiAgICBsZXQgYW55SGFsbyA9IGZhbHNlXG4gICAgLy8gQSBmbGF0IGRpc2MsIG5vdCB0aGUgdG9vbCdzIGNvbmUuIFRoZSBpbmsgc3RhbXAgaXMgYSBjb25lIHRoYXQgaXMgemVybyBhdFxuICAgIC8vIHRoZSBuaWIncyByaW0gKGlua0VkZ2VGYWxsb2ZmIDAg4oCUIHNlZSB0aGUgc2hhZGVyJ3MgbWl4KHVfaW5rRWRnZSwgMSwgZGVwdGgpKSxcbiAgICAvLyBzbyBhIHN0YW1wIG1lcmVseSBtYWRlIHdpZGVyIHB1dHMgb25seSB0aGUgY29uZSdzIG91dGVyIHNsb3BlIG92ZXIgdGhlXG4gICAgLy8gcmluZyB0aGF0IGlzIHRoZSBoYWxvOiBtZWFzdXJlZCBvbiBhIHJlcGxheSBvZiBJbHlhJ3Mgb3duIHN0cm9rZSB0aHJvdWdoXG4gICAgLy8gdGhlIGRlbnNpdHkgdmlldywgYSBoYWxvIDIuOXggd2lkZXIgYXQgbmVhcmx5IGZ1bGwgZG9zZSByZWdpc3RlcmVkIGF0IGFcbiAgICAvLyBmZXcgcGVyIGNlbnQgb2YgdGhlIGNvcmUuIFRoZSBoYWxvIGlzIGEgcGxhdGVhdSBvZiBtaWdyYXRlZCBwaWdtZW50LCBhbmRcbiAgICAvLyBhIHBsYXRlYXUgaXMgd2hhdCB0aGlzIHByb2ZpbGUgbGF5cy5cbiAgICBjb25zdCBoYWxvUHJvZmlsZTogUmliYm9uUHJvZmlsZSA9IHsgLi4ucHJvZmlsZSwgaW5rRWRnZUZhbGxvZmY6IDEgfVxuICAgIGlmIChwcm9maWxlLm5vcm1hbGl6ZURlcG9zaXQpIHtcbiAgICAgIGZvciAoY29uc3QgZGFiIG9mIGRyYXdhYmxlKSB7XG4gICAgICAgIGNvbnN0IHsgc2NhbGUsIHNoZWQsIHdldCB9ID0gd2F0ZXJjb2xvckhhbG8ocGFwZXJXZXRCeURhYi5nZXQoZGFiKSA/PyAwLCB3YXRlckJ5RGFiLmdldChkYWIpID8/IDApXG4gICAgICAgIC8vIFBhc3QgdGhlIGNvbXBvc2l0ZSdzIGJsb29tLCBub3QgbWVyZWx5IHBhc3QgdGhlIGRhYiDigJQgc2VlXG4gICAgICAgIC8vIFdBVEVSQ09MT1JfSEFMT19QQVNUX0JMT09NLiBzcHJlYWRQeCBpcyB0aGUgZ2VzdHVyZSdzIHJlYWNoIGluIHdvcmxkXG4gICAgICAgIC8vIHB4IGFuZCBkYWIuc2l6ZSBpcyBhIGRpYW1ldGVyLCBoZW5jZSB0aGUgZmFjdG9yIG9mIHR3by5cbiAgICAgICAgY29uc3QgZ3Jvd246IERhYiA9IHsgLi4uZGFiLCBzaXplOiBkYWIuc2l6ZSAqIHNjYWxlICsgMiAqIFdBVEVSQ09MT1JfSEFMT19QQVNUX0JMT09NICogc3ByZWFkUHggKiB3ZXQgfVxuICAgICAgICBoYWxvRGFicy5wdXNoKGdyb3duKVxuICAgICAgICAvLyBUaGUgc2hlZCBzaGFyZSBhcyB0aGUgaGFsbyBzdGFtcCdzIGRvc2UsIHVuLWNvbXBlbnNhdGVkIGZvciB0aGUgd2lkZXJcbiAgICAgICAgLy8gcmFkaXVzIG9uIHB1cnBvc2Ug4oCUIHNlZSB3YXRlcmNvbG9ySGFsbyBvbiB3aHkgcGVyIHBpeGVsIGl0IGNvbWVzIG91dFxuICAgICAgICAvLyBhcyBzaGVkIC8gc2NhbGUsIGEgcmluZydzIHdvcnRoIHJhdGhlciB0aGFuIGEgZGlzYydzLlxuICAgICAgICBoYWxvRG9zZUJ5RGFiLnNldChncm93biwgc2hlZClcbiAgICAgICAgaGFsb1NoZWRCeURhYi5zZXQoZGFiLCBzaGVkKVxuICAgICAgICBpZiAoc2hlZCA+IDApIGFueUhhbG8gPSB0cnVlXG4gICAgICAgIGNvbnN0IGFjcm9zcyA9IGFjcm9zc0J5RGFiLmdldChkYWIpXG4gICAgICAgIGlmIChhY3Jvc3MpIGFjcm9zc0J5RGFiLnNldChncm93biwgYWNyb3NzKVxuICAgICAgICB3YXRlckJ5RGFiLnNldChncm93biwgd2F0ZXJCeURhYi5nZXQoZGFiKSA/PyAwKVxuICAgICAgICBwaWdtZW50QnlEYWIuc2V0KGdyb3duLCBwaWdtZW50QnlEYWIuZ2V0KGRhYikgPz8gMSlcbiAgICAgICAgcGlnbWVudFBvb2xCeURhYi5zZXQoZ3Jvd24sIHBpZ21lbnRQb29sQnlEYWIuZ2V0KGRhYikgPz8gMC41KVxuICAgICAgICBleGNlc3NCeURhYi5zZXQoZ3Jvd24sIGV4Y2Vzc0J5RGFiLmdldChkYWIpID8/IDEpXG4gICAgICAgIHB1ZGRsZUJ5RGFiLnNldChncm93biwgcHVkZGxlQnlEYWIuZ2V0KGRhYikgPz8gMSlcbiAgICAgICAgcGFwZXJXZXRCeURhYi5zZXQoZ3Jvd24sIHBhcGVyV2V0QnlEYWIuZ2V0KGRhYikgPz8gMClcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBCYW5kcyBzaGFyZSB0aGUgc3RhbXBzJyBzY2FsZSwgb3IgdGhleSB3b3VsZCBzd2FtcCBpdDogdGhlIHR3byBvdmVybGFwXG4gICAgLy8gYWxtb3N0IGV2ZXJ5d2hlcmUgYW5kIGVhY2ggY2FycmllcyBoYWxmIGEgZG9zZSwgc28gYSBiYW5kIHN0aWxsIG9uIHRoZVxuICAgIC8vIGxlZ2FjeSBzY2FsZSB3b3VsZCBkcm93biB3aGF0ZXZlciB0aGUgbm9ybWFsaXplZCBzdGFtcHMgZXhwcmVzc2VkLlxuICAgIC8vIE9taXR0aW5nIHRoZSBjYWxsYmFjayBsZWF2ZXMgYnVpbGRSaWJib25CYW5kcycgb3duIGZvcm11bGEgdW50b3VjaGVkLFxuICAgIC8vIHdoaWNoIGlzIHdoYXQgdGhlIGJydXNoIHBlbiBnZXRzLiBUaGUgbWFya2VyICgjNTU5KSBwYXNzZXMgdGhhdCBzYW1lXG4gICAgLy8gZm9ybXVsYSBiYWNrIGluIHdpdGggdGhlIHRoaW4tbmliIGdhaW4gb24gaXQsIHNvIGl0cyBiYW5kcyBhbmQgc3RhbXBzXG4gICAgLy8gc3RheSBvbiBvbmUgc2NhbGUg4oCUIGEgZ2FpbiBvZiAxIHJlcHJvZHVjZXMgdGhlIG9taXR0ZWQgY2FzZSBleGFjdGx5LlxuICAgIGNvbnN0IGlua0ZvciA9IHByb2ZpbGUudGhpbk5pYklua1JlZlB4ID4gMCAmJiAhcHJvZmlsZS5ub3JtYWxpemVEZXBvc2l0XG4gICAgICA/IChkMDogRGFiLCBkMTogRGFiLCB0cmF2ZWw6IG51bWJlcik6IHsgaW5rOiBudW1iZXI7IHdhdGVyOiBudW1iZXI7IHBhcGVyV2V0OiBudW1iZXI7IHN0cmVuZ3RoOiBudW1iZXI7IHB1ZGRsZTogbnVtYmVyOyBwaWdtZW50UG9vbD86IG51bWJlciB9ID0+ICh7XG4gICAgICAgIGluazogZDEub3BhY2l0eSAqIHRyYXZlbCAqIDAuNSAqIHRoaW5OaWJHYWluKGQxLCBkMC54LCBkMC55KSxcbiAgICAgICAgd2F0ZXI6IDAsIHBhcGVyV2V0OiAwLCBzdHJlbmd0aDogMCwgcHVkZGxlOiAxLFxuICAgICAgfSlcbiAgICAgIDogcHJvZmlsZS5ub3JtYWxpemVEZXBvc2l0XG4gICAgICA/IChkMDogRGFiLCBkMTogRGFiLCB0cmF2ZWw6IG51bWJlcik6IHsgaW5rOiBudW1iZXI7IHdhdGVyOiBudW1iZXI7IHBhcGVyV2V0OiBudW1iZXI7IHN0cmVuZ3RoOiBudW1iZXI7IHB1ZGRsZTogbnVtYmVyOyBwaWdtZW50UG9vbD86IG51bWJlciB9ID0+IHtcbiAgICAgICAgLy8gIzQ4OTogc2FtZSBtZWFzdXJlIHRoZSBzdGFtcHMgdXNlLCBhbmQgaXQgaGFzIHRvIGJlIHRoZSBzYW1lIG9uZSDigJRcbiAgICAgICAgLy8gdGhlIGJhbmRzIG92ZXJsYXAgdGhlIHN0YW1wcyBhbG1vc3QgZXZlcnl3aGVyZSwgc28gdHdvIGRpZmZlcmVudFxuICAgICAgICAvLyByZWFkaW5ncyBvZiBcImhvdyBmYXIgaW4gbmliIHVuaXRzXCIgd291bGQgc2hvdyB1cCBhcyBhIHNlYW0uXG4gICAgICAgIGNvbnN0IG1pbm9yID0gZDEuc2l6ZSAqIDAuNSAqIHByZXNldC5zaXplTXVsdGlwbGllclxuICAgICAgICBjb25zdCBiZHggPSBkMS54IC0gZDAueFxuICAgICAgICBjb25zdCBiZHkgPSBkMS55IC0gZDAueVxuICAgICAgICBjb25zdCBiYW5kQW5nbGUgPSBNYXRoLmh5cG90KGJkeCwgYmR5KSA+IDAuMDEgPyBNYXRoLmF0YW4yKGJkeSwgYmR4KSA6IG51bGxcbiAgICAgICAgY29uc3QgcmFkaXVzID0gTWF0aC5tYXgod2F0ZXJjb2xvclRyYXZlbFJhZGl1cyhcbiAgICAgICAgICBtaW5vciAqIE1hdGgubWF4KGQxLmFzcGVjdFJhdGlvLCAxKSwgbWlub3IsIGQxLmFuZ2xlLCBiYW5kQW5nbGUsXG4gICAgICAgICksIDAuNSlcbiAgICAgICAgLy8gUGVyIHNlZ21lbnQsIG5vdCBwZXIgYmF0Y2g6IHRoZSB3YXRlciB3ZWlnaHRpbmcgcmlkZXMgdGhlIHZlcnRleCBub3dcbiAgICAgICAgLy8gKG1hcmtlclJpYmJvbi50cydzIEZMT0FUU19QRVJfVkVSVEVYKSBwcmVjaXNlbHkgc28gdGhhdCBob3cgdGhlXG4gICAgICAgIC8vIHN0cm9rZSB3YXMgY3V0IGludG8gcG9pbnRlciBldmVudHMgY2Fubm90IGNoYW5nZSB0aGUgcmVzdWx0LlxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGluazogKGZpbG1cbiAgICAgICAgICAgID8gcHJvZmlsZS5kZXBvc2l0UGVyUmFkaXVzICogV0NfRklMTV9ET1NFICogMlxuICAgICAgICAgICAgOiBwcm9maWxlLmRlcG9zaXRQZXJSYWRpdXMgKiAodHJhdmVsIC8gcmFkaXVzKSAqIDAuNSAqICgoMSAtIHByb2ZpbGUuc3RhbXBJbmtTaGFyZSkgKiAyKSlcbiAgICAgICAgICAgICogKHBpZ21lbnRCeURhYi5nZXQoZDEpID8/IDEpXG4gICAgICAgICAgICAqIChleGNlc3NCeURhYi5nZXQoZDEpID8/IDEpXG4gICAgICAgICAgICAvLyAoIzUzNikg4oCmbGVzcyB3aGF0IHRoaXMgZGFiIHNoZWQgaW50byBzdGFuZGluZyB3YXRlciDigJQgc2VlIHRoZVxuICAgICAgICAgICAgLy8gaGFsbywgd2hpY2ggaXMgbWFkZSBvZiBleGFjdGx5IHRoaXMgc2hhcmUuXG4gICAgICAgICAgICAqICgxIC0gKGhhbG9TaGVkQnlEYWIuZ2V0KGQxKSA/PyAwKSksXG4gICAgICAgICAgd2F0ZXI6IHdhdGVyQnlEYWIuZ2V0KGQxKSA/PyAwLFxuICAgICAgICAgIHBhcGVyV2V0OiBwYXBlcldldEJ5RGFiLmdldChkMSkgPz8gMCxcbiAgICAgICAgICAvLyAoIzY4MCwgczE3Ljg0KSBOZWdhdGl2ZSBvbiBhIHNlZ21lbnQgdGhlIGJydXNoIGJhcmVseSBtb3ZlZFxuICAgICAgICAgIC8vIGFsb25nOiBpdHMgZGlyZWN0aW9uIGppdHRlcnMsIGFuZCB0aGUgY292ZXJhZ2UgcGFzcyBsZWF2ZXMgdGhlXG4gICAgICAgICAgLy8gcG9vbCBtYXJrICguZykgb2ZmIHRoZXJlIC0gc2VlIG1vdmluZ0J5RGFiLiBUaGUgaW5rIHBhc3MgcmVhZHNcbiAgICAgICAgICAvLyB0aGUgbWFnbml0dWRlLlxuICAgICAgICAgIHN0cmVuZ3RoOiBNYXRoLmh5cG90KGJkeCwgYmR5KSA+IDAuMiAqIG1pbm9yID8gaW5rU3RyZW5ndGggOiAtaW5rU3RyZW5ndGgsXG4gICAgICAgICAgcHVkZGxlOiBwdWRkbGVCeURhYi5nZXQoZDEpID8/IDEsXG4gICAgICAgICAgcGlnbWVudFBvb2w6IHBpZ21lbnRQb29sQnlEYWIuZ2V0KGQxKSA/PyAwLjUsXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIDogdW5kZWZpbmVkXG4gICAgLy8gIzU0NyDigJQgbm90IG1lcmVseSB1bnVzZWQgZm9yIGEgc3RhbXBzLW9ubHkgdG9vbCBidXQgbm90IGJ1aWx0IGF0IGFsbDpcbiAgICAvLyB0aGUgYmFuZCBidWlsZGVyIHdhbGtzIGV2ZXJ5IGNvbnNlY3V0aXZlIHBhaXIgYW5kIGFsbG9jYXRlcyBhIHZlcnRleFxuICAgIC8vIGJ1ZmZlciBwZXIgc2VnbWVudCwgd2hpY2ggb24gYSBkZW5zZWx5LXNwYWNlZCBicnVzaCBzdHJva2UgaXMgdGhlIGxhcmdlclxuICAgIC8vIGhhbGYgb2YgdGhlIENQVSB3b3JrIGluIHRoaXMgbWV0aG9kLlxuICAgIGNvbnN0IGJhbmRzID0gcHJvZmlsZS5zdGFtcHNPbmx5ID8gRU1QVFlfQkFORFMgOiBidWlsZFJpYmJvbkJhbmRzKFxuICAgICAgZHJhd2FibGUsIHByZXNldC5zaXplTXVsdGlwbGllciwgcHJldkRhYiwgbmliU2hhcGUsIGNvcm5lckZyYWN0aW9uLCBwcm9maWxlLmFhUHgsIGlua0ZvciwgZmlsbSxcbiAgICApXG5cbiAgICAvLyAoIzUzNiwgczE3LjEzKSBUaGUgaGFpcnMnIGJ1bmRsZSBjb3VudCwgZm9yIHRoZSBpbmsgcGFzcyBiZWxvdyBhbmQgdGhlXG4gICAgLy8gY29tcG9zaXRlIGFsaWtlIC0gc2VlIHJpYmJvbkJyaXN0bGVDb21icy5cbiAgICBjb25zdCBjb21icyA9IHJpYmJvbkJyaXN0bGVDb21icyhwcm9maWxlLCBicmlzdGxlUmFkaXVzUHgpXG4gICAgLy8gKCM1MzYsIMKnMTcuMTkpIFRoaXMgc3Ryb2tlJ3MgcGFpbnQgYXMgYWJzb3JwdGlvbiwgZm9yIHRoZSBjb2xvdXIgcmVjb3JkLlxuICAgIGNvbnN0IHRhdSA9IHBpZ21lbnRBYnNvcnB0aW9uKGNvbG9yKVxuICAgIHNjcmF0Y2gucGFpbnRzLmFkZChjb2xvci5qb2luKCcsJykpXG5cbiAgICAvLyAjNTQ3IOKAlCBmbG93LCBub3JtYWxpemVkIGFnYWluc3QgaG93IGZhciB0aGUgYnJ1c2ggdHJhdmVsbGVkIGJldHdlZW5cbiAgICAvLyBzdGFtcHMsIGNvbXB1dGVkIG9uY2UgZm9yIHRoZSBiYXRjaCByYXRoZXIgdGhhbiBwZXIgdGlsZS5cbiAgICAvL1xuICAgIC8vIFdoeSBpdCBoYXMgdG8gYmUgbm9ybWFsaXplZCBhdCBhbGwsIGFuZCB0aGlzIGlzIHRoZSBjb3JyZWN0aW9uIHRvIHRoZVxuICAgIC8vIGZpcnN0IHZlcnNpb246IHRoZSBjb3ZlcmFnZSBidWZmZXIgYWNjdW11bGF0ZXMgYXMgcGxhaW4gXCJvdmVyXCIsIGFuZCB0aGVcbiAgICAvLyBzdGFtcHMgb2YgdGhpcyB0b29sIGFyZSBzcGFjZWQgYSAqdHdlbnRpZXRoKiBvZiB0aGUgZm9vdHByaW50IGFwYXJ0LiBBXG4gICAgLy8gcGl4ZWwgaXMgdGhlcmVmb3JlIHVuZGVyIH4yMCBvZiB0aGVtIGluIGEgc2luZ2xlIHBhc3MsIHNvIGV2ZW4gYSBmbG93IG9mXG4gICAgLy8gMC4xMiByZWFjaGVzIDEgLSAwLjg4XjIwID0gMC45MiDigJQgYW5kIGV2ZXJ5IGJydXNoLCBhdCBldmVyeSBwcmVzc3VyZSwgY2FtZVxuICAgIC8vIG91dCBhdCBmdWxsIGRlbnNpdHkuIFRoZSBzZXR0aW5nIGV4aXN0ZWQgYW5kIGNvdWxkIG5vdCBiZSBzZWVuIChcItC90LDQttC40LxcbiAgICAvLyDQvNC10L3Rj9C10YIg0L/Qu9C+0YLQvdC+0YHRgtGMINCy0L7QvtCx0YnQtSDQvdC1INGA0LDQsdC+0YLQsNC10YIsINCy0YHRkSDQstGA0LXQvNGPINC80LDQutGB0LjQvNCw0LvRjNC90LDRjyDQv9C70L7RgtC90L7RgdGC0YxcIikuXG4gICAgLy9cbiAgICAvLyBUaGUgZml4IG1ha2VzIGBmbG93YCBtZWFuIHdoYXQgYSBwYWludGVyIG1lYW5zIGJ5IGl0OiAqKmhvdyBtdWNoIG9uZSBmdWxsXG4gICAgLy8gcGFzcyBvZiB0aGUgYnJ1c2ggbGF5cyBkb3duKiosIHJhdGhlciB0aGFuIGhvdyBtdWNoIG9uZSBzdGFtcCBkb2VzLiBQZXJcbiAgICAvLyBzdGFtcCB0aGF0IGlzXG4gICAgLy9cbiAgICAvLyAgICAgZicgPSAxIC0gKDEgLSBmKSBeICh0cmF2ZWwgLyBkaWFtZXRlcilcbiAgICAvL1xuICAgIC8vIHNvIHRoYXQgYWZ0ZXIgdHJhdmVsbGluZyBvbmUgZGlhbWV0ZXIg4oCUIGkuZS4gYWZ0ZXIgdGhlIH5kaWFtZXRlci90cmF2ZWxcbiAgICAvLyBzdGFtcHMgdGhhdCBjb3ZlciBhIGdpdmVuIHBpeGVsIOKAlCB0aGUgYWNjdW11bGF0ZWQgY292ZXJhZ2UgaXMgZXhhY3RseSBmLFxuICAgIC8vIHdoYXRldmVyIHRoZSBzcGFjaW5nLiBUd28gY29uc2VxdWVuY2VzIHdvcnRoIG5hbWluZzogdGhlIGRlbnNpdHkgc3RvcHNcbiAgICAvLyBkZXBlbmRpbmcgb24gaG93IGZhc3QgdGhlIHN0cm9rZSB3YXMgZHJhd24gKGZhc3Qgc3Ryb2tlcyB1c2VkIHRvIGJlXG4gICAgLy8gc3BhcnNlciBhbmQgdGhlcmVmb3JlIHBhbGVyKSwgYW5kIGl0IHN0b3BzIGRlcGVuZGluZyBvbiB0aGUgYnJ1c2gnc1xuICAgIC8vIGF1dGhvcmVkIHNwYWNpbmcsIHdoaWNoIGlzIG5vdyBmcmVlIHRvIGJlIGNob3NlbiBmb3Igc21vb3RobmVzcyBhbG9uZS5cbiAgICBjb25zdCBzdGFtcEZsb3dzID0gcHJvZmlsZS5zdGFtcEZsb3dcbiAgICAgID8gZHJhd2FibGUubWFwKChkYWIsIGkpID0+IHtcbiAgICAgICAgY29uc3QgcHJldk9uZSA9IGkgPT09IDAgPyBwcmV2RGFiIDogZHJhd2FibGVbaSAtIDFdXG4gICAgICAgIGNvbnN0IGRpYW1ldGVyID0gTWF0aC5tYXgoZGFiLnNpemUgKiBwcmVzZXQuc2l6ZU11bHRpcGxpZXIsIDAuNSlcbiAgICAgICAgY29uc3QgdHJhdmVsID0gdGhpcy5jdHgubWFya2VyU2VnbWVudExlbmd0aChkYWIsIHByZXZPbmUsIGRpYW1ldGVyICogMC41KVxuICAgICAgICBjb25zdCBmdWxsID0gcHJvZmlsZS5zdGFtcEZsb3chKGRhYi5wcmVzc3VyZSlcbiAgICAgICAgaWYgKGZ1bGwgPj0gMSkgcmV0dXJuIDFcbiAgICAgICAgcmV0dXJuIE1hdGgubWF4KDAsIE1hdGgubWluKDEsIDEgLSBNYXRoLnBvdygxIC0gZnVsbCwgTWF0aC5taW4odHJhdmVsIC8gZGlhbWV0ZXIsIDEpKSkpXG4gICAgICB9KVxuICAgICAgOiBudWxsXG5cblxuXG4gICAgZm9yIChjb25zdCB0aWxlIG9mIHRhcmdldHMpIHtcbiAgICAgIGNvbnN0IHsgb3JpZ2luYWwsIGNvdmVyYWdlLCBpbmtMb2FkLCBpbmtDb2xvciB9ID0gc2NyYXRjaC5nZXRPckNyZWF0ZSh0aWxlLmJ1ZmZlcilcblxuICAgICAgLy8gIzU0NywgQURSIDAxMyDCpzMg4oCUIHRoZSBzdGFtcCdzIG93biBgb3BhY2l0eWAgYXJndW1lbnQgaXMgdGhpcyBkYWInc1xuICAgICAgLy8gKipmbG93KiogZm9yIHRoZSBkaWdpdGFsIGJydXNoLCBhbmQgYSBwbGFpbiAwIGZvciB0aGUgdGhyZWUgdG9vbHMgd2hvc2VcbiAgICAgIC8vIGNvdmVyYWdlIHBhc3Mgb25seSBuZWVkcyBhIHNpbGhvdWV0dGUgKHRoZWlyIG1vZGUtNiBicmFuY2ggaWdub3JlcyBpdCkuXG4gICAgICAvLyAoIzUzNiwgczE3LjExKSBGb3IgdGhlIHdhdGVyY29sb3IgdGhlIHJlY29yZGVkIHBhcGVyIHdldG5lc3MgcmlkZXNcbiAgICAgIC8vIGFsb25nIGludG8gdGhlIGNvdmVyYWdlIHN0YW1wIHRvbzogaXRzIC5iIGlzIHRoZSBzdGFuZGluZy13YXRlclxuICAgICAgLy8gcmVjb3JkIHRoZSBkaWZmdXNpb24gcGFzcyBnYXRlcyBvbi4gU2VlIHVfd2FzaFdhdGVyLlxuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBkcmF3YWJsZS5sZW5ndGg7IGkrKykge1xuICAgICAgICBjb25zdCBkYWIgPSBkcmF3YWJsZVtpXVxuICAgICAgICBpZiAoIXRoaXMuY3R4Lm5pYlRvdWNoZXNUaWxlKHRpbGUsIGRhYiwgcHJlc2V0KSkgY29udGludWUgLy8gKMKnMTcuNzApXG4gICAgICAgIHRoaXMuY3R4LmRyYXdSaWJib25OaWJQYXNzKFxuICAgICAgICAgIGNvdmVyYWdlLCB0aWxlLCBkYWIsIHByZXNldCwgcHJvZmlsZSwgcHJvZmlsZS5jb3ZlcmFnZUlua01vZGUsXG4gICAgICAgICAgc3RhbXBGbG93cyA/IHN0YW1wRmxvd3NbaV0gOiAwLCB0cnVlLCB3YXRlckJ5RGFiLmdldChkYWIpID8/IDAsIGFjcm9zc0J5RGFiLmdldChkYWIpID8/IFswLCAxXSxcbiAgICAgICAgICBwYXBlcldldEJ5RGFiLmdldChkYWIpID8/IDAsIDEsIFswLCAwXSwgbnVsbCwgY29tYnMsIDAsIG51bGwsIHB1ZGRsZUJ5RGFiLmdldChkYWIpID8/IDEsXG4gICAgICAgICAgLy8gKHMxNy44NCkgLi4uYW5kIHRoZSBwb29sIHNoYXJlIGludG8gdGhlIGNvdmVyYWdlJ3MgLmcgLSB3aGVyZVxuICAgICAgICAgIC8vIHRoZSBicnVzaCB3YXMgbW92aW5nOiBhIHN0YW5kaW5nIGRhYiBoYXMgbm8gZGlyZWN0aW9uIHRvIGNvbWJcbiAgICAgICAgICAvLyBhbG9uZyAoaXRzIGFjcm9zcyBpcyB0aGUgZGVmYXVsdCwgbm90IHRoZSB0cmF2ZWwncykuXG4gICAgICAgICAgcHJvZmlsZS53YXRlckRlcGxldGlvbiAmJiBtb3ZpbmdCeURhYi5oYXMoZGFiKSA/IDEgOiAwLFxuICAgICAgICApXG4gICAgICAgIHlpZWxkIHBpZWNlVHJpcyA/IHRoaXMuY3R4Lm5pYkRyYXdDb3N0KHRpbGUsIGRhYiwgcHJlc2V0KSA6IDBcbiAgICAgIH1cbiAgICAgIC8vICM1NDcg4oCUIGEgYnJ1c2gncyBtYXJrIGlzIGEgcmVwZWF0ZWQgc3RhbXAsIG5vdCBhIHN3ZXB0IHNtZWFyLCBzbyB0aGVcbiAgICAgIC8vIGJhbmRzIHRoYXQgZmlsbCBiZXR3ZWVuIHNhbXBsZXMgYXJlIHN3aXRjaGVkIG9mZiBmb3IgaXQgKEFEUiAwMTMgwqc0KS5cbiAgICAgIC8vIFRoZSB0aHJlZSBvbGRlciB0b29scyBrZWVwIHRoZW06IG9uIGEgdHVybiB0aGUgYmFuZHMgcmVhY2ggcGxhY2VzIHRoZVxuICAgICAgLy8gc3RhbXBzIG1pc3MsIGFuZCB3aXRoIG5vdGhpbmcgdGhlcmUgdGhlIGNvbXBvc2l0ZSBwYWludHMgYmFyZSBwYXBlci5cbiAgICAgIGlmICghcHJvZmlsZS5zdGFtcHNPbmx5ICYmIGJhbmRzLmxlbmd0aCkge1xuICAgICAgICBmb3IgKGNvbnN0IHBpZWNlIG9mIHJpYmJvbkJhbmRQaWVjZXMoYmFuZHMsIHBpZWNlVHJpcykpIHtcbiAgICAgICAgICBjb25zdCBweCA9IHBpZWNlVHJpcyA/IHJpYmJvbkJhbmRQaWVjZUNvc3QocGllY2UsIHRpbGUpIDogMFxuICAgICAgICAgIGlmIChwaWVjZVRyaXMgJiYgIXB4KSBjb250aW51ZSAvLyAowqcxNy43MCkgbm90aGluZyBvZiBpdCBvbiB0aGlzIHRpbGVcbiAgICAgICAgICB0aGlzLmN0eC5kcmF3UmliYm9uQmFuZHMoXG4gICAgICAgICAgICBjb3ZlcmFnZSwgdGlsZSwgcGllY2UsICdjb3ZlcmFnZScsIHByb2ZpbGUuYWFQeCwgMCwgMCwgWzAsIDBdLFxuICAgICAgICAgICAgcmliYm9uV2F0ZXJEZWxpdmVyeShwcm9maWxlKS53YXRlciwgcmliYm9uV2F0ZXJEZWxpdmVyeShwcm9maWxlKS5yZXRhaW4sXG4gICAgICAgICAgICBjb21icywgMCwgbnVsbCwgcHJvZmlsZS53YXRlckRlcGxldGlvbiA/IDEgOiAwLFxuICAgICAgICAgIClcbiAgICAgICAgICB5aWVsZCBweFxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIEluayBmb2xsb3dzIHRoZSAqc2FtZSogZmlndXJlIGFzIHRoZSBzaWxob3VldHRlLiBEZXBvc2l0aW5nIGl0IG9ubHkgYXRcbiAgICAgIC8vIHRoZSBzYW1wbGUgc3RhbXBzIGlzIHdoYXQgcHJvZHVjZWQgdGhlIHJvdW5kZWQgd2hpdGUgbm90Y2hlcyBvbiB0dXJuczpcbiAgICAgIC8vIGJldHdlZW4gc3RhbXBzIHRoZSByaWJib24gc3RpbGwgbWFkZSB0aGUgbWFyayBmdWxseSBvcGFxdWUsIGJ1dCB3aXRoIGFuXG4gICAgICAvLyBpbmsgbG9hZCBvZiB6ZXJvIHRoZSBjb21wb3NpdGUgbXVsdGlwbGllcyBieSBub3RoaW5nIGFuZCB0aGUgcGFwZXJcbiAgICAgIC8vIHNob3dzIHN0cmFpZ2h0IHRocm91Z2guIEJvdGggaGFsdmVzIGNhcnJ5IGhhbGYgYSBkb3NlIGVhY2ggKHNlZVxuICAgICAgLy8gYnVpbGRSaWJib25CYW5kcykgc28gdGhlaXIgb3ZlcmxhcCBzdW1zIHRvIHRoZSBjYWxpYnJhdGVkIGFtb3VudC5cbiAgICAgIC8vXG4gICAgICAvLyBTa2lwcGVkIGVudGlyZWx5IGZvciBhIGNvdmVyaW5nIGluaywgd2hpY2ggaGFzIG5vIHN1Y2ggcXVhbnRpdHkg4oCUIHNlZVxuICAgICAgLy8gUmliYm9uUHJvZmlsZS5pbmsuXG4gICAgICAvLyAowqcxNy4yOCkgV2l0aCB0aGUgZmlsbSBvbiwgdGhlIHN0YW1wcyBhbmQgYmFuZHMgZ28gaW50byB0aGUgZ2VzdHVyZSdzXG4gICAgICAvLyBvd24gYnVmZmVycyB1bmRlciBNQVggYW5kIGlua0xvYWQvaW5rQ29sb3IgYXJlIHJlYnVpbHQgYXMgYmFzZSArIGZpbG1cbiAgICAgIC8vIG92ZXIgdGhlIGJhdGNoJ3MgcmVjdDsgd2l0aG91dCBpdCwgc3RyYWlnaHQgaW50byBpbmtMb2FkIGFkZGl0aXZlbHkuXG4gICAgICBjb25zdCBmYiA9IGZpbG0gJiYgaW5rTG9hZCA/IHNjcmF0Y2guZmlsbUJ1ZmZlcnModGlsZS5idWZmZXIpIDogbnVsbFxuICAgICAgY29uc3QgaW5rRGVzdCA9IGZiID8gZmIuc3Ryb2tlSW5rIDogaW5rTG9hZFxuICAgICAgY29uc3QgY29sb3JEZXN0ID0gZmIgPyBmYi5zdHJva2VDb2xvciA6IGlua0NvbG9yXG4gICAgICBjb25zdCBiZWdpbkluayA9IChidWY6IEFjY3VtdWxhdGlvbkJ1ZmZlcik6IHZvaWQgPT4geyBpZiAoZmIpIGJ1Zi5iZWdpbk1heERyYXcodGhpcy5jdHgubWlubWF4RXh0KCkhKTsgZWxzZSBidWYuYmVnaW5BZGRpdGl2ZURyYXcoKSB9XG4gICAgICBjb25zdCBiYW5kTW9kZSA9IGZiID8gJ2luay1tYXgnIGFzIGNvbnN0IDogJ2luaycgYXMgY29uc3RcbiAgICAgIC8vICgjNjgwLCBzMTcuNzkpIFRoZSB3YXRlcmNvbG9yJ3Mgc3VycGx1cyBsaWVzIGluIGJsb3RzIOKAlCBzZWUgd2NQb29sQmxvdC5cbiAgICAgIGNvbnN0IHBvb2xCbG90ID0gcHJvZmlsZS53YXRlckRlcGxldGlvbiA/IDEgOiAwXG4gICAgICBpZiAoaW5rRGVzdCkge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGRyYXdhYmxlLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgaWYgKCF0aGlzLmN0eC5uaWJUb3VjaGVzVGlsZSh0aWxlLCBkcmF3YWJsZVtpXSwgcHJlc2V0KSkgY29udGludWUgLy8gKMKnMTcuNzApXG4gICAgICAgICAgYmVnaW5JbmsoaW5rRGVzdClcbiAgICAgICAgICB0aGlzLmN0eC5kcmF3UmliYm9uTmliUGFzcyhcbiAgICAgICAgICAgIGlua0Rlc3QsIHRpbGUsIGRyYXdhYmxlW2ldLCBwcmVzZXQsIHByb2ZpbGUsIDcsXG4gICAgICAgICAgICBkZXBvc2l0c1tpXSAqICgxIC0gKGhhbG9TaGVkQnlEYWIuZ2V0KGRyYXdhYmxlW2ldKSA/PyAwKSksIGZhbHNlLFxuICAgICAgICAgICAgd2F0ZXJCeURhYi5nZXQoZHJhd2FibGVbaV0pID8/IDAsIGFjcm9zc0J5RGFiLmdldChkcmF3YWJsZVtpXSkgPz8gWzAsIDFdLFxuICAgICAgICAgICAgcGFwZXJXZXRCeURhYi5nZXQoZHJhd2FibGVbaV0pID8/IDAsIGlua1N0cmVuZ3RoLCBtb3R0bGVTZWVkLCBudWxsLCBjb21icywgcHJvZmlsZS5icmlzdGxlSW5rLFxuICAgICAgICAgICAgbnVsbCwgcGlnbWVudFBvb2xCeURhYi5nZXQoZHJhd2FibGVbaV0pID8/IDAuNSwgcG9vbEJsb3QsXG4gICAgICAgICAgKVxuICAgICAgICAgIGlua0Rlc3QuZW5kRHJhdygpXG4gICAgICAgICAgeWllbGQgcGllY2VUcmlzID8gdGhpcy5jdHgubmliRHJhd0Nvc3QodGlsZSwgZHJhd2FibGVbaV0sIHByZXNldCkgOiAwXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGJhbmRzLmxlbmd0aCkge1xuICAgICAgICAgIGZvciAoY29uc3QgcGllY2Ugb2YgcmliYm9uQmFuZFBpZWNlcyhiYW5kcywgcGllY2VUcmlzKSkge1xuICAgICAgICAgICAgY29uc3QgcHggPSBwaWVjZVRyaXMgPyByaWJib25CYW5kUGllY2VDb3N0KHBpZWNlLCB0aWxlKSA6IDBcbiAgICAgICAgICAgIGlmIChwaWVjZVRyaXMgJiYgIXB4KSBjb250aW51ZVxuICAgICAgICAgICAgdGhpcy5jdHguZHJhd1JpYmJvbkJhbmRzKFxuICAgICAgICAgICAgICBpbmtEZXN0LCB0aWxlLCBwaWVjZSwgYmFuZE1vZGUsIHByb2ZpbGUuYWFQeCwgcHJvZmlsZS5jbG91ZCwgcHJvZmlsZS5ncmFudWxhdGlvbiwgbW90dGxlU2VlZCxcbiAgICAgICAgICAgICAgMCwgMCwgY29tYnMsIHByb2ZpbGUuYnJpc3RsZUluaywgbnVsbCwgcG9vbEJsb3QsXG4gICAgICAgICAgICApXG4gICAgICAgICAgICB5aWVsZCBweFxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvLyAoIzUzNiwgwqcxNy4xOSkg4oCmYW5kIHRoZSBzYW1lIGZpZ3VyZSBvbmNlIG1vcmUsIGludG8gdGhlIGNvbG91clxuICAgICAgICAvLyByZWNvcmQ6IHRoZSBwYWludCdzIG9wdGljYWwgZGVwdGggcGVyIHRleGVsLiBTYW1lIGRvc2UsIHNhbWUgaGFpcnMsXG4gICAgICAgIC8vIHNhbWUgbW90dGxpbmcsIHNvIGRlcHRoIGFuZCBkZXBvc2l0IGFncmVlIHRvIHRoZSB0ZXhlbC5cbiAgICAgICAgaWYgKGNvbG9yRGVzdCkge1xuICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZHJhd2FibGUubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmICghdGhpcy5jdHgubmliVG91Y2hlc1RpbGUodGlsZSwgZHJhd2FibGVbaV0sIHByZXNldCkpIGNvbnRpbnVlIC8vICjCpzE3LjcwKVxuICAgICAgICAgICAgYmVnaW5JbmsoY29sb3JEZXN0KVxuICAgICAgICAgICAgdGhpcy5jdHguZHJhd1JpYmJvbk5pYlBhc3MoXG4gICAgICAgICAgICAgIGNvbG9yRGVzdCwgdGlsZSwgZHJhd2FibGVbaV0sIHByZXNldCwgcHJvZmlsZSwgNyxcbiAgICAgICAgICAgICAgZGVwb3NpdHNbaV0gKiAoMSAtIChoYWxvU2hlZEJ5RGFiLmdldChkcmF3YWJsZVtpXSkgPz8gMCkpLCBmYWxzZSxcbiAgICAgICAgICAgICAgd2F0ZXJCeURhYi5nZXQoZHJhd2FibGVbaV0pID8/IDAsIGFjcm9zc0J5RGFiLmdldChkcmF3YWJsZVtpXSkgPz8gWzAsIDFdLFxuICAgICAgICAgICAgICBwYXBlcldldEJ5RGFiLmdldChkcmF3YWJsZVtpXSkgPz8gMCwgaW5rU3RyZW5ndGgsIG1vdHRsZVNlZWQsIG51bGwsIGNvbWJzLCBwcm9maWxlLmJyaXN0bGVJbmssIHRhdSxcbiAgICAgICAgICAgICAgcGlnbWVudFBvb2xCeURhYi5nZXQoZHJhd2FibGVbaV0pID8/IDAsIHBvb2xCbG90LFxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgY29sb3JEZXN0LmVuZERyYXcoKVxuICAgICAgICAgICAgeWllbGQgcGllY2VUcmlzID8gdGhpcy5jdHgubmliRHJhd0Nvc3QodGlsZSwgZHJhd2FibGVbaV0sIHByZXNldCkgOiAwXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChiYW5kcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgcGllY2Ugb2YgcmliYm9uQmFuZFBpZWNlcyhiYW5kcywgcGllY2VUcmlzKSkge1xuICAgICAgICAgICAgICBjb25zdCBweCA9IHBpZWNlVHJpcyA/IHJpYmJvbkJhbmRQaWVjZUNvc3QocGllY2UsIHRpbGUpIDogMFxuICAgICAgICAgICAgICBpZiAocGllY2VUcmlzICYmICFweCkgY29udGludWVcbiAgICAgICAgICAgICAgdGhpcy5jdHguZHJhd1JpYmJvbkJhbmRzKFxuICAgICAgICAgICAgICAgIGNvbG9yRGVzdCwgdGlsZSwgcGllY2UsIGJhbmRNb2RlLCBwcm9maWxlLmFhUHgsIHByb2ZpbGUuY2xvdWQsIHByb2ZpbGUuZ3JhbnVsYXRpb24sIG1vdHRsZVNlZWQsXG4gICAgICAgICAgICAgICAgMCwgMCwgY29tYnMsIHByb2ZpbGUuYnJpc3RsZUluaywgdGF1LCBwb29sQmxvdCxcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICB5aWVsZCBweFxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoaW5rTG9hZCAmJiBwcm9maWxlLm5vcm1hbGl6ZURlcG9zaXQpIHNjcmF0Y2guZGlmZnVzZVBlbmRpbmcgPSB0cnVlXG4gICAgICAvLyAoIzUzNiwgQURSIDAxMSDCpzE3LjEwKSBUaGUgaGFsbywgYWZ0ZXIgdGhlIG1hcmsgaXRzZWxmOiBpbmsgb25seSwgYW5kXG4gICAgICAvLyBvbmx5IHdoZXJlIHRoZSB3YXNoIGFscmVhZHkgaGFzIGNvdmVyYWdlLiBUaGUgcGlnbWVudCBhIHdldC1pbi13ZXQgZGFiXG4gICAgICAvLyBzaGVkcyB0cmF2ZWxzIGFzIGZhciBhcyB0aGUgc3RhbmRpbmcgd2F0ZXIgYW5kIG5vIGZ1cnRoZXIsIGFuZCB0aGVcbiAgICAgIC8vIHdhdGVyIGlzIHRoaXMgd2FzaCdzIG93biBzaWxob3VldHRlIOKAlCB0aGUgcHVkZGxlIGlzIGEgc3Ryb2tlIG9mIHRoZVxuICAgICAgLy8gc2FtZSB3YXNoIOKAlCBzbyBjbGlwcGluZyB0aGUgc3RhbXAgYnkgdGhlIGNvdmVyYWdlIGJ1ZmZlciBpcyB3aGF0IGtlZXBzXG4gICAgICAvLyBhIGhhbG8gZnJvbSBldmVyIGxlYXZpbmcgdGhlIHB1ZGRsZSAoXCLQv9C40LPQvNC10L3RgiDQt9CwINC/0YDQtdC00LXQu9GLINC70YPQttC4INC80L7QttC10YJcbiAgICAgIC8vINGD0LnRgtC4LCDRgtCw0LrQvtCz0L4g0LHRi9GC0Ywg0L3QtSDQvNC+0LbQtdGCXCIpLiBObyBjb3ZlcmFnZSBzdGFtcCBmb3IgdGhlIGhhbG8gZm9yIHRoZVxuICAgICAgLy8gc2FtZSByZWFzb246IGl0IG11c3Qgbm90IGdyb3cgdGhlIHNpbGhvdWV0dGUuIFNraXBwZWQgb3V0cmlnaHQgb24gZHJ5XG4gICAgICAvLyBwYXBlcjogbm8gd2V0IGRhYiwgbm8gc2Vjb25kIHBhc3MsIG5vIGNvc3QuXG4gICAgICBpZiAoYW55SGFsbyAmJiBpbmtEZXN0KSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgaGFsb0RhYnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBjb25zdCBkb3NlID0gaGFsb0Rvc2VCeURhYi5nZXQoaGFsb0RhYnNbaV0pID8/IDBcbiAgICAgICAgICBpZiAoZG9zZSA8PSAwIHx8ICF0aGlzLmN0eC5uaWJUb3VjaGVzVGlsZSh0aWxlLCBoYWxvRGFic1tpXSwgcHJlc2V0KSkgY29udGludWUgLy8gKMKnMTcuNzApXG4gICAgICAgICAgYmVnaW5JbmsoaW5rRGVzdClcbiAgICAgICAgICB0aGlzLmN0eC5kcmF3UmliYm9uTmliUGFzcyhcbiAgICAgICAgICAgIGlua0Rlc3QsIHRpbGUsIGhhbG9EYWJzW2ldLCBwcmVzZXQsIGhhbG9Qcm9maWxlLCA3LCBkZXBvc2l0c1tpXSAqIGRvc2UsIGZhbHNlLFxuICAgICAgICAgICAgd2F0ZXJCeURhYi5nZXQoaGFsb0RhYnNbaV0pID8/IDAsIGFjcm9zc0J5RGFiLmdldChoYWxvRGFic1tpXSkgPz8gWzAsIDFdLFxuICAgICAgICAgICAgcGFwZXJXZXRCeURhYi5nZXQoaGFsb0RhYnNbaV0pID8/IDAsIGlua1N0cmVuZ3RoLCBtb3R0bGVTZWVkLCBjb3ZlcmFnZSwgY29tYnMsIHByb2ZpbGUuYnJpc3RsZUluayxcbiAgICAgICAgICApXG4gICAgICAgICAgaW5rRGVzdC5lbmREcmF3KClcbiAgICAgICAgICB5aWVsZCBwaWVjZVRyaXMgPyB0aGlzLmN0eC5uaWJEcmF3Q29zdCh0aWxlLCBoYWxvRGFic1tpXSwgcHJlc2V0KSA6IDBcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gKMKnMTcuMjgpIFRoZSBkZXBvc2l0IHRoZSBjb21wb3NpdGUgYW5kIHRoZSBzZXR0bGUgcmVhZDogdGhlIHdhc2ggYXMgaXRcbiAgICAgIC8vIHN0b29kIGJlZm9yZSB0aGlzIGdlc3R1cmUgcGx1cyB0aGUgZ2VzdHVyZSdzIGZpbG0sIG92ZXIgdGhpcyBiYXRjaCdzXG4gICAgICAvLyByZWN0ICh0aGUgZmlsbSBvdXRzaWRlIGl0IGlzIHVuY2hhbmdlZCBzaW5jZSB0aGUgbGFzdCBiYXRjaCkuXG4gICAgICBpZiAoZmIgJiYgaW5rTG9hZCkge1xuICAgICAgICBjb25zdCByZWN0ID0gdGhpcy5jdHgucmV2ZWFsUmVjdCh0aWxlLCBjb21wb3NpdGVCb3VuZHMpXG4gICAgICAgIGlmIChyZWN0KSB7XG4gICAgICAgICAgdGhpcy5jdHguZmllbGRPcChpbmtMb2FkLCBmYi5pbmtCYXNlLCBmYi5zdHJva2VJbmssIDEsIDEsIHsgc2Npc3NvcjogcmVjdCB9KVxuICAgICAgICAgIGlmIChpbmtDb2xvciAmJiBmYi5zdHJva2VDb2xvciAmJiBmYi5jb2xvckJhc2UpIHRoaXMuY3R4LmZpZWxkT3AoaW5rQ29sb3IsIGZiLmNvbG9yQmFzZSwgZmIuc3Ryb2tlQ29sb3IsIDEsIDEsIHsgc2Npc3NvcjogcmVjdCB9KVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIGBkcmF3YWJsZVswXS5vcGFjaXR5YCByYXRoZXIgdGhhbiBhIHBlci1kYWIgdmFsdWU6IG9ubHkgYSB0b29sIHdob3NlXG4gICAgICAvLyBkYWJzIGFsbCBzaGFyZSBvbmUgb3BhY2l0eSBjYW4gYmUgY29tcG9zaXRlZCBmcm9tIGEgY292ZXJhZ2UgYnVmZmVyIGF0XG4gICAgICAvLyBhbGwsIHdoaWNoIGZvciB0aGUgYnJ1c2ggcGVuIGlzIGd1YXJhbnRlZWQgYnkgX2Jha2VEYWJPcGFjaXR5IChBRFIgMDA5XG4gICAgICAvLyDCpzkg4oCUIHByZXNzdXJlIGRyaXZlcyB3aWR0aCwgbmV2ZXIgYWxwaGEpLiBUaGUgbWFya2VyJ3MgYnJhbmNoIGlnbm9yZXNcbiAgICAgIC8vIHRoaXMgYXJndW1lbnQgZW50aXJlbHkgYW5kIHJlYWRzIGl0cyBvd24gaW5rTG9hZCB0ZXh0dXJlIGluc3RlYWQuXG4gICAgICBpZiAoZGVmZXJDb21wb3NpdGUpIHtcbiAgICAgICAgLy8gKCM1MzYsIMKnMTcuMjIpIFRoZSBsaXZlIGdlc3R1cmU6IHRoZSByZWN0IGpvaW5zIHRoaXMgZnJhbWUncyB1bmlvblxuICAgICAgICAvLyBhbmQgdGhlIGNvbXBvc2l0ZSBydW5zIG9uY2UsIGluIF9kaXNwbGF5LCBiZWZvcmUgdGhlIGZyYW1lIGlzIGRyYXduLlxuICAgICAgICBjb25zdCBwZW5kaW5nID0gc2NyYXRjaC5wZW5kaW5nQ29tcG9zaXRlLmdldCh0aWxlLmJ1ZmZlcilcbiAgICAgICAgaWYgKHBlbmRpbmcpIHtcbiAgICAgICAgICBwZW5kaW5nLmJvdW5kcy5taW5YID0gTWF0aC5taW4ocGVuZGluZy5ib3VuZHMubWluWCwgY29tcG9zaXRlQm91bmRzLm1pblgpXG4gICAgICAgICAgcGVuZGluZy5ib3VuZHMubWluWSA9IE1hdGgubWluKHBlbmRpbmcuYm91bmRzLm1pblksIGNvbXBvc2l0ZUJvdW5kcy5taW5ZKVxuICAgICAgICAgIHBlbmRpbmcuYm91bmRzLm1heFggPSBNYXRoLm1heChwZW5kaW5nLmJvdW5kcy5tYXhYLCBjb21wb3NpdGVCb3VuZHMubWF4WClcbiAgICAgICAgICBwZW5kaW5nLmJvdW5kcy5tYXhZID0gTWF0aC5tYXgocGVuZGluZy5ib3VuZHMubWF4WSwgY29tcG9zaXRlQm91bmRzLm1heFkpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc2NyYXRjaC5wZW5kaW5nQ29tcG9zaXRlLnNldCh0aWxlLmJ1ZmZlciwgeyB0aWxlLCBib3VuZHM6IHsgLi4uY29tcG9zaXRlQm91bmRzIH0gfSlcbiAgICAgICAgfVxuICAgICAgICAvLyBFdmVyeSBjb2FsZXNjZWQgYmF0Y2ggZ3Jvd3MgYm90aCB0aGUgbGF5ZXIgYW5kIHBhcGVyIGRhbWFnZSwgZXZlblxuICAgICAgICAvLyB3aGVuIHRoaXMgdGlsZSBhbHJlYWR5IGhhcyBhIHBlbmRpbmcgY29tcG9zaXRlIGZvciB0aGUgZnJhbWUuXG4gICAgICAgIHRoaXMuY3R4Lm1hcmtQYXBlckRhbWFnZShjb21wb3NpdGVCb3VuZHMpXG4gICAgICAgIHRoaXMuY3R4LnNldExpdmVDb21wb3NpdGUoe1xuICAgICAgICAgIHNjcmF0Y2gsIHByZXNldCwgcHJvZmlsZSwgY29sb3IsIG9wYWNpdHk6IGRyYXdhYmxlWzBdLm9wYWNpdHksIGZpZWxkU2VlZCwgc3ByZWFkUHgsIGZyaW5nZVdhdGVyLCBtaWdyYXRlUHgsXG4gICAgICAgICAgaW5rU21vb3RoUHg6IHByb2ZpbGUubm9ybWFsaXplRGVwb3NpdCA/IGRhYlNwYWNpbmcgOiAwLCBzdHJva2VEaXIsIGJyaXN0bGVSYWRpdXNQeCxcbiAgICAgICAgfSlcbiAgICAgICAgY29udGludWVcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJldmVhbFByZXYgPSB0aGlzLmN0eC5yZXZlYWxCZWZvcmVCYXRjaCh0aWxlLCBjb21wb3NpdGVCb3VuZHMpXG4gICAgICB0aGlzLmN0eC5kcmF3UmliYm9uQ29tcG9zaXRlUmVjdChcbiAgICAgICAgdGlsZSwgY29tcG9zaXRlQm91bmRzLCBwcmVzZXQsIHByb2ZpbGUsIG9yaWdpbmFsLCBjb3ZlcmFnZSwgaW5rTG9hZCwgaW5rQ29sb3IsIGNvbG9yLCBkcmF3YWJsZVswXS5vcGFjaXR5LFxuICAgICAgICBmaWVsZFNlZWQsIHNwcmVhZFB4LCBmcmluZ2VXYXRlciwgbWlncmF0ZVB4LFxuICAgICAgICBwcm9maWxlLm5vcm1hbGl6ZURlcG9zaXQgPyBkYWJTcGFjaW5nIDogMCwgc3Ryb2tlRGlyLCBicmlzdGxlUmFkaXVzUHgsXG4gICAgICApXG4gICAgICB0aGlzLmN0eC5yZXZlYWxBZnRlckJhdGNoKHRpbGUsIGNvbXBvc2l0ZUJvdW5kcywgcmV2ZWFsUHJldilcbiAgICAgIHlpZWxkIHBpZWNlVHJpcyA/IHJlY3RPblRpbGUodGlsZSwgY29tcG9zaXRlQm91bmRzKSA6IDBcbiAgICB9XG5cbiAgICBzY3JhdGNoLm5vdGVGaW5pc2goe1xuICAgICAgdGFyZ2V0LCBwcmVzZXQsIHByb2ZpbGUsIGNvbG9yLCBvcGFjaXR5OiBkcmF3YWJsZVswXS5vcGFjaXR5LFxuICAgICAgYm91bmRzOiByZWFjaEJvdW5kcywgZmllbGRTZWVkLCBsYW5kZWRXZXQsIHdldFBlYWs6IHdldFBlYWtIZXJlLCByYWRpdXNQeDogbmliUmFkaXVzLCBkd2VsbE1zOiBzY3JhdGNoLmR3ZWxsTXMsXG4gICAgfSlcblxuICAgIHRhcmdldC5tYXJrQ29udGVudFBhaW50ZWQoY29tcG9zaXRlQm91bmRzKVxuICB9XG59XG4iXX0=