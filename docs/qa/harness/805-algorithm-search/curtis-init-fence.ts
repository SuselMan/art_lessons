/** WebGL2 actual input completion. Poll waits belong to init/total, never compute. */
export async function waitCurtisInput(gl:WebGL2RenderingContext){
 const start=performance.now(),sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);if(!sync)throw Error('Input fence allocation failed')
 let polls=0,status:number=gl.TIMEOUT_EXPIRED
 try{gl.flush();while(true){status=gl.clientWaitSync(sync,0,0);polls++;if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED)break;if(status===gl.WAIT_FAILED)throw Error('Input clientWaitSync failed');if(status!==gl.TIMEOUT_EXPIRED)throw Error('Unexpected input fence status '+status);if(performance.now()-start>15000)throw Error('Input fence15s timeout');await new Promise(r=>setTimeout(r,1))}return{api:'WebGL2 fenceSync/clientWaitSync',terminalStatus:status===gl.ALREADY_SIGNALED?'ALREADY_SIGNALED':'CONDITION_SATISFIED',glStatus:status,polls,timeoutNs:0,requestedPollDelayMs:1,flushed:true,waitMs:performance.now()-start}}finally{gl.deleteSync(sync)}
}
