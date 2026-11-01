/// <reference types="node" />
import { createHash } from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import genuine from "./fixtures/sourceDefaultAutoData/textureReptile.pressure.compiled3.metadata.json" with { type: "json" };
import old from "./fixtures/sourceDefaultAutoData/textureReptile.pressure.metadata.json" with { type: "json" };
import type { BrushDescriptor } from "./brushes.js";
import { canonicalBrushDescriptorJSON } from "./canonicalBrushDescriptor.js";
import { canonicalDefaultAutoPressureTextureSourceBinding, canonicalDefaultAutoSourceBinding, canonicalAutoCost } from "./canonicalDefaultAutoMaterial.js";
import { canonicalPressureCurvePrimaryTexturePin, canonicalFixedPrimaryTexturePin, canonicalPrimaryTexturePin } from "./canonicalPrimaryTexture.js";
import { sourceAutoGeometry } from "./sourceAutoGeometry.js";
import * as c from "./canonicalMaterialCodec.js";
import { decodeCanonicalStrokeFrame, CANONICAL_STROKE_GENERIC_SC_RASTER_PROFILE as G, CANONICAL_STROKE_BROWSER_FLOAT_RASTER_PROFILE as B } from "./canonicalStrokeFrame.js";
const descriptor = genuine.descriptor as unknown as BrushDescriptor;
const hash = (d: BrushDescriptor) => createHash("sha256").update(canonicalBrushDescriptorJSON(d)).digest("hex");
const binding = (browser = false) => canonicalDefaultAutoPressureTextureSourceBinding(descriptor, hash(descriptor), browser ? "browser-number-coverage-v1" : "neon64-f32-fma-v1", genuine.patternAsset, browser ? B : G);
const asset = {
  id: "asset:" + "ab".repeat(32),
  size: 4,
  x: 0,
  y: 0,
  width: 3,
  height: 2
};
function context(browser = false): c.CanonicalMaterialContextV5 {
  return c.canonicalPressureTexturedSourceMaterialContext({
    version: 5,
    assets: [asset],
    primarySource: binding(browser),
    primaryTexture: {
      kind: "canvasTexture",
      asset: asset.id,
      law: "subtract-u8-v1",
      width: 3,
      height: 2,
      periodX: 3,
      periodY: 2,
      offsetX: 0,
      offsetY: 0,
      strength: "source-pressure-curve-v1"
    },
    budget: {
      workUnits: 64000000,
      outputBytes: 16000000,
      drawPixels: 16000000
    }
  });
}
const empty = (): c.CanonicalMaterialBuildInputV5 => ({
  masked: false,
  entry: {
    phase: "between"
  },
  draws: [],
  fences: []
});
function input(values = [0, 0.5, 1], browser = false): c.CanonicalMaterialBuildInputV5 {
  const pin = binding(browser), g = sourceAutoGeometry({
    kind: "auto",
    profile: "default-auto-qt5-arm64-f64-v1",
    diameter: pin.source.diameter,
    ratio: pin.source.ratio,
    spikes: 2,
    scale: pin.brushScale,
    angle: pin.brushAngle
  }, {
    scale: 0.1,
    ratio: 1,
    rotation: 0
  });
  const recipe = {
    kind: "defaultAuto" as const,
    source: pin.source,
    coverageProfile: pin.coverageProfile,
    brushScale: pin.brushScale,
    brushAngle: pin.brushAngle,
    scale: 0.1,
    ratio: 1,
    rotation: -0,
    subX: 0,
    subY: 0,
    width: g.maskSize[0],
    height: g.maskSize[1],
    mirrorH: false,
    mirrorV: false
  };
  return {
    masked: false,
    entry: {
      phase: "primary",
      group: 0
    },
    draws: values.map((grainDepth, x) => ({
      recipe,
      role: "primary",
      x,
      y: -1,
      opacity: 1,
      flow: -0,
      grainDepth
    })),
    fences: []
  };
}
const unpack = (p: string, context: unknown) => Reflect.apply(c.unpackCanonicalMaterial, undefined, [p, context]);
const raw = (p: string) => Uint8Array.from(atob(p.slice(2)), x => x.charCodeAt(0));
const mutate = (p: string, fn: (v: DataView, b: Uint8Array) => void) => {
  const b = raw(p);
  fn(new DataView(b.buffer), b);
  return p.slice(0, 2) + btoa(String.fromCharCode(...b));
};
const composition = {
  mode: "wash" as const,
  alphaDarken: "hard" as const,
  outerResourceOpacity: 1,
  outerBlend: "over" as const
};
const envelope = (p: string, browser = false) => ({
  version: 2,
  rasterProfile: browser ? B : G,
  brush: "brush:owned@37",
  strokeId: "s",
  frameOrdinal: 0,
  pigmentRgb8: [1, 2, 3],
  composition,
  materialPacked: p
});
const trusted = (material: unknown, browser = false) => ({
  materialVersion: 5,
  rasterProfile: browser ? B : G,
  brush: "brush:owned@37",
  strokeId: "s",
  frameOrdinal: 0,
  pigmentRgb8: [1, 2, 3],
  composition,
  material
});
describe("standalone pressure material5 closed DATA codec", () => {
  it("binds genuine normal importer37 compiled3 without granting old source2/fixed4", () => {
    expect(binding().descriptorSha256).toBe(hash(descriptor));
    expect(descriptor.version).toBe(37);
    expect(() => canonicalDefaultAutoSourceBinding(descriptor, hash(descriptor), "neon64-f32-fma-v1", G)).toThrow();
    expect(() => canonicalDefaultAutoPressureTextureSourceBinding(old.descriptor as unknown as BrushDescriptor, hash(old.descriptor as unknown as BrushDescriptor), "neon64-f32-fma-v1", old.patternAsset, G)).toThrow();
    expect(() => canonicalDefaultAutoPressureTextureSourceBinding(descriptor, "bad", "neon64-f32-fma-v1", genuine.patternAsset, G)).toThrow();
    expect(() => canonicalDefaultAutoPressureTextureSourceBinding(descriptor, hash(descriptor), "browser-number-coverage-v1", genuine.patternAsset, G)).toThrow();
  });
  it("keeps distinct pin tokens and oneasset metadata without programs", () => {
    const p = context().primaryTexture;
    expect(() => canonicalFixedPrimaryTexturePin(p, asset)).toThrow();
    expect(() => canonicalPrimaryTexturePin(p, asset)).toThrow();
    expect(() => canonicalPressureCurvePrimaryTexturePin({
      ...p,
      strength: "fixed-one-v1"
    }, [asset])).toThrow();
    expect(() => canonicalPressureCurvePrimaryTexturePin(p, [])).toThrow();
    expect(Object.isFrozen(context().primarySource.source)).toBe(true);
    expect(context()).not.toHaveProperty("coefficients");
    expect(context()).not.toHaveProperty("program");
  });
  it("pins exact64byte empty5 golden and emits actual96+40 layout", () => {
    const e = c.buildCanonicalMaterial(empty(), context());
    expect(e.packed).toBe("5|Q01BVAUAAQAAAAAAAAAAAAAAAAAAAAAAq6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6sDAAIAAAAAAA==");
    const v = c.buildCanonicalMaterial(input(), context()), b = raw(v.packed), d = 24 + 40 + 96;
    expect(b.length).toBe(d + 3 * 40);
    expect(b[4]).toBe(5);
    expect(b[6]).toBe(1);
    expect(v.frame.definitions).toHaveLength(1);
    expect(v.frame.draws.map(v => v.grainDepth)).toEqual([0, 0.5, 1]);
    expect(Object.is(v.frame.draws[0].flow, -0)).toBe(true);
    expect(Object.is(v.frame.definitions[0].rotation, -0)).toBe(true);
    expect(c.captureCanonicalPressureTexturedSourceFrame(v.frame, context())).toEqual(v.frame);
  });
  it.each([NaN, Infinity, -Infinity, -0.01, 1.01])("rejects nonfinite/out of range grain %s", v => {
    expect(() => c.buildCanonicalMaterial(input([v]), context())).toThrow();
    const p = c.buildCanonicalMaterial(input([1]), context()).packed;
    expect(() => unpack(mutate(p, d => d.setFloat64(24 + 40 + 96 + 32, v, true)), context())).toThrow();
  });
  it("charges fullpattern work for every reuse including zero strength", () => {
    const i = input(), r = i.draws[0].recipe, base = canonicalAutoCost(r, binding()), work = base.workUnits + 3 * c.canonicalPrimaryTextureDrawWork(r.width, r.height);
    const ctx = {
      ...context(),
      budget: {
        ...context().budget,
        workUnits: work
      }
    };
    expect(() => c.buildCanonicalMaterial(i, ctx)).not.toThrow();
    expect(() => c.buildCanonicalMaterial(i, {
      ...ctx,
      budget: {
        ...ctx.budget,
        workUnits: work - 1
      }
    })).toThrow();
    const p = c.buildCanonicalMaterial(i, ctx).packed;
    expect(() => unpack(p, {
      ...ctx,
      budget: {
        ...ctx.budget,
        workUnits: work - 1
      }
    })).toThrow();
  });
  it("captures context/frame OWN DATA before callbacks and never invokes accessors", () => {
    const getter = vi.fn(() => null), ctx = {
      ...context()
    };
    Object.defineProperty(ctx, "primaryTexture", {
      get: getter
    });
    expect(() => c.canonicalPressureTexturedSourceMaterialContext(ctx)).toThrow();
    expect(getter).not.toHaveBeenCalled();
    const frame = c.buildCanonicalMaterial(input(), context()).frame;
    Object.defineProperty(frame.draws[0], "grainDepth", {
      get: getter
    });
    expect(() => c.captureCanonicalPressureTexturedSourceFrame(frame, context())).toThrow();
    expect(getter).not.toHaveBeenCalled();
    const original = {
      ...context(),
      budget: {
        ...context().budget
      }
    }, captured = c.canonicalPressureTexturedSourceMaterialContext(original);
    original.budget.workUnits = 0;
    expect(captured.budget.workUnits).toBeGreaterThan(0);
  });
  it("refuses cross4/5 bytes and fixed4 dynamic strength; leaves4 golden unchanged", () => {
    const ctx = context(), four = {
      ...ctx,
      version: 4,
      primaryTexture: {
        ...ctx.primaryTexture,
        strength: "fixed-one-v1"
      }
    };
    const p = c.buildCanonicalMaterial(input(), ctx).packed;
    expect(() => unpack(p, four)).toThrow();
    const old = Reflect.apply(c.buildCanonicalMaterial, undefined, [empty(), four]).packed;
    expect(old.startsWith("4|")).toBe(true);
    expect(() => unpack(old, ctx)).toThrow();
    expect(() => Reflect.apply(c.buildCanonicalMaterial, undefined, [input([0.5]), four])).toThrow();
  });
  it.each([false, true])("uses explicit5 same numeric coverage and closed envelope (%s)", browser => {
    const ctx = context(browser), p = c.buildCanonicalMaterial(input([0.5], browser), ctx).packed;
    expect(Reflect.apply(decodeCanonicalStrokeFrame, undefined, [envelope(p, browser), trusted(ctx, browser)]).frame.profile).toBe(c.CANONICAL_PRESSURE_TEXTURED_SOURCE_MATERIAL_PROFILE);
    for (const version of [2, 3, 4, undefined])
      expect(() => Reflect.apply(decodeCanonicalStrokeFrame, undefined, [envelope(p, browser), {
          ...trusted(ctx, browser),
          materialVersion: version
        }])).toThrow();
    expect(() => Reflect.apply(decodeCanonicalStrokeFrame, undefined, [envelope(p, !browser), trusted(ctx, !browser)])).toThrow();
  });
  it("rejects malformed5 header/reserved bytes/masked/extra asset/foreign source", () => {
    const p = c.buildCanonicalMaterial(input([1]), context()).packed;
    for (const fn of [(_v: DataView, b: Uint8Array) => b[6] = 0, (_v: DataView, b: Uint8Array) => b[7] = 1, (_v: DataView, b: Uint8Array) => b[14] = 1, (_v: DataView, b: Uint8Array) => b[64] = 3, (_v: DataView, b: Uint8Array) => b[65] = 4])
      expect(() => unpack(mutate(p, fn), context())).toThrow();
    expect(() => c.canonicalPressureTexturedSourceMaterialContext({
      ...context(),
      assets: []
    })).toThrow();
    expect(() => c.canonicalPressureTexturedSourceMaterialContext({
      ...context(),
      primarySource: {
        ...binding(),
        kind: "gaussianAuto"
      }
    })).toThrow();
  });
});
