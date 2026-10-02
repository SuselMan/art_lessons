import noiseAsset from './watercolorNoise.txt?raw'

/** #691: offline lattice, nearest-sampled at texel centres. The asset is
 * bundled inline so replay never races a fetch or paints placeholder noise. */
export function createWatercolorNoiseTexture(gl: WebGLRenderingContext): WebGLTexture {
  const binary = atob(noiseAsset)
  const pixels = Uint8Array.from(binary, c => c.charCodeAt(0))
  const texture = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 251, 251, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, pixels)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return texture
}
