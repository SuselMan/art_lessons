// docs/qa/harness/728-native-end-to-end/commonSourcePlannerTrace.ts
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

// apps/web/src/engine/src/raster/CanonicalWatercolorSettlePlan.fixture.ts
var TraceBuffer = class {
  id;
  width;
  height;
  record;
  constructor(id2, width, height, record) {
    this.id = id2;
    this.width = width;
    this.height = height;
    this.record = record;
  }
  clear() {
    this.record("clear", [this]);
  }
  copyTo(out) {
    this.record("copy", [this, out]);
  }
  copyRegionInto(out, ...rect) {
    this.record("region", [this, out, ...rect]);
  }
  destroy() {
    this.record("destroy", [this]);
  }
};
function traceFixture(half, mixed, film, foreign, travel) {
  const events = [];
  let nextBuffer = 0, nextTexture = 0;
  const normalize = (value) => {
    if (value instanceof TraceBuffer) return { buffer: value.id, w: value.width, h: value.height };
    if (value instanceof Uint8Array) {
      let hash = 2166136261;
      for (const byte of value) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
      return { bytes: value.length, hash };
    }
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v)]));
    return value;
  };
  const record = (name, args2) => events.push([name, ...args2.map(normalize)]);
  const acquire = (w, h) => {
    const buffer = new TraceBuffer(++nextBuffer, w, h, record);
    record("acquire", [buffer]);
    return buffer;
  };
  const width = half ? 2048 : 64;
  const tile2 = acquire(width, width);
  const entry2 = {
    original: acquire(width, width),
    coverage: acquire(width, width),
    inkLoad: acquire(width, width),
    inkSettled: null,
    inkColor: acquire(width, width),
    colorSettled: null,
    strokeInk: acquire(width, width),
    inkBase: acquire(width, width),
    strokeColor: acquire(width, width),
    colorBase: acquire(width, width),
    filmGesture: 0,
    inkDry: null,
    colorDry: null
  };
  const fp = { x: width / 2, y: width / 2, radius: 8, aspect: 1, angle: 0 };
  const scratch = {
    gesture: 0,
    materialGesture: 0,
    paints: new Set(mixed ? ["1,0,0", "0,0,1"] : ["1,0,0"]),
    brushTravel: travel ? [{ ...fp, dx: 24, dy: 2, water: 1 }, { ...fp, x: fp.x + 4, dx: -16, dy: 0, water: 1 }] : [],
    wetContacts: foreign ? [fp] : [],
    foreignSources: foreign ? [{ gesture: "prior", footprints: [fp] }] : null,
    dryCtx: null,
    pigmentInputsKnownZero: false,
    trackRunningSource: false,
    runningSourceCommands: [],
    peek: (b) => b === tile2 ? entry2 : null,
    *tileEntries() {
      yield [tile2, entry2];
    },
    releaseRunningCoverage: (forget) => record("releaseCoverage", [forget]),
    noteStorageBounds: (b) => record("storage", [b])
  };
  const fieldFor = (w, h, captured) => {
    record("field", [w, h, captured]);
    return { w, h, a: acquire(w, h), b: acquire(w, h), c: acquire(w, h), ca: acquire(w, h), cb: acquire(w, h), cc: acquire(w, h), coverage: acquire(w, h), mask: acquire(w, h), pressure: acquire(w, h), band: acquire(w, h) };
  };
  const passes = {
    diagnosticBrushMrt: false,
    fieldOp: (...args2) => record("fieldOp", args2),
    pigmentColor: (...args2) => record("pigmentColor", args2),
    costDomainStep: (...args2) => record("costDomain", args2),
    waterFrontStep: (...args2) => record("front", args2),
    diffuseStep: (...args2) => record("diffuse", args2),
    wcResample: (...args2) => record("resample", args2),
    brushPass: (...args2) => record("brush", args2),
    brushPair: (...args2) => {
      record("brushPair", args2);
      return false;
    }
  };
  const context = {
    fieldFor,
    paperWorldSize: () => ({ w: 256, h: 256 }),
    pool: () => ({ acquire, release: (b) => record("release", [b]) }),
    supportsFilm: () => film,
    ab: () => ({ noDiffuse: false, noCarry: false, opDry: false }),
    shouldPreview: () => true,
    passes: () => passes,
    uploads: {
      create: () => ({ id: ++nextTexture }),
      bindFlow: () => {
      },
      uploadFlow: (_t, w, h, pixels, reuse) => record(reuse ? "updateFlow" : "uploadFlow", [w, h, pixels]),
      uploadForeign: (_t, w, h, pixels) => record("uploadForeign", [w, h, pixels]),
      destroy: (t) => record("deleteTexture", [t])
    }
  };
  const gl = {
    TEXTURE0: 0,
    TEXTURE_2D: 1,
    TEXTURE_MIN_FILTER: 2,
    TEXTURE_MAG_FILTER: 3,
    TEXTURE_WRAP_S: 4,
    TEXTURE_WRAP_T: 5,
    LINEAR: 6,
    CLAMP_TO_EDGE: 7,
    UNPACK_ALIGNMENT: 8,
    RGBA: 9,
    LUMINANCE: 10,
    UNSIGNED_BYTE: 11,
    createTexture: context.uploads.create,
    activeTexture: () => {
    },
    bindTexture: () => {
    },
    texParameteri: () => {
    },
    pixelStorei: () => {
    },
    texImage2D: (_target, _level, format, w, h, _border, _format, _type, pixels) => record(format === 9 ? "uploadFlow" : "uploadForeign", [w, h, pixels]),
    texSubImage2D: (_target, _level, _x, _y, w, h, _format, _type, pixels) => record("updateFlow", [w, h, pixels]),
    deleteTexture: context.uploads.destroy
  };
  const legacyContext = { ...context, gl: () => gl, minmaxExt: () => film ? { MAX_EXT: 32776 } : null };
  return { context, legacyContext, scratch, tile: tile2, width, events, record };
}

