import { describe, expect, it } from 'vitest'

import type { Dab, StrokeOperation } from './index.js'
import { strokeDabs } from './index.js'
import { packDabs, unpackDabs } from './dabCodec.js'

/** A dab shaped like a real one: world coordinates far from the origin (an
 *  infinite room's camera goes wherever it likes), fractional everything, and
 *  a `t` that grows along the stroke. */
function dabAt(i: number): Dab {
  return {
    x: 98765.4321 + i * 1.7,
    y: -54321.9876 + i * 2.3,
    pressure: 0.4 + (i % 7) / 20,
    tiltX: -12.5 + (i % 5),
    tiltY: 33.25 - (i % 3),
    size: 8.375,
    aspectRatio: 1.25,
    angle: -0.7853981,
    opacity: 0.6125,
    t: i * 3.5,
  }
}

function strokeOp(fields: Partial<StrokeOperation>): StrokeOperation {
  return {
    id: 'op1', userId: 'u1', timestamp: 0,
    type: 'stroke', layerId: 'L', tool: 'pencil', preset: 'HB',
    color: [0, 0, 0],
    ...fields,
  } as StrokeOperation
}

describe('dab packing (#366)', () => {
  it('round-trips every field', () => {
    const dabs = Array.from({ length: 64 }, (_, i) => dabAt(i))
    const back = unpackDabs(packDabs(dabs))
    expect(back).toHaveLength(dabs.length)
    // Exactly the float32 value, not merely a close one: Math.fround is what
    // the encoder does to every field, so this pins the rounding as a defined
    // property rather than tolerating an unknown amount of drift. A tolerance
    // would also have to be scaled by magnitude — float32 resolves ~0.0024 at
    // a world coordinate near 100 000 — which hides exactly the bug worth
    // catching, a field packed or read in the wrong slot.
    for (let i = 0; i < dabs.length; i++) {
      for (const key of Object.keys(dabs[i]) as Array<keyof Dab>) {
        expect(back[i][key]).toBe(Math.fround(dabs[i][key]))
      }
    }
  })

  it('keeps world coordinates well under a pixel even far from the origin', () => {
    // The one field where float32 could plausibly matter: an infinite room's
    // camera can sit a long way out, and a dab landing half a pixel off would
    // be a visible change to what was drawn.
    const far: Dab = { ...dabAt(0), x: 987654.321, y: -876543.219 }
    const [back] = unpackDabs(packDabs([far]))
    expect(Math.abs(back.x - far.x)).toBeLessThan(0.1)
    expect(Math.abs(back.y - far.y)).toBeLessThan(0.1)
  })

  it('handles an empty stroke without producing something undecodable', () => {
    expect(unpackDabs(packDabs([]))).toEqual([])
  })

  it('survives a stroke long enough to break a naive base64 conversion', () => {
    // 20k dabs is an ordinary low-zoom stroke, and ~800 KB of bytes —
    // String.fromCharCode(...bytes) throws well before that, which is why the
    // encoder chunks.
    const dabs = Array.from({ length: 20_000 }, (_, i) => dabAt(i))
    expect(unpackDabs(packDabs(dabs))).toHaveLength(20_000)
  })

  it('refuses a payload that is not a whole number of dabs', () => {
    // Truncated or foreign data. Painting the decodable prefix would put
    // content on a shared canvas that nobody drew.
    const packed = packDabs([dabAt(0), dabAt(1)])
    expect(() => unpackDabs(packed.slice(0, 10))).toThrow(/not a multiple/)
  })

  it('refuses an encoding it does not know rather than reading it as this one', () => {
    // The log outlives the client. A stroke written by a future build with a
    // different layout must announce itself, not decode into plausible-looking
    // nonsense on a shared canvas.
    const packed = packDabs([dabAt(0)])
    const fromTheFuture = `99:${packed.slice(packed.indexOf(':') + 1)}`
    expect(() => unpackDabs(fromTheFuture)).toThrow(/unknown encoding version/)
    expect(() => unpackDabs('no version here')).toThrow(/unknown encoding version/)
  })

  it('is markedly smaller than the JSON it replaces', () => {
    // The whole point. The 250 bytes/dab figure this is measured against
    // comes from real room data (see engine's STROKE_DAB_CHUNK_LIMIT).
    const dabs = Array.from({ length: 800 }, (_, i) => dabAt(i))
    const asJson = JSON.stringify(dabs).length
    const asPacked = packDabs(dabs).length

    // The fixed, arithmetic part: ten float32s is 40 bytes, and base64 turns
    // that into 53.33 whatever the values are. This is the number that holds
    // for real strokes too.
    expect(asPacked / dabs.length).toBeLessThan(54)

    // These synthetic dabs serialize to ~159 bytes each, so the ratio here is
    // about 3x. Real room data measures ~250 bytes per dab (the figure behind
    // the engine's STROKE_DAB_CHUNK_LIMIT), where the same 53 bytes is closer
    // to 4.7x — the values there carry longer decimal tails than anything
    // hand-written for a test. Asserted against the pessimistic case on
    // purpose.
    expect(asPacked).toBeLessThan(asJson / 2.5)
  })
})

describe('strokeDabs (#366)', () => {
  it('reads a stroke recorded before packing existed', () => {
    // The Operation Log is permanent: every stroke already in Postgres has
    // the plain array and must keep replaying forever.
    const dabs = [dabAt(0), dabAt(1)]
    expect(strokeDabs(strokeOp({ dabs }))).toEqual(dabs)
  })

  it('reads a packed stroke', () => {
    const dabs = [dabAt(0), dabAt(1)]
    const got = strokeDabs(strokeOp({ dabsPacked: packDabs(dabs) }))
    expect(got).toHaveLength(2)
    expect(got[0].x).toBe(Math.fround(dabs[0].x))
  })

  it('prefers the plain array when an operation somehow carries both', () => {
    // Not something the engine produces, but the type permits it and a
    // hand-written or migrated operation could. The unpacked form is the one
    // that was actually recorded, so it wins.
    const plain = [dabAt(5)]
    const other = [dabAt(9)]
    const got = strokeDabs(strokeOp({ dabs: plain, dabsPacked: packDabs(other) }))
    expect(got).toEqual(plain)
  })

  it('treats a stroke with neither as empty rather than throwing', () => {
    // Defensive: an operation relayed by a future client using an encoding
    // this build does not know should not take the room down.
    expect(strokeDabs(strokeOp({}))).toEqual([])
  })
})
