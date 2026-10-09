/** Exact requested product-matched diagnostic cohort, not native/experimental FIFO. */
export function productMatchedModel(e){return{joined:!!e._wcJoinedTouch,deferred:!!e._wcJoinedFinishDeferred,mixed:!!e._wcJoinedTouchMixed,async:!!e._wcAsyncFinish,material:!!e._wcMaterialPresentation}}
export function assertProductMatchedModel(e){const model=productMatchedModel(e);if(!model.joined||Object.entries(model).some(([k,v])=>k!=='joined'&&v))throw Error('Product-matched joined-only model required');return model}
