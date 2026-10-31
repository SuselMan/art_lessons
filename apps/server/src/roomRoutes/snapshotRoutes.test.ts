import { CanonicalRoomTransport } from '../rooms/CanonicalRoomTransport.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'

import { registerSnapshotRoutes } from './snapshotRoutes.js'

// Route-level test, storage mocked — same shape as forkRoutes.test.ts. The
// subject here is the HTTP surface itself (#427): what is cacheable, what a
// revalidation costs, and what a non-participant can reach. Those are
// properties of the routes, not of rooms.ts, and roomSnapshots.test.ts covers
// the storage side separately.
const mockRooms = vi.hoisted(() => ({
  mayReadBoardContent: vi.fn(),
  getSnapshotIndex: vi.fn(),
  getLayerSnapshot: vi.fn(),
  getOperationsBeforeWithCanonicalRows: vi.fn(),
  saveSnapshot: vi.fn(),
  // (#595) Every board in these tests is a shared one.
  canSeeResidentBoard: () => true,
}))
vi.mock('../rooms/boardContentAccess.js', () => mockRooms)
vi.mock('../rooms/classroom.js', () => mockRooms)
vi.mock('../rooms/snapshotStore.js', () => mockRooms)

const HASH = 'sha256-of-decompressed-pixels'
const BLOB = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0xde, 0xad, 0xbe, 0xef])

function buildApp(transport?:CanonicalRoomTransport): FastifyInstance {
  const app = Fastify()
  app.addHook('preHandler', async request => { request.userId = 'student' })
  registerSnapshotRoutes(app,transport)
  return app
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRooms.mayReadBoardContent.mockResolvedValue(true)
})

