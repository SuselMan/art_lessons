import {afterEach,expect,it,vi} from 'vitest'
import {createTestEngine} from './testing/engineTestUtils'
import {MockGL} from './testing/mockGL'
import {snapshotContextStorage} from './src/buffers/ContextStorageOwner'
import {PencilEngine} from './index'
import {PaperState} from './src/paper/PaperState'
import {BrushPainter} from './src/dabs/BrushPainter'

afterEach(()=>vi.restoreAllMocks())

it.each([['createProgram',5],['createProgram',20],['createBuffer',4],['createTexture',3]] as const)(
 'retires successful earlier allocations after %s #%i fails without resetting the shared context', (method,at)=>{
 const original=MockGL.prototype[method]
 const created={program:vi.spyOn(MockGL.prototype,'createProgram'),buffer:vi.spyOn(MockGL.prototype,'createBuffer'),texture:vi.spyOn(MockGL.prototype,'createTexture'),framebuffer:vi.spyOn(MockGL.prototype,'createFramebuffer')}
 const deleted={program:vi.spyOn(MockGL.prototype,'deleteProgram'),buffer:vi.spyOn(MockGL.prototype,'deleteBuffer'),texture:vi.spyOn(MockGL.prototype,'deleteTexture'),framebuffer:vi.spyOn(MockGL.prototype,'deleteFramebuffer')}
 const primary=new Error('injected initialization failure');let count=0;const contexts:MockGL[]=[]
 vi.spyOn(MockGL.prototype,method).mockImplementation(function(this:MockGL){contexts.push(this);if(++count===at)throw primary;return original.call(this)})
 expect(()=>createTestEngine({paper:'flat'})).toThrow(primary)
 expect(count).toBe(at)
 for(const kind of ['program','buffer','texture','framebuffer'] as const)for(const result of created[kind].mock.results){
  if(result.type==='return'&&result.value)expect(deleted[kind].mock.calls.filter(([value])=>value===result.value),`${kind} must retire once`).toHaveLength(1)
 }
 expect(snapshotContextStorage(contexts[0] as unknown as WebGLRenderingContext)).toMatchObject({residentBytes:0,reservedBytes:0,orphanBytes:0})
})

it('unwinds initialized GL and the paper owner when paper initialization fails',()=>{
 const programs=vi.spyOn(MockGL.prototype,'createProgram'),deleted=vi.spyOn(MockGL.prototype,'deleteProgram')
 const paperDestroy=vi.spyOn(PaperState.prototype,'destroy'),primary=new Error('paper initialization failed')
 vi.spyOn(PaperState.prototype,'init').mockImplementationOnce(()=>{throw primary})
 expect(()=>createTestEngine({paper:'flat'})).toThrow(primary)
 expect(paperDestroy).toHaveBeenCalledOnce()
 for(const result of programs.mock.results)if(result.type==='return')expect(deleted.mock.calls.filter(([value])=>value===result.value)).toHaveLength(1)
})

it('detaches every subscription and retires local GPU owners after final scheduling failure, preserving foreign names',()=>{
 const {engine,canvas}=createTestEngine({paper:'flat'});engine.destroy()
 const gl=canvas.getContext('webgl')!,foreignTexture=gl.createTexture(),foreignProgram=gl.createProgram()
 const add=vi.spyOn(canvas,'addEventListener'),remove=vi.spyOn(canvas,'removeEventListener')
 const programs=vi.spyOn(gl,'createProgram'),deletedPrograms=vi.spyOn(gl,'deleteProgram'),deletedTextures=vi.spyOn(gl,'deleteTexture')
 const paperInit=PaperState.prototype.init,brushDestroy=BrushPainter.prototype.destroy,papers:PaperState[]=[]
 let published:WebGLTexture|undefined,seenByBorrower:WebGLTexture|undefined
 vi.spyOn(PaperState.prototype,'init').mockImplementation(function(this:PaperState){paperInit.call(this);papers.push(this);published=this.texture})
 vi.spyOn(BrushPainter.prototype,'destroy').mockImplementation(function(this:BrushPainter){seenByBorrower=papers[0].texture;brushDestroy.call(this)})
 const primary=new Error('frame scheduling failed')
 vi.spyOn(globalThis,'requestAnimationFrame').mockImplementationOnce(()=>{throw primary})
 expect(()=>new PencilEngine(canvas as unknown as HTMLCanvasElement,{paper:'flat'})).toThrow(primary)
 expect(seenByBorrower).toBe(published);expect(published).toBeDefined()
 expect(add.mock.calls.length).toBeGreaterThan(2)
 for(const subscription of add.mock.calls as unknown[][])expect((remove.mock.calls as unknown[][]).some(removal=>removal[0]===subscription[0]&&removal[1]===subscription[1])).toBe(true)
 for(const result of programs.mock.results)if(result.type==='return')expect(deletedPrograms.mock.calls.filter(([value])=>value===result.value)).toHaveLength(1)
 expect(deletedPrograms.mock.calls.some(([value])=>value===foreignProgram)).toBe(false)
 expect(deletedTextures.mock.calls.some(([value])=>value===foreignTexture)).toBe(false)
 expect(snapshotContextStorage(gl as unknown as WebGLRenderingContext)).toMatchObject({residentBytes:0,reservedBytes:0,orphanBytes:0})
 gl.deleteTexture(foreignTexture);gl.deleteProgram(foreignProgram)
})
