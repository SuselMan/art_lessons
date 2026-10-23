// Salted (real) compile+link of each captured program pair on the tablet, one
// per eval, restarting Chrome after a crash or a hang. Prints one line a pair.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import { ev } from '../../apps/web/scripts/devices/bridge.mjs'
const pairs = JSON.parse(fs.readFileSync('temp/device-runs/linkpairs.json', 'utf8'))
const AD = fs.readFileSync('temp/device-runs/android.adb', 'utf8').trim()
const A = `${process.env.HOME}/tools/platform-tools/adb -s ${AD}`
const sh = c => execSync(c, { encoding: 'utf8' })
function page() {
  const out = sh('npx tsx apps/web/scripts/devbridge.ts clients 2>&1')
  const m = [...out.matchAll(/"id": "(\w+)",\s*"ua": "[^"]*Android/g)]
  return m.length ? m[m.length - 1][1] : null
}
function restart() {
  sh(`${A} shell am force-stop com.android.chrome`)
  sh(`${A} shell am start -a android.intent.action.VIEW -d "https://192.168.1.70:5277/create?t=${Date.now()}" -p com.android.chrome`)
  execSync('sleep 12')
}
const only = process.argv.slice(2).map(Number)
restart()
for (let i = 0; i < pairs.length; i++) {
  if (only.length && !only.includes(i)) continue
  sh(`${A} logcat -c`)
  const P = page()
  const code = `const pair = ${JSON.stringify(pairs[i])}
    const c = document.createElement('canvas'); c.width = c.height = 16
    const gl = c.getContext('webgl'); if (!gl) return 'no gl'
    const salt = '// salt ' + Date.now() + ' ' + Math.random() + '\\n'
    const p = gl.createProgram()
    for (const src of pair) { const s = gl.createShader(/gl_Position/.test(src) ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER); gl.shaderSource(s, salt + src); gl.compileShader(s); gl.attachShader(p, s) }
    const t = performance.now(); gl.linkProgram(p)
    const ok = gl.getProgramParameter(p, gl.LINK_STATUS)
    const r = [ok ? 'ok' : gl.isContextLost() ? 'LOST' : 'fail', Math.round(performance.now() - t)]
    gl.getExtension('WEBGL_lose_context')?.loseContext(); return r`
  let r
  try { r = await ev(P, code, 120000) } catch (e) { r = ['HANG/ERR', String(e).slice(0, 80)] }
  const crashes = (sh(`${A} logcat -d`).match(/GPU process exited/g) || []).length
  console.log(i, pairs[i].map(s => s.length).join('+'), JSON.stringify(r), crashes ? `crashes=${crashes}` : '')
  if (crashes || r[0] === 'HANG/ERR' || r === 'no gl') restart()
}
