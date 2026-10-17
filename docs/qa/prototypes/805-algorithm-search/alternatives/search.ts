import type {AlgorithmConfig,AlgorithmInput,GLAlgorithm} from '../protocol'
import {evaluate} from './quality'

/** Bounded approximate PROGRAM search, not an equivalence superoptimizer.
 * Ordinary kernels deliberately do not implement this DSL. Never silently
 * submit these numeric keys to a kernel which ignores unknown configuration.
 */
export interface Program {
  readonly id:string
  readonly neighbors:4|8
  readonly front:readonly number[]
  readonly transport:readonly number[]
  readonly rim:boolean
}
export type Operation={kind:'seed-water'}|{kind:'front';neighbors:4|8;stride:number}|{kind:'seed-pigment'}|{kind:'transport';stride:number}|{kind:'rim'}|{kind:'upsample';size:1024}
const frontSchedules=[[8,4,2,1,1],[4,2,1,1],[4,2,1]] as const
const transportSchedules=[[1,1,1,1],[4,2,1,1]] as const
export const MAX_PROGRAMS=24
export function enumeratePrograms():Program[]{
 const result:Program[]=[]
 for(const neighbors of [4,8] as const)for(const front of frontSchedules)for(const transport of transportSchedules)for(const rim of [false,true]){
  const id=`f${neighbors}-${front.join('.')}_t${transport.join('.')}_r${Number(rim)}`
  result.push(Object.freeze({id,neighbors,front:Object.freeze([...front]),transport:Object.freeze([...transport]),rim}))
 }
 if(result.length!==MAX_PROGRAMS)throw Error('Program-search cap changed')
 return result
}
function encode(schedule:readonly number[]):number{
 if(!schedule.length||schedule.length>6||schedule.some(n=>![1,2,4,8].includes(n)))throw Error('Invalid DSL schedule')
 return schedule.reduce((value,stride,i)=>value+stride*16**i,0)
}
function decode(code:number):number[]{
 if(!Number.isSafeInteger(code)||code<=0||code>=16**6)throw Error('Invalid DSL encoding')
 const result:number[]=[]
 while(code){const stride=code%16;if(![1,2,4,8].includes(stride))throw Error('Invalid DSL stride');result.push(stride);code=Math.floor(code/16)}
 return result
}
export function programConfig(program:Program):AlgorithmConfig{
 validate(program)
 return{programDslVersion:1,programNeighbors:program.neighbors,programFrontCode:encode(program.front),programTransportCode:encode(program.transport),programRim:Number(program.rim)}
}
export function programFromConfig(config:AlgorithmConfig):Program{
 if(config.programDslVersion!==1||![4,8].includes(config.programNeighbors)||![0,1].includes(config.programRim))throw Error('Unsupported program DSL')
 const neighbors=config.programNeighbors as 4|8,front=decode(config.programFrontCode),transport=decode(config.programTransportCode),rim=!!config.programRim
 const program={id:`f${neighbors}-${front.join('.')}_t${transport.join('.')}_r${Number(rim)}`,neighbors,front,transport,rim}
 validate(program);return program
}
function validate(program:Program){
 if(![4,8].includes(program.neighbors)||typeof program.rim!=='boolean')throw Error('Invalid neighborhood/rim')
 encode(program.front);encode(program.transport)
 if(!frontSchedules.some(s=>s.join('.')===program.front.join('.'))||!transportSchedules.some(s=>s.join('.')===program.transport.join('.')))throw Error('Program outside admitted24 DSL family')
 if(program.id!==`f${program.neighbors}-${program.front.join('.')}_t${program.transport.join('.')}_r${Number(program.rim)}`)throw Error('Program fingerprint mismatch')
 // Neighbourhood4 means the four axial directions, not the first four of an
 // implementation-defined list. Strides are low-grid cells, not world pixels.
 if(program.front.length+program.transport.length+4>16)throw Error('Too many program passes')
}
export function lower(program:Program):Operation[]{
 validate(program)
 return[{kind:'seed-water'},...program.front.map(stride=>({kind:'front' as const,neighbors:program.neighbors,stride})),{kind:'seed-pigment'},...program.transport.map(stride=>({kind:'transport' as const,stride})),...(program.rim?[{kind:'rim' as const}]:[]),{kind:'upsample',size:1024}]
}
/** The future kernel must attest the ACTUAL executed plan after validation,
 * before upload/timing. These fields are intentionally absent from ordinary
 * kernels; attempting a program-search run against those fails closed.
 */
export function requireProgramSupport(model:GLAlgorithm,program:Program):void{
 if(model.metadata?.programDslVersion!==1||model.metadata?.programFingerprint!==program.id||model.metadata?.executedPasses!==lower(program).length)throw Error('Kernel did not attest requested program; do not benchmark ignored DSL keys')
}

