// Creates ONLY a new disposable room via normal public identity + Socket APIs.
// Private auth output is never printed; no pre-existing room is loaded or cleared.
const {request}=require('@playwright/test');
const {io}=require('socket.io-client');
const fs=require('node:fs'),crypto=require('node:crypto');
const dir=process.env.QA_FIXTURE_OUTPUT;
const width=Number(process.env.QA_CANVAS_WIDTH||512),height=Number(process.env.QA_CANVAS_HEIGHT||512),infinite=process.env.QA_INFINITE==='1';
if(!Number.isInteger(width)||!Number.isInteger(height)||width<64||height<64||width>4096||height>4096)throw Error('Explicit QA page dimensions must be integers64..4096');
if(!dir||fs.existsSync(dir))throw Error('QA_FIXTURE_OUTPUT must be a new private directory');
(async()=>{
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const backend=process.env.QA_BACKEND_URL||'http://localhost:4558';
 const api=await request.newContext({baseURL:backend});let socket;
 try{
  const response=await api.get('/api/me');if(!response.ok())throw Error('Identity HTTP '+response.status());const identity=await response.json();
  if(!identity.userId)throw Error('Missing actual identity');
  const state=await api.storageState(),cookie=state.cookies.map(c=>c.name+'='+c.value).join('; ');
  socket=io(backend,{transports:['websocket'],extraHeaders:{Cookie:cookie},reconnection:false});
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject)});
  const roomId='qa-undo-v1-'+crypto.randomUUID();
  const room={id:roomId,name:'Disposable undo-v1 QA',paper:'fine',paperColor:'#fdfdfc',infinite,canvasWidth:width,canvasHeight:height,hasPassword:false,accessMode:'anyone_with_link',ownerId:identity.userId,createdAt:new Date().toISOString()};
  await new Promise((resolve,reject)=>socket.timeout(15000).emit('create_room',{room,name:'Undo v1 QA owner',accessMode:'anyone_with_link',lastKnownSeq:0},(err,ack)=>err?reject(err):ack?.ok?resolve(ack):reject(Error('Create rejected '+JSON.stringify(ack)))));

  const count=Number(process.env.QA_LOAD_STROKES||100),dabsPerStroke=Number(process.env.QA_LOAD_DABS||8),dryEvery=Number(process.env.QA_LOAD_DRY_EVERY||0);
  if(!Number.isInteger(count)||count<1||count>1000||!Number.isInteger(dabsPerStroke)||dabsPerStroke<2||dabsPerStroke>64)throw Error('Load fixture outside bounded stroke/dab limits');
  const operations=[],layerId='qa-load-'+crypto.randomUUID(),baseAt=Date.now();
  const send=async draft=>{const op={...draft,id:crypto.randomUUID(),userId:identity.userId,timestamp:baseAt+operations.length};const ack=await new Promise((resolve,reject)=>socket.timeout(15000).emit('operation',op,(err,ack)=>err?reject(err):ack?.ok?resolve(ack):reject(Error('Operation rejected '+JSON.stringify(ack)))));operations.push({...op,seq:ack.seq});};
  await send({type:'layer_add',layerId,name:'Deterministic loading input'});
  let seed=728745;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296};
  for(let n=0;n<count;n++){const x=24+Math.floor(random()*(width-100)),y=24+Math.floor(random()*(height-80)),strokeId='qa-load-gesture-'+n;const dabs=Array.from({length:dabsPerStroke},(_,j)=>({x:x+j*6,y:y+(j%3)*2,size:12,pressure:.7,angle:0,aspectRatio:1,tiltX:0,tiltY:0,opacity:1,t:j*16}));await send({type:'stroke',layerId,tool:'watercolor',preset:'normal:80:65:PB29:round:wc@m70-r2-v1',color:[.15,.35,.8],dabs,strokeId,washId:'qa-load-wash'});if(dryEvery>0&&(n+1)%dryEvery===0)await send({type:'paper_dry',layerId});}
  await send({type:'annotation_add',annotationId:'qa-load-note',shape:{kind:'text',x:128,y:128,text:'Loading fixture annotation',color:'#e5484d',size:16}});
  const inputHash=crypto.createHash('sha256').update(JSON.stringify(operations)).digest('hex');
  fs.writeFileSync(dir+'/load-input.json',JSON.stringify({seed:728745,count,dabsPerStroke,dryEvery,layerId,inputHash,operations}));
  fs.writeFileSync(dir+'/host-state.json',JSON.stringify(state),{mode:0o600});
  fs.writeFileSync(dir+'/fixture.json',JSON.stringify({room:roomId,backend,geometry:{width,height,infinite},created:new Date().toISOString(),disposable:true},null,2));
  console.log(JSON.stringify({room:roomId,privateFixture:dir}));
 }finally{socket?.disconnect();await api.dispose()}
})().catch(e=>{console.error(e);process.exitCode=1});
