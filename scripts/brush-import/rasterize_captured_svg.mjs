// Private subprocess entry: accepts only Python's sanitized explicit-policy SVG.
// No paths/URLs/decoder options accepted. Stock pinned fallback stays separate.
import sharp from 'sharp'
const policy=process.argv[2]
if(!['krita-mask-v1','captured-image-v1'].includes(policy))throw Error('Explicit SVG policy required')
const chunks=[];let size=0
for await(const chunk of process.stdin){size+=chunk.length;if(size>2*1024*1024)throw Error('Sanitized SVG exceeds limit');chunks.push(chunk)}
sharp.cache(false);sharp.concurrency(1)
let image=sharp(Buffer.concat(chunks),{limitInputPixels:4*1024*1024,density:72,failOn:'warning'})
if(policy==='krita-mask-v1')image=image.flatten({background:'#fff'}).greyscale()
const out=await image.toColourspace('srgb').ensureAlpha().png().toBuffer()
if(out.length>20*1024*1024)throw Error('SVG output limit')
process.stdout.write(out)
