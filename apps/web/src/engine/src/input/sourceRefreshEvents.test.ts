import {expect,it} from 'vitest'
import {KritaRandomSource} from '../presets/nativeRandom'
import {beginSourceRefreshEvents,captureSourceRefreshEvent,replaySourceRefreshEvent} from './sourceRefreshEvents'
it('consumes nonpainting queries in native spacing order then Rate without a dab or paint RNG reset',()=>{
 const source=new KritaRandomSource(123),start=beginSourceRefreshEvents(source.snapshot())
 const spacing=captureSourceRefreshEvent(start,{inputOrdinal:1,sourceTime:50,phase:'spacing',queries:[{option:'size',draws:2},{option:'rotation',draws:1},{option:'mirror',draws:0},{option:'spacing',draws:1}]})
 expect(spacing.event.values).toEqual(Array.from({length:4},()=>source.generate()));expect(spacing.state.random).toEqual(source.snapshot())
 const timing=captureSourceRefreshEvent(spacing.state,{inputOrdinal:1,sourceTime:50,phase:'timing',queries:[{option:'rate',draws:1}]})
 expect(timing.event.values).toEqual([source.generate()]);expect(timing.state.random).toEqual(source.snapshot());expect(start.random.draws).toBe(0)
 // A real paint consumer between refresh inputs uses that SAME advancing source.
 source.generate();const afterPaint={...timing.state,random:source.snapshot()}
 const later=captureSourceRefreshEvent(afterPaint,{inputOrdinal:2,sourceTime:100,phase:'spacing',queries:[{option:'size',draws:1}]})
 expect(later.event.values).toEqual([source.generate()])
})
it('clones continuation and replays exact stationary-input events independently of packet grouping',()=>{
 let author=beginSourceRefreshEvents(new KritaRandomSource(9).snapshot()),reader=structuredClone(author)
 for(let i=0;i<100;i++){
  const a=captureSourceRefreshEvent(author,{inputOrdinal:i+1,sourceTime:(i+1)*50,phase:'spacing',queries:[{option:'size',draws:1},{option:'spacing',draws:1}]})
  author=a.state;reader=replaySourceRefreshEvent(reader,structuredClone(a.event))
 }
 expect(reader).toEqual(author);expect(reader.random.draws).toBe(200)
})
it('rejects repeated/reordered phases, backward source times, unbounded plans and draw exhaustion atomically',()=>{
 const start=beginSourceRefreshEvents(new KritaRandomSource(1).snapshot()),input={inputOrdinal:1,sourceTime:50,phase:'spacing' as const,queries:[{option:'size' as const,draws:1}]},first=captureSourceRefreshEvent(start,input)
 expect(()=>captureSourceRefreshEvent(first.state,input)).toThrow('phase')
 expect(()=>captureSourceRefreshEvent(first.state,{...input,inputOrdinal:2,sourceTime:49})).toThrow('ordering')
 expect(()=>captureSourceRefreshEvent(start,{...input,queries:[{option:'spacing',draws:1},{option:'size',draws:1}]})).toThrow('plan')
 expect(()=>captureSourceRefreshEvent(start,{...input,queries:[{option:'size',draws:17}]})).toThrow('plan')
 const exhausted={...start,random:{...start.random,draws:Number.MAX_SAFE_INTEGER}},before=structuredClone(exhausted)
 expect(()=>captureSourceRefreshEvent(exhausted,input)).toThrow('exhausted');expect(exhausted).toEqual(before)
})
it('detects changed event prefix, query count or generated values on recorded replay',()=>{
 const start=beginSourceRefreshEvents(new KritaRandomSource(7).snapshot()),{event}=captureSourceRefreshEvent(start,{inputOrdinal:1,sourceTime:50,phase:'timing',queries:[{option:'rate',draws:1}]})
 expect(()=>replaySourceRefreshEvent(start,{...event,values:[event.values[0]^1]})).toThrow('draws')
 expect(()=>replaySourceRefreshEvent(start,{...event,ordinal:1})).toThrow('prefix')
 expect(()=>replaySourceRefreshEvent(start,{...event,queries:[{option:'rate',draws:0}]})).toThrow('draws')
})
