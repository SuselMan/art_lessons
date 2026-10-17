import {expect,it} from 'vitest'
import {PaperWetness} from './paperWetness'
it('owns committed wet-cell bytes and restores their original clock without changing another layer',()=>{
 const wet=new PaperWetness()
 wet.deposit('L',12,12,8,.8,100,false,.4)
 wet.deposit('other',60,60,8,.7,100,false,.2)
 const saved=wet.captureLayer('L')
 const old=wet.sample('L',12,12,200)
 wet.deposit('L',12,12,8,1,200,false,.7)
 expect(wet.captureLayer('L')).not.toEqual(saved)
 wet.forgetLayer('L');wet.restoreLayer('L',saved)
 expect(wet.sample('L',12,12,200)).toBe(old)
 expect(wet.sample('L',12,12,1000)).toBeLessThan(old)
 expect(wet.anyWetNear('other',60,60,8,200)).toBe(true)
 expect(wet.captureLayer('L')).toEqual(saved)
})
