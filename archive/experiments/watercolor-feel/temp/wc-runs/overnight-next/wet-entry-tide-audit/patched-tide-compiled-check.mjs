import { WATERCOLOR_BRISTLE_BUNDLE_PX } from "/src/engine/src/dabs/ribbonProfile.ts";
import { WET_DIFFUSE_SCHEDULE, WET_DIFFUSE_PUDDLE_SCHEDULE, WET_DIFFUSE_REACH, WET_DIFFUSE_MOBILE, watercolorPuddleSettleWeights, WET_SETTLE_SMOOTH, WET_SETTLE_FIBRE_FROM } from "/src/engine/src/watercolor/wetDiffusion.ts";
import { brushDragContacts } from "/src/engine/src/watercolor/brushDrag.ts";
import { foreignWaterStencil } from "/src/engine/src/watercolor/foreignWater.ts";
import { pigmentAbsorption } from "/src/engine/src/watercolor/pigmentOptics.ts";
import { watercolorDampOver, watercolorPuddleMerge, watercolorRimShare, WC_BLOOM_SHARE, WC_TIDE_STANDING_FULL, WC_TIDE_RIM, WC_RIM_BAND_PX, WC_REMOB_DOME, watercolorSpreadBudget, watercolorCarryStrides, watercolorFrontSteps, WC_CARRY_RATE, WC_CARRY_POW, WC_CARRY_TRAVEL, watercolorDwellWater, WC_POOL_STREAK, WC_FRONT_CLIMB, WC_FRONT_FLOOR, WC_FRONT_CLIMB_IN, WC_FRONT_FLOOR_IN, WC_FRONT_DRY_COST, WC_FRONT_DRY_SHARE } from "/src/engine/src/presets/watercolorPresets.ts";
import { WC_HALF_RES_RADIUS_PX, WC_HALF_RES_SPAN_PX } from "/src/engine/src/watercolor/settleResolution.ts";
/** Builds the ordered GPU steps and the final tile copy-back of one settle.
* Working fields and frame scheduling remain separate owners. */
export class WatercolorSettlePlan {
	ctx;
	constructor(ctx) {
		this.ctx = ctx;
	}
	get gl() {
		return this.ctx.gl();
	}
	/** Upload caches for recorded brush travel and preceding wet contacts. */
	_brushFlowTex = null;
	_foreignWaterTex = null;
	/** (#536, ADR 011 §17.11, §17.17) The wet diffusion: what THIS operation
	*  laid (the deposit less what was settled before it) is split into a
	*  fixed and a mobile share (WET_DIFFUSE_MOBILE); the mobile share runs
	*  WET_DIFFUSE_RADII steps of WC_DIFFUSE_FRAG, ping-ponged; and the sum —
	*  settled + fixed + moved — goes back to the tiles and becomes the new
	*  settled deposit.
	*
	*  Only this operation's paint, deliberately. The first version moved the
	*  whole wash at every settle, so the first stroke of a wash was diffused
	*  again by every later stroke in it — thinner each time — while the
	*  latest sat where it was laid: "пигмента в луже катастрофически мало, а
	*  повторный штрих ложится слишком сильно". Paint moves once, at the
	*  settle that laid it, then it is fixed; lifting fixed paint with clean
	*  water is the remobilization round (§17.9). The flux is linear in the
	*  concentration for a given gate, so moving the mobile share of the new
	*  paint alone is exact, and each part is conserved on its own.
	*
	*  Over ONE field, not per tile. Per tile, everything off the tile was dry
	*  paper, so a puddle across x = 1024 kept its paint on each side — a
	*  straight seam, visible the moment the reveal let go ("при высыхании я
	*  вижу линии склейки тайлов"). The wash's tiles are stitched into a rect —
	*  the settle bounds padded by the schedule's whole reach, so no texel with
	*  paint can ever see the rect's edge — and copied back. The paper's height
	*  is sampled at the WORLD position, so where the rect starts (a live
	*  gesture's bounds and a replay's differ by a batch's padding) cannot move
	*  a pit. Nothing here reads a clock; the schedule is a constant of the
	*  tool, and the eight-bit write between steps is the one measured leak. */
	/** (#536, ADR 011 §17.11, §17.22) The wet diffusion over this wash's
	*  tiles stitched into one field, as a list of GPU steps plus the copy-back
	*  — a list so that the author's pen-up can spread it over frames under
	*  the reveal (see _startSettle) while a replay runs it in one go. Null
	*  when the wash holds no deposit here. */
	prepare(scratch, targets, bounds, bloom = 0, radiusPx = 16, water = 1, landedWet = 0, standing = 1, wetPeak = 0, dwellMs = 0) {
		const { gl } = this;
		const tiles = targets.filter((t) => scratch.peek(t.buffer)?.inkLoad);
		if (!tiles.length) return null;
		// The rect: the settle's bounds plus the reach, clipped to the tiles that
		// actually hold this wash. Capped — a wash wider than the cap diffuses
		// in a window around its centre and sees a wall at the window's edge.
		// (#536, §17.22) 1536, from 2048: seven buffers of 2048² are 117 MB, which
		// a tablet does not have to spare; at 1536 the field is 66 MB and a 400 px
		// brush's whole gesture still fits it with its reach.
		// (§17.44) A big brush settles at HALF resolution: every pass of the
		// settle over a field a quarter the size, and a window twice as wide in
		// the world. The field holds cells of S px; what goes back to the tiles
		// is the field's change, brought up and added to the full-resolution
		// record (_wcResample), so the grain and the brush's texture are the
		// tile's own and only the movement is coarse. On the tablet a 400 px
		// zigzag's settle was 70 ms an entry and ~40 entries a chunk.
		// ...and only a big mark over a big window: a drop into a puddle or a
		// patch of a few hundred pixels settles in a small field anyway, and at
		// half resolution its paint spread softer and paler than it does.
		let S = 1;
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const t of tiles) {
			minX = Math.min(minX, t.originX);
			minY = Math.min(minY, t.originY);
			maxX = Math.max(maxX, t.originX + t.buffer.width);
			maxY = Math.max(maxY, t.originY + t.buffer.height);
		}
		// (§17.38) ...padded by the further of the diffusion's reach and the
		// water front's run: the front's budget is in cost units and a cell
		// costs at least WC_FRONT_FLOOR, so budget / floor px is the furthest
		// the domain can lie past the footprint. With the diffusion trimmed
		// to a few texels the pad shrank to six, a flooded landing's front
		// (budget up to 160) ran into the field's edge, and the domain - and
		// the coverage it extends - came out cut to the rect: a wash on the
		// rig turned into a lopsided polygon.
		const frontReachPx = Math.ceil(watercolorSpreadBudget(radiusPx, water, Math.max(landedWet, wetPeak)) / WC_FRONT_FLOOR);
		// (§17.42) ...plus, when the wash dries as one component, the margin
		// the group tide needs around what changed: its band is read off an
		// inward relaxation of `inSteps` cells from the coverage's edge and its
		// kernel gathers about a radius, so a texel closer than that to the
		// field's edge could be missing a contour that lies just outside the
		// field. The dry target is copied back over the field LESS this margin;
		// the wet state over all of it.
		const groupDry = !this.ctx.ab().opDry;
		const dryMargin = groupDry ? Math.max(2, Math.min(WC_RIM_BAND_PX, Math.round(radiusPx / 5))) + 2 + Math.ceil(radiusPx) + 2 : 0;
		const pad = Math.max(WET_DIFFUSE_REACH, frontReachPx) + 1 + dryMargin;
		let x0 = Math.max(minX, Math.floor(bounds.minX) - pad), y0 = Math.max(minY, Math.floor(bounds.minY) - pad);
		let x1 = Math.min(maxX, Math.ceil(bounds.maxX) + pad), y1 = Math.min(maxY, Math.ceil(bounds.maxY) + pad);
		if (radiusPx >= WC_HALF_RES_RADIUS_PX && Math.max(x1 - x0, y1 - y0) > WC_HALF_RES_SPAN_PX) S = 2;
		const CAP = 1536 * S;
		if (x1 - x0 > CAP) {
			const c = (x0 + x1) * .5;
			x0 = Math.floor(c - CAP / 2);
			x1 = x0 + CAP;
		}
		if (y1 - y0 > CAP) {
			const c = (y0 + y1) * .5;
			y0 = Math.floor(c - CAP / 2);
			y1 = y0 + CAP;
		}
		if (S > 1) {
			// Cell-aligned: tile edges are multiples of 1024, so a rect on even
			// coordinates maps every tile overlap onto whole cells.
			x0 = Math.max(minX, Math.floor(x0 / S) * S);
			y0 = Math.max(minY, Math.floor(y0 / S) * S);
			x1 = Math.min(maxX, Math.ceil(x1 / S) * S);
			y1 = Math.min(maxY, Math.ceil(y1 / S) * S);
			// (§17.49) ...and back under the cap: the alignment could push a capped
			// window one field texel past it - 1537, which the field rounds up to
			// the next size, so a big wash's chunk settle (1536) and its pen-up
			// settle (1537) re-made the whole field in turn, every stroke.
			if (x1 - x0 > CAP) x1 = x0 + CAP;
			if (y1 - y0 > CAP) y1 = y0 + CAP;
		}
		const w = x1 - x0, h = y1 - y0;
		if (w <= 0 || h <= 0) return null;
		scratch.noteStorageBounds({
			minX: x0,
			minY: y0,
			maxX: x1,
			maxY: y1
		});
		const field = this.ctx.fieldFor(w / S, h / S);
		const { w: paperTexW, h: paperTexH } = this.ctx.paperWorldSize();
		// (§17.44) At half resolution what goes home is the SETTLED wash at full
		// resolution plus the field's result less its own settled part: the
		// wash already on the paper keeps its grain and texture to the pixel,
		// and the operation's own wet paint comes back from the field whole -
		// smoothed, as wet paint is. Returning the whole deposit plus the
		// field's change kept the new film's one-pixel edge, which the half-
		// resolution field cannot see, and every pass of a big brush left a
		// thin line where its edge had been. So: the settled part in the field
		// (b0, cb0) and at full resolution per tile (snapshots, taken at the
		// stitch - a running gesture's next batch refreshes the film's base).
		const a0 = S > 1 ? this.ctx.pool().acquire(field.w, field.h) : null;
		const ca0 = S > 1 ? this.ctx.pool().acquire(field.w, field.h) : null;
		const snapshots = new Map();
		// The settle's rect in the field's GL cells, for the interpolation's clamp.
		const fieldRect = [
			0,
			field.h - h / S,
			w / S,
			field.h
		];
		// A world rect of a tile into the field (S = 1: a copy; else the 2x2 mean).
		const toField = (src, tile, wx0, wy0, wx1, wy1, dst) => {
			const tx = wx0 - tile.originX, ty = tile.buffer.height - (wy1 - tile.originY);
			const fx = (wx0 - x0) / S, fy = field.h - (wy1 - y0) / S;
			if (S === 1) src.copyRegionInto(dst, tx, ty, fx, fy, wx1 - wx0, wy1 - wy0);
			else this.ctx.passes().wcResample(dst, fx, fy, (wx1 - wx0) / S, (wy1 - wy0) / S, src, tx, ty, S, 0);
		};
		// ...and back: S = 1, the field's value; else base + up(new - old). The
		// target may be the base: the draw goes through a pooled temporary.
		const fromField = (fNew, fOld, tile, wx0, wy0, wx1, wy1, target, base) => {
			const tx = wx0 - tile.originX, ty = tile.buffer.height - (wy1 - tile.originY);
			const fx = (wx0 - x0) / S, fy = field.h - (wy1 - y0) / S;
			if (S === 1 || !fOld) {
				fNew.copyRegionInto(target, fx, fy, tx, ty, wx1 - wx0, wy1 - wy0);
				return;
			}
			const tmp = this.ctx.pool().acquire(tile.buffer.width, tile.buffer.height);
			this.ctx.passes().wcResample(tmp, tx, ty, wx1 - wx0, wy1 - wy0, fNew, fx, fy, 1 / S, 1, fOld, base, fieldRect);
			tmp.copyRegionInto(target, tx, ty, tx, ty, wx1 - wx0, wy1 - wy0);
			this.ctx.pool().release(tmp);
		};
		// Every tile's overlap with the rect, and the settled records the tiles
		// still lack — acquired now so the steps below can assume them.
		const overlaps = [];
		for (const tile of tiles) {
			const entry = scratch.peek(tile.buffer);
			if (!entry?.inkLoad) continue;
			// (§17.44) The settled records are only needed without the film: with
			// it, the film's base (inkBase/colorBase, refreshed on the gesture's
			// first batch) IS the wash as it stood before the operation, and a
			// second pair of tile-sized textures per tile holding the same thing
			// was a quarter of the gigabyte of scratch the tablet carried.
			if (!this.ctx.minmaxExt() && !entry.inkSettled) {
				entry.inkSettled = this.ctx.pool().acquire(tile.buffer.width, tile.buffer.height);
				entry.inkSettled.clear();
			}
			if (!this.ctx.minmaxExt() && entry.inkColor && !entry.colorSettled) {
				entry.colorSettled = this.ctx.pool().acquire(tile.buffer.width, tile.buffer.height);
				entry.colorSettled.clear();
			}
			const ox0 = Math.max(x0, tile.originX), oy0 = Math.max(y0, tile.originY);
			const ox1 = Math.min(x1, tile.originX + tile.buffer.width), oy1 = Math.min(y1, tile.originY + tile.buffer.height);
			if (ox1 <= ox0 || oy1 <= oy0) continue;
			overlaps.push({
				tile,
				ox0,
				oy0,
				ox1,
				oy1
			});
		}
		if (!overlaps.length) return null;
		const foreign = foreignWaterStencil(scratch.foreignSources ?? [], scratch.wetContacts, {
			x: x0,
			y: y0,
			w: field.w * S,
			h: field.h * S
		});
		const contacts = brushDragContacts(scratch.brushTravel, {
			x: x0,
			y: y0,
			w: field.w * S,
			h: field.h * S
		});
		const flow = contacts[0]?.field;
		let flowTexture = null;
		let foreignTexture = null;
		const ops = [];
		if (flow) ops.push(() => {
			this._brushFlowTex ??= gl.createTexture();
			flowTexture = this._brushFlowTex;
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, flowTexture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, flow.width, flow.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, flow.pixels);
		});
		if (foreign) ops.push(() => {
			this._foreignWaterTex ??= gl.createTexture();
			foreignTexture = this._foreignWaterTex;
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, foreignTexture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, foreign.width, foreign.height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, foreign.pixels);
			gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
		});
		// (§17.44) The gesture whose film this settle consumes, fixed now: a
		// chunk's settle may land after the next chunk's film has begun.
		const gesture = scratch.gesture;
		// Stitch: every tile's overlap with the rect, top-down world → bottom-up
		// GL on both sides, exactly as SmudgePainter.gatherPatch does it. `a` takes the
		// deposit, `b` what was settled, `coverage` the silhouette.
		ops.push(() => {
			field.a.clear();
			field.b.clear();
			field.coverage.clear();
			field.ca.clear();
			field.cb.clear();
			for (const { tile, ox0, oy0, ox1, oy1 } of overlaps) {
				const entry = scratch.peek(tile.buffer);
				if (!entry?.inkLoad) continue;
				// The settled wash: the film's base where this operation's gesture
				// laid paint on the tile, the deposit itself where it did not (no new
				// paint there, nothing mobile), the old record without a film.
				const settledInk = (entry.filmGesture === gesture ? entry.inkBase : null) ?? entry.inkSettled ?? entry.inkLoad;
				toField(entry.inkLoad, tile, ox0, oy0, ox1, oy1, field.a);
				toField(settledInk, tile, ox0, oy0, ox1, oy1, field.b);
				if (S > 1) {
					const tx = ox0 - tile.originX, ty = tile.buffer.height - (oy1 - tile.originY);
					const ink = this.ctx.pool().acquire(tile.buffer.width, tile.buffer.height);
					settledInk.copyRegionInto(ink, tx, ty, tx, ty, ox1 - ox0, oy1 - oy0);
					let color = null;
					if (entry.inkColor) {
						const sc = (entry.filmGesture === gesture ? entry.colorBase : null) ?? entry.colorSettled ?? entry.inkColor;
						color = this.ctx.pool().acquire(tile.buffer.width, tile.buffer.height);
						sc.copyRegionInto(color, tx, ty, tx, ty, ox1 - ox0, oy1 - oy0);
					}
					snapshots.set(tile.buffer, {
						ink,
						color
					});
				}
				toField(entry.coverage, tile, ox0, oy0, ox1, oy1, field.coverage);
				if (entry.inkColor) {
					const settledColor = (entry.filmGesture === gesture ? entry.colorBase : null) ?? entry.colorSettled ?? entry.inkColor;
					toField(entry.inkColor, tile, ox0, oy0, ox1, oy1, field.ca);
					toField(settledColor, tile, ox0, oy0, ox1, oy1, field.cb);
				}
			}
			if (a0) field.b.copyTo(a0);
			if (ca0) field.cb.copyTo(ca0);
		});
		const fieldOp = (out, a, b, mode, k) => this.ctx.passes().fieldOp(out, a, b, mode, k);
		const diffuseStep = (src, dst, radius, knight, gate = field.coverage, density = src) => {
			this.ctx.passes().diffuseStep(field, x0, y0, S, paperTexW, paperTexH, src, dst, radius, knight, gate, density);
		};
		// (§17.23) The operation's footprint — where its own deposit lies, which
		// is the mobile field before anything moves — and the dome over it: the
		// mask blurred at falling strides, 1 deep inside, 0.5 on the edge, 0
		// outside. Then the band just inside the edge, blurred by the rim's
		// kernel, kept in `mask` for both rims below. Once per settle.
		// (§17.24) The water front, once per settle: the operation's footprint
		// (its mobile deposit before anything moves) seeds a cost field, the
		// relaxation runs it out over the paper, and the texels within the
		// budget are the domain the water wets. From the cost: the band texture
		// (r the last `width` cells inside the front, g the domain), and the
		// stitched coverage extended over the domain, so the silhouette and the
		// diffusion's gate reach as far as the water did. Then the band
		// gathered by the rim's kernel, kept in `mask`.
		// (§17.29) ...by the WETTEST paper the mark ran over, not where it
		// landed: Ilya's series 5 lays the second stroke from dry paper into
		// the first, and its front has to run where the first stroke is.
		const runWet = Math.max(landedWet, wetPeak);
		// (§17.44) In the field's cells from here on: budget and radius over S.
		const budgetPx = watercolorSpreadBudget(radiusPx, water, runWet) / S;
		const radiusC = radiusPx / S;
		const costMax = budgetPx + 4;
		// (§17.27) …plus the mark's radius: the puddle's front starts inside
		// the footprint and has to cross it before it runs its budget into the
		// film. At nine steps for a 6 px budget it stopped a third of the way
		// across a 20 px puddle and the backrun never reached the film.
		const frontSteps = watercolorFrontSteps(budgetPx, radiusC, runWet);
		// A fifth of the radius (the photo's ring: FWHM 0.2 R_front), capped:
		// the mass sits at the front, the tail behind it is what the valleys
		// carry, so the band's depth is what survives a blur, not its darkness.
		// (§17.44) The band's width is a WORLD width (a fifth of the radius, at
		// most WC_RIM_BAND_PX px), in cells: capped in cells, a half-resolution
		// band was twice as wide, the tide took twice the share, and every big
		// mark dried paler with a heavier rim.
		const width = Math.max(1, Math.round(Math.max(2, Math.min(WC_RIM_BAND_PX, Math.round(radiusPx / 5))) / S));
		// The band is the last `width` cells inside the front, measured by a
		// second relaxation run INWARD from everything past the budget, over the
		// same paper: a band from the outward cost alone cannot reach into the
		// footprint, whose cost is zero throughout. Its own scale, so the 8 bits
		// resolve a cell.
		const costMaxIn = width + 3;
		const inSteps = width + 2;
		const merge = watercolorPuddleMerge(wetPeak);
		// (§17.26) A mark laid over an earlier mark that was still damp has no
		// dry paper to stop at there: its own tideline stands down over it (the
		// bloom ring is the edge), fully on wet.
		const damp = watercolorDampOver(wetPeak);
		// …and a rim wants free water to dry out of: none from a brush that
		// carried none.
		const tideWater = Math.min(1, standing / WC_TIDE_STANDING_FULL);
		// (§17.27) Dyadic strides, 1, 2, 4, 8… up to the mark's radius: a 3x3
		// binomial at each is the à-trous B-spline, a smooth kernel of reach
		// ~radius. The old r/2, r/4, r/8, 1 was the same reach with a bumpy
		// kernel, and on a band one or two texels wide the bumps of the
		// gathered band divided the moved paint into DOTS along the line.
		const gather = [];
		for (let st = 1; st <= Math.max(1, radiusC / 2) && gather.length < 6; st *= 2) gather.push([st, st]);
		// (s17.40) The dry cost never less than a share of the budget: a stroke
		// that lands in a puddle carries the puddle's budget (up to 160) out
		// onto dry paper, and at a flat 24 a cell its front ran four cells past
		// the brush there - Ilya's "рваный край вне лужи". At half the budget
		// a cell, the run on dry paper is two cells whatever the budget.
		const dryCost = Math.max(WC_FRONT_DRY_COST, budgetPx * WC_FRONT_DRY_SHARE);
		const frontStep = (src, dst, max, climb = WC_FRONT_CLIMB, floor = WC_FRONT_FLOOR, stride = 1) => this.ctx.passes().waterFrontStep(field, x0, y0, dryCost, src, dst, max, climb, floor, stride, S, foreignTexture);
		// The front as entries of `ops`, a few relaxation steps per entry so no
		// frame runs the whole field thirty times: the outward cost from the
		// footprint into `pressure`, the inward cost from past-the-budget into
		// `mask`, then the band texture, the coverage extended over the domain,
		// and the band gathered into `mask` for the rims.
		const frontOps = (mobile, tmp) => {
			const pp = {
				src: field.pressure,
				dst: tmp
			};
			const run = (steps, max, home, climb, floor, strides) => {
				const list = strides ?? Array.from({ length: steps }, () => 1);
				for (let i = 0; i < list.length; i += 4) {
					const chunk = list.slice(i, i + 4);
					const last = i + chunk.length >= list.length;
					ops.push(() => {
						for (const st of chunk) {
							frontStep(pp.src, pp.dst, max, climb, floor, st);
							const t = pp.src;
							pp.src = pp.dst;
							pp.dst = t;
						}
						if (last && pp.src !== home) this.ctx.passes().fieldOp(home, pp.src, pp.src, 1, 0);
					});
				}
			};
			ops.push(() => {
				this.ctx.passes().fieldOp(field.pressure, mobile, field.coverage, 10, .003, {
					band: [1 / costMax, standing],
					size: [(budgetPx - 1) / costMax, 0]
				});
				pp.src = field.pressure;
				pp.dst = tmp;
			});
			// (§17.44) Jumps, then unit passes - see WC_WATER_FRONT_FRAG's u_stride.
			// (§17.44) Unit passes: the dyadic jumps (watercolorFrontStrides) were
			// six times cheaper and measurably wrong - a jump sums the climb along
			// its path but loses the per-cell floor, so the cost came out low, the
			// puddles ran wider and every drop dried paler (124 -> 133 of 255 on
			// Ilya's circles). The big sweeps get their speed from the
			// half-resolution field instead, exactly.
			run(frontSteps, costMax, field.pressure, WC_FRONT_CLIMB, WC_FRONT_FLOOR);
			ops.push(() => {
				this.ctx.passes().fieldOp(field.mask, field.pressure, field.pressure, 12, budgetPx / costMax, { d: field.band });
				pp.src = field.mask;
				pp.dst = tmp;
			});
			// Inward over a gentler relief: the band's inner edge follows the
			// valleys a few cells in (the photo's streaks pointing into the light
			// centre), not a third of the way to the middle.
			// The first two cells in from the front flat, so the sharp peak of
			// the deposition profile (mode 6) is a continuous line along the
			// front - with the relief from the first cell it broke into dots
			// (the photographs' tideline is a thin unbroken line); the tail
			// behind it takes the relief and its fingers.
			run(2, costMaxIn, field.mask, 0, 1);
			run(inSteps - 2, costMaxIn, field.mask, WC_FRONT_CLIMB_IN, WC_FRONT_FLOOR_IN);
			ops.push(() => {
				this.ctx.passes().fieldOp(tmp, field.coverage, field.coverage, 11, standing, {
					d: field.pressure,
					band: [budgetPx / costMax, 0],
					size: [1 / costMax, 1]
				});
				this.ctx.passes().fieldOp(field.coverage, tmp, tmp, 1, 0);
				this.ctx.passes().fieldOp(field.band, field.pressure, field.coverage, 6, merge, {
					c: field.mask,
					d: field.pressure,
					band: [budgetPx / costMax, width / costMaxIn],
					size: [1 / costMax, 1 / costMaxIn],
					origin: [standing, damp],
					dir: [1, 1],
					tau: [
						watercolorDwellWater(dwellMs),
						0,
						0
					],
					world: [
						x0 / S,
						-(y0 / S + field.h),
						S
					]
				});
				this.ctx.passes().fieldOp(tmp, field.band, field.band, 5, 0, { dir: gather[0] });
				let gs = tmp, gd = field.mask;
				for (let i = 1; i < gather.length; i++) {
					this.ctx.passes().fieldOp(gd, gs, gs, 5, 0, { dir: gather[i] });
					const t = gs;
					gs = gd;
					gd = t;
				}
				if (gs !== field.mask) this.ctx.passes().fieldOp(field.mask, gs, gs, 1, 0);
			});
		};
		// (§17.23) The rim: `share` of `paint` inside the footprint goes to the
		// band. Two free buffers; the result lands in `t2`.
		const rim = (paint, share, t1, t2, tide = false) => {
			// (s17.30) The bloom lifts the wash's paint by the DOME over the drop
			// (band .a: all of it under the centre, none at the front), the tide
			// the mark's own paint over the whole domain (band .g). A uniform lift
			// left a hard-edged hole the size of the drop's footprint - Ilya's
			// "слишком резко обеляет лужу в месте касания".
			this.ctx.passes().fieldOp(t1, paint, paint, tide ? 7 : 9, share, { d: field.band });
			let gs = t1, gd = t2;
			for (let i = 0; i < gather.length; i++) {
				this.ctx.passes().fieldOp(gd, gs, gs, 5, 0, { dir: gather[i] });
				const t = gs;
				gs = gd;
				gd = t;
			}
			// The gathered paint is in gs; the sum lands in t2, so the other is
			// its scratch.
			if (gs === t2) {
				this.ctx.passes().fieldOp(t1, gs, gs, 1, 0);
				gs = t1;
			}
			this.ctx.passes().fieldOp(t2, paint, gs, tide ? 14 : 8, share, {
				c: field.mask,
				d: field.band
			});
		};
		// One record: c = mobile share of (laid − settled); b = laid − c, the part
		// that stays put (settled paint plus the fixed share of the new); the
		// schedule over c; the sum back into whichever of the pair is free.
		// Both records use coverage and one pre-step mobile pigment density,
		// so absorption cannot choose a different mobility from its carrier.
		const diffuseSteps = this.ctx.ab().noDiffuse ? [] : WET_DIFFUSE_SCHEDULE;
		// (§17.29) The colour record, when there is one (two paints or more),
		// is split and carried in LOCKSTEP with the deposit inside the
		// deposit's own settle: the carry's fractions depend on the deposit's
		// mobile and fixed amounts at every step, so the colour cannot be
		// carried on its own afterwards. Diffusion likewise runs colour first
		// and pigment second against the unchanged pre-step pigment field.
		const colour = scratch.paints.size > 1 ? {
			a: field.ca,
			b: field.cb,
			c: field.cc
		} : null;
		const singlePaint = [...scratch.paints][0];
		const singleTau = !colour && singlePaint ? pigmentAbsorption(singlePaint.split(",").map(Number)) : [
			0,
			0,
			0
		];
		// (§17.42) The wash dries as ONE component: nothing of an operation is
		// fixed at its pen-up - the whole of its paint is mobile, the earlier
		// paint under the dome all of it too, and no tide is laid into the wet
		// state; the tide goes, once, along the outer contour of the wash's
		// whole coverage, into the PROVISIONAL dry target (inkDry) the
		// composite shows, recomputed at every pen-up (_groupTideOps below).
		// The design thread's diagnosis of the wet-on-wet pairs: each operation
		// dried to the end before the next arrived, and no re-mobilisation
		// turns "dry A, then dissolve A with B" into "wet A + wet B, dried
		// together". The r17 behaviour stays as the wcOpDry A/B.
		const mobileShare = groupDry ? 1 : WET_DIFFUSE_MOBILE;
		// (#680, s17.84) The pool's paint combed along the travel by the hairs,
		// over the settled result (the settle erases it from the dose): through
		// `free` and back into `paint`. The factor comes from the coverage
		// alone, so the deposit and the colour record take the same one.
		const streakCombs = Math.max(1.5, Math.min(50, radiusPx / WATERCOLOR_BRISTLE_BUNDLE_PX));
		const poolStreaks = (paint, free) => {
			if (!(WC_POOL_STREAK > 0)) return;
			this.ctx.passes().fieldOp(free, paint, paint, 1, 1, {
				c: field.coverage,
				world: [
					x0 / S,
					-(y0 / S + field.h),
					S
				],
				size: [streakCombs, 0],
				origin: [WC_POOL_STREAK, 0],
				dir: [1, 1]
			});
			fieldOp(paint, free, free, 1, 0);
		};
		let pairedColour = null;
		const settle = (a, b, c, first, spare, follow = false) => {
			const st = {
				src: c,
				dst: a,
				out: a
			};
			const paired = first && colour ? {
				src: colour.c,
				dst: colour.a,
				out: colour.a
			} : null;
			if (paired) pairedColour = paired;
			const advance = (radius, knight, gate = field.coverage) => {
				// Colour first: the following deposit draw still reads exactly the
				// same pre-step density. Neither destination aliases that density.
				if (paired) diffuseStep(paired.src, paired.dst, radius, knight, gate, st.src);
				diffuseStep(st.src, st.dst, radius, knight, gate, st.src);
				const t = st.src;
				st.src = st.dst;
				st.dst = t;
				if (paired) {
					const t = paired.src;
					paired.src = paired.dst;
					paired.dst = t;
				}
			};
			if (!follow) ops.push(() => {
				fieldOp(c, a, b, 0, mobileShare);
				// (§17.25) A mark that landed in a puddle wets the paint already
				// lying under its footprint: that paint is as mobile as the new -
				// it never dried - so the same mobile share of it joins c and runs,
				// settles and relocates with the new paint, to the MERGED front.
				// Without this the earlier pass's tideline stayed put under the
				// next pass, and a flat wash came out as a ladder of inner rims.
				// (§17.41) ...and it happens AFTER the front is known, over the
				// dome of the puddle the landing joined - see below.
				// Where earlier marks' SETTLED deposit lies, before b is overwritten
				// with the fixed part - kept in `band` until the front reads it: the
				// puddle this mark's water may have joined.
				if (first) this.ctx.passes().fieldOp(field.band, b, b, 4, .002);
				fieldOp(b, a, c, 1, -1);
				// The colour record's split, by the same gate.
				if (colour && first) {
					fieldOp(colour.c, colour.a, colour.b, 0, mobileShare);
					fieldOp(colour.b, colour.a, colour.c, 1, -1);
				}
			});
			// The water front, its band and the extended coverage come from the
			// deposit's mobile field, once; the colour record rides the same.
			if (first) frontOps(c, a);
			// (§17.29) The front carries the paint: the mobile field runs along
			// the front's cost, from the footprint out to where the water
			// stopped, in strided steps of WC_FIELD_OP_FRAG's mode 15 - so a
			// loaded mark into a wet wash sends its own pigment into the wash in
			// the fingers the front cut, at near the body's density (Ilya's
			// series 5), instead of leaving it inside its own contour with only
			// the water gone on. The film's own contour ring (the last cell and
			// a half of the budget) is left out of the domain here: on dry paper
			// the whole film sits one cell short of its budget, and with the
			// ring in, every stroke piled its outer texels into a hard line.
			// What the flow equalises is the TOTAL pigment - mobile plus fixed
			// (b): the wash's settled paint lying in the domain counts, or a
			// mark over a wet wash sent its own paint and the re-mobilised wash
			// under it out into fingers denser than its body, and the body went
			// pale. The deposit ping-pongs c and a; the colour record cc and ca,
			// in lockstep, taking the deposit's fractions (mode 16).
			if (first && !this.ctx.ab().noCarry) {
				const carry = watercolorCarryStrides(budgetPx);
				let src = c, dst = a;
				let csrc = colour?.c, cdst = colour?.a;
				for (let i = 0; i < carry.length; i += 4) {
					const n = Math.min(4, carry.length - i);
					const plan = [];
					for (let j = 0; j < n; j++) {
						plan.push({
							s: carry[i + j],
							src,
							dst,
							csrc,
							cdst
						});
						const t = src;
						src = dst;
						dst = t;
						const ct = csrc;
						csrc = cdst;
						cdst = ct;
					}
					ops.push(() => {
						for (const p of plan) {
							const opts = {
								d: field.pressure,
								dir: [p.s, p.s],
								band: [(budgetPx - 1.5) / costMax, 0],
								size: [WC_CARRY_POW, costMax],
								origin: [p.s, WC_CARRY_TRAVEL]
							};
							if (p.csrc && p.cdst) this.ctx.passes().fieldOp(p.cdst, p.csrc, b, 16, WC_CARRY_RATE, {
								...opts,
								c: p.src
							});
							this.ctx.passes().fieldOp(p.dst, p.src, b, 15, WC_CARRY_RATE, opts);
						}
					});
				}
				if (src !== c) {
					const from = src;
					ops.push(() => fieldOp(c, from, from, 1, 0));
				}
				if (colour && csrc && csrc !== colour.c) {
					const from = csrc, to = colour.c;
					ops.push(() => fieldOp(to, from, from, 1, 0));
				}
			}
			// (§17.41) The wet landing re-mobilises the earlier paint over the
			// DOME of the puddle it joined (band .a, from the front just run),
			// (§17.43) AFTER the carry: re-mobilised before it, the earlier paint
			// rode the new paint's front out of the footprint and piled in a line
			// at the domain's edge; now only the new paint travels with the
			// front, and the two paints mix by the puddle diffusion below, both
			// ways and without a direction.
			// not only under its footprint: the two paints then mix both ways in
			// the puddle diffusion below. The moved share leaves the fixed field
			// (b) as it joins the mobile one (c), for the deposit and the colour
			// record alike. `a` and `spare` are the temporaries.
			const remobFloor = groupDry ? 1 : WC_REMOB_DOME;
			if (first && merge > 0) ops.push(() => {
				if (colour) {
					this.ctx.passes().fieldOp(a, colour.c, colour.b, 18, merge, {
						d: field.band,
						c: c,
						e: b,
						origin: [remobFloor, 1]
					});
					this.ctx.passes().fieldOp(spare, colour.b, colour.c, 3, 0, { c: a });
					fieldOp(colour.c, a, a, 1, 0);
					fieldOp(colour.b, spare, spare, 1, 0);
				}
				this.ctx.passes().fieldOp(a, c, b, 18, merge, {
					d: field.band,
					origin: [remobFloor, 0]
				});
				this.ctx.passes().fieldOp(spare, b, c, 3, 0, { c: a });
				fieldOp(c, a, a, 1, 0);
				fieldOp(b, spare, spare, 1, 0);
			});
			// (§17.40) The puddle MIXES: on a wet landing the mark's footprint
			// and the wash under it are one liquid, and the paint in it - the
			// new, and the wash's re-mobilised under it - evens out across the
			// footprint over tens of texels, as the coarse diffusion did for
			// every mark before §17.29 took it out (it erased the fingers at the
			// front). Back for the wet landing only, gated by the DOME over the
			// footprint (band .a: full inside, none at the front), so the fingers
			// the carry cut past the footprint keep their edges. Without it the
			// earlier mark's paint stopped at its own contour under the new mark
			// - Ilya's "жёлтый проникает ровной линией" - and the new mark's
			// footprint over the wash stayed a paler band where the carry had
			// taken from it ("область между штрихом и рваным краем"). The gate
			// texture is built once into `pressure`, free after the carry.
			if (first && merge > 0) ops.push(() => this.ctx.passes().fieldOp(field.pressure, field.coverage, field.coverage, 17, 0, { d: field.band }));
			// (§17.23) The bloom: the wash's SETTLED paint inside this operation's
			// footprint goes to the footprint's edge — the light patch with the
			// dark ragged ring. Only as much as the recorded wetness says the wash
			// was damp (watercolorBloomStrength); `a` and `spare` are free here.
			// (#680, §17.78) BEFORE the puddle settles into `b`: after it, the
			// bloom took this mark's own settled core out to the footprint's edge
			// too and left a light ring in the middle of the drop.
			if (bloom > 0) {
				ops.push(() => {
					rim(b, WC_BLOOM_SHARE * bloom, a, spare);
					fieldOp(b, spare, spare, 1, 0);
					if (paired && colour) {
						rim(colour.b, WC_BLOOM_SHARE * bloom, a, spare);
						fieldOp(colour.b, spare, spare, 1, 0);
					}
				});
			}
			// (#680, §17.78) ...and it SETTLES as it mixes: a share of the paint
			// grips the paper before the puddle moves it at all (the core), and of
			// what is still afloat a share more after every step - so the paint
			// that settles late has gone far and is little. A core, a nearer halo,
			// a wide faint one (Ilya: "белое пятно почти без размытия, градиент
			// побольше и прозрачнее, и огромный очень прозрачный"), where the
			// schedule alone evened the whole of it out into one pale cloud.
			// The paired update is linear for its shared pre-step gate, so the
			// mobile field is left undepleted and each step's slice is added to
			// the fixed one at its weight (watercolorPuddleSettleWeights); the
			// rest is scaled down once at the end. The fixed field ping-pongs
			// with `spare`, free here, and comes back into `b` before the bloom.
			const puddleSteps = merge > 0 && !this.ctx.ab().noDiffuse ? WET_DIFFUSE_PUDDLE_SCHEDULE : [];
			if (puddleSteps.length) {
				const w = watercolorPuddleSettleWeights(puddleSteps.length);
				const acc = {
					fixed: b,
					free: spare
				};
				// (§17.82) The far slices - settled after the long steps, the faint
				// outer halo - go down through the paper's fibres (wcFibre).
				const fibreFrom = WET_SETTLE_FIBRE_FROM;
				const world = [
					x0 / S,
					-(y0 / S + field.h),
					S
				];
				const settleSlice = (k) => {
					if (!(w.slices[k] > 0)) return;
					if (paired && colour) {
						// Both old mobile destinations are free after the paired draw.
						// Reuse them for fixed-slice sums, then copy back; no histories
						// or extra field-sized textures are needed.
						const addSlice = (fixed, mobile, tmp) => {
							if (k >= fibreFrom) this.ctx.passes().fieldOp(tmp, fixed, mobile, 1, w.slices[k], {
								world,
								d: field.band,
								dir: [1, 1]
							});
							else fieldOp(tmp, fixed, mobile, 1, w.slices[k]);
							fieldOp(fixed, tmp, tmp, 1, 0);
						};
						addSlice(b, st.src, st.dst);
						addSlice(colour.b, paired.src, paired.dst);
						return;
					}
					if (k >= fibreFrom) this.ctx.passes().fieldOp(acc.free, acc.fixed, st.src, 1, w.slices[k], {
						world,
						d: field.band,
						dir: [1, 1]
					});
					else fieldOp(acc.free, acc.fixed, st.src, 1, w.slices[k]);
					const t = acc.fixed;
					acc.fixed = acc.free;
					acc.free = t;
				};
				// The core is taken off a SMOOTHED field: straight after the carry
				// the mobile paint has a pale line along the footprint's contour (the
				// carry leaves the film's own contour ring out), which the whole
				// schedule used to even out - settled raw, it stayed as a light ring
				// round the middle of every drop. Two fine steps, gated by the
				// coverage and not the dome (the line IS the dome's edge), an even
				// count so the pair's parity stays.
				for (const [radius, knight] of WET_SETTLE_SMOOTH) {
					ops.push(() => advance(radius, knight));
				}
				ops.push(() => settleSlice(0));
				puddleSteps.forEach(({ radius, knight }, i) => {
					ops.push(() => {
						advance(radius, knight, field.pressure);
						settleSlice(i + 1);
					});
				});
				ops.push(() => {
					if (acc.fixed !== b) fieldOp(b, acc.fixed, acc.fixed, 1, 0);
					// What is still afloat, at its weight: into the free one of the
					// pair and back, so the pair's parity (which the colour settle's
					// spare is chosen by) does not change.
					fieldOp(st.dst, st.src, st.src, 1, w.afloat - 1);
					fieldOp(st.src, st.dst, st.dst, 1, 0);
					if (paired) {
						fieldOp(paired.dst, paired.src, paired.src, 1, w.afloat - 1);
						fieldOp(paired.src, paired.dst, paired.dst, 1, 0);
					}
				});
			}
			for (const { radius, knight } of diffuseSteps) {
				ops.push(() => advance(radius, knight));
			}
			// (§17.23) The tideline: after the paint has run, its puddle carries a
			// share of it to the rim as it dries. The moved field lands in `dst`,
			// the sum with the fixed paint in `src`.
			// (§17.42) ...or not: under the group-dry oracle the tide waits for
			// the whole wash (watercolorDryWash), and the operation's result is
			// its moved paint over the fixed field, all of it still mobile.
			ops.push(() => {
				// The pressure gate is no longer sampled after the diffusion. It
				// is now a spare shared sequentially by the paired final sums.
				const finalSpare = paired ? field.pressure : spare;
				if (groupDry) {
					// Through the spare and back, so the result lands where the rim's
					// would (st.src): the colour settle's spare is chosen by that.
					fieldOp(finalSpare, b, st.src, 1, 1);
					fieldOp(st.src, finalSpare, finalSpare, 1, 0);
					st.out = st.src;
					poolStreaks(st.src, finalSpare);
					if (paired && colour) {
						fieldOp(finalSpare, colour.b, paired.src, 1, 1);
						fieldOp(paired.src, finalSpare, finalSpare, 1, 0);
						paired.out = paired.src;
						poolStreaks(paired.src, finalSpare);
					}
					return;
				}
				rim(st.src, watercolorRimShare(WC_TIDE_RIM, radiusC, width) * tideWater, st.dst, finalSpare, true);
				st.out = st.src;
				fieldOp(st.out, b, finalSpare, 1, 1);
				poolStreaks(st.out, finalSpare);
				if (paired && colour) {
					rim(paired.src, watercolorRimShare(WC_TIDE_RIM, radiusC, width) * tideWater, paired.dst, finalSpare, true);
					paired.out = paired.src;
					fieldOp(paired.out, colour.b, finalSpare, 1, 1);
					poolStreaks(paired.out, finalSpare);
				}
			});
			return st;
		};
		// The deposit's settle borrows a colour buffer as its spare; the colour
		// settle, when it runs, borrows a deposit one (both are done by then).
		// The deposit's spare: the colour record's deposit buffer once the
		// record is split (its mobile part lives in cc from the first op on),
		// else the unused cc.
		const dep = settle(field.a, field.b, field.c, true, colour ? field.ca : field.cc);
		// (#536, §17.20) One paint so far: its colour record is its deposit's
		// mass times one absorption everywhere, so it is rebuilt from the moved
		// deposit in a single pass instead of carried through the schedule
		// again — half the settle's cost, which was "всё это дело притормаживает".
		let col;
		if (scratch.paints.size <= 1) {
			const only = [...scratch.paints][0];
			const tau = only ? pigmentAbsorption(only.split(",").map(Number)) : [
				0,
				0,
				0
			];
			col = { out: field.cc };
			ops.push(() => {
				this.ctx.passes().pigmentColor(field.cc, dep.out, tau);
			});
		} else {
			// Already transported in lockstep with each deposit step; an
			// independent colour schedule would change its mobility fractions.
			col = pairedColour;
		}
		// Sweep contacts in recorded order. Optical depth and pigment use the
		// same pre-contact pigment, before either result is copied back.
		let brushDiagnosticOperations = 0; let constructionTick=0;
        for (const contact of contacts) {
            let zmax = 0;
            for (let i=2;i<contact.field.pixels.length;i+=4) zmax=Math.max(zmax,-Math.log(Math.max(1-contact.field.pixels[i]/255,1/255)));
            const hop = Math.max(1, Math.ceil(.2*contact.radius/S*zmax*Math.SQRT2/.84));
            if(hop>64)throw Error("Calibrated contact pulse exceeds64");
            const pulseGain=.2*contact.radius/(hop*S);
            brushDiagnosticOperations += hop;
            if (brushDiagnosticOperations > 8192) throw Error("Brush diagnostic operation budget8192 exceeded");
            let rect, scissor, left, right, bottom, top;
            ops.push(() => {
                if (!flowTexture) return;
                const cf = contact.field, cr = contact.rect;
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, flowTexture);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cf.width, cf.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, cf.pixels);
			rect = [
				(cr.x - x0) / (field.w * S),
				1 - (cr.y + cr.h - y0) / (field.h * S),
				cr.w / (field.w * S),
				cr.h / (field.h * S)
			];
			left = Math.max(0, Math.floor((cr.x - x0) / S)), right = Math.min(field.w, Math.ceil((cr.x + cr.w - x0) / S));
			bottom = Math.max(0, Math.floor(field.h - (cr.y + cr.h - y0) / S)), top = Math.min(field.h, Math.ceil(field.h - (cr.y - y0) / S));
			scissor = [
				left,
				bottom,
				right - left,
				top - bottom
			];
            });
            for (let sub = 0; sub < hop; sub++) ops.push(() => {
                const phase=[x0/S,-(y0/S+field.h),S,constructionTick++];
                if (!flowTexture) return;
                this.ctx.passes().brushPass(field, flowTexture, 4 * S, S, col.out, field.band, dep.out, rect, scissor, col.out, pulseGain, phase);
			this.ctx.passes().brushPass(field, flowTexture, 4 * S, S, dep.out, field.pressure, dep.out, rect, scissor, col.out, pulseGain, phase);
			field.pressure.copyRegionInto(dep.out, left, bottom, left, bottom, right - left, top - bottom);
			field.band.copyRegionInto(col.out, left, bottom, left, bottom, right - left, top - bottom);
            });
        }
		// (§17.42) The provisional dry target: the wet result with the one tide
		// along the whole wash's contour, into the deposit and colour buffers
		// the settle left free. The wash's own standing level and radius are
		// the widest and wettest of its operations (dryCtx), not this one's.
		let dry = null;
		if (groupDry) {
			const dryDep = dep.out === field.a ? field.c : field.a;
			const dryCol = col.out === field.ca ? field.cc : field.ca;
			const dc = scratch.dryCtx;
			this.groupTideOps(ops, field, x0, y0, Math.max(radiusPx, dc?.radiusPx ?? 0) / S, Math.max(standing, dc?.standing ?? 0), scratch.paints, dep.out, colour ? col.out : null, dryDep, dryCol, [
				field.b,
				field.cb,
				field.pressure
			], S, WC_TIDE_RIM + 0.45 * Math.max(0, Math.min(1, wetPeak - landedWet)));
			dry = {
				dep: dryDep,
				col: dryCol
			};
		}
		// …and home, tile by tile — and this is the new settled deposit.
		const finish = () => {
			// (§17.43) The dry target first catches up with the deposit over the
			// WHOLE gesture, window or no window: a stroke wider than the field
			// (a replayed sheet-wide sweep from before the span cut) has paint
			// outside the rect that no settle touched, and the composite reads
			// the dry target - that paint had simply vanished from the picture.
			if (groupDry) {
				const bx0 = Math.floor(bounds.minX) - pad, by0 = Math.floor(bounds.minY) - pad;
				const bx1 = Math.ceil(bounds.maxX) + pad, by1 = Math.ceil(bounds.maxY) + pad;
				for (const tile of targets) {
					const entry = scratch.peek(tile.buffer);
					if (!entry?.inkLoad) continue;
					const rx0 = Math.max(bx0, tile.originX), ry0 = Math.max(by0, tile.originY);
					const rx1 = Math.min(bx1, tile.originX + tile.buffer.width), ry1 = Math.min(by1, tile.originY + tile.buffer.height);
					if (rx1 <= rx0 || ry1 <= ry0) continue;
					const tx = rx0 - tile.originX, ty = tile.buffer.height - (ry1 - tile.originY);
					if (!entry.inkDry) {
						entry.inkDry = this.ctx.pool().acquire(tile.buffer.width, tile.buffer.height);
						entry.inkLoad.copyTo(entry.inkDry);
					} else entry.inkLoad.copyRegionInto(entry.inkDry, tx, ty, tx, ty, rx1 - rx0, ry1 - ry0);
					if (entry.inkColor) {
						if (!entry.colorDry) {
							entry.colorDry = this.ctx.pool().acquire(tile.buffer.width, tile.buffer.height);
							entry.inkColor.copyTo(entry.colorDry);
						} else entry.inkColor.copyRegionInto(entry.colorDry, tx, ty, tx, ty, rx1 - rx0, ry1 - ry0);
					}
				}
			}
			for (const { tile, ox0, oy0, ox1, oy1 } of overlaps) {
				const entry = scratch.peek(tile.buffer);
				if (!entry?.inkLoad) continue;
				const tx = ox0 - tile.originX, ty = tile.buffer.height - (oy1 - tile.originY), tw = ox1 - ox0, th = oy1 - oy0;
				// (§17.44) A film that began while the settle ran (the next chunk's,
				// see newFilm) sits on a base copied before it landed: the settled
				// result goes onto that BASE, and the deposit is rebuilt as base +
				// film below - or the next chunk's paint vanished from the overlap
				// until the gesture ended. Otherwise it goes onto the deposit.
				const runningFilm = entry.filmGesture !== gesture && entry.filmGesture === scratch.gesture && !!entry.strokeInk && !!entry.inkBase;
				const settledInk = runningFilm ? entry.inkBase : entry.inkLoad;
				const snap = snapshots.get(tile.buffer);
				fromField(dep.out, a0, tile, ox0, oy0, ox1, oy1, settledInk, snap?.ink ?? settledInk);
				if (entry.inkSettled) settledInk.copyRegionInto(entry.inkSettled, tx, ty, tx, ty, tw, th);
				// (§17.24) …and the coverage the water front extended - MERGED by
				// max (§17.44): the gesture may have gone on stamping the next
				// chunk's coverage while the settle ran.
				if (S === 1) {
					const sx = ox0 - x0, sy = field.h - (oy1 - y0);
					entry.coverage.copyRegionInto(field.mask, tx, ty, sx, sy, tw, th);
					this.ctx.passes().fieldOp(field.band, field.coverage, field.mask, 20, 0);
					field.band.copyRegionInto(entry.coverage, sx, sy, tx, ty, tw, th);
				} else {
					const tmp = this.ctx.pool().acquire(tile.buffer.width, tile.buffer.height);
					this.ctx.passes().wcResample(tmp, tx, ty, tw, th, field.coverage, (ox0 - x0) / S, field.h - (oy1 - y0) / S, 1 / S, 2, null, entry.coverage, fieldRect);
					tmp.copyRegionInto(entry.coverage, tx, ty, tx, ty, tw, th);
					this.ctx.pool().release(tmp);
				}
				const settledColor = entry.inkColor ? runningFilm && entry.colorBase ? entry.colorBase : entry.inkColor : null;
				// (§17.44) One paint: its colour record is the deposit times one
				// absorption (§17.20), rebuilt at FULL resolution from the deposit
				// just brought home - the field's rebuilt record and the recorded one
				// are not the same quantity, and a change between them came back as
				// a paler, washed-out mark.
				const rebuildColour = (to, from) => this.ctx.passes().fieldOp(to, from, from, 2, 1, {
					c: from,
					d: from,
					tau: singleTau,
					scissor: [
						tx,
						ty,
						tw,
						th
					]
				});
				if (settledColor) {
					if (S > 1 && !colour) rebuildColour(settledColor, settledInk);
					else fromField(col.out, ca0, tile, ox0, oy0, ox1, oy1, settledColor, snap?.color ?? settledColor);
					if (entry.colorSettled) settledColor.copyRegionInto(entry.colorSettled, tx, ty, tx, ty, tw, th);
				}
				if (runningFilm) {
					const rect = [
						tx,
						ty,
						tw,
						th
					];
					this.ctx.passes().fieldOp(entry.inkLoad, entry.inkBase, entry.strokeInk, 1, 1, { scissor: rect });
					if (entry.inkColor && entry.colorBase && entry.strokeColor) this.ctx.passes().fieldOp(entry.inkColor, entry.colorBase, entry.strokeColor, 1, 1, { scissor: rect });
				}
				if (dry) {
					// (§17.43) First the settled wet state over the whole of this
					// tile's part of the field (the field is capped; past the window
					// the dry target keeps up with the deposit), then the dry result
					// over the field less its margin - the tide's change on top.
					if (!entry.inkDry) {
						entry.inkDry = this.ctx.pool().acquire(tile.buffer.width, tile.buffer.height);
						settledInk.copyTo(entry.inkDry);
					} else settledInk.copyRegionInto(entry.inkDry, tx, ty, tx, ty, tw, th);
					if (settledColor) {
						if (!entry.colorDry) {
							entry.colorDry = this.ctx.pool().acquire(tile.buffer.width, tile.buffer.height);
							settledColor.copyTo(entry.colorDry);
						} else settledColor.copyRegionInto(entry.colorDry, tx, ty, tx, ty, tw, th);
					}
					// Where the field was clipped by the tile's own edge there is no
					// margin to leave, the tile ends there.
					const ix0 = ox0 === x0 && x0 > minX ? ox0 + dryMargin : ox0, iy0 = oy0 === y0 && y0 > minY ? oy0 + dryMargin : oy0;
					const ix1 = ox1 === x1 && x1 < maxX ? ox1 - dryMargin : ox1, iy1 = oy1 === y1 && y1 < maxY ? oy1 - dryMargin : oy1;
					if (ix1 <= ix0 || iy1 <= iy0) continue;
					fromField(dry.dep, dep.out, tile, ix0, iy0, ix1, iy1, entry.inkDry, entry.inkDry);
					if (entry.colorDry) {
						if (S > 1 && !colour) rebuildColour(entry.colorDry, entry.inkDry);
						else fromField(dry.col, col.out, tile, ix0, iy0, ix1, iy1, entry.colorDry, entry.colorDry);
					}
				}
			}
			if (a0) this.ctx.pool().release(a0);
			if (ca0) this.ctx.pool().release(ca0);
			for (const snap of snapshots.values()) {
				this.ctx.pool().release(snap.ink);
				if (snap.color) this.ctx.pool().release(snap.color);
			}
		};
		return {
			ops,
			finish
		};
	}
	/** (#536, §17.42) The group tide as entries of `ops`: over a settle field
	*  whose coverage holds the wash's whole coverage (the union of every
	*  operation's domain), the wet deposit `dep` and its colour record `col`
	*  (null with one paint: rebuilt from the dried deposit) get the ONE tide
	*  along the coverage's outer contour, into `outDep` and `outCol`. `free`
	*  is three buffers the routine may scribble on; `mask`, `pressure` and
	*  `band` it takes for itself. The band is what the settle's own tide used
	*  (mode 6), read off an inward relaxation seeded from outside the
	*  coverage (mode 19) - no backrun, no "earlier mark", the whole union one
	*  domain with the dome full throughout. */
	groupTideOps(ops, field, x0, y0, radiusPx, standing, paints, dep, col, outDep, outCol, free, scale = 1, rimBase = WC_TIDE_RIM) {
		// (§17.44) A world width in cells - see the settle's own `width`.
		const width = Math.max(1, Math.round(Math.max(2, Math.min(WC_RIM_BAND_PX, Math.round(radiusPx * scale / 5))) / scale));
		const costMaxIn = width + 3;
		const inSteps = width + 2;
		const [t1, t2, t3] = free;
		// The seeds from the coverage (mode 19): the inward pass's into `mask`
		// (inside unreached, outside the source), a stand-in outward cost into
		// `pressure` (0 inside, 1 outside); then the inward relaxation over the
		// relief as the settle runs it, the first two cells flat so the peak is
		// a continuous line. `band` is the relaxation's ping-pong partner until
		// it is written.
		ops.push(() => {
			this.ctx.passes().fieldOp(field.mask, field.coverage, field.coverage, 19, .002, { dir: [1, 0] });
			this.ctx.passes().fieldOp(field.pressure, field.coverage, field.coverage, 19, .002);
		});
		const pp = {
			src: field.mask,
			dst: field.band
		};
		for (let i = 0; i < inSteps; i += 4) {
			const n = Math.min(4, inSteps - i);
			ops.push(() => {
				for (let j = 0; j < n; j++) {
					const flat = i + j < 2;
					this.ctx.passes().waterFrontStep(field, x0, y0, WC_FRONT_DRY_COST, pp.src, pp.dst, costMaxIn, flat ? 0 : WC_FRONT_CLIMB_IN, flat ? 1 : WC_FRONT_FLOOR_IN, 1, scale);
					const t = pp.src;
					pp.src = pp.dst;
					pp.dst = t;
				}
				if (i + n >= inSteps && pp.src !== field.mask) this.ctx.passes().fieldOp(field.mask, pp.src, pp.src, 1, 0);
			});
		}
		const gather = [];
		for (let st = 1; st <= Math.max(1, radiusPx / 2) && gather.length < 6; st *= 2) gather.push([st, st]);
		// A 3x3 binomial at each stride of `gather`, `from` untouched, the result
		// in `out` (which may be one of the temporaries).
		const blurTo = (out, from, tmpA, tmpB) => {
			let gs = from, gd = tmpA;
			for (let i = 0; i < gather.length; i++) {
				this.ctx.passes().fieldOp(gd, gs, gs, 5, 0, { dir: gather[i] });
				const next = gd === tmpA ? tmpB : tmpA;
				gs = gd;
				gd = next;
			}
			if (gs !== out) this.ctx.passes().fieldOp(out, gs, gs, 1, 0);
		};
		const tideWater = Math.min(1, standing / WC_TIDE_STANDING_FULL);
		const share = watercolorRimShare(rimBase, radiusPx, width) * tideWater;
		const costMax = 8;
		ops.push(() => {
			// The band (mode 6) over the whole union: costOut 0 inside the
			// coverage so `inside` and the dome are 1 throughout, no backrun (tau
			// 0), no "earlier mark" (the seed's .b is empty), the stood record
			// from the coverage against the wash's wettest standing level. Then
			// the band gathered by the rim's kernel, into `mask`.
			this.ctx.passes().fieldOp(field.band, field.pressure, field.coverage, 6, 0, {
				c: field.mask,
				d: field.pressure,
				band: [.5, width / costMaxIn],
				size: [1 / costMax, 1 / costMaxIn],
				origin: [standing, 0],
				dir: [1, 1],
				tau: [
					0,
					0,
					0
				],
				world: [
					x0 / scale,
					-(y0 / scale + field.h),
					scale
				]
			});
			blurTo(field.mask, field.band, t1, t3);
		});
		// The tide: `share` of ALL the paint inside (mode 7 by band .g, the whole
		// union) gathered onto the band (mode 14) - the deposit and, with two
		// paints or more, the colour record by the same fractions.
		const tide = (paint, out) => {
			this.ctx.passes().fieldOp(t1, paint, paint, 7, share, { d: field.band });
			blurTo(t2, t1, t2, t3);
			this.ctx.passes().fieldOp(out, paint, t2, 14, share, {
				c: field.mask,
				d: field.band
			});
		};
		ops.push(() => tide(dep, outDep));
		if (col) {
			ops.push(() => tide(col, outCol));
		} else {
			const only = [...paints][0];
			const tau = only ? pigmentAbsorption(only.split(",").map(Number)) : [
				0,
				0,
				0
			];
			ops.push(() => this.ctx.passes().fieldOp(outCol, outDep, outDep, 2, 1, {
				c: outDep,
				d: outDep,
				tau: [
					tau[0],
					tau[1],
					tau[2]
				]
			}));
		}
	}
	destroyTextures() {
		this.gl.deleteTexture(this._brushFlowTex);
		this.gl.deleteTexture(this._foreignWaterTex);
	}
	forgetTextures() {
		this._brushFlowTex = null;
		this._foreignWaterTex = null;
	}
}

