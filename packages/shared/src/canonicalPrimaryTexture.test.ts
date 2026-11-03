import { describe, expect, it, vi } from 'vitest'
import { canonicalMultiplyPrimaryTexturePin, canonicalRecordedPrimaryTexturePin, canonicalMultiplyTextureStrengthU8, canonicalPrimaryTextureMultiplyU8, canonicalPrimaryTexturePin, canonicalPrimaryTextureStrengthU8, canonicalPrimaryTextureSubtractU8, canonicalPrimaryTextureCell } from './canonicalPrimaryTexture.js'
import type { CanonicalMaterialAsset } from './canonicalMaterialCodec.js'

const id = 'asset:' + 'a'.repeat(64)
const pin = () => ({ kind: 'canvasTexture', asset: id, law: 'subtract-u8-v1', width: 252, height: 252,
  periodX: 252, periodY: 252, offsetX: 0, offsetY: 0, strength: 'pressure-identity-v1' })
const asset = (): CanonicalMaterialAsset => ({ id, size: 256, x: 0, y: 0, width: 252, height: 252 })

// Independent integer/rational rounding of the binary64 scaled value.
function strengthReference(input: number): number {
  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, input * 255, false)
  const bits = view.getBigUint64(0, false), exponent = Number((bits >> 52n) & 2047n)
  if (!exponent) return 0
  const significand = (bits & ((1n << 52n) - 1n)) | (1n << 52n)
  const shift = 1075 - exponent
  if (shift <= 0) return Number(significand << BigInt(-shift))
  const denominator = 1n << BigInt(shift), whole = significand / denominator, remainder = significand % denominator
  return Number(whole + (remainder * 2n > denominator || remainder * 2n === denominator && whole % 2n === 1n ? 1n : 0n))
}
function adjacent(value: number, direction: -1 | 1): number {
  const view = new DataView(new ArrayBuffer(8)); view.setFloat64(0, value, false)
  view.setBigUint64(0, view.getBigUint64(0, false) + BigInt(direction), false)
  return view.getFloat64(0, false)
}

