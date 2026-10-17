/** Isolated algorithm experiment: image coordinates/top-left, all inputs fixed.
 * rgba is premultiplied pigment RGB + opacity/mass in A, not paper-composited.
 * water/paper are single byte per pixel in [0,255]; paper=height, no gamma step.
 * Every run starts from upload; no feedback from animated or previously dry output.
 */
export type PigmentEncoding='premultiplied-rgb'|'optical-density'
export interface AlgorithmInput {encoding?:PigmentEncoding;size:number; rgba:Uint8Array; water:Uint8Array; paper:Uint8Array; seed:number}
export type AlgorithmConfig=Record<string,number>
export interface GLResult {framebuffer:WebGLFramebuffer;texture:WebGLTexture;width:number;height:number}
export interface GLAlgorithm {upload(input:AlgorithmInput):void;run():GLResult;destroy():void;metadata?:Record<string,unknown>}
export interface GLDefinition {id:string;label:string;create(gl:WebGLRenderingContext,size:number,config:AlgorithmConfig):GLAlgorithm;configs?:AlgorithmConfig[]}
