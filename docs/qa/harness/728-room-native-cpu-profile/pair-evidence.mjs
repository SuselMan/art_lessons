import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
/** Extract unique bounded evidence BEFORE any disposable finish/removal. */
export function preservePairEvidence(disposableOut,durableOut,disposableRoot=disposableOut){
 const source=path.resolve(disposableOut),target=path.resolve(durableOut),root=path.resolve(disposableRoot)
 if(source!==root&&!source.startsWith(root+path.sep))throw Error('Pair source outside registered disposable')
 if(target===root||target.startsWith(root+path.sep))throw Error('Durable pair evidence must be outside disposable')
 if(fs.existsSync(target))throw Error('Refuse duplicate durable pair evidence')
 const entries=[]
 for(const arm of ['reference','off','on']){
  const report=path.join(source,arm,'report.json');if(!fs.existsSync(report))continue
  const bytes=fs.readFileSync(report);if(bytes.length>524288)throw Error('Pair report exceeds bounded evidence cap')
  const parsed=JSON.parse(bytes);entries.push({name:arm+'-report.json',bytes})
  if(arm==='reference'&&parsed.complete&&Array.isArray(parsed.packedTape)){
   const packed=Buffer.from(JSON.stringify(parsed.packedTape));entries.push({name:'packed-input.json',bytes:packed})
   const png=path.join(source,arm,'native-material.png');if(fs.existsSync(png)){const bytes=fs.readFileSync(png);if(bytes.length>2097152)throw Error('Pair PNG exceeds bounded evidence cap');entries.push({name:'reference-native-material.png',bytes})}
  }
 }
 const summary={files:entries.map(e=>({name:e.name,bytes:e.bytes.length,sha256:crypto.createHash('sha256').update(e.bytes).digest('hex')}))}
 fs.mkdirSync(target,{recursive:true,mode:0o700})
 for(const e of entries)fs.writeFileSync(path.join(target,e.name),e.bytes,{mode:0o600})
 fs.writeFileSync(path.join(target,'evidence.json'),JSON.stringify(summary,null,2)+'\n',{mode:0o600})
 return summary
}
