import type{WorldRect}from'../buffers/tileMath'
/** Functional D65 sRGB/Lab16 reference; not ICC/Qt byte identity. */
export type Lab3=readonly[number,number,number]
export function srgbLab16(rgb:readonly number[]):Lab3{
 const [r,g,b]=rgb.map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4)
 const f=(v:number)=>v>216/24389?Math.cbrt(v):(24389*v/27+16)/116
 const x=f((.4124564*r+.3575761*g+.1804375*b)/.95047),y=f(.2126729*r+.7151522*g+.072175*b),z=f((.0193339*r+.119192*g+.9503041*b)/1.08883)
 return[(116*y-16)/100,(500*(x-y)+128)/255,(200*(y-z)+128)/255].map(v=>Math.round(Math.max(0,Math.min(1,v))*65535))as unknown as Lab3
}
export function lab16Srgb(lab:Lab3):Lab3{
 const L=lab[0]/65535*100,a=lab[1]/65535*255-128,b=lab[2]/65535*255-128,fy=(L+16)/116,fx=fy+a/500,fz=fy-b/200
 const f=(v:number)=>v>6/29?v**3:3*(6/29)**2*(v-4/29)
 const x=.95047*f(fx),y=f(fy),z=1.08883*f(fz),linear=[3.2404542*x-1.5371385*y-.4985314*z,-.969266*x+1.8760108*y+.041556*z,.0556434*x-.2040259*y+1.0572252*z]
 return linear.map(v=>Math.max(0,Math.min(1,v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055)))as unknown as Lab3
}
export function healingRatios152(source:readonly Lab3[],guide:readonly Lab3[],width:number,height:number):Lab3[]{
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<3||height<3||source.length!==width*height||guide.length!==source.length)throw Error('Healing domain')
 let current=source.map((s,i)=>s.map((v,k)=>guide[i][k]/Math.max(v,1)))
 for(let iteration=0;iteration<100;iteration++)current=current.map((v,i)=>{const x=i%width,y=Math.floor(i/width);return x===0||y===0||x===width-1||y===height-1?[...v]:v.map((c,k)=>(current[i-1][k]+current[i+1][k]+current[i-width][k]+current[i+width][k]+2*c)/6)})
 return current as unknown as Lab3[]
}
export function healLab152(source:readonly Lab3[],guide:readonly Lab3[],width:number,height:number):Lab3[]{return healingRatios152(source,guide,width,height).map((r,i)=>r.map((v,k)=>Math.trunc(Math.max(0,Math.min(65535,v*Math.max(source[i][k],1))))))as unknown as Lab3[]}
/** Positive bounded float codec: 23 mantissa bits, exponent byte biased127.
 * RGBA holds DATA (not premultiplied color); must use replace and nearest. */
export function packRatio152(value:number):[number,number,number,number]{
 if(!Number.isFinite(value)||value<0||value>65535)throw Error('Ratio range');if(value===0)return[0,0,0,0]
 let exponent=Math.floor(Math.log2(value)),mantissa=Math.round((value/2**exponent-1)*8388608)
 if(mantissa===8388608){mantissa=0;exponent++}
 return[mantissa%256,Math.floor(mantissa/256)%256,Math.floor(mantissa/65536),exponent+127]
}
export function unpackRatio152(bytes:readonly number[]):number{return bytes[3]===0?0:(1+(bytes[0]+256*bytes[1]+65536*bytes[2])/8388608)*2**(bytes[3]-127)}
export interface CloneHealing152Plan{readonly paintRect:WorldRect;readonly guideRect:WorldRect;readonly paintWidth:number;readonly paintHeight:number;readonly solveWidth:number;readonly solveHeight:number;readonly storageSide:number;readonly bytes:number;readonly expanded:boolean}
/** Native geometry, deterministic cleared-zero source fringe (not native scratchcarry).
 * Emptyrect ->null/noPaint; unsupportedgeometry throwsRangeError beforeanyallocation. */
export function planCloneHealing152(rect:WorldRect):CloneHealing152Plan|null{
 const w=rect.maxX-rect.minX,h=rect.maxY-rect.minY
 if(![rect.minX,rect.minY,rect.maxX,rect.maxY,w,h].every(Number.isSafeInteger)||w<0||h<0)throw new RangeError('Healing152 geometry')
 if(!w||!h)return null
 const expanded=w<3||h<3,pad=expanded?1:0,sw=w+2*pad,sh=h+2*pad,n=Math.max(sw,sh)
 const guideRect={minX:rect.minX-pad,minY:rect.minY-pad,maxX:rect.maxX+pad,maxY:rect.maxY+pad}
 if(n>512||![guideRect.minX,guideRect.minY,guideRect.maxX,guideRect.maxY,guideRect.minX+n,guideRect.minY+n].every(Number.isSafeInteger))throw new RangeError('Healing152 geometry')
 return{paintRect:{...rect},guideRect,paintWidth:w,paintHeight:h,solveWidth:sw,solveHeight:sh,storageSide:n,bytes:4*(2*n*n+6*sw*sh+w*h),expanded}
}
export function healingBytes152(width:number,height=width):number{return planCloneHealing152({minX:0,minY:0,maxX:width,maxY:height})?.bytes??0}
export type HealingPma152=readonly[number,number,number,number]
/** Independent CPU reference of ONErequest sourceCOPY/guide/solve/top-leftcrop. */
export function healPma152(source:readonly HealingPma152[],guide:readonly HealingPma152[],width:number,height:number):[number,number,number,number][]{
 const plan=planCloneHealing152({minX:0,minY:0,maxX:width,maxY:height});if(!plan){if(source.length||guide.length)throw Error('Empty healing inputs');return[]}
 const{solveWidth:sw,solveHeight:sh}=plan;if(source.length!==width*height||guide.length!==sw*sh)throw Error('Healing reference dimensions')
 const lab=(p:HealingPma152)=>srgbLab16(p[3]?[p[0]/p[3],p[1]/p[3],p[2]/p[3]]:[0,0,0]),s=Array.from({length:sw*sh},()=>srgbLab16([0,0,0]));for(let y=0;y<height;y++)for(let x=0;x<width;x++)s[y*sw+x]=lab(source[y*width+x])
 const healed=healLab152(s,guide.map(lab),sw,sh),result:[number,number,number,number][]=[]
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const alpha=source[y*width+x][3],rgb=lab16Srgb(healed[y*sw+x]);result.push([Math.round(rgb[0]*alpha),Math.round(rgb[1]*alpha),Math.round(rgb[2]*alpha),alpha])}return result
}
