'use strict';
const assert=require('node:assert/strict');
const zero=new Set(['dryMaterial','invalid','negative','overflow','inactiveCoarseNonzero','coarseOverflow','initCapacityFailures','packFailures','coarseOutOfRangeCells','coarseInvalidPremulCells','coarseRepresentationOverflowCells']);
const yes=new Set(['fixedWetConserved','guardPassed','coarsePigmentConserved','coarseWaterConserved','coarseGuardPassed','prePackGuardPassed']);
// Only explicit executed ledgers. Legacy diagnostics marked null/not-run are not evidence.
function auditLedgerGuards(metadata){const checked=[];function visit(value,prefix){if(!value||typeof value!=='object'||Array.isArray(value))return;for(const[k,v]of Object.entries(value)){const name=prefix+'.'+k;if(zero.has(k)&&v!==null){assert.equal(v,0,'Ledger counter '+name);checked.push(name)}if(yes.has(k)&&v!==null){assert.equal(v,true,'Ledger guard '+name);checked.push(name)}if(['fixedWetDeltaRGBA','coarsePigmentDeltaRGBA'].includes(k)&&v!==null){assert.deepEqual(v,[0,0,0,0],'Integer ledger delta '+name);checked.push(name)}if(v&&typeof v==='object'&&!Array.isArray(v))visit(v,name)}}
 for(const key of ['fineLedger','finalState','coarseLedger'])visit(metadata?.[key],key);
 return{pass:true,checked,qualification:'Executed integer guards and capacity/nonfinite counters are hard gates. Signed float32 conservation deltas remain diagnostics, not exact-integer claims.'}
}
module.exports={auditLedgerGuards};
