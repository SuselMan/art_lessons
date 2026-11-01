import { describe, expect, it } from 'vitest'

import { createReplayGate } from './replayGate'

describe('replayGate (#536 §17.49)', () => {
  it('passes everything through while open', () => {
    const gate = createReplayGate<number>()
    expect(gate.hold(1)).toBe(false)
  })

  it('holds arrivals while shut and releases them in order when opened', () => {
    const seen: number[] = []
    const gate = createReplayGate<number>()
    gate.setHandler(n => seen.push(n))
    const ticket = gate.begin()
    expect(gate.hold(7)).toBe(true)
    expect(gate.hold(8)).toBe(true)
    expect(seen).toEqual([])
    gate.end(ticket)
    expect(seen).toEqual([7, 8])
    // Open again: the next one is the caller's to handle.
    expect(gate.hold(9)).toBe(false)
    expect(seen).toEqual([7, 8])
  })

  it('lets the released payload bypass its own hold through the internal delivery token', () => {
    // The confirmed handler asks the gate again. Only this internal delivery
    // bypasses its own hold; ordinary arrivals remain queued until drain ends.
    const gate = createReplayGate<number>()
    const seen: number[] = []
    gate.setHandler((n, delivery) => { if (!gate.hold(n, delivery)) seen.push(n) })
    const ticket = gate.begin()
    gate.hold(1)
    gate.end(ticket)
    expect(seen).toEqual([1])
  })
})

