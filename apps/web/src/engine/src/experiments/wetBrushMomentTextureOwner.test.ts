import {describe,it,expect} from 'vitest'
import {WetBrushMomentTextureOwner} from './wetBrushMomentTextureOwner'
describe('DEV native texture moment owner boundaries',()=>{
 it('OFF does not access GPU or even inspect an unsupported input',()=>{const device=new Proxy({},{get(){throw Error('GPU touched')}}) as GPUDevice;const owner=new WetBrushMomentTextureOwner(device);expect(owner.encode(null as unknown as GPUCommandEncoder,null as never,false)).toEqual({buffers:[],invalid:null,pairPasses:0})})
 it('rejects feedback before allocating GPU resources',()=>{const device=new Proxy({},{get(){throw Error('GPU touched')}}) as GPUDevice;const texture={format:'rgba8unorm',width:4,height:4} as GPUTexture,owner=new WetBrushMomentTextureOwner(device);expect(()=>owner.encode(null as unknown as GPUCommandEncoder,{pigment:texture,color:texture,availableWater:texture,contact:texture,outputPigment:texture,outputColor:texture,rect:{x:0,y:0,width:4,height:4},recipe:{} as never},true)).toThrow('Distinct matched')})
})
