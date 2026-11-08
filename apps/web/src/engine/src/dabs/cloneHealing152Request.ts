import type{Dab,BrushSourceContext}from'@grafetto/shared'
import type{WorldRect}from'../buffers/tileMath'
/** qt/qtbase v5.15.2 qglobal.h qRound, also existing Bristle139 baseline.
 * Negative half ties go toward +infinity; Qt6 half-away is not claimed. */
export function cloneSourceRound152(v:number):number{if(!Number.isFinite(v)||Math.abs(v)>Number.MAX_SAFE_INTEGER-1)throw RangeError('Healing source coordinate exceeds exact integer domain');return Math.floor(v+.5)}
export function cloneSourceOffset152(rect:WorldRect,dab:Pick<Dab,'x'|'y'>,source:NonNullable<BrushSourceContext['clone']>,aligned:boolean):{x:number;y:number}{const dx=aligned?source.offsetX:source.x-dab.x,dy=aligned?source.offsetY:source.y-dab.y;return{x:cloneSourceRound152(rect.minX+dx)-rect.minX,y:cloneSourceRound152(rect.minY+dy)-rect.minY}}
