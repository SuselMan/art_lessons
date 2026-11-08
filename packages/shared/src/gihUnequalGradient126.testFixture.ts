import{brush124,dab124,assets124,alpha124,gray124,pixels124}from'./gihUnequalLightness124.testFixture.js'
export{dab124 as dab126,assets124 as assets126,alpha124 as alpha126,gray124 as gray126}
export{palette125A as palette126A,palette125B as palette126B}from'./gihEqualGradient125.testFixture.js'
export function brush126(mode:'xtilt'|'ytilt'|'angular'|'dimensions'='xtilt'){const b=brush124(mode);b.id='imported-262626262626262626262626';b.version=126;delete b.tip.material;b.tip.color={gradient:{gray:gray124[0],grayFrames:[...gray124],sampling:'filteredGray-v1'}};return b}
/** Middle selected8x6 frame has a spatial black/white edge independent of
 * constant alpha128. Filtering straight gray reaches index128; pre-mapping
 * endpoints would instead interpolate palette colours. Not a GPU pixel oracle. */
export function pixels126(id:string){const raw=pixels124(id);if(id===gray124[1])for(let y=1;y<7;y++)for(let x=0;x<8;x++)raw[y*8+x]=x<4?0:255;return raw}
