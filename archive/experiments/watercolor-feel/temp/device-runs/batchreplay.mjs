// The last layer's first operation replayed three ways, scratch sums per tile:
// ONE batch (the replay path), and in batches of N dabs through a caller-owned
// scratch (the live path's shape). Usage: node batchreplay.mjs <page> [N=2]
import { ev } from '../../apps/web/scripts/devices/bridge.mjs'
const [page, n = '2'] = process.argv.slice(2)
console.log(await ev(page, `
const e = window.__engine
const { unpackDabs } = await import('/@fs/home/suselman/projects/pencil-agents/watercolor-feel/packages/shared/src/dabCodec.ts')
const lid = [...e._layers.keys()].pop()
const op = e._log.layerPixelOps(lid)[0]
const dabs = op.dabs ?? unpackDabs(op.dabsPacked)
const KEYS = ['coverage', 'inkLoad']
const sums = (buf) => { if (!buf) return '-'; const p = buf.readPixels(); const s = [0,0,0,0]; for (let i = 0; i < p.length; i += 16) for (let c = 0; c < 4; c++) s[c] += p[i+c]; return s.join('/') }
const dump = (sc, tiles) => { const o = {}; for (const [tb, en] of sc._tiles) { const t = tiles.get(tb); const k = t ? t.originX + ',' + t.originY : '?'; o[k] = {}; for (const key of KEYS) o[k][key] = sums(en[key]) } return o }
const lc = e._replayRibbonChunks; e._replayRibbonChunks = new Map(); const la = e._chunkAuthors; e._chunkAuthors = new Map()
const seed = [0, 0]
// one batch
const b1 = e._makeLayerBuffer(lid); b1.clear()
e._applyPixelOp(b1, lid, op); if (e._settle) e._completeSettle()
const c1 = [...e._replayRibbonChunks.values()][0]
const R1 = dump(c1.scratch, new Map(b1.allResident().map(t => [t.buffer, t])))
const chan = (sc, tiles, ch) => { for (const [tb, en] of sc._tiles) { const t = tiles.get(tb); if (!t || t.originX !== 0 || t.originY !== 0) continue; const p = en.coverage.readPixels(); const w = en.coverage.width, h = en.coverage.height; const c = document.createElement('canvas'); c.width = w / 2; c.height = h / 2; const g = c.getContext('2d'); const id = g.createImageData(c.width, c.height); for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const s = (((h - 1 - 2 * y) * w) + 2 * x) * 4 + ch, d = (y * c.width + x) * 4; id.data[d] = id.data[d+1] = id.data[d+2] = 255 - p[s]; id.data[d+3] = 255 } g.putImageData(id, 0, 0); return c.toDataURL('image/png') } }
const IMG1 = chan(c1.scratch, new Map(b1.allResident().map(t => [t.buffer, t])), 2)
const RS = c1.scratch.constructor
for (const c of e._replayRibbonChunks.values()) c.scratch.destroy()
e._replayRibbonChunks = new Map()
// batches
const b2 = e._makeLayerBuffer(lid); b2.clear()
const sc = new RS(e._ribbonScratchPool, true, true); sc.beginStroke()
const N = ${Number(n)}
let prev
const mseed = e._paintDabs.length ? undefined : undefined
for (let i = 0; i < dabs.length; i += N) {
  const slice = dabs.slice(i, i + N)
  e._paintDabs(b2, slice, op.tool, op.preset, op.color, op.userId, prev, sc, op.strokeId, op.washId, op.wet ? op.wet.slice(i, i + N) : op.wet)
  prev = slice[slice.length - 1]
}
e._flushLiveComposite && e._flushLiveComposite()
e._finishRibbonStroke(sc, false, false); if (e._settle) e._completeSettle()
const R2 = dump(sc, new Map(b2.allResident().map(t => [t.buffer, t])))
const IMG2 = chan(sc, new Map(b2.allResident().map(t => [t.buffer, t])), 2)
sc.destroy(); b1.destroy(); b2.destroy()
e._replayRibbonChunks = lc; e._chunkAuthors = la
const lines = ['dabs ' + dabs.length]
lines.push('IMG ' + JSON.stringify({ one: IMG1, bat: IMG2 }))
for (const k of Object.keys(R1)) for (const key of KEYS) lines.push(k + ' ' + key + ' ONE ' + R1[k][key] + ' BATCHED ' + (R2[k] ? R2[k][key] : '?'))
return lines.join('\\n')`, 300000))
