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
