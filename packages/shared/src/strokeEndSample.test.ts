import { expect,it } from 'vitest'
import { hasValidStrokeEndSample,isStrokeEndSample } from './strokeEndSample.js'
const sample={x:10,y:4,pressure:1,tiltX:0,tiltY:0,size:1,aspectRatio:1,angle:0,opacity:1,t:20,baseSize:1,normalizedSpeed:0}
const op={type:'stroke',tool:'digitalBrush',strokeId:'gesture',strokeEnd:true,strokeEndSample:sample,dabsPacked:''}
it('permits a bounded endpoint-only final record and preserves explicit speedzero',()=>{
 expect(isStrokeEndSample(sample)).toBe(true);expect(hasValidStrokeEndSample(op)).toBe(true)
 expect(hasValidStrokeEndSample({type:'stroke'})).toBe(true)
})
it('rejects malformed, unbounded or nonfinal samples before painting',()=>{
 for(const patch of [{x:NaN},{baseSize:0},{size:Infinity},{normalizedSpeed:2},{pressure:2},{extra:0}])expect(isStrokeEndSample({...sample,...patch})).toBe(false)
 for(const patch of [{strokeEnd:false},{tool:'pencil'},{strokeId:''},{type:'layer_clear'}])expect(hasValidStrokeEndSample({...op,...patch})).toBe(false)
})
