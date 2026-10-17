import {paperBytes} from './fixtures'
const worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'}),pending=new Map<number,{resolve:(r:any)=>void;reject:(e:Error)=>void}>();let id=0,working=false,catalog:any=null,lastResult:any=null
const $=(id:string)=>document.getElementById(id)!,status=$('status'),errors=$('errors'),alg=$('algorithm') as HTMLSelectElement,fixture=$('fixture') as HTMLSelectElement,config=$('config') as HTMLSelectElement,button=$('run') as HTMLButtonElement
worker.onmessage=({data})=>{const p=pending.get(data.requestId);if(p){pending.delete(data.requestId);(()=>{if(data.error)p.reject(Error(data.error));else p.resolve(data)})()}}
worker.onerror=e=>{errors.textContent=e.message;for(const p of pending.values())p.reject(Error(e.message));pending.clear()}
function request(type:string,args:any={}){return new Promise<any>((resolve,reject)=>{const requestId=++id;pending.set(requestId,{resolve,reject});worker.postMessage({requestId,type,...args})})}
function median(a:number[]){const s=[...a].sort((x,y)=>x-y);return s.length%2?s[s.length>>1]:(s[s.length/2-1]+s[s.length/2])/2}
function observe(){let active=true,lastRAF=0,lastTimer=performance.now(),maxRAF=0,maxTimer=0,raf=0,timer=0;const longtasks:number[]=[];let observer:PerformanceObserver|null=null
 try{observer=new PerformanceObserver(list=>{for(const x of list.getEntries())if(active)longtasks.push(x.duration)});observer.observe({type:'longtask'})}catch{}
 const tick=(t:number)=>{if(!active)return;if(lastRAF)maxRAF=Math.max(maxRAF,t-lastRAF);lastRAF=t;raf=requestAnimationFrame(tick)};raf=requestAnimationFrame(tick)
 const pulse=()=>{if(!active)return;const t=performance.now();maxTimer=Math.max(maxTimer,t-lastTimer);lastTimer=t;timer=window.setTimeout(pulse,10)};timer=window.setTimeout(pulse,10)
 return()=>{active=false;cancelAnimationFrame(raf);clearTimeout(timer);observer?.disconnect();return{maxRAF,maxTimer,longtasks,qualification:'Main observation includes fixture setup/worker compute/message transfer; PNG generation excluded'}}
}
function picture(bytes:Uint8Array,size=1024,encoding='premultiplied-rgb'){const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d')!,image=ctx.createImageData(size,size),paper=paperBytes(size)
 for(let i=0;i<size*size;i++){const p=i*4,a=bytes[p+3]/255,bg=250+(paper[i]-128)*.025;for(let c=0;c<3;c++)image.data[p+c]=Math.round(Math.min(255,encoding==='optical-density'?bg*Math.exp(-4*bytes[p+c]/255):bytes[p+c]+bg*(1-a)));image.data[p+3]=255}ctx.putImageData(image,0,0);return canvas
}
async function run(args:any){if(working)throw Error('Another run is active');working=true;button.disabled=true;errors.textContent='';status.textContent='Подготовка входа и расчёт…';const stop=observe()
 try{const data=await request('run',args),ui=stop(),r=data.result,values=r.samples.map((x:any)=>x.totalReadyMs),warm=values.length>1?values.slice(1):values,result={...r,ui,coldMs:values[0],warmMedianMs:median(warm)};lastResult=result
  const canvas=picture(data.output,1024,r.encoding),png=canvas.toDataURL('image/png'),card=document.createElement('article'),heading=document.createElement('h2'),summary=document.createElement('p'),details=document.createElement('details'),label=document.createElement('summary'),pre=document.createElement('pre')
  heading.textContent=(r.encoding==='optical-density'?'Пигмент · ':'RGB · ')+(catalog.algorithms.find((a:any)=>a.id===r.algorithm)?.label??r.algorithm)+' · '+(catalog.fixtures.find((f:any)=>f.id===r.fixture)?.label??r.fixture)
  summary.textContent=`Первый ${result.coldMs.toFixed(1)} мс · следующие ${result.warmMedianMs.toFixed(1)} мс · повторы ${r.repeatExact?'совпали':'РАЗОШЛИСЬ'} · пигмент ×${r.metrics.massRatio?.toFixed(3)??'—'}`;label.textContent='Параметры и измерения';pre.textContent=JSON.stringify(result,null,2);details.append(label,pre);card.append(heading,summary,canvas,details);$('gallery').prepend(card);status.textContent='Готово';return{...result,png}
 }catch(e){stop();errors.textContent=String((e as Error).stack??e);status.textContent='Ошибка';throw e}finally{working=false;button.disabled=false}
}
function configs(){const a=catalog.algorithms.find((a:any)=>a.id===alg.value);config.replaceChildren();(a.configs??[{}]).forEach((c:any,i:number)=>{const o=document.createElement('option');o.value=String(i);o.textContent=JSON.stringify(c);config.append(o)})}
const ready=request('list').then(data=>{catalog=data;for(const a of data.algorithms){const o=document.createElement('option');o.value=a.id;o.textContent=a.label;alg.append(o)}for(const f of data.fixtures){const o=document.createElement('option');o.value=f.id;o.textContent=f.label;fixture.append(o)}fixture.value='wave';configs();status.textContent='Можно запускать сравнение';button.disabled=false;return true})
;(window as any).__algo805={ready,list:async()=>{await ready;return catalog},run:async(args:any)=>{await ready;return run(args)},get latest(){return lastResult},clear(){if(working)throw Error('Busy');$('gallery').replaceChildren()},get busy(){return working}}
alg.onchange=configs;button.onclick=()=>void run({algorithm:alg.value,fixture:fixture.value,config:catalog.algorithms.find((a:any)=>a.id===alg.value).configs[Number(config.value)]??{},repeats:3,encoding:($('encoding') as HTMLSelectElement).value}).catch(()=>{})
window.addEventListener('pagehide',()=>worker.terminate())
