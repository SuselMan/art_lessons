/** Independent scalar reference for the effective current PAPER_COMPOSE_FRAG
 * wet branch. It is display-only; it never mutates canonical pigment. */
export function wetPaperPixelOracle(acc:readonly[number,number,number,number],height:number,paperColor:readonly[number,number,number],overlay:readonly[number,number,number,number]):readonly[number,number,number,number] {
 const clamp=(x:number)=>Math.max(0,Math.min(1,x)),smooth=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)},mix=(a:number,b:number,t:number)=>a+(b-a)*t
 const [raw,standing,,bodyByte]=overlay,body=Math.max(bodyByte,.05),t=clamp(raw/body),inside=t>=.048?1:0,pool=inside*smooth(.08,.45,standing)*smooth(.1,.5,raw)
 const wet=Math.max(inside*smooth(.35,.95,raw),pool),damp=inside*smooth(.048,.42,t)*smooth(.04,.30,raw),fresh=inside*smooth(.45,1,raw),shownHeight=mix(height,.5,wet*.5),graphite=clamp(acc[3]),onPaint=smooth(.02,.25,graphite),share=mix(.50,.12,onPaint)
 const channel=(ch:0|1|2)=>{const tone=Math.max(.035,Math.min(.965,paperColor[ch]))+.035*(shownHeight*2-1),stroke=graphite>.001?clamp(acc[ch]/graphite):0,texture=mix(1,shownHeight*.5+.2,graphite*.25);let color=mix(tone,mix(tone,stroke,texture),graphite)
  color*=1-.012*damp*share;color*=mix(1,.93,fresh*(1-onPaint)*share);color=Math.pow(Math.max(color,0),1+.35*fresh*onPaint*share);color*=mix(1,.92,pool*(1-onPaint)*share);color=Math.pow(Math.max(color,0),1+.45*pool*onPaint*share);return Math.round(clamp(color)*255)}
 return[channel(0),channel(1),channel(2),255]
}
