(async()=>{
const {PencilEngine}=await import('/src/engine/index.ts');
const canvas=document.createElement('canvas'),status=document.createElement('p');canvas.width=800;canvas.height=600;document.body.append(canvas,status);let e,penUp=0;
canvas.getContext('webgl',{preserveDrawingBuffer:true,premultipliedAlpha:false,antialias:false});
const sleep=t=>new Promise(r=>setTimeout(r,t));
async function fresh(){if(e){e.destroy();const gl=canvas.getContext('webgl');for(let i=0;i<gl.getParameter(gl.MAX_VERTEX_ATTRIBS);i++)gl.disableVertexAttribArray(i)}e=new PencilEngine(canvas,{pageWidth:800,pageHeight:600,paper:'medium',userId:'morph-live-review'});await e.paperReady();e.initLayer('review');e.setActiveLayer('review');e.setCompositeOrder([{id:'review',opacity:1}]);e.setViewport(400,300,1,0);e.setTool('watercolor');e.setSize(60);e.setColor([.22,0,.6]);window.e=e;return e}
async function idle(reveals=false){const t=performance.now();while(e._settle||e._opQueue.length||e._rebuildJobs.size||e._pendingRebuilds.size||(reveals&&e._washReveals.size)){if(e.gl.isContextLost())throw Error('WebGL lost');if(performance.now()-t>45000)throw Error('Idle timeout');await sleep(16)}}
function pointer(x,y,t,pressure=.75){return {x,y,pressure,tiltX:0,tiltY:0,speed:.4,pointerType:'pen',timeStamp:t}}
async function draw(preset,x0,y0,x1,y1){e.setPencil(preset);const t=performance.now();e._onStart(pointer(x0,y0,t));for(let j=1;j<=35;j++){await sleep(16);e._onMove(pointer(x0+(x1-x0)*j/35,y0+(y1-y0)*j/35,t+j*16))}e._onEnd(pointer(x1,y1,t+36*16,0));penUp=performance.now();status.textContent='Кисть поднята: начинается движение краски.';return penUp}
async function run(kind){await fresh();if(kind==='puddle'){await draw('normal:100:0:PB29:round',160,280,460,280);await idle();await sleep(250);await draw('normal:100:100:PB29:round',310,260,310,300)}else await draw('normal:100:100:PB29:round',160,280,460,280);return {penUp,ops:e.getOperations()}}
await fresh();window.review={fresh,run,idle,sleep,get engine(){return e},get penUp(){return penUp},get ready(){return true}};
})()