/** Crafted accepted-format arithmetic test, NOT a native/compiler artifact.
 * The loader's explicit -Infinity allowance must remain safe at row endpoints. */
import{describe,it,expect}from'vitest'
import{createBristleInkProfile}from'./brushBristleInk'
import{loadBristleSaturationTable,retireBristleSaturationTable,bristleSaturationTableValue}from'./brushBristleSaturationTable'
function fixture(absorbing:boolean){
 const profile=createBristleInkProfile({depletion:[0,.1,.2,.3,.4,.5],useOpacity:false,useSaturation:true,useWeights:true,pressureWeight:.25,bristleLengthWeight:.25,bristleInkAmountWeight:.25,inkDepletionWeight:.25})
 const rows=2,segments=5,base=8,paramOffset=64,segmentOffset=80,rowOffset=120,byteLength=rowOffset+rows*(base-1)*8
 let side=2;while(side*side<byteLength)side*=2
 const raw=new Uint8Array(side*side),v=new DataView(raw.buffer),u=(at:number,n:number)=>v.setUint32(at,n,true)
 u(0,0x42525339);u(4,1);u(8,rows);u(12,segments);u(16,base);u(20,6);v.setFloat64(24,.25,true);v.setFloat64(32,.75,true);u(40,0);u(44,paramOffset);u(48,segmentOffset);u(52,rowOffset);u(56,6);u(60,byteLength)
 for(let row=0;row<rows;row++){v.setFloat32(paramOffset+row*8,row*.75,true);u(paramOffset+row*8+4,row)}
 for(let i=0;i<segments;i++){u(segmentOffset+i*8,i+2);v.setFloat32(segmentOffset+i*8+4,.5-i*.04,true)}
 // For range [1,6), the middle reduction visits heap node5 (leaves2+3).
 // Both row endpoints represent the same fully absorbing transfer.
 if(absorbing)for(let row=0;row<rows;row++)for(const c of[0,4])v.setFloat32(rowOffset+(row*(base-1)+5-1)*8+c,-Infinity,true)
 return{profile,raw,byteLength}
}
describe('93 accepted absorbing tree endpoint arithmetic',()=>{
 for(const[pressure,length,label]of[[0,0,'lower mix0'],[2,1,'upper mix1']]as const){
  it(label+' reaches middle tree and remains absorbing',()=>{const f=fixture(true),table=loadBristleSaturationTable(f.profile,f.raw,f.byteLength)
   try{const result=bristleSaturationTableValue(table,f.profile,{counter:0,initialInk:1,length,pressure,samples:6},5,.75);expect(Number.isFinite(result)).toBe(true);expect(result).toBe(0)}finally{retireBristleSaturationTable(table)}
  })
 }
 it('finite control traverses the same middle node',()=>{const f=fixture(false),table=loadBristleSaturationTable(f.profile,f.raw,f.byteLength)
  try{const value=bristleSaturationTableValue(table,f.profile,{counter:0,initialInk:1,length:1,pressure:2,samples:6},5,.75);expect(Number.isFinite(value)).toBe(true);expect(value).toBeGreaterThan(0);expect(value).toBeLessThanOrEqual(1)}finally{retireBristleSaturationTable(table)}
 })
 it('retire rejects arithmetic use of the issued table',()=>{const f=fixture(false),table=loadBristleSaturationTable(f.profile,f.raw,f.byteLength);retireBristleSaturationTable(table);expect(()=>bristleSaturationTableValue(table,f.profile,{counter:0,initialInk:1,length:1,pressure:2,samples:6},5,.75)).toThrow('Expected matching issued')})
})
