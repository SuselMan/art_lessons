import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { eventTable } from './eventTable';
import { checkRuntime } from './runtime';
const virtual = (text: string, extra: Record<string,string> = {}) => eventTable('/event/protocol.ts','Events',{root:'/event',read:p => {
  if(p==='/event/protocol.ts')return text;
  if(Object.hasOwn(extra,p))return extra[p];
  throw new Error('missing source');
}});
describe('exact bounded protocol event AST keys',()=>{
 it('reads intersection/import rename and mapped keyof request keys without traversing payloads',()=>{
  expect([...virtual(`import type { Stream as Renamed } from './stream.js'; type Local={ local:(x:Unknown)=>void }; export type Events=Local & (Renamed) & {'quoted-event':()=>void}`,{'/event/stream.ts':`interface Requests{next:UnknownPayload;cancel:Other};export type Stream={[K in keyof Requests]:(x:Requests[K])=>void}`})].sort()).toEqual(['cancel','local','next','quoted-event']);
 });
 it.each([
  'type Events=Missing', 'type Events=Events', 'type A=B;type B=A;type Events=A',
  'type Events={ [key:string]:()=>void }', 'type Events={ [Symbol.iterator]:()=>void }',
  'type Events={ a:()=>void }|{ b:()=>void }', 'type Events<T>={a:T}',
  'type Events={[K in "a" as "b"]:()=>void}', 'type Events={',
 ])('fails closed rather than omit unknown/cyclic/unsupported keys: %s',text=>expect(()=>virtual(text)).toThrow());
 it('refuses import escapes, nonrelative imports and unexported aliases',()=>{
  for(const spec of ['../escape.js','node:fs'])expect(()=>virtual(`import type {A} from '${spec}';type Events=A`)).toThrow();
  expect(()=>virtual(`import type{A}from './a.js';type Events=A`,{'/event/a.ts':'type A={a:()=>void}'})).toThrow();
 });
 it('bounds cycles across imports, file bytes and resolution work',()=>{
  expect(()=>virtual(`import type {A} from './a.js';export type Events=A`,{'/event/a.ts':`import type {Events} from './protocol.js';export type A=Events`})).toThrow(/cyclic/);
  expect(()=>virtual(' '.repeat(1024*1024+1)+'type Events={}')).toThrow(/byte limit/);
  expect(()=>virtual('type Events={'+Array.from({length:4100},(_,i)=>`a${i}:void;`).join('')+'}')).toThrow(/limit/);
 });
 it('extracts actual imported indexed contract keys and reports map omissions honestly',()=>{
  const entry=resolve('packages/shared/src/protocol.ts');const events=eventTable(entry,'ClientToServerEvents');
  const indexed=['open','next','evidence','reopen','select','cancel'].map(x=>'canonical_history_stream_'+x);
  expect(indexed.every(x=>events.has(x))).toBe(true);expect(events.has('operation')).toBe(true);
  expect(eventTable(entry,'ServerToClientEvents').has('operation_confirmed')).toBe(true);
  const rt=parse(readFileSync('docs/architecture/runtime.yaml','utf8'));
  const mapped=new Set(rt.links.filter((l:any)=>l.checks==='socket').flatMap((l:any)=>l.messages.filter((m:any)=>m.dir==='→').map((m:any)=>m.name)));
  expect(indexed.filter(x=>!mapped.has(x))).toEqual([]);
  expect(checkRuntime(rt)).toEqual([]);
 });
});
