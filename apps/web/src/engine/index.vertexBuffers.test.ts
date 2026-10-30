import { expect, it, vi } from 'vitest'
import { createTestEngine } from './testing/engineTestUtils'

it('retires the two engine-owned shared VBOs exactly once without deleting a foreign buffer',()=>{
  const {engine}=createTestEngine({paper:'flat'},{width:16,height:16})
  const gl=engine['gl'],quad=engine['_quadBuf'],screen=engine['_screenBuf'],foreign=gl.createBuffer()
  const deleted=vi.spyOn(gl,'deleteBuffer')
  try {
    engine.destroy();engine.destroy()
    expect(quad).not.toBe(screen)
    expect(deleted.mock.calls.filter(([b])=>b===quad)).toHaveLength(1)
    expect(deleted.mock.calls.filter(([b])=>b===screen)).toHaveLength(1)
    expect(deleted.mock.calls.some(([b])=>b===foreign)).toBe(false)
    expect(engine['_quadBuf']).toBeNull();expect(engine['_screenBuf']).toBeNull()
  } finally {engine.destroy();deleted.mockRestore();gl.deleteBuffer(foreign)}
})

it('forgets lost shared VBO names without deletion and retires only the restored generation',()=>{
  const {engine}=createTestEngine({paper:'flat'},{width:16,height:16})
  const gl=engine['gl'],oldQuad=engine['_quadBuf'],oldScreen=engine['_screenBuf'],deleted=vi.spyOn(gl,'deleteBuffer')
  try {
    engine['_handleContextLost'](new Event('webglcontextlost',{cancelable:true}))
    expect(deleted).not.toHaveBeenCalled()
    expect(engine['_quadBuf']).toBeNull();expect(engine['_screenBuf']).toBeNull()
    engine['_handleContextRestored']()
    const quad=engine['_quadBuf'],screen=engine['_screenBuf']
    expect(quad).not.toBe(oldQuad);expect(screen).not.toBe(oldScreen)
    engine.destroy()
    expect(deleted.mock.calls.some(([b])=>b===oldQuad||b===oldScreen)).toBe(false)
    expect(deleted.mock.calls.filter(([b])=>b===quad)).toHaveLength(1)
    expect(deleted.mock.calls.filter(([b])=>b===screen)).toHaveLength(1)
  } finally {engine.destroy();deleted.mockRestore()}
})

it('does not delete shared VBOs when the driver is lost before the lifecycle event arrives',()=>{
  const {engine}=createTestEngine({paper:'flat'},{width:16,height:16})
  const gl=engine['gl'],quad=engine['_quadBuf'],screen=engine['_screenBuf']
  const lost=vi.spyOn(gl,'isContextLost').mockReturnValue(true),deleted=vi.spyOn(gl,'deleteBuffer')
  try {
    engine.destroy()
    expect(deleted.mock.calls.some(([b])=>b===quad||b===screen)).toBe(false)
    expect(engine['_quadBuf']).toBeNull();expect(engine['_screenBuf']).toBeNull()
  } finally {engine.destroy();deleted.mockRestore();lost.mockRestore()}
})
