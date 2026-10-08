/** Presentation-only immutable source geometry. Never changes canonical wash spacing. */
export function previewSourceSpacing(chunks,spacingFactor){
 if(!Number.isFinite(spacingFactor)||spacingFactor<=0||spacingFactor>1||!chunks.length)throw Error('Explicit production spacing factor and own chunks required');
 let diameter=0;for(const chunk of chunks){const g=chunk.composite.previewSourceGeometry;if(!g||!Number.isFinite(g.firstGap)||g.firstGap<0||!Number.isFinite(g.tipDiameter)||g.tipDiameter<=0)throw Error('Own prepared source geometry required');diameter=Math.max(diameter,g.tipDiameter);if(g.firstGap>.01)return{spacing:g.firstGap,kind:'measured-own-gap',tipDiameter:g.tipDiameter}}
 return{spacing:diameter*spacingFactor,kind:'single-own-tip-times-production-factor',tipDiameter:diameter};
}
