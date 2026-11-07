import{it,expect,vi}from'vitest'
import{installBrushLibrary,installBrushPixels}from'../../brushLibrary'
import{createTestEngine,paperReady}from'../../testing/engineTestUtils'
import type{BrushPreparationResource}from'./BrushPreparation'
/** Internal prepared-resource integration; does not grant public descriptor
 * admission while the root library guard deliberately remains closed. */
it('prepares premultiplied original RGB in the existing t:rgba cache once and lends a generation-checked view',async()=>{
 const ids=Array.from({length:4},(_,i)=>`asset:${(700+i).toString(16).padStart(64,'0')}`as const)
 installBrushLibrary({schemaVersion:1,brushes:[],assets:ids.map(id=>({id,size:2,file:id.slice(6)+'.bin'})),skipped:[]})
 const values=[[128,255,0,64],[200,10,255,100],[100,20,0,150],[50,30,255,200]]
 ids.forEach((id,i)=>installBrushPixels(id,new Uint8Array(values[i])))
 const planes:readonly[string,string,string]=[ids[1],ids[2],ids[3]]
 const{engine}=createTestEngine(),resource:BrushPreparationResource={painter:'stamp',id:ids[0],grain:false,colorPlanes:planes}
 try{await paperReady(engine);const painter=engine['_brush'],upload=vi.spyOn(engine['gl'],'texImage2D'),before=painter['textures'].bytes
 expect(()=>painter['preparedImage'](ids[0],planes)).toThrow('not prepared')
 painter.prepareTexture([resource],resource);painter.prepareTexture([resource],resource)
 const rgba=(upload.mock.calls as readonly unknown[][]).filter(c=>c[2]===engine['gl'].RGBA&&c[3]===2&&c[4]===2);expect(rgba).toHaveLength(1);const pixels=rgba[0][8];if(!(pixels instanceof Uint8Array))throw Error('Expected actual RGBA upload');expect(Array.from(pixels)).toEqual([100,50,25,128,10,20,30,255,0,0,0,0,25,38,50,64]);expect(painter['textures'].bytes-before).toBe(16);expect(painter.hasPreparedTexture(resource)).toBe(true)
 const view=painter['preparedImage'](ids[0],planes);expect(view.crop).toEqual({x:0,y:0,width:2,height:2});expect(()=>view.assertCurrent()).not.toThrow();painter.initGL();expect(()=>view.assertCurrent()).toThrow('retired')
 }finally{engine.destroy()}
})
