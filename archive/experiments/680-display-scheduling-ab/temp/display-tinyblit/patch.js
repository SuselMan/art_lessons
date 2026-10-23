window.__installTinyFinalBlit=function(){
 const e=__engine,g=e.gl,saved={compose:e._composePaperToScreen,use:g.useProgram,draw:g.drawArrays};let inside=0,program=null;
 const state={draws:0,limitation:'STALE SCREEN diagnostic only. First full frame exists; ON dirties1pixel per final blit while retaining FBO/model work.',restore(){e._composePaperToScreen=saved.compose;g.useProgram=saved.use;g.drawArrays=saved.draw}};
 g.useProgram=function(p){program=p;return saved.use.call(this,p)};
 e._composePaperToScreen=function(...a){inside++;try{return saved.compose.apply(this,a)}finally{inside--}};
 g.drawArrays=function(...a){if(inside&&program===e._screenBlitProg){state.draws++;g.enable(g.SCISSOR_TEST);g.scissor(0,0,1,1);try{return saved.draw.apply(this,a)}finally{g.disable(g.SCISSOR_TEST)}}return saved.draw.apply(this,a)};
 window.__tinyFinalBlit=state;
}
