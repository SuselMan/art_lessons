import {assertSourceGradientResource,sourceGradientColor,type SourceGradientResource} from '../presets/sourceGradientResource'

/** App-owned captured table, baked once per START under the caller's metadata
 * reservation. Replay samples only the recorded table, never a live provider. */
export function bakeCanonicalTextureGradient(resource:SourceGradientResource):Readonly<{kind:'captured-texture-gradient-rgba8-v1';rgba:readonly number[]}> {
 assertSourceGradientResource(resource)
 const rgba=new Array<number>(1024)
 for(let index=0;index<256;index++){
  const color=sourceGradientColor(resource,index/255)
  for(let channel=0;channel<4;channel++)rgba[index*4+channel]=color[channel]
 }
 return Object.freeze({kind:'captured-texture-gradient-rgba8-v1',rgba:Object.freeze(rgba)})
}
