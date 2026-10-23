(async function(input){
 const E=window.__engine,mt=window.__mt,store=window.__roomStore;
 if(!E||!mt||!store||!E._paper.loaded||E.gl.isContextLost())throw Error('Ordinary Room/paper/pageLib precondition');
 const out={scope:'ordinary Room native two colours; distinct from direct shader mobile C fixture',calls:[],strokes:[]};
 const plan=E._settlePlan,passes=plan.ctx.passes(),prepare=plan.prepare,fieldOp=passes.fieldOp;
 const old=plan.diagnosticAdditiveZeroFaces;plan.diagnosticAdditiveZeroFaces=!!input.additive;plan.diagnosticPlateauPhase=true; window.__naturalPartial=out;
 plan.prepare=function(...args){const m=args[12];out.calls.push({kind:'prepare',paints:[...(m?.paints??args[0].paints).keys()],owner:args[13],water:args[5],landedWet:args[6]});return prepare.apply(this,args)};
 passes.fieldOp=function(...args){if(args[3]!==16)return fieldOp.apply(this,args);const opts=args[5],sum=b=>{const raw=b.readPixels();let v=0;for(let i=3;i<raw.length;i+=4)v+=raw[i];return v},mass={P:sum(opts.c),C:sum(args[1]),V:sum(opts.e)};const result=fieldOp.apply(this,args);out.calls.push({kind:'mobileC',additive:opts.additiveZeroFaces,hasP:!!opts.c,hasV:!!opts.e,mass,Pafter:sum(opts.c),outputC:sum(args[0])});return result};
 try{
 store.getState().setTool('watercolor');
 for(const [colour,pts] of [[[.8,.08,.06],[[.36,.48],[.58,.48]]],[[.05,.15,.8],[[.47,.48],[.66,.53]]]]){
 mt.setup({tool:'watercolor',preset:'normal:100:100:PB29:round',size:64,color:colour});
 out.strokes.push(JSON.parse(await mt.stroke({pts,ms:300,perFrame:1})));
 }
 const deadline=performance.now()+120000;
 while(E._settle||E._wcCanonical?.pending||E._wcAsyncOwners?.size||E._opQueue?.length){if(performance.now()>deadline)throw Error('Native canonical deadline');await new Promise(r=>setTimeout(r,50))}
 out.journal=JSON.parse(JSON.stringify(E.getOperations()));out.strokeOps=out.journal.filter(x=>x.type==='stroke');
 if(out.strokeOps.length<2||!out.calls.some(x=>x.kind==='prepare'&&x.paints.length>1)||!out.calls.some(x=>x.kind==='mobileC'&&x.hasP&&x.hasV))throw Error('Natural mixed route not reached');
 if(input.additive&&!out.calls.some(x=>x.kind==='mobileC'&&x.additive))throw Error('Natural ADD route not reached');
 if(!out.calls.some(x=>x.kind==='mobileC'&&x.mass.P>0&&x.mass.C>0&&x.mass.V>0&&x.outputC>0&&x.Pafter===x.mass.P))throw Error('Meaningful immutable P/mobileC/V missing');
 out.entries=JSON.parse(JSON.stringify(E._log.entries));if(out.entries.some(x=>x.pending))throw Error('Native ACK pending');
 out.gl=E.gl.getError();out.lost=E.gl.isContextLost();if(out.gl||out.lost)throw Error('Natural mixed GL');return out;
 }finally{plan.prepare=prepare;passes.fieldOp=fieldOp;plan.diagnosticAdditiveZeroFaces=old}
})
