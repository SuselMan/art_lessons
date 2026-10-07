import {isDeepStrictEqual} from 'node:util';import fs from 'node:fs';import crypto from 'node:crypto';import {createRequire} from 'node:module';import {original47,mapped47} from './guards.mjs';
export function mapSeed47(raw,author,namespace=crypto.randomUUID()){
 const input=original47(raw),ids=new Map(input.map(o=>[o.id,namespace+'-'+o.id]));const mapped=input.map(raw=>{const o=structuredClone(raw);delete o.seq;o.id=ids.get(o.id);o.userId=author;if(o.targetOpId)o.targetOpId=ids.get(o.targetOpId);return o});mapped47(mapped,author,namespace);return{namespace,mapped};
}
export function durable47(actual,expected){
 if(!Array.isArray(actual)||actual.length!==47||new Set(actual.map(o=>o.id)).size!==47)throw Error('Durable exact47 required');
 for(let i=0;i<47;i++){const got=structuredClone(actual[i]);if(got.seq!==i+1)throw Error('Durable sequence');delete got.seq;if(!isDeepStrictEqual(got,expected[i]))throw Error('Durable original payload/order/author differs '+i)}return true;
}
/** Normal create_room/operation path. No Engine, rendering, DB writes, or auth minting outside API. */
export async function seedSocket47({backend,input,roomId=crypto.randomUUID(),releaseRoot,privatePath}){
 const url=new URL(backend);if(url.href!=='http://127.0.0.1:4539/'||url.username||url.password)throw Error('Only owned HOME QA4539 backend allowed');if(!privatePath||fs.existsSync(privatePath))throw Error('New private auth path required; refusing overwrite');
 if(process.env.QA_SERVER_SEED_GRANT!=='explicit-root-grant')throw Error('Explicit engine-free normal seed grant required');
 const req=createRequire(releaseRoot+'/apps/web/package.json'),{io}=req('socket.io-client');const cookies=new Map();
 const http=async path=>{const r=await fetch(backend+path,{headers:{Cookie:[...cookies].map(([k,v])=>k+'='+v).join(';')}});if(typeof r.headers.getSetCookie!=='function')throw Error('Native Set-Cookie parser unavailable');for(const raw of r.headers.getSetCookie()){const pair=raw.split(';',1)[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}if(!r.ok)throw Error('Own API HTTP '+r.status);return r.json()};
 const identity=await http('/api/me');if(typeof identity.userId!=='string'||identity.userId==='local')throw Error('Actual API identity required');
 const cookieHeader=[...cookies].map(([k,v])=>k+'='+v).join(';');const socket=io(backend,{transports:['websocket'],extraHeaders:{Cookie:cookieHeader},reconnection:false});
 const event=(name,arg)=>new Promise((resolve,reject)=>{socket.timeout(15000).emit(name,arg,(err,ack)=>{if(err)reject(Error('Normal Socket ACK timeout '+name));else if(ack?.ok)resolve(ack);else reject(Error('Normal Socket rejected '+name+': '+(ack?.reason??ack?.error??'unknown')))})});
 try{await new Promise((resolve,reject)=>{const deadline=setTimeout(()=>reject(Error('Own Socket connect deadline')),15000);socket.once('connect',()=>{clearTimeout(deadline);resolve()});socket.once('connect_error',()=>{clearTimeout(deadline);reject(Error('Own Socket connect failed'))})});
  const room={id:roomId,name:'728 engine-free original47',paper:'fine',paperColor:'#fdfdfc',infinite:false,canvasWidth:1754,canvasHeight:2480,hasPassword:false,accessMode:'anyone_with_link',ownerId:identity.userId,createdAt:new Date().toISOString()};
  const ack=await event('create_room',{room,name:'728 engine-free owner',accessMode:'anyone_with_link',lastKnownSeq:0});if(ack.userId!==identity.userId)throw Error('Normal Socket identity differs');const {namespace,mapped}=mapSeed47(input,identity.userId);
  for(let i=0;i<47;i++){const confirmed=await event('operation',mapped[i]);if(confirmed.seq!==i+1||confirmed.duplicate)throw Error('Actual normal Socket ordering/unique-ID guard')}
  const end=Date.now()+15000;let actual;while(Date.now()<end){actual=await http('/api/rooms/'+roomId+'/operations?beforeSeq=48&limit=500');try{durable47(actual,mapped);break}catch{await new Promise(r=>setTimeout(r,200))}}
  durable47(actual,mapped);const record={roomId,author:identity.userId,namespace,mapped,actual};
  // Sensitive identity is private, untracked, never returned in report/stdout.
  fs.writeFileSync(privatePath,JSON.stringify({cookies:[...cookies].map(([name,value])=>({name,value,path:'/',httpOnly:true,secure:false,sameSite:'Lax'}))}),{mode:0o600,flag:'wx'});return record;
 }finally{socket.disconnect()}
}
