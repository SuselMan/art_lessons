/** DEFAULT-OFF visual proposal. No GL/engine integration; byte inputs/output. */
export const RENDER_COVERAGE_BYTES=1024*1024*4;
export const RENDER_COVERAGE_MAX_BYTES=3*RENDER_COVERAGE_BYTES;
export function previewRenderCoverageReference(old,p,c){
 if([old,p,c].some(v=>v.length!==4||v.some(x=>!Number.isInteger(x)||x<0||x>255)))throw Error('u8 RGBA required');
 const material=p[2]>0&&c[3]>0&&Math.max(...c.slice(0,3))>0;
 // Dose-bearing own carrier or directly stored material standing; not V.R/A.
 const wet=Math.max(p[3]>0?p[0]/p[3]:0,old[2]/255)>.004;
 if(!material||!wet)return [...old];
 const alpha=255;
 if(old[3]===alpha)return [...old]; // Literal old RGBA untouched on full silhouette.
 if(old[3]/255>.004)return [Math.min(255,Math.round(old[0]*alpha/old[3])),Math.min(255,Math.round(old[1]*alpha/old[3])),old[2],alpha];
 return [128,0,old[2],alpha];
}
