import{pair168,library168}from'./dualMask168.testFixture.js'
import{ids151}from'./pixelOriginalDual151.testFixture.js'
export function pair184(mode:'constant'|'incremental'|'pressure'='incremental'){
 const b=pair168();b.version=184;const c=b.behavior!.dual!.brush;c.version=91;c.tip={kind:'bitmap',mask:ids151[1],hardness:1,aspect:1,angle:0,rotation:'fixed',animation:{mode,frames:[ids151[1],ids151[2]],...(mode==='pressure'?{rank:2}:{})}};return b
}
export function library184(mode:'constant'|'incremental'|'pressure'='incremental'){const l=library168();l.brushes[0].descriptor=pair184(mode);return l}
