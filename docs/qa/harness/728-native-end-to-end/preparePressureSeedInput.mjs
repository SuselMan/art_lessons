/** Offline packet verification only. Never opens a device/browser or repeats source. */
import fs from 'node:fs'
import crypto from 'node:crypto'
import zlib from 'node:zlib'
const sha=b=>crypto.createHash('sha256').update(b).digest('hex')
export function preparePressureSeedInput({partitionDir,stitchReport,tracePath}){
 const checkpointBytes=fs.readFileSync(partitionDir+'/checkpoint/checkpoint.json'),packet=JSON.parse(checkpointBytes),producer=JSON.parse(fs.readFileSync(partitionDir+'/producer/report.json')),common=JSON.parse(fs.readFileSync(partitionDir+'/common/report.json')),stitch=JSON.parse(fs.readFileSync(stitchReport)),traceBytes=fs.readFileSync(tracePath),trace=JSON.parse(traceBytes)
 if(!producer.valid||!common.valid||producer.code!==packet.code||producer.checkpointSha256!==sha(checkpointBytes)||packet.solverBoundary?.index!==1||!common.result.arms[0].boundaryComparison.rows.find(r=>r.role==='c')?.exact||!stitch.valid||stitch.code!==packet.code||!stitch.result.arms[0].boundaryComparison.traceExact||trace.sourceCode!==packet.code||trace.packetSha256!==sha(checkpointBytes)||!/^[a-f0-9]{64}$/.test(trace.plannerSha256))throw Error('Same-device captured packet/trace passport')
 const rows=stitch.result.arms[0].boundaryComparison.trace;if(rows.length!==6||rows.some(r=>r.kind!=='copyRegionInto'||JSON.stringify(r.args)!==JSON.stringify(rows[0].args)||r.source.w!==1024||r.source.h!==1024||r.source.filter!=='nearest'||r.out.w!==1536||r.out.h!==1536||r.out.filter!=='nearest'))throw Error('Actual stitch rect/filter proof')
 const pigment=packet.solverBoundary.roles.find(r=>r.role==='c');if(!pigment||pigment.w!==1536||pigment.h!==1536||pigment.filter!=='nearest'||sha(zlib.gunzipSync(Buffer.from(pigment.gzipBase64,'base64'),{maxOutputLength:1536*1536*4}))!==pigment.sha256)throw Error('Pigment Q8 checksum')
 const coverageRole=packet.payload.fields.find(r=>r.role==='coverage');if(!coverageRole||coverageRole.width!==1024||coverageRole.height!==1024||coverageRole.filter!=='nearest'||coverageRole.presence!=='field')throw Error('Actual coverage source')
 const name=`source-${coverageRole.alias}.rgba.gz`,chunk=packet.chunks.find(r=>r.name===name),gzip=fs.readFileSync(partitionDir+'/checkpoint/'+name),raw=zlib.gunzipSync(gzip,{maxOutputLength:4194304});if(!chunk||sha(gzip)!==chunk.gzipSha256||raw.length!==4194304||sha(raw)!==chunk.rawSha256)throw Error('Coverage durable chunk checksum')
 const op=trace.ops.find(r=>r.index===2)?.events;if(op?.length!==1||op[0][0]!=='fieldOp'||op[0][4]!==10||op[0][5]!==.003||op[0][1].w!==1536||op[0][1].h!==1536)throw Error('Actual shared planner mode10 recipe');const options=op[0][6]
 const result={producerCode:packet.code,checkpointSha256:sha(checkpointBytes),operationSha256:packet.operationSha256,paperSha256:packet.paperSha256,pigment:{gzipBase64:pigment.gzipBase64,sha256:pigment.sha256},coverage:{gzipBase64:gzip.toString('base64'),sha256:chunk.rawSha256},copyRect:rows[0].args,recipe:{k:op[0][5],band:options.band,size:options.size},traceSha256:sha(traceBytes)};return result
}

export function addFirstFrontRecipe(input,{tracePath,partitionCheckpoint,pressureReport}){
 const trace=JSON.parse(fs.readFileSync(tracePath)),packet=JSON.parse(fs.readFileSync(partitionCheckpoint)),pressure=JSON.parse(fs.readFileSync(pressureReport)),r=pressure.rows?.[0]?.report,e=trace.ops.find(op=>op.index===3)?.events
 if(!pressure.valid||!r?.exact||r.producerCode!==input.producerCode||r.inputHashes.pigment!==input.pigment.sha256||r.inputHashes.coverageSource!==input.coverage.sha256||r.expectedSha256!==r.actualSha256||e?.length!==4||e.some(row=>row[0]!=='front'||row[1].w!==1536||row[1].h!==1536)||trace.packetSha256!==input.checkpointSha256||packet.config.paperScale!==1)throw Error('Actual pressure/front recipe proof')
 const f=e[0];return{...input,front:{x0:f[2],y0:f[3],scale:f[11],dryCost:f[4],max:f[7],climb:f[8],floor:f[9],stride:f[10],paperWorld:packet.config.paperWorld,paperScale:packet.config.paperScale,pressureSeedSha256:r.expectedSha256}}
}

/** Select only the actual first four-call quantum, never approximate later branches. */
export function addFirstFrontQuantum(input,{tracePath}){
 const trace=JSON.parse(fs.readFileSync(tracePath)),events=trace.ops.find(o=>o.index===3)?.events
 if(!input.front||trace.packetSha256!==input.checkpointSha256||events?.length!==4)throw Error('First quantum passport')
 const first=events[0],pressure=first[5].buffer,a=first[6].buffer
 for(let i=0;i<4;i++){const e=events[i];if(e[0]!=='front'||e[5].buffer!==(i%2?a:pressure)||e[6].buffer!==(i%2?pressure:a)||JSON.stringify(e.slice(7))!==JSON.stringify(first.slice(7))||e[2]!==first[2]||e[3]!==first[3]||e[4]!==first[4])throw Error('Original alternating first quantum changed')}
 return{...input,front:{...input.front,steps:4}}
}
