import{it,expect}from'vitest';import{readFileSync}from'node:fs';import{runInNewContext}from'node:vm';import{packDabs,unpackDabs}from'../../packages/shared/src/dabCodec';
const fields=['x','y','pressure','tiltX','tiltY','size','aspectRatio','angle','opacity','t'];
const d={x:1100.123456789,y:958.234567891,pressure:.8123456789,tiltX:13.123456789,tiltY:-9.123456789,size:80.123456789,aspectRatio:1.234567891,angle:.123456789,opacity:.5123456789,t:917.123456789};
it('float32 diagnostic preserves format1 codec bytes and recorded input values',()=>{const clone=Object.fromEntries(fields.map(k=>[k,Math.fround(d[k as keyof typeof d])]))as typeof d;expect(packDabs([clone])).toBe(packDabs([d]));expect(packDabs([d]).startsWith('1:')).toBe(true);expect(unpackDabs(packDabs([d]))).toEqual([clone]);});
it('OFF is identity; ON rounds before paint and remaps standing to original Dab keys',()=>{
 const scratch={};let received:any;const E={_strokeLayerId:'layer-1',_ribbonStrokeScratch:scratch,_paintDabs(...a:any[]){received=a;return new Map([[a[1][0],.6]])}};const window:any={__engine:E};runInNewContext(readFileSync('temp/snapshot/precision-inputs-only.js','utf8'),{window,Map,Math});
 const args=[{},[d],'watercolor','normal:0:15',[], 'self',d,scratch,undefined,undefined,'f',[0,0]];let map=E._paintDabs(...args);expect(received[1][0]).toBe(d);expect(map.get(d)).toBe(.6);
 window.__wcPrecisionProbe.setEnabled(true);map=E._paintDabs(...args);expect(received[1][0]).not.toBe(d);expect(received[1][0].x).toBe(Math.fround(d.x));expect(received[6].x).toBe(Math.fround(d.x));expect(map.get(d)).toBe(.6);expect(map.has(received[1][0])).toBe(false);expect(d.x).toBe(1100.123456789);expect(window.__wcPrecisionProbe.report().proofs[0]).toEqual({n:1,hits:1,misses:0,remapFailures:0});
});
it('kept-dab filtering is not a remap failure: retained keys map exactly, omitted keys remain omitted',()=>{
 const scratch={};const omitted={...d,x:d.x+10};const E={_strokeLayerId:'layer',_ribbonStrokeScratch:scratch,_paintDabs(...a:any[]){return new Map([[a[1][0],.4]])}};const window:any={__engine:E};runInNewContext(readFileSync('temp/snapshot/precision-inputs-only.js','utf8'),{window,Map,Math});window.__wcPrecisionProbe.setEnabled(true);
 const map=E._paintDabs({},[d,omitted],'watercolor','normal:100:15',[],'self',d,scratch,undefined,undefined,'ff',[0,0]);expect(map.has(d)).toBe(true);expect(map.has(omitted)).toBe(false);expect(window.__wcPrecisionProbe.report().proofs[0]).toEqual({n:2,hits:1,misses:1,remapFailures:0});
});