//# sourceMappingURL=data:application/json;base64,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VyxLQUFLLElBQUksT0FBTyxDQUFDLENBQUMsUUFBUSxRQUFRLFFBQVEsUUFBUSxHQUFHLEdBQUc7SUFBRSxHQUFHO0lBQVEsR0FBRztJQUFRLEtBQUs7S0FBQyxJQUFJO0tBQUksSUFBSTtLQUFJLElBQUk7SUFBRTtHQUFFLENBQUMsQ0FBQztFQUNqSTtDQUNGO0NBRUEsa0JBQXdCO0VBQ3RCLEtBQUssR0FBRyxjQUFjLEtBQUssYUFBYTtFQUN4QyxLQUFLLEdBQUcsY0FBYyxLQUFLLGdCQUFnQjtDQUM3QztDQUVBLGlCQUF1QjtFQUNyQixLQUFLLGdCQUFnQjtFQUNyQixLQUFLLG1CQUFtQjtDQUMxQjtBQUNGIiwibmFtZXMiOltdLCJzb3VyY2VzIjpbIldhdGVyY29sb3JTZXR0bGVQbGFuLnRzIl0sInZlcnNpb24iOjMsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgV2F0ZXJjb2xvclBhc3NlcyB9IGZyb20gJy4vV2F0ZXJjb2xvclBhc3NlcydcbmltcG9ydCB0eXBlIHsgQWNjdW11bGF0aW9uQnVmZmVyIH0gZnJvbSAnLi4vYnVmZmVycy9BY2N1bXVsYXRpb25CdWZmZXInXG5pbXBvcnQgdHlwZSB7IFJpYmJvblNjcmF0Y2hQb29sIH0gZnJvbSAnLi4vYnVmZmVycy9SaWJib25TY3JhdGNoUG9vbCdcbmltcG9ydCB0eXBlIHsgUmliYm9uU3Ryb2tlU2NyYXRjaCB9IGZyb20gJy4uL2J1ZmZlcnMvUmliYm9uU3Ryb2tlU2NyYXRjaCdcbmltcG9ydCB7IFdBVEVSQ09MT1JfQlJJU1RMRV9CVU5ETEVfUFggfSBmcm9tICcuLi9kYWJzL3JpYmJvblByb2ZpbGUnXG5cbmltcG9ydCB7IFdFVF9ESUZGVVNFX1NDSEVEVUxFLCBXRVRfRElGRlVTRV9QVURETEVfU0NIRURVTEUsIFdFVF9ESUZGVVNFX1JFQUNILCBXRVRfRElGRlVTRV9NT0JJTEUsIHdhdGVyY29sb3JQdWRkbGVTZXR0bGVXZWlnaHRzLCBXRVRfU0VUVExFX1NNT09USCwgV0VUX1NFVFRMRV9GSUJSRV9GUk9NLCB0eXBlIFdldERpZmZ1c2VTdGVwIH0gZnJvbSAnLi4vd2F0ZXJjb2xvci93ZXREaWZmdXNpb24nXG5pbXBvcnQgeyBicnVzaERyYWdDb250YWN0cyB9IGZyb20gJy4uL3dhdGVyY29sb3IvYnJ1c2hEcmFnJ1xuaW1wb3J0IHsgZm9yZWlnbldhdGVyU3RlbmNpbCB9IGZyb20gJy4uL3dhdGVyY29sb3IvZm9yZWlnbldhdGVyJ1xuaW1wb3J0IHsgcGlnbWVudEFic29ycHRpb24gfSBmcm9tICcuLi93YXRlcmNvbG9yL3BpZ21lbnRPcHRpY3MnXG5pbXBvcnQgeyB3YXRlcmNvbG9yRGFtcE92ZXIsIHdhdGVyY29sb3JQdWRkbGVNZXJnZSwgd2F0ZXJjb2xvclJpbVNoYXJlLCBXQ19CTE9PTV9TSEFSRSwgV0NfVElERV9TVEFORElOR19GVUxMLCBXQ19USURFX1JJTSwgV0NfUklNX0JBTkRfUFgsIFdDX1JFTU9CX0RPTUUsIHdhdGVyY29sb3JTcHJlYWRCdWRnZXQsIHdhdGVyY29sb3JDYXJyeVN0cmlkZXMsIHdhdGVyY29sb3JGcm9udFN0ZXBzLCBXQ19DQVJSWV9SQVRFLCBXQ19DQVJSWV9QT1csIFdDX0NBUlJZX1RSQVZFTCwgd2F0ZXJjb2xvckR3ZWxsV2F0ZXIsIFdDX1BPT0xfU1RSRUFLLCBXQ19GUk9OVF9DTElNQiwgV0NfRlJPTlRfRkxPT1IsIFdDX0ZST05UX0NMSU1CX0lOLCBXQ19GUk9OVF9GTE9PUl9JTiwgV0NfRlJPTlRfRFJZX0NPU1QsIFdDX0ZST05UX0RSWV9TSEFSRSB9IGZyb20gJy4uL3ByZXNldHMvd2F0ZXJjb2xvclByZXNldHMnXG5pbXBvcnQgdHlwZSB7IFBhaW50VGFyZ2V0IH0gZnJvbSAnLi4vYnVmZmVycy9JTGF5ZXJCdWZmZXInXG5pbXBvcnQgdHlwZSB7IFNldHRsZUZpZWxkIH0gZnJvbSAnLi4vYnVmZmVycy9TZXR0bGVGaWVsZCdcbmltcG9ydCB7IFdDX0hBTEZfUkVTX1JBRElVU19QWCwgV0NfSEFMRl9SRVNfU1BBTl9QWCB9IGZyb20gJy4uL3dhdGVyY29sb3Ivc2V0dGxlUmVzb2x1dGlvbidcblxuZXhwb3J0IGludGVyZmFjZSBXYXRlcmNvbG9yU2V0dGxlUGxhbkNvbnRleHQge1xuICBnbCgpOiBXZWJHTFJlbmRlcmluZ0NvbnRleHRcbiAgZmllbGRGb3IodzogbnVtYmVyLCBoOiBudW1iZXIpOiBTZXR0bGVGaWVsZFxuICBwYXBlcldvcmxkU2l6ZSgpOiB7IHc6IG51bWJlcjsgaDogbnVtYmVyIH1cbiAgcG9vbCgpOiBSaWJib25TY3JhdGNoUG9vbFxuICBtaW5tYXhFeHQoKTogeyBNQVhfRVhUOiBudW1iZXIgfSB8IG51bGxcbiAgYWIoKTogeyBub0RpZmZ1c2U6IGJvb2xlYW47IG5vQ2Fycnk6IGJvb2xlYW47IG9wRHJ5OiBib29sZWFuIH1cbiAgcGFzc2VzKCk6IFdhdGVyY29sb3JQYXNzZXNcbn1cblxuLyoqIEJ1aWxkcyB0aGUgb3JkZXJlZCBHUFUgc3RlcHMgYW5kIHRoZSBmaW5hbCB0aWxlIGNvcHktYmFjayBvZiBvbmUgc2V0dGxlLlxuICogV29ya2luZyBmaWVsZHMgYW5kIGZyYW1lIHNjaGVkdWxpbmcgcmVtYWluIHNlcGFyYXRlIG93bmVycy4gKi9cbmV4cG9ydCBjbGFzcyBXYXRlcmNvbG9yU2V0dGxlUGxhbiB7XG4gIHByaXZhdGUgcmVhZG9ubHkgY3R4OiBXYXRlcmNvbG9yU2V0dGxlUGxhbkNvbnRleHRcbiAgY29uc3RydWN0b3IoY3R4OiBXYXRlcmNvbG9yU2V0dGxlUGxhbkNvbnRleHQpIHsgdGhpcy5jdHggPSBjdHggfVxuICBwcml2YXRlIGdldCBnbCgpOiBXZWJHTFJlbmRlcmluZ0NvbnRleHQgeyByZXR1cm4gdGhpcy5jdHguZ2woKSB9XG5cbiAgLyoqIFVwbG9hZCBjYWNoZXMgZm9yIHJlY29yZGVkIGJydXNoIHRyYXZlbCBhbmQgcHJlY2VkaW5nIHdldCBjb250YWN0cy4gKi9cbiAgcHJpdmF0ZSBfYnJ1c2hGbG93VGV4OiBXZWJHTFRleHR1cmUgfCBudWxsID0gbnVsbFxuXG4gIHByaXZhdGUgX2ZvcmVpZ25XYXRlclRleDogV2ViR0xUZXh0dXJlIHwgbnVsbCA9IG51bGxcblxuICAvKiogKCM1MzYsIEFEUiAwMTEgwqcxNy4xMSwgwqcxNy4xNykgVGhlIHdldCBkaWZmdXNpb246IHdoYXQgVEhJUyBvcGVyYXRpb25cbiAgICogIGxhaWQgKHRoZSBkZXBvc2l0IGxlc3Mgd2hhdCB3YXMgc2V0dGxlZCBiZWZvcmUgaXQpIGlzIHNwbGl0IGludG8gYVxuICAgKiAgZml4ZWQgYW5kIGEgbW9iaWxlIHNoYXJlIChXRVRfRElGRlVTRV9NT0JJTEUpOyB0aGUgbW9iaWxlIHNoYXJlIHJ1bnNcbiAgICogIFdFVF9ESUZGVVNFX1JBRElJIHN0ZXBzIG9mIFdDX0RJRkZVU0VfRlJBRywgcGluZy1wb25nZWQ7IGFuZCB0aGUgc3VtIOKAlFxuICAgKiAgc2V0dGxlZCArIGZpeGVkICsgbW92ZWQg4oCUIGdvZXMgYmFjayB0byB0aGUgdGlsZXMgYW5kIGJlY29tZXMgdGhlIG5ld1xuICAgKiAgc2V0dGxlZCBkZXBvc2l0LlxuICAgKlxuICAgKiAgT25seSB0aGlzIG9wZXJhdGlvbidzIHBhaW50LCBkZWxpYmVyYXRlbHkuIFRoZSBmaXJzdCB2ZXJzaW9uIG1vdmVkIHRoZVxuICAgKiAgd2hvbGUgd2FzaCBhdCBldmVyeSBzZXR0bGUsIHNvIHRoZSBmaXJzdCBzdHJva2Ugb2YgYSB3YXNoIHdhcyBkaWZmdXNlZFxuICAgKiAgYWdhaW4gYnkgZXZlcnkgbGF0ZXIgc3Ryb2tlIGluIGl0IOKAlCB0aGlubmVyIGVhY2ggdGltZSDigJQgd2hpbGUgdGhlXG4gICAqICBsYXRlc3Qgc2F0IHdoZXJlIGl0IHdhcyBsYWlkOiBcItC/0LjQs9C80LXQvdGC0LAg0LIg0LvRg9C20LUg0LrQsNGC0LDRgdGC0YDQvtGE0LjRh9C10YHQutC4INC80LDQu9C+LCDQsFxuICAgKiAg0L/QvtCy0YLQvtGA0L3Ri9C5INGI0YLRgNC40YUg0LvQvtC20LjRgtGB0Y8g0YHQu9C40YjQutC+0Lwg0YHQuNC70YzQvdC+XCIuIFBhaW50IG1vdmVzIG9uY2UsIGF0IHRoZVxuICAgKiAgc2V0dGxlIHRoYXQgbGFpZCBpdCwgdGhlbiBpdCBpcyBmaXhlZDsgbGlmdGluZyBmaXhlZCBwYWludCB3aXRoIGNsZWFuXG4gICAqICB3YXRlciBpcyB0aGUgcmVtb2JpbGl6YXRpb24gcm91bmQgKMKnMTcuOSkuIFRoZSBmbHV4IGlzIGxpbmVhciBpbiB0aGVcbiAgICogIGNvbmNlbnRyYXRpb24gZm9yIGEgZ2l2ZW4gZ2F0ZSwgc28gbW92aW5nIHRoZSBtb2JpbGUgc2hhcmUgb2YgdGhlIG5ld1xuICAgKiAgcGFpbnQgYWxvbmUgaXMgZXhhY3QsIGFuZCBlYWNoIHBhcnQgaXMgY29uc2VydmVkIG9uIGl0cyBvd24uXG4gICAqXG4gICAqICBPdmVyIE9ORSBmaWVsZCwgbm90IHBlciB0aWxlLiBQZXIgdGlsZSwgZXZlcnl0aGluZyBvZmYgdGhlIHRpbGUgd2FzIGRyeVxuICAgKiAgcGFwZXIsIHNvIGEgcHVkZGxlIGFjcm9zcyB4ID0gMTAyNCBrZXB0IGl0cyBwYWludCBvbiBlYWNoIHNpZGUg4oCUIGFcbiAgICogIHN0cmFpZ2h0IHNlYW0sIHZpc2libGUgdGhlIG1vbWVudCB0aGUgcmV2ZWFsIGxldCBnbyAoXCLQv9GA0Lgg0LLRi9GB0YvRhdCw0L3QuNC4INGPXG4gICAqICDQstC40LbRgyDQu9C40L3QuNC4INGB0LrQu9C10LnQutC4INGC0LDQudC70L7QslwiKS4gVGhlIHdhc2gncyB0aWxlcyBhcmUgc3RpdGNoZWQgaW50byBhIHJlY3Qg4oCUXG4gICAqICB0aGUgc2V0dGxlIGJvdW5kcyBwYWRkZWQgYnkgdGhlIHNjaGVkdWxlJ3Mgd2hvbGUgcmVhY2gsIHNvIG5vIHRleGVsIHdpdGhcbiAgICogIHBhaW50IGNhbiBldmVyIHNlZSB0aGUgcmVjdCdzIGVkZ2Ug4oCUIGFuZCBjb3BpZWQgYmFjay4gVGhlIHBhcGVyJ3MgaGVpZ2h0XG4gICAqICBpcyBzYW1wbGVkIGF0IHRoZSBXT1JMRCBwb3NpdGlvbiwgc28gd2hlcmUgdGhlIHJlY3Qgc3RhcnRzIChhIGxpdmVcbiAgICogIGdlc3R1cmUncyBib3VuZHMgYW5kIGEgcmVwbGF5J3MgZGlmZmVyIGJ5IGEgYmF0Y2gncyBwYWRkaW5nKSBjYW5ub3QgbW92ZVxuICAgKiAgYSBwaXQuIE5vdGhpbmcgaGVyZSByZWFkcyBhIGNsb2NrOyB0aGUgc2NoZWR1bGUgaXMgYSBjb25zdGFudCBvZiB0aGVcbiAgICogIHRvb2wsIGFuZCB0aGUgZWlnaHQtYml0IHdyaXRlIGJldHdlZW4gc3RlcHMgaXMgdGhlIG9uZSBtZWFzdXJlZCBsZWFrLiAqL1xuICAvKiogKCM1MzYsIEFEUiAwMTEgwqcxNy4xMSwgwqcxNy4yMikgVGhlIHdldCBkaWZmdXNpb24gb3ZlciB0aGlzIHdhc2gnc1xuICAgKiAgdGlsZXMgc3RpdGNoZWQgaW50byBvbmUgZmllbGQsIGFzIGEgbGlzdCBvZiBHUFUgc3RlcHMgcGx1cyB0aGUgY29weS1iYWNrXG4gICAqICDigJQgYSBsaXN0IHNvIHRoYXQgdGhlIGF1dGhvcidzIHBlbi11cCBjYW4gc3ByZWFkIGl0IG92ZXIgZnJhbWVzIHVuZGVyXG4gICAqICB0aGUgcmV2ZWFsIChzZWUgX3N0YXJ0U2V0dGxlKSB3aGlsZSBhIHJlcGxheSBydW5zIGl0IGluIG9uZSBnby4gTnVsbFxuICAgKiAgd2hlbiB0aGUgd2FzaCBob2xkcyBubyBkZXBvc2l0IGhlcmUuICovXG4gIHByZXBhcmUoXG4gICAgc2NyYXRjaDogUmliYm9uU3Ryb2tlU2NyYXRjaCwgdGFyZ2V0czogUGFpbnRUYXJnZXRbXSxcbiAgICBib3VuZHM6IHsgbWluWDogbnVtYmVyOyBtaW5ZOiBudW1iZXI7IG1heFg6IG51bWJlcjsgbWF4WTogbnVtYmVyIH0sXG4gICAgLyoqICgjNTM2LCDCpzE3LjIzKSBIb3cgc3Ryb25nbHkgdGhpcyBvcGVyYXRpb24gYmxvb21zIHRoZSB3YXNoIHVuZGVyIGl0LFxuICAgICAqICAwLi4xIOKAlCB3YXRlcmNvbG9yQmxvb21TdHJlbmd0aCBvZiB0aGUgcGFwZXIgd2V0bmVzcyBpdCByZWNvcmRlZC4gKi9cbiAgICBibG9vbSA9IDAsXG4gICAgLyoqIFRoZSBtYXJrJ3MgcmFkaXVzLCBweDogc2V0cyB0aGUgcmltJ3Mgc2hhcmUgYW5kIHRoZSByZWFjaCBvZiB0aGVcbiAgICAgKiAgZ2F0aGVyaW5nIGtlcm5lbCDigJQgdGhlIHdob2xlIGludGVyaW9yIGZlZWRzIHRoZSByaW0sIG5vdCBqdXN0IGl0c1xuICAgICAqICBuZWlnaGJvdXJob29kLiAqL1xuICAgIHJhZGl1c1B4ID0gMTYsXG4gICAgLyoqICjCpzE3LjI0KSBUaGUgYnJ1c2gncyB3YXRlciBhbmQgdGhlIHdldG5lc3MgdGhlIG1hcmsgbGFuZGVkIGluIOKAlCBob3dcbiAgICAgKiAgZmFyIGl0cyB3YXRlciBydW5zIHBhc3QgdGhlIGZvb3RwcmludCAod2F0ZXJjb2xvclNwcmVhZEJ1ZGdldCkg4oCUIGFuZFxuICAgICAqICB0aGUgc3RhbmRpbmcgd2F0ZXIgdGhlIGV4dGVuZGVkIGRvbWFpbiByZWNvcmRzLiAqL1xuICAgIHdhdGVyID0gMSwgbGFuZGVkV2V0ID0gMCwgc3RhbmRpbmcgPSAxLFxuICAgIC8qKiAowqcxNy4yNSkgVGhlIHdldHRlc3QgcGFwZXIgdGhlIG1hcmsgcmFuIG92ZXI6IGhvdyBmYXIgaXRzIHdhdGVyXG4gICAgICogIGpvaW5lZCBhbiBlYXJsaWVyIG1hcmsncyBwdWRkbGUgKHdhdGVyY29sb3JQdWRkbGVNZXJnZSkuICovXG4gICAgd2V0UGVhayA9IDAsXG4gICAgLyoqICjCpzE3LjM3KSBIb3cgbG9uZyB0aGUgYnJ1c2ggc3Rvb2Qgb24gbGFuZGluZywgbXM6IHRoZSBzdHJlbmd0aCBvZlxuICAgICAqICB0aGUgbGluZSB3aGVyZSBpdHMgbGFuZGluZyBwdWRkbGUncyBmcm9udCBtZXQgdGhlIGZpbG0uICovXG4gICAgZHdlbGxNcyA9IDAsXG4gICk6IHsgb3BzOiBBcnJheTwoKSA9PiB2b2lkPjsgZmluaXNoOiAoKSA9PiB2b2lkIH0gfCBudWxsIHtcbiAgICBjb25zdCB7IGdsIH0gPSB0aGlzXG4gICAgY29uc3QgdGlsZXMgPSB0YXJnZXRzLmZpbHRlcih0ID0+IHNjcmF0Y2gucGVlayh0LmJ1ZmZlcik/Lmlua0xvYWQpXG4gICAgaWYgKCF0aWxlcy5sZW5ndGgpIHJldHVybiBudWxsXG4gICAgLy8gVGhlIHJlY3Q6IHRoZSBzZXR0bGUncyBib3VuZHMgcGx1cyB0aGUgcmVhY2gsIGNsaXBwZWQgdG8gdGhlIHRpbGVzIHRoYXRcbiAgICAvLyBhY3R1YWxseSBob2xkIHRoaXMgd2FzaC4gQ2FwcGVkIOKAlCBhIHdhc2ggd2lkZXIgdGhhbiB0aGUgY2FwIGRpZmZ1c2VzXG4gICAgLy8gaW4gYSB3aW5kb3cgYXJvdW5kIGl0cyBjZW50cmUgYW5kIHNlZXMgYSB3YWxsIGF0IHRoZSB3aW5kb3cncyBlZGdlLlxuICAgIC8vICgjNTM2LCDCpzE3LjIyKSAxNTM2LCBmcm9tIDIwNDg6IHNldmVuIGJ1ZmZlcnMgb2YgMjA0OMKyIGFyZSAxMTcgTUIsIHdoaWNoXG4gICAgLy8gYSB0YWJsZXQgZG9lcyBub3QgaGF2ZSB0byBzcGFyZTsgYXQgMTUzNiB0aGUgZmllbGQgaXMgNjYgTUIgYW5kIGEgNDAwIHB4XG4gICAgLy8gYnJ1c2gncyB3aG9sZSBnZXN0dXJlIHN0aWxsIGZpdHMgaXQgd2l0aCBpdHMgcmVhY2guXG4gICAgLy8gKMKnMTcuNDQpIEEgYmlnIGJydXNoIHNldHRsZXMgYXQgSEFMRiByZXNvbHV0aW9uOiBldmVyeSBwYXNzIG9mIHRoZVxuICAgIC8vIHNldHRsZSBvdmVyIGEgZmllbGQgYSBxdWFydGVyIHRoZSBzaXplLCBhbmQgYSB3aW5kb3cgdHdpY2UgYXMgd2lkZSBpblxuICAgIC8vIHRoZSB3b3JsZC4gVGhlIGZpZWxkIGhvbGRzIGNlbGxzIG9mIFMgcHg7IHdoYXQgZ29lcyBiYWNrIHRvIHRoZSB0aWxlc1xuICAgIC8vIGlzIHRoZSBmaWVsZCdzIGNoYW5nZSwgYnJvdWdodCB1cCBhbmQgYWRkZWQgdG8gdGhlIGZ1bGwtcmVzb2x1dGlvblxuICAgIC8vIHJlY29yZCAoX3djUmVzYW1wbGUpLCBzbyB0aGUgZ3JhaW4gYW5kIHRoZSBicnVzaCdzIHRleHR1cmUgYXJlIHRoZVxuICAgIC8vIHRpbGUncyBvd24gYW5kIG9ubHkgdGhlIG1vdmVtZW50IGlzIGNvYXJzZS4gT24gdGhlIHRhYmxldCBhIDQwMCBweFxuICAgIC8vIHppZ3phZydzIHNldHRsZSB3YXMgNzAgbXMgYW4gZW50cnkgYW5kIH40MCBlbnRyaWVzIGEgY2h1bmsuXG4gICAgLy8gLi4uYW5kIG9ubHkgYSBiaWcgbWFyayBvdmVyIGEgYmlnIHdpbmRvdzogYSBkcm9wIGludG8gYSBwdWRkbGUgb3IgYVxuICAgIC8vIHBhdGNoIG9mIGEgZmV3IGh1bmRyZWQgcGl4ZWxzIHNldHRsZXMgaW4gYSBzbWFsbCBmaWVsZCBhbnl3YXksIGFuZCBhdFxuICAgIC8vIGhhbGYgcmVzb2x1dGlvbiBpdHMgcGFpbnQgc3ByZWFkIHNvZnRlciBhbmQgcGFsZXIgdGhhbiBpdCBkb2VzLlxuICAgIGxldCBTID0gMVxuICAgIGxldCBtaW5YID0gSW5maW5pdHksIG1pblkgPSBJbmZpbml0eSwgbWF4WCA9IC1JbmZpbml0eSwgbWF4WSA9IC1JbmZpbml0eVxuICAgIGZvciAoY29uc3QgdCBvZiB0aWxlcykge1xuICAgICAgbWluWCA9IE1hdGgubWluKG1pblgsIHQub3JpZ2luWCk7IG1pblkgPSBNYXRoLm1pbihtaW5ZLCB0Lm9yaWdpblkpXG4gICAgICBtYXhYID0gTWF0aC5tYXgobWF4WCwgdC5vcmlnaW5YICsgdC5idWZmZXIud2lkdGgpOyBtYXhZID0gTWF0aC5tYXgobWF4WSwgdC5vcmlnaW5ZICsgdC5idWZmZXIuaGVpZ2h0KVxuICAgIH1cbiAgICAvLyAowqcxNy4zOCkgLi4ucGFkZGVkIGJ5IHRoZSBmdXJ0aGVyIG9mIHRoZSBkaWZmdXNpb24ncyByZWFjaCBhbmQgdGhlXG4gICAgLy8gd2F0ZXIgZnJvbnQncyBydW46IHRoZSBmcm9udCdzIGJ1ZGdldCBpcyBpbiBjb3N0IHVuaXRzIGFuZCBhIGNlbGxcbiAgICAvLyBjb3N0cyBhdCBsZWFzdCBXQ19GUk9OVF9GTE9PUiwgc28gYnVkZ2V0IC8gZmxvb3IgcHggaXMgdGhlIGZ1cnRoZXN0XG4gICAgLy8gdGhlIGRvbWFpbiBjYW4gbGllIHBhc3QgdGhlIGZvb3RwcmludC4gV2l0aCB0aGUgZGlmZnVzaW9uIHRyaW1tZWRcbiAgICAvLyB0byBhIGZldyB0ZXhlbHMgdGhlIHBhZCBzaHJhbmsgdG8gc2l4LCBhIGZsb29kZWQgbGFuZGluZydzIGZyb250XG4gICAgLy8gKGJ1ZGdldCB1cCB0byAxNjApIHJhbiBpbnRvIHRoZSBmaWVsZCdzIGVkZ2UsIGFuZCB0aGUgZG9tYWluIC0gYW5kXG4gICAgLy8gdGhlIGNvdmVyYWdlIGl0IGV4dGVuZHMgLSBjYW1lIG91dCBjdXQgdG8gdGhlIHJlY3Q6IGEgd2FzaCBvbiB0aGVcbiAgICAvLyByaWcgdHVybmVkIGludG8gYSBsb3BzaWRlZCBwb2x5Z29uLlxuICAgIGNvbnN0IGZyb250UmVhY2hQeCA9IE1hdGguY2VpbCh3YXRlcmNvbG9yU3ByZWFkQnVkZ2V0KHJhZGl1c1B4LCB3YXRlciwgTWF0aC5tYXgobGFuZGVkV2V0LCB3ZXRQZWFrKSkgLyBXQ19GUk9OVF9GTE9PUilcbiAgICAvLyAowqcxNy40MikgLi4ucGx1cywgd2hlbiB0aGUgd2FzaCBkcmllcyBhcyBvbmUgY29tcG9uZW50LCB0aGUgbWFyZ2luXG4gICAgLy8gdGhlIGdyb3VwIHRpZGUgbmVlZHMgYXJvdW5kIHdoYXQgY2hhbmdlZDogaXRzIGJhbmQgaXMgcmVhZCBvZmYgYW5cbiAgICAvLyBpbndhcmQgcmVsYXhhdGlvbiBvZiBgaW5TdGVwc2AgY2VsbHMgZnJvbSB0aGUgY292ZXJhZ2UncyBlZGdlIGFuZCBpdHNcbiAgICAvLyBrZXJuZWwgZ2F0aGVycyBhYm91dCBhIHJhZGl1cywgc28gYSB0ZXhlbCBjbG9zZXIgdGhhbiB0aGF0IHRvIHRoZVxuICAgIC8vIGZpZWxkJ3MgZWRnZSBjb3VsZCBiZSBtaXNzaW5nIGEgY29udG91ciB0aGF0IGxpZXMganVzdCBvdXRzaWRlIHRoZVxuICAgIC8vIGZpZWxkLiBUaGUgZHJ5IHRhcmdldCBpcyBjb3BpZWQgYmFjayBvdmVyIHRoZSBmaWVsZCBMRVNTIHRoaXMgbWFyZ2luO1xuICAgIC8vIHRoZSB3ZXQgc3RhdGUgb3ZlciBhbGwgb2YgaXQuXG4gICAgY29uc3QgZ3JvdXBEcnkgPSAhdGhpcy5jdHguYWIoKS5vcERyeVxuICAgIGNvbnN0IGRyeU1hcmdpbiA9IGdyb3VwRHJ5ID8gTWF0aC5tYXgoMiwgTWF0aC5taW4oV0NfUklNX0JBTkRfUFgsIE1hdGgucm91bmQocmFkaXVzUHggLyA1KSkpICsgMiArIE1hdGguY2VpbChyYWRpdXNQeCkgKyAyIDogMFxuICAgIGNvbnN0IHBhZCA9IE1hdGgubWF4KFdFVF9ESUZGVVNFX1JFQUNILCBmcm9udFJlYWNoUHgpICsgMSArIGRyeU1hcmdpblxuICAgIGxldCB4MCA9IE1hdGgubWF4KG1pblgsIE1hdGguZmxvb3IoYm91bmRzLm1pblgpIC0gcGFkKSwgeTAgPSBNYXRoLm1heChtaW5ZLCBNYXRoLmZsb29yKGJvdW5kcy5taW5ZKSAtIHBhZClcbiAgICBsZXQgeDEgPSBNYXRoLm1pbihtYXhYLCBNYXRoLmNlaWwoYm91bmRzLm1heFgpICsgcGFkKSwgeTEgPSBNYXRoLm1pbihtYXhZLCBNYXRoLmNlaWwoYm91bmRzLm1heFkpICsgcGFkKVxuICAgIGlmIChyYWRpdXNQeCA+PSBXQ19IQUxGX1JFU19SQURJVVNfUFggJiYgTWF0aC5tYXgoeDEgLSB4MCwgeTEgLSB5MCkgPiBXQ19IQUxGX1JFU19TUEFOX1BYKSBTID0gMlxuICAgIGNvbnN0IENBUCA9IDE1MzYgKiBTXG4gICAgaWYgKHgxIC0geDAgPiBDQVApIHsgY29uc3QgYyA9ICh4MCArIHgxKSAqIDAuNTsgeDAgPSBNYXRoLmZsb29yKGMgLSBDQVAgLyAyKTsgeDEgPSB4MCArIENBUCB9XG4gICAgaWYgKHkxIC0geTAgPiBDQVApIHsgY29uc3QgYyA9ICh5MCArIHkxKSAqIDAuNTsgeTAgPSBNYXRoLmZsb29yKGMgLSBDQVAgLyAyKTsgeTEgPSB5MCArIENBUCB9XG4gICAgaWYgKFMgPiAxKSB7XG4gICAgICAvLyBDZWxsLWFsaWduZWQ6IHRpbGUgZWRnZXMgYXJlIG11bHRpcGxlcyBvZiAxMDI0LCBzbyBhIHJlY3Qgb24gZXZlblxuICAgICAgLy8gY29vcmRpbmF0ZXMgbWFwcyBldmVyeSB0aWxlIG92ZXJsYXAgb250byB3aG9sZSBjZWxscy5cbiAgICAgIHgwID0gTWF0aC5tYXgobWluWCwgTWF0aC5mbG9vcih4MCAvIFMpICogUyk7IHkwID0gTWF0aC5tYXgobWluWSwgTWF0aC5mbG9vcih5MCAvIFMpICogUylcbiAgICAgIHgxID0gTWF0aC5taW4obWF4WCwgTWF0aC5jZWlsKHgxIC8gUykgKiBTKTsgeTEgPSBNYXRoLm1pbihtYXhZLCBNYXRoLmNlaWwoeTEgLyBTKSAqIFMpXG4gICAgICAvLyAowqcxNy40OSkgLi4uYW5kIGJhY2sgdW5kZXIgdGhlIGNhcDogdGhlIGFsaWdubWVudCBjb3VsZCBwdXNoIGEgY2FwcGVkXG4gICAgICAvLyB3aW5kb3cgb25lIGZpZWxkIHRleGVsIHBhc3QgaXQgLSAxNTM3LCB3aGljaCB0aGUgZmllbGQgcm91bmRzIHVwIHRvXG4gICAgICAvLyB0aGUgbmV4dCBzaXplLCBzbyBhIGJpZyB3YXNoJ3MgY2h1bmsgc2V0dGxlICgxNTM2KSBhbmQgaXRzIHBlbi11cFxuICAgICAgLy8gc2V0dGxlICgxNTM3KSByZS1tYWRlIHRoZSB3aG9sZSBmaWVsZCBpbiB0dXJuLCBldmVyeSBzdHJva2UuXG4gICAgICBpZiAoeDEgLSB4MCA+IENBUCkgeDEgPSB4MCArIENBUFxuICAgICAgaWYgKHkxIC0geTAgPiBDQVApIHkxID0geTAgKyBDQVBcbiAgICB9XG4gICAgY29uc3QgdyA9IHgxIC0geDAsIGggPSB5MSAtIHkwXG4gICAgaWYgKHcgPD0gMCB8fCBoIDw9IDApIHJldHVybiBudWxsXG4gICAgc2NyYXRjaC5ub3RlU3RvcmFnZUJvdW5kcyh7IG1pblg6IHgwLCBtaW5ZOiB5MCwgbWF4WDogeDEsIG1heFk6IHkxIH0pXG4gICAgY29uc3QgZmllbGQgPSB0aGlzLmN0eC5maWVsZEZvcih3IC8gUywgaCAvIFMpXG4gICAgY29uc3QgeyB3OiBwYXBlclRleFcsIGg6IHBhcGVyVGV4SCB9ID0gdGhpcy5jdHgucGFwZXJXb3JsZFNpemUoKVxuICAgIC8vICjCpzE3LjQ0KSBBdCBoYWxmIHJlc29sdXRpb24gd2hhdCBnb2VzIGhvbWUgaXMgdGhlIFNFVFRMRUQgd2FzaCBhdCBmdWxsXG4gICAgLy8gcmVzb2x1dGlvbiBwbHVzIHRoZSBmaWVsZCdzIHJlc3VsdCBsZXNzIGl0cyBvd24gc2V0dGxlZCBwYXJ0OiB0aGVcbiAgICAvLyB3YXNoIGFscmVhZHkgb24gdGhlIHBhcGVyIGtlZXBzIGl0cyBncmFpbiBhbmQgdGV4dHVyZSB0byB0aGUgcGl4ZWwsXG4gICAgLy8gYW5kIHRoZSBvcGVyYXRpb24ncyBvd24gd2V0IHBhaW50IGNvbWVzIGJhY2sgZnJvbSB0aGUgZmllbGQgd2hvbGUgLVxuICAgIC8vIHNtb290aGVkLCBhcyB3ZXQgcGFpbnQgaXMuIFJldHVybmluZyB0aGUgd2hvbGUgZGVwb3NpdCBwbHVzIHRoZVxuICAgIC8vIGZpZWxkJ3MgY2hhbmdlIGtlcHQgdGhlIG5ldyBmaWxtJ3Mgb25lLXBpeGVsIGVkZ2UsIHdoaWNoIHRoZSBoYWxmLVxuICAgIC8vIHJlc29sdXRpb24gZmllbGQgY2Fubm90IHNlZSwgYW5kIGV2ZXJ5IHBhc3Mgb2YgYSBiaWcgYnJ1c2ggbGVmdCBhXG4gICAgLy8gdGhpbiBsaW5lIHdoZXJlIGl0cyBlZGdlIGhhZCBiZWVuLiBTbzogdGhlIHNldHRsZWQgcGFydCBpbiB0aGUgZmllbGRcbiAgICAvLyAoYjAsIGNiMCkgYW5kIGF0IGZ1bGwgcmVzb2x1dGlvbiBwZXIgdGlsZSAoc25hcHNob3RzLCB0YWtlbiBhdCB0aGVcbiAgICAvLyBzdGl0Y2ggLSBhIHJ1bm5pbmcgZ2VzdHVyZSdzIG5leHQgYmF0Y2ggcmVmcmVzaGVzIHRoZSBmaWxtJ3MgYmFzZSkuXG4gICAgY29uc3QgYTAgPSBTID4gMSA/IHRoaXMuY3R4LnBvb2woKS5hY3F1aXJlKGZpZWxkLncsIGZpZWxkLmgpIDogbnVsbFxuICAgIGNvbnN0IGNhMCA9IFMgPiAxID8gdGhpcy5jdHgucG9vbCgpLmFjcXVpcmUoZmllbGQudywgZmllbGQuaCkgOiBudWxsXG4gICAgY29uc3Qgc25hcHNob3RzID0gbmV3IE1hcDxBY2N1bXVsYXRpb25CdWZmZXIsIHsgaW5rOiBBY2N1bXVsYXRpb25CdWZmZXI7IGNvbG9yOiBBY2N1bXVsYXRpb25CdWZmZXIgfCBudWxsIH0+KClcbiAgICAvLyBUaGUgc2V0dGxlJ3MgcmVjdCBpbiB0aGUgZmllbGQncyBHTCBjZWxscywgZm9yIHRoZSBpbnRlcnBvbGF0aW9uJ3MgY2xhbXAuXG4gICAgY29uc3QgZmllbGRSZWN0OiBbbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyXSA9IFswLCBmaWVsZC5oIC0gaCAvIFMsIHcgLyBTLCBmaWVsZC5oXVxuICAgIC8vIEEgd29ybGQgcmVjdCBvZiBhIHRpbGUgaW50byB0aGUgZmllbGQgKFMgPSAxOiBhIGNvcHk7IGVsc2UgdGhlIDJ4MiBtZWFuKS5cbiAgICBjb25zdCB0b0ZpZWxkID0gKHNyYzogQWNjdW11bGF0aW9uQnVmZmVyLCB0aWxlOiBQYWludFRhcmdldCwgd3gwOiBudW1iZXIsIHd5MDogbnVtYmVyLCB3eDE6IG51bWJlciwgd3kxOiBudW1iZXIsIGRzdDogQWNjdW11bGF0aW9uQnVmZmVyKTogdm9pZCA9PiB7XG4gICAgICBjb25zdCB0eCA9IHd4MCAtIHRpbGUub3JpZ2luWCwgdHkgPSB0aWxlLmJ1ZmZlci5oZWlnaHQgLSAod3kxIC0gdGlsZS5vcmlnaW5ZKVxuICAgICAgY29uc3QgZnggPSAod3gwIC0geDApIC8gUywgZnkgPSBmaWVsZC5oIC0gKHd5MSAtIHkwKSAvIFNcbiAgICAgIGlmIChTID09PSAxKSBzcmMuY29weVJlZ2lvbkludG8oZHN0LCB0eCwgdHksIGZ4LCBmeSwgd3gxIC0gd3gwLCB3eTEgLSB3eTApXG4gICAgICBlbHNlIHRoaXMuY3R4LnBhc3NlcygpLndjUmVzYW1wbGUoZHN0LCBmeCwgZnksICh3eDEgLSB3eDApIC8gUywgKHd5MSAtIHd5MCkgLyBTLCBzcmMsIHR4LCB0eSwgUywgMClcbiAgICB9XG4gICAgLy8gLi4uYW5kIGJhY2s6IFMgPSAxLCB0aGUgZmllbGQncyB2YWx1ZTsgZWxzZSBiYXNlICsgdXAobmV3IC0gb2xkKS4gVGhlXG4gICAgLy8gdGFyZ2V0IG1heSBiZSB0aGUgYmFzZTogdGhlIGRyYXcgZ29lcyB0aHJvdWdoIGEgcG9vbGVkIHRlbXBvcmFyeS5cbiAgICBjb25zdCBmcm9tRmllbGQgPSAoZk5ldzogQWNjdW11bGF0aW9uQnVmZmVyLCBmT2xkOiBBY2N1bXVsYXRpb25CdWZmZXIgfCBudWxsLCB0aWxlOiBQYWludFRhcmdldCwgd3gwOiBudW1iZXIsIHd5MDogbnVtYmVyLCB3eDE6IG51bWJlciwgd3kxOiBudW1iZXIsIHRhcmdldDogQWNjdW11bGF0aW9uQnVmZmVyLCBiYXNlOiBBY2N1bXVsYXRpb25CdWZmZXIpOiB2b2lkID0+IHtcbiAgICAgIGNvbnN0IHR4ID0gd3gwIC0gdGlsZS5vcmlnaW5YLCB0eSA9IHRpbGUuYnVmZmVyLmhlaWdodCAtICh3eTEgLSB0aWxlLm9yaWdpblkpXG4gICAgICBjb25zdCBmeCA9ICh3eDAgLSB4MCkgLyBTLCBmeSA9IGZpZWxkLmggLSAod3kxIC0geTApIC8gU1xuICAgICAgaWYgKFMgPT09IDEgfHwgIWZPbGQpIHsgZk5ldy5jb3B5UmVnaW9uSW50byh0YXJnZXQsIGZ4LCBmeSwgdHgsIHR5LCB3eDEgLSB3eDAsIHd5MSAtIHd5MCk7IHJldHVybiB9XG4gICAgICBjb25zdCB0bXAgPSB0aGlzLmN0eC5wb29sKCkuYWNxdWlyZSh0aWxlLmJ1ZmZlci53aWR0aCwgdGlsZS5idWZmZXIuaGVpZ2h0KVxuICAgICAgdGhpcy5jdHgucGFzc2VzKCkud2NSZXNhbXBsZSh0bXAsIHR4LCB0eSwgd3gxIC0gd3gwLCB3eTEgLSB3eTAsIGZOZXcsIGZ4LCBmeSwgMSAvIFMsIDEsIGZPbGQsIGJhc2UsIGZpZWxkUmVjdClcbiAgICAgIHRtcC5jb3B5UmVnaW9uSW50byh0YXJnZXQsIHR4LCB0eSwgdHgsIHR5LCB3eDEgLSB3eDAsIHd5MSAtIHd5MClcbiAgICAgIHRoaXMuY3R4LnBvb2woKS5yZWxlYXNlKHRtcClcbiAgICB9XG5cbiAgICAvLyBFdmVyeSB0aWxlJ3Mgb3ZlcmxhcCB3aXRoIHRoZSByZWN0LCBhbmQgdGhlIHNldHRsZWQgcmVjb3JkcyB0aGUgdGlsZXNcbiAgICAvLyBzdGlsbCBsYWNrIOKAlCBhY3F1aXJlZCBub3cgc28gdGhlIHN0ZXBzIGJlbG93IGNhbiBhc3N1bWUgdGhlbS5cbiAgICBjb25zdCBvdmVybGFwczogQXJyYXk8eyB0aWxlOiBQYWludFRhcmdldDsgb3gwOiBudW1iZXI7IG95MDogbnVtYmVyOyBveDE6IG51bWJlcjsgb3kxOiBudW1iZXIgfT4gPSBbXVxuICAgIGZvciAoY29uc3QgdGlsZSBvZiB0aWxlcykge1xuICAgICAgY29uc3QgZW50cnkgPSBzY3JhdGNoLnBlZWsodGlsZS5idWZmZXIpXG4gICAgICBpZiAoIWVudHJ5Py5pbmtMb2FkKSBjb250aW51ZVxuICAgICAgLy8gKMKnMTcuNDQpIFRoZSBzZXR0bGVkIHJlY29yZHMgYXJlIG9ubHkgbmVlZGVkIHdpdGhvdXQgdGhlIGZpbG06IHdpdGhcbiAgICAgIC8vIGl0LCB0aGUgZmlsbSdzIGJhc2UgKGlua0Jhc2UvY29sb3JCYXNlLCByZWZyZXNoZWQgb24gdGhlIGdlc3R1cmUnc1xuICAgICAgLy8gZmlyc3QgYmF0Y2gpIElTIHRoZSB3YXNoIGFzIGl0IHN0b29kIGJlZm9yZSB0aGUgb3BlcmF0aW9uLCBhbmQgYVxuICAgICAgLy8gc2Vjb25kIHBhaXIgb2YgdGlsZS1zaXplZCB0ZXh0dXJlcyBwZXIgdGlsZSBob2xkaW5nIHRoZSBzYW1lIHRoaW5nXG4gICAgICAvLyB3YXMgYSBxdWFydGVyIG9mIHRoZSBnaWdhYnl0ZSBvZiBzY3JhdGNoIHRoZSB0YWJsZXQgY2FycmllZC5cbiAgICAgIGlmICghdGhpcy5jdHgubWlubWF4RXh0KCkgJiYgIWVudHJ5Lmlua1NldHRsZWQpIHtcbiAgICAgICAgZW50cnkuaW5rU2V0dGxlZCA9IHRoaXMuY3R4LnBvb2woKS5hY3F1aXJlKHRpbGUuYnVmZmVyLndpZHRoLCB0aWxlLmJ1ZmZlci5oZWlnaHQpXG4gICAgICAgIGVudHJ5Lmlua1NldHRsZWQuY2xlYXIoKVxuICAgICAgfVxuICAgICAgaWYgKCF0aGlzLmN0eC5taW5tYXhFeHQoKSAmJiBlbnRyeS5pbmtDb2xvciAmJiAhZW50cnkuY29sb3JTZXR0bGVkKSB7XG4gICAgICAgIGVudHJ5LmNvbG9yU2V0dGxlZCA9IHRoaXMuY3R4LnBvb2woKS5hY3F1aXJlKHRpbGUuYnVmZmVyLndpZHRoLCB0aWxlLmJ1ZmZlci5oZWlnaHQpXG4gICAgICAgIGVudHJ5LmNvbG9yU2V0dGxlZC5jbGVhcigpXG4gICAgICB9XG4gICAgICBjb25zdCBveDAgPSBNYXRoLm1heCh4MCwgdGlsZS5vcmlnaW5YKSwgb3kwID0gTWF0aC5tYXgoeTAsIHRpbGUub3JpZ2luWSlcbiAgICAgIGNvbnN0IG94MSA9IE1hdGgubWluKHgxLCB0aWxlLm9yaWdpblggKyB0aWxlLmJ1ZmZlci53aWR0aCksIG95MSA9IE1hdGgubWluKHkxLCB0aWxlLm9yaWdpblkgKyB0aWxlLmJ1ZmZlci5oZWlnaHQpXG4gICAgICBpZiAob3gxIDw9IG94MCB8fCBveTEgPD0gb3kwKSBjb250aW51ZVxuICAgICAgb3ZlcmxhcHMucHVzaCh7IHRpbGUsIG94MCwgb3kwLCBveDEsIG95MSB9KVxuICAgIH1cbiAgICBpZiAoIW92ZXJsYXBzLmxlbmd0aCkgcmV0dXJuIG51bGxcblxuICAgIGNvbnN0IGZvcmVpZ24gPSBmb3JlaWduV2F0ZXJTdGVuY2lsKHNjcmF0Y2guZm9yZWlnblNvdXJjZXMgPz8gW10sIHNjcmF0Y2gud2V0Q29udGFjdHMsXG4gICAgICB7IHg6IHgwLCB5OiB5MCwgdzogZmllbGQudyAqIFMsIGg6IGZpZWxkLmggKiBTIH0pXG4gICAgY29uc3QgY29udGFjdHMgPSBicnVzaERyYWdDb250YWN0cyhzY3JhdGNoLmJydXNoVHJhdmVsLCB7IHg6IHgwLCB5OiB5MCwgdzogZmllbGQudyAqIFMsIGg6IGZpZWxkLmggKiBTIH0pXG4gICAgY29uc3QgZmxvdyA9IGNvbnRhY3RzWzBdPy5maWVsZFxuICAgIGxldCBmbG93VGV4dHVyZTogV2ViR0xUZXh0dXJlIHwgbnVsbCA9IG51bGxcbiAgICBsZXQgZm9yZWlnblRleHR1cmU6IFdlYkdMVGV4dHVyZSB8IG51bGwgPSBudWxsXG4gICAgY29uc3Qgb3BzOiBBcnJheTwoKSA9PiB2b2lkPiA9IFtdXG4gICAgaWYgKGZsb3cpIG9wcy5wdXNoKCgpID0+IHtcbiAgICAgIHRoaXMuX2JydXNoRmxvd1RleCA/Pz0gZ2wuY3JlYXRlVGV4dHVyZSgpXG4gICAgICBmbG93VGV4dHVyZSA9IHRoaXMuX2JydXNoRmxvd1RleFxuICAgICAgZ2wuYWN0aXZlVGV4dHVyZShnbC5URVhUVVJFMClcbiAgICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIGZsb3dUZXh0dXJlKVxuICAgICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX01JTl9GSUxURVIsIGdsLkxJTkVBUilcbiAgICAgIGdsLnRleFBhcmFtZXRlcmkoZ2wuVEVYVFVSRV8yRCwgZ2wuVEVYVFVSRV9NQUdfRklMVEVSLCBnbC5MSU5FQVIpXG4gICAgICBnbC50ZXhQYXJhbWV0ZXJpKGdsLlRFWFRVUkVfMkQsIGdsLlRFWFRVUkVfV1JBUF9TLCBnbC5DTEFNUF9UT19FREdFKVxuICAgICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX1dSQVBfVCwgZ2wuQ0xBTVBfVE9fRURHRSlcbiAgICAgIGdsLnRleEltYWdlMkQoZ2wuVEVYVFVSRV8yRCwgMCwgZ2wuUkdCQSwgZmxvdy53aWR0aCwgZmxvdy5oZWlnaHQsIDAsIGdsLlJHQkEsIGdsLlVOU0lHTkVEX0JZVEUsIGZsb3cucGl4ZWxzKVxuICAgIH0pXG4gICAgaWYgKGZvcmVpZ24pIG9wcy5wdXNoKCgpID0+IHtcbiAgICAgIHRoaXMuX2ZvcmVpZ25XYXRlclRleCA/Pz0gZ2wuY3JlYXRlVGV4dHVyZSgpXG4gICAgICBmb3JlaWduVGV4dHVyZSA9IHRoaXMuX2ZvcmVpZ25XYXRlclRleFxuICAgICAgZ2wuYWN0aXZlVGV4dHVyZShnbC5URVhUVVJFMClcbiAgICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIGZvcmVpZ25UZXh0dXJlKVxuICAgICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX01JTl9GSUxURVIsIGdsLkxJTkVBUilcbiAgICAgIGdsLnRleFBhcmFtZXRlcmkoZ2wuVEVYVFVSRV8yRCwgZ2wuVEVYVFVSRV9NQUdfRklMVEVSLCBnbC5MSU5FQVIpXG4gICAgICBnbC50ZXhQYXJhbWV0ZXJpKGdsLlRFWFRVUkVfMkQsIGdsLlRFWFRVUkVfV1JBUF9TLCBnbC5DTEFNUF9UT19FREdFKVxuICAgICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX1dSQVBfVCwgZ2wuQ0xBTVBfVE9fRURHRSlcbiAgICAgIGdsLnBpeGVsU3RvcmVpKGdsLlVOUEFDS19BTElHTk1FTlQsIDEpXG4gICAgICBnbC50ZXhJbWFnZTJEKGdsLlRFWFRVUkVfMkQsIDAsIGdsLkxVTUlOQU5DRSwgZm9yZWlnbi53aWR0aCwgZm9yZWlnbi5oZWlnaHQsIDAsIGdsLkxVTUlOQU5DRSwgZ2wuVU5TSUdORURfQllURSwgZm9yZWlnbi5waXhlbHMpXG4gICAgICBnbC5waXhlbFN0b3JlaShnbC5VTlBBQ0tfQUxJR05NRU5ULCA0KVxuICAgIH0pXG4gICAgLy8gKMKnMTcuNDQpIFRoZSBnZXN0dXJlIHdob3NlIGZpbG0gdGhpcyBzZXR0bGUgY29uc3VtZXMsIGZpeGVkIG5vdzogYVxuICAgIC8vIGNodW5rJ3Mgc2V0dGxlIG1heSBsYW5kIGFmdGVyIHRoZSBuZXh0IGNodW5rJ3MgZmlsbSBoYXMgYmVndW4uXG4gICAgY29uc3QgZ2VzdHVyZSA9IHNjcmF0Y2guZ2VzdHVyZVxuICAgIC8vIFN0aXRjaDogZXZlcnkgdGlsZSdzIG92ZXJsYXAgd2l0aCB0aGUgcmVjdCwgdG9wLWRvd24gd29ybGQg4oaSIGJvdHRvbS11cFxuICAgIC8vIEdMIG9uIGJvdGggc2lkZXMsIGV4YWN0bHkgYXMgU211ZGdlUGFpbnRlci5nYXRoZXJQYXRjaCBkb2VzIGl0LiBgYWAgdGFrZXMgdGhlXG4gICAgLy8gZGVwb3NpdCwgYGJgIHdoYXQgd2FzIHNldHRsZWQsIGBjb3ZlcmFnZWAgdGhlIHNpbGhvdWV0dGUuXG4gICAgb3BzLnB1c2goKCkgPT4ge1xuICAgICAgZmllbGQuYS5jbGVhcigpXG4gICAgICBmaWVsZC5iLmNsZWFyKClcbiAgICAgIGZpZWxkLmNvdmVyYWdlLmNsZWFyKClcbiAgICAgIGZpZWxkLmNhLmNsZWFyKClcbiAgICAgIGZpZWxkLmNiLmNsZWFyKClcbiAgICAgIGZvciAoY29uc3QgeyB0aWxlLCBveDAsIG95MCwgb3gxLCBveTEgfSBvZiBvdmVybGFwcykge1xuICAgICAgICBjb25zdCBlbnRyeSA9IHNjcmF0Y2gucGVlayh0aWxlLmJ1ZmZlcilcbiAgICAgICAgaWYgKCFlbnRyeT8uaW5rTG9hZCkgY29udGludWVcbiAgICAgICAgLy8gVGhlIHNldHRsZWQgd2FzaDogdGhlIGZpbG0ncyBiYXNlIHdoZXJlIHRoaXMgb3BlcmF0aW9uJ3MgZ2VzdHVyZVxuICAgICAgICAvLyBsYWlkIHBhaW50IG9uIHRoZSB0aWxlLCB0aGUgZGVwb3NpdCBpdHNlbGYgd2hlcmUgaXQgZGlkIG5vdCAobm8gbmV3XG4gICAgICAgIC8vIHBhaW50IHRoZXJlLCBub3RoaW5nIG1vYmlsZSksIHRoZSBvbGQgcmVjb3JkIHdpdGhvdXQgYSBmaWxtLlxuICAgICAgICBjb25zdCBzZXR0bGVkSW5rID0gKGVudHJ5LmZpbG1HZXN0dXJlID09PSBnZXN0dXJlID8gZW50cnkuaW5rQmFzZSA6IG51bGwpID8/IGVudHJ5Lmlua1NldHRsZWQgPz8gZW50cnkuaW5rTG9hZFxuICAgICAgICB0b0ZpZWxkKGVudHJ5Lmlua0xvYWQsIHRpbGUsIG94MCwgb3kwLCBveDEsIG95MSwgZmllbGQuYSlcbiAgICAgICAgdG9GaWVsZChzZXR0bGVkSW5rLCB0aWxlLCBveDAsIG95MCwgb3gxLCBveTEsIGZpZWxkLmIpXG4gICAgICAgIGlmIChTID4gMSkge1xuICAgICAgICAgIGNvbnN0IHR4ID0gb3gwIC0gdGlsZS5vcmlnaW5YLCB0eSA9IHRpbGUuYnVmZmVyLmhlaWdodCAtIChveTEgLSB0aWxlLm9yaWdpblkpXG4gICAgICAgICAgY29uc3QgaW5rID0gdGhpcy5jdHgucG9vbCgpLmFjcXVpcmUodGlsZS5idWZmZXIud2lkdGgsIHRpbGUuYnVmZmVyLmhlaWdodClcbiAgICAgICAgICBzZXR0bGVkSW5rLmNvcHlSZWdpb25JbnRvKGluaywgdHgsIHR5LCB0eCwgdHksIG94MSAtIG94MCwgb3kxIC0gb3kwKVxuICAgICAgICAgIGxldCBjb2xvcjogQWNjdW11bGF0aW9uQnVmZmVyIHwgbnVsbCA9IG51bGxcbiAgICAgICAgICBpZiAoZW50cnkuaW5rQ29sb3IpIHtcbiAgICAgICAgICAgIGNvbnN0IHNjID0gKGVudHJ5LmZpbG1HZXN0dXJlID09PSBnZXN0dXJlID8gZW50cnkuY29sb3JCYXNlIDogbnVsbCkgPz8gZW50cnkuY29sb3JTZXR0bGVkID8/IGVudHJ5Lmlua0NvbG9yXG4gICAgICAgICAgICBjb2xvciA9IHRoaXMuY3R4LnBvb2woKS5hY3F1aXJlKHRpbGUuYnVmZmVyLndpZHRoLCB0aWxlLmJ1ZmZlci5oZWlnaHQpXG4gICAgICAgICAgICBzYy5jb3B5UmVnaW9uSW50byhjb2xvciwgdHgsIHR5LCB0eCwgdHksIG94MSAtIG94MCwgb3kxIC0gb3kwKVxuICAgICAgICAgIH1cbiAgICAgICAgICBzbmFwc2hvdHMuc2V0KHRpbGUuYnVmZmVyLCB7IGluaywgY29sb3IgfSlcbiAgICAgICAgfVxuICAgICAgICB0b0ZpZWxkKGVudHJ5LmNvdmVyYWdlLCB0aWxlLCBveDAsIG95MCwgb3gxLCBveTEsIGZpZWxkLmNvdmVyYWdlKVxuICAgICAgICBpZiAoZW50cnkuaW5rQ29sb3IpIHtcbiAgICAgICAgICBjb25zdCBzZXR0bGVkQ29sb3IgPSAoZW50cnkuZmlsbUdlc3R1cmUgPT09IGdlc3R1cmUgPyBlbnRyeS5jb2xvckJhc2UgOiBudWxsKSA/PyBlbnRyeS5jb2xvclNldHRsZWQgPz8gZW50cnkuaW5rQ29sb3JcbiAgICAgICAgICB0b0ZpZWxkKGVudHJ5Lmlua0NvbG9yLCB0aWxlLCBveDAsIG95MCwgb3gxLCBveTEsIGZpZWxkLmNhKVxuICAgICAgICAgIHRvRmllbGQoc2V0dGxlZENvbG9yLCB0aWxlLCBveDAsIG95MCwgb3gxLCBveTEsIGZpZWxkLmNiKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoYTApIGZpZWxkLmIuY29weVRvKGEwKVxuICAgICAgaWYgKGNhMCkgZmllbGQuY2IuY29weVRvKGNhMClcbiAgICB9KVxuXG4gICAgY29uc3QgZmllbGRPcCA9IChvdXQ6IEFjY3VtdWxhdGlvbkJ1ZmZlciwgYTogQWNjdW11bGF0aW9uQnVmZmVyLCBiOiBBY2N1bXVsYXRpb25CdWZmZXIsIG1vZGU6IDAgfCAxLCBrOiBudW1iZXIpOiB2b2lkID0+XG4gICAgICB0aGlzLmN0eC5wYXNzZXMoKS5maWVsZE9wKG91dCwgYSwgYiwgbW9kZSwgaylcbiAgICBjb25zdCBkaWZmdXNlU3RlcCA9IChzcmM6IEFjY3VtdWxhdGlvbkJ1ZmZlciwgZHN0OiBBY2N1bXVsYXRpb25CdWZmZXIsIHJhZGl1czogbnVtYmVyLCBrbmlnaHQ6IGJvb2xlYW4sIGdhdGU6IEFjY3VtdWxhdGlvbkJ1ZmZlciA9IGZpZWxkLmNvdmVyYWdlLCBkZW5zaXR5OiBBY2N1bXVsYXRpb25CdWZmZXIgPSBzcmMpOiB2b2lkID0+IHtcbiAgICAgIHRoaXMuY3R4LnBhc3NlcygpLmRpZmZ1c2VTdGVwKGZpZWxkLCB4MCwgeTAsIFMsIHBhcGVyVGV4VywgcGFwZXJUZXhILCBzcmMsIGRzdCwgcmFkaXVzLCBrbmlnaHQsIGdhdGUsIGRlbnNpdHkpXG4gICAgfVxuICAgIC8vICjCpzE3LjIzKSBUaGUgb3BlcmF0aW9uJ3MgZm9vdHByaW50IOKAlCB3aGVyZSBpdHMgb3duIGRlcG9zaXQgbGllcywgd2hpY2hcbiAgICAvLyBpcyB0aGUgbW9iaWxlIGZpZWxkIGJlZm9yZSBhbnl0aGluZyBtb3ZlcyDigJQgYW5kIHRoZSBkb21lIG92ZXIgaXQ6IHRoZVxuICAgIC8vIG1hc2sgYmx1cnJlZCBhdCBmYWxsaW5nIHN0cmlkZXMsIDEgZGVlcCBpbnNpZGUsIDAuNSBvbiB0aGUgZWRnZSwgMFxuICAgIC8vIG91dHNpZGUuIFRoZW4gdGhlIGJhbmQganVzdCBpbnNpZGUgdGhlIGVkZ2UsIGJsdXJyZWQgYnkgdGhlIHJpbSdzXG4gICAgLy8ga2VybmVsLCBrZXB0IGluIGBtYXNrYCBmb3IgYm90aCByaW1zIGJlbG93LiBPbmNlIHBlciBzZXR0bGUuXG4gICAgLy8gKMKnMTcuMjQpIFRoZSB3YXRlciBmcm9udCwgb25jZSBwZXIgc2V0dGxlOiB0aGUgb3BlcmF0aW9uJ3MgZm9vdHByaW50XG4gICAgLy8gKGl0cyBtb2JpbGUgZGVwb3NpdCBiZWZvcmUgYW55dGhpbmcgbW92ZXMpIHNlZWRzIGEgY29zdCBmaWVsZCwgdGhlXG4gICAgLy8gcmVsYXhhdGlvbiBydW5zIGl0IG91dCBvdmVyIHRoZSBwYXBlciwgYW5kIHRoZSB0ZXhlbHMgd2l0aGluIHRoZVxuICAgIC8vIGJ1ZGdldCBhcmUgdGhlIGRvbWFpbiB0aGUgd2F0ZXIgd2V0cy4gRnJvbSB0aGUgY29zdDogdGhlIGJhbmQgdGV4dHVyZVxuICAgIC8vIChyIHRoZSBsYXN0IGB3aWR0aGAgY2VsbHMgaW5zaWRlIHRoZSBmcm9udCwgZyB0aGUgZG9tYWluKSwgYW5kIHRoZVxuICAgIC8vIHN0aXRjaGVkIGNvdmVyYWdlIGV4dGVuZGVkIG92ZXIgdGhlIGRvbWFpbiwgc28gdGhlIHNpbGhvdWV0dGUgYW5kIHRoZVxuICAgIC8vIGRpZmZ1c2lvbidzIGdhdGUgcmVhY2ggYXMgZmFyIGFzIHRoZSB3YXRlciBkaWQuIFRoZW4gdGhlIGJhbmRcbiAgICAvLyBnYXRoZXJlZCBieSB0aGUgcmltJ3Mga2VybmVsLCBrZXB0IGluIGBtYXNrYC5cbiAgICAvLyAowqcxNy4yOSkgLi4uYnkgdGhlIFdFVFRFU1QgcGFwZXIgdGhlIG1hcmsgcmFuIG92ZXIsIG5vdCB3aGVyZSBpdFxuICAgIC8vIGxhbmRlZDogSWx5YSdzIHNlcmllcyA1IGxheXMgdGhlIHNlY29uZCBzdHJva2UgZnJvbSBkcnkgcGFwZXIgaW50b1xuICAgIC8vIHRoZSBmaXJzdCwgYW5kIGl0cyBmcm9udCBoYXMgdG8gcnVuIHdoZXJlIHRoZSBmaXJzdCBzdHJva2UgaXMuXG4gICAgY29uc3QgcnVuV2V0ID0gTWF0aC5tYXgobGFuZGVkV2V0LCB3ZXRQZWFrKVxuICAgIC8vICjCpzE3LjQ0KSBJbiB0aGUgZmllbGQncyBjZWxscyBmcm9tIGhlcmUgb246IGJ1ZGdldCBhbmQgcmFkaXVzIG92ZXIgUy5cbiAgICBjb25zdCBidWRnZXRQeCA9IHdhdGVyY29sb3JTcHJlYWRCdWRnZXQocmFkaXVzUHgsIHdhdGVyLCBydW5XZXQpIC8gU1xuICAgIGNvbnN0IHJhZGl1c0MgPSByYWRpdXNQeCAvIFNcbiAgICBjb25zdCBjb3N0TWF4ID0gYnVkZ2V0UHggKyA0XG4gICAgLy8gKMKnMTcuMjcpIOKApnBsdXMgdGhlIG1hcmsncyByYWRpdXM6IHRoZSBwdWRkbGUncyBmcm9udCBzdGFydHMgaW5zaWRlXG4gICAgLy8gdGhlIGZvb3RwcmludCBhbmQgaGFzIHRvIGNyb3NzIGl0IGJlZm9yZSBpdCBydW5zIGl0cyBidWRnZXQgaW50byB0aGVcbiAgICAvLyBmaWxtLiBBdCBuaW5lIHN0ZXBzIGZvciBhIDYgcHggYnVkZ2V0IGl0IHN0b3BwZWQgYSB0aGlyZCBvZiB0aGUgd2F5XG4gICAgLy8gYWNyb3NzIGEgMjAgcHggcHVkZGxlIGFuZCB0aGUgYmFja3J1biBuZXZlciByZWFjaGVkIHRoZSBmaWxtLlxuICAgIGNvbnN0IGZyb250U3RlcHMgPSB3YXRlcmNvbG9yRnJvbnRTdGVwcyhidWRnZXRQeCwgcmFkaXVzQywgcnVuV2V0KVxuICAgIC8vIEEgZmlmdGggb2YgdGhlIHJhZGl1cyAodGhlIHBob3RvJ3MgcmluZzogRldITSAwLjIgUl9mcm9udCksIGNhcHBlZDpcbiAgICAvLyB0aGUgbWFzcyBzaXRzIGF0IHRoZSBmcm9udCwgdGhlIHRhaWwgYmVoaW5kIGl0IGlzIHdoYXQgdGhlIHZhbGxleXNcbiAgICAvLyBjYXJyeSwgc28gdGhlIGJhbmQncyBkZXB0aCBpcyB3aGF0IHN1cnZpdmVzIGEgYmx1ciwgbm90IGl0cyBkYXJrbmVzcy5cbiAgICAvLyAowqcxNy40NCkgVGhlIGJhbmQncyB3aWR0aCBpcyBhIFdPUkxEIHdpZHRoIChhIGZpZnRoIG9mIHRoZSByYWRpdXMsIGF0XG4gICAgLy8gbW9zdCBXQ19SSU1fQkFORF9QWCBweCksIGluIGNlbGxzOiBjYXBwZWQgaW4gY2VsbHMsIGEgaGFsZi1yZXNvbHV0aW9uXG4gICAgLy8gYmFuZCB3YXMgdHdpY2UgYXMgd2lkZSwgdGhlIHRpZGUgdG9vayB0d2ljZSB0aGUgc2hhcmUsIGFuZCBldmVyeSBiaWdcbiAgICAvLyBtYXJrIGRyaWVkIHBhbGVyIHdpdGggYSBoZWF2aWVyIHJpbS5cbiAgICBjb25zdCB3aWR0aCA9IE1hdGgubWF4KDEsIE1hdGgucm91bmQoTWF0aC5tYXgoMiwgTWF0aC5taW4oV0NfUklNX0JBTkRfUFgsIE1hdGgucm91bmQocmFkaXVzUHggLyA1KSkpIC8gUykpXG4gICAgLy8gVGhlIGJhbmQgaXMgdGhlIGxhc3QgYHdpZHRoYCBjZWxscyBpbnNpZGUgdGhlIGZyb250LCBtZWFzdXJlZCBieSBhXG4gICAgLy8gc2Vjb25kIHJlbGF4YXRpb24gcnVuIElOV0FSRCBmcm9tIGV2ZXJ5dGhpbmcgcGFzdCB0aGUgYnVkZ2V0LCBvdmVyIHRoZVxuICAgIC8vIHNhbWUgcGFwZXI6IGEgYmFuZCBmcm9tIHRoZSBvdXR3YXJkIGNvc3QgYWxvbmUgY2Fubm90IHJlYWNoIGludG8gdGhlXG4gICAgLy8gZm9vdHByaW50LCB3aG9zZSBjb3N0IGlzIHplcm8gdGhyb3VnaG91dC4gSXRzIG93biBzY2FsZSwgc28gdGhlIDggYml0c1xuICAgIC8vIHJlc29sdmUgYSBjZWxsLlxuICAgIGNvbnN0IGNvc3RNYXhJbiA9IHdpZHRoICsgM1xuICAgIGNvbnN0IGluU3RlcHMgPSB3aWR0aCArIDJcbiAgICBjb25zdCBtZXJnZSA9IHdhdGVyY29sb3JQdWRkbGVNZXJnZSh3ZXRQZWFrKVxuICAgIC8vICjCpzE3LjI2KSBBIG1hcmsgbGFpZCBvdmVyIGFuIGVhcmxpZXIgbWFyayB0aGF0IHdhcyBzdGlsbCBkYW1wIGhhcyBub1xuICAgIC8vIGRyeSBwYXBlciB0byBzdG9wIGF0IHRoZXJlOiBpdHMgb3duIHRpZGVsaW5lIHN0YW5kcyBkb3duIG92ZXIgaXQgKHRoZVxuICAgIC8vIGJsb29tIHJpbmcgaXMgdGhlIGVkZ2UpLCBmdWxseSBvbiB3ZXQuXG4gICAgY29uc3QgZGFtcCA9IHdhdGVyY29sb3JEYW1wT3Zlcih3ZXRQZWFrKVxuICAgIC8vIOKApmFuZCBhIHJpbSB3YW50cyBmcmVlIHdhdGVyIHRvIGRyeSBvdXQgb2Y6IG5vbmUgZnJvbSBhIGJydXNoIHRoYXRcbiAgICAvLyBjYXJyaWVkIG5vbmUuXG4gICAgY29uc3QgdGlkZVdhdGVyID0gTWF0aC5taW4oMSwgc3RhbmRpbmcgLyBXQ19USURFX1NUQU5ESU5HX0ZVTEwpXG4gICAgLy8gKMKnMTcuMjcpIER5YWRpYyBzdHJpZGVzLCAxLCAyLCA0LCA44oCmIHVwIHRvIHRoZSBtYXJrJ3MgcmFkaXVzOiBhIDN4M1xuICAgIC8vIGJpbm9taWFsIGF0IGVhY2ggaXMgdGhlIMOgLXRyb3VzIEItc3BsaW5lLCBhIHNtb290aCBrZXJuZWwgb2YgcmVhY2hcbiAgICAvLyB+cmFkaXVzLiBUaGUgb2xkIHIvMiwgci80LCByLzgsIDEgd2FzIHRoZSBzYW1lIHJlYWNoIHdpdGggYSBidW1weVxuICAgIC8vIGtlcm5lbCwgYW5kIG9uIGEgYmFuZCBvbmUgb3IgdHdvIHRleGVscyB3aWRlIHRoZSBidW1wcyBvZiB0aGVcbiAgICAvLyBnYXRoZXJlZCBiYW5kIGRpdmlkZWQgdGhlIG1vdmVkIHBhaW50IGludG8gRE9UUyBhbG9uZyB0aGUgbGluZS5cbiAgICBjb25zdCBnYXRoZXI6IEFycmF5PFtudW1iZXIsIG51bWJlcl0+ID0gW11cbiAgICBmb3IgKGxldCBzdCA9IDE7IHN0IDw9IE1hdGgubWF4KDEsIHJhZGl1c0MgLyAyKSAmJiBnYXRoZXIubGVuZ3RoIDwgNjsgc3QgKj0gMikgZ2F0aGVyLnB1c2goW3N0LCBzdF0pXG4gICAgLy8gKHMxNy40MCkgVGhlIGRyeSBjb3N0IG5ldmVyIGxlc3MgdGhhbiBhIHNoYXJlIG9mIHRoZSBidWRnZXQ6IGEgc3Ryb2tlXG4gICAgLy8gdGhhdCBsYW5kcyBpbiBhIHB1ZGRsZSBjYXJyaWVzIHRoZSBwdWRkbGUncyBidWRnZXQgKHVwIHRvIDE2MCkgb3V0XG4gICAgLy8gb250byBkcnkgcGFwZXIsIGFuZCBhdCBhIGZsYXQgMjQgYSBjZWxsIGl0cyBmcm9udCByYW4gZm91ciBjZWxscyBwYXN0XG4gICAgLy8gdGhlIGJydXNoIHRoZXJlIC0gSWx5YSdzIFwi0YDQstCw0L3Ri9C5INC60YDQsNC5INCy0L3QtSDQu9GD0LbQuFwiLiBBdCBoYWxmIHRoZSBidWRnZXRcbiAgICAvLyBhIGNlbGwsIHRoZSBydW4gb24gZHJ5IHBhcGVyIGlzIHR3byBjZWxscyB3aGF0ZXZlciB0aGUgYnVkZ2V0LlxuICAgIGNvbnN0IGRyeUNvc3QgPSBNYXRoLm1heChXQ19GUk9OVF9EUllfQ09TVCwgYnVkZ2V0UHggKiBXQ19GUk9OVF9EUllfU0hBUkUpXG4gICAgY29uc3QgZnJvbnRTdGVwID0gKHNyYzogQWNjdW11bGF0aW9uQnVmZmVyLCBkc3Q6IEFjY3VtdWxhdGlvbkJ1ZmZlciwgbWF4OiBudW1iZXIsIGNsaW1iID0gV0NfRlJPTlRfQ0xJTUIsIGZsb29yID0gV0NfRlJPTlRfRkxPT1IsIHN0cmlkZSA9IDEpOiB2b2lkID0+XG4gICAgICB0aGlzLmN0eC5wYXNzZXMoKS53YXRlckZyb250U3RlcChmaWVsZCwgeDAsIHkwLCBkcnlDb3N0LCBzcmMsIGRzdCwgbWF4LCBjbGltYiwgZmxvb3IsIHN0cmlkZSwgUywgZm9yZWlnblRleHR1cmUpXG4gICAgLy8gVGhlIGZyb250IGFzIGVudHJpZXMgb2YgYG9wc2AsIGEgZmV3IHJlbGF4YXRpb24gc3RlcHMgcGVyIGVudHJ5IHNvIG5vXG4gICAgLy8gZnJhbWUgcnVucyB0aGUgd2hvbGUgZmllbGQgdGhpcnR5IHRpbWVzOiB0aGUgb3V0d2FyZCBjb3N0IGZyb20gdGhlXG4gICAgLy8gZm9vdHByaW50IGludG8gYHByZXNzdXJlYCwgdGhlIGlud2FyZCBjb3N0IGZyb20gcGFzdC10aGUtYnVkZ2V0IGludG9cbiAgICAvLyBgbWFza2AsIHRoZW4gdGhlIGJhbmQgdGV4dHVyZSwgdGhlIGNvdmVyYWdlIGV4dGVuZGVkIG92ZXIgdGhlIGRvbWFpbixcbiAgICAvLyBhbmQgdGhlIGJhbmQgZ2F0aGVyZWQgaW50byBgbWFza2AgZm9yIHRoZSByaW1zLlxuICAgIGNvbnN0IGZyb250T3BzID0gKG1vYmlsZTogQWNjdW11bGF0aW9uQnVmZmVyLCB0bXA6IEFjY3VtdWxhdGlvbkJ1ZmZlcik6IHZvaWQgPT4ge1xuICAgICAgY29uc3QgcHAgPSB7IHNyYzogZmllbGQucHJlc3N1cmUsIGRzdDogdG1wIH1cbiAgICAgIGNvbnN0IHJ1biA9IChzdGVwczogbnVtYmVyLCBtYXg6IG51bWJlciwgaG9tZTogQWNjdW11bGF0aW9uQnVmZmVyLCBjbGltYjogbnVtYmVyLCBmbG9vcjogbnVtYmVyLCBzdHJpZGVzPzogcmVhZG9ubHkgbnVtYmVyW10pOiB2b2lkID0+IHtcbiAgICAgICAgY29uc3QgbGlzdCA9IHN0cmlkZXMgPz8gQXJyYXkuZnJvbSh7IGxlbmd0aDogc3RlcHMgfSwgKCkgPT4gMSlcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSArPSA0KSB7XG4gICAgICAgICAgY29uc3QgY2h1bmsgPSBsaXN0LnNsaWNlKGksIGkgKyA0KVxuICAgICAgICAgIGNvbnN0IGxhc3QgPSBpICsgY2h1bmsubGVuZ3RoID49IGxpc3QubGVuZ3RoXG4gICAgICAgICAgb3BzLnB1c2goKCkgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCBzdCBvZiBjaHVuaykgeyBmcm9udFN0ZXAocHAuc3JjLCBwcC5kc3QsIG1heCwgY2xpbWIsIGZsb29yLCBzdCk7IGNvbnN0IHQgPSBwcC5zcmM7IHBwLnNyYyA9IHBwLmRzdDsgcHAuZHN0ID0gdCB9XG4gICAgICAgICAgICBpZiAobGFzdCAmJiBwcC5zcmMgIT09IGhvbWUpIHRoaXMuY3R4LnBhc3NlcygpLmZpZWxkT3AoaG9tZSwgcHAuc3JjLCBwcC5zcmMsIDEsIDApXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgb3BzLnB1c2goKCkgPT4geyB0aGlzLmN0eC5wYXNzZXMoKS5maWVsZE9wKGZpZWxkLnByZXNzdXJlLCBtb2JpbGUsIGZpZWxkLmNvdmVyYWdlLCAxMCwgMC4wMDMsIHsgYmFuZDogWzEgLyBjb3N0TWF4LCBzdGFuZGluZ10sIHNpemU6IFsoYnVkZ2V0UHggLSAxKSAvIGNvc3RNYXgsIDBdIH0pOyBwcC5zcmMgPSBmaWVsZC5wcmVzc3VyZTsgcHAuZHN0ID0gdG1wIH0pXG4gICAgICAvLyAowqcxNy40NCkgSnVtcHMsIHRoZW4gdW5pdCBwYXNzZXMgLSBzZWUgV0NfV0FURVJfRlJPTlRfRlJBRydzIHVfc3RyaWRlLlxuICAgICAgLy8gKMKnMTcuNDQpIFVuaXQgcGFzc2VzOiB0aGUgZHlhZGljIGp1bXBzICh3YXRlcmNvbG9yRnJvbnRTdHJpZGVzKSB3ZXJlXG4gICAgICAvLyBzaXggdGltZXMgY2hlYXBlciBhbmQgbWVhc3VyYWJseSB3cm9uZyAtIGEganVtcCBzdW1zIHRoZSBjbGltYiBhbG9uZ1xuICAgICAgLy8gaXRzIHBhdGggYnV0IGxvc2VzIHRoZSBwZXItY2VsbCBmbG9vciwgc28gdGhlIGNvc3QgY2FtZSBvdXQgbG93LCB0aGVcbiAgICAgIC8vIHB1ZGRsZXMgcmFuIHdpZGVyIGFuZCBldmVyeSBkcm9wIGRyaWVkIHBhbGVyICgxMjQgLT4gMTMzIG9mIDI1NSBvblxuICAgICAgLy8gSWx5YSdzIGNpcmNsZXMpLiBUaGUgYmlnIHN3ZWVwcyBnZXQgdGhlaXIgc3BlZWQgZnJvbSB0aGVcbiAgICAgIC8vIGhhbGYtcmVzb2x1dGlvbiBmaWVsZCBpbnN0ZWFkLCBleGFjdGx5LlxuICAgICAgcnVuKGZyb250U3RlcHMsIGNvc3RNYXgsIGZpZWxkLnByZXNzdXJlLCBXQ19GUk9OVF9DTElNQiwgV0NfRlJPTlRfRkxPT1IpXG4gICAgICBvcHMucHVzaCgoKSA9PiB7IHRoaXMuY3R4LnBhc3NlcygpLmZpZWxkT3AoZmllbGQubWFzaywgZmllbGQucHJlc3N1cmUsIGZpZWxkLnByZXNzdXJlLCAxMiwgYnVkZ2V0UHggLyBjb3N0TWF4LCB7IGQ6IGZpZWxkLmJhbmQgfSk7IHBwLnNyYyA9IGZpZWxkLm1hc2s7IHBwLmRzdCA9IHRtcCB9KVxuICAgICAgLy8gSW53YXJkIG92ZXIgYSBnZW50bGVyIHJlbGllZjogdGhlIGJhbmQncyBpbm5lciBlZGdlIGZvbGxvd3MgdGhlXG4gICAgICAvLyB2YWxsZXlzIGEgZmV3IGNlbGxzIGluICh0aGUgcGhvdG8ncyBzdHJlYWtzIHBvaW50aW5nIGludG8gdGhlIGxpZ2h0XG4gICAgICAvLyBjZW50cmUpLCBub3QgYSB0aGlyZCBvZiB0aGUgd2F5IHRvIHRoZSBtaWRkbGUuXG4gICAgICAvLyBUaGUgZmlyc3QgdHdvIGNlbGxzIGluIGZyb20gdGhlIGZyb250IGZsYXQsIHNvIHRoZSBzaGFycCBwZWFrIG9mXG4gICAgICAvLyB0aGUgZGVwb3NpdGlvbiBwcm9maWxlIChtb2RlIDYpIGlzIGEgY29udGludW91cyBsaW5lIGFsb25nIHRoZVxuICAgICAgLy8gZnJvbnQgLSB3aXRoIHRoZSByZWxpZWYgZnJvbSB0aGUgZmlyc3QgY2VsbCBpdCBicm9rZSBpbnRvIGRvdHNcbiAgICAgIC8vICh0aGUgcGhvdG9ncmFwaHMnIHRpZGVsaW5lIGlzIGEgdGhpbiB1bmJyb2tlbiBsaW5lKTsgdGhlIHRhaWxcbiAgICAgIC8vIGJlaGluZCBpdCB0YWtlcyB0aGUgcmVsaWVmIGFuZCBpdHMgZmluZ2Vycy5cbiAgICAgIHJ1bigyLCBjb3N0TWF4SW4sIGZpZWxkLm1hc2ssIDAsIDEpXG4gICAgICBydW4oaW5TdGVwcyAtIDIsIGNvc3RNYXhJbiwgZmllbGQubWFzaywgV0NfRlJPTlRfQ0xJTUJfSU4sIFdDX0ZST05UX0ZMT09SX0lOKVxuICAgICAgb3BzLnB1c2goKCkgPT4ge1xuICAgICAgICB0aGlzLmN0eC5wYXNzZXMoKS5maWVsZE9wKHRtcCwgZmllbGQuY292ZXJhZ2UsIGZpZWxkLmNvdmVyYWdlLCAxMSwgc3RhbmRpbmcsIHsgZDogZmllbGQucHJlc3N1cmUsIGJhbmQ6IFtidWRnZXRQeCAvIGNvc3RNYXgsIDBdLCBzaXplOiBbMSAvIGNvc3RNYXgsIDFdIH0pXG4gICAgICAgIHRoaXMuY3R4LnBhc3NlcygpLmZpZWxkT3AoZmllbGQuY292ZXJhZ2UsIHRtcCwgdG1wLCAxLCAwKVxuICAgICAgICB0aGlzLmN0eC5wYXNzZXMoKS5maWVsZE9wKGZpZWxkLmJhbmQsIGZpZWxkLnByZXNzdXJlLCBmaWVsZC5jb3ZlcmFnZSwgNiwgbWVyZ2UsIHsgYzogZmllbGQubWFzaywgZDogZmllbGQucHJlc3N1cmUsIGJhbmQ6IFtidWRnZXRQeCAvIGNvc3RNYXgsIHdpZHRoIC8gY29zdE1heEluXSwgc2l6ZTogWzEgLyBjb3N0TWF4LCAxIC8gY29zdE1heEluXSwgb3JpZ2luOiBbc3RhbmRpbmcsIGRhbXBdLCBkaXI6IFsxLCAxXSwgdGF1OiBbd2F0ZXJjb2xvckR3ZWxsV2F0ZXIoZHdlbGxNcyksIDAsIDBdLCB3b3JsZDogW3gwIC8gUywgLSh5MCAvIFMgKyBmaWVsZC5oKSwgU10gfSlcbiAgICAgICAgdGhpcy5jdHgucGFzc2VzKCkuZmllbGRPcCh0bXAsIGZpZWxkLmJhbmQsIGZpZWxkLmJhbmQsIDUsIDAsIHsgZGlyOiBnYXRoZXJbMF0gfSlcbiAgICAgICAgbGV0IGdzID0gdG1wLCBnZCA9IGZpZWxkLm1hc2tcbiAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBnYXRoZXIubGVuZ3RoOyBpKyspIHsgdGhpcy5jdHgucGFzc2VzKCkuZmllbGRPcChnZCwgZ3MsIGdzLCA1LCAwLCB7IGRpcjogZ2F0aGVyW2ldIH0pOyBjb25zdCB0ID0gZ3M7IGdzID0gZ2Q7IGdkID0gdCB9XG4gICAgICAgIGlmIChncyAhPT0gZmllbGQubWFzaykgdGhpcy5jdHgucGFzc2VzKCkuZmllbGRPcChmaWVsZC5tYXNrLCBncywgZ3MsIDEsIDApXG4gICAgICB9KVxuICAgIH1cbiAgICAvLyAowqcxNy4yMykgVGhlIHJpbTogYHNoYXJlYCBvZiBgcGFpbnRgIGluc2lkZSB0aGUgZm9vdHByaW50IGdvZXMgdG8gdGhlXG4gICAgLy8gYmFuZC4gVHdvIGZyZWUgYnVmZmVyczsgdGhlIHJlc3VsdCBsYW5kcyBpbiBgdDJgLlxuICAgIGNvbnN0IHJpbSA9IChwYWludDogQWNjdW11bGF0aW9uQnVmZmVyLCBzaGFyZTogbnVtYmVyLCB0MTogQWNjdW11bGF0aW9uQnVmZmVyLCB0MjogQWNjdW11bGF0aW9uQnVmZmVyLCB0aWRlID0gZmFsc2UpOiB2b2lkID0+IHtcbiAgICAgIC8vIChzMTcuMzApIFRoZSBibG9vbSBsaWZ0cyB0aGUgd2FzaCdzIHBhaW50IGJ5IHRoZSBET01FIG92ZXIgdGhlIGRyb3BcbiAgICAgIC8vIChiYW5kIC5hOiBhbGwgb2YgaXQgdW5kZXIgdGhlIGNlbnRyZSwgbm9uZSBhdCB0aGUgZnJvbnQpLCB0aGUgdGlkZVxuICAgICAgLy8gdGhlIG1hcmsncyBvd24gcGFpbnQgb3ZlciB0aGUgd2hvbGUgZG9tYWluIChiYW5kIC5nKS4gQSB1bmlmb3JtIGxpZnRcbiAgICAgIC8vIGxlZnQgYSBoYXJkLWVkZ2VkIGhvbGUgdGhlIHNpemUgb2YgdGhlIGRyb3AncyBmb290cHJpbnQgLSBJbHlhJ3NcbiAgICAgIC8vIFwi0YHQu9C40YjQutC+0Lwg0YDQtdC30LrQviDQvtCx0LXQu9GP0LXRgiDQu9GD0LbRgyDQsiDQvNC10YHRgtC1INC60LDRgdCw0L3QuNGPXCIuXG4gICAgICB0aGlzLmN0eC5wYXNzZXMoKS5maWVsZE9wKHQxLCBwYWludCwgcGFpbnQsIHRpZGUgPyA3IDogOSwgc2hhcmUsIHsgZDogZmllbGQuYmFuZCB9KVxuICAgICAgbGV0IGdzID0gdDEsIGdkID0gdDJcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZ2F0aGVyLmxlbmd0aDsgaSsrKSB7IHRoaXMuY3R4LnBhc3NlcygpLmZpZWxkT3AoZ2QsIGdzLCBncywgNSwgMCwgeyBkaXI6IGdhdGhlcltpXSB9KTsgY29uc3QgdCA9IGdzOyBncyA9IGdkOyBnZCA9IHQgfVxuICAgICAgLy8gVGhlIGdhdGhlcmVkIHBhaW50IGlzIGluIGdzOyB0aGUgc3VtIGxhbmRzIGluIHQyLCBzbyB0aGUgb3RoZXIgaXNcbiAgICAgIC8vIGl0cyBzY3JhdGNoLlxuICAgICAgaWYgKGdzID09PSB0MikgeyB0aGlzLmN0eC5wYXNzZXMoKS5maWVsZE9wKHQxLCBncywgZ3MsIDEsIDApOyBncyA9IHQxIH1cbiAgICAgIHRoaXMuY3R4LnBhc3NlcygpLmZpZWxkT3AodDIsIHBhaW50LCBncywgdGlkZSA/IDE0IDogOCwgc2hhcmUsIHsgYzogZmllbGQubWFzaywgZDogZmllbGQuYmFuZCB9KVxuICAgIH1cbiAgICAvLyBPbmUgcmVjb3JkOiBjID0gbW9iaWxlIHNoYXJlIG9mIChsYWlkIOKIkiBzZXR0bGVkKTsgYiA9IGxhaWQg4oiSIGMsIHRoZSBwYXJ0XG4gICAgLy8gdGhhdCBzdGF5cyBwdXQgKHNldHRsZWQgcGFpbnQgcGx1cyB0aGUgZml4ZWQgc2hhcmUgb2YgdGhlIG5ldyk7IHRoZVxuICAgIC8vIHNjaGVkdWxlIG92ZXIgYzsgdGhlIHN1bSBiYWNrIGludG8gd2hpY2hldmVyIG9mIHRoZSBwYWlyIGlzIGZyZWUuXG4gICAgLy8gQm90aCByZWNvcmRzIHVzZSBjb3ZlcmFnZSBhbmQgb25lIHByZS1zdGVwIG1vYmlsZSBwaWdtZW50IGRlbnNpdHksXG4gICAgLy8gc28gYWJzb3JwdGlvbiBjYW5ub3QgY2hvb3NlIGEgZGlmZmVyZW50IG1vYmlsaXR5IGZyb20gaXRzIGNhcnJpZXIuXG4gICAgY29uc3QgZGlmZnVzZVN0ZXBzOiByZWFkb25seSBXZXREaWZmdXNlU3RlcFtdID0gdGhpcy5jdHguYWIoKS5ub0RpZmZ1c2UgPyBbXSA6IFdFVF9ESUZGVVNFX1NDSEVEVUxFXG4gICAgLy8gKMKnMTcuMjkpIFRoZSBjb2xvdXIgcmVjb3JkLCB3aGVuIHRoZXJlIGlzIG9uZSAodHdvIHBhaW50cyBvciBtb3JlKSxcbiAgICAvLyBpcyBzcGxpdCBhbmQgY2FycmllZCBpbiBMT0NLU1RFUCB3aXRoIHRoZSBkZXBvc2l0IGluc2lkZSB0aGVcbiAgICAvLyBkZXBvc2l0J3Mgb3duIHNldHRsZTogdGhlIGNhcnJ5J3MgZnJhY3Rpb25zIGRlcGVuZCBvbiB0aGUgZGVwb3NpdCdzXG4gICAgLy8gbW9iaWxlIGFuZCBmaXhlZCBhbW91bnRzIGF0IGV2ZXJ5IHN0ZXAsIHNvIHRoZSBjb2xvdXIgY2Fubm90IGJlXG4gICAgLy8gY2FycmllZCBvbiBpdHMgb3duIGFmdGVyd2FyZHMuIERpZmZ1c2lvbiBsaWtld2lzZSBydW5zIGNvbG91ciBmaXJzdFxuICAgIC8vIGFuZCBwaWdtZW50IHNlY29uZCBhZ2FpbnN0IHRoZSB1bmNoYW5nZWQgcHJlLXN0ZXAgcGlnbWVudCBmaWVsZC5cbiAgICBjb25zdCBjb2xvdXIgPSBzY3JhdGNoLnBhaW50cy5zaXplID4gMSA/IHsgYTogZmllbGQuY2EsIGI6IGZpZWxkLmNiLCBjOiBmaWVsZC5jYyB9IDogbnVsbFxuICAgIGNvbnN0IHNpbmdsZVBhaW50ID0gWy4uLnNjcmF0Y2gucGFpbnRzXVswXVxuICAgIGNvbnN0IHNpbmdsZVRhdTogW251bWJlciwgbnVtYmVyLCBudW1iZXJdID0gIWNvbG91ciAmJiBzaW5nbGVQYWludCA/IHBpZ21lbnRBYnNvcnB0aW9uKHNpbmdsZVBhaW50LnNwbGl0KCcsJykubWFwKE51bWJlcikgYXMgW251bWJlciwgbnVtYmVyLCBudW1iZXJdKSA6IFswLCAwLCAwXVxuICAgIC8vICjCpzE3LjQyKSBUaGUgd2FzaCBkcmllcyBhcyBPTkUgY29tcG9uZW50OiBub3RoaW5nIG9mIGFuIG9wZXJhdGlvbiBpc1xuICAgIC8vIGZpeGVkIGF0IGl0cyBwZW4tdXAgLSB0aGUgd2hvbGUgb2YgaXRzIHBhaW50IGlzIG1vYmlsZSwgdGhlIGVhcmxpZXJcbiAgICAvLyBwYWludCB1bmRlciB0aGUgZG9tZSBhbGwgb2YgaXQgdG9vLCBhbmQgbm8gdGlkZSBpcyBsYWlkIGludG8gdGhlIHdldFxuICAgIC8vIHN0YXRlOyB0aGUgdGlkZSBnb2VzLCBvbmNlLCBhbG9uZyB0aGUgb3V0ZXIgY29udG91ciBvZiB0aGUgd2FzaCdzXG4gICAgLy8gd2hvbGUgY292ZXJhZ2UsIGludG8gdGhlIFBST1ZJU0lPTkFMIGRyeSB0YXJnZXQgKGlua0RyeSkgdGhlXG4gICAgLy8gY29tcG9zaXRlIHNob3dzLCByZWNvbXB1dGVkIGF0IGV2ZXJ5IHBlbi11cCAoX2dyb3VwVGlkZU9wcyBiZWxvdykuXG4gICAgLy8gVGhlIGRlc2lnbiB0aHJlYWQncyBkaWFnbm9zaXMgb2YgdGhlIHdldC1vbi13ZXQgcGFpcnM6IGVhY2ggb3BlcmF0aW9uXG4gICAgLy8gZHJpZWQgdG8gdGhlIGVuZCBiZWZvcmUgdGhlIG5leHQgYXJyaXZlZCwgYW5kIG5vIHJlLW1vYmlsaXNhdGlvblxuICAgIC8vIHR1cm5zIFwiZHJ5IEEsIHRoZW4gZGlzc29sdmUgQSB3aXRoIEJcIiBpbnRvIFwid2V0IEEgKyB3ZXQgQiwgZHJpZWRcbiAgICAvLyB0b2dldGhlclwiLiBUaGUgcjE3IGJlaGF2aW91ciBzdGF5cyBhcyB0aGUgd2NPcERyeSBBL0IuXG4gICAgY29uc3QgbW9iaWxlU2hhcmUgPSBncm91cERyeSA/IDEgOiBXRVRfRElGRlVTRV9NT0JJTEVcbiAgICAvLyAoIzY4MCwgczE3Ljg0KSBUaGUgcG9vbCdzIHBhaW50IGNvbWJlZCBhbG9uZyB0aGUgdHJhdmVsIGJ5IHRoZSBoYWlycyxcbiAgICAvLyBvdmVyIHRoZSBzZXR0bGVkIHJlc3VsdCAodGhlIHNldHRsZSBlcmFzZXMgaXQgZnJvbSB0aGUgZG9zZSk6IHRocm91Z2hcbiAgICAvLyBgZnJlZWAgYW5kIGJhY2sgaW50byBgcGFpbnRgLiBUaGUgZmFjdG9yIGNvbWVzIGZyb20gdGhlIGNvdmVyYWdlXG4gICAgLy8gYWxvbmUsIHNvIHRoZSBkZXBvc2l0IGFuZCB0aGUgY29sb3VyIHJlY29yZCB0YWtlIHRoZSBzYW1lIG9uZS5cbiAgICBjb25zdCBzdHJlYWtDb21icyA9IE1hdGgubWF4KDEuNSwgTWF0aC5taW4oNTAsIHJhZGl1c1B4IC8gV0FURVJDT0xPUl9CUklTVExFX0JVTkRMRV9QWCkpXG4gICAgY29uc3QgcG9vbFN0cmVha3MgPSAocGFpbnQ6IEFjY3VtdWxhdGlvbkJ1ZmZlciwgZnJlZTogQWNjdW11bGF0aW9uQnVmZmVyKTogdm9pZCA9PiB7XG4gICAgICBpZiAoIShXQ19QT09MX1NUUkVBSyA+IDApKSByZXR1cm5cbiAgICAgIHRoaXMuY3R4LnBhc3NlcygpLmZpZWxkT3AoZnJlZSwgcGFpbnQsIHBhaW50LCAxLCAxLCB7IGM6IGZpZWxkLmNvdmVyYWdlLCB3b3JsZDogW3gwIC8gUywgLSh5MCAvIFMgKyBmaWVsZC5oKSwgU10sIHNpemU6IFtzdHJlYWtDb21icywgMF0sIG9yaWdpbjogW1dDX1BPT0xfU1RSRUFLLCAwXSwgZGlyOiBbMSwgMV0gfSlcbiAgICAgIGZpZWxkT3AocGFpbnQsIGZyZWUsIGZyZWUsIDEsIDApXG4gICAgfVxuICAgIGxldCBwYWlyZWRDb2xvdXI6IHsgb3V0OiBBY2N1bXVsYXRpb25CdWZmZXIgfSB8IG51bGwgPSBudWxsXG4gICAgY29uc3Qgc2V0dGxlID0gKGE6IEFjY3VtdWxhdGlvbkJ1ZmZlciwgYjogQWNjdW11bGF0aW9uQnVmZmVyLCBjOiBBY2N1bXVsYXRpb25CdWZmZXIsIGZpcnN0OiBib29sZWFuLCBzcGFyZTogQWNjdW11bGF0aW9uQnVmZmVyLCBmb2xsb3cgPSBmYWxzZSk6IHsgb3V0OiBBY2N1bXVsYXRpb25CdWZmZXIgfSA9PiB7XG4gICAgICBjb25zdCBzdCA9IHsgc3JjOiBjLCBkc3Q6IGEsIG91dDogYSB9XG4gICAgICBjb25zdCBwYWlyZWQgPSBmaXJzdCAmJiBjb2xvdXIgPyB7IHNyYzogY29sb3VyLmMsIGRzdDogY29sb3VyLmEsIG91dDogY29sb3VyLmEgfSA6IG51bGxcbiAgICAgIGlmIChwYWlyZWQpIHBhaXJlZENvbG91ciA9IHBhaXJlZFxuICAgICAgY29uc3QgYWR2YW5jZSA9IChyYWRpdXM6IG51bWJlciwga25pZ2h0OiBib29sZWFuLCBnYXRlID0gZmllbGQuY292ZXJhZ2UpOiB2b2lkID0+IHtcbiAgICAgICAgLy8gQ29sb3VyIGZpcnN0OiB0aGUgZm9sbG93aW5nIGRlcG9zaXQgZHJhdyBzdGlsbCByZWFkcyBleGFjdGx5IHRoZVxuICAgICAgICAvLyBzYW1lIHByZS1zdGVwIGRlbnNpdHkuIE5laXRoZXIgZGVzdGluYXRpb24gYWxpYXNlcyB0aGF0IGRlbnNpdHkuXG4gICAgICAgIGlmIChwYWlyZWQpIGRpZmZ1c2VTdGVwKHBhaXJlZC5zcmMsIHBhaXJlZC5kc3QsIHJhZGl1cywga25pZ2h0LCBnYXRlLCBzdC5zcmMpXG4gICAgICAgIGRpZmZ1c2VTdGVwKHN0LnNyYywgc3QuZHN0LCByYWRpdXMsIGtuaWdodCwgZ2F0ZSwgc3Quc3JjKVxuICAgICAgICBjb25zdCB0ID0gc3Quc3JjOyBzdC5zcmMgPSBzdC5kc3Q7IHN0LmRzdCA9IHRcbiAgICAgICAgaWYgKHBhaXJlZCkgeyBjb25zdCB0ID0gcGFpcmVkLnNyYzsgcGFpcmVkLnNyYyA9IHBhaXJlZC5kc3Q7IHBhaXJlZC5kc3QgPSB0IH1cbiAgICAgIH1cbiAgICAgIGlmICghZm9sbG93KSBvcHMucHVzaCgoKSA9PiB7XG4gICAgICAgIGZpZWxkT3AoYywgYSwgYiwgMCwgbW9iaWxlU2hhcmUpXG4gICAgICAgIC8vICjCpzE3LjI1KSBBIG1hcmsgdGhhdCBsYW5kZWQgaW4gYSBwdWRkbGUgd2V0cyB0aGUgcGFpbnQgYWxyZWFkeVxuICAgICAgICAvLyBseWluZyB1bmRlciBpdHMgZm9vdHByaW50OiB0aGF0IHBhaW50IGlzIGFzIG1vYmlsZSBhcyB0aGUgbmV3IC1cbiAgICAgICAgLy8gaXQgbmV2ZXIgZHJpZWQgLSBzbyB0aGUgc2FtZSBtb2JpbGUgc2hhcmUgb2YgaXQgam9pbnMgYyBhbmQgcnVucyxcbiAgICAgICAgLy8gc2V0dGxlcyBhbmQgcmVsb2NhdGVzIHdpdGggdGhlIG5ldyBwYWludCwgdG8gdGhlIE1FUkdFRCBmcm9udC5cbiAgICAgICAgLy8gV2l0aG91dCB0aGlzIHRoZSBlYXJsaWVyIHBhc3MncyB0aWRlbGluZSBzdGF5ZWQgcHV0IHVuZGVyIHRoZVxuICAgICAgICAvLyBuZXh0IHBhc3MsIGFuZCBhIGZsYXQgd2FzaCBjYW1lIG91dCBhcyBhIGxhZGRlciBvZiBpbm5lciByaW1zLlxuICAgICAgICAvLyAowqcxNy40MSkgLi4uYW5kIGl0IGhhcHBlbnMgQUZURVIgdGhlIGZyb250IGlzIGtub3duLCBvdmVyIHRoZVxuICAgICAgICAvLyBkb21lIG9mIHRoZSBwdWRkbGUgdGhlIGxhbmRpbmcgam9pbmVkIC0gc2VlIGJlbG93LlxuICAgICAgICAvLyBXaGVyZSBlYXJsaWVyIG1hcmtzJyBTRVRUTEVEIGRlcG9zaXQgbGllcywgYmVmb3JlIGIgaXMgb3ZlcndyaXR0ZW5cbiAgICAgICAgLy8gd2l0aCB0aGUgZml4ZWQgcGFydCAtIGtlcHQgaW4gYGJhbmRgIHVudGlsIHRoZSBmcm9udCByZWFkcyBpdDogdGhlXG4gICAgICAgIC8vIHB1ZGRsZSB0aGlzIG1hcmsncyB3YXRlciBtYXkgaGF2ZSBqb2luZWQuXG4gICAgICAgIGlmIChmaXJzdCkgdGhpcy5jdHgucGFzc2VzKCkuZmllbGRPcChmaWVsZC5iYW5kLCBiLCBiLCA0LCAwLjAwMilcbiAgICAgICAgZmllbGRPcChiLCBhLCBjLCAxLCAtMSlcbiAgICAgICAgLy8gVGhlIGNvbG91ciByZWNvcmQncyBzcGxpdCwgYnkgdGhlIHNhbWUgZ2F0ZS5cbiAgICAgICAgaWYgKGNvbG91ciAmJiBmaXJzdCkge1xuICAgICAgICAgIGZpZWxkT3AoY29sb3VyLmMsIGNvbG91ci5hLCBjb2xvdXIuYiwgMCwgbW9iaWxlU2hhcmUpXG4gICAgICAgICAgZmllbGRPcChjb2xvdXIuYiwgY29sb3VyLmEsIGNvbG91ci5jLCAxLCAtMSlcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC8vIFRoZSB3YXRlciBmcm9udCwgaXRzIGJhbmQgYW5kIHRoZSBleHRlbmRlZCBjb3ZlcmFnZSBjb21lIGZyb20gdGhlXG4gICAgICAvLyBkZXBvc2l0J3MgbW9iaWxlIGZpZWxkLCBvbmNlOyB0aGUgY29sb3VyIHJlY29yZCByaWRlcyB0aGUgc2FtZS5cbiAgICAgIGlmIChmaXJzdCkgZnJvbnRPcHMoYywgYSlcbiAgICAgIC8vICjCpzE3LjI5KSBUaGUgZnJvbnQgY2FycmllcyB0aGUgcGFpbnQ6IHRoZSBtb2JpbGUgZmllbGQgcnVucyBhbG9uZ1xuICAgICAgLy8gdGhlIGZyb250J3MgY29zdCwgZnJvbSB0aGUgZm9vdHByaW50IG91dCB0byB3aGVyZSB0aGUgd2F0ZXJcbiAgICAgIC8vIHN0b3BwZWQsIGluIHN0cmlkZWQgc3RlcHMgb2YgV0NfRklFTERfT1BfRlJBRydzIG1vZGUgMTUgLSBzbyBhXG4gICAgICAvLyBsb2FkZWQgbWFyayBpbnRvIGEgd2V0IHdhc2ggc2VuZHMgaXRzIG93biBwaWdtZW50IGludG8gdGhlIHdhc2ggaW5cbiAgICAgIC8vIHRoZSBmaW5nZXJzIHRoZSBmcm9udCBjdXQsIGF0IG5lYXIgdGhlIGJvZHkncyBkZW5zaXR5IChJbHlhJ3NcbiAgICAgIC8vIHNlcmllcyA1KSwgaW5zdGVhZCBvZiBsZWF2aW5nIGl0IGluc2lkZSBpdHMgb3duIGNvbnRvdXIgd2l0aCBvbmx5XG4gICAgICAvLyB0aGUgd2F0ZXIgZ29uZSBvbi4gVGhlIGZpbG0ncyBvd24gY29udG91ciByaW5nICh0aGUgbGFzdCBjZWxsIGFuZFxuICAgICAgLy8gYSBoYWxmIG9mIHRoZSBidWRnZXQpIGlzIGxlZnQgb3V0IG9mIHRoZSBkb21haW4gaGVyZTogb24gZHJ5IHBhcGVyXG4gICAgICAvLyB0aGUgd2hvbGUgZmlsbSBzaXRzIG9uZSBjZWxsIHNob3J0IG9mIGl0cyBidWRnZXQsIGFuZCB3aXRoIHRoZVxuICAgICAgLy8gcmluZyBpbiwgZXZlcnkgc3Ryb2tlIHBpbGVkIGl0cyBvdXRlciB0ZXhlbHMgaW50byBhIGhhcmQgbGluZS5cbiAgICAgIC8vIFdoYXQgdGhlIGZsb3cgZXF1YWxpc2VzIGlzIHRoZSBUT1RBTCBwaWdtZW50IC0gbW9iaWxlIHBsdXMgZml4ZWRcbiAgICAgIC8vIChiKTogdGhlIHdhc2gncyBzZXR0bGVkIHBhaW50IGx5aW5nIGluIHRoZSBkb21haW4gY291bnRzLCBvciBhXG4gICAgICAvLyBtYXJrIG92ZXIgYSB3ZXQgd2FzaCBzZW50IGl0cyBvd24gcGFpbnQgYW5kIHRoZSByZS1tb2JpbGlzZWQgd2FzaFxuICAgICAgLy8gdW5kZXIgaXQgb3V0IGludG8gZmluZ2VycyBkZW5zZXIgdGhhbiBpdHMgYm9keSwgYW5kIHRoZSBib2R5IHdlbnRcbiAgICAgIC8vIHBhbGUuIFRoZSBkZXBvc2l0IHBpbmctcG9uZ3MgYyBhbmQgYTsgdGhlIGNvbG91ciByZWNvcmQgY2MgYW5kIGNhLFxuICAgICAgLy8gaW4gbG9ja3N0ZXAsIHRha2luZyB0aGUgZGVwb3NpdCdzIGZyYWN0aW9ucyAobW9kZSAxNikuXG4gICAgICBpZiAoZmlyc3QgJiYgIXRoaXMuY3R4LmFiKCkubm9DYXJyeSkge1xuICAgICAgICBjb25zdCBjYXJyeSA9IHdhdGVyY29sb3JDYXJyeVN0cmlkZXMoYnVkZ2V0UHgpXG4gICAgICAgIGxldCBzcmMgPSBjLCBkc3QgPSBhXG4gICAgICAgIGxldCBjc3JjID0gY29sb3VyPy5jLCBjZHN0ID0gY29sb3VyPy5hXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY2FycnkubGVuZ3RoOyBpICs9IDQpIHtcbiAgICAgICAgICBjb25zdCBuID0gTWF0aC5taW4oNCwgY2FycnkubGVuZ3RoIC0gaSlcbiAgICAgICAgICBjb25zdCBwbGFuOiBBcnJheTx7IHM6IG51bWJlcjsgc3JjOiBBY2N1bXVsYXRpb25CdWZmZXI7IGRzdDogQWNjdW11bGF0aW9uQnVmZmVyOyBjc3JjPzogQWNjdW11bGF0aW9uQnVmZmVyOyBjZHN0PzogQWNjdW11bGF0aW9uQnVmZmVyIH0+ID0gW11cbiAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IG47IGorKykge1xuICAgICAgICAgICAgcGxhbi5wdXNoKHsgczogY2FycnlbaSArIGpdLCBzcmMsIGRzdCwgY3NyYywgY2RzdCB9KVxuICAgICAgICAgICAgY29uc3QgdCA9IHNyYzsgc3JjID0gZHN0OyBkc3QgPSB0XG4gICAgICAgICAgICBjb25zdCBjdCA9IGNzcmM7IGNzcmMgPSBjZHN0OyBjZHN0ID0gY3RcbiAgICAgICAgICB9XG4gICAgICAgICAgb3BzLnB1c2goKCkgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCBwIG9mIHBsYW4pIHtcbiAgICAgICAgICAgICAgY29uc3Qgb3B0cyA9IHsgZDogZmllbGQucHJlc3N1cmUsIGRpcjogW3AucywgcC5zXSBhcyBbbnVtYmVyLCBudW1iZXJdLCBiYW5kOiBbKGJ1ZGdldFB4IC0gMS41KSAvIGNvc3RNYXgsIDBdIGFzIFtudW1iZXIsIG51bWJlcl0sIHNpemU6IFtXQ19DQVJSWV9QT1csIGNvc3RNYXhdIGFzIFtudW1iZXIsIG51bWJlcl0sIG9yaWdpbjogW3AucywgV0NfQ0FSUllfVFJBVkVMXSBhcyBbbnVtYmVyLCBudW1iZXJdIH1cbiAgICAgICAgICAgICAgaWYgKHAuY3NyYyAmJiBwLmNkc3QpIHRoaXMuY3R4LnBhc3NlcygpLmZpZWxkT3AocC5jZHN0LCBwLmNzcmMsIGIsIDE2LCBXQ19DQVJSWV9SQVRFLCB7IC4uLm9wdHMsIGM6IHAuc3JjIH0pXG4gICAgICAgICAgICAgIHRoaXMuY3R4LnBhc3NlcygpLmZpZWxkT3AocC5kc3QsIHAuc3JjLCBiLCAxNSwgV0NfQ0FSUllfUkFURSwgb3B0cylcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICAgIGlmIChzcmMgIT09IGMpIHsgY29uc3QgZnJvbSA9IHNyYzsgb3BzLnB1c2goKCkgPT4gZmllbGRPcChjLCBmcm9tLCBmcm9tLCAxLCAwKSkgfVxuICAgICAgICBpZiAoY29sb3VyICYmIGNzcmMgJiYgY3NyYyAhPT0gY29sb3VyLmMpIHsgY29uc3QgZnJvbSA9IGNzcmMsIHRvID0gY29sb3VyLmM7IG9wcy5wdXNoKCgpID0+IGZpZWxkT3AodG8sIGZyb20sIGZyb20sIDEsIDApKSB9XG4gICAgICB9XG4gICAgICAvLyAowqcxNy40MSkgVGhlIHdldCBsYW5kaW5nIHJlLW1vYmlsaXNlcyB0aGUgZWFybGllciBwYWludCBvdmVyIHRoZVxuICAgICAgLy8gRE9NRSBvZiB0aGUgcHVkZGxlIGl0IGpvaW5lZCAoYmFuZCAuYSwgZnJvbSB0aGUgZnJvbnQganVzdCBydW4pLFxuICAgICAgLy8gKMKnMTcuNDMpIEFGVEVSIHRoZSBjYXJyeTogcmUtbW9iaWxpc2VkIGJlZm9yZSBpdCwgdGhlIGVhcmxpZXIgcGFpbnRcbiAgICAgIC8vIHJvZGUgdGhlIG5ldyBwYWludCdzIGZyb250IG91dCBvZiB0aGUgZm9vdHByaW50IGFuZCBwaWxlZCBpbiBhIGxpbmVcbiAgICAgIC8vIGF0IHRoZSBkb21haW4ncyBlZGdlOyBub3cgb25seSB0aGUgbmV3IHBhaW50IHRyYXZlbHMgd2l0aCB0aGVcbiAgICAgIC8vIGZyb250LCBhbmQgdGhlIHR3byBwYWludHMgbWl4IGJ5IHRoZSBwdWRkbGUgZGlmZnVzaW9uIGJlbG93LCBib3RoXG4gICAgICAvLyB3YXlzIGFuZCB3aXRob3V0IGEgZGlyZWN0aW9uLlxuICAgICAgLy8gbm90IG9ubHkgdW5kZXIgaXRzIGZvb3RwcmludDogdGhlIHR3byBwYWludHMgdGhlbiBtaXggYm90aCB3YXlzIGluXG4gICAgICAvLyB0aGUgcHVkZGxlIGRpZmZ1c2lvbiBiZWxvdy4gVGhlIG1vdmVkIHNoYXJlIGxlYXZlcyB0aGUgZml4ZWQgZmllbGRcbiAgICAgIC8vIChiKSBhcyBpdCBqb2lucyB0aGUgbW9iaWxlIG9uZSAoYyksIGZvciB0aGUgZGVwb3NpdCBhbmQgdGhlIGNvbG91clxuICAgICAgLy8gcmVjb3JkIGFsaWtlLiBgYWAgYW5kIGBzcGFyZWAgYXJlIHRoZSB0ZW1wb3Jhcmllcy5cbiAgICAgIGNvbnN0IHJlbW9iRmxvb3IgPSBncm91cERyeSA/IDEgOiBXQ19SRU1PQl9ET01FXG4gICAgICBpZiAoZmlyc3QgJiYgbWVyZ2UgPiAwKSBvcHMucHVzaCgoKSA9PiB7XG4gICAgICAgIHRoaXMuY3R4LnBhc3NlcygpLmZpZWxkT3AoYSwgYywgYiwgMTgsIG1lcmdlLCB7IGQ6IGZpZWxkLmJhbmQsIG9yaWdpbjogW3JlbW9iRmxvb3IsIDBdIH0pXG4gICAgICAgIHRoaXMuY3R4LnBhc3NlcygpLmZpZWxkT3Aoc3BhcmUsIGIsIGMsIDMsIDAsIHsgYzogYSB9KVxuICAgICAgICBmaWVsZE9wKGMsIGEsIGEsIDEsIDApXG4gICAgICAgIGZpZWxkT3AoYiwgc3BhcmUsIHNwYXJlLCAxLCAwKVxuICAgICAgICBpZiAoY29sb3VyKSB7XG4gICAgICAgICAgdGhpcy5jdHgucGFzc2VzKCkuZmllbGRPcChhLCBjb2xvdXIuYywgY29sb3VyLmIsIDE4LCBtZXJnZSwgeyBkOiBmaWVsZC5iYW5kLCBvcmlnaW46IFtyZW1vYkZsb29yLCAwXSB9KVxuICAgICAgICAgIHRoaXMuY3R4LnBhc3NlcygpLmZpZWxkT3Aoc3BhcmUsIGNvbG91ci5iLCBjb2xvdXIuYywgMywgMCwgeyBjOiBhIH0pXG4gICAgICAgICAgZmllbGRPcChjb2xvdXIuYywgYSwgYSwgMSwgMClcbiAgICAgICAgICBmaWVsZE9wKGNvbG91ci5iLCBzcGFyZSwgc3BhcmUsIDEsIDApXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAvLyAowqcxNy40MCkgVGhlIHB1ZGRsZSBNSVhFUzogb24gYSB3ZXQgbGFuZGluZyB0aGUgbWFyaydzIGZvb3RwcmludFxuICAgICAgLy8gYW5kIHRoZSB3YXNoIHVuZGVyIGl0IGFyZSBvbmUgbGlxdWlkLCBhbmQgdGhlIHBhaW50IGluIGl0IC0gdGhlXG4gICAgICAvLyBuZXcsIGFuZCB0aGUgd2FzaCdzIHJlLW1vYmlsaXNlZCB1bmRlciBpdCAtIGV2ZW5zIG91dCBhY3Jvc3MgdGhlXG4gICAgICAvLyBmb290cHJpbnQgb3ZlciB0ZW5zIG9mIHRleGVscywgYXMgdGhlIGNvYXJzZSBkaWZmdXNpb24gZGlkIGZvclxuICAgICAgLy8gZXZlcnkgbWFyayBiZWZvcmUgwqcxNy4yOSB0b29rIGl0IG91dCAoaXQgZXJhc2VkIHRoZSBmaW5nZXJzIGF0IHRoZVxuICAgICAgLy8gZnJvbnQpLiBCYWNrIGZvciB0aGUgd2V0IGxhbmRpbmcgb25seSwgZ2F0ZWQgYnkgdGhlIERPTUUgb3ZlciB0aGVcbiAgICAgIC8vIGZvb3RwcmludCAoYmFuZCAuYTogZnVsbCBpbnNpZGUsIG5vbmUgYXQgdGhlIGZyb250KSwgc28gdGhlIGZpbmdlcnNcbiAgICAgIC8vIHRoZSBjYXJyeSBjdXQgcGFzdCB0aGUgZm9vdHByaW50IGtlZXAgdGhlaXIgZWRnZXMuIFdpdGhvdXQgaXQgdGhlXG4gICAgICAvLyBlYXJsaWVyIG1hcmsncyBwYWludCBzdG9wcGVkIGF0IGl0cyBvd24gY29udG91ciB1bmRlciB0aGUgbmV3IG1hcmtcbiAgICAgIC8vIC0gSWx5YSdzIFwi0LbRkdC70YLRi9C5INC/0YDQvtC90LjQutCw0LXRgiDRgNC+0LLQvdC+0Lkg0LvQuNC90LjQtdC5XCIgLSBhbmQgdGhlIG5ldyBtYXJrJ3NcbiAgICAgIC8vIGZvb3RwcmludCBvdmVyIHRoZSB3YXNoIHN0YXllZCBhIHBhbGVyIGJhbmQgd2hlcmUgdGhlIGNhcnJ5IGhhZFxuICAgICAgLy8gdGFrZW4gZnJvbSBpdCAoXCLQvtCx0LvQsNGB0YLRjCDQvNC10LbQtNGDINGI0YLRgNC40YXQvtC8INC4INGA0LLQsNC90YvQvCDQutGA0LDQtdC8XCIpLiBUaGUgZ2F0ZVxuICAgICAgLy8gdGV4dHVyZSBpcyBidWlsdCBvbmNlIGludG8gYHByZXNzdXJlYCwgZnJlZSBhZnRlciB0aGUgY2FycnkuXG4gICAgICBpZiAoZmlyc3QgJiYgbWVyZ2UgPiAwKSBvcHMucHVzaCgoKSA9PiB0aGlzLmN0eC5wYXNzZXMoKS5maWVsZE9wKGZpZWxkLnByZXNzdXJlLCBmaWVsZC5jb3ZlcmFnZSwgZmllbGQuY292ZXJhZ2UsIDE3LCAwLCB7IGQ6IGZpZWxkLmJhbmQgfSkpXG4gICAgICAvLyAowqcxNy4yMykgVGhlIGJsb29tOiB0aGUgd2FzaCdzIFNFVFRMRUQgcGFpbnQgaW5zaWRlIHRoaXMgb3BlcmF0aW9uJ3NcbiAgICAgIC8vIGZvb3RwcmludCBnb2VzIHRvIHRoZSBmb290cHJpbnQncyBlZGdlIOKAlCB0aGUgbGlnaHQgcGF0Y2ggd2l0aCB0aGVcbiAgICAgIC8vIGRhcmsgcmFnZ2VkIHJpbmcuIE9ubHkgYXMgbXVjaCBhcyB0aGUgcmVjb3JkZWQgd2V0bmVzcyBzYXlzIHRoZSB3YXNoXG4gICAgICAvLyB3YXMgZGFtcCAod2F0ZXJjb2xvckJsb29tU3RyZW5ndGgpOyBgYWAgYW5kIGBzcGFyZWAgYXJlIGZyZWUgaGVyZS5cbiAgICAgIC8vICgjNjgwLCDCpzE3Ljc4KSBCRUZPUkUgdGhlIHB1ZGRsZSBzZXR0bGVzIGludG8gYGJgOiBhZnRlciBpdCwgdGhlXG4gICAgICAvLyBibG9vbSB0b29rIHRoaXMgbWFyaydzIG93biBzZXR0bGVkIGNvcmUgb3V0IHRvIHRoZSBmb290cHJpbnQncyBlZGdlXG4gICAgICAvLyB0b28gYW5kIGxlZnQgYSBsaWdodCByaW5nIGluIHRoZSBtaWRkbGUgb2YgdGhlIGRyb3AuXG4gICAgICBpZiAoYmxvb20gPiAwKSB7XG4gICAgICAgIG9wcy5wdXNoKCgpID0+IHtcbiAgICAgICAgICByaW0oYiwgV0NfQkxPT01fU0hBUkUgKiBibG9vbSwgYSwgc3BhcmUpXG4gICAgICAgICAgZmllbGRPcChiLCBzcGFyZSwgc3BhcmUsIDEsIDApXG4gICAgICAgICAgaWYgKHBhaXJlZCAmJiBjb2xvdXIpIHtcbiAgICAgICAgICAgIHJpbShjb2xvdXIuYiwgV0NfQkxPT01fU0hBUkUgKiBibG9vbSwgYSwgc3BhcmUpXG4gICAgICAgICAgICBmaWVsZE9wKGNvbG91ci5iLCBzcGFyZSwgc3BhcmUsIDEsIDApXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgfVxuICAgICAgLy8gKCM2ODAsIMKnMTcuNzgpIC4uLmFuZCBpdCBTRVRUTEVTIGFzIGl0IG1peGVzOiBhIHNoYXJlIG9mIHRoZSBwYWludFxuICAgICAgLy8gZ3JpcHMgdGhlIHBhcGVyIGJlZm9yZSB0aGUgcHVkZGxlIG1vdmVzIGl0IGF0IGFsbCAodGhlIGNvcmUpLCBhbmQgb2ZcbiAgICAgIC8vIHdoYXQgaXMgc3RpbGwgYWZsb2F0IGEgc2hhcmUgbW9yZSBhZnRlciBldmVyeSBzdGVwIC0gc28gdGhlIHBhaW50XG4gICAgICAvLyB0aGF0IHNldHRsZXMgbGF0ZSBoYXMgZ29uZSBmYXIgYW5kIGlzIGxpdHRsZS4gQSBjb3JlLCBhIG5lYXJlciBoYWxvLFxuICAgICAgLy8gYSB3aWRlIGZhaW50IG9uZSAoSWx5YTogXCLQsdC10LvQvtC1INC/0Y/RgtC90L4g0L/QvtGH0YLQuCDQsdC10Lcg0YDQsNC30LzRi9GC0LjRjywg0LPRgNCw0LTQuNC10L3RglxuICAgICAgLy8g0L/QvtCx0L7Qu9GM0YjQtSDQuCDQv9GA0L7Qt9GA0LDRh9C90LXQtSwg0Lgg0L7Qs9GA0L7QvNC90YvQuSDQvtGH0LXQvdGMINC/0YDQvtC30YDQsNGH0L3Ri9C5XCIpLCB3aGVyZSB0aGVcbiAgICAgIC8vIHNjaGVkdWxlIGFsb25lIGV2ZW5lZCB0aGUgd2hvbGUgb2YgaXQgb3V0IGludG8gb25lIHBhbGUgY2xvdWQuXG4gICAgICAvLyBUaGUgcGFpcmVkIHVwZGF0ZSBpcyBsaW5lYXIgZm9yIGl0cyBzaGFyZWQgcHJlLXN0ZXAgZ2F0ZSwgc28gdGhlXG4gICAgICAvLyBtb2JpbGUgZmllbGQgaXMgbGVmdCB1bmRlcGxldGVkIGFuZCBlYWNoIHN0ZXAncyBzbGljZSBpcyBhZGRlZCB0b1xuICAgICAgLy8gdGhlIGZpeGVkIG9uZSBhdCBpdHMgd2VpZ2h0ICh3YXRlcmNvbG9yUHVkZGxlU2V0dGxlV2VpZ2h0cyk7IHRoZVxuICAgICAgLy8gcmVzdCBpcyBzY2FsZWQgZG93biBvbmNlIGF0IHRoZSBlbmQuIFRoZSBmaXhlZCBmaWVsZCBwaW5nLXBvbmdzXG4gICAgICAvLyB3aXRoIGBzcGFyZWAsIGZyZWUgaGVyZSwgYW5kIGNvbWVzIGJhY2sgaW50byBgYmAgYmVmb3JlIHRoZSBibG9vbS5cbiAgICAgIGNvbnN0IHB1ZGRsZVN0ZXBzID0gbWVyZ2UgPiAwICYmICF0aGlzLmN0eC5hYigpLm5vRGlmZnVzZSA/IFdFVF9ESUZGVVNFX1BVRERMRV9TQ0hFRFVMRSA6IFtdXG4gICAgICBpZiAocHVkZGxlU3RlcHMubGVuZ3RoKSB7XG4gICAgICAgIGNvbnN0IHcgPSB3YXRlcmNvbG9yUHVkZGxlU2V0dGxlV2VpZ2h0cyhwdWRkbGVTdGVwcy5sZW5ndGgpXG4gICAgICAgIGNvbnN0IGFjYyA9IHsgZml4ZWQ6IGIsIGZyZWU6IHNwYXJlIH1cbiAgICAgICAgLy8gKMKnMTcuODIpIFRoZSBmYXIgc2xpY2VzIC0gc2V0dGxlZCBhZnRlciB0aGUgbG9uZyBzdGVwcywgdGhlIGZhaW50XG4gICAgICAgIC8vIG91dGVyIGhhbG8gLSBnbyBkb3duIHRocm91Z2ggdGhlIHBhcGVyJ3MgZmlicmVzICh3Y0ZpYnJlKS5cbiAgICAgICAgY29uc3QgZmlicmVGcm9tID0gV0VUX1NFVFRMRV9GSUJSRV9GUk9NXG4gICAgICAgIGNvbnN0IHdvcmxkOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0gPSBbeDAgLyBTLCAtKHkwIC8gUyArIGZpZWxkLmgpLCBTXVxuICAgICAgICBjb25zdCBzZXR0bGVTbGljZSA9IChrOiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICAgICAgICBpZiAoISh3LnNsaWNlc1trXSA+IDApKSByZXR1cm5cbiAgICAgICAgICBpZiAocGFpcmVkICYmIGNvbG91cikge1xuICAgICAgICAgICAgLy8gQm90aCBvbGQgbW9iaWxlIGRlc3RpbmF0aW9ucyBhcmUgZnJlZSBhZnRlciB0aGUgcGFpcmVkIGRyYXcuXG4gICAgICAgICAgICAvLyBSZXVzZSB0aGVtIGZvciBmaXhlZC1zbGljZSBzdW1zLCB0aGVuIGNvcHkgYmFjazsgbm8gaGlzdG9yaWVzXG4gICAgICAgICAgICAvLyBvciBleHRyYSBmaWVsZC1zaXplZCB0ZXh0dXJlcyBhcmUgbmVlZGVkLlxuICAgICAgICAgICAgY29uc3QgYWRkU2xpY2UgPSAoZml4ZWQ6IEFjY3VtdWxhdGlvbkJ1ZmZlciwgbW9iaWxlOiBBY2N1bXVsYXRpb25CdWZmZXIsIHRtcDogQWNjdW11bGF0aW9uQnVmZmVyKTogdm9pZCA9PiB7XG4gICAgICAgICAgICAgIGlmIChrID49IGZpYnJlRnJvbSkgdGhpcy5jdHgucGFzc2VzKCkuZmllbGRPcCh0bXAsIGZpeGVkLCBtb2JpbGUsIDEsIHcuc2xpY2VzW2tdLCB7IHdvcmxkLCBkOiBmaWVsZC5iYW5kLCBkaXI6IFsxLCAxXSB9KVxuICAgICAgICAgICAgICBlbHNlIGZpZWxkT3AodG1wLCBmaXhlZCwgbW9iaWxlLCAxLCB3LnNsaWNlc1trXSlcbiAgICAgICAgICAgICAgZmllbGRPcChmaXhlZCwgdG1wLCB0bXAsIDEsIDApXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhZGRTbGljZShiLCBzdC5zcmMsIHN0LmRzdClcbiAgICAgICAgICAgIGFkZFNsaWNlKGNvbG91ci5iLCBwYWlyZWQuc3JjLCBwYWlyZWQuZHN0KVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChrID49IGZpYnJlRnJvbSkgdGhpcy5jdHgucGFzc2VzKCkuZmllbGRPcChhY2MuZnJlZSwgYWNjLmZpeGVkLCBzdC5zcmMsIDEsIHcuc2xpY2VzW2tdLCB7IHdvcmxkLCBkOiBmaWVsZC5iYW5kLCBkaXI6IFsxLCAxXSB9KVxuICAgICAgICAgIGVsc2UgZmllbGRPcChhY2MuZnJlZSwgYWNjLmZpeGVkLCBzdC5zcmMsIDEsIHcuc2xpY2VzW2tdKVxuICAgICAgICAgIGNvbnN0IHQgPSBhY2MuZml4ZWQ7IGFjYy5maXhlZCA9IGFjYy5mcmVlOyBhY2MuZnJlZSA9IHRcbiAgICAgICAgfVxuICAgICAgICAvLyBUaGUgY29yZSBpcyB0YWtlbiBvZmYgYSBTTU9PVEhFRCBmaWVsZDogc3RyYWlnaHQgYWZ0ZXIgdGhlIGNhcnJ5XG4gICAgICAgIC8vIHRoZSBtb2JpbGUgcGFpbnQgaGFzIGEgcGFsZSBsaW5lIGFsb25nIHRoZSBmb290cHJpbnQncyBjb250b3VyICh0aGVcbiAgICAgICAgLy8gY2FycnkgbGVhdmVzIHRoZSBmaWxtJ3Mgb3duIGNvbnRvdXIgcmluZyBvdXQpLCB3aGljaCB0aGUgd2hvbGVcbiAgICAgICAgLy8gc2NoZWR1bGUgdXNlZCB0byBldmVuIG91dCAtIHNldHRsZWQgcmF3LCBpdCBzdGF5ZWQgYXMgYSBsaWdodCByaW5nXG4gICAgICAgIC8vIHJvdW5kIHRoZSBtaWRkbGUgb2YgZXZlcnkgZHJvcC4gVHdvIGZpbmUgc3RlcHMsIGdhdGVkIGJ5IHRoZVxuICAgICAgICAvLyBjb3ZlcmFnZSBhbmQgbm90IHRoZSBkb21lICh0aGUgbGluZSBJUyB0aGUgZG9tZSdzIGVkZ2UpLCBhbiBldmVuXG4gICAgICAgIC8vIGNvdW50IHNvIHRoZSBwYWlyJ3MgcGFyaXR5IHN0YXlzLlxuICAgICAgICBmb3IgKGNvbnN0IFtyYWRpdXMsIGtuaWdodF0gb2YgV0VUX1NFVFRMRV9TTU9PVEgpIHtcbiAgICAgICAgICBvcHMucHVzaCgoKSA9PiBhZHZhbmNlKHJhZGl1cywga25pZ2h0KSlcbiAgICAgICAgfVxuICAgICAgICBvcHMucHVzaCgoKSA9PiBzZXR0bGVTbGljZSgwKSlcbiAgICAgICAgcHVkZGxlU3RlcHMuZm9yRWFjaCgoeyByYWRpdXMsIGtuaWdodCB9LCBpKSA9PiB7XG4gICAgICAgICAgb3BzLnB1c2goKCkgPT4ge1xuICAgICAgICAgICAgYWR2YW5jZShyYWRpdXMsIGtuaWdodCwgZmllbGQucHJlc3N1cmUpXG4gICAgICAgICAgICBzZXR0bGVTbGljZShpICsgMSlcbiAgICAgICAgICB9KVxuICAgICAgICB9KVxuICAgICAgICBvcHMucHVzaCgoKSA9PiB7XG4gICAgICAgICAgaWYgKGFjYy5maXhlZCAhPT0gYikgZmllbGRPcChiLCBhY2MuZml4ZWQsIGFjYy5maXhlZCwgMSwgMClcbiAgICAgICAgICAvLyBXaGF0IGlzIHN0aWxsIGFmbG9hdCwgYXQgaXRzIHdlaWdodDogaW50byB0aGUgZnJlZSBvbmUgb2YgdGhlXG4gICAgICAgICAgLy8gcGFpciBhbmQgYmFjaywgc28gdGhlIHBhaXIncyBwYXJpdHkgKHdoaWNoIHRoZSBjb2xvdXIgc2V0dGxlJ3NcbiAgICAgICAgICAvLyBzcGFyZSBpcyBjaG9zZW4gYnkpIGRvZXMgbm90IGNoYW5nZS5cbiAgICAgICAgICBmaWVsZE9wKHN0LmRzdCwgc3Quc3JjLCBzdC5zcmMsIDEsIHcuYWZsb2F0IC0gMSlcbiAgICAgICAgICBmaWVsZE9wKHN0LnNyYywgc3QuZHN0LCBzdC5kc3QsIDEsIDApXG4gICAgICAgICAgaWYgKHBhaXJlZCkge1xuICAgICAgICAgICAgZmllbGRPcChwYWlyZWQuZHN0LCBwYWlyZWQuc3JjLCBwYWlyZWQuc3JjLCAxLCB3LmFmbG9hdCAtIDEpXG4gICAgICAgICAgICBmaWVsZE9wKHBhaXJlZC5zcmMsIHBhaXJlZC5kc3QsIHBhaXJlZC5kc3QsIDEsIDApXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgfVxuICAgICAgZm9yIChjb25zdCB7IHJhZGl1cywga25pZ2h0IH0gb2YgZGlmZnVzZVN0ZXBzKSB7XG4gICAgICAgIG9wcy5wdXNoKCgpID0+IGFkdmFuY2UocmFkaXVzLCBrbmlnaHQpKVxuICAgICAgfVxuICAgICAgLy8gKMKnMTcuMjMpIFRoZSB0aWRlbGluZTogYWZ0ZXIgdGhlIHBhaW50IGhhcyBydW4sIGl0cyBwdWRkbGUgY2FycmllcyBhXG4gICAgICAvLyBzaGFyZSBvZiBpdCB0byB0aGUgcmltIGFzIGl0IGRyaWVzLiBUaGUgbW92ZWQgZmllbGQgbGFuZHMgaW4gYGRzdGAsXG4gICAgICAvLyB0aGUgc3VtIHdpdGggdGhlIGZpeGVkIHBhaW50IGluIGBzcmNgLlxuICAgICAgLy8gKMKnMTcuNDIpIC4uLm9yIG5vdDogdW5kZXIgdGhlIGdyb3VwLWRyeSBvcmFjbGUgdGhlIHRpZGUgd2FpdHMgZm9yXG4gICAgICAvLyB0aGUgd2hvbGUgd2FzaCAod2F0ZXJjb2xvckRyeVdhc2gpLCBhbmQgdGhlIG9wZXJhdGlvbidzIHJlc3VsdCBpc1xuICAgICAgLy8gaXRzIG1vdmVkIHBhaW50IG92ZXIgdGhlIGZpeGVkIGZpZWxkLCBhbGwgb2YgaXQgc3RpbGwgbW9iaWxlLlxuICAgICAgb3BzLnB1c2goKCkgPT4ge1xuICAgICAgICAvLyBUaGUgcHJlc3N1cmUgZ2F0ZSBpcyBubyBsb25nZXIgc2FtcGxlZCBhZnRlciB0aGUgZGlmZnVzaW9uLiBJdFxuICAgICAgICAvLyBpcyBub3cgYSBzcGFyZSBzaGFyZWQgc2VxdWVudGlhbGx5IGJ5IHRoZSBwYWlyZWQgZmluYWwgc3Vtcy5cbiAgICAgICAgY29uc3QgZmluYWxTcGFyZSA9IHBhaXJlZCA/IGZpZWxkLnByZXNzdXJlIDogc3BhcmVcbiAgICAgICAgaWYgKGdyb3VwRHJ5KSB7XG4gICAgICAgICAgLy8gVGhyb3VnaCB0aGUgc3BhcmUgYW5kIGJhY2ssIHNvIHRoZSByZXN1bHQgbGFuZHMgd2hlcmUgdGhlIHJpbSdzXG4gICAgICAgICAgLy8gd291bGQgKHN0LnNyYyk6IHRoZSBjb2xvdXIgc2V0dGxlJ3Mgc3BhcmUgaXMgY2hvc2VuIGJ5IHRoYXQuXG4gICAgICAgICAgZmllbGRPcChmaW5hbFNwYXJlLCBiLCBzdC5zcmMsIDEsIDEpXG4gICAgICAgICAgZmllbGRPcChzdC5zcmMsIGZpbmFsU3BhcmUsIGZpbmFsU3BhcmUsIDEsIDApXG4gICAgICAgICAgc3Qub3V0ID0gc3Quc3JjXG4gICAgICAgICAgcG9vbFN0cmVha3Moc3Quc3JjLCBmaW5hbFNwYXJlKVxuICAgICAgICAgIGlmIChwYWlyZWQgJiYgY29sb3VyKSB7XG4gICAgICAgICAgICBmaWVsZE9wKGZpbmFsU3BhcmUsIGNvbG91ci5iLCBwYWlyZWQuc3JjLCAxLCAxKVxuICAgICAgICAgICAgZmllbGRPcChwYWlyZWQuc3JjLCBmaW5hbFNwYXJlLCBmaW5hbFNwYXJlLCAxLCAwKVxuICAgICAgICAgICAgcGFpcmVkLm91dCA9IHBhaXJlZC5zcmNcbiAgICAgICAgICAgIHBvb2xTdHJlYWtzKHBhaXJlZC5zcmMsIGZpbmFsU3BhcmUpXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIHJpbShzdC5zcmMsIHdhdGVyY29sb3JSaW1TaGFyZShXQ19USURFX1JJTSwgcmFkaXVzQywgd2lkdGgpICogdGlkZVdhdGVyLCBzdC5kc3QsIGZpbmFsU3BhcmUsIHRydWUpXG4gICAgICAgIHN0Lm91dCA9IHN0LnNyY1xuICAgICAgICBmaWVsZE9wKHN0Lm91dCwgYiwgZmluYWxTcGFyZSwgMSwgMSlcbiAgICAgICAgcG9vbFN0cmVha3Moc3Qub3V0LCBmaW5hbFNwYXJlKVxuICAgICAgICBpZiAocGFpcmVkICYmIGNvbG91cikge1xuICAgICAgICAgIHJpbShwYWlyZWQuc3JjLCB3YXRlcmNvbG9yUmltU2hhcmUoV0NfVElERV9SSU0sIHJhZGl1c0MsIHdpZHRoKSAqIHRpZGVXYXRlciwgcGFpcmVkLmRzdCwgZmluYWxTcGFyZSwgdHJ1ZSlcbiAgICAgICAgICBwYWlyZWQub3V0ID0gcGFpcmVkLnNyY1xuICAgICAgICAgIGZpZWxkT3AocGFpcmVkLm91dCwgY29sb3VyLmIsIGZpbmFsU3BhcmUsIDEsIDEpXG4gICAgICAgICAgcG9vbFN0cmVha3MocGFpcmVkLm91dCwgZmluYWxTcGFyZSlcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIHJldHVybiBzdFxuICAgIH1cbiAgICAvLyBUaGUgZGVwb3NpdCdzIHNldHRsZSBib3Jyb3dzIGEgY29sb3VyIGJ1ZmZlciBhcyBpdHMgc3BhcmU7IHRoZSBjb2xvdXJcbiAgICAvLyBzZXR0bGUsIHdoZW4gaXQgcnVucywgYm9ycm93cyBhIGRlcG9zaXQgb25lIChib3RoIGFyZSBkb25lIGJ5IHRoZW4pLlxuICAgIC8vIFRoZSBkZXBvc2l0J3Mgc3BhcmU6IHRoZSBjb2xvdXIgcmVjb3JkJ3MgZGVwb3NpdCBidWZmZXIgb25jZSB0aGVcbiAgICAvLyByZWNvcmQgaXMgc3BsaXQgKGl0cyBtb2JpbGUgcGFydCBsaXZlcyBpbiBjYyBmcm9tIHRoZSBmaXJzdCBvcCBvbiksXG4gICAgLy8gZWxzZSB0aGUgdW51c2VkIGNjLlxuICAgIGNvbnN0IGRlcCA9IHNldHRsZShmaWVsZC5hLCBmaWVsZC5iLCBmaWVsZC5jLCB0cnVlLCBjb2xvdXIgPyBmaWVsZC5jYSA6IGZpZWxkLmNjKVxuICAgIC8vICgjNTM2LCDCpzE3LjIwKSBPbmUgcGFpbnQgc28gZmFyOiBpdHMgY29sb3VyIHJlY29yZCBpcyBpdHMgZGVwb3NpdCdzXG4gICAgLy8gbWFzcyB0aW1lcyBvbmUgYWJzb3JwdGlvbiBldmVyeXdoZXJlLCBzbyBpdCBpcyByZWJ1aWx0IGZyb20gdGhlIG1vdmVkXG4gICAgLy8gZGVwb3NpdCBpbiBhIHNpbmdsZSBwYXNzIGluc3RlYWQgb2YgY2FycmllZCB0aHJvdWdoIHRoZSBzY2hlZHVsZVxuICAgIC8vIGFnYWluIOKAlCBoYWxmIHRoZSBzZXR0bGUncyBjb3N0LCB3aGljaCB3YXMgXCLQstGB0ZEg0Y3RgtC+INC00LXQu9C+INC/0YDQuNGC0L7RgNC80LDQttC40LLQsNC10YJcIi5cbiAgICBsZXQgY29sOiB7IG91dDogQWNjdW11bGF0aW9uQnVmZmVyIH1cbiAgICBpZiAoc2NyYXRjaC5wYWludHMuc2l6ZSA8PSAxKSB7XG4gICAgICBjb25zdCBvbmx5ID0gWy4uLnNjcmF0Y2gucGFpbnRzXVswXVxuICAgICAgY29uc3QgdGF1ID0gb25seSA/IHBpZ21lbnRBYnNvcnB0aW9uKG9ubHkuc3BsaXQoJywnKS5tYXAoTnVtYmVyKSBhcyBbbnVtYmVyLCBudW1iZXIsIG51bWJlcl0pIDogWzAsIDAsIDBdXG4gICAgICBjb2wgPSB7IG91dDogZmllbGQuY2MgfVxuICAgICAgb3BzLnB1c2goKCkgPT4ge1xuICAgICAgICB0aGlzLmN0eC5wYXNzZXMoKS5waWdtZW50Q29sb3IoZmllbGQuY2MsIGRlcC5vdXQsIHRhdSlcbiAgICAgIH0pXG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEFscmVhZHkgdHJhbnNwb3J0ZWQgaW4gbG9ja3N0ZXAgd2l0aCBlYWNoIGRlcG9zaXQgc3RlcDsgYW5cbiAgICAgIC8vIGluZGVwZW5kZW50IGNvbG91ciBzY2hlZHVsZSB3b3VsZCBjaGFuZ2UgaXRzIG1vYmlsaXR5IGZyYWN0aW9ucy5cbiAgICAgIGNvbCA9IHBhaXJlZENvbG91ciFcbiAgICB9XG5cbiAgICAvLyBTd2VlcCBjb250YWN0cyBpbiByZWNvcmRlZCBvcmRlci4gT3B0aWNhbCBkZXB0aCBhbmQgcGlnbWVudCB1c2UgdGhlXG4gICAgLy8gc2FtZSBwcmUtY29udGFjdCBwaWdtZW50LCBiZWZvcmUgZWl0aGVyIHJlc3VsdCBpcyBjb3BpZWQgYmFjay5cbiAgICBmb3IgKGNvbnN0IGNvbnRhY3Qgb2YgY29udGFjdHMpIG9wcy5wdXNoKCgpID0+IHtcbiAgICAgIGlmICghZmxvd1RleHR1cmUpIHJldHVyblxuICAgICAgY29uc3QgY2YgPSBjb250YWN0LmZpZWxkLCBjciA9IGNvbnRhY3QucmVjdFxuICAgICAgZ2wuYWN0aXZlVGV4dHVyZShnbC5URVhUVVJFMCk7IGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIGZsb3dUZXh0dXJlKVxuICAgICAgZ2wudGV4SW1hZ2UyRChnbC5URVhUVVJFXzJELCAwLCBnbC5SR0JBLCBjZi53aWR0aCwgY2YuaGVpZ2h0LCAwLCBnbC5SR0JBLCBnbC5VTlNJR05FRF9CWVRFLCBjZi5waXhlbHMpXG4gICAgICBjb25zdCByZWN0OiBbbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyXSA9IFsoY3IueCAtIHgwKSAvIChmaWVsZC53ICogUyksIDEgLSAoY3IueSArIGNyLmggLSB5MCkgLyAoZmllbGQuaCAqIFMpLCBjci53IC8gKGZpZWxkLncgKiBTKSwgY3IuaCAvIChmaWVsZC5oICogUyldXG4gICAgICBjb25zdCBsZWZ0ID0gTWF0aC5tYXgoMCwgTWF0aC5mbG9vcigoY3IueCAtIHgwKSAvIFMpKSwgcmlnaHQgPSBNYXRoLm1pbihmaWVsZC53LCBNYXRoLmNlaWwoKGNyLnggKyBjci53IC0geDApIC8gUykpXG4gICAgICBjb25zdCBib3R0b20gPSBNYXRoLm1heCgwLCBNYXRoLmZsb29yKGZpZWxkLmggLSAoY3IueSArIGNyLmggLSB5MCkgLyBTKSksIHRvcCA9IE1hdGgubWluKGZpZWxkLmgsIE1hdGguY2VpbChmaWVsZC5oIC0gKGNyLnkgLSB5MCkgLyBTKSlcbiAgICAgIGNvbnN0IHNjaXNzb3I6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXJdID0gW2xlZnQsIGJvdHRvbSwgcmlnaHQgLSBsZWZ0LCB0b3AgLSBib3R0b21dXG4gICAgICB0aGlzLmN0eC5wYXNzZXMoKS5icnVzaFBhc3MoZmllbGQsIGZsb3dUZXh0dXJlLCBjb250YWN0LnJhZGl1cywgUywgY29sLm91dCwgZmllbGQuYmFuZCwgZGVwLm91dCwgcmVjdCwgc2Npc3NvcilcbiAgICAgIHRoaXMuY3R4LnBhc3NlcygpLmJydXNoUGFzcyhmaWVsZCwgZmxvd1RleHR1cmUsIGNvbnRhY3QucmFkaXVzLCBTLCBkZXAub3V0LCBmaWVsZC5wcmVzc3VyZSwgZGVwLm91dCwgcmVjdCwgc2Npc3NvcilcbiAgICAgIGZpZWxkLnByZXNzdXJlLmNvcHlSZWdpb25JbnRvKGRlcC5vdXQsIGxlZnQsIGJvdHRvbSwgbGVmdCwgYm90dG9tLCByaWdodCAtIGxlZnQsIHRvcCAtIGJvdHRvbSlcbiAgICAgIGZpZWxkLmJhbmQuY29weVJlZ2lvbkludG8oY29sLm91dCwgbGVmdCwgYm90dG9tLCBsZWZ0LCBib3R0b20sIHJpZ2h0IC0gbGVmdCwgdG9wIC0gYm90dG9tKVxuICAgIH0pXG5cbiAgICAvLyAowqcxNy40MikgVGhlIHByb3Zpc2lvbmFsIGRyeSB0YXJnZXQ6IHRoZSB3ZXQgcmVzdWx0IHdpdGggdGhlIG9uZSB0aWRlXG4gICAgLy8gYWxvbmcgdGhlIHdob2xlIHdhc2gncyBjb250b3VyLCBpbnRvIHRoZSBkZXBvc2l0IGFuZCBjb2xvdXIgYnVmZmVyc1xuICAgIC8vIHRoZSBzZXR0bGUgbGVmdCBmcmVlLiBUaGUgd2FzaCdzIG93biBzdGFuZGluZyBsZXZlbCBhbmQgcmFkaXVzIGFyZVxuICAgIC8vIHRoZSB3aWRlc3QgYW5kIHdldHRlc3Qgb2YgaXRzIG9wZXJhdGlvbnMgKGRyeUN0eCksIG5vdCB0aGlzIG9uZSdzLlxuICAgIGxldCBkcnk6IHsgZGVwOiBBY2N1bXVsYXRpb25CdWZmZXI7IGNvbDogQWNjdW11bGF0aW9uQnVmZmVyIH0gfCBudWxsID0gbnVsbFxuICAgIGlmIChncm91cERyeSkge1xuICAgICAgY29uc3QgZHJ5RGVwID0gZGVwLm91dCA9PT0gZmllbGQuYSA/IGZpZWxkLmMgOiBmaWVsZC5hXG4gICAgICBjb25zdCBkcnlDb2wgPSBjb2wub3V0ID09PSBmaWVsZC5jYSA/IGZpZWxkLmNjIDogZmllbGQuY2FcbiAgICAgIGNvbnN0IGRjID0gc2NyYXRjaC5kcnlDdHhcbiAgICAgIHRoaXMuZ3JvdXBUaWRlT3BzKFxuICAgICAgICBvcHMsIGZpZWxkLCB4MCwgeTAsIE1hdGgubWF4KHJhZGl1c1B4LCBkYz8ucmFkaXVzUHggPz8gMCkgLyBTLCBNYXRoLm1heChzdGFuZGluZywgZGM/LnN0YW5kaW5nID8/IDApLCBzY3JhdGNoLnBhaW50cyxcbiAgICAgICAgZGVwLm91dCwgY29sb3VyID8gY29sLm91dCA6IG51bGwsIGRyeURlcCwgZHJ5Q29sLCBbZmllbGQuYiwgZmllbGQuY2IsIGZpZWxkLnByZXNzdXJlXSwgUyxcbiAgICAgIClcbiAgICAgIGRyeSA9IHsgZGVwOiBkcnlEZXAsIGNvbDogZHJ5Q29sIH1cbiAgICB9XG5cbiAgICAvLyDigKZhbmQgaG9tZSwgdGlsZSBieSB0aWxlIOKAlCBhbmQgdGhpcyBpcyB0aGUgbmV3IHNldHRsZWQgZGVwb3NpdC5cbiAgICBjb25zdCBmaW5pc2ggPSAoKTogdm9pZCA9PiB7XG4gICAgICAvLyAowqcxNy40MykgVGhlIGRyeSB0YXJnZXQgZmlyc3QgY2F0Y2hlcyB1cCB3aXRoIHRoZSBkZXBvc2l0IG92ZXIgdGhlXG4gICAgICAvLyBXSE9MRSBnZXN0dXJlLCB3aW5kb3cgb3Igbm8gd2luZG93OiBhIHN0cm9rZSB3aWRlciB0aGFuIHRoZSBmaWVsZFxuICAgICAgLy8gKGEgcmVwbGF5ZWQgc2hlZXQtd2lkZSBzd2VlcCBmcm9tIGJlZm9yZSB0aGUgc3BhbiBjdXQpIGhhcyBwYWludFxuICAgICAgLy8gb3V0c2lkZSB0aGUgcmVjdCB0aGF0IG5vIHNldHRsZSB0b3VjaGVkLCBhbmQgdGhlIGNvbXBvc2l0ZSByZWFkc1xuICAgICAgLy8gdGhlIGRyeSB0YXJnZXQgLSB0aGF0IHBhaW50IGhhZCBzaW1wbHkgdmFuaXNoZWQgZnJvbSB0aGUgcGljdHVyZS5cbiAgICAgIGlmIChncm91cERyeSkge1xuICAgICAgICBjb25zdCBieDAgPSBNYXRoLmZsb29yKGJvdW5kcy5taW5YKSAtIHBhZCwgYnkwID0gTWF0aC5mbG9vcihib3VuZHMubWluWSkgLSBwYWRcbiAgICAgICAgY29uc3QgYngxID0gTWF0aC5jZWlsKGJvdW5kcy5tYXhYKSArIHBhZCwgYnkxID0gTWF0aC5jZWlsKGJvdW5kcy5tYXhZKSArIHBhZFxuICAgICAgICBmb3IgKGNvbnN0IHRpbGUgb2YgdGFyZ2V0cykge1xuICAgICAgICAgIGNvbnN0IGVudHJ5ID0gc2NyYXRjaC5wZWVrKHRpbGUuYnVmZmVyKVxuICAgICAgICAgIGlmICghZW50cnk/Lmlua0xvYWQpIGNvbnRpbnVlXG4gICAgICAgICAgY29uc3QgcngwID0gTWF0aC5tYXgoYngwLCB0aWxlLm9yaWdpblgpLCByeTAgPSBNYXRoLm1heChieTAsIHRpbGUub3JpZ2luWSlcbiAgICAgICAgICBjb25zdCByeDEgPSBNYXRoLm1pbihieDEsIHRpbGUub3JpZ2luWCArIHRpbGUuYnVmZmVyLndpZHRoKSwgcnkxID0gTWF0aC5taW4oYnkxLCB0aWxlLm9yaWdpblkgKyB0aWxlLmJ1ZmZlci5oZWlnaHQpXG4gICAgICAgICAgaWYgKHJ4MSA8PSByeDAgfHwgcnkxIDw9IHJ5MCkgY29udGludWVcbiAgICAgICAgICBjb25zdCB0eCA9IHJ4MCAtIHRpbGUub3JpZ2luWCwgdHkgPSB0aWxlLmJ1ZmZlci5oZWlnaHQgLSAocnkxIC0gdGlsZS5vcmlnaW5ZKVxuICAgICAgICAgIGlmICghZW50cnkuaW5rRHJ5KSB7IGVudHJ5Lmlua0RyeSA9IHRoaXMuY3R4LnBvb2woKS5hY3F1aXJlKHRpbGUuYnVmZmVyLndpZHRoLCB0aWxlLmJ1ZmZlci5oZWlnaHQpOyBlbnRyeS5pbmtMb2FkLmNvcHlUbyhlbnRyeS5pbmtEcnkpIH1cbiAgICAgICAgICBlbHNlIGVudHJ5Lmlua0xvYWQuY29weVJlZ2lvbkludG8oZW50cnkuaW5rRHJ5LCB0eCwgdHksIHR4LCB0eSwgcngxIC0gcngwLCByeTEgLSByeTApXG4gICAgICAgICAgaWYgKGVudHJ5Lmlua0NvbG9yKSB7XG4gICAgICAgICAgICBpZiAoIWVudHJ5LmNvbG9yRHJ5KSB7IGVudHJ5LmNvbG9yRHJ5ID0gdGhpcy5jdHgucG9vbCgpLmFjcXVpcmUodGlsZS5idWZmZXIud2lkdGgsIHRpbGUuYnVmZmVyLmhlaWdodCk7IGVudHJ5Lmlua0NvbG9yLmNvcHlUbyhlbnRyeS5jb2xvckRyeSkgfVxuICAgICAgICAgICAgZWxzZSBlbnRyeS5pbmtDb2xvci5jb3B5UmVnaW9uSW50byhlbnRyeS5jb2xvckRyeSwgdHgsIHR5LCB0eCwgdHksIHJ4MSAtIHJ4MCwgcnkxIC0gcnkwKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgZm9yIChjb25zdCB7IHRpbGUsIG94MCwgb3kwLCBveDEsIG95MSB9IG9mIG92ZXJsYXBzKSB7XG4gICAgICAgIGNvbnN0IGVudHJ5ID0gc2NyYXRjaC5wZWVrKHRpbGUuYnVmZmVyKVxuICAgICAgICBpZiAoIWVudHJ5Py5pbmtMb2FkKSBjb250aW51ZVxuICAgICAgICBjb25zdCB0eCA9IG94MCAtIHRpbGUub3JpZ2luWCwgdHkgPSB0aWxlLmJ1ZmZlci5oZWlnaHQgLSAob3kxIC0gdGlsZS5vcmlnaW5ZKSwgdHcgPSBveDEgLSBveDAsIHRoID0gb3kxIC0gb3kwXG4gICAgICAgIC8vICjCpzE3LjQ0KSBBIGZpbG0gdGhhdCBiZWdhbiB3aGlsZSB0aGUgc2V0dGxlIHJhbiAodGhlIG5leHQgY2h1bmsncyxcbiAgICAgICAgLy8gc2VlIG5ld0ZpbG0pIHNpdHMgb24gYSBiYXNlIGNvcGllZCBiZWZvcmUgaXQgbGFuZGVkOiB0aGUgc2V0dGxlZFxuICAgICAgICAvLyByZXN1bHQgZ29lcyBvbnRvIHRoYXQgQkFTRSwgYW5kIHRoZSBkZXBvc2l0IGlzIHJlYnVpbHQgYXMgYmFzZSArXG4gICAgICAgIC8vIGZpbG0gYmVsb3cgLSBvciB0aGUgbmV4dCBjaHVuaydzIHBhaW50IHZhbmlzaGVkIGZyb20gdGhlIG92ZXJsYXBcbiAgICAgICAgLy8gdW50aWwgdGhlIGdlc3R1cmUgZW5kZWQuIE90aGVyd2lzZSBpdCBnb2VzIG9udG8gdGhlIGRlcG9zaXQuXG4gICAgICAgIGNvbnN0IHJ1bm5pbmdGaWxtID0gZW50cnkuZmlsbUdlc3R1cmUgIT09IGdlc3R1cmUgJiYgZW50cnkuZmlsbUdlc3R1cmUgPT09IHNjcmF0Y2guZ2VzdHVyZSAmJiAhIWVudHJ5LnN0cm9rZUluayAmJiAhIWVudHJ5Lmlua0Jhc2VcbiAgICAgICAgY29uc3Qgc2V0dGxlZEluayA9IHJ1bm5pbmdGaWxtID8gZW50cnkuaW5rQmFzZSEgOiBlbnRyeS5pbmtMb2FkXG4gICAgICAgIGNvbnN0IHNuYXAgPSBzbmFwc2hvdHMuZ2V0KHRpbGUuYnVmZmVyKVxuICAgICAgICBmcm9tRmllbGQoZGVwLm91dCwgYTAsIHRpbGUsIG94MCwgb3kwLCBveDEsIG95MSwgc2V0dGxlZEluaywgc25hcD8uaW5rID8/IHNldHRsZWRJbmspXG4gICAgICAgIGlmIChlbnRyeS5pbmtTZXR0bGVkKSBzZXR0bGVkSW5rLmNvcHlSZWdpb25JbnRvKGVudHJ5Lmlua1NldHRsZWQsIHR4LCB0eSwgdHgsIHR5LCB0dywgdGgpXG4gICAgICAgIC8vICjCpzE3LjI0KSDigKZhbmQgdGhlIGNvdmVyYWdlIHRoZSB3YXRlciBmcm9udCBleHRlbmRlZCAtIE1FUkdFRCBieVxuICAgICAgICAvLyBtYXggKMKnMTcuNDQpOiB0aGUgZ2VzdHVyZSBtYXkgaGF2ZSBnb25lIG9uIHN0YW1waW5nIHRoZSBuZXh0XG4gICAgICAgIC8vIGNodW5rJ3MgY292ZXJhZ2Ugd2hpbGUgdGhlIHNldHRsZSByYW4uXG4gICAgICAgIGlmIChTID09PSAxKSB7XG4gICAgICAgICAgY29uc3Qgc3ggPSBveDAgLSB4MCwgc3kgPSBmaWVsZC5oIC0gKG95MSAtIHkwKVxuICAgICAgICAgIGVudHJ5LmNvdmVyYWdlLmNvcHlSZWdpb25JbnRvKGZpZWxkLm1hc2ssIHR4LCB0eSwgc3gsIHN5LCB0dywgdGgpXG4gICAgICAgICAgdGhpcy5jdHgucGFzc2VzKCkuZmllbGRPcChmaWVsZC5iYW5kLCBmaWVsZC5jb3ZlcmFnZSwgZmllbGQubWFzaywgMjAsIDApXG4gICAgICAgICAgZmllbGQuYmFuZC5jb3B5UmVnaW9uSW50byhlbnRyeS5jb3ZlcmFnZSwgc3gsIHN5LCB0eCwgdHksIHR3LCB0aClcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdCB0bXAgPSB0aGlzLmN0eC5wb29sKCkuYWNxdWlyZSh0aWxlLmJ1ZmZlci53aWR0aCwgdGlsZS5idWZmZXIuaGVpZ2h0KVxuICAgICAgICAgIHRoaXMuY3R4LnBhc3NlcygpLndjUmVzYW1wbGUodG1wLCB0eCwgdHksIHR3LCB0aCwgZmllbGQuY292ZXJhZ2UsIChveDAgLSB4MCkgLyBTLCBmaWVsZC5oIC0gKG95MSAtIHkwKSAvIFMsIDEgLyBTLCAyLCBudWxsLCBlbnRyeS5jb3ZlcmFnZSwgZmllbGRSZWN0KVxuICAgICAgICAgIHRtcC5jb3B5UmVnaW9uSW50byhlbnRyeS5jb3ZlcmFnZSwgdHgsIHR5LCB0eCwgdHksIHR3LCB0aClcbiAgICAgICAgICB0aGlzLmN0eC5wb29sKCkucmVsZWFzZSh0bXApXG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc2V0dGxlZENvbG9yID0gZW50cnkuaW5rQ29sb3IgPyAocnVubmluZ0ZpbG0gJiYgZW50cnkuY29sb3JCYXNlID8gZW50cnkuY29sb3JCYXNlIDogZW50cnkuaW5rQ29sb3IpIDogbnVsbFxuICAgICAgICAvLyAowqcxNy40NCkgT25lIHBhaW50OiBpdHMgY29sb3VyIHJlY29yZCBpcyB0aGUgZGVwb3NpdCB0aW1lcyBvbmVcbiAgICAgICAgLy8gYWJzb3JwdGlvbiAowqcxNy4yMCksIHJlYnVpbHQgYXQgRlVMTCByZXNvbHV0aW9uIGZyb20gdGhlIGRlcG9zaXRcbiAgICAgICAgLy8ganVzdCBicm91Z2h0IGhvbWUgLSB0aGUgZmllbGQncyByZWJ1aWx0IHJlY29yZCBhbmQgdGhlIHJlY29yZGVkIG9uZVxuICAgICAgICAvLyBhcmUgbm90IHRoZSBzYW1lIHF1YW50aXR5LCBhbmQgYSBjaGFuZ2UgYmV0d2VlbiB0aGVtIGNhbWUgYmFjayBhc1xuICAgICAgICAvLyBhIHBhbGVyLCB3YXNoZWQtb3V0IG1hcmsuXG4gICAgICAgIGNvbnN0IHJlYnVpbGRDb2xvdXIgPSAodG86IEFjY3VtdWxhdGlvbkJ1ZmZlciwgZnJvbTogQWNjdW11bGF0aW9uQnVmZmVyKTogdm9pZCA9PlxuICAgICAgICAgIHRoaXMuY3R4LnBhc3NlcygpLmZpZWxkT3AodG8sIGZyb20sIGZyb20sIDIsIDEsIHsgYzogZnJvbSwgZDogZnJvbSwgdGF1OiBzaW5nbGVUYXUsIHNjaXNzb3I6IFt0eCwgdHksIHR3LCB0aF0gfSlcbiAgICAgICAgaWYgKHNldHRsZWRDb2xvcikge1xuICAgICAgICAgIGlmIChTID4gMSAmJiAhY29sb3VyKSByZWJ1aWxkQ29sb3VyKHNldHRsZWRDb2xvciwgc2V0dGxlZEluaylcbiAgICAgICAgICBlbHNlIGZyb21GaWVsZChjb2wub3V0LCBjYTAsIHRpbGUsIG94MCwgb3kwLCBveDEsIG95MSwgc2V0dGxlZENvbG9yLCBzbmFwPy5jb2xvciA/PyBzZXR0bGVkQ29sb3IpXG4gICAgICAgICAgaWYgKGVudHJ5LmNvbG9yU2V0dGxlZCkgc2V0dGxlZENvbG9yLmNvcHlSZWdpb25JbnRvKGVudHJ5LmNvbG9yU2V0dGxlZCwgdHgsIHR5LCB0eCwgdHksIHR3LCB0aClcbiAgICAgICAgfVxuICAgICAgICBpZiAocnVubmluZ0ZpbG0pIHtcbiAgICAgICAgICBjb25zdCByZWN0OiBbbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyXSA9IFt0eCwgdHksIHR3LCB0aF1cbiAgICAgICAgICB0aGlzLmN0eC5wYXNzZXMoKS5maWVsZE9wKGVudHJ5Lmlua0xvYWQsIGVudHJ5Lmlua0Jhc2UhLCBlbnRyeS5zdHJva2VJbmshLCAxLCAxLCB7IHNjaXNzb3I6IHJlY3QgfSlcbiAgICAgICAgICBpZiAoZW50cnkuaW5rQ29sb3IgJiYgZW50cnkuY29sb3JCYXNlICYmIGVudHJ5LnN0cm9rZUNvbG9yKSB0aGlzLmN0eC5wYXNzZXMoKS5maWVsZE9wKGVudHJ5Lmlua0NvbG9yLCBlbnRyeS5jb2xvckJhc2UsIGVudHJ5LnN0cm9rZUNvbG9yLCAxLCAxLCB7IHNjaXNzb3I6IHJlY3QgfSlcbiAgICAgICAgfVxuICAgICAgICBpZiAoZHJ5KSB7XG4gICAgICAgICAgLy8gKMKnMTcuNDMpIEZpcnN0IHRoZSBzZXR0bGVkIHdldCBzdGF0ZSBvdmVyIHRoZSB3aG9sZSBvZiB0aGlzXG4gICAgICAgICAgLy8gdGlsZSdzIHBhcnQgb2YgdGhlIGZpZWxkICh0aGUgZmllbGQgaXMgY2FwcGVkOyBwYXN0IHRoZSB3aW5kb3dcbiAgICAgICAgICAvLyB0aGUgZHJ5IHRhcmdldCBrZWVwcyB1cCB3aXRoIHRoZSBkZXBvc2l0KSwgdGhlbiB0aGUgZHJ5IHJlc3VsdFxuICAgICAgICAgIC8vIG92ZXIgdGhlIGZpZWxkIGxlc3MgaXRzIG1hcmdpbiAtIHRoZSB0aWRlJ3MgY2hhbmdlIG9uIHRvcC5cbiAgICAgICAgICBpZiAoIWVudHJ5Lmlua0RyeSkgeyBlbnRyeS5pbmtEcnkgPSB0aGlzLmN0eC5wb29sKCkuYWNxdWlyZSh0aWxlLmJ1ZmZlci53aWR0aCwgdGlsZS5idWZmZXIuaGVpZ2h0KTsgc2V0dGxlZEluay5jb3B5VG8oZW50cnkuaW5rRHJ5KSB9XG4gICAgICAgICAgZWxzZSBzZXR0bGVkSW5rLmNvcHlSZWdpb25JbnRvKGVudHJ5Lmlua0RyeSwgdHgsIHR5LCB0eCwgdHksIHR3LCB0aClcbiAgICAgICAgICBpZiAoc2V0dGxlZENvbG9yKSB7XG4gICAgICAgICAgICBpZiAoIWVudHJ5LmNvbG9yRHJ5KSB7IGVudHJ5LmNvbG9yRHJ5ID0gdGhpcy5jdHgucG9vbCgpLmFjcXVpcmUodGlsZS5idWZmZXIud2lkdGgsIHRpbGUuYnVmZmVyLmhlaWdodCk7IHNldHRsZWRDb2xvci5jb3B5VG8oZW50cnkuY29sb3JEcnkpIH1cbiAgICAgICAgICAgIGVsc2Ugc2V0dGxlZENvbG9yLmNvcHlSZWdpb25JbnRvKGVudHJ5LmNvbG9yRHJ5LCB0eCwgdHksIHR4LCB0eSwgdHcsIHRoKVxuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBXaGVyZSB0aGUgZmllbGQgd2FzIGNsaXBwZWQgYnkgdGhlIHRpbGUncyBvd24gZWRnZSB0aGVyZSBpcyBub1xuICAgICAgICAgIC8vIG1hcmdpbiB0byBsZWF2ZSwgdGhlIHRpbGUgZW5kcyB0aGVyZS5cbiAgICAgICAgICBjb25zdCBpeDAgPSBveDAgPT09IHgwICYmIHgwID4gbWluWCA/IG94MCArIGRyeU1hcmdpbiA6IG94MCwgaXkwID0gb3kwID09PSB5MCAmJiB5MCA+IG1pblkgPyBveTAgKyBkcnlNYXJnaW4gOiBveTBcbiAgICAgICAgICBjb25zdCBpeDEgPSBveDEgPT09IHgxICYmIHgxIDwgbWF4WCA/IG94MSAtIGRyeU1hcmdpbiA6IG94MSwgaXkxID0gb3kxID09PSB5MSAmJiB5MSA8IG1heFkgPyBveTEgLSBkcnlNYXJnaW4gOiBveTFcbiAgICAgICAgICBpZiAoaXgxIDw9IGl4MCB8fCBpeTEgPD0gaXkwKSBjb250aW51ZVxuICAgICAgICAgIGZyb21GaWVsZChkcnkuZGVwLCBkZXAub3V0LCB0aWxlLCBpeDAsIGl5MCwgaXgxLCBpeTEsIGVudHJ5Lmlua0RyeSwgZW50cnkuaW5rRHJ5KVxuICAgICAgICAgIGlmIChlbnRyeS5jb2xvckRyeSkge1xuICAgICAgICAgICAgaWYgKFMgPiAxICYmICFjb2xvdXIpIHJlYnVpbGRDb2xvdXIoZW50cnkuY29sb3JEcnksIGVudHJ5Lmlua0RyeSlcbiAgICAgICAgICAgIGVsc2UgZnJvbUZpZWxkKGRyeS5jb2wsIGNvbC5vdXQsIHRpbGUsIGl4MCwgaXkwLCBpeDEsIGl5MSwgZW50cnkuY29sb3JEcnksIGVudHJ5LmNvbG9yRHJ5KVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGEwKSB0aGlzLmN0eC5wb29sKCkucmVsZWFzZShhMClcbiAgICAgIGlmIChjYTApIHRoaXMuY3R4LnBvb2woKS5yZWxlYXNlKGNhMClcbiAgICAgIGZvciAoY29uc3Qgc25hcCBvZiBzbmFwc2hvdHMudmFsdWVzKCkpIHsgdGhpcy5jdHgucG9vbCgpLnJlbGVhc2Uoc25hcC5pbmspOyBpZiAoc25hcC5jb2xvcikgdGhpcy5jdHgucG9vbCgpLnJlbGVhc2Uoc25hcC5jb2xvcikgfVxuICAgIH1cbiAgICByZXR1cm4geyBvcHMsIGZpbmlzaCB9XG4gIH1cblxuICAvKiogKCM1MzYsIMKnMTcuNDIpIFRoZSBncm91cCB0aWRlIGFzIGVudHJpZXMgb2YgYG9wc2A6IG92ZXIgYSBzZXR0bGUgZmllbGRcbiAgICogIHdob3NlIGNvdmVyYWdlIGhvbGRzIHRoZSB3YXNoJ3Mgd2hvbGUgY292ZXJhZ2UgKHRoZSB1bmlvbiBvZiBldmVyeVxuICAgKiAgb3BlcmF0aW9uJ3MgZG9tYWluKSwgdGhlIHdldCBkZXBvc2l0IGBkZXBgIGFuZCBpdHMgY29sb3VyIHJlY29yZCBgY29sYFxuICAgKiAgKG51bGwgd2l0aCBvbmUgcGFpbnQ6IHJlYnVpbHQgZnJvbSB0aGUgZHJpZWQgZGVwb3NpdCkgZ2V0IHRoZSBPTkUgdGlkZVxuICAgKiAgYWxvbmcgdGhlIGNvdmVyYWdlJ3Mgb3V0ZXIgY29udG91ciwgaW50byBgb3V0RGVwYCBhbmQgYG91dENvbGAuIGBmcmVlYFxuICAgKiAgaXMgdGhyZWUgYnVmZmVycyB0aGUgcm91dGluZSBtYXkgc2NyaWJibGUgb247IGBtYXNrYCwgYHByZXNzdXJlYCBhbmRcbiAgICogIGBiYW5kYCBpdCB0YWtlcyBmb3IgaXRzZWxmLiBUaGUgYmFuZCBpcyB3aGF0IHRoZSBzZXR0bGUncyBvd24gdGlkZSB1c2VkXG4gICAqICAobW9kZSA2KSwgcmVhZCBvZmYgYW4gaW53YXJkIHJlbGF4YXRpb24gc2VlZGVkIGZyb20gb3V0c2lkZSB0aGVcbiAgICogIGNvdmVyYWdlIChtb2RlIDE5KSAtIG5vIGJhY2tydW4sIG5vIFwiZWFybGllciBtYXJrXCIsIHRoZSB3aG9sZSB1bmlvbiBvbmVcbiAgICogIGRvbWFpbiB3aXRoIHRoZSBkb21lIGZ1bGwgdGhyb3VnaG91dC4gKi9cbiAgZ3JvdXBUaWRlT3BzKFxuICAgIG9wczogQXJyYXk8KCkgPT4gdm9pZD4sIGZpZWxkOiBTZXR0bGVGaWVsZCwgeDA6IG51bWJlciwgeTA6IG51bWJlcixcbiAgICByYWRpdXNQeDogbnVtYmVyLCBzdGFuZGluZzogbnVtYmVyLCBwYWludHM6IFJlYWRvbmx5U2V0PHN0cmluZz4sXG4gICAgZGVwOiBBY2N1bXVsYXRpb25CdWZmZXIsIGNvbDogQWNjdW11bGF0aW9uQnVmZmVyIHwgbnVsbCwgb3V0RGVwOiBBY2N1bXVsYXRpb25CdWZmZXIsIG91dENvbDogQWNjdW11bGF0aW9uQnVmZmVyLFxuICAgIGZyZWU6IFtBY2N1bXVsYXRpb25CdWZmZXIsIEFjY3VtdWxhdGlvbkJ1ZmZlciwgQWNjdW11bGF0aW9uQnVmZmVyXSxcbiAgICAvKiogKMKnMTcuNDQpIFdvcmxkIHB4IHBlciBmaWVsZCBjZWxsOyByYWRpdXNQeCBpcyBpbiBjZWxscyBhbHJlYWR5LiAqL1xuICAgIHNjYWxlID0gMSxcbiAgKTogdm9pZCB7XG4gICAgLy8gKMKnMTcuNDQpIEEgd29ybGQgd2lkdGggaW4gY2VsbHMgLSBzZWUgdGhlIHNldHRsZSdzIG93biBgd2lkdGhgLlxuICAgIGNvbnN0IHdpZHRoID0gTWF0aC5tYXgoMSwgTWF0aC5yb3VuZChNYXRoLm1heCgyLCBNYXRoLm1pbihXQ19SSU1fQkFORF9QWCwgTWF0aC5yb3VuZChyYWRpdXNQeCAqIHNjYWxlIC8gNSkpKSAvIHNjYWxlKSlcbiAgICBjb25zdCBjb3N0TWF4SW4gPSB3aWR0aCArIDNcbiAgICBjb25zdCBpblN0ZXBzID0gd2lkdGggKyAyXG4gICAgY29uc3QgW3QxLCB0MiwgdDNdID0gZnJlZVxuICAgIC8vIFRoZSBzZWVkcyBmcm9tIHRoZSBjb3ZlcmFnZSAobW9kZSAxOSk6IHRoZSBpbndhcmQgcGFzcydzIGludG8gYG1hc2tgXG4gICAgLy8gKGluc2lkZSB1bnJlYWNoZWQsIG91dHNpZGUgdGhlIHNvdXJjZSksIGEgc3RhbmQtaW4gb3V0d2FyZCBjb3N0IGludG9cbiAgICAvLyBgcHJlc3N1cmVgICgwIGluc2lkZSwgMSBvdXRzaWRlKTsgdGhlbiB0aGUgaW53YXJkIHJlbGF4YXRpb24gb3ZlciB0aGVcbiAgICAvLyByZWxpZWYgYXMgdGhlIHNldHRsZSBydW5zIGl0LCB0aGUgZmlyc3QgdHdvIGNlbGxzIGZsYXQgc28gdGhlIHBlYWsgaXNcbiAgICAvLyBhIGNvbnRpbnVvdXMgbGluZS4gYGJhbmRgIGlzIHRoZSByZWxheGF0aW9uJ3MgcGluZy1wb25nIHBhcnRuZXIgdW50aWxcbiAgICAvLyBpdCBpcyB3cml0dGVuLlxuICAgIG9wcy5wdXNoKCgpID0+IHtcbiAgICAgIHRoaXMuY3R4LnBhc3NlcygpLmZpZWxkT3AoZmllbGQubWFzaywgZmllbGQuY292ZXJhZ2UsIGZpZWxkLmNvdmVyYWdlLCAxOSwgMC4wMDIsIHsgZGlyOiBbMSwgMF0gfSlcbiAgICAgIHRoaXMuY3R4LnBhc3NlcygpLmZpZWxkT3AoZmllbGQucHJlc3N1cmUsIGZpZWxkLmNvdmVyYWdlLCBmaWVsZC5jb3ZlcmFnZSwgMTksIDAuMDAyKVxuICAgIH0pXG4gICAgY29uc3QgcHAgPSB7IHNyYzogZmllbGQubWFzaywgZHN0OiBmaWVsZC5iYW5kIH1cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGluU3RlcHM7IGkgKz0gNCkge1xuICAgICAgY29uc3QgbiA9IE1hdGgubWluKDQsIGluU3RlcHMgLSBpKVxuICAgICAgb3BzLnB1c2goKCkgPT4ge1xuICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IG47IGorKykge1xuICAgICAgICAgIGNvbnN0IGZsYXQgPSBpICsgaiA8IDJcbiAgICAgICAgICB0aGlzLmN0eC5wYXNzZXMoKS53YXRlckZyb250U3RlcChmaWVsZCwgeDAsIHkwLCBXQ19GUk9OVF9EUllfQ09TVCwgcHAuc3JjLCBwcC5kc3QsIGNvc3RNYXhJbiwgZmxhdCA/IDAgOiBXQ19GUk9OVF9DTElNQl9JTiwgZmxhdCA/IDEgOiBXQ19GUk9OVF9GTE9PUl9JTiwgMSwgc2NhbGUpXG4gICAgICAgICAgY29uc3QgdCA9IHBwLnNyYzsgcHAuc3JjID0gcHAuZHN0OyBwcC5kc3QgPSB0XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGkgKyBuID49IGluU3RlcHMgJiYgcHAuc3JjICE9PSBmaWVsZC5tYXNrKSB0aGlzLmN0eC5wYXNzZXMoKS5maWVsZE9wKGZpZWxkLm1hc2ssIHBwLnNyYywgcHAuc3JjLCAxLCAwKVxuICAgICAgfSlcbiAgICB9XG4gICAgY29uc3QgZ2F0aGVyOiBBcnJheTxbbnVtYmVyLCBudW1iZXJdPiA9IFtdXG4gICAgZm9yIChsZXQgc3QgPSAxOyBzdCA8PSBNYXRoLm1heCgxLCByYWRpdXNQeCAvIDIpICYmIGdhdGhlci5sZW5ndGggPCA2OyBzdCAqPSAyKSBnYXRoZXIucHVzaChbc3QsIHN0XSlcbiAgICAvLyBBIDN4MyBiaW5vbWlhbCBhdCBlYWNoIHN0cmlkZSBvZiBgZ2F0aGVyYCwgYGZyb21gIHVudG91Y2hlZCwgdGhlIHJlc3VsdFxuICAgIC8vIGluIGBvdXRgICh3aGljaCBtYXkgYmUgb25lIG9mIHRoZSB0ZW1wb3JhcmllcykuXG4gICAgY29uc3QgYmx1clRvID0gKG91dDogQWNjdW11bGF0aW9uQnVmZmVyLCBmcm9tOiBBY2N1bXVsYXRpb25CdWZmZXIsIHRtcEE6IEFjY3VtdWxhdGlvbkJ1ZmZlciwgdG1wQjogQWNjdW11bGF0aW9uQnVmZmVyKTogdm9pZCA9PiB7XG4gICAgICBsZXQgZ3MgPSBmcm9tLCBnZCA9IHRtcEFcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZ2F0aGVyLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHRoaXMuY3R4LnBhc3NlcygpLmZpZWxkT3AoZ2QsIGdzLCBncywgNSwgMCwgeyBkaXI6IGdhdGhlcltpXSB9KVxuICAgICAgICBjb25zdCBuZXh0ID0gZ2QgPT09IHRtcEEgPyB0bXBCIDogdG1wQVxuICAgICAgICBncyA9IGdkOyBnZCA9IG5leHRcbiAgICAgIH1cbiAgICAgIGlmIChncyAhPT0gb3V0KSB0aGlzLmN0eC5wYXNzZXMoKS5maWVsZE9wKG91dCwgZ3MsIGdzLCAxLCAwKVxuICAgIH1cbiAgICBjb25zdCB0aWRlV2F0ZXIgPSBNYXRoLm1pbigxLCBzdGFuZGluZyAvIFdDX1RJREVfU1RBTkRJTkdfRlVMTClcbiAgICBjb25zdCBzaGFyZSA9IHdhdGVyY29sb3JSaW1TaGFyZShXQ19USURFX1JJTSwgcmFkaXVzUHgsIHdpZHRoKSAqIHRpZGVXYXRlclxuICAgIGNvbnN0IGNvc3RNYXggPSA4XG4gICAgb3BzLnB1c2goKCkgPT4ge1xuICAgICAgLy8gVGhlIGJhbmQgKG1vZGUgNikgb3ZlciB0aGUgd2hvbGUgdW5pb246IGNvc3RPdXQgMCBpbnNpZGUgdGhlXG4gICAgICAvLyBjb3ZlcmFnZSBzbyBgaW5zaWRlYCBhbmQgdGhlIGRvbWUgYXJlIDEgdGhyb3VnaG91dCwgbm8gYmFja3J1biAodGF1XG4gICAgICAvLyAwKSwgbm8gXCJlYXJsaWVyIG1hcmtcIiAodGhlIHNlZWQncyAuYiBpcyBlbXB0eSksIHRoZSBzdG9vZCByZWNvcmRcbiAgICAgIC8vIGZyb20gdGhlIGNvdmVyYWdlIGFnYWluc3QgdGhlIHdhc2gncyB3ZXR0ZXN0IHN0YW5kaW5nIGxldmVsLiBUaGVuXG4gICAgICAvLyB0aGUgYmFuZCBnYXRoZXJlZCBieSB0aGUgcmltJ3Mga2VybmVsLCBpbnRvIGBtYXNrYC5cbiAgICAgIHRoaXMuY3R4LnBhc3NlcygpLmZpZWxkT3AoZmllbGQuYmFuZCwgZmllbGQucHJlc3N1cmUsIGZpZWxkLmNvdmVyYWdlLCA2LCAwLCB7XG4gICAgICAgIGM6IGZpZWxkLm1hc2ssIGQ6IGZpZWxkLnByZXNzdXJlLCBiYW5kOiBbMC41LCB3aWR0aCAvIGNvc3RNYXhJbl0sIHNpemU6IFsxIC8gY29zdE1heCwgMSAvIGNvc3RNYXhJbl0sXG4gICAgICAgIG9yaWdpbjogW3N0YW5kaW5nLCAwXSwgZGlyOiBbMSwgMV0sIHRhdTogWzAsIDAsIDBdLCB3b3JsZDogW3gwIC8gc2NhbGUsIC0oeTAgLyBzY2FsZSArIGZpZWxkLmgpLCBzY2FsZV0sXG4gICAgICB9KVxuICAgICAgYmx1clRvKGZpZWxkLm1hc2ssIGZpZWxkLmJhbmQsIHQxLCB0MylcbiAgICB9KVxuICAgIC8vIFRoZSB0aWRlOiBgc2hhcmVgIG9mIEFMTCB0aGUgcGFpbnQgaW5zaWRlIChtb2RlIDcgYnkgYmFuZCAuZywgdGhlIHdob2xlXG4gICAgLy8gdW5pb24pIGdhdGhlcmVkIG9udG8gdGhlIGJhbmQgKG1vZGUgMTQpIC0gdGhlIGRlcG9zaXQgYW5kLCB3aXRoIHR3b1xuICAgIC8vIHBhaW50cyBvciBtb3JlLCB0aGUgY29sb3VyIHJlY29yZCBieSB0aGUgc2FtZSBmcmFjdGlvbnMuXG4gICAgY29uc3QgdGlkZSA9IChwYWludDogQWNjdW11bGF0aW9uQnVmZmVyLCBvdXQ6IEFjY3VtdWxhdGlvbkJ1ZmZlcik6IHZvaWQgPT4ge1xuICAgICAgdGhpcy5jdHgucGFzc2VzKCkuZmllbGRPcCh0MSwgcGFpbnQsIHBhaW50LCA3LCBzaGFyZSwgeyBkOiBmaWVsZC5iYW5kIH0pXG4gICAgICBibHVyVG8odDIsIHQxLCB0MiwgdDMpXG4gICAgICB0aGlzLmN0eC5wYXNzZXMoKS5maWVsZE9wKG91dCwgcGFpbnQsIHQyLCAxNCwgc2hhcmUsIHsgYzogZmllbGQubWFzaywgZDogZmllbGQuYmFuZCB9KVxuICAgIH1cbiAgICBvcHMucHVzaCgoKSA9PiB0aWRlKGRlcCwgb3V0RGVwKSlcbiAgICBpZiAoY29sKSB7XG4gICAgICBvcHMucHVzaCgoKSA9PiB0aWRlKGNvbCwgb3V0Q29sKSlcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3Qgb25seSA9IFsuLi5wYWludHNdWzBdXG4gICAgICBjb25zdCB0YXUgPSBvbmx5ID8gcGlnbWVudEFic29ycHRpb24ob25seS5zcGxpdCgnLCcpLm1hcChOdW1iZXIpIGFzIFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSkgOiBbMCwgMCwgMF1cbiAgICAgIG9wcy5wdXNoKCgpID0+IHRoaXMuY3R4LnBhc3NlcygpLmZpZWxkT3Aob3V0Q29sLCBvdXREZXAsIG91dERlcCwgMiwgMSwgeyBjOiBvdXREZXAsIGQ6IG91dERlcCwgdGF1OiBbdGF1WzBdLCB0YXVbMV0sIHRhdVsyXV0gfSkpXG4gICAgfVxuICB9XG5cbiAgZGVzdHJveVRleHR1cmVzKCk6IHZvaWQge1xuICAgIHRoaXMuZ2wuZGVsZXRlVGV4dHVyZSh0aGlzLl9icnVzaEZsb3dUZXgpXG4gICAgdGhpcy5nbC5kZWxldGVUZXh0dXJlKHRoaXMuX2ZvcmVpZ25XYXRlclRleClcbiAgfVxuXG4gIGZvcmdldFRleHR1cmVzKCk6IHZvaWQge1xuICAgIHRoaXMuX2JydXNoRmxvd1RleCA9IG51bGxcbiAgICB0aGlzLl9mb3JlaWduV2F0ZXJUZXggPSBudWxsXG4gIH1cbn1cbiJdfQ==