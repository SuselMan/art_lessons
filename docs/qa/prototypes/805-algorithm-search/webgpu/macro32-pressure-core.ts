/** Bound uses SAME pressure head as actual shader, before curl and absorption. */
export const MAX_PRESSURE_HEAD_DELTA=73193
export function boundedPressure(q:number,dh:number,t:number){
 if(![1,2,4].includes(t)||!Number.isInteger(dh)||dh<0||dh>MAX_PRESSURE_HEAD_DELTA||!Number.isInteger(q)||q<0||q>Math.floor(dh/2))throw Error('Invalid bounded pressure input')
 if(t===1)return q;if(dh===0)return 0
 const relax=(x:number)=>Math.floor((2*x*(dh-x)+Math.floor(dh/2))/dh),q2=relax(q)
 return t===2?q2:relax(q2)
}
export interface PressureCell {w:number;s:number;absCap:number;paper:number}
export function pressureHead(c:PressureCell){if(!Number.isInteger(c.w)||c.w<0||c.w>65535||!Number.isInteger(c.absCap)||c.absCap<0||c.absCap>24512||!Number.isInteger(c.s)||c.s<0||c.s>c.absCap||!Number.isInteger(c.paper)||c.paper<0||c.paper>255)throw Error('Invalid pressure cell');return c.w+6*c.paper-Math.floor((c.absCap-c.s)/4)}
/** Pressure-only water transfer. Never claims curl/absorption/whole-step monotonicity. */
export function pressureTransfer(a:PressureCell,b:PressureCell,gain:number,t:number){
 if(!Number.isInteger(gain)||gain<1||gain>8)throw Error('Invalid gain')
 const ha=pressureHead(a),hb=pressureHead(b),dh=Math.abs(ha-hb),fromA=ha>hb,donor=fromA?a:b,receiver=fromA?b:a
 const round=(x:number,d:number)=>Math.floor((x+Math.floor(d/2))/d),q0=Math.min(round(dh*35*(1275-2*Math.max(a.paper,b.paper)),127500),Math.floor(donor.w*4/5),65535-receiver.w),mean=Math.min(Math.floor((a.w+b.w)/2)*gain,65535),q1=round(q0*mean,65535)
 const q=Math.min(boundedPressure(q1,dh,t),Math.floor(donor.w*4/5),65535-receiver.w),A={...a,w:a.w+(fromA?-q:q)},B={...b,w:b.w+(fromA?q:-q)}
 return{a:A,b:B,q,q1,dh,headDifferenceBefore:ha-hb,headDifferenceAfter:pressureHead(A)-pressureHead(B)}
}
