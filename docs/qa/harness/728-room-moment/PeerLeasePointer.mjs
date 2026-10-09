/** Small actual PointerInput stroke driver; no clocks/IDs/seeds override. */
export function installPeerLeasePointer(){
 const e=window.__engine,s=window.__roomStore.getState(),canvas=[...document.querySelectorAll('canvas')].find(c=>c.className.includes('canvas')&&c.width>500);
 if(!canvas||!e||window.__peerLeasePointer)throw Error('Fresh owned pointer required');
 const transform=e._pointer._transform,a=transform(0,0),b=transform(1,0),c=transform(0,1),xx=b.x-a.x,xy=c.x-a.x,yx=b.y-a.y,yy=c.y-a.y,det=xx*yy-xy*yx;
 if(!Number.isFinite(det)||Math.abs(det)<1e-12)throw Error('Pointer transform required');
 const cap=canvas.setPointerCapture,release=canvas.releasePointerCapture,callback=e._onQueuedOperationApplied,append=e.appendOperation,applied=[],received=[];let active=null;
 canvas.setPointerCapture=()=>{};canvas.releasePointerCapture=()=>{};
 const appendWrapped=function(op,source){if(source==='remote')received.push({id:op.id,type:op.type,target:op.targetOpId,seq:op.seq,lease:!!this._wcJoinedTouchLease,active:!!this._strokeLayerId});return append.call(this,op,source)};e.appendOperation=appendWrapped;
 const wrapped=function(op){applied.push({id:op.id,type:op.type,target:op.targetOpId});return callback?.call(this,op)};e._onQueuedOperationApplied=wrapped;
 const event=(x,y,buttons)=>({clientX:(yy*(x-a.x)-xy*(y-a.y))/det,clientY:(-yx*(x-a.x)+xx*(y-a.y))/det,pressure:.8,tiltX:0,tiltY:0,twist:0,width:1,height:1,pointerType:'pen',pointerId:729,isPrimary:true,button:0,buttons,timeStamp:performance.now(),target:canvas,currentTarget:canvas,preventDefault(){},stopPropagation(){},getCoalescedEvents(){return[this]},getPredictedEvents(){return[]}});
 const settings=pigment=>{s.setTool('watercolor');for(const[k,v]of Object.entries({size:24,nib:'round',pressureResponse:'normal',water:1,pigment,color:[.3,.15,.55]}))s.setToolSetting('watercolor',k,v);e.setTool('watercolor');e.setSize(24);e.setColor([.3,.15,.55]);e.setPencil(`normal:100:${pigment*100}:PB29:round`)};
 const marker=(kind,phase)=>console.log('__PEER_QA__'+JSON.stringify({kind,phase,at:performance.now(),active:!!e._strokeId,pending:!!e._settle,lease:!!e._wcJoinedTouchLease}));
 const down=(x,y)=>{if(e._strokeId)throw Error('Foreign active stroke');marker('down','begin');try{e._pointer._handleDown(event(x,y,1))}finally{active=e._strokeId;marker('down','end')}if(!active)throw Error('Pointer DOWN rejected')};
 const move=(x,y)=>{marker('move','begin');try{return e._pointer._handleMove(event(x,y,1))}finally{marker('move','end')}};
 const up=()=>{marker('up','begin');try{if(active&&e._strokeId===active)e._pointer._handleUp(event(340,300,0))}finally{active=null;marker('up','end')}};
 const api={applied,received,settings,down,move,up,stroke(pigment=1){settings(pigment);down(300,300);move(320,300);move(340,300);up()},hold(){this.stroke(0);settings(1);const old=e._settle;if(!old)throw Error('Pending predecessor required');down(320,300);move(330,300);if(e._wcJoinedTouchLease!==old)throw Error('Actual mixed lease admission required');return{pending:true,lease:true,strokeId:active}},restore(){try{up()}finally{canvas.setPointerCapture=cap;canvas.releasePointerCapture=release;if(e.appendOperation===appendWrapped)e.appendOperation=append;if(e._onQueuedOperationApplied===wrapped)e._onQueuedOperationApplied=callback;if(window.__peerLeasePointer===api)delete window.__peerLeasePointer}}};window.__peerLeasePointer=api;
 return{joined:e._wcJoinedTouch,lease:e._wcJoinedTouchSnapshotLease};
}
