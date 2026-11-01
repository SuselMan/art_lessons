import {PrismaClient,type Prisma} from '@prisma/client'

/** #807 / ADR017. One lazy bounded validation connection; never the main
 * Prisma connection holding permission checks or the canonical writer queue.
 * This owns SQL resources only, not original/read/paint authority. */
let reader:PrismaClient|undefined
let validating=false
let closed=false
let closing:Promise<void>|undefined

export async function withCanonicalIndexedValidation<T>(run:(transaction:Prisma.TransactionClient)=>Promise<T>):Promise<T>{
 if(closed)throw new Error('Canonical indexed reader closed')
 if(validating)throw new Error('Canonical indexed validation busy')
 validating=true
 try{
  if(!reader){
   const source=process.env.DATABASE_URL
   if(!source)throw new Error('Canonical indexed reader database unavailable')
   const url=new URL(source)
   if(url.protocol!=='postgresql:'&&url.protocol!=='postgres:')throw new Error('Canonical indexed reader requires PostgreSQL')
   url.searchParams.set('connection_limit','1')
   reader=new PrismaClient({datasources:{db:{url:url.toString()}}})
  }
  return await reader.$transaction(async transaction=>{
   await transaction.$executeRawUnsafe("SET LOCAL statement_timeout='15s'")
   await transaction.$executeRawUnsafe("SET LOCAL lock_timeout='1s'")
   await transaction.$executeRawUnsafe("SET LOCAL work_mem='4MB'")
   await transaction.$executeRawUnsafe("SET LOCAL temp_file_limit='64MB'")
   await transaction.$executeRawUnsafe("SET LOCAL idle_in_transaction_session_timeout='10s'")
   await transaction.$executeRawUnsafe('SET LOCAL jit=off')
   return run(transaction)
  },{isolationLevel:'RepeatableRead',maxWait:1000,timeout:120000})
 }finally{validating=false}
}

/** Safe on default-OFF startup: importing/closing this module allocates nothing.
 * Server shutdown awaits this together with its existing resource cleanup. */
export function closeCanonicalIndexedReader():Promise<void>{
 if(closing)return closing
 closed=true
 const captured=reader
 reader=undefined
 closing=captured?captured.$disconnect():Promise.resolve()
 return closing
}
