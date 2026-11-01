import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'

const state=vi.hoisted(()=>({clients:[] as {url:string;tx:{execute:ReturnType<typeof vi.fn>};disconnect:ReturnType<typeof vi.fn>}[],construct:vi.fn(),transaction:vi.fn(),actualFactory:undefined as undefined|((options:{datasources:{db:{url:string}}})=>unknown)}))
vi.mock('@prisma/client',()=>({Prisma:{TransactionIsolationLevel:{RepeatableRead:'RepeatableRead'}},PrismaClient:vi.fn(function(options:{datasources:{db:{url:string}}}){
 if(state.actualFactory)return state.actualFactory(options)
 state.construct(options)
 const client={url:options.datasources.db.url,tx:{execute:vi.fn().mockResolvedValue(0)},disconnect:vi.fn().mockResolvedValue(undefined)}
 state.clients.push(client)
 return {$transaction(run:(tx:{$executeRawUnsafe:ReturnType<typeof vi.fn>})=>Promise<unknown>,options:unknown){state.transaction(options);return run({$executeRawUnsafe:client.tx.execute})},$disconnect(){return client.disconnect()}}
})}))
const postgresUrl=process.env.CANONICAL_INDEXED_READER_TEST_DATABASE_URL


beforeEach(()=>{vi.resetModules();state.clients.length=0;state.actualFactory=undefined;state.construct.mockClear();state.transaction.mockClear();vi.stubEnv('DATABASE_URL','postgresql://qa:private@localhost:55486/qa?connection_limit=1')})
afterEach(()=>vi.unstubAllEnvs())

describe('dedicated original indexed validation reader',()=>{
 it('stays unallocated by import/shutdown when disabled',async()=>{
  const reader=await import('./canonicalIndexedReader.js')
  expect(state.construct).not.toHaveBeenCalled()
  await reader.closeCanonicalIndexedReader()
  expect(state.construct).not.toHaveBeenCalled()
 })
 it('uses one separate lazy connection with transaction-local bounded validation settings',async()=>{
  const reader=await import('./canonicalIndexedReader.js')
  const value=await reader.withCanonicalIndexedValidation(async()=>17)
  expect(value).toBe(17);expect(state.clients).toHaveLength(1)
  const url=new URL(state.clients[0].url);expect(url.searchParams.get('connection_limit')).toBe('1')
  expect(state.transaction).toHaveBeenCalledWith({isolationLevel:'RepeatableRead',maxWait:1000,timeout:120000})
  const sql=state.clients[0].tx.execute.mock.calls.map(([query])=>query)
  expect(sql).toEqual(expect.arrayContaining(["SET LOCAL statement_timeout='15s'","SET LOCAL lock_timeout='1s'","SET LOCAL work_mem='4MB'","SET LOCAL temp_file_limit='64MB'","SET LOCAL idle_in_transaction_session_timeout='10s'",'SET LOCAL jit=off']))
  await reader.closeCanonicalIndexedReader();expect(state.clients[0].disconnect).toHaveBeenCalledTimes(1)
 })
 it('rejects competing validation rather than queueing and releases lease after failure',async()=>{
  const reader=await import('./canonicalIndexedReader.js')
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve})
  const first=reader.withCanonicalIndexedValidation(async()=>{await gate;throw Error('original failure')})
  await Promise.resolve();await Promise.resolve()
  await expect(reader.withCanonicalIndexedValidation(async()=>1)).rejects.toThrow('busy')
  expect(state.clients).toHaveLength(1);release();await expect(first).rejects.toThrow('original failure')
  expect(await reader.withCanonicalIndexedValidation(async()=>2)).toBe(2)
  await reader.closeCanonicalIndexedReader()
 })
 it('shutdown is idempotent and a closed reader cannot allocate a replacement',async()=>{
  const reader=await import('./canonicalIndexedReader.js')
  await reader.withCanonicalIndexedValidation(async()=>undefined)
  await Promise.all([reader.closeCanonicalIndexedReader(),reader.closeCanonicalIndexedReader()])
  expect(state.clients[0].disconnect).toHaveBeenCalledTimes(1)
  await expect(reader.withCanonicalIndexedValidation(async()=>1)).rejects.toThrow('closed')
  expect(state.clients).toHaveLength(1)
 })
})


