export function assertLiveVectorGate(observation,count){
 if(!observation?.live?.meaningfulPigmentVisible)throw Error('Actual live framebuffer pigment absent; not UX PASS')
 if(!Number.isInteger(count)||count<12||count>20)throw Error('Live vector requires12–20 actual retained contacts')
}
