import{textureWash171,library171}from'./textureLightnessWash171.testFixture.js'
export{mask171 as mask180,gray171 as gray180,alpha171 as alpha180}from'./textureLightnessWash171.testFixture.js'
export function textureWash180(){const b=textureWash171();b.version=180;b.texture!.material!.kind='gradient';b.texture!.strength=1;b.opacityByPressure=[[0,1],[1,1]];return b}
export function library180(){const l=library171();l.brushes[0].descriptor=textureWash180();return l}
