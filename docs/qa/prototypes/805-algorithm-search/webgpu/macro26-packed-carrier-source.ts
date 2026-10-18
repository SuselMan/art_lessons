/** Representation only: four proven u16 carrier codes in two u32 storage words. */
function once(s:string,a:string,b:string){if(s.split(a).length!==2)throw Error('Packed carrier source drift: '+a);return s.replace(a,b)}
const codec=`fn encodeFineCarrier(v:vec4u)->vec2u{return vec2u(v.r|(v.g<<16u),v.b|(v.a<<16u));}
fn decodeFineCarrier(v:vec2u)->vec4u{return vec4u(v.x&65535u,v.x>>16u,v.y&65535u,v.y>>16u);}
`
export function packFineCarrier(v:readonly number[]){if(v.length!==4||!v.every(x=>Number.isInteger(x)&&x>=0&&x<=65535))throw Error('Carrier outside u16');return[(v[0]|(v[1]<<16))>>>0,(v[2]|(v[3]<<16))>>>0]}
export function unpackFineCarrier(v:readonly number[]){if(v.length!==2||!v.every(x=>Number.isInteger(x)&&x>=0&&x<=0xffffffff))throw Error('Invalid packed carrier');return[v[0]&65535,v[0]>>>16,v[1]&65535,v[1]>>>16]}
export function compactCarrierInit(source:string){
 let s=once(source,'mobile:array<vec4u>;','mobile:array<vec2u>;')
 s=once(s,'mobile[i]=vec4u(0);','mobile[i]=encodeFineCarrier(vec4u(0));')
 const smooth=s.includes('fineDeposit:array<vec4u>;')
 s=once(s,smooth?'mobile[i]=m;':'mobile[i]=c.m;',smooth?'mobile[i]=encodeFineCarrier(m);':'mobile[i]=encodeFineCarrier(c.m);')
 if(smooth){s=once(s,'fineDeposit:array<vec4u>;','fineDeposit:array<vec2u>;');s=once(s,'fineDeposit[i]=d;','fineDeposit[i]=encodeFineCarrier(d);')}
 return once(s,'@compute ',codec+'@compute ')
}
export function compactCarrierPair(source:string){
 let s=once(once(source,'source:array<vec4u>;','source:array<vec2u>;'),'dest:array<vec4u>;','dest:array<vec2u>;')
 s=once(s,'var a=source[ia];var b=source[ib];','var a=decodeFineCarrier(source[ia]);var b=decodeFineCarrier(source[ib]);')
 s=once(s,'dest[ia]=a;dest[ib]=b;','dest[ia]=encodeFineCarrier(a);dest[ib]=encodeFineCarrier(b);')
 // Boundary copies are already exact packed-word copies.
 return once(s,'@compute ',codec+'@compute ')
}
export function compactCarrierPack(source:string){
 let s=once(source,'fine:array<vec4u>;','fine:array<vec2u>;')
 if(s.includes('fineDeposit:array<vec4u>;')){s=once(s,'fineDeposit:array<vec4u>;','fineDeposit:array<vec2u>;');s=once(s,'let value=fine[i]+fineDeposit[i];','let value=decodeFineCarrier(fine[i])+decodeFineCarrier(fineDeposit[i]);')}
 else s=once(s,'let value=fine[i]+c.d;','let value=decodeFineCarrier(fine[i])+c.d;')
 return once(s,'@compute ',codec+'@compute ')
}
