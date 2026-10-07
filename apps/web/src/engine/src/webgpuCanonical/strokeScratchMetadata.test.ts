import { expect,it,vi } from 'vitest'
import { CanonicalStrokeScratchMetadata,canonicalSourceRevealRect } from './strokeScratchMetadata'
import { createCanonicalStrokeChunkState } from '../dabs/canonicalStrokeChunk'
import type { SettlePlanScratch } from '../watercolor/SettlePlanContracts'
import type { CanonicalFieldBuffer } from './fieldBuffer'

function fixture(){
 const owner={},tile={originX:100,originY:200,buffer:{owner,width:32,height:48}} as any
 const tiles={pool:{owner},peek:vi.fn(),getOrCreate:vi.fn(),tileEntries:vi.fn(),runningCoverage:vi.fn(),releaseRunningCoverage:vi.fn()} as any
 const delivery=createCanonicalStrokeChunkState(),scratch=new CanonicalStrokeScratchMetadata(tiles,delivery,[tile])
 const contract:SettlePlanScratch<CanonicalFieldBuffer>=scratch
 return{tile,tiles,delivery,scratch,contract}
}
it('exact reveal scissor at nonzero origin, fractional bounds, clipping, and no intersection',()=>{
 const {tile}=fixture()
 expect(canonicalSourceRevealRect(tile,{minX:99.5,minY:210.2,maxX:112.1,maxY:225.8})).toEqual([0,22,13,16])
 expect(canonicalSourceRevealRect(tile,{minX:133,minY:201,maxX:150,maxY:220})).toBeNull()
})
it('gesture/material epochs follow chronology; begin delegates existing CPU reset; newFilm clears only travel',()=>{
 const {scratch,delivery}=fixture(),reset=vi.fn()
 delivery.wetContacts.push({x:1,y:2,radius:3,aspect:1,angle:0})
 scratch.beginStroke(reset);expect(reset).toHaveBeenCalledOnce();expect(scratch.materialGesture).toBe(1)
 scratch.activateMaterialFilm(1);scratch.newFilm();expect(scratch.gesture).toBe(2);expect(scratch.materialGesture).toBe(1);expect(delivery.wetContacts).toHaveLength(1)
 expect(()=>scratch.activateMaterialFilm(0)).toThrow('chronological');expect(()=>scratch.activateMaterialFilm(3)).toThrow('chronological')
 scratch.activateMaterialFilm(2)
})
it('finish retains first constants, unions bounds and maxes only production fields; unknown storage remains unknown',()=>{
 const {scratch}=fixture(),first={bounds:{minX:1,minY:2,maxX:3,maxY:4},radiusPx:3,dwellMs:10,wetPeak:.1,landedWet:.2,opacity:.6}
 scratch.noteFinish(first);scratch.noteFinish({bounds:{minX:-1,minY:0,maxX:5,maxY:8},radiusPx:4,dwellMs:4,wetPeak:.8,landedWet:.9,opacity:.9})
 expect(scratch.finishContext).toEqual({...first,bounds:{minX:-1,minY:0,maxX:5,maxY:8},radiusPx:4,dwellMs:10,wetPeak:.8})
 expect(scratch.finishContext?.landedWet).toBe(.2);expect(scratch.finishContext?.opacity).toBe(.6)
 expect(scratch.storageBounds).toEqual({minX:-1,minY:0,maxX:5,maxY:8});scratch.markStorageUnknown();scratch.noteStorageBounds({minX:-99,minY:-99,maxX:99,maxY:99});expect(scratch.storageBounds).toBeUndefined()
})
it('running capture default off, snapshots when enabled, release clears transient callbacks and mode',()=>{
 const {scratch,tiles,tile}=fixture(),command=vi.fn()
 scratch.runningCoverage(tile.buffer);scratch.recordRunningSource(command);expect(tiles.runningCoverage).not.toHaveBeenCalled();expect(scratch.runningSourceCommands).toEqual([])
 scratch.trackRunningSource=true;scratch.runningCoverage(tile.buffer);scratch.recordRunningSource(command);expect(scratch.runningSourceCommands).toEqual([command])
 scratch.releaseRunningCoverage();expect(tiles.releaseRunningCoverage).toHaveBeenCalledOnce();expect(scratch.runningSourceCommands).toEqual([]);expect(scratch.trackRunningSource).toBe(false)
 expect(()=>scratch.releaseRunningCoverage(true)).toThrow('unsupported')
})
it('capture owns mutable metadata while preserving resource identity and rejecting fanout',()=>{
 const {scratch,tile,delivery}=fixture(),target={buffer:tile.buffer}
 scratch.paints.add('a');delivery.wetContacts.push({x:1,y:2,radius:3,aspect:1,angle:0});scratch.dryCtx={bounds:{minX:0,minY:0,maxX:3,maxY:4},radiusPx:5,standing:.7,target,fieldSeed:[1,2]}
 const captured=scratch.captureMetadata();scratch.paints.add('b');delivery.wetContacts[0].x=99;(scratch.dryCtx.fieldSeed as number[])[0]=88
 expect(captured.paints).toEqual(new Set(['a']));expect(captured.wetContacts[0].x).toBe(1);expect((captured.dryCtx as any).fieldSeed).toEqual([1,2]);expect((captured.dryCtx as any).target).toBe(target)
 expect(()=>scratch.peek({} as any)).toThrow('fanout')
})
