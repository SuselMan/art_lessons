// QA preload only. Delay one operation ACK before Socket.IO sees it; all other
// packets (including pings, live preview and join ACKs) continue normally.
async function installOperationAckGate(context){
 await context.addInitScript(()=>{
  const Native=window.WebSocket,onmessage=Object.getOwnPropertyDescriptor(Native.prototype,'onmessage');
  const gate=window.__qaOperationAckGate={enabled:false,targetLayer:null,operationId:null,ackPrefix:null,held:0,released:0,heldAt:null,releasedAt:null,ackEnvelope:null,pending:[],release(){this.enabled=false;this.releasedAt=performance.now();const tasks=this.pending.splice(0);for(const task of tasks){this.released++;task()}return tasks.length}};
  window.WebSocket=new Proxy(Native,{construct(Target,args,newTarget){
   const socket=Reflect.construct(Target,args,newTarget),send=socket.send;let callback=null;
   socket.send=function(packet){
    if(gate.enabled&&!gate.operationId&&typeof packet==='string'){
     const match=/^42([0-9]+)(\[.*)$/.exec(packet);
     if(match)try{const [name,op]=JSON.parse(match[2]);if(name==='operation'&&op?.layerId===gate.targetLayer&&op.type==='stroke'){gate.operationId=op.id;gate.ackPrefix='43'+match[1]+'['}}catch{}
    }
    return send.call(this,packet);
   };
   Object.defineProperty(socket,'onmessage',{configurable:true,enumerable:true,get(){return callback},set(next){callback=next;onmessage.set.call(socket,next?function(event){if(gate.enabled&&gate.ackPrefix&&typeof event.data==='string'&&event.data.startsWith(gate.ackPrefix)){gate.held++;gate.heldAt=performance.now();try{gate.ackEnvelope=JSON.parse(event.data.slice(gate.ackPrefix.length-1))}catch{}gate.pending.push(()=>next.call(socket,event));return}return next.call(socket,event)}:null)}});
   return socket;
  }});
 });
}
module.exports={installOperationAckGate};
