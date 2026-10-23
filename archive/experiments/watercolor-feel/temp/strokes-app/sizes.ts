import { readFileSync } from 'node:fs'
import { unpackDabs } from '../../packages/shared/src/dabCodec'
const ops = JSON.parse(readFileSync(process.argv[2], 'utf8'))
for (const o of ops.filter((o: any) => o.type === 'stroke').slice(0, 4)) {
  const d = unpackDabs(o.dabsPacked)
  const s = d.map(x => x.size), p = d.map(x => x.pressure)
  console.log(Math.min(...s).toFixed(1), Math.max(...s).toFixed(1), 'p', Math.min(...p).toFixed(2), Math.max(...p).toFixed(2), 'ar', d[0].aspectRatio.toFixed(2), 'x', d[0].x.toFixed(0), d[0].y.toFixed(0))
}
