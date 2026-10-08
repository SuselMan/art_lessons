export function assertTipProof(enabled,census){
 if(census.tipEnabled!==enabled||census.tipProof?.enabled!==enabled)throw Error('Actual tip arm differs from requested arm')
 const modules=census.tipProof.modules
 if(!enabled){if(modules.length)throw Error('OFF arm patched shader');return}
 for(const family of ['stamp','ribbon'])if(!modules.some(m=>m.family===family&&m.baselineSha&&m.patchedSha&&m.baselineSha!==m.patchedSha))throw Error('Missing actual '+family+' source specialization SHA')
}
export function assertTipHistory({undoTarget,redoTarget,original,undone,redone}){
 if(!undoTarget||undoTarget.type!=='stroke'||redoTarget?.id!==undoTarget.id||redoTarget.type!=='stroke')throw Error('Undo/Redo did not select the same actual stroke')
 if(original.sha===undone.sha||undone.alpha>=original.alpha)throw Error('Undo made no meaningful exported material change')
 if(redone.sha!==original.sha||redone.alpha!==original.alpha)throw Error('Redo did not restore exact exported material')
}
