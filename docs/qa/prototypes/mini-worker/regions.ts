/** UI-only DOM contour overlay is hidden on the Mini's live path. It is
 * intentionally omitted in BOTH hosts; native target Contrast is unchanged. */
export function createDiagnosticRegions(_engine:unknown,_size:number){
 return {state:{visible:false,hostOverlayOmitted:true},show(_value:boolean){},update(_entry:unknown){},draw(){},destroy(){},readback(){throw Error('Contour-overlay readback is unavailable in this live-only prototype')}}
}
