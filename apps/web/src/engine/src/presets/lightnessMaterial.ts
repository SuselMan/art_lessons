/** Encoded-RGB channel shift and HSL-lightness gamut fit. This deliberately
 * preserves channel differences until clipping, rather than HSL saturation. */
export function lightnessMaterialColor(rgb: readonly number[], gray: number, strength: number): [number,number,number] {
  const lightness=(Math.max(...rgb)+Math.min(...rgb))/2
  const x=(gray-.5)*strength+.5,b=4*lightness-1
  const target=Math.max(0,Math.min(1,(1-b)*x*x+b*x))
  let out=rgb.map(c=>c+target-lightness)
  const low=Math.min(...out)
  if(low<0) out=out.map(c=>target+(c-target)*target/Math.max(target-low,1e-8))
  const high=Math.max(...out)
  if(high>1) out=out.map(c=>target+(c-target)*(1-target)/Math.max(high-target,1e-8))
  return out.map(c=>Math.max(0,Math.min(1,c))) as [number,number,number]
}
/** Source alpha is independent of subsequent dab flow/opacity. */
export const lightnessMaterialCoverage=(tipAlpha:number,foregroundAlpha=1):number=>Math.min(tipAlpha,foregroundAlpha)

/** Filter premultiplied gray and alpha together. Transparent source RGB never
 * leaks into visible edges. Source CAS planes remain immutable one-channel data. */
export function lightnessMaterialMips(alpha:Uint8Array,gray:Uint8Array):Uint8Array[] {
  const side=Math.sqrt(alpha.length)
  if(gray.length!==alpha.length || !Number.isInteger(side) || side<2 || (side&(side-1))!==0) throw Error('Lightness material planes must have equal POT dimensions')
  const base=new Uint8Array(alpha.length*2)
  for(let i=0;i<alpha.length;i++) {base[i*2]=Math.round(gray[i]*alpha[i]/255);base[i*2+1]=alpha[i]}
  const levels=[base]
  for(let size=side;size>1;size>>=1) {
    const source=levels[levels.length-1],half=size>>1,next=new Uint8Array(half*half*2)
    for(let y=0;y<half;y++) for(let x=0;x<half;x++) for(let c=0;c<2;c++) {
      const i=(y*2*size+x*2)*2+c
      next[(y*half+x)*2+c]=(source[i]+source[i+2]+source[i+size*2]+source[i+size*2+2]+2)>>2
    }
    levels.push(next)
  }
  return levels
}
