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
export function healingBytes152(width:number,height=width):number{if(![width,height].every(v=>Number.isSafeInteger(v)&&v>=3&&v<=512))throw Error('Healing rectangular domain3..512');const side=Math.max(width,height);return 4*(2*side*side+7*width*height)}
