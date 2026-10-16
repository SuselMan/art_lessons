// Real QA backend/PG check of index selection, not a raster/GPU assertion.
// Creates and deletes only its own marked room through the owner API.
const {request}=require('@playwright/test'),{io}=require('socket.io-client');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const out=process.env.QA_OUTPUT;if(!out)throw Error('QA_OUTPUT required');fs.mkdirSync(out,{recursive:true});
const backend=process.env.QA_BACKEND_URL||'http://localhost:4558',room='qa-undo-v1-'+crypto.randomUUID();
const report={room,kind:'snapshot index selection only; no GPU',started:new Date().toISOString(),source:process.env.QA_SOURCE||'unspecified'};
fs.writeFileSync(path.join(out,'resources.json'),JSON.stringify({owner:'codex /root',pid:process.pid,command:'759-snapshot-api.cjs',room,ttl:new Date(Date.now()+3600000).toISOString(),servicesStarted:false}));
(async()=>{
 const api=await request.newContext({baseURL:backend});let socket,created=false;
 try{
  const me=await(await api.get('/api/me')).json(),state=await api.storageState();
  const cookie=state.cookies.map(c=>c.name+'='+c.value).join('; ');
  socket=io(backend,{transports:['websocket'],extraHeaders:{Cookie:cookie},reconnection:false});
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject)});
  const emit=(event,payload)=>new Promise((resolve,reject)=>socket.timeout(15000).emit(event,payload,(err,ack)=>err?reject(err):ack?.ok?resolve(ack):reject(Error(event+' refused '+JSON.stringify(ack)))));
  await emit('create_room',{room:{id:room,name:'Disposable chunk snapshot QA',paper:'fine',paperColor:'#fdfdfc',infinite:false,canvasWidth:64,canvasHeight:64,hasPassword:false,accessMode:'anyone_with_link',ownerId:me.userId,createdAt:new Date().toISOString()},name:'Chunk QA owner',accessMode:'anyone_with_link',lastKnownSeq:0});created=true;
  const ops=[],layerId='qa-chunks',send=async draft=>{const op={id:crypto.randomUUID(),timestamp:Date.now(),userId:me.userId,...draft};const ack=await emit('operation',op);const recorded={...op,seq:ack.seq};ops.push(recorded);return recorded;};
  await send({type:'layer_add',layerId,name:'chunks'});
  const dab={x:16,y:16,size:12,pressure:.7,angle:0,aspectRatio:1,tiltX:0,tiltY:0,opacity:1,t:0};
  const stroke={type:'stroke',layerId,tool:'watercolor',preset:'normal:80:65:PB29:round:wc@m70-r2-v1',color:[.15,.35,.8],dabs:[dab],strokeId:'same-gesture',washId:'m70:'+layerId};
  const first=await send(stroke),dry=await send({type:'paper_dry',layerId});
  const layerState={items:Object.fromEntries(['background','layer-1',layerId].map(id=>[id,{id,kind:'layer',name:id,opacity:1,visible:true}])),rootOrder:[layerId,'layer-1','background'],activeId:layerId,selectedIds:[]};
  const marker=Buffer.alloc(24);marker.writeUInt32LE(1,0);marker.writeUInt32LE(1,12);marker.writeUInt32LE(1,16);marker.set([10,20,30,255],20);
  const blob=zlib.gzipSync(marker).toString('base64');
  const upload=await api.post('/api/rooms/'+room+'/snapshots',{data:{seq:dry.seq,layerState,layers:{[layerId]:blob,'layer-1':zlib.gzipSync(Buffer.alloc(4)).toString('base64')}}});
  assert.equal(upload.status(),200);report.upload=await upload.json();
  const before=await api.get('/api/rooms/'+room+'/snapshots/index');assert.equal(before.status(),200);report.before=await before.json();assert.ok(report.before.layers.some(l=>l.layerId===layerId));
  const last=await send({...stroke,dabs:[{...dab,x:32,t:500}]}),undo=await send({type:'operation_undo',targetOpId:last.id});
  const after=await api.get('/api/rooms/'+room+'/snapshots/index');assert.equal(after.status(),200);report.after=await after.json();report.operations=ops;report.first=first.id;report.last=last.id;report.undo=undo.id;
  assert.ok(!report.after.layers.some(l=>l.layerId===layerId),'Snapshot containing first chunk must not survive whole-gesture undo of the later chunk');
  assert.ok(report.after.layers.some(l=>l.layerId==='layer-1'),'Unrelated snapshot should survive');
  report.ok=true;
 }catch(error){report.error=error.stack;process.exitCode=1}
 finally{
  socket?.disconnect();if(created){const r=await api.delete('/api/rooms/'+room);report.deleted=r.ok()||r.status()===404;report.deleteStatus=r.status();if(!report.deleted)process.exitCode=1}
  await api.dispose();report.finished=new Date().toISOString();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:report.ok||false,deleted:report.deleted,error:report.error?.split('\n')[0]}));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
