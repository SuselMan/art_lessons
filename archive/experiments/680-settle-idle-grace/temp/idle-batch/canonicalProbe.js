// Post-idle only. Hash records on-device; no full tile base64 transport.
window.__idleBatchCanonical = async function () {
  const e = window.__engine
  if (e._settle || e._opQueue.length || e._rebuildJobs.size || e._washReveals.size) throw Error('Canonical probe requires fully idle solver/reveal')
  const origins = new Map()
  for (const layer of e._layers.values()) for (const tile of layer.allResident()) origins.set(tile.buffer, [tile.originX, tile.originY])
  const scratches=[...new Set([e._wash?.scratch,...[...e._replayRibbonChunks.values()].map(v=>v.scratch)].filter(v=>v?.live))]
  if (!scratches.length) throw Error('Actual live wash scratch required, not cached field guess')
  const hashes = []
  for (const scratch of scratches) for (const [tile, entry] of scratch.tileEntries()) {
    const origin = origins.get(tile)
    if (!origin) throw Error('Unknown actual scratch tile origin')
    for (const key of ['inkLoad', 'inkColor', 'solventLoad', 'inkDry', 'colorDry']) {
      const buffer = entry[key]
      if (!buffer) throw Error('Missing canonical source record: ' + key)
      const bytes = buffer.readPixels()
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))
      const sum = [0, 0, 0, 0]
      for (let i = 0; i < bytes.length; i++) sum[i % 4] += bytes[i]
      hashes.push({ origin, key, width: buffer.width, height: buffer.height, sum, hash: [...digest].map(v => v.toString(16).padStart(2, '0')).join('') })
    }
  }
  const sourceOps = e.getOperations().filter(o => o.type === 'stroke').map(({ dabs, preset, color, tool, wet }) => ({ dabs, preset, color, tool, wet }))
  return { sourceOps, hashes: hashes.sort((a, b) => a.origin[1] - b.origin[1] || a.origin[0] - b.origin[0] || a.key.localeCompare(b.key)), lost: e.gl.isContextLost(), gl: e.gl.getError(), idleBatch: e._settleQueue.idleBatch }
}
