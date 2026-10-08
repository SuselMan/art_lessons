/** Byte-preserving LA→RGBA expansion; no per-texel temporary arrays. */
export function expandCanonicalPaperLa(la:Uint8Array):Uint8Array {
 if(la.length%2)throw new Error('Canonical paper requires complete LA texels')
 const rgba=new Uint8Array(la.length*2)
 for(let i=0,j=0;i<la.length;i+=2,j+=4){const l=la[i];rgba[j]=l;rgba[j+1]=l;rgba[j+2]=l;rgba[j+3]=la[i+1]}
 return rgba
}
