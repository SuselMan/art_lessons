(() => {
  const e = window.__engine
  const S = e._replayRibbonChunks.values().next().value?.scratch?.constructor
  const out = []
  for (const [key, c] of [...e._replayRibbonChunks]) {
    const before = []
    for (const [tile, ent] of c.scratch._tiles) for (const k of ['original','coverage','inkLoad','inkSettled','inkColor','colorSettled','inkDry','colorDry','strokeInk','inkBase','strokeColor','colorBase']) if (ent[k]) before.push([k, ent[k].readPixels().slice()])
    const sc1 = JSON.stringify(c.scratch._scalars())
    const origins = new Map(); for (const t of c.target.allResident()) origins.set(t.buffer, { originX: t.originX, originY: t.originY })
    const sp = c.scratch.spill(t => origins.get(t) ?? null)
    if (!sp) { out.push([key, 'spill null']); continue }
    const back = S.unspill(e._ribbonScratchPool, sp, c.target)
    if (!back) { out.push([key, 'unspill null']); continue }
    const after = []
    for (const [tile, ent] of back._tiles) for (const k of ['original','coverage','inkLoad','inkSettled','inkColor','colorSettled','inkDry','colorDry','strokeInk','inkBase','strokeColor','colorBase']) if (ent[k]) after.push([k, ent[k].readPixels().slice()])
    let diffs = 0, maxd = 0
    const bk = before.map(b => b[0]).join(','), ak = after.map(a => a[0]).join(',')
    for (let i = 0; i < Math.min(before.length, after.length); i++) { const a = before[i][1], b = after[i][1]; for (let j = 0; j < a.length; j++) { const d = Math.abs(a[j] - b[j]); if (d) { diffs++; if (d > maxd) maxd = d } } }
    const sc2 = JSON.stringify(back._scalars())
    out.push([key.slice(0, 8), 'bufs', before.length, after.length, bk === ak, 'diffBytes', diffs, 'max', maxd, 'scalarsEqual', sc1 === sc2])
    back.destroy()
  }
  return out
})()
