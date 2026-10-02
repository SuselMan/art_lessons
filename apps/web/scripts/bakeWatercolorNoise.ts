// #691: shared lattice values are an asset, never a per-GPU float hash.
import { writeFileSync } from 'node:fs'
const size = 251
const bytes = new Uint8Array(size * size)
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  let h = (x * 67 + y * 71 + 19) % size
  h = (h * h + x * 131 + y * 137) % size
  bytes[y * size + x] = Math.round(((h * 113 + 17) % size) / 250 * 255)
}
writeFileSync(new URL('../src/engine/src/raster/watercolorNoise.txt', import.meta.url), Buffer.from(bytes).toString('base64'))
