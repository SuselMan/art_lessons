// Polls a page's GPU-side memory every 2 s until temp/device-runs/mempoll.stop exists.
import { ev } from '../../apps/web/scripts/devices/bridge.mjs'
import { existsSync } from 'node:fs'
const [page] = process.argv.slice(2)
const code = `const e = window.__engine; if (!e) return JSON.stringify({ origin: Math.round(performance.timeOrigin), engine: false })
const p = e.getWatercolorPerf(); let carried = 0
for (const c of e._checkpoints.all()) for (const w of (c.washes || [])) for (const t of w.snap.tiles) for (const b of Object.values(t.bufs)) if (b) carried += b.width * b.height * 4
let tiles = 0; for (const b of e._layers.values()) tiles += b.allResident().length
return JSON.stringify({ origin: Math.round(performance.timeOrigin) % 100000, live: p.scratchLiveMB, free: p.scratchFreeMB, field: Math.round(p.fieldMB), carried: Math.round(carried / 1048576), cpu: Math.round(e._checkpoints.totalBytes() / 1048576), chunks: e._replayRibbonChunks.size, tiles, jobs: e._rebuildJobs.size, spilled: e._spilledWashes ? e._spilledWashes.size : -1, spilledMB: e._spilledWashes ? Math.round([...e._spilledWashes.values()].reduce((n, w) => n + w.spill.bytes, 0) / 1048576) : -1, lost: e._lostWashes ? e._lostWashes.size : -1, gpu: window.__gpuBytes ? window.__gpuBytes().texMB : "-", own: (() => { const w = e._wash; if (!w) return 0; let n = 0, t = 0; for (const en of w.scratch._tiles.values()) { t++; for (const v of Object.values(en)) if (v && v.readPixels) n++ } return t + 't/' + n + 'b' })(), layerTiles: [...e._layers.values()].reduce((n, b) => n + b.allResident().length, 0), reveals: e._washReveals ? e._washReveals.size : -1, peerPrev: e._peerPreviews ? e._peerPreviews.size : -1 })`
while (!existsSync('temp/device-runs/mempoll.stop')) {
  const t = new Date().toISOString().slice(11, 19)
  try { console.log(t, await ev(page, code, 5000)) } catch (e) { console.log(t, 'ERR', String(e.message).slice(0, 80)) }
  await new Promise(r => setTimeout(r, 2000))
}
