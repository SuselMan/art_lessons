import fs from 'node:fs'
import {replaySourceCoverage} from '../../docs/qa/harness/728-native-end-to-end/sourceReplay'
const f=JSON.parse(fs.readFileSync('docs/qa/harness/728-native-end-to-end/sourceReplay.fixture.json','utf8'))
const options={diagnosticWaterPolicy:'bottomless',diagnosticSharedFluid:true,diagnosticLandingReservoir:true,diagnosticLandingPolicy:'fluid',diagnosticCanonicalSettleRadius:true,diagnosticSolventField:true,diagnosticPigmentRecord:true} as const
const c=replaySourceCoverage(f.operation,options)[44];if(c.kind!=='ribbon')throw Error('Not ribbon');fs.writeFileSync('temp/native-source-offline/ribbon44.json',JSON.stringify({vertices:Array.from(c.batch.vertices),uniforms:c.batch.uniforms},null,2));console.log(c.batch.vertices.length)
