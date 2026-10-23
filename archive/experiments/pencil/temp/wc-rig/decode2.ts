import { readFileSync } from 'node:fs'
import { unpackDabs } from '/home/suselman/projects/pencil-agents/watercolor-feel/packages/shared/src/dabCodec'
for (const line of readFileSync(process.argv[2], 'utf8').trim().split('\n')) {
  const [layer, preset, wet, packed] = line.split('|')
  const d = unpackDabs(packed); const n = d.length
  const gaps = (a: number, b: number) => { let s = 0; for (let i = a + 1; i <= b; i++) s += Math.hypot(d[i].x - d[i-1].x, d[i].y - d[i-1].y); return (s / (b - a)).toFixed(1) }
  console.log(layer, preset, 'n', n, 'wet', JSON.stringify(wet.slice(0, 12)), '…', JSON.stringify(wet.slice(-12)), '| gap start', gaps(0, 8), 'mid', gaps(Math.floor(n/2)-4, Math.floor(n/2)+4), 'end', gaps(n - 9, n - 1), '| last sizes', d.slice(-6).map(x => x.size.toFixed(0)).join(' '))
}
