import{expect,it}from'vitest'
import{DabSystem}from'./DabSystem'
import{PENCIL_DAB_SHAPING}from'../presets/dabShaping'
const create=()=>{const s=new DabSystem({shaping:{...PENCIL_DAB_SHAPING,size:()=>1,aspect:()=>1,angle:()=>0,pressureSmoothingPx:0,tiltSmoothingPx:0}});s.inputKnots=true;return s}
it('emits exactly the authored endpoints without spline-made neighbours or delayed tail',()=>{const s=create();expect(s.startStroke(0,0,.5,0,0,60)).toHaveLength(1);expect(s.continueStroke(100,0,.5,0,0,60)).toMatchObject([{x:100,y:0}]);expect(s.continueStroke(100,100,.5,0,0,60)).toMatchObject([{x:100,y:100}]);expect(s.peekTipDabs(60)).toEqual([]);expect(s.endStroke(60)).toEqual([])})
it('clones the source knot and ignores stationary movement without manufacturing geometry',()=>{const s=create();s.startStroke(0,0,.5,0,0,60);s.continueStroke(10,0,.5,0,0,60);const fork=s.forkForPreview();expect(fork.continueStroke(20,0,.5,0,0,60)).toEqual(s.continueStroke(20,0,.5,0,0,60));expect(s.continueStroke(20,0,.5,0,0,60)).toEqual([])})
