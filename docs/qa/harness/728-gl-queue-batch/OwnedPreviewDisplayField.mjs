/** Async tile previews bypass resident tile reveals. Supply the already-owned visible raster explicitly. */
export function ownedPreviewDisplayField(owner,morph,enabled){
 if(!enabled)return owner.lease.fields.presentation;
 if(!morph)throw Error('Early preview requires owned morph presentation');
 return morph.visibleField(owner);
}
