import { describe, expect, it, vi } from 'vitest'
import { createTestEngine, makeImageImport, makeLayerAdd } from '../../testing/engineTestUtils'

function setup() {
  const {engine}=createTestEngine({paper:'flat'},{width:4,height:4})
  engine.appendOperation(makeLayerAdd('u','L'),'remote')
  const layer=engine['_layers'].get('L')!,rect={x:0,y:0,width:4,height:4}
  const target=layer.resolveForPaint({minX:0,minY:0,maxX:4,maxY:4})[0].buffer
  const image={width:4,height:4} as HTMLImageElement,op=makeImageImport('u','L',{image:'decoded',width:4,height:4})
  const importer=engine['_images'],area=engine['_area'],gl=engine['gl']
  importer['cache'].set(op.image,image)
  const painted=vi.spyOn(importer['ctx'],'layerPainted'),display=vi.spyOn(importer['ctx'],'displayIfNotSuspended').mockImplementation(()=>{})
  const flipKey=9345;Object.defineProperty(gl,'UNPACK_FLIP_Y_WEBGL',{value:flipKey,configurable:true})
  let flipped=false
  const store=gl.pixelStorei.bind(gl)
  vi.spyOn(gl,'pixelStorei').mockImplementation((p,v)=>{if(p===flipKey)flipped=!!v;else store(p,v)})
  return {engine,gl,layer,target,image,op,importer,area,rect,painted,display,flipped:()=>flipped,
    close(){vi.restoreAllMocks();engine.destroy()}}
}
// Driver allocation failure/context loss can return null; expose that boundary
// explicitly even when the ambient DOM declaration narrows createTexture.
function nullTextureOnce(gl:WebGLRenderingContext):void {
  const allocator=gl as unknown as {createTexture():WebGLTexture|null}
  vi.spyOn(allocator,'createTexture').mockReturnValueOnce(null)
}
const matrix=[1,0,0,0,1,0,0,0,1] as const

