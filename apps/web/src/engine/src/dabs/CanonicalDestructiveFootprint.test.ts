import{it,expect}from'vitest'
import{createCanonicalDestructiveFootprint as create,canonicalDestructiveCell as cell,canonicalDestructiveCellCount as count,canonicalDestructiveFootprintBytes as bytes}from'./CanonicalDestructiveFootprint'
it('retains FULL DAB64cells including zero-alpha, negative seams and gaps without clearing whole256tile',()=>{
 const owner=create({x:-128,y:-128,width:256,height:256},()=>{})
 expect(count(owner.snapshot())).toBe(16);expect(bytes({x:-128,y:-128,width:256,height:256})).toBe(272)
 owner.mark({minX:-65,minY:-65,maxX:-63,maxY:-63})
 const touched=Array.from({length:16},(_,i)=>cell(owner.snapshot(),i)).filter(Boolean)
 expect(touched).toEqual([{minX:-128,minY:-128,maxX:-64,maxY:-64},{minX:-64,minY:-128,maxX:0,maxY:-64},{minX:-128,minY:-64,maxX:-64,maxY:0},{minX:-64,minY:-64,maxX:0,maxY:0}])
 // A future queued DAB has not marked anything until actual successful paint.
 expect(cell(owner.snapshot(),15)).toBeUndefined()
 owner.mark({minX:127,minY:127,maxX:128,maxY:128});expect(cell(owner.snapshot(),15)).toEqual({minX:64,minY:64,maxX:128,maxY:128})
})
it('clips nativecells to physical storage and rejects forged/retired view without mutable array leaks',()=>{
 let alive=true;const owner=create({x:-3,y:7,width:10,height:10},()=>{if(!alive)throw Error('retired')})
 owner.mark({minX:-100,minY:-100,maxX:100,maxY:100})
 expect(cell(owner.snapshot(),0)).toEqual({minX:-3,minY:7,maxX:0,maxY:17})
 expect(cell(owner.snapshot(),1)).toEqual({minX:0,minY:7,maxX:7,maxY:17})
 expect(()=>count({kind:'canonical-destructive-64-domain-v1'})).toThrow('Unissued')
 alive=false;expect(()=>count(owner.snapshot())).toThrow('retired')
})

it('captured cuts never observe future marks in the SAME retained array identity',()=>{
 const owner=create({x:0,y:0,width:256,height:256},()=>{})
 owner.mark({minX:1,minY:1,maxX:2,maxY:2});const old=owner.snapshot()
 owner.mark({minX:255,minY:255,maxX:256,maxY:256});const next=owner.snapshot()
 expect(cell(old,0)).toEqual(cell(next,0));expect(cell(old,15)).toBeUndefined();expect(cell(next,15)).toEqual({minX:192,minY:192,maxX:256,maxY:256})
})

it('masked pending geometry becomes visible only after successful resolved publication',()=>{
 const owner=create({x:0,y:0,width:32,height:32},()=>{}),old=owner.snapshot();owner.stage({minX:1,minY:1,maxX:2,maxY:2})
 expect(cell(owner.snapshot(),0)).toBeUndefined();owner.publishPending();expect(cell(old,0)).toBeUndefined();expect(cell(owner.snapshot(),0)).toEqual({minX:0,minY:0,maxX:32,maxY:32})
})

it('captures storage geometry without retaining mutable caller aliases',()=>{
 const storage={x:0,y:0,width:32,height:32},owner=create(storage,()=>{})
 storage.x=1000;storage.width=1
 owner.mark({minX:1,minY:1,maxX:2,maxY:2})
 expect(cell(owner.snapshot(),0)).toEqual({minX:0,minY:0,maxX:32,maxY:32})
})
