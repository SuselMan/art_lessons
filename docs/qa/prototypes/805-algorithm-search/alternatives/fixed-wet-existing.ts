import type {GLDefinition,AlgorithmConfig} from '../protocol'
/** Explicit reviewed alias: no shader/uniform/draw/bytes changed, no blanket registry fallback. */
export function reviewedFixedWet(create:GLDefinition['create'],declaration:(config:AlgorithmConfig)=>Record<string,unknown>,validate?:(config:AlgorithmConfig)=>void):GLDefinition['create']{
 return(gl,size,config)=>{validate?.(config);const candidate=create(gl,size,config);let details:Record<string,unknown>;try{details=declaration(config)}catch(error){candidate.destroy();throw error}return{upload:input=>candidate.upload(input),run:()=>candidate.run(),destroy:()=>candidate.destroy(),get metadata(){return{...candidate.metadata,...details,fixedInitialWet:true,policyRevision:1,policy:'Existing structurally initial-fixed wet domain; explicit reviewed alias, historical shader/draw path unchanged'}}}}
}
