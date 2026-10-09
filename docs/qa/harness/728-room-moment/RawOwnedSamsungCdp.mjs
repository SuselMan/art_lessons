import{createRequire}from'node:module';
const require=createRequire(new URL('../../../../package.json',import.meta.url)),WebSocket=require('ws');
/** Existing cached CDP forward; only newly-created target may be closed. */
export class RawOwnedSamsungCdp{
 constructor(base){const u=new URL(base);if(!['127.0.0.1','localhost'].includes(u.hostname)||u.port!=='9454')throw Error('Cached Samsung forward9454 required');this.base=base;this.next=0;this.pending=new Map();this.events=[]}
 async open(url){
  const before=new Set((await(await fetch(this.base+'/json/list')).json()).map(x=>x.id));
  const response=await fetch(this.base+'/json/new?'+encodeURIComponent('about:blank'),{method:'PUT'});if(!response.ok)throw Error('Own target create failed');const target=await response.json();if(before.has(target.id))throw Error('Refuse preexisting target');this.target=target;
  this.ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{this.ws.once('open',r);this.ws.once('error',j)});
  this.ws.on('message',raw=>{const x=JSON.parse(raw),p=this.pending.get(x.id);if(p){clearTimeout(p.timer);this.pending.delete(x.id);x.error?p.reject(Error(x.error.message)):p.resolve(x.result)}else{if(this.events.length<256)this.events.push(x);this.onEvent?.(x)}});
  await this.send('Runtime.enable');await this.send('Network.enable');await this.send('Page.enable');await this.send('Page.navigate',{url});await this.send('Page.bringToFront');return this;
 }
 send(method,params={},timeout=20000){return new Promise((resolve,reject)=>{const id=++this.next,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Bounded CDP '+method))},timeout);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params}))})}
 async evaluate(expression,timeout=90000){const r=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},timeout);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value}
 async close(){if(this.target){const target=this.target;this.target=null;await fetch(this.base+'/json/close/'+target.id).catch(()=>{})}this.ws?.close();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Own target closed'))}this.pending.clear()}
}
