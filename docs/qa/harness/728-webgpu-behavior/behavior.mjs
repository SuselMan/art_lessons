/** Self-contained function, transferable through Playwright page.evaluate. */
export async function runBehaviorGate({ steps = [0, 30, 120, 360], dt = 1 / 60 } = {}) {
  const poc = window.__watercolorGpuPoc;
  if (!poc?.readState || !poc?.writeState || !poc?.step || !poc?.whenIdle) throw new Error('Required PoC hooks absent');
  const pause = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Pause');
  const wasRunning = !!pause; if (pause) pause.click();
  await poc.whenIdle(); const saved = await poc.readState(), tick = poc.solverTick;
  const w = 512, h = 384; if (saved.length !== w*h*16) throw new Error('Expected 512x384 Cell[16]');
  const cases = ['isolated-disk','disconnected-puddles','two-color-tracers']; const results = [];
  try {
    for (const name of cases) {
      const state = new Float32Array(saved.length), mask = new Uint8Array(w*h); const cx = name === 'disconnected-puddles' ? 160 : 256, cy=192;
      for (let y=0;y<h;y++) for(let x=0;x<w;x++) {
        const i=y*w+x,k=i*16; const r=Math.hypot(x-cx,y-cy);
        const wet = name === 'disconnected-puddles' ? r<=48 || Math.hypot(x-288,y-cy)<=48 : r<=64;
        if(wet) state[k+8]=1;
        if(name==='two-color-tracers') {
          const a=Math.hypot(x-(cx-10),y-cy)<=6,b=Math.hypot(x-(cx+10),y-cy)<=6;
          if(a||b){mask[i]=1;state[k]=a?1:0;state[k+1]=b?1:0;state[k+3]=1;}
        } else if(r<=6){mask[i]=1;state[k]=1;state[k+3]=1;}
      }
      const measure = data => {
        let mass=0,outside=0,negative=0,nonfinite=0,mix=0,tracers=0,foreign=0;const radial=[];
        for(let i=0;i<w*h;i++) {
          const k=i*16;for(let c=0;c<16;c++){if(!Number.isFinite(data[k+c]))nonfinite++;if(c<9&&data[k+c]<-1e-6)negative++;}
          const m=data[k+3]+data[k+7],a=data[k]+data[k+4],b=data[k+1]+data[k+5];mass+=m;if(!mask[i])outside+=m;
          if(m>0)radial.push([Math.hypot(i%w-cx,Math.floor(i/w)-cy),m]);
          mix+=2*Math.min(a,b);tracers+=a+b;
          if(name==='disconnected-puddles'&&Math.hypot(i%w-288,Math.floor(i/w)-cy)<=48)foreign+=m;
        }
        radial.sort((a,b)=>a[0]-b[0]);let cumulative=0,r50=0,r90=0,half=false;
        for(const [r,m]of radial){cumulative+=m;if(!half&&cumulative>=mass*.5){r50=r;half=true;}if(cumulative>=mass*.9){r90=r;break;}}
        return {mass,negative,nonfinite,massOutsideOriginalMask:outside,shareOutsideOriginalMask:mass?outside/mass:0,r50,r90,mixingIndex:tracers?mix/tracers:0,massInDisconnectedPuddle:foreign};
      };
      poc.writeState(state,0);await poc.whenIdle();const observations=[];let n=0;
      for(const target of steps){if(target<n)throw new Error('steps must ascend');while(n<target){poc.step(dt,false);n++;}await poc.whenIdle();observations.push({step:target,...measure(await poc.readState())});}
      const first=observations[0],last=observations.at(-1);
      const safety=observations.every(o=>o.nonfinite===0&&o.negative===0&&Math.abs(o.mass-first.mass)<=Math.max(1e-4,first.mass*1e-4));
      const disconnected = name!=='disconnected-puddles'||observations.every(o=>o.massInDisconnectedPuddle<=first.mass*1e-6);
      // Predeclared minimum visible movement over six seconds. Not a realism score.
      const dynamic = name==='two-color-tracers' ? last.mixingIndex>=.1 : name==='isolated-disk' ? last.r90-first.r90>=6&&last.shareOutsideOriginalMask>=.1 : true;
      results.push({name,observations,gates:{safety,disconnected,dynamic},pass:safety&&disconnected&&dynamic});
    }
    return {pass:results.every(r=>r.pass),grid:[w,h],dt,steps,results,criteria:{massRelativeTolerance:1e-4,disconnectedShareTolerance:1e-6,minimumIsolatedR90GrowthCells:6,minimumOutsideShare:.1,minimumTracerMixingIndex:.1},formulas:{mass:'sum(mobile.w + settled.w)',r50r90:'mass-weighted radial quantiles around initial source center',mixingIndex:'sum(2 min(red tracer, green tracer))/sum(red+green)',outside:'mass on cells outside original pigment mask'},limitations:['Controlled fields, not brush deposition or UI latency','Six-cell spreading and 10% mixing are declared visibility floors, not photograph-derived realism targets','Readback and render work excluded from physical step semantics; timings are not measured']};
  } finally {poc.writeState(saved,tick);await poc.whenIdle();if(wasRunning){const resume=[...document.querySelectorAll('button')].find(b=>/^(Resume|Play|Run)$/.test(b.textContent.trim()));resume?.click();}}
}
