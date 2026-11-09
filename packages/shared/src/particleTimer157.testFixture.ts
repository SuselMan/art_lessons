import{particle134,library134,dab134}from'./particleWash134.testFixture.js'
import type{BrushDescriptor}from'./brushes.js'
export function particle157():BrushDescriptor{const b=particle134();b.version=157;b.id='imported-157157157157157157157157';b.behavior!.rendering!.accumulation='directOver';b.behavior!.timing={version:1,rate:20,ignoreDistanceSpacing:false};return b}
export function library157(){const l=library134();l.brushes[0].descriptor=particle157();return l}
export const dab157=(x=10,t=0)=>({...dab134(x,t),sourceTime:t})
