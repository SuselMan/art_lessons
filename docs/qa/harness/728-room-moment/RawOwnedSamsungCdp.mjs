import{createRequire}from'node:module';import{execFile}from'node:child_process';import{promisify}from'node:util';
const require=createRequire(new URL('../../../../package.json',import.meta.url)),WebSocket=require('ws');
/** Existing cached CDP forward; only newly-created target may be closed. */
export class RawOwnedSamsungCdp{
 constructor(base){const u=new URL(base);if(!['127.0.0.1','localhost'].includes(u.hostname)||u.port!=='9454')throw Error('Cached Samsung forward9454 required');this.base=base;this.next=0;this.pending=new Map();this.events=[]}
 async open(url){
  const before=new Set((await(await fetch(this.base+'/json/list')).json()).map(x=>x.id));
  const launch=new URL(url);launch.searchParams.set('qaOwnedContinuous',Date.now()+'-'+Math.random().toString(16).slice(2));await promisify(execFile)('/home/suselman/.local/bin/home-devices',['adb','shell','am','start','-a','android.intent.action.VIEW','-d',launch.href,'-p','com.android.chrome'],{timeout:20000});const deadline=Date.now()+10000;let target;while(Date.now()<deadline){const tabs=await(await fetch(this.base+'/json/list')).json(),own=tabs.filter(x=>!before.has(x.id)&&x.url===launch.href);if(own.length>1)throw Error('Ambiguous own target');if(own.length===1){target=own[0];break}await new Promise(r=>setTimeout(r,200))}if(!target)throw Error('No newly created own target; preexisting tabs untouched');this.target=target;
  this.ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{this.ws.once('open',r);this.ws.once('error',j)});
  this.ws.on('message',raw=>{const x=JSON.parse(raw),p=this.pending.get(x.id);if(p){clearTimeout(p.timer);this.pending.delete(x.id);x.error?p.reject(Error(x.error.message)):p.resolve(x.result)}else{if(this.events.length<256)this.events.push(x);this.onEvent?.(x)}});
  await this.send('Runtime.enable');await this.send('Network.enable');await this.send('Page.enable');await this.send('Page.navigate',{url});await this.send('Page.bringToFront');return this;
 }
 send(method,params={},timeout=20000){return new Promise((resolve,reject)=>{const id=++this.next,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Bounded CDP '+method))},timeout);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params}))})}
 async evaluate(expression,timeout=90000){const r=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},timeout);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value}
 async close(){if(this.target){const target=this.target;this.target=null;await fetch(this.base+'/json/close/'+target.id).catch(()=>{})}this.ws?.close();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Own target closed'))}this.pending.clear()}
}
