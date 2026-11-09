import{it,expect}from'vitest'
import{createOrderedBrushGate}from'./orderedBrushGate'
import type{BrushSourceContext}from'@grafetto/shared'
it('known brush with missing captured pattern CAS holds SAME FIFO through dependent END and unrelated events',async()=>{
 let release:()=>void=()=>{};const waiting=new Promise<void>(resolve=>{release=resolve}),seen:string[]=[],sources:Array<readonly(BrushSourceContext|undefined)[]>=[]
 const source:BrushSourceContext={version:1,pattern:{version:1,kind:'none'}},gate=createOrderedBrushGate((_presets,captured)=>{sources.push(captured??[]);return seen.length===0&&sources.length===1?waiting:null},error=>{throw error})
 gate.dispatch(['brush:known@158'],()=>{seen.push('BEGIN')},[source]);gate.dispatch([],()=>{seen.push('END')});gate.dispatch([],()=>{seen.push('other')});expect(seen).toEqual([]);expect(sources[0]).toEqual([source]);release();await waiting;await Promise.resolve();expect(seen).toEqual(['BEGIN','END','other']);gate.cancel()
})