describe('GET /api/rooms/:roomId/snapshots/index', () => {
  it('answers with the per-layer plan and no pixels', async () => {
    mockRooms.getSnapshotIndex.mockResolvedValue({
      seq: 300,
      layerState: { rootOrder: ['layer-1'] },
      layers: [{ layerId: 'layer-1', seq: 300, hash: HASH }],
    })

    const res = await buildApp().inject({ method: 'GET', url: '/api/rooms/room-1/snapshots/index' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      seq: 300,
      layerState: { rootOrder: ['layer-1'] },
      layers: [{ layerId: 'layer-1', seq: 300, hash: HASH }],
    })
    expect(JSON.stringify(res.json())).not.toContain('data')
  })

  // Which seq is newest is exactly what changes as a lesson goes on — caching
  // this is what would make a client restore yesterday's canvas.
  it('is never cached', async () => {
    mockRooms.getSnapshotIndex.mockResolvedValue({ seq: 100, layerState: {}, layers: [] })

    const res = await buildApp().inject({ method: 'GET', url: '/api/rooms/room-1/snapshots/index' })

    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('answers 204 for a room nobody has baked yet', async () => {
    mockRooms.getSnapshotIndex.mockResolvedValue(null)
    const res = await buildApp().inject({ method: 'GET', url: '/api/rooms/room-1/snapshots/index' })
    expect(res.statusCode).toBe(204)
  })

  it('refuses a caller without content access', async () => {
    mockRooms.mayReadBoardContent.mockResolvedValue(false)
    const res = await buildApp().inject({ method: 'GET', url: '/api/rooms/room-1/snapshots/index' })
    expect(res.statusCode).toBe(403)
    expect(mockRooms.getSnapshotIndex).not.toHaveBeenCalled()
  })
})

describe('GET /api/rooms/:roomId/snapshots/:layerId/:seq', () => {
  it('sends the stored gzip bytes verbatim, without declaring the encoding', async () => {
    mockRooms.getLayerSnapshot.mockResolvedValue({ data: BLOB, hash: HASH })

    const res = await buildApp().inject({ method: 'GET', url: '/api/rooms/room-1/snapshots/layer-1/200' })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/octet-stream')
    // Declaring gzip would make fetch() inflate it, handing the client ~33MB
    // where 5MB arrived — see the route's own comment.
    expect(res.headers['content-encoding']).toBeUndefined()
    expect(Buffer.from(res.rawPayload).equals(BLOB)).toBe(true)
    expect(mockRooms.getLayerSnapshot).toHaveBeenCalledWith('room-1', 'layer-1', 200)
  })

  // The bytes for one (room, layer, seq) can never change — a duplicate upload
  // at a stored seq is discarded rather than allowed to overwrite. `private`
  // because participation is checked per request.
  it('is cacheable forever and privately', async () => {
    mockRooms.getLayerSnapshot.mockResolvedValue({ data: BLOB, hash: HASH })

    const res = await buildApp().inject({ method: 'GET', url: '/api/rooms/room-1/snapshots/layer-1/200' })

    expect(res.headers['cache-control']).toBe('private, max-age=31536000, immutable')
    expect(res.headers.etag).toBe(`"${HASH}"`)
  })

  it('answers a matching revalidation with 304 and no body', async () => {
    mockRooms.getLayerSnapshot.mockResolvedValue({ data: BLOB, hash: HASH })

    const res = await buildApp().inject({
      method: 'GET', url: '/api/rooms/room-1/snapshots/layer-1/200',
      headers: { 'if-none-match': `"${HASH}"` },
    })

    expect(res.statusCode).toBe(304)
    expect(res.rawPayload.length).toBe(0)
  })

  it('serves the body when the revalidated tag does not match', async () => {
    mockRooms.getLayerSnapshot.mockResolvedValue({ data: BLOB, hash: HASH })

    const res = await buildApp().inject({
      method: 'GET', url: '/api/rooms/room-1/snapshots/layer-1/200',
      headers: { 'if-none-match': '"some-older-hash"' },
    })

    expect(res.statusCode).toBe(200)
  })

  // Browsers send several tags at once once a URL has had more than one
  // representation cached — matching any of them is still a hit.
  it('accepts a matching tag inside a multi-tag If-None-Match', async () => {
    mockRooms.getLayerSnapshot.mockResolvedValue({ data: BLOB, hash: HASH })

    const res = await buildApp().inject({
      method: 'GET', url: '/api/rooms/room-1/snapshots/layer-1/200',
      headers: { 'if-none-match': `"other", "${HASH}"` },
    })

    expect(res.statusCode).toBe(304)
  })

  it('answers 404 for a triple that is not stored', async () => {
    mockRooms.getLayerSnapshot.mockResolvedValue(null)
    const res = await buildApp().inject({ method: 'GET', url: '/api/rooms/room-1/snapshots/layer-1/999' })
    expect(res.statusCode).toBe(404)
  })

  it('rejects a non-numeric seq before touching storage', async () => {
    const res = await buildApp().inject({ method: 'GET', url: '/api/rooms/room-1/snapshots/layer-1/latest' })
    expect(res.statusCode).toBe(400)
    expect(mockRooms.getLayerSnapshot).not.toHaveBeenCalled()
  })

  // The pixels of a password-protected room must not be reachable by guessing
  // its id over plain HTTP — the socket-level password check is upstream of
  // this, and `getParticipant` is what carries its result here.
  it('refuses a caller without content access', async () => {
    mockRooms.mayReadBoardContent.mockResolvedValue(false)
    const res = await buildApp().inject({ method: 'GET', url: '/api/rooms/room-1/snapshots/layer-1/200' })
    expect(res.statusCode).toBe(403)
    expect(mockRooms.getLayerSnapshot).not.toHaveBeenCalled()
  })
})

describe('POST /api/rooms/:roomId/snapshots', () => {
  // `object`, not `unknown`: inject's payload parameter is typed, and handing
  // it an unknown makes TypeScript fall through to the callback overload,
  // whose return type has no statusCode on it.
  function post(body: object) {
    return buildApp().inject({ method: 'POST', url: '/api/rooms/room-1/snapshots', payload: body })
  }

  it('stores an accepted upload and reports what landed', async () => {
    mockRooms.saveSnapshot.mockResolvedValue({ ok: true, created: ['layer-1'], duplicated: [], mismatched: [] })

    const res = await post({ seq: 100, layerState: { items: {} }, layers: {} })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true, stored: 1, duplicate: 0 })
  })

  // (#462) The rejection has to reach the client as a plain refusal — the
  // upload is best-effort and nothing retries it — and, more importantly, has
  // to leave a record naming the layers it would have erased. Without that,
  // the next occurrence is a counter rather than a diagnosis.
  it('refuses a stale layer state and names the layers it would have erased', async () => {
    mockRooms.saveSnapshot.mockResolvedValue({
      ok: false, error: 'stale_layer_state', missing: ['f1c-CNdM', 'UpIH_MCL'],
    })
    const app = buildApp()
    const warn = vi.spyOn(app.log, 'warn')

    const res = await app.inject({
      method: 'POST', url: '/api/rooms/room-1/snapshots',
      payload: { seq: 22400, layerState: { items: { 'layer-1': {} } }, layers: {} },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ error: 'stale_layer_state' })
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: 'room-1', seq: 22400, missing: ['f1c-CNdM', 'UpIH_MCL'] }),
      expect.stringContaining('#462'),
    )
  })

  it('answers 404 rather than 400 for a room the server does not hold', async () => {
    mockRooms.saveSnapshot.mockResolvedValue({ ok: false, error: 'unknown_room' })

    const res = await post({ seq: 100, layerState: {}, layers: {} })

    expect(res.statusCode).toBe(404)
  })

  it('refuses a caller without content access', async () => {
    mockRooms.mayReadBoardContent.mockResolvedValue(false)

    const res = await post({ seq: 100, layerState: {}, layers: {} })

    expect(res.statusCode).toBe(403)
    expect(mockRooms.saveSnapshot).not.toHaveBeenCalled()
  })
})


