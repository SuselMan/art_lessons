import {expect,it} from 'vitest'
import {gestureFraction} from './roomScenarioClockSafe.mjs'
it.each([[99,0],[100,0],[125,.25],[200,1],[201,1]])('clamps raf %s relative to DOWN100/duration100', (raf,value)=>{const f=gestureFraction(raf,100,100);expect(f).toBe(value);const points=[[1,2],[3,4],[5,6]],pos=f*(points.length-1),i=Math.min(points.length-2,Math.floor(pos));expect(points[i]).toBeDefined();expect(points[i+1]).toBeDefined()})
it('rejects invalid clock instead of silently creating NaN indices',()=>{expect(()=>gestureFraction(NaN,100,100)).toThrow();expect(()=>gestureFraction(100,100,0)).toThrow()})
