// Sample every layer on every page (48x48) and compare with the first page.
// Usage: node comparelayers.mjs page1 page2 ...
import { ev, joinAndInstall } from '../../apps/web/scripts/devices/bridge.mjs'
const pages = process.argv.slice(2)
for (const p of pages) await joinAndInstall(p)
const infos = await Promise.all(pages.map(p => ev(p, 'return window.__mt.info()')))
const ids = [...new Set(infos.flatMap(i => i.layers.filter(l => l.ops).map(l => l.id)))]
for (const id of ids) {
  const s = await Promise.all(pages.map(p => ev(p, `return window.__mt.sample(${JSON.stringify(id)}, 48)`, 180000)))
  const out = []
  for (let k = 1; k < s.length; k++) {
    let o8 = 0, mx = 0
    for (let i = 0; i < s[0].cells.length; i += 4) { let d = 0; for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(s[0].cells[i + c] - s[k].cells[i + c])); if (d > 8) o8++; if (d > mx) mx = d }
    out.push(`${pages[k]} over8 ${o8} max ${mx} ops ${s[0].ops}/${s[k].ops}`)
  }
  console.log(id, '|', out.join(' | '))
}
