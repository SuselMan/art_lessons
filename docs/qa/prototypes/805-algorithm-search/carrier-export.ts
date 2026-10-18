/** QA export only, called after every compute/readback/UI observation timer. */
export async function gzipCarrierBase64(bytes:Uint8Array){
 if(typeof CompressionStream==='undefined')throw Error('Gzip carrier export unavailable')
 const data=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer
 const stream=new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'))
 const compressed=new Uint8Array(await new Response(stream).arrayBuffer()),chunks:string[]=[]
 for(let i=0;i<compressed.length;i+=32768)chunks.push(String.fromCharCode(...compressed.subarray(i,i+32768)))
 return btoa(chunks.join(''))
}
