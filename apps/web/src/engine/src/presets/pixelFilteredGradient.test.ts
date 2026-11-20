import{uploadBrushTexture}from'../dabs/BrushTextureCache'
import{expect,it}from'vitest'
import{pixelGradientSourcePixels,pixelGradientPalettePixels}from'./pixelFilteredGradient'
const palette=Array.from({length:256},(_,i)=>i===128?'00ff00ff':i<128?'ff0000ff':'0000ffff').join('')
it('retains gray under transparent alpha and discriminates filtering before mapping from old mapped-pixel interpolation',()=>{
 const raw=pixelGradientSourcePixels(new Uint8Array([255,0]),new Uint8Array([0,255]));expect([...raw]).toEqual([0,0,0,255,255,255,255,0])
 const lut=pixelGradientPalettePixels(palette),gray=Math.floor((raw[0]+raw[4])*.5+.5),alpha=(raw[3]+raw[7])*.5/255,index=gray*4
 expect(gray).toBe(128);expect([...lut.slice(index,index+4)]).toEqual([0,255,0,255]);expect([lut[index]*alpha,lut[index+1]*alpha,lut[index+2]*alpha]).toEqual([0,127.5,0])
 // Old map-before-filter combines red/transparent endpoint, cannot yield green.
 expect(lut[1]).toBe(0);expect(lut[255*4+1]).toBe(0)
})
it('rejects malformed palettes and unequal or oversized source planes',()=>{
 expect(()=>pixelGradientPalettePixels('bad')).toThrow();expect(()=>pixelGradientSourcePixels(new Uint8Array(1),new Uint8Array(2))).toThrow();expect(()=>pixelGradientSourcePixels(new Uint8Array(512*512+1),new Uint8Array(512*512+1))).toThrow()
})
it('uploads exact nearest rectangular palette with explicit straight unpack and restores distinct ambient state on undefined failure',()=>{
 for(const fail of[false,true]){
  const stores=new Map<number,number>([[3317,4],[37440,1],[37441,1],[37443,37444]]),params=new Map<number,number>(),old={}as WebGLTexture;let active=33986,bound:WebGLTexture|null=old,deleted=0,sawUpload=false
  const gl={ACTIVE_TEXTURE:34016,TEXTURE_BINDING_2D:32873,UNPACK_ALIGNMENT:3317,UNPACK_FLIP_Y_WEBGL:37440,UNPACK_PREMULTIPLY_ALPHA_WEBGL:37441,UNPACK_COLORSPACE_CONVERSION_WEBGL:37443,NONE:0,TEXTURE_2D:3553,RGBA:6408,UNSIGNED_BYTE:5121,CLAMP_TO_EDGE:33071,TEXTURE_MIN_FILTER:10241,TEXTURE_MAG_FILTER:10240,TEXTURE_WRAP_S:10242,TEXTURE_WRAP_T:10243,NEAREST:9728,LINEAR:9729,LINEAR_MIPMAP_LINEAR:9987,
   getParameter:(parameter:number)=>parameter===34016?active:parameter===32873?bound:stores.get(parameter),createTexture:()=>({})as WebGLTexture,activeTexture:(unit:number)=>{active=unit},bindTexture:(_target:number,texture:WebGLTexture|null)=>{bound=texture},pixelStorei:(parameter:number,value:number)=>stores.set(parameter,value),texParameteri:(_target:number,parameter:number,value:number)=>params.set(parameter,value),deleteTexture:()=>{deleted++},texImage2D:()=>{sawUpload=true;expect([...stores.values()]).toEqual([1,0,0,0]);if(fail)throw undefined}}
  let threw=false
  try{const entry=uploadBrushTexture(gl as unknown as WebGLRenderingContext,[pixelGradientPalettePixels(palette)],gl.RGBA,gl.CLAMP_TO_EDGE,false,{width:256,height:1,nearest:true,straight:true});expect(entry.bytes).toBe(1024)}catch(error){threw=true;expect(error).toBeUndefined()}
  expect(threw).toBe(fail);expect(sawUpload).toBe(true);expect(active).toBe(33986);expect(bound).toBe(old);expect([...stores.values()]).toEqual([4,1,1,37444]);expect(deleted).toBe(fail?1:0)
  if(!fail){expect(params.get(10241)).toBe(9728);expect(params.get(10240)).toBe(9728)}
 }
})
