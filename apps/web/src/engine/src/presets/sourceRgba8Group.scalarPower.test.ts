import {afterAll,beforeAll,expect,it} from 'vitest'
import {loadScalarPowerTestTables} from '../../testing/scalarPowerTestAssets'
import {compositeRgba8,SOURCE_RGBA8_GENERIC_SC_PROFILE as profile} from './sourceColorRgba8'
import {renderRgba8Group} from './sourceRgba8Group'
let tables:Awaited<ReturnType<typeof loadScalarPowerTestTables>>
beforeAll(async()=>{tables=await loadScalarPowerTestTables()});afterAll(()=>tables.release())
it('forwards the exact issued table through the real group outer loop and preserves original input buffers',()=>{
 const pixels=Uint8Array.from([64,128,192,255,192,128,64,255]),before=pixels.slice()
 const destination={x:-3,y:7,width:2,height:1,pixels},particles=[{x:-3,y:7,width:2,height:1,material:{kind:'solid' as const,color:[127,127,127,255]as const},opacity:1,coverage:new Uint8Array([255,255])}]
 const execution=tables.context('easyBurn'),outer={mode:'easyBurn' as const,profile,opacity:1}
 const result=renderRgba8Group(destination,particles,outer,{maximumBytes:128,maximumParticles:4,maximumWorkPixels:16},undefined,execution)
 for(let index=0;index<2;index++)expect([...result.output.pixels.slice(index*4,index*4+4)]).toEqual(compositeRgba8([127,127,127,255],[before[index*4],before[index*4+1],before[index*4+2],255],outer,execution))
 expect(pixels).toEqual(before)
})

it('Dissolve uses actual safe-integer world pixels across full, retiled and cropped groups, including negative and above-signed32 origins',()=>{
 const limits={maximumBytes:16384,maximumParticles:4,maximumWorkPixels:4096},outer={mode:'dissolve' as const,profile,opacity:128/255,seed:0x128934ab}
 for(const [originX,originY]of [[-273,7],[0x80000000+17,-700],[Number.MAX_SAFE_INTEGER-1024,Number.MIN_SAFE_INTEGER+1024]]as const){
  const render=(x:number,width:number)=>renderRgba8Group({x,y:originY,width,height:1,pixels:Uint8Array.from({length:width*4},(_,index)=>[32,64,96,255][index%4])},[{x,y:originY,width,height:1,material:{kind:'solid',color:[200,100,50,255]},opacity:1,coverage:new Uint8Array(width).fill(255)}],outer,limits,undefined,{worldPoint:[0,0]}).output.pixels
  const full=render(originX,512),tiled=new Uint8Array(2048)
  for(let offset=0;offset<512;offset+=64)tiled.set(render(originX+offset,64),offset*4)
  expect(tiled).toEqual(full);expect(render(originX+137,174)).toEqual(full.slice(137*4,311*4));expect(full.slice(0,1024)).not.toEqual(full.slice(1024))
  for(let offset=0;offset<512;offset++)expect([...full.slice(offset*4,offset*4+4)]).toEqual(compositeRgba8([200,100,50,255],[32,64,96,255],outer,{worldPoint:[originX+offset,originY]}))
 }
})
