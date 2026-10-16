// Run once offline; the committed lattice, not GPU sin(), defines room M70 noise.
import {writeFileSync} from 'node:fs'
const bytes=new Uint8Array(256*256)
for(let y=0;y<256;y++)for(let x=0;x<256;x++){
  const v=Math.sin(x*127.1+y*311.7)*43758.5453
  bytes[y*256+x]=Math.round((v-Math.floor(v))*255)
}
const code=`/** Offline-baked M70 value-noise lattice. Identical bytes on every GPU.\n * Regenerate with node scripts/qa/bake-puddle-noise.mjs. */\nconst encoded='${Buffer.from(bytes).toString('base64')}'\nexport function createPuddleNoiseTexture(gl: WebGLRenderingContext): WebGLTexture {\n  const texture=gl.createTexture()!\n  const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))\n  gl.activeTexture(gl.TEXTURE0)\n  gl.bindTexture(gl.TEXTURE_2D,texture)\n  gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,256,256,0,gl.LUMINANCE,gl.UNSIGNED_BYTE,bytes)\n  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST)\n  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST)\n  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT)\n  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT)\n  return texture\n}\n`
writeFileSync('apps/web/src/engine/src/watercolor/puddle/PortablePuddleNoise.ts',code)