describe('owned image upload exception lifetimes',()=>{
  it.each(['upload','resolve','image','matrix'] as const)('deletes the ImageImport texture and suppresses success callbacks after %s failure',fault=>{
    const s=setup(),primary=new Error('primary'),created=vi.spyOn(s.gl,'createTexture'),deleted=vi.spyOn(s.gl,'deleteTexture')
    const foreign=s.gl.createTexture();created.mockClear()
    try {
      if(fault==='upload')vi.spyOn(s.gl,'texImage2D').mockImplementationOnce(()=>{throw primary})
      if(fault==='resolve')vi.spyOn(s.layer,'resolveForPaint').mockImplementationOnce(()=>{throw primary})
      if(fault==='image')vi.spyOn(s.engine['_passes'],'image').mockImplementationOnce(()=>{throw primary})
      if(fault==='matrix')vi.spyOn(s.importer['ctx'],'drawThroughMatrix').mockImplementationOnce(()=>{throw primary})
      let caught:unknown;try{s.importer.paintDecoded(s.layer,s.op,fault==='matrix'?[1,0,0,1,0,0]:undefined)}catch(error){caught=error}
      expect(caught).toBe(primary)
      expect(created).toHaveBeenCalledTimes(1)
      const owned=created.mock.results[0].value
      expect(deleted.mock.calls.filter(([t])=>t===owned)).toHaveLength(1)
      expect(deleted.mock.calls.some(([t])=>t===foreign||t===s.target.texture)).toBe(false)
      expect(s.flipped()).toBe(false);expect(s.painted).not.toHaveBeenCalled();expect(s.display).not.toHaveBeenCalled()
    } finally {s.gl.deleteTexture(foreign);s.close()}
  })
  it('keeps ImageImport primary upload failure while attempting flip cleanup and deletion after cleanup throws',()=>{
    const s=setup(),primary=new Error('primary'),secondary=new Error('cleanup')
    const created=vi.spyOn(s.gl,'createTexture'),deleted=vi.spyOn(s.gl,'deleteTexture').mockImplementation(()=>{throw secondary})
    const store=vi.mocked(s.gl.pixelStorei).getMockImplementation()!;vi.spyOn(s.gl,'pixelStorei').mockImplementation((p,v)=>{if(p===s.gl.UNPACK_FLIP_Y_WEBGL&&!v)throw secondary;store(p,v)})
    vi.spyOn(s.gl,'texImage2D').mockImplementationOnce(()=>{throw primary})
    try {
      let caught:unknown;try{s.importer.paintDecoded(s.layer,s.op)}catch(error){caught=error}
      expect(caught).toBe(primary);expect(deleted).toHaveBeenCalledWith(created.mock.results[0].value)
      expect(s.painted).not.toHaveBeenCalled();expect(s.display).not.toHaveBeenCalled()
    }finally{s.close()}
  })
  it('does not publish ImageImport success if cleanup fails after a completed draw',()=>{
    const s=setup(),secondary=new Error('delete failure')
    vi.spyOn(s.gl,'deleteTexture').mockImplementationOnce(()=>{throw secondary})
    try {
      let caught:unknown;try{s.importer.paintDecoded(s.layer,s.op)}catch(error){caught=error}
      expect(caught).toBe(secondary);expect(s.painted).not.toHaveBeenCalled();expect(s.display).not.toHaveBeenCalled()
    }finally{s.close()}
  })
  it.each(['plain','matrix'] as const)('deletes actual nested %s upload handles before publishing success',mode=>{
    const s=setup();s.area.drawImageThroughMatrix(s.target,0,0,s.image,s.rect,[...matrix])
    const created=vi.spyOn(s.gl,'createTexture'),deleted=vi.spyOn(s.gl,'deleteTexture')
    try {
      expect(s.importer.paintDecoded(s.layer,s.op,mode==='matrix'?[1,0,0,1,0,0]:undefined)).toBe(true)
      expect(created).toHaveBeenCalledTimes(mode==='matrix'?2:1)
      for(const result of created.mock.results)expect(deleted.mock.calls.filter(([t])=>t===result.value)).toHaveLength(1)
      expect(Math.max(...deleted.mock.invocationCallOrder)).toBeLessThan(s.painted.mock.invocationCallOrder[0])
      expect(s.painted).toHaveBeenCalledTimes(1);expect(s.display).toHaveBeenCalledTimes(1);expect(s.flipped()).toBe(false)
    }finally{s.close()}
  })
  it('rejects null image texture allocation without a success callback or foreign deletion',()=>{
    const s=setup(),deleted=vi.spyOn(s.gl,'deleteTexture')
    nullTextureOnce(s.gl)
    try {
      expect(()=>s.importer.paintDecoded(s.layer,s.op)).toThrow('allocation failed')
      expect(deleted).not.toHaveBeenCalled();expect(s.painted).not.toHaveBeenCalled();expect(s.display).not.toHaveBeenCalled()
    }finally{s.close()}
  })
  it('returns AreaOps scratch even when the raw image texture allocation returns null',()=>{
    const s=setup();s.area.drawImageThroughMatrix(s.target,0,0,s.image,s.rect,[...matrix])
    const pool=s.area['scratchPool'],count=pool.idleCount(),release=vi.spyOn(pool,'release'),deleted=vi.spyOn(s.gl,'deleteTexture')
    nullTextureOnce(s.gl)
    try {
      expect(()=>s.area.drawImageThroughMatrix(s.target,0,0,s.image,s.rect,[...matrix])).toThrow('allocation failed')
      expect(release).toHaveBeenCalledTimes(1);expect(pool.idleCount()).toBe(count);expect(deleted).not.toHaveBeenCalled()
    }finally{s.close()}
  })
  it.each(['clear','upload','image','transform'] as const)('returns the actual AreaOps scratch and deletes its raw upload after %s failure',fault=>{
    const s=setup();s.area.drawImageThroughMatrix(s.target,0,0,s.image,s.rect,[...matrix])
    const pool=s.area['scratchPool'],primary=new Error('primary'),created=vi.spyOn(s.gl,'createTexture'),deleted=vi.spyOn(s.gl,'deleteTexture')
    const free=pool.idleCount(),release=vi.spyOn(pool,'release')
    try {
      if(fault==='clear'){
        const acquire=pool.acquire.bind(pool);vi.spyOn(pool,'acquire').mockImplementationOnce((w,h)=>{const scratch=acquire(w,h);vi.spyOn(scratch,'clear').mockImplementationOnce(()=>{throw primary});return scratch})
      }
      if(fault==='upload')vi.spyOn(s.gl,'texImage2D').mockImplementationOnce(()=>{throw primary})
      if(fault==='image')vi.spyOn(s.engine['_passes'],'image').mockImplementationOnce(()=>{throw primary})
      if(fault==='transform')vi.spyOn(s.engine['_passes'],'transform').mockImplementationOnce(()=>{throw primary})
      let caught:unknown;try{s.area.drawImageThroughMatrix(s.target,0,0,s.image,s.rect,[...matrix])}catch(error){caught=error}
      expect(caught).toBe(primary);expect(release).toHaveBeenCalledTimes(1);expect(pool.idleCount()).toBe(free)
      if(fault!=='clear')expect(deleted.mock.calls.filter(([t])=>t===created.mock.results[0].value)).toHaveLength(1)
      expect(deleted.mock.calls.some(([t])=>t===s.target.texture)).toBe(false);expect(s.flipped()).toBe(false)
      vi.restoreAllMocks()
      const allocations=vi.spyOn(s.gl,'createTexture');s.area.drawImageThroughMatrix(s.target,0,0,s.image,s.rect,[...matrix])
      expect(allocations).toHaveBeenCalledTimes(1) // raw image only; same scratch reused
    }finally{s.close()}
  })
  it('attempts AreaOps scratch release even if raw deletion throws and preserves the image failure',()=>{
    const s=setup();s.area.drawImageThroughMatrix(s.target,0,0,s.image,s.rect,[...matrix])
    const primary=new Error('primary'),release=vi.spyOn(s.area['scratchPool'],'release')
    vi.spyOn(s.engine['_passes'],'image').mockImplementationOnce(()=>{throw primary})
    const deleted=vi.spyOn(s.gl,'deleteTexture').mockImplementation(()=>{throw Error('cleanup')})
    try {
      let caught:unknown;try{s.area.drawImageThroughMatrix(s.target,0,0,s.image,s.rect,[...matrix])}catch(error){caught=error}
      expect(caught).toBe(primary);expect(deleted).toHaveBeenCalledTimes(1);expect(release).toHaveBeenCalledTimes(1)
    }finally{s.close()}
  })
  it('preserves AreaOps primary failure when returning scratch itself throws after releasing ownership',()=>{
    const s=setup();s.area.drawImageThroughMatrix(s.target,0,0,s.image,s.rect,[...matrix])
    const primary=new Error('primary'),pool=s.area['scratchPool'],release=pool.release.bind(pool),before=pool.idleCount()
    vi.spyOn(s.engine['_passes'],'image').mockImplementationOnce(()=>{throw primary})
    vi.spyOn(pool,'release').mockImplementation(scratch=>{release(scratch);throw Error('release failure')})
    try {
      let caught:unknown;try{s.area.drawImageThroughMatrix(s.target,0,0,s.image,s.rect,[...matrix])}catch(error){caught=error}
      expect(caught).toBe(primary);expect(pool.idleCount()).toBe(before)
    }finally{s.close()}
  })

})
