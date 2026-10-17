// QA backend only: disposable owner fixture, real identities, real Socket.IO.
const fs=require('fs'),assert=require('assert/strict');
const {request}=require('@playwright/test'),{io}=require('socket.io-client');
const dir=process.env.QA_FIXTURE_OUTPUT,out=process.env.QA_OUTPUT;
assert(dir&&out);const f=JSON.parse(fs.readFileSync(dir+'/fixture.json'));
assert(f.disposable&&f.room.startsWith('qa-undo-v1-'));assert.equal(f.backend,'http://localhost:4558');
const sockets=[];let owner,guest;
const wait=(s,event,test=()=>true)=>new Promise((resolve,reject)=>{const listener=x=>{if(test(x)){clearTimeout(t);s.off(event,listener);resolve(x)}};const t=setTimeout(()=>{s.off(event,listener);reject(Error('Timeout '+event))},5000);s.on(event,listener)});
async function connect(state){const s=io(f.backend,{transports:['websocket'],extraHeaders:{Cookie:state.cookies.map(c=>c.name+'='+c.value).join('; ')},reconnection:false});sockets.push(s);await new Promise((r,j)=>{s.once('connect',r);s.once('connect_error',j)});await new Promise((r,j)=>s.timeout(5000).emit('join_room',{roomId:f.room,name:'Disposable792'},(e,a)=>e?j(e):a?.ok?r():j(Error('join rejected'))));return s}
(async()=>{const result={runtime:'ac892525',case:'normal pen-up then disconnect with sibling socket',pass:false};try{
owner=await request.newContext({storageState:dir+'/host-state.json'});guest=await request.newContext();assert((await guest.get(f.backend+'/api/me')).ok());
const gs=await guest.storageState(),os=await owner.storageState();
const observer=await connect(gs),a=await connect(os),b=await connect(os);
const departures=[];observer.on('peer_left',x=>departures.push(x));
const fields=[20,20,.5,0,0,10,1,0,1,0],buf=Buffer.alloc(40);fields.forEach((n,i)=>buf.writeFloatLE(n,i*4));
const strokeId='qa792-ended-unrecorded',live=wait(observer,'peer_stroke_live',x=>x.strokeId===strokeId);
a.emit('stroke_live',{strokeId,layerId:'qa-layer-792',tool:'watercolor',preset:'normal:100:50:PB29:round:wc@m70-r2-v1',color:[0,0,1],packetSeq:0,dabsPacked:'1:'+buf.toString('base64')});
const packet=await live;const up=wait(observer,'peer_stroke_live_end',x=>x.strokeId===strokeId&&!x.cancelled);a.emit('stroke_live_end',{strokeId});await up;
const cancelled=wait(observer,'peer_stroke_live_end',x=>x.strokeId===strokeId&&x.cancelled===true);a.disconnect();await cancelled;
assert(b.connected);await new Promise(r=>setTimeout(r,100));assert.equal(departures.filter(x=>x.userId===packet.userId).length,0);
const response=await owner.get(f.backend+'/api/rooms/'+f.room+'/operations?beforeSeq=2147483647&limit=500');assert(response.ok());const ops=await response.json();assert.equal(ops.length,0);
result.pass=true;result.operationCount=0;result.targetedCancellation=true;result.siblingConnected=true;result.authorPeerLeft=0;
}finally{for(const s of sockets)s.disconnect();if(owner){const r=await owner.delete(f.backend+'/api/rooms/'+f.room);result.ownerDelete=r.status();assert(r.ok()||r.status()===404);for(const n of ['host-state.json','host-state-tools.json'])if(fs.existsSync(dir+'/'+n))fs.unlinkSync(dir+'/'+n);await owner.dispose()}await guest?.dispose();fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n')}
console.log(JSON.stringify(result));})().catch(e=>{console.error(e.message);process.exitCode=1});
