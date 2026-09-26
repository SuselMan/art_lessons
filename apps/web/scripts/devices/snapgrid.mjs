// Pulls a coarse picture (grid x grid mean RGBA over the page) of one layer
// from several devices and writes them side by side as a PNG-ready JSON.
// Usage: node snapgrid.mjs <layerId> <grid> <out.json> name=page ...
import { writeFileSync } from 'node:fs'
import { ev, joinAndInstall, pageLib } from './bridge.mjs'
const [layerId, grid, out, ...rest] = process.argv.slice(2)
const devices = rest.map(a => { const [name, sel] = a.split('='); return { name, sel } })
const res = {}
for (const d of devices) {
  await joinAndInstall(d.sel); await ev(d.sel, 'delete window.__mt; return 1'); await ev(d.sel, pageLib)
  res[d.name] = await ev(d.sel, `return window.__mt.sample(${JSON.stringify(layerId)}, ${+grid})`, 300000)
}
writeFileSync(out, JSON.stringify(res))
console.log('ok', Object.keys(res))
