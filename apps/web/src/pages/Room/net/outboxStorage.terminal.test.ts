import {expect,it} from 'vitest'
import type {Operation} from '@grafetto/shared'
import {createInMemoryOutboxStorage,type OutboxEntry} from './outboxStorage'
const entry=(id:string,terminal=false):OutboxEntry=>({op:{id,type:'stroke',userId:'A',layerId:'L',timestamp:1,tool:'pencil',preset:'HB',color:[0,0,0],dabs:[]},roomId:'old',attempts:0,nextRetryAt:0,...(terminal?{terminal:{result:{ok:false as const,reason:'target_gone' as const},recordedAt:2}}:{})})
it('terminal and retired records win late ordinary puts and deletes from a second new reader',async()=>{
 const storage=createInMemoryOutboxStorage(),stale=entry('a')
 await storage.put(stale);await storage.put(entry('a',true));await storage.put(stale)
 expect((await storage.getAll('old'))[0].terminal?.result.reason).toBe('target_gone')
 await storage.delete('a');expect(await storage.getAll('old')).toHaveLength(1)
 expect(await storage.replaceTerminal!('old',['a'],[entry('replacement')])).toBe(true)
 expect(await storage.putGuarded!(stale)).toEqual({kind:'retired'})
 await storage.delete('a');await storage.put(stale)
 expect((await storage.getAll('old')).map(row=>row.op.id)).toEqual(['replacement'])
})
it('an aborted multi-original handoff leaves every original and no replacement',async()=>{
 const storage=createInMemoryOutboxStorage()
 await storage.put(entry('a',true));await storage.put(entry('b',true))
 const invalid=entry('invalid');invalid.op={...invalid.op,uncloneable:()=>{}} as unknown as Operation
 await expect(storage.replaceTerminal!('old',['a','b'],[entry('good'),invalid])).rejects.toThrow()
 expect((await storage.getAll('old')).map(row=>row.op.id)).toEqual(['a','b'])
 expect(await storage.replaceTerminal!('old',['a','b'],[entry('good'),entry('good2')])).toBe(true)
 expect((await storage.getAll('old')).map(row=>row.op.id)).toEqual(['good','good2'])
})
it('handoff has one winning writer and never overwrites another board or existing replacement',async()=>{
 const storage=createInMemoryOutboxStorage()
 await storage.put(entry('a',true))
 await expect(storage.replaceTerminal!('old',['a'],[])).rejects.toThrow('replacement rows')
 await expect(storage.replaceTerminal!('old',['a'],[{...entry('wrong-room'),roomId:'new'}])).rejects.toThrow()
 const results=await Promise.all([storage.replaceTerminal!('old',['a'],[entry('winner')]),storage.replaceTerminal!('old',['a'],[entry('loser')])])
 expect(results).toEqual([true,false]);expect((await storage.getAll()).map(row=>row.op.id)).toEqual(['winner'])
})
