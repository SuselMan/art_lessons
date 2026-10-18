'use strict';
// Two diagnostics of LINEAR carrier alpha; no PNG/gamma/display threshold.
function smoothAlpha(a,w,h){
 const tmp=new Float64Array(a.length),out=new Float64Array(a.length),weights=[1,4,6,4,1];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=0;for(let d=-2;d<=2;d++)v+=a[y*w+Math.max(0,Math.min(w-1,x+d))]*weights[d+2];tmp[y*w+x]=v/16;}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=0;for(let d=-2;d<=2;d++)v+=tmp[Math.max(0,Math.min(h-1,y+d))*w+x]*weights[d+2];out[y*w+x]=v/16;}return out;
}
function gradients(a,w,h){let l1=0,energy=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(x+1<w){const d=a[i+1]-a[i];l1+=Math.abs(d);energy+=d*d;}if(y+1<h){const d=a[i+w]-a[i];l1+=Math.abs(d);energy+=d*d;}}return{l1,energy};}
function edgeMetrics(rgba,width,height=width){
 if(!(rgba instanceof Uint8Array)||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||rgba.length!==width*height*4)throw Error('Expected dense RGBA8 carrier/dimensions');
 const alpha=Float64Array.from({length:width*height},(_,i)=>rgba[i*4+3]/255),smooth=smoothAlpha(alpha,width,height),raw=gradients(alpha,width,height),filtered=gradients(smooth,width,height);let peak=0;for(const a of smooth)peak=Math.max(peak,a);
 return{edgeWidthPxProxy:filtered.energy>0?peak*filtered.l1/filtered.energy:null,fineGradientEnergyFraction:raw.energy>0?1-filtered.energy/raw.energy:null};
}
module.exports={edgeMetrics};
if(require.main===module){const fs=require('node:fs'),zlib=require('node:zlib'),crypto=require('node:crypto');const[file,size]=process.argv.slice(2);if(!file||!size)throw Error('Usage: node carrier-edge-metrics.cjs carrier.rgba[.gz] width');const bytes=fs.readFileSync(file),raw=file.endsWith('.gz')?zlib.gunzipSync(bytes):bytes;console.log(JSON.stringify({carrierSHA256:crypto.createHash('sha256').update(raw).digest('hex'),width:Number(size),metrics:edgeMetrics(raw,Number(size)),qualification:'Fixed5tap linear-alpha diagnostic; not art score, not 10–90 edge width; no regression threshold.'},null,2));}
