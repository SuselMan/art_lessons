// Creates ONLY a new disposable room via normal public identity + Socket APIs.
// Private auth output is never printed; no pre-existing room is loaded or cleared.
const {request}=require('@playwright/test');
const {io}=require('socket.io-client');
const fs=require('node:fs'),crypto=require('node:crypto');
const dir=process.env.QA_FIXTURE_OUTPUT;const canvasSize=Number(process.env.QA_CANVAS_SIZE||512);if(![512,1024].includes(canvasSize))throw Error('QA_CANVAS_SIZE must be 512 or1024');const width=Number(process.env.QA_CANVAS_WIDTH||canvasSize),height=Number(process.env.QA_CANVAS_HEIGHT||canvasSize);if(![width,height].every(n=>Number.isInteger(n)&&n>=256&&n<=1024))throw Error('QA canvas dimensions must be integers256..1024');
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
  const room={id:roomId,name:'Disposable undo-v1 QA',paper:'fine',paperColor:'#fdfdfc',infinite:false,canvasWidth:width,canvasHeight:height,hasPassword:false,accessMode:'anyone_with_link',ownerId:identity.userId,createdAt:new Date().toISOString()};
  await new Promise((resolve,reject)=>socket.timeout(15000).emit('create_room',{room,name:'Undo v1 QA owner',accessMode:'anyone_with_link',lastKnownSeq:0},(err,ack)=>err?reject(err):ack?.ok?resolve(ack):reject(Error('Create rejected '+JSON.stringify(ack)))));
  fs.writeFileSync(dir+'/host-state.json',JSON.stringify(state),{mode:0o600});
  fs.writeFileSync(dir+'/fixture.json',JSON.stringify({room:roomId,backend,created:new Date().toISOString(),disposable:true},null,2));
  console.log(JSON.stringify({room:roomId,privateFixture:dir}));
 }finally{socket?.disconnect();await api.dispose()}
})().catch(e=>{console.error(e);process.exitCode=1});
