import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Operation, Room } from '@grafetto/shared'

const mockPrisma = vi.hoisted(() => ({
  room: { create: vi.fn() },
  roomParticipant: { upsert: vi.fn() },
  roomPalette: { upsert: vi.fn() },
  operation: { create: vi.fn(), findUnique: vi.fn() },
  $executeRaw:vi.fn(),
}))
vi.mock('../db/prisma.js', () => ({ prisma: mockPrisma }))

const { flushRoomWrites } = await import('./roomRegistry.js')
const { captureCanonicalMetadata, verifyCanonicalMetadataRow, persistOperation, retryCanonicalOperationWrite, persistParticipant, projectCanonicalIndexedOperation, persistRoomCreate, passwordGrant } = await import('./roomPersistence.js')

/** (#612) The rows a live room writes, by shape. Nothing else pins them: the
 *  room tests mock Prisma and look at memory. The columns matter beyond the
 *  row itself — `type`/`layerId`/`seq` are what residentOperationWhere asks
 *  Postgres about, so an operation stored without its `layerId` is one no
 *  snapshot can ever exclude from a cold load. */

beforeEach(() => {
  for (const group of [mockPrisma.room,mockPrisma.roomParticipant,mockPrisma.roomPalette,mockPrisma.operation]) for (const fn of Object.values(group)) fn.mockReset()
  mockPrisma.$executeRaw.mockReset().mockImplementation(async(_sql:TemplateStringsArray,...values:unknown[])=>{
    const [id,seq,type,roomId,userId,layerId,tool,body]=values
    if(typeof body!=='string')throw Error('Canonical JSON must reach database as text')
    await mockPrisma.operation.create({data:{id,seq,type,roomId,userId,layerId,tool,data:JSON.parse(body)}})
    return 1
  })
})

describe('persistOperation', () => {
  it('stores the indexed columns beside the payload', async () => {
    const op: Operation = {
      id: 'op-1', seq: 7, userId: 'u', timestamp: 0, type: 'stroke', layerId: 'layer-1',
      tool: 'charcoal', preset: 'HB', color: [0, 0, 0], dabs: [],
    }
    persistOperation('r', op)
    await flushRoomWrites('r')
    expect(mockPrisma.operation.create).toHaveBeenCalledWith({
      data: { id: 'op-1', seq: 7, type: 'stroke', roomId: 'r', userId: 'u', layerId: 'layer-1', tool: 'charcoal', data: op },
    })
  })

  it('leaves layerId and tool empty for an operation that has neither', async () => {
    const op: Operation = { id: 'op-2', seq: 8, userId: 'u', timestamp: 0, type: 'layer_delete', layerIds: ['a'] }
    persistOperation('r', op)
    await flushRoomWrites('r')
    expect(mockPrisma.operation.create.mock.calls[0][0].data).toMatchObject({ layerId: null, tool: null })
  })
})

describe('persistParticipant', () => {
  it('refreshes the password grant on successful re-entry', async () => {
    persistParticipant('r', 'u', 'Alice', 'password-revision');
    await flushRoomWrites('r')
    const write = mockPrisma.roomParticipant.upsert.mock.calls[0][0]
    expect(write.create.passwordGrant).toBe(passwordGrant('password-revision'))
    expect(write.update.passwordGrant).toBe(write.create.passwordGrant)
    expect(write.create.passwordGrant).not.toBe('password-revision')
  })
  it('does not renew the password grant during an automatic board move', async () => {
    persistParticipant('r', 'u', 'Alice')
    await flushRoomWrites('r')
    expect(mockPrisma.roomParticipant.upsert.mock.calls[0][0].update).not.toHaveProperty('passwordGrant')
  })
  // (#226) What this person calls themselves now, not three lessons ago.
  it('refreshes the name on every join, not only on the first', async () => {
    persistParticipant('r', 'u', 'Alice')
    await flushRoomWrites('r')
    expect(mockPrisma.roomParticipant.upsert.mock.calls[0][0].update).toMatchObject({ name: 'Alice' })
  })
})

describe('persistRoomCreate', () => {
  // (#548) `[]` is the column's "no restriction".
  it('stores the toolset, an unrestricted room as the empty list', async () => {
    const room = { id: 'r', name: 'N', paper: 'coarse', infinite: false, accessMode: 'anyone_with_link', ownerId: 'o' } as Room
    persistRoomCreate({ ...room, enabledTools: ['pencil'] }, undefined)
    persistRoomCreate({ ...room, id: 'r2' }, undefined)
    await flushRoomWrites('r')
    await flushRoomWrites('r2')
    expect(mockPrisma.room.create.mock.calls[0][0].data.enabledTools).toEqual(['pencil'])
    expect(mockPrisma.room.create.mock.calls[1][0].data.enabledTools).toEqual([])
  })
})


