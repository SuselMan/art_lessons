import {shortestSourceTurn} from '../input/kritaStrokeInput'

/** Pinned KisPaintInformation::mixOtherImpl / kis_global.h F64 rotation law.
 * Degrees stay unnormalized; antipodal ties choose the subtracting direction.
 * Authoring only. The operation stores the resulting material geometry. */
export function sourceRotationMixDegrees(previous:number,next:number,fraction:number):number {
 if(previous===next)return previous
 const first=previous*Math.PI/180,last=next*Math.PI/180
 const step=fraction*shortestSourceTurn(last,first)
 const plus=first+step,minus=first-step
 const angle=shortestSourceTurn(plus,last)<shortestSourceTurn(minus,last)?plus:minus
 return angle*180/Math.PI
}
