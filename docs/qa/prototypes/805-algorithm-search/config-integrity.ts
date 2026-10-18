/** Top-level research request contract only; inner wrapper forwarding is deliberately unrestricted. */
export interface ConfigContract {id:string;configKeys?:readonly string[]}
const coarse=['steps','mobilityGain','eddyCells','curlStrength'] as const
const fine=[...coarse,'fineSteps','paperGain','dither'] as const
const soft=[...fine,'affinityBase'] as const
export const strongConfigKeys:Readonly<Record<string,readonly string[]>>={
 'wgsl-macro-coherent-advection':coarse,
 'wgsl-macro-coherent-smooth-fine-paper':fine,
 'wgsl-macro-coherent-safe-dither':coarse,
 'wgsl-macro-coherent-fast-initial':coarse,
 'wgsl-macro-fast-coherent-smooth-fine-paper':fine,
 'wgsl-macro-soft-paper-coherent-fine':soft,
 'wgsl-macro-packed-aux-coherent-fine':soft,
 'wgsl-macro-coherent-gated-exchange':[...coarse,'exchangeActiveSteps'],
 'wgsl-macro-packed-carrier-coherent-fine':soft,
 'wgsl-macro-terminal-rim-coherent-fine':[...fine,'rimStrength','rimThreshold'],
 'wgsl-macro-limited-coherent-advection':[...coarse,'exchangeActiveSteps','limiter'],
 'wgsl-macro-physical-dt-fine':[...soft,'physicalDt'],
 'wgsl-macro-coherent-physical-dt':[...coarse,'physicalDt'],
 'wgsl-macro-true-coherent-fine':[...soft,'compactAux','compactCarrier'],
}
export function assertDefinitionConfig(definition:ConfigContract,config:unknown):void{
 if(!definition.configKeys)return
 if(!config||typeof config!=='object'||Array.isArray(config))throw Error('Invalid config object for '+definition.id)
 for(const key of Object.keys(config))if(!definition.configKeys.includes(key))throw Error('Unknown or unused config key '+JSON.stringify(key)+' for '+definition.id)
}
