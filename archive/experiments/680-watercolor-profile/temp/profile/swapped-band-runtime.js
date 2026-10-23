(() => {
  const e=__engine,passes=e._ribbonPasses,old=passes.drawRibbonBands,N=11;
  const probe={calls:0,quads:0,modes:{},restored:false};
  passes.drawRibbonBands=function(...args){
    const input=args[2],bands=input.slice();let swapped=0;
    for(let o=0;o+6*N<=input.length;o+=6*N){
      const at=(v,c)=>input[o+v*N+c],equal=(a,b)=>{for(let c=0;c<N;c++)if(at(a,c)!==at(b,c))return false;return true};
      if(!equal(0,3)||!equal(2,4)||at(0,5)!==0||at(5,5)!==0||Math.abs(at(1,5))!==1||at(1,5)!==at(2,5))continue;
      [0,1,5,1,2,5].forEach((source,dest)=>bands.set(input.subarray(o+source*N,o+(source+1)*N),o+dest*N));swapped++;
    }
    probe.calls++;probe.quads+=swapped;probe.modes[args[3]]=(probe.modes[args[3]]||0)+swapped;
    args[2]=bands;return old.apply(this,args);
  };
  window.__swappedBandProbe=probe;
  window.__restoreSwappedBands=()=>{passes.drawRibbonBands=old;probe.restored=true};
  return {installed:true,stride:N};
})()
