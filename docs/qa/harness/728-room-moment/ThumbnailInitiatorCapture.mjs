/** CDP metadata only, first thumbnail POST, no headers/body/cookies or added JS stacks. */
export function captureFirstThumbnailInitiator(state,event){
 if(state.first)return false;let u;try{u=new URL(event.request?.url)}catch{return false}
 if(event.request?.method!=='POST'||!/^\/api\/rooms\/[^/]+\/thumbnail$/.test(u.pathname))return false;
 const frames=[];let stack=event.initiator?.stack,depth=0;
 while(stack&&depth++<3&&frames.length<16){for(const frame of stack.callFrames??[]){if(frames.length>=16)break;let script='[non-http-script]';try{const x=new URL(frame.url);if(['http:','https:'].includes(x.protocol))script=x.origin+x.pathname}catch{}frames.push({functionName:String(frame.functionName??'').slice(0,100),script,line:Number.isInteger(frame.lineNumber)?frame.lineNumber:null,column:Number.isInteger(frame.columnNumber)?frame.columnNumber:null})}stack=stack.parent}
 state.first={requestId:String(event.requestId??'').slice(0,100),method:'POST',path:u.pathname,type:event.initiator?.type??null,timestamp:event.timestamp??null,wallTime:event.wallTime??null,frames};return true;
}