// apps/web/src/engine/src/watercolor/WatercolorSettleQueue.ts
var contactPulses = /* @__PURE__ */ new WeakSet();
var frontSteps = /* @__PURE__ */ new WeakSet();
var presentationTokens = /* @__PURE__ */ new WeakMap();
function presentationStepOp(op, token) {
  presentationTokens.set(op, token);
  return op;
}
function contactPulseOp(op) {
  contactPulses.add(op);
  return op;
}
function frontStepOp(op) {
  frontSteps.add(op);
  return op;
}
function inheritSettleOpTags(source, wrapped) {
  if (contactPulses.has(source)) contactPulses.add(wrapped);
  if (frontSteps.has(source)) frontSteps.add(wrapped);
  const token = presentationTokens.get(source);
  if (token) presentationTokens.set(wrapped, token);
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

// apps/web/src/engine/src/presets/brushPenPresets.ts
function clamp01(v) {
  return clamp_default(v, 0, 1);
}
var BRUSH_PEN_WIDTH_FLOOR = 0.1;
var BRUSH_PEN_MIN_PRESSURE = 0.05;
function gain(x, k) {
  const t = clamp01(x);
  return t < 0.5 ? 0.5 * Math.pow(2 * t, k) : 1 - 0.5 * Math.pow(2 - 2 * t, k);
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
    trailWidths: (speed) => BRUSH_PEN_TRAIL_WIDTHS * clamp01((speed - TRAIL_SPEED_SLOW) / (TRAIL_SPEED_FAST - TRAIL_SPEED_SLOW))
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
  return a + (b - a) * clamp01(t);
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
function clamp012(v) {
  return clamp_default(v, 0, 1);
}
var WATERCOLOR_WIDTH_FLOOR = 0.32;
var WATERCOLOR_MIN_PRESSURE = 0.05;
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
    trailWidths: (speed) => WATERCOLOR_FLEX_TRAIL_WIDTHS * clamp012((speed - WATERCOLOR_FLEX_SPEED_SLOW) / (WATERCOLOR_FLEX_SPEED_FAST - WATERCOLOR_FLEX_SPEED_SLOW))
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
function smoothstepJs(edge0, edge1, x) {
  const t = clamp012((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
var WC_POOL_STREAK = 0;
var WC_DWELL_TAU_WATER_MS = 450;
function watercolorDwellWater(dwellMs) {
  return 1 - Math.exp(-Math.max(dwellMs, 0) / WC_DWELL_TAU_WATER_MS);
}
function watercolorPuddleMerge(paperWet) {
  return smoothstepJs(WC_BLOOM_WET_LO, WC_BLOOM_WET_HI, clamp012(paperWet));
}
function watercolorDampOver(paperWet) {
  return smoothstepJs(WC_DAMP_OVER_LO, WC_DAMP_OVER_HI, clamp012(paperWet));
}
var WC_DAMP_OVER_LO = 0.08;
var WC_DAMP_OVER_HI = 0.35;
var WC_TIDE_STANDING_FULL = 0.6;
var WC_BLOOM_WET_LO = 0.45;
var WC_BLOOM_WET_HI = 0.7;
var WC_FRONT_CLIMB = 30;
var WC_FRONT_FLOOR = 0.85;
var WC_FRONT_CLIMB_IN = 15;
var WC_FRONT_FLOOR_IN = 0.5;
var WC_FRONT_MAX_STEPS = 56;
var WC_FRONT_WET_STEPS = 160;
function watercolorFrontSteps(budget, radiusPx, landedWet) {
  const l = clamp012(landedWet);
  const cap = WC_FRONT_MAX_STEPS + Math.round(WC_FRONT_WET_STEPS * l);
  return Math.min(cap, Math.ceil(1.4 * budget + radiusPx * (1 - l)));
}
var WC_CARRY_RATE = 0.5;
var WC_CARRY_TRAVEL = 0.35;
var WC_CARRY_POW = 3;
var WC_CARRY_MAX_STEPS = 24;
var WC_CARRY_HORIZON = 1;
function watercolorCarryStrides(budgetPx) {
  const top = Math.max(1, Math.floor(budgetPx * WC_CARRY_HORIZON));
  const up = [];
  for (let s = 1; s <= top; s *= 2) up.push(s);
  const cycle = [...up, ...up.slice().reverse()];
  const out = [...cycle];
  let sum = cycle.reduce((a, s) => a + s, 0);
  while (sum * WC_CARRY_RATE < budgetPx && out.length + cycle.length <= WC_CARRY_MAX_STEPS) {
    out.push(...cycle);
    sum += cycle.reduce((a, s) => a + s, 0);
  }
  return out;
}
var WC_FRONT_DRY_COST = 24;
var WC_FRONT_DRY_SHARE = 0.5;
function watercolorSpreadBudget(radiusPx, water, landedWet) {
  const w = clamp012(water), l = clamp012(landedWet);
  const puddle = WC_SPREAD_PUDDLE * smoothstepJs(WC_SPREAD_PUDDLE_LO, 1, l);
  return Math.max(2, Math.min(WC_SPREAD_BUDGET_MAX, radiusPx * (0.5 + WC_SPREAD_WET * w * (0.15 + 0.85 * l)) + puddle));
}
var WC_SPREAD_WET = 0.4;
var WC_SPREAD_PUDDLE = 60;
var WC_SPREAD_PUDDLE_LO = 0.75;
var WC_SPREAD_BUDGET_MAX = 160;
var WC_BLOOM_SHARE = 0.65;
var WC_TIDE_RIM = 0.4;
var WC_REMOB_DOME = 0.6;
var WC_RIM_BAND_PX = 10;
function watercolorRimShare(rim, radiusPx, bandPx = WC_RIM_BAND_PX) {
  const r = Math.max(radiusPx, bandPx);
  return Math.min(0.6, rim * bandPx / r);
}
var WATERCOLOR_HALO_SHED = 0;
var WATERCOLOR_HALO_DRAWN = WATERCOLOR_HALO_SHED > 0;

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
function clamp013(v) {
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
    size: (pressure, tiltNorm) => (CHARCOAL_WIDTH_FLOOR + CHARCOAL_WIDTH_SWING * clamp013(pressure)) * charcoalWidthFactor(tiltNorm * 90, CHARCOAL_FEEL, response),
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

// apps/web/src/engine/src/dabs/markerInkGain.ts
var MARKER_INK_REF_CHORD_PX = 4.5;

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
var WATERCOLOR_BRISTLE_BUNDLE_PX = 3.5;

// apps/web/src/engine/src/watercolor/wetDiffusion.ts
var WET_DIFFUSE_SCHEDULE = [
  { radius: 4, knight: false },
  { radius: 3, knight: true },
  { radius: 2, knight: false },
  { radius: 1, knight: true },
  { radius: 1, knight: false }
];
var WET_DIFFUSE_PUDDLE_SCHEDULE = [
  { radius: 21, knight: true },
  { radius: 32, knight: false },
  { radius: 14, knight: true },
  { radius: 16, knight: false },
  { radius: 7, knight: true },
  { radius: 8, knight: false }
];
var WET_SETTLE_CORE = 0.45;
var WET_SETTLE_STEP = 0.2;
var WET_SETTLE_FIBRE_FROM = 3;
var WET_SETTLE_SMOOTH = [[3, false], [2, true]];
function watercolorPuddleSettleWeights(steps, core = WET_SETTLE_CORE, step = WET_SETTLE_STEP) {
  const slices = [core];
  let left = 1 - core;
  for (let k = 0; k < steps; k++) {
    slices.push(left * step);
    left *= 1 - step;
  }
  return { slices, afloat: left };
}
var WET_DIFFUSE_RADII = WET_DIFFUSE_SCHEDULE.map((s) => s.radius);
var WET_DIFFUSE_STEPS = WET_DIFFUSE_SCHEDULE.length;
var WET_DIFFUSE_REACH = [...WET_SETTLE_SMOOTH.map(([radius, knight]) => ({ radius, knight })), ...WET_DIFFUSE_PUDDLE_SCHEDULE, ...WET_DIFFUSE_SCHEDULE].reduce(
  (a, s) => a + (s.knight ? Math.ceil(s.radius * Math.SQRT2 * 1.582) : s.radius),
  0
);
var WET_DIFFUSE_MOBILE = 0.75;

// apps/web/src/engine/src/watercolor/brushDrag.ts
var BrushDragRasterWorkspace = class {
  vx = new Float32Array(0);
  vy = new Float32Array(0);
  weight = new Float32Array(0);
  allocations = 0;
  reuses = 0;
  bytesAllocated = 0;
  bytesRequested = 0;
  take(size) {
    this.bytesRequested += size * 12;
    if (size > this.vx.length) {
      this.vx = new Float32Array(size);
      this.vy = new Float32Array(size);
      this.weight = new Float32Array(size);
      this.allocations += 3;
      this.bytesAllocated += size * 12;
    } else this.reuses++;
    const views = [this.vx.subarray(0, size), this.vy.subarray(0, size), this.weight.subarray(0, size)];
    for (const view of views) view.fill(0);
    return views;
  }
};
function brushDragField(travel, rect, cellPx = 4, workspace) {
  if (!travel.length) return null;
  const width = Math.ceil(rect.w / cellPx), height = Math.ceil(rect.h / cellPx);
  const sx = rect.w / width, sy = rect.h / height;
  const [vx, vy, weight] = workspace?.take(width * height) ?? [new Float32Array(width * height), new Float32Array(width * height), new Float32Array(width * height)];
  for (const d of travel) {
    const length = Math.hypot(d.dx, d.dy);
    if (length < 0.01 || d.water <= 0) continue;
    const rx = Math.max(d.radius * d.aspect, 0.5), ry = Math.max(d.radius, 0.5);
    const c = Math.cos(d.angle), s = Math.sin(d.angle);
    const ex = Math.hypot(rx * c, ry * s), ey = Math.hypot(rx * s, ry * c);
    const x0 = Math.max(0, Math.floor((d.x - ex - rect.x) / sx)), x1 = Math.min(width - 1, Math.ceil((d.x + ex - rect.x) / sx));
    const y0 = Math.max(0, Math.floor((d.y - ey - rect.y) / sy)), y1 = Math.min(height - 1, Math.ceil((d.y + ey - rect.y) / sy));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = rect.x + (x + 0.5) * sx - d.x, py = rect.y + (y + 0.5) * sy - d.y;
      const r2 = ((px * c + py * s) / rx) ** 2 + ((-px * s + py * c) / ry) ** 2;
      if (r2 >= 1) continue;
      const a = 1 - Math.exp(-length / ry * d.water * (1 - r2));
      const i = (height - 1 - y) * width + x;
      vx[i] = vx[i] * (1 - a) + d.dx / length * a;
      vy[i] = vy[i] * (1 - a) - d.dy / length * a;
      weight[i] = weight[i] + (1 - weight[i]) * a;
    }
  }
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < weight.length; i++) {
    pixels[i * 4] = Math.round(127.5 + 127.5 * (weight[i] > 0 ? vx[i] / weight[i] : 0));
    pixels[i * 4 + 1] = Math.round(127.5 + 127.5 * (weight[i] > 0 ? vy[i] / weight[i] : 0));
    pixels[i * 4 + 2] = Math.round(255 * weight[i]);
    pixels[i * 4 + 3] = 255;
  }
  return { width, height, pixels };
}
function brushDragContactGroups(travel, rect) {
  const contacts = [];
  let group = [], distance = 0;
  const flush = () => {
    if (!group.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, radius = 0;
    for (const d of group) {
      const rx = d.radius * d.aspect, c = Math.cos(d.angle), s = Math.sin(d.angle);
      const ex = Math.hypot(rx * c, d.radius * s), ey = Math.hypot(rx * s, d.radius * c);
      x0 = Math.min(x0, d.x - ex);
      x1 = Math.max(x1, d.x + ex);
      y0 = Math.min(y0, d.y - ey);
      y1 = Math.max(y1, d.y + ey);
      radius = Math.max(radius, d.settleRadius ?? d.radius);
    }
    x0 = Math.max(rect.x, Math.floor(x0) - 4);
    y0 = Math.max(rect.y, Math.floor(y0) - 4);
    x1 = Math.min(rect.x + rect.w, Math.ceil(x1) + 4);
    y1 = Math.min(rect.y + rect.h, Math.ceil(y1) + 4);
    if (x1 > x0 && y1 > y0) {
      const bounds = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      contacts.push({ rect: bounds, travel: group, radius });
    }
    group = [];
    distance = 0;
  };
  for (const d of travel) {
    if (d.water <= 0 || Math.hypot(d.dx, d.dy) < 0.01) continue;
    group.push(d);
    distance += Math.hypot(d.dx, d.dy);
    if (distance >= Math.max(1, d.radius * 0.5)) flush();
  }
  flush();
  return contacts;
}
function brushDragContacts(travel, rect, workspace) {
  return brushDragContactGroups(travel, rect).map((group) => ({
    rect: group.rect,
    radius: group.radius,
    field: brushDragField(group.travel, group.rect, 4, workspace)
  }));
}
function brushDragMaxExposure(pixels) {
  let peak = 0;
  for (let i = 2; i < pixels.length; i += 4) peak = Math.max(peak, pixels[i]);
  return peak === 0 ? 0 : -Math.log(Math.max(1 - peak / 255, 1 / 255));
}

// apps/web/src/engine/src/watercolor/brushDragFieldWork.ts
function* brushDragFieldWork(travel, rect, cellPx = 4) {
  if (!travel.length) return null;
  const width = Math.ceil(rect.w / cellPx), height = Math.ceil(rect.h / cellPx);
  const sx = rect.w / width, sy = rect.h / height;
  const vx = new Float32Array(width * height), vy = new Float32Array(width * height), weight = new Float32Array(width * height);
  let cells = 0;
  for (const d of travel) {
    const length = Math.hypot(d.dx, d.dy);
    if (length < 0.01 || d.water <= 0) continue;
    const rx = Math.max(d.radius * d.aspect, 0.5), ry = Math.max(d.radius, 0.5);
    const c = Math.cos(d.angle), s = Math.sin(d.angle);
    const ex = Math.hypot(rx * c, ry * s), ey = Math.hypot(rx * s, ry * c);
    const x0 = Math.max(0, Math.floor((d.x - ex - rect.x) / sx)), x1 = Math.min(width - 1, Math.ceil((d.x + ex - rect.x) / sx));
    const y0 = Math.max(0, Math.floor((d.y - ey - rect.y) / sy)), y1 = Math.min(height - 1, Math.ceil((d.y + ey - rect.y) / sy));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (cells++ > 0 && cells % 256 === 0) yield;
        const px = rect.x + (x + 0.5) * sx - d.x, py = rect.y + (y + 0.5) * sy - d.y;
        const r2 = ((px * c + py * s) / rx) ** 2 + ((-px * s + py * c) / ry) ** 2;
        if (r2 >= 1) continue;
        const a = 1 - Math.exp(-length / ry * d.water * (1 - r2));
        const i = (height - 1 - y) * width + x;
        vx[i] = vx[i] * (1 - a) + d.dx / length * a;
        vy[i] = vy[i] * (1 - a) - d.dy / length * a;
        weight[i] = weight[i] + (1 - weight[i]) * a;
      }
    }
  }
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < weight.length; i++) {
    pixels[i * 4] = Math.round(127.5 + 127.5 * (weight[i] > 0 ? vx[i] / weight[i] : 0));
    pixels[i * 4 + 1] = Math.round(127.5 + 127.5 * (weight[i] > 0 ? vy[i] / weight[i] : 0));
    pixels[i * 4 + 2] = Math.round(255 * weight[i]);
    pixels[i * 4 + 3] = 255;
    if (i % 256 === 255) yield;
  }
  return { width, height, pixels };
}

// apps/web/src/engine/src/watercolor/BrushContactFieldCache.ts
var BrushContactFieldCache = class {
  entries = /* @__PURE__ */ new Map();
  bytes = 0;
  hits = 0;
  misses = 0;
  bypasses = 0;
  maxBytes;
  maxEntries;
  constructor(maxBytes = 4 * 1024 * 1024, maxEntries = 128) {
    this.maxBytes = maxBytes;
    this.maxEntries = maxEntries;
  }
  get stats() {
    return { hits: this.hits, misses: this.misses, bypasses: this.bypasses, bytes: this.bytes, entries: this.entries.size };
  }
  clear() {
    this.entries.clear();
    this.bytes = 0;
  }
  contacts(travel, rect, cellPx = 4) {
    return brushDragContactGroups(travel, rect).map((group) => ({
      rect: group.rect,
      radius: group.radius,
      field: this.field(group.travel, group.rect, cellPx)
    }));
  }
  field(travel, rect, cellPx) {
    if (travel.length > 64 || this.maxBytes <= 0 || this.maxEntries <= 0) {
      this.bypasses++;
      return brushDragField(travel, rect, cellPx);
    }
    const values = new Float64Array(5 + travel.length * 8);
    values.set([rect.x, rect.y, rect.w, rect.h, cellPx]);
    let i = 5;
    for (const d of travel) {
      values[i++] = d.x;
      values[i++] = d.y;
      values[i++] = d.radius;
      values[i++] = d.aspect;
      values[i++] = d.angle;
      values[i++] = d.dx;
      values[i++] = d.dy;
      values[i++] = d.water;
    }
    let key = "";
    for (const byte of new Uint8Array(values.buffer)) key += String.fromCharCode(byte);
    const cached = this.entries.get(key);
    if (cached) {
      this.hits++;
      this.entries.delete(key);
      this.entries.set(key, cached);
      return { width: cached.field.width, height: cached.field.height, pixels: cached.field.pixels.slice() };
    }
    this.misses++;
    const field = brushDragField(travel, rect, cellPx);
    const bytes = field.pixels.byteLength + key.length * 2 + 128;
    if (bytes > this.maxBytes) {
      this.bypasses++;
      return field;
    }
    while (this.bytes + bytes > this.maxBytes || this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      this.bytes -= this.entries.get(oldest).bytes;
      this.entries.delete(oldest);
    }
    this.entries.set(key, { field: { width: field.width, height: field.height, pixels: field.pixels.slice() }, bytes });
    this.bytes += bytes;
    return field;
  }
};

// apps/web/src/engine/src/watercolor/foreignWater.ts
function contains(d, x, y, pad = 0) {
  const dx = x - d.x, dy = y - d.y, c = Math.cos(d.angle), s = Math.sin(d.angle);
  const u = (dx * c + dy * s) / Math.max(d.radius * d.aspect + pad, 0.5);
  const v = (-dx * s + dy * c) / Math.max(d.radius + pad, 0.5);
  return u * u + v * v <= 1;
}
function selectedForeignWaterSources(sources, contacts) {
  return sources.filter((source) => source.footprints.some((d) => contacts.some((p) => contains(d, p.x, p.y, p.radius))));
}
function foreignWaterStencil(sources, contacts, rect, cellPx = 4) {
  if (!contacts.length || !sources.length) return null;
  const selected = selectedForeignWaterSources(sources, contacts);
  if (!selected.length) return null;
  const width = Math.max(1, Math.ceil(rect.w / cellPx)), height = Math.max(1, Math.ceil(rect.h / cellPx));
  const sx = rect.w / width, sy = rect.h / height;
  const pixels = new Uint8Array(width * height);
  for (const source of selected) for (const d of source.footprints) {
    const rx = Math.max(0.5, d.radius * d.aspect), ry = Math.max(0.5, d.radius);
    const c = Math.cos(d.angle), sin = Math.sin(d.angle);
    const a = c * c / (rx * rx) + sin * sin / (ry * ry);
    const b = c * sin * (1 / (rx * rx) - 1 / (ry * ry));
    const cc = sin * sin / (rx * rx) + c * c / (ry * ry);
    const reachY = Math.hypot(rx * sin, ry * c);
    const y0 = Math.max(0, Math.ceil((d.y - reachY - rect.y) / sy - 0.5));
    const y1 = Math.min(height - 1, Math.floor((d.y + reachY - rect.y) / sy - 0.5));
    for (let y = y0; y <= y1; y++) {
      const dy = rect.y + (y + 0.5) * sy - d.y;
      const disc = b * b * dy * dy - a * (cc * dy * dy - 1);
      if (disc < 0) continue;
      const root2 = Math.sqrt(disc);
      const x0 = Math.max(0, Math.ceil((d.x + (-b * dy - root2) / a - rect.x) / sx - 0.5));
      const x1 = Math.min(width - 1, Math.floor((d.x + (-b * dy + root2) / a - rect.x) / sx - 0.5));
      if (x1 >= x0) {
        const row = (height - 1 - y) * width;
        pixels.fill(255, row + x0, row + x1 + 1);
      }
    }
  }
  return pixels.some((x) => x !== 0) ? { width, height, pixels } : null;
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

// apps/web/src/engine/src/watercolor/settleResolution.ts
var WC_HALF_RES_RADIUS_PX = 48;
var WC_HALF_RES_SPAN_PX = 1024;

// apps/web/src/engine/src/raster/CanonicalWatercolorSettlePlan.ts
var CanonicalWatercolorSettlePlan = class {
  /** Immutable cost-domain reachability diagnostic; default OFF on every route. */
  diagnosticCostDomainPaths = false;
  /** Exact upload-storage reuse candidate; isolated for hardware A/B. */
  diagnosticReuseFlowStorage = false;
  /** First eager upload is overwritten by contact upload before any flow sample. */
  diagnosticSkipInitialFlowUpload = false;
  initialFlowUploadStats = { retained: 0, skipped: 0, bytesAvoided: 0 };
  /** Eager CPU raster scratch reuse only; does not share suspended generators. */
  diagnosticReuseFlowRaster = false;
  flowRasterStats = { allocations: 0, reuses: 0, bytesAllocated: 0, bytesRequested: 0 };
  /** Exact landing candidate: remove temp/copy only without sampler aliasing. */
  diagnosticDirectResample = false;
  resampleLandingStats = { direct: 0, temporary: 0, copyPixelsAvoided: 0 };
  flowUploadStats = { allocations: 0, updates: 0, bytes: 0 };
  _brushFlowSize = [0, 0];
  /** Pack D1..D64 in seven byte bits; only eligible when cost-domain paths are enabled. */
  diagnosticPackedCostPaths = false;
  /** Local diagnostic only, default OFF. V-phase is an experimental closure,
   * not an equality between solvent thickness and the PaperWetness clock. */
  diagnosticPlateauPhase = false;
  /** Extra conservative zero-face flow; literal legacy carry still runs. */
  diagnosticAdditiveZeroFaces = false;
  /** Requires the caller's full layer/snapshot/live-stream zero proof; default OFF. */
  diagnosticPureWaterPlan = false;
  /** Diagnostic OFF: proven-zero pigment has no inward rim/tide consumer. */
  diagnosticSkipZeroPigmentRim = false;
  ctx;
  /** Scheduling diagnostic only; latched by prepare, default OFF. */
  splitQuanta = false;
  /** CPU scheduling diagnostic; requires the same canonical owner capability. */
  lazyContacts = false;
  /** Diagnostic OFF: identical contact CPU inputs may recur across boundaries. */
  diagnosticContactFieldCache = false;
  _contactFieldCache = new BrushContactFieldCache();
  get contactFieldCacheStats() {
    return this._contactFieldCache.stats;
  }
  constructor(ctx) {
    this.ctx = ctx;
  }
  /** Upload caches for recorded brush travel and preceding wet contacts. */
  _brushFlowTex = null;
  _foreignWaterTex = null;
  /** Checked-out captured inputs survive asynchronous settle steps until landing or abort. */
  _ownedInputs = /* @__PURE__ */ new Set();
  _coverageOwners = /* @__PURE__ */ new Set();
  /** Lazy CPU upload payloads do not survive their last JS consumer. */
  _ownedContactPixels = /* @__PURE__ */ new Set();
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
  prepare(scratch, targets, bounds, bloom = 0, radiusPx = 16, water = 1, landedWet = 0, standing = 1, wetPeak = 0, dwellMs = 0, preview, skipZeroPigmentContacts = false, finishMetadata, presentationOwnerLocked = false) {
    const metadata2 = finishMetadata ?? scratch;
    const splitQuanta = this.splitQuanta && presentationOwnerLocked;
    const lazyContacts = this.lazyContacts && presentationOwnerLocked;
    const pureWater = this.diagnosticPureWaterPlan && skipZeroPigmentContacts && scratch.pigmentInputsKnownZero;
    const skipZeroPigmentRim = pureWater && this.diagnosticSkipZeroPigmentRim;
    const tiles = targets.filter((t) => scratch.peek(t.buffer)?.inkLoad);
    if (!tiles.length) return null;
    let S = 1;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of tiles) {
      minX = Math.min(minX, t.originX);
      minY = Math.min(minY, t.originY);
      maxX = Math.max(maxX, t.originX + t.buffer.width);
      maxY = Math.max(maxY, t.originY + t.buffer.height);
    }
    const effectiveWet = Math.max(landedWet, wetPeak, standing);
    const frontReachPx = Math.ceil(watercolorSpreadBudget(radiusPx, water, effectiveWet) / WC_FRONT_FLOOR);
    const groupDry = !this.ctx.ab().opDry;
    const dryMargin = groupDry ? Math.max(2, Math.min(WC_RIM_BAND_PX, Math.round(radiusPx / 5))) + 2 + Math.ceil(radiusPx) + 2 : 0;
    const pad = Math.max(WET_DIFFUSE_REACH, frontReachPx) + 1 + dryMargin;
    let x0 = Math.max(minX, Math.floor(bounds.minX) - pad), y0 = Math.max(minY, Math.floor(bounds.minY) - pad);
    let x1 = Math.min(maxX, Math.ceil(bounds.maxX) + pad), y1 = Math.min(maxY, Math.ceil(bounds.maxY) + pad);
    if (radiusPx >= WC_HALF_RES_RADIUS_PX && Math.max(x1 - x0, y1 - y0) > WC_HALF_RES_SPAN_PX) S = 2;
    const CAP = 1536 * S;
    if (x1 - x0 > CAP) {
      const c = (x0 + x1) * 0.5;
      x0 = Math.floor(c - CAP / 2);
      x1 = x0 + CAP;
    }
    if (y1 - y0 > CAP) {
      const c = (y0 + y1) * 0.5;
      y0 = Math.floor(c - CAP / 2);
      y1 = y0 + CAP;
    }
    if (S > 1) {
      x0 = Math.max(minX, Math.floor(x0 / S) * S);
      y0 = Math.max(minY, Math.floor(y0 / S) * S);
      x1 = Math.min(maxX, Math.ceil(x1 / S) * S);
      y1 = Math.min(maxY, Math.ceil(y1 / S) * S);
      if (x1 - x0 > CAP) x1 = x0 + CAP;
      if (y1 - y0 > CAP) y1 = y0 + CAP;
    }
    const w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) return null;
    scratch.noteStorageBounds({ minX: x0, minY: y0, maxX: x1, maxY: y1 });
    const field = this.ctx.fieldFor(w / S, h / S, true);
    const { w: paperTexW, h: paperTexH } = this.ctx.paperWorldSize();
    this._coverageOwners.add(scratch);
    const owned = /* @__PURE__ */ new Set();
    let disposed = false;
    const presentations = /* @__PURE__ */ new Set();
    const runningPresentations = /* @__PURE__ */ new Set();
    let queuedContinuation = [];
    const contactPixels = /* @__PURE__ */ new Set();
    const releaseCpuFields = /* @__PURE__ */ new Set();
    const runningCpuFields = /* @__PURE__ */ new Set();
    const acquireInput = (width2, height) => {
      const buffer = this.ctx.pool().acquire(width2, height);
      owned.add(buffer);
      this._ownedInputs.add(buffer);
      return buffer;
    };
    const releaseInput = (buffer) => {
      owned.delete(buffer);
      if (this._ownedInputs.delete(buffer)) this.ctx.pool().release(buffer);
    };
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      for (const generator of presentations) if (!runningPresentations.has(generator)) generator.return();
      presentations.clear();
      for (const release of releaseCpuFields) release();
      releaseCpuFields.clear();
      for (const payload of contactPixels) {
        payload.pixels = null;
        this._ownedContactPixels.delete(payload);
      }
      contactPixels.clear();
      queuedContinuation = [];
      if (this._coverageOwners.delete(scratch)) scratch.releaseRunningCoverage();
      for (const buffer of owned) if (this._ownedInputs.delete(buffer)) this.ctx.pool().release(buffer);
      owned.clear();
    };
    const a0 = S > 1 ? acquireInput(field.w, field.h) : null;
    const ca0 = S > 1 ? acquireInput(field.w, field.h) : null;
    const snapshots = /* @__PURE__ */ new Map();
    const fieldRect = [0, field.h - h / S, w / S, field.h];
    const toField = (src, tile2, wx0, wy0, wx1, wy1, dst) => {
      const tx = wx0 - tile2.originX, ty = tile2.buffer.height - (wy1 - tile2.originY);
      const fx = (wx0 - x0) / S, fy = field.h - (wy1 - y0) / S;
      if (S === 1) src.copyRegionInto(dst, tx, ty, fx, fy, wx1 - wx0, wy1 - wy0);
      else this.ctx.passes().wcResample(dst, fx, fy, (wx1 - wx0) / S, (wy1 - wy0) / S, src, tx, ty, S, 0);
    };
    const fromField = (fNew, fOld, tile2, wx0, wy0, wx1, wy1, target, base) => {
      const tx = wx0 - tile2.originX, ty = tile2.buffer.height - (wy1 - tile2.originY);
      const fx = (wx0 - x0) / S, fy = field.h - (wy1 - y0) / S;
      if (S === 1 || !fOld) {
        fNew.copyRegionInto(target, fx, fy, tx, ty, wx1 - wx0, wy1 - wy0);
        return;
      }
      this.landResampled(target, base, fNew, fOld, tx, ty, wx1 - wx0, wy1 - wy0, fx, fy, 1 / S, fieldRect);
    };
    const overlaps = [];
    for (const tile2 of tiles) {
      const entry2 = scratch.peek(tile2.buffer);
      if (!entry2?.inkLoad) continue;
      if (!this.ctx.supportsFilm() && !entry2.inkSettled) {
        entry2.inkSettled = this.ctx.pool().acquire(tile2.buffer.width, tile2.buffer.height);
        entry2.inkSettled.clear();
      }
      if (!this.ctx.supportsFilm() && entry2.inkColor && !entry2.colorSettled) {
        entry2.colorSettled = this.ctx.pool().acquire(tile2.buffer.width, tile2.buffer.height);
        entry2.colorSettled.clear();
      }
      const ox0 = Math.max(x0, tile2.originX), oy0 = Math.max(y0, tile2.originY);
      const ox1 = Math.min(x1, tile2.originX + tile2.buffer.width), oy1 = Math.min(y1, tile2.originY + tile2.buffer.height);
      if (ox1 <= ox0 || oy1 <= oy0) continue;
      overlaps.push({ tile: tile2, ox0, oy0, ox1, oy1 });
    }
    if (!overlaps.length) {
      dispose();
      return null;
    }
    const solvent = tiles.some((t) => scratch.peek(t.buffer)?.solventLoad || scratch.peek(t.buffer)?.foreignSolventLoad) ? acquireInput(field.w, field.h) : null;
    const plateauPhase = this.diagnosticPlateauPhase && solvent !== null;
    const additiveZeroFaces = this.diagnosticAdditiveZeroFaces && plateauPhase;
    const foreign = foreignWaterStencil(
      metadata2.foreignSources ?? [],
      metadata2.wetContacts,
      { x: x0, y: y0, w: field.w * S, h: field.h * S }
    );
    const contactRect = { x: x0, y: y0, w: field.w * S, h: field.h * S };
    const groups = lazyContacts && !skipZeroPigmentContacts ? brushDragContactGroups(metadata2.brushTravel, contactRect) : [];
    const workspace = this.diagnosticReuseFlowRaster && !this.diagnosticContactFieldCache && !lazyContacts && !skipZeroPigmentContacts ? new BrushDragRasterWorkspace() : void 0;
    const contacts = skipZeroPigmentContacts || lazyContacts ? [] : this.diagnosticContactFieldCache ? this._contactFieldCache.contacts(metadata2.brushTravel, contactRect) : brushDragContacts(metadata2.brushTravel, contactRect, workspace);
    if (workspace) {
      this.flowRasterStats.allocations += workspace.allocations;
      this.flowRasterStats.reuses += workspace.reuses;
      this.flowRasterStats.bytesAllocated += workspace.bytesAllocated;
      this.flowRasterStats.bytesRequested += workspace.bytesRequested;
    }
    const flow = contacts[0]?.field;
    let flowTexture = null;
    let foreignTexture = null;
    const ops2 = [];
    const captureInputs = [];
    const bindFlowTexture = () => {
      this._brushFlowTex ??= this.ctx.uploads.create();
      flowTexture = this._brushFlowTex;
      this.ctx.uploads.bindFlow(flowTexture, true);
    };
    const skipInitialFlowUpload = this.diagnosticSkipInitialFlowUpload;
    if (flow) captureInputs.push(() => {
      if (skipInitialFlowUpload) {
        this.initialFlowUploadStats.skipped++;
        this.initialFlowUploadStats.bytesAvoided += flow.pixels.byteLength;
        return;
      }
      this.initialFlowUploadStats.retained++;
      bindFlowTexture();
      this.uploadBrushFlow(flow.width, flow.height, flow.pixels);
    });
    if (foreign) captureInputs.push(() => {
      this._foreignWaterTex ??= this.ctx.uploads.create();
      foreignTexture = this._foreignWaterTex;
      this.ctx.uploads.uploadForeign(foreignTexture, foreign.width, foreign.height, foreign.pixels);
    });
    const gesture = metadata2.gesture;
    captureInputs.push(() => {
      field.a.clear();
      field.b.clear();
      field.coverage.clear();
      field.ca.clear();
      field.cb.clear();
      solvent?.clear();
      for (const { tile: tile2, ox0, oy0, ox1, oy1 } of overlaps) {
        const entry2 = scratch.peek(tile2.buffer);
        if (!entry2?.inkLoad) continue;
        const settledInk = (entry2.filmGesture === gesture ? entry2.inkBase : null) ?? entry2.inkSettled ?? entry2.inkLoad;
        toField(entry2.inkLoad, tile2, ox0, oy0, ox1, oy1, field.a);
        toField(settledInk, tile2, ox0, oy0, ox1, oy1, field.b);
        if (S > 1) {
          const tx = ox0 - tile2.originX, ty = tile2.buffer.height - (oy1 - tile2.originY);
          const ink = acquireInput(tile2.buffer.width, tile2.buffer.height);
          settledInk.copyRegionInto(ink, tx, ty, tx, ty, ox1 - ox0, oy1 - oy0);
          let color = null;
          if (entry2.inkColor) {
            const sc = (entry2.filmGesture === gesture ? entry2.colorBase : null) ?? entry2.colorSettled ?? entry2.inkColor;
            color = acquireInput(tile2.buffer.width, tile2.buffer.height);
            sc.copyRegionInto(color, tx, ty, tx, ty, ox1 - ox0, oy1 - oy0);
          }
          snapshots.set(tile2.buffer, { ink, color });
        }
        toField(entry2.coverage, tile2, ox0, oy0, ox1, oy1, field.coverage);
        if (solvent && (entry2.solventLoad || entry2.foreignSolventLoad)) {
          if (entry2.solventLoad && entry2.foreignSolventLoad) {
            const temp = this.ctx.pool().acquire(tile2.buffer.width, tile2.buffer.height);
            try {
              this.ctx.passes().fieldOp(temp, entry2.solventLoad, entry2.foreignSolventLoad, 1, 1);
              toField(temp, tile2, ox0, oy0, ox1, oy1, solvent);
            } finally {
              this.ctx.pool().release(temp);
            }
          } else toField(entry2.solventLoad ?? entry2.foreignSolventLoad, tile2, ox0, oy0, ox1, oy1, solvent);
        }
        if (entry2.inkColor) {
          const settledColor = (entry2.filmGesture === gesture ? entry2.colorBase : null) ?? entry2.colorSettled ?? entry2.inkColor;
          toField(entry2.inkColor, tile2, ox0, oy0, ox1, oy1, field.ca);
          toField(settledColor, tile2, ox0, oy0, ox1, oy1, field.cb);
        }
      }
      if (a0) field.b.copyTo(a0);
      if (ca0) field.cb.copyTo(ca0);
    });
    ops2.push(() => {
      for (const capture of captureInputs) capture();
    });
    const fieldOp = (out, a, b, mode, k) => this.ctx.passes().fieldOp(out, a, b, mode, k);
    const diffuseStep = (src, dst, radius, knight, gate = field.coverage, density = src) => {
      this.ctx.passes().diffuseStep(field, x0, y0, S, paperTexW, paperTexH, src, dst, radius, knight, gate, density, solvent);
    };
    const runWet = effectiveWet;
    const budgetPx = watercolorSpreadBudget(radiusPx, water, runWet) / S;
    const radiusC = radiusPx / S;
    const costMax = budgetPx + 4;
    const frontSteps2 = watercolorFrontSteps(budgetPx, radiusC, runWet);
    const width = Math.max(1, Math.round(Math.max(2, Math.min(WC_RIM_BAND_PX, Math.round(radiusPx / 5))) / S));
    const costMaxIn = width + 3;
    const inSteps = width + 2;
    const merge = watercolorPuddleMerge(effectiveWet);
    const damp = watercolorDampOver(effectiveWet);
    const tideWater = Math.min(1, standing / WC_TIDE_STANDING_FULL);
    const gather = [];
    for (let st = 1; st <= Math.max(1, radiusC / 2) && gather.length < 6; st *= 2) gather.push([st, st]);
    const dryCost = Math.max(WC_FRONT_DRY_COST, budgetPx * WC_FRONT_DRY_SHARE);
    const frontStep = (src, dst, max, climb = WC_FRONT_CLIMB, floor = WC_FRONT_FLOOR, stride = 1) => this.ctx.passes().waterFrontStep(field, x0, y0, dryCost, src, dst, max, climb, floor, stride, S, foreignTexture);
    const frontOps = (mobile, tmp, skipPigmentRim = false) => {
      const pp = { src: field.pressure, dst: tmp };
      const run = (steps, max, home, climb, floor, strides) => {
        const list = strides ?? Array.from({ length: steps }, () => 1);
        for (let i = 0; i < list.length; i += splitQuanta ? 1 : 4) {
          const chunk = list.slice(i, i + (splitQuanta ? 1 : 4));
          const last = i + chunk.length >= list.length;
          ops2.push(frontStepOp(() => {
            for (const st of chunk) {
              frontStep(pp.src, pp.dst, max, climb, floor, st);
              const t = pp.src;
              pp.src = pp.dst;
              pp.dst = t;
            }
            if (last && pp.src !== home) this.ctx.passes().fieldOp(home, pp.src, pp.src, 1, 0);
          }));
        }
      };
      ops2.push(() => {
        this.ctx.passes().fieldOp(field.pressure, mobile, field.coverage, 10, 3e-3, { band: [1 / costMax, standing], size: [(budgetPx - 1) / costMax, 0] });
        pp.src = field.pressure;
        pp.dst = tmp;
      });
      run(frontSteps2, costMax, field.pressure, WC_FRONT_CLIMB, WC_FRONT_FLOOR);
      if (skipPigmentRim) {
        ops2.push(() => {
          this.ctx.passes().fieldOp(tmp, field.coverage, field.coverage, 11, standing, { d: field.pressure, band: [budgetPx / costMax, 0], size: [1 / costMax, 1] });
          this.ctx.passes().fieldOp(field.coverage, tmp, tmp, 1, 0);
        });
        return;
      }
      ops2.push(() => {
        this.ctx.passes().fieldOp(field.mask, field.pressure, field.pressure, 12, budgetPx / costMax, { d: field.band });
        pp.src = field.mask;
        pp.dst = tmp;
      });
      run(2, costMaxIn, field.mask, 0, 1);
      run(inSteps - 2, costMaxIn, field.mask, WC_FRONT_CLIMB_IN, WC_FRONT_FLOOR_IN);
      ops2.push(() => {
        this.ctx.passes().fieldOp(tmp, field.coverage, field.coverage, 11, standing, { d: field.pressure, band: [budgetPx / costMax, 0], size: [1 / costMax, 1] });
        this.ctx.passes().fieldOp(field.coverage, tmp, tmp, 1, 0);
        this.ctx.passes().fieldOp(field.band, field.pressure, field.coverage, 6, merge, { c: field.mask, d: field.pressure, band: [budgetPx / costMax, width / costMaxIn], size: [1 / costMax, 1 / costMaxIn], origin: [standing, damp], dir: [1, 1], tau: [watercolorDwellWater(dwellMs), 0, 0], world: [x0 / S, -(y0 / S + field.h), S] });
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
    const rim = (paint, share, t1, t2, tide = false) => {
      this.ctx.passes().fieldOp(t1, paint, paint, tide ? 7 : 9, share, { d: field.band });
      let gs = t1, gd = t2;
      for (let i = 0; i < gather.length; i++) {
        this.ctx.passes().fieldOp(gd, gs, gs, 5, 0, { dir: gather[i] });
        const t = gs;
        gs = gd;
        gd = t;
      }
      if (gs === t2) {
        this.ctx.passes().fieldOp(t1, gs, gs, 1, 0);
        gs = t1;
      }
      this.ctx.passes().fieldOp(t2, paint, gs, tide ? 14 : 8, share, { c: field.mask, d: field.band });
    };
    const diffuseSteps = this.ctx.ab().noDiffuse ? [] : WET_DIFFUSE_SCHEDULE;
    const costPathsEnabled = this.diagnosticCostDomainPaths && metadata2.paints.size === 1;
    const colour = metadata2.paints.size > 1 ? { a: field.ca, b: field.cb, c: field.cc } : null;
    const singlePaint = [...metadata2.paints][0];
    const singleTau = !colour && singlePaint ? pigmentAbsorption(singlePaint.split(",").map(Number)) : [0, 0, 0];
    const mobileShare = groupDry ? 1 : WET_DIFFUSE_MOBILE;
    const streakCombs = Math.max(1.5, Math.min(50, radiusPx / WATERCOLOR_BRISTLE_BUNDLE_PX));
    const poolStreaks = (paint, free) => {
      if (!(WC_POOL_STREAK > 0)) return;
      this.ctx.passes().fieldOp(free, paint, paint, 1, 1, { c: field.coverage, world: [x0 / S, -(y0 / S + field.h), S], size: [streakCombs, 0], origin: [WC_POOL_STREAK, 0], dir: [1, 1] });
      fieldOp(paint, free, free, 1, 0);
    };
    let previewAt = -Infinity;
    const present = (mobile, fixed, mobileColor, fixedColor, afloat = 1) => {
      if (!preview || this.ctx.shouldPreview?.() === false || performance.now() - previewAt < 150) return;
      previewAt = performance.now();
      const reconstruct = function* () {
        const pool = this.ctx.pool();
        const pigment = splitQuanta ? acquireInput(field.w, field.h) : pool.acquire(field.w, field.h);
        const color = S > 1 && !colour ? null : splitQuanta ? acquireInput(field.w, field.h) : pool.acquire(field.w, field.h);
        try {
          if (fixed) fieldOp(pigment, fixed, mobile, 1, afloat);
          else mobile.copyTo(pigment);
          if (color) {
            if (mobileColor) {
              if (fixedColor) fieldOp(color, fixedColor, mobileColor, 1, afloat);
              else mobileColor.copyTo(color);
            } else this.ctx.passes().pigmentColor(color, pigment, singleTau);
          }
          yield;
          for (const { tile: tile2, ox0, oy0, ox1, oy1 } of overlaps) {
            const entry2 = scratch.peek(tile2.buffer);
            if (!entry2?.inkLoad) {
              yield;
              continue;
            }
            const load = pool.acquire(tile2.buffer.width, tile2.buffer.height);
            const chroma = pool.acquire(tile2.buffer.width, tile2.buffer.height);
            const coverage = pool.acquire(tile2.buffer.width, tile2.buffer.height);
            try {
              entry2.inkLoad.copyTo(load);
              if (entry2.inkColor) entry2.inkColor.copyTo(chroma);
              entry2.coverage.copyTo(coverage);
              const snap = snapshots.get(tile2.buffer);
              fromField(pigment, a0, tile2, ox0, oy0, ox1, oy1, load, snap?.ink ?? entry2.inkLoad);
              if (entry2.inkColor) {
                if (S > 1 && !colour) this.ctx.passes().pigmentColor(chroma, load, singleTau);
                else fromField(color, ca0, tile2, ox0, oy0, ox1, oy1, chroma, snap?.color ?? entry2.inkColor);
              }
              const tx = ox0 - tile2.originX, ty = tile2.buffer.height - (oy1 - tile2.originY);
              if (S === 1) field.coverage.copyRegionInto(coverage, ox0 - x0, field.h - (oy1 - y0), tx, ty, ox1 - ox0, oy1 - oy0);
              else this.ctx.passes().wcResample(coverage, tx, ty, ox1 - ox0, oy1 - oy0, field.coverage, (ox0 - x0) / S, field.h - (oy1 - y0) / S, 1 / S, 0);
              preview(tile2, load, entry2.inkColor ? chroma : null, coverage);
            } finally {
              pool.release(load);
              pool.release(chroma);
              pool.release(coverage);
            }
            yield;
          }
        } finally {
          if (splitQuanta) {
            releaseInput(pigment);
            if (color) releaseInput(color);
          } else {
            pool.release(pigment);
            if (color) pool.release(color);
          }
        }
      }.bind(this);
      const generator = reconstruct();
      if (!splitQuanta) {
        while (!generator.next().done) {
        }
        return;
      }
      presentations.add(generator);
      const resume = () => {
        runningPresentations.add(generator);
        try {
          return generator.next();
        } finally {
          runningPresentations.delete(generator);
          if (disposed) {
            generator.return();
            presentations.delete(generator);
          }
        }
      };
      try {
        resume();
      } catch (error) {
        generator.return();
        presentations.delete(generator);
        throw error;
      }
      for (let i = 0; i <= overlaps.length; i++) queuedContinuation.push(presentationStepOp(() => {
        if (disposed) return;
        try {
          if (resume().done) presentations.delete(generator);
        } catch (error) {
          generator.return();
          presentations.delete(generator);
          throw error;
        }
      }, generator));
    };
    let pairedColour = null;
    const settle = (a, b, c, first, spare, follow = false) => {
      const st = { src: c, dst: a, out: a };
      const paired = first && colour ? { src: colour.c, dst: colour.a, out: colour.a } : null;
      if (paired) pairedColour = paired;
      const advance = (radius, knight, gate = field.coverage) => {
        if (paired) diffuseStep(paired.src, paired.dst, radius, knight, gate, st.src);
        diffuseStep(st.src, st.dst, radius, knight, gate, st.src);
        const t = st.src;
        st.src = st.dst;
        st.dst = t;
        if (paired) {
          const t2 = paired.src;
          paired.src = paired.dst;
          paired.dst = t2;
        }
      };
      if (!follow) ops2.push(() => {
        fieldOp(c, a, b, 0, mobileShare);
        if (first) this.ctx.passes().fieldOp(field.band, b, b, 4, 2e-3);
        fieldOp(b, a, c, 1, -1);
        if (colour && first) {
          fieldOp(colour.c, colour.a, colour.b, 0, mobileShare);
          fieldOp(colour.b, colour.a, colour.c, 1, -1);
        }
      });
      if (first) frontOps(c, a);
      if (first && !this.ctx.ab().noCarry) {
        const carry = watercolorCarryStrides(budgetPx);
        const costPaths = costPathsEnabled && !colour;
        const packedPaths = costPaths && this.diagnosticPackedCostPaths;
        let packedMask;
        if (packedPaths) {
          const band = (budgetPx - 1.5) / costMax;
          ops2.push(() => this.ctx.passes().costDomainStep(field.ca, field.pressure, fieldRect, band, 0, true));
          let mask = field.ca, next = field.cc;
          for (let distance = 1; distance < 64; distance *= 2) {
            const from = mask, to = next, step = distance;
            ops2.push(() => this.ctx.passes().costDomainStep(to, from, fieldRect, band, step, true));
            const previous = mask;
            mask = next;
            next = previous;
          }
          packedMask = mask;
        }
        const pathFor = (stride) => {
          if (!costPaths) return void 0;
          if (packedMask) return packedMask;
          const band = (budgetPx - 1.5) / costMax;
          ops2.push(() => this.ctx.passes().costDomainStep(field.ca, field.pressure, fieldRect, band, 0));
          let mask = field.ca, next = field.cc;
          for (let distance = 1; distance < stride; distance *= 2) {
            const from = mask, to = next, step = distance;
            ops2.push(() => this.ctx.passes().costDomainStep(to, from, fieldRect, band, step));
            const previous = mask;
            mask = next;
            next = previous;
          }
          return mask;
        };
        let src = c, dst = a;
        let csrc = colour?.c, cdst = colour?.a;
        for (let i = 0; i < carry.length; i += splitQuanta || costPaths ? 1 : 4) {
          const n = Math.min(splitQuanta || costPaths ? 1 : 4, carry.length - i);
          const plan2 = [];
          for (let j = 0; j < n; j++) {
            plan2.push({ s: carry[i + j], src, dst, csrc, cdst, path: pathFor(carry[i + j]) });
            const t = src;
            src = dst;
            dst = t;
            const ct = csrc;
            csrc = cdst;
            cdst = ct;
          }
          ops2.push(frontStepOp(() => {
            for (const p of plan2) {
              const opts = { path: p.path, pathPacked: packedPaths, d: field.pressure, e: plateauPhase ? solvent : void 0, dir: [p.s, p.s], band: [(budgetPx - 1.5) / costMax, effectiveWet], size: [WC_CARRY_POW, costMax], tau: [WC_BLOOM_WET_LO, WC_BLOOM_WET_HI, plateauPhase ? 1 : 0], origin: [p.s, WC_CARRY_TRAVEL], additiveZeroFaces };
              const paired2 = p.csrc && p.cdst && this.ctx.passes().carryPair?.(p.dst, p.src, p.cdst, p.csrc, b, WC_CARRY_RATE, opts);
              if (!paired2) {
                if (p.csrc && p.cdst) this.ctx.passes().fieldOp(p.cdst, p.csrc, b, 16, WC_CARRY_RATE, { ...opts, c: p.src });
                this.ctx.passes().fieldOp(p.dst, p.src, b, 15, WC_CARRY_RATE, opts);
              }
            }
            const last = plan2[plan2.length - 1];
            if (!splitQuanta || (i + n) % 4 === 0 || i + n === carry.length) present(last.dst, b, last.cdst, colour?.b);
          }));
        }
        if (src !== c) {
          const from = src;
          ops2.push(() => fieldOp(c, from, from, 1, 0));
        }
        if (colour && csrc && csrc !== colour.c) {
          const from = csrc, to = colour.c;
          ops2.push(() => fieldOp(to, from, from, 1, 0));
        }
      }
      const remobFloor = groupDry ? 1 : WC_REMOB_DOME;
      if (first && merge > 0) ops2.push(() => {
        if (colour) {
          this.ctx.passes().fieldOp(a, colour.c, colour.b, 18, merge, {
            d: field.band,
            c,
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
      if (bloom > 0) {
        ops2.push(() => {
          rim(b, WC_BLOOM_SHARE * bloom, a, spare);
          fieldOp(b, spare, spare, 1, 0);
          if (paired && colour) {
            rim(colour.b, WC_BLOOM_SHARE * bloom, a, spare);
            fieldOp(colour.b, spare, spare, 1, 0);
          }
        });
      }
      const puddleSteps = merge > 0 && !this.ctx.ab().noDiffuse ? WET_DIFFUSE_PUDDLE_SCHEDULE : [];
      if (puddleSteps.length) {
        const w2 = watercolorPuddleSettleWeights(puddleSteps.length);
        const acc = { fixed: b, free: spare };
        const fibreFrom = WET_SETTLE_FIBRE_FROM;
        const gradientFibres = this.ctx.gradientFibres?.() ?? false;
        const world = [x0 / S, -(y0 / S + field.h), S];
        const settleSlice = (k) => {
          if (!(w2.slices[k] > 0)) return;
          if (paired && colour) {
            const addSlice = (fixed, mobile, tmp) => {
              if (k >= fibreFrom) this.ctx.passes().fieldOp(tmp, fixed, mobile, 1, w2.slices[k], { world, d: field.band, dir: [1, 1], ...gradientFibres ? { gradientFibres: true } : {} });
              else fieldOp(tmp, fixed, mobile, 1, w2.slices[k]);
              fieldOp(fixed, tmp, tmp, 1, 0);
            };
            addSlice(b, st.src, st.dst);
            addSlice(colour.b, paired.src, paired.dst);
            return;
          }
          if (k >= fibreFrom) this.ctx.passes().fieldOp(acc.free, acc.fixed, st.src, 1, w2.slices[k], { world, d: field.band, dir: [1, 1], ...gradientFibres ? { gradientFibres: true } : {} });
          else fieldOp(acc.free, acc.fixed, st.src, 1, w2.slices[k]);
          const t = acc.fixed;
          acc.fixed = acc.free;
          acc.free = t;
        };
        for (const [radius, knight] of WET_SETTLE_SMOOTH) {
          ops2.push(() => advance(radius, knight));
        }
        let afloat = 1;
        ops2.push(() => {
          settleSlice(0);
          afloat -= w2.slices[0];
          present(st.src, paired ? b : acc.fixed, paired?.src, colour?.b, afloat);
        });
        puddleSteps.forEach(({ radius, knight }, i) => {
          ops2.push(() => {
            advance(radius, knight);
            settleSlice(i + 1);
            afloat -= w2.slices[i + 1];
            present(st.src, paired ? b : acc.fixed, paired?.src, colour?.b, afloat);
          });
        });
        ops2.push(() => {
          if (acc.fixed !== b) fieldOp(b, acc.fixed, acc.fixed, 1, 0);
          fieldOp(st.dst, st.src, st.src, 1, w2.afloat - 1);
          fieldOp(st.src, st.dst, st.dst, 1, 0);
          if (paired) {
            fieldOp(paired.dst, paired.src, paired.src, 1, w2.afloat - 1);
            fieldOp(paired.src, paired.dst, paired.dst, 1, 0);
          }
        });
      }
      for (const { radius, knight } of diffuseSteps) {
        ops2.push(() => {
          advance(radius, knight);
          present(st.src, b, paired?.src, colour?.b);
        });
      }
      ops2.push(() => {
        const finalSpare = paired ? field.pressure : spare;
        if (groupDry) {
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
    let dep;
    if (pureWater) {
      ops2.push(() => {
        fieldOp(field.c, field.a, field.b, 0, mobileShare);
        this.ctx.passes().fieldOp(field.band, field.b, field.b, 4, 2e-3);
        fieldOp(field.b, field.a, field.c, 1, -1);
      });
      frontOps(field.c, field.a, skipZeroPigmentRim);
      ops2.push(() => {
        field.a.clear();
        field.c.clear();
        field.cc.clear();
        present(field.c, null, field.cc);
      });
      dep = { out: field.c };
    } else dep = settle(field.a, field.b, field.c, true, colour ? field.ca : field.cc);
    let col;
    if (pureWater) col = { out: field.cc };
    else if (metadata2.paints.size <= 1) {
      const only = [...metadata2.paints][0];
      const tau = only ? pigmentAbsorption(only.split(",").map(Number)) : [0, 0, 0];
      col = { out: field.cc };
      ops2.push(() => {
        this.ctx.passes().pigmentColor(field.cc, dep.out, tau);
      });
    } else {
      col = pairedColour;
    }
    const contactOps = ({ rect: cr, radius, field: { width: width2, height, pixels } }, oneShot = false) => {
      const commands = [];
      const maxExposure = brushDragMaxExposure(pixels);
      const substeps = Math.max(1, Math.ceil(0.2 * radius / S * maxExposure * Math.SQRT2 / 0.84));
      const contactGain = 0.2 * radius / (substeps * S);
      const payload = { pixels };
      if (oneShot) {
        contactPixels.add(payload);
        this._ownedContactPixels.add(payload);
      }
      let rect, scissor;
      let left, right, bottom, top;
      commands.push(() => {
        if (!payload.pixels) return;
        if (!flowTexture) bindFlowTexture();
        this.ctx.uploads.bindFlow(flowTexture, false);
        try {
          this.uploadBrushFlow(width2, height, payload.pixels);
        } finally {
          if (oneShot) {
            payload.pixels = null;
            contactPixels.delete(payload);
            this._ownedContactPixels.delete(payload);
          }
        }
        rect = [(cr.x - x0) / (field.w * S), 1 - (cr.y + cr.h - y0) / (field.h * S), cr.w / (field.w * S), cr.h / (field.h * S)];
        left = Math.max(0, Math.floor((cr.x - x0) / S) - 1);
        right = Math.min(field.w, Math.ceil((cr.x + cr.w - x0) / S) + 1);
        bottom = Math.max(0, Math.floor(field.h - (cr.y + cr.h - y0) / S) - 1);
        top = Math.min(field.h, Math.ceil(field.h - (cr.y - y0) / S) + 1);
        scissor = [left, bottom, right - left, top - bottom];
      });
      const exchange = () => {
        if (!flowTexture) return;
        const passes = this.ctx.passes();
        if (!passes.diagnosticBrushMrt || !passes.brushPair(field, flowTexture, 4 * S, S, dep.out, field.pressure, col.out, field.band, rect, scissor, contactGain)) {
          passes.brushPass(field, flowTexture, 4 * S, S, col.out, field.band, dep.out, rect, scissor, col.out, contactGain);
          passes.brushPass(field, flowTexture, 4 * S, S, dep.out, field.pressure, dep.out, rect, scissor, col.out, contactGain);
        }
        field.pressure.copyRegionInto(dep.out, left, bottom, left, bottom, right - left, top - bottom);
        field.band.copyRegionInto(col.out, left, bottom, left, bottom, right - left, top - bottom);
        present(dep.out, null, col.out);
      };
      for (let sub = 0; sub < substeps; sub++) commands.push(contactPulseOp(exchange));
      return commands;
    };
    for (const contact of contacts) ops2.push(...contactOps(contact));
    for (const group of groups) {
      let generator = brushDragFieldWork(group.travel, group.rect);
      const releaseCpuField = () => {
        const work = generator;
        generator = null;
        releaseCpuFields.delete(releaseCpuField);
        if (work) {
          if (!runningCpuFields.has(work)) work.return(null);
        }
      };
      releaseCpuFields.add(releaseCpuField);
      const advanceField = () => {
        if (disposed || !generator) return;
        const work = generator;
        const started = performance.now();
        let result;
        runningCpuFields.add(work);
        try {
          do {
            result = work.next();
          } while (!result.done && !disposed && performance.now() - started < 2);
        } finally {
          runningCpuFields.delete(work);
        }
        if (disposed) {
          work.return(null);
          releaseCpuField();
          return;
        }
        if (!result.done) {
          queuedContinuation.push(advanceField);
          return;
        }
        releaseCpuField();
        if (!result.value) throw new Error("Missing generated contact field");
        queuedContinuation.push(...contactOps({ rect: group.rect, radius: group.radius, field: result.value }, true));
      };
      ops2.push(advanceField);
    }
    let dry = null;
    if (groupDry) {
      const dryDep = dep.out === field.a ? field.c : field.a;
      const dryCol = col.out === field.ca ? field.cc : field.ca;
      const dc = metadata2.dryCtx;
      this.groupTideOps(
        ops2,
        field,
        x0,
        y0,
        Math.max(radiusPx, dc?.radiusPx ?? 0) / S,
        Math.max(standing, dc?.standing ?? 0),
        metadata2.paints,
        dep.out,
        colour ? col.out : null,
        dryDep,
        dryCol,
        [field.b, field.cb, field.pressure],
        S,
        pureWater,
        skipZeroPigmentRim
      );
      dry = { dep: dryDep, col: dryCol };
    }
    const land = () => {
      if (groupDry) {
        const bx0 = Math.floor(bounds.minX) - pad, by0 = Math.floor(bounds.minY) - pad;
        const bx1 = Math.ceil(bounds.maxX) + pad, by1 = Math.ceil(bounds.maxY) + pad;
        for (const tile2 of targets) {
          const entry2 = scratch.peek(tile2.buffer);
          if (!entry2?.inkLoad) continue;
          const rx0 = Math.max(bx0, tile2.originX), ry0 = Math.max(by0, tile2.originY);
          const rx1 = Math.min(bx1, tile2.originX + tile2.buffer.width), ry1 = Math.min(by1, tile2.originY + tile2.buffer.height);
          if (rx1 <= rx0 || ry1 <= ry0) continue;
          const tx = rx0 - tile2.originX, ty = tile2.buffer.height - (ry1 - tile2.originY);
          if (!entry2.inkDry) {
            entry2.inkDry = this.ctx.pool().acquire(tile2.buffer.width, tile2.buffer.height);
            entry2.inkLoad.copyTo(entry2.inkDry);
          } else entry2.inkLoad.copyRegionInto(entry2.inkDry, tx, ty, tx, ty, rx1 - rx0, ry1 - ry0);
          if (entry2.inkColor) {
            if (!entry2.colorDry) {
              entry2.colorDry = this.ctx.pool().acquire(tile2.buffer.width, tile2.buffer.height);
              entry2.inkColor.copyTo(entry2.colorDry);
            } else entry2.inkColor.copyRegionInto(entry2.colorDry, tx, ty, tx, ty, rx1 - rx0, ry1 - ry0);
          }
        }
      }
      for (const { tile: tile2, ox0, oy0, ox1, oy1 } of overlaps) {
        const entry2 = scratch.peek(tile2.buffer);
        if (!entry2?.inkLoad) continue;
        const tx = ox0 - tile2.originX, ty = tile2.buffer.height - (oy1 - tile2.originY), tw = ox1 - ox0, th = oy1 - oy0;
        const runningFilm = entry2.filmGesture !== gesture && entry2.filmGesture === scratch.materialGesture && !!entry2.strokeInk && !!entry2.inkBase;
        const settledInk = runningFilm ? entry2.inkBase : entry2.inkLoad;
        const snap = snapshots.get(tile2.buffer);
        fromField(dep.out, a0, tile2, ox0, oy0, ox1, oy1, settledInk, snap?.ink ?? settledInk);
        if (entry2.inkSettled) settledInk.copyRegionInto(entry2.inkSettled, tx, ty, tx, ty, tw, th);
        if (S === 1) {
          const sx = ox0 - x0, sy = field.h - (oy1 - y0);
          entry2.coverage.copyRegionInto(field.mask, tx, ty, sx, sy, tw, th);
          this.ctx.passes().fieldOp(field.band, field.coverage, field.mask, 20, 0);
          field.band.copyRegionInto(entry2.coverage, sx, sy, tx, ty, tw, th);
        } else {
          const tmp = this.ctx.pool().acquire(tile2.buffer.width, tile2.buffer.height);
          this.ctx.passes().wcResample(tmp, tx, ty, tw, th, field.coverage, (ox0 - x0) / S, field.h - (oy1 - y0) / S, 1 / S, 2, null, entry2.coverage, fieldRect);
          tmp.copyRegionInto(entry2.coverage, tx, ty, tx, ty, tw, th);
          this.ctx.pool().release(tmp);
        }
        const settledColor = entry2.inkColor ? runningFilm && entry2.colorBase ? entry2.colorBase : entry2.inkColor : null;
        const rebuildColour = (to, from) => this.ctx.passes().fieldOp(to, from, from, 2, 1, { c: from, d: from, tau: singleTau, scissor: [tx, ty, tw, th] });
        if (settledColor) {
          if (S > 1 && !colour) rebuildColour(settledColor, settledInk);
          else fromField(col.out, ca0, tile2, ox0, oy0, ox1, oy1, settledColor, snap?.color ?? settledColor);
          if (entry2.colorSettled) settledColor.copyRegionInto(entry2.colorSettled, tx, ty, tx, ty, tw, th);
        }
        if (runningFilm) {
          const rect = [tx, ty, tw, th];
          this.ctx.passes().fieldOp(entry2.inkLoad, entry2.inkBase, entry2.strokeInk, 1, 1, { scissor: rect });
          if (entry2.inkColor && entry2.colorBase && entry2.strokeColor) this.ctx.passes().fieldOp(entry2.inkColor, entry2.colorBase, entry2.strokeColor, 1, 1, { scissor: rect });
        }
        if (dry) {
          if (!entry2.inkDry) {
            entry2.inkDry = this.ctx.pool().acquire(tile2.buffer.width, tile2.buffer.height);
            settledInk.copyTo(entry2.inkDry);
          } else settledInk.copyRegionInto(entry2.inkDry, tx, ty, tx, ty, tw, th);
          if (settledColor) {
            if (!entry2.colorDry) {
              entry2.colorDry = this.ctx.pool().acquire(tile2.buffer.width, tile2.buffer.height);
              settledColor.copyTo(entry2.colorDry);
            } else settledColor.copyRegionInto(entry2.colorDry, tx, ty, tx, ty, tw, th);
          }
          const ix0 = ox0 === x0 && x0 > minX ? ox0 + dryMargin : ox0, iy0 = oy0 === y0 && y0 > minY ? oy0 + dryMargin : oy0;
          const ix1 = ox1 === x1 && x1 < maxX ? ox1 - dryMargin : ox1, iy1 = oy1 === y1 && y1 < maxY ? oy1 - dryMargin : oy1;
          if (ix1 <= ix0 || iy1 <= iy0) continue;
          fromField(dry.dep, dep.out, tile2, ix0, iy0, ix1, iy1, entry2.inkDry, entry2.inkDry);
          if (entry2.colorDry) {
            if (S > 1 && !colour) rebuildColour(entry2.colorDry, entry2.inkDry);
            else fromField(dry.col, col.out, tile2, ix0, iy0, ix1, iy1, entry2.colorDry, entry2.colorDry);
          }
        }
      }
    };
    const finish = () => {
      if (disposed) return;
      try {
        const commands = scratch.trackRunningSource ? scratch.runningSourceCommands.slice() : [];
        if (commands.length) {
          for (const [, entry2] of scratch.tileEntries()) {
            if (entry2.coverageFilmGesture === scratch.materialGesture && entry2.coverageFilm) entry2.coverageFilm.copyTo(entry2.coverage);
          }
        }
        land();
        if (commands.length) {
          scratch.trackRunningSource = false;
          for (const [, entry2] of scratch.tileEntries()) {
            if (entry2.filmGesture === scratch.materialGesture && entry2.filmGesture !== gesture) {
              entry2.strokeInk?.clear();
              entry2.strokeColor?.clear();
              if (entry2.inkBase && entry2.inkLoad) entry2.inkBase.copyTo(entry2.inkLoad);
              if (entry2.colorBase && entry2.inkColor) entry2.colorBase.copyTo(entry2.inkColor);
            }
            if (entry2.solventGesture === scratch.materialGesture) {
              entry2.strokeSolvent?.clear();
              if (entry2.solventBase && entry2.solventLoad) entry2.solventBase.copyTo(entry2.solventLoad);
            }
          }
          for (const draw of commands) draw();
        }
      } finally {
        dispose();
        snapshots.clear();
      }
    };
    const compositeDomain = {
      minX: Math.min(bounds.minX, x0),
      minY: Math.min(bounds.minY, y0),
      maxX: Math.max(bounds.maxX, x1),
      maxY: Math.max(bounds.maxY, y1)
    };
    if (splitQuanta || lazyContacts || costPathsEnabled) {
      let insertedOffset = 0;
      const wrap = (physical, baseIndex) => {
        const entry2 = () => {
          if (disposed) return;
          physical();
          if (!queuedContinuation.length) return;
          const children = queuedContinuation;
          queuedContinuation = [];
          const at = baseIndex + insertedOffset;
          if (ops2[at] !== entry2) throw new Error("Missing continuation owner");
          const after = insertedOffset + children.length;
          const wrapped = children.map((child, j) => wrap(child, at + 1 + j - after));
          ops2.splice(at + 1, 0, ...wrapped);
          insertedOffset = after;
        };
        inheritSettleOpTags(physical, entry2);
        return entry2;
      };
      for (let i = 0; i < ops2.length; i++) ops2[i] = wrap(ops2[i], i);
    }
    return { ops: ops2, finish, dispose, compositeDomain };
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
  groupTideOps(ops2, field, x0, y0, radiusPx, standing, paints, dep, col, outDep, outCol, free, scale = 1, zeroPigment = false, skipZeroPigmentRim = false) {
    if (zeroPigment && skipZeroPigmentRim) {
      ops2.push(() => {
        outDep.clear();
        outCol.clear();
      });
      return;
    }
    const width = Math.max(1, Math.round(Math.max(2, Math.min(WC_RIM_BAND_PX, Math.round(radiusPx * scale / 5))) / scale));
    const costMaxIn = width + 3;
    const inSteps = width + 2;
    const [t1, t2, t3] = free;
    ops2.push(() => {
      this.ctx.passes().fieldOp(field.mask, field.coverage, field.coverage, 19, 2e-3, { dir: [1, 0] });
      this.ctx.passes().fieldOp(field.pressure, field.coverage, field.coverage, 19, 2e-3);
    });
    const pp = { src: field.mask, dst: field.band };
    for (let i = 0; i < inSteps; i += 4) {
      const n = Math.min(4, inSteps - i);
      ops2.push(() => {
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
    const share = watercolorRimShare(WC_TIDE_RIM, radiusPx, width) * tideWater;
    const costMax = 8;
    ops2.push(() => {
      this.ctx.passes().fieldOp(field.band, field.pressure, field.coverage, 6, 0, {
        c: field.mask,
        d: field.pressure,
        band: [0.5, width / costMaxIn],
        size: [1 / costMax, 1 / costMaxIn],
        origin: [standing, 0],
        dir: [1, 1],
        tau: [0, 0, 0],
        world: [x0 / scale, -(y0 / scale + field.h), scale]
      });
      blurTo(field.mask, field.band, t1, t3);
    });
    if (zeroPigment) {
      ops2.push(() => {
        outDep.clear();
        outCol.clear();
      });
      return;
    }
    const tide = (paint, out) => {
      this.ctx.passes().fieldOp(t1, paint, paint, 7, share, { d: field.band });
      blurTo(t2, t1, t2, t3);
      this.ctx.passes().fieldOp(out, paint, t2, 14, share, { c: field.mask, d: field.band });
    };
    ops2.push(() => tide(dep, outDep));
    if (col) {
      ops2.push(() => tide(col, outCol));
    } else {
      const only = [...paints][0];
      const tau = only ? pigmentAbsorption(only.split(",").map(Number)) : [0, 0, 0];
      ops2.push(() => this.ctx.passes().fieldOp(outCol, outDep, outDep, 2, 1, { c: outDep, d: outDep, tau: [tau[0], tau[1], tau[2]] }));
    }
  }
  /** Sampling and writing the same texture is forbidden. Without that alias,
   * a replace/scissored draw can land directly; the intermediate Q8 result
   * formerly copied verbatim has exactly the destination's RGBA8 format. */
  landResampled(target, base, source, old, tx, ty, w, h, fx, fy, ratio, clamp2) {
    const direct = this.diagnosticDirectResample && target !== base && target !== source && target !== old;
    if (direct) {
      this.ctx.passes().wcResample(target, tx, ty, w, h, source, fx, fy, ratio, 1, old, base, clamp2);
      this.resampleLandingStats.direct++;
      this.resampleLandingStats.copyPixelsAvoided += w * h;
      return;
    }
    const tmp = this.ctx.pool().acquire(target.width, target.height);
    try {
      this.ctx.passes().wcResample(tmp, tx, ty, w, h, source, fx, fy, ratio, 1, old, base, clamp2);
      tmp.copyRegionInto(target, tx, ty, tx, ty, w, h);
      this.resampleLandingStats.temporary++;
    } finally {
      this.ctx.pool().release(tmp);
    }
  }
  /** Complete RGBA upload: same bytes, order, filtering and texture name.
   * The cache describes actual allocated storage, never logical field size. */
  uploadBrushFlow(width, height, pixels) {
    if (this.diagnosticReuseFlowStorage && this._brushFlowSize[0] === width && this._brushFlowSize[1] === height) {
      this.ctx.uploads.uploadFlow(this._brushFlowTex, width, height, pixels, true);
      this.flowUploadStats.updates++;
    } else {
      this.ctx.uploads.uploadFlow(this._brushFlowTex, width, height, pixels, false);
      this.flowUploadStats.allocations++;
      this._brushFlowSize = [width, height];
    }
    this.flowUploadStats.bytes += pixels.byteLength;
  }
  _releaseContactPixels() {
    for (const payload of this._ownedContactPixels) payload.pixels = null;
    this._ownedContactPixels.clear();
  }
  destroyTextures() {
    this._brushFlowSize = [0, 0];
    this._contactFieldCache.clear();
    this._releaseContactPixels();
    for (const scratch of this._coverageOwners) scratch.releaseRunningCoverage();
    this._coverageOwners.clear();
    for (const field of this._ownedInputs) field.destroy();
    this._ownedInputs.clear();
    this.ctx.uploads.destroy(this._brushFlowTex);
    this.ctx.uploads.destroy(this._foreignWaterTex);
  }
  forgetTextures() {
    this._brushFlowSize = [0, 0];
    this._contactFieldCache.clear();
    this._releaseContactPixels();
    for (const scratch of this._coverageOwners) scratch.releaseRunningCoverage(true);
    this._coverageOwners.clear();
    this._ownedInputs.clear();
    this._brushFlowTex = null;
    this._foreignWaterTex = null;
  }
};

// docs/qa/harness/728-native-end-to-end/commonSourcePlannerTrace.ts
var checkpointPath = process.argv[2];
var outputPath = process.argv[3];
if (!checkpointPath || !outputPath) throw Error("Explicit durable checkpoint and trace output required");
var packet = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
var plannerPath = "apps/web/src/engine/src/raster/CanonicalWatercolorSettlePlan.ts";
var plannerBytes = fs.readFileSync(plannerPath);
var frozenPlanner = execFileSync("git", ["show", packet.code + ":" + plannerPath]);
if (!plannerBytes.equals(frozenPlanner)) throw Error("Shared CPU planner differs from captured producer");
var plannerSha256 = createHash("sha256").update(plannerBytes).digest("hex");
var f = traceFixture(false, false, true, false, false);
var id = 1e3;
var mk = (w, h) => new TraceBuffer(++id, w, h, f.record);
var aliases = /* @__PURE__ */ new Map();
var entry = {};
for (const role of packet.payload.fields) {
  if (role.presence === "field") {
    if (!aliases.has(role.alias)) aliases.set(role.alias, mk(role.width, role.height));
    entry[role.role] = aliases.get(role.alias);
  } else if (role.presence === "null") entry[role.role] = null;
}
var tile = entry.target;
delete entry.target;
entry.filmGesture = packet.payload.filmGesture;
entry.solventGesture = packet.payload.solventGesture;
entry.coverageFilmGesture = packet.payload.coverageFilmGesture;
var metadata = JSON.parse(packet.payload.metadataJson);
Object.assign(f.scratch, metadata, { paints: new Set(metadata.paints), materialGesture: packet.payload.materialGesture, pigmentInputsKnownZero: packet.payload.pigmentInputsKnownZero, peek: () => entry, *tileEntries() {
  yield [tile, entry];
} });
f.context.fieldFor = () => Object.fromEntries([["w", 1536], ["h", 1536], ...["a", "b", "c", "ca", "cb", "cc", "coverage", "mask", "pressure", "band"].map((role) => [role, mk(1536, 1536)])]);
f.context.paperWorldSize = () => packet.config.paperWorld;
f.context.ab = () => packet.config.ab;
f.context.gradientFibres = () => packet.config.gradientFibres;
f.context.shouldPreview = () => false;
var plan = new CanonicalWatercolorSettlePlan(f.context);
Object.assign(plan, packet.config.plannerFlags);
var args = JSON.parse(packet.payload.scalarsJson);
var job = plan.prepare(f.scratch, [{ buffer: tile, originX: 0, originY: 0, contentRect: null }], ...args, void 0, false, f.scratch);
if (!job) throw Error("Actual packet job missing");
var ops = [];
for (let i = 0; i < job.ops.length; i++) {
  const offset = f.events.length;
  job.ops[i]();
  ops.push({ index: i, events: f.events.slice(offset) });
}
job.dispose();
plan.destroyTextures();
fs.writeFileSync(outputPath, JSON.stringify({ scope: "CPU shared planner chronology from actual same-device source packet; no pixel proof", sourceCode: packet.code, packetSha256: createHash("sha256").update(fs.readFileSync(checkpointPath)).digest("hex"), plannerSha256, ops }, null, 2));
console.log(JSON.stringify(ops.map((op) => ({ index: op.index, events: op.events.map((e) => [e[0], e[0] === "fieldOp" ? e[4] : null]) }))));
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
