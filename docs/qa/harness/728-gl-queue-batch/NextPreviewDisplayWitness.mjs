/** One actual engine display callback, AFTER original draw; default OFF. */
export function installNextPreviewDisplayWitness(engine,{enabled=false,clock=performance}={}){
 let armed=null,disposed=false;const rows=[],original=engine._display;
 const wrapper=function(...args){const out=original.apply(this,args);if(armed){const probe=armed;armed=null;rows.push({at:clock.now(),...probe()})}return out};
 if(enabled){if(typeof original!=='function')throw Error('Actual display method required');engine._display=wrapper}
 return{arm(probe){if(enabled&&!disposed){if(armed||rows.length)throw Error('Only one next-display witness');armed=probe}},snapshot:()=>rows,dispose(){if(disposed)return;disposed=true;armed=null;if(enabled&&engine._display===wrapper)engine._display=original}};
}
