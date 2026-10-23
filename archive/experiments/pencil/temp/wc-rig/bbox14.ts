import { readFileSync } from 'node:fs'
import { unpackDabs } from '/home/suselman/projects/pencil-agents/watercolor-feel/packages/shared/src/dabCodec'
const ops = JSON.parse(readFileSync('ops_P2uLmpGw_v6.json', 'utf8'))
for (const o of ops) {
  if (o.type !== 'stroke' || o.layerId !== process.argv[2]) continue
  const d = unpackDabs(o.dabsPacked)
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
  for (const p of d) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
  console.log(o.id.slice(0, 6), o.washId.slice(0, 6), o.color.map((c: number) => c.toFixed(1)).join(','), 'bbox', x0.toFixed(0), y0.toFixed(0), x1.toFixed(0), y1.toFixed(0), 'n', d.length)
}
