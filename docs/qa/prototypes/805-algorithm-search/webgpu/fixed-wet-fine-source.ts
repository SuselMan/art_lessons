function once(s:string,a:string,b:string){if(s.split(a).length!==2)throw Error('Fixed wet fine source drift: '+a);return s.replace(a,b)}
const oldSelection='var m=c.m;var d=c.d;if((stationary[i]>>24u)==0u){m=interpolateCarrier(gid.xy,false);d=interpolateCarrier(gid.xy,true);}fineDeposit[i]=d;'
const capacitySelection='var m=c.m;var d=c.d;let biM=interpolateCarrier(gid.xy,false);let biD=interpolateCarrier(gid.xy,true);let literalAlpha=(stationary[i]>>24u)*257u;if(literalAlpha+biM.a+biD.a<=65535u){m=biM;d=biD;}fineDeposit[i]=d;'
/** Keep affinity helpers/operators; replace unsafe masked BLR only. paper vec4 holds derivedPaper/rawRGBA/kind/0. */
export function fixedWetFineInit(source:string){
 let s=source;const deposit=s.includes('fineDeposit:array<vec4u>;')
 if(deposit){const selection=s.includes(oldSelection)?oldSelection:capacitySelection;s=once(s,selection,'var m=c.m;var d=c.d;fineDeposit[i]=d;')}
 else{s=once(s,'@compute ','@group(0) @binding(7) var<storage,read_write> fineDeposit:array<vec4u>;\n@compute ');s=once(s,'let fixedAlpha=', 'var m=c.m;var d=c.d;fineDeposit[i]=d;let fixedAlpha=');s=once(s,'mobile[i]=c.m;','mobile[i]=m;');s=s.replaceAll('c.m.a','m.a').replaceAll('c.d.a','d.a')}
 s=once(s,'let c=coarse[q.y*p.n+q.x];','var c=coarse[q.y*p.n+q.x];let rawKind=paper[i].z;if(rawKind==0u){c.m=vec4u(0);c.d=vec4u(0);}else if(rawKind==2u){let raw=paper[i].y;c.m=vec4u(raw&255u,(raw>>8u)&255u,(raw>>16u)&255u,raw>>24u)*257u;c.d=vec4u(0);}')
 s=once(s,'let wet=select(0u,1u,c.w+c.s>0u);','let wet=select(0u,1u,rawKind>0u);')
 s=once(s,'paper:array<u32>;','paper:array<vec4u>;')
 // Only old affinity scalar reads change. The inserted raw payload has explicit .y/.z.
 s=s.replace(/paper\[i\](?!\.)/g,'paper[i].x')
 return s
}
export function fixedWetFinePack(source:string){if(source.includes('fineDeposit:array<vec4u>;'))return source;return once(once(source,'@compute ','@group(0) @binding(6) var<storage,read> fineDeposit:array<vec4u>;\n@compute '),'let value=fine[i]+c.d;','let value=fine[i]+fineDeposit[i];')}
/** Mandatory component exchange, followed by the model's original paper operator. */
export function fixedWetComponentPair(source:string){
 const start=' if(qa.z>0u&&qb.z>0u){',end='\n dest[ia]=a;dest[ib]=b;';const a=source.indexOf(start),b=source.indexOf(end)
 if(a<0||b<a||source.split(start).length!==2||source.split(end).length!==2)throw Error('Fixed component pair source drift')
 return source.slice(0,a)+` if(qa.z>0u&&qb.z>0u){let da=i32(b.a)-i32(a.a);let free=select(qb.x-b.a,qa.x-a.a,da>=0);var rate=64u;if(da!=0){rate=min(64u,free*256u/u32(abs(da)));}for(var k=0u;k<4u;k++){let delta=i32(b[k])-i32(a[k]);let magnitude=(u32(abs(delta))*rate+128u)/256u;let q=select(-i32(magnitude),i32(magnitude),delta>=0);a[k]=u32(i32(a[k])+q);b[k]=u32(i32(b[k])-q);}}`+source.slice(b)
}
