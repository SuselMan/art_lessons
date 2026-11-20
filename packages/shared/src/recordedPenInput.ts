/** Tangential pressure is native painting input [0,1], not browser physical [-1,1].
 * Transport inputs only. No native sensor evaluation or capture policy here. */
export interface RecordedPenInput {sourceTwist?:number;sourceTangentialPressure?:number}
export function isSourceTwist(v:unknown):v is number{return typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<360}
export function isSourceTangentialPressure(v:unknown):v is number{return typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1}
export const EMPTY_RECORDED_PEN_INPUT:Readonly<RecordedPenInput>=Object.freeze({})
export function hasRecordedPenInput(v:RecordedPenInput):boolean{return v.sourceTwist!==undefined||v.sourceTangentialPressure!==undefined}
export function canonicalPenInput(v:RecordedPenInput):RecordedPenInput {
 if(!hasRecordedPenInput(v))return EMPTY_RECORDED_PEN_INPUT
 if(v.sourceTwist!==undefined&&!isSourceTwist(v.sourceTwist))throw Error('Invalid sourceTwist')
 if(v.sourceTangentialPressure!==undefined&&!isSourceTangentialPressure(v.sourceTangentialPressure))throw Error('Invalid sourceTangentialPressure')
 return{...(v.sourceTwist===undefined?{}:{sourceTwist:canonicalTwist(v.sourceTwist)}),...(v.sourceTangentialPressure===undefined?{}:{sourceTangentialPressure:Math.fround(v.sourceTangentialPressure)})}
}
export function canonicalTwist(v:number):number {if(!isSourceTwist(v))throw Error('Invalid sourceTwist');const f=Math.fround(v);return f===360?0:f}
function angularDistance(a:number,b:number):number{const d=Math.abs(a-b)%360;return d>180?360-d:d}
/** Native mixOtherImpl shortest arc; equal candidate distances choose minus. */
function mixTwist(a:number,b:number,t:number):number{const inc=t*angularDistance(b,a),plus=a+inc,minus=a-inc;const v=angularDistance(plus,b)<angularDistance(minus,b)?plus:minus;return ((v%360)+360)%360}
/** Bounded input interpolation. No sensor response/curve evaluation.
 * Missing endpoints never synthesize hardware input; exact endpoints retain it. */
export function interpolatePenInput(a:RecordedPenInput,b:RecordedPenInput,t:number):RecordedPenInput {
 if(!Number.isFinite(t)||t<0||t>1)throw Error('Invalid pen interpolation')
 if(!hasRecordedPenInput(a)&&!hasRecordedPenInput(b))return EMPTY_RECORDED_PEN_INPUT
 if(t===0)return canonicalPenInput(a);if(t===1)return canonicalPenInput(b)
 return canonicalPenInput({...(a.sourceTwist===undefined||b.sourceTwist===undefined?{}:{sourceTwist:mixTwist(a.sourceTwist,b.sourceTwist,t)}),...(a.sourceTangentialPressure===undefined||b.sourceTangentialPressure===undefined?{}:{sourceTangentialPressure:(1-t)*a.sourceTangentialPressure+t*b.sourceTangentialPressure})})
}
