var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// temp/native-source-offline/ribbon44.ts
var import_node_fs = __toESM(require("node:fs"));

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
var DAB_PACK_VERSION = 1;
var LITTLE_ENDIAN = true;
function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++)
    bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function unpackDabs(packed) {
  const separator = packed.indexOf(":");
  const version = separator === -1 ? NaN : Number(packed.slice(0, separator));
  if (version !== DAB_PACK_VERSION) {
    throw new Error(`packed dabs: unknown encoding version ${packed.slice(0, Math.max(separator, 0)) || "(none)"}`);
  }
  const bytes = fromBase64(packed.slice(separator + 1));
  if (bytes.length % BYTES_PER_DAB !== 0) {
    throw new Error(`packed dabs: ${bytes.length} bytes is not a multiple of ${BYTES_PER_DAB}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dabs = [];
  let offset = 0;
  for (let i = 0; i < bytes.length / BYTES_PER_DAB; i++) {
    const dab = {};
    for (const field of FIELDS) {
      dab[field] = view.getFloat32(offset, LITTLE_ENDIAN);
      offset += 4;
    }
    dabs.push(dab);
  }
  return dabs;
}
function strokeDabs(op) {
  if (op.dabs)
    return op.dabs;
  return op.dabsPacked ? unpackDabs(op.dabsPacked) : [];
}

// ../680-water-wet-tone/packages/shared/dist/admin.js
var IP_BAN_DURATIONS_HOURS = [1, 24, 24 * 7, 24 * 30];

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
var Symbol2 = root_default.Symbol;
var Symbol_default = Symbol2;

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
function curveAt(curve, x) {
  const t = clamp_default(x, 0, 1);
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
var DEFAULT_DIGITAL_BRUSH = "medium-round";
var DIGITAL_BRUSH_IDS = DIGITAL_BRUSHES.map((b) => b.id);
var MOD_OPACITY_OFF = "flat";
var MOD_SIZE_OFF = "fixed";
var TOKEN_RE = /^brush:([A-Za-z0-9-]+)@(\d+)((?::[A-Za-z0-9-]+)*)$/;
function tokenModifiers(presetName) {
  const m = presetName ? TOKEN_RE.exec(presetName) : null;
  return m && m[3] ? m[3].slice(1).split(":") : [];
}
function digitalBrushPressureFromPreset(presetName) {
  const mods = tokenModifiers(presetName);
  return { size: !mods.includes(MOD_SIZE_OFF), opacity: !mods.includes(MOD_OPACITY_OFF) };
}
function digitalBrushFlowFromPreset(presetName) {
  return digitalBrushPressureFromPreset(presetName).opacity;
}
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
function digitalBrushFromPreset(presetName) {
  const fallback = DIGITAL_BRUSHES.find((b) => b.id === DEFAULT_DIGITAL_BRUSH) ?? DIGITAL_BRUSHES[0];
  if (!presetName) return fallback;
  const m = TOKEN_RE.exec(presetName);
  if (!m) {
    return DIGITAL_BRUSHES.find((b) => b.id === presetName) ?? fallback;
  }
  const [, id, version] = m;
  return ALL_BRUSHES.find((b) => b.id === id && b.version === Number(version)) ?? DIGITAL_BRUSHES.find((b) => b.id === id) ?? fallback;
}
function digitalBrushFlow(brush, pressure, flowFromPressure = true) {
  const curve = flowFromPressure ? curveAt(brush.flowByPressure, pressure) : 1;
  return clamp_default(brush.flow * curve, 0, 1);
}
function digitalBrushPresetFor(presetName) {
  const brush = digitalBrushFromPreset(presetName);
  return {
    opacity: brush.opacity,
    hardness: brush.tip.hardness,
    sizeMultiplier: 1 / Math.max(brush.tip.aspect, 1)
  };
}
var f32 = new Float32Array(1);
var u32 = new Uint32Array(f32.buffer);

// apps/web/src/engine/src/presets/markerPresets.ts
var MARKER_CHISEL_ANGLE_RADIANS_DEFAULT = Math.PI / 4;
function markerNibFromPreset(presetName) {
  const token = presetName?.split(":")[0];
  return token === "chisel" ? "chisel" : "bullet";
}

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
var CHARCOAL_GRAIN_STREAKY = 3;
var CHARCOAL_PRESETS = {
  // Vine: light grey, barely saturates however long you work it, lifts almost
  // completely. Rides only the very peaks of the tooth (highest `tooth`) and
  // crumbles the most.
  vine: { opacity: 0.32, hardness: 0.26, sizeMultiplier: 1.1, tooth: 3, crumble: 0.9, dust: 0.35, grain: CHARCOAL_GRAIN_STREAKY },
  // Willow: the classic artist's charcoal and the sensible default — the
  // working middle of all six fields.
  willow: { opacity: 0.58, hardness: 0.36, sizeMultiplier: 1.15, tooth: 2.5, crumble: 0.7, dust: 0.3, grain: CHARCOAL_GRAIN_STREAKY },
  // Compressed: near-black in one pass at full pressure, denser and more even
  // than the other two, crisper edge. `hardness` rises with density (the edge
  // of a pressed stick genuinely is sharper) — note the *fluff* comes from
  // `crumble`, not from a low hardness: softening the edge by lowering
  // hardness would dilute charcoal's dense core too, and raggedness is edge
  // noise, not softness.
  compressed: { opacity: 0.88, hardness: 0.46, sizeMultiplier: 1.2, tooth: 1.8, crumble: 0.45, dust: 0.22, grain: CHARCOAL_GRAIN_STREAKY }
};
var TYPE_SET = new Set(CHARCOAL_TYPES);
function isCharcoalType(v) {
  return TYPE_SET.has(v);
}
var DEFAULT_CHARCOAL_TYPE = "willow";
function charcoalPresetFor(presetName) {
  const type = presetName.split(":")[0] ?? "";
  return isCharcoalType(type) ? CHARCOAL_PRESETS[type] : CHARCOAL_PRESETS[DEFAULT_CHARCOAL_TYPE];
}
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
var BRUSH_PEN_PRESET = { opacity: 0.97, hardness: 0.88, sizeMultiplier: 1 };
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
var DEFAULT_WATERCOLOR_PIGMENT = "PB29";
var UNKNOWN_PIGMENT = {
  code: "",
  name: "",
  color: [0.2, 0.32, 0.6],
  granulation: 0.35,
  opacity: 0.06,
  diffusion: 0.5,
  staining: 0.6
};
var BY_CODE = new Map(WATERCOLOR_PIGMENTS.map((p) => [p.code, p]));
function watercolorPigmentByCode(code) {
  const exact = code ? BY_CODE.get(code) : void 0;
  return exact ?? BY_CODE.get(DEFAULT_WATERCOLOR_PIGMENT) ?? UNKNOWN_PIGMENT;
}
function isWatercolorPigmentCode(code) {
  return BY_CODE.has(code);
}
var WATERCOLOR_PIGMENT_CODES = WATERCOLOR_PIGMENTS.map((p) => p.code);
var WATERCOLOR_PIGMENT_SWATCHES = Object.fromEntries(
  WATERCOLOR_PIGMENTS.map((p) => {
    const hex = p.color.map((c2) => Math.round(c2 * 255).toString(16).padStart(2, "0")).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="1.5" y="1.5" width="21" height="21" rx="4" fill="%23${hex}" stroke="rgba(0,0,0,.28)" stroke-width="1"/></svg>`;
    return [p.code, `data:image/svg+xml,${svg}`];
  })
);

