(() => {
  // apps/web/src/engine/src/watercolor/canonicalRadius.ts
  function canonicalMinorRadius(size, multiplier) {
    return Math.fround(size) * 0.5 * multiplier;
  }

  // ../680-water-wet-tone/node_modules/lodash-es/_freeGlobal.js
  var freeGlobal = typeof global == "object" && global && global.Object === Object && global;
  var freeGlobal_default = freeGlobal;

  // ../680-water-wet-tone/node_modules/lodash-es/_root.js
  var freeSelf = typeof self == "object" && self && self.Object === Object && self;
  var root = freeGlobal_default || freeSelf || Function("return this")();
  var root_default = root;

  // ../680-water-wet-tone/node_modules/lodash-es/_Symbol.js
  var Symbol = root_default.Symbol;
  var Symbol_default = Symbol;

  // ../680-water-wet-tone/node_modules/lodash-es/_getRawTag.js
  var objectProto = Object.prototype;
  var hasOwnProperty = objectProto.hasOwnProperty;
  var nativeObjectToString = objectProto.toString;
  var symToStringTag = Symbol_default ? Symbol_default.toStringTag : void 0;
  function getRawTag(value) {
    var isOwn = hasOwnProperty.call(value, symToStringTag), tag = value[symToStringTag];
    try {
      value[symToStringTag] = void 0;
      var unmasked = true;
    } catch (e) {
    }
    var result = nativeObjectToString.call(value);
    if (unmasked) {
      if (isOwn) {
        value[symToStringTag] = tag;
      } else {
        delete value[symToStringTag];
      }
    }
    return result;
  }
  var getRawTag_default = getRawTag;

  // ../680-water-wet-tone/node_modules/lodash-es/_objectToString.js
  var objectProto2 = Object.prototype;
  var nativeObjectToString2 = objectProto2.toString;
  function objectToString(value) {
    return nativeObjectToString2.call(value);
  }
  var objectToString_default = objectToString;

  // ../680-water-wet-tone/node_modules/lodash-es/_baseGetTag.js
  var nullTag = "[object Null]";
  var undefinedTag = "[object Undefined]";
  var symToStringTag2 = Symbol_default ? Symbol_default.toStringTag : void 0;
  function baseGetTag(value) {
    if (value == null) {
      return value === void 0 ? undefinedTag : nullTag;
    }
    return symToStringTag2 && symToStringTag2 in Object(value) ? getRawTag_default(value) : objectToString_default(value);
  }
  var baseGetTag_default = baseGetTag;

  // ../680-water-wet-tone/node_modules/lodash-es/isObjectLike.js
  function isObjectLike(value) {
    return value != null && typeof value == "object";
  }
  var isObjectLike_default = isObjectLike;

  // ../680-water-wet-tone/node_modules/lodash-es/isSymbol.js
  var symbolTag = "[object Symbol]";
  function isSymbol(value) {
    return typeof value == "symbol" || isObjectLike_default(value) && baseGetTag_default(value) == symbolTag;
  }
  var isSymbol_default = isSymbol;

  // ../680-water-wet-tone/node_modules/lodash-es/_trimmedEndIndex.js
  var reWhitespace = /\s/;
  function trimmedEndIndex(string) {
    var index = string.length;
    while (index-- && reWhitespace.test(string.charAt(index))) {
    }
    return index;
  }
  var trimmedEndIndex_default = trimmedEndIndex;

  // ../680-water-wet-tone/node_modules/lodash-es/_baseTrim.js
  var reTrimStart = /^\s+/;
  function baseTrim(string) {
    return string ? string.slice(0, trimmedEndIndex_default(string) + 1).replace(reTrimStart, "") : string;
  }
  var baseTrim_default = baseTrim;

  // ../680-water-wet-tone/node_modules/lodash-es/isObject.js
  function isObject(value) {
    var type = typeof value;
    return value != null && (type == "object" || type == "function");
  }
  var isObject_default = isObject;

  // ../680-water-wet-tone/node_modules/lodash-es/toNumber.js
  var NAN = 0 / 0;
  var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
  var reIsBinary = /^0b[01]+$/i;
  var reIsOctal = /^0o[0-7]+$/i;
  var freeParseInt = parseInt;
  function toNumber(value) {
    if (typeof value == "number") {
      return value;
    }
    if (isSymbol_default(value)) {
      return NAN;
    }
    if (isObject_default(value)) {
      var other = typeof value.valueOf == "function" ? value.valueOf() : value;
      value = isObject_default(other) ? other + "" : other;
    }
    if (typeof value != "string") {
      return value === 0 ? value : +value;
    }
    value = baseTrim_default(value);
    var isBinary = reIsBinary.test(value);
    return isBinary || reIsOctal.test(value) ? freeParseInt(value.slice(2), isBinary ? 2 : 8) : reIsBadHex.test(value) ? NAN : +value;
  }
  var toNumber_default = toNumber;

  // ../680-water-wet-tone/node_modules/lodash-es/_baseClamp.js
  function baseClamp(number, lower, upper) {
    if (number === number) {
      if (upper !== void 0) {
        number = number <= upper ? number : upper;
      }
      if (lower !== void 0) {
        number = number >= lower ? number : lower;
      }
    }
    return number;
  }
  var baseClamp_default = baseClamp;

  // ../680-water-wet-tone/node_modules/lodash-es/clamp.js
  function clamp(number, lower, upper) {
    if (upper === void 0) {
      upper = lower;
      lower = void 0;
    }
    if (upper !== void 0) {
      upper = toNumber_default(upper);
      upper = upper === upper ? upper : 0;
    }
    if (lower !== void 0) {
      lower = toNumber_default(lower);
      lower = lower === lower ? lower : 0;
    }
    return baseClamp_default(toNumber_default(number), lower, upper);
  }
  var clamp_default = clamp;

  // apps/web/src/engine/src/presets/digitalBrushPresets.ts
  function roundTip(hardness) {
    return { kind: "round", hardness, aspect: 1, rotation: "path", angle: 0 };
  }
  function bitmapTip(mask, rotation, hardness = 0.7) {
    return { kind: "bitmap", mask, hardness, aspect: 1, rotation, angle: 0 };
  }
  var SIZE_FULL = [[0, 0.08], [0.5, 0.55], [1, 1]];
  var SIZE_KNEE = [[0, 0.25], [0.35, 0.42], [0.75, 0.62], [1, 1]];
  var SIZE_HALF = [[0, 0.4], [1, 1]];
  var SIZE_NOZZLE = [[0, 0.75], [1, 1]];
  var FLOW_EARLY = [[0, 0.12], [0.5, 0.6], [1, 1]];
  var FLOW_LINEAR = [[0, 0.12], [1, 1]];
  var FLOW_FLAT = [[0, 0.9], [0.25, 1], [1, 1]];
  var FLOW_COVERING = [[0, 0.3], [0.5, 0.75], [1, 1]];
  var OPACITY_LINEAR = [[0, 0.06], [1, 1]];
  var OPACITY_EARLY = [[0, 0.12], [0.5, 0.65], [1, 1]];
  var OPACITY_WET = [[0, 0.3], [0.5, 0.85], [1, 1]];
  var OPACITY_INK = [[0, 0.3], [0.5, 0.8], [1, 1]];
  var V1_BRUSHES = [
    {
      id: "soft-round",
      version: 1,
      model: "ribbon",
      category: "soft",
      tip: roundTip(0.12),
      paperInteraction: 0,
      spacing: 0.06,
      flow: 0.45,
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
      tip: roundTip(0.45),
      paperInteraction: 0,
      spacing: 0.08,
      flow: 0.85,
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
      tip: roundTip(0.82),
      paperInteraction: 0,
      spacing: 0.1,
      flow: 0.95,
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
      tip: roundTip(0.94),
      paperInteraction: 0,
      spacing: 0.09,
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
      tip: roundTip(0.62),
      paperInteraction: 0,
      spacing: 0.08,
      flow: 0.95,
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
      tip: { kind: "round", hardness: 0.7, aspect: 4, rotation: "fixed", angle: Math.PI / 4 },
      paperInteraction: 0,
      spacing: 0.05,
      flow: 0.9,
      flowPer: "pass",
      sizeByPressure: SIZE_FULL,
      flowByPressure: FLOW_COVERING,
      opacityByPressure: [[0, 1], [1, 1]],
      pressureSmoothingPx: 10,
      opacity: 1
    }
  ];
  var DIGITAL_BRUSHES = [
    // ── Line ──
    {
      id: "ink-round",
      version: 2,
      model: "stamp",
      category: "line",
      // Not 1.0: a stamp with no ramp at all is a jagged disc, and the shader's
      // floor would quietly override it anyway (see the aaNorm clamp in the stamp
      // shader). Naming the value here keeps the two from disagreeing silently.
      tip: roundTip(0.94),
      paperInteraction: 0,
      spacing: 0.09,
      flow: 1,
      flowPer: "pass",
      sizeByPressure: SIZE_KNEE,
      flowByPressure: FLOW_FLAT,
      opacityByPressure: OPACITY_INK,
      // Harder than the rest: an inking line is drawn slowly and deliberately,
      // and that is exactly where unfiltered pressure noise is most visible.
      pressureSmoothingPx: 14,
      opacity: 1
    },
    {
      // Kohr's "most useful brush in Photoshop" — silhouettes, blocking, and a
      // line you mean.
      id: "hard-round",
      version: 2,
      model: "stamp",
      category: "line",
      tip: roundTip(0.82),
      paperInteraction: 0,
      spacing: 0.1,
      flow: 0.95,
      flowPer: "pass",
      sizeByPressure: SIZE_FULL,
      flowByPressure: FLOW_EARLY,
      opacityByPressure: OPACITY_EARLY,
      pressureSmoothingPx: 10,
      opacity: 1
    },
    // ── Paint ──
    {
      id: "medium-round",
      version: 2,
      model: "stamp",
      category: "paint",
      tip: roundTip(0.45),
      paperInteraction: 0,
      spacing: 0.08,
      flow: 0.85,
      flowPer: "pass",
      sizeByPressure: SIZE_FULL,
      flowByPressure: FLOW_EARLY,
      opacityByPressure: OPACITY_EARLY,
      pressureSmoothingPx: 8,
      opacity: 1
    },
    {
      // For laying colour *masses*: the first thing it has to prove is that the
      // engine can cover an area evenly rather than only draw good lines. Edge
      // between medium and hard: soft enough that two adjacent strokes merge into
      // one mass, defined enough that a shape has a boundary.
      id: "opaque-paint",
      version: 2,
      model: "stamp",
      category: "paint",
      tip: roundTip(0.62),
      paperInteraction: 0,
      spacing: 0.08,
      flow: 0.95,
      flowPer: "pass",
      sizeByPressure: SIZE_FULL,
      flowByPressure: FLOW_COVERING,
      opacityByPressure: OPACITY_EARLY,
      pressureSmoothingPx: 8,
      opacity: 1
    },
    {
      // A flat brush is nothing but aspect and rotation: held at one angle it
      // paints a broad band across the travel and a thin line along it, and the
      // width of the mark becomes something the hand controls by *direction*.
      // 4:1, the proportion the marker's chisel and watercolor's flat both
      // settled on; 45 degrees, the angle a brush is actually held at.
      id: "flat",
      version: 2,
      model: "stamp",
      category: "paint",
      tip: { kind: "round", hardness: 0.7, aspect: 4, rotation: "fixed", angle: Math.PI / 4 },
      paperInteraction: 0,
      // Tighter than the round brushes: the step is bounded by the *short* axis,
      // so a 4:1 tip at the same fraction advances a quarter as far relative to
      // its silhouette.
      spacing: 0.05,
      flow: 0.9,
      flowPer: "pass",
      sizeByPressure: SIZE_FULL,
      flowByPressure: FLOW_COVERING,
      opacityByPressure: OPACITY_EARLY,
      pressureSmoothingPx: 10,
      opacity: 1
    },
    {
      // The second brush in every program's list after a hard round: Procreate's
      // Nikko Rull, CSP's Gouache, Photoshop's block brushes. Opaque in the body,
      // broken and dry at the rim, so blocked-in masses read as paint and not as
      // vector fills.
      id: "textured-paint",
      version: 1,
      model: "stamp",
      category: "paint",
      // The ragged rim is the mask's; the dry breakup inside the stroke is the
      // canvas-anchored texture's, because only that survives twenty stamps
      // overlapping (tipMasks.ts, brush textures).
      tip: bitmapTip("rough", "travel"),
      paperInteraction: 0.1,
      texture: { id: "dry", periodPx: 384, strength: 0.95 },
      spacing: 0.08,
      flow: 0.9,
      flowPer: "pass",
      sizeByPressure: SIZE_HALF,
      flowByPressure: FLOW_COVERING,
      opacityByPressure: OPACITY_EARLY,
      pressureSmoothingPx: 8,
      opacity: 1,
      // A small wobble only. Enough that the ragged rim is not the same ragged
      // rim printed twenty times across the stroke; any more and the streaks
      // stop running along it.
      scatter: { count: 1, radius: 0, scale: 1, sizeJitter: 0.08, angleJitter: 0.03, flowJitter: 0 }
    },
    {
      // Round bristle / Hair-Fur / Bristle 6. Every hair tip drags its own
      // streak, so one pass paints fur, grass texture, wood grain, or the dry
      // hatching of a real bristle brush.
      id: "bristle",
      version: 1,
      model: "stamp",
      category: "paint",
      tip: bitmapTip("bristle", "travel"),
      paperInteraction: 0,
      // Very tight: a hair has to leave a *line*, and a hair tip is a few pixels
      // across, so the step is bounded by the hair, not by the brush.
      spacing: 0.02,
      flow: 0.9,
      flowPer: "pass",
      flowSpan: 0.12,
      sizeByPressure: SIZE_HALF,
      flowByPressure: FLOW_EARLY,
      opacityByPressure: OPACITY_EARLY,
      pressureSmoothingPx: 8,
      opacity: 1
    },
    {
      // The brush SAI and Krita's Wet presets are loved for, and the one thing a
      // digital painter misses most in a set without it: it lays its own colour
      // and drags what it passes over into it, so two colours blend under one
      // stroke instead of needing a round trip to the smudge tool.
      id: "mixer",
      version: 1,
      model: "mixer",
      category: "paint",
      tip: roundTip(0.5),
      paperInteraction: 0,
      spacing: 0.08,
      flow: 1,
      flowPer: "pass",
      sizeByPressure: SIZE_HALF,
      flowByPressure: FLOW_COVERING,
      opacityByPressure: OPACITY_EARLY,
      pressureSmoothingPx: 8,
      opacity: 1,
      // Forgets at 0.45 per radius, so a colour is carried about two brush
      // widths before the brush's own takes over again — long enough to pull one
      // colour visibly into the next, short enough that a stroke still ends in
      // the colour it was loaded with.
      mixer: { load: 0.15, pickup: 0.3, strength: 1.4 }
    },
    // ── Digital watercolor (#579) ──
    //
    // The family every digital painting app ships as "Watercolor" and none of
    // them simulates: a stroke's coverage, rendered with a wet edge, blooms,
    // granulation and a multiplying glaze. Predictable in a way the physical
    // watercolor tool (ADR 011) deliberately is not, which is what a lesson in
    // digital painting needs — and what the named group keeps apart from that
    // tool in the picker.
    {
      // The workhorse wash: soft enough to merge, transparent, blooming.
      id: "wet-wash",
      version: 2,
      model: "stamp",
      category: "wet",
      tip: roundTip(0.5),
      paperInteraction: 0.15,
      spacing: 0.07,
      flow: 0.95,
      flowPer: "pass",
      sizeByPressure: SIZE_HALF,
      flowByPressure: FLOW_LINEAR,
      opacityByPressure: OPACITY_WET,
      pressureSmoothingPx: 8,
      opacity: 1,
      wet: { edge: 0.6, mottle: 0.7, granulation: 0.15, glaze: true, model: 2, bloom: 0.3 }
    },
    {
      // Wet-in-wet: paint dropped into a wet sheet — no rim at all, a soft
      // feathered fringe, blooms. The one wet brush with no hard edge anywhere.
      id: "wet-on-wet",
      version: 1,
      model: "stamp",
      category: "wet",
      tip: roundTip(0.15),
      paperInteraction: 0.05,
      spacing: 0.06,
      flow: 0.8,
      flowPer: "pass",
      sizeByPressure: SIZE_HALF,
      flowByPressure: FLOW_LINEAR,
      opacityByPressure: OPACITY_WET,
      pressureSmoothingPx: 8,
      opacity: 1,
      wet: { edge: 0, mottle: 0.8, granulation: 0.1, glaze: true, model: 2, bloom: 0.35, feather: 0.9 }
    },
    {
      // Wet edge on its own terms: a firm stroke whose pigment has run to the
      // rim and dried there as a dark outline.
      id: "wet-edge",
      version: 2,
      model: "stamp",
      category: "wet",
      tip: roundTip(0.9),
      paperInteraction: 0.1,
      spacing: 0.07,
      flow: 0.95,
      flowPer: "pass",
      sizeByPressure: SIZE_HALF,
      flowByPressure: FLOW_LINEAR,
      opacityByPressure: OPACITY_WET,
      pressureSmoothingPx: 8,
      opacity: 1,
      wet: { edge: 1, mottle: 0.35, granulation: 0.05, glaze: true, model: 2 }
    },
    {
      // Granulating pigment — ultramarine, earth colours: the tone gathers in a
      // fine grain rather than lying flat.
      id: "granulating",
      version: 2,
      model: "stamp",
      category: "wet",
      tip: roundTip(0.45),
      paperInteraction: 0.2,
      spacing: 0.07,
      flow: 0.95,
      flowPer: "pass",
      sizeByPressure: SIZE_HALF,
      flowByPressure: FLOW_LINEAR,
      opacityByPressure: OPACITY_WET,
      pressureSmoothingPx: 8,
      opacity: 1,
      wet: { edge: 0.4, mottle: 0.45, granulation: 0.9, glaze: true, model: 2, bloom: 0.15 }
    },
    {
      // A dry, loaded brush dragged fast: ragged rim, broken body, still a glaze.
      id: "dry-wash",
      version: 2,
      model: "stamp",
      category: "wet",
      tip: bitmapTip("rough", "travel"),
      paperInteraction: 0.35,
      texture: { id: "dry", periodPx: 320, strength: 0.7 },
      spacing: 0.08,
      flow: 0.95,
      flowPer: "pass",
      sizeByPressure: SIZE_HALF,
      flowByPressure: FLOW_LINEAR,
      opacityByPressure: OPACITY_WET,
      pressureSmoothingPx: 8,
      opacity: 0.95,
      scatter: { count: 1, radius: 0, scale: 1, sizeJitter: 0.08, angleJitter: 0.03, flowJitter: 0 },
      wet: { edge: 0.35, mottle: 0.35, granulation: 0.3, glaze: true, model: 2 }
    },
    {
      // A flat whose hairs have clumped: one pass lays a stack of parallel
      // glazed stripes, darker where their soft sides overlap.
      id: "wet-bands",
      version: 2,
      model: "stamp",
      category: "wet",
      tip: bitmapTip("clumps", "travel"),
      paperInteraction: 0.1,
      // Without these the stripes come out ruled: a clump's position is fixed in
      // the tip, so only per-stamp jitter and the canvas grain make a stripe
      // wander and break the way a real one does.
      texture: { id: "dry", periodPx: 320, strength: 0.35 },
      scatter: { count: 1, radius: 0.04, scale: 1, sizeJitter: 0.12, angleJitter: 0.02, flowJitter: 0.2 },
      spacing: 0.03,
      flow: 0.95,
      flowPer: "pass",
      flowSpan: 0.4,
      sizeByPressure: SIZE_HALF,
      flowByPressure: FLOW_LINEAR,
      opacityByPressure: OPACITY_WET,
      pressureSmoothingPx: 8,
      opacity: 1,
      wet: { edge: 0.55, mottle: 0.4, granulation: 0.1, glaze: true, model: 2, bloom: 0.2 }
    },
    {
      // Dabbed rather than dragged: round prints far enough apart that each
      // keeps its own wet rim, so the stroke's edge comes out scalloped.
      id: "sponge",
      version: 2,
      model: "stamp",
      category: "wet",
      tip: roundTip(0.7),
      paperInteraction: 0.15,
      spacing: 0.32,
      flow: 0.9,
      flowPer: "stamp",
      sizeByPressure: SIZE_HALF,
      flowByPressure: FLOW_LINEAR,
      opacityByPressure: OPACITY_WET,
      pressureSmoothingPx: 8,
      opacity: 1,
      wet: { edge: 0.85, mottle: 0.35, granulation: 0.2, glaze: true, model: 2, bloom: 0.1 }
    },
    {
      // Gouache: opaque, flat and matte — it covers what is under it rather
      // than glazing it, with only a trace of the brush in the tone.
      id: "gouache",
      version: 2,
      model: "stamp",
      category: "wet",
      tip: roundTip(0.7),
      paperInteraction: 0.1,
      texture: { id: "dry", periodPx: 384, strength: 0.18 },
      spacing: 0.07,
      flow: 0.95,
      flowPer: "pass",
      sizeByPressure: SIZE_HALF,
      flowByPressure: FLOW_COVERING,
      opacityByPressure: OPACITY_WET,
      pressureSmoothingPx: 8,
      opacity: 1,
      wet: { edge: 0.12, mottle: 0.25, granulation: 0.05, glaze: false, model: 2 }
    },
    // ── Soft ──
    {
      id: "soft-round",
      version: 2,
      model: "stamp",
      category: "soft",
      tip: roundTip(0.12),
      paperInteraction: 0,
      // Tight, because a soft stamp's own ripple is what shows first: the profile
      // falls off over most of the radius, so consecutive stamps have to overlap
      // heavily before the mark reads as continuous rather than as beads.
      spacing: 0.06,
      flow: 0.45,
      flowPer: "pass",
      sizeByPressure: SIZE_FULL,
      flowByPressure: FLOW_LINEAR,
      opacityByPressure: OPACITY_LINEAR,
      pressureSmoothingPx: 8,
      opacity: 1
    },
    {
      // Soft Airbrush: gradients, light, atmosphere. Differs from soft-round in
      // the two ways an airbrush differs from a brush — the spray does not widen
      // under pressure, it gets denser, and a single pass is faint, so tone is
      // built up rather than laid.
      id: "airbrush",
      version: 1,
      model: "stamp",
      category: "soft",
      tip: roundTip(0),
      paperInteraction: 0,
      spacing: 0.05,
      flow: 0.35,
      flowPer: "pass",
      sizeByPressure: SIZE_NOZZLE,
      flowByPressure: FLOW_LINEAR,
      opacityByPressure: OPACITY_LINEAR,
      pressureSmoothingPx: 8,
      opacity: 1
    },
    // ── Texture ──
    {
      // Chalk and pastel — the textured-tone brush every set carries (Pastel
      // Palooza, Krita's chalk, Procreate's). Grain twice over: the tip's own
      // broken contact, and the sheet's tooth, which a light touch skims and a
      // heavy one presses into.
      id: "chalk",
      version: 1,
      model: "stamp",
      category: "texture",
      tip: bitmapTip("chalk", "fixed", 0.6),
      paperInteraction: 0.7,
      // Its own grit as well as the paper's tooth, so chalk is still chalk on
      // the smooth paper, which has no tooth to give.
      texture: { id: "grit", periodPx: 160, strength: 0.6 },
      spacing: 0.12,
      flow: 0.75,
      flowPer: "pass",
      sizeByPressure: SIZE_HALF,
      flowByPressure: FLOW_LINEAR,
      opacityByPressure: OPACITY_LINEAR,
      pressureSmoothingPx: 8,
      opacity: 1,
      // Spun freely, or the tip's grain lines up stamp after stamp into streaks
      // along the stroke — chalk has no direction.
      scatter: { count: 1, radius: 0.04, scale: 1, sizeJitter: 0.1, angleJitter: 1, flowJitter: 0 }
    },
    {
      // Noise: specks for fabric, stone, skin, rust. Its stamps are the marks, so
      // flow is per stamp and the dabs are far apart.
      id: "grain",
      version: 1,
      model: "stamp",
      category: "texture",
      tip: bitmapTip("speckle", "fixed", 0.9),
      paperInteraction: 0,
      spacing: 0.3,
      flow: 0.85,
      flowPer: "stamp",
      sizeByPressure: SIZE_NOZZLE,
      flowByPressure: FLOW_LINEAR,
      opacityByPressure: OPACITY_LINEAR,
      pressureSmoothingPx: 8,
      opacity: 1,
      scatter: { count: 1, radius: 0.2, scale: 1, sizeJitter: 0.3, angleJitter: 1, flowJitter: 0.3 }
    },
    {
      // Screentone for manga and comics. The tone of the stroke becomes the size
      // of the dots, so pressure (with the opacity switch on) draws a gradient
      // of dot sizes, the way a tone knife scrapes one.
      id: "screentone",
      version: 1,
      model: "stamp",
      category: "texture",
      tip: roundTip(0.35),
      paperInteraction: 0,
      spacing: 0.06,
      flow: 0.7,
      flowPer: "pass",
      sizeByPressure: SIZE_NOZZLE,
      flowByPressure: FLOW_LINEAR,
      opacityByPressure: OPACITY_LINEAR,
      pressureSmoothingPx: 8,
      opacity: 1,
      screentonePx: 7
    },
    // ── Scatter ──
    {
      // Splatter: drops thrown off a loaded brush. Small, hard, of every size.
      id: "splatter",
      version: 1,
      model: "stamp",
      category: "scatter",
      tip: roundTip(0.9),
      paperInteraction: 0,
      spacing: 0.5,
      flow: 1,
      flowPer: "stamp",
      sizeByPressure: SIZE_HALF,
      flowByPressure: FLOW_LINEAR,
      opacityByPressure: OPACITY_EARLY,
      pressureSmoothingPx: 8,
      opacity: 1,
      scatter: { count: 5, radius: 0.9, scale: 0.16, sizeJitter: 0.85, angleJitter: 0, flowJitter: 0.25 }
    },
    {
      // Grass: clumps of blades, always upright — a 'fixed' tip at angle 0, with
      // just enough jitter that the clumps do not stand to attention.
      id: "grass",
      version: 1,
      model: "stamp",
      category: "scatter",
      tip: bitmapTip("grass", "fixed", 0.8),
      paperInteraction: 0,
      spacing: 0.3,
      flow: 1,
      flowPer: "stamp",
      sizeByPressure: SIZE_HALF,
      flowByPressure: FLOW_LINEAR,
      opacityByPressure: OPACITY_EARLY,
      pressureSmoothingPx: 8,
      opacity: 1,
      scatter: { count: 1, radius: 0.25, scale: 1, sizeJitter: 0.4, angleJitter: 0.05, flowJitter: 0.3 }
    },
    {
      // Foliage: one drawn leaf, scattered and turned, so a mass of leaves never
      // repeats inside a stroke the way a bitmap of a whole bush would.
      id: "foliage",
      version: 1,
      model: "stamp",
      category: "scatter",
      tip: bitmapTip("leaf", "fixed", 0.8),
      paperInteraction: 0,
      spacing: 0.4,
      flow: 1,
      flowPer: "stamp",
      sizeByPressure: SIZE_HALF,
      flowByPressure: FLOW_LINEAR,
      opacityByPressure: OPACITY_EARLY,
      pressureSmoothingPx: 8,
      opacity: 1,
      scatter: { count: 3, radius: 0.6, scale: 0.45, sizeJitter: 0.5, angleJitter: 1, flowJitter: 0.35 }
    }
  ];
  var DIGITAL_BRUSH_IDS = DIGITAL_BRUSHES.map((b) => b.id);
  var V1_WET_BRUSHES = [
    {
      // The workhorse wash: soft enough to merge, transparent, blooming.
      id: "wet-wash",
      version: 1,
      model: "stamp",
      category: "wet",
      tip: roundTip(0.5),
      paperInteraction: 0.15,
      spacing: 0.07,
      flow: 0.95,
      flowPer: "pass",
      sizeByPressure: SIZE_HALF,
      flowByPressure: FLOW_LINEAR,
      opacityByPressure: OPACITY_WET,
      pressureSmoothingPx: 8,
      opacity: 1,
      wet: { edge: 0.55, mottle: 0.6, granulation: 0.1, glaze: true }
    },
    {
      // Wet edge on its own terms: a firm stroke whose pigment has run to the
      // rim and dried there as a dark outline.
      id: "wet-edge",
      version: 1,
      model: "stamp",
      category: "wet",
      tip: roundTip(0.9),
      paperInteraction: 0.1,
      spacing: 0.07,
      flow: 0.95,
      flowPer: "pass",
      sizeByPressure: SIZE_HALF,
      flowByPressure: FLOW_LINEAR,
      opacityByPressure: OPACITY_WET,
      pressureSmoothingPx: 8,
      opacity: 1,
      wet: { edge: 1, mottle: 0.25, granulation: 0, glaze: true }
    },
    {
      // Granulating pigment — ultramarine, earth colours: the tone gathers in a
      // fine grain rather than lying flat.
      id: "granulating",
      version: 1,
      model: "stamp",
      category: "wet",
      tip: roundTip(0.45),
      paperInteraction: 0.2,
      spacing: 0.07,
      flow: 0.95,
      flowPer: "pass",
      sizeByPressure: SIZE_HALF,
      flowByPressure: FLOW_LINEAR,
      opacityByPressure: OPACITY_WET,
      pressureSmoothingPx: 8,
      opacity: 1,
      wet: { edge: 0.35, mottle: 0.35, granulation: 0.85, glaze: true }
    },
    {
      // A dry, loaded brush dragged fast: ragged rim, broken body, still a glaze.
      id: "dry-wash",
      version: 1,
      model: "stamp",
      category: "wet",
      tip: bitmapTip("rough", "travel"),
      paperInteraction: 0.35,
      texture: { id: "dry", periodPx: 320, strength: 0.7 },
      spacing: 0.08,
      flow: 0.95,
      flowPer: "pass",
      sizeByPressure: SIZE_HALF,
      flowByPressure: FLOW_LINEAR,
      opacityByPressure: OPACITY_WET,
      pressureSmoothingPx: 8,
      opacity: 0.95,
      scatter: { count: 1, radius: 0, scale: 1, sizeJitter: 0.08, angleJitter: 0.03, flowJitter: 0 },
      wet: { edge: 0.3, mottle: 0.3, granulation: 0.2, glaze: true }
    },
    {
      // A flat whose hairs have clumped: one pass lays a stack of parallel
      // glazed stripes, darker where their soft sides overlap.
      id: "wet-bands",
      version: 1,
      model: "stamp",
      category: "wet",
      tip: bitmapTip("clumps", "travel"),
      paperInteraction: 0.1,
      // Without these the stripes come out ruled: a clump's position is fixed in
      // the tip, so only per-stamp jitter and the canvas grain make a stripe
      // wander and break the way a real one does.
      texture: { id: "dry", periodPx: 320, strength: 0.35 },
      scatter: { count: 1, radius: 0.04, scale: 1, sizeJitter: 0.12, angleJitter: 0.02, flowJitter: 0.2 },
      spacing: 0.03,
      flow: 0.95,
      flowPer: "pass",
      flowSpan: 0.4,
      sizeByPressure: SIZE_HALF,
      flowByPressure: FLOW_LINEAR,
      opacityByPressure: OPACITY_WET,
      pressureSmoothingPx: 8,
      opacity: 1,
      wet: { edge: 0.5, mottle: 0.3, granulation: 0, glaze: true }
    },
    {
      // Dabbed rather than dragged: round prints far enough apart that each
      // keeps its own wet rim, so the stroke's edge comes out scalloped.
      id: "sponge",
      version: 1,
      model: "stamp",
      category: "wet",
      tip: roundTip(0.7),
      paperInteraction: 0.15,
      spacing: 0.32,
      flow: 0.9,
      flowPer: "stamp",
      sizeByPressure: SIZE_HALF,
      flowByPressure: FLOW_LINEAR,
      opacityByPressure: OPACITY_WET,
      pressureSmoothingPx: 8,
      opacity: 1,
      wet: { edge: 0.8, mottle: 0.25, granulation: 0.1, glaze: true }
    },
    {
      // Gouache: opaque, flat and matte — it covers what is under it rather
      // than glazing it, with only a trace of the brush in the tone.
      id: "gouache",
      version: 1,
      model: "stamp",
      category: "wet",
      tip: roundTip(0.7),
      paperInteraction: 0.1,
      texture: { id: "dry", periodPx: 384, strength: 0.18 },
      spacing: 0.07,
      flow: 0.95,
      flowPer: "pass",
      sizeByPressure: SIZE_HALF,
      flowByPressure: FLOW_COVERING,
      opacityByPressure: OPACITY_WET,
      pressureSmoothingPx: 8,
      opacity: 1,
      wet: { edge: 0.15, mottle: 0.15, granulation: 0, glaze: false }
    }
  ];
  var ALL_BRUSHES = [...DIGITAL_BRUSHES, ...V1_BRUSHES, ...V1_WET_BRUSHES];
  var f32 = new Float32Array(1);
  var u32 = new Uint32Array(f32.buffer);

  // apps/web/src/engine/src/presets/markerPresets.ts
  var MARKER_CHISEL_ANGLE_RADIANS_DEFAULT = Math.PI / 4;

  // apps/web/src/engine/src/presets/tiltCurve.ts
  function tiltCurveT(tiltDeg, fullDeg, curve) {
    if (fullDeg <= 0) return 1;
    return Math.pow(clamp_default(tiltDeg / fullDeg, 0, 1), curve);
  }
  function tiltCurveLerp(t, atFull) {
    return 1 + (atFull - 1) * t;
  }
  var TILT_RESPONSES = ["restrained", "smooth", "linear"];
  var DEFAULT_TILT_RESPONSE = "smooth";
  var RESTRAINED_FULL_DEG = 90;
  var RESTRAINED_CURVE = 3;
  var RESPONSE_SET = new Set(TILT_RESPONSES);
  function tiltResponseFullDeg(response, materialFullDeg) {
    return response === "restrained" ? RESTRAINED_FULL_DEG : materialFullDeg;
  }
  function tiltResponseCurve(response, materialCurve) {
    if (response === "restrained") return RESTRAINED_CURVE;
    if (response === "linear") return 1;
    return materialCurve;
  }
  function tiltResponseT(tiltDeg, response, materialFullDeg, materialCurve) {
    return tiltCurveT(
      tiltDeg,
      tiltResponseFullDeg(response, materialFullDeg),
      tiltResponseCurve(response, materialCurve)
    );
  }

  // apps/web/src/engine/src/presets/charcoalFeel.ts
  var CHARCOAL_FEEL = {
    fullDeg: 62,
    curve: 2,
    aspectMax: 8,
    widthMax: 0.5,
    broadLightening: 0.45,
    broadGrainBoost: 0.9,
    smoothingPx: 25.8,
    pressureFloor: 0.3,
    pressureGamma: 0.6,
    skipFloor: 0.12,
    gateRelief: 0.85,
    grainDepth: 2.5
  };
  function charcoalTiltT(tiltDeg, cfg = CHARCOAL_FEEL, response = DEFAULT_TILT_RESPONSE) {
    return tiltResponseT(tiltDeg, response, cfg.fullDeg, cfg.curve);
  }
  function charcoalAspect(tiltDeg, cfg = CHARCOAL_FEEL, response = DEFAULT_TILT_RESPONSE) {
    return tiltCurveLerp(charcoalTiltT(tiltDeg, cfg, response), cfg.aspectMax);
  }
  function charcoalWidthFactor(tiltDeg, cfg = CHARCOAL_FEEL, response = DEFAULT_TILT_RESPONSE) {
    return tiltCurveLerp(charcoalTiltT(tiltDeg, cfg, response), cfg.widthMax);
  }

  // apps/web/src/engine/src/presets/charcoalPresets.ts
  var CHARCOAL_TYPES = ["vine", "willow", "compressed"];
  var TYPE_SET = new Set(CHARCOAL_TYPES);
  var CHARCOAL_NIBS = ["bullet", "chisel"];
  var NIB_SET = new Set(CHARCOAL_NIBS);

  // apps/web/src/engine/src/presets/pencilTilt.ts
  var PENCIL_TILT = {
    fullDeg: 60,
    curve: 2,
    aspectMax: 5,
    widthMax: 1.4,
    lightening: 0.35,
    smoothingPx: 14.6
  };
  function pencilTiltT(tiltDeg, cfg = PENCIL_TILT, response = DEFAULT_TILT_RESPONSE) {
    return tiltResponseT(tiltDeg, response, cfg.fullDeg, cfg.curve);
  }
  function pencilTiltAspect(tiltDeg, cfg = PENCIL_TILT, response = DEFAULT_TILT_RESPONSE) {
    return tiltCurveLerp(pencilTiltT(tiltDeg, cfg, response), cfg.aspectMax);
  }
  function pencilTiltWidthFactor(tiltDeg, cfg = PENCIL_TILT, response = DEFAULT_TILT_RESPONSE) {
    return tiltCurveLerp(pencilTiltT(tiltDeg, cfg, response), cfg.widthMax);
  }

  // apps/web/src/engine/src/presets/tiltMath.ts
  var DEG_TO_RAD = Math.PI / 180;
  var RAD_TO_DEG = 180 / Math.PI;
  var MAX_REPORTED_TILT_DEG = 90;
  function tiltAzimuthRad(tiltX, tiltY) {
    const tx = Math.tan(clamp_default(tiltX, -MAX_REPORTED_TILT_DEG, MAX_REPORTED_TILT_DEG) * DEG_TO_RAD);
    const ty = Math.tan(clamp_default(tiltY, -MAX_REPORTED_TILT_DEG, MAX_REPORTED_TILT_DEG) * DEG_TO_RAD);
    return Math.atan2(ty, tx);
  }

  // apps/web/src/engine/src/presets/dabShaping.ts
  function clamp01(v) {
    return clamp_default(v, 0, 1);
  }
  function tiltOrPathAngle(tiltMag, tiltX, tiltY, pathAngle, cameraAngle = 0) {
    return tiltMag > 15 ? tiltAzimuthRad(tiltX, tiltY) - cameraAngle : pathAngle;
  }
  function pencilShapingFor(response) {
    return {
      size: (pressure, tiltNorm) => (0.3 + 0.7 * pressure) * pencilTiltWidthFactor(tiltNorm * 90, PENCIL_TILT, response),
      aspect: (tiltNorm) => pencilTiltAspect(tiltNorm * 90, PENCIL_TILT, response),
      angle: tiltOrPathAngle,
      // A getter for the same reason charcoal's is: the debug overlay mutates
      // PENCIL_TILT in place, and a captured value would freeze whatever smoothing
      // happened to be set when this module was first evaluated.
      get tiltSmoothingPx() {
        return PENCIL_TILT.smoothingPx;
      }
    };
  }
  var PENCIL_SHAPING_BY_RESPONSE = {
    restrained: pencilShapingFor("restrained"),
    smooth: pencilShapingFor("smooth"),
    linear: pencilShapingFor("linear")
  };
  var PENCIL_DAB_SHAPING = PENCIL_SHAPING_BY_RESPONSE[DEFAULT_TILT_RESPONSE];
  var CHARCOAL_WIDTH_FLOOR = 0.45;
  var CHARCOAL_WIDTH_SWING = 0.6;
  function charcoalShapingFor(response) {
    return {
      size: (pressure, tiltNorm) => (CHARCOAL_WIDTH_FLOOR + CHARCOAL_WIDTH_SWING * clamp01(pressure)) * charcoalWidthFactor(tiltNorm * 90, CHARCOAL_FEEL, response),
      aspect: (tiltNorm) => charcoalAspect(tiltNorm * 90, CHARCOAL_FEEL, response),
      angle: tiltOrPathAngle,
      // A getter, not a captured value: CHARCOAL_FEEL is mutated in place by the
      // debug overlay's sliders, and a plain property would freeze whatever
      // smoothing happened to be set at module-eval time.
      get tiltSmoothingPx() {
        return CHARCOAL_FEEL.smoothingPx;
      }
    };
  }
  var CHARCOAL_CHISEL_ANGLE_DEFAULT = Math.PI / 4;
  var CHARCOAL_SHAPING_BY_RESPONSE = {
    restrained: charcoalShapingFor("restrained"),
    smooth: charcoalShapingFor("smooth"),
    linear: charcoalShapingFor("linear")
  };
  var CHARCOAL_DAB_SHAPING = CHARCOAL_SHAPING_BY_RESPONSE[DEFAULT_TILT_RESPONSE];

  // apps/web/src/engine/src/presets/brushPenPresets.ts
  function clamp012(v) {
    return clamp_default(v, 0, 1);
  }
  var BRUSH_PEN_WIDTH_FLOOR = 0.1;
  var BRUSH_PEN_MIN_PRESSURE = 0.05;
  function gain(x, k) {
    const t = clamp012(x);
    return t < 0.5 ? 0.5 * Math.pow(2 * t, k) : 1 - 0.5 * Math.pow(2 - 2 * t, k);
  }
  var PRESSURE_RESPONSES = ["soft", "normal", "firm"];
  var DEFAULT_PRESSURE_RESPONSE = "normal";
  function isPressureResponse(v) {
    return PRESSURE_RESPONSES.includes(v);
  }
  var PRESSURE_RESPONSE_K = {
    soft: 1.05,
    normal: 1.35,
    firm: 1.8
  };
  function brushPenWidth(pressure, response) {
    return BRUSH_PEN_WIDTH_FLOOR + (1 - BRUSH_PEN_WIDTH_FLOOR) * gain(pressure, PRESSURE_RESPONSE_K[response]);
  }
  var BRUSH_PEN_PRESSURE_SMOOTHING_PX = 10;
  var BRUSH_PEN_ELONGATION = 0.85;
  var BRUSH_PEN_TIP_LAG_WIDTHS = 1.5;
  var BRUSH_PEN_TIP_MIN_LAG_PX = 6;
  var TRAIL_SPEED_SLOW = 0.5;
  var TRAIL_SPEED_FAST = 2.5;
  var BRUSH_PEN_TRAIL_WIDTHS = 0.18;
  function brushPenTipBend(response) {
    return {
      // The same S-curve as the width, on purpose and with the same `k`. One
      // deformation is happening — the nib bending — and width and length are
      // two views of it, so a nib that is described as "firm" should be equally
      // reluctant to lengthen as it is to widen. Two curves here would let the
      // footprint's *proportions* change with the setting, which is a property
      // of the nib rather than of the hand.
      elongation: (pressure) => 1 + BRUSH_PEN_ELONGATION * gain(Math.max(pressure, BRUSH_PEN_MIN_PRESSURE), PRESSURE_RESPONSE_K[response]),
      lagWidths: BRUSH_PEN_TIP_LAG_WIDTHS,
      minLagPx: BRUSH_PEN_TIP_MIN_LAG_PX,
      trailWidths: (speed) => BRUSH_PEN_TRAIL_WIDTHS * clamp012((speed - TRAIL_SPEED_SLOW) / (TRAIL_SPEED_FAST - TRAIL_SPEED_SLOW))
    };
  }
  var BRUSH_PEN_HEAD_TAPER = { startScale: 0.35, lengthPx: 10 };
  var CONTACT_SPEED_SLOW = 0.4;
  var CONTACT_SPEED_FAST = 2.5;
  var CONTACT_AT_SPEED = 0.9;
  var CONTACT_SMOOTHING_PX = 30;
  var BRUSH_PEN_SPEED_CONTACT = {
    factor: (speed) => lerp(1, CONTACT_AT_SPEED, (speed - CONTACT_SPEED_SLOW) / (CONTACT_SPEED_FAST - CONTACT_SPEED_SLOW)),
    smoothingPx: CONTACT_SMOOTHING_PX
  };
  function brushPenShapingFor(response) {
    return {
      // The pressure floor lives here rather than in PointerInput because it is a
      // property of this tool's reading of the device, not of the device: every
      // other tool still sees the true reported value, and Dab.pressure keeps
      // storing the real one (see dabShaping.ts's #245 note on why a per-tool
      // remap of the stored pressure was reverted once already).
      size: (pressure) => brushPenWidth(Math.max(pressure, BRUSH_PEN_MIN_PRESSURE), response),
      // ADR 009 §6: a soft round-to-slightly-oval brush nib. 1.0 upright, about
      // 1.1 at a tilt a hand actually reaches — enough to keep the mark from
      // reading as a perfect circle stamped along a path, nowhere near enough to
      // let tilt compete with pressure for control of the width. A strong tilt
      // response would turn this into a marker or a charcoal stick, which are the
      // two tools it most needs to not be.
      aspect: (tiltNorm) => 1 + 0.25 * tiltNorm,
      // Kept as the fallback for the two moments the nib has no direction of its
      // own — the first dab of a stroke, and the instant a hairpin straightens
      // the fibres out — but for every dab in between, `tipBend` below overrides
      // it outright. Tilt decides how large the contact patch is (§6); which way
      // a *bent* nib points is a fact about the drag, and a stylus's lean has no
      // business rotating it (#472).
      angle: tiltOrPathAngle,
      // #305's low-pass, applied to pressure instead of tilt (DabSystem's own
      // _filterPressure). Opt-in per profile exactly as tiltSmoothing is, so no
      // other tool pays for it.
      pressureSmoothingPx: BRUSH_PEN_PRESSURE_SMOOTHING_PX,
      // #472: the whole of the nib's flexibility, and the reason this tool needs
      // a profile that other tools' pure shape functions cannot express.
      tipBend: brushPenTipBend(response),
      // #482, ADR 012 §8: declared, not post-processed — so the nib's lag and
      // trail are computed from the width actually being drawn.
      headTaper: BRUSH_PEN_HEAD_TAPER,
      speedContact: BRUSH_PEN_SPEED_CONTACT
    };
  }
  var BRUSH_PEN_SHAPING_BY_RESPONSE = {
    soft: brushPenShapingFor("soft"),
    normal: brushPenShapingFor("normal"),
    firm: brushPenShapingFor("firm")
  };
  function lerp(a, b, t) {
    return a + (b - a) * clamp012(t);
  }

  // apps/web/src/engine/src/presets/watercolorPigments.ts
  function rgb(hex) {
    return [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];
  }
  var WATERCOLOR_PIGMENTS = [
    { code: "PY35", name: "Cadmium Yellow", color: rgb(15852595), granulation: 0.1, opacity: 0.2, diffusion: 0.25, staining: 0.75 },
    { code: "PY154", name: "Benzimida Yellow", color: rgb(14400558), granulation: 0.3, opacity: 0.02, diffusion: 0.25, staining: 0.75 },
    { code: "PY42", name: "Gold Ochre", color: rgb(15434566), granulation: 0.1, opacity: 0.1, diffusion: 0.5, staining: 0.75 },
    { code: "PR108", name: "Cadmium Scarlet", color: rgb(15288112), granulation: 0.3, opacity: 0.1, diffusion: 0.75, staining: 0.75 },
    { code: "PR179", name: "Perylene Maroon", color: rgb(13906479), granulation: 0.3, opacity: 0.01, diffusion: 0.01, staining: 1 },
    { code: "PR122", name: "Quinacridone Magenta", color: rgb(15219535), granulation: 0.3, opacity: 0.01, diffusion: 0.01, staining: 1 },
    { code: "PBr7", name: "Burnt Sienna", color: rgb(11359050), granulation: 0.5, opacity: 0.1, diffusion: 0.5, staining: 0.75 },
    { code: "PB29", name: "French Ultramarine", color: rgb(2767767), granulation: 0.75, opacity: 0.1, diffusion: 0.75, staining: 0.25 },
    { code: "PB28", name: "Cobalt Blue", color: rgb(4735901), granulation: 0.75, opacity: 0.1, diffusion: 0.75, staining: 0.5 },
    { code: "PB15", name: "Winsor Blue", color: rgb(2525395), granulation: 0.5, opacity: 0.2, diffusion: 0.25, staining: 0.5 },
    { code: "PB36", name: "Cerulean Blue", color: rgb(160942), granulation: 0.5, opacity: 0.02, diffusion: 1, staining: 0.75 },
    { code: "PG7", name: "Winsor Green", color: rgb(498046), granulation: 0.1, opacity: 0.02, diffusion: 0.25, staining: 1 },
    { code: "PG36", name: "Winsor Green YS", color: rgb(7651702), granulation: 0.1, opacity: 0.02, diffusion: 0.5, staining: 1 },
    { code: "PBk6", name: "Neutral Tint", color: rgb(2371372), granulation: 0.75, opacity: 0.02, diffusion: 1, staining: 1 },
    { code: "PW4", name: "Chinese White", color: rgb(16777215), granulation: 0.01, opacity: 0.02, diffusion: 0.25, staining: 0.5 }
  ];
  var BY_CODE = new Map(WATERCOLOR_PIGMENTS.map((p) => [p.code, p]));
  var WATERCOLOR_PIGMENT_CODES = WATERCOLOR_PIGMENTS.map((p) => p.code);
  var WATERCOLOR_PIGMENT_SWATCHES = Object.fromEntries(
    WATERCOLOR_PIGMENTS.map((p) => {
      const hex = p.color.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="1.5" y="1.5" width="21" height="21" rx="4" fill="%23${hex}" stroke="rgba(0,0,0,.28)" stroke-width="1"/></svg>`;
      return [p.code, `data:image/svg+xml,${svg}`];
    })
  );

  // apps/web/src/engine/src/presets/watercolorPresets.ts
  function clamp013(v) {
    return clamp_default(v, 0, 1);
  }
  var WATERCOLOR_WIDTH_FLOOR = 0.32;
  var WATERCOLOR_MIN_PRESSURE = 0.05;
  var DEFAULT_WATERCOLOR_RESPONSE = DEFAULT_PRESSURE_RESPONSE;
  var WATERCOLOR_RESPONSE_K = {
    soft: 1.05,
    normal: 1.35,
    firm: 1.8
  };
  function watercolorWidth(pressure, response) {
    return WATERCOLOR_WIDTH_FLOOR + (1 - WATERCOLOR_WIDTH_FLOOR) * gain(pressure, WATERCOLOR_RESPONSE_K[response]);
  }
  var WATERCOLOR_PRESSURE_SMOOTHING_PX = 5.3;
  var WATERCOLOR_HEAD_TAPER = { startScale: 0.72, lengthPx: 6 };
  function watercolorShapingFor(response) {
    return {
      size: (pressure) => watercolorWidth(Math.max(pressure, WATERCOLOR_MIN_PRESSURE), response),
      // Slightly more tilt-driven ovality than the brush pen's 0.25: laying a
      // round brush over genuinely does broaden its footprint into an oval, and
      // that is how a wash is actually laid. Still nowhere near enough for tilt
      // to compete with pressure for control of the width — the moment it does,
      // this stops being a brush and starts being a charcoal stick.
      aspect: (tiltNorm) => 1 + 0.4 * tiltNorm,
      angle: tiltOrPathAngle,
      pressureSmoothingPx: WATERCOLOR_PRESSURE_SMOOTHING_PX,
      // #482, ADR 012 §8 — same move as the brush pen's, same reason.
      headTaper: WATERCOLOR_HEAD_TAPER
    };
  }
  var WATERCOLOR_NIBS = ["round", "chisel", "flex"];
  var DEFAULT_WATERCOLOR_NIB = "round";
  function isWatercolorNib(v) {
    return WATERCOLOR_NIBS.includes(v);
  }
  function watercolorNibFromPreset(presetName) {
    const token = presetName?.split(":")[4];
    return token && isWatercolorNib(token) ? token : DEFAULT_WATERCOLOR_NIB;
  }
  var WATERCOLOR_FLEX_ELONGATION = 1.05;
  var WATERCOLOR_FLEX_LAG_WIDTHS = 2.2;
  var WATERCOLOR_FLEX_MIN_LAG_PX = 8;
  var WATERCOLOR_FLEX_TRAIL_WIDTHS = 0.3;
  var WATERCOLOR_FLEX_SPEED_SLOW = 0.35;
  var WATERCOLOR_FLEX_SPEED_FAST = 2;
  function watercolorFlexTipBend(response) {
    return {
      // The same curve as the width and with the same k, for the reason the pen
      // gives at length: one deformation is happening, and width and length are
      // two views of it, so a brush described as "firm" should be as reluctant to
      // lengthen as it is to widen.
      elongation: (pressure) => 1 + WATERCOLOR_FLEX_ELONGATION * gain(Math.max(pressure, WATERCOLOR_MIN_PRESSURE), WATERCOLOR_RESPONSE_K[response]),
      lagWidths: WATERCOLOR_FLEX_LAG_WIDTHS,
      minLagPx: WATERCOLOR_FLEX_MIN_LAG_PX,
      trailWidths: (speed) => WATERCOLOR_FLEX_TRAIL_WIDTHS * clamp013((speed - WATERCOLOR_FLEX_SPEED_SLOW) / (WATERCOLOR_FLEX_SPEED_FAST - WATERCOLOR_FLEX_SPEED_SLOW))
    };
  }
  function watercolorFlexShaping(response) {
    return { ...watercolorShapingFor(response), tipBend: watercolorFlexTipBend(response) };
  }
  var WATERCOLOR_FLEX_BY_RESPONSE = {
    soft: watercolorFlexShaping("soft"),
    normal: watercolorFlexShaping("normal"),
    firm: watercolorFlexShaping("firm")
  };
  var WATERCOLOR_SHAPING_BY_RESPONSE = {
    soft: watercolorShapingFor("soft"),
    normal: watercolorShapingFor("normal"),
    firm: watercolorShapingFor("firm")
  };
  function watercolorResponseFromPreset(presetName) {
    const token = presetName?.split(":")[0];
    return token && isPressureResponse(token) ? token : DEFAULT_WATERCOLOR_RESPONSE;
  }
  var WATER_RUN_RADII = 20;
  var WATER_FLOOR = 0.04;
  var PIGMENT_RUN_DRY_RADII = 8;
  var PIGMENT_RUN_WET_RADII = 80;
  var WATERCOLOR_START_EXCESS_BASE = 5;
  var WATERCOLOR_START_EXCESS_DWELL = 2.8;
  var WATERCOLOR_START_EXCESS_RADII = 1.2;
  function watercolorWetPull(paperWet) {
    return 1 + WC_WET_PULL * clamp013(paperWet);
  }
  var WC_WET_PULL = 1;
  function watercolorPuddleDepth(usedRadii, landedWet, paperWet, dwellMs = 0) {
    const e = watercolorDwellWater(dwellMs) * (1 - clamp013(landedWet)) * Math.exp(-usedRadii / WC_PUDDLE_RADII);
    const w = clamp013(paperWet / WC_PUDDLE_WET_FULL);
    return 1 - (1 - WC_FILM_STAND) * (1 - e) * (1 - w);
  }
  var WC_FILM_STAND = 0.45;
  var WC_PUDDLE_RADII = 3;
  var WC_PUDDLE_WET_FULL = 0.5;
  var WC_FILM_DOSE = 1.4;
  function watercolorTravelQuantum(radiusPx) {
    return Math.max(WC_TRAVEL_QUANTUM_MIN_PX, radiusPx * WC_TRAVEL_QUANTUM);
  }
  var WC_TRAVEL_QUANTUM = 0.06;
  var WC_TRAVEL_QUANTUM_MIN_PX = 1.5;
  function watercolorTrailDwell(trail, x, y, t, radius) {
    let since = t;
    for (let i = trail.length - 1; i >= 0; i--) {
      const d = trail[i];
      if (Math.hypot(d.x - x, d.y - y) > radius) break;
      since = d.t;
    }
    return Math.max(0, t - since);
  }
  var WC_DWELL_FLOOR_MS = 60;
  var WC_TRAIL_LEN = 64;
  function watercolorSurplus(prev, spentRadii, level, runRadii) {
    return Math.max(prev * Math.exp(-Math.max(spentRadii, 0) / runRadii), level);
  }
  var WC_BRAKE_TAU_MS = 20;
  function watercolorBrakeSurplus(prev, spentRadii, level, elapsedMs) {
    const held = watercolorSurplus(prev, spentRadii, 0, WC_SLOW_RUN_RADII);
    return held + Math.max(level - held, 0) * (1 - Math.exp(-Math.max(elapsedMs, 0) / WC_BRAKE_TAU_MS));
  }
  function watercolorExcessFromSurplus(usedRadii, landedWet, surplusPigment) {
    const gate = 1 - clamp013(landedWet);
    return 1 + WATERCOLOR_START_EXCESS_BASE * gate * Math.exp(-usedRadii / WATERCOLOR_START_EXCESS_RADII) + WATERCOLOR_START_EXCESS_DWELL * surplusPigment;
  }
  function watercolorPuddleFromSurplus(surplusWater, paperWet) {
    const w = clamp013(paperWet / WC_PUDDLE_WET_FULL);
    return 1 - (1 - WC_FILM_STAND) * (1 - clamp013(surplusWater)) * (1 - w);
  }
  function watercolorSlowdown(v, vPeak) {
    if (!(vPeak > 0)) return 0;
    const rel = Math.max(v, 0) / vPeak;
    const at = (x) => WC_SLOW_V0 / (x + WC_SLOW_V0);
    return clamp013((at(rel) - at(1)) / (at(0) - at(1)));
  }
  var WC_SLOW_V0 = 0.2;
  var WC_SLOW_GAIN = 0.2666666667;
  var WC_SLOW_RUN_RADII = 2.4;
  var WC_SPEED_TAU_MS = 20;
  var WC_PEAK_FADE_MS = 800;
  var WC_DWELL_RADIUS = 0.3;
  var WC_DWELL_TAU_WATER_MS = 450;
  var WC_DWELL_TAU_PIGMENT_MS = 650;
  function watercolorDwellWater(dwellMs) {
    return 1 - Math.exp(-Math.max(dwellMs, 0) / WC_DWELL_TAU_WATER_MS);
  }
  function watercolorDwellPigment(dwellMs) {
    return 1 - Math.exp(-Math.max(dwellMs, 0) / WC_DWELL_TAU_PIGMENT_MS);
  }
  function watercolorWaterLoad(usedRadii) {
    return WATER_FLOOR + (1 - WATER_FLOOR) * Math.exp(-usedRadii / WATER_RUN_RADII);
  }
  function watercolorBrushRunsDry(pigment) {
    return pigment > 0;
  }
  function watercolorFerrulePx(minorPx, aspectRatio, pressure, presetName) {
    const long = minorPx * Math.max(aspectRatio, 1);
    if (watercolorNibFromPreset(presetName) === "chisel") return long;
    const response = watercolorResponseFromPreset(presetName);
    const shrunkBy = watercolorWidth(Math.max(pressure, WATERCOLOR_MIN_PRESSURE), response) * WATERCOLOR_HEAD_TAPER.startScale;
    return Math.min(long / Math.max(shrunkBy, 0.05), long * 3);
  }
  function watercolorPigmentLoad(usedRadii, water = 0) {
    return Math.exp(-usedRadii / watercolorPigmentRun(water));
  }
  function watercolorPigmentRun(water) {
    return PIGMENT_RUN_DRY_RADII + (PIGMENT_RUN_WET_RADII - PIGMENT_RUN_DRY_RADII) * clamp013(water);
  }
  function watercolorPigmentRate(water) {
    return WATERCOLOR_PIGMENT_GAIN * (1 - WATERCOLOR_WET_RATE_DROP * clamp013(water));
  }
  var WATERCOLOR_PIGMENT_GAIN = 2.4;
  var WATERCOLOR_WET_RATE_DROP = 0.5;
  var WC_STANDING_GATE_LO = WATER_FLOOR;
  var WC_STANDING_GATE_HI = 0.35;
  function watercolorStandingGate(load) {
    const t = clamp013((load - WC_STANDING_GATE_LO) / (WC_STANDING_GATE_HI - WC_STANDING_GATE_LO));
    return t * t * (3 - 2 * t);
  }
  function watercolorStandingWater(mixWater, retain, paperWet, load) {
    const w = clamp013(paperWet);
    return mixWater * (retain + (1 - retain) * w) * watercolorStandingGate(load);
  }
  var WATERCOLOR_HALO_GROWTH = 0.9;
  var WATERCOLOR_HALO_SHED = 0;
  var WATERCOLOR_HALO_DRAWN = WATERCOLOR_HALO_SHED > 0;
  var WATERCOLOR_HALO_DRY = 0.45;
  function watercolorHalo(paperWet, brushWater) {
    const wet = clamp013(paperWet) * (WATERCOLOR_HALO_DRY + (1 - WATERCOLOR_HALO_DRY) * clamp013(brushWater));
    return { scale: 1 + WATERCOLOR_HALO_GROWTH * wet, shed: WATERCOLOR_HALO_SHED * wet, wet };
  }
  var WATERCOLOR_HALO_PAST_BLOOM = 3;
  var WATERCOLOR_PICKUP_RADII = 2.6;
  function watercolorWaterClock(usedRadii, stepRadii, paperWet) {
    const drunk = WATERCOLOR_PICKUP_RADII * clamp013(paperWet) * stepRadii;
    return Math.max(0, usedRadii + stepRadii - drunk);
  }
  function watercolorTravelRadius(semiMajor, semiMinor, nibAngle, travelAngle) {
    const a = Math.max(semiMajor, 0.01);
    const b = Math.max(semiMinor, 0.01);
    if (travelAngle === null) return Math.sqrt(a * b);
    const psi = nibAngle - travelAngle;
    return a * b / Math.hypot(a * Math.sin(psi), b * Math.cos(psi));
  }
  function watercolorSpreadRadius(semiMajor, semiMinor) {
    return Math.sqrt(Math.max(semiMajor, 0.01) * Math.max(semiMinor, 0.01));
  }
  function watercolorWaterStep(segmentLengthPx, radiusPx) {
    return segmentLengthPx / Math.max(radiusPx, 0.5);
  }

  // apps/web/src/engine/src/watercolor/solventSource.ts
  function advanceSolventSource(clock, profile, segmentLength, radius, recordedWet, segmentMode, policy) {
    let waterUsed = clock.waterUsed, pigmentUsed = clock.pigmentUsed;
    if (profile.waterDepletion) {
      const step = watercolorWaterStep(segmentLength, radius);
      pigmentUsed += step;
      waterUsed = watercolorWaterClock(waterUsed, step, recordedWet);
    }
    const spendsWater = segmentMode && policy !== "legacy" ? policy === "finite" : watercolorBrushRunsDry(profile.pigmentStrength);
    const load = profile.waterDepletion && spendsWater ? watercolorWaterLoad(waterUsed) : 1;
    return { waterUsed, pigmentUsed, load, water: profile.waterDepletion ? profile.waterLevel * load : 1 };
  }

  // apps/web/src/engine/src/dabs/markerRibbon.ts
  var FLOATS_PER_VERTEX = 11;
  function nibGeometry(dab, sizeMultiplier, shape = "ellipse", cornerFraction = 0) {
    const semiMinor = dab.size * 0.5 * sizeMultiplier;
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
    return Math.max(pressure, 0.06 * (1 - t * t * (3 - 2 * t)));
  }
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
      if (value < 1e-9) return { x: 0, y: 0, value: 0 };
      px = a * a * ux / value;
      py = b * b * uy / value;
    }
    return { x: px * c - py * s, y: px * s + py * c, value };
  }
  function nibArea(nib) {
    const { semiMajor: a, semiMinor: b } = nib;
    if (nib.shape === "roundedBox") {
      const r = Math.min(nib.cornerRadius, a, b);
      return 4 * a * b - (4 - Math.PI) * r * r;
    }
    return Math.PI * a * b;
  }
  function nibMeanChord(nib, tx, ty) {
    const width = 2 * nibSupport(nib, -ty, tx).value;
    return width > 1e-6 ? nibArea(nib) / width : 0;
  }
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
  var MARKER_POSE_STEP_PX = 1;
  var MARKER_MAX_SUBSTEPS = 12;
  function poseSubdivisions(g0, g1) {
    const reach = Math.max(g0.semiMajor, g1.semiMajor);
    const turn = Math.abs(lerpAngle(g0.angle, g1.angle, 1) - g0.angle) * reach;
    const grow = Math.abs(g1.semiMajor - g0.semiMajor) + Math.abs(g1.semiMinor - g0.semiMinor);
    const drift = turn + grow;
    if (drift <= MARKER_POSE_STEP_PX) return 1;
    return Math.min(MARKER_MAX_SUBSTEPS, Math.ceil(drift / MARKER_POSE_STEP_PX));
  }
  function outlinePoints(nib, inset, segments) {
    const a = Math.max(nib.semiMajor - inset, 1e-3);
    const b = Math.max(nib.semiMinor - inset, 1e-3);
    const c = Math.cos(nib.angle), s = Math.sin(nib.angle);
    const pts = [];
    for (let i = 0; i < segments; i++) {
      const phi = i / segments * Math.PI * 2;
      let lx, ly;
      if (nib.shape === "roundedBox") {
        const r = Math.min(Math.max(nib.cornerRadius - inset, 0), a, b);
        const ux = Math.cos(phi), uy = Math.sin(phi);
        const m = Math.max(Math.abs(ux) / (a - r || 1e-3), Math.abs(uy) / (b - r || 1e-3));
        lx = ux / m + r * ux;
        ly = uy / m + r * uy;
      } else {
        lx = a * Math.cos(phi);
        ly = b * Math.sin(phi);
      }
      pts.push({ x: lx * c - ly * s, y: lx * s + ly * c });
    }
    return pts;
  }
  var OUTLINE_SEGMENTS = 16;
  function buildRibbonBands(dabs, sizeMultiplier, prevDab, shape = "ellipse", cornerFraction = 0, aaPx = 1, inkFor, fillEveryPose = false) {
    const chain = prevDab ? [prevDab, ...dabs] : dabs;
    if (chain.length < 2) return new Float32Array(0);
    let out = new Float32Array(Math.max(1, chain.length - 1) * (12 + (fillEveryPose ? OUTLINE_SEGMENTS * 9 : 0)) * FLOATS_PER_VERTEX);
    let written = 0;
    const reserve = (required) => {
      if (required <= out.length) return;
      const grown = new Float32Array(Math.max(required, out.length * 2));
      grown.set(out);
      out = grown;
    };
    let ink = 0;
    let inkWater = 0;
    let inkWet = 0;
    let inkStrength = 0;
    let pressure = 1;
    let endPressure = 1;
    let pigmentPool = 0.5;
    let puddle = 1;
    const push = (x, y, edge, across, press = pressure) => {
      out[written] = x;
      out[written + 1] = y;
      out[written + 2] = edge;
      out[written + 3] = ink;
      out[written + 4] = inkWater;
      out[written + 5] = across;
      out[written + 6] = inkWet;
      out[written + 7] = inkStrength;
      out[written + 8] = puddle;
      out[written + 9] = press;
      out[written + 10] = pigmentPool;
      written += FLOATS_PER_VERTEX;
    };
    const quad = (m0, e0, t0, m1, e1, t1, side) => {
      push(m0.x, m0.y, e0, 0);
      push(t0.x, t0.y, 0, side);
      push(t1.x, t1.y, 0, side, endPressure);
      push(m0.x, m0.y, e0, 0);
      push(t1.x, t1.y, 0, side, endPressure);
      push(m1.x, m1.y, e1, 0, endPressure);
    };
    const body = (centre, nib, nx, ny) => {
      const inset = Math.min(aaPx, nib.semiMinor * 0.5);
      const rim = outlinePoints(nib, 0, OUTLINE_SEGMENTS);
      const core = outlinePoints(nib, inset, OUTLINE_SEGMENTS);
      const reach = Math.max(nibSupport(nib, nx, ny).value, 1e-3);
      const across = (p) => Math.max(-1, Math.min(1, (p.x * nx + p.y * ny) / reach));
      for (let i = 0; i < OUTLINE_SEGMENTS; i++) {
        const j = (i + 1) % OUTLINE_SEGMENTS;
        const r0 = { x: centre.x + rim[i].x, y: centre.y + rim[i].y };
        const r1 = { x: centre.x + rim[j].x, y: centre.y + rim[j].y };
        const c0 = { x: centre.x + core[i].x, y: centre.y + core[i].y };
        const c1 = { x: centre.x + core[j].x, y: centre.y + core[j].y };
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
        pigmentPool = got.pigmentPool ?? 0.5;
      } else {
        ink = d1.opacity * travel * 0.5;
        inkWater = 0;
        inkWet = 0;
        inkStrength = 0;
        puddle = 1;
        pigmentPool = 0.5;
      }
      const steps = poseSubdivisions(
        nibGeometry(d0, sizeMultiplier, shape, cornerFraction),
        nibGeometry(d1, sizeMultiplier, shape, cornerFraction)
      );
      reserve(written + (steps * 12 + (fillEveryPose ? steps : Math.max(0, steps - 1)) * OUTLINE_SEGMENTS * 9) * FLOATS_PER_VERTEX);
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
        const ca = { x: a.x, y: a.y }, cb = { x: b.x, y: b.y };
        quad(ca, la.value, { x: a.x + la.x, y: a.y + la.y }, cb, lb.value, { x: b.x + lb.x, y: b.y + lb.y }, 1);
        quad(ca, ra.value, { x: a.x + ra.x, y: a.y + ra.y }, cb, rb.value, { x: b.x + rb.x, y: b.y + rb.y }, -1);
        if (k > 0 || fillEveryPose) body(ca, ga, nx, ny);
      }
    }
    return written === out.length ? out : out.slice(0, written);
  }

  // apps/web/src/engine/src/dabs/markerInkGain.ts
  var MARKER_INK_REF_CHORD_PX = 4.5;
  function markerThinNibInkGain(nib, dx, dy, refChordPx) {
    if (refChordPx <= 0) return 1;
    const len = Math.hypot(dx, dy);
    if (len <= 1e-6) return 1;
    const chord = nibMeanChord(nib, dx / len, dy / len);
    if (chord <= 1e-6) return 1;
    return Math.max(1, refChordPx / chord);
  }

  // apps/web/src/engine/src/dabs/ribbonProfile.ts
  var MARKER_EDGE_AA_PX = 1;
  var MARKER_CURVATURE_TOLERANCE_PX = 0.15;
  var MARKER_CHISEL_CORNER_FRACTION = 0.28;
  var MARKER_INK_EDGE_FALLOFF = 0.9;
  var MARKER_BULLET_RIBBON = {
    // #547 — the three tools that predate the digital brush all draw the ribbon's
    // bands and its hard nib stamp, which is what "ribbon" meant before there was
    // anything else through this machinery.
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
    // #468 — watercolor's three terms, off. The marker's own branch never reads
    // them; they are set explicitly rather than left optional so that adding a
    // fourth ribbon tool has to make a decision about each one instead of
    // inheriting an accident.
    wetEdge: 0,
    wetEdgeRadiusPx: 0,
    granulation: 0,
    spreadPx: 0,
    cloud: 0,
    // #468 v3 — the legacy deposit scale, and permanently so: this tool's strokes
    // are in production rooms and its saturation constants were calibrated
    // against it. See RibbonProfile.normalizeDeposit.
    normalizeDeposit: false,
    // #559 — except where that scale never reached the film's knee at all: a nib
    // thinner than this along the travel gets its deposit raised to what this
    // chord lays. Bit-identical above it.
    thinNibInkRefPx: MARKER_INK_REF_CHORD_PX,
    depositPerRadius: 0,
    stampInkShare: 0,
    waterDepletion: false,
    // #468 v4 — the brush model's own four. Off, and the tools they belong to
    // have no use for them: a marker tip and a pen nib carry ink from a
    // reservoir, not a finite load of water with paint in it.
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
  var WATERCOLOR_SPREAD_CAP_PX = 3;
  var WATERCOLOR_BRISTLE_BUNDLE_PX = 3.5;
  var WATERCOLOR_SPREAD_MIN_PX = 2.5;
  var WATERCOLOR_MIGRATE_MAX_PX = 20;
  var WATERCOLOR_MIGRATE_MIN_PX = 3;
  var WATERCOLOR_MIGRATION = {
    maxPx: WATERCOLOR_MIGRATE_MAX_PX,
    minPx: WATERCOLOR_MIGRATE_MIN_PX
  };
  var WATERCOLOR_SPREAD = {
    cap: WATERCOLOR_SPREAD_CAP_PX,
    min: WATERCOLOR_SPREAD_MIN_PX
  };

  // apps/web/src/engine/src/dabs/ribbonStrokeMath.ts
  var EMPTY_BANDS = new Float32Array(0);
  function ribbonBristleCombs(profile, bristleRadiusPx) {
    return profile.bristleCombs > 0 ? Math.max(1.5, Math.min(50, bristleRadiusPx / WATERCOLOR_BRISTLE_BUNDLE_PX)) : 0;
  }
  function ribbonWaterDelivery(profile) {
    if (!profile.normalizeDeposit) return { water: 0, retain: 0 };
    return { water: profile.waterLevel, retain: 1 };
  }

  // apps/web/src/engine/src/dabs/ribbonDelivery.ts
  function createRibbonDeliveryState() {
    return {
      lastKept: void 0,
      wetContacts: [],
      waterUsed: 0,
      pigmentUsed: 0,
      standing: /* @__PURE__ */ new Map(),
      landing: null,
      dwellDone: false,
      dwellMs: 0,
      trail: [],
      speed: 0,
      speedPeak: 0,
      speedAt: -1,
      speedTravel: 0,
      brakePigment: 0,
      surplusPigment: 0,
      surplusWater: 0,
      surplusAt: 0,
      turnOffset: [0, 0],
      turnDirection: null,
      brushTravel: [],
      advanceWater(water, pigment) {
        this.waterUsed = water;
        this.pigmentUsed = pigment;
      }
    };
  }
  function prepareRibbonDelivery(drawable, prevDab, preset, profile, scratch, wetOf, landedWet, segmentMode, segmented, film, context, options) {
    const { nibShape, cornerFraction } = profile;
    const deposits = [];
    const waterByDab = /* @__PURE__ */ new Map();
    const pigmentByDab = /* @__PURE__ */ new Map();
    const delivery = ribbonWaterDelivery(profile);
    if (!segmentMode || !segmented) scratch.standing.clear();
    const acrossByDab = /* @__PURE__ */ new Map();
    const movingByDab = /* @__PURE__ */ new Set();
    const paperWetByDab = /* @__PURE__ */ new Map();
    const pigmentPoolByDab = /* @__PURE__ */ new Map();
    const excessByDab = /* @__PURE__ */ new Map();
    const puddleByDab = /* @__PURE__ */ new Map();
    const thinNibGain = (dab, fromX, fromY) => profile.thinNibInkRefPx > 0 ? markerThinNibInkGain(
      nibGeometry(dab, preset.sizeMultiplier, nibShape, cornerFraction),
      dab.x - fromX,
      dab.y - fromY,
      profile.thinNibInkRefPx
    ) : 1;
    {
      let prev = prevDab;
      let used = scratch.waterUsed;
      let pigUsed = scratch.pigmentUsed;
      for (const dab of drawable) {
        const wetHere = wetOf(dab);
        paperWetByDab.set(dab, wetHere);
        const minor = dab.size * 0.5 * preset.sizeMultiplier;
        if (!scratch.landing) scratch.landing = { x: dab.x, y: dab.y, r: minor * Math.max(dab.aspectRatio, 1), t: dab.t };
        else if (!scratch.dwellDone) {
          const L = scratch.landing;
          if (Math.hypot(dab.x - L.x, dab.y - L.y) <= WC_DWELL_RADIUS * L.r) scratch.dwellMs = Math.max(scratch.dwellMs, dab.t - L.t);
          else scratch.dwellDone = true;
        }
        const dx = prev ? dab.x - prev.x : 0;
        const dy = prev ? dab.y - prev.y : 0;
        const travelAngle = Math.hypot(dx, dy) > 0.01 ? Math.atan2(dy, dx) : null;
        const radius = Math.max(watercolorTravelRadius(
          minor * Math.max(dab.aspectRatio, 1),
          minor,
          dab.angle,
          travelAngle
        ), 0.5);
        if (Math.hypot(dx, dy) > 0.2 * minor) movingByDab.add(dab);
        if (travelAngle !== null) {
          const la = travelAngle + Math.PI / 2 - dab.angle;
          acrossByDab.set(dab, [Math.cos(la), Math.sin(la)]);
        }
        const seg = context.markerSegmentLength(dab, prev, radius);
        const source = advanceSolventSource(
          { waterUsed: used, pigmentUsed: pigUsed },
          profile,
          seg,
          radius,
          wetHere,
          !!segmentMode,
          options.diagnosticWaterPolicy
        );
        used = source.waterUsed;
        pigUsed = source.pigmentUsed;
        const { load, water } = source;
        const availableHere = segmentMode && options.diagnosticSharedFluid ? Math.max(wetHere, watercolorStandingWater(delivery.water, delivery.retain, wetHere, load)) : wetHere;
        if (segmentMode) paperWetByDab.set(dab, availableHere);
        const pigmentLeft = profile.waterDepletion ? watercolorPigmentLoad(pigUsed, profile.waterLevel) * watercolorPigmentRate(profile.waterLevel) * watercolorWetPull(availableHere) : 1;
        const tau = Math.max(0, watercolorTrailDwell(scratch.trail, dab.x, dab.y, dab.t, WC_DWELL_RADIUS * minor * Math.max(dab.aspectRatio, 1)) - WC_DWELL_FLOOR_MS);
        const gateHere = 1 - Math.min(Math.max(wetHere, 0), 1);
        const pigmentGate = 0.45 + 0.55 * (1 - Math.min(Math.max(availableHere, 0), 1));
        const last = scratch.trail.length ? scratch.trail[scratch.trail.length - 1] : null;
        let slow = 0;
        let speedElapsed = 0;
        if (scratch.speedAt < 0) scratch.speedAt = dab.t;
        if (last) {
          scratch.speedTravel += Math.hypot(dab.x - last.x, dab.y - last.y);
          const dt = dab.t - scratch.speedAt;
          if (dt > 0) {
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
        scratch.surplusPigment = watercolorSurplus(scratch.surplusPigment, spent, watercolorDwellPigment(tau) * pigmentGate, WATERCOLOR_START_EXCESS_RADII);
        scratch.surplusWater = watercolorSurplus(scratch.surplusWater, spent, watercolorDwellWater(tau) * gateHere, WC_PUDDLE_RADII);
        scratch.brakePigment = watercolorBrakeSurplus(scratch.brakePigment, spent, WC_SLOW_GAIN * slow * pigmentGate, speedElapsed);
        scratch.turnOffset[0] += dx;
        scratch.turnOffset[1] += dy;
        if (Math.hypot(...scratch.turnOffset) >= Math.max(1.5, minor * 0.12)) {
          const direction = scratch.turnOffset;
          const priorTurnDirection = scratch.turnDirection;
          if (priorTurnDirection && Math.hypot(priorTurnDirection[0], priorTurnDirection[1]) > 0.01) {
            const turnAngle = Math.abs(Math.atan2(priorTurnDirection[0] * direction[1] - priorTurnDirection[1] * direction[0], priorTurnDirection[0] * direction[0] + priorTurnDirection[1] * direction[1]));
            const normalizedChord = Math.hypot(direction[0], direction[1]) / Math.max(minor, 0.5);
            const angularPigmentImpulse = Math.max(turnAngle - 1 * normalizedChord, 0) / Math.PI;
            scratch.brakePigment = Math.min(0.6, scratch.brakePigment + 0.3 * angularPigmentImpulse * pigmentGate);
          }
          scratch.turnDirection = [...direction];
          scratch.turnOffset = [0, 0];
        }
        scratch.surplusAt = pigUsed;
        scratch.trail.push({ x: dab.x, y: dab.y, t: dab.t });
        if (scratch.trail.length > WC_TRAIL_LEN) scratch.trail.shift();
        const landingWet = segmentMode && options.diagnosticLandingReservoir ? options.diagnosticLandingPolicy === "fluid" ? Math.max(landedWet, watercolorStandingWater(delivery.water, delivery.retain, landedWet, 1)) : 0 : landedWet;
        const excess = profile.waterDepletion ? watercolorExcessFromSurplus(pigUsed, landingWet, Math.max(scratch.surplusPigment, scratch.brakePigment)) : 1;
        excessByDab.set(dab, excess);
        const landingPool = (1 - Math.min(Math.max(landedWet, 0), 1)) * Math.exp(-pigUsed / WATERCOLOR_START_EXCESS_RADII);
        pigmentPoolByDab.set(dab, Math.max(0, excess - 1) / Math.max(excess, 1));
        const waterPool = Math.max(scratch.surplusWater, landingPool);
        puddleByDab.set(dab, profile.waterDepletion ? watercolorPuddleFromSurplus(waterPool, wetHere) : watercolorPuddleDepth(pigUsed, landedWet, wetHere, scratch.dwellMs));
        if (profile.waterDepletion) context.dabPool().set(dab, Math.min(waterPool, 1));
        if (profile.normalizeDeposit && Math.hypot(dx, dy) > 0.01 && profile.waterLevel > 0) scratch.brushTravel.push({
          x: dab.x,
          y: dab.y,
          radius: minor,
          aspect: Math.max(1, dab.aspectRatio),
          angle: dab.angle,
          dx,
          dy,
          water: profile.waterLevel,
          ...options.diagnosticCanonicalSettleRadius ? { settleRadius: canonicalMinorRadius(dab.size, preset.sizeMultiplier) } : {}
        });
        waterByDab.set(dab, water);
        pigmentByDab.set(dab, pigmentLeft);
        if (profile.normalizeDeposit) scratch.standing.set(dab, watercolorStandingWater(delivery.water, delivery.retain, wetHere, load));
        const stampShare = profile.stampInkShare > 0 ? profile.stampInkShare * 2 : 1;
        deposits.push(profile.normalizeDeposit ? film ? profile.depositPerRadius * 0.5 * WC_FILM_DOSE * pigmentLeft * excess : profile.depositPerRadius * 0.5 * (seg / radius) * 0.5 * stampShare * pigmentLeft * excess : dab.opacity * seg * 0.5 * thinNibGain(dab, prev?.x ?? dab.x, prev?.y ?? dab.y));
        prev = dab;
      }
      scratch.advanceWater(used, pigUsed);
    }
    return {
      deposits,
      waterByDab,
      pigmentByDab,
      acrossByDab,
      movingByDab,
      paperWetByDab,
      pigmentPoolByDab,
      excessByDab,
      puddleByDab,
      thinNibGain
    };
  }

  // ../680-water-wet-tone/packages/shared/dist/paper.js
  var PAPER_COARSENESS = ["coarse", "medium", "fine"];
  var PAPER_GRAIN_TYPES = PAPER_COARSENESS;
  var PAPER_TYPES = [...PAPER_GRAIN_TYPES, "flat"];
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
  var DEFAULT_PAPER_COLORS = Object.fromEntries(PAPER_TYPES.map((t) => [t, defaultPaperColor(t)]));

  // ../680-water-wet-tone/packages/shared/dist/dabCodec.js
  var FIELDS = [
    "x",
    "y",
    "pressure",
    "tiltX",
    "tiltY",
    "size",
    "aspectRatio",
    "angle",
    "opacity",
    "t"
  ];
  var FLOATS_PER_DAB = FIELDS.length;
  var BYTES_PER_DAB = FLOATS_PER_DAB * 4;

  // ../680-water-wet-tone/packages/shared/dist/admin.js
  var IP_BAN_DURATIONS_HOURS = [1, 24, 24 * 7, 24 * 30];

  // apps/web/src/engine/src/paper/paperWetness.ts
  var HEX = "0123456789abcdef";
  function dequantizeWet(ch) {
    const i = HEX.indexOf(ch);
    return i < 0 ? 0 : i / 15;
  }
  function wetAt(profile, dabIndex) {
    if (!profile) return 0;
    return dabIndex < profile.length ? dequantizeWet(profile[dabIndex]) : 0;
  }

  // apps/web/src/engine/src/dabs/ribbonDrawable.ts
  function prepareDrawableRibbonDabs(dabs, prevDab, preset, profile, state, wetProfile) {
    const floorPx = profile.minHalfWidthPx;
    const wetIndex = /* @__PURE__ */ new Map();
    let drawable = floorPx === null ? dabs.filter((d, i) => {
      wetIndex.set(d, i);
      return d.size * 0.5 * preset.sizeMultiplier >= 0.5;
    }) : dabs.map((d, i) => {
      const half = d.size * 0.5 * preset.sizeMultiplier;
      const out = half >= floorPx ? d : { ...d, size: floorPx * 2 / preset.sizeMultiplier };
      wetIndex.set(out, i);
      return out;
    });
    const wetOf = (d) => wetAt(wetProfile, wetIndex.get(d) ?? -1);
    if (profile.normalizeDeposit && state) {
      if (state.lastKept) prevDab = state.lastKept;
      const kept = [];
      let anchor = prevDab;
      for (const d of drawable) {
        const q = watercolorTravelQuantum(d.size * 0.5 * preset.sizeMultiplier);
        if (!anchor || Math.hypot(d.x - anchor.x, d.y - anchor.y) >= q) {
          kept.push(d);
          anchor = d;
        }
      }
      if (kept.length) state.lastKept = kept[kept.length - 1];
      drawable = kept;
    }
    return { drawable, previous: prevDab, wetIndex, wetOf };
  }
  function noteRibbonWetContacts(state, drawable, preset, wetOf) {
    for (const d of drawable) if (wetOf(d) >= 0.3) state.wetContacts.push({
      x: d.x,
      y: d.y,
      radius: d.size * 0.5 * preset.sizeMultiplier,
      aspect: Math.max(1, d.aspectRatio),
      angle: d.angle
    });
  }
  function ribbonSegmentLength(dab, prevDab, radius) {
    const MARKER_FIRST_DAB_DISTANCE_FACTOR = 0.5;
    const MARKER_DWELL_CREEP_DISTANCE_FACTOR = 0.12;
    if (!prevDab) return radius * MARKER_FIRST_DAB_DISTANCE_FACTOR;
    const dist = Math.hypot(dab.x - prevDab.x, dab.y - prevDab.y);
    return dist > 0.01 ? dist : radius * MARKER_DWELL_CREEP_DISTANCE_FACTOR;
  }

  // apps/web/src/engine/src/dabs/canonicalRibbonBands.ts
  function prepareCanonicalRibbonBands(input) {
    const { dabs, previous, sizeMultiplier, profile, film, segmented, solventField, delivery, wetOf } = input;
    if (!profile.normalizeDeposit) throw new Error("Canonical watercolour preparation requires production normalized profile");
    const inkStrength = profile.pigmentStrength;
    const inkFor = (d0, d1, travel) => {
      const minor = d1.size * 0.5 * sizeMultiplier;
      const bdx = d1.x - d0.x;
      const bdy = d1.y - d0.y;
      const bandAngle = Math.hypot(bdx, bdy) > 0.01 ? Math.atan2(bdy, bdx) : null;
      const radius = Math.max(watercolorTravelRadius(
        minor * Math.max(d1.aspectRatio, 1),
        minor,
        d1.angle,
        bandAngle
      ), 0.5);
      return {
        ink: (film ? profile.depositPerRadius * 0.5 * WC_FILM_DOSE * 2 : profile.depositPerRadius * 0.5 * (travel / radius) * 0.5 * ((1 - profile.stampInkShare) * 2)) * (delivery.pigment.get(d1) ?? 1) * (delivery.excess.get(d1) ?? 1) * (1 - (delivery.haloShed.get(d1) ?? 0)),
        water: delivery.water.get(d1) ?? 0,
        paperWet: delivery.paperWet.get(d1) ?? 0,
        strength: Math.hypot(bdx, bdy) > 0.2 * minor ? inkStrength : -inkStrength,
        puddle: delivery.puddle.get(d1) ?? 1,
        pigmentPool: delivery.pigmentPool.get(d1) ?? 0.5
      };
    };
    const build = (material) => profile.stampsOnly ? new Float32Array(0) : buildRibbonBands(
      dabs,
      sizeMultiplier,
      previous,
      profile.nibShape,
      profile.cornerFraction,
      profile.aaPx,
      material,
      film
    );
    const bands = build(inkFor);
    const waterBands = segmented ? build((d0, d1, travel) => ({ ...inkFor(d0, d1, travel), paperWet: wetOf(d1) })) : bands;
    const solventBands = segmented && solventField ? build((_d0, d1) => ({
      ink: (delivery.water.get(d1) ?? 0) / 4,
      water: 1,
      paperWet: 0,
      strength: 0,
      puddle: 0,
      pigmentPool: 0
    })) : new Float32Array(0);
    return { bands, waterBands, solventBands, inkFor };
  }

  // apps/web/src/engine/src/dabs/ribbonGestureScalars.ts
  function prepareRibbonGestureScalars(first, preset, profile, presetName) {
    const firstMinor = first.size * 0.5 * preset.sizeMultiplier;
    const firstRadius = Math.max(
      watercolorSpreadRadius(firstMinor * Math.max(first.aspectRatio, 1), firstMinor),
      0.5
    );
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
      spreadPx: profile.spreadPx > 0 && profile.spreadOfRadius > 0 ? Math.min(
        profile.spreadPx,
        Math.max(WATERCOLOR_SPREAD.min, firstRadius * profile.spreadOfRadius)
      ) : 0,
      inkSmoothPx: 0,
      // resolved separately, see noteDabSpacing
      // (#468 v11) How far one exchange moves pigment. A constant of the
      // gesture for exactly the reason every other scalar here is one: the
      // composite recomputes whole rects, so whichever batch wrote a pixel
      // last would otherwise decide how far its paint had travelled.
      migratePx: profile.migrate > 0 && profile.migrateOfRadius > 0 ? Math.min(
        WATERCOLOR_MIGRATION.maxPx,
        Math.max(WATERCOLOR_MIGRATION.minPx, firstRadius * profile.migrateOfRadius)
      ) : 0,
      // The fallback the composite uses outside the mark, where there is no
      // deposit to read a per-pixel level from. The stroke's starting load,
      // not its current one, for the same no-seams reason.
      water: profile.waterLevel,
      fieldSeed: [first.x, first.y],
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
      bristleRadiusPx: watercolorFerrulePx(
        firstMinor,
        first.aspectRatio,
        first.pressure,
        presetName
      )
    };
  }

  // apps/web/src/engine/src/presets/linerPresets.ts
  var LINER_WICK_PX = 2.5;
  var LINER_WICK_RADIUS_CAP = 0.5;
  function linerWickPx(dabRadiusPx) {
    return Math.min(LINER_WICK_PX, Math.max(dabRadiusPx, 0) * LINER_WICK_RADIUS_CAP);
  }

  // apps/web/src/engine/src/dabs/dabWorldHalfExtents.ts
  function dabWorldHalfExtents(d, erasing, preset, wicking = false) {
    const baseR = d.size * 0.5 * (erasing ? 1 : preset.sizeMultiplier);
    const r = baseR + (wicking ? linerWickPx(baseR) : 0);
    const halfLong = r * Math.max(1, d.aspectRatio);
    const c = Math.abs(Math.cos(d.angle)), s = Math.abs(Math.sin(d.angle));
    return { hx: halfLong * c + r * s, hy: halfLong * s + r * c };
  }
  function ribbonDabTouchesTile(tile, dab, preset) {
    const { hx, hy } = dabWorldHalfExtents(dab, false, preset);
    const m = 2;
    return dab.x + hx + m > tile.originX && dab.x - hx - m < tile.originX + tile.buffer.width && dab.y + hy + m > tile.originY && dab.y - hy - m < tile.originY + tile.buffer.height;
  }

  // apps/web/src/engine/src/watercolor/pigmentOptics.ts
  var PIGMENT_T_MIN = 0.02;
  function pigmentAbsorption(color) {
    return [
      -Math.log(Math.min(1, Math.max(PIGMENT_T_MIN, color[0]))),
      -Math.log(Math.min(1, Math.max(PIGMENT_T_MIN, color[1]))),
      -Math.log(Math.min(1, Math.max(PIGMENT_T_MIN, color[2])))
    ];
  }

  // apps/web/src/engine/src/dabs/ribbonHalo.ts
  function prepareRibbonHalo(drawable, spreadPx, normalizeDeposit, delivery) {
    const { waterByDab, pigmentByDab, pigmentPoolByDab, excessByDab, puddleByDab, paperWetByDab, acrossByDab } = delivery;
    const haloDabs = [];
    const haloDoseByDab = /* @__PURE__ */ new Map();
    const haloShedByDab = /* @__PURE__ */ new Map();
    let anyHalo = false;
    if (normalizeDeposit) {
      for (const dab of drawable) {
        const { scale, shed, wet } = watercolorHalo(paperWetByDab.get(dab) ?? 0, waterByDab.get(dab) ?? 0);
        const grown = { ...dab, size: dab.size * scale + 2 * WATERCOLOR_HALO_PAST_BLOOM * spreadPx * wet };
        haloDabs.push(grown);
        haloDoseByDab.set(grown, shed);
        haloShedByDab.set(dab, shed);
        if (shed > 0) anyHalo = true;
        const across = acrossByDab.get(dab);
        if (across) acrossByDab.set(grown, across);
        waterByDab.set(grown, waterByDab.get(dab) ?? 0);
        pigmentByDab.set(grown, pigmentByDab.get(dab) ?? 1);
        pigmentPoolByDab.set(grown, pigmentPoolByDab.get(dab) ?? 0.5);
        excessByDab.set(grown, excessByDab.get(dab) ?? 1);
        puddleByDab.set(grown, puddleByDab.get(dab) ?? 1);
        paperWetByDab.set(grown, paperWetByDab.get(dab) ?? 0);
      }
    }
    return { haloDabs, haloDoseByDab, haloShedByDab, anyHalo };
  }

  // apps/web/src/engine/src/dabs/canonicalStrokeChunk.ts
  function createCanonicalStrokeChunkState() {
    return { ...createRibbonDeliveryState(), dabPool: /* @__PURE__ */ new WeakMap() };
  }
  function prepareCanonicalStrokeChunk(state, input) {
    const { preset, presetName, tile, options, film } = input;
    if (!input.profile.normalizeDeposit || input.profile.stampFlow || input.profile.brushStamp || input.profile.coverageInkMode !== 6) throw new Error("Canonical chunk requires the production watercolor ribbon profile");
    const segmentMode = input.segmentMode;
    if (segmentMode && input.dabs.length > 1 && !input.segmented) {
      state.standing.clear();
      const drawable2 = [], commands2 = [];
      for (let i = 0; i < input.dabs.length; i++) {
        const part = prepareCanonicalStrokeChunk(state, { ...input, dabs: [input.dabs[i]], previous: i === 0 ? input.previous : state.lastKept, wetProfile: input.wetProfile?.slice(i, i + 1), segmented: true });
        drawable2.push(...part.drawable);
        commands2.push(...part.commands);
      }
      return { drawable: drawable2, commands: commands2 };
    }
    const profile = segmentMode && options.diagnosticSharedFluid ? { ...input.profile, diagnosticReadFluid: true } : input.profile;
    const prepared = prepareDrawableRibbonDabs(input.dabs, input.previous, preset, profile, state, input.wetProfile);
    const { drawable, previous, wetOf } = prepared;
    const commands = [];
    if (!drawable.length) return { drawable, commands };
    const landedWet = state.landedWet ?? wetAt(input.wetProfile, 0);
    noteRibbonWetContacts(state, drawable, preset, wetOf);
    const scalars = state.gestureScalars ??= prepareRibbonGestureScalars(drawable[0], preset, profile, presetName);
    const delivery = prepareRibbonDelivery(drawable, previous, preset, profile, state, wetOf, landedWet, segmentMode, !!input.segmented, film, { markerSegmentLength: ribbonSegmentLength, dabPool: () => state.dabPool }, options);
    if (input.materialEnabled === false) return { drawable, commands };
    const { haloDabs, haloDoseByDab: haloDose, haloShedByDab: haloShed } = prepareRibbonHalo(drawable, scalars.spreadPx, true, delivery);
    const bands = prepareCanonicalRibbonBands({ dabs: drawable, previous, sizeMultiplier: preset.sizeMultiplier, profile, film, segmented: !!segmentMode, solventField: options.diagnosticSolventField, wetOf, delivery: { water: delivery.waterByDab, pigment: delivery.pigmentByDab, excess: delivery.excessByDab, haloShed, paperWet: delivery.paperWetByDab, puddle: delivery.puddleByDab, pigmentPool: delivery.pigmentPoolByDab } });
    const combs = ribbonBristleCombs(profile, scalars.bristleRadiusPx), tau = pigmentAbsorption(input.color), sourceDelivery = ribbonWaterDelivery(profile);
    const inkBlend = film ? "max" : "add", mottle = input.strokeSeed ?? [0, 0];
    const uniforms = (p, seed, depth, poolBlot2, available2, forBands) => ({
      aaPx: p.aaPx,
      washWater: forBands ? 0 : sourceDelivery.water,
      waterRetain: forBands ? 0 : sourceDelivery.retain,
      bristleCombs: combs,
      bristleInk: p.bristleInk,
      tau: depth ?? [0, 0, 0],
      worldOrigin: [tile.originX, -tile.originY || 0],
      mottleSeed: [seed[0], seed[1]],
      cloudDeposit: p.cloud,
      granDeposit: p.granulation,
      poolBlot: poolBlot2,
      useAvailableWater: available2
    });
    const stamp = (phase, dab, p, opacity, inkWater, paperWet, inkStrength2, across, clip, puddle, poolBlot2, seed, depth) => {
      if (!ribbonDabTouchesTile(tile, dab, preset)) return;
      const radius = dab.size * 0.5 * preset.sizeMultiplier;
      commands.push({ kind: "stamp", phase, inkMode: phase === "coverage" ? 6 : 7, stamp: { center: [dab.x - tile.originX, dab.y - tile.originY], radius, aspect: dab.aspectRatio, angle: dab.angle, pressure: dab.pressure, opacity, nibShape: p.nibShape, cornerRadius: radius * p.cornerFraction, inkEdge: p.inkEdgeFalloff, inkWater, paperWet, inkStrength: inkStrength2, puddle, pigmentPool: puddle, acrossLocal: [across[0], across[1]], inkClip: clip ? p.diagnosticReadFluid ? 2 : 1 : 0, inkBlend, uniforms: uniforms(p, seed, depth, poolBlot2, clip && !!p.diagnosticReadFluid, false) } });
    };
    const ribbon = (phase, vertices, p, seed, depth, poolBlot2, available2, coverage = false) => {
      if (!vertices.length) return;
      const u = uniforms(p, seed, depth, poolBlot2, available2, true);
      if (coverage) {
        u.washWater = sourceDelivery.water;
        u.waterRetain = sourceDelivery.retain;
      }
      commands.push({ kind: "ribbon", phase, batch: { vertices, inkBlend, uniforms: u } });
    };
    const coverageProfile = { ...profile, cloud: 0, granulation: 0, bristleInk: 0 };
    for (const dab of drawable) stamp("coverage", dab, { ...profile, bristleInk: 0 }, 0, delivery.waterByDab.get(dab) ?? 0, wetOf(dab), 1, delivery.acrossByDab.get(dab) ?? [0, 1], false, delivery.puddleByDab.get(dab) ?? 1, profile.waterDepletion && delivery.movingByDab.has(dab) ? 1 : 0, [0, 0], null);
    ribbon("coverage", bands.waterBands, coverageProfile, [0, 0], null, profile.waterDepletion ? 1 : 0, false, true);
    if (segmentMode && options.diagnosticSolventField) {
      const solventProfile = { ...profile, diagnosticReadFluid: false, inkEdgeFalloff: 1, cloud: 0, granulation: 0, bristleInk: 0 };
      for (const dab of drawable) stamp("solvent", dab, solventProfile, (delivery.waterByDab.get(dab) ?? 0) / 4, 1, 0, 0, delivery.acrossByDab.get(dab) ?? [0, 1], true, 0, 0, mottle, null);
      ribbon("solvent", bands.solventBands, solventProfile, mottle, null, 0, false);
    }
    const inkStrength = profile.pigmentStrength, poolBlot = profile.waterDepletion ? 1 : 0, available = !!segmentMode && options.diagnosticSharedFluid;
    if (!input.waterOnly && (input.hasInk ?? profile.ink) && (!segmentMode || !options.diagnosticPigmentRecord || inkStrength > 0)) {
      for (const phase of ["pigment", "color"]) {
        if (phase === "color" && input.hasColor === false) continue;
        for (let i = 0; i < drawable.length; i++) {
          const dab = drawable[i];
          stamp(phase, dab, profile, delivery.deposits[i] * (1 - (haloShed.get(dab) ?? 0)), delivery.waterByDab.get(dab) ?? 0, delivery.paperWetByDab.get(dab) ?? 0, inkStrength, delivery.acrossByDab.get(dab) ?? [0, 1], available, delivery.pigmentPoolByDab.get(dab) ?? (phase === "pigment" ? 0.5 : 0), poolBlot, mottle, phase === "color" ? tau : null);
        }
        ribbon(phase, bands.bands, profile, mottle, phase === "color" ? tau : null, poolBlot, available);
      }
    }
    if (!input.waterOnly && (input.hasInk ?? profile.ink)) for (let i = 0; i < haloDabs.length; i++) {
      const dab = haloDabs[i], dose = haloDose.get(dab) ?? 0;
      if (dose > 0) stamp("halo", dab, { ...profile, inkEdgeFalloff: 1 }, delivery.deposits[i] * dose, delivery.waterByDab.get(dab) ?? 0, delivery.paperWetByDab.get(dab) ?? 0, inkStrength, delivery.acrossByDab.get(dab) ?? [0, 1], true, 1, 0, mottle, null);
    }
    if (!input.waterOnly) state.landedWet = landedWet;
    return { drawable, commands };
  }
})();
/*! Bundled license information:

lodash-es/lodash.js:
  (**
   * @license
   * Lodash (Custom Build) <https://lodash.com/>
   * Build: `lodash modularize exports="es" --repo lodash/lodash#4.18.1 -o ./`
   * Copyright OpenJS Foundation and other contributors <https://openjsf.org/>
   * Released under MIT license <https://lodash.com/license>
   * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
   * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
   *)
*/
