import {afterEach,expect,it,vi} from 'vitest'
import {recordingGL} from '../../testing/brushPassTestUtils'
import {BrushMipCache} from './BrushMipCache'
import {BrushTextureCache} from './BrushTextureCache'
import {runBrushGlTurn,runBrushGlBatch,type BrushGlBatchParticipant} from './BrushGlBatch'
import {createBrushGlContextOwner,openBrushGlRestoreGate,closeBrushGlRestoreGate,saveBrushGlState,type BrushGlCanonicalCallbackScope} from './BrushGlState'

afterEach(()=>vi.restoreAllMocks())
function fixture(){
 const {gl,snapshot}=recordingGL(),cache=new BrushTextureCache(gl),cpu=new BrushMipCache(),buffer=gl.createBuffer(),texture=gl.createTexture()
 gl.bindBuffer(gl.ARRAY_BUFFER,buffer);for(let i=0;i<3;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,i===0?texture:null)}
 let alive=true,throws=false
 const pair=createBrushGlContextOwner(gl,{bufferIsCurrent:b=>{if(throws)throw Error('owner predicate');return alive&&b===buffer},textureIsCurrent:t=>{if(throws)throw Error('owner predicate');return alive&&t===texture}})
 const epoch={},service:BrushGlBatchParticipant={brushGlBatchInfo:()=>({gl,cache,cpu,epoch,attributes:[],instancing:null,vertexArrays:null,resources:[],contextOwner:pair.owner}),enterBrushGlBatch:()=>()=>{}}
 const bufferQueries=vi.spyOn(gl,'isBuffer'),textureQueries=vi.spyOn(gl,'isTexture')
 return{gl,snapshot,cache,cpu,buffer,texture,pair,service,bufferQueries,textureQueries,retire:()=>{alive=false},throwPredicates:()=>{throws=true}}
}
it('requires a separate genuine closed scope; advertising an owner alone keeps native restoration',()=>{
 const s=fixture(),before=s.snapshot()
 runBrushGlTurn({participants:[s.service]},()=>{s.gl.bindBuffer(s.gl.ARRAY_BUFFER,s.gl.createBuffer());s.gl.bindTexture(s.gl.TEXTURE_2D,s.gl.createTexture())})
 expect(s.bufferQueries).toHaveBeenCalledWith(s.buffer);expect(s.textureQueries).toHaveBeenCalledWith(s.texture);expect(s.snapshot()).toEqual(before);expect(s.cpu.reservedBytes).toBe(0)
})
it('uses the SAME genuine owner only inside its closed scope, restoring all state without known-handle queries',()=>{
 const s=fixture(),before=s.snapshot()
 runBrushGlTurn({participants:[s.service],callbackScope:s.pair.callbackScope},turn=>{
  runBrushGlBatch({turn,participants:[s.service]},()=>{s.gl.bindBuffer(s.gl.ARRAY_BUFFER,s.gl.createBuffer());s.gl.activeTexture(s.gl.TEXTURE0);s.gl.bindTexture(s.gl.TEXTURE_2D,s.gl.createTexture());s.gl.colorMask(true,true,true,true)})
  expect(s.snapshot()).toEqual(before)
 })
 expect(s.bufferQueries).not.toHaveBeenCalledWith(s.buffer);expect(s.textureQueries).not.toHaveBeenCalledWith(s.texture);expect(s.snapshot()).toEqual(before);expect(s.cpu.reservedBytes).toBe(0)
})
it.each(['copiedScope','copiedOwner','wrongGL','mismatchedOwner']as const)('keeps native checks for %s provenance without rejecting the old drawing path',kind=>{
 const s=fixture(),info=s.service.brushGlBatchInfo(),other=createBrushGlContextOwner(kind==='wrongGL'?recordingGL().gl:s.gl,{bufferIsCurrent:()=>true,textureIsCurrent:()=>true})
 let scope=s.pair.callbackScope
 if(kind==='copiedScope')scope={...scope} as BrushGlCanonicalCallbackScope
 if(kind==='copiedOwner'){const copied={...s.pair.owner};s.service.brushGlBatchInfo=()=>({...info,contextOwner:copied})}
 if(kind==='wrongGL'){scope=other.callbackScope;s.service.brushGlBatchInfo=()=>({...info,contextOwner:other.owner})}
 if(kind==='mismatchedOwner')scope=other.callbackScope
 runBrushGlTurn({participants:[s.service],callbackScope:scope},()=>{})
 expect(s.bufferQueries).toHaveBeenCalledWith(s.buffer);expect(s.textureQueries).toHaveBeenCalledWith(s.texture);expect(s.cpu.reservedBytes).toBe(0)
})
it('downgrades before an unknown lease can delete managed names and never re-enables the gate for outer restoration',()=>{
 const s=fixture()
 runBrushGlTurn({participants:[s.service],callbackScope:s.pair.callbackScope},turn=>{
  runBrushGlBatch({turn,participants:[s.service],owners:[{owner:{},lease:()=>{s.gl.deleteBuffer(s.buffer);s.gl.deleteTexture(s.texture);return()=>{}}}]},()=>{})
 })
 expect(s.bufferQueries).toHaveBeenCalledWith(s.buffer);expect(s.textureQueries).toHaveBeenCalledWith(s.texture)
 expect(s.gl.getParameter(s.gl.ARRAY_BUFFER_BINDING)).toBeNull();s.gl.activeTexture(s.gl.TEXTURE0);expect(s.gl.getParameter(s.gl.TEXTURE_BINDING_2D)).toBeNull();expect(s.cpu.reservedBytes).toBe(0)
})
it('rechecks owner lifetime BETWEEN positive inner restoration and outer restoration',()=>{
 const s=fixture()
 runBrushGlTurn({participants:[s.service],callbackScope:s.pair.callbackScope},turn=>{
  runBrushGlBatch({turn,participants:[s.service]},()=>{})
  expect(s.bufferQueries).not.toHaveBeenCalledWith(s.buffer);expect(s.textureQueries).not.toHaveBeenCalledWith(s.texture)
  s.retire();s.gl.deleteBuffer(s.buffer);s.gl.deleteTexture(s.texture)
 })
 expect(s.bufferQueries).toHaveBeenCalledWith(s.buffer);expect(s.textureQueries).toHaveBeenCalledWith(s.texture)
 expect(s.gl.getParameter(s.gl.ARRAY_BUFFER_BINDING)).toBeNull();expect(s.cpu.reservedBytes).toBe(0)
})
it('falls back on owner rejection/throw and preserves a retired native name when actual deletion failed',()=>{
 const s=fixture(),primary=Error('delete failed'),before=s.snapshot()
 vi.spyOn(s.gl,'deleteTexture').mockImplementation(()=>{throw primary})
 expect(()=>runBrushGlTurn({participants:[s.service],callbackScope:s.pair.callbackScope},()=>{s.retire();s.gl.deleteTexture(s.texture)})).toThrow(primary)
 expect(s.textureQueries).toHaveBeenCalledWith(s.texture);expect(s.snapshot()).toEqual(before)
 s.throwPredicates();runBrushGlTurn({participants:[s.service],callbackScope:s.pair.callbackScope},()=>{})
 expect(s.bufferQueries).toHaveBeenCalledWith(s.buffer);expect(s.textureQueries).toHaveBeenCalledWith(s.texture);expect(s.cpu.reservedBytes).toBe(0)
})
it('closing the per-turn gate invalidates retained restore closures without caching a positive validity result',()=>{
 const s=fixture(),gate=openBrushGlRestoreGate(s.pair.callbackScope,s.gl,s.pair.owner),restore=saveBrushGlState(s.gl,[],null,null,1,false,gate)
 restore();expect(s.bufferQueries).not.toHaveBeenCalledWith(s.buffer);expect(s.textureQueries).not.toHaveBeenCalledWith(s.texture)
 closeBrushGlRestoreGate(gate);restore();expect(s.bufferQueries).toHaveBeenCalledWith(s.buffer);expect(s.textureQueries).toHaveBeenCalledWith(s.texture)
})