describe('canonical primary texture metadata', () => {
  it('pins exact top-left pattern while preserving square padding and independent immutable capture', () => {
    const input = pin(), trusted = { ...asset() }, captured = canonicalPrimaryTexturePin(input, trusted)
    expect(captured).toEqual(input); expect(captured).not.toBe(input); expect(Object.isFrozen(captured)).toBe(true)
    input.offsetX = 1; trusted.width = 1
    expect(captured.width).toBe(252); expect(captured.offsetX).toBe(0)
    expect(canonicalPrimaryTexturePin(Object.freeze(Object.assign(Object.create(null), pin())),
      Object.freeze(Object.assign(Object.create(null), asset())))).toEqual(pin())
  })
  it('accepts bounds and reduced nonzero offsets without binding a stock CAS', () => {
    const input = { ...pin(), asset: 'asset:' + 'f'.repeat(64), width: 4096, height: 256, periodX: 4096, periodY: 256, offsetX: 4095, offsetY: 255 }
    expect(canonicalPrimaryTexturePin(input, { ...asset(), id: input.asset, size: 4096, width: 4096, height: 256 })).toEqual(input)
    expect(canonicalPrimaryTexturePin({ ...pin(), width: 1, height: 1, periodX: 1, periodY: 1 }, { ...asset(), size: 1, width: 1, height: 1 }).width).toBe(1)
  })
  it('refuses unknown keys, symbols, custom prototypes and inherited fields', () => {
    for (const input of [{ ...pin(), soft: false }, { ...pin(), [Symbol('hidden')]: 0 }, Object.assign(Object.create({ inherited: true }), pin()), []]) {
      expect(() => canonicalPrimaryTexturePin(input, asset())).toThrow(TypeError)
    }
    const inherited = Object.assign(Object.create({ asset: id }), pin()); delete inherited.asset
    expect(() => canonicalPrimaryTexturePin(inherited, asset())).toThrow(TypeError)
  })
  it('rejects pin/asset accessors without invoking them, even if it would return valid data', () => {
    for (const [input, trusted, field] of [[pin(), asset(), 'asset'], [pin(), asset(), 'width']] as const) {
      const getter = vi.fn(() => field === 'asset' ? id : 252)
      Object.defineProperty(input, field, { get: getter })
      expect(() => canonicalPrimaryTexturePin(input, trusted)).toThrow(TypeError); expect(getter).not.toHaveBeenCalled()
    }
    const trusted = asset(), getter = vi.fn(() => 252)
    Object.defineProperty(trusted, 'width', { get: getter })
    expect(() => canonicalPrimaryTexturePin(pin(), trusted)).toThrow(TypeError); expect(getter).not.toHaveBeenCalled()
  })
  it('rejects wrong CAS/rectangle, mismatched period, unbounded domain and implicit fallback', () => {
    for (const patch of [{ law: 'multiply' }, { strength: 'fixed' }, { asset: 'asset:' + 'A'.repeat(64) }, { width: 0 }, { width: 4097 },
      { width: 4096, height: 257, periodX: 4096, periodY: 257 }, { periodX: 256 }, { periodY: Infinity }, { offsetX: -1 }, { offsetY: 252 }, { offsetX: .5 }, { offsetX: -0 }]) {
      expect(() => canonicalPrimaryTexturePin({ ...pin(), ...patch }, asset())).toThrow(TypeError)
    }
    for (const patch of [{ id: 'asset:' + 'b'.repeat(64) }, { x: 1 }, { y: 1 }, { x: -0 }, { width: 256 }, { height: 251 }, { size: 128 }, { size: 4097 }, { extra: 0 }]) {
      expect(() => canonicalPrimaryTexturePin(pin(), { ...asset(), ...patch })).toThrow(TypeError)
    }
  })
})

describe('explicit U8 subtract law', () => {
  it('quantizes real ties and adjacent values using independent binary rational reference', () => {
    expect(canonicalPrimaryTextureStrengthU8(0)).toBe(0); expect(canonicalPrimaryTextureStrengthU8(1)).toBe(255)
    expect(canonicalPrimaryTextureStrengthU8(.5)).toBe(128)
    let exactTies = 0
    for (let n = 0; n < 255; n++) {
      const at = (n + .5) / 255
      if (at * 255 === n + .5) { exactTies++; expect(canonicalPrimaryTextureStrengthU8(at)).toBe(n % 2 ? n + 1 : n) }
      for (const value of [adjacent(at, -1), at, adjacent(at, 1)]) expect(canonicalPrimaryTextureStrengthU8(value)).toBe(strengthReference(value))
    }
    expect(exactTies).toBeGreaterThan(100)
    expect(Object.is(canonicalPrimaryTextureStrengthU8(-0), 0)).toBe(true)
    const source = Object.freeze({ pressure: -0 }); canonicalPrimaryTextureStrengthU8(source.pressure)
    expect(Object.is(source.pressure, -0)).toBe(true)
  })
  it('refuses nonfinite/out-of-domain strength and non-U8 mask inputs', () => {
    for (const value of [NaN, Infinity, -Infinity, -.01, 1.01, '0' as unknown as number]) expect(() => canonicalPrimaryTextureStrengthU8(value)).toThrow(TypeError)
    for (const value of [-1, 256, .5, NaN, Infinity, -0]) for (let i = 0; i < 3; i++) {
      const args: [number, number, number] = [255, 100, 128]; args[i] = value
      expect(() => canonicalPrimaryTextureSubtractU8(...args)).toThrow(TypeError)
    }
  })
  it('subtracts before composition, with threshold and no texture bypass at zero strength', () => {
    expect(canonicalPrimaryTextureSubtractU8(255, 0, 0)).toBe(0)
    expect(canonicalPrimaryTextureSubtractU8(255, 100, 255)).toBe(155)
    expect(canonicalPrimaryTextureSubtractU8(200, 100, 128)).toBe(0)
    for (let strength = 0; strength <= 255; strength++) for (const texture of [0, 1, 127, 254, 255]) {
      const threshold = texture + 255 - strength
      for (const mask of [0, 1, 127, 254, 255]) {
        const result = canonicalPrimaryTextureSubtractU8(mask, texture, strength)
        expect(result).toBe(mask <= threshold ? 0 : mask - threshold)
        expect(Number.isInteger(result) && result >= 0 && result <= 255).toBe(true)
      }
    }
  })
})

