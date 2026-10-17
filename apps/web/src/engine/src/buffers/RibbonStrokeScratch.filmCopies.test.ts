import {expect,it,vi} from 'vitest'
import {MockGL} from '../../testing/mockGL'
import {AccumulationBuffer} from './AccumulationBuffer'
import {RibbonScratchPool} from './RibbonScratchPool'
import {RibbonStrokeScratch} from './RibbonStrokeScratch'
// MockGL models scalar RGBA copy geometry, not watercolor shaders. A device
// comparison of all RGBA channels remains required before promotion.
for(const[width,height]of [[512,512],[512,768],[768,512],[1024,1024]])it(`copies complete ${width}x${height} film bases without redefining storage`,()=>{
 const gl=new MockGL() as unknown as WebGLRenderingContext,pool=new RibbonScratchPool(gl),tile=new AccumulationBuffer(gl,width,height),scratch=new RibbonStrokeScratch(pool,true,true)
 try{
  const entry=scratch.getOrCreate(tile)
  const pixels=(phase:number)=>{const bytes=new Uint8Array(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++)bytes.fill((x*13+y*7+phase)%256,(y*width+x)*4,(y*width+x+1)*4);return bytes}
  entry.solventLoad=pool.acquire(width,height)
  const redefine=vi.spyOn(gl,'copyTexImage2D'),subcopy=vi.spyOn(gl,'copyTexSubImage2D')
  for(const phase of [19,137]){
   const data=pixels(phase)
   for(const buffer of [entry.inkLoad!,entry.inkColor!,entry.solventLoad])buffer.restorePixelsRect(width,height,data)
   scratch.beginStroke();redefine.mockClear();subcopy.mockClear()
   const film=scratch.filmBuffers(tile)!,water=scratch.solventFilm(tile)
   for(const[source,destination]of [[entry.inkLoad!,film.inkBase],[entry.inkColor!,film.colorBase!],[entry.solventLoad,water.base]]){
    const expected=source.readPixels(),actual=destination.readPixels()
    expect(actual.length).toBe(expected.length)
    expect(actual.every((value,index)=>value===expected[index])).toBe(true)
    expect([destination.width,destination.height]).toEqual([width,height])
   }
   expect(film.strokeInk.readPixels().every(value=>value===0)).toBe(true)
   expect(film.strokeColor!.readPixels().every(value=>value===0)).toBe(true)
   expect(water.film.readPixels().every(value=>value===0)).toBe(true)
   expect(redefine).not.toHaveBeenCalled()
   expect(subcopy).toHaveBeenCalledTimes(3)
   expect(subcopy.mock.calls.every(call=>call[2]===0&&call[3]===0&&call[4]===0&&call[5]===0&&call[6]===width&&call[7]===height)).toBe(true)
  }
 }finally{scratch.destroy();pool.trimFree();tile.destroy()}
})
