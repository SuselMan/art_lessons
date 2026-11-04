import{it,expect}from'vitest'
import{sourceDissolveSeed,sourceDissolveByte,sourceDissolveUint32Bytes}from'./sourceDissolve'
it('uses canonical identity/role/ordinal rather than frame cuts or owner generations',()=>{
 const id=JSON.stringify(['own-room',7,'actor','stroke']),seed=sourceDissolveSeed(id)
 expect(sourceDissolveSeed(JSON.parse(JSON.stringify(id)))).toBe(seed)
 const one=[0,1,2,3,4].map(ordinal=>sourceDissolveSeed(id,{role:'primary',ordinal}))
 const split=[[0,1],[2],[3,4]].flat().map(ordinal=>sourceDissolveSeed(id,{role:'primary',ordinal}))
 expect(one).toEqual(split);expect(new Set(one).size).toBe(5)
 expect(sourceDissolveSeed(id,{role:'mask',ordinal:0})).not.toBe(one[0])
 expect(sourceDissolveSeed(id)).toBe(seed)
})
it('is continuous across signed tile boundaries and has no 256px row/block repeat',()=>{
 const seed=sourceDissolveSeed(JSON.stringify(['own-room',7,'actor','stroke']))
 const full=Array.from({length:512},(_,i)=>sourceDissolveByte(seed,i-256,-65))
 const chunks=[[-256,-1],[0,255]]as const
 expect(chunks.flatMap(([a,b])=>Array.from({length:b-a+1},(_,i)=>sourceDissolveByte(seed,a+i,-65)))).toEqual(full)
 expect(full.slice(0,256)).not.toEqual(full.slice(256))
})
it('has bounded broad spatial distribution and no adjacent-row copy over a256x256 world grid',()=>{
 const seed=sourceDissolveSeed('defined-dissolve-grid'),hist=new Uint32Array(256);let repeated=0,adjacent=0
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){const a=sourceDissolveByte(seed,x-128,y-128);hist[a]++;if(y){adjacent++;if(a===sourceDissolveByte(seed,x-128,y-129))repeated++}}
 expect([...hist].every(n=>n>150&&n<370)).toBe(true)
 expect(repeated/adjacent).toBeLessThan(.02)
 expect(sourceDissolveUint32Bytes(0x9e3779b9)).toEqual([185,121,55,158])
})

it('accepts existing safe-integer canvas coordinates and hashes explicit low32 bits without new signed32 cap',()=>{
 const seed=0x12345678,period=0x100000000
 for(const x of [0x80000000,-0x80000001,Number.MAX_SAFE_INTEGER,Number.MIN_SAFE_INTEGER]){
  expect(sourceDissolveByte(seed,x,x)).toBe(sourceDissolveByte(seed,x>>>0,x>>>0))
 }
 for(let dx=-2;dx<=2;dx++)expect(sourceDissolveByte(seed,0x7fffffff+dx,-0x80000000+dx)).toBe(sourceDissolveByte(seed,0x7fffffff+dx+period,-0x80000000+dx-period))
 for(const x of [Number.MAX_SAFE_INTEGER+1,NaN,Infinity,.5])expect(()=>sourceDissolveByte(seed,x,0)).toThrow('world coordinate')
})