describe('canonical persistence outcome and immutable row repair',()=>{
  const op:Extract<Operation,{type:'canonical_stroke'}>={id:'canonical-row',seq:7,type:'canonical_stroke',userId:'author',timestamp:9,layerId:'layer',frame:{version:1,rasterProfile:'installed-arm64-scalar-fused-fpcr0-v1',brush:'brush:fixture@1',strokeId:'gesture',frameOrdinal:0,pigmentRgb8:[1,2,3],composition:{mode:'wash',alphaDarken:'creamy',outerResourceOpacity:.73,outerBlend:'over'},materialPacked:'opaque validated payload'}}
  const row=()=>({id:op.id,seq:7,type:op.type,roomId:'r',userId:'author',layerId:'layer',tool:null,data:structuredClone(op)})
  it('projects only bounded indexed canonical fields before copy/size walks',()=>{
    const source=row(),result=projectCanonicalIndexedOperation('r',source)
    expect(result.operation).toEqual(op);expect(result.operation).not.toBe(source.data)
    expect(result.bytes).toBe(Buffer.byteLength(JSON.stringify(op),'utf8'))
    expect(result.operation.frame.pigmentRgb8).not.toBe(source.data.frame.pigmentRgb8)
    for(const mutate of [
      (value:typeof source)=>{value.userId='other'},
      (value:typeof source)=>{Object.assign(value.data.frame,{unknown:'x'.repeat(1000000)})},
      (value:typeof source)=>{Object.assign(value.data.frame,{pigmentRgb8:Array.from({length:1000000},()=>0)})},
      (value:typeof source)=>{Object.assign(value.data.frame,{materialPacked:'x'.repeat(4*1024*1024+1)})},
    ]){const value=row();mutate(value);expect(()=>projectCanonicalIndexedOperation('r',value)).toThrow()}
  })
  it('drops the ORM row from success and exposes failed writes rather than a successful flush',async()=>{
    const log=vi.spyOn(console,'error').mockImplementation(()=>{})
    try{
      mockPrisma.operation.create.mockResolvedValueOnce({data:{large:'not retained'}})
      expect(await persistOperation('r',op)).toEqual({ok:true,value:undefined})
      const error=new Error('DB failed');mockPrisma.operation.create.mockRejectedValueOnce(error)
      expect(await persistOperation('r',op)).toEqual({ok:false,error})
      await expect(flushRoomWrites('r')).resolves.toBeUndefined()
    }finally{log.mockRestore()}
  })
  it('verifies every indexed identity and the complete payload of an existing row',async()=>{
    const log=vi.spyOn(console,'error').mockImplementation(()=>{})
    try{
      mockPrisma.operation.findUnique.mockResolvedValueOnce(row())
      expect(await retryCanonicalOperationWrite('r',op)).toEqual({ok:true,value:undefined})
      expect(mockPrisma.operation.create).not.toHaveBeenCalled()
      for(const patch of[{roomId:'foreign'},{userId:'foreign'},{seq:8},{type:'stroke'},{layerId:'other'},{tool:'pencil'},{data:{...op,timestamp:10}}]){
        mockPrisma.operation.findUnique.mockResolvedValueOnce({...row(),...patch})
        expect(await retryCanonicalOperationWrite('r',op)).toMatchObject({ok:false})
      }
      expect(mockPrisma.operation.create).not.toHaveBeenCalled()
    }finally{log.mockRestore()}
  })
  it('recreates the same immutable row or verifies a concurrent P2002 insert, never upserts',async()=>{
    mockPrisma.operation.findUnique.mockResolvedValueOnce(null)
    mockPrisma.operation.create.mockResolvedValueOnce({})
    expect(await retryCanonicalOperationWrite('r',op)).toEqual({ok:true,value:undefined})
    expect(mockPrisma.operation.create.mock.calls[0][0].data).toEqual(row())
    mockPrisma.operation.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(row())
    mockPrisma.operation.create.mockRejectedValueOnce({code:'P2002'})
    expect(await retryCanonicalOperationWrite('r',op)).toEqual({ok:true,value:undefined})
    const log=vi.spyOn(console,'error').mockImplementation(()=>{})
    try{
      mockPrisma.operation.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({...row(),seq:99})
      mockPrisma.operation.create.mockRejectedValueOnce({code:'P2002'})
      expect(await retryCanonicalOperationWrite('r',op)).toMatchObject({ok:false})
    }finally{log.mockRestore()}
  })
})


