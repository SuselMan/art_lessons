import { afterEach, describe, expect, it, vi } from 'vitest'
import { recordingGL } from '../../testing/brushPassTestUtils'
import { BrushMipCache } from './BrushMipCache'
import { BrushTextureCache } from './BrushTextureCache'
import { runBrushGlBatch, type BrushGlBatchFrame, type BrushGlBatchInfo, type BrushGlBatchParticipant } from './BrushGlBatch'
function setup() {
  const { gl, snapshot } = recordingGL()
  gl.isContextLost = () => false
  const cache = new BrushTextureCache(gl), cpu = new BrushMipCache(), epoch = {}, instancing = gl.getExtension('ANGLE_instanced_arrays')
  let active: BrushGlBatchFrame | undefined
  const service: BrushGlBatchParticipant = {
    brushGlBatchInfo: () => ({ gl, cache, cpu, epoch, attributes: [0, 1, 2, 3], vertexArrays: null, instancing, resources: [] }),
    enterBrushGlBatch: frame => { if (active) throw Error('already active'); active = frame; return () => { active = undefined } },
  }
  return { gl, cache, cpu, snapshot, service }
}
afterEach(() => vi.restoreAllMocks())
describe('explicit synchronous brush GL batch', () => {
  it('captures the union once and restores fallback pointers/ANGLE, even after a later draw throws', () => {
    vi.spyOn(performance, 'now').mockReturnValue(100)
    const s = setup(), before = s.snapshot(), queries = vi.spyOn(s.gl, 'getParameter')
    let captured: BrushGlBatchFrame | undefined
    expect(() => runBrushGlBatch({ participants: [s.service] }, frame => {
      captured = frame
      const atStart = queries.mock.calls.length
      for (let i = 0; i < 4; i++) {
        frame.assert(s.service, []); frame.beginDraw()
        s.gl.bindBuffer(s.gl.ARRAY_BUFFER, s.gl.createBuffer())
        s.gl.vertexAttribPointer(i, 2, s.gl.FLOAT, false, 8, 0)
        s.gl.getExtension('ANGLE_instanced_arrays').vertexAttribDivisorANGLE(i, 0)
      }
      expect(queries.mock.calls.length).toBe(atStart)
      throw Error('second GPU command')
    })).toThrow('second GPU command')
    expect(s.snapshot()).toEqual(before)
    expect(s.cpu.reservedBytes).toBe(0)
    expect(() => captured!.assert(s.service, [])).toThrow('Closed')
    runBrushGlBatch({ participants: [s.service] }, () => {})
  })
  it('captures before owner callbacks and restores their mutations on success/failure, rejects async/reentry', () => {
    const s = setup(), events: string[] = [], query = vi.spyOn(s.gl, 'getParameter')
    const before = s.snapshot();
    const owner = { owner: {}, lease: () => { expect(query.mock.calls.length).toBeGreaterThan(0); s.gl.activeTexture(s.gl.TEXTURE0); s.gl.bindTexture(s.gl.TEXTURE_2D, s.gl.createTexture()); events.push('acquire'); return () => { events.push('release') } } }
    expect(() => runBrushGlBatch({ participants: [s.service], owners: [owner] }, frame => {
      expect(() => runBrushGlBatch({ participants: [s.service] }, () => {})).toThrow('active')
      frame.assert(s.service, [], [owner])
      return Promise.resolve()
    })).toThrow('synchronous')
    expect(events).toEqual(['acquire', 'release'])
    expect(s.snapshot()).toEqual(before)
    query.mockClear()
    expect(() => runBrushGlBatch({ participants: [s.service], owners: [owner, { owner: {}, lease: () => { s.gl.bindFramebuffer(s.gl.FRAMEBUFFER, s.gl.createFramebuffer()); throw Error('owner failed') } }] }, () => {})).toThrow('owner failed')
    expect(events).toEqual(['acquire', 'release', 'acquire', 'release'])
    expect(s.snapshot()).toEqual(before)
    runBrushGlBatch({participants:[s.service],owners:[owner]},()=>{})
    expect(s.snapshot()).toEqual(before)
  })
  it('requires the same context/cache/epoch and all resources/owners before work', () => {
    const s = setup(), other = setup(), rogue = { owner: {}, lease: () => () => {} }
    expect(() => runBrushGlBatch({ participants: [s.service, other.service] }, () => {})).toThrow('context/cache')
    expect(() => runBrushGlBatch({ participants: [s.service], resources: [{ key: 'missing', bytes: 4 }] }, () => {})).toThrow('Unprepared')
    runBrushGlBatch({ participants: [s.service] }, frame => {
      expect(() => frame.assert(other.service, [])).toThrow('foreign')
      expect(() => frame.assert(s.service, [], [rogue])).toThrow('owner')
      const original = s.service.brushGlBatchInfo()
      s.service.brushGlBatchInfo = () => ({ ...original, epoch: {} })
      expect(() => frame.assert(s.service, [])).toThrow('epoch')
    })
  })
  it('enforces eight draws/4ms, and old frame/group releases cannot unlock a new frame', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(0), s = setup(), released = vi.fn()
    runBrushGlBatch({ participants: [s.service] }, frame => {
      frame.holdGroup(released)
      for (let i = 0; i < 8; i++) frame.beginDraw()
      expect(frame.shouldYield).toBe(true)
      expect(() => frame.beginDraw()).toThrow('budget')
    })
    expect(released).toHaveBeenCalledOnce()
    runBrushGlBatch({ participants: [s.service] }, frame => {
      frame.beginDraw(); now.mockReturnValue(4)
      expect(() => frame.beforeWork()).toThrow('budget')
    })
  })
  it('restores the caller OES VAO once without probing unrelated attribs', () => {
    const s = setup(), caller = {}, owned = {}; let current = caller
    const ext = { VERTEX_ARRAY_BINDING_OES: 9900, bindVertexArrayOES: (v: object) => { current = v } }
    const original = s.gl.getParameter
    s.gl.getParameter = (name: number) => name === ext.VERTEX_ARRAY_BINDING_OES ? current : original(name)
    const attrib = vi.spyOn(s.gl, 'getVertexAttrib')
    const info = s.service.brushGlBatchInfo()
    s.service.brushGlBatchInfo = () => ({ ...info, vertexArrays: ext } as unknown as BrushGlBatchInfo)
    runBrushGlBatch({ participants: [s.service] }, () => { ext.bindVertexArrayOES(owned) })
    expect(current).toBe(caller); expect(attrib).not.toHaveBeenCalled()
  })
})

