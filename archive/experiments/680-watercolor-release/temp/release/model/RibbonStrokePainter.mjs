import { clamp } from "lodash-es";
//#region apps/web/src/engine/src/watercolor/canonicalRadius.ts
/** Diagnostic solver geometry only: use the float32 size/aspect that the
* existing dab codec actually records. Source nib geometry stays untouched. */
function canonicalMinorRadius(size, multiplier) {
	return Math.fround(size) * .5 * multiplier;
}
function canonicalMajorRadius(size, aspect, multiplier) {
	return canonicalMinorRadius(size, multiplier) * Math.max(1, Math.fround(aspect));
}
//#endregion
//#region apps/web/src/engine/src/presets/digitalBrushPresets.ts
/** Piecewise-linear read of `curve` at `x`, clamped to the end values outside
*  the authored range.
*
*  Linear search rather than a binary one on purpose: a curve is 2-5 points, and
*  this runs once per dab per output. A loop over four numbers beats the branch
*  misprediction of anything cleverer, and it keeps the function obviously pure
*  — which matters more than speed here, because replay has to reproduce it dab
*  for dab (ADR 002). */
function curveAt(curve, x) {
	const t = clamp(x, 0, 1);
	if (t <= curve[0][0]) return curve[0][1];
	for (let i = 1; i < curve.length; i++) {
		const [x1, y1] = curve[i];
		if (t > x1) continue;
		const [x0, y0] = curve[i - 1];
		const span = x1 - x0;
		return span <= 0 ? y1 : y0 + (y1 - y0) * ((t - x0) / span);
	}
	return curve[curve.length - 1][1];
}
/** The round tip most brushes wear, spelled once. */
function roundTip(hardness) {
	return {
		kind: "round",
		hardness,
		aspect: 1,
		rotation: "path",
		angle: 0
	};
}
function bitmapTip(mask, rotation, hardness = .7) {
	return {
		kind: "bitmap",
		mask,
		hardness,
		aspect: 1,
		rotation,
		angle: 0
	};
}
/** Full-range identity: pressure 0 draws nothing, pressure 1 draws the size on
*  the slider. The floor is not 0 — a stylus reports near-zero noise at contact
*  and a dab of literally zero width is a gap in the stroke, not a light touch.
*  Same problem BRUSH_PEN_MIN_PRESSURE guards from the other side. */
var SIZE_FULL = [
	[0, .08],
	[.5, .55],
	[1, 1]
];
/** An inking response: a knee rather than a ramp. Width is nearly flat through
*  the middle of the range and opens up only when the hand leans in, which is
*  what lets a line be *held* at a width instead of wobbling with the hand's
*  own pressure noise. The liner arrived at the same shape from the other
*  direction (#532). */
var SIZE_KNEE = [
	[0, .25],
	[.35, .42],
	[.75, .62],
	[1, 1]
];
/** (#573) Size that answers the hand but never collapses: a textured or
*  bristle tip shrunk to a few pixels is no longer its texture, only a dot. */
var SIZE_HALF = [[0, .4], [1, 1]];
/** (#573) An airbrush's nozzle does not widen under pressure — it sprays more. */
var SIZE_NOZZLE = [[0, .75], [1, 1]];
/** Flow that comes on early but keeps climbing: a brush loaded with paint does
*  not hold back until the hand presses hard, and it does not stop answering it
*  either.
*
*  Widened from [[0, 0.35], [0.4, 0.85], [1, 1]], and the reason is a report
*  rather than taste: at that shape the density was within 15% of full over the
*  whole usable half of the range, so pressing harder changed nothing anyone
*  could see — and the setting that turns the behaviour off looked broken
*  because there was nothing to turn off ("свитч кажется не делает нифига",
*  Ilya). A curve whose effect is invisible is not a gentle curve, it is a
*  missing one. */
var FLOW_EARLY = [
	[0, .12],
	[.5, .6],
	[1, 1]
];
/** Flow that tracks pressure nearly linearly — for a brush meant to build tone
*  in passes rather than cover in one. */
var FLOW_LINEAR = [[0, .12], [1, 1]];
/** Ink does not thin out: it is either laid down or it is not. */
var FLOW_FLAT = [
	[0, .9],
	[.25, 1],
	[1, 1]
];
/** Covering, but not indifferent to the hand. */
var FLOW_COVERING = [
	[0, .3],
	[.5, .75],
	[1, 1]
];
/** Tone that follows the hand all the way down — shading brushes. */
var OPACITY_LINEAR = [[0, .06], [1, 1]];
/** Tone that reaches a usable density early — painting brushes, where laying
*  a flat mass should not be an exercise in pressing evenly. */
var OPACITY_EARLY = [
	[0, .12],
	[.5, .65],
	[1, 1]
];
/** (#579) Wet media: a usable density from a moderate press — a glaze that
*  needs a firm hand to show at all is not a wash anyone can lay. */
var OPACITY_WET = [
	[0, .3],
	[.5, .85],
	[1, 1]
];
/** Ink keeps most of its black at a light touch, but still answers it. */
var OPACITY_INK = [
	[0, .3],
	[.5, .8],
	[1, 1]
];
/** The set as #547 shipped it, frozen (ADR 013 §7).
*
*  Nothing new draws with these: they exist so a stroke whose token says
*  `brush:soft-round@1` keeps resolving to exactly the numbers and the renderer
*  it was drawn with. The live set below supersedes each one at `@2`, where the
*  meaning of pressure changed from flow to an opacity ceiling (#573) — a change
*  to pixels, and therefore a version. `opacityByPressure` is present only to
*  satisfy the type: the `ribbon` model never reads it. */
var V1_BRUSHES = [
	{
		id: "soft-round",
		version: 1,
		model: "ribbon",
		category: "soft",
		tip: roundTip(.12),
		paperInteraction: 0,
		spacing: .06,
		flow: .45,
		flowPer: "pass",
		sizeByPressure: SIZE_FULL,
		flowByPressure: FLOW_LINEAR,
		opacityByPressure: [[0, 1], [1, 1]],
		pressureSmoothingPx: 8,
		opacity: 1
	},
	{
		id: "medium-round",
		version: 1,
		model: "ribbon",
		category: "paint",
		tip: roundTip(.45),
		paperInteraction: 0,
		spacing: .08,
		flow: .85,
		flowPer: "pass",
		sizeByPressure: SIZE_FULL,
		flowByPressure: FLOW_EARLY,
		opacityByPressure: [[0, 1], [1, 1]],
		pressureSmoothingPx: 8,
		opacity: 1
	},
	{
		id: "hard-round",
		version: 1,
		model: "ribbon",
		category: "line",
		tip: roundTip(.82),
		paperInteraction: 0,
		spacing: .1,
		flow: .95,
		flowPer: "pass",
		sizeByPressure: SIZE_FULL,
		flowByPressure: FLOW_EARLY,
		opacityByPressure: [[0, 1], [1, 1]],
		pressureSmoothingPx: 10,
		opacity: 1
	},
	{
		id: "ink-round",
		version: 1,
		model: "ribbon",
		category: "line",
		tip: roundTip(.94),
		paperInteraction: 0,
		spacing: .09,
		flow: 1,
		flowPer: "pass",
		sizeByPressure: SIZE_KNEE,
		flowByPressure: FLOW_FLAT,
		opacityByPressure: [[0, 1], [1, 1]],
		pressureSmoothingPx: 14,
		opacity: 1
	},
	{
		id: "opaque-paint",
		version: 1,
		model: "ribbon",
		category: "paint",
		tip: roundTip(.62),
		paperInteraction: 0,
		spacing: .08,
		flow: .95,
		flowPer: "pass",
		sizeByPressure: SIZE_FULL,
		flowByPressure: FLOW_COVERING,
		opacityByPressure: [[0, 1], [1, 1]],
		pressureSmoothingPx: 8,
		opacity: 1
	},
	{
		id: "flat",
		version: 1,
		model: "ribbon",
		category: "paint",
		tip: {
			kind: "round",
			hardness: .7,
			aspect: 4,
			rotation: "fixed",
			angle: Math.PI / 4
		},
		paperInteraction: 0,
		spacing: .05,
		flow: .9,
		flowPer: "pass",
		sizeByPressure: SIZE_FULL,
		flowByPressure: FLOW_COVERING,
		opacityByPressure: [[0, 1], [1, 1]],
		pressureSmoothingPx: 10,
		opacity: 1
	}
];
/** The shipped set (ADR 013 §7 — frozen and versioned; there is deliberately no
*  way for a user to edit these, because a stroke's preset token is resolved by
*  *code* on every participant's client and an editable brush would have to
*  travel inside the operation instead).
*
*  #573 grew it from six to sixteen, and the selection is a survey rather than
*  a taste: the default sets and the "favourite brushes" lists of Procreate,
*  Krita, CSP, Photoshop, MyPaint, SAI and Magma, plus what Ctrl+Paint, Marco
*  Bucci and Proko tell students to use. The same eight to ten brushes keep
*  coming back; this set is those, minus what the physical tools here already
*  are (graphite, charcoal, ink, marker, watercolor, smudge). Decorative stamps
*  — hearts, pawprints — were left out on purpose; the scatter row keeps only
*  what gets used for backgrounds in a sketch. See ADR 013 §11. */
var DIGITAL_BRUSHES = [
	{
		id: "ink-round",
		version: 2,
		model: "stamp",
		category: "line",
		tip: roundTip(.94),
		paperInteraction: 0,
		spacing: .09,
		flow: 1,
		flowPer: "pass",
		sizeByPressure: SIZE_KNEE,
		flowByPressure: FLOW_FLAT,
		opacityByPressure: OPACITY_INK,
		pressureSmoothingPx: 14,
		opacity: 1
	},
	{
		id: "hard-round",
		version: 2,
		model: "stamp",
		category: "line",
		tip: roundTip(.82),
		paperInteraction: 0,
		spacing: .1,
		flow: .95,
		flowPer: "pass",
		sizeByPressure: SIZE_FULL,
		flowByPressure: FLOW_EARLY,
		opacityByPressure: OPACITY_EARLY,
		pressureSmoothingPx: 10,
		opacity: 1
	},
	{
		id: "medium-round",
		version: 2,
		model: "stamp",
		category: "paint",
		tip: roundTip(.45),
		paperInteraction: 0,
		spacing: .08,
		flow: .85,
		flowPer: "pass",
		sizeByPressure: SIZE_FULL,
		flowByPressure: FLOW_EARLY,
		opacityByPressure: OPACITY_EARLY,
		pressureSmoothingPx: 8,
		opacity: 1
	},
	{
		id: "opaque-paint",
		version: 2,
		model: "stamp",
		category: "paint",
		tip: roundTip(.62),
		paperInteraction: 0,
		spacing: .08,
		flow: .95,
		flowPer: "pass",
		sizeByPressure: SIZE_FULL,
		flowByPressure: FLOW_COVERING,
		opacityByPressure: OPACITY_EARLY,
		pressureSmoothingPx: 8,
		opacity: 1
	},
	{
		id: "flat",
		version: 2,
		model: "stamp",
		category: "paint",
		tip: {
			kind: "round",
			hardness: .7,
			aspect: 4,
			rotation: "fixed",
			angle: Math.PI / 4
		},
		paperInteraction: 0,
		spacing: .05,
		flow: .9,
		flowPer: "pass",
		sizeByPressure: SIZE_FULL,
		flowByPressure: FLOW_COVERING,
		opacityByPressure: OPACITY_EARLY,
		pressureSmoothingPx: 10,
		opacity: 1
	},
	{
		id: "textured-paint",
		version: 1,
		model: "stamp",
		category: "paint",
		tip: bitmapTip("rough", "travel"),
		paperInteraction: .1,
		texture: {
			id: "dry",
			periodPx: 384,
			strength: .95
		},
		spacing: .08,
		flow: .9,
		flowPer: "pass",
		sizeByPressure: SIZE_HALF,
		flowByPressure: FLOW_COVERING,
		opacityByPressure: OPACITY_EARLY,
		pressureSmoothingPx: 8,
		opacity: 1,
		scatter: {
			count: 1,
			radius: 0,
			scale: 1,
			sizeJitter: .08,
			angleJitter: .03,
			flowJitter: 0
		}
	},
	{
		id: "bristle",
		version: 1,
		model: "stamp",
		category: "paint",
		tip: bitmapTip("bristle", "travel"),
		paperInteraction: 0,
		spacing: .02,
		flow: .9,
		flowPer: "pass",
		flowSpan: .12,
		sizeByPressure: SIZE_HALF,
		flowByPressure: FLOW_EARLY,
		opacityByPressure: OPACITY_EARLY,
		pressureSmoothingPx: 8,
		opacity: 1
	},
	{
		id: "mixer",
		version: 1,
		model: "mixer",
		category: "paint",
		tip: roundTip(.5),
		paperInteraction: 0,
		spacing: .08,
		flow: 1,
		flowPer: "pass",
		sizeByPressure: SIZE_HALF,
		flowByPressure: FLOW_COVERING,
		opacityByPressure: OPACITY_EARLY,
		pressureSmoothingPx: 8,
		opacity: 1,
		mixer: {
			load: .15,
			pickup: .3,
			strength: 1.4
		}
	},
	{
		id: "wet-wash",
		version: 2,
		model: "stamp",
		category: "wet",
		tip: roundTip(.5),
		paperInteraction: .15,
		spacing: .07,
		flow: .95,
		flowPer: "pass",
		sizeByPressure: SIZE_HALF,
		flowByPressure: FLOW_LINEAR,
		opacityByPressure: OPACITY_WET,
		pressureSmoothingPx: 8,
		opacity: 1,
		wet: {
			edge: .6,
			mottle: .7,
			granulation: .15,
			glaze: true,
			model: 2,
			bloom: .3
		}
	},
	{
		id: "wet-on-wet",
		version: 1,
		model: "stamp",
		category: "wet",
		tip: roundTip(.15),
		paperInteraction: .05,
		spacing: .06,
		flow: .8,
		flowPer: "pass",
		sizeByPressure: SIZE_HALF,
		flowByPressure: FLOW_LINEAR,
		opacityByPressure: OPACITY_WET,
		pressureSmoothingPx: 8,
		opacity: 1,
		wet: {
			edge: 0,
			mottle: .8,
			granulation: .1,
			glaze: true,
			model: 2,
			bloom: .35,
			feather: .9
		}
	},
	{
		id: "wet-edge",
		version: 2,
		model: "stamp",
		category: "wet",
		tip: roundTip(.9),
		paperInteraction: .1,
		spacing: .07,
		flow: .95,
		flowPer: "pass",
		sizeByPressure: SIZE_HALF,
		flowByPressure: FLOW_LINEAR,
		opacityByPressure: OPACITY_WET,
		pressureSmoothingPx: 8,
		opacity: 1,
		wet: {
			edge: 1,
			mottle: .35,
			granulation: .05,
			glaze: true,
			model: 2
		}
	},
	{
		id: "granulating",
		version: 2,
		model: "stamp",
		category: "wet",
		tip: roundTip(.45),
		paperInteraction: .2,
		spacing: .07,
		flow: .95,
		flowPer: "pass",
		sizeByPressure: SIZE_HALF,
		flowByPressure: FLOW_LINEAR,
		opacityByPressure: OPACITY_WET,
		pressureSmoothingPx: 8,
		opacity: 1,
		wet: {
			edge: .4,
			mottle: .45,
			granulation: .9,
			glaze: true,
			model: 2,
			bloom: .15
		}
	},
	{
		id: "dry-wash",
		version: 2,
		model: "stamp",
		category: "wet",
		tip: bitmapTip("rough", "travel"),
		paperInteraction: .35,
		texture: {
			id: "dry",
			periodPx: 320,
			strength: .7
		},
		spacing: .08,
		flow: .95,
		flowPer: "pass",
		sizeByPressure: SIZE_HALF,
		flowByPressure: FLOW_LINEAR,
		opacityByPressure: OPACITY_WET,
		pressureSmoothingPx: 8,
		opacity: .95,
		scatter: {
			count: 1,
			radius: 0,
			scale: 1,
			sizeJitter: .08,
			angleJitter: .03,
			flowJitter: 0
		},
		wet: {
			edge: .35,
			mottle: .35,
			granulation: .3,
			glaze: true,
			model: 2
		}
	},
	{
		id: "wet-bands",
		version: 2,
		model: "stamp",
		category: "wet",
		tip: bitmapTip("clumps", "travel"),
		paperInteraction: .1,
		texture: {
			id: "dry",
			periodPx: 320,
			strength: .35
		},
		scatter: {
			count: 1,
			radius: .04,
			scale: 1,
			sizeJitter: .12,
			angleJitter: .02,
			flowJitter: .2
		},
		spacing: .03,
		flow: .95,
		flowPer: "pass",
		flowSpan: .4,
		sizeByPressure: SIZE_HALF,
		flowByPressure: FLOW_LINEAR,
		opacityByPressure: OPACITY_WET,
		pressureSmoothingPx: 8,
		opacity: 1,
		wet: {
			edge: .55,
			mottle: .4,
			granulation: .1,
			glaze: true,
			model: 2,
			bloom: .2
		}
	},
	{
		id: "sponge",
		version: 2,
		model: "stamp",
		category: "wet",
		tip: roundTip(.7),
		paperInteraction: .15,
		spacing: .32,
		flow: .9,
		flowPer: "stamp",
		sizeByPressure: SIZE_HALF,
		flowByPressure: FLOW_LINEAR,
		opacityByPressure: OPACITY_WET,
		pressureSmoothingPx: 8,
		opacity: 1,
		wet: {
			edge: .85,
			mottle: .35,
			granulation: .2,
			glaze: true,
			model: 2,
			bloom: .1
		}
	},
	{
		id: "gouache",
		version: 2,
		model: "stamp",
		category: "wet",
		tip: roundTip(.7),
		paperInteraction: .1,
		texture: {
			id: "dry",
			periodPx: 384,
			strength: .18
		},
		spacing: .07,
		flow: .95,
		flowPer: "pass",
		sizeByPressure: SIZE_HALF,
		flowByPressure: FLOW_COVERING,
		opacityByPressure: OPACITY_WET,
		pressureSmoothingPx: 8,
		opacity: 1,
		wet: {
			edge: .12,
			mottle: .25,
			granulation: .05,
			glaze: false,
			model: 2
		}
	},
	{
		id: "soft-round",
		version: 2,
		model: "stamp",
		category: "soft",
		tip: roundTip(.12),
		paperInteraction: 0,
		spacing: .06,
		flow: .45,
		flowPer: "pass",
		sizeByPressure: SIZE_FULL,
		flowByPressure: FLOW_LINEAR,
		opacityByPressure: OPACITY_LINEAR,
		pressureSmoothingPx: 8,
		opacity: 1
	},
	{
		id: "airbrush",
		version: 1,
		model: "stamp",
		category: "soft",
		tip: roundTip(0),
		paperInteraction: 0,
		spacing: .05,
		flow: .35,
		flowPer: "pass",
		sizeByPressure: SIZE_NOZZLE,
		flowByPressure: FLOW_LINEAR,
		opacityByPressure: OPACITY_LINEAR,
		pressureSmoothingPx: 8,
		opacity: 1
	},
	{
		id: "chalk",
		version: 1,
		model: "stamp",
		category: "texture",
		tip: bitmapTip("chalk", "fixed", .6),
		paperInteraction: .7,
		texture: {
			id: "grit",
			periodPx: 160,
			strength: .6
		},
		spacing: .12,
		flow: .75,
		flowPer: "pass",
		sizeByPressure: SIZE_HALF,
		flowByPressure: FLOW_LINEAR,
		opacityByPressure: OPACITY_LINEAR,
		pressureSmoothingPx: 8,
		opacity: 1,
		scatter: {
			count: 1,
			radius: .04,
			scale: 1,
			sizeJitter: .1,
			angleJitter: 1,
			flowJitter: 0
		}
	},
	{
		id: "grain",
		version: 1,
		model: "stamp",
		category: "texture",
		tip: bitmapTip("speckle", "fixed", .9),
		paperInteraction: 0,
		spacing: .3,
		flow: .85,
		flowPer: "stamp",
		sizeByPressure: SIZE_NOZZLE,
		flowByPressure: FLOW_LINEAR,
		opacityByPressure: OPACITY_LINEAR,
		pressureSmoothingPx: 8,
		opacity: 1,
		scatter: {
			count: 1,
			radius: .2,
			scale: 1,
			sizeJitter: .3,
			angleJitter: 1,
			flowJitter: .3
		}
	},
	{
		id: "screentone",
		version: 1,
		model: "stamp",
		category: "texture",
		tip: roundTip(.35),
		paperInteraction: 0,
		spacing: .06,
		flow: .7,
		flowPer: "pass",
		sizeByPressure: SIZE_NOZZLE,
		flowByPressure: FLOW_LINEAR,
		opacityByPressure: OPACITY_LINEAR,
		pressureSmoothingPx: 8,
		opacity: 1,
		screentonePx: 7
	},
	{
		id: "splatter",
		version: 1,
		model: "stamp",
		category: "scatter",
		tip: roundTip(.9),
		paperInteraction: 0,
		spacing: .5,
		flow: 1,
		flowPer: "stamp",
		sizeByPressure: SIZE_HALF,
		flowByPressure: FLOW_LINEAR,
		opacityByPressure: OPACITY_EARLY,
		pressureSmoothingPx: 8,
		opacity: 1,
		scatter: {
			count: 5,
			radius: .9,
			scale: .16,
			sizeJitter: .85,
			angleJitter: 0,
			flowJitter: .25
		}
	},
	{
		id: "grass",
		version: 1,
		model: "stamp",
		category: "scatter",
		tip: bitmapTip("grass", "fixed", .8),
		paperInteraction: 0,
		spacing: .3,
		flow: 1,
		flowPer: "stamp",
		sizeByPressure: SIZE_HALF,
		flowByPressure: FLOW_LINEAR,
		opacityByPressure: OPACITY_EARLY,
		pressureSmoothingPx: 8,
		opacity: 1,
		scatter: {
			count: 1,
			radius: .25,
			scale: 1,
			sizeJitter: .4,
			angleJitter: .05,
			flowJitter: .3
		}
	},
	{
		id: "foliage",
		version: 1,
		model: "stamp",
		category: "scatter",
		tip: bitmapTip("leaf", "fixed", .8),
		paperInteraction: 0,
		spacing: .4,
		flow: 1,
		flowPer: "stamp",
		sizeByPressure: SIZE_HALF,
		flowByPressure: FLOW_LINEAR,
		opacityByPressure: OPACITY_EARLY,
		pressureSmoothingPx: 8,
		opacity: 1,
		scatter: {
			count: 3,
			radius: .6,
			scale: .45,
			sizeJitter: .5,
			angleJitter: 1,
			flowJitter: .35
		}
	}
];
DIGITAL_BRUSHES.map((b) => b.id);
/** Token modifiers, each present only when a behaviour is switched **off** —
*  so every stroke recorded before a switch existed carries none and replays
*  exactly as drawn. `flat` is v1's own ("pressure does not drive density"),
*  kept under its original spelling: strokes already carry it. */
var MOD_OPACITY_OFF = "flat";
var MOD_SIZE_OFF = "fixed";
var TOKEN_RE = /^brush:([A-Za-z0-9-]+)@(\d+)((?::[A-Za-z0-9-]+)*)$/;
function tokenModifiers(presetName) {
	const m = presetName ? TOKEN_RE.exec(presetName) : null;
	return m && m[3] ? m[3].slice(1).split(":") : [];
}
/** Which pressure behaviours this recorded stroke had on. Both true for every
*  token without modifiers, which includes every stroke recorded before the
*  settings existed. */
function digitalBrushPressureFromPreset(presetName) {
	const mods = tokenModifiers(presetName);
	return {
		size: !mods.includes(MOD_SIZE_OFF),
		opacity: !mods.includes(MOD_OPACITY_OFF)
	};
}
/** v1's name for the opacity half, still read by the `ribbon` model. */
function digitalBrushFlowFromPreset(presetName) {
	return digitalBrushPressureFromPreset(presetName).opacity;
}
/** (#581) The digital watercolor set as #579 shipped it, frozen — its strokes
*  replay through wet model 1. The live set supersedes each at `@2`. */
var V1_WET_BRUSHES = [
	{
		id: "wet-wash",
		version: 1,
		model: "stamp",
		category: "wet",
		tip: roundTip(.5),
		paperInteraction: .15,
		spacing: .07,
		flow: .95,
		flowPer: "pass",
		sizeByPressure: SIZE_HALF,
		flowByPressure: FLOW_LINEAR,
		opacityByPressure: OPACITY_WET,
		pressureSmoothingPx: 8,
		opacity: 1,
		wet: {
			edge: .55,
			mottle: .6,
			granulation: .1,
			glaze: true
		}
	},
	{
		id: "wet-edge",
		version: 1,
		model: "stamp",
		category: "wet",
		tip: roundTip(.9),
		paperInteraction: .1,
		spacing: .07,
		flow: .95,
		flowPer: "pass",
		sizeByPressure: SIZE_HALF,
		flowByPressure: FLOW_LINEAR,
		opacityByPressure: OPACITY_WET,
		pressureSmoothingPx: 8,
		opacity: 1,
		wet: {
			edge: 1,
			mottle: .25,
			granulation: 0,
			glaze: true
		}
	},
	{
		id: "granulating",
		version: 1,
		model: "stamp",
		category: "wet",
		tip: roundTip(.45),
		paperInteraction: .2,
		spacing: .07,
		flow: .95,
		flowPer: "pass",
		sizeByPressure: SIZE_HALF,
		flowByPressure: FLOW_LINEAR,
		opacityByPressure: OPACITY_WET,
		pressureSmoothingPx: 8,
		opacity: 1,
		wet: {
			edge: .35,
			mottle: .35,
			granulation: .85,
			glaze: true
		}
	},
	{
		id: "dry-wash",
		version: 1,
		model: "stamp",
		category: "wet",
		tip: bitmapTip("rough", "travel"),
		paperInteraction: .35,
		texture: {
			id: "dry",
			periodPx: 320,
			strength: .7
		},
		spacing: .08,
		flow: .95,
		flowPer: "pass",
		sizeByPressure: SIZE_HALF,
		flowByPressure: FLOW_LINEAR,
		opacityByPressure: OPACITY_WET,
		pressureSmoothingPx: 8,
		opacity: .95,
		scatter: {
			count: 1,
			radius: 0,
			scale: 1,
			sizeJitter: .08,
			angleJitter: .03,
			flowJitter: 0
		},
		wet: {
			edge: .3,
			mottle: .3,
			granulation: .2,
			glaze: true
		}
	},
	{
		id: "wet-bands",
		version: 1,
		model: "stamp",
		category: "wet",
		tip: bitmapTip("clumps", "travel"),
		paperInteraction: .1,
		texture: {
			id: "dry",
			periodPx: 320,
			strength: .35
		},
		scatter: {
			count: 1,
			radius: .04,
			scale: 1,
			sizeJitter: .12,
			angleJitter: .02,
			flowJitter: .2
		},
		spacing: .03,
		flow: .95,
		flowPer: "pass",
		flowSpan: .4,
		sizeByPressure: SIZE_HALF,
		flowByPressure: FLOW_LINEAR,
		opacityByPressure: OPACITY_WET,
		pressureSmoothingPx: 8,
		opacity: 1,
		wet: {
			edge: .5,
			mottle: .3,
			granulation: 0,
			glaze: true
		}
	},
	{
		id: "sponge",
		version: 1,
		model: "stamp",
		category: "wet",
		tip: roundTip(.7),
		paperInteraction: .15,
		spacing: .32,
		flow: .9,
		flowPer: "stamp",
		sizeByPressure: SIZE_HALF,
		flowByPressure: FLOW_LINEAR,
		opacityByPressure: OPACITY_WET,
		pressureSmoothingPx: 8,
		opacity: 1,
		wet: {
			edge: .8,
			mottle: .25,
			granulation: .1,
			glaze: true
		}
	},
	{
		id: "gouache",
		version: 1,
		model: "stamp",
		category: "wet",
		tip: roundTip(.7),
		paperInteraction: .1,
		texture: {
			id: "dry",
			periodPx: 384,
			strength: .18
		},
		spacing: .07,
		flow: .95,
		flowPer: "pass",
		sizeByPressure: SIZE_HALF,
		flowByPressure: FLOW_COVERING,
		opacityByPressure: OPACITY_WET,
		pressureSmoothingPx: 8,
		opacity: 1,
		wet: {
			edge: .15,
			mottle: .15,
			granulation: 0,
			glaze: false
		}
	}
];
var ALL_BRUSHES = [
	...DIGITAL_BRUSHES,
	...V1_BRUSHES,
	...V1_WET_BRUSHES
];
/** Inverse of the above, defensive in the same way markerNibFromPreset is: an
*  unrecognised or missing token resolves to the default brush's current
*  version rather than throwing, because this runs on the replay path where a
*  hard failure would take out the whole room's history rather than one mark. */
function digitalBrushFromPreset(presetName) {
	const fallback = DIGITAL_BRUSHES.find((b) => b.id === "medium-round") ?? DIGITAL_BRUSHES[0];
	if (!presetName) return fallback;
	const m = TOKEN_RE.exec(presetName);
	if (!m) return DIGITAL_BRUSHES.find((b) => b.id === presetName) ?? fallback;
	const [, id, version] = m;
	return ALL_BRUSHES.find((b) => b.id === id && b.version === Number(version)) ?? DIGITAL_BRUSHES.find((b) => b.id === id) ?? fallback;
}
/** `ribbon` model (v1): how much one stamp of this brush lays down at this
*  pressure.
*
*  Derived rather than recorded, and that is what keeps the payload unchanged:
*  `Dab.pressure` is already in the log and the descriptor is frozen by the
*  token, so a replay recomputes the identical number without a new field. */
function digitalBrushFlow(brush, pressure, flowFromPressure = true) {
	const curve = flowFromPressure ? curveAt(brush.flowByPressure, pressure) : 1;
	return clamp(brush.flow * curve, 0, 1);
}
new Uint32Array((/* @__PURE__ */ new Float32Array(1)).buffer);
Math.PI / 4;
function markerNibFromPreset(presetName) {
	return presetName?.split(":")[0] === "chisel" ? "chisel" : "bullet";
}
//#endregion
//#region apps/web/src/engine/src/presets/tiltCurve.ts
/** Position along the response, 0 (upright) to 1 (at or past `fullDeg`), with
*  the exponent applied. `curve` of 1 is a straight line; above 1 holds near
*  round longer and arrives late; below 1 responds fast off vertical and then
*  eases — which is the closest a single curve gets to an early plateau. */
function tiltCurveT(tiltDeg, fullDeg, curve) {
	if (fullDeg <= 0) return 1;
	return Math.pow(clamp(tiltDeg / fullDeg, 0, 1), curve);
}
/** Interpolates from 1 (upright) to `atFull` at full tilt. `atFull` above 1
*  grows the quantity with tilt (graphite's aspect and width), below 1 shrinks
*  it (charcoal's width — a stick's edge really is narrower than its end
*  face). */
function tiltCurveLerp(t, atFull) {
	return 1 + (atFull - 1) * t;
}
var TILT_RESPONSES = [
	"restrained",
	"smooth",
	"linear"
];
/** What every tool ships with, and what #389/#403 calibrated against: the
*  material's own fullDeg and curve, untouched. */
var DEFAULT_TILT_RESPONSE = "smooth";
var RESTRAINED_FULL_DEG = 90;
var RESTRAINED_CURVE = 3;
new Set(TILT_RESPONSES);
/** The tilt at which the chosen response is fully open. Only 'restrained'
*  overrides the material's own reachable full tilt — that unreachable 90° is
*  half of what it *is*. */
function tiltResponseFullDeg(response, materialFullDeg) {
	return response === "restrained" ? RESTRAINED_FULL_DEG : materialFullDeg;
}
/** The exponent the chosen response applies. 'smooth' defers to the material
*  (and therefore to the debug overlay's live slider, which is what that
*  slider is for); the other two are fixed, since a response whose shape moved
*  with a slider would not be a choice the user could rely on. */
function tiltResponseCurve(response, materialCurve) {
	if (response === "restrained") return RESTRAINED_CURVE;
	if (response === "linear") return 1;
	return materialCurve;
}
/** tiltCurveT under a chosen response — the single entry point every material
*  goes through, so "which three shapes exist" is answered here and not once
*  per material. Takes the material's own two numbers rather than its config
*  object: this runs per dab, and resolving a response must not allocate. */
function tiltResponseT(tiltDeg, response, materialFullDeg, materialCurve) {
	return tiltCurveT(tiltDeg, tiltResponseFullDeg(response, materialFullDeg), tiltResponseCurve(response, materialCurve));
}
//#endregion
//#region apps/web/src/engine/src/presets/charcoalFeel.ts
var CHARCOAL_FEEL = {
	fullDeg: 62,
	curve: 2,
	aspectMax: 8,
	widthMax: .5,
	broadLightening: .45,
	broadGrainBoost: .9,
	smoothingPx: 25.8,
	pressureFloor: .3,
	pressureGamma: .6,
	skipFloor: .12,
	gateRelief: .85,
	grainDepth: 2.5
};
/** Position along the response, 0 (end face flat on the paper) to 1 (broad
*  side), with the curve exponent applied. Replaces #305's pair of smoothstep
*  plateau weights — see this file's header for why the plateaus went.
*
*  `response` (#409) is the user's pick among the three ramp shapes, the same
*  three graphite offers — charcoal keeps its own aspectMax/widthMax, so the
*  stick still opens up far wider than a lead does, it just gets there along
*  the ramp the hand asked for. The ladder is not one of the three. */
function charcoalTiltT(tiltDeg, cfg = CHARCOAL_FEEL, response = DEFAULT_TILT_RESPONSE) {
	return tiltResponseT(tiltDeg, response, cfg.fullDeg, cfg.curve);
}
/** Dab elongation along the tilt azimuth: 1 (round) -> aspectMax. */
function charcoalAspect(tiltDeg, cfg = CHARCOAL_FEEL, response = DEFAULT_TILT_RESPONSE) {
	return tiltCurveLerp(charcoalTiltT(tiltDeg, cfg, response), cfg.aspectMax);
}
/** Short-axis multiplier: 1 (the full end face) -> widthMax (the line contact
*  of the stick laid over). */
function charcoalWidthFactor(tiltDeg, cfg = CHARCOAL_FEEL, response = DEFAULT_TILT_RESPONSE) {
	return tiltCurveLerp(charcoalTiltT(tiltDeg, cfg, response), cfg.widthMax);
}
//#endregion
//#region apps/web/src/engine/src/presets/pencilTilt.ts
var PENCIL_TILT = {
	fullDeg: 60,
	curve: 2,
	aspectMax: 5,
	widthMax: 1.4,
	lightening: .35,
	smoothingPx: 14.6
};
/** Position along the response, 0 (upright) to 1 (at or past fullDeg), with
*  the curve exponent already applied. Everything else here is a linear
*  interpolation driven by this one number, which is also what makes the
*  inverse (pencilTiltness) exact.
*
*  `response` (#409) picks which of the three ramp shapes the exponent and the
*  full-tilt angle come from — the user's own choice, made per tool in the
*  settings panel. It is a trailing parameter with a default so every existing
*  caller keeps meaning "the shipped shape". */
function pencilTiltT(tiltDeg, cfg = PENCIL_TILT, response = DEFAULT_TILT_RESPONSE) {
	return tiltResponseT(tiltDeg, response, cfg.fullDeg, cfg.curve);
}
/** Dab elongation along the tilt azimuth: 1 (round) -> aspectMax. */
function pencilTiltAspect(tiltDeg, cfg = PENCIL_TILT, response = DEFAULT_TILT_RESPONSE) {
	return tiltCurveLerp(pencilTiltT(tiltDeg, cfg, response), cfg.aspectMax);
}
/** Short-axis multiplier: 1 (the point) -> widthMax (the side of the cone). */
function pencilTiltWidthFactor(tiltDeg, cfg = PENCIL_TILT, response = DEFAULT_TILT_RESPONSE) {
	return tiltCurveLerp(pencilTiltT(tiltDeg, cfg, response), cfg.widthMax);
}
//#endregion
//#region apps/web/src/engine/src/presets/tiltMath.ts
var DEG_TO_RAD = Math.PI / 180;
180 / Math.PI;
/** PointerEvent's own documented range for tiltX/tiltY. Inputs are clamped to
*  it before the tangent, purely to keep a malformed/out-of-spec device
*  reading from making the intermediate value meaningless — tan is monotonic
*  across the whole open interval, so this never alters a legal reading. */
var MAX_REPORTED_TILT_DEG = 90;
/**
* The other half of the same recovery (#482): φ, the azimuth of the grip —
* which way the pen leans, seen from above — in radians, screen frame, measured
* the same way canvas angles are (from +x, turning toward +y, i.e. clockwise on
* a screen whose y runs down).
*
* This is #388's unfixed twin, and it hid for the same reason the magnitude bug
* did. Divide the two identities at the top of this file:
*
*   tan(tiltY) / tan(tiltX) = (tanθ · sin φ) / (tanθ · cos φ) = tan φ
*
* so the azimuth is atan2 of the two *tangents*, exactly as the magnitude is
* hypot of the two tangents. `atan2(tiltY, tiltX)` — atan2 of the angles, which
* is what every caller used until now — is the same category error, and it is
* wrong by the same shape: exact whenever one component is zero (an
* axis-aligned grip, which is how it went unnoticed) or when the two are equal
* (the exact diagonal), and worst in between. A 30/60 grip read 63.4° against a
* true 71.6°; 20/70 read 74.1° against 82.5°. So a leaning pencil's ellipse
* pointed up to ~8° away from the direction the pen was actually leaning.
*
* #388 fixed the magnitude and left this one behind on purpose — at the time
* the azimuth had no consumer that cared. It has one now (dabShaping.ts's
* `barrel` anchor), and a nib that claims to follow the pen's body has to
* follow it.
*/
function tiltAzimuthRad(tiltX, tiltY) {
	const tx = Math.tan(clamp(tiltX, -90, MAX_REPORTED_TILT_DEG) * DEG_TO_RAD);
	const ty = Math.tan(clamp(tiltY, -90, MAX_REPORTED_TILT_DEG) * DEG_TO_RAD);
	return Math.atan2(ty, tx);
}
//#endregion
//#region apps/web/src/engine/src/presets/dabShaping.ts
function clamp01$2(v) {
	return clamp(v, 0, 1);
}
function tiltOrPathAngle(tiltMag, tiltX, tiltY, pathAngle, cameraAngle = 0) {
	return tiltMag > 15 ? tiltAzimuthRad(tiltX, tiltY) - cameraAngle : pathAngle;
}
function pencilShapingFor(response) {
	return {
		size: (pressure, tiltNorm) => (.3 + .7 * pressure) * pencilTiltWidthFactor(tiltNorm * 90, PENCIL_TILT, response),
		aspect: (tiltNorm) => pencilTiltAspect(tiltNorm * 90, PENCIL_TILT, response),
		angle: tiltOrPathAngle,
		get tiltSmoothingPx() {
			return PENCIL_TILT.smoothingPx;
		}
	};
}
({
	restrained: pencilShapingFor("restrained"),
	smooth: pencilShapingFor("smooth"),
	linear: pencilShapingFor("linear")
})[DEFAULT_TILT_RESPONSE];
var CHARCOAL_WIDTH_FLOOR = .45;
var CHARCOAL_WIDTH_SWING = .6;
function charcoalShapingFor(response) {
	return {
		size: (pressure, tiltNorm) => (CHARCOAL_WIDTH_FLOOR + CHARCOAL_WIDTH_SWING * clamp01$2(pressure)) * charcoalWidthFactor(tiltNorm * 90, CHARCOAL_FEEL, response),
		aspect: (tiltNorm) => charcoalAspect(tiltNorm * 90, CHARCOAL_FEEL, response),
		angle: tiltOrPathAngle,
		get tiltSmoothingPx() {
			return CHARCOAL_FEEL.smoothingPx;
		}
	};
}
Math.PI / 4;
({
	restrained: charcoalShapingFor("restrained"),
	smooth: charcoalShapingFor("smooth"),
	linear: charcoalShapingFor("linear")
})[DEFAULT_TILT_RESPONSE];
//#endregion
//#region apps/web/src/engine/src/presets/brushPenPresets.ts
function clamp01$1(v) {
	return clamp(v, 0, 1);
}
/** Never thinner than this fraction of the nominal size — a nib that vanishes
*  at light pressure is unusable, and stylus pressure near zero is mostly
*  noise (see BRUSH_PEN_MIN_PRESSURE, which guards the other end of the same
*  problem).
*
*  #472: 0.10, down from v1's 0.15. The spec this tool is built to asks for
*  8-15%, and the low end is where the hairline lives — the thing the pen is
*  bought for. The absolute floor is elsewhere and unchanged
*  (RibbonProfile.minHalfWidthPx = 0.5 canvas px), so on a small pen this
*  never actually reaches: 0.10 x 3px is 0.3px, and the ribbon widens it back
*  to 0.5px rather than dropping it. On a 40px pen it is a real 4px hairline
*  against v1's 6px. */
var BRUSH_PEN_WIDTH_FLOOR = .1;
/** Floor under the *reported* pressure while the pen is down. Tablets emit
*  unstable near-zero values in the first samples after contact; without this
*  the head of a stroke breaks up. Distinct from the width floor above: this
*  one is about believing the device, that one about the nib's own geometry. */
var BRUSH_PEN_MIN_PRESSURE = .05;
/** Symmetric S-curve, standard `gain` shape: k = 1 is the identity, k > 1
*  concentrates the response in the middle of the range and flattens both
*  ends. Exactly invertible and monotone for any k > 0, so a recorded dab's
*  width never fails to correspond to some pressure.
*
*  Exported for watercolorPresets.ts (#468), which needs the identical curve
*  under a different width floor — a wet round brush and a brush-pen nib both
*  open up under pressure with flat ends, they just start from different
*  minimum contact patches. A function *declaration*, so this cross-import is
*  the same hoisted-at-link-time shape this file's header already permits. */
function gain(x, k) {
	const t = clamp01$1(x);
	return t < .5 ? .5 * Math.pow(2 * t, k) : 1 - .5 * Math.pow(2 - 2 * t, k);
}
var PRESSURE_RESPONSES = [
	"soft",
	"normal",
	"firm"
];
var DEFAULT_PRESSURE_RESPONSE = "normal";
function isPressureResponse(v) {
	return PRESSURE_RESPONSES.includes(v);
}
/** soft — the nib opens up early; firm — it has to be pushed. `normal` is the
*  curve ADR 009 tabulates: against the anchors the spec asked for (0.2→0.25,
*  0.5→0.55, 0.8→0.85) it lands at 0.273 / 0.575 / 0.877, i.e. the right shape
*  sitting ~0.025 high through the middle. Uncalibrated first pass like every
*  other constant of a new tool here — retuning is this one number. */
var PRESSURE_RESPONSE_K = {
	soft: 1.05,
	normal: 1.35,
	firm: 1.8
};
/** Width as a fraction of the nominal size, for an already-floored pressure. */
function brushPenWidth(pressure, response) {
	return BRUSH_PEN_WIDTH_FLOOR + (1 - BRUSH_PEN_WIDTH_FLOOR) * gain(pressure, PRESSURE_RESPONSE_K[response]);
}
/** Elongation of the footprint at full pressure — long axis / short axis, on
*  top of the pose's own mild ovality.
*
*  Note what this does *not* do: the long axis lies along the direction of
*  travel, so a straight line's width is still the short axis, i.e. still
*  pressure alone (ADR 009 §9's rule that pressure drives width and nothing
*  else drives it stands untouched). It shows at the two places a nib's length
*  is visible at all — the ends of a stroke, and turns. Uncalibrated. */
var BRUSH_PEN_ELONGATION = .85;
/** How far the nib takes to bend and swing round to the direction of travel,
*  as a multiple of its own current width: a wide nib has further to bend and
*  lags longer, which is why this is a ratio rather than a distance.
*
*  Too small and the nib is welded to the tangent — the elongation then only
*  shows at stroke ends and the tool is back to a swept disc in the middle.
*  Too large and the mark stops following the hand at all.
*
*  1.5 rather than the 0.6 this shipped with first (#472 review, Ilya). Dab
*  spacing is 0.22 of the nib's width, so at 0.6 a *single* dab of travel bent
*  the nib by 1 - exp(-0.22/0.6) = 31% — a nudge across a third of a pixel of
*  the hand's intent already stamped a visible ellipse, and wiggling swung it
*  about. The ratio that matters is lag against spacing, and it has to be
*  large enough that "moved a little" reads as "bent a little": at 1.5 the
*  same single dab bends it 14%, which is inside the round-looking range.
*
*  It is also the more physical number. Fibres bend over a distance of the
*  order of the nib's *length*, and a brush nib is several times longer than
*  it is wide — a nib that fully reorients within two-thirds of its own width
*  of travel is stiffer than any brush. */
var BRUSH_PEN_TIP_LAG_WIDTHS = 1.5;
/** Floor under that distance so a hairline nib still has inertia: even 1.5 x a
*  3px pen is 4.5px, which at that pen's own dab spacing is only a couple of
*  dabs of lag. */
var BRUSH_PEN_TIP_MIN_LAG_PX = 6;
/** At/below this pointer speed (canvas px/ms) the mark sits under the pen. */
var TRAIL_SPEED_SLOW = .5;
/** At/above it, the full trail below. */
var TRAIL_SPEED_FAST = 2.5;
/** Trail at full speed and full bend, as a multiple of the nib's own width.
*
*  Bounded well under BRUSH_PEN_TIP_LAG_WIDTHS on purpose, and not for taste:
*  the trail is eased in over the lag distance, so a trail deeper than that
*  distance would grow faster than the dabs advance and hand the ribbon a pair
*  of consecutive dabs in reverse order along the path. 0.18 against 1.5 is
*  nowhere near it. Uncalibrated. */
var BRUSH_PEN_TRAIL_WIDTHS = .18;
function brushPenTipBend(response) {
	return {
		elongation: (pressure) => 1 + BRUSH_PEN_ELONGATION * gain(Math.max(pressure, BRUSH_PEN_MIN_PRESSURE), PRESSURE_RESPONSE_K[response]),
		lagWidths: BRUSH_PEN_TIP_LAG_WIDTHS,
		minLagPx: BRUSH_PEN_TIP_MIN_LAG_PX,
		trailWidths: (speed) => BRUSH_PEN_TRAIL_WIDTHS * clamp01$1((speed - TRAIL_SPEED_SLOW) / (TRAIL_SPEED_FAST - TRAIL_SPEED_SLOW))
	};
}
/** #482: two numbers on the profile instead of a post-pass over `dab.size`.
*  Short on purpose: ADR 009 rejects a long decorative taper. */
var BRUSH_PEN_HEAD_TAPER = {
	startScale: .35,
	lengthPx: 10
};
var CONTACT_SPEED_SLOW = .4;
var CONTACT_SPEED_FAST = 2.5;
var CONTACT_AT_SPEED = .9;
var BRUSH_PEN_SPEED_CONTACT = {
	factor: (speed) => lerp(1, CONTACT_AT_SPEED, (speed - CONTACT_SPEED_SLOW) / (CONTACT_SPEED_FAST - CONTACT_SPEED_SLOW)),
	smoothingPx: 30
};
function brushPenShapingFor(response) {
	return {
		size: (pressure) => brushPenWidth(Math.max(pressure, BRUSH_PEN_MIN_PRESSURE), response),
		aspect: (tiltNorm) => 1 + .25 * tiltNorm,
		angle: tiltOrPathAngle,
		pressureSmoothingPx: 10,
		tipBend: brushPenTipBend(response),
		headTaper: BRUSH_PEN_HEAD_TAPER,
		speedContact: BRUSH_PEN_SPEED_CONTACT
	};
}
brushPenShapingFor("soft"), brushPenShapingFor("normal"), brushPenShapingFor("firm");
function lerp(a, b, t) {
	return a + (b - a) * clamp01$1(t);
}
//#endregion
//#region apps/web/src/engine/src/presets/watercolorPigments.ts
function rgb(hex) {
	return [
		(hex >> 16 & 255) / 255,
		(hex >> 8 & 255) / 255,
		(hex & 255) / 255
	];
}
var WATERCOLOR_PIGMENTS = [
	{
		code: "PY35",
		name: "Cadmium Yellow",
		color: rgb(15852595),
		granulation: .1,
		opacity: .2,
		diffusion: .25,
		staining: .75
	},
	{
		code: "PY154",
		name: "Benzimida Yellow",
		color: rgb(14400558),
		granulation: .3,
		opacity: .02,
		diffusion: .25,
		staining: .75
	},
	{
		code: "PY42",
		name: "Gold Ochre",
		color: rgb(15434566),
		granulation: .1,
		opacity: .1,
		diffusion: .5,
		staining: .75
	},
	{
		code: "PR108",
		name: "Cadmium Scarlet",
		color: rgb(15288112),
		granulation: .3,
		opacity: .1,
		diffusion: .75,
		staining: .75
	},
	{
		code: "PR179",
		name: "Perylene Maroon",
		color: rgb(13906479),
		granulation: .3,
		opacity: .01,
		diffusion: .01,
		staining: 1
	},
	{
		code: "PR122",
		name: "Quinacridone Magenta",
		color: rgb(15219535),
		granulation: .3,
		opacity: .01,
		diffusion: .01,
		staining: 1
	},
	{
		code: "PBr7",
		name: "Burnt Sienna",
		color: rgb(11359050),
		granulation: .5,
		opacity: .1,
		diffusion: .5,
		staining: .75
	},
	{
		code: "PB29",
		name: "French Ultramarine",
		color: rgb(2767767),
		granulation: .75,
		opacity: .1,
		diffusion: .75,
		staining: .25
	},
	{
		code: "PB28",
		name: "Cobalt Blue",
		color: rgb(4735901),
		granulation: .75,
		opacity: .1,
		diffusion: .75,
		staining: .5
	},
	{
		code: "PB15",
		name: "Winsor Blue",
		color: rgb(2525395),
		granulation: .5,
		opacity: .2,
		diffusion: .25,
		staining: .5
	},
	{
		code: "PB36",
		name: "Cerulean Blue",
		color: rgb(160942),
		granulation: .5,
		opacity: .02,
		diffusion: 1,
		staining: .75
	},
	{
		code: "PG7",
		name: "Winsor Green",
		color: rgb(498046),
		granulation: .1,
		opacity: .02,
		diffusion: .25,
		staining: 1
	},
	{
		code: "PG36",
		name: "Winsor Green YS",
		color: rgb(7651702),
		granulation: .1,
		opacity: .02,
		diffusion: .5,
		staining: 1
	},
	{
		code: "PBk6",
		name: "Neutral Tint",
		color: rgb(2371372),
		granulation: .75,
		opacity: .02,
		diffusion: 1,
		staining: 1
	},
	{
		code: "PW4",
		name: "Chinese White",
		color: rgb(16777215),
		granulation: .01,
		opacity: .02,
		diffusion: .25,
		staining: .5
	}
];
/** French Ultramarine: the paint most people picture when they picture
*  watercolour granulating, and the one that shows the most of what this table
*  buys. */
var DEFAULT_WATERCOLOR_PIGMENT = "PB29";
/** The neutral fallback for a stroke whose code we do not recognise — recorded
*  by a newer client, or by one we later removed a pigment from. Mid-range on
*  every axis, so an unknown paint renders as an unremarkable one rather than
*  as nothing.
*
*  Not optional: the Operation Log is permanent, so this path is reached by
*  real strokes in real rooms, not only by malformed input. */
var UNKNOWN_PIGMENT = {
	code: "",
	name: "",
	color: [
		.2,
		.32,
		.6
	],
	granulation: .35,
	opacity: .06,
	diffusion: .5,
	staining: .6
};
var BY_CODE = new Map(WATERCOLOR_PIGMENTS.map((p) => [p.code, p]));
function watercolorPigmentByCode(code) {
	return (code ? BY_CODE.get(code) : void 0) ?? BY_CODE.get("PB29") ?? UNKNOWN_PIGMENT;
}
function isWatercolorPigmentCode(code) {
	return BY_CODE.has(code);
}
WATERCOLOR_PIGMENTS.map((p) => p.code);
Object.fromEntries(WATERCOLOR_PIGMENTS.map((p) => {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="1.5" y="1.5" width="21" height="21" rx="4" fill="%23${p.color.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("")}" stroke="rgba(0,0,0,.28)" stroke-width="1"/></svg>`;
	return [p.code, `data:image/svg+xml,${svg}`];
}));
//#endregion
//#region apps/web/src/engine/src/presets/watercolorPresets.ts
function clamp01(v) {
	return clamp(v, 0, 1);
}
/** Higher than the brush pen's 0.15. A pen nib is a stiff sliver that really
*  does draw a hairline at the lightest touch; a round brush carrying water
*  keeps a rounded belly in contact no matter how lightly it is laid down, and
*  cannot be coaxed below roughly a third of its own width without being
*  turned on its tip — which is a different technique, not a lighter touch. */
var WATERCOLOR_WIDTH_FLOOR = .32;
/** Same reason as BRUSH_PEN_MIN_PRESSURE: tablets emit unstable near-zero
*  pressure in the first samples after contact, and without a floor the head of
*  every stroke breaks up. Identical value — this is a property of the digitiser,
*  not of the brush. */
var WATERCOLOR_MIN_PRESSURE = .05;
var DEFAULT_WATERCOLOR_RESPONSE = DEFAULT_PRESSURE_RESPONSE;
var WATERCOLOR_RESPONSE_K = {
	soft: 1.05,
	normal: 1.35,
	firm: 1.8
};
/** Width as a fraction of the nominal size, for an already-floored pressure. */
function watercolorWidth(pressure, response) {
	return WATERCOLOR_WIDTH_FLOOR + (1 - WATERCOLOR_WIDTH_FLOOR) * gain(pressure, WATERCOLOR_RESPONSE_K[response]);
}
/** A wet brush is heavier and slower than a pen nib, and its own load damps
*  hand tremor before the paper ever sees it.
*
*  #482: expressed as a distance, like every other input filter now, and the
*  move corrected a claim as well as a unit. This shipped as a per-sample
*  weight of 0.55, documented as smoothing "harder than the brush pen's 0.35"
*  with a test asserting `> 0.35` — both backwards, because the filter is
*  `y += (u - y) * k` and a larger k tracks the input *more* closely. So the
*  wet brush was in fact the twitchier of the two.
*
*  Converted rather than retuned: 0.55 at the reference the pen's own 10 px was
*  picked against (500 px/s on a 120 Hz stylus, samples ~4.2 px apart) is
*  5.3 px. That is deliberately still shorter than the pen's 10 px — i.e. the
*  documentation was wrong and the number stays — because changing how someone
*  else's live experiment feels is not this branch's business. What is fixed is
*  that the number now means the same thing on every device. */
var WATERCOLOR_PRESSURE_SMOOTHING_PX = 5.3;
/** #482: profile data rather than a post-pass. Barely a taper at all — a
*  loaded brush lands rather than arrives at a point. */
var WATERCOLOR_HEAD_TAPER = {
	startScale: .72,
	lengthPx: 6
};
function watercolorShapingFor(response) {
	return {
		size: (pressure) => watercolorWidth(Math.max(pressure, WATERCOLOR_MIN_PRESSURE), response),
		aspect: (tiltNorm) => 1 + .4 * tiltNorm,
		angle: tiltOrPathAngle,
		pressureSmoothingPx: WATERCOLOR_PRESSURE_SMOOTHING_PX,
		headTaper: WATERCOLOR_HEAD_TAPER
	};
}
var WATERCOLOR_NIBS = [
	"round",
	"chisel",
	"flex"
];
var DEFAULT_WATERCOLOR_NIB = "round";
function isWatercolorNib(v) {
	return WATERCOLOR_NIBS.includes(v);
}
/** Fifth field of the preset string, absent from every stroke recorded before
*  #489 — which therefore replay as the round brush they were drawn with. */
function watercolorNibFromPreset(presetName) {
	const token = presetName?.split(":")[4];
	return token && isWatercolorNib(token) ? token : DEFAULT_WATERCOLOR_NIB;
}
/** Elongation at full pressure, against the pen's 0.85. */
var WATERCOLOR_FLEX_ELONGATION = 1.05;
/** Distance the nib takes to come round, in its own widths — the pen's 1.5. A
*  brush's fibres are longer relative to their width and carry water, and the
*  lag is of the order of that length. */
var WATERCOLOR_FLEX_LAG_WIDTHS = 2.2;
/** Floor under that, world px. Above the pen's 6 for the same reason the ratio
*  is above its 1.5. */
var WATERCOLOR_FLEX_MIN_LAG_PX = 8;
/** Trail at full speed and full bend, in nib widths. Well under the lag
*  distance, and it has to be: the trail eases in over that distance, so a
*  deeper one would grow faster than the dabs advance and hand the ribbon two
*  consecutive dabs reversed along the path. 0.30 against 2.2 is nowhere near
*  it — the same margin the pen keeps at 0.18 against 1.5. */
var WATERCOLOR_FLEX_TRAIL_WIDTHS = .3;
/** A loaded brush starts to lag the hand sooner than a pen nib does (0.5/2.5):
*  it is the water that lags, and there is more of it. */
var WATERCOLOR_FLEX_SPEED_SLOW = .35;
var WATERCOLOR_FLEX_SPEED_FAST = 2;
function watercolorFlexTipBend(response) {
	return {
		elongation: (pressure) => 1 + WATERCOLOR_FLEX_ELONGATION * gain(Math.max(pressure, WATERCOLOR_MIN_PRESSURE), WATERCOLOR_RESPONSE_K[response]),
		lagWidths: WATERCOLOR_FLEX_LAG_WIDTHS,
		minLagPx: WATERCOLOR_FLEX_MIN_LAG_PX,
		trailWidths: (speed) => WATERCOLOR_FLEX_TRAIL_WIDTHS * clamp01((speed - WATERCOLOR_FLEX_SPEED_SLOW) / (WATERCOLOR_FLEX_SPEED_FAST - WATERCOLOR_FLEX_SPEED_SLOW))
	};
}
function watercolorFlexShaping(response) {
	return {
		...watercolorShapingFor(response),
		tipBend: watercolorFlexTipBend(response)
	};
}
watercolorFlexShaping("soft"), watercolorFlexShaping("normal"), watercolorFlexShaping("firm");
/** Same free `presetName` slot the brush pen uses for its pressure response,
*  and for the same reason (#454): no size ladder and no nib list means the
*  per-stroke string that carries a pencil grade or a marker nib is available,
*  so the setting rides the recorded StrokeOperation with no new field. A peer
*  replays the stroke with the response it was drawn with, not whatever they
*  have selected. */
function watercolorResponseFromPreset(presetName) {
	const token = presetName?.split(":")[0];
	return token && isPressureResponse(token) ? token : DEFAULT_WATERCOLOR_RESPONSE;
}
var WATERCOLOR_MIX_DEFAULT = {
	water: .55,
	pigment: .6
};
function mix(a, b, t) {
	return a + (b - a) * clamp01(t);
}
/** Everything water decides, resolved in one place so the relationships are
*  legible side by side rather than scattered across a profile literal. */
function watercolorWaterEffects(water) {
	return {
		spreadOfRadius: mix(.1, .42, water),
		edgeSoft: mix(.05, .4, water),
		edgeWander: mix(.05, .42, water),
		cloud: mix(.04, .19, water),
		tideLo: mix(.72, .24, water),
		tideHi: mix(.96, .6, water),
		dryContact: 1 - smoothstepJs(.22, .55, water)
	};
}
/** Everything pigment decides.
*
*  Note what is *not* here: any multiplier on the composite's own opacity.
*  Pigment reaches the finished pixel through exactly one route — how much
*  paint the deposit lays down, which feeds the saturation curve. An early v4
*  had it scale the composite as well, and the tool immediately went pale and
*  flat: the same double-counting that made the opacity slider quarter a mark
*  when it was meant to halve it (see RibbonProfile.depositPerRadius). One
*  quantity, one route. */
function watercolorPigmentEffects(pigment) {
	return {
		depositPerRadius: 1.05,
		granulation: mix(.03, .1, pigment),
		wetEdge: mix(.22, .72, pigment),
		strength: mix(0, 1, pigment)
	};
}
/** GLSL's smoothstep, in JS. */
function smoothstepJs(edge0, edge1, x) {
	const t = clamp01((x - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
}
/** Water goes first. 20 radii is roughly a long single sweep. */
var WATER_RUN_RADII = 20;
/** (#536, §17.18) 0.04, from 0.22. The old floor meant a brush never ran
*  dry along a stroke — "почему вода в кисти не заканчивается никогда?" — so
*  the dry-brush tail (contact breaking up, hairs showing) could not happen
*  on a long line. Near zero now: a brush dragged three runs is dry, and the
*  hand reloads at the next pen-down anyway (the load resets per stroke). */
var WATER_FLOOR = .04;
/** Pigment outlasts water by better than two to one, which is what produces the
*  dry-brush end of a stroke rather than a stroke that simply fades.
*
*  #468 v9 — the floor is 0.84, up from 0.66, and the reason is the flat-wash
*  exercise. At 0.66 a single band 40 radii long lost a fifth of its tone from
*  end to end; bands are laid in alternating directions, so that falloff became
*  a zigzag *across* the finished wash and was the second largest contributor
*  to its unevenness (measured, after the cloud field).
*
*  A real painter recharges the brush between bands, which the model already
*  does — the load resets per stroke. What was wrong was how much one band
*  could lose on its own. Water still runs down hard, so the dry-brush arc
*  survives; it is the *paint* that now barely thins. */
var PIGMENT_RUN_DRY_RADII = 8;
var PIGMENT_RUN_WET_RADII = 80;
/** How much extra the brush dumps as it lands, as a fraction of the normal
*  dose. Small: this must read as "the brush arrived carrying something", not
*  as a separate dark segment at the start of the line. */
var WATERCOLOR_START_EXCESS_BASE = 5;
var WATERCOLOR_START_EXCESS_DWELL = 2.8;
/** How fast that surplus is spent, in the brush's own radii. Under one radius
*  on purpose. Two to four radii — the first number reached for — is a
*  perfectly readable *piece of the mark*, and a flat wash is a series of
*  bands, so at that length the wash would grow a periodic dark head at every
*  stroke instead of a gradient down each one: the same spatial structure v9
*  removed, just shorter. */
var WATERCOLOR_START_EXCESS_RADII = 1.2;
/** The multiplier on the deposit at `usedRadii` into the stroke.
*
*  `landedWet` gates it, and gating on *the paper* rather than on "is this the
*  same wash" is the point. A wash is a bookkeeping fact about time; what
*  decides whether a brush dumps its load is whether it came down on dry paper
*  or into standing water — a loaded brush lowered into a bead merges with it
*  and dumps nothing. That rule then covers three cases with one predicate: the
*  head of a mark on dry paper, a second pass over something still wet, and the
*  sixth band of a flat wash laid up against the wet fifth. */
/** (s17.26) How much more pigment a wet sheet pulls out of the brush than a
*  dry one: the water on the paper draws the paint out by capillarity, which
*  is why a charge-in reads strong at the brush and feathers away, not pale.
*  Without it the same brush laid the same dose into a puddle, the front
*  spread it over three times the area, and a stroke into clean water came
*  out at half a dry stroke's density (0.35 against 0.61). */
function watercolorWetPull(paperWet) {
	return 1 + 1 * clamp01(paperWet);
}
/** (s17.27) How deep the water stands under a dab, as a share of the mark's
*  standing level: 1 where the brush landed with its surplus (the puddle)
*  and wherever it works into a wet wash, WC_FILM_STAND for the film it
*  lays along the stroke. Two records the front reads apart (see the seed
*  in WC_FIELD_OP_FRAG): the film's edge is the stroke's contour, the
*  puddle's front dries last and runs ragged into the film. */
function watercolorPuddleDepth(usedRadii, landedWet, paperWet, dwellMs = 0) {
	const e = watercolorDwellWater(dwellMs) * (1 - clamp01(landedWet)) * Math.exp(-usedRadii / 3);
	const w = clamp01(paperWet / WC_PUDDLE_WET_FULL);
	return 1 - (1 - WC_FILM_STAND) * (1 - e) * (1 - w);
}
var WC_FILM_STAND = .45;
var WC_PUDDLE_WET_FULL = .5;
/** (s17.28) The least a dab has to have moved from the last one DEPOSITED for
*  it to deposit at all - a share of the nib's radius, never under a pixel
*  and a half. The deposit is laid per unit of travel, and a pen held still
*  is not still: the tablet reports it a pixel this way and that at 120 Hz,
*  and DabSystem's spacing collapses to its 1 px floor at that speed, so a
*  half-second dwell before the lift arrived as forty dabs a pixel apart -
*  forty pixels of "travel" packed into one nib, a blob at every end of
*  Ilya's strokes where the paper had a light lift. Sensor noise is not
*  travel. A slow stroke that really moves crosses the quantum every few
*  samples and loses nothing: the kept dab's travel is the whole distance
*  from the last kept one. */
/** (s17.28) The deposit a stroke's FILM carries per texel, in units of the
*  profile's depositPerRadius, before the brush's load and landing surplus.
*  Under MAX blending (AccumulationBuffer.beginMaxDraw) a texel holds one
*  stamp's value, so the value is the film itself, spacing-free; under the
*  old additive sum it was seg/R per stamp and 2R/seg stamps deep. Set so
*  the calibration stroke keeps D_body 0.6. The accepted mass-film trial
*  raises the film dose to 1.4 together with density-limited mobility;
*  neither coefficient is an independent physical calibration. */
var WC_FILM_DOSE = 1.4;
function watercolorTravelQuantum(radiusPx) {
	return Math.max(WC_TRAVEL_QUANTUM_MIN_PX, radiusPx * WC_TRAVEL_QUANTUM);
}
var WC_TRAVEL_QUANTUM = .06;
var WC_TRAVEL_QUANTUM_MIN_PX = 1.5;
/** How long (ms) the nib has stayed within `radius` of (x, y) up to time t:
*  back over `trail` (oldest first) while the dabs stay inside. */
function watercolorTrailDwell(trail, x, y, t, radius) {
	let since = t;
	for (let i = trail.length - 1; i >= 0; i--) {
		const d = trail[i];
		if (Math.hypot(d.x - x, d.y - y) > radius) break;
		since = d.t;
	}
	return Math.max(0, t - since);
}
/** The brush's surplus after a slowdown, carried along the stroke and spent
*  over `runRadii` of travel - the pool is laid just past where the brush
*  stood, and the next slowdown raises it again. `level` is the dwell's
*  saturation at this dab (0..1, already gated by the paper). */
function watercolorSurplus(prev, spentRadii, level, runRadii) {
	return Math.max(prev * Math.exp(-Math.max(spentRadii, 0) / runRadii), level);
}
function watercolorBrakeSurplus(prev, spentRadii, level, elapsedMs) {
	const held = watercolorSurplus(prev, spentRadii, 0, WC_SLOW_RUN_RADII);
	return held + Math.max(level - held, 0) * (1 - Math.exp(-Math.max(elapsedMs, 0) / 20));
}
/** watercolorStartExcess with the dwell's share from the carried surplus
*  (watercolorSurplus of watercolorDwellPigment) instead of the landing's. */
function watercolorExcessFromSurplus(usedRadii, landedWet, surplusPigment) {
	return 1 + WATERCOLOR_START_EXCESS_BASE * (1 - clamp01(landedWet)) * Math.exp(-usedRadii / WATERCOLOR_START_EXCESS_RADII) + WATERCOLOR_START_EXCESS_DWELL * surplusPigment;
}
/** watercolorPuddleDepth with the dwell's share from the carried surplus of
*  watercolorDwellWater. */
function watercolorPuddleFromSurplus(surplusWater, paperWet) {
	const w = clamp01(paperWet / WC_PUDDLE_WET_FULL);
	return 1 - (1 - WC_FILM_STAND) * (1 - clamp01(surplusWater)) * (1 - w);
}
/** (#680, s17.74) A slowdown the pen does not stop for. Ilya's repeats run
*  at ~1 m/s of paper and turn back in 40-190 ms - far under the dwell's
*  time constants - yet the photographs pool at every turn-back: the brush
*  decelerates to zero there and lays its water over less travel. So the
*  speed counts relative to the stroke's own pace (`vPeak`, the fastest it
*  has recently gone): 0 at its pace, 1 standing still. Relative, because
*  one hand's slow is another's fast, and a pool is where THIS stroke
*  braked. */
function watercolorSlowdown(v, vPeak) {
	if (!(vPeak > 0)) return 0;
	const rel = Math.max(v, 0) / vPeak;
	const at = (x) => WC_SLOW_V0 / (x + WC_SLOW_V0);
	return clamp01((at(rel) - at(1)) / (at(0) - at(1)));
}
var WC_SLOW_V0 = .2;
/** Weight of the slowdown next to the dwell (both 0..1 levels of the reservoir). */
var WC_SLOW_GAIN = .2666666667;
/** (#680) A braking pool is compact - the photographs' turn-back pools are a
*  nib's footprint, not a wide cap: its surplus is spent over this many radii
*  of travel, not the landing's WC_START_EXCESS_RADII / WC_PUDDLE_RADII
*  (ChatGPT on the first render: "slowdown -> dark blob", too wide). */
var WC_SLOW_RUN_RADII = 2.4;
var WC_DWELL_RADIUS = .3;
function watercolorDwellWater(dwellMs) {
	return 1 - Math.exp(-Math.max(dwellMs, 0) / 450);
}
function watercolorDwellPigment(dwellMs) {
	return 1 - Math.exp(-Math.max(dwellMs, 0) / 650);
}
/** Water remaining after `usedRadii` radii of travel, as a fraction of the
*  load the stroke started with.
*
*  `usedRadii` is a *path integral*: each segment contributes its own length
*  divided by the radius the brush had over that segment, so a stroke that
*  swells and thins under pressure depletes correctly rather than being
*  measured against whatever its final width happened to be. The engine
*  accumulates it across batches on the stroke's own scratch, which is what
*  makes a live stroke, a one-shot replay and a chunked replay agree. */
function watercolorWaterLoad(usedRadii) {
	return WATER_FLOOR + (1 - WATER_FLOOR) * Math.exp(-usedRadii / WATER_RUN_RADII);
}
/** (#536, §17.21) Whether the brush's water runs out along a stroke at all:
*  only when it carries pigment. A clean-water brush is a bottomless one —
*  "вода без пигмента могла бы вообще не заканчиваться, удобно было бы для
*  рисования по мокрому": wetting the sheet for wet-in-wet is one long
*  gesture, and a puddle that stops where the clock says it does is a puddle
*  the hand has to lay in instalments. The pigment clock is untouched — it is
*  the paint that has to run out along a line, and a water brush has none. */
function watercolorBrushRunsDry(pigment) {
	return pigment > 0;
}
/** (#536) The half-width of the brush *being held*, recovered from one dab it
*  made — as opposed to the half-width of that particular footprint.
*
*  The hair count is a property of the ferrule, so it has to be measured
*  against the brush rather than against however hard the stroke happened to
*  start. It could not simply be measured over the whole gesture instead: the
*  composite's scalars are resolved on the first call, and a live stroke's
*  first call sees one pointer event's worth of dabs while a replay's sees all
*  of them — so anything aggregated over "the dabs so far" makes the mark
*  differ between the two. The gesture's first dab is the one thing both are
*  guaranteed to agree on, which is why every scalar here comes from it, and
*  this divides the two things that shrink it back out again.
*
*  That mattered exactly as much as the brush is small. A 30 px round brush
*  begun with a light touch lands its first dab at well under half the set
*  width, which put barely three bundles across the whole mark and read as
*  broad waves; a 100 px brush begun the same way still had eight. Which is
*  "щетина хорошо видна только на крупной кисти", and it is arithmetic rather
*  than perception.
*
*  The flat needs no correction and must not be given one: its shaping puts the
*  thickness on the minor axis and its reciprocal on the aspect, so the long
*  axis — which is the ferrule — already cancels out pressure exactly. */
function watercolorFerrulePx(minorPx, aspectRatio, pressure, presetName) {
	const long = minorPx * Math.max(aspectRatio, 1);
	if (watercolorNibFromPreset(presetName) === "chisel") return long;
	const response = watercolorResponseFromPreset(presetName);
	const shrunkBy = watercolorWidth(Math.max(pressure, WATERCOLOR_MIN_PRESSURE), response) * WATERCOLOR_HEAD_TAPER.startScale;
	return Math.min(long / Math.max(shrunkBy, .05), long * 3);
}
/** Pigment remaining after the same travel, as a fraction of the load —
*  so 1 − this is the fraction already delivered, and the two always sum to
*  the budget (see PIGMENT_RUN_DRY_RADII). `water` is the brush's nominal mix
*  water, a constant of the stroke, which is what keeps a live stroke and a
*  replay of it on the same curve. */
function watercolorPigmentLoad(usedRadii, water = 0) {
	return Math.exp(-usedRadii / watercolorPigmentRun(water));
}
/** The run, in radii, over which the brush spends 1 − 1/e of its pigment. */
function watercolorPigmentRun(water) {
	return PIGMENT_RUN_DRY_RADII + (PIGMENT_RUN_WET_RADII - PIGMENT_RUN_DRY_RADII) * clamp01(water);
}
/** The delivery rate per radius, relative to a dry brush's. The budget is
*  rate × run, and the run grows with water — so the rate shrinks by the same
*  factor, or a wet brush would carry four times the paint rather than the
*  same paint further. Measured before this existed: the second pass over a
*  puddle at full water "красит что-то очень жёстко, нереально" — it was
*  laying four dry brushes' worth. A wet line is a long thin transparent
*  trail; a dry one short and concentrated; both from one load. */
function watercolorPigmentRate(water) {
	return WATERCOLOR_PIGMENT_GAIN * (1 - WATERCOLOR_WET_RATE_DROP * clamp01(water));
}
/** (#536, s17.20) The whole curve, up: "пигмента в кисти должно быть больше
*  на всех значениях пигмента" — after the budget was made finite the brush
*  carried too little at every setting. A gain on the rate, so the budget
*  rises with it and the shape along the path stays. */
var WATERCOLOR_PIGMENT_GAIN = 2.4;
/** How much lower a fully wet brush's delivery rate is than a dry one's.
*  The first cut kept the budget one number at every water (rate = run_dry /
*  run), and a line at full water started "слишком блекло" while its fade
*  looked right - so the whole curve wanted lifting, not reshaping. Half:
*  a wet brush starts at half a dry brush's rate and runs four times as
*  far, so it carries twice the paint - a loaded wet brush does. */
var WATERCOLOR_WET_RATE_DROP = .5;
/** (#536, §17.21) How much of the delivered water stands on the sheet, by
*  the brush's LOAD — the fraction of its water left (watercolorWaterLoad),
*  not the water itself: the whole film while the load is above HI, none at
*  the floor, smoothstep between. The shaders write the same rule into
*  coverage .b (wcStandingGate in WC_NOISE_GLSL — shaders.test.ts holds them
*  to these numbers).
*
*  It was smoothstep(0.05, 0.35) on the absolute water, which made the water
*  SETTING shorten the puddle: at 40 % water the brush read as nearly dry from
*  its second radius, and the puddle was gone while the mark went on for
*  twenty. On the load, a 40 % brush lays a 40 % puddle that fades along the
*  stroke exactly as a full one does.
*
*  Then linear in the load, which still ended the puddle before the mark
*  ("лужа всё ещё кончается раньше, чем штрих"): a saturated brush does not
*  lay a thinner film with every radius — the hairs hold more than they can
*  release, so the film stays whole over the body of the stroke and gives out
*  where the brush does. Full to HI = 0.35 of the load, which with the run of
*  20 radii is the first ~21; half at load 0.2, ~32 radii, where the pigment
*  has reached its own e-fold and the hairs are showing; gone at the floor.
*  The puddle now lasts the wet body of the mark and ends with its dry tail. */
var WC_STANDING_GATE_LO = WATER_FLOOR;
var WC_STANDING_GATE_HI = .35;
function watercolorStandingGate(load) {
	const t = clamp01((load - WC_STANDING_GATE_LO) / (WC_STANDING_GATE_HI - WC_STANDING_GATE_LO));
	return t * t * (3 - 2 * t);
}
/** (#536, §17.21) The standing water one dab leaves on the sheet — the
*  number the live wetness field is fed, and the same number the ribbon
*  writes into the wash's coverage .b, so the puddle the composite draws and
*  the puddle the diffusion runs in are one puddle.
*
*  They were two. The field took the nominal mix for every dab of a stroke
*  ("how wet a patch of paper is barely cares which end of the stroke wetted
*  it") while the record cut it where the brush had run dry — so a puddle
*  scribbled in one gesture drew its sheen and its bead over the whole
*  scribble, and carried pigment only along the first run of it: "пигмент
*  растекается … в рамках своей лужи, хотя лужа значительно больше". A brush
*  that has run dry wets nothing, and now the sheen says so too.
*
*  `mixWater` the preset's nominal water, `retain` what dry paper keeps of it
*  (shared by clean and pigmented water), `paperWet` the
*  wetness the dab was laid into (already-wet paper keeps everything), and
*  `load` the fraction of the brush's water left at this dab, after the
*  clocks (watercolorWaterLoad). What the field records is the max with what
*  was there; the shader takes the same max against the recorded wetness. */
function watercolorStandingWater(mixWater, retain, paperWet, load) {
	const w = clamp01(paperWet);
	return mixWater * (retain + (1 - retain) * w) * watercolorStandingGate(load);
}
/** How much wider the halo stamp is than the dab, at full paper wetness and a
*  fully wet brush. 1.9 makes a blot in standing water about 1.7-1.9x across,
*  which is what the photographs show. */
var WATERCOLOR_HALO_GROWTH = .9;
/** How much of a wet-in-wet dab's pigment leaves the brush's own footprint for
*  the water around it, at full wetness. A share, never an addition — and the
*  distinction is the whole of two complaints at once.
*
*  It used to be a per-pixel dose laid *on top of* the dab's own, so a scribble
*  of N dabs in one spot stacked N halo discs: the halo filled "at once and
*  thick", and the pigment never ran out however long the brush stayed, since
*  every dab conjured a disc's worth. And the core kept its full dose, which is
*  the wax-crayon feel — paint that has "caught on the sheet for good" and
*  merely smears. What actually happens is that a share of the dab dissolves
*  into the standing water: the mark under the brush comes out *lighter* by
*  that share, and that same share is what the halo is made of. Conserved, so
*  a scribble accumulates halo and core in the one fixed proportion, and a
*  brush running dry runs dry in both. */
var WATERCOLOR_HALO_SHED = 0;
/** A nearly dry brush still bleeds into standing water — plainly, in Ilya's
*  words, only much less than a wet one. The floor on the brush's own share of
*  the growth. */
var WATERCOLOR_HALO_DRY = .45;
/** The halo stamp for one dab: how much wider than the dab, and what fraction
*  of its dose. Both zero-effect on dry paper, so a dry-paper stroke lays no
*  halo at all and is bit-for-bit what it was. */
/** The halo stamp for one dab: how much wider than the dab, and what share of
*  its dose leaves for the water. Both zero-effect on dry paper, so a dry-paper
*  stroke lays no halo, keeps its whole dose, and is bit-for-bit what it was.
*
*  The engine hands the shed share to a stamp `scale` times wider, whose ink
*  pass normalises by radius — so per pixel the halo carries shed / scale of
*  the core, i.e. the pigment is spread as if along a ring rather than over a
*  disc. That is deliberate: in a real blot the migrating pigment does not fill
*  the water evenly, it gathers toward the front, which is why a halo is
*  visible at all and why it ends in a tideline. */
function watercolorHalo(paperWet, brushWater) {
	const wet = clamp01(paperWet) * (WATERCOLOR_HALO_DRY + (1 - WATERCOLOR_HALO_DRY) * clamp01(brushWater));
	return {
		scale: 1 + WATERCOLOR_HALO_GROWTH * wet,
		shed: WATERCOLOR_HALO_SHED * wet,
		wet
	};
}
/** How many radii of water clock one radius of travel through *fully* wet paper
*  gives back. Above 1 on purpose: at exactly 1 a brush in a puddle would only
*  hold its level, and what the hand sees is a brush that visibly recovers. */
var WATERCOLOR_PICKUP_RADII = 2.6;
/** The water clock after one segment: travel spends it, wet paper gives it
*  back. `paperWet` is what the stroke *recorded* seeing under this dab, never
*  a live reading — so replay walks the identical curve (paperWetness.ts). */
function watercolorWaterClock(usedRadii, stepRadii, paperWet) {
	const drunk = WATERCOLOR_PICKUP_RADII * clamp01(paperWet) * stepRadii;
	return Math.max(0, usedRadii + stepRadii - drunk);
}
/**
* The radius the wet model measures *travel* by — how far this nib has moved in
* its own units, world px.
*
* Derived rather than chosen. Water leaves the brush at a rate set by the area
* it wets per unit distance, which is the nib's width **across** the direction
* of travel; what it has to spend is its load, which scales with the nib's
* area. So depletion per unit distance goes as `w_perp / area`, and the radius
* that reproduces that through the existing `seg / radius` is
*
*     r = a·b / hypot(a·sin psi, b·cos psi)      psi = nib angle - travel angle
*
* with `a`, `b` the semi-axes. For a round nib that is exactly `r` at every
* angle, so this changes nothing for the tool as it shipped — the direction
* term only wakes up when the axes differ.
*
* The payoff is that it comes out right at both ends without a second rule.
* Dragged broadside a flat brush wets a band four times as wide and this
* returns the *short* axis, so it drains four times as fast — which is what a
* loaded flat actually does. Dragged edge-on it returns the long axis and lasts
* four times as long. And because the deposit dose is `seg / radius` over that
* same wider band, the tone per pixel comes out identical either way: a flat
* brush should not paint darker just because it was turned.
*
* `travelAngle` is null where there is no direction to speak of — a tap, or the
* dwell tick stamping in place. The isotropic answer there is the radius of the
* circle with the same area, which is again exactly `r` for a round nib.
*/
function watercolorTravelRadius(semiMajor, semiMinor, nibAngle, travelAngle) {
	const a = Math.max(semiMajor, .01);
	const b = Math.max(semiMinor, .01);
	if (travelAngle === null) return Math.sqrt(a * b);
	const psi = nibAngle - travelAngle;
	return a * b / Math.hypot(a * Math.sin(psi), b * Math.cos(psi));
}
/**
* The radius the wet model measures *spreading* by — how far paint wanders out
* from the mark, world px.
*
* A different question from the one above and it gets a different answer: a
* bloom is isotropic. Paint does not know which way the brush was going when it
* left, it knows how much water was put down, and that is the nib's area. So
* this is the radius of the circle with the same area — the same value
* `watercolorTravelRadius` falls back to when there is no direction, and again
* exactly `r` for a round nib.
*/
function watercolorSpreadRadius(semiMajor, semiMinor) {
	return Math.sqrt(Math.max(semiMajor, .01) * Math.max(semiMinor, .01));
}
/** How far one segment advances the depletion clock. Separated from the decay
*  curves so the engine never has to know either run length, and so both halves
*  are testable without a GL context. */
function watercolorWaterStep(segmentLengthPx, radiusPx) {
	return segmentLengthPx / Math.max(radiusPx, .5);
}
/** (#468 v5) Which paint the stroke was made with — the Colour Index code, the
*  same one printed on a real tube. Fourth field of the preset string, and
*  absent from every stroke recorded before v5, which fall back to the default.
*
*  A code rather than the four numbers it stands for: the numbers are a
*  property of the paint and may be re-tuned, and a stroke should keep meaning
*  "this was cobalt" rather than freezing whatever cobalt's granulation figure
*  happened to be on the day it was drawn. */
function watercolorPigmentFromPreset(presetName) {
	const code = presetName?.split(":")[3];
	return code && isWatercolorPigmentCode(code) ? code : DEFAULT_WATERCOLOR_PIGMENT;
}
function watercolorMixFromPreset(presetName) {
	if (!presetName) return WATERCOLOR_MIX_DEFAULT;
	const parts = presetName.split(":");
	if (parts.length < 3) return WATERCOLOR_MIX_DEFAULT;
	if (!parts[1] || !parts[2]) return WATERCOLOR_MIX_DEFAULT;
	const water = Number(parts[1]);
	const pigment = Number(parts[2]);
	if (!Number.isFinite(water) || !Number.isFinite(pigment)) return WATERCOLOR_MIX_DEFAULT;
	return {
		water: clamp01(water / 100),
		pigment: clamp01(pigment / 100)
	};
}
//#endregion
//#region apps/web/src/engine/src/watercolor/solventSource.ts
/** Exact source amplitude used by the own-water raster pass. Geometry and
* recorded wet contact are supplied by the caller, never PaperWetness clock.
* Does not rasterize or reconstruct foreign water by itself. */
function advanceSolventSource(clock, profile, segmentLength, radius, recordedWet, segmentMode, policy) {
	let waterUsed = clock.waterUsed, pigmentUsed = clock.pigmentUsed;
	if (profile.waterDepletion) {
		const step = watercolorWaterStep(segmentLength, radius);
		pigmentUsed += step;
		waterUsed = watercolorWaterClock(waterUsed, step, recordedWet);
	}
	const spendsWater = segmentMode && policy !== "legacy" ? policy === "finite" : watercolorBrushRunsDry(profile.pigmentStrength);
	const load = profile.waterDepletion && spendsWater ? watercolorWaterLoad(waterUsed) : 1;
	return {
		waterUsed,
		pigmentUsed,
		load,
		water: profile.waterDepletion ? profile.waterLevel * load : 1
	};
}
//#endregion
//#region apps/web/src/engine/src/watercolor/foreignWater.ts
function contains(d, x, y, pad = 0) {
	const dx = x - d.x, dy = y - d.y, c = Math.cos(d.angle), s = Math.sin(d.angle);
	const u = (dx * c + dy * s) / Math.max(d.radius * d.aspect + pad, .5);
	const v = (-dx * s + dy * c) / Math.max(d.radius + pad, .5);
	return u * u + v * v <= 1;
}
function selectedForeignWaterSources(sources, contacts) {
	return sources.filter((source) => source.footprints.some((d) => contacts.some((p) => contains(d, p.x, p.y, p.radius))));
}
//#endregion
//#region apps/web/src/engine/src/buffers/AccumulationBuffer.ts
function isPowerOfTwo(n) {
	return n > 0 && (n & n - 1) === 0;
}
/** Contexts whose RGBA8 framebuffer completeness has been checked once. */
var checkedContexts = /* @__PURE__ */ new WeakSet();
var AccumulationBuffer = class {
	gl;
	width;
	height;
	_texture;
	_fbo;
	constructor(gl, width, height, filter = "linear") {
		this.gl = gl;
		this.width = width;
		this.height = height;
		this._baseFilter = filter;
		this._texture = this._makeTexture(filter);
		this._fbo = this._makeFBO(this._texture);
		this._mipCapable = isPowerOfTwo(width) && isPowerOfTwo(height);
	}
	_makeTexture(filter) {
		const { gl, width, height } = this;
		const glFilter = filter === "nearest" ? gl.NEAREST : gl.LINEAR;
		const tex = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, glFilter);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, glFilter);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		return tex;
	}
	_makeFBO(texture) {
		const { gl } = this;
		const fbo = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
		if (!checkedContexts.has(gl)) {
			if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Framebuffer incomplete");
			checkedContexts.add(gl);
		}
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		return fbo;
	}
	get texture() {
		return this._texture;
	}
	get fbo() {
		return this._fbo;
	}
	/** (#365) Whether a mip chain can legally exist for this buffer at all.
	*  WebGL1 only allows mipmaps on power-of-two textures, and a texture whose
	*  min filter asks for mip levels that aren't there is *incomplete* — it
	*  samples as opaque black, the same failure mode #363's use-after-free
	*  produced. So this is checked once, up front, and every mip path below
	*  is a no-op without it rather than something that can half-apply.
	*
	*  True for an infinite room's tiles (a square TILE_SIZE = 1024) and false
	*  for a bounded room's (its own canvas size, e.g. A4's 1240x1754) and for
	*  every viewport-sized scratch/assembly buffer. That split is exactly the
	*  one that matters: minification without mip levels is what makes an
	*  infinite room's low zoom crawl and sparkle, while a bounded room is
	*  scaled down by the browser's own compositor (its canvas element carries
	*  a CSS transform) and never samples its buffers minified at all. */
	_mipCapable;
	_mipsValid = false;
	_mipSampling = false;
	/** Call before *any* write to level 0. Drops back to the plain LINEAR min
	*  filter rather than merely noting staleness: leaving a mip filter in
	*  place over a stale chain would keep sampling pixels that are no longer
	*  there, and at the zooms this exists for that reads as content lagging a
	*  frame behind the stroke drawing it. Two texParameteri calls per write
	*  batch is nothing next to the draws around them. */
	_invalidateMips() {
		if (!this._mipCapable || !this._mipsValid) return;
		const { gl } = this;
		this._mipsValid = false;
		if (!this._mipSampling) return;
		gl.bindTexture(gl.TEXTURE_2D, this._texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		this._mipSampling = false;
	}
	/** (#365) Brings the mip chain in sync with level 0 if it is not already,
	*  and reports whether a chain now exists. Does *not* change how the
	*  texture is sampled — see setMipSampling for that.
	*
	*  The two are separate because the chain is needed by more than one caller
	*  at more than one moment: the composite wants it when it is shrinking
	*  tiles, and the coarse-level fold (#365's draw-call half) wants it on
	*  every write regardless of zoom, since shrinking 1024 texels into 128
	*  unfiltered would build the coarse level out of exactly the aliasing it
	*  exists to remove. If generating also switched the filter, that fold
	*  would leave every tile sampling trilinearly at 1:1 — where the result is
	*  meant to be a plain, untouched texel copy.
	*
	*  Idempotent and cheap when nothing has been written since the last call,
	*  which is the common case: a still camera re-composites the same tiles
	*  every frame. */
	ensureMipmaps() {
		if (!this._mipCapable) return false;
		if (this._mipsValid) return true;
		const { gl } = this;
		gl.bindTexture(gl.TEXTURE_2D, this._texture);
		gl.generateMipmap(gl.TEXTURE_2D);
		this._mipsValid = true;
		return true;
	}
	/** The filter this buffer was created with — what setPointSampling restores
	*  to, so a smudge scratch (created 'nearest') does not silently come back
	*  as LINEAR. */
	_baseFilter;
	_pointSampling = false;
	/** (#507) Forces exact-texel sampling for the next draw, and back again.
	*
	*  The transform blits sample with their own hand-written bilinear filter
	*  (see TILE_BILINEAR in shaders.ts — a tiled layer cannot use the
	*  hardware's, because at a tile edge half the kernel lives in a texture
	*  this pass does not have). They fetch at exact texel centres, so the
	*  sampler must not add a second, different interpolation on top: NEAREST
	*  makes each fetch a plain floor, which is also the only thing that
	*  reliably keeps a mip filter left behind by setMipSampling out of a pass
	*  that would otherwise read blurred coarse levels.
	*
	*  Scoped to one draw — every caller turns it off immediately afterwards,
	*  which is what makes restoring from _baseFilter/_mipSampling correct
	*  rather than a guess about who else touched the texture in between. */
	setPointSampling(on) {
		if (on === this._pointSampling) return;
		const { gl } = this;
		const base = this._baseFilter === "nearest" ? gl.NEAREST : gl.LINEAR;
		gl.bindTexture(gl.TEXTURE_2D, this._texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, on ? gl.NEAREST : base);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, on ? gl.NEAREST : this._mipSampling ? gl.LINEAR_MIPMAP_LINEAR : base);
		this._pointSampling = on;
	}
	/** (#365) Chooses trilinear or plain LINEAR minification for the next draw
	*  that samples this buffer. Turning it on without a valid chain is refused
	*  rather than obeyed: a texture whose filter asks for levels it lacks is
	*  incomplete and samples as opaque black. Callers that want mip sampling
	*  must therefore go through ensureMipmaps() first and respect its answer.
	*
	*  Set per draw rather than once, because the same tile is sampled by
	*  passes that want different answers — the coarse fold always minifies,
	*  the on-screen composite only sometimes. */
	setMipSampling(on) {
		if (!this._mipCapable) return;
		const wanted = on && this._mipsValid;
		if (wanted === this._mipSampling) return;
		const { gl } = this;
		gl.bindTexture(gl.TEXTURE_2D, this._texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, wanted ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
		this._mipSampling = wanted;
	}
	beginDraw() {
		this._invalidateMips();
		const { gl, width, height } = this;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
		gl.viewport(0, 0, width, height);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
	}
	beginErase() {
		this._invalidateMips();
		const { gl, width, height } = this;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
		gl.viewport(0, 0, width, height);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
	}
	/** (#446) `result = dst * src.a` — the mirror of beginErase: what the
	*  incoming alpha covers survives, everything else is cleared. Used with a
	*  selection mask to cut a copied region out of a flattened patch, so a
	*  lasso'd shape pastes as that shape and not as its bounding rectangle.
	*
	*  Multiplying a premultiplied buffer by a scalar is exactly right for
	*  premultiplied colour — rgb and a scale together — so nothing on this path
	*  ever has to un-premultiply and re-premultiply around the mask. */
	beginKeepDraw() {
		this._invalidateMips();
		const { gl, width, height } = this;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
		gl.viewport(0, 0, width, height);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ZERO, gl.SRC_ALPHA);
	}
	/** Marker's own inkLoad accumulation (ADR 004 "Ревизия v1.5"): a pure sum,
	*  `result = src + dst`, no alpha-weighted saturation at all — unlike
	*  beginDraw()'s (ONE, ONE_MINUS_SRC_ALPHA) "over" (which is exactly what
	*  `coverage` still wants, for a fast-saturating silhouette), inkLoad is
	*  meant to keep growing across repeated overlapping dabs within one
	*  stroke with no ceiling at the accumulation stage — the only saturation
	*  happens later, once, in DAB_FRAG's composite branch
	*  (`1 - exp(-inkLoad * rate)`), not here. */
	beginAdditiveDraw() {
		this._invalidateMips();
		const { gl, width, height } = this;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
		gl.viewport(0, 0, width, height);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE);
	}
	/** Marker's own composite pass (#330): a straight overwrite, `result = src`,
	*  no blending with what's already in the target at all.
	*
	*  Every other writer here is an *increment* — one dab's own deposit,
	*  meaningless without whatever is already underneath it, so it has to blend.
	*  Marker's composite (DAB_FRAG's u_inkMode>1.5 branch) is the one exception:
	*  it is a complete recomputation of the final pixel from this stroke's
	*  frozen `original` plus its accumulated `coverage`/`inkLoad` (see
	*  RibbonStrokeScratch), so the value it produces is already the answer, not
	*  a contribution toward one.
	*
	*  Running that through beginDraw()'s "over" instead compounded alpha once
	*  per dab (`A = a + A*(1-a)`): a pixel inside N dab footprints went through
	*  N compositions, its neighbour through N-1, leaving a hard alpha step along
	*  every dab's own rim — measured up to 53/255, repeating at the dab-spacing
	*  interval, which is what made a wide stroke visibly break into separate
	*  stamped shapes (rectangular ones on the 5:1 chisel nib). #266 fixed the
	*  same compounding on the *colour* side; this is its alpha-side twin.
	*
	*  Safe to overwrite rather than blend because `coverage`/`inkLoad` only ever
	*  change where a dab actually landed, and the composite draw uses that same
	*  dab quad — so a pixel is recomputed exactly when its own inputs change,
	*  and is left alone (still holding its last correct value) when they don't.
	*  Accepted consequence: within a marker stroke's own footprint, anything a
	*  *peer* painted into the same tile mid-stroke is overwritten rather than
	*  preserved — same class of accepted v1 gap as RibbonStrokeScratch's own
	*  mid-stroke tile-eviction note. */
	beginReplaceDraw() {
		this._invalidateMips();
		const { gl, width, height } = this;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
		gl.viewport(0, 0, width, height);
		gl.disable(gl.BLEND);
	}
	/** (#536, s17.28) Blend by MAX (EXT_blend_minmax): what lands on a texel is
	*  the largest of the writes, not their sum. The watercolor deposit is a
	*  FILM the brush leaves, and a film is as thick as the brush made it, not
	*  as thick as the number of stamps that happened to overlap there. */
	beginMaxDraw(ext) {
		this._invalidateMips();
		const { gl, width, height } = this;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
		gl.viewport(0, 0, width, height);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE);
		gl.blendEquation(ext.MAX_EXT);
	}
	endDraw() {
		this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
		this.gl.disable(this.gl.BLEND);
		this.gl.blendEquation(this.gl.FUNC_ADD);
	}
	clear() {
		this._invalidateMips();
		const { gl } = this;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}
	/** (#536, §17.68) `into`, when big enough, is filled instead of a new array. */
	readPixels(into) {
		const { gl, width, height } = this;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
		const n = width * height * 4;
		const pixels = into && into.byteLength >= n ? into.subarray(0, n) : new Uint8Array(n);
		gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		return pixels;
	}
	restorePixels(pixels) {
		this._invalidateMips();
		const { gl, width, height } = this;
		gl.bindTexture(gl.TEXTURE_2D, this._texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
	}
	/** (#536, ADR 011 §17.68) The whole texture overwritten in place with
	*  `pixels` - same content as restorePixels, but no new storage: a wash
	*  brought back from main memory uploads dozens of these at once, and on
	*  the iPad reallocating each one next to the storage still being freed was
	*  the spike the tab did not survive. */
	writePixels(pixels) {
		this._invalidateMips();
		const { gl, width, height } = this;
		gl.bindTexture(gl.TEXTURE_2D, this._texture);
		gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
	}
	/** (#425) Restores a payload that covers only the world-top-left `w`x`h` of
	*  this buffer, leaving the rest transparent.
	*
	*  Exists because a bounded room's tile grid overhangs the sheet: a
	*  1754x2480 canvas on 1024-pixel tiles has a right-hand column running to
	*  2048 and a bottom row running to 3072. Those pixels cannot be displayed
	*  by anything — the sheet ends — but they were baked, gzipped, stored,
	*  shipped and inflated by every client on every first join. Measured on
	*  room U68gWoq-: 6.70 MB on the wire, 4.81 MB with the overhang dropped.
	*
	*  A full-size payload takes the plain path above: an old snapshot stored
	*  before this existed is exactly the case where `w`/`h` equal the buffer's
	*  own size, so nothing needs to know which era it came from.
	*
	*  The reallocation is not incidental. `texSubImage2D` alone would leave
	*  whatever the texture held outside the sub-rect, and this is a *restore* —
	*  it has to mean the same thing the whole-texture path means, which is
	*  "this buffer now holds exactly this and nothing else". `texImage2D` with
	*  null data is specified to zero-fill, so the overhang lands transparent
	*  rather than merely unspecified.
	*
	*  (#500) The y offset is `height - h`, not 0, and that is the whole
	*  correctness of this method. What gets clipped away is the part of the
	*  tile *below* the sheet, so the rows that survive are the tile's world-top
	*  ones — which, this array being GL bottom-up, are its *last* rows, and so
	*  belong at the top of the texture. Uploading them at y 0 puts them under
	*  the paper instead: on a 2480x3508 page the bottom tile row's 436 surviving
	*  rows landed at world y 3660..4095, where nothing renders them and the next
	*  bake — clipping to the sheet again, over rows now empty — wrote the loss
	*  back to the server. Columns need no such care; see clipTileToPage, which
	*  keeps the first `keepW` of them in both conventions. */
	restorePixelsRect(w, h, pixels) {
		const { gl, width, height } = this;
		if (w === width && h === height) {
			this.restorePixels(pixels);
			return;
		}
		this._invalidateMips();
		gl.bindTexture(gl.TEXTURE_2D, this._texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		if (w > 0 && h > 0) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, height - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
	}
	copyTo(dest) {
		dest._invalidateMips();
		const { gl } = this;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
		gl.bindTexture(gl.TEXTURE_2D, dest._texture);
		gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, this.width, this.height, 0);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}
	/** Like copyTo, but from an arbitrary sub-rect of this buffer into an
	*  arbitrary sub-rect of `dest` — smudge's own "pick up whatever's
	*  currently under/behind the dab" step (engine/index.ts's
	*  SmudgePainter.gatherPatch), copied into an independent scratch texture so it
	*  can be sampled while this buffer's own tile keeps being the render
	*  target (WebGL1 forbids reading and writing the same texture in one
	*  draw call — same reasoning AreaOps.bakeLayerTransform's scratch-then-copyTo
	*  two-phase commit exists for).
	*
	*  Both `srcGl*` and `destGl*` are bottom-up (native GL framebuffer
	*  convention, like copyTexSubImage2D's own x/y) — the caller flips from
	*  this engine's usual top-down app-space convention, same as every other
	*  app-space/GL-space boundary in this codebase (DAB_VERT, pickColor).
	*
	*  (#514) Was `copyRegionTo`, which wrote the whole of `dest` through
	*  `copyTexImage2D` and so could only ever be fed one rect from one
	*  source. A smudge patch straddling a tile seam is several rects from
	*  several tiles assembled into one buffer, which needs the *sub*-image
	*  form: `copyTexSubImage2D` leaves everything outside the destination
	*  rect untouched (so successive calls accumulate) and, unlike
	*  copyTexImage2D, does not redefine `dest`'s storage — meaning `dest`
	*  keeps the size its `width`/`height` fields claim, and a caller must
	*  size its own request to match rather than relying on a silent resize.
	*  Anything outside every rect the caller copies keeps whatever `dest`
	*  held before, so a pooled buffer wants clearing first. */
	copyRegionInto(dest, srcGlX, srcGlY, destGlX, destGlY, w, h) {
		if (w <= 0 || h <= 0) return;
		dest._invalidateMips();
		const { gl } = this;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
		gl.bindTexture(gl.TEXTURE_2D, dest._texture);
		gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, destGlX, destGlY, srcGlX, srcGlY, w, h);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}
	destroy() {
		this.gl.deleteTexture(this._texture);
		this.gl.deleteFramebuffer(this._fbo);
	}
};
//#endregion
//#region apps/web/src/engine/src/buffers/RibbonStrokeScratch.ts
/** Parked state is zero-padded in full, regardless of a display's scissor. */
function clearParkedBuffer(buffer) {
	const gl = buffer.gl, scissor = gl.isEnabled(gl.SCISSOR_TEST);
	if (scissor) gl.disable(gl.SCISSOR_TEST);
	buffer.clear();
	if (scissor) gl.enable(gl.SCISSOR_TEST);
}
var RibbonStrokeScratch = class RibbonStrokeScratch {
	_storageBounds = null;
	noteStorageBounds(bounds) {
		const old = this._storageBounds;
		if (old === void 0) return;
		this._storageBounds = old ? {
			minX: Math.min(old.minX, bounds.minX),
			minY: Math.min(old.minY, bounds.minY),
			maxX: Math.max(old.maxX, bounds.maxX),
			maxY: Math.max(old.maxY, bounds.maxY)
		} : { ...bounds };
	}
	_tiles = /* @__PURE__ */ new Map();
	pool;
	/** (#536, §17.19) Whether tiles carry inkColor — watercolor only. */
	needsColor;
	/** (#536, §17.20) Every paint laid into this wash, as colour keys. While it
	*  is one paint, the colour record is the deposit times one absorption and
	*  the diffusion need not carry it — see _diffuseWash. */
	paints = /* @__PURE__ */ new Set();
	/** (#536, §17.21) What each dab of the batch just painted left standing on
	*  the sheet (watercolorStandingWater) — the ribbon build writes it, and
	*  whoever feeds the live wetness field reads it, so the field and the
	*  wash's coverage .b are fed one number. Cleared per batch; the keys are
	*  the batch's own dab objects. */
	standing = /* @__PURE__ */ new Map();
	/** (#536, §17.22) Live batches no longer composite one by one: each adds
	*  its rect here, and the engine composites the union once per displayed
	*  frame (_flushLiveComposite). Keyed by tile buffer. */
	pendingComposite = /* @__PURE__ */ new Map();
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
	lastKept = void 0;
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
	foreignImportedGestures = /* @__PURE__ */ new Set();
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
			if (entry.solventGesture === gesture) {
				for (const b of [entry.strokeSolvent, entry.solventBase]) if (b) this.pool.release(b);
				entry.strokeSolvent = null;
				entry.solventBase = null;
				entry.solventGesture = -1;
			}
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
		this.lastKept = void 0;
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
		this._waterUsed = 0;
		this._pigmentUsed = 0;
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
	/** Read-only iteration; the scratch retains ownership of these buffers. */
	tileEntries() {
		return this._tiles.entries();
	}
	getOrCreate(tile) {
		let entry = this._tiles.get(tile);
		if (!entry) {
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
	/** Bounded diagnostic solvent state: one loaded-contact film is V=1;
	* RGBA8 stores V/4. MAX within the gesture, additive/capped between films. */
	solventFilm(tile) {
		const entry = this.getOrCreate(tile);
		if (!entry.solventLoad) {
			entry.solventLoad = this.pool.acquire(tile.width, tile.height);
			entry.solventLoad.clear();
		}
		if (entry.solventGesture !== this.gesture) {
			entry.strokeSolvent ??= this.pool.acquire(tile.width, tile.height);
			entry.solventBase ??= this.pool.acquire(tile.width, tile.height);
			entry.strokeSolvent.clear();
			entry.solventLoad.copyTo(entry.solventBase);
			entry.solventGesture = this.gesture;
		}
		return {
			load: entry.solventLoad,
			base: entry.solventBase,
			film: entry.strokeSolvent
		};
	}
	/** Ends this gesture's use of its buffers. Named as it always was, and it
	*  still means "this scratch is finished with" — what changed (#385) is that
	*  the buffers go back to the pool instead of to the driver. */
	destroy() {
		this._storageBounds = null;
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
		for (const { original, coverage, inkLoad, inkSettled, inkColor, colorSettled, strokeInk, inkBase, strokeColor, colorBase, inkDry, colorDry, solventLoad, solventBase, strokeSolvent, foreignSolventLoad } of this._tiles.values()) {
			for (const b of [
				strokeInk,
				inkBase,
				strokeColor,
				colorBase,
				inkDry,
				colorDry,
				solventLoad,
				solventBase,
				strokeSolvent,
				foreignSolventLoad
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
			waterUsed: this._waterUsed,
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
			lastKept: this.lastKept ? { ...this.lastKept } : void 0,
			gesture: this.gesture,
			landing: this.landing ? { ...this.landing } : null,
			dwellMs: this.dwellMs,
			dwellDone: this.dwellDone,
			turnOffset: [...this.turnOffset],
			turnDirection: this.turnDirection ? [...this.turnDirection] : null,
			brushTravel: this.brushTravel.map((d) => ({ ...d })),
			foreignSources: this.foreignSources,
			foreignImportedGestures: [...this.foreignImportedGestures],
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
		this._waterUsed = snap.waterUsed;
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
		this.lastKept = snap.lastKept ? { ...snap.lastKept } : void 0;
		this.gesture = snap.gesture;
		this.landing = snap.landing ? { ...snap.landing } : null;
		this.dwellMs = snap.dwellMs;
		this.dwellDone = snap.dwellDone;
		this.turnOffset = [...snap.turnOffset];
		this.turnDirection = snap.turnDirection ? [...snap.turnDirection] : null;
		this.brushTravel = snap.brushTravel.map((d) => ({ ...d }));
		this.foreignSources = snap.foreignSources;
		this.foreignImportedGestures = new Set(snap.foreignImportedGestures ?? []);
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
		const owned = /* @__PURE__ */ new Set(), moved = /* @__PURE__ */ new Set();
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
				if (entry.strokeInk || entry.inkBase || entry.strokeColor || entry.colorBase || entry.strokeSolvent || entry.solventBase) return null;
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
				const columns = Math.max(1, Math.floor(tile.width / w));
				const capacity = columns * Math.max(1, Math.floor(tile.height / h));
				if (Math.ceil(parts.length / capacity) >= parts.length) for (const k of parts) bufs[k] = whole(entry[k]);
				else {
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
						else clearParkedBuffer(atlas);
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
		const references = /* @__PURE__ */ new Map();
		for (const t of sp.tiles) for (const p of Object.values(t.bufs)) if (p) references.set(p.buffer, (references.get(p.buffer) ?? 0) + 1);
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
					colorDry: take(t.bufs.colorDry),
					solventLoad: take(t.bufs.solventLoad),
					foreignSolventLoad: take(t.bufs.foreignSolventLoad)
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
				colorDry: null,
				solventLoad: take(t.bufs.solventLoad),
				foreignSolventLoad: take(t.bufs.foreignSolventLoad)
			});
		}
		return s;
	}
};
/** (#536, §17.56) The tile textures of a wash that outlive a gesture. Not
*  the provisional dry picture (inkDry/colorDry): the next operation's settle
*  lays it again before the composite reads it, and leaving it out was the
*  same to a level on the devices and a quarter less memory (80 MB of
*  carried washes on the iPad instead of 96). */
var SNAPSHOT_TILE_BUFFERS = [
	"original",
	"coverage",
	"inkLoad",
	"inkSettled",
	"inkColor",
	"colorSettled",
	"solventLoad",
	"foreignSolventLoad"
];
/** (#536, §17.68) Every tile buffer of an open wash at rest. */
var SPILL_TILE_BUFFERS = [
	"original",
	"coverage",
	"inkLoad",
	"inkSettled",
	"inkColor",
	"colorSettled",
	"inkDry",
	"colorDry",
	"solventLoad",
	"foreignSolventLoad"
];
//#endregion
//#region apps/web/src/engine/src/presets/pencilPresets.ts
var PENCIL_GRADES = [
	"6H",
	"5H",
	"4H",
	"3H",
	"2H",
	"H",
	"F",
	"HB",
	"B",
	"2B",
	"3B",
	"4B",
	"5B",
	"6B"
];
new Set(PENCIL_GRADES);
var GRADE_INDEX = {
	"6H": -6,
	"5H": -5,
	"4H": -4,
	"3H": -3,
	"2H": -2,
	"H": -1,
	"F": -.5,
	"HB": 0,
	"B": 1,
	"2B": 2,
	"3B": 3,
	"4B": 4,
	"5B": 5,
	"6B": 6
};
var ANCHOR_H = {
	opacity: .32,
	hardness: .55,
	sizeMultiplier: .85
};
var ANCHOR_HB = {
	opacity: .48,
	hardness: .38,
	sizeMultiplier: 1
};
var ANCHOR_2B = {
	opacity: .65,
	hardness: .25,
	sizeMultiplier: 1.1
};
var ANCHOR_H_X = -1;
var ANCHOR_HB_X = 0;
var ANCHOR_2B_X = 2;
var BOUNDS = {
	opacity: [.08, .95],
	hardness: [.05, .95],
	sizeMultiplier: [.5, 1.6]
};
function clamp$1(v, [lo, hi]) {
	return Math.min(hi, Math.max(lo, v));
}
function interpolate(x, key) {
	const h = ANCHOR_H[key];
	const hb = ANCHOR_HB[key];
	const b2 = ANCHOR_2B[key];
	const globalSlope = (b2 - h) / (ANCHOR_2B_X - ANCHOR_H_X);
	let raw;
	if (x <= ANCHOR_H_X) raw = h + globalSlope * (x - ANCHOR_H_X);
	else if (x < ANCHOR_HB_X) raw = h + (hb - h) / (ANCHOR_HB_X - ANCHOR_H_X) * (x - ANCHOR_H_X);
	else if (x <= ANCHOR_2B_X) raw = hb + (b2 - hb) / (ANCHOR_2B_X - ANCHOR_HB_X) * (x - ANCHOR_HB_X);
	else raw = b2 + globalSlope * (x - ANCHOR_2B_X);
	return clamp$1(raw, BOUNDS[key]);
}
function buildPresets() {
	const presets = {};
	for (const grade of PENCIL_GRADES) {
		const x = GRADE_INDEX[grade];
		presets[grade] = {
			opacity: interpolate(x, "opacity"),
			hardness: interpolate(x, "hardness"),
			sizeMultiplier: interpolate(x, "sizeMultiplier")
		};
	}
	return presets;
}
buildPresets();
//#endregion
//#region apps/web/src/engine/src/dabs/markerRibbon.ts
function nibGeometry(dab, sizeMultiplier, shape = "ellipse", cornerFraction = 0) {
	const semiMinor = dab.size * .5 * sizeMultiplier;
	return {
		shape,
		semiMajor: semiMinor * Math.max(dab.aspectRatio, 1),
		semiMinor,
		cornerRadius: semiMinor * cornerFraction,
		angle: dab.angle
	};
}
function tipContactPressure(pressure, radius) {
	if (pressure <= 0) return 0;
	const t = Math.max(0, Math.min(1, radius - 1));
	return Math.max(pressure, .06 * (1 - t * t * (3 - 2 * t)));
}
/**
* Support point of the nib in world direction (nx, ny), relative to its own
* centre, plus the support *value* — the distance from the centre to the
* tangent line with that normal. Those two are all the band construction needs,
* for any convex nib.
*
* Ellipse: in its own frame the support value of direction u is
* sqrt((a·u.x)² + (b·u.y)²), touching at (a²u.x, b²u.y) / that value.
*
* Rounded box: a box of half-extents (a, b) shrunk by the corner radius r, then
* grown back by a disc of radius r — a Minkowski sum, and support functions add
* over one, so h(u) = (a-r)|u.x| + (b-r)|u.y| + r, touching at the shrunk box's
* own corner offset by r·u.
*/
function nibSupport(nib, nx, ny) {
	const { semiMajor: a, semiMinor: b, angle, shape } = nib;
	const c = Math.cos(angle), s = Math.sin(angle);
	const ux = nx * c + ny * s;
	const uy = -nx * s + ny * c;
	let px, py, value;
	if (shape === "roundedBox") {
		const r = Math.min(nib.cornerRadius, a, b);
		const ix = a - r, iy = b - r;
		value = ix * Math.abs(ux) + iy * Math.abs(uy) + r;
		px = Math.sign(ux) * ix + r * ux;
		py = Math.sign(uy) * iy + r * uy;
	} else {
		value = Math.hypot(a * ux, b * uy);
		if (value < 1e-9) return {
			x: 0,
			y: 0,
			value: 0
		};
		px = a * a * ux / value;
		py = b * b * uy / value;
	}
	return {
		x: px * c - py * s,
		y: px * s + py * c,
		value
	};
}
/** Area of the nib, px². Exact for both shapes: a rounded box is the box
*  minus the four corner squares it lost, plus the disc that replaced them. */
function nibArea(nib) {
	const { semiMajor: a, semiMinor: b } = nib;
	if (nib.shape === "roundedBox") {
		const r = Math.min(nib.cornerRadius, a, b);
		return 4 * a * b - (4 - Math.PI) * r * r;
	}
	return Math.PI * a * b;
}
/**
* (#559) Mean chord of the nib along world direction (tx, ty), px: how far,
* on average, a point travelling that way spends inside the nib. Area divided
* by the nib's width *across* the direction (twice its support value along
* the normal) — Cavalieri, no integration needed.
*
* This is the quantity the ink deposit is really proportional to. A pixel on
* the path is inside `chord / spacing` consecutive stamps, each laying
* `opacity * spacing`, so the ink it accumulates is `opacity * chord` whatever
* the spacing — and for a chisel drawn broad-side-on the chord is the nib's
* *short* axis, a fifth of the number in the toolbar. See markerInkGain.ts.
*/
function nibMeanChord(nib, tx, ty) {
	const width = 2 * nibSupport(nib, -ty, tx).value;
	return width > 1e-6 ? nibArea(nib) / width : 0;
}
/**
* Triangles for the bands connecting each consecutive pair of dabs, as a flat
* interleaved array of (x, y, edgePx) — world coordinates, caller offsets them
* into tile space.
*
* `edgePx` is the distance from that vertex to the ribbon's nearest *outer*
* boundary, in canvas pixels, and it is what makes the edge crisp at a width
* that no longer scales with the brush: the fragment shader turns it straight
* into coverage over a fixed ~1px ramp.
*
* Each band is emitted as two quads split along the centre line (centre → left
* tangent, centre → right tangent) rather than one. That split is not cosmetic:
* across the whole band the distance-to-nearest-edge is `min` of two linear
* functions, which a single quad's linear interpolation cannot represent — it
* would sag to a wrong value down the middle. Split at the ridge, each half is
* genuinely linear and interpolates exactly.
*
* The band's two *ends* deliberately carry no edge falloff at all: they are
* interior to the union (the nib drawn at each endpoint covers them), so
* antialiasing them would paint a hairline seam right through the middle of a
* solid mark — the classic abutting-AA-polygons failure.
*/
/** Shortest-arc interpolation, so a nib crossing ±π doesn't spin the long way
*  round between two samples. */
function lerpAngle(a, b, t) {
	let d = b - a;
	while (d > Math.PI) d -= 2 * Math.PI;
	while (d < -Math.PI) d += 2 * Math.PI;
	return a + d * t;
}
function lerpDab(d0, d1, t) {
	return {
		...d0,
		x: d0.x + (d1.x - d0.x) * t,
		y: d0.y + (d1.y - d0.y) * t,
		size: d0.size + (d1.size - d0.size) * t,
		aspectRatio: d0.aspectRatio + (d1.aspectRatio - d0.aspectRatio) * t,
		angle: lerpAngle(d0.angle, d1.angle, t)
	};
}
/**
* How many sub-steps this pair needs (#330 follow-up).
*
* "Band + two nibs is the exact swept figure" holds for a *translation*. It
* stops holding the moment the nib also turns or changes size between samples:
* the intermediate poses then bulge outside the convex hull of the two end
* ones, and the ribbon under-covers by the width of that bulge. Rendered, that
* is a row of rounded bites out of the outer edge of every turn — measured at
* 1.66px on a 120px chisel following a 150px-radius arc, against 0.08px for
* the same arc with the nib angle held fixed.
*
* Subdividing the *band* alone does nothing (measured: 1.66 -> 1.61), because
* the missing area is nib body, not band. Interpolated poses in between are
* what closes it (0.12px at 8 sub-steps).
*
* The bulge scales with how far the nib reaches and how much its pose changes,
* so that product is what gets divided down until it is under
* `MARKER_POSE_STEP_PX`. Capped: past a dozen sub-steps the geometry cost stops
* being worth the vanishing improvement, and a pose difference that large means
* the sampler upstream should have emitted more dabs anyway.
*/
var MARKER_POSE_STEP_PX = 1;
var MARKER_MAX_SUBSTEPS = 12;
function poseSubdivisions(g0, g1) {
	const reach = Math.max(g0.semiMajor, g1.semiMajor);
	const drift = Math.abs(lerpAngle(g0.angle, g1.angle, 1) - g0.angle) * reach + (Math.abs(g1.semiMajor - g0.semiMajor) + Math.abs(g1.semiMinor - g0.semiMinor));
	if (drift <= MARKER_POSE_STEP_PX) return 1;
	return Math.min(MARKER_MAX_SUBSTEPS, Math.ceil(drift / MARKER_POSE_STEP_PX));
}
/** Points around the nib's outline, shrunk inward by `inset` px. For a rounded
*  box the inset of the shape is exactly the same shape with every extent
*  reduced by the inset, which is what this relies on; for an ellipse it is an
*  approximation, and a good one at the sub-pixel insets this is used with. */
function outlinePoints(nib, inset, segments) {
	const a = Math.max(nib.semiMajor - inset, .001);
	const b = Math.max(nib.semiMinor - inset, .001);
	const c = Math.cos(nib.angle), s = Math.sin(nib.angle);
	const pts = [];
	for (let i = 0; i < segments; i++) {
		const phi = i / segments * Math.PI * 2;
		let lx, ly;
		if (nib.shape === "roundedBox") {
			const r = Math.min(Math.max(nib.cornerRadius - inset, 0), a, b);
			const ux = Math.cos(phi), uy = Math.sin(phi);
			const m = Math.max(Math.abs(ux) / (a - r || .001), Math.abs(uy) / (b - r || .001));
			lx = ux / m + r * ux;
			ly = uy / m + r * uy;
		} else {
			lx = a * Math.cos(phi);
			ly = b * Math.sin(phi);
		}
		pts.push({
			x: lx * c - ly * s,
			y: lx * s + ly * c
		});
	}
	return pts;
}
var OUTLINE_SEGMENTS = 16;
function buildRibbonBands(dabs, sizeMultiplier, prevDab, shape = "ellipse", cornerFraction = 0, aaPx = 1, inkFor, fillEveryPose = false) {
	const chain = prevDab ? [prevDab, ...dabs] : dabs;
	if (chain.length < 2) return /* @__PURE__ */ new Float32Array(0);
	const out = [];
	let ink = 0;
	let inkWater = 0;
	let inkWet = 0;
	let inkStrength = 0;
	let pressure = 1;
	let endPressure = 1;
	let pigmentPool = .5;
	let puddle = 1;
	const push = (x, y, edge, across, press = pressure) => {
		out.push(x, y, edge, ink, inkWater, across, inkWet, inkStrength, puddle, press, pigmentPool);
	};
	const quad = (m0, e0, t0, m1, e1, t1, side) => {
		push(m0.x, m0.y, e0, 0);
		push(t0.x, t0.y, 0, side);
		push(t1.x, t1.y, 0, side, endPressure);
		push(m0.x, m0.y, e0, 0);
		push(t1.x, t1.y, 0, side, endPressure);
		push(m1.x, m1.y, e1, 0, endPressure);
	};
	/** One nib body, as an antialiased polygon: a ring of triangles carrying the
	*  edge ramp, and a fan filling everything inside it solid. Only ever emitted
	*  for *interpolated* poses — the real samples get an exact analytic outline
	*  from the shader instead (DAB_FRAG's u_inkMode=6). */
	const body = (centre, nib, nx, ny) => {
		const inset = Math.min(aaPx, nib.semiMinor * .5);
		const rim = outlinePoints(nib, 0, OUTLINE_SEGMENTS);
		const core = outlinePoints(nib, inset, OUTLINE_SEGMENTS);
		const reach = Math.max(nibSupport(nib, nx, ny).value, .001);
		const across = (p) => Math.max(-1, Math.min(1, (p.x * nx + p.y * ny) / reach));
		for (let i = 0; i < OUTLINE_SEGMENTS; i++) {
			const j = (i + 1) % OUTLINE_SEGMENTS;
			const r0 = {
				x: centre.x + rim[i].x,
				y: centre.y + rim[i].y
			};
			const r1 = {
				x: centre.x + rim[j].x,
				y: centre.y + rim[j].y
			};
			const c0 = {
				x: centre.x + core[i].x,
				y: centre.y + core[i].y
			};
			const c1 = {
				x: centre.x + core[j].x,
				y: centre.y + core[j].y
			};
			const ar0 = across(rim[i]), ar1 = across(rim[j]);
			const ac0 = across(core[i]), ac1 = across(core[j]);
			push(r0.x, r0.y, 0, ar0);
			push(r1.x, r1.y, 0, ar1);
			push(c1.x, c1.y, inset, ac1);
			push(r0.x, r0.y, 0, ar0);
			push(c1.x, c1.y, inset, ac1);
			push(c0.x, c0.y, inset, ac0);
			push(centre.x, centre.y, inset, 0);
			push(c0.x, c0.y, inset, ac0);
			push(c1.x, c1.y, inset, ac1);
		}
	};
	for (let i = 0; i + 1 < chain.length; i++) {
		const d0 = chain[i], d1 = chain[i + 1];
		const travel = Math.hypot(d1.x - d0.x, d1.y - d0.y);
		if (travel < 1e-6) continue;
		if (inkFor) {
			const got = inkFor(d0, d1, travel);
			ink = got.ink;
			inkWater = ink * got.water;
			inkWet = ink * got.paperWet;
			inkStrength = ink * got.strength;
			puddle = got.puddle ?? 1;
			pigmentPool = got.pigmentPool ?? .5;
		} else {
			ink = d1.opacity * travel * .5;
			inkWater = 0;
			inkWet = 0;
			inkStrength = 0;
			puddle = 1;
			pigmentPool = .5;
		}
		const steps = poseSubdivisions(nibGeometry(d0, sizeMultiplier, shape, cornerFraction), nibGeometry(d1, sizeMultiplier, shape, cornerFraction));
		for (let k = 0; k < steps; k++) {
			const a = k === 0 ? d0 : lerpDab(d0, d1, k / steps);
			const b = k === steps - 1 ? d1 : lerpDab(d0, d1, (k + 1) / steps);
			const dx = b.x - a.x, dy = b.y - a.y;
			const len = Math.hypot(dx, dy);
			if (len < 1e-6) continue;
			const nx = -dy / len, ny = dx / len;
			const ga = nibGeometry(a, sizeMultiplier, shape, cornerFraction);
			const gb = nibGeometry(b, sizeMultiplier, shape, cornerFraction);
			pressure = tipContactPressure(a.pressure, ga.semiMinor);
			endPressure = tipContactPressure(b.pressure, gb.semiMinor);
			const la = nibSupport(ga, nx, ny), lb = nibSupport(gb, nx, ny);
			const ra = nibSupport(ga, -nx, -ny), rb = nibSupport(gb, -nx, -ny);
			const ca = {
				x: a.x,
				y: a.y
			}, cb = {
				x: b.x,
				y: b.y
			};
			quad(ca, la.value, {
				x: a.x + la.x,
				y: a.y + la.y
			}, cb, lb.value, {
				x: b.x + lb.x,
				y: b.y + lb.y
			}, 1);
			quad(ca, ra.value, {
				x: a.x + ra.x,
				y: a.y + ra.y
			}, cb, rb.value, {
				x: b.x + rb.x,
				y: b.y + rb.y
			}, -1);
			if (k > 0 || fillEveryPose) body(ca, ga, nx, ny);
		}
	}
	return new Float32Array(out);
}
//#endregion
//#region apps/web/src/engine/src/dabs/markerInkGain.ts
var MARKER_INK_REF_CHORD_PX = 4.5;
/**
* Multiplier for this dab's (or band's) ink deposit, >= 1. `dx, dy` is the
* direction the nib is being dragged in — from the previous dab, or along the
* band — and need not be normalized.
*
* A zero vector (the first dab of a stroke, a tap, a dwell tick stamped in
* place) has no direction to measure a chord along and gets exactly 1: the
* legacy deposit, untouched. Not a look-ahead to the next dab, because the
* next dab is not always there yet — a live stroke's first batch can be one
* sample long while the replay of the same operation has the whole stroke in
* hand, and the two would then ink the first stamp differently. What that
* costs is one under-inked stamp at the very start of a thin stroke, under the
* band and the gained stamp that follow it within a chord's length.
*
* Pure in the dabs and the profile otherwise, so live paint and replay agree:
* a peer folding the same operation computes the same directions from the same
* recorded positions.
*/
function markerThinNibInkGain(nib, dx, dy, refChordPx) {
	if (refChordPx <= 0) return 1;
	const len = Math.hypot(dx, dy);
	if (len <= 1e-6) return 1;
	const chord = nibMeanChord(nib, dx / len, dy / len);
	if (chord <= 1e-6) return 1;
	return Math.max(1, refChordPx / chord);
}
//#endregion
//#region packages/shared/dist/paper.js
var PAPER_COARSENESS = [
	"coarse",
	"medium",
	"fine"
];
var PAPER_TYPES = [...PAPER_COARSENESS, "flat"];
function paperCoarsenessOf(type) {
	const head = type.split("-")[0];
	return PAPER_COARSENESS.includes(head) ? head : null;
}
var DEFAULT_PAPER_COLOR_BY_COARSENESS = {
	coarse: "#faf8f4",
	medium: "#fcfbf9",
	fine: "#fdfdfc"
};
function defaultPaperColor(type) {
	const coarseness = paperCoarsenessOf(type);
	return coarseness ? DEFAULT_PAPER_COLOR_BY_COARSENESS[coarseness] : "#fcfcfa";
}
Object.fromEntries(PAPER_TYPES.map((t) => [t, defaultPaperColor(t)]));
//#endregion
//#region apps/web/src/engine/src/paper/paperWetness.ts
var HEX = "0123456789abcdef";
function dequantizeWet(ch) {
	const i = HEX.indexOf(ch);
	return i < 0 ? 0 : i / 15;
}
/** Wetness a stroke saw at `dabIndex`, read back out of a recorded profile.
*  A short profile — the stroke went on past what was written, or the field is
*  absent entirely — reads as dry, which is what an older recording is. */
function wetAt(profile, dabIndex) {
	if (!profile) return 0;
	return dabIndex < profile.length ? dequantizeWet(profile[dabIndex]) : 0;
}
/** (#536, s17.25) The wettest paper the operation ran over, anywhere along
*  it: whether its water joined a puddle already on the sheet. */
function wetPeak(profile) {
	if (!profile) return 0;
	let peak = 0;
	for (let i = 0; i < profile.length; i++) peak = Math.max(peak, dequantizeWet(profile[i]));
	return peak;
}
//#endregion
//#region apps/web/src/engine/src/watercolor/pigmentOptics.ts
/** The smallest transmittance a pigment channel may claim. A channel at
*  zero would be infinite depth — one dab would blacken any mixture for
*  ever — so the deepest paint is capped: −ln(0.02) ≈ 3.9. */
var PIGMENT_T_MIN = .02;
/** The absorption of a paint from its colour: τ = −ln(T), per channel. */
function pigmentAbsorption(color) {
	return [
		-Math.log(Math.min(1, Math.max(PIGMENT_T_MIN, color[0]))),
		-Math.log(Math.min(1, Math.max(PIGMENT_T_MIN, color[1]))),
		-Math.log(Math.min(1, Math.max(PIGMENT_T_MIN, color[2])))
	];
}
//#endregion
//#region apps/web/src/engine/src/dabs/ribbonProfile.ts
var MARKER_EDGE_AA_PX = 1;
var MARKER_CURVATURE_TOLERANCE_PX = .15;
var MARKER_CHISEL_CORNER_FRACTION = .28;
var MARKER_INK_EDGE_FALLOFF = .9;
var BRUSH_PEN_EDGE_AA_PX = 1.8;
/** ADR 009 §2: below this half-width the nib is widened rather than dropped —
*  see RibbonProfile.minHalfWidthPx. Half a canvas pixel is where a mark stops
*  being resolvable at all. */
var BRUSH_PEN_MIN_HALF_WIDTH_PX = .5;
/** ADR 009 §8: paper's influence on the brush pen is far weaker than on
*  graphite or charcoal, and it acts on the rim only — no holes or grain inside
*  the stroke, which would read as a dry brush rather than a brush pen.
*
*  A fraction of the edge ramp (BRUSH_PEN_EDGE_AA_PX, 1.8 canvas px), so 0.5
*  means ink reaches roughly 0.9px further out where the paper is at its most
*  absorbent than where it is at its least. That sits inside the 0.3-1.0px of
*  visible feathering ADR 009 §7 asks for, and it is the *whole* of the pen's
*  spread: there is no second outward band the way the liner has one, because
*  the ribbon's own ramp is already in the right units and the ADR is explicit
*  that one effect gets one mechanism.
*
*  Raised from #454's 0.35 along with the sign fix (#472) — at 0.35 running
*  the wrong way it was subtracting about half a pixel of ink from exactly the
*  places ink should have been reaching. Uncalibrated. */
var BRUSH_PEN_PAPER_WICK = .5;
var MARKER_BULLET_RIBBON = {
	stampsOnly: false,
	coverageInkMode: 6,
	stampFlow: null,
	nibShape: "ellipse",
	cornerFraction: 0,
	aaPx: MARKER_EDGE_AA_PX,
	ink: true,
	inkEdgeFalloff: MARKER_INK_EDGE_FALLOFF,
	compositeInkMode: 2,
	curvatureTolerancePx: MARKER_CURVATURE_TOLERANCE_PX,
	minHalfWidthPx: null,
	paperRim: 0,
	wetEdge: 0,
	wetEdgeRadiusPx: 0,
	granulation: 0,
	spreadPx: 0,
	cloud: 0,
	normalizeDeposit: false,
	thinNibInkRefPx: MARKER_INK_REF_CHORD_PX,
	depositPerRadius: 0,
	stampInkShare: 0,
	waterDepletion: false,
	waterLevel: 0,
	pigmentLevel: 0,
	pigmentStrength: 0,
	bristleCombs: 0,
	bristleInk: 0,
	pigmentOpacity: 0,
	spreadOfRadius: 0,
	strokeDir: [1, 0],
	dryContact: 0,
	edgeSoft: 0,
	edgeWander: 0,
	tideLo: 0,
	tideHi: 0,
	saturateInk: 0,
	migrate: 0,
	migrateOfRadius: 0,
	migrateLo: 0,
	migrateHi: 0
};
var MARKER_CHISEL_RIBBON = {
	...MARKER_BULLET_RIBBON,
	nibShape: "roundedBox",
	cornerFraction: MARKER_CHISEL_CORNER_FRACTION
};
var BRUSH_PEN_RIBBON = {
	stampsOnly: false,
	coverageInkMode: 6,
	stampFlow: null,
	nibShape: "ellipse",
	cornerFraction: 0,
	aaPx: BRUSH_PEN_EDGE_AA_PX,
	ink: false,
	inkEdgeFalloff: 1,
	compositeInkMode: 8,
	curvatureTolerancePx: MARKER_CURVATURE_TOLERANCE_PX,
	minHalfWidthPx: BRUSH_PEN_MIN_HALF_WIDTH_PX,
	paperRim: BRUSH_PEN_PAPER_WICK,
	wetEdge: 0,
	wetEdgeRadiusPx: 0,
	granulation: 0,
	spreadPx: 0,
	cloud: 0,
	normalizeDeposit: false,
	thinNibInkRefPx: 0,
	depositPerRadius: 0,
	stampInkShare: 0,
	waterDepletion: false,
	waterLevel: 0,
	pigmentLevel: 0,
	pigmentStrength: 0,
	bristleCombs: 0,
	bristleInk: 0,
	pigmentOpacity: 0,
	spreadOfRadius: 0,
	strokeDir: [1, 0],
	dryContact: 0,
	edgeSoft: 0,
	edgeWander: 0,
	tideLo: 0,
	tideHi: 0,
	saturateInk: 0,
	migrate: 0,
	migrateOfRadius: 0,
	migrateLo: 0,
	migrateHi: 0
};
/** Softer than the brush pen's 1.8, which is itself softer than the marker's
*  1.0. Water carries pigment a little way into the fibres before the paper
*  stops it, and a wash whose boundary resolves in under two pixels reads as a
*  vector shape filled with pale colour. This is the *inner* ramp only — the
*  visible tideline outside it is the wet-edge term below, which is a different
*  mechanism at a different scale.
*
*  Canvas px, never device px — see MARKER_EDGE_AA_PX for the full argument
*  and .claude/rules.md for why a per-DPR factor in shared canvas content is
*  the one thing that is not allowed here. */
var WATERCOLOR_EDGE_AA_PX = 3;
/** ADR 011 §3.2/§3.8 — inkLoad at which one pass reaches full density.
*
*  A wet wash reaches its tone almost at once and then stops: brushing back and
*  forth over paint that has not dried moves the same pigment around rather
*  than adding more. Depth comes from *glazing* — lifting the stylus, which
*  starts a new scratch and multiplies afresh over what the last pass left.
*
*  Meaningful only since v3. Until the deposit was normalized this curve was
*  fed a value that saturated an 8-bit buffer on the first dab, so it evaluated
*  to a flat 1 everywhere and the whole term was dead code — which is a good
*  part of why v1's washes were so mechanically even.
*
*  #468 v11 — raised from 0.95 to 1.35, and the whole of §11 depends on it.
*  The deposit buffer is eight-bit and tops out at 1.0, and an ordinary pass
*  runs about twice that, so a wash's inside sat *above* the old curve's end:
*  density evaluated to exactly 1 and could not go any higher. That is a
*  ceiling, and a ceiling makes a rim impossible — pigment arriving somewhere
*  already at 1 changes nothing, so no amount of transport could ever have
*  shown. At 1.35 the same clamped deposit lands at about 0.83 and there is
*  room above it for paint that migrated there to darken.
*
*  What it does *not* cost is the flat wash. The deposit still clamps, so the
*  inside of a wash is still a flat number and still insensitive to how the
*  deposit wobbles — the property v9 went to some trouble for. Measured: flat
*  wash unevenness unchanged to the second decimal, graded wash unchanged in
*  spread and step evenness, with WATERCOLOR_PRESET.opacity raised to keep the
*  tone where it was. */
var WATERCOLOR_SATURATE_INK = .2;
/** Below this half-width the nib is widened rather than dropped, same as the
*  brush pen. Higher than its 0.5 because this tool's own width floor is 0.32
*  of nominal: a wet brush has no hairline to protect, and a sub-pixel wash is
*  not a thing that happens. */
var WATERCOLOR_MIN_HALF_WIDTH_PX = .75;
/** Paper bites the rim as it does for the brush pen, and harder — a wash creeps
*  along fibres far more than ink does, so its boundary is the most irregular
*  of any tool here. Still rim-only by construction (the shader scales the term
*  by 1 - coverage), so no value of this can put holes inside a wash. */
var WATERCOLOR_PAPER_EDGE = 0;
/** ADR 011 §3.5 — the **cap** on how far the wash may leave the brush's own
*  footprint, in canvas px. The engine scales the actual reach with the
*  stroke's own radius and clamps it here (see _ribbonStrokeWork).
*
*  This is the correction that matters most in v2. Everything else in this
*  profile is texture; this is geometry. A marker's mark *is* the swept outline
*  of its tip, and while a wash's boundary coincides exactly with where the
*  brush travelled, no amount of mottling stops the eye reading
*  "semi-transparent marker" — perfectly parallel sides and a perfectly clean
*  turn give it away before any texture is even looked at.
*
*  Scales with brush size, unlike every other edge width in this engine, and
*  the reason is physical rather than convenient: aaPx and the marker's ramp
*  describe how a *tip* resolves against paper, which is a property of the tip.
*  This describes how far a load of water travels before the paper stops it,
*  and a big brush genuinely carries more water than a small one. A flat 7px
*  was the first attempt and it was invisible — against a 140px wash that is a
*  5% wobble, and the mark stayed exactly as clean as a marker's.
*
*  The shader spends this budget in *both* directions (see its
*  blur-and-rethreshold block): the mark pushes out in some places and pulls in
*  in others, which a plain dilation could not do. */
/** (#468 v6) A cone-profiled stamp lays exactly a third of what a flat one of
*  the same peak lays: the mean of (1 - r/R) over a disc is
*  integral of (1-p)*2p dp from 0 to 1 = 1/3. So switching the deposit to a
*  cone (see inkEdgeFalloff) drops the whole tool's density threefold unless
*  this puts it back. Written as its own constant rather than folded into the
*  deposit figures so that the calibration those carry stays readable, and so
*  that this is obviously a unit conversion rather than a taste decision. */
/** (#468 v10) How the ink dose splits between the nib stamps and the bands
*  between them. See RibbonProfile.stampInkShare — the short version is that
*  the stamps deposit a cone and ripple hardly at all, the bands deposit flat
*  and ripple at the dab spacing, so the smooth pass should carry most of it. */
var WATERCOLOR_STAMP_INK_SHARE = .82;
/** Converts the deposit from "per unit length of travel" to the scale the cone
*  profile actually accumulates at, so the numbers in watercolorPigmentEffects
*  stay readable.
*
*  #536 — 0.27, down from 1.8, and this is the number the whole tool was
*  standing on without anyone noticing.
*
*  It used to be set so that a single pass ran "roughly twice over the deposit
*  buffer's own ceiling", deliberately, because that is what made a stroke's
*  inside a flat film rather than a domed airbrush stripe. The buffer is
*  RGBA/UNSIGNED_BYTE (AccumulationBuffer), so its ceiling is a hard clamp at
*  1.0 — and running twice over it means **an ordinary pass saturates the
*  buffer flat**. Everything downstream then reads a constant.
*
*  That is the real reason a second pass changed nothing, a long line did not
*  thin, the hairs delivered evenly and the paint never ran out: all of those
*  are multipliers on the deposit, and the deposit was being clipped before any
*  of them could be seen. Replacing the composite's saturating curve with a
*  Beer-Lambert film (#536, earlier) was necessary and could not help on its
*  own, because the clipping happens upstream of the curve.
*
*  The flat cross-section it was protecting was being produced by the clipping,
*  not by the cone. A cone deposit at this spacing is close to a partition of
*  unity and sums nearly flat across the interior on its own; if a dome comes
*  back, that is the thing to fix — the deposit's shape — rather than clipping
*  the top off it again.
*
*  0.27 puts an ordinary pass near 0.3 of the buffer, so three or four glazes
*  build before anything saturates. WATERCOLOR_DENSITY_K in the shader is set
*  against this: move one and the other has to follow, or the tool changes
*  tone. */
var WATERCOLOR_CONE_DEPOSIT_GAIN = .205;
var WATERCOLOR_SPREAD_CAP_PX = 3;
/** (#536) How wide one hair bundle is on the paper, in px. A hair is a fixed
*  physical thing: a wider brush carries *more* bundles, not wider ones, and a
*  narrow nib carries few. Anything finer than a few pixels stops reading as
*  hair and starts reading as noise, which is what a fixed bundle count did to
*  every brush that was not large. */
var WATERCOLOR_BRISTLE_BUNDLE_PX = 3.5;
/** Floor, so even the thinnest line's boundary stops being mathematically
*  exact. Below roughly this the blur cannot displace anything at all. */
var WATERCOLOR_SPREAD_MIN_PX = 2.5;
/** Read by engine/index.ts's _ribbonStrokeWork, which is where the stroke's
*  own radius is known. Exported as a record rather than three constants so a
*  caller cannot pick up two of the three and silently ignore the cap. */
/** #468 v11 — how far pigment travels in one exchange, as a fraction of the
*  brush's own radius, and the px window that fraction is held inside.
*
*  The reach is what decides how wide the band of settled pigment comes out,
*  because a single exchange moves paint exactly this far and no further. Just
*  over half a radius puts the band inside the mark's own margin, where the
*  film genuinely is thinner, rather than out in the spread fringe where there
*  is no water to have carried anything.
*
*  Capped for the same reason the spread is: a very large brush would otherwise
*  redistribute over a distance nobody reads as a rim. Floored so a small one
*  still moves paint at all rather than exchanging with itself. */
var WATERCOLOR_MIGRATE_OF_RADIUS = .55;
var WATERCOLOR_MIGRATE_MAX_PX = 20;
var WATERCOLOR_MIGRATE_MIN_PX = 3;
/** The share of the pigment present that one exchange may move.
*
*  Held below 1 so the operation can never take more paint out of a place than
*  is there; the shader clamps as well, but a rate that needs the clamp is a
*  rate that has stopped conserving. 0.55 was picked by measurement against the
*  four exercises — see ADR 011 §11. */
var WATERCOLOR_MIGRATE_GAIN = .75;
/** Where "wet enough for paint to swim" begins and where it is complete. */
var WATERCOLOR_MIGRATE_LO = .34;
var WATERCOLOR_MIGRATE_HI = .85;
/** Exported for the engine, which resolves the reach against the gesture's own
*  first dab exactly as it does the spread's. */
var WATERCOLOR_MIGRATION = {
	maxPx: WATERCOLOR_MIGRATE_MAX_PX,
	minPx: WATERCOLOR_MIGRATE_MIN_PX
};
var WATERCOLOR_SPREAD = {
	cap: WATERCOLOR_SPREAD_CAP_PX,
	min: WATERCOLOR_SPREAD_MIN_PX
};
/** #468 v4 — the profile is now a function of the stroke's own water/pigment
*  mix rather than a constant, which is what turns this from a preset into a
*  brush model. Everything below that is *not* derived from the mix is a
*  property of the rasterizer or of paper, and stays fixed.
*
*  Built fresh per batch. That is a small object allocation on a path that
*  already builds a whole ribbon geometry buffer, and it buys the one thing a
*  shared constant cannot: two strokes with different mixes, live in the same
*  room at the same time, rendering correctly. */
function watercolorRibbon(presetName, paperWet = 0) {
	const mix = watercolorMixFromPreset(presetName);
	const w = watercolorWaterEffects(mix.water);
	const t = paperWet > mix.water ? watercolorWaterEffects(paperWet) : w;
	const transportWater = Math.max(mix.water, paperWet);
	const p = watercolorPigmentEffects(mix.pigment);
	const paint = watercolorPigmentByCode(watercolorPigmentFromPreset(presetName));
	return {
		stampsOnly: false,
		coverageInkMode: 6,
		stampFlow: null,
		nibShape: "ellipse",
		cornerFraction: 0,
		aaPx: WATERCOLOR_EDGE_AA_PX,
		ink: true,
		inkEdgeFalloff: 0,
		compositeInkMode: 9,
		curvatureTolerancePx: MARKER_CURVATURE_TOLERANCE_PX,
		minHalfWidthPx: WATERCOLOR_MIN_HALF_WIDTH_PX,
		paperRim: WATERCOLOR_PAPER_EDGE,
		wetEdgeRadiusPx: 0,
		spreadPx: WATERCOLOR_SPREAD_CAP_PX,
		saturateInk: WATERCOLOR_SATURATE_INK,
		normalizeDeposit: true,
		thinNibInkRefPx: 0,
		waterDepletion: true,
		waterLevel: mix.water,
		pigmentLevel: mix.pigment,
		pigmentStrength: p.strength,
		bristleCombs: 4,
		bristleInk: 0,
		spreadOfRadius: t.spreadOfRadius * (.6 + .8 * paint.diffusion) * (1 + 4 * transportWater),
		cloud: t.cloud,
		edgeSoft: t.edgeSoft,
		edgeWander: t.edgeWander,
		tideLo: t.tideLo,
		tideHi: t.tideHi,
		strokeDir: [1, 0],
		dryContact: w.dryContact,
		granulation: p.granulation * (.25 + 1.5 * paint.granulation),
		pigmentOpacity: paint.opacity,
		depositPerRadius: p.depositPerRadius * WATERCOLOR_CONE_DEPOSIT_GAIN,
		stampInkShare: WATERCOLOR_STAMP_INK_SHARE,
		wetEdge: 0,
		migrate: 0 * (transportWater <= WATERCOLOR_MIGRATE_LO ? 0 : WATERCOLOR_MIGRATE_GAIN * (1 - .7 * paint.staining) * (.6 + .8 * paint.diffusion)),
		migrateOfRadius: WATERCOLOR_MIGRATE_OF_RADIUS,
		migrateLo: WATERCOLOR_MIGRATE_LO,
		migrateHi: WATERCOLOR_MIGRATE_HI
	};
}
var DIGITAL_BRUSH_MIN_AA_PX = 1;
function digitalBrushRibbon(presetName) {
	const brush = digitalBrushFromPreset(presetName);
	const flowFromPressure = digitalBrushFlowFromPreset(presetName);
	return {
		...brush.model === "stamp" ? { brushStamp: {
			brush,
			pressure: digitalBrushPressureFromPreset(presetName)
		} } : {},
		stampFlow: (pressure) => digitalBrushFlow(brush, pressure, flowFromPressure),
		stampsOnly: true,
		coverageInkMode: 10,
		pigmentStrength: 0,
		bristleCombs: 0,
		bristleInk: 0,
		nibShape: "ellipse",
		cornerFraction: 0,
		aaPx: DIGITAL_BRUSH_MIN_AA_PX,
		ink: false,
		inkEdgeFalloff: 1,
		compositeInkMode: 8,
		curvatureTolerancePx: MARKER_CURVATURE_TOLERANCE_PX,
		minHalfWidthPx: .5,
		paperRim: brush.paperInteraction,
		wetEdge: 0,
		wetEdgeRadiusPx: 0,
		granulation: 0,
		spreadPx: 0,
		cloud: 0,
		normalizeDeposit: false,
		thinNibInkRefPx: 0,
		depositPerRadius: 0,
		stampInkShare: 0,
		waterDepletion: false,
		waterLevel: 0,
		pigmentLevel: 0,
		pigmentOpacity: 0,
		spreadOfRadius: 0,
		strokeDir: [1, 0],
		dryContact: 0,
		edgeSoft: 0,
		edgeWander: 0,
		tideLo: 0,
		tideHi: 0,
		saturateInk: 0,
		migrate: 0,
		migrateOfRadius: 0,
		migrateLo: 0,
		migrateHi: 0
	};
}
function ribbonProfileFor(tool, presetName, paperWet = 0) {
	if (tool === "digitalBrush") return digitalBrushRibbon(presetName);
	if (tool === "watercolor") return watercolorRibbon(presetName, paperWet);
	if (tool === "brushPen") return BRUSH_PEN_RIBBON;
	return markerNibFromPreset(presetName) === "chisel" ? MARKER_CHISEL_RIBBON : MARKER_BULLET_RIBBON;
}
//#endregion
//#region apps/web/src/engine/src/dabs/ribbonStrokeMath.ts
/** #547 — the band vertex array a stamps-only tool hands the two band passes,
*  which both no-op on a zero length. Shared and frozen in size rather than a
*  fresh `new Float32Array(0)` per batch: this is on the per-pointer-event path. */
var EMPTY_BANDS = /* @__PURE__ */ new Float32Array(0);
function rectOnTile(tile, r) {
	const w = Math.min(r.maxX, tile.originX + tile.buffer.width) - Math.max(r.minX, tile.originX);
	const h = Math.min(r.maxY, tile.originY + tile.buffer.height) - Math.max(r.minY, tile.originY);
	return w > 0 && h > 0 ? w * h : 0;
}
/** (§17.70) Tile pixels one piece of ribbon bands covers, counting overlap:
*  the triangles whose box meets the tile, by area. 0 means none of them can
*  put a fragment on it (a box ending at the tile's edge covers no pixel
*  centre of it). */
function ribbonBandPieceCost(piece, tile) {
	const x0 = tile.originX, y0 = tile.originY, x1 = x0 + tile.buffer.width, y1 = y0 + tile.buffer.height;
	const V = 11;
	let px = 0;
	for (let i = 0; i + 3 * V <= piece.length; i += 3 * V) {
		const ax = piece[i], ay = piece[i + 1], bx = piece[i + V], by = piece[i + V + 1], cx = piece[i + 2 * V], cy = piece[i + 2 * V + 1];
		if (Math.max(ax, bx, cx) <= x0 || Math.min(ax, bx, cx) >= x1 || Math.max(ay, by, cy) <= y0 || Math.min(ay, by, cy) >= y1) continue;
		px += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) * .5;
	}
	return px;
}
/** (§17.70) `bands` as consecutive whole-triangle pieces of `tris` triangles
*  (0: the whole array). Drawn in order they blend exactly as one draw does -
*  blending follows primitive order either way. */
function ribbonBandPieces(bands, tris) {
	const step = tris * 3 * 11;
	if (tris <= 0 || bands.length <= step) return [bands];
	const out = [];
	for (let i = 0; i < bands.length; i += step) out.push(bands.subarray(i, Math.min(bands.length, i + step)));
	return out;
}
/** (#536) Hair bundles across the mark, from the mark's own half-width, so a
*  hair stays a fixed few pixels wide whatever brush is held — see
*  WATERCOLOR_BRISTLE_BUNDLE_PX. The coordinate this scales runs -1..+1 across
*  the whole width, so the count of bundles laid across the mark is twice this.
*  One function for the ink pass (§17.13, where the hairs vary the delivery)
*  and the composite (where they break the contact dry), so both count the
*  same hair. */
function ribbonBristleCombs(profile, bristleRadiusPx) {
	return profile.bristleCombs > 0 ? Math.max(1.5, Math.min(50, bristleRadiusPx / WATERCOLOR_BRISTLE_BUNDLE_PX)) : 0;
}
/** Water and pigment are delivered independently. Equal brush water must
* leave equal standing water whether the brush also carries colour. The
* recorded load still controls depletion and the contact mask. */
function ribbonWaterDelivery(profile) {
	if (!profile.normalizeDeposit) return {
		water: 0,
		retain: 0
	};
	return {
		water: profile.waterLevel,
		retain: 1
	};
}
//#endregion
//#region apps/web/src/engine/src/dabs/RibbonStrokePainter.ts
/** Builds and deposits one ribbon batch; GPU draw primitives and frame scheduling
* are supplied by the engine without changing the order of rendering. */
var RibbonStrokePainter = class {
	ctx;
	/** Water is deposited before pigment on each segment, including replay. */
	diagnosticSegmentDelivery = "combined";
	diagnosticPigmentRecord = true;
	diagnosticSharedFluid = true;
	diagnosticLandingReservoir = true;
	diagnosticWaterPolicy = "bottomless";
	diagnosticForeignSolvent = true;
	diagnosticSolventField = true;
	/** Solver uniforms use the radius recoverable from the recorded dabs. */
	diagnosticCanonicalSettleRadius = true;
	diagnosticLandingPolicy = "fluid";
	diagnosticDepth = 0;
	waterOnlyDepth = 0;
	auxiliaryWater = /* @__PURE__ */ new Set();
	releaseWaterSources(contextLost = false) {
		for (const scratch of this.auxiliaryWater) if (contextLost) scratch.forget();
		else scratch.destroy();
		this.auxiliaryWater.clear();
	}
	diagnosticTrace = [];
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
	*importForeignWater(target, scratch, dabs, preset, wetProfile) {
		const contacts = dabs.flatMap((d, i) => wetAt(wetProfile, i) > 0 ? [{
			x: d.x,
			y: d.y,
			radius: d.size * .5 * preset.sizeMultiplier,
			aspect: Math.max(1, d.aspectRatio),
			angle: d.angle
		}] : []);
		const pool = this.ctx.scratchPool();
		for (const source of selectedForeignWaterSources(scratch.foreignSources ?? [], contacts)) {
			if (scratch.foreignImportedGestures.has(source.gesture) || !source.chunks?.length) continue;
			const unique = [...new Map(source.chunks.map((chunk) => [chunk.id, chunk])).values()];
			const first = unique[0], sourcePreset = this.ctx.resolveWaterPreset(first.preset);
			const sourceProfile = ribbonProfileFor("watercolor", first.preset, wetAt(first.wet, 0));
			const aux = new RibbonStrokeScratch(pool, false, false);
			this.auxiliaryWater.add(aux);
			try {
				for (const chunk of unique) {
					yield* this.paintWaterSource(target, chunk.dabs, sourcePreset, first.preset, sourceProfile, chunk.color, aux, void 0, chunk.wet, chunk.seed, false, 256);
					aux.releaseFilm();
					aux.newFilm();
				}
				for (const [tile, donor] of aux.tileEntries()) {
					const recipient = scratch.getOrCreate(tile), temp = pool.acquire(tile.width, tile.height);
					try {
						this.ctx.fieldOp(temp, recipient.coverage, donor.coverage, 20, 0);
						temp.copyTo(recipient.coverage);
						if (donor.solventLoad) {
							if (!recipient.foreignSolventLoad) {
								recipient.foreignSolventLoad = pool.acquire(tile.width, tile.height);
								recipient.foreignSolventLoad.clear();
							}
							this.ctx.fieldOp(temp, recipient.foreignSolventLoad, donor.solventLoad, 1, 1);
							temp.copyTo(recipient.foreignSolventLoad);
						}
					} finally {
						pool.release(temp);
					}
				}
				scratch.foreignImportedGestures.add(source.gesture);
			} finally {
				this.auxiliaryWater.delete(aux);
				aux.destroy();
			}
		}
	}
	/** Same original water source, without any pigment or target write. */
	*paintWaterSource(...args) {
		const depth = this.diagnosticDepth;
		this.diagnosticDepth = 0;
		this.waterOnlyDepth++;
		try {
			yield* this.paint(...args);
		} finally {
			this.waterOnlyDepth--;
			this.diagnosticDepth = depth;
		}
	}
	*paint(target, dabs, preset, presetName, profile, color, scratch, prevDab, wetProfile, strokeSeed, deferComposite = false, pieceTris = 0) {
		const segmentMode = profile.normalizeDeposit ? this.diagnosticSegmentDelivery : false;
		if (segmentMode && dabs.length > 1 && this.diagnosticDepth === 0) {
			scratch.standing.clear();
			this.diagnosticDepth++;
			try {
				for (let i = 0; i < dabs.length; i++) yield* this.paint(target, [dabs[i]], preset, presetName, profile, color, scratch, i === 0 ? prevDab : scratch.lastKept, wetProfile?.slice(i, i + 1), strokeSeed, deferComposite, pieceTris);
			} finally {
				this.diagnosticDepth--;
			}
			return;
		}
		if (segmentMode && this.diagnosticForeignSolvent && this.diagnosticSolventField && !this.waterOnlyDepth) yield* this.importForeignWater(target, scratch, dabs, preset, wetProfile);
		if (segmentMode && this.diagnosticSharedFluid) profile = {
			...profile,
			diagnosticReadFluid: true
		};
		const floorPx = profile.minHalfWidthPx;
		const wetIndex = /* @__PURE__ */ new Map();
		let drawable = floorPx === null ? dabs.filter((d, i) => {
			wetIndex.set(d, i);
			return d.size * .5 * preset.sizeMultiplier >= .5;
		}) : dabs.map((d, i) => {
			const out = d.size * .5 * preset.sizeMultiplier >= floorPx ? d : {
				...d,
				size: floorPx * 2 / preset.sizeMultiplier
			};
			wetIndex.set(out, i);
			return out;
		});
		const wetOf = (d) => wetAt(wetProfile, wetIndex.get(d) ?? -1);
		const film = profile.normalizeDeposit && !!this.ctx.minmaxExt() && !!scratch;
		if (profile.normalizeDeposit && scratch) {
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
		if (profile.brushStamp) {
			this.ctx.paintBrushStroke(target, drawable, preset, profile.brushStamp, color, scratch, prevDab);
			return;
		}
		const { nibShape, cornerFraction } = profile;
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		const haloBound = (d) => profile.normalizeDeposit ? watercolorHalo(wetOf(d), 1).scale : 1;
		const haloPast = (d) => profile.normalizeDeposit && wetOf(d) > 0 ? 3 * WATERCOLOR_SPREAD.cap : 0;
		let rMinX = Infinity, rMinY = Infinity, rMaxX = -Infinity, rMaxY = -Infinity;
		const sheet = profile.normalizeDeposit && !this.ctx.infinite() ? this.ctx.pageSize() : null;
		for (const d of prevDab ? [prevDab, ...drawable] : drawable) {
			const { hx, hy } = this.ctx.dabWorldHalfExtents(d, false, preset);
			const g = haloBound(d), past = haloPast(d);
			if (sheet && (d.x + hx * g + past <= 0 || d.y + hy * g + past <= 0 || d.x - hx * g - past >= sheet.w || d.y - hy * g - past >= sheet.h)) continue;
			rMinX = Math.min(rMinX, d.x - hx * g - past);
			rMaxX = Math.max(rMaxX, d.x + hx * g + past);
			rMinY = Math.min(rMinY, d.y - hy * g - past);
			rMaxY = Math.max(rMaxY, d.y + hy * g + past);
			const pg = 1, pp = 0;
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
		const reachRect = {
			minX: rMinX,
			minY: rMinY,
			maxX: rMaxX,
			maxY: rMaxY
		};
		const targets = this.ctx.resolveWithinSheet(target, profile.normalizeDeposit ? this.ctx.wcSheetClamp(reachRect) : reachRect);
		const firstGap = drawable.length >= 2 ? Math.hypot(drawable[1].x - drawable[0].x, drawable[1].y - drawable[0].y) : prevDab ? Math.hypot(drawable[0].x - prevDab.x, drawable[0].y - prevDab.y) : 0;
		const dabSpacing = scratch.noteDabSpacing(firstGap);
		const dirFrom = drawable.length >= 2 ? drawable[0] : prevDab;
		const dirTo = drawable.length >= 2 ? drawable[1] : drawable[0];
		const strokeDir = scratch.noteDirection(dirFrom ? dirTo.x - dirFrom.x : 0, dirFrom ? dirTo.y - dirFrom.y : 0);
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
			const first = drawable[0];
			const firstMinor = first.size * .5 * preset.sizeMultiplier;
			const firstRadius = Math.max(watercolorSpreadRadius(firstMinor * Math.max(first.aspectRatio, 1), firstMinor), .5);
			return {
				spreadPx: profile.spreadPx > 0 && profile.spreadOfRadius > 0 ? Math.min(profile.spreadPx, Math.max(WATERCOLOR_SPREAD.min, firstRadius * profile.spreadOfRadius)) : 0,
				inkSmoothPx: 0,
				migratePx: profile.migrate > 0 && profile.migrateOfRadius > 0 ? Math.min(WATERCOLOR_MIGRATION.maxPx, Math.max(WATERCOLOR_MIGRATION.minPx, firstRadius * profile.migrateOfRadius)) : 0,
				water: profile.waterLevel,
				fieldSeed: [drawable[0].x, drawable[0].y],
				bristleRadiusPx: watercolorFerrulePx(firstMinor, first.aspectRatio, first.pressure, presetName)
			};
		});
		let maxRadius = 0;
		let nibRadius = 0;
		for (const d of drawable) {
			const minor = d.size * .5 * preset.sizeMultiplier;
			maxRadius = Math.max(maxRadius, minor * Math.max(d.aspectRatio, 1) * haloBound(d) + haloPast(d));
			nibRadius = Math.max(nibRadius, this.diagnosticCanonicalSettleRadius ? canonicalMajorRadius(d.size, d.aspectRatio, preset.sizeMultiplier) : minor * Math.max(d.aspectRatio, 1));
		}
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
		const deposits = [];
		const waterByDab = /* @__PURE__ */ new Map();
		const pigmentByDab = /* @__PURE__ */ new Map();
		const delivery = ribbonWaterDelivery(profile);
		if (!segmentMode || this.diagnosticDepth === 0) scratch.standing.clear();
		const acrossByDab = /* @__PURE__ */ new Map();
		const movingByDab = /* @__PURE__ */ new Set();
		const paperWetByDab = /* @__PURE__ */ new Map();
		const inkStrength = profile.normalizeDeposit ? profile.pigmentStrength : 1;
		const mottleSeed = strokeSeed ?? [0, 0];
		const pigmentPoolByDab = /* @__PURE__ */ new Map();
		const excessByDab = /* @__PURE__ */ new Map();
		const puddleByDab = /* @__PURE__ */ new Map();
		const thinNibGain = (dab, fromX, fromY) => profile.thinNibInkRefPx > 0 ? markerThinNibInkGain(nibGeometry(dab, preset.sizeMultiplier, nibShape, cornerFraction), dab.x - fromX, dab.y - fromY, profile.thinNibInkRefPx) : 1;
		{
			let prev = prevDab;
			let used = scratch.waterUsed;
			let pigUsed = scratch.pigmentUsed;
			for (const dab of drawable) {
				const wetHere = wetOf(dab);
				paperWetByDab.set(dab, wetHere);
				const minor = dab.size * .5 * preset.sizeMultiplier;
				if (!scratch.landing) scratch.landing = {
					x: dab.x,
					y: dab.y,
					r: minor * Math.max(dab.aspectRatio, 1),
					t: dab.t
				};
				else if (!scratch.dwellDone) {
					const L = scratch.landing;
					if (Math.hypot(dab.x - L.x, dab.y - L.y) <= .3 * L.r) scratch.dwellMs = Math.max(scratch.dwellMs, dab.t - L.t);
					else scratch.dwellDone = true;
				}
				const dx = prev ? dab.x - prev.x : 0;
				const dy = prev ? dab.y - prev.y : 0;
				const travelAngle = Math.hypot(dx, dy) > .01 ? Math.atan2(dy, dx) : null;
				const radius = Math.max(watercolorTravelRadius(minor * Math.max(dab.aspectRatio, 1), minor, dab.angle, travelAngle), .5);
				if (Math.hypot(dx, dy) > .2 * minor) movingByDab.add(dab);
				if (travelAngle !== null) {
					const la = travelAngle + Math.PI / 2 - dab.angle;
					acrossByDab.set(dab, [Math.cos(la), Math.sin(la)]);
				}
				const seg = this.ctx.markerSegmentLength(dab, prev, radius);
				const source = advanceSolventSource({
					waterUsed: used,
					pigmentUsed: pigUsed
				}, profile, seg, radius, wetHere, !!segmentMode, this.diagnosticWaterPolicy);
				used = source.waterUsed;
				pigUsed = source.pigmentUsed;
				const { load, water } = source;
				const availableHere = segmentMode && this.diagnosticSharedFluid ? Math.max(wetHere, watercolorStandingWater(delivery.water, delivery.retain, wetHere, load)) : wetHere;
				if (segmentMode) paperWetByDab.set(dab, availableHere);
				const pigmentLeft = profile.waterDepletion ? watercolorPigmentLoad(pigUsed, profile.waterLevel) * watercolorPigmentRate(profile.waterLevel) * watercolorWetPull(availableHere) : 1;
				const tau = Math.max(0, watercolorTrailDwell(scratch.trail, dab.x, dab.y, dab.t, WC_DWELL_RADIUS * minor * Math.max(dab.aspectRatio, 1)) - 60);
				const gateHere = 1 - Math.min(Math.max(wetHere, 0), 1);
				const pigmentGate = .45 + .55 * (1 - Math.min(Math.max(availableHere, 0), 1));
				const last = scratch.trail.length ? scratch.trail[scratch.trail.length - 1] : null;
				let slow = 0;
				let speedElapsed = 0;
				if (scratch.speedAt < 0) scratch.speedAt = dab.t;
				if (last) {
					scratch.speedTravel += Math.hypot(dab.x - last.x, dab.y - last.y);
					const dt = dab.t - scratch.speedAt;
					if (dt > 0) {
						const v = scratch.speedTravel / dt;
						const a = 1 - Math.exp(-dt / 20);
						scratch.speed += (v - scratch.speed) * a;
						scratch.speedPeak = Math.max(scratch.speed, scratch.speedPeak * Math.exp(-dt / 800));
						scratch.speedAt = dab.t;
						scratch.speedTravel = 0;
						speedElapsed = dt;
					}
					slow = watercolorSlowdown(scratch.speed, scratch.speedPeak);
				}
				const spent = pigUsed - scratch.surplusAt;
				scratch.surplusPigment = watercolorSurplus(scratch.surplusPigment, spent, watercolorDwellPigment(tau) * pigmentGate, WATERCOLOR_START_EXCESS_RADII);
				scratch.surplusWater = watercolorSurplus(scratch.surplusWater, spent, watercolorDwellWater(tau) * gateHere, 3);
				scratch.brakePigment = watercolorBrakeSurplus(scratch.brakePigment, spent, WC_SLOW_GAIN * slow * pigmentGate, speedElapsed);
				scratch.turnOffset[0] += dx;
				scratch.turnOffset[1] += dy;
				if (Math.hypot(...scratch.turnOffset) >= Math.max(1.5, minor * .12)) {
					const direction = scratch.turnOffset;
					const priorTurnDirection = scratch.turnDirection;
					if (priorTurnDirection && Math.hypot(priorTurnDirection[0], priorTurnDirection[1]) > .01) {
						const turnAngle = Math.abs(Math.atan2(priorTurnDirection[0] * direction[1] - priorTurnDirection[1] * direction[0], priorTurnDirection[0] * direction[0] + priorTurnDirection[1] * direction[1]));
						const normalizedChord = Math.hypot(direction[0], direction[1]) / Math.max(minor, .5);
						const angularPigmentImpulse = Math.max(turnAngle - 1 * normalizedChord, 0) / Math.PI;
						scratch.brakePigment = Math.min(.6, scratch.brakePigment + .3 * angularPigmentImpulse * pigmentGate);
					}
					scratch.turnDirection = [...direction];
					scratch.turnOffset = [0, 0];
				}
				scratch.surplusAt = pigUsed;
				scratch.trail.push({
					x: dab.x,
					y: dab.y,
					t: dab.t
				});
				if (scratch.trail.length > 64) scratch.trail.shift();
				const landingWet = segmentMode && this.diagnosticLandingReservoir ? this.diagnosticLandingPolicy === "fluid" ? Math.max(landedWet, watercolorStandingWater(delivery.water, delivery.retain, landedWet, 1)) : 0 : landedWet;
				const excess = profile.waterDepletion ? watercolorExcessFromSurplus(pigUsed, landingWet, Math.max(scratch.surplusPigment, scratch.brakePigment)) : 1;
				excessByDab.set(dab, excess);
				const landingPool = (1 - Math.min(Math.max(landedWet, 0), 1)) * Math.exp(-pigUsed / WATERCOLOR_START_EXCESS_RADII);
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
					water: profile.waterLevel,
					...this.diagnosticCanonicalSettleRadius ? { settleRadius: canonicalMinorRadius(dab.size, preset.sizeMultiplier) } : {}
				});
				waterByDab.set(dab, water);
				pigmentByDab.set(dab, pigmentLeft);
				if (profile.normalizeDeposit) scratch.standing.set(dab, watercolorStandingWater(delivery.water, delivery.retain, wetHere, load));
				const stampShare = profile.stampInkShare > 0 ? profile.stampInkShare * 2 : 1;
				deposits.push(profile.normalizeDeposit ? film ? profile.depositPerRadius * .5 * WC_FILM_DOSE * pigmentLeft * excess : profile.depositPerRadius * .5 * (seg / radius) * .5 * stampShare * pigmentLeft * excess : dab.opacity * seg * .5 * thinNibGain(dab, prev?.x ?? dab.x, prev?.y ?? dab.y));
				prev = dab;
			}
			scratch.advanceWater(used, pigUsed);
		}
		if (!targets.length) return;
		const haloDabs = [];
		const haloDoseByDab = /* @__PURE__ */ new Map();
		/** What each ORIGINAL dab gave up to its halo, so the core is laid lighter
		*  by exactly that share — conservation, and the "dissolves in water" feel. */
		const haloShedByDab = /* @__PURE__ */ new Map();
		let anyHalo = false;
		const haloProfile = {
			...profile,
			inkEdgeFalloff: 1
		};
		if (profile.normalizeDeposit) for (const dab of drawable) {
			const { scale, shed, wet } = watercolorHalo(paperWetByDab.get(dab) ?? 0, waterByDab.get(dab) ?? 0);
			const grown = {
				...dab,
				size: dab.size * scale + 6 * spreadPx * wet
			};
			haloDabs.push(grown);
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
		const inkFor = profile.thinNibInkRefPx > 0 && !profile.normalizeDeposit ? (d0, d1, travel) => ({
			ink: d1.opacity * travel * .5 * thinNibGain(d1, d0.x, d0.y),
			water: 0,
			paperWet: 0,
			strength: 0,
			puddle: 1
		}) : profile.normalizeDeposit ? (d0, d1, travel) => {
			const minor = d1.size * .5 * preset.sizeMultiplier;
			const bdx = d1.x - d0.x;
			const bdy = d1.y - d0.y;
			const bandAngle = Math.hypot(bdx, bdy) > .01 ? Math.atan2(bdy, bdx) : null;
			const radius = Math.max(watercolorTravelRadius(minor * Math.max(d1.aspectRatio, 1), minor, d1.angle, bandAngle), .5);
			return {
				ink: (film ? profile.depositPerRadius * .5 * WC_FILM_DOSE * 2 : profile.depositPerRadius * .5 * (travel / radius) * .5 * ((1 - profile.stampInkShare) * 2)) * (pigmentByDab.get(d1) ?? 1) * (excessByDab.get(d1) ?? 1) * (1 - (haloShedByDab.get(d1) ?? 0)),
				water: waterByDab.get(d1) ?? 0,
				paperWet: paperWetByDab.get(d1) ?? 0,
				strength: Math.hypot(bdx, bdy) > .2 * minor ? inkStrength : -inkStrength,
				puddle: puddleByDab.get(d1) ?? 1,
				pigmentPool: pigmentPoolByDab.get(d1) ?? .5
			};
		} : void 0;
		const bands = profile.stampsOnly ? EMPTY_BANDS : buildRibbonBands(drawable, preset.sizeMultiplier, prevDab, nibShape, cornerFraction, profile.aaPx, inkFor, film);
		const waterBands = segmentMode && inkFor && !profile.stampsOnly ? buildRibbonBands(drawable, preset.sizeMultiplier, prevDab, nibShape, cornerFraction, profile.aaPx, (d0, d1, travel) => ({
			...inkFor(d0, d1, travel),
			paperWet: wetOf(d1)
		}), film) : bands;
		const solventBands = segmentMode && this.diagnosticSolventField && !profile.stampsOnly ? buildRibbonBands(drawable, preset.sizeMultiplier, prevDab, nibShape, cornerFraction, profile.aaPx, (_d0, d1) => ({
			ink: (waterByDab.get(d1) ?? 0) / 4,
			water: 1,
			paperWet: 0,
			strength: 0,
			puddle: 0,
			pigmentPool: 0
		}), film) : EMPTY_BANDS;
		const combs = ribbonBristleCombs(profile, bristleRadiusPx);
		const tau = pigmentAbsorption(color);
		scratch.paints.add(color.join(","));
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
			const waterPhase = function* () {
				for (let i = 0; i < drawable.length; i++) {
					const dab = drawable[i];
					if (!this.ctx.nibTouchesTile(tile, dab, preset)) continue;
					this.ctx.drawRibbonNibPass(coverage, tile, dab, preset, profile, profile.coverageInkMode, stampFlows ? stampFlows[i] : 0, true, waterByDab.get(dab) ?? 0, acrossByDab.get(dab) ?? [0, 1], wetOf(dab), 1, [0, 0], null, combs, 0, null, puddleByDab.get(dab) ?? 1, profile.waterDepletion && movingByDab.has(dab) ? 1 : 0);
					yield pieceTris ? this.ctx.nibDrawCost(tile, dab, preset) : 0;
				}
				if (!profile.stampsOnly && waterBands.length) for (const piece of ribbonBandPieces(waterBands, pieceTris)) {
					const px = pieceTris ? ribbonBandPieceCost(piece, tile) : 0;
					if (pieceTris && !px) continue;
					this.ctx.drawRibbonBands(coverage, tile, piece, "coverage", profile.aaPx, 0, 0, [0, 0], ribbonWaterDelivery(profile).water, ribbonWaterDelivery(profile).retain, combs, 0, null, profile.waterDepletion ? 1 : 0);
					yield px;
				}
				if (segmentMode && this.diagnosticSolventField) {
					const solvent = scratch.solventFilm(tile.buffer);
					const solventProfile = {
						...profile,
						diagnosticReadFluid: false,
						inkEdgeFalloff: 1,
						cloud: 0,
						granulation: 0,
						bristleInk: 0
					};
					for (const dab of drawable) {
						if (!this.ctx.nibTouchesTile(tile, dab, preset)) continue;
						if (film) solvent.film.beginMaxDraw(this.ctx.minmaxExt());
						else solvent.film.beginAdditiveDraw();
						this.ctx.drawRibbonNibPass(solvent.film, tile, dab, preset, solventProfile, 7, (waterByDab.get(dab) ?? 0) / 4, false, 1, acrossByDab.get(dab) ?? [0, 1], 0, 0, mottleSeed, coverage, combs, 0, null, 0, 0);
						solvent.film.endDraw();
						yield pieceTris ? this.ctx.nibDrawCost(tile, dab, preset) : 0;
					}
					for (const piece of ribbonBandPieces(solventBands, pieceTris)) {
						this.ctx.drawRibbonBands(solvent.film, tile, piece, film ? "ink-max" : "ink", profile.aaPx, 0, 0, mottleSeed, 0, 0, combs, 0, null, 0);
						yield pieceTris ? ribbonBandPieceCost(piece, tile) : 0;
					}
					const solventRect = this.ctx.revealRect(tile, compositeBounds);
					if (solventRect) this.ctx.fieldOp(solvent.load, solvent.base, solvent.film, 1, 1, { scissor: solventRect });
				}
			}.bind(this);
			const fb = film && inkLoad ? scratch.filmBuffers(tile.buffer) : null;
			const inkDest = fb ? fb.strokeInk : inkLoad;
			const colorDest = fb ? fb.strokeColor : inkColor;
			const beginInk = (buf) => {
				if (fb) buf.beginMaxDraw(this.ctx.minmaxExt());
				else buf.beginAdditiveDraw();
			};
			const bandMode = fb ? "ink-max" : "ink";
			const poolBlot = profile.waterDepletion ? 1 : 0;
			const pigmentPhase = function* () {
				if (this.waterOnlyDepth) return;
				if (inkDest && (!segmentMode || !this.diagnosticPigmentRecord || inkStrength > 0)) {
					for (let i = 0; i < drawable.length; i++) {
						if (!this.ctx.nibTouchesTile(tile, drawable[i], preset)) continue;
						beginInk(inkDest);
						this.ctx.drawRibbonNibPass(inkDest, tile, drawable[i], preset, profile, 7, deposits[i] * (1 - (haloShedByDab.get(drawable[i]) ?? 0)), false, waterByDab.get(drawable[i]) ?? 0, acrossByDab.get(drawable[i]) ?? [0, 1], paperWetByDab.get(drawable[i]) ?? 0, inkStrength, mottleSeed, segmentMode && this.diagnosticSharedFluid ? coverage : null, combs, profile.bristleInk, null, pigmentPoolByDab.get(drawable[i]) ?? .5, poolBlot);
						inkDest.endDraw();
						yield pieceTris ? this.ctx.nibDrawCost(tile, drawable[i], preset) : 0;
					}
					if (bands.length) for (const piece of ribbonBandPieces(bands, pieceTris)) {
						const px = pieceTris ? ribbonBandPieceCost(piece, tile) : 0;
						if (pieceTris && !px) continue;
						this.ctx.drawRibbonBands(inkDest, tile, piece, bandMode, profile.aaPx, profile.cloud, profile.granulation, mottleSeed, 0, 0, combs, profile.bristleInk, null, poolBlot, segmentMode && this.diagnosticSharedFluid ? coverage : null);
						yield px;
					}
					if (colorDest) {
						for (let i = 0; i < drawable.length; i++) {
							if (!this.ctx.nibTouchesTile(tile, drawable[i], preset)) continue;
							beginInk(colorDest);
							this.ctx.drawRibbonNibPass(colorDest, tile, drawable[i], preset, profile, 7, deposits[i] * (1 - (haloShedByDab.get(drawable[i]) ?? 0)), false, waterByDab.get(drawable[i]) ?? 0, acrossByDab.get(drawable[i]) ?? [0, 1], paperWetByDab.get(drawable[i]) ?? 0, inkStrength, mottleSeed, segmentMode && this.diagnosticSharedFluid ? coverage : null, combs, profile.bristleInk, tau, pigmentPoolByDab.get(drawable[i]) ?? 0, poolBlot);
							colorDest.endDraw();
							yield pieceTris ? this.ctx.nibDrawCost(tile, drawable[i], preset) : 0;
						}
						if (bands.length) for (const piece of ribbonBandPieces(bands, pieceTris)) {
							const px = pieceTris ? ribbonBandPieceCost(piece, tile) : 0;
							if (pieceTris && !px) continue;
							this.ctx.drawRibbonBands(colorDest, tile, piece, bandMode, profile.aaPx, profile.cloud, profile.granulation, mottleSeed, 0, 0, combs, profile.bristleInk, tau, poolBlot, segmentMode && this.diagnosticSharedFluid ? coverage : null);
							yield px;
						}
					}
				}
			}.bind(this);
			if (segmentMode === "explicit") {
				yield* waterPhase();
				yield* pigmentPhase();
			} else {
				const contribution = {
					water: waterPhase,
					pigment: pigmentPhase
				};
				yield* contribution.water();
				yield* contribution.pigment();
			}
			if (this.waterOnlyDepth) continue;
			if (inkLoad && profile.normalizeDeposit) scratch.diffusePending = true;
			if (anyHalo && inkDest) for (let i = 0; i < haloDabs.length; i++) {
				const dose = haloDoseByDab.get(haloDabs[i]) ?? 0;
				if (dose <= 0 || !this.ctx.nibTouchesTile(tile, haloDabs[i], preset)) continue;
				beginInk(inkDest);
				this.ctx.drawRibbonNibPass(inkDest, tile, haloDabs[i], preset, haloProfile, 7, deposits[i] * dose, false, waterByDab.get(haloDabs[i]) ?? 0, acrossByDab.get(haloDabs[i]) ?? [0, 1], paperWetByDab.get(haloDabs[i]) ?? 0, inkStrength, mottleSeed, coverage, combs, profile.bristleInk);
				inkDest.endDraw();
				yield pieceTris ? this.ctx.nibDrawCost(tile, haloDabs[i], preset) : 0;
			}
			if (fb && inkLoad) {
				const rect = this.ctx.revealRect(tile, compositeBounds);
				if (rect) {
					this.ctx.fieldOp(inkLoad, fb.inkBase, fb.strokeInk, 1, 1, { scissor: rect });
					if (inkColor && fb.strokeColor && fb.colorBase) this.ctx.fieldOp(inkColor, fb.colorBase, fb.strokeColor, 1, 1, { scissor: rect });
				}
			}
			if (deferComposite) {
				const pending = scratch.pendingComposite.get(tile.buffer);
				if (pending) {
					pending.bounds.minX = Math.min(pending.bounds.minX, compositeBounds.minX);
					pending.bounds.minY = Math.min(pending.bounds.minY, compositeBounds.minY);
					pending.bounds.maxX = Math.max(pending.bounds.maxX, compositeBounds.maxX);
					pending.bounds.maxY = Math.max(pending.bounds.maxY, compositeBounds.maxY);
				} else scratch.pendingComposite.set(tile.buffer, {
					tile,
					bounds: { ...compositeBounds }
				});
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
		if (this.waterOnlyDepth) return;
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
};
//#endregion
export { RibbonStrokePainter };
