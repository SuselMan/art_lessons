import {describe,it,expect} from 'vitest'
import {publicationCostMarker} from './publicationCost'
describe('publication scalar marker',()=>{
 it('uses one boundary clock and reports failure without retained material',()=>{let t=1;const rows:unknown[]=[];const done=publicationCostMarker(x=>rows.push(x),()=>t)('queuePrefixAck');t=5;done(false);expect(rows).toEqual([{phase:'queuePrefixAck',wallMs:4,ok:false}])})
 it('isolates start clock failure and reports invalid timing as failed',()=>{const rows:unknown[]=[];const done=publicationCostMarker(x=>rows.push(x),()=>{throw Error('clock')})('canvasSubmit');expect(()=>done(true)).not.toThrow();expect(rows).toEqual([{phase:'canvasSubmit',wallMs:0,ok:false}])})
 it('isolates report exceptions',()=>{expect(()=>publicationCostMarker(()=>{throw Error('observer')},()=>1)('glCanvasImport')(true)).not.toThrow()})
})
