import{library176}from'./legacyDodgeBurn176.testFixture.js';import type{BrushDescriptor}from'./brushes.js';
export const modes178=['overlay','darken','lighten','add','subtract','dodge','burn']as const;
export function library178(mode:typeof modes178[number]='overlay'){const l=library176();const b=l.brushes[0].descriptor;b.version=178;b.mixer!.colorRateComposite=mode;b.mixer!.source='projectionCanvas';return l}
export function merged178(mode:typeof modes178[number]='overlay'):BrushDescriptor{return library178(mode).brushes[0].descriptor}
