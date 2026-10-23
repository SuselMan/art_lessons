// Diagnostic harness only: OFF unless explicitly enabled; never edits recorded dabs.
(() => {
 const E=window.__engine;if(!E)throw Error('Engine required');window.__wcPrecisionProbe?.dispose();
 const fields=['x','y','pressure','tiltX','tiltY','size','aspectRatio','angle','opacity','t'];const fn=E._paintDabs;
 const samples=[],proofs=[];let enabled=false;
 const rounded=d=>d?Object.fromEntries(Object.entries(d).map(([k,v])=>[k,fields.includes(k)?Math.fround(v):v])):d;
 E._paintDabs=function(...a){
  const native=a[2]==='watercolor'&&!!this._strokeLayerId&&a[7]===this._ribbonStrokeScratch;
  if(!native)return fn.apply(this,a);
  const originals=a[1],clones=enabled?originals.map(rounded):originals;
  if(samples.length<256)samples.push({enabled,preset:a[3],wet:a[10],seed:a[11],raw:originals.map(d=>({...d})),input:clones.map(d=>({...d})),previousRaw:a[6]?{...a[6]}:null,previousInput:enabled?rounded(a[6]):a[6]?{...a[6]}:null});
  if(enabled){a[1]=clones;a[6]=rounded(a[6]);}
  const result=fn.apply(this,a);if(samples.length&&result instanceof Map)samples[samples.length-1].standingMask=clones.map(d=>result.has(d));
  if(enabled&&result instanceof Map){const map=new Map(result),proof={n:originals.length,hits:0,misses:0,remapFailures:0};for(let i=0;i<clones.length;i++){if(map.has(clones[i])){const water=map.get(clones[i]);map.delete(clones[i]);map.set(originals[i],water);proof.hits++;if(!map.has(originals[i])||map.get(originals[i])!==water)proof.remapFailures++;}else proof.misses++;}proofs.push(proof);return map;}
  return result;
 };
 window.__wcPrecisionProbe={setEnabled(value){enabled=value===true;return enabled;},report(){return JSON.parse(JSON.stringify({enabled,scope:'native _paintDabs inputs only; log, format, sampleUnderNib and chunk partition untouched',samples,proofs,capped:samples.length===256}));},dispose(){E._paintDabs=fn;delete window.__wcPrecisionProbe;}};return 'installed-off';
})()