describe('top-left canvas cell phase', () => {
  it('matches exact integer modulo for signed/large coordinates without x+offset overflow', () => {
    for (const world of [Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER + 1, -100000000, -253, -252, -1, -0, 0, 1, 251, 252, 100000000, Number.MAX_SAFE_INTEGER]) {
      for (const size of [1, 252, 4096]) for (const offset of [0, size - 1]) {
        const bigSize = BigInt(size), expected = Number(((BigInt(world) + BigInt(offset)) % bigSize + bigSize) % bigSize)
        expect(canonicalPrimaryTextureCell(world, size, offset)).toBe(expected)
      }
    }
    expect(Object.is(canonicalPrimaryTextureCell(-252, 252, 0), 0)).toBe(true)
    expect(canonicalPrimaryTextureCell(-1, 252, 0)).toBe(251) // No implicit bottom-up Y flip.
  })
  it('refuses unsafe coordinates and unreduced offsets rather than repairing them', () => {
    for (const world of [Number.MAX_SAFE_INTEGER + 1, .5, NaN, Infinity]) expect(() => canonicalPrimaryTextureCell(world, 252, 0)).toThrow(TypeError)
    for (const [size, offset] of [[0, 0], [4097, 0], [1.5, 0], [252, -1], [252, 252], [252, .5], [252, -0]]) expect(() => canonicalPrimaryTextureCell(0, size, offset)).toThrow(TypeError)
  })
})

