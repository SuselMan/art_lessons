// The page's live layer against a clean second engine fed the same done ops
// through the load path. Exact texel comparison, per tile.
import { ev } from '../../apps/web/scripts/devices/bridge.mjs'
const [page, layer = 'layer-1'] = process.argv.slice(2)
console.log(await ev(page, `
const E = window.__engine, lid = ${JSON.stringify(layer)}
const ops = E._log.doneOperations()
const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600
const E2 = new E.constructor(canvas, { ...E._opts, userId: 'audit' })
await E2.paperReady()
for (const id of E._layers.keys()) E2.initLayer(id)
E2.suspendDisplay(); for (const op of ops) E2.appendOperation(op, 'remote'); E2.resumeDisplay()
if (E2._settle) E2._completeSettle()
const read = (buf) => new Map(buf.allResident().map(t => [t.originX + ',' + t.originY, t.buffer.readPixels()]))
const A = read(E._layers.get(lid)), B = read(E2._layers.get(lid))
const per = []
for (const [k, a] of A) { const b = B.get(k); if (!b) { per.push(k + ':missing-in-clean'); continue } let n = 0, mx = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > 2) n++; if (d > mx) mx = d } per.push(k + ':' + n + '/' + mx) }
for (const k of B.keys()) if (!A.has(k)) per.push(k + ':missing-in-live')
E2.destroy()
return per.join(' ') + ' | ops ' + ops.length`, 600000))
