// CPU-prepared diagnostic only. Replay on a fresh, identically configured engine.
// Capture one gesture; replay exact PointerData and exact delivered native64 values.
// No production patch; never run without an explicit device/GPU grant.
(() => {
 const E=window.__engine;if(!E)throw Error('Engine required');
 const clone=x=>JSON.parse(JSON.stringify(x));
 const names=['_onStart','_onMove','_onEnd'];const originals=Object.fromEntries(names.map(k=>[k,E[k]]));
 const paint=E._paintDabs;let tape={events:[],deliveries:[]},replay=null,cursor=0;
 for(const name of names) E[name]=function(...args){if(!replay)tape.events.push({name,args:clone(args)});return originals[name].apply(this,args);};
 E._paintDabs=function(...a){
  const native=a[2]==='watercolor'&&!!this._strokeLayerId&&a[7]===this._ribbonStrokeScratch;
  if(!native)return paint.apply(this,a);
  if(!replay)tape.deliveries.push(clone({raw:a[1],previous:a[6]??null,wet:a[10],seed:a[11],preset:a[3],strokeId:this._strokeId}));
  else{
   const d=replay.deliveries[cursor++];if(!d)throw Error('Extra native delivery');
   if(a[1].length!==d.raw.length||a[3]!==d.preset)throw Error('Native partition/preset changed');
   // Keep original Dab object identities for standing/PaperWetness and log.
   a[1].forEach((v,i)=>Object.assign(v,d.raw[i]));
   if(Boolean(a[6])!==Boolean(d.previous))throw Error('Previous Dab presence changed');
   if(a[6])Object.assign(a[6],d.previous);
   this._strokeId=d.strokeId;a[10]=d.wet;a[11]=clone(d.seed);
  }
  return paint.apply(this,a);
 };
 window.__wcGestureTape={capture(){return clone(tape);},async replay(input){
  if(replay)throw Error('Replay already active');replay=clone(input);cursor=0;
  try{for(const event of replay.events){originals[event.name].apply(E,clone(event.args));await new Promise(requestAnimationFrame);}
   if(cursor!==replay.deliveries.length)throw Error('Missing native delivery');return{deliveries:cursor,events:replay.events.length};
  }finally{replay=null;}
 },dispose(){for(const name of names)E[name]=originals[name];E._paintDabs=paint;delete window.__wcGestureTape;}};
 return 'gesture-tape-installed';
})()
