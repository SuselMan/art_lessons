/** CDP bootstrap identity only. A ready DOM in an old context is insufficient. */
export class NavigationContextGate{
 constructor(url){this.url=url;this.origin=new URL(url).origin;this.contexts=new Map();this.navigation=null;this.frame=null;}
 navigated(result){if(result.errorText||!result.frameId||!result.loaderId)throw Error('Explicit document navigation required');this.navigation=result;}
 observe(method,params){if(method==='Page.frameNavigated')this.frame=params.frame;
  if(method==='Runtime.executionContextCreated')this.contexts.set(params.context.id,params.context);
  if(method==='Runtime.executionContextDestroyed')this.contexts.delete(params.executionContextId);
  if(method==='Runtime.executionContextsCleared')this.contexts.clear();
 }
 get contextId(){const n=this.navigation,f=this.frame;if(!n||!f||f.id!==n.frameId||f.loaderId!==n.loaderId||f.url!==this.url)return null;
  const candidates=[...this.contexts.values()].filter(c=>c.origin===this.origin&&c.auxData?.isDefault===true&&c.auxData.frameId===n.frameId);return candidates.length===1?candidates[0].id:null;
 }
}
