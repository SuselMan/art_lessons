// Local proof artifact; private probes intentionally stay out of product tests.
// @ts-nocheck
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

for (const infinite of [false, true]) test(`recorded replay and scratch ownership: ${infinite ? 'infinite' : 'bounded'}`, async ({ page }) => {
  await page.addInitScript(() => {
    Date.now = () => 1791000000000
  })
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))
  page.on('console', m => { if (m.text().startsWith('AB:')) console.log(m.text()) })
  const label = process.env.AB_LABEL ?? 'after'
  await page.goto('/ab494.html')
  const result = await page.evaluate(async ({infinite, label}) => {
    const { PencilEngine } = await import(label === 'before' ? '/src/engine/ab494Before.ts' : '/src/engine/index.ts')
    const canvas = document.createElement('canvas')
    canvas.width = 256; canvas.height = 256
    document.body.replaceChildren(canvas)
    const e = new PencilEngine(canvas, { userId: 'author', infinite, pageWidth: 256, pageHeight: 256, paper: 'fine' })
    await e.paperReady(); console.log("AB: paper ready")
    // Small test tiles exercise the same buffer logic without multi-megabyte
    // software-GPU passes; ordinary room e2e separately uses production tiles.
    e._tileSize = () => ({w:128, h:128})
    if (infinite) e.setInfiniteCamera(1024, 128, 0.5, 0)
    else e.setViewport(128, 128, 1, 0)
    e.appendOperation({ id: 'layer-op', type: 'layer_add', userId: 'author', timestamp: Date.now(), seq: 1, layerId: 'L', name: 'Scratch proof' }, 'remote')
    e.setCompositeOrder([{ id: 'L', opacity: 1 }]); e.setActiveLayer('L')
    const states = {}, operations = []; let seq = 1
    const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))].map(v => v.toString(16).padStart(2, '0')).join('')
    const scratchPixels = async s => {
      const out = []
      for (const [tile, fields] of s._tiles) {
        const values = {}
        for (const [key, b] of Object.entries(fields)) if (b && typeof b.readPixels === 'function') values[key] = await hash(b.readPixels())
        out.push({ width: tile.width, height: tile.height, fields: values })
      }
      return out
    }
    const pixels = async () => {
      if (!e._layers.has('L')) throw new Error('fixture lost layer L')
      const out = []
      for (const t of e._layers.get('L').allResident()) {
        const b = t.buffer.readPixels()
        out.push({ x: t.originX, y: t.originY, hash: await hash(b), ink: b.filter((v, i) => i % 4 === 3 && v > 0).length })
      }
      return out.sort((a,b) => a.y-b.y || a.x-b.x)
    }
    const capture = async key => {
      console.log('AB: capture ' + key)
      e._completeSettle(); e._flushOpQueue(); e._completeSettle(); e._washReveals.clear(); e._paperWet.clear(); e._wetTexAt = 0; e._display()
      const urls = {}
      for (const name of ['export', 'transparent', 'preview']) {
        console.log('AB: encode ' + key + ' ' + name)
        const blob = name === 'preview' ? await e.bakePreview(160) : await e.exportPNG(name === 'transparent')
        if (!blob) throw new Error('empty ' + name)
        urls[name] = await hash(await blob.arrayBuffer())
      }
      states[key] = { pixels: await pixels(), urls, canvas: canvas.toDataURL(), ops: e.getOperations().map(o => o.id) }
    }
    const stroke = (i, tool = 'watercolor', continuation = false) => {
      const id = tool + '-' + i + (continuation ? '-tail' : '')
      const op = { id, type: 'stroke', userId: tool === 'watercolor' ? 'peer-' + i : 'author', timestamp: Date.now() + i, seq: ++seq, layerId: 'L', tool,
        preset: tool === 'watercolor' ? 'normal:10:80:PB29:round' : tool === 'marker' ? 'chisel' : tool === 'digitalBrush' ? 'brush:soft-round@1' : 'normal',
        color: [0.12 + i * 0.03, 0.24, 0.5], strokeId: id, ...(tool === 'watercolor' ? { washId: 'wash-' + i } : {}),
        dabs: Array.from({length: tool === 'watercolor' ? 4 : 9}, (_, n) => ({ x: (infinite ? 980 : 60) + n * 8, y: 60 + (i % 3) * 35 + (continuation ? 12 : 0) + n * 2, pressure: 0.8, tiltX: 0, tiltY: 0, size: tool === 'watercolor' ? 6 : 18, aspectRatio: 1, angle: 0, opacity: 0.65, t: n * 20 })) }
      console.log('AB: stroke start ' + id); operations.push(op); e.appendOperation(op, 'remote'); e._flushOpQueue(); e._completeSettle(); console.log('AB: stroke end ' + id)
    }
    for (const tool of ['marker', 'brushPen', 'digitalBrush']) stroke(0, tool)
    // Ribbon replay uses marker/pen/digital brush; wash storage is exercised below.
    stroke(2, 'watercolor')
    await capture('replay')
    if (states.replay.pixels.reduce((n,t)=>n+t.ink,0)===0) throw new Error('ribbon left no paint')
    const chunk = {target:e._layers.get('L')}
    // Use a resting, bounded fixture for ownership tests: the live wash can
    // still have pending work, and spill correctly refuses that state.
    const Scratch = label === 'before' ? (await import('/src/engine/ab494Before.ts')).RibbonStrokeScratch : (await import('/src/engine/src/buffers/RibbonStrokeScratch.ts')).RibbonStrokeScratch, pool = e._ribbonScratchPool
    const Buffer = targetBufferClass()
    function targetBufferClass() { return chunk.target.allResident()[0].buffer.constructor }
    const tile = new Buffer(e.gl, 64, 64, 'nearest')
    tile.writePixels(new Uint8Array(64 * 64 * 4).fill(71))
    const target = { resolveForPaint: () => [{buffer: tile, originX: 0, originY: 0}] }
    const s = new Scratch(pool, true, true), entry = s.getOrCreate(tile)
    s.advanceWater(3.5, 6.25); s.paints.add('PB29'); s.noteDirection(3, 4); s.noteDabSpacing(7)
    s.noteStorageBounds({minX:8, minY:9, maxX:18, maxY:19})
    const fields = ['coverage', 'inkLoad', 'inkSettled', 'inkColor', 'colorSettled', 'inkDry', 'colorDry']
    for (const [i,k] of fields.entries()) {
      entry[k] ??= pool.acquire(64, 64)
      const data = new Uint8Array(64*64*4)
      for (let y=45; y<55; y++) for(let x=8; x<18; x++) for(let c=0;c<4;c++) data[(y*64+x)*4+c] = 31 + i*19 + c
      entry[k].writePixels(data)
    }
    const originOf = b => b === tile ? {originX:0, originY:0} : null
    console.log('AB: scratch ownership'); const original = await scratchPixels(s)
    const snap = s.snapshot(e.gl, originOf)
    if (!snap) throw new Error('snapshot failed')
    const restored = Scratch.restore(pool, snap, target)
    const snapshotPixels = await scratchPixels(restored)
    const snapshotOriginal = original.map(t => ({...t, fields: Object.fromEntries(Object.entries(t.fields).filter(([k]) => !['inkDry', 'colorDry'].includes(k)))}))
    if (JSON.stringify(snapshotPixels) !== JSON.stringify(snapshotOriginal)) throw new Error('snapshot changed wash pixels')
    states.snapshot = { original: snapshotOriginal, restored: snapshotPixels, water: restored.waterUsed, pigment: restored.pigmentUsed }
    restored.destroy()
    for (const t of snap.tiles) for (const b of Object.values(t.bufs)) b?.destroy()
    const canceled = s.spillWork(originOf)
    const first = canceled.next()
    if (first.done) throw new Error('fixture did not exercise sliced compact spill')
    canceled.return(null)
    if (!s.live || JSON.stringify(await scratchPixels(s)) !== JSON.stringify(original)) throw new Error('canceled spill changed active scratch')
    const sp = s.spill(originOf)
    if (!sp || s.live) throw new Error('spill did not transfer ownership')
    states.spill = { bytes: sp.bytes, tiles: sp.tiles.length, compactFields: sp.tiles.flatMap(t => Object.values(t.bufs)).filter(p => !p.whole).length }
    if (!states.spill.compactFields) throw new Error('fixture did not compact fields')
    const unparked = Scratch.unspill(pool, sp, target)
    if (!unparked || JSON.stringify(await scratchPixels(unparked)) !== JSON.stringify(original)) throw new Error('unspill changed wash pixels')
    unparked.destroy(); tile.destroy()
    states.unspill = await scratchPixels(unparked)

    // Exercise the extracted cache with actual GPU storage, without fluid shaders.
    for (const key of [...e._replayRibbonChunks.keys()]) e._evictChunk(key, false)
    const cacheTile = new Buffer(e.gl, 64, 64, 'nearest')
    cacheTile.writePixels(new Uint8Array(64*64*4).fill(71))
    const cacheTarget = {
      allResident: () => [{buffer:cacheTile, originX:0, originY:0}],
      resolveForPaint: () => [{buffer:cacheTile, originX:0, originY:0}],
    }
    const cacheScratch = new Scratch(pool, true, true)
    const cacheEntry = cacheScratch.getOrCreate(cacheTile)
    const cacheData = new Uint8Array(64*64*4)
    for(let y=45;y<55;y++) for(let x=8;x<18;x++) for(let channel=0;channel<4;channel++) cacheData[(y*64+x)*4+channel]=27
    cacheEntry.coverage.writePixels(cacheData)
    cacheScratch.noteStorageBounds({minX:8,minY:9,maxX:18,maxY:19})
    const lastDab = {x:12,y:12,pressure:0.8,size:18,aspectRatio:1,angle:0,opacity:0.65,t:0,tiltX:0,tiltY:0}
    e._replayRibbonChunks.set('cache-wash', {strokeId:'cache-wash',washStrokeId:'cache-gesture',target:cacheTarget,scratch:cacheScratch,lastDab,usedAt:0})
    e._chunkAuthors.set('cache-wash','cache-peer')
    const expectedCachePixels = await scratchPixels(cacheScratch)
    e._evictChunk('cache-wash', true)
    if (e._replayRibbonChunks.has('cache-wash') || !e._spilledWashes.has('cache-wash')) throw new Error('eviction did not park wash')
    const resumed = e._replayChunkScratch(cacheTarget,'cache-gesture','cache-wash',[lastDab],{ink:true,normalizeDeposit:true})
    if (!resumed || !resumed.prevDab || e._spilledWashes.has('cache-wash')) throw new Error('cache hit did not restore gesture')
    if (JSON.stringify(await scratchPixels(resumed.scratch)) !== JSON.stringify(expectedCachePixels)) throw new Error('cache restoration changed pixels')
    e._startSpill('cache-wash')
    e._cancelSpillJob()
    if (e._spillJob || !e._replayRibbonChunks.has('cache-wash')) throw new Error('cancel lost active wash')
    e._startSpill('cache-wash')
    const deadline = performance.now()+5000
    while(e._spillJob && performance.now()<deadline) await new Promise(r=>setTimeout(r,20))
    if(e._spillJob || !e._spilledWashes.has('cache-wash')) throw new Error('sliced cache parking did not finish')
    const again = e._replayChunkScratch(cacheTarget,'cache-next-gesture','cache-wash',[lastDab],{ink:true,normalizeDeposit:true})
    if (!again || again.prevDab) throw new Error('cache joined separate gestures with a bridge')
    states.cache = {pixels:await scratchPixels(again.scratch),author:e._chunkAuthors.get('cache-wash'),active:[...e._replayRibbonChunks.keys()],parked:[...e._spilledWashes.keys()]}
    e._retireWashesOf({strokeId:'other-gesture',userId:'cache-peer'})
    if(e._replayRibbonChunks.has('cache-wash')) throw new Error('closed wash stayed active')
    // LRU eviction during a sliced rebuild uses the journal-selected entry.
    for (let i=0;i<5;i++) {
      const scratch=new Scratch(pool,true,true)
      scratch.getOrCreate(cacheTile)
      e._replayRibbonChunks.set('lru-'+i,{strokeId:'lru-'+i,target:cacheTarget,scratch,lastDab})
    }
    e._inJobStep=true
    e._trimChunkCache()
    e._inJobStep=false
    states.cache.lru=[...e._replayRibbonChunks.keys()]
    if(JSON.stringify(states.cache.lru)!==JSON.stringify(['lru-1','lru-2','lru-3','lru-4'])) throw new Error('LRU changed')
    for (const key of [...e._replayRibbonChunks.keys()]) e._evictChunk(key,false)
    e._forgetWashesOf(cacheTarget)
    cacheTile.destroy()
    stroke(1, 'marker')
    await capture('continued')
    // Own classic strokes are local operations; peers' washes stay remote.
    // Undo/replay rebuild uses checkpoint/carried scratch ownership.
    console.log('AB: undo'); e.appendOperation({id:'ab-undo', type:'operation_undo', userId:'author', timestamp:Date.now(), seq:++seq, targetOpId:'digitalBrush-0'}, 'remote'); e._completeSettle()
    while (e._rebuildJobs.size) { for (const job of [...e._rebuildJobs.values()]) e._stepRebuildJob(job); e._completeSettle() }
    await capture('undo')
    console.log('AB: redo'); e.appendOperation({id:'ab-redo', type:'operation_redo', userId:'author', timestamp:Date.now(), seq:++seq, targetOpId:'digitalBrush-0'}, 'remote'); e._completeSettle()
    while (e._rebuildJobs.size) { for (const job of [...e._rebuildJobs.values()]) e._stepRebuildJob(job); e._completeSettle() }
    await capture('redo')
    const ext = e.gl.getExtension('WEBGL_lose_context')
    if (!ext) throw new Error('context loss unavailable')
    await new Promise(resolve => { canvas.addEventListener('webglcontextlost', resolve, {once:true}); ext.loseContext() })
    await new Promise(resolve => setTimeout(resolve, 100))
    await new Promise(resolve => { canvas.addEventListener('webglcontextrestored', resolve, {once:true}); ext.restoreContext() })
    await e.paperReady(); e._completeSettle()
    await capture('context-restored')
    stroke(6, 'brushPen')
    await capture('paint-after-context-restore')
    // Pool allocation/reuse after restoring the context is exercised by the replay above.
    const bandProgram = label === 'before' ? e._ribbonProg : e._ribbonPasses._ribbonProg
    const bandBuffer = label === 'before' ? e._ribbonBuf : e._ribbonPasses._ribbonBuf
    if (!e.gl.isProgram(bandProgram) || !e.gl.isBuffer(bandBuffer)) throw new Error('fixture did not exercise ribbon resources')
    e.destroy()
    const heldAfterDestroy = {program:e.gl.isProgram(bandProgram),buffer:e.gl.isBuffer(bandBuffer)}
    if (label === 'before' && (!heldAfterDestroy.program || !heldAfterDestroy.buffer)) throw new Error('baseline lifetime changed')
    if (label !== 'before' && (heldAfterDestroy.program || heldAfterDestroy.buffer)) throw new Error('ribbon GPU resource retained after destroy')

    return { states, operations }
  }, {infinite, label})
  expect(errors).toEqual([])
  expect(result.states.replay.pixels.reduce((n,t) => n+t.ink, 0)).toBeGreaterThan(0)
  const name = infinite ? 'infinite' : 'bounded'
  const dir = resolve('temp/494-ribbon-passes', label)
  mkdirSync(dir, {recursive:true})
  writeFileSync(resolve(dir, name + '.json'), JSON.stringify(result, null, 2))
  if (label !== 'before') expect(result).toEqual(JSON.parse(readFileSync(resolve('temp/494-ribbon-passes/before', name + '.json'), 'utf8')))
})
