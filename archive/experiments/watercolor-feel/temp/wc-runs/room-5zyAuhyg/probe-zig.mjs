import {chromium} from 'playwright';
import {writeFileSync,mkdirSync} from 'node:fs';
const out=process.argv[2]||'temp/wc-runs/room-5zyAuhyg/probe-before';mkdirSync(out,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:false,args:['--ignore-certificate-errors']});
try{
 const p=await b.newPage({ignoreHTTPSErrors:true,viewport:{width:1600,height:1000}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('https://localhost:5277/create');await p.waitForTimeout(3000);
 await p.locator('input[type="text"]').first().fill('wc-probe');await p.getByRole('button',{name:/Fine/}).first().click();
 const format=p.getByText('A4',{exact:true}).first();await format.click();await format.click();
 await p.getByRole('button',{name:/Create project|Создать проект/}).click();await p.waitForURL(/\/room\/[^/]+$/);
 await p.waitForFunction(()=>!!window.__engine,{timeout:60000});await p.waitForTimeout(3000);const zoom=p.getByRole('button',{name:/^\d+%$/});if(await zoom.textContent()!=='100%')await zoom.click();
 const result=await p.evaluate(async()=>{
  const e=window.__engine;const raf=()=>new Promise(r=>requestAnimationFrame(r));const probes=[];
  const stroke=async(points,preset,size,probe=false)=>{
   e.setTool('watercolor');e.setPencil(preset);e.setColor([.165,.231,.592]);e.setSize(size);
   let clock=performance.now(),prev=points[0];
   const data=(v,speed)=>({x:v[0],y:v[1],pressure:v[2]??.8,tiltX:0,tiltY:0,speed,pointerType:'pen',timeStamp:clock});
   e._onStart(data(prev,0));
   for(let i=1;i<points.length;i++){
    clock+=4;const v=points[i];e._onMove(data(v,Math.hypot(v[0]-prev[0],v[1]-prev[1])/4));prev=v;
    if(i%6===0){await raf();await raf();
     if(probe&&e._screenCache){
      const a=e._screenCache.readPixels();e._wetTexAt=performance.now();e._composePaperToScreen(null);const z=e._screenCache.readPixels();let n=0,max=0;
      for(let j=0;j<a.length;j+=4){let d=Math.max(Math.abs(a[j]-z[j]),Math.abs(a[j+1]-z[j+1]),Math.abs(a[j+2]-z[j+2]));if(d>2)n++;max=Math.max(max,d)}probes.push({i,n,max});
     }
    }
   }
   clock+=4;e._onEnd(data(prev,.8));await raf();await raf();return e.getOperations().filter(o=>o.type==='stroke').at(-1);
  };
  const line=(x0,y0,x1,y1,n=80)=>Array.from({length:n+1},(_,i)=>[x0+(x1-x0)*i/n,y0+(y1-y0)*i/n]);
  const zig=(x,y)=>Array.from({length:10},(_,leg)=>line(x+leg*22,y+(leg%2)*220,x+(leg+1)*22,y+((leg+1)%2)*220,35)).flat();
  const water=await stroke(zig(400,300),'normal:100:0:PB29:round',80,true);
  const round=await stroke(zig(800,300),'normal:100:100:PB29:round',80,true);
  return {probes,ops:e.getOperations(),camera:e._camera.pose,lost:e.gl.isContextLost(),ids:[water?.id,round?.id]};
 });
 await p.waitForTimeout(2000);await p.screenshot({path:out+'/wet.png'});
 await p.evaluate(()=>window.__engine.watercolorDryAll());await p.waitForTimeout(10000);await p.screenshot({path:out+'/dry.png'});
 writeFileSync(out+'/result.json',JSON.stringify({...result,errors},null,2));console.log(JSON.stringify({probes:result.probes,errors,lost:result.lost}));
}finally{await b.close()}
