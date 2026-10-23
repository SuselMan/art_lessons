import WebSocket from 'ws'
const list = await (await fetch('http://localhost:9333/json')).json()
const pg = list.find(p => p.type === 'page' && p.url.includes('/room/'))
if (!pg) { console.log('no page', list.map(p => p.url)); process.exit(0) }
console.log('page', pg.url)
const ws = new WebSocket(pg.webSocketDebuggerUrl)
let id = 0
const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }))
ws.on('open', () => { send('Debugger.enable'); send('Debugger.pause'); send('Runtime.evaluate', { expression: '1+1' }) })
ws.on('message', m => {
  const d = JSON.parse(m)
  if (d.method === 'Debugger.paused') {
    for (const f of d.params.callFrames.slice(0, 30)) console.log(f.functionName || '(anon)', f.url.replace(/.*\/src\//, 'src/').split('?')[0] + ':' + (f.location.lineNumber + 1))
    process.exit(0)
  } else if (d.id) console.log('reply', d.id, JSON.stringify(d.result || d.error).slice(0, 120))
})
setTimeout(() => { console.log('no pause in 20 s'); process.exit(0) }, 20000)
