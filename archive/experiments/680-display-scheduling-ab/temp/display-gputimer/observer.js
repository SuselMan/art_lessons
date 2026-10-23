window.__installDrawGpuTimer=function(){
 const e=__engine,g=e.gl,ext=g.getExtension('EXT_disjoint_timer_query');
 if(!ext){window.__drawGpuTimer={supported:false,async finish(){return{supported:false}},restore(){}};return}
 const saved={use:g.useProgram,draw:g.drawArrays,compose:e._composePaperToScreen};let program=null,inside=0,active=false,seen=0;
 const queries=[],errors=[];
 g.useProgram=function(p){program=p;return saved.use.call(this,p)};
 e._composePaperToScreen=function(...a){inside++;try{return saved.compose.apply(this,a)}finally{inside--}};
 g.drawArrays=function(...args){
 const kind=program===e._paperComposeProg?'paperFBO':program===e._screenBlitProg?'finalDefaultBlit':null;
 const eligible=inside&&kind&&e._strokeLayerId&&!active&&queries.length<120;
 if(!eligible||++seen%3!==0)return saved.draw.apply(this,args);
 const q=ext.createQueryEXT();if(!q){errors.push('query allocation failed');return saved.draw.apply(this,args)}
 const record={q,kind,phase:window.__displayObserverPhase||'active',at:performance.now(),issued:false};queries.push(record);active=true;try{ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,q);try{return saved.draw.apply(this,args)}finally{ext.endQueryEXT(ext.TIME_ELAPSED_EXT);record.issued=true}}finally{active=false}
 };
 const restore=()=>{g.useProgram=saved.use;g.drawArrays=saved.draw;e._composePaperToScreen=saved.compose};
 window.__drawGpuTimer={supported:true,restore,async finish(){restore();const result={supported:true,samples:[],errors,disjoint:false,unavailable:0,limit:120,limitation:'Asynchronous elapsed GPU draw queries only, excludes CPU/compositor/presentation/photon latency. Queries perturb command stream. No new perframe sync/readback/error/parameter polling.'};try{if(g.isContextLost()){result.lost=true;return result}const deadline=performance.now()+5000;while(performance.now()<deadline&&!queries.filter(x=>x.issued).every(x=>ext.getQueryObjectEXT(x.q,ext.QUERY_RESULT_AVAILABLE_EXT))){await new Promise(r=>setTimeout(r,50));if(g.isContextLost()){result.lost=true;return result}}result.disjoint=!!g.getParameter(ext.GPU_DISJOINT_EXT);for(const x of queries){if(!x.issued){result.unavailable++;continue}if(!ext.getQueryObjectEXT(x.q,ext.QUERY_RESULT_AVAILABLE_EXT)){result.unavailable++;continue}if(!result.disjoint)result.samples.push({kind:x.kind,phase:x.phase,at:x.at,ms:ext.getQueryObjectEXT(x.q,ext.QUERY_RESULT_EXT)/1e6})}return result}finally{if(!g.isContextLost())for(const x of queries)ext.deleteQueryEXT(x.q);queries.length=0}}};
}
