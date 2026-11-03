/** Private child: only general_svg.py sanitized input; never an importer authorization. */
import sharp from 'sharp'
const chunks=[]
let bytes=0
for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>300000)throw new Error('Sanitized SVG limit');chunks.push(chunk)}
sharp.cache(false)
sharp.concurrency(1)
const source=Buffer.concat(chunks)
const image=sharp(source,{density:72,limitInputPixels:1000000})
const metadata=await image.metadata()
if(!metadata.width||!metadata.height||metadata.width>2048||metadata.height>2048||metadata.width*metadata.height>1000000)throw new Error('SVG geometry limit')
const output=await image.flatten({background:'#ffffff'}).removeAlpha().greyscale().png().toBuffer()
if(output.length>4000000)throw new Error('SVG output limit')
process.stdout.write(JSON.stringify({width:metadata.width,height:metadata.height,versions:sharp.versions})+'\n')
process.stdout.write(output)
