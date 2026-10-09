/** Read-only aligned field diagnostic, units explicit; never chooses a new model parameter. */
export function carryPressureAttribution(row){
 const f=row.fields,old=f.oldP.data,pressure=f.pressure.data,path=f.path.data,water=f.water.data,band=(row.options.budgetPx-1.5)/row.options.costMax;
 let minPressure=Infinity,maxPressure=-Infinity,footprint=0,allowed=0,waterSupported=0,pathFaces=0,coverageBZero=0,coverageBPositive=0,coverageOutsideCrop=0;
 for(let i=0;i<128*128;i++){const cost=pressure[i*4]/255;minPressure=Math.min(minPressure,cost);maxPressure=Math.max(maxPressure,cost);allowed+=cost<=band;waterSupported+=water[i*4+3]>0;for(let k=0;k<4;k++)pathFaces+=path[i*4+k]>=128;if(old[i*4+3]*2>.003){footprint++;if(f.sourceCoverage){const crop=row.coverageCrop,x=(i%128)*8+4-crop.x,y=Math.floor(i/128)*8+4-crop.yGl;if(x>=0&&y>=0&&x<128&&y<128){const b=f.sourceCoverage.data[(y*128+x)*4+2];coverageBZero+=b===0;coverageBPositive+=b>0}else coverageOutsideCrop++}}}
 return{step:row.step,stride:row.stride,band,minPressure,maxPressure,allowedCells:allowed,waterSupported,pathFaces,footprint,coverageBZero,coverageBPositive,coverageOutsideCrop,standing:row.options.standing,filmSeedCost:(row.options.budgetPx-1)/row.options.costMax,scope:'Pressure Q8 decoded/255, oldP float mode10 footprint; source B is standing record, not V support; source sample uses nearest aligned world8 centres'};
}
