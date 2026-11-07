import{it,expect,vi}from'vitest'
import{MockGL}from'../../testing/mockGL'
import{AccumulationBuffer}from'../buffers/AccumulationBuffer'
import{SpraySourceAtlas,spraySourceNeighborhoods,type SpraySourceAtlasOwner}from'./SpraySourceAtlas'
import type{PaintTarget}from'../buffers/ILayerBuffer'
function fixture(){const gl=new MockGL()as unknown as WebGLRenderingContext,atlas=new SpraySourceAtlas(gl),created:AccumulationBuffer[]=[],released=vi.fn(),current=vi.fn();const owner:SpraySourceAtlasOwner={cellWidth:8,cellHeight:8,assertCurrent:current,acquire(size){const buffer=new AccumulationBuffer(gl,size,size);created.push(buffer);return{buffer,release(){released();buffer.destroy()}}},resolveCells:()=>[]};return{gl,atlas,owner,current,released,created}}
function tile(gl:WebGLRenderingContext,x:number,y:number):PaintTarget{return{buffer:new AccumulationBuffer(gl,8,8),originX:x,originY:y,contentRect:{minX:x,minY:y,maxX:x+8,maxY:y+8}}}
it('matches independently rounded native four-neighbour weights including negatives and non255 sums',()=>{
 expect(spraySourceNeighborhoods([{x:-.5,y:-.5}])[0]).toEqual({index:0,x:-1,y:-1,weights:[64,64,64,64],normalizer:256})
 expect(spraySourceNeighborhoods([{x:1.1,y:2.2}])[0]).toMatchObject({x:1,y:2,weights:[184,20,46,5],normalizer:255})
 expect(spraySourceNeighborhoods([{x:9,y:8}])[0].weights).toEqual([255,0,0,0])
 expect(()=>spraySourceNeighborhoods(Array.from({length:4097},()=>({x:0,y:0})))).toThrow('4096')
 expect(()=>spraySourceNeighborhoods([{x:Infinity,y:0}])).toThrow('point')
})
it('resolves one <=2x2-cell tuple and draws immediately before next resolve, preserving ordered atlas indices',()=>{
 const f=fixture(),tiles=[tile(f.gl,0,0),tile(f.gl,8,0),tile(f.gl,0,8),tile(f.gl,8,8)],second=tile(f.gl,24,0),draw=vi.spyOn(f.gl,'drawArrays'),upload=vi.spyOn(f.gl,'bufferData'),resolves:number[]=[]
 f.owner.resolveCells=rect=>{resolves.push(draw.mock.calls.length);return rect.minX===0?tiles:[second]}
 try{const view=f.atlas.collect([{x:7.5,y:7.5},{x:7.25,y:7.5},{x:25,y:1}],f.owner);if(!view)throw Error('Expected owned atlas');expect(resolves).toEqual([0,1]);expect(draw.mock.calls.map(c=>c[2])).toEqual([2,1]);expect(view.size).toBe(2);expect(view.count).toBe(3)
 const writes=upload.mock.calls.filter(c=>c[1]instanceof Float32Array);const last=writes.at(-1)?.[1];if(!(last instanceof Float32Array))throw Error('Expected source vertices');expect(Array.from(last.slice(0,2))).toEqual([.5,1.5]);expect(last[10]).toBe(1)
 view.release();view.release();expect(f.released).toHaveBeenCalledTimes(1);expect(()=>view.assertCurrent()).toThrow('released')
 }finally{f.atlas.destroy();for(const t of [...tiles,second])t.buffer.destroy()}
})
it('bounds one lease to64x64 for4096 points, transparent missing cells do not allocate source tiles',()=>{
 const f=fixture(),resolve=vi.spyOn(f.owner,'resolveCells'),acquire=vi.spyOn(f.owner,'acquire')
 try{expect(f.atlas.collect([],f.owner)).toBeUndefined();expect(acquire).not.toHaveBeenCalled();const view=f.atlas.collect(Array.from({length:4096},()=>({x:100000.5,y:-99999.5})),f.owner);if(!view)throw Error('Expected transparent atlas');expect(acquire).toHaveBeenCalledTimes(1);expect(acquire).toHaveBeenCalledWith(64);expect(resolve).toHaveBeenCalledTimes(1);view.release();expect(f.released).toHaveBeenCalledTimes(1)}finally{f.atlas.destroy()}
})
it('releases once after resolver invalidation and context-generation changes before pixels',()=>{
 const f=fixture(),draw=vi.spyOn(f.gl,'drawArrays');let valid=true;f.owner.assertCurrent=()=>{if(!valid)throw Error('retired request')};f.owner.resolveCells=()=>{valid=false;return[]}
 try{expect(()=>f.atlas.collect([{x:0,y:0}],f.owner)).toThrow('retired request');expect(f.released).toHaveBeenCalledTimes(1);expect(draw).not.toHaveBeenCalled();valid=true;f.owner.resolveCells=()=>{f.atlas.reset();return[]};expect(()=>f.atlas.collect([{x:0,y:0}],f.owner)).toThrow('generation');expect(f.released).toHaveBeenCalledTimes(2)}finally{f.atlas.destroy()}
})
it('preserves draw throw undefined, attempts sampler restoration/end/release even when cleanup also throws',()=>{
 const f=fixture(),source=tile(f.gl,0,0),point=vi.spyOn(source.buffer,'setPointSampling');f.owner.resolveCells=()=>[source]
 const draw=vi.spyOn(f.gl,'drawArrays').mockImplementation(()=>{throw undefined});point.mockImplementation(on=>{if(!on)throw Error('sampler cleanup fault')})
 try{let caught=false;try{f.atlas.collect([{x:.5,y:.5}],f.owner)}catch(error){caught=true;expect(error).toBeUndefined()}expect(caught).toBe(true);expect(point.mock.calls).toEqual([[true],[false]]);expect(f.released).toHaveBeenCalledTimes(1);draw.mockRestore()}finally{f.atlas.destroy();source.buffer.destroy()}
})
it('rejects invalid scratch geometry before pixels and releases acquired scratch after failure',()=>{
 const f=fixture(),source=tile(f.gl,0,0);f.owner.resolveCells=()=>[source];f.owner.acquire=()=>({buffer:source.buffer,release:f.released})
 try{expect(()=>f.atlas.collect([{x:0,y:0}],f.owner)).toThrow('scratch');expect(f.released).toHaveBeenCalledTimes(1)}finally{f.atlas.destroy();source.buffer.destroy()}
})