describe('named native hard-multiply grain law (metadata only)', () => {
  const grainAsset = () => ({ id, size:512, x:0, y:0, width:307, height:307 })
  const grainPin = () => ({ kind:'canvasTexture', asset:id, law:'hard-multiply-u8-native-v1', width:307, height:307,
    periodX:307, periodY:307, phase:{kind:'resolved-stroke-phase-v1',x:306,y:1}, strength:'recorded-grain-v1' })
  it('matches pinned native integer boundary vectors, not nested rounded multiplication', () => {
    const vectors = [[0,255,255,0],[255,0,255,0],[255,255,0,0],[255,255,1,1],[255,255,128,128],[255,255,255,255],
      [255,128,1,1],[255,128,128,64],[128,128,128,32],[1,128,128,0],[128,1,128,0],[128,128,1,0],[1,128,255,1],[254,255,255,254]]
    for(const [m,t,s,q] of vectors) expect(canonicalPrimaryTextureMultiplyU8(m,t,s)).toBe(q)
    // Independent nearest pair reference: this intentionally differs from native triple rounding.
    const roundedPair = (a:number,b:number) => Math.floor((a*b+127)/255)
    expect(roundedPair(roundedPair(1,128),128)).toBe(1)
    expect(canonicalPrimaryTextureMultiplyU8(1,128,128)).toBe(0)
    expect(255**3+32603+Math.floor((255**3+32603)/128)).toBe(16743774)
    expect(16743774).toBeLessThan(2**24)
  })
  it('keeps native half-up separate from historical ties-even and preserves caller signed zero', () => {
    expect(canonicalPrimaryTextureStrengthU8(.3)).toBe(76)
    expect(canonicalMultiplyTextureStrengthU8(.3)).toBe(77)
    for(const [s,q] of [[0,0],[1/255,1],[1/510,1],[.5,128],[1,255]])expect(canonicalMultiplyTextureStrengthU8(s)).toBe(q)
    expect(canonicalMultiplyTextureStrengthU8(adjacent(.3,-1))).toBe(76)
    expect(canonicalMultiplyTextureStrengthU8(adjacent(.3,1))).toBe(77)
    const input=Object.freeze({s:-0});expect(Object.is(canonicalMultiplyTextureStrengthU8(input.s),0)).toBe(true)
    expect(Object.is(input.s,-0)).toBe(true)
    for(const s of [NaN,Infinity,-Infinity,-.01,1.01,'0' as unknown as number])expect(()=>canonicalMultiplyTextureStrengthU8(s)).toThrow(TypeError)
    for(const value of [-1,256,.5,NaN,Infinity,-0,'0' as unknown as number])for(let axis=0;axis<3;axis++){
      const args:[number,number,number]=[255,128,128];args[axis]=value
      expect(()=>canonicalPrimaryTextureMultiplyU8(...args)).toThrow(TypeError)
    }
  })
  it('captures own immutable crop307/phase data without treating padding512 as period', () => {
    const input=grainPin(),trusted=grainAsset(),captured=canonicalMultiplyPrimaryTexturePin(input,trusted)
    expect(captured).toEqual(input);expect(Object.isFrozen(captured)).toBe(true);expect(Object.isFrozen(captured.phase)).toBe(true)
    input.phase.x=0;input.width=1;trusted.width=1
    expect(captured.width).toBe(307);expect(captured.phase.x).toBe(306)
    expect(canonicalPrimaryTextureCell(-1,307,captured.phase.x)).toBe(305)
    for(const patch of [{periodX:512},{periodY:512},{width:512},{law:'subtract-u8-v1'},{strength:'pressure-identity-v1'},{extra:0},
      {phase:{kind:'resolved-stroke-phase-v1',x:307,y:0}},{phase:{kind:'resolved-stroke-phase-v1',x:-0,y:0}}])
      expect(()=>canonicalMultiplyPrimaryTexturePin({...grainPin(),...patch},grainAsset())).toThrow(TypeError)
    expect(()=>canonicalMultiplyPrimaryTexturePin(grainPin(),{...grainAsset(),id:'asset:'+'b'.repeat(64)})).toThrow(TypeError)
    expect(()=>canonicalMultiplyPrimaryTexturePin(grainPin(),{...grainAsset(),size:256})).toThrow(TypeError)
  })
  it('never calls pin/phase/asset accessors and retains strict old/new law separation', () => {
    const getter=vi.fn(()=>307)
    for(const [target,key] of [['pin','width'],['phase','x'],['asset','width']] as const){
      const p=grainPin(),a=grainAsset();Object.defineProperty(target==='pin'?p:target==='phase'?p.phase:a,key,{get:getter,enumerable:true})
      expect(()=>canonicalMultiplyPrimaryTexturePin(p,a)).toThrow(TypeError)
    }
    expect(getter).not.toHaveBeenCalled()
    expect(()=>canonicalMultiplyPrimaryTexturePin(Object.create(grainPin()),grainAsset())).toThrow(TypeError)
    const old={...grainPin(),law:'subtract-u8-v1'}
    expect(canonicalRecordedPrimaryTexturePin(old,grainAsset()).law).toBe('subtract-u8-v1')
    expect(()=>canonicalRecordedPrimaryTexturePin(grainPin(),grainAsset())).toThrow(TypeError)
    expect(()=>canonicalMultiplyPrimaryTexturePin(old,grainAsset())).toThrow(TypeError)
    expect(()=>canonicalPrimaryTexturePin(grainPin(),grainAsset())).toThrow(TypeError)
    expect(()=>canonicalMultiplyPrimaryTexturePin(pin(),asset())).toThrow(TypeError)
  })
})
