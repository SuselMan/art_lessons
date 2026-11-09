import{it,expect}from'vitest'
import{DabSystem}from'./DabSystem'
import{sketch161}from'../../../../../../packages/shared/src/sketchTimer161.testFixture'
const author=()=>{const s=new DabSystem(),b=sketch161();s.sketchTiming161=b;s.inputKnots=true;s.captureSourceTime=true;s.timing=b.behavior!.timing;return s}
it('native moving bypass preserves stationary elapsed rather than retiming/resetting it',()=>{const s=author();expect(s.startStroke(0,0,1,0,0,16).map(d=>d.sourceTime)).toEqual([0]);expect(s.continueStroke(0,0,1,0,0,16,0,0,25)).toEqual([]);expect(s.continueStroke(12,0,1,0,0,16,0,0,80).map(d=>[d.x,d.sourceTime])).toEqual([[12,80]]);expect(s.continueStroke(12,0,1,0,0,16,0,0,105).map(d=>d.sourceTime)).toEqual([105])})
it('holds emit0/50/100, fork leaves original clock and invalid scope fails before reset',()=>{const s=author();s.startStroke(0,0,1,0,0,16);expect(s.forkForPreview().continueStroke(0,0,1,0,0,16,0,0,100).map(d=>d.sourceTime)).toEqual([50,100]);expect(s.continueStroke(0,0,1,0,0,16,0,0,49)).toEqual([]);s.sketchTiming161!.behavior!.timing!.rate=0;expect(()=>s.startStroke(0,0,1,0,0,16)).toThrow('Sketch timer161')})