describe('scoped dependency history HTTP query', () => {
  it('passes only validated layer ids and preserves the inclusive caller cursor', async () => {
    mockRooms.getOperationsBeforeWithCanonicalRows.mockResolvedValue({operations:[],canonicalRows:[]})
    const response = await buildApp().inject({ method: 'GET', url: '/api/rooms/room-1/operations?beforeSeq=6&limit=500&layerIds=L,S' })
    expect(response.statusCode).toBe(200)
    expect(mockRooms.getOperationsBeforeWithCanonicalRows).toHaveBeenCalledWith('room-1', 6, 500, ['L', 'S'])
  })
  it('refuses empty layer identifiers', async () => {
    const response = await buildApp().inject({ method: 'GET', url: '/api/rooms/room-1/operations?beforeSeq=6&layerIds=L,' })
    expect(response.statusCode).toBe(400)
  })
})

describe('paired canonical history delivery with the SAME owner',()=>{
 it('keeps V1 material array bytes unchanged and does not consult V2 owner',async()=>{
  const operations=[{type:'canonical_stroke',id:'historical-png',frame:{materialPacked:'1|historical-png-material'}}]
  mockRooms.getOperationsBeforeWithCanonicalRows.mockResolvedValue({operations,canonicalRows:[]})
  const owner=new CanonicalRoomTransport(),project=vi.spyOn(owner,'prepareHistoryPage')
  const response=await buildApp(owner).inject({method:'GET',url:'/api/rooms/room-1/operations?beforeSeq=6'})
  expect(response.statusCode).toBe(200);expect(response.body).toBe(JSON.stringify(operations));expect(project).not.toHaveBeenCalled()
 })
 it('uses the explicitly injected owner for V2 and refuses delivery instead of publishing an unbound array',async()=>{
  const operations=[{type:'canonical_stroke',id:'v2',frame:{materialPacked:'2|source-material'}}],page={operations,canonicalRows:[]}
  mockRooms.getOperationsBeforeWithCanonicalRows.mockResolvedValue(page)
  const owner=new CanonicalRoomTransport(),project=vi.spyOn(owner,'prepareHistoryPage').mockRejectedValue(Error('policy OFF'))
  const response=await buildApp(owner).inject({method:'GET',url:'/api/rooms/room-1/operations?beforeSeq=6'})
  expect(response.statusCode).toBe(409);expect(response.json()).toEqual({error:'canonical_history_unavailable'})
  expect(project).toHaveBeenCalledWith({roomId:'room-1',userId:'student'},page,expect.any(Function))
  expect(response.body).not.toContain('source-material')
 })
})

it.each(['ready','failed','stale'] as const)('pairs canonical snapshot-index preparation with the SAME scoped owner (%s)',async mode=>{
 const {rooms}=await import('../rooms/roomRegistry.js')
 const record=canonicalIndexRecord()
 rooms.set('room-1',record)
 const owner=new CanonicalRoomTransport(),preparePrefix=vi.fn<import('../rooms/snapshotReplayLoader.js').CanonicalPrefixPreparer>(),scope={roomId:'room-1',boardEpoch:2}
 let current:(()=>boolean)|undefined
 const read=vi.spyOn(owner,'prepareReadDelivery').mockImplementation(async(_identity,isCurrent)=>{
  current=isCurrent;return {scope,preparePrefix,finish:()=>({canonicalReadScope:scope})}
 })
 const index={seq:3,layerState:{},layers:[]}
 mockRooms.getSnapshotIndex.mockImplementation(async(roomId,preparation)=>{
  expect(roomId).toBe('room-1');expect(preparation.prepareCanonicalPrefix).toBe(preparePrefix);expect(current?.()).toBe(true)
  if(mode==='failed')throw Error('known canonical prefix hole')
  if(mode==='stale')rooms.set('room-1',{...record})
  return index
 })
 const app=buildApp(owner)
 try{
  const result=await app.inject({method:'GET',url:'/api/rooms/room-1/snapshots/index'})
  expect(read).toHaveBeenCalledWith({roomId:'room-1',userId:'student'},expect.any(Function))
  if(mode==='ready'){expect(result.statusCode).toBe(200);expect(result.json()).toEqual(index)}
  else {expect(result.statusCode).toBe(409);expect(result.json()).toEqual({error:'canonical_history_unavailable'})}
 }finally{rooms.delete('room-1');await app.close()}
})

