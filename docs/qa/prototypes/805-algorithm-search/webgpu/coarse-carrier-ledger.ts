/** Diagnostic CPU reduction of already mapped coarse Cell{M4,D4,W,S,pad2}; no GPU commands. */
export interface CoarseCarrierLedger {
 surfaceCodes:number;absorbedCodes:number;totalWaterCodes:number;mobileAlphaCodes:number;adsorbedAlphaCodes:number;totalPigmentAlphaCodes:number;
 coarsePigmentCodesRGBA:number[];coarsePigmentDeltaRGBA:number[];coarsePigmentConserved:boolean;coarseWaterConserved:boolean;
 coarseOutOfRangeCells:number;coarseInvalidPremulCells:number;coarseRepresentationOverflowCells:number;coarseGuardPassed:boolean;prePackGuardPassed:boolean;
}
export function initialCoarsePigment(state:Uint32Array):number[]{if(state.length%12)throw Error('Invalid coarse layout');const sum=[0,0,0,0];for(let i=0;i<state.length;i+=12)for(let c=0;c<4;c++)sum[c]+=state[i+c]+state[i+4+c];return sum}
export function readCoarseCarrierLedger(state:Uint32Array,expectedRGBA:readonly number[],expectedWater:number,previousGuardPassed=true):CoarseCarrierLedger{
 if(state.length%12||expectedRGBA.length!==4||expectedRGBA.some(v=>!Number.isSafeInteger(v)||v<0)||!Number.isSafeInteger(expectedWater)||expectedWater<0)throw Error('Invalid coarse ledger input')
 let surface=0,absorbed=0,mobile=0,adsorbed=0,outOfRange=0,invalidPremul=0,overflow=0;const rgba=[0,0,0,0];
 for(let i=0;i<state.length;i+=12){surface+=state[i+8];absorbed+=state[i+9];mobile+=state[i+3];adsorbed+=state[i+7];let bad=false,premul=false;for(let c=0;c<4;c++){const m=state[i+c],d=state[i+4+c];rgba[c]+=m+d;bad||=m>65535||d>65535;premul||=m>state[i+3]||d>state[i+7]}bad||=state[i+8]>65535||state[i+9]>65535;if(bad)outOfRange++;if(premul)invalidPremul++;if(state[i+3]+state[i+7]>65535)overflow++}
 const delta=rgba.map((v,c)=>v-expectedRGBA[c]),pigmentConserved=delta.every(v=>v===0),waterConserved=surface+absorbed===expectedWater,guard=previousGuardPassed&&pigmentConserved&&waterConserved&&outOfRange===0&&invalidPremul===0&&overflow===0;
 return{surfaceCodes:surface,absorbedCodes:absorbed,totalWaterCodes:surface+absorbed,mobileAlphaCodes:mobile,adsorbedAlphaCodes:adsorbed,totalPigmentAlphaCodes:mobile+adsorbed,coarsePigmentCodesRGBA:rgba,coarsePigmentDeltaRGBA:delta,coarsePigmentConserved:pigmentConserved,coarseWaterConserved:waterConserved,coarseOutOfRangeCells:outOfRange,coarseInvalidPremulCells:invalidPremul,coarseRepresentationOverflowCells:overflow,coarseGuardPassed:guard,prePackGuardPassed:guard}
}
export function cloneCoarseLedger(ledger:CoarseCarrierLedger){return{...ledger,coarsePigmentCodesRGBA:ledger.coarsePigmentCodesRGBA.slice(),coarsePigmentDeltaRGBA:ledger.coarsePigmentDeltaRGBA.slice()}}
