import {afterEach,expect,it,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {BrushMipCache} from '../dabs/BrushMipCache'
import {installScalarPowerAssetFetch} from '../../testing/scalarPowerTestAssets'
import {SOURCE_SCALAR_POWER_ASSETS} from './sourceScalarPowerAssets'
import {SOURCE_SCALAR_POWER_MODES,SOURCE_SCALAR_POWER_CPU_BYTES,SOURCE_SCALAR_POWER_STAGING_BYTES,prepareSourceScalarPowerTable,readSourceScalarPowerByte} from './sourceScalarPowerTable'
import {sourceRgba8SeparableChannel,compositeRgba8,SOURCE_RGBA8_GENERIC_SC_PROFILE as profile} from './sourceColorRgba8'
let restore:undefined|(()=>void)
afterEach(()=>{restore?.();restore=undefined;vi.restoreAllMocks()})
it('requires an issued exact-mode table instead of hidden Math.pow or a structural byte grant',async()=>{
 restore=installScalarPowerAssetFetch();const cpu=new BrushMipCache(),owner={}
 const table=await prepareSourceScalarPowerTable('easyDodge',cpu,owner)
 try{
  expect(()=>sourceRgba8SeparableChannel('easyDodge',64,192)).toThrow('issued')
  expect(()=>sourceRgba8SeparableChannel('easyDodge',64,192,{powerTable:{kind:'source-scalar-power-table-view-v1'}})).toThrow('issued')
  expect(()=>sourceRgba8SeparableChannel('easyBurn',64,192,{powerTable:table.view})).toThrow('issued')
  const pow=vi.spyOn(Math,'pow').mockImplementation(()=>{throw new Error('Host libm fallback')})
  expect(sourceRgba8SeparableChannel('easyDodge',255,0,{powerTable:table.view})).toBe(255)
  expect(compositeRgba8([255,255,255,255],[0,0,0,255],{mode:'easyDodge',profile,opacity:1},{powerTable:table.view})).toEqual([255,255,255,255])
  expect(pow).not.toHaveBeenCalled()
 }finally{table.release()}
 expect(cpu.reservedBytes).toBe(0)
 expect(()=>readSourceScalarPowerByte(table.view,'easyDodge',64,192)).toThrow('issued')
})
it('all five public artifacts traverse all65536 real CPU channel pairs with their canonical byte SHA',async()=>{
 restore=installScalarPowerAssetFetch();const cpu=new BrushMipCache(),owner={}
 for(const mode of SOURCE_SCALAR_POWER_MODES){const table=await prepareSourceScalarPowerTable(mode,cpu,owner)
  try{const actual=new Uint8Array(65536);for(let d=0;d<256;d++)for(let s=0;s<256;s++)actual[d*256+s]=sourceRgba8SeparableChannel(mode,s,d,{powerTable:table.view});expect(createHash('sha256').update(actual).digest('hex')).toBe(SOURCE_SCALAR_POWER_ASSETS[mode].sha256);expect(cpu.reservedBytes).toBe(SOURCE_SCALAR_POWER_CPU_BYTES)}finally{table.release()}
 }
 expect(cpu.reservedBytes).toBe(0)
})
it('retains actual CPU bytes until the last lease and rejects foreign owner or same-mode replacement views',async()=>{
 restore=installScalarPowerAssetFetch();const cpu=new BrushMipCache(),owner={},table=await prepareSourceScalarPowerTable('easyBurn',cpu,owner),release=table.retain()
 expect(()=>table.assertCurrent({},cpu)).toThrow('ownership')
 table.release();expect(cpu.reservedBytes).toBe(SOURCE_SCALAR_POWER_CPU_BYTES)
 expect(readSourceScalarPowerByte(table.view,'easyBurn',255,255)).toBe(255)
 expect(()=>table.retain()).toThrow('retired');release();release();expect(cpu.reservedBytes).toBe(0)
})
it('charges the real fetch/hash peak before network and releases all reservations on cancellation, wrong hash and throw undefined',async()=>{
 restore=installScalarPowerAssetFetch();const original=globalThis.fetch
 const tooSmall=new BrushMipCache(SOURCE_SCALAR_POWER_CPU_BYTES+SOURCE_SCALAR_POWER_STAGING_BYTES-1),fetch=vi.fn(original)
 globalThis.fetch=fetch
 await expect(prepareSourceScalarPowerTable('pNormA',tooSmall,{})).rejects.toThrow('budget');expect(fetch).not.toHaveBeenCalled();expect(tooSmall.reservedBytes).toBe(0)
 const cpu=new BrushMipCache(),controller=new AbortController()
 globalThis.fetch=async()=>{controller.abort();return new Response(new Uint8Array(65536),{headers:{'content-length':'65536'}})}
 await expect(prepareSourceScalarPowerTable('pNormA',cpu,{},controller.signal)).rejects.toThrow('cancelled');expect(cpu.reservedBytes).toBe(0)
 globalThis.fetch=async()=>new Response(new Uint8Array(65536),{headers:{'content-length':'65536'}})
 await expect(prepareSourceScalarPowerTable('pNormA',cpu,{})).rejects.toThrow('hash');expect(cpu.reservedBytes).toBe(0)
 globalThis.fetch=async()=>{throw undefined}
 let caught=false,value:unknown='not-thrown';try{await prepareSourceScalarPowerTable('pNormA',cpu,{})}catch(error){caught=true;value=error}expect(caught).toBe(true);expect(value).toBeUndefined();expect(cpu.reservedBytes).toBe(0)
})
