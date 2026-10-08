/** Physical64 target with production1024 uniform dimensions. The fragment
 * diagnostic adds ROI origin to gl_FragCoord because framebuffer coords stay64.
 */
export function previewMaterialRoiTarget(gl,physical,origin){
 if(physical.width!==64||physical.height!==64||origin.length!==2||origin.some(x=>!Number.isInteger(x)||x<0||x>960))throw Error('Bounded64 production ROI');
 return{width:1024,height:1024,texture:physical.texture,fbo:physical.fbo,beginReplaceDraw(){gl.bindFramebuffer(gl.FRAMEBUFFER,physical.fbo);gl.viewport(-origin[0],-origin[1],1024,1024);gl.disable(gl.BLEND)},endDraw(){physical.endDraw()}};
}
