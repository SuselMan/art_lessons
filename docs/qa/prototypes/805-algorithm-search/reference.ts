import type {GLDefinition,AlgorithmInput} from './protocol'
export const reference:GLDefinition={id:'input-reference',label:'Исходный след без растекания',configs:[{}],create(gl,size){
 const texture=gl.createTexture()!,framebuffer=gl.createFramebuffer()!
 gl.bindTexture(gl.TEXTURE_2D,texture);for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.NEAREST);for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE)
 gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0)
 return{upload(input:AlgorithmInput){gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,input.rgba)},run:()=>({framebuffer,texture,width:size,height:size}),destroy(){gl.deleteFramebuffer(framebuffer);gl.deleteTexture(texture)}}
}}
