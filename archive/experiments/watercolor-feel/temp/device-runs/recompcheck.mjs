// Fresh layer, one stroke: on-sheet live vs replay diff, then the final
// composite forced again on the live wash scratch, and the diff again.
import { ev } from '../../apps/web/scripts/devices/bridge.mjs'
const [page, pts, size, ms, preset] = process.argv.slice(2)
console.log(await ev(page, `
const e = window.__engine
const b = [...document.querySelectorAll('button')].find(b => /^(Add layer|Добавить слой)$/i.test(b.getAttribute('aria-label') || '')); const before = new Set(e._layers.keys()); b.click(); await new Promise(r => setTimeout(r, 2500))
const lid = [...e._layers.keys()].find(k => !before.has(k))
await window.__mt.setup({ preset: ${JSON.stringify(preset)}, color: [0.2,0.55,0.3], size: ${Number(size)}, layerId: lid })
const of0 = e._finishRibbonStroke
if (${process.env.SYNC ? 1 : 0}) e._finishRibbonStroke = function (sc, reveal, fade, spread) { if (reveal && fade === false) return of0.call(this, sc, false, false, false); return of0.call(this, sc, reveal, fade, spread) }
await window.__mt.stroke({ pts: ${pts}, ms: ${Number(ms)} })
e._finishRibbonStroke = of0
await new Promise(r => setTimeout(r, 3000)); if (e._settle) e._completeSettle()
const pw = e._opts.pageWidth, ph = e._opts.pageHeight
const read = bf => new Map(bf.allResident().map(t => [t.originX + ',' + t.originY, { t, px: t.buffer.readPixels() }]))
const buf = e._makeLayerBuffer(lid); buf.clear()
const lc = e._replayRibbonChunks; e._replayRibbonChunks = new Map(); const la = e._chunkAuthors; e._chunkAuthors = new Map()
for (const op of e._log.layerPixelOps(lid)) e._applyPixelOp(buf, lid, op)
if (e._settle) e._completeSettle()
for (const c of e._replayRibbonChunks.values()) c.scratch.destroy()
e._replayRibbonChunks = lc; e._chunkAuthors = la
const B = read(buf); buf.destroy()
const diff = () => { const A = read(e._layers.get(lid)); let n = 0, mx = 0; for (const [k, a] of A) { const b = B.get(k); if (!b) continue; const w = a.t.buffer.width, h = a.t.buffer.height; for (let i = 0; i < a.px.length; i++) { const q = i >> 2; if (a.t.originX + q % w >= pw || a.t.originY + h - 1 - Math.floor(q / w) >= ph) continue; const d = Math.abs(a.px[i] - b.px[i]); if (d > 2) n++; if (d > mx) mx = d } } return n + '/' + mx }
const d1 = diff()
const sc = e._wash && e._wash.layerId === lid ? e._wash.scratch : null
if (!sc) return 'no wash; before ' + d1
sc.diffusePending = false
e._finishRibbonStroke(sc, false, false)
return 'before ' + d1 + ' after recomposite ' + diff()`, 600000))
