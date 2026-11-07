import {expect,it} from 'vitest'
import {prepareAutoMaskNoiseGrid,autoMaskNoiseGridUniforms,autoMaskNoiseAlpha,autoMaskNoiseCoordinateBytes,autoMaskNoiseHash,autoMaskNoiseKey,autoMaskNoiseUniforms,prepareAutoMaskNoise,BRUSH_AUTO_MASK_NOISE_GLSL} from './autoMaskNoise'
const mask=0xffffffffn
const bigMix=(input:bigint):bigint=>{
 let h=input&mask
 h=((h^(h>>16n))*0x85ebca6bn)&mask
 h=((h^(h>>13n))*0xc2b2ae35n)&mask
 return (h^(h>>16n))&mask
}
const bigPixel=(key:number,x:number,y:number):number=>Number(bigMix(BigInt(key)^((BigInt(x)&mask)*0x9e3779b1n&mask)^((BigInt(y)&mask)*0x85ebca77n&mask)))
it('matches an independent wide-integer reference for full32 identity and coordinate wrapping',()=>{
 for(const seed of [0,1,0x80000000,0xffffffff])for(const ordinal of [0,1,0xffffffff,Number.MAX_SAFE_INTEGER])for(const role of [0,1] as const){
  const expected=Number(bigMix(BigInt(seed)^(((BigInt(ordinal)+1n)*0x9e3779b1n)&mask)^((3n*0x85ebca77n)&mask)^(role===0?0xa511e9b3n:0xd1b54a35n)))
  const key=autoMaskNoiseKey(seed,ordinal,2,role)
  expect(key).toBe(expected)
  for(const coordinate of [-Number.MAX_SAFE_INTEGER,-4294967297,-2147483649,-1,0,255,256,2147483648,4294967297,Number.MAX_SAFE_INTEGER]){const y=coordinate===Number.MAX_SAFE_INTEGER?coordinate-1:coordinate+1;expect(autoMaskNoiseHash(key,coordinate,y)).toBe(bigPixel(key,coordinate,y))}
 }
 expect(autoMaskNoiseCoordinateBytes(-1)).toEqual([255,255,255,255])
 expect(autoMaskNoiseCoordinateBytes(4294967297)).toEqual([1,0,0,0])
 expect(()=>autoMaskNoiseCoordinateBytes(Number.MAX_SAFE_INTEGER+1)).toThrow(RangeError)
})
it('implements staged native mechanisms with the declared D16/R8 functional quantization',()=>{
 const key=autoMaskNoiseKey(7,8,9,0)
 for(const density of [0,.2,.5,1])for(const randomness of [0,.1,.5,1])for(const alpha of [0,1,127,255]){
  const noise=prepareAutoMaskNoise(density,randomness),[d,r]=autoMaskNoiseUniforms(noise)
  for(let x=0;x<32;x++){
   const h=bigPixel(key,x,-11),weight=BigInt((255-r)*255+r*(h>>>24))
   const attenuated=Number(BigInt(alpha)*weight/65025n)
   const expected=d===0?0:(d===65535||(h&65535)<=d)?attenuated:0
   expect(autoMaskNoiseAlpha(alpha,noise,key,x,-11)).toBe(expected)
  }
 }
 const opaque=prepareAutoMaskNoise(1,0)
 expect(autoMaskNoiseAlpha(127,opaque,key,0,0)).toBe(127)
 expect(autoMaskNoiseAlpha(255,prepareAutoMaskNoise(0,0),key,0,0)).toBe(0)
 expect(autoMaskNoiseAlpha(0,prepareAutoMaskNoise(.5,1),key,0,0)).toBe(0)
})
it('keeps density holes distinct from opacity attenuation and avoids short spatial correlation',()=>{
 const key=autoMaskNoiseKey(0x12345678,10,0,0),density=prepareAutoMaskNoise(.5,0),randomness=prepareAutoMaskNoise(1,1)
 let retained=0,sum=0,adjacentEqual=0,cross=0,aSum=0,bSum=0
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){
  const alpha=autoMaskNoiseAlpha(255,density,key,x,y)
  expect(alpha===0||alpha===255).toBe(true)
  if(alpha)retained++
  sum+=autoMaskNoiseAlpha(255,randomness,key,x,y)
  const h=autoMaskNoiseHash(key,x,y),a=(h>>>24)/255,b=(h&65535)/65535
  aSum+=a;bSum+=b;cross+=a*b
  if(x>0&&(h&255)===(autoMaskNoiseHash(key,x-1,y)&255))adjacentEqual++
 }
 expect(retained/65536).toBeGreaterThan(.49);expect(retained/65536).toBeLessThan(.51)
 expect(sum/65536).toBeGreaterThan(126);expect(sum/65536).toBeLessThan(129)
 expect(adjacentEqual).toBeLessThan(700)
 expect(Math.abs(cross/65536-(aSum/65536)*(bSum/65536))).toBeLessThan(.003)
})
it('is independent of tile/crop/traversal order and changes with actual dab/role identity',()=>{
 const noise=prepareAutoMaskNoise(.7,.4),key=autoMaskNoiseKey(100,2,0,0)
 const origin={x:-4294967310,y:2147483640}
 const pixel=(worldX:number,worldY:number)=>autoMaskNoiseAlpha(200,noise,key,worldX-origin.x,worldY-origin.y)
 const full=new Map<string,number>()
 for(let y=0;y<12;y++)for(let x=0;x<20;x++)full.set(`${x},${y}`,pixel(origin.x+x,origin.y+y))
 for(const tileX of [0,10])for(let y=11;y>=0;y--)for(let x=tileX+9;x>=tileX;x--)expect(pixel(origin.x+x,origin.y+y)).toBe(full.get(`${x},${y}`))
 for(let x=4;x<11;x++)expect(autoMaskNoiseAlpha(200,noise,key,x,6)).toBe(full.get(`${x},6`))
 const other=autoMaskNoiseKey(100,3,0,0),role=autoMaskNoiseKey(100,2,0,1)
 let changed=0,roleChanged=0
 for(let x=0;x<100;x++){
  if(autoMaskNoiseHash(key,x,6)!==autoMaskNoiseHash(other,x,6))changed++
  if(autoMaskNoiseHash(key,x,6)!==autoMaskNoiseHash(role,x,6))roleChanged++
 }
 expect(changed).toBeGreaterThan(95);expect(roleChanged).toBeGreaterThan(95)
})
it('rejects forged configuration and malformed source inputs without mutable aliases',()=>{
 const noise=prepareAutoMaskNoise(.5,.2)
 expect(Object.isFrozen(noise)).toBe(true)
 expect(()=>autoMaskNoiseAlpha(255,Object.freeze({...noise}),0,0,0)).toThrow(TypeError)
 const uniforms=autoMaskNoiseUniforms(noise);uniforms[0]=0
 expect(autoMaskNoiseUniforms(noise)[0]).toBe(32768)
 for(const n of [NaN,Infinity,-.1,1.01])expect(()=>prepareAutoMaskNoise(n,0)).toThrow(RangeError)
 for(const alpha of [-1,.1,256,NaN])expect(()=>autoMaskNoiseAlpha(alpha,noise,0,0,0)).toThrow(RangeError)
 expect(()=>autoMaskNoiseKey(0,-1,0,0)).toThrow(RangeError)
 expect(()=>autoMaskNoiseHash(0,1.5,0)).toThrow(RangeError)
})
it('publishes an opt-in highp byte shader with exact bounded multiply/divide and bypass',()=>{
 expect(BRUSH_AUTO_MASK_NOISE_GLSL).toContain('if(config.y<0.5&&config.x>=65535.0)return alpha')
 expect(BRUSH_AUTO_MASK_NOISE_GLSL).toContain('float factor=(255.0-config.y)*255.0+config.y*h.w')
 expect(BRUSH_AUTO_MASK_NOISE_GLSL).toContain('brushNoisePositiveFloor(alpha*factor,65025.0)')
 expect(BRUSH_AUTO_MASK_NOISE_GLSL).toContain('densitySample<=config.x')
 expect(BRUSH_AUTO_MASK_NOISE_GLSL).not.toMatch(/\bsin\s*\(|\buint\b|texture2D|Math.random/)
 // Every product and carry in the byte convolution is an exactly representable
 // integer in Float32; this bounds the shader graph rather than claiming GPU run.
 expect(Math.fround(255*65025)).toBe(255*65025)
 expect(Math.fround(4*255*255+1024)).toBe(4*255*255+1024)
})

it('matches the ES1 byte-convolution/xorshift graph to independent BigInt words',()=>{
 type Word=[number,number,number,number]
 const bytes=(n:number):Word=>autoMaskNoiseCoordinateBytes(n)
 const word=(w:Word)=>w[0]+w[1]*256+w[2]*65536+w[3]*16777216
 const xorByte=(a:number,b:number)=>{let out=0,p=1;for(let i=0;i<8;i++){if(a%2!==b%2)out+=p;a=Math.floor(a/2);b=Math.floor(b/2);p*=2}return out}
 const xor=(a:Word,b:Word):Word=>[xorByte(a[0],b[0]),xorByte(a[1],b[1]),xorByte(a[2],b[2]),xorByte(a[3],b[3])]
 const multiply=(a:Word,b:Word):Word=>{
  const result:Word=[0,0,0,0];let carry=0
  for(let i=0;i<4;i++){let sum=carry;for(let j=0;j<=i;j++)sum+=a[j]*b[i-j];expect(Math.fround(sum)).toBe(sum);result[i]=sum%256;carry=Math.floor(sum/256)}
  return result
 }
 const right16=(a:Word):Word=>[a[2],a[3],0,0]
 const right13=(a:Word):Word=>[Math.floor(a[1]/32)+(a[2]%32)*8,Math.floor(a[2]/32)+(a[3]%32)*8,Math.floor(a[3]/32),0]
 const shaderMix=(a:Word):Word=>{
  let h=multiply(xor(a,right16(a)),[107,202,235,133])
  h=multiply(xor(h,right13(h)),[53,174,178,194])
  return xor(h,right16(h))
 }
 for(const key of [0,1,0xffffffff,0x7fffffff])for(const x of [-4294967297,-1,0,255,256,2147483648])for(const y of [-65537,0,65535]){
  const combined=xor(bytes(key),xor(multiply(bytes(x),[177,121,55,158]),multiply(bytes(y),[119,202,235,133])))
  expect(word(shaderMix(combined))).toBe(bigPixel(key,x,y))
 }
})
it('derives a conservative F32 full-dab grid independent of tiles, angle and frame cuts',()=>{
 const grid=prepareAutoMaskNoiseGrid(-4294967300.25,2147483648.75,10,2,false,-1,1)
 expect(grid).toEqual({originX:-4294967313,originY:2147483636,width:25,height:25,flipX:-1,flipY:1})
 const a=autoMaskNoiseGridUniforms(grid,-4294967320,2147483620,64)
 const b=autoMaskNoiseGridUniforms(grid,-4294967288,2147483620,64)
 const word=(v:number[])=>v[0]+v[1]*256+v[2]*65536+v[3]*16777216
 expect((word(a.x)+40*a.stepX)>>>0).toBe((word(b.x)+8*b.stepX)>>>0)
 expect(a.stepY).toBe(-1)
 expect(prepareAutoMaskNoiseGrid(0,0,10,2,true).width).toBe(41)
 expect(()=>autoMaskNoiseGridUniforms(Object.freeze({...grid}),0,0,64)).toThrow(TypeError)
 expect(()=>prepareAutoMaskNoiseGrid(Number.MAX_SAFE_INTEGER,0,10,2,false)).toThrow('Unsafe')
})
