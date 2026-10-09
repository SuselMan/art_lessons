/** Structural and active-layer setup through actual Room controls, before A predecessor. */
async function layersVisible(page){const add=page.getByRole('button',{name:/^(Добавить слой|Add layer)$/});if(!await add.count()){const tab=page.getByRole('button',{name:/^(Слои|Layers)$/});if(await tab.count()!==1)throw Error('Unique actual Layers tab required');await tab.click()}await add.waitFor({state:'visible',timeout:10000});if(await add.count()!==1)throw Error('Unique Add layer required');return add}
export async function preparePeerLayerUI(a,b){
 const initial=await a.evaluate(()=>{const s=window.__roomStore.getState();return{id:s.layerState.activeId,name:s.layerState.items[s.layerState.activeId].name}});
 await(await layersVisible(b)).click();await b.waitForFunction(old=>window.__roomStore.getState().layerState.activeId!==old,initial.id,{timeout:10000});const peer=await b.evaluate(()=>window.__roomStore.getState().layerState.activeId);
 await a.waitForFunction(id=>window.__roomStore.getState().layerState.items[id]&&window.__engine._layers.has(id),peer,{timeout:10000});await layersVisible(a);const row=a.getByText(initial.name,{exact:true});if(await row.count()!==1)throw Error('Unique initial layer name required');await row.click();
 await a.waitForFunction(id=>window.__engine._activeId===id,initial.id);await b.waitForFunction(id=>window.__engine._activeId===id,peer);
 if(peer===initial.id||peer==='background')throw Error('Distinct writable peer layer required');return{authorLayer:initial.id,peerLayer:peer};
}
