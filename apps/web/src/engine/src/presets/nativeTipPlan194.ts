import type{BrushDescriptor}from'@grafetto/shared'
import type{BrushExecutionContext}from'./brushExecutionContext'
import{prepareSketchMask194}from'./sketchMask194'
import{prepareSprayMask194}from'./sprayMask194'
/** Gesture-owned preparation on the existing scratch lifecycle. Immutable
 * registered descriptors alone can reuse it; candidate/particle loops only
 * read these borrowed views. No retained global descriptor/pixel cache. */
export class NativeTipPlan194{
 readonly sketch?:ReturnType<typeof prepareSketchMask194>
 readonly spray?:ReturnType<typeof prepareSprayMask194>
 readonly brush:BrushDescriptor
 private active=true
 constructor(brush:BrushDescriptor,execution?:BrushExecutionContext){this.brush=brush;if(brush.sketch?.mode==='mask')this.sketch=prepareSketchMask194(brush,execution);if(brush.spray)this.spray=prepareSprayMask194(brush,execution)}
 assertCurrent(brush:BrushDescriptor):void{if(!this.active||this.brush!==brush)throw Error('Native194 gesture tip plan changed')}
 destroy():void{this.active=false}
}
