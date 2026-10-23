// Does a rebuild (the undo path) change what the page shows? Reads the
// layer's tiles, rebuilds the layer in place from its log, reads again.
import { ev } from '../../apps/web/scripts/devices/bridge.mjs'
const [page, layer = 'layer-1'] = process.argv.slice(2)
console.log(await ev(page, `
const e = window.__engine, lid = ${JSON.stringify(layer)}
const read = () => new Map(e._layers.get(lid).allResident().map(t => [t.originX + ',' + t.originY, t.buffer.readPixels()]))
if (e._settle) e._completeSettle()
const A = read()
e._replayInto(e._layers.get(lid), lid, e._log.layerPixelOps(lid))
if (e._settle) e._completeSettle()
const B = read()
const per = []
for (const [k, a] of A) { const b = B.get(k); if (!b) { per.push(k + ':gone'); continue } let n = 0, mx = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > 2) n++; if (d > mx) mx = d } per.push(k + ':' + n + '/' + mx) }
const C = read(); e._replayInto(e._layers.get(lid), lid, e._log.layerPixelOps(lid)); if (e._settle) e._completeSettle(); const D = read()
let n2 = 0; for (const [k, c] of C) { const d = D.get(k); for (let i = 0; i < c.length; i++) if (Math.abs(c[i] - d[i]) > 2) n2++ }
return per.join(' ') + ' | second rebuild vs first: ' + n2 + ' | cps ' + e._checkpoints.all().filter(c => c.layerId === lid).length`, 600000))
