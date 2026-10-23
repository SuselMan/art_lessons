import { readFileSync } from 'node:fs'
import { unpackDabs } from '../../packages/shared/src/dabCodec'
const ops = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const undone = new Set(ops.filter((o: any) => o.type === 'operation_undo').map((o: any) => o.targetOpId))
for (const o of ops) {
  if (o.type !== 'stroke' || undone.has(o.id)) continue
  const d = unpackDabs(o.dabsPacked)
  const R = d[0].size / 2
  // trailing dwell within 0.3R at every dab, max over stroke and where
  let best = 0, at = -1, landing = 0
  for (let i = 0; i < d.length; i++) {
    let j = i
    while (j > 0 && Math.hypot(d[j-1].x - d[i].x, d[j-1].y - d[i].y) <= 0.3 * d[i].size / 2) j--
    const tau = d[i].t - d[j].t
    if (j === 0 && tau > landing) landing = tau
    if (tau > best && j > 0) { best = tau; at = i }
  }
  const dur = d[d.length-1].t - d[0].t
  let len = 0; for (let i = 1; i < d.length; i++) len += Math.hypot(d[i].x-d[i-1].x, d[i].y-d[i-1].y)
  console.log(`n=${d.length} R=${R.toFixed(0)} dur=${dur}ms len=${len.toFixed(0)} v=${(len/dur*1000).toFixed(0)}px/s landingDwell=${landing}ms midMaxDwell=${best}ms at ${at} preset=${(o.preset||'').slice(0,24)}`)
}
