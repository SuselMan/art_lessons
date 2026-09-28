// Compare the layers of several devices as they stand now (no drawing).
// Usage: node comparenow.mjs name=page [name=page ...]
import { ev, joinAndInstall, pageLib } from './bridge.mjs'
const devices = process.argv.slice(2).map(a => { const [name, sel] = a.split('='); return { name, sel } })
for (const d of devices) await joinAndInstall(d.sel)
// The newest page library, even where an older one is installed.
for (const d of devices) { await ev(d.sel, 'delete window.__mt; return 1'); await ev(d.sel, pageLib) }
const infos = await Promise.all(devices.map(d => ev(d.sel, 'return window.__mt.info()')))
const ids = [...new Set(infos.flatMap(i => i.layers.filter(l => l.ops).map(l => l.id)))]
for (const id of ids) {
  const s = await Promise.all(devices.map(d => ev(d.sel, `return window.__mt.sample(${JSON.stringify(id)}, 48)`, 180000)))
  for (let k = 1; k < s.length; k++) {
    let over8 = 0, max = 0
    for (let i = 0; i < s[0].cells.length; i += 4) { let dd = 0; for (let c = 0; c < 4; c++) dd = Math.max(dd, Math.abs(s[0].cells[i + c] - s[k].cells[i + c])); if (dd > 8) over8++; if (dd > max) max = dd }
    console.log(id, devices[k].name, 'vs', devices[0].name, { over8, max, ops: [s[0].ops, s[k].ops], extent: [s[0].extent, s[k].extent], tilesEqual: s[0].tiles === s[k].tiles })
  }
}
