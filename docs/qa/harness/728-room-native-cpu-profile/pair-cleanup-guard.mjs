import fs from 'node:fs'
import path from 'node:path'
import {verifyPairEvidence} from './pair-evidence.mjs'
/** Call before generic qa-cleanup finish. Failed extraction holds all originals. */
export function assertPairCanFinish(pairOut,durableOut){
 const progress=JSON.parse(fs.readFileSync(path.join(pairOut,'pair-progress.json'),'utf8'))
 if(progress.evidencePromoted!==true||progress.evidenceExtracted!==true||progress.durableEvidencePath!==path.resolve(durableOut))throw Error('Hold disposable: evidence was not atomically promoted')
 const manifest=verifyPairEvidence(durableOut)
 if(manifest.source!==progress.source)throw Error('Hold disposable: durable source HEAD differs')
 return{canFinish:true,source:manifest.source,referenceReusable:manifest.referenceReusable}
}
