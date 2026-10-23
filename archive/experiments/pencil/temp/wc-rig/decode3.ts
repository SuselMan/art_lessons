import { readFileSync } from 'node:fs'
import { unpackDabs } from '/home/suselman/projects/pencil-agents/watercolor-feel/packages/shared/src/dabCodec'
for (const line of readFileSync(process.argv[2], 'utf8').trim().split('\n')) {
  const [layer, preset, , packed] = line.split('|')
  const d = unpackDabs(packed); const n = d.length
  console.log(layer, preset, 'first x,y', d[0].x.toFixed(0), d[0].y.toFixed(0), 'last x,y', d[n-1].x.toFixed(0), d[n-1].y.toFixed(0), 'len px', Math.hypot(d[n-1].x-d[0].x, d[n-1].y-d[0].y).toFixed(0))
}
