const http = require('http')
const fs = require('fs')
const path = require('path')

const outDir = process.argv[2]

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Filename')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
  if (req.method !== 'POST') { res.writeHead(404); res.end(); return }

  const filename = req.headers['x-filename']
  if (!filename) { res.writeHead(400); res.end('missing X-Filename'); return }

  const chunks = []
  req.on('data', c => chunks.push(c))
  req.on('end', () => {
    const buf = Buffer.concat(chunks)
    fs.writeFileSync(path.join(outDir, filename), buf)
    console.log('saved', filename, buf.length, 'bytes')
    res.writeHead(200)
    res.end('ok')
  })
})

server.listen(8765, () => console.log('save_server listening on 8765, writing to', outDir))