describe('closed canonical undo metadata indexed repair',()=>{
 const op={type:'operation_undo' as const,id:'undo',userId:'actor',timestamp:4,targetOpId:'frame',seq:9}
 const row=()=>({id:op.id,roomId:'r',userId:op.userId,seq:9,type:op.type,layerId:null,tool:null,data:{...op}})
 it('bounds known fields before copying and verifies every indexed column/body',()=>{
  const projected=captureCanonicalMetadata(op,true)
  expect(projected).toEqual(op);expect(Object.isFrozen(projected)).toBe(true)
  for(const bad of [{...op,extra:'x'.repeat(1000000)},{...op,targetOpId:'x'.repeat(257)},{...op,userId:''},{...op,timestamp:NaN},{...op,seq:0}])expect(()=>captureCanonicalMetadata(bad,true)).toThrow()
  expect(()=>captureCanonicalMetadata(op)).toThrow()
  for(const patch of [{id:'other'},{roomId:'other'},{userId:'other'},{seq:10},{type:'operation_redo'},{layerId:'layer'},{tool:'pencil'},{data:{...op,targetOpId:'other'}}])expect(()=>verifyCanonicalMetadataRow('r',op,{...row(),...patch})).toThrow()
 })
 it('repairs only same immutable metadata, including a verified concurrent insert',async()=>{
  mockPrisma.operation.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(row())
  mockPrisma.operation.create.mockRejectedValueOnce({code:'P2002'})
  expect(await retryCanonicalOperationWrite('r',op)).toEqual({ok:true,value:undefined})
  expect(mockPrisma.operation.create.mock.calls[0][0].data).toEqual(row())
  const log=vi.spyOn(console,'error').mockImplementation(()=>{})
  try{
   mockPrisma.operation.findUnique.mockResolvedValueOnce({...row(),data:{...op,targetOpId:'foreign'}})
   expect(await retryCanonicalOperationWrite('r',op)).toMatchObject({ok:false})
  }finally{log.mockRestore()}
 })
})

it('captures bounded metadata before its repair waits on the existing queue',async()=>{
 const op={type:'operation_undo' as const,id:'queued-metadata',userId:'actor',timestamp:1,targetOpId:'original-target',seq:8}
 const pending=retryCanonicalOperationWrite('r',op)
 op.targetOpId='mutated-after-request'
 expect(await pending).toEqual({ok:true,value:undefined})
 expect(mockPrisma.operation.create.mock.calls[0][0].data.data.targetOpId).toBe('original-target')
})

it('verifies every indexed close field/body and repairs only the exact recorded metadata',async()=>{
 const op={type:'canonical_stroke_close' as const,id:'close-row',userId:'owner',timestamp:4,seq:9,layerId:'layer',targetUserId:'author',strokeId:'gesture',disposition:'commitPartial' as const,recordedNext:2,firstFrameOpId:'first',lastFrameOpId:'last'}
 const row=()=>({id:op.id,roomId:'r',userId:op.userId,seq:op.seq,type:op.type,layerId:'layer',tool:null,data:{...op}})
 expect(()=>verifyCanonicalMetadataRow('r',op,row())).not.toThrow()
 for(const patch of [{id:'other'},{roomId:'other'},{userId:'author'},{seq:10},{type:'canonical_stroke'},{layerId:null},{tool:'pencil'},{data:{...op,targetUserId:'owner'}},{data:{...op,recordedNext:3}},{data:{...op,lastFrameOpId:'other'}},{data:{...op,extra:true}}])expect(()=>verifyCanonicalMetadataRow('r',op,{...row(),...patch})).toThrow()
 mockPrisma.operation.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(row())
 mockPrisma.operation.create.mockRejectedValueOnce({code:'P2002'})
 expect(await retryCanonicalOperationWrite('r',op)).toEqual({ok:true,value:undefined})
 expect(mockPrisma.operation.create.mock.calls[0][0].data).toEqual(row())
 const log=vi.spyOn(console,'error').mockImplementation(()=>{})
 try{
  mockPrisma.operation.findUnique.mockResolvedValueOnce({...row(),data:{...op,targetUserId:'other'}})
  expect(await retryCanonicalOperationWrite('r',op)).toMatchObject({ok:false})
 }finally{log.mockRestore()}
})
it('copies close metadata before its repair queue attempt without trusting mutation or unsupported extras',async()=>{
 const op={type:'canonical_stroke_close' as const,id:'queued-close',userId:'owner',timestamp:4,seq:9,layerId:'layer',targetUserId:'author',strokeId:'gesture',disposition:'commitPartial' as const,recordedNext:1,firstFrameOpId:'frame',lastFrameOpId:'frame'}
 const pending=retryCanonicalOperationWrite('r',op);op.targetUserId='changed'
 expect(await pending).toEqual({ok:true,value:undefined})
 expect(mockPrisma.operation.create.mock.calls[0][0].data.data.targetUserId).toBe('author')
 const forged={...op,extra:'unknown'}
 expect(()=>retryCanonicalOperationWrite('r',forged)).toThrow()
})


