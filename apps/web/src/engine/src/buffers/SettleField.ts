import type { AccumulationBuffer } from './AccumulationBuffer'


/** (#536) The settle's working textures - see PencilEngine._diffuseFieldFor. */
export type SettleField = {
  w: number; h: number
  a: AccumulationBuffer; b: AccumulationBuffer; c: AccumulationBuffer; coverage: AccumulationBuffer
  /** (#536, §17.19) The colour record's own trio, moved by the same gate. */
  ca: AccumulationBuffer; cb: AccumulationBuffer; cc: AccumulationBuffer
    mask: AccumulationBuffer; pressure: AccumulationBuffer
    band: AccumulationBuffer
}



export function destroyField(f: SettleField): void {
  for (const b of [f.a, f.b, f.c, f.coverage, f.ca, f.cb, f.cc, f.mask, f.pressure, f.band]) b.destroy()
}
