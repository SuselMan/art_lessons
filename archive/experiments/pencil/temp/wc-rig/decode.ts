import { readFileSync } from 'node:fs'
import { unpackDabs } from '/home/suselman/projects/pencil-agents/watercolor-feel/packages/shared/src/dabCodec'
for (const line of readFileSync(process.argv[2], 'utf8').trim().split('\n')) {
  const [layer, preset, packed] = line.split('|')
  const d = unpackDabs(packed); const n = d.length
  const pick = [0, 3, 8, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 9, n - 4, n - 1].filter(i => i >= 0 && i < n)
  console.log(layer, preset, 'n', n, 'size', pick.map(i => d[i].size.toFixed(1)).join(' '), '| pressure', pick.map(i => (d[i].pressure ?? 0).toFixed(2)).join(' '))
}
