import { io } from '/home/suselman/projects/pencil-agents/680-lifetime-hardware/node_modules/socket.io-client/build/esm/index.js';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const base='http://127.0.0.1:4538';
const sockets=[];const sha=b=>createHash('sha256').update(b).digest('hex');
async function seat(){
 const me=await fetch(base+'/api/me');if(!me.ok)throw Error('identity '+me.status);
 const cookie=me.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
 const socket=io(base,{transports:['websocket'],extraHeaders:{Cookie:cookie},reconnection:false});sockets.push(socket);
 const states=[];socket.on('room_state',s=>states.push(s));
 await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);setTimeout(()=>reject(Error('connect deadline')),8000).unref()});
 return {cookie,socket,states};
}
const ack=(s,event,payload)=>new Promise((resolve,reject)=>s.timeout(8000).emit(event,payload,(err,result)=>err?reject(err):resolve(result)));
try{
 const owner=await seat(),roomId='qa728load-'+randomUUID().slice(0,8);
 const joined=await ack(owner.socket,'create_room',{room:{id:roomId,name:'728 first-copy HTTP transport only',paper:'fine',paperColor:'#fdfdfc',infinite:false,canvasWidth:64,canvasHeight:64},name:'728 QA'});
 if(!joined.ok)throw Error('create rejected '+JSON.stringify(joined));
 for(let i=0;i<47;i++){
  const result=await ack(owner.socket,'operation',{id:randomUUID(),type:'paper_dry',userId:joined.userId,timestamp:Date.now()});
  if(!result.ok||result.seq!==i+1)throw Error('operation watermark '+JSON.stringify(result));
 }
 // Opaque transport fixture: validates binary/auth/index/cadence, NOT native pigment replay.
 const raw=Buffer.alloc(20+16*4);raw.writeUInt32LE(1,0);raw.writeInt32LE(0,4);raw.writeInt32LE(0,8);raw.writeUInt32LE(4,12);raw.writeUInt32LE(4,16);
 for(let i=20;i<raw.length;i+=4){raw[i]=30;raw[i+3]=255;}
 const structure={items:{background:{kind:'layer',id:'background',name:'Background',opacity:1,visible:true},'layer-1':{kind:'layer',id:'layer-1',name:'Layer1',opacity:1,visible:true}},rootOrder:['layer-1','background'],activeId:'layer-1',selectedIds:[]};
 const post=await fetch(base+'/api/rooms/'+roomId+'/snapshots',{method:'POST',headers:{Cookie:owner.cookie,'Content-Type':'application/json'},body:JSON.stringify({seq:47,layerState:structure,layers:{'layer-1':gzipSync(raw).toString('base64')}})});
 const stored=await post.json();if(!post.ok)throw Error('snapshot '+post.status+' '+JSON.stringify(stored));
 const indexRes=await fetch(base+'/api/rooms/'+roomId+'/snapshots/index',{headers:{Cookie:owner.cookie}});const index=await indexRes.json();
 if(index.seq!==47||index.layers[0]?.seq!==47||index.layers[0]?.hash!==sha(raw))throw Error('index mismatch');
 const blob=await fetch(base+'/api/rooms/'+roomId+'/snapshots/layer-1/47',{headers:{Cookie:owner.cookie}});const restored=gunzipSync(Buffer.from(await blob.arrayBuffer()));
 if(!restored.equals(raw))throw Error('gzip byte mismatch');
 const peer=await seat();const result=await ack(peer.socket,'join_room',{roomId,name:'728 second participant'});if(!result.ok)throw Error('rejoin '+JSON.stringify(result));
 await new Promise(r=>setTimeout(r,200));
 const state=peer.states.at(-1);if(state?.latestSnapshotSeq!==47)throw Error('join watermark '+state?.latestSnapshotSeq);
 const report={scope:'real HTTP/DB/socket transport; opaque tile fixture, not native rendering',roomId,postStatus:post.status,indexSeq:index.seq,layerSeq:index.layers[0].seq,decodedBytes:raw.length,wholeSHA:sha(raw),rejoinSnapshotSeq:state.latestSnapshotSeq,tailCount:state.tailOperations.length,ok:true};
 await writeFile('/home/suselman/projects/pencil-agents/680-lifetime-hardware/temp/night-load-server/http-gate.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{for(const s of sockets)s.disconnect();}
