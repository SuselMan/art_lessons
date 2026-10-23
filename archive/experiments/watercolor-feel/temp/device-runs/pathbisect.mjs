// A second engine in the page replays the room's done ops through the load
// path (appendOperation 'remote' inside suspendDisplay); at checkpoints its
// layer is compared, texel for texel, with a rebuild-path replay (_applyPixelOp)
// of the same prefix. Prints where the two first part.
import { ev } from '../../apps/web/scripts/devices/bridge.mjs'
const [page, layer = 'layer-1', step = '20'] = process.argv.slice(2)
console.log(await ev(page, `
const E = window.__engine, lid = ${JSON.stringify(layer)}, STEP = ${+step}
const ops = E._log.doneOperations()
const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600
const E2 = new E.constructor(canvas, { ...E._opts, userId: 'audit' })
await E2.paperReady()
for (const id of E._layers.keys()) E2.initLayer(id)
const read = (buf) => buf.allResident().sort((a, b) => a.originX - b.originX || a.originY - b.originY).map(t => [t.originX + ',' + t.originY, t.buffer.readPixels()])
const diff = (A, B) => { let n = 0, mx = 0; const mb = new Map(B); for (const [k, a] of A) { const b = mb.get(k); if (!b) { if (a.some(v => v)) n += 1e6; continue } for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > 2) n++; if (d > mx) mx = d } } return [n, mx] }
const rebuild = (k) => {
  const buf = E2._makeLayerBuffer(lid); buf.clear()
  const saved = E2._replayRibbonChunks, savedA = E2._chunkAuthors; E2._replayRibbonChunks = new Map(); E2._chunkAuthors = new Map()
  if (E2._settle) E2._completeSettle()
  for (const op of ops.slice(0, k)) if (op.type === 'stroke') { if (op.layerId === lid) E2._applyPixelOp(buf, lid, op); else E2._retireWashesOf(op) } else if (op.layerId === lid && E2._log.layerPixelOps(lid).some(p => p.id === op.id)) E2._applyPixelOp(buf, lid, op)
  if (E2._settle) E2._completeSettle()
  for (const c of E2._replayRibbonChunks.values()) c.scratch.destroy()
  E2._replayRibbonChunks = saved; E2._chunkAuthors = savedA
  const px = read(buf); buf.destroy(); return px
}
const out = []
E2.suspendDisplay()
let k = 0
for (const op of ops) {
  E2.appendOperation(op, 'remote'); k++
  if (k % STEP === 0 || k === ops.length) {
    if (E2._settle) E2._completeSettle()
    const [n, mx] = diff(read(E2._layers.get(lid)), rebuild(k))
    out.push(k + ':' + n + '/' + mx)
    if (n > 0 && out.filter(s => !s.endsWith(':0/0') && !/:0\\/[0-2]$/.test(s)).length >= 3) break
  }
}
E2.resumeDisplay(); E2.destroy()
return out.join(' ')`, 900000))
