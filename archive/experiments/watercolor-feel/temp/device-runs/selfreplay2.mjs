// Live layer vs a rebuild-path replay that also lets undone strokes close
// their author's washes (what the load path does), on a 48 grid.
import { ev } from '../../apps/web/scripts/devices/bridge.mjs'
const [page, layer = 'layer-1', mode = 'retireUndone'] = process.argv.slice(2)
console.log(await ev(page, `
const e = window.__engine, lid = ${JSON.stringify(layer)}
const live = JSON.parse(window.__mt.sample(lid, 48))
const keep = e._layers.get(lid)
const buf = e._makeLayerBuffer(lid); buf.clear()
const liveChunks = e._replayRibbonChunks; e._replayRibbonChunks = new Map()
const liveAuthors = e._chunkAuthors; e._chunkAuthors = new Map()
if (e._settle) e._completeSettle()
let undoneStrokes = 0
for (const entry of e._log.entries) {
  const op = entry.op
  const done = entry.state === 'done'
  if (op.type === 'stroke') {
    if (done && op.layerId === lid) e._applyPixelOp(buf, lid, op)
    else if (!done && ${JSON.stringify(mode)} === 'retireUndone') { e._retireWashesOf(op); undoneStrokes++ }
    else if (done && op.layerId !== lid) e._retireWashesOf(op)
  } else if (done && op.layerId === lid && ['layer_clear','layer_merge','layer_duplicate','image_import','layer_transform','area_paste','area_fill','shape'].includes(op.type)) {
    e._applyPixelOp(buf, lid, op)
  }
}
if (e._settle) e._completeSettle()
for (const c of e._replayRibbonChunks.values()) c.scratch.destroy()
e._replayRibbonChunks = liveChunks; e._chunkAuthors = liveAuthors
e._layers.set(lid, buf)
const rep = JSON.parse(window.__mt.sample(lid, 48))
e._layers.set(lid, keep); buf.destroy()
let over8 = 0, max = 0
for (let i = 0; i < live.cells.length; i += 4) { let d = 0; for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(live.cells[i + c] - rep.cells[i + c])); if (d > 8) over8++; if (d > max) max = d }
return JSON.stringify({ over8, max, undoneStrokes, entries: e._log.entries.length })`, 600000))