it('persists/indexes closed saved phase ONLY on material7; missing/accessor/legacy phase fails',async()=>{
 const make=()=>({id:'saved7',seq:1,userId:'u',timestamp:1,type:'canonical_stroke'as const,layerId:'layer',frame:{version:2 as const,rasterProfile:'installed-arm64-scalar-fused-generic-sc-u8-fpcr0-v2'as const,brush:'brush:fixture@1',strokeId:'stroke7',frameOrdinal:0,pigmentRgb8:[1,2,3]as const,composition:{mode:'wash'as const,alphaDarken:'creamy'as const,outerResourceOpacity:1,outerBlend:'over'as const},materialPacked:'7|projection-structural-not-decoder-proof',texturePhase:{kind:'resolved-stroke-phase-v1'as const,x:50,y:37}}})
 const op=make();mockPrisma.operation.create.mockResolvedValue({});await persistOperation('r',op);await flushRoomWrites('r');const row=mockPrisma.operation.create.mock.calls.at(-1)![0].data
 const projected=projectCanonicalIndexedOperation('r',row);expect(projected.operation.frame.texturePhase).toEqual(op.frame.texturePhase);expect(projected.operation.frame.texturePhase).not.toBe(row.data.frame.texturePhase)
 let getters=0
 for(const bad of [(()=>{const a=make();Reflect.deleteProperty(a.frame,'texturePhase');return a})(),{...make(),frame:{...make().frame,materialPacked:'6|legacy'}},(()=>{const a=make();Object.defineProperty(a.frame,'texturePhase',{get(){getters++;return op.frame.texturePhase}});return a})(),{...make(),frame:{...make().frame,texturePhase:{kind:'resolved-stroke-phase-v1',x:4096,y:0}}}]){
  const r={...row,data:bad};expect(()=>projectCanonicalIndexedOperation('r',r)).toThrow()
 }
 expect(getters).toBe(0)
})


it.each([24/220,24/7])('keeps exact F64 canonical JSON at the SQL text boundary (%s)',async sourceScale=>{
 const op:Operation={id:'lossless',seq:1,type:'canonical_stroke',userId:'u',timestamp:1,layerId:'L',frame:{version:2,rasterProfile:'browser-highp-rgba8-v1',brush:'brush:fixture@1',strokeId:'stroke',frameOrdinal:0,pigmentRgb8:[0,0,0],composition:{mode:'wash',alphaDarken:'hard',outerResourceOpacity:sourceScale/4,outerBlend:'over'},sourceScale,materialPacked:'m:fixture'}}
 expect(await persistOperation('r',op)).toEqual({ok:true,value:undefined})
 const call=mockPrisma.$executeRaw.mock.calls.at(-1)!,body=call.at(-1)
 expect(typeof body).toBe('string');const parsed=JSON.parse(body as string)
 expect(Object.is(parsed.frame.sourceScale,sourceScale)).toBe(true)
 expect(Object.is(parsed.frame.composition.outerResourceOpacity,sourceScale/4)).toBe(true)
 expect(call[0].join('?')).toContain('::jsonb')
 const row=mockPrisma.operation.create.mock.calls.at(-1)![0].data
 mockPrisma.operation.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(row)
 mockPrisma.operation.create.mockRejectedValueOnce({code:'P2010',meta:{code:'23505'}})
 expect(await retryCanonicalOperationWrite('r',op)).toEqual({ok:true,value:undefined})
 const wrong=structuredClone(row);wrong.data.frame.sourceScale=sourceScale===24/220?0.1090909090909091:3.428571428571428
 mockPrisma.operation.findUnique.mockResolvedValueOnce(wrong)
 expect(await retryCanonicalOperationWrite('r',op)).toMatchObject({ok:false})
})
