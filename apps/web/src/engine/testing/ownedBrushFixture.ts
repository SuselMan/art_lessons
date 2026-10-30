import { allocateOwnedBrushTexture, allocateOwnedBrushBuffer, combineOwnedBrushResources, releaseUnpublishedBrushResource, type OwnedBrushResource } from '../src/dabs/BrushTextureCache';
/** Real controlled allocations for host ownership/state fixtures. Arbitrary LRU
 * weights consist of a real 1x1 RGBA texture and a byte-sized VBO companion;
 * this does not pretend those weights describe a native image/mip pyramid. */
export function ownedBrushFixture(gl: WebGLRenderingContext, bytes: number, auxiliary?: (lost: boolean) => void): OwnedBrushResource {
    if (!Number.isSafeInteger(bytes) || bytes < 4)
        throw new RangeError('Invalid fixture bytes');
    const texture = allocateOwnedBrushTexture(gl, 4, (handle, mark) => { gl.bindTexture(gl.TEXTURE_2D, handle); mark(4); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); });
    try {
        if (bytes === 4)
            return auxiliary ? combineOwnedBrushResources(texture, [], auxiliary) : texture;
        const buffer = allocateOwnedBrushBuffer(gl, bytes - 4, (handle, mark) => { gl.bindBuffer(gl.ARRAY_BUFFER, handle); mark(bytes - 4); gl.bufferData(gl.ARRAY_BUFFER, bytes - 4, gl.STREAM_DRAW); });
        return combineOwnedBrushResources(texture, [buffer], auxiliary);
    }
    catch (error) {
        try {
            releaseUnpublishedBrushResource(texture);
        }
        catch { }
        throw error;
    }
}