function canonicalIndexRecord():import('../rooms/roomRegistry.js').RoomRecord{return {room:{id:'room-1',name:'Board',ownerId:'author',paper:'flat',infinite:false,canvasWidth:64,canvasHeight:64,hasPassword:false,accessMode:'anyone_with_link',createdAt:'2026-10-31T00:00:00Z',rasterVersion:'straight-rgba8-v1'},lessonId:null,sockets:new Set(),boards:[],assignments:[],activeAssignmentId:null,spotlightBoardId:null,handsRaised:new Set(),assignmentStarting:false,passwordHash:undefined,operations:[],participants:new Map(),nextSeq:1,layerStateSeq:null,layerStateIds:null,coveredSeqByLayer:new Map(),palette:[],roomFrozen:false,frozenUserIds:new Set(),lockedLayerIds:new Set(),sharedLockedLayerIds:new Set(),aliveIds:new Set(['L']),deletedIds:new Set(),operationsById:new Map(),structuralLog:[]}}
it.each(['operator','storage'] as const)('refuses an empty canonical index after SAME-room %s replacement without calling any prefix preparer',async kind=>{
 const {rooms}=await import('../rooms/roomRegistry.js'),storageModule=await import('../brushLibrary/storage.js')
 const {mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path')
 const dir=mkdtempSync(join(tmpdir(),'canonical-index-owner-')),record=canonicalIndexRecord()
 rooms.set('room-1',record)
 const firstStorage=new storageModule.BrushStorage(join(dir,'first')),firstOperator=storageModule.empty()
 const context=vi.spyOn(storageModule,'canonicalBrushStorageContext').mockReturnValue({storage:firstStorage,operator:firstOperator})
 const owner=new CanonicalRoomTransport(),read=vi.spyOn(owner,'prepareReadDelivery')
 mockRooms.getSnapshotIndex.mockImplementation(async(_roomId,preparation)=>{
  expect(typeof preparation.prepareCanonicalPrefix).toBe('function')
  expect(record.operations).toEqual([]) // No V2 frame/prefix callback can refresh this ticket.
  context.mockReturnValue({storage:kind==='storage'?new storageModule.BrushStorage(join(dir,'replacement')):firstStorage,operator:kind==='operator'?storageModule.empty():firstOperator})
  return {seq:3,layerState:{},layers:[]}
 })
 const app=buildApp(owner)
 try{
  const result=await app.inject({method:'GET',url:'/api/rooms/room-1/snapshots/index'})
  expect(result.statusCode).toBe(409);expect(result.json()).toEqual({error:'canonical_history_unavailable'})
  expect(read).toHaveBeenCalledOnce();expect(rooms.get('room-1')).toBe(record)
  expect(mockRooms.getSnapshotIndex).toHaveBeenCalledOnce()
 }finally{context.mockRestore();rooms.delete('room-1');await app.close();rmSync(dir,{recursive:true,force:true})}
})
it('rechecks read permission after canonical index preparation and publishes no index after revocation',async()=>{
 const {rooms}=await import('../rooms/roomRegistry.js'),record=canonicalIndexRecord();rooms.set('room-1',record)
 const owner=new CanonicalRoomTransport(),finish=vi.fn(()=>({canonicalReadScope:{roomId:'room-1',boardEpoch:2}}))
 vi.spyOn(owner,'prepareReadDelivery').mockResolvedValue({scope:{roomId:'room-1',boardEpoch:2},preparePrefix:vi.fn(),finish})
 mockRooms.getSnapshotIndex.mockImplementation(async()=>{mockRooms.mayReadBoardContent.mockResolvedValueOnce(false);return {seq:3,layerState:{},layers:[]}})
 const app=buildApp(owner)
 try{
  const result=await app.inject({method:'GET',url:'/api/rooms/room-1/snapshots/index'})
  expect(result.statusCode).toBe(403);expect(result.json()).toEqual({error:'forbidden'});expect(finish).not.toHaveBeenCalled()
 }finally{rooms.delete('room-1');await app.close()}
})
