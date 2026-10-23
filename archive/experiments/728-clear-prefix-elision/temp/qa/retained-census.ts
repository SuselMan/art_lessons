import fs from 'node:fs'
import { clearedInBatch } from '../../apps/web/src/pages/Room/clearedInBatch'
const path = '/home/suselman/projects/pencil-agents/680-water-wet-tone/temp/night-728/load-fallback/actual-no-snapshot-report.json'
const report=JSON.parse(fs.readFileSync(path,'utf8'))
const skipped=clearedInBatch(report.input,['layer-1','background'])
console.log(JSON.stringify({source:'4ad7dfc9',originalReportSource:report.source,inputOperations:report.input.length,skipped:[...skipped],seqs:report.input.filter((o:{id:string})=>skipped.has(o.id)).map((o:{seq:number})=>o.seq)},null,2))
