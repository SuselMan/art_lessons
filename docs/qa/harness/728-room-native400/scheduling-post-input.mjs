import {combinedMetadataResponseShape,parseCombinedConsumptionCdpResponse} from './combined-consumption-reader.mjs'
import {assertCombinedInteractiveConsumption} from './combined-consumption-proof.mjs'
import {assertFactorInteractiveConsumption,assertFactorInteractiveObserved} from './factor-interactive-proof.mjs'
// Shared actual controller orchestration. Metadata is durable before assertions.
export async function collectSchedulingPostInput({report,combinedInteractive,factorInteractive,expectedShaderSHA,idle,backendIdle,readMetadata,snapshot,inputSnapshot,save}){
 await idle();await backendIdle()
 if(combinedInteractive){
  const response=await readMetadata()
  report.metadataResponseShape=combinedMetadataResponseShape(response);save()
  report.combinedConsumption=parseCombinedConsumptionCdpResponse(response);save()
  if(factorInteractive){
   assertFactorInteractiveConsumption(report.combinedConsumption,expectedShaderSHA)
   report.actualObserved.consumed=assertFactorInteractiveObserved(report.final,report.combinedConsumption,expectedShaderSHA)
  }else assertCombinedInteractiveConsumption(report.combinedConsumption)
 }
 report.schedulingSnapshot=await snapshot();report.schedulingInput=await inputSnapshot();save()
}
