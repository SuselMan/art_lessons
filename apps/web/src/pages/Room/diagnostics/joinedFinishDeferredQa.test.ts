import { expect, it } from 'vitest'
import { joinedFinishDeferredQaEnabled } from './joinedFinishDeferredQa'
it('default OFF; explicit DEV constructor opt-in only; other experimental query flags cannot enable it',()=>{
 for(const query of ['', '?qaJoinedTouch=1', '?qaJoinedFinishDeferred=0'])expect(joinedFinishDeferredQaEnabled(true,undefined,query)).toBe(false)
 expect(joinedFinishDeferredQaEnabled(true,undefined,'?qaJoinedFinishDeferred=1')).toBe(true)
 expect(joinedFinishDeferredQaEnabled(true,'1','')).toBe(true)
 expect(joinedFinishDeferredQaEnabled(false,'1','?qaJoinedFinishDeferred=1')).toBe(false)
})