it.skipIf(!postgresUrl)('actual PostgreSQL mainpool1 makes progress and observes TEMP revocation while separate validation snapshot is held',async()=>{
 if(!postgresUrl)throw Error('Explicit own QA database required')
 const url=new URL(postgresUrl)
 if(!['localhost','127.0.0.1'].includes(url.hostname)||url.port!=='55486')throw Error('Own QA55486 required')
 url.searchParams.set('connection_limit','1');vi.stubEnv('DATABASE_URL',url.toString())
 const actual=await vi.importActual<typeof import('@prisma/client')>('@prisma/client')
 state.actualFactory=options=>new actual.PrismaClient(options)
 const main=new actual.PrismaClient({datasources:{db:{url:url.toString()}}})
 const reader=await import('./canonicalIndexedReader.js')
 let failed=false,primary:unknown
 try{
  let readerPid=0,mainPid=0
  const outcome=await reader.withCanonicalIndexedValidation(async transaction=>{
   readerPid=(await transaction.$queryRawUnsafe<{pid:number}[]>('SELECT pg_backend_pid() AS pid'))[0].pid
   const result=await main.$transaction(async connection=>{
    await connection.$executeRawUnsafe('CREATE TEMP TABLE ls2_mainpool_access (allowed boolean) ON COMMIT DROP')
    await connection.$executeRawUnsafe('INSERT INTO ls2_mainpool_access VALUES (true)')
    await connection.$executeRawUnsafe('UPDATE ls2_mainpool_access SET allowed=false')
    mainPid=(await connection.$queryRawUnsafe<{pid:number}[]>('SELECT pg_backend_pid() AS pid'))[0].pid
    return connection.$queryRawUnsafe<{allowed:boolean}[]>('SELECT allowed FROM ls2_mainpool_access')
   },{maxWait:1000,timeout:3000})
   // This is a SQL resource/isolation fixture, NOT a real Room access grant.
   expect(result[0].allowed).toBe(false)
   return 'main writer and fresh permission query completed'
  })
  expect(outcome).toBe('main writer and fresh permission query completed')
  expect(readerPid).not.toBe(mainPid)
  expect((await main.$queryRawUnsafe<{name:string|null}[]>("SELECT to_regclass('pg_temp.ls2_mainpool_access')::text AS name"))[0].name).toBe(null)
 }catch(error){failed=true;primary=error}
 const closed=await Promise.allSettled([reader.closeCanonicalIndexedReader(),main.$disconnect()])
 if(failed)throw primary
 for(const result of closed)if(result.status==='rejected')throw result.reason
},15000)

it.skipIf(!postgresUrl)('actual short indexed SQL releases mainpool1 before the fresh permission/write callback',async()=>{
 if(!postgresUrl)throw Error('Explicit own QA database required')
 const url=new URL(postgresUrl)
 if(!['localhost','127.0.0.1'].includes(url.hostname)||url.port!=='55486')throw Error('Own QA55486 required')
 url.searchParams.set('connection_limit','1')
 const actual=await vi.importActual<typeof import('@prisma/client')>('@prisma/client')
 const main=new actual.PrismaClient({datasources:{db:{url:url.toString()}}})
 let shortHeld=false,shortPid=0,authPid=0
 const settings:string[]=[]
 const facade={
  operation:main.operation,$queryRawUnsafe:main.$queryRawUnsafe.bind(main),$executeRawUnsafe:main.$executeRawUnsafe.bind(main),
  async $transaction<T>(run:(connection:import('@prisma/client').Prisma.TransactionClient)=>Promise<T>,options:{maxWait:number;timeout:number}){
   shortHeld=true
   try{return await main.$transaction(async connection=>{
    // TEMP shadows the protected real table only inside this owned transaction.
    await connection.$executeRawUnsafe('CREATE TEMP TABLE "Operation" (id text,"roomId" text,seq int,type text,data jsonb) ON COMMIT DROP')
    shortPid=(await connection.$queryRawUnsafe<{pid:number}[]>('SELECT pg_backend_pid() AS pid'))[0].pid
    const result=await run(connection)
    settings.push((await connection.$queryRawUnsafe<{value:string}[]>("SELECT current_setting('statement_timeout') AS value"))[0].value)
    settings.push((await connection.$queryRawUnsafe<{value:string}[]>("SELECT current_setting('lock_timeout') AS value"))[0].value)
    return result
   },options)}finally{shortHeld=false}
  },
 }
 vi.doMock('./prisma.js',()=>({prisma:facade}))
 try{
  const store=await import('../rooms/snapshotStore.js')
  const page=await store.getCanonicalIndexedHistoryPageRows('owned-temp-room',0,0,async()=>{
   expect(shortHeld).toBe(false)
   const result=await main.$transaction(async connection=>{
    await connection.$executeRawUnsafe('CREATE TEMP TABLE ls2_short_access (allowed boolean) ON COMMIT DROP')
    await connection.$executeRawUnsafe('INSERT INTO ls2_short_access VALUES (true)')
    await connection.$executeRawUnsafe('UPDATE ls2_short_access SET allowed=false')
    authPid=(await connection.$queryRawUnsafe<{pid:number}[]>('SELECT pg_backend_pid() AS pid'))[0].pid
    return connection.$queryRawUnsafe<{allowed:boolean}[]>('SELECT allowed FROM ls2_short_access')
   },{maxWait:1000,timeout:3000})
   expect(result[0].allowed).toBe(false)
  })
  expect(page).toMatchObject({terminal:true,nextAfterSeq:0})
  expect(settings).toEqual(['15s','1s']);expect(shortPid).toBe(authPid)
  const cleanup=await main.$queryRawUnsafe<{operation:string|null;access:string|null}[]>(`SELECT to_regclass('pg_temp."Operation"')::text AS operation,to_regclass('pg_temp.ls2_short_access')::text AS access`)
  expect(cleanup[0]).toEqual({operation:null,access:null})
 }finally{vi.doUnmock('./prisma.js');await main.$disconnect()}
},15000)

