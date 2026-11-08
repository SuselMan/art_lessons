import{library139,dab139}from'./bristleSoak139.testFixture.js'
export function library140(){const l=library139(),d=l.brushes[0].descriptor,h=d.bristle!;if(h.version!==2)throw Error('fixture');d.version=140;h.soak!.resizePolicy='mask-population-v1';h.hairs=[[-.5,0,128/255],[.25,-.25,1],[0,.25,64/255]];return l}
export const bristle140=()=>library140().brushes[0].descriptor
export const dab140=(x=-2,t=0,pressure=.5)=>({...dab139(x,t,pressure),sourceSize:4,sourceScale:1})
