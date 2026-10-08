import {it,expect}from'vitest'
import{FIRST_CARRY_INPUTS,FIRST_CARRY_RECIPE,ORIGINAL_CARRY_STRIDES,validateFirstCarryInputs,type FirstCarrySnapshot}from'./firstCarryInputContract'
const packet='1cf7698e3d2fa6a713a00dad8d2e7f0d05dbb7f74139c91096e366d74560e76f'
const valid=()=>Object.entries(FIRST_CARRY_INPUTS).map(([role,x])=>({role,...x,width:1536,height:1536,bytes:9437184,sourceApi:'GL',rowConvention:'world-top',packetSha256:packet}))as FirstCarrySnapshot[]
it('requires actual common mobile and pressure metadata, rejects swapped filters/hash/role',()=>{expect(()=>validateFirstCarryInputs(valid(),packet)).not.toThrow();for(const patch of[{filter:'linear'},{width:1024},{sha256:'0'.repeat(64)},{sourceApi:'native'},{rowConvention:'bottom'},{role:'pressure'}])expect(()=>validateFirstCarryInputs([{...valid()[0],...patch}as FirstCarrySnapshot,valid()[1]],packet)).toThrow()})
it('isolates literal original first stride before later carry and brush amplification',()=>{expect(FIRST_CARRY_RECIPE.mode).toBe(15);expect(FIRST_CARRY_RECIPE.dir).toEqual([1,1]);expect(FIRST_CARRY_RECIPE.tau[2]).toBe(0);expect(FIRST_CARRY_RECIPE.additiveZeroFaces).toBe(false);expect(FIRST_CARRY_RECIPE.pathPacked).toBe(false)})

import{firstCarryReferenceFragment}from'./firstCarryOracle'
import{WC_FIELD_OP_CARRY_FRAG,WC_FIELD_OP_HIGH_FRAG}from'../../../../apps/web/src/engine/src/raster/shaders'
it('uses production dedicated carry program, not bookkeeping HIGH identity branch',()=>{expect(firstCarryReferenceFragment).toBe(WC_FIELD_OP_CARRY_FRAG);expect(firstCarryReferenceFragment).toContain('#define FIELD_OP_CARRY');expect(firstCarryReferenceFragment).not.toBe(WC_FIELD_OP_HIGH_FRAG)})

import {runPressureSeedOracle} from './pressureSeedOracle'
it('rejects a hardware sampler pair without frozen GL reference before browser/GPU access',async()=>{
 const input={producerCode:'1'.repeat(40),checkpointSha256:packet,operationSha256:'1'.repeat(64),paperSha256:'1'.repeat(64),traceSha256:'1'.repeat(64),diagnosticFirstCarry:true,diagnosticFirstCarryHardwareLinear:true}
 await expect(runPressureSeedOracle(input as never)).rejects.toThrow('Sampler pair requires frozen GL output reference')
 await expect(runPressureSeedOracle({...input,diagnosticFirstCarryReferenceSha256:'bad'} as never)).rejects.toThrow('First carry reference SHA')
})

it('freezes all original14carry strides with Q8 feedback, not isolated repeatedfirststep',()=>{expect(ORIGINAL_CARRY_STRIDES).toEqual([1,2,4,8,16,32,64,64,32,16,8,4,2,1])})
