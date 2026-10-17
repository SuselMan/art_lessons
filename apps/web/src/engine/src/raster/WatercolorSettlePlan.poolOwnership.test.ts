import {expect,it,vi} from 'vitest'
import {createTestEngine} from '../../testing/engineTestUtils'
import {RibbonScratchPool} from '../buffers/RibbonScratchPool'
import {RibbonStrokeScratch} from '../buffers/RibbonStrokeScratch'
import {ribbonProfileFor} from '../dabs/ribbonProfile'
import {createNativePuddleTarget} from '../watercolor/puddle/PuddleTarget'

it('keeps native source, settle-created scratch entries and released leases in the same pool',()=>{
  const {engine}=createTestEngine({paper:'flat'},{width:64,height:64})
  engine['gl'].colorMask=()=>{}
  const pool=new RibbonScratchPool(engine['gl']),owned=new Set<ReturnType<typeof pool.acquire>>()
  const acquire=pool.acquire.bind(pool),release=pool.release.bind(pool)
  vi.spyOn(pool,'acquire').mockImplementation((w,h)=>{const b=acquire(w,h);owned.add(b);return b})
  vi.spyOn(pool,'release').mockImplementation(b=>{expect(owned.has(b),'foreign pool lease returned').toBe(true);release(b)})
  const plan=engine['_settlePlan'].withScratchPool(pool)
  const key=pool.acquire(64,64),source=new RibbonStrokeScratch(pool,true,true)
  source.filmBuffers(key);source.paints.add('0,0,1')
  source.getOrCreate(key).solventLoad=pool.acquire(64,64)
  engine.initLayer('material')
  const preset='normal:95:34:PB29:round:wc@m70-r2-v1'
  source.noteFinish({target:engine['_layers'].get('material')!,preset:engine['_resolvePreset']('watercolor',preset),
    profile:ribbonProfileFor('watercolor',preset)!,color:[0,0,1],opacity:1,
    bounds:{minX:0,minY:0,maxX:64,maxY:64},fieldSeed:[0,0],landedWet:0,wetPeak:1,radiusPx:40,dwellMs:0})
  const native=createNativePuddleTarget({gl:engine['gl'],settlePlan:plan,pool,passes:engine['_watercolorPasses'],
    invalidateFrontPaths:()=>engine['_watercolorPasses'].invalidateFrontPaths(),hasActiveSettle:()=>false},64,{portableNoise:true})
  try{
    native.resetFromScratch(source,{buffer:key,originX:0,originY:0,contentRect:null},1)
    while(!native.state.done)native.step(16)
    expect(native.dry()).toBe(true)
  }finally{native.destroy();source.destroy();pool.release(key);plan.destroyTextures();pool.destroy();engine.destroy()}
})
