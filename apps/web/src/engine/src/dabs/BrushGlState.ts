export interface BrushGlStateRestore {
    (): void;
    readonly restoreAutoUpload?: () => void;
}
/** Restores only the fields touched by an auto stripe upload, all-attempt. */
export function restoreBrushAutoUploadState(gl: WebGLRenderingContext, saved: {readonly active:number;readonly texture:WebGLTexture|null;readonly alignment:number;readonly flip:boolean;readonly premultiply:boolean}):()=>void {
    return ()=>{
        let failed=false,failure:unknown,unitReady=false;
        const attempt=(fn:()=>void)=>{try{fn()}catch(error){if(!failed){failed=true;failure=error}}};
        attempt(()=>{gl.activeTexture(gl.TEXTURE0);unitReady=true});
        if(unitReady)attempt(()=>gl.bindTexture(gl.TEXTURE_2D,saved.texture));
        attempt(()=>gl.pixelStorei(gl.UNPACK_ALIGNMENT,saved.alignment));
        attempt(()=>gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,saved.flip));
        attempt(()=>gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,saved.premultiply));
        attempt(()=>gl.activeTexture(saved.active));
        if(failed)throw failure;
    };
}

/** Shared synchronous state capsule. Logic extracted unchanged from the proven
 * transformed-mask prepass; callers state their touched sampler units explicitly.
 * OES VAO isolates pointers. Without it, WebGL1 cannot restore a disabled NULL
 * pointer; all live pointers, enables and ANGLE divisors are restored. */
export function saveBrushGlState(gl: WebGLRenderingContext, attributes: readonly number[], instancing: ANGLE_instanced_arrays | null, vertexArrays: OES_vertex_array_object | null, textureUnits: number, captureAutoUploadUnpack=false): BrushGlStateRestore {
    if(captureAutoUploadUnpack&&textureUnits<1)throw new RangeError('Auto upload capture requires unit zero');
    const vaoExtension = vertexArrays;
    const previousVao = vaoExtension ? gl.getParameter(vaoExtension.VERTEX_ARRAY_BINDING_OES) : null;
    const active = gl.getParameter(gl.ACTIVE_TEXTURE), textures: (WebGLTexture | null)[] = [];
    const uploadFlags=captureAutoUploadUnpack?{flip:gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL) as boolean,premultiply:gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL) as boolean}:undefined;
    for (let i = 0; i < textureUnits; i++) {
        gl.activeTexture(gl.TEXTURE0 + i);
        textures.push(gl.getParameter(gl.TEXTURE_BINDING_2D));
    }
    gl.activeTexture(active);
    const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING), viewport = gl.getParameter(gl.VIEWPORT), program = gl.getParameter(gl.CURRENT_PROGRAM), array = gl.getParameter(gl.ARRAY_BUFFER_BINDING), unpack = gl.getParameter(gl.UNPACK_ALIGNMENT), color = gl.getParameter(gl.COLOR_CLEAR_VALUE), mask = gl.getParameter(gl.COLOR_WRITEMASK);
    const caps = [gl.BLEND, gl.SCISSOR_TEST, gl.DITHER, gl.CULL_FACE, gl.DEPTH_TEST, gl.STENCIL_TEST].map(cap => [cap, gl.isEnabled(cap)] as const);
    const attribs = (vaoExtension ? [] : attributes).map(index => ({ index, enabled: gl.getVertexAttrib(index, gl.VERTEX_ATTRIB_ARRAY_ENABLED), buffer: gl.getVertexAttrib(index, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING), size: gl.getVertexAttrib(index, gl.VERTEX_ATTRIB_ARRAY_SIZE), type: gl.getVertexAttrib(index, gl.VERTEX_ATTRIB_ARRAY_TYPE), normalized: gl.getVertexAttrib(index, gl.VERTEX_ATTRIB_ARRAY_NORMALIZED), stride: gl.getVertexAttrib(index, gl.VERTEX_ATTRIB_ARRAY_STRIDE), offset: gl.getVertexAttribOffset(index, gl.VERTEX_ATTRIB_ARRAY_POINTER), divisor: instancing ? gl.getVertexAttrib(index, instancing.VERTEX_ATTRIB_ARRAY_DIVISOR_ANGLE) : 0 }));
    const restore = () => {
        if (vaoExtension)
            vaoExtension.bindVertexArrayOES(previousVao);
        for (const a of attribs) {
            if (a.buffer && gl.isBuffer(a.buffer)) {
                gl.bindBuffer(gl.ARRAY_BUFFER, a.buffer);
                gl.vertexAttribPointer(a.index, a.size, a.type, a.normalized, a.stride, a.offset);
            }
            instancing?.vertexAttribDivisorANGLE(a.index, a.divisor);
            if (a.enabled)
                gl.enableVertexAttribArray(a.index);
            else
                gl.disableVertexAttribArray(a.index);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, array && gl.isBuffer(array) ? array : null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.viewport(...viewport as [
            number,
            number,
            number,
            number
        ]);
        gl.useProgram(program);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, unpack);
        gl.clearColor(...color as [
            number,
            number,
            number,
            number
        ]);
        gl.colorMask(...mask as [
            boolean,
            boolean,
            boolean,
            boolean
        ]);
        for (const [cap, enabled] of caps)
            if (enabled)
                gl.enable(cap);
            else
                gl.disable(cap);
        for (let i = 0; i < textureUnits; i++) {
            gl.activeTexture(gl.TEXTURE0 + i);
            const texture = textures[i];
            gl.bindTexture(gl.TEXTURE_2D, texture && gl.isTexture(texture) ? texture : null);
        }
        gl.activeTexture(active);
    };
    if(!uploadFlags)return restore;
    const full=()=>{
        let failed=false,failure:unknown;
        const attempt=(fn:()=>void)=>{try{fn()}catch(error){if(!failed){failed=true;failure=error}}};
        attempt(restore);
        attempt(()=>gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,uploadFlags.flip));
        attempt(()=>gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,uploadFlags.premultiply));
        if(failed)throw failure;
    };
    return Object.freeze(Object.defineProperty(full,'restoreAutoUpload',{value:restoreBrushAutoUploadState(gl,{active,texture:textures[0],alignment:unpack,flip:uploadFlags.flip,premultiply:uploadFlags.premultiply})}));
}
