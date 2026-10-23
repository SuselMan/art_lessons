import { readFileSync } from 'node:fs'
import { unpackDabs } from '../../packages/shared/src/dabCodec'
const ops = JSON.parse(readFileSync(process.argv[2], 'utf8'))
for (const o of ops.filter((o: any) => o.type === 'stroke').slice(0, 3)) {
  const d = unpackDabs(o.dabsPacked)
  const tail = d.slice(-12).map((x, i, a) => i ? (Math.hypot(x.x - a[i-1].x, x.y - a[i-1].y) / Math.max(x.t - a[i-1].t, 1)).toFixed(2) : '-')
  console.log('size', d[0].size, 'aspect', d[0].aspectRatio, 'tail px/ms', tail.join(' '), 'last dt', (d[d.length-1].t - d[d.length-2].t).toFixed(1))
}
