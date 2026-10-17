import type {Settings} from './runtime'
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T
const mode=el<HTMLSelectElement>('mode'),sheet=el('sheet'),status=el('status'),error=el('error'),latency=el('latency'),inputStatus=el('inputStatus'),processedStatus=el('processedStatus')
const params=new URLSearchParams(location.search);if(params.get('mode')==='main')mode.value='main'
let worker:Worker|null=null,runtime:any=null,canvas:HTMLCanvasElement,generation=0,ready=false,sequence=0,gestureId=0,pressed:number|null=null,lastResult:any=null,lastState:any=null,bootstrap:any=null,clicks=0,pngURL=''
const results:any[]=[],clickHistory:any[]=[],acceptedEvents:any[]=[],processedEvents:any[]=[]
let heartbeat={count:0,maxGapMs:0,over50:0,last:0},input={down:0,move:0,up:0,lastLagMs:0,maxLagMs:0,lastProcessed:0},failure=''
const settings=():Settings=>({size:Number(el<HTMLInputElement>('size').value),water:Number(el<HTMLInputElement>('water').value),pigment:Number(el<HTMLInputElement>('pigment').value),paint:el<HTMLSelectElement>('paint').value,color:el<HTMLInputElement>('color').value})
const epoch=()=>performance.timeOrigin+performance.now()
function snapshot(){return{mode:mode.value,generation,ready,error:failure,pressed:pressed!==null,gestureId,settings:settings(),bootstrap,state:lastState,latest:lastResult,results:[...results],clickHistory:[...clickHistory],acceptedEvents:[...acceptedEvents],processedEvents:[...processedEvents],heartbeat:{...heartbeat},input:{...input},clicks,visibility:document.visibilityState}}
;(window as any).__workerMiniQA=Object.freeze({snapshot,get state(){return snapshot()}})
function receive(row:any,ownGeneration:number){if(ownGeneration!==generation)return
 if(row.type==='error'){failure=row.message;error.textContent=failure;status.textContent='Ошибка';ready=false}
 else if(row.type==='ready'){bootstrap=row;ready=true;status.textContent='Можно рисовать';send({type:'settings',settings:settings()})}
 else if(row.type==='status')status.textContent=row.message
 else if(row.type==='state'){lastState=row;if(row.asyncError){failure=row.asyncError;error.textContent=failure;ready=false}}
 else if(row.type==='processed'){processedEvents.push(row);if(processedEvents.length>256)processedEvents.shift();const lag=row.processedEpoch-row.inputEpoch;input.lastLagMs=lag;input.maxLagMs=Math.max(input.maxLagMs,lag);input.lastProcessed=row.sequence;processedStatus.textContent=`Обработан ${row.eventType}: ${lag.toFixed(1)} мс · максимум ${input.maxLagMs.toFixed(1)} мс`}
 else if(row.type==='goal'){lastResult={...row,receivedEpoch:epoch(),upToGoalMs:row.goalEpoch-row.gesture.captureUpEpoch,upToReceivedMs:epoch()-row.gesture.captureUpEpoch,dequeueLagMs:row.gesture.dequeuedUpEpoch-row.gesture.captureUpEpoch};results.push(lastResult);if(results.length>20)results.shift();if(row.gesture.id===gestureId)latency.textContent=`Цель (JS): ${lastResult.upToGoalMs.toFixed(0)} мс`;if(row.glError){failure='WebGL error '+row.glError;error.textContent=failure}}
 else if(row.type==='png'){if(pngURL)URL.revokeObjectURL(pngURL);pngURL=URL.createObjectURL(row.blob);const link=el<HTMLAnchorElement>('download');link.href=pngURL;link.style.display='inline';link.click()}
 renderDiagnostics()
}
let diagnosticsAt=-Infinity
const diagnostics=el('diagnostics'),diagnosticsPanel=diagnostics.closest('details')!
function renderDiagnostics(force=false){
 if(!diagnosticsPanel.open)return
 const now=performance.now();if(!force&&now-diagnosticsAt<250)return
 diagnosticsAt=now;diagnostics.textContent=JSON.stringify(snapshot(),null,2)
}
diagnosticsPanel.addEventListener('toggle',()=>renderDiagnostics(true))
function send(message:any){if(worker)worker.postMessage(message);else runtime?.handle(message)}
async function start(){const own=++generation;ready=false;pressed=null;failure='';error.textContent='';status.textContent='Загрузка бумаги и WebGL…';lastResult=null;lastState=null;latency.textContent='Цель (JS): —';bootstrap=null;results.length=0;clickHistory.length=0;acceptedEvents.length=0;processedEvents.length=0;gestureId=0;sequence=0;input={down:0,move:0,up:0,lastLagMs:0,maxLagMs:0,lastProcessed:0}
 if(worker){worker.postMessage({type:'destroy'});worker.terminate();worker=null}runtime?.destroy();runtime=null;sheet.replaceChildren();canvas=document.createElement('canvas');canvas.width=canvas.height=1024;canvas.id='paper';canvas.setAttribute('aria-label','Лист1024пикселя');sheet.append(canvas)
 const hardware={maxTouchPoints:navigator.maxTouchPoints??0,deviceMemory:(navigator as any).deviceMemory??0}
 for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])canvas.addEventListener(type,event=>pointer(event as PointerEvent),{passive:false})
 try{if(mode.value==='worker'){if(!canvas.transferControlToOffscreen)throw Error('OffscreenCanvas не поддерживается');worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>receive(data,own);worker.onerror=event=>receive({type:'error',message:event.message},own);const offscreen=canvas.transferControlToOffscreen();worker.postMessage({type:'init',canvas:offscreen,settings:settings(),hardware},[offscreen])}
 else{const {createMiniRuntime}=await import('./runtime');const created=await createMiniRuntime(canvas,settings(),hardware,row=>receive(row,own));if(own!==generation){created.destroy();return}runtime=created;send({type:'settings',settings:settings()})}}catch(err){receive({type:'error',message:String((err as Error).stack??err)},own)}
 const url=new URL(location.href);url.searchParams.set('mode',mode.value);history.replaceState(null,'',url)
}
function pointer(event:PointerEvent){if(!ready)return;if(event.type==='pointerdown'){if(pressed!==null)return;pressed=event.pointerId;gestureId++;if(gestureId===1){heartbeat={count:0,maxGapMs:0,over50:0,last:0};input.maxLagMs=0}input.down++;canvas.setPointerCapture(event.pointerId)}else if(event.pointerId!==pressed)return
 if(event.type==='pointermove')input.move++;if(event.type==='pointerup'||event.type==='pointercancel')input.up++
 event.preventDefault();const r=canvas.getBoundingClientRect(),convert=(e:PointerEvent)=>({type:e.type,clientX:(e.clientX-r.left)*1024/r.width,clientY:(e.clientY-r.top)*1024/r.height,pointerId:e.pointerId,pointerType:e.pointerType,button:e.button,buttons:e.buttons,pressure:e.pressure,tiltX:e.tiltX,tiltY:e.tiltY,isPrimary:e.isPrimary,isTrusted:e.isTrusted,epochTime:performance.timeOrigin+e.timeStamp})
 const sentEpoch=epoch(),message={type:'pointer',sequence:++sequence,sentEpoch,gestureId,captureUpEpoch:event.type==='pointerup'?sentEpoch:undefined,event:{...convert(event),coalesced:event.type==='pointermove'?(event.getCoalescedEvents?.()??[]).map(convert):[]}}
 acceptedEvents.push({sequence:message.sequence,type:event.type,gestureId,sentEpoch,eventEpoch:performance.timeOrigin+event.timeStamp});if(acceptedEvents.length>256)acceptedEvents.shift();inputStatus.textContent=`UI принял ${event.type} · событие ${sequence}`;if(event.type==='pointerup')latency.textContent='Цель (JS): расчёт…';send(message);if(event.type==='pointerup'||event.type==='pointercancel'){pressed=null;try{canvas.releasePointerCapture(event.pointerId)}catch{}}
}
function tick(t:number){if(heartbeat.last){const gap=t-heartbeat.last;heartbeat.maxGapMs=Math.max(heartbeat.maxGapMs,gap);if(gap>50)heartbeat.over50++}heartbeat.last=t;heartbeat.count++;el('pulse').style.transform=`translateX(${(Math.sin(t/180)+1)*18}px)`;el('heartbeat').textContent=`UI RAF: ${heartbeat.maxGapMs.toFixed(1)} мс макс.`;requestAnimationFrame(tick)}requestAnimationFrame(tick)
el('ping').onclick=()=>{clicks++;clickHistory.push({atEpoch:epoch(),gestureId,lastGoalId:lastResult?.gesture?.id??null});if(clickHistory.length>20)clickHistory.shift();el('clicks').textContent=String(clicks)};mode.onchange=()=>void start();el('clear').onclick=()=>void start();el('dry').onclick=()=>send({type:'dry'});el('export').onclick=()=>send({type:'export'})
for(const id of ['size','water','pigment','paint','color'])el(id).addEventListener('input',()=>{if(['size','water','pigment'].includes(id))el<HTMLOutputElement>(id+'Value').value=el<HTMLInputElement>(id).value;send({type:'settings',settings:settings()})})
window.addEventListener('pagehide',()=>{worker?.postMessage({type:'destroy'});worker?.terminate();runtime?.destroy();if(pngURL)URL.revokeObjectURL(pngURL)})
void start()
