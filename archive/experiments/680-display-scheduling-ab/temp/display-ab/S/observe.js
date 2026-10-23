window.__observeBlitScissor = function(){
 const e=__engine,g=e.gl;e._display()
 const saved={screen:e._composePaperToScreen,use:g.useProgram,draw:g.drawArrays,enable:g.enable,disable:g.disable,scissor:g.scissor}
 let inside=0,current=e._screenBlitProg,clipped=false,box=null
 const counts={partial:0,full:0,partialArea:0,fullArea:0,last:null}
 g.useProgram=function(p){current=p;return saved.use.call(this,p)}
 g.enable=function(c){if(c===g.SCISSOR_TEST)clipped=true;return saved.enable.call(this,c)}
 g.disable=function(c){if(c===g.SCISSOR_TEST)clipped=false;return saved.disable.call(this,c)}
 g.scissor=function(...a){box=a;return saved.scissor.apply(this,a)}
 g.drawArrays=function(...a){if(inside&&current===e._screenBlitProg){counts[clipped?'partial':'full']++;counts[clipped?'partialArea':'fullArea']+=clipped?box[2]*box[3]:e.canvas.width*e.canvas.height;counts.last={clipped,box:box?[...box]:null,pendown:!!e._strokeLayerId,at:performance.now()}}return saved.draw.apply(this,a)}
 e._composePaperToScreen=function(...a){inside++;try{return saved.screen.apply(this,a)}finally{inside--}}
 window.__scissorObserve={counts,restore(){e._composePaperToScreen=saved.screen;g.useProgram=saved.use;g.drawArrays=saved.draw;g.enable=saved.enable;g.disable=saved.disable;g.scissor=saved.scissor}}
}
