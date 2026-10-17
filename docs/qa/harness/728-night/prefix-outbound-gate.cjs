// QA-only real wire delay. Original Socket.IO packets and callbacks remain intact.
async function installPrefixOutboundGate(context){await context.addInitScript(()=>{
 const Native=WebSocket,onmessage=Object.getOwnPropertyDescriptor(Native.prototype,'onmessage'),seen=new Map(),pending=[];
 const gate=window.__qaPrefixOutboundGate={operations:0,attempts:0,retryAttempts:0,owner:null,maxOwnAckSeq:0,held:0,released:0,heldAt:null,releasedAt:null,heldIds:[],foreign:null,done:false,release(foreign){this.done=true;this.foreign=foreign;this.releasedAt=performance.now();const tasks=pending.splice(0);for(const fn of tasks){fn();this.released++}return tasks.length}};
 window.WebSocket=new Proxy(Native,{construct(Target,args,newTarget){
  const socket=Reflect.construct(Target,args,newTarget),send=socket.send,ackIds=new Set();let callback=null;
  socket.send=function(packet){if(typeof packet==='string'){const match=/^42([0-9]+)(\[.*)$/.exec(packet);if(match)try{const[event,op]=JSON.parse(match[2]);if(event==='operation'&&op?.type==='stroke'){gate.owner??=op.userId;gate.attempts++;ackIds.add(match[1]);if(!seen.has(op.id)){seen.set(op.id,++gate.operations)}else gate.retryAttempts++;if(!gate.done&&seen.get(op.id)>10){gate.held++;gate.heldAt??=performance.now();gate.heldIds.push(op.id);pending.push(()=>send.call(socket,packet));return}}}catch{}}return send.call(this,packet)};
  Object.defineProperty(socket,'onmessage',{configurable:true,get(){return callback},set(next){callback=next;onmessage.set.call(socket,next?function(event){if(typeof event.data==='string'){const ack=/^43([0-9]+)(\[.*)$/.exec(event.data);if(ack&&ackIds.has(ack[1]))try{const result=JSON.parse(ack[2])[0];if(result?.ok&&Number.isFinite(result.seq))gate.maxOwnAckSeq=Math.max(gate.maxOwnAckSeq,result.seq)}catch{}}return next.call(socket,event)}:null)}});
  return socket;
 }});
})}
module.exports={installPrefixOutboundGate};