it.skipIf(!postgresUrl)('actual indexed candidate SQL filters hidden roots and preserves original-edge U4 semantics',async()=>{
 if(!postgresUrl)throw Error('Explicit own QA database required')
 const url=new URL(postgresUrl)
 if(!['localhost','127.0.0.1'].includes(url.hostname)||url.port!=='55486')throw Error('Own QA55486 required')
 url.searchParams.set('connection_limit','1')
 const actual=await vi.importActual<typeof import('@prisma/client')>('@prisma/client')
 const main=new actual.PrismaClient({datasources:{db:{url:url.toString()}}})
 vi.doMock('./prisma.js',()=>({prisma:main}))
 try{
  const store=await import('../rooms/snapshotStore.js')
  await main.$transaction(async connection=>{
   await connection.$executeRawUnsafe("SET LOCAL statement_timeout='15s'")
   await connection.$executeRawUnsafe("SET LOCAL lock_timeout='1s'")
   await connection.$executeRawUnsafe("SET LOCAL work_mem='4MB'")
   await connection.$executeRawUnsafe("SET LOCAL temp_file_limit='64MB'")
   await connection.$executeRawUnsafe('CREATE TEMP TABLE "Operation" (id text PRIMARY KEY,seq int NOT NULL,"roomId" text NOT NULL,"userId" text NOT NULL,type text NOT NULL,"layerId" text,tool text,data jsonb NOT NULL,UNIQUE("roomId",seq)) ON COMMIT DROP')
   await connection.$executeRawUnsafe(`CREATE INDEX ON "Operation" ("roomId","userId",(data#>>'{frame,strokeId}'),seq) WHERE type='canonical_stroke'`)
   await connection.$executeRawUnsafe(`CREATE INDEX ON "Operation" ("roomId",(data->>'targetOpId'),seq) WHERE type IN ('operation_undo','operation_redo')`)
   await connection.$executeRawUnsafe(`CREATE INDEX ON "Operation" ("roomId","userId",seq) WHERE type='canonical_stroke' AND data#>>'{frame,frameOrdinal}'='0'`)
   const bodyIds:string[][]=[]
   // Prisma ORM qualifies public.Operation. This explicit TEMP-only body
   // adapter tests the production SQL selector without touching real rows.
   const operation=new Proxy(connection.operation,{get(target,property,receiver){
    if(property==='findMany')return async(input:{where:{id:{in:string[]};roomId:string};take:number})=>{
     bodyIds.push([...input.where.id.in])
     return connection.$queryRawUnsafe<import('../rooms/roomPersistence.js').CanonicalStoredOperationRow[]>('SELECT * FROM "Operation" WHERE "roomId"=$1::text AND id=ANY($2::text[]) ORDER BY seq LIMIT $3::int',input.where.roomId,input.where.id.in,input.take)
    }
    return Reflect.get(target,property,receiver)
   }})
   const database={operation,$queryRawUnsafe:connection.$queryRawUnsafe.bind(connection),$executeRawUnsafe:connection.$executeRawUnsafe.bind(connection)}
   await connection.$executeRawUnsafe(`INSERT INTO "Operation" VALUES ('visible-first',1,'bench','author','canonical_stroke','L',null,'{"frame":{"strokeId":"visible-first","frameOrdinal":0}}')`)
   await connection.$executeRawUnsafe(`INSERT INTO "Operation" SELECT 'f'||i,2*i,'bench','author','canonical_stroke','L',null,jsonb_build_object('frame',jsonb_build_object('strokeId','g'||i,'frameOrdinal',0)) FROM generate_series(1,1025) i`)
   await connection.$executeRawUnsafe(`INSERT INTO "Operation" SELECT 'u'||i,2*i+1,'bench','author','operation_undo',null,null,jsonb_build_object('targetOpId','f'||i) FROM generate_series(1,1025) i`)
   await connection.$executeRawUnsafe('ANALYZE "Operation"')
   const guard=vi.fn(async()=>{})
   const visible=await store.getCanonicalIndexedActorRootRows('bench',2051,'author',2052,guard,'undo',database)
   expect(visible.map(row=>row.id)).toEqual(['visible-first'])
   expect(bodyIds).toEqual([['visible-first']]);expect(guard).toHaveBeenCalledTimes(2)
   bodyIds.length=0
   expect(await store.getCanonicalIndexedActorRootRows('bench',2051,'author',1,guard,'undo',database)).toEqual([])
   expect(bodyIds).toEqual([])
   await connection.$executeRawUnsafe('TRUNCATE "Operation"')
   // First metadata targets a middle frame. Continuation of the OPEN other
   // root and peer frame0 do not branch; repeated undo does not reset U.
   const rows:[string,number,string,string,object][]=[
    ['first',1,'author','canonical_stroke',{frame:{strokeId:'root',frameOrdinal:0}}],
    ['middle',2,'author','canonical_stroke',{frame:{strokeId:'root',frameOrdinal:1}}],
    ['undo1',3,'author','operation_undo',{targetOpId:'middle'}],
    ['branch',4,'author','canonical_stroke',{frame:{strokeId:'branch',frameOrdinal:0}}],
    ['undo2',5,'author','operation_undo',{targetOpId:'undo1'}],
    ['redo1',6,'author','operation_redo',{targetOpId:'undo2'}],
    ['undo3',7,'author','operation_undo',{targetOpId:'redo1'}],
    ['continuation',8,'author','canonical_stroke',{frame:{strokeId:'branch',frameOrdinal:1}}],
    ['peer',9,'peer','canonical_stroke',{frame:{strokeId:'peer',frameOrdinal:0}}],
    ['new-own',10,'author','canonical_stroke',{frame:{strokeId:'new-own',frameOrdinal:0}}],
   ]
   for(const [id,seq,user,type,data]of rows)await connection.$executeRawUnsafe('INSERT INTO "Operation" VALUES ($1::text,$2::int,$3::text,$4::text,$5::text,$6::text,null,$7::jsonb)',id,seq,'bench',user,type,type==='canonical_stroke'?'L':null,JSON.stringify(data))
   expect((await store.getCanonicalIndexedActorRootRows('bench',6,'author',7,async()=>{},'undo',database)).map(row=>row.id)).toEqual(['branch','first'])
   for(const [cut,expected]of [[5,[]],[6,[]],[9,['first']],[10,[]]] as const){
    const found=await store.getCanonicalIndexedActorRootRows('bench',cut,'author',cut+1,async()=>{},'redo',database)
    expect(found.map(row=>row.id)).toEqual(expected)
   }
  },{maxWait:1000,timeout:20000})
  expect((await main.$queryRawUnsafe<{name:string|null}[]>(`SELECT to_regclass('pg_temp."Operation"')::text AS name`))[0].name).toBe(null)
 }finally{vi.doUnmock('./prisma.js');await main.$disconnect()}
},25000)