it('finishes the paired first draw when admitted prepass work crosses the soft deadline',()=>{
  const clock=vi.spyOn(performance,'now').mockReturnValue(0),s=setup();
  runBrushGlBatch({participants:[s.service]},frame=>{
    frame.beginDraw(); // an earlier command, now below deadline
    const token=frame.beginGroup();
    clock.mockReturnValue(5); // preparing this already-admitted mask takes time
    expect(frame.shouldYield).toBe(true);
    expect(()=>frame.beginDraw()).not.toThrow();
    frame.endGroup(token);
    expect(()=>frame.beginGroup()).toThrow('budget');
  });
});
it('refuses transient CPU overflow before acquisition and releases reservations after context loss',()=>{
  const s=setup(),acquire=vi.fn(()=>()=>{}),release=s.cpu.reserve(s.cpu.budgetBytes-4000);
  expect(()=>runBrushGlBatch({participants:[s.service],owners:[{owner:{},lease:acquire}]},()=>{})).toThrow();
  expect(acquire).not.toHaveBeenCalled();release();
  const ownerRelease=vi.fn();
  expect(()=>runBrushGlBatch({participants:[s.service],owners:[{owner:{},lease:()=>ownerRelease}]},frame=>{
    s.gl.isContextLost=()=>true;
    frame.beginDraw();
  })).toThrow('context lost');
  expect(ownerRelease).toHaveBeenCalledOnce();expect(s.cpu.reservedBytes).toBe(0);
  s.gl.isContextLost=()=>false;
  runBrushGlBatch({participants:[s.service]},()=>{});
});
