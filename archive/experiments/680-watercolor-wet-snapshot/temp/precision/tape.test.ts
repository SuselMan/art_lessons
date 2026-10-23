import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {packDabs} from '../../packages/shared/src/dabCodec';
const tapeCode=readFileSync('temp/snapshot/precision-gesture-tape.js','utf8');
const precisionCode=readFileSync('temp/snapshot/precision-inputs-only.js','utf8');
function setup(clock:number){
 const delivered:any[]=[];const journal:any[]=[];const scratch={};
 const E:any={_strokeLayerId:'layer',_ribbonStrokeScratch:scratch,_strokeId:'random-'+clock,
 _paintDabs(...a:any[]){delivered.push({raw:a[1].map((d:any)=>({...d})),previous:a[6]?{...a[6]}:null,wet:a[10],seed:a[11]});return new Map(a[1].map((d:any)=>[d,.6]));},
 emit(e:any,tip=false){const d={x:e.x,y:e.y,pressure:e.pressure,tiltX:0,tiltY:0,size:80.123456789,aspectRatio:1,angle:.123456789,opacity:.9,t:tip?clock:e.timeStamp};const prev=this.prev??null;const standing=this._paintDabs({},[d],'watercolor','normal:100:15',[], 'self',prev,scratch,undefined,undefined,'f',[.123456789,.23456789]);if(!standing.has(d))throw Error('standing identity lost');journal.push({...d});this.prev=d;},
 _onStart(e:any){this.prev=null;this.emit(e);},_onMove(e:any){this.emit(e);},_onEnd(e:any){this.emit(e,true);}};
 const window:any={__engine:E};runInNewContext(precisionCode,{window,Map,Math});runInNewContext(tapeCode,{window,Map,Math,requestAnimationFrame:(fn:any)=>fn()});return{E,window,delivered,journal};
}
it('one captured gesture repeats full native64 delivery including previous, wet, seed and nondeterministic tip clock',async()=>{
 const a=setup(900.123456789);const start={x:10.123456789,y:20.23456789,pressure:.812345678,timeStamp:100};a.E._onStart(start);a.E._onMove({...start,x:30.3456789,timeStamp:200});a.E._onEnd({...start,x:40.456789,timeStamp:300});
 const tape=a.window.__wcGestureTape.capture();const b=setup(3000.987654321);await b.window.__wcGestureTape.replay(tape);
 expect(b.delivered).toEqual(a.delivered);expect(b.journal).toEqual(a.journal);expect(packDabs(b.journal)).toBe(packDabs(a.journal));expect(b.window.__wcPrecisionProbe.report().samples.every((s:any)=>s.enabled===false)).toBe(true);
 const c=setup(7000);c.window.__wcPrecisionProbe.setEnabled(true);await c.window.__wcGestureTape.replay(tape);
 expect(packDabs(c.journal)).toBe(packDabs(a.journal));expect(c.delivered[0].raw[0].x).toBe(Math.fround(start.x));expect(c.window.__wcPrecisionProbe.report().proofs.every((p:any)=>p.hits===p.n&&p.misses===0)).toBe(true);
 expect(c.delivered.map((d:any)=>d.wet)).toEqual(a.delivered.map((d:any)=>d.wet));expect(c.delivered.map((d:any)=>d.seed)).toEqual(a.delivered.map((d:any)=>d.seed));
});
it('rejects replay partition changes instead of accepting a different gesture',async()=>{
 const a=setup(1);a.E._onStart({x:1,y:2,pressure:.8,timeStamp:1});const tape=a.window.__wcGestureTape.capture();tape.deliveries[0].raw.push({...tape.deliveries[0].raw[0]});const b=setup(2);await expect(b.window.__wcGestureTape.replay(tape)).rejects.toThrow('partition');
});
