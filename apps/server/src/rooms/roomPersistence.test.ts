import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Operation, Room } from '@grafetto/shared'

const mockPrisma = vi.hoisted(() => ({
  room: { create: vi.fn() },
  roomParticipant: { upsert: vi.fn() },
  roomPalette: { upsert: vi.fn() },
  operation: { create: vi.fn(), findUnique: vi.fn() },
}))
vi.mock('../db/prisma.js', () => ({ prisma: mockPrisma }))

const { flushRoomWrites } = await import('./roomRegistry.js')
const { persistOperation, retryCanonicalOperationWrite, persistParticipant, persistRoomCreate, passwordGrant } = await import('./roomPersistence.js')

/** (#612) The rows a live room writes, by shape. Nothing else pins them: the
 *  room tests mock Prisma and look at memory. The columns matter beyond the
 *  row itself — `type`/`layerId`/`seq` are what residentOperationWhere asks
 *  Postgres about, so an operation stored without its `layerId` is one no
 *  snapshot can ever exclude from a cold load. */

beforeEach(() => {
  for (const group of Object.values(mockPrisma)) for (const fn of Object.values(group)) fn.mockReset()
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
