import {expect,it} from 'vitest'
import {puddleDimensions,puddleLowDimensions} from './PuddleDimensions'
it('preserves square numeric dimensions and the original low grid',()=>{
 for(const n of [1,16,256,512,1024]){
  expect(puddleDimensions(n)).toEqual(puddleDimensions({width:n,height:n}))
  expect(puddleLowDimensions(n)).toEqual({width:256,height:256})
 }
})
it('preserves aspect and world sampling density for both orientations',()=>{
 expect(puddleLowDimensions({width:768,height:512})).toEqual({width:256,height:171})
 expect(puddleLowDimensions({width:512,height:768})).toEqual({width:171,height:256})
})
for(const n of [0,-1,NaN,Infinity,1.5])it(`rejects invalid dimension ${n}`,()=>{
 expect(()=>puddleDimensions({width:n,height:512})).toThrow('Invalid puddle dimensions')
 expect(()=>puddleDimensions({width:512,height:n})).toThrow('Invalid puddle dimensions')
})