it('requires the exact current ticket, rejects copied/foreign/consumed tickets and releases once',()=>{
 const gate=createReplayGate<number>(),other=createReplayGate<number>(),seen:number[]=[]
 expect(Reflect.apply(gate.end,null,[])).toBe(false);expect(Reflect.apply(gate.end,null,[null])).toBe(false)
 gate.setHandler(n=>seen.push(n))
 const a=gate.begin();gate.hold(1)
 const b=gate.begin();gate.hold(2)
 expect(gate.end(a)).toBe(false);expect(gate.end({...b})).toBe(false);expect(gate.end(other.begin())).toBe(false)
 expect(seen).toEqual([]);expect(gate.end(b)).toBe(true);expect(seen).toEqual([1,2])
 expect(gate.end(b)).toBe(false)
})
it('keeps old remainder ahead of new arrivals when a handler begins another restore and tries nested end',()=>{
 const gate=createReplayGate<number>(),seen:number[]=[]
 let b:ReturnType<typeof gate.begin>|undefined
 gate.setHandler((n,delivery)=>{
  expect(gate.hold(n,delivery)).toBe(false);seen.push(n)
  if(n===1){b=gate.begin();gate.hold(3);expect(gate.end(b)).toBe(false)}
 })
 const a=gate.begin();gate.hold(1);gate.hold(2)
 expect(gate.end(a)).toBe(false);expect(seen).toEqual([1])
 expect(gate.hold(4)).toBe(true)
 if(!b)throw Error('Expected nested owner')
 expect(gate.end(b)).toBe(true);expect(seen).toEqual([1,2,3,4])
})
it('holds new primitive and same-object arrivals during drain unless they carry the exact one-shot delivery',()=>{
 const gate=createReplayGate<object>(),same={},seen:object[]=[]
 let once=true
 gate.setHandler((payload,delivery)=>{
  expect(gate.hold(payload,delivery)).toBe(false)
  expect(()=>gate.hold(payload,delivery)).toThrow('Invalid replay delivery')
  seen.push(payload)
  if(once){once=false;expect(gate.hold(same)).toBe(true)}
 })
 const ticket=gate.begin();gate.hold(same);gate.hold({})
 expect(gate.end(ticket)).toBe(true)
 expect(seen).toHaveLength(3);expect(seen[0]).toBe(same);expect(seen[2]).toBe(same)
 const primitive=createReplayGate<number>(),numbers:number[]=[]
 primitive.setHandler((n,delivery)=>{primitive.hold(n,delivery);numbers.push(n);if(numbers.length===1)primitive.hold(n)})
 const primitiveTicket=primitive.begin();primitive.hold(1);primitive.hold(2)
 expect(primitive.end(primitiveTicket)).toBe(true);expect(numbers).toEqual([1,2,1])
})
it('refuses copied, foreign and expired delivery tokens without treating them as ordinary arrivals',()=>{
 const gate=createReplayGate<number>(),other=createReplayGate<number>()
 let saved:Parameters<typeof gate.hold>[1]
 gate.setHandler((n,delivery)=>{
  if(!delivery)throw Error('Expected delivery')
  saved=delivery
  expect(()=>gate.hold(n,{...delivery})).toThrow('Invalid replay delivery')
  expect(()=>other.hold(n,delivery)).toThrow('Invalid replay delivery')
  expect(()=>gate.hold(n+1,delivery)).toThrow('Invalid replay delivery')
  expect(gate.hold(n,delivery)).toBe(false)
 })
 const ticket=gate.begin();gate.hold(1);expect(gate.end(ticket)).toBe(true)
 expect(()=>gate.hold(1,saved)).toThrow('Invalid replay delivery');expect(gate.hold(2)).toBe(false)
})
it('stops on handler replacement and retains the remainder for a new restore owner',()=>{
 const gate=createReplayGate<number>(),seen:string[]=[]
 const next=(n:number)=>{seen.push('new'+n)}
 gate.setHandler(n=>{seen.push('old'+n);gate.setHandler(next);gate.hold(3)})
 const a=gate.begin();gate.hold(1);gate.hold(2)
 expect(gate.end(a)).toBe(false);expect(seen).toEqual(['old1'])
 expect(gate.end(a)).toBe(false)
 expect(gate.end(gate.begin())).toBe(true);expect(seen).toEqual(['old1','new2','new3'])
})
it('preserves only unprocessed remainder after a handler throws and never implicitly retries an ambiguous current event',()=>{
 const gate=createReplayGate<number>(),seen:number[]=[],error=Error('partially applied')
 const a=gate.begin();gate.hold(1);gate.hold(2)
 gate.setHandler(n=>{seen.push(n);gate.hold(3);throw error})
 expect(()=>gate.end(a)).toThrow(error);expect(seen).toEqual([1])
 expect(gate.end(a)).toBe(false);expect(gate.hold(4)).toBe(true)
 gate.setHandler(n=>{seen.push(n)})
 expect(gate.end(gate.begin())).toBe(true);expect(seen).toEqual([1,2,3,4])
})
it('refuses nested end for the same consumed ticket without changing queue order',()=>{
 const gate=createReplayGate<number>(),seen:number[]=[]
 const ticket=gate.begin();gate.hold(1);gate.hold(2)
 gate.setHandler(n=>{seen.push(n);expect(gate.end(ticket)).toBe(false)})
 expect(gate.end(ticket)).toBe(true);expect(seen).toEqual([1,2])
})
it('preserves a newer ticket and old remainder when its predecessor handler throws after begin',()=>{
 const gate=createReplayGate<number>(),seen:number[]=[]
 let next:ReturnType<typeof gate.begin>|undefined
 const ticket=gate.begin();gate.hold(1);gate.hold(2)
 gate.setHandler(n=>{seen.push(n);next=gate.begin();gate.hold(3);throw Error('failed old callback')})
 expect(()=>gate.end(ticket)).toThrow('failed old callback')
 gate.setHandler(n=>{seen.push(n)})
 if(!next)throw Error('Expected newer owner')
 expect(gate.end(next)).toBe(true);expect(seen).toEqual([1,2,3])
})

it('reports latest begin identity after normal end and own drain failure without changing gate behavior',()=>{
 const gate=createReplayGate<number>(),other=createReplayGate<number>(),foreign=other.begin()
 const first=gate.begin();expect(gate.isLatest(first)).toBe(true);expect(gate.isLatest(foreign)).toBe(false)
 expect(gate.end(first)).toBe(true);expect(gate.isLatest(first)).toBe(true);expect(gate.hold(1)).toBe(false)
 const second=gate.begin();expect(gate.isLatest(first)).toBe(false);expect(gate.isLatest(second)).toBe(true)
 gate.setHandler(()=>{throw Error('Actual drain failed')});gate.hold(2);expect(()=>gate.end(second)).toThrow('Actual drain failed')
 expect(gate.isLatest(second)).toBe(true);expect(gate.end(second)).toBe(false)
 const third=gate.begin();expect(gate.isLatest(second)).toBe(false);expect(gate.isLatest(third)).toBe(true)
})
