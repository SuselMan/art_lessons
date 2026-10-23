// Every _diffuseWashOps call of a live gesture and of its replay: the args.
// Usage: node settlelog.mjs <page> '<pts>' <size> <ms> <preset>
import { ev } from '../../apps/web/scripts/devices/bridge.mjs'
const [page, pts, size, ms, preset] = process.argv.slice(2)
console.log(await ev(page, `
const e = window.__engine
const b = [...document.querySelectorAll('button')].find(b => /^(Add layer|Добавить слой)$/i.test(b.getAttribute('aria-label') || '')); const before = new Set(e._layers.keys()); b.click(); await new Promise(r => setTimeout(r, 2500))
const lid = [...e._layers.keys()].find(k => !before.has(k))
const log = []; let tag = 'LIVE'
const r2 = v => Math.round(v * 100) / 100
const o = e._diffuseWashOps
e._diffuseWashOps = function (sc, targets, bounds, ...rest) { log.push(tag + ' t=' + targets.map(t => t.originX + ',' + t.originY).join(' ') + ' b=' + [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].map(Math.round).join(',') + ' ' + rest.map(r2).join(' ')); return o.call(this, sc, targets, bounds, ...rest) }
await window.__mt.setup({ preset: ${JSON.stringify(preset)}, color: [0.2,0.55,0.3], size: ${Number(size)}, layerId: lid })
await window.__mt.stroke({ pts: ${pts}, ms: ${Number(ms)} })
await new Promise(r => setTimeout(r, 3000))
if (e._settle) e._completeSettle()
tag = 'REPL'
const buf = e._makeLayerBuffer(lid); buf.clear()
const lc = e._replayRibbonChunks; e._replayRibbonChunks = new Map(); const la = e._chunkAuthors; e._chunkAuthors = new Map()
const OPS = e._log.layerPixelOps(lid); log.push('layer ' + lid + ' ops ' + OPS.length)
OPS.forEach((op, i) => { tag = 'REPL#' + i; e._applyPixelOp(buf, lid, op) })
if (e._settle) e._completeSettle()
for (const c of e._replayRibbonChunks.values()) c.scratch.destroy()
e._replayRibbonChunks = lc; e._chunkAuthors = la; buf.destroy()
e._diffuseWashOps = o
return log.join('\\n')`, 600000))
