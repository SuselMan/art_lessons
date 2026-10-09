/** Own contexts only. Disconnect transport once; never Browser.close(). */
export class OwnedCdpCohort {
 constructor(connect){this.connect=connect;this.browser=null;this.active=null;this.contexts=new Set();this.closed=false}
 async open(options){if(this.closed||this.active)throw Error('Cohort closed or arm still active');this.browser??=await this.connect();const context=await this.browser.newContext(options);this.contexts.add(context);this.active=context;return context}
 isActive(context){return !this.closed&&this.active===context}
 async closeArm(context){if(this.active===context)this.active=null;this.contexts.delete(context);await context.close()}
 async close(){if(this.closed)return;this.closed=true;this.active=null;for(const context of this.contexts)await context.close().catch(()=>{});this.contexts.clear();this.browser?._connection.close()}
}
