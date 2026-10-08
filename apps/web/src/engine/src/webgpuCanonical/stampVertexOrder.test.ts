import {expect,it} from 'vitest'
import {CANONICAL_STAMP_WGSL,canonicalStampShader} from './stamp'
it('preserves default and fragment bytes while matching production vertex expression order',()=>{
 expect(canonicalStampShader()).toBe(CANONICAL_STAMP_WGSL)
 const s=canonicalStampShader(true),anchor='fn nibDistance'
 expect(s.slice(s.indexOf(anchor))).toBe(CANONICAL_STAMP_WGSL.slice(CANONICAL_STAMP_WGSL.indexOf(anchor)))
 expect(s).toContain('let screenPos=rotated*u.pose.z*2.0+u.pose.xy;')
 expect(s).toContain('var clip=(screenPos/u.resolution)*2.0-1.0;clip.y=-clip.y;')
})
