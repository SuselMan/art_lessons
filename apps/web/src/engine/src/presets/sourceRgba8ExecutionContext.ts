/** Opaque reader handle. Runtime authority is held only by the issuing table owner. */
export interface SourceScalarPowerTableView{readonly kind:'source-scalar-power-table-view-v1'}
/** Optional invocation DATA; ordinary composites need no additional resource. */
export interface SourceRgba8ExecutionContext{
 readonly powerTable?:SourceScalarPowerTableView
 readonly worldPoint?:readonly[x:number,y:number]
}
