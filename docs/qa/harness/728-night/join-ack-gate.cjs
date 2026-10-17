// QA transport hook: hold one REAL join ACK, never alter its verdict or room_state.
async function installJoinAckGate(context){await context.addInitScript(()=>{
 const Native=WebSocket,onmessage=Object.getOwnPropertyDescriptor(Native.prototype,'onmessage');
 const gate=window.__qaJoinAckGate={enabled:false,target:null,prefix:null,held:0,requests:[],acks:[],pending:[],connections:0,release(){this.enabled=false;const tasks=this.pending.splice(0);for(const fn of tasks)fn();return tasks.length}};
 window.WebSocket=new Proxy(Native,{construct(Target,args,newTarget){
  const socket=Reflect.construct(Target,args,newTarget),send=socket.send,add=socket.addEventListener,connection=++gate.connections;let listener=null;const requests=[];
  socket.send=function(packet){if(typeof packet==='string'){const match=/^42([0-9]+)(\[.*)$/.exec(packet);if(match)try{const[event,data]=JSON.parse(match[2]);if(event==='join_room'){const request={connection,ack:match[1],room:data.roomId,at:performance.now()};requests.push(request);gate.requests.push(request);if(gate.enabled&&!gate.prefix&&data.roomId===gate.target){gate.prefix='43'+match[1]+'[';gate.targetConnection=connection}}}catch{}}return send.call(this,packet)};
  const dispatch=(next,event)=>{if(typeof event.data==='string'){const match=/^43([0-9]+)(\[.*)$/.exec(event.data);if(match)try{const verdict=JSON.parse(match[2])[0],request=requests.findLast(x=>x.ack===match[1]);gate.acks.push({connection,ack:match[1],room:request?.room,ok:verdict?.ok,error:verdict?.error,keys:verdict&&typeof verdict==='object'?Object.keys(verdict):[],at:performance.now()})}catch{}if(gate.enabled&&gate.targetConnection===connection&&gate.prefix&&event.data.startsWith(gate.prefix)){gate.held++;gate.heldAt=performance.now();gate.pending.push(()=>next.call(socket,event));return}}return next.call(socket,event)};
  Object.defineProperty(socket,'onmessage',{configurable:true,get(){return listener},set(next){listener=next;onmessage.set.call(socket,next?event=>dispatch(next,event):null)}});
  socket.addEventListener=function(type,next,...rest){return add.call(this,type,type==='message'&&typeof next==='function'?event=>dispatch(next,event):next,...rest)};
  return socket;
 }});
})}
module.exports={installJoinAckGate};
