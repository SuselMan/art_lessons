// A page's live layer against a replay of its own log from the snapshot floor, on a 48 grid.
import { ev } from '../../apps/web/scripts/devices/bridge.mjs'
const [page, layer = 'layer-1'] = process.argv.slice(2)
console.log(await ev(page, `
const e = window.__engine, lid = ${JSON.stringify(layer)}
const live = JSON.parse(window.__mt.sample(lid, 48))
const keep = e._layers.get(lid)
const buf = e._makeLayerBuffer(lid); buf.clear()
const store = e._checkpoints, list = store.list
store.list = list.filter(c => c.fromSnapshot)
// The replay gets a cache of its own: the live one holds this page's open
// washes, and a replay into another buffer would destroy them as stale.
const liveChunks = e._replayRibbonChunks; e._replayRibbonChunks = new Map()
if (e._settle) e._completeSettle()
e._replayInto(buf, lid, e._log.layerPixelOps(lid))
if (e._settle) e._completeSettle()
for (const c of e._replayRibbonChunks.values()) c.scratch.destroy()
e._replayRibbonChunks = liveChunks
store.list = list
e._layers.set(lid, buf)
const rep = JSON.parse(window.__mt.sample(lid, 48))
e._layers.set(lid, keep); buf.destroy()
let over8 = 0, max = 0
for (let i = 0; i < live.cells.length; i += 4) { let d = 0; for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(live.cells[i + c] - rep.cells[i + c])); if (d > 8) over8++; if (d > max) max = d }
return JSON.stringify({ over8, max })`, 600000))