export interface FixturePolicy {
 /** Blank/dry controls require exact identity; wet controls may require motion. */
 expectedNoChange?:boolean
 requireVisibleEffect?:boolean
 minMassRatio?:number
 maxMassRatio?:number
 maxCoverageRatio?:number
}
export interface FixtureReport {
 fixtureId:string
 metrics:ReturnType<typeof evaluate>
 changedL1:number
 dependentMs:readonly number[]
 hashes:readonly string[]
 rejection:readonly string[]
 /** Optional editorial decision. Passing numeric tests is not art approval. */
 humanApproved?:boolean
}
/** Evaluate one result immediately; do not retain RGBA arrays for24programs.
 * Timing must be supplied by the device harness, including its documented
 * dependent-completion boundary. This function does not infer GPU completion.
 */
export function evaluateFixture(fixtureId:string,input:AlgorithmInput,output:Uint8Array,dependentMs:readonly number[],hashes:readonly string[],policy:FixturePolicy={}):FixtureReport{
 const metrics=evaluate(input,output),rejection:string[]=[]
 let changedL1=0;for(let i=0;i<output.length;i++)changedL1+=Math.abs(output[i]-input.rgba[i]);changedL1/=output.length*255
 if(metrics.premulViolations)rejection.push('invalid-premultiplication')
 if(metrics.massIn===0&&metrics.massOut!==0)rejection.push('pigment-generated-from-zero')
 if(metrics.massIn>0&&metrics.massOut===0)rejection.push('blank-output')
 if(metrics.massIn>0&&(metrics.massRatio<(policy.minMassRatio??.5)||metrics.massRatio>(policy.maxMassRatio??1.5)))rejection.push('mass-catastrophe')
 if(policy.maxCoverageRatio!==undefined&&metrics.coverageRatio>policy.maxCoverageRatio)rejection.push('coverage-explosion')
 if(policy.expectedNoChange&&changedL1!==0)rejection.push('control-not-identity')
 if(policy.requireVisibleEffect&&metrics.massIn>0&&changedL1<1e-5)rejection.push('unchanged-wet-fixture')
 if(dependentMs.length<2||dependentMs.some(t=>!Number.isFinite(t)||t<0))rejection.push('insufficient-dependent-timing')
 if(hashes.length<2||hashes.some(h=>!h||h!==hashes[0]))rejection.push('nondeterministic-or-insufficient-repeat')
 return{fixtureId,metrics,changedL1,dependentMs:[...dependentMs],hashes:[...hashes],rejection}
}
export interface ProgramReport {program:Program;fixtures:readonly FixtureReport[]}
function median(values:readonly number[]){const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)]}
export function objectives(report:ProgramReport){
 if(!report.fixtures.length||report.fixtures.some(f=>f.rejection.length))return null
 return{
  // Both minimized. Other observations stay visible for human review rather
  // than treating maximal roughness/chroma as automatically desirable.
  latencyMs:report.fixtures.reduce((s,f)=>s+median(f.dependentMs),0)/report.fixtures.length,
  massError:report.fixtures.reduce((s,f)=>s+Math.abs(1-f.metrics.massRatio),0)/report.fixtures.length,
 }
}
export function pareto(reports:readonly ProgramReport[]):ProgramReport[]{
 const valid=reports.map(report=>({report,objective:objectives(report)})).filter(row=>row.objective!==null)
 return valid.filter(a=>!valid.some(b=>b!==a&&b.objective!.latencyMs<=a.objective!.latencyMs&&b.objective!.massError<=a.objective!.massError&&(b.objective!.latencyMs<a.objective!.latencyMs||b.objective!.massError<a.objective!.massError))).map(row=>row.report)
}
/** Sequential, at most24different programs; driver owns compile/upload/device
 * runs and must call requireProgramSupport before measurement. No GPU API here.
 * Stop/quota callback is checked between programs, never used as solver time.
 */
export async function search(driver:{measure(program:Program,config:AlgorithmConfig,ops:readonly Operation[]):Promise<readonly FixtureReport[]>;shouldStop?():boolean},limit=MAX_PROGRAMS):Promise<{reports:ProgramReport[];frontier:ProgramReport[]}>{
 if(!Number.isInteger(limit)||limit<1||limit>MAX_PROGRAMS)throw Error('Search hard cap24 programs')
 const reports:ProgramReport[]=[]
 for(const program of enumeratePrograms().slice(0,limit)){
  if(driver.shouldStop?.())break
  const fixtures=await driver.measure(program,programConfig(program),lower(program))
  if(!fixtures.length)throw Error('No fixture evidence')
  if(fixtures.some(f=>!f.fixtureId)||new Set(fixtures.map(f=>f.fixtureId)).size!==fixtures.length)throw Error('Duplicate/missing fixture identity')
  const names=fixtures.map(f=>f.fixtureId).sort().join('\n')
  if(reports.length&&names!==reports[0].fixtures.map(f=>f.fixtureId).sort().join('\n'))throw Error('Incomparable fixture suites')
  reports.push({program,fixtures})
 }
 return{reports,frontier:pareto(reports)}
}