// apps/web/src/engine/src/presets/watercolorPresets.ts
function clamp013(v) {
  return clamp_default(v, 0, 1);
}
var WATERCOLOR_PRESET = { opacity: 0.99, hardness: 0.88, sizeMultiplier: 1 };
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
var WATERCOLOR_MIX_DEFAULT = { water: 0.55, pigment: 0.6 };
function mix(a, b, t) {
  return a + (b - a) * clamp013(t);
}
function watercolorWaterEffects(water) {
  return {
    // How far the wash leaves the brush's footprint, as a fraction of the
    // stroke's radius. A dry brush barely leaves it at all — its mark really is
    // the contact patch — while a flood travels visibly further than the hand
    // went, which is the single strongest cue that this is not a marker.
    spreadOfRadius: mix(0.1, 0.42, water),
    // #468 v8, ADR 011 §8 — how softly the boundary resolves. Water's number
    // outright now, not a ceiling that noise picks a value under.
    //
    // That difference is the whole revision. With noise choosing, a mark's edge
    // came out hard here and lost there for no reason the hand could see or
    // repeat — so "leave this edge hard, soften that one", an exercise anyone
    // is set in their first week, was not something the tool could do. Now the
    // setting decides and noise only wobbles it.
    edgeSoft: mix(0.05, 0.4, water),
    // How far the boundary may wander off the brush's own outline, as a
    // fraction of the blur it is thresholded against. Dry paint goes where it
    // is put; a flood finds its own shape.
    //
    // Also water's number rather than a fixed wide range. v2 through v7 spent
    // 0.10..0.62 of the blur on noise regardless of the mix, so even a nearly
    // dry brush produced a boundary that ignored the hand — exactly the
    // complaint that procedural fields, and not the user, were deciding what
    // the mark looked like.
    edgeWander: mix(0.05, 0.42, water),
    // Coarse pooling. More liquid means more room for it to gather unevenly.
    //
    // #468 v9 — down to 0.04..0.19, from 0.16..0.52 in v4-v7. At the old range a
    // damp wash swung +/-22% in tone, which measured as the single largest
    // source of unevenness in a flat wash and is far more than the exercise
    // tolerates. Every reduction here was made against that measurement.
    // This is the material's texture, not its main event: it should be visible
    // when looked for and invisible when the task is "lay an even tone".
    cloud: mix(0.04, 0.19, water),
    // The band the tideline's gating field is thresholded against. A dry mark
    // has almost no perimeter with a rim (there was never a pool to retreat);
    // a wet one has a rim over most of it. Narrow band, high threshold = rare.
    tideLo: mix(0.72, 0.24, water),
    tideHi: mix(0.96, 0.6, water),
    // How strongly the paper's own relief breaks the contact. 0 above about
    // 0.62 water: a loaded brush floods the valleys and touches everything.
    // Below that it rises fast, and by 0.2 the brush is riding the crests.
    // (s17.29) 0.22-0.55, from 0.20-0.62: series 6 - at 0.21 water the
    // photograph's mark is broken over its whole length, at 0.36 it is a
    // film with the tooth breaking through only where the brush ran fast.
    dryContact: 1 - smoothstepJs(0.22, 0.55, water)
  };
}
function watercolorPigmentEffects(pigment) {
  return {
    // How much paint each radius of travel lays down — the quantity that feeds
    // the saturation curve. **A constant, not pigment's number.**
    //
    // Pigment used to drive this, which put a pale wash low on the saturation
    // curve — the steep part, where every fluctuation in the deposit turns into
    // a visible fluctuation in tone. Measured: dropping the deposit to get a
    // usable graded wash pushed a flat wash's unevenness from 4.8% to 8.4%. The
    // two exercises want opposite things from this one number, so it stopped
    // being one number: pigment now reaches the pixel only through `strength`
    // below.
    //
    // (The v9 edit that was supposed to do this failed to write, and the file
    // kept the old line for a revision while the commit message said otherwise
    // — so pigment really was acting twice again, the exact fault v4 removed.
    // Caught by re-reading the constants out of the source rather than
    // trusting the changelog.)
    //
    // Held high enough that an ordinary pass saturates, so the wash's tone is
    // *insensitive* to how the deposit wobbles — which is what a flat wash
    // needs. Depletion still scales it, so a brush running dry still thins;
    // what it no longer does is decide how strong the paint is.
    depositPerRadius: 1.05,
    // Heavy pigment granulates; a dilute wash barely does.
    // (s17.30) 0.10 at full pigment, from 0.26: A/B on Ilya's series 1 and 3
    // (clean replay against the photographs) - the body's mottle was this,
    // not the cloud (cloud off changed nothing, granulation off gave a flat
    // plastic film). The photographs' body is calm with a faint grain; 0.26
    // read as "процедурная пятнистость по всей плёнке" (the design thread).
    granulation: mix(0.03, 0.1, pigment),
    // How much settles at the drying perimeter. There is nothing to leave
    // behind in nearly clear water.
    wetEdge: mix(0.22, 0.72, pigment),
    // How strong the paint is, applied once, at the composite (#468 v9).
    //
    // v4 removed a multiplier here because pigment was *also* driving the
    // deposit, and two routes for one quantity made the control quadratic — the
    // same fault the opacity slider had. The principle is unchanged; what
    // changed is which single route it takes. This one is linear in the setting
    // and independent of where the saturation curve happens to sit, so a graded
    // wash grades evenly instead of doing nothing across the top of the slider
    // and falling off a cliff at the bottom.
    //
    // (#536) The floor is **zero**, down from 0.12, and that is a control being
    // made honest rather than a number being retuned. At 0.12 the bottom of the
    // slider still painted: "no pigment" laid a pale wash, so the one technique
    // the two-axis brush exists to make possible — lay clean water, then take
    // paint into it — could not be expressed at all, because there was no way
    // to put down water alone. Zero pigment now means zero pigment mass, and
    // what the stroke leaves behind is wetness (see the paper-wetness field),
    // which is exactly what clean water leaves on paper.
    strength: mix(0, 1, pigment)
  };
}
function smoothstepJs(edge0, edge1, x) {
  const t = clamp013((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
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
  return { water: clamp013(water / 100), pigment: clamp013(pigment / 100) };
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
  const c2 = Math.cos(angle), s = Math.sin(angle);
  const ux = nx * c2 + ny * s;
  const uy = -nx * s + ny * c2;
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
  return { x: px * c2 - py * s, y: px * s + py * c2, value };
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
  const c2 = Math.cos(nib.angle), s = Math.sin(nib.angle);
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
    pts.push({ x: lx * c2 - ly * s, y: lx * s + ly * c2 });
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
var BRUSH_PEN_EDGE_AA_PX = 1.8;
var BRUSH_PEN_MIN_HALF_WIDTH_PX = 0.5;
var BRUSH_PEN_PAPER_WICK = 0.5;
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
var BRUSH_PEN_RIBBON = {
  // #547 — the three tools that predate the digital brush all draw the ribbon's
  // bands and its hard nib stamp, which is what "ribbon" meant before there was
  // anything else through this machinery.
  stampsOnly: false,
  coverageInkMode: 6,
  stampFlow: null,
  nibShape: "ellipse",
  cornerFraction: 0,
  aaPx: BRUSH_PEN_EDGE_AA_PX,
  // No dye quantity to track: ink is a covering deposit, so coverage alone
  // says everything the composite needs. See RibbonProfile.ink.
  ink: false,
  inkEdgeFalloff: 1,
  compositeInkMode: 8,
  // Same tolerance as the marker's. The term that dominates it is the nib's
  // reach amplifying a turn, and this nib is nearly round (aspect ~1.1) rather
  // than 5:1 — so this is comfortably conservative here rather than tight.
  curvatureTolerancePx: MARKER_CURVATURE_TOLERANCE_PX,
  minHalfWidthPx: BRUSH_PEN_MIN_HALF_WIDTH_PX,
  paperRim: BRUSH_PEN_PAPER_WICK,
  wetEdge: 0,
  wetEdgeRadiusPx: 0,
  granulation: 0,
  spreadPx: 0,
  cloud: 0,
  // #468 v3 — the legacy deposit scale, and permanently so: this tool's strokes
  // are in production rooms and its saturation constants were calibrated
  // against it. See RibbonProfile.normalizeDeposit.
  normalizeDeposit: false,
  // No ink pass at all (see `ink` above), so nothing for #559 to scale.
  thinNibInkRefPx: 0,
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
var WATERCOLOR_EDGE_AA_PX = 3;
var WATERCOLOR_SATURATE_INK = 0.2;
var WATERCOLOR_MIN_HALF_WIDTH_PX = 0.75;
var WATERCOLOR_PAPER_EDGE = 0;
var WATERCOLOR_STAMP_INK_SHARE = 0.82;
var WATERCOLOR_CONE_DEPOSIT_GAIN = 0.205;
var WATERCOLOR_SPREAD_CAP_PX = 3;
var WATERCOLOR_WET_BLOOM = 4;
var WATERCOLOR_BRISTLE_BUNDLE_PX = 3.5;
var WATERCOLOR_SPREAD_MIN_PX = 2.5;
var WATERCOLOR_MIGRATE_OF_RADIUS = 0.55;
var WATERCOLOR_MIGRATE_MAX_PX = 20;
var WATERCOLOR_MIGRATE_MIN_PX = 3;
var WATERCOLOR_MIGRATE_GAIN = 0.75;
var WATERCOLOR_MIGRATE_LO = 0.34;
var WATERCOLOR_MIGRATE_HI = 0.85;
var WATERCOLOR_MIGRATION = {
  maxPx: WATERCOLOR_MIGRATE_MAX_PX,
  minPx: WATERCOLOR_MIGRATE_MIN_PX
};
var WATERCOLOR_SPREAD = {
  cap: WATERCOLOR_SPREAD_CAP_PX,
  min: WATERCOLOR_SPREAD_MIN_PX
};
function watercolorRibbon(presetName, paperWet = 0) {
  const mix2 = watercolorMixFromPreset(presetName);
  const w = watercolorWaterEffects(mix2.water);
  const t = paperWet > mix2.water ? watercolorWaterEffects(paperWet) : w;
  const transportWater = Math.max(mix2.water, paperWet);
  const p = watercolorPigmentEffects(mix2.pigment);
  const paint = watercolorPigmentByCode(watercolorPigmentFromPreset(presetName));
  return {
    stampsOnly: false,
    coverageInkMode: 6,
    stampFlow: null,
    nibShape: "ellipse",
    cornerFraction: 0,
    aaPx: WATERCOLOR_EDGE_AA_PX,
    // Unlike the brush pen, this tool very much does have a per-pixel pigment
    // quantity — how much paint the brush left at each spot is what the wash's
    // density is made of, and it must be separate from the silhouette for the
    // same reason the marker's is (see RibbonProfile.ink).
    ink: true,
    // (#468 v6) A cone, not a cylinder — full dose at the nib's centre falling
    // to nothing at its rim. This is what removes the chain of discs, and the
    // reason is arithmetic rather than aesthetic.
    //
    // A pixel is covered by `2*radius / spacing` stamps, which for this brush is
    // about 4.03 — so as the brush travels, the count alternates between 4 and
    // 5. With a flat dose per stamp that is a 25% step in the accumulated
    // deposit, appearing exactly one dab-spacing apart: measured 163 against
    // 210 in the buffer, and 5/4 = 1.25 against the measured 1.28. That ripple
    // was invisible while the deposit saturated the 8-bit buffer everywhere and
    // came straight through once v3 normalized it.
    //
    // With a cone the stamp entering or leaving the count contributes ~0 at the
    // moment it does, so the sum barely moves — the standard partition-of-unity
    // answer to stamp banding. The marker keeps 0.9 because its deposit is
    // saturated anyway and its constants were calibrated against it.
    inkEdgeFalloff: 0,
    compositeInkMode: 9,
    curvatureTolerancePx: MARKER_CURVATURE_TOLERANCE_PX,
    minHalfWidthPx: WATERCOLOR_MIN_HALF_WIDTH_PX,
    paperRim: WATERCOLOR_PAPER_EDGE,
    wetEdgeRadiusPx: 0,
    spreadPx: WATERCOLOR_SPREAD_CAP_PX,
    saturateInk: WATERCOLOR_SATURATE_INK,
    normalizeDeposit: true,
    // Per-area normalization above already makes the deposit independent of
    // the nib's depth along the travel, which is all #559's gain exists for.
    thinNibInkRefPx: 0,
    waterDepletion: true,
    // ── from water: geometry and behaviour ──
    waterLevel: mix2.water,
    pigmentLevel: mix2.pigment,
    pigmentStrength: p.strength,
    // (#536) Resolved from the mark's own width by the engine (see
    // WATERCOLOR_BRISTLE_BUNDLE_PX); this is only the fallback for a path that
    // has no radius to hand.
    //
    // It used to be a flat 22, and that is two faults in one number. The
    // across-brush coordinate runs -1..+1 over the *whole* width, so 22 meant
    // forty-four bundles across the mark whatever its size: a hair thinner than
    // a pixel on an ordinary brush, which reads as noise rather than as hair,
    // and outright invisible on the flat nib, whose mark is thin by
    // construction. Both were reported — "щетинок мало" and "на chisel кажется
    // они не работают" — and both are this.
    bristleCombs: 4,
    //  #536 — 0.62, from 0.45. "Щетинки есть, но можно сделать их заметнее?"
    //  The two structural faults are fixed now (the saturation ceiling that
    //  buried the modulation, and the bundle count that made it sub-pixel), so
    //  this is finally a number that can be turned rather than a symptom of
    //  something else — which is the first time in this issue that has been
    //  true of the hair. Zero-mean, so raising it does not darken the mark.
    // (s17.28) 0: the hair no longer combs the DOSE. Ilya's photographs: a
    // loaded stroke's body is one flat film, and the hair shows only where
    // the brush is nearly dry - as breaks in the contact along the paper's
    // tooth, which the composite's dry-contact term draws (u_dryContact, with
    // the bundle field modulating the reach). The density comb read as a
    // rake at every water level once the water ran down along the stroke.
    bristleInk: 0,
    // The paint's own readiness to travel through wet paper, on top of how
    // much water there is to carry it. Centred so a mid-diffusion paint leaves
    // the water setting alone.
    // Transport uses available water from brush or paper alike. Brush
    // contact/depletion below still depends on the brush's actual load.
    spreadOfRadius: t.spreadOfRadius * (0.6 + 0.8 * paint.diffusion) * (1 + WATERCOLOR_WET_BLOOM * transportWater),
    cloud: t.cloud,
    edgeSoft: t.edgeSoft,
    edgeWander: t.edgeWander,
    tideLo: t.tideLo,
    tideHi: t.tideHi,
    strokeDir: [1, 0],
    // The brush's own water, never the paper's: wet paper does not stop a
    // starved brush from riding the crests, it only decides what becomes of
    // the paint that does land.
    dryContact: w.dryContact,
    // ── from pigment: how much paint ──
    granulation: p.granulation * (0.25 + 1.5 * paint.granulation),
    pigmentOpacity: paint.opacity,
    depositPerRadius: p.depositPerRadius * WATERCOLOR_CONE_DEPOSIT_GAIN,
    stampInkShare: WATERCOLOR_STAMP_INK_SHARE,
    // A staining paint binds to the fibre and cannot migrate to the drying
    // perimeter, so it leaves *less* of a rim — the reduction is the point, not
    // a fudge factor.
    // (#536, §17.23) Zero: the tideline now lives in the deposit — the
    // settle carries paint to the water's edge — and a composite-time rim on
    // top of it drew the same line twice. Left as a field so the shader path
    // can be A/B'd until the water front lands; then it goes.
    wetEdge: 0,
    // ── from the paint: whether it can travel at all (#468 v11) ──
    //
    // The same staining figure, and rather harder, because this is the real
    // mechanism the line above only imitates: a staining paint is one that has
    // already bound to the fibre by the time the water starts moving, so there
    // is nothing left loose for the water to carry. Diffusion is how readily it
    // moves once loose, so it belongs here too.
    // Zero outright below the gate rather than left to evaluate to nothing.
    // The shader's gate reads the water *left* at each place, which depletion
    // only ever lowers, so a stroke whose nominal setting is already under the
    // threshold cannot migrate anywhere — and a zero here skips sixty texture
    // reads per fragment instead of spending them on a result known in advance.
    // Measured at roughly half the composite's cost on a full-width band.
    // (#536, s17.30) Off. The composite's migration was the presentation-time
    // stand-in for pigment transport; the deposit carries it now (s17.29),
    // and measured on the rig this pass HID the deposit's structure - a
    // clean-water stroke over a wet wash showed as a thin white outline (the
    // pass's own ring, Ilya's "чёткий контур каждого касания") where the
    // deposit held a real band. The design thread: an effect that answers
    // "where did the pigment move" has no place in the composite. Kept as
    // code behind this zero until the concentration transport lands.
    migrate: 0 * (transportWater <= WATERCOLOR_MIGRATE_LO ? 0 : WATERCOLOR_MIGRATE_GAIN * (1 - 0.7 * paint.staining) * (0.6 + 0.8 * paint.diffusion)),
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
    ...brush.model === "stamp" ? { brushStamp: { brush, pressure: digitalBrushPressureFromPreset(presetName) } } : {},
    stampFlow: (pressure) => digitalBrushFlow(brush, pressure, flowFromPressure),
    // ADR 013 §4 — stamps, no bands. See RibbonProfile.stampsOnly.
    stampsOnly: true,
    coverageInkMode: 10,
    // (#536) No water model, no hair comb: the watercolor's own fields.
    pigmentStrength: 0,
    bristleCombs: 0,
    bristleInk: 0,
    nibShape: "ellipse",
    cornerFraction: 0,
    aaPx: DIGITAL_BRUSH_MIN_AA_PX,
    // No pigment quantity: flow accumulates in the coverage buffer itself and the
    // composite reads nothing else. Same answer the brush pen gives, for the same
    // reason — see RibbonProfile.ink.
    ink: false,
    inkEdgeFalloff: 1,
    // The brush pen's source-over composite, reused whole (ADR 013 §3):
    //   alpha = clamp(coverage * opacity) over the frozen pre-stroke content.
    // That is precisely flow against opacity — flow accumulated into coverage,
    // opacity applied once to the finished silhouette — which is why this tool
    // needed no composite branch of its own.
    compositeInkMode: 8,
    curvatureTolerancePx: MARKER_CURVATURE_TOLERANCE_PX,
    // The brush pen's reason applies unchanged: a light touch with a fine brush
    // must leave a hairline, not a gap. Widened to this rather than dropped.
    minHalfWidthPx: 0.5,
    // The preset's own number, not the tool's. v1's ADR said this brush never
    // touches paper at all; that is right for Hard Round and wrong for the whole
    // Dry/Rough family, where the sheet's tooth *is* the mechanism of the texture
    // — see BrushDescriptor.paperInteraction. Every shipped brush sets 0, so the
    // term vanishes identically today; what changed is that turning it on is a
    // property a brush can declare rather than an edit to the tool.
    paperRim: brush.paperInteraction,
    wetEdge: 0,
    wetEdgeRadiusPx: 0,
    granulation: 0,
    spreadPx: 0,
    cloud: 0,
    normalizeDeposit: false,
    // No ink pass (flow accumulates in coverage), so nothing for #559 to scale.
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
function prepareRibbonDelivery(drawable, prevDab, preset, profile, scratch, wetOf, landedWet, segmentMode, segmented, film, context, options2) {
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
        options2.diagnosticWaterPolicy
      );
      used = source.waterUsed;
      pigUsed = source.pigmentUsed;
      const { load, water } = source;
      const availableHere = segmentMode && options2.diagnosticSharedFluid ? Math.max(wetHere, watercolorStandingWater(delivery.water, delivery.retain, wetHere, load)) : wetHere;
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
      const landingWet = segmentMode && options2.diagnosticLandingReservoir ? options2.diagnosticLandingPolicy === "fluid" ? Math.max(landedWet, watercolorStandingWater(delivery.water, delivery.retain, landedWet, 1)) : 0 : landedWet;
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
        ...options2.diagnosticCanonicalSettleRadius ? { settleRadius: canonicalMinorRadius(dab.size, preset.sizeMultiplier) } : {}
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
var LINER_PRESET = { opacity: 0.95, hardness: 0.88, sizeMultiplier: 1 };
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
  const c2 = Math.abs(Math.cos(d.angle)), s = Math.abs(Math.sin(d.angle));
  return { hx: halfLong * c2 + r * s, hy: halfLong * s + r * c2 };
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
  const { preset, presetName, options: options2, film } = input;
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
  const profile = segmentMode && options2.diagnosticSharedFluid ? { ...input.profile, diagnosticReadFluid: true } : input.profile;
  const prepared = prepareDrawableRibbonDabs(input.dabs, input.previous, preset, profile, state, input.wetProfile);
  const { drawable, previous, wetOf } = prepared;
  const commands = [];
  if (!drawable.length) return { drawable, commands };
  const landedWet = state.landedWet ?? wetAt(input.wetProfile, 0);
  noteRibbonWetContacts(state, drawable, preset, wetOf);
  const scalars = state.gestureScalars ??= prepareRibbonGestureScalars(drawable[0], preset, profile, presetName);
  const delivery = prepareRibbonDelivery(drawable, previous, preset, profile, state, wetOf, landedWet, segmentMode, !!input.segmented, film, { markerSegmentLength: ribbonSegmentLength, dabPool: () => state.dabPool }, options2);
  const result = buildCanonicalStrokeCommandsFromDelivery({ ...input, profile, drawable, previous, wetOf, scalars, delivery });
  if (input.materialEnabled !== false && !input.waterOnly) state.landedWet = landedWet;
  return result;
}
function buildCanonicalStrokeCommandsFromDelivery(input) {
  const { preset, tile, options: options2, film, profile, drawable, previous, wetOf, scalars, delivery } = input;
  const segmentMode = input.segmentMode, commands = [];
  if (input.materialEnabled === false) return { drawable, commands };
  const { haloDabs, haloDoseByDab: haloDose, haloShedByDab: haloShed } = prepareRibbonHalo(drawable, scalars.spreadPx, true, delivery);
  const bands = prepareCanonicalRibbonBands({ dabs: drawable, previous, sizeMultiplier: preset.sizeMultiplier, profile, film, segmented: !!segmentMode, solventField: options2.diagnosticSolventField, wetOf, delivery: { water: delivery.waterByDab, pigment: delivery.pigmentByDab, excess: delivery.excessByDab, haloShed, paperWet: delivery.paperWetByDab, puddle: delivery.puddleByDab, pigmentPool: delivery.pigmentPoolByDab } });
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
  if (segmentMode && options2.diagnosticSolventField) {
    const solventProfile = { ...profile, diagnosticReadFluid: false, inkEdgeFalloff: 1, cloud: 0, granulation: 0, bristleInk: 0 };
    for (const dab of drawable) stamp("solvent", dab, solventProfile, (delivery.waterByDab.get(dab) ?? 0) / 4, 1, 0, 0, delivery.acrossByDab.get(dab) ?? [0, 1], true, 0, 0, mottle, null);
    ribbon("solvent", bands.solventBands, solventProfile, mottle, null, 0, false);
  }
  const inkStrength = profile.pigmentStrength, poolBlot = profile.waterDepletion ? 1 : 0, available = !!segmentMode && options2.diagnosticSharedFluid;
  if (!input.waterOnly && (input.hasInk ?? profile.ink) && (!segmentMode || !options2.diagnosticPigmentRecord || inkStrength > 0)) {
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
  return { drawable, commands };
}

// apps/web/src/engine/src/presets/pencilPresets.ts
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
var GRADE_SET = new Set(PENCIL_GRADES);
function isPencilGrade(v) {
  return GRADE_SET.has(v);
}
var GRADE_INDEX = {
  "6H": -6,
  "5H": -5,
  "4H": -4,
  "3H": -3,
  "2H": -2,
  "H": -1,
  "F": -0.5,
  "HB": 0,
  "B": 1,
  "2B": 2,
  "3B": 3,
  "4B": 4,
  "5B": 5,
  "6B": 6
};
var ANCHOR_H = { opacity: 0.32, hardness: 0.55, sizeMultiplier: 0.85 };
var ANCHOR_HB = { opacity: 0.48, hardness: 0.38, sizeMultiplier: 1 };
var ANCHOR_2B = { opacity: 0.65, hardness: 0.25, sizeMultiplier: 1.1 };
var ANCHOR_H_X = -1;
var ANCHOR_HB_X = 0;
var ANCHOR_2B_X = 2;
var BOUNDS = {
  opacity: [0.08, 0.95],
  hardness: [0.05, 0.95],
  sizeMultiplier: [0.5, 1.6]
};
function clamp2(v, [lo, hi]) {
  return Math.min(hi, Math.max(lo, v));
}
function interpolate(x, key) {
  const h = ANCHOR_H[key];
  const hb = ANCHOR_HB[key];
  const b2 = ANCHOR_2B[key];
  const globalSlope = (b2 - h) / (ANCHOR_2B_X - ANCHOR_H_X);
  let raw;
  if (x <= ANCHOR_H_X) {
    raw = h + globalSlope * (x - ANCHOR_H_X);
  } else if (x < ANCHOR_HB_X) {
    const slope = (hb - h) / (ANCHOR_HB_X - ANCHOR_H_X);
    raw = h + slope * (x - ANCHOR_H_X);
  } else if (x <= ANCHOR_2B_X) {
    const slope = (b2 - hb) / (ANCHOR_2B_X - ANCHOR_HB_X);
    raw = hb + slope * (x - ANCHOR_HB_X);
  } else {
    raw = b2 + globalSlope * (x - ANCHOR_2B_X);
  }
  return clamp2(raw, BOUNDS[key]);
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
var PENCIL_PRESETS = buildPresets();

// apps/web/src/engine/src/presets/resolvePreset.ts
var MARKER_BULLET_PRESET = { opacity: 0.45, hardness: 0.78, sizeMultiplier: 1 };
var MARKER_CHISEL_PRESET = { opacity: 0.36, hardness: 0.68, sizeMultiplier: 1 };
function presetForTool(tool, presetName) {
  if (tool === "liner") return LINER_PRESET;
  if (tool === "marker") return markerNibFromPreset(presetName) === "chisel" ? MARKER_CHISEL_PRESET : MARKER_BULLET_PRESET;
  if (tool === "brushPen") return BRUSH_PEN_PRESET;
  if (tool === "watercolor") return WATERCOLOR_PRESET;
  if (tool === "digitalBrush") return digitalBrushPresetFor(presetName);
  if (tool === "charcoal") return charcoalPresetFor(presetName);
  return isPencilGrade(presetName) ? PENCIL_PRESETS[presetName] : PENCIL_PRESETS["HB"];
}

// docs/qa/harness/728-native-end-to-end/sourceReplay.ts
function replaySourceCoverage(operation, options2) {
  if (operation.tool !== "watercolor" || operation.preset !== "normal:100:100:PB29:round") throw new Error("Source oracle requires original fixed100 PB29 round fixture");
  if (operation.wet && /[^0]/.test(operation.wet)) throw new Error("Source oracle only supports original dry-landing fixture");
  const state = createCanonicalStrokeChunkState(), preset = presetForTool("watercolor", operation.preset), profile = ribbonProfileFor("watercolor", operation.preset, 0), dabs = strokeDabs(operation);
  if (!dabs.length || dabs.length > 200) throw new Error("Source fixture must contain1..200 packed dabs");
  const commands = [];
  for (let i = 0; i < dabs.length; i++) {
    const result = prepareCanonicalStrokeChunk(state, { dabs: [dabs[i]], previous: state.lastKept, preset, presetName: operation.preset, profile, color: operation.color, wetProfile: operation.wet?.slice(i, i + 1) ?? "0", strokeSeed: [0, 0], tile: { originX: 0, originY: 0, buffer: { width: 1024, height: 1024 } }, film: true, segmentMode: "combined", segmented: true, options: options2 });
    commands.push(...result.commands.filter((c2) => c2.phase === "coverage"));
  }
  return commands;
}

// temp/native-source-offline/ribbon44.ts
var f = JSON.parse(import_node_fs.default.readFileSync("docs/qa/harness/728-native-end-to-end/sourceReplay.fixture.json", "utf8"));
var options = { diagnosticWaterPolicy: "bottomless", diagnosticSharedFluid: true, diagnosticLandingReservoir: true, diagnosticLandingPolicy: "fluid", diagnosticCanonicalSettleRadius: true, diagnosticSolventField: true, diagnosticPigmentRecord: true };
var c = replaySourceCoverage(f.operation, options)[44];
if (c.kind !== "ribbon") throw Error("Not ribbon");
import_node_fs.default.writeFileSync("temp/native-source-offline/ribbon44.json", JSON.stringify({ vertices: Array.from(c.batch.vertices), uniforms: c.batch.uniforms }, null, 2));
console.log(c.batch.vertices.length);
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
